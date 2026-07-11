#!/usr/bin/env node
// validate-dataset.mjs - the acceptance gates from
// docs/grounding-workflow-plan.md, enforced deterministically. A generated
// dataset replaces the illustrative catalog only when every gate here passes;
// "every individual edge looked plausible" is not sufficient, because the
// product's value is that different picks light different careers.
//
// Usage:
//   node scripts/validate-dataset.mjs [data/dataset.json] [--pilot]
//
// --pilot skips the distributional and coverage gates, which are meaningless
// at pilot scale (with 3 careers, saturation is indistinguishable from
// success). Structural and evidence gates always run.
//
// Exits 0 with a PASS report, or 1 with every failure listed.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyze, summarize, allInputs, edgeStrength } from "../score.js";
import { normalizeCompany } from "./fetch-postings.mjs";

// Rendered link strength rises 1000 -> 2000 -> 3000 -> internship, so the
// confidence bar rises with it: an internship edge draws as the boldest line
// in the product and must be the best-evidenced.
export const CONFIDENCE_FLOORS = { 1000: 0.5, 2000: 0.6, 3000: 0.7, internship: 0.75 };

// Inference tier: edges asserted from career scope-overlap judgment rather than
// direct skill-match evidence (e.g. a Data Scientist qualification also opens
// Data Analyst). They are intentionally softer, so they carry a lower floor and
// are exempt from the distinctive-skill requirement, but must name the source
// career they derive from ("via") and clear a minimum adjacency weight.
export const INFERENCE = { floor: 0.4, minWeight: 0.5 };

export const GATES = {
  maxInDegreeShare: 0.25,
  // A share cap is meaningless on a handful of edges (2 of 5 edges is 40%
  // without any hub problem), so it only engages at realistic scale.
  minEdgesForShareGate: 16,
  maxGini: 0.45,
  maxMeanJaccard: 0.5,
  minCompaniesPerInternship: 2,
  // Internship variety: a map with one internship node misrepresents how
  // people actually enter these careers. Full runs FAIL below this count -
  // deliberately with NO scale guard, because a guard would silently defeat
  // the detection this gate exists for.
  minInternshipVariety: 4,
  // Coverage: variety alone can be gamed by four titles all pointing at one
  // hub career while every other career stays internship-starved. At
  // realistic career-set scale, internship edges must reach a minimum number
  // of distinct careers. (Skipped below minCareersForCoverageGate, mirroring
  // the narrowing gates' scale guard - with 2 careers the bar is unmeetable.)
  minInternshipCareers: 4,
  minCareersForCoverageGate: 6,
};

// Validated-canonical internship tier: roles proposed by LLM judgment and
// validated to EXIST by grounding search. The honesty bar is structural:
// evidence from >= 2 distinct (normalized) employers, at least one of them
// current, snapshots that actually exist on disk and mention the role or
// company, judgment-marked skills, and judged-tier-only edges.
export const CANONICAL = {
  idPrefix: "canonical-",
  minCompanies: 2,
  // How recent "current" is: an intern-list entry (filtered to active
  // listings at snapshot time) is current by construction; a posting or
  // employer page must have a postedAt within this many days of retrieval.
  // ~1.5 posting cycles: honest for seasonal roles without accepting a 2021
  // archive as proof of a 2026 market.
  currentWindowDays: 550,
  evidenceTypes: ["posting", "employer-page", "intern-list"],
};

const DASH_RE = /[—–]/;

