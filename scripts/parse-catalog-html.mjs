#!/usr/bin/env node
// parse-catalog-html.mjs - deterministic parser for university catalog pages
// built on the common "courseblock" markup (catalog.mit.edu and other
// CourseLeaf-hosted catalogs). LLM agents must never enumerate these pages
// directly (a single department page is ~600 KB / ~430 courses); they curl the
// HTML to disk and run this script, then only reason over the parsed JSON.
//
// Usage:
//   node scripts/parse-catalog-html.mjs <page.html> [--dept "EECS"] [--source-url URL]
//
// Emits JSON to stdout:
//   { dept, sourceUrl, parsedCount, undergradCount, courses: [{
//       catalogCode, name, prereqText, prereqCodes, terms, units,
//       undergrad, description, level, levelBasis, levelTieBreak }] }
//
// Level mapping is DETERMINISTIC (see docs/grounding-workflow-plan.md):
// prerequisite chain depth within the parsed set decides the 1000/2000/3000
// bucket the app renders, and the basis is recorded per course so a human can
// audit every assignment. Courses whose evidence is ambiguous are flagged
// levelTieBreak: true for LLM tie-breaking plus review-report listing.

import { readFileSync } from "node:fs";

export function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function grab(block, cls) {
  // Matches <span class="courseblockprereq">...</span> or <p class="courseblockdesc">...</p>
  const m = block.match(
    new RegExp(`class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</(?:span|p|h4|div)>`, "i")
  );
  return m ? stripTags(m[1]) : "";
}

// Course codes like 6.100A, 18.06, 6.C35 inside prereq text.
const CODE_RE = /\b\d+\.[0-9A-Z]+\b/g;

// Catalog prereq text is a boolean expression over subject codes, e.g.
// "6.1000 or ( 6.100A and ( 6.100B or 16.C20[J] ))". Alternatives must be a
// choice (min depth), requirements a stack (max depth), or "a or b" doubles a
// course's apparent depth. This parses the expression into a small AST:
//   { code } | { op: "and"|"or", args: [...] }
// Commas are soft separators: "a, b, or c" is an or-list, "a, b, and c" an
// and-list; a comma with no trailing conjunction at its paren depth means and.
export function parsePrereqExpr(prereqText, selfCode) {
  const tokens = [];
  const re = /\b\d+\.[0-9A-Z]+\b|\band\b|\bor\b|[(),;]/gi;
  let m;
  while ((m = re.exec(prereqText))) {
    const t = m[0].toLowerCase();
    if (t === "and" || t === "or" || t === "(" || t === ")") tokens.push(t);
    else if (t === "," || t === ";") tokens.push(",");
    else if (m[0] !== selfCode) tokens.push({ code: m[0] });
  }
  // Resolve each comma to the next explicit conjunction at the same depth.
  let depth = 0;
  const depthAt = tokens.map((t) => {
    if (t === "(") return depth++;
    if (t === ")") return --depth;
    return depth;
  });
  tokens.forEach((t, i) => {
    if (t !== ",") return;
    let resolved = "and";
    for (let j = i + 1; j < tokens.length; j++) {
      if (depthAt[j] < depthAt[i]) break;
      if (depthAt[j] === depthAt[i] && (tokens[j] === "and" || tokens[j] === "or")) {
        resolved = tokens[j];
        break;
      }
    }
    tokens[i] = resolved;
  });
  // ", or" / ", and" leaves back-to-back conjunctions once the comma resolves;
  // collapse runs so the parser sees a single separator.
  const isConj = (t) => t === "and" || t === "or";
  const collapsed = tokens.filter((t, i) => !(isConj(t) && isConj(tokens[i - 1])));
  tokens.length = 0;
  tokens.push(...collapsed);

  let pos = 0;
  function atom() {
    const t = tokens[pos];
    if (t === "(") {
      pos++;
      const e = orExpr();
      if (tokens[pos] === ")") pos++;
      return e;
    }
    if (t && t.code) {
      pos++;
      return t;
    }
    pos++; // stray token: skip
    return null;
  }
  function andExpr() {
    const args = [];
    let a = atom();
    if (a) args.push(a);
    while (tokens[pos] === "and") {
      pos++;
      const b = atom();
      if (b) args.push(b);
    }
    if (args.length === 0) return null;
    return args.length === 1 ? args[0] : { op: "and", args };
  }
  function orExpr() {
    const args = [];
    let a = andExpr();
    if (a) args.push(a);
    while (tokens[pos] === "or") {
      pos++;
      const b = andExpr();
      if (b) args.push(b);
    }
    if (args.length === 0) return null;
    return args.length === 1 ? args[0] : { op: "or", args };
  }
  let expr = orExpr();
  while (pos < tokens.length && expr !== null) {
    // Leftover tokens (unbalanced parens etc.): fold the rest conservatively
    // as additional requirements.
    const rest = orExpr();
    if (rest) expr = { op: "and", args: [expr, rest] };
    else pos++;
  }
  return expr; // null when no subject codes appear
}

