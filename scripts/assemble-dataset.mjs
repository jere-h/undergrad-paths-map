#!/usr/bin/env node
// assemble-dataset.mjs - deterministic merge of ground-catalog phase outputs
// into a dataset. Agents write JSON under data/sources/<industry>/ and this
// script does all mechanical assembly AND all mechanical edge policy, so no
// LLM ever transcribes bulk data or applies a threshold rule.
//
// Expected inputs (produced by the workflow's phases):
//   <sources>/meta.json                  { runId, university, onetVersion, ... }
//   <sources>/careers/<id>.json          career object (dataset schema)
//   <sources>/careers/_distinctive.json  { distinctiveSkills: {careerId: [...]},
//                                          collisions: [...] } (optional)
//   <sources>/courses/<dept>.json        { dept, courses: [course w/o destinations] }
//   <sources>/internships/<orgType>.json { orgType, roles: [role w/o destinations] }
//   <sources>/edges-judge/*.json         { proposals: { inputId: [proposal] } }
//                                        or legacy { id, proposed: [proposal] }
//   <sources>/edges-verdicts/*.json      { verdicts: [{ input, career,
//                                          verdict: "keep"|"drop", reason }] }
//
// Edge policy (deterministic, fail-closed):
//   - below the per-kind confidence floor        -> drop
//   - missing distinctive matched skill          -> drop
//   - confidence >= AUTO_ACCEPT                  -> keep
//   - otherwise (the banded middle) keep ONLY with an explicit skeptic "keep"
//     verdict; an unreviewed banded edge drops. Then rank by confidence and
//     keep the top K for the input's kind/level.
// Inputs left with zero edges are dropped and recorded in
// meta.flags.droppedInputs - visible, never silent.
//
// Usage:
//   node scripts/assemble-dataset.mjs [--sources data/sources/<industry>]
//        [--out data/datasets/<industry>.json] [--no-auto-flag]

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { gini, INFERENCE } from "./validate-dataset.mjs";

export const FLOORS = { 1000: 0.5, 2000: 0.6, 3000: 0.7, internship: 0.75 };
export const AUTO_ACCEPT = 0.85;
export const TOPK = { 1000: 5, 2000: 4, 3000: 3, internship: 4 };
// Balancing targets (mirror the validator's distributional gates). In a narrow
// single-industry set, a few "core" careers genuinely overlap most courses and
// absorb the map; per-input top-K bounds out-degree but not in-degree. This
// greedily trims the most over-represented career's WEAKEST valid edge until
// the share and Gini gates are met, so hubs stop swallowing differentiation.
// Only ever drops edges (lowest confidence first) - never fabricates.
export const BALANCE = { maxInDegreeShare: 0.25, minEdgesForShareGate: 16, maxGini: 0.45 };

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readDir(dir, { includeUnderscore = false } = {}) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && (includeUnderscore || !basename(f).startsWith("_")))
    .sort()
    .map((f) => readJson(join(dir, f)));
}

// Normalize judge files (batch or legacy per-input) into inputId -> proposals.
export function collectProposals(judgeFiles) {
  const byInput = new Map();
  for (const file of judgeFiles) {
    if (file.proposals) {
      for (const [id, list] of Object.entries(file.proposals)) byInput.set(id, list);
    } else if (file.id && file.proposed) {
      byInput.set(file.id, file.proposed);
    }
  }
  return byInput;
}

// Adjacency inference. A directional career-scope-overlap map (from an LLM
// judgment step, not data) lets an input that directly opens career A also
// open careers whose scope overlaps A - the "arguably true despite no direct
// evidence" relationships, e.g. a Data Scientist qualification also strengthens
// a Data Analyst path. Inferred edges are dampened (weight * damping), floored,
// capped per input, and never shadow or chain off another inferred edge, so
// they enrich reachability without saturating or fabricating.
export const ADJACENCY = { minWeight: INFERENCE.minWeight, damping: 0.85, floor: INFERENCE.floor, maxPerInput: 3 };

