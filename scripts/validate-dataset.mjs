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

import { readFileSync } from "node:fs";

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

export function validateDataset(ds, { pilot = false } = {}) {
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
        // trace to a source career this input also directly reaches.
        if (!(edge.confidence >= INFERENCE.floor))
          err(`${input.id} -> ${d}: inferred confidence ${edge.confidence} below inference floor ${INFERENCE.floor}`);
        if (!edge.via) err(`${input.id} -> ${d}: inferred edge missing "via" source career`);
        else if (!(input.destinations || []).includes(edge.via))
          err(`${input.id} -> ${d}: inferred via ${edge.via}, which this input does not directly reach`);
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

    for (const i of internships) {
      const companies = new Set(
        (i.evidence || []).filter((e) => e.type === "posting").map((e) => e.company)
      );
      if (companies.size < GATES.minCompaniesPerInternship)
        err(
          `internship ${i.id}: postings from ${companies.size} company(ies); need ${GATES.minCompaniesPerInternship}+`
        );
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