export function parseCourseBlocks(html) {
  const blocks = html.split(/<div class="courseblock">/).slice(1);
  const courses = [];
  for (const raw of blocks) {
    const block = raw.split(/<div class="courseblock(?:cluster)?"/)[0];
    const title = grab(block, "courseblocktitle");
    if (!title) continue;
    const tm = title.match(/^(\S+)\s+(.*)$/);
    if (!tm) continue;
    const [, catalogCode, name] = tm;
    const prereqText = grab(block, "courseblockprereq").replace(/^Prereq:\s*/i, "");
    const terms = grab(block, "courseblockterms");
    const units = grab(block, "courseblockhours");
    const description = grab(block, "courseblockdesc");
    const prereqCodes = [...new Set(prereqText.match(CODE_RE) || [])].filter(
      (c) => c !== catalogCode
    );
    const prereqExpr = parsePrereqExpr(prereqText, catalogCode);
    // Terms lines look like "U (Fall, Spring)" / "G (Spring)" / "U (IAP)".
    const undergrad = /(^|[^A-Za-z])U\s*\(/.test(terms);
    courses.push({
      catalogCode,
      name: name.trim(),
      prereqText,
      prereqCodes,
      prereqExpr,
      terms,
      units,
      undergrad,
      description,
    });
  }
  return courses;
}

// Deterministic level from prerequisite chain depth within the parsed set.
// depth 0 (no subject prereqs)        -> 1000
// depth 1 (prereqs are themselves 1000-ish) -> 2000
// depth >= 2                          -> 3000
// Codes not present in the parsed set count as one level of depth (they are
// real subjects from another department, so the course is not introductory).
export function assignLevels(courses) {
  const byCode = new Map(courses.map((c) => [c.catalogCode, c]));
  const depthMemo = new Map();
  function depth(code, seen) {
    if (depthMemo.has(code)) return depthMemo.get(code);
    if (seen.has(code)) return 0; // cycle guard: don't let cycles inflate depth
    seen.add(code);
    const course = byCode.get(code);
    let d;
    if (!course) {
      d = 1; // external subject: counts as one level, terminates recursion
    } else if (!course.prereqExpr) {
      d = 0;
    } else {
      // Requirements stack (and -> max); alternatives are a choice (or -> min).
      const evalExpr = (e) => {
        if (e.code) return depth(e.code, seen);
        const vals = e.args.map(evalExpr);
        return e.op === "and" ? Math.max(...vals) : Math.min(...vals);
      };
      d = 1 + evalExpr(course.prereqExpr);
    }
    seen.delete(code);
    depthMemo.set(code, d);
    return d;
  }
  for (const c of courses) {
    const d = depth(c.catalogCode, new Set());
    c.level = d === 0 ? 1000 : d === 1 ? 2000 : 3000;
    c.levelBasis =
      d === 0
        ? "no subject prerequisites"
        : `prerequisite chain depth ${d} (${c.prereqCodes.join(", ")})`;
    // Ambiguous evidence a human/LLM should confirm: no prereq codes parsed
    // but the prereq text is non-trivial (e.g. "permission of instructor",
    // GIR names) - the depth rule saw nothing to climb.
    c.levelTieBreak =
      c.prereqCodes.length === 0 && c.prereqText !== "" && !/^none\b/i.test(c.prereqText);
  }
  return courses;
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: parse-catalog-html.mjs <page.html> [--dept NAME] [--source-url URL]");
    process.exit(2);
  }
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : "";
  };
  const courses = assignLevels(parseCourseBlocks(readFileSync(file, "utf8")));
  const undergrad = courses.filter((c) => c.undergrad);
  process.stdout.write(
    JSON.stringify(
      {
        dept: opt("--dept"),
        sourceUrl: opt("--source-url"),
        parsedCount: courses.length,
        undergradCount: undergrad.length,
        courses: undergrad,
      },
      null,
      2
    )
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
