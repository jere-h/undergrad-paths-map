// Unit suite for the pure score.js strength + convergence module.
// Runs with `node --test` (no browser, no DOM required):
//
//   node --test
//
// Covers:
//   - allInputs flattens courses + internships with correct kind/group
//   - inputStrength rises with course level and is highest for internships
//   - strengthWidth / strengthDash map weak links to thin dotted, strong to solid
//   - heatColor is monotonic cool -> hot and clamps
//   - reach counts plain reinforcement
//   - analyze: weighted support, convergence into specializations, fade of
//     marginal paths as the stack grows, and no fade on a single selection
//   - summarize reports reachable / specialization / fading figures
//   - a data-integrity guard over the real bundled catalog

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  allInputs,
  inputStrength,
  edgeStrength,
  strengthWidth,
  strengthDash,
  heatColor,
  reach,
  analyze,
  summarize,
} from "../score.js";
// Behavioral tests run against a frozen fixture so the bundled catalog can be
// regenerated from real evidence without invalidating them; the integrity
// guard at the bottom keeps running against whatever data/catalog.js ships.
import * as catalog from "./fixtures/catalog.js";
import * as liveCatalog from "../data/catalog.js";

const { CAREERS, COURSES, INTERNSHIPS } = catalog;

function rgb(str) {
  const m = str.match(/rgb\((\d+), (\d+), (\d+)\)/);
  assert.ok(m, `not an rgb string: ${str}`);
  return { r: +m[1], g: +m[2], b: +m[3] };
}

test("allInputs flattens courses and internships with kind + group", () => {
  const inputs = allInputs(catalog);
  assert.equal(inputs.length, COURSES.length + INTERNSHIPS.length);
  assert.equal(inputs.find((i) => i.id === "cs101").group, "Level 1000");
  assert.equal(inputs.find((i) => i.id === "mnc-swe").kind, "internship");
});

test("inputStrength rises with level and peaks for internships", () => {
  const byId = new Map(allInputs(catalog).map((i) => [i.id, i]));
  const l1000 = inputStrength(byId.get("cs101"));
  const l2000 = inputStrength(byId.get("ds201"));
  const l3000 = inputStrength(byId.get("ml301"));
  const intern = inputStrength(byId.get("mnc-swe"));
  assert.ok(l1000 < l2000 && l2000 < l3000, "course strength should rise with level");
  assert.ok(intern >= l3000, "internship should be at least as strong as a 3000 course");
});

test("edgeStrength dampens inferred edges, leaves direct edges at full strength", () => {
  const intern = { kind: "internship", destinations: ["a", "b"], inferred: new Set(["b"]) };
  assert.equal(edgeStrength(intern, "a"), 1.0, "direct edge at full internship strength");
  assert.ok(edgeStrength(intern, "b") < 1.0, "inferred edge dampened");
  assert.ok(edgeStrength(intern, "b") > 0, "still positive");
  // An inferred edge contributes less convergence support than a direct one.
  const cat = {
    CAREERS: [{ id: "a" }, { id: "b" }],
    COURSES: [],
    INTERNSHIPS: [{ id: "i", role: "R", orgType: "MNC", destinations: ["a", "b"], inferred: ["b"] }],
  };
  const an = analyze(["i"], cat);
  assert.ok(an.careers.get("a").support > an.careers.get("b").support, "direct beats inferred support");
});

test("strengthWidth/strengthDash: weak link thin+dotted, strong link thick+solid", () => {
  assert.ok(strengthWidth(0.2) < strengthWidth(0.9), "stronger link is thicker");
  assert.notEqual(strengthDash(0.2), "", "weak link is dotted");
  assert.equal(strengthDash(0.95), "", "strong link is solid");
});

test("heatColor is monotonic cool -> hot and clamps", () => {
  const cool = rgb(heatColor(0));
  const mid = rgb(heatColor(0.5));
  const hot = rgb(heatColor(1));
  assert.ok(cool.r < mid.r && mid.r < hot.r);
  assert.ok(cool.b > mid.b && mid.b > hot.b);
  assert.deepEqual(rgb(heatColor(-2)), cool);
  assert.deepEqual(rgb(heatColor(9)), hot);
});

test("reach counts plain reinforcement and omits unreached", () => {
  const map = reach(["cs101", "mnc-swe", "st-founding-eng"], catalog);
  assert.equal(map.get("swe"), 3);
  assert.equal(map.has("biotech"), false);
});

