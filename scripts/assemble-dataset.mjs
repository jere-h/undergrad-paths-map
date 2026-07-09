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

export const FLOORS = { 1000: 0.5, 2000: 0.6, 3000: 0.7, internship: 0.75 };
export const AUTO_ACCEPT = 0.85;
export const TOPK = { 1000: 5, 2000: 4, 3000: 3, internship: 4 };

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

export function assemble({
  meta,
  careerFiles,
  distinctive,
  courseFiles,
  internshipFiles,
  judgeFiles,
  verdictFiles,
  autoFlag = true,
}) {
  const proposals = collectProposals(judgeFiles);
  const verdicts = collectVerdicts(verdictFiles);
  const dropped = [];

  const withEdges = (input) => {
    const edges = resolveEdges(input, proposals.get(input.id), verdicts);
    if (edges.length === 0) {
      dropped.push(input.id);
      return null;
    }
    return {
      ...input,
      destinations: edges.map((e) => e.career),
      edges: Object.fromEntries(
        edges.map((e) => [
          e.career,
          { confidence: e.confidence, matchedSkills: e.matchedSkills, distinctive: true },
        ])
      ),
    };
  };

  const dist = (distinctive && distinctive.distinctiveSkills) || {};
  const careers = careerFiles.map((c) =>
    dist[c.id] ? { ...c, distinctiveSkills: dist[c.id] } : c
  );
  const courses = courseFiles.flatMap((f) => f.courses.map(withEdges)).filter(Boolean);
  const internships = internshipFiles.flatMap((f) => f.roles.map(withEdges)).filter(Boolean);

  const flags = { ...(meta.flags || {}) };
  if (dropped.length) flags.droppedInputs = dropped;
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
  const dataset = assemble({
    meta: readJson(join(sources, "meta.json")),
    careerFiles: readDir(join(sources, "careers")),
    distinctive: existsSync(distinctivePath) ? readJson(distinctivePath) : null,
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
      (f.droppedInputs ? `; dropped inputs (no surviving edges): ${f.droppedInputs.join(", ")}` : "") +
      (f.internshipStarved ? `; internship-starved: ${f.internshipStarved.join(", ")}` : "")
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
