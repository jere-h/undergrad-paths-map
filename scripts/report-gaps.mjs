#!/usr/bin/env node
// report-gaps.mjs - deterministic detector of intuition gaps in an assembled
// dataset, from the app user's perspective:
//
//   - SPARSE INPUTS: a course/internship opening fewer doors than its level
//     promises. The product's premise is that broad early choices open many
//     doors, so a Level 1000 intro with one destination reads as broken even
//     when each individual edge was honestly judged. (Root cause: the
//     distinctive-skill rule that prevents generic-skill saturation also
//     under-connects foundational courses - probability really does feed
//     several careers, but "probability" counts as distinctive to only one.)
//   - SPARSE CAREERS: a job reachable through so few inputs that it reads as
//     a dead end.
//
// The output feeds the workflow's gap-review JUDGMENT stage: an LLM proposes
// additional judged edges only for the flagged entities, capped and dampened
// by the assembler, so intuition is repaired without reopening saturation.
//
// Usage:
//   node scripts/report-gaps.mjs <dataset.json>
//
// Emits JSON: { sparseInputs: [{ id, kind, level?, name, skills, destinations,
//   expected }], sparseCareers: [{ id, name, supporters }], careers: [{ id,
//   name }] }

import { readFileSync } from "node:fs";

// How many destinations a user intuitively expects per input kind/level
// (mirrors the strength model: 1000 broad ... 3000/internship narrow).
export const EXPECTED_DESTINATIONS = { 1000: 3, 2000: 2, 3000: 2, internship: 2 };
export const SPARSE_CAREER_SUPPORT = 3; // fewer supporting inputs than this reads as a dead end

export function findGaps(ds) {
  const careers = (ds.careers || []).map((c) => ({ id: c.id, name: c.name }));
  const inputs = [
    ...(ds.courses || []).map((c) => ({ ...c, kind: "course" })),
    ...(ds.internships || []).map((i) => ({ ...i, kind: "internship", name: i.role })),
  ];

  const sparseInputs = inputs
    .filter((i) => {
      const expected = EXPECTED_DESTINATIONS[i.kind === "internship" ? "internship" : i.level] || 2;
      return (i.destinations || []).length < expected;
    })
    .map((i) => ({
      id: i.id,
      kind: i.kind,
      level: i.level,
      name: i.name,
      skills: i.taughtSkills || i.requiredSkills || [],
      destinations: i.destinations || [],
      expected: EXPECTED_DESTINATIONS[i.kind === "internship" ? "internship" : i.level] || 2,
    }));

  const supporters = new Map(careers.map((c) => [c.id, []]));
  for (const i of inputs)
    for (const d of i.destinations || []) if (supporters.has(d)) supporters.get(d).push(i.id);
  const sparseCareers = careers
    .filter((c) => supporters.get(c.id).length < SPARSE_CAREER_SUPPORT)
    .map((c) => ({ id: c.id, name: c.name, supporters: supporters.get(c.id) }));

  return { sparseInputs, sparseCareers, careers };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: report-gaps.mjs <dataset.json>");
    process.exit(2);
  }
  const gaps = findGaps(JSON.parse(readFileSync(file, "utf8")));
  process.stdout.write(JSON.stringify(gaps, null, 2));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