// Gap-review judged edges: the second judgment tier. A gap-review agent looks
// at the ASSEMBLED map from the app user's perspective (scripts/report-gaps.mjs
// flags inputs opening fewer doors than their level promises, and careers with
// dead-end-few supporters) and proposes additional input->career edges on
// domain judgment alone - e.g. "Introduction to Probability" genuinely helps
// toward Data Scientist even though 'probability' wasn't a distinctive skill.
// Capped per input (internships get one more: an intern role honestly opens
// its home career plus a neighbour or two) and floored so intuition is
// repaired without reopening the saturation the distinctive-skill rule exists
// to prevent. A row's PRE-EXISTING judged edges (canonical roles are built
// with them) count toward the cap, so top-ups cannot stack past it.
export const JUDGED = { floor: INFERENCE.floor, maxPerInput: 2, maxPerInternship: 3 };

// gapFiles: [{ judged: [{ input, career, confidence, rationale }] }]
export function mergeJudgedEdges(rows, gapFiles, careerIds, opts = JUDGED) {
  const byInput = new Map(rows.map((r) => [r.input.id, r]));
  const perInput = new Map(
    rows.map((r) => [r.input.id, r.edges.filter((e) => e.judged).length])
  );
  const capFor = (r) => (r.kind === "internship" ? opts.maxPerInternship ?? opts.maxPerInput : opts.maxPerInput);
  let added = 0;
  for (const f of gapFiles || []) {
    for (const j of f.judged || []) {
      const r = byInput.get(j.input);
      if (!r) continue;
      if (!careerIds.has(j.career)) continue; // judge typo: skip, report shows counts
      if (!(j.confidence >= opts.floor)) continue;
      if (!j.rationale) continue;
      if (r.edges.some((e) => e.career === j.career)) continue;
      const n = perInput.get(j.input) || 0;
      if (n >= capFor(r)) continue;
      perInput.set(j.input, n + 1);
      r.edges.push({
        career: j.career,
        confidence: Number(Number(j.confidence).toFixed(3)),
        inferred: true,
        judged: true,
        rationale: j.rationale,
        matchedSkills: [],
      });
      added++;
    }
  }
  return added;
}

// adjacency: { pairs: [{ from, to, weight, rationale }] } (directional).
export function propagateAdjacency(rows, adjacency, opts = ADJACENCY) {
  if (!adjacency || !Array.isArray(adjacency.pairs)) return 0;
  const byFrom = new Map();
  for (const p of adjacency.pairs) {
    if (!(p.weight >= opts.minWeight) || !p.from || !p.to || p.from === p.to) continue;
    if (!byFrom.has(p.from)) byFrom.set(p.from, []);
    byFrom.get(p.from).push(p);
  }
  let added = 0;
  for (const r of rows) {
    const have = new Map(r.edges.map((e) => [e.career, e]));
    const byTarget = new Map();
    // Only propagate from DIRECT edges (no chaining inference off inference).
    for (const e of r.edges.filter((x) => !x.inferred)) {
      for (const a of byFrom.get(e.career) || []) {
        if (have.has(a.to)) continue; // never shadow or duplicate an existing edge (direct or judged)
        const confidence = e.confidence * a.weight * opts.damping;
        if (confidence < opts.floor) continue;
        const cur = byTarget.get(a.to);
        if (!cur || confidence > cur.confidence)
          byTarget.set(a.to, {
            career: a.to,
            confidence: Number(confidence.toFixed(3)),
            inferred: true,
            via: e.career,
            adjacencyWeight: a.weight,
            matchedSkills: [`scope overlap with ${e.career}`],
          });
      }
    }
    const inferred = [...byTarget.values()]
      .sort((x, y) => y.confidence - x.confidence)
      .slice(0, opts.maxPerInput);
    for (const c of inferred) {
      r.edges.push(c);
      added++;
    }
  }
  return added;
}

