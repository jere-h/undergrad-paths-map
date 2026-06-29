// Unit suite for the pure score.js reachability / heat module.
// Runs with `node --test` (no browser, no DOM required):
//
//   node --test
//
// Covers:
//   - allInputs flattens courses + internships with correct kind/group
//   - reach counts reinforcement across selected inputs and omits unreached
//   - reinforcementMax / heat normalise correctly (including the single-reach edge)
//   - heatColor is monotonic from cool to hot and clamps out-of-range input
//   - summarize reports open count and the most-reinforced career
//   - a data-integrity guard over the real bundled catalog

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  allInputs,
  reach,
  reinforcementMax,
  heat,
  heatColor,
  summarize,
} from "../score.js";
import * as catalog from "../data/catalog.js";

const { CAREERS, COURSES, INTERNSHIPS } = catalog;

function rgb(str) {
  const m = str.match(/rgb\((\d+), (\d+), (\d+)\)/);
  assert.ok(m, `not an rgb string: ${str}`);
  return { r: +m[1], g: +m[2], b: +m[3] };
}

test("allInputs flattens courses and internships with kind + group", () => {
  const inputs = allInputs(catalog);
  assert.equal(inputs.length, COURSES.length + INTERNSHIPS.length);

  const course = inputs.find((i) => i.id === "cs101");
  assert.equal(course.kind, "course");
  assert.equal(course.group, "Level 1000");

  const intern = inputs.find((i) => i.id === "mnc-swe");
  assert.equal(intern.kind, "internship");
  assert.equal(intern.group, "MNC");
});

test("reach counts reinforcement and omits unreached careers", () => {
  // cs101 reaches swe; mnc-swe reaches swe; st-founding-eng reaches swe.
  const map = reach(["cs101", "mnc-swe", "st-founding-eng"], catalog);
  assert.equal(map.get("swe"), 3);
  // backend is reached by cs101? no - cs101 has backend. mnc-swe has backend.
  assert.ok(map.get("backend") >= 2);
  // A career none of them reach is absent, not zero.
  assert.equal(map.has("biotech"), false);
});

test("empty selection reaches nothing", () => {
  const map = reach([], catalog);
  assert.equal(map.size, 0);
  assert.equal(reinforcementMax(map), 0);
});

test("reinforcementMax and heat normalise, including a single reach", () => {
  const map = reach(["cs101"], catalog);
  const max = reinforcementMax(map);
  assert.equal(max, 1);
  // With max 1 every reached career reads as fully open (heat 1), not 0.
  assert.equal(heat(1, 1), 1);
  // With a real spread, the top is 1 and the floor is 0.
  assert.equal(heat(3, 3), 1);
  assert.equal(heat(1, 3), 0);
  assert.ok(heat(2, 3) > 0 && heat(2, 3) < 1);
  // Unreached is always 0.
  assert.equal(heat(0, 5), 0);
});

test("heatColor is monotonic cool -> hot and clamps", () => {
  const cool = rgb(heatColor(0));
  const mid = rgb(heatColor(0.5));
  const hot = rgb(heatColor(1));
  // Red channel rises toward the warm end; blue falls.
  assert.ok(cool.r < mid.r && mid.r < hot.r);
  assert.ok(cool.b > mid.b && mid.b > hot.b);
  // Clamps without throwing or producing NaN.
  assert.deepEqual(rgb(heatColor(-2)), cool);
  assert.deepEqual(rgb(heatColor(9)), hot);
});

test("summarize reports open count and the strongest career", () => {
  const map = reach(["cs101", "mnc-swe", "st-founding-eng"], catalog);
  const { openCount, top } = summarize(map, CAREERS);
  assert.equal(openCount, map.size);
  assert.equal(top.id, "swe");
  assert.equal(top.count, 3);

  const empty = summarize(reach([], catalog), CAREERS);
  assert.equal(empty.openCount, 0);
  assert.equal(empty.top, null);
});

test("catalog integrity: ids unique and every destination resolves", () => {
  const careerIds = new Set(CAREERS.map((c) => c.id));
  assert.equal(careerIds.size, CAREERS.length, "duplicate career id");

  const inputIds = new Set();
  allInputs(catalog).forEach((input) => {
    assert.ok(input.id, "input missing id");
    assert.equal(inputIds.has(input.id), false, `duplicate input id ${input.id}`);
    inputIds.add(input.id);
    assert.ok(input.destinations.length > 0, `${input.id} has no destinations`);
    input.destinations.forEach((d) => {
      assert.ok(careerIds.has(d), `${input.id} points at unknown career ${d}`);
    });
  });

  // Every career is reachable by at least one input (no orphan path nodes).
  const reachable = new Set();
  allInputs(catalog).forEach((i) => i.destinations.forEach((d) => reachable.add(d)));
  CAREERS.forEach((c) => assert.ok(reachable.has(c.id), `orphan career ${c.id}`));

  // Course levels and org types are within the documented sets.
  COURSES.forEach((c) => assert.ok([1000, 2000, 3000].includes(c.level), `bad level ${c.id}`));
  INTERNSHIPS.forEach((i) =>
    assert.ok(["MNC", "Small Business", "Startup"].includes(i.orgType), `bad orgType ${i.id}`)
  );
});
