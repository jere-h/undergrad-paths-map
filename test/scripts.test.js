// Unit suite for the deterministic grounding-pipeline scripts
// (docs/grounding-workflow-plan.md). Runs with `node --test`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCourseBlocks,
  parsePrereqExpr,
  assignLevels,
  stripTags,
  decodeEntities,
} from "../scripts/parse-catalog-html.mjs";
import { filterGreenhouse, filterLever, cleanContent } from "../scripts/fetch-postings.mjs";
import { gini, jaccard, validateDataset } from "../scripts/validate-dataset.mjs";
import { generateCatalog } from "../scripts/build-catalog.mjs";
import { parseTsv } from "../scripts/onet-extract.mjs";

// ---------- catalog HTML parsing ----------

const BLOCK = (code, title, prereq, terms, desc) => `
<div class="courseblock">
<h4 class="courseblocktitle"><span><strong>${code} ${title}</strong></span></h4>
<p class="courseblockextra">
<span class="courseblockprereq">Prereq: ${prereq} </span><br/>
<span class="courseblockterms">${terms}</span><br/>
<span class="courseblockhours">3-0-9 units</span>
</p>
<p class="courseblockdesc">${desc}</p>
</div>`;

const HTML =
  BLOCK("1.001", "Intro Thing", "None", "U (Fall)", "Basics of things &amp; stuff.") +
  BLOCK("1.002", "Second Thing", "1.001", "U (Spring)", "Builds on intro.") +
  BLOCK("1.003", "Deep Thing", "1.002 and 1.001", "U (Fall)", "Advanced.") +
  BLOCK("1.900", "Grad Thing", "1.003", "G (Fall)", "Graduate only.") +
  BLOCK("1.004", "Choice Thing", "1.001 or ( 1.002 and 1.003 )", "U (IAP)", "Alternatives.");

test("parseCourseBlocks extracts code, title, prereqs, terms, description", () => {
  const courses = parseCourseBlocks(HTML);
  assert.equal(courses.length, 5);
  const intro = courses[0];
  assert.equal(intro.catalogCode, "1.001");
  assert.equal(intro.name, "Intro Thing");
  assert.equal(intro.undergrad, true);
  assert.equal(intro.description, "Basics of things & stuff.");
  assert.equal(courses[3].undergrad, false, "G-only course is not undergrad");
  assert.deepEqual(courses[1].prereqCodes, ["1.001"]);
});

test("parsePrereqExpr: or is a choice, and stacks, parens nest, commas resolve", () => {
  assert.equal(parsePrereqExpr("None", "9.9"), null);
  assert.deepEqual(parsePrereqExpr("1.001", "9.9"), { code: "1.001" });
  const or = parsePrereqExpr("1.001 or 1.002", "9.9");
  assert.equal(or.op, "or");
  const nested = parsePrereqExpr("1.001 or ( 1.002 and ( 1.003 or 1.004 ))", "9.9");
  assert.equal(nested.op, "or");
  assert.equal(nested.args[1].op, "and");
  assert.equal(nested.args[1].args[1].op, "or");
  // "a, b, or c" is an or-list; "a, b, and c" an and-list.
  assert.equal(parsePrereqExpr("1.001, 1.002, or 1.003", "9.9").op, "or");
  assert.equal(parsePrereqExpr("1.001, 1.002, and 1.003", "9.9").op, "and");
  // Self-references are ignored.
  assert.equal(parsePrereqExpr("9.9", "9.9"), null);
});

test("assignLevels: depth 0 -> 1000, alternatives take the cheapest path", () => {
  const courses = assignLevels(parseCourseBlocks(HTML));
  const byCode = new Map(courses.map((c) => [c.catalogCode, c]));
  assert.equal(byCode.get("1.001").level, 1000);
  assert.equal(byCode.get("1.002").level, 2000);
  assert.equal(byCode.get("1.003").level, 3000);
  // 1.004 can be entered via 1.001 (depth 0), so it is 2000, not 3000+.
  assert.equal(byCode.get("1.004").level, 2000);
  assert.ok(byCode.get("1.001").levelBasis.includes("no subject prerequisites"));
});

test("assignLevels: cycles do not inflate depth, GIR-only prereqs flag a tie-break", () => {
  const cyc = assignLevels(
    parseCourseBlocks(
      BLOCK("2.001", "A", "2.002", "U (Fall)", "x") + BLOCK("2.002", "B", "2.001", "U (Fall)", "x")
    )
  );
  cyc.forEach((c) => assert.ok([1000, 2000, 3000].includes(c.level)));
  const gir = assignLevels(
    parseCourseBlocks(BLOCK("3.001", "C", "Calculus II (GIR)", "U (Fall)", "x"))
  );
  assert.equal(gir[0].levelTieBreak, true, "non-code prereq text needs human/LLM confirmation");
});