test("analyze: a single Level 1000 course opens fields weakly, none fading", () => {
  const a = analyze(["cs101"], catalog);
  assert.equal(a.selectedCount, 1);
  // cs101 reaches 5 fields, all present, none faded (no contrast with one pick).
  assert.equal(a.careers.size, 5);
  a.careers.forEach((info) => {
    assert.equal(info.faded, false);
    assert.notEqual(info.tier, "fading");
    // weak absolute strength: a lone 1000 course is not yet a specialization.
    assert.ok(info.strength < 0.6, "a single weak course should not specialise");
  });
});

test("analyze: overlapping stack converges and fades marginal paths", () => {
  // Heavy data-leaning, overlapping stack.
  const a = analyze(["cs101", "stats101", "ml301", "mnc-data"], catalog);

  // data-scientist is reached by all four -> highest support, a specialization.
  const ds = a.careers.get("data-scientist");
  assert.ok(ds.support > 2, "data-scientist should accumulate strong support");
  assert.equal(ds.tier, "specialization");
  assert.equal(ds.faded, false);

  // A career touched by only one stray weak pick (e.g. founder via cs101 only)
  // falls behind and fades.
  const founder = a.careers.get("founder");
  assert.ok(founder, "founder is still reachable");
  assert.equal(founder.faded, true);
  assert.equal(founder.tier, "fading");

  // Convergence is real: at least one specialization, at least one fading.
  let specs = 0;
  let fading = 0;
  a.careers.forEach((info) => {
    if (info.tier === "specialization") specs += 1;
    if (info.tier === "fading") fading += 1;
  });
  assert.ok(specs >= 1, "expected at least one specialization");
  assert.ok(fading >= 1, "expected at least one fading path");
});

test("analyze: adding an overlapping qualification sharpens contrast", () => {
  const before = analyze(["cs101", "stats101"], catalog);
  const after = analyze(["cs101", "stats101", "mnc-data", "ml301"], catalog);
  // The strongest path's lead over a marginal one should not shrink as the
  // overlapping stack grows.
  const leadBefore = before.gamma;
  const leadAfter = after.gamma;
  assert.ok(leadAfter > leadBefore, "contrast (gamma) should grow with the stack");
});

test("summarize reports reachable, specialization and fading counts", () => {
  const a = analyze(["cs101", "stats101", "ml301", "mnc-data"], catalog);
  const s = summarize(a, CAREERS);
  assert.equal(s.open, a.careers.size);
  assert.ok(s.specializations.length >= 1);
  assert.ok(s.fadingCount >= 1);
  assert.ok(s.top && s.top.support > 0);

  const empty = summarize(analyze([], catalog), CAREERS);
  assert.equal(empty.open, 0);
  assert.equal(empty.specializations.length, 0);
  assert.equal(empty.top, null);
});

test("catalog integrity: ids unique and every destination resolves", () => {
  const { CAREERS, COURSES, INTERNSHIPS } = liveCatalog;
  const careerIds = new Set(CAREERS.map((c) => c.id));
  assert.equal(careerIds.size, CAREERS.length, "duplicate career id");

  const inputIds = new Set();
  allInputs(liveCatalog).forEach((input) => {
    assert.ok(input.id, "input missing id");
    assert.equal(inputIds.has(input.id), false, `duplicate input id ${input.id}`);
    inputIds.add(input.id);
    assert.ok(input.destinations.length > 0, `${input.id} has no destinations`);
    input.destinations.forEach((d) =>
      assert.ok(careerIds.has(d), `${input.id} points at unknown career ${d}`)
    );
  });

  const reachable = new Set();
  allInputs(liveCatalog).forEach((i) => i.destinations.forEach((d) => reachable.add(d)));
  CAREERS.forEach((c) => assert.ok(reachable.has(c.id), `orphan career ${c.id}`));

  // Every career carries non-empty end-goal content, free of em/en dashes.
  CAREERS.forEach((c) => {
    assert.ok(Array.isArray(c.responsibilities) && c.responsibilities.length > 0, `${c.id} missing responsibilities`);
    assert.ok(Array.isArray(c.skills) && c.skills.length > 0, `${c.id} missing skills`);
    [...c.responsibilities, ...c.skills].forEach((text) => {
      assert.equal(typeof text, "string");
      assert.ok(text.trim().length > 0, `${c.id} has an empty point`);
      assert.ok(!/[—–]/.test(text), `${c.id} content has an em/en dash: "${text}"`);
    });
  });

  COURSES.forEach((c) => assert.ok([1000, 2000, 3000].includes(c.level), `bad level ${c.id}`));
  // Org types are dataset-defined (the sidebar renders whatever ships); the
  // guard is that each is a real label, not a fixed taxonomy.
  INTERNSHIPS.forEach((i) =>
    assert.ok(typeof i.orgType === "string" && i.orgType.trim().length > 0, `bad orgType ${i.id}`)
  );
});
