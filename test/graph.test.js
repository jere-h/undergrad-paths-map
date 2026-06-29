// Unit suite for the pure graph.js constellation layout.
// Runs with `node --test` (no browser, no DOM required).
//
// Covers:
//   - every node lands inside the canvas bounds
//   - career nodes cluster centrally; input nodes sit further out on the ring
//   - courses land on the left half, internships on the right half
//   - one edge per (input, destination) pair, all endpoints resolvable
//   - layout is deterministic (same input -> identical positions)

import { test } from "node:test";
import assert from "node:assert/strict";

import { layout } from "../graph.js";
import * as catalog from "../data/catalog.js";
import { allInputs, inputStrength } from "../score.js";

const SIZE = { width: 1000, height: 1000 };

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test("all nodes fall within the canvas", () => {
  const g = layout(catalog, SIZE);
  g.nodes.forEach((n) => {
    assert.ok(n.x >= 0 && n.x <= SIZE.width, `${n.id} x out of bounds`);
    assert.ok(n.y >= 0 && n.y <= SIZE.height, `${n.id} y out of bounds`);
  });
});

test("careers cluster centrally, inputs ring the outside", () => {
  const g = layout(catalog, SIZE);
  const c = g.center;
  const avgCareer =
    g.careerNodes.reduce((s, n) => s + dist(n, c), 0) / g.careerNodes.length;
  const avgInput =
    g.inputNodes.reduce((s, n) => s + dist(n, c), 0) / g.inputNodes.length;
  assert.ok(avgInput > avgCareer, "inputs should sit further from centre than careers");
});

test("courses sit on the left, internships on the right", () => {
  const g = layout(catalog, SIZE);
  const byId = new Map(g.inputNodes.map((n) => [n.id, n]));
  allInputs(catalog).forEach((input) => {
    const node = byId.get(input.id);
    assert.ok(node, `missing node for ${input.id}`);
    if (input.kind === "course") {
      assert.ok(node.x <= g.center.x + 1, `course ${input.id} not on the left`);
    } else {
      assert.ok(node.x >= g.center.x - 1, `internship ${input.id} not on the right`);
    }
  });
});

test("one edge per destination, endpoints resolvable", () => {
  const g = layout(catalog, SIZE);
  const expected = allInputs(catalog).reduce((s, i) => s + i.destinations.length, 0);
  assert.equal(g.edges.length, expected);

  const careerIds = new Set(g.careerNodes.map((n) => n.id));
  const inputIds = new Set(g.inputNodes.map((n) => n.id));
  g.edges.forEach((e) => {
    assert.ok(inputIds.has(e.from), `edge from unknown input ${e.from}`);
    assert.ok(careerIds.has(e.to), `edge to unknown career ${e.to}`);
  });
});

test("each edge carries its input's strength weight", () => {
  const g = layout(catalog, SIZE);
  const strengthById = new Map(allInputs(catalog).map((i) => [i.id, inputStrength(i)]));
  g.edges.forEach((e) => {
    assert.equal(e.weight, strengthById.get(e.from), `edge ${e.id} weight mismatch`);
  });
  // A Level 1000 course edge is weaker than a 3000 course / internship edge.
  const l1000 = g.edges.find((e) => e.from === "cs101");
  const l3000 = g.edges.find((e) => e.from === "ml301");
  const intern = g.edges.find((e) => e.from === "mnc-data");
  assert.ok(l1000.weight < l3000.weight);
  assert.ok(intern.weight >= l3000.weight);
});

test("layout is deterministic", () => {
  const a = layout(catalog, SIZE);
  const b = layout(catalog, SIZE);
  a.nodes.forEach((node, i) => {
    assert.equal(node.x, b.nodes[i].x);
    assert.equal(node.y, b.nodes[i].y);
  });
});