// Validated-canonical internship tier. The proposer agent writes proposals
// (judgment: role, org type, skills-as-priors, candidate edges); the
// validator agent writes validation results ONLY (evidence it actually found,
// per role id). This deterministic join is the sole producer of canonical
// roles - no LLM transcribes fields across the proposal/evidence boundary,
// and only ids present in BOTH files ship. exampleTitles derive from the
// validation evidence verbatim (never invented), requiredSkills stay marked
// skillsBasis "judgment", and every edge is judged-tier (floored, capped,
// rationale-required).
export const CANONICAL = { idPrefix: "canonical-", floor: INFERENCE.floor, maxEdges: 3 };

const normalizeTitle = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// proposals: { proposals: [{ id, role, orgType, requiredSkills, candidateEdges, ... }] }
// validation: { validated: [{ id, evidence: [...] }], failures: [...] }
// Returns { rows, skipped } - rows in the assembler's mutable shape.
export function buildCanonicalRoles(proposals, validation, careerIds, opts = CANONICAL) {
  const rows = [];
  const skipped = [];
  const validatedById = new Map(
    ((validation && validation.validated) || []).map((v) => [v.id, v])
  );
  for (const p of (proposals && proposals.proposals) || []) {
    const v = validatedById.get(p.id);
    if (!v) {
      skipped.push(`${p.id}: not validated`);
      continue;
    }
    const evidence = v.evidence || [];
    if (evidence.length === 0) {
      skipped.push(`${p.id}: validated with zero evidence entries`);
      continue;
    }
    const id = String(p.id).startsWith(opts.idPrefix) ? p.id : `${opts.idPrefix}${p.id}`;
    const edges = ((p.candidateEdges || [])
      .filter((e) => careerIds.has(e.career) && e.confidence >= opts.floor && e.rationale)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, opts.maxEdges))
      .map((e) => ({
        career: e.career,
        confidence: Number(Number(e.confidence).toFixed(3)),
        inferred: true,
        judged: true,
        rationale: e.rationale,
        matchedSkills: [],
      }));
    rows.push({
      input: {
        id,
        role: p.role,
        orgType: p.orgType,
        grounding: "canonical",
        skillsBasis: "judgment",
        requiredSkills: p.requiredSkills || [],
        exampleTitles: evidence.filter((e) => e.title).map((e) => `${e.title} (${e.company})`),
        evidence,
      },
      kind: "internship",
      edges,
    });
  }
  return { rows, skipped };
}

// Course de-duplication (brevity/simplicity of the experience). Several real
// catalog courses can be title-and-scope near-duplicates within one level
// (e.g. "Introduction to Probability", "Probability and Random Variables",
// "Introduction to Probability and Statistics"). The DECISION of what is
// similar enough to collapse is judgment (an agent, or a hand-authored
// _merges.json); this APPLICATION is deterministic. A merged node keeps one
// member's id (so preselects and edges referencing it survive), a
// representative title, the UNION of members' edges (best edge per career,
// direct beating inferred), and ALL members' evidence + taughtSkills, plus a
// mergedFrom record. Runs AFTER the judgment layers so judged/adjacency edges
// on any member are preserved into the representative, and BEFORE balancing so
// the balancer and gates see the final, collapsed node set.
const edgeRank = (e) => (e.inferred ? 0 : 1); // direct beats inferred/judged
function betterEdge(a, b) {
  return edgeRank(a) !== edgeRank(b) ? edgeRank(a) > edgeRank(b) : (a.confidence || 0) > (b.confidence || 0);
}