test("stripTags and decodeEntities clean catalog and posting HTML", () => {
  assert.equal(stripTags("<p>a &amp; b</p>"), "a & b");
  assert.equal(decodeEntities("&lt;h1&gt;"), "<h1>");
});

// ---------- posting filtering ----------

test("filterGreenhouse keeps only intern-titled jobs and cleans escaped HTML", () => {
  const { totalJobs, postings } = filterGreenhouse({
    jobs: [
      { title: "Software Engineer", absolute_url: "u1", content: "x" },
      {
        title: "Software Engineering Intern",
        absolute_url: "u2",
        location: { name: "NYC" },
        content: "&lt;p&gt;Build &amp; ship&lt;/p&gt;",
      },
      { title: "Data Science Co-op", absolute_url: "u3", content: "y" },
    ],
  });
  assert.equal(totalJobs, 3);
  assert.equal(postings.length, 2);
  assert.equal(postings[0].content, "Build & ship");
});

test("filterLever handles empty arrays (bad slugs) without throwing", () => {
  const { totalJobs, postings } = filterLever([]);
  assert.equal(totalJobs, 0);
  assert.equal(postings.length, 0);
});

test("cleanContent truncates runaway descriptions", () => {
  assert.ok(cleanContent("x".repeat(10000)).length <= 4000);
});

// ---------- O*NET TSV parsing ----------

test("parseTsv maps rows by header", () => {
  const rows = parseTsv("A\tB\n1\t2\n3\t4");
  assert.deepEqual(rows, [
    { A: "1", B: "2" },
    { A: "3", B: "4" },
  ]);
});

// ---------- validation gates ----------

function validDataset() {
  const ev = [{ type: "test", retrievedAt: "2026-07-09T00:00:00Z" }];
  const posting = (co) => ({ type: "posting", company: co, retrievedAt: "2026-07-09T00:00:00Z" });
  const edge = { confidence: 0.9, matchedSkills: ["skill"], distinctive: true };
  return {
    meta: { flags: {} },
    careers: [
      { id: "a", name: "A", grounding: "soc", soc: ["1"], responsibilities: ["r"], skills: ["s"], evidence: ev },
      { id: "b", name: "B", grounding: "postings", responsibilities: ["r"], skills: ["s"], evidence: ev },
    ],
    courses: [
      { id: "c1", name: "C1", level: 1000, dept: "D", destinations: ["a"], edges: { a: edge }, evidence: ev },
      { id: "c2", name: "C2", level: 3000, dept: "D", destinations: ["b"], edges: { b: edge }, evidence: ev },
    ],
    internships: [
      {
        id: "i1", role: "R Intern", orgType: "Startup",
        destinations: ["a", "b"], edges: { a: edge, b: edge },
        evidence: [posting("x"), posting("y")],
      },
    ],
  };
}

test("validateDataset passes a well-formed dataset", () => {
  const r = validateDataset(validDataset());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test("validateDataset catches structural violations", () => {
  const ds = validDataset();
  ds.careers[0].skills = ["has an em dash — banned"];
  ds.courses[0].destinations = [];
  ds.courses[1].destinations = ["nope"];
  ds.internships[0].destinations = ["a"]; // now nothing reaches b at all
  const r = validateDataset(ds);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("em/en dash")));
  assert.ok(r.errors.some((e) => e.includes("no destinations")));
  assert.ok(r.errors.some((e) => e.includes("unknown career")));
  assert.ok(r.errors.some((e) => e.includes("orphan career b")));
});

test("validateDataset enforces per-kind confidence floors and distinctiveness", () => {
  const ds = validDataset();
  ds.internships[0].edges.a = { confidence: 0.6, matchedSkills: ["s"], distinctive: true };
  ds.courses[0].edges.a = { confidence: 0.9, matchedSkills: ["s"], distinctive: false };
  const r = validateDataset(ds);
  assert.ok(r.errors.some((e) => e.includes("below internship floor")));
  assert.ok(r.errors.some((e) => e.includes("distinctive")));
});

