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

test("validateDataset warns (not fails) on lopsided support; fails only on zero total support", () => {
  const ds = validDataset();
  // b now has course support (c2) but no internship: reachable, so a warning.
  ds.internships[0].destinations = ["a"];
  delete ds.internships[0].edges.b;
  let r = validateDataset(ds);
  assert.equal(r.ok, true, "course-only career is reachable, not a failure");
  assert.ok(r.warnings.some((w) => w.includes("course-only")));

  // A career reachable only by an internship (no course) also just warns.
  const ds2 = validDataset();
  ds2.courses[1].destinations = ["a"]; // c2 no longer reaches b
  ds2.courses[1].edges = { a: ds2.courses[1].edges.b };
  r = validateDataset(ds2);
  assert.ok(r.warnings.some((w) => w.includes("internship-only")));
  assert.ok(!r.errors.some((e) => e.includes("orphan")), "b still reached by internship i1");

  // Remove ALL support for b -> orphan failure (the assembler should have
  // dropped it into unsupportedCareers before validation).
  const ds3 = validDataset();
  ds3.courses[1].destinations = ["a"];
  ds3.courses[1].edges = { a: ds3.courses[1].edges.b };
  ds3.internships[0].destinations = ["a"];
  delete ds3.internships[0].edges.b;
  r = validateDataset(ds3);
  assert.ok(r.errors.some((e) => e.includes("orphan career b")));
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

// ---------- dataset assembly: mechanical edge policy ----------

test("resolveEdges applies floors, auto-accept, fail-closed band, and top-K in code", async () => {
  const { resolveEdges } = await import("../scripts/assemble-dataset.mjs");
  const prop = (career, confidence, extra = {}) => ({
    career, confidence, matchedSkills: ["s"], distinctive: true, ...extra,
  });
  const course = { id: "c1", level: 1000 };
  const verdicts = new Map([["c1|kept-band", "keep"], ["c1|dropped-band", "drop"]]);
  const resolved = resolveEdges(
    course,
    [
      prop("auto", 0.9), // >= AUTO_ACCEPT: kept without any verdict
      prop("kept-band", 0.7), // banded + explicit keep verdict: kept
      prop("dropped-band", 0.7), // banded + drop verdict: dropped
      prop("unreviewed-band", 0.7), // banded, no verdict: FAIL-CLOSED drop
      prop("below-floor", 0.45), // under the 1000-level floor (0.5)
      prop("generic", 0.9, { distinctive: false }), // no distinctive match
    ],
    verdicts
  );
  assert.deepEqual(resolved.map((e) => e.career), ["auto", "kept-band"]);

  // top-K: a 3000-level course keeps only its best 3 even if all auto-accept.
  const many = Array.from({ length: 6 }, (_, i) => prop(`x${i}`, 0.86 + i / 100));
  assert.equal(resolveEdges({ id: "c2", level: 3000 }, many, new Map()).length, 3);
  // internships use their own floor: 0.8 is above 3000's floor but banded for internships.
  assert.equal(resolveEdges({ id: "i1", orgType: "Startup" }, [prop("a", 0.8)], new Map()).length, 0);
});

test("balanceInDegree trims a hub's weakest edges until the gates hold, never fabricates", async () => {
  const { balanceInDegree } = await import("../scripts/assemble-dataset.mjs");
  // 20 courses each pointing at hub "H" (strong) plus a distinct minor career.
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    edges: [
      { career: "H", confidence: 0.5 + i / 100 },
      { career: `m${i % 4}`, confidence: 0.9 },
    ],
  }));
  const trimmed = balanceInDegree(rows);
  assert.ok(trimmed > 0, "should trim the hub");
  const indeg = {};
  let total = 0;
  for (const r of rows) for (const e of r.edges) { indeg[e.career] = (indeg[e.career] || 0) + 1; total++; }
  assert.ok(indeg.H / total <= 0.25 + 1e-9, `hub share ${indeg.H}/${total} within cap`);
  // trimmed edges are the hub's LOWEST-confidence ones: survivors are the high end.
  const survivingH = rows.flatMap((r) => r.edges).filter((e) => e.career === "H").map((e) => e.confidence);
  assert.ok(Math.min(...survivingH) >= 0.5, "kept the stronger hub edges");
  // no input was emptied by balancing (each still has its minor-career edge).
  assert.ok(rows.every((r) => r.edges.length >= 1));
});