// merges: { merges: [{ keep, title, members: [ids], rationale? }] }
// Returns { rows, merged, skipped } where rows is the new course-row list.
export function mergeCourses(courseRows, merges) {
  if (!merges || !Array.isArray(merges.merges)) return { rows: courseRows, merged: [], skipped: [] };
  const byId = new Map(courseRows.map((r) => [r.input.id, r]));
  const consumed = new Set();
  const repById = new Map();
  const merged = [];
  const skipped = [];
  for (const m of merges.merges || []) {
    const present = (m.members || []).filter((id) => byId.has(id) && !consumed.has(id));
    if (present.length < 2) {
      if ((m.members || []).length) skipped.push(`${m.keep || present[0] || "?"}: fewer than 2 present members, not merged`);
      continue;
    }
    const memberRows = present.map((id) => byId.get(id));
    const levels = new Set(memberRows.map((r) => r.input.level));
    if (levels.size > 1) {
      skipped.push(`${m.keep || present[0]}: members span levels ${[...levels].join(", ")}, not merged (merges must stay within a tier)`);
      continue;
    }
    const keepId = m.keep && present.includes(m.keep) ? m.keep : present[0];
    const keepRow = byId.get(keepId);
    // Union edges: best edge per career (direct beats inferred; then higher confidence).
    const bestByCareer = new Map();
    for (const r of memberRows)
      for (const e of r.edges) {
        const cur = bestByCareer.get(e.career);
        if (!cur || betterEdge(e, cur)) bestByCareer.set(e.career, e);
      }
    const memberMeta = memberRows.map((r) => ({ id: r.input.id, name: r.input.name, catalogCode: r.input.catalogCode }));
    const rep = {
      input: {
        ...keepRow.input,
        id: keepId,
        name: m.title || keepRow.input.name,
        taughtSkills: [...new Set(memberRows.flatMap((r) => r.input.taughtSkills || []))],
        evidence: memberRows.flatMap((r) => r.input.evidence || []),
        mergedFrom: memberMeta,
      },
      kind: "course",
      edges: [...bestByCareer.values()].map((e) => ({ ...e })),
    };
    present.forEach((id) => consumed.add(id));
    repById.set(keepId, rep);
    merged.push({ id: keepId, title: rep.input.name, level: keepRow.input.level, members: memberMeta });
  }
  // Rebuild in original order: kept members become their representative, other
  // members are dropped, everything else passes through.
  const rows = [];
  for (const r of courseRows) {
    if (repById.has(r.input.id)) rows.push(repById.get(r.input.id));
    else if (!consumed.has(r.input.id)) rows.push(r);
  }
  return { rows, merged, skipped };
}

export function collectVerdicts(verdictFiles) {
  const map = new Map();
  for (const file of verdictFiles)
    for (const v of file.verdicts || []) map.set(`${v.input}|${v.career}`, v.verdict);
  return map;
}

export function resolveEdges(input, proposals, verdicts) {
  const kindKey = input.orgType ? "internship" : input.level;
  const floor = FLOORS[kindKey];
  const topK = TOPK[kindKey];
  if (floor === undefined || topK === undefined)
    throw new Error(`input ${input.id}: no edge policy for kind/level ${kindKey}`);
  const kept = (proposals || []).filter((p) => {
    if (!(p.confidence >= floor)) return false;
    if (p.distinctive !== true || !(p.matchedSkills || []).length) return false;
    if (p.confidence >= AUTO_ACCEPT) return true;
    return verdicts.get(`${input.id}|${p.career}`) === "keep"; // fail-closed
  });
  kept.sort((a, b) => b.confidence - a.confidence);
  return kept.slice(0, topK);
}

