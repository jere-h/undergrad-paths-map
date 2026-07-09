#!/usr/bin/env node
// assemble-dataset.mjs - deterministic merge of ground-catalog phase outputs
// into data/dataset.json. Agents write per-node JSON under data/sources/ and
// this script does the mechanical assembly, so no LLM ever transcribes bulk
// data between phases.
//
// Expected inputs (produced by the workflow's phases):
//   data/sources/meta.json                    { runId, university, onetVersion, generatedAt, sources[] }
//   data/sources/careers/<id>.json            career object (dataset schema)
//   data/sources/courses/<dept>.json          { dept, sourceUrl, courses: [course w/o destinations] }
//   data/sources/internships/<orgType>.json   { orgType, roles: [internship w/o destinations] }
//   data/sources/edges/<inputId>.json         { id, destinations: [...], edges: {careerId: {confidence, matchedSkills, distinctive}} }
//
// Careers that end up with no internship edge are auto-flagged
// meta.flags.internshipStarved so the validator surfaces them as warnings and
// the review report lists them; pass --no-auto-flag to fail hard instead.
//
// Usage:
//   node scripts/assemble-dataset.mjs [--sources data/sources] [--out data/dataset.json] [--no-auto-flag]

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readJson(join(dir, f)));
}

export function assemble({ meta, careerFiles, courseFiles, internshipFiles, edgeFiles, autoFlag = true }) {
  const edgesById = new Map(edgeFiles.map((e) => [e.id, e]));
  const withEdges = (input, label) => {
    const e = edgesById.get(input.id);
    if (!e) throw new Error(`${label} ${input.id}: no edge file (Phase D output missing)`);
    return { ...input, destinations: e.destinations, edges: e.edges };
  };

  const careers = careerFiles;
  const courses = courseFiles.flatMap((f) => f.courses.map((c) => withEdges(c, "course")));
  const internships = internshipFiles.flatMap((f) => f.roles.map((r) => withEdges(r, "internship")));

  const flags = { ...(meta.flags || {}) };
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
  const dataset = assemble({
    meta: readJson(join(sources, "meta.json")),
    careerFiles: readDir(join(sources, "careers")),
    courseFiles: readDir(join(sources, "courses")),
    internshipFiles: readDir(join(sources, "internships")),
    edgeFiles: readDir(join(sources, "edges")),
    autoFlag: !args.includes("--no-auto-flag"),
  });
  writeFileSync(out, JSON.stringify(dataset, null, 2));
  console.log(
    `wrote ${out}: ${dataset.careers.length} careers, ${dataset.courses.length} courses, ${dataset.internships.length} internships` +
      (dataset.meta.flags.internshipStarved?.length
        ? `; internship-starved: ${dataset.meta.flags.internshipStarved.join(", ")}`
        : "")
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
