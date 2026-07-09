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
        const direct = have.get(a.to);
        if (direct && !direct.inferred) continue; // never shadow a directly grounded edge
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
  courseFiles,
  internshipFiles,
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

  // Stage 1b: judgment layer - propagate edges along career scope-overlap so
  // arguably-true relationships surface even without direct evidence.
  const balanceRows = [...courseRows, ...internRows];
  const inferred = propagateAdjacency(balanceRows, adjacency);

  // Stage 2: balance in-degree so a few hub careers can't swallow the map
  // (full runs only; pilot sets are too small for distributional shaping).
  // Runs after inference so it accounts for inferred edges too; because those
  // are lower-confidence by construction, the balancer trims them first.
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
        edges[e.career] = {
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
  const courses = courseRows.map(freeze).filter(Boolean);
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
  if (inferenceOnly.length) flags.inferenceOnlyCareers = inferenceOnly;
  if (unsupported.length) flags.unsupportedCareers = unsupported;
  if (distinctive && distinctive.collisions && distinctive.collisions.length)
    flags.socCollisions = distinctive.collisions;
  if (autoFlag) {
    const internReached = new Set(internships.flatMap((i) => i.destinations));
    const starved = careers.map((c) => c.id).filter((id) => !internReached.has(id));
    if (starved.length > 0) {
      flags.internshipStarved = [...new Set([...(flags.internshipStarved || []), ...starved])];
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
  const dataset = assemble({
    meta: readJson(join(sources, "meta.json")),
    careerFiles: readDir(join(sources, "careers")),
    distinctive: existsSync(distinctivePath) ? readJson(distinctivePath) : null,
    adjacency: existsSync(adjacencyPath) ? readJson(adjacencyPath) : null,
    courseFiles: readDir(join(sources, "courses")),
    internshipFiles: readDir(join(sources, "internships")),
    judgeFiles: readDir(join(sources, "edges-judge")),
    verdictFiles: readDir(join(sources, "edges-verdicts")),
    autoFlag: !args.includes("--no-auto-flag"),
  });
  writeFileSync(out, JSON.stringify(dataset, null, 2));
  const f = dataset.meta.flags;
  console.log(
    `wrote ${out}: ${dataset.careers.length} careers, ${dataset.courses.length} courses, ${dataset.internships.length} internships` +
      (f.inferredEdges ? `; +${f.inferredEdges} inferred edges (adjacency)` : "") +
      (f.inferenceOnlyCareers ? `; inference-only careers: ${f.inferenceOnlyCareers.join(", ")}` : "") +
      (f.droppedInputs ? `; dropped inputs (no surviving edges): ${f.droppedInputs.join(", ")}` : "") +
      (f.internshipStarved ? `; internship-starved: ${f.internshipStarved.join(", ")}` : "")
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