// Greedily trim hub in-degree until the share + Gini gates hold. `rows` is a
// mutable list of { id, edges: [{career, confidence}] } (edges already
// floor/distinctive/verdict/top-K filtered). Returns trimmed count. Never
// drops a row's last edge (that would orphan an input mid-balance); a hub
// reachable only through single-edge inputs is left alone so those inputs are
// dropped explicitly and visibly downstream instead.
export function balanceInDegree(rows, gates = BALANCE) {
  let trimmed = 0;
  for (let iter = 0; iter < 100000; iter++) {
    const indeg = new Map();
    let total = 0;
    for (const r of rows) for (const e of r.edges) {
      indeg.set(e.career, (indeg.get(e.career) || 0) + 1);
      total++;
    }
    if (total === 0) break;
    const entries = [...indeg.entries()];
    const overShare =
      total >= gates.minEdgesForShareGate &&
      entries.some(([, d]) => d / total > gates.maxInDegreeShare);
    if (!overShare && gini([...indeg.values()]) <= gates.maxGini) break;
    const hub = entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    let victim = null;
    for (const r of rows) {
      if (r.edges.length <= 1) continue;
      for (let k = 0; k < r.edges.length; k++) {
        const e = r.edges[k];
        if (e.career !== hub) continue;
        if (!victim || e.confidence < victim.e.confidence) victim = { r, k, e };
      }
    }
    if (!victim) break; // hub only reachable via single-edge inputs; leave it
    victim.r.edges.splice(victim.k, 1);
    trimmed++;
  }
  return trimmed;
}