test("assemble balances hubs and drops zero-support careers into a flag", async () => {
  const { assemble } = await import("../scripts/assemble-dataset.mjs");
  const prop = (career, confidence) => ({ career, confidence, matchedSkills: ["s"], distinctive: true });
  // 18 courses, each reaching hub "big" plus one of four minor careers (a
  // realistic multi-destination shape the balancer can rebalance); career
  // "ghost" is proposed nowhere valid.
  const minors = ["small", "m1", "m2", "m3"];
  const courses = Array.from({ length: 18 }, (_, i) => ({
    id: `c${i}`, name: `C${i}`, level: 3000, dept: "D",
  }));
  const judge = { proposals: {} };
  courses.forEach((c, i) => {
    judge.proposals[c.id] = [prop("big", 0.86 + i / 1000), prop(minors[i % 4], 0.9)];
  });
  const out = assemble({
    meta: { runId: "r" },
    careerFiles: [
      { id: "big", name: "Big" },
      ...minors.map((m) => ({ id: m, name: m })),
      { id: "ghost", name: "Ghost" },
    ],
    distinctive: null,
    courseFiles: [{ dept: "D", courses }],
    internshipFiles: [],
    judgeFiles: [judge],
    verdictFiles: [],
  });
  assert.ok(out.meta.flags.edgesTrimmedForBalance > 0, "hub was trimmed");
  assert.deepEqual(out.meta.flags.unsupportedCareers, ["ghost"], "unreachable career dropped to a flag");
  assert.ok(!out.careers.find((c) => c.id === "ghost"), "ghost removed from careers");
  assert.ok(out.careers.find((c) => c.id === "small"), "small (reachable) kept");
  const bigDeg = out.courses.filter((c) => c.destinations.includes("big")).length;
  assert.ok(bigDeg / out.courses.reduce((s, c) => s + c.destinations.length, 0) <= 0.25 + 1e-9);
});

test("propagateAdjacency infers scope-overlap edges, dampened, capped, non-shadowing, non-chaining", async () => {
  const { propagateAdjacency } = await import("../scripts/assemble-dataset.mjs");
  const rows = [
    // input directly opens data-scientist strongly and data-analyst weakly.
    {
      id: "ds-intern",
      edges: [{ career: "data-scientist", confidence: 0.9, matchedSkills: ["x"], distinctive: true }],
    },
    // input already directly reaches data-analyst; inference must not shadow it.
    {
      id: "sql-course",
      edges: [{ career: "data-analyst", confidence: 0.8, matchedSkills: ["sql"], distinctive: true }],
    },
  ];
  const adjacency = {
    pairs: [
      { from: "data-scientist", to: "data-analyst", weight: 0.8, rationale: "overlapping analytics scope" },
      { from: "data-scientist", to: "founder", weight: 0.2 }, // below minWeight, ignored
      { from: "data-analyst", to: "data-scientist", weight: 0.5 }, // would chain, but only from direct
    ],
  };
  const added = propagateAdjacency(rows, adjacency);
  assert.equal(added, 1, "one inferred edge added (DS -> DA)");
  const daEdge = rows[0].edges.find((e) => e.career === "data-analyst");
  assert.ok(daEdge && daEdge.inferred, "DS input now infers data-analyst");
  assert.equal(daEdge.via, "data-scientist");
  assert.ok(Math.abs(daEdge.confidence - 0.9 * 0.8 * 0.85) < 1e-6, "dampened by weight * damping");
  assert.ok(!rows[0].edges.some((e) => e.career === "founder"), "sub-threshold adjacency skipped");
  // sql-course directly reaches data-analyst; no inferred data-scientist should
  // be added off the inferred DA (no chaining) and the direct DA is untouched.
  assert.ok(!rows[1].edges.some((e) => e.inferred), "no chaining off non-direct edges");
});