test("validateDataset distributional gates reject hub saturation", () => {
  const ds = validDataset();
  // Sixteen 1000-level courses all pointing at the same career: hub + saturation.
  const edge = { confidence: 0.9, matchedSkills: ["skill"], distinctive: true };
  const ev = [{ type: "test", retrievedAt: "2026-07-09T00:00:00Z" }];
  ds.courses = Array.from({ length: 16 }, (_, i) => ({
    id: `x${i}`, name: `X${i}`, level: 1000, dept: "D",
    destinations: ["a"], edges: { a: edge }, evidence: ev,
  }));
  const r = validateDataset(ds);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("hub career")));
  assert.ok(r.errors.some((e) => e.includes("Jaccard")));
  // ...but pilot mode skips distributional gates (still fails coverage of b? no: pilot skips those too)
  const pilotErrors = validateDataset(ds, { pilot: true }).errors;
  assert.ok(!pilotErrors.some((e) => e.includes("hub career")));
});

test("validateDataset requires internship coverage or an explicit starved flag", () => {
  const ds = validDataset();
  ds.internships[0].destinations = ["a"];
  delete ds.internships[0].edges.b;
  let r = validateDataset(ds);
  assert.ok(r.errors.some((e) => e.includes("zero internship support")));
  ds.meta.flags.internshipStarved = ["b"];
  r = validateDataset(ds);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("internship-starved")));
});

test("gini and jaccard behave", () => {
  assert.equal(gini([1, 1, 1, 1]), 0);
  assert.ok(gini([0, 0, 0, 10]) > 0.7);
  assert.equal(jaccard(["a", "b"], ["a", "b"]), 1);
  assert.equal(jaccard(["a"], ["b"]), 0);
});

// ---------- catalog generation ----------

test("generateCatalog emits an importable module in the app's shape", async () => {
  const src = generateCatalog(validDataset());
  const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  assert.equal(mod.CAREERS.length, 2);
  assert.deepEqual(Object.keys(mod.CAREERS[0]), ["id", "name", "responsibilities", "skills"]);
  assert.deepEqual(Object.keys(mod.COURSES[0]), ["id", "name", "level", "dept", "destinations"]);
  assert.deepEqual(Object.keys(mod.INTERNSHIPS[0]), ["id", "role", "orgType", "destinations"]);
  assert.ok(src.includes("O*NET"), "keeps the O*NET attribution");
  assert.ok(src.includes("not measured student outcomes"), "keeps the honesty banner");
});

test("generateCatalog rejects dashes and bad enums deterministically", () => {
  const withDash = validDataset();
  withDash.careers[0].responsibilities = ["design — build"];
  assert.throws(() => generateCatalog(withDash), /em\/en dash/);
  const badLevel = validDataset();
  badLevel.courses[0].level = 1500;
  assert.throws(() => generateCatalog(badLevel), /bad level/);
});

// ---------- dataset assembly ----------

test("assemble merges phase outputs and auto-flags internship-starved careers", async () => {
  const { assemble } = await import("../scripts/assemble-dataset.mjs");
  const edge = { confidence: 0.9, matchedSkills: ["s"], distinctive: true };
  const out = assemble({
    meta: { runId: "r1" },
    careerFiles: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    courseFiles: [{ dept: "D", courses: [{ id: "c1", name: "C1", level: 1000, dept: "D" }] }],
    internshipFiles: [{ orgType: "Startup", roles: [{ id: "i1", role: "R", orgType: "Startup" }] }],
    edgeFiles: [
      { id: "c1", destinations: ["a", "b"], edges: { a: edge, b: edge } },
      { id: "i1", destinations: ["a"], edges: { a: edge } },
    ],
  });
  assert.equal(out.courses[0].destinations.length, 2);
  assert.deepEqual(out.meta.flags.internshipStarved, ["b"], "b has no internship edge");
  assert.throws(
    () =>
      assemble({
        meta: {},
        careerFiles: [],
        courseFiles: [{ dept: "D", courses: [{ id: "cX" }] }],
        internshipFiles: [],
        edgeFiles: [],
      }),
    /no edge file/
  );
});

// ---------- industry flexibility: dataset-defined org types ----------

test("validator and generator accept custom org types declared in meta.orgTypes", async () => {
  const ds = validDataset();
  ds.meta.orgTypes = ["Hospital", "Startup"];
  ds.internships[0].orgType = "Hospital";
  const r = validateDataset(ds);
  assert.deepEqual(r.errors, []);
  const mod = await import(`data:text/javascript,${encodeURIComponent(generateCatalog(ds))}`);
  assert.equal(mod.INTERNSHIPS[0].orgType, "Hospital");

  ds.internships[0].orgType = "Nonprofit"; // not declared -> typo guard fires
  assert.ok(validateDataset(ds).errors.some((e) => e.includes("not in meta.orgTypes")));
  assert.throws(() => generateCatalog(ds), /not in meta.orgTypes/);
});