export function assemble({
  meta,
  careerFiles,
  distinctive,
  adjacency,
  gapFiles,
  courseFiles,
  internshipFiles,
  canonicalProposals = null,
  canonicalValidation = null,
  merges = null,
  judgeFiles,
  verdictFiles,
  autoFlag = true,
}) {
  const proposals = collectProposals(judgeFiles);
  const verdicts = collectVerdicts(verdictFiles);

  // Stage 1: resolve each input's edges (floors, auto-accept, fail-closed
  // band, per-input top-K). Keep the resolved edges on a mutable row so the
  // balancer can trim across inputs before we freeze the dataset.
  const rowFor = (input, kind) => ({
    input,
    kind,
    edges: resolveEdges(input, proposals.get(input.id), verdicts),
  });
  const courseRows = courseFiles.flatMap((f) => f.courses.map((c) => rowFor(c, "course")));
  const internRows = internshipFiles.flatMap((f) => f.roles.map((r) => rowFor(r, "internship")));
  const careerIdSet = new Set(careerFiles.map((c) => c.id));

  // Stage 1a: validated-canonical internship roles (deterministic join of the
  // proposer's judgments with the validator's evidence). Canonical roles never
  // appear in internships/ files or edge-judge proposals, so they are outside
  // the direct-evidence pipeline by construction; a canonical role whose
  // normalized title duplicates a clustered role is dropped (clustered
  // evidence wins) and flagged, never silently merged.
  const canonicalSkipped = [];
  let canonicalRows = [];
  if (canonicalProposals && canonicalValidation) {
    const built = buildCanonicalRoles(canonicalProposals, canonicalValidation, careerIdSet);
    canonicalSkipped.push(...built.skipped);
    const clusteredTitles = new Set(internRows.map((r) => normalizeTitle(r.input.role)));
    for (const row of built.rows) {
      if (clusteredTitles.has(normalizeTitle(row.input.role)))
        canonicalSkipped.push(`${row.input.id}: duplicates clustered role "${row.input.role}"`);
      else canonicalRows.push(row);
    }
    internRows.push(...canonicalRows);
  }

  // Stage 1b: judgment layers. Gap-review judged edges merge first (they are
  // explicit assertions about a specific input), then adjacency propagates
  // scope-overlap edges around whatever now exists - never duplicating either.
  const judgmentRows = [...courseRows, ...internRows];
  const judged = mergeJudgedEdges(judgmentRows, gapFiles, careerIdSet);
  const inferred = propagateAdjacency(judgmentRows, adjacency);

  // Stage 1c: course de-duplication for brevity. Collapses title-similar
  // courses within a level into one representative (union of edges + evidence),
  // AFTER the judgment layers (so a member's judged/adjacency edges survive
  // into the representative) and BEFORE balancing (so the balancer and gates
  // see the collapsed node set). The member courses' edges are already on their
  // rows, so no id remapping of judged/gap edges is needed.
  const { rows: mergedCourseRows, merged: mergedCourses, skipped: mergeSkipped } = mergeCourses(courseRows, merges);

  // Stage 2: balance in-degree so a few hub careers can't swallow the map
  // (full runs only; pilot sets are too small for distributional shaping).
  // Runs after inference so it accounts for inferred edges too; because those
  // are lower-confidence by construction, the balancer trims them first.
  const balanceRows = [...mergedCourseRows, ...internRows];
  const trimmed = meta.pilot ? 0 : balanceInDegree(balanceRows);

  const dropped = [];
  const freeze = (row) => {
    if (row.edges.length === 0) {
      dropped.push(row.input.id);
      return null;
    }
    const inferredDests = [];
    const edges = {};
    for (const e of row.edges) {
      if (e.inferred) {
        edges[e.career] = e.judged
          ? { confidence: e.confidence, inferred: true, judged: true, rationale: e.rationale, matchedSkills: [] }
          : {
              confidence: e.confidence,
              inferred: true,
              via: e.via,
              adjacencyWeight: e.adjacencyWeight,
              matchedSkills: e.matchedSkills || [],
            };
        inferredDests.push(e.career);
      } else {
        edges[e.career] = { confidence: e.confidence, matchedSkills: e.matchedSkills, distinctive: true };
      }
    }
    const out = { ...row.input, destinations: row.edges.map((e) => e.career), edges };
    // The generator reads this to render inferred links softer in the app.
    if (inferredDests.length) out.inferred = inferredDests;
    return out;
  };
  const courses = mergedCourseRows.map(freeze).filter(Boolean);
  const internships = internRows.map(freeze).filter(Boolean);

  // Stage 3: reconcile careers against surviving support. A career reached by
  // nothing (no course, no internship) is not part of this evidence base's
  // map; drop it into a flag rather than ship an orphan / "path closed" node.
  const dist = (distinctive && distinctive.distinctiveSkills) || {};
  const supported = new Set([...courses, ...internships].flatMap((i) => i.destinations));
  const allCareers = careerFiles.map((c) => (dist[c.id] ? { ...c, distinctiveSkills: dist[c.id] } : c));
  const careers = allCareers.filter((c) => supported.has(c.id));
  const unsupported = allCareers.filter((c) => !supported.has(c.id)).map((c) => c.id);

  // Careers that survive only because of inferred (not directly grounded) edges
  // - honest to surface: their reachability rests on judgment, not evidence.
  const directlySupported = new Set(
    [...courses, ...internships].flatMap((i) =>
      (i.destinations || []).filter((d) => !(i.inferred || []).includes(d))
    )
  );
  const inferenceOnly = careers.map((c) => c.id).filter((id) => !directlySupported.has(id));

  const flags = { ...(meta.flags || {}) };
  if (dropped.length) flags.droppedInputs = dropped;
  if (trimmed) flags.edgesTrimmedForBalance = trimmed;
  if (inferred) flags.inferredEdges = inferred;
  if (judged) flags.judgedEdges = judged;
  if (inferenceOnly.length) flags.inferenceOnlyCareers = inferenceOnly;
  if (unsupported.length) flags.unsupportedCareers = unsupported;
  if (mergedCourses.length) flags.mergedCourses = mergedCourses;
  if (mergeSkipped.length) flags.mergeSkipped = mergeSkipped;
  if (distinctive && distinctive.collisions && distinctive.collisions.length)
    flags.socCollisions = distinctive.collisions;

  // Canonical-tier disclosure: which shipped roles are canonical, how the
  // variety splits, what was skipped (unvalidated / duplicate), and which
  // careers' internship support rests ENTIRELY on canonical judgment.
  const shippedCanonical = internships.filter((i) => i.grounding === "canonical");
  if (canonicalRows.length || canonicalSkipped.length) {
    flags.canonicalInternships = shippedCanonical.map((i) => i.id);
    flags.internshipVariety = {
      total: internships.length,
      clustered: internships.length - shippedCanonical.length,
      canonical: shippedCanonical.length,
    };
    if (canonicalSkipped.length) flags.canonicalSkipped = canonicalSkipped;
    const clusteredReached = new Set(
      internships.filter((i) => i.grounding !== "canonical").flatMap((i) => i.destinations)
    );
    const canonicalOnly = [
      ...new Set(shippedCanonical.flatMap((i) => i.destinations)),
    ].filter((c) => !clusteredReached.has(c)).sort();
    if (canonicalOnly.length) flags.canonicalOnlyInternshipCareers = canonicalOnly;
  }

  if (autoFlag) {
    const internReached = new Set(internships.flatMap((i) => i.destinations));
    const starved = careers.map((c) => c.id).filter((id) => !internReached.has(id));
    if (starved.length > 0) {
      flags.internshipStarved = [...new Set([...(flags.internshipStarved || []), ...starved])];
    } else {
      delete flags.internshipStarved;
    }
  }

  return { meta: { ...meta, flags }, careers, courses, internships };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const sources = opt("--sources", "data/sources");
  const out = opt("--out", "data/dataset.json");
  const distinctivePath = join(sources, "careers", "_distinctive.json");
  const adjacencyPath = join(sources, "careers", "_adjacency.json");
  const canonicalProposalsPath = join(sources, "internships-canonical", "_proposals.json");
  const canonicalValidationPath = join(sources, "internships-canonical", "validation.json");
  const mergesPath = join(sources, "courses", "_merges.json");
  const dataset = assemble({
    meta: readJson(join(sources, "meta.json")),
    careerFiles: readDir(join(sources, "careers")),
    distinctive: existsSync(distinctivePath) ? readJson(distinctivePath) : null,
    adjacency: existsSync(adjacencyPath) ? readJson(adjacencyPath) : null,
    gapFiles: readDir(join(sources, "edges-gap")),
    courseFiles: readDir(join(sources, "courses")),
    internshipFiles: readDir(join(sources, "internships")),
    canonicalProposals: existsSync(canonicalProposalsPath) ? readJson(canonicalProposalsPath) : null,
    canonicalValidation: existsSync(canonicalValidationPath) ? readJson(canonicalValidationPath) : null,
    merges: existsSync(mergesPath) ? readJson(mergesPath) : null,
    judgeFiles: readDir(join(sources, "edges-judge")),
    verdictFiles: readDir(join(sources, "edges-verdicts")),
    autoFlag: !args.includes("--no-auto-flag"),
  });
  writeFileSync(out, JSON.stringify(dataset, null, 2));
  const f = dataset.meta.flags;
  console.log(
    `wrote ${out}: ${dataset.careers.length} careers, ${dataset.courses.length} courses, ${dataset.internships.length} internships` +
      (f.internshipVariety ? ` (${f.internshipVariety.clustered} clustered + ${f.internshipVariety.canonical} canonical)` : "") +
      (f.mergedCourses ? `; ${f.mergedCourses.length} course merge(s) collapsing ${f.mergedCourses.reduce((s, m) => s + m.members.length, 0)} into ${f.mergedCourses.length}` : "") +
      (f.inferredEdges ? `; +${f.inferredEdges} inferred edges (adjacency)` : "") +
      (f.judgedEdges ? `; +${f.judgedEdges} judged edges (gap review)` : "") +
      (f.canonicalSkipped ? `; canonical skipped: ${f.canonicalSkipped.join("; ")}` : "") +
      (f.canonicalOnlyInternshipCareers ? `; canonical-only internship careers: ${f.canonicalOnlyInternshipCareers.join(", ")}` : "") +
      (f.inferenceOnlyCareers ? `; inference-only careers: ${f.inferenceOnlyCareers.join(", ")}` : "") +
      (f.droppedInputs ? `; dropped inputs (no surviving edges): ${f.droppedInputs.join(", ")}` : "") +
      (f.internshipStarved ? `; internship-starved: ${f.internshipStarved.join(", ")}` : "")
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