test("assemble surfaces inferred edges, softer, and flags inference-only careers", async () => {
  const { assemble } = await import("../scripts/assemble-dataset.mjs");
  const prop = (career, confidence) => ({ career, confidence, matchedSkills: ["s"], distinctive: true });
  const out = assemble({
    meta: { runId: "r", pilot: true }, // pilot: skip balancing so we test inference in isolation
    careerFiles: [{ id: "ds", name: "DS" }, { id: "da", name: "DA" }],
    distinctive: null,
    adjacency: { pairs: [{ from: "ds", to: "da", weight: 0.8, rationale: "overlap" }] },
    courseFiles: [{ dept: "D", courses: [{ id: "c1", name: "C1", level: 3000, dept: "D" }] }],
    internshipFiles: [],
    judgeFiles: [{ proposals: { c1: [prop("ds", 0.9)] } }],
    verdictFiles: [],
  });
  const c1 = out.courses.find((c) => c.id === "c1");
  assert.deepEqual(c1.destinations.sort(), ["da", "ds"], "inferred da added alongside direct ds");
  assert.deepEqual(c1.inferred, ["da"], "da marked inferred for the generator");
  assert.ok(c1.edges.da.inferred && c1.edges.da.via === "ds");
  assert.equal(out.meta.flags.inferredEdges, 1);
  assert.deepEqual(out.meta.flags.inferenceOnlyCareers, ["da"], "da is reachable only via inference");
  assert.ok(out.careers.find((c) => c.id === "da"), "da rescued into the map by inference");
});

test("findGaps flags inputs below their level's expected breadth and dead-end careers", async () => {
  const { findGaps } = await import("../scripts/report-gaps.mjs");
  const gaps = findGaps({
    careers: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    courses: [
      { id: "intro", name: "Intro", level: 1000, taughtSkills: ["x"], destinations: ["a"] }, // 1000 expects 3
      { id: "deep", name: "Deep", level: 3000, destinations: ["a", "b"] }, // meets 3000's 2
    ],
    internships: [{ id: "i1", role: "R", destinations: ["a", "b", "c"] }],
  });
  assert.deepEqual(gaps.sparseInputs.map((s) => s.id), ["intro"]);
  assert.equal(gaps.sparseInputs[0].expected, 3);
  // b and c each have 2 supporters (< 3) -> sparse careers; a has 3.
  assert.deepEqual(gaps.sparseCareers.map((s) => s.id).sort(), ["b", "c"]);
});

test("mergeJudgedEdges caps per input, floors, dedupes, and skips unknown careers", async () => {
  const { mergeJudgedEdges } = await import("../scripts/assemble-dataset.mjs");
  const rows = [
    { input: { id: "c1" }, edges: [{ career: "a", confidence: 0.9, matchedSkills: ["s"], distinctive: true }] },
  ];
  const careerIds = new Set(["a", "b", "c", "d"]);
  const added = mergeJudgedEdges(rows, [{
    judged: [
      { input: "c1", career: "a", confidence: 0.6, rationale: "dup" }, // already direct -> skipped
      { input: "c1", career: "b", confidence: 0.6, rationale: "real overlap" },
      { input: "c1", career: "c", confidence: 0.5, rationale: "real overlap 2" },
      { input: "c1", career: "d", confidence: 0.7, rationale: "over cap" }, // 3rd addition -> capped
      { input: "c1", career: "d", confidence: 0.3, rationale: "below floor" },
      { input: "cX", career: "b", confidence: 0.6, rationale: "unknown input" },
      { input: "c1", career: "zz", confidence: 0.6, rationale: "unknown career" },
    ],
  }], careerIds);
  assert.equal(added, 2, "cap of 2 judged edges per input");
  const judged = rows[0].edges.filter((e) => e.judged);
  assert.deepEqual(judged.map((e) => e.career), ["b", "c"]);
  assert.ok(judged.every((e) => e.inferred && e.rationale));
});