export function gini(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  const sum = v.reduce((s, x) => s + x, 0);
  if (n === 0 || sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * v[i];
  return cum / (n * sum);
}

export function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

// Senior-narrowing simulation: a dataset must SHAPE-wise support the product's
// story - breadth opens doors, a committal senior stack narrows them. Both
// checks are deterministic and run on the dataset itself via the real scoring
// model. Skipped for tiny career sets, where narrowing has no room to show.
export const NARROWING = { minCareers: 6, stackSize: 12 };

export function simulateNarrowing(ds) {
  const catalog = { CAREERS: ds.careers || [], COURSES: ds.courses || [], INTERNSHIPS: ds.internships || [] };
  const inputs = allInputs(catalog);

  // Breadth check: every 1000-level course selected at once must close nothing.
  const intros = inputs.filter((i) => i.level === 1000).map((i) => i.id);
  const breadth = summarize(analyze(intros, catalog), catalog.CAREERS);

  // Greedy committal stack toward the most-supported career. Deterministic by
  // construction: target = max summed edgeStrength (ties by id); candidates =
  // inputs reaching the target, sorted by strength desc then id asc; take
  // min(stackSize, all).
  const supportOf = new Map(catalog.CAREERS.map((c) => [c.id, 0]));
  for (const i of inputs)
    for (const d of i.destinations) if (supportOf.has(d)) supportOf.set(d, supportOf.get(d) + edgeStrength(i, d));
  const target = [...supportOf.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  const stack = inputs
    .filter((i) => i.destinations.includes(target))
    .sort((a, b) => edgeStrength(b, target) - edgeStrength(a, target) || (a.id < b.id ? -1 : 1))
    .slice(0, NARROWING.stackSize)
    .map((i) => i.id);

  const opens = [];
  let final = null;
  for (let k = 1; k <= stack.length; k++) {
    final = summarize(analyze(stack.slice(0, k), catalog), catalog.CAREERS);
    opens.push(final.open);
  }
  return {
    target,
    stack,
    breadthClosed: breadth.closedCount,
    peakOpen: opens.length ? Math.max(...opens) : 0,
    finalOpen: final ? final.open : 0,
    finalClosed: final ? final.closedCount : 0,
  };
}

const isCanonical = (i) => i.grounding === "canonical";

function evidenceIsCurrent(e) {
  if (e.type === "intern-list") return true; // snapshot filtered to active listings
  if (!e.postedAt || !e.retrievedAt) return false;
  const posted = Date.parse(e.postedAt);
  const retrieved = Date.parse(e.retrievedAt);
  if (Number.isNaN(posted) || Number.isNaN(retrieved)) return false;
  return Math.abs(retrieved - posted) <= CANONICAL.currentWindowDays * 24 * 3600 * 1000;
}

// Structural honesty gates for a validated-canonical internship role. Always
// on (pilot included): a canonical role that cannot meet these is not a
// smaller-scale success, it is an unvalidated claim. snapshotRoot lets tests
// point the on-disk snapshot check at a fixture directory.
export function checkCanonicalRole(i, { snapshotRoot = "." } = {}) {
  const errors = [];
  const err = (m) => errors.push(`canonical internship ${i.id}: ${m}`);
  if (!String(i.id || "").startsWith(CANONICAL.idPrefix))
    err(`id must start with "${CANONICAL.idPrefix}" (prevents collisions with evidence-tier inputs)`);
  if (i.skillsBasis !== "judgment")
    err(`skillsBasis must be "judgment" (requiredSkills are LLM priors, not posting-extracted; say so)`);
  for (const [career, edge] of Object.entries(i.edges || {})) {
    if (!(edge.inferred && edge.judged))
      err(`edge to ${career} is not judged-tier (a canonical role with a direct-evidence edge blurs tiers)`);
  }
  const ev = i.evidence || [];
  for (const e of ev) {
    if (!CANONICAL.evidenceTypes.includes(e.type))
      err(`evidence type ${JSON.stringify(e.type)} not allowed (expected ${CANONICAL.evidenceTypes.join("/")})`);
    if (!e.snapshot) err(`evidence (${e.company || "?"}) missing snapshot path`);
    if (!e.retrievedAt) err(`evidence (${e.company || "?"}) missing retrievedAt`);
    if (e.snapshot) {
      const path = join(snapshotRoot, e.snapshot);
      if (!existsSync(path) || !(statSync(path).size > 0)) {
        err(`snapshot ${e.snapshot} missing or empty on disk (a snapshot path is a claim, not evidence)`);
      } else {
        const text = readFileSync(path, "utf8").toLowerCase();
        const roleToken = String(i.role || "").toLowerCase();
        const companyToken = String(e.company || "").toLowerCase();
        if (!(roleToken && text.includes(roleToken)) && !(companyToken && text.includes(companyToken)))
          err(`snapshot ${e.snapshot} mentions neither the role nor the company (${e.company || "?"})`);
      }
    }
  }
  const companies = new Set(ev.map((e) => normalizeCompany(e.company)).filter(Boolean));
  if (companies.size < CANONICAL.minCompanies)
    err(`evidence from ${companies.size} distinct employer(s); need ${CANONICAL.minCompanies}+ to call the role validated`);
  if (!ev.some(evidenceIsCurrent))
    err(`no CURRENT evidence (an active intern-list entry, or postedAt within ${CANONICAL.currentWindowDays} days of retrieval); archived history alone cannot validate a current role`);
  const titles = new Set(ev.filter((e) => e.title).map((e) => `${e.title} (${e.company})`));
  for (const t of i.exampleTitles || [])
    if (!titles.has(t)) err(`exampleTitle ${JSON.stringify(t)} does not match any validation evidence entry`);
  return errors;
}

export function validateDataset(ds, { pilot = false, snapshotRoot = "." } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  const careers = ds.careers || [];
  const courses = ds.courses || [];
  const internships = ds.internships || [];
  // Org types are dataset-defined (the UI renders whatever ships); the default
  // set is the original taxonomy. meta.orgTypes pins the allowed values so a
  // typo ("MNC " / "Multinational") can't silently split a sidebar group.
  const orgTypes = new Set((ds.meta && ds.meta.orgTypes) || ["MNC", "Small Business", "Startup"]);
  const inputs = [
    ...courses.map((c) => ({ ...c, kind: "course" })),
    ...internships.map((i) => ({ ...i, kind: "internship" })),
  ];

  // --- Structural gates (mirror test/score.test.js invariants) ---
  const careerIds = new Set();
  for (const c of careers) {
    if (!c.id) err("career missing id");
    else if (careerIds.has(c.id)) err(`duplicate career id ${c.id}`);
    careerIds.add(c.id);
    if (!Array.isArray(c.responsibilities) || c.responsibilities.length === 0)
      err(`career ${c.id}: missing responsibilities`);
    if (!Array.isArray(c.skills) || c.skills.length === 0) err(`career ${c.id}: missing skills`);
    for (const t of [...(c.responsibilities || []), ...(c.skills || [])]) {
      if (typeof t !== "string" || !t.trim()) err(`career ${c.id}: empty text entry`);
      else if (DASH_RE.test(t)) err(`career ${c.id}: em/en dash in "${t.slice(0, 60)}"`);
    }
    if (c.grounding === "soc" && !(Array.isArray(c.soc) && c.soc.length > 0))
      err(`career ${c.id}: grounding "soc" but no soc codes`);
    if (c.grounding !== "soc" && c.grounding !== "postings")
      err(`career ${c.id}: grounding must be "soc" or "postings"`);
  }

  const inputIds = new Set();
  for (const input of inputs) {
    if (!input.id) err(`${input.kind} missing id`);
    else if (inputIds.has(input.id)) err(`duplicate input id ${input.id}`);
    inputIds.add(input.id);
    const dests = input.destinations || [];
    if (dests.length === 0) err(`${input.id}: no destinations`);
    for (const d of dests) if (!careerIds.has(d)) err(`${input.id}: unknown career ${d}`);
    if (input.kind === "course" && ![1000, 2000, 3000].includes(input.level))
      err(`${input.id}: bad level ${input.level}`);
    if (input.kind === "internship" && !orgTypes.has(input.orgType))
      err(`${input.id}: orgType ${JSON.stringify(input.orgType)} not in meta.orgTypes [${[...orgTypes].join(", ")}]`);
  }

  const reached = new Set(inputs.flatMap((i) => i.destinations || []));
  for (const c of careers) if (!reached.has(c.id)) err(`orphan career ${c.id} (no input reaches it)`);

  // --- Evidence gates (always on) ---
  const checkEvidence = (node, label) => {
    const ev = node.evidence || [];
    if (ev.length === 0) err(`${label}: no evidence`);
    for (const e of ev) {
      if (!e.retrievedAt) err(`${label}: evidence entry missing retrievedAt`);
      if (!e.type) err(`${label}: evidence entry missing type`);
    }
  };
  careers.forEach((c) => checkEvidence(c, `career ${c.id}`));
  for (const i of internships) if (isCanonical(i)) errors.push(...checkCanonicalRole(i, { snapshotRoot }));
  for (const input of inputs) {
    checkEvidence(input, `${input.kind} ${input.id}`);
    const floorKey = input.kind === "internship" ? "internship" : input.level;
    const floor = CONFIDENCE_FLOORS[floorKey];
    for (const d of input.destinations || []) {
      const edge = (input.edges || {})[d];
      if (!edge) {
        err(`${input.id} -> ${d}: no edge record (confidence/matchedSkills)`);
        continue;
      }
      if (edge.inferred) {
        // Judgment tier: softer bar, no distinctive-skill requirement, but must
        // be traceable - either to a source career this input directly reaches
        // (adjacency) or to an explicit gap-review rationale (judged).
        if (!(edge.confidence >= INFERENCE.floor))
          err(`${input.id} -> ${d}: inferred confidence ${edge.confidence} below inference floor ${INFERENCE.floor}`);
        if (edge.judged) {
          if (!edge.rationale) err(`${input.id} -> ${d}: judged edge missing rationale`);
        } else if (!edge.via) {
          err(`${input.id} -> ${d}: inferred edge missing "via" source career (or judged rationale)`);
        } else if (!(input.destinations || []).includes(edge.via)) {
          err(`${input.id} -> ${d}: inferred via ${edge.via}, which this input does not directly reach`);
        }
        continue;
      }
      if (!(edge.confidence >= floor))
        err(`${input.id} -> ${d}: confidence ${edge.confidence} below ${floorKey} floor ${floor}`);
      if (!Array.isArray(edge.matchedSkills) || edge.matchedSkills.length === 0)
        err(`${input.id} -> ${d}: no matchedSkills`);
      if (edge.distinctive !== true)
        err(`${input.id} -> ${d}: no distinctive matched skill (generic overlap saturates the map)`);
    }
  }

  // --- Distributional + coverage gates (full runs only) ---
  if (!pilot) {
    const inDegree = new Map(careers.map((c) => [c.id, 0]));
    let totalEdges = 0;
    for (const input of inputs)
      for (const d of input.destinations || []) {
        inDegree.set(d, (inDegree.get(d) || 0) + 1);
        totalEdges++;
      }

    for (const [id, deg] of inDegree) {
      if (totalEdges >= GATES.minEdgesForShareGate && deg / totalEdges > GATES.maxInDegreeShare)
        err(
          `hub career ${id}: in-degree ${deg} is ${((deg / totalEdges) * 100).toFixed(0)}% of all edges (max ${GATES.maxInDegreeShare * 100}%)`
        );
    }
    const g = gini([...inDegree.values()]);
    if (g > GATES.maxGini)
      err(`career in-degree Gini ${g.toFixed(2)} exceeds ${GATES.maxGini} (map converges on hubs)`);

    for (const level of [1000, 2000, 3000]) {
      const set = courses.filter((c) => c.level === level);
      let pairs = 0;
      let sum = 0;
      for (let i = 0; i < set.length; i++)
        for (let j = i + 1; j < set.length; j++) {
          sum += jaccard(set[i].destinations, set[j].destinations);
          pairs++;
        }
      const mean = pairs ? sum / pairs : 0;
      if (mean > GATES.maxMeanJaccard)
        err(
          `level ${level} courses: mean pairwise Jaccard ${mean.toFixed(2)} exceeds ${GATES.maxMeanJaccard} (picks do not discriminate)`
        );
    }

    const flags = (ds.meta && ds.meta.flags) || {};
    const starved = new Set(flags.internshipStarved || []);
    for (const c of careers) {
      const courseDeg = courses.filter((x) => (x.destinations || []).includes(c.id)).length;
      const internDeg = internships.filter((x) => (x.destinations || []).includes(c.id)).length;
      // A career reachable only by internships is genuinely reachable (its node
      // lights when you pick that internship), so course-only-absent is a
      // lopsidedness warning, not a "path closed" failure. Total-zero support
      // is already caught by the orphan check above; the assembler should have
      // dropped such careers into meta.flags.unsupportedCareers.
      if (courseDeg === 0 && internDeg > 0)
        warnings.push(`career ${c.id}: internship-only, no course support (see review report)`);
      if (internDeg === 0 && courseDeg > 0 && !starved.has(c.id))
        warnings.push(`career ${c.id}: course-only, no internship support and not flagged internshipStarved`);
      if (internDeg === 0 && starved.has(c.id))
        warnings.push(`career ${c.id}: internship-starved (flagged; see review report)`);
    }

    // Posting-clustered roles (grounding absent or "postings"): the
    // 2-distinct-companies rule, counting NORMALIZED companies across posting
    // and intern-list evidence (one employer seen through two sources is one
    // employer), plus at least one full-text source, because requiredSkills
    // must come from real posting text, not from title-only list entries.
    // Canonical roles have their own always-on gates (checkCanonicalRole).
    for (const i of internships) {
      if (isCanonical(i)) continue;
      const companies = new Set(
        (i.evidence || [])
          .filter((e) => e.type === "posting" || e.type === "intern-list")
          .map((e) => normalizeCompany(e.company))
          .filter(Boolean)
      );
      if (companies.size < GATES.minCompaniesPerInternship)
        err(
          `internship ${i.id}: postings from ${companies.size} distinct company(ies); need ${GATES.minCompaniesPerInternship}+`
        );
      if (!(i.evidence || []).some((e) => e.type === "posting" || e.type === "employer-page"))
        err(
          `internship ${i.id}: no full-text evidence (posting/employer-page); intern-list titles alone cannot ground requiredSkills`
        );
    }

    // Internship variety + coverage: the map must offer a realistic set of
    // intern roles, and those roles must reach more than one hub career.
    if (internships.length < GATES.minInternshipVariety)
      err(
        `internship variety: ${internships.length} role(s) shipped; need ${GATES.minInternshipVariety}+ (one-internship maps misrepresent entry paths; broaden grounding or enable the canonical tier)`
      );
    if (careers.length >= GATES.minCareersForCoverageGate) {
      const reachedByInternships = new Set(internships.flatMap((i) => i.destinations || []));
      if (reachedByInternships.size < GATES.minInternshipCareers)
        err(
          `internship coverage: internship edges reach ${reachedByInternships.size} career(s); need ${GATES.minInternshipCareers}+ (variety without coverage leaves careers internship-starved)`
        );
    }

    // Senior-narrowing shape gates: breadth must never close a door, and the
    // greedy committal stack must produce an open-then-narrow arc.
    if (careers.length >= NARROWING.minCareers) {
      const sim = simulateNarrowing(ds);
      warnings.push(
        `narrowing simulation (target ${sim.target}): breadth closes ${sim.breadthClosed}; senior stack peaks ${sim.peakOpen} open, ends ${sim.finalOpen} open / ${sim.finalClosed} crowded out`
      );
      if (sim.breadthClosed > 0)
        err(`narrowing: selecting every 1000-level course closes ${sim.breadthClosed} career(s); breadth must never close doors`);
      if (!(sim.peakOpen > sim.finalOpen))
        err(`narrowing: the committal senior stack never narrows (peak ${sim.peakOpen} open vs final ${sim.finalOpen}); the dataset cannot tell the open-then-specialize story`);
      if (sim.finalClosed < 1)
        err(`narrowing: the senior stack crowds out nothing; specialization has no cost in this dataset`);
      if (sim.finalOpen < 2)
        err(`narrowing: the senior stack leaves fewer than 2 careers open; closing is over-aggressive for this dataset`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const pilot = args.includes("--pilot");
  const file = args.find((a) => !a.startsWith("--")) || "data/dataset.json";
  const ds = JSON.parse(readFileSync(file, "utf8"));
  const { ok, errors, warnings } = validateDataset(ds, { pilot });
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`FAIL  ${e}`);
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${file} (${pilot ? "pilot gates" : "full gates"}), ${errors.length} error(s), ${warnings.length} warning(s)`
  );
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