test("assemble merges gap-review judged edges; adjacency never duplicates them; validator accepts them", async () => {
  const { assemble } = await import("../scripts/assemble-dataset.mjs");
  const prop = (career, confidence) => ({ career, confidence, matchedSkills: ["s"], distinctive: true });
  const out = assemble({
    meta: { runId: "r", pilot: true },
    careerFiles: [{ id: "ds", name: "DS" }, { id: "da", name: "DA" }],
    distinctive: null,
    // adjacency would also propose ds->da; the judged edge must win, not duplicate.
    adjacency: { pairs: [{ from: "ds", to: "da", weight: 0.8, rationale: "overlap" }] },
    gapFiles: [{ judged: [{ input: "c1", career: "da", confidence: 0.55, rationale: "intro stats serves analyst work" }] }],
    courseFiles: [{ dept: "D", courses: [{ id: "c1", name: "C1", level: 1000, dept: "D" }] }],
    internshipFiles: [],
    judgeFiles: [{ proposals: { c1: [prop("ds", 0.9)] } }],
    verdictFiles: [],
  });
  const c1 = out.courses.find((c) => c.id === "c1");
  assert.deepEqual(c1.destinations.sort(), ["da", "ds"]);
  assert.equal(c1.destinations.filter((d) => d === "da").length, 1, "no duplicate da edge");
  assert.ok(c1.edges.da.judged && c1.edges.da.rationale, "judged edge won over adjacency");
  assert.equal(out.meta.flags.judgedEdges, 1);
  // Validator accepts a judged edge (rationale, no via) but rejects one without rationale.
  const ds = {
    meta: { flags: out.meta.flags },
    careers: out.careers.map((c) => ({ ...c, grounding: "postings", responsibilities: ["r"], skills: ["s"], evidence: [{ type: "t", retrievedAt: "x" }] })),
    courses: out.courses.map((c) => ({ ...c, evidence: [{ type: "t", retrievedAt: "x" }] })),
    internships: [{ id: "i1", role: "R", orgType: "Startup", destinations: ["ds", "da"], edges: { ds: prop("ds", 0.9), da: prop("da", 0.9) }, evidence: [{ type: "posting", company: "x", retrievedAt: "x" }, { type: "posting", company: "y", retrievedAt: "x" }] }],
  };
  let r = validateDataset(ds, { pilot: true });
  assert.deepEqual(r.errors, []);
  ds.courses[0].edges.da = { confidence: 0.55, inferred: true, judged: true };
  r = validateDataset(ds, { pilot: true });
  assert.ok(r.errors.some((e) => e.includes("judged edge missing rationale")));
});

test("assemble merges judge+verdict files, drops zero-edge inputs visibly, flags starved careers", async () => {
  const { assemble } = await import("../scripts/assemble-dataset.mjs");
  const prop = (career, confidence) => ({ career, confidence, matchedSkills: ["s"], distinctive: true });
  const out = assemble({
    meta: { runId: "r1" },
    careerFiles: [
      { id: "a", name: "A", rawSkillPool: ["x"] },
      { id: "b", name: "B" },
    ],
    distinctive: { distinctiveSkills: { a: ["x"] }, collisions: ["a b"] },
    courseFiles: [
      {
        dept: "D",
        courses: [
          { id: "c1", name: "C1", level: 1000, dept: "D" },
          { id: "c2", name: "C2", level: 1000, dept: "D" },
        ],
      },
    ],
    internshipFiles: [{ orgType: "Startup", roles: [{ id: "i1", role: "R", orgType: "Startup" }] }],
    judgeFiles: [
      { proposals: { c1: [prop("a", 0.9), prop("b", 0.7)], c2: [prop("a", 0.6)] } }, // batch format
      { id: "i1", proposed: [prop("a", 0.9)] }, // legacy per-input format
    ],
    verdictFiles: [{ verdicts: [{ input: "c1", career: "b", verdict: "keep", reason: "r" }] }],
  });
  assert.deepEqual(out.courses[0].destinations, ["a", "b"], "auto + verdict-kept edges survive");
  assert.deepEqual(out.meta.flags.droppedInputs, ["c2"], "unreviewed banded edge fails closed");
  assert.deepEqual(out.careers[0].distinctiveSkills, ["x"], "distinctive file merged, not edited in place");
  assert.deepEqual(out.meta.flags.socCollisions, ["a b"]);
  assert.deepEqual(out.meta.flags.internshipStarved, ["b"]);
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

// ---------- catalog registry ----------

test("register-catalog upsert replaces by id and renders importable JS", async () => {
  const { upsert, renderRegistry } = await import("../scripts/register-catalog.mjs");
  const base = [{ id: "illustrative", label: "Demo", module: "../catalog.js", note: "n1" }];
  const added = upsert(base, { id: "health", label: "Health", module: "./health.js", note: "n2" });
  assert.equal(added.length, 2);
  const replaced = upsert(added, { id: "health", label: "Health v2", module: "./health.js", note: "n3" });
  assert.equal(replaced.length, 2);
  assert.equal(replaced[1].label, "Health v2");
  const mod = await import(`data:text/javascript,${encodeURIComponent(renderRegistry(replaced))}`);
  assert.deepEqual(mod.CATALOGS.map((c) => c.id), ["illustrative", "health"]);
});
