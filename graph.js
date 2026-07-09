// graph.js
// Pure, DOM-free layout for the constellation map. Given the catalog and a
// square canvas size, it returns stable node positions and the edges between
// inputs and careers. Deterministic: positions are a function of the data and
// canvas only (no Math.random), so the map never reshuffles between loads and
// the layout is unit-testable in Node.
//
// Geometry: career nodes sit in an organic central cluster (a phyllotaxis /
// sunflower spiral for even, non-gridded spread). Input nodes ring the
// outside - courses on the left arc grouped by level, internships on the right
// arc grouped by org type - so selecting a perimeter input draws a line inward
// to the careers it opens.

import { allInputs, edgeStrength } from "./score.js";

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.39996 rad

function polar(cx, cy, radius, angle) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

// Place career nodes on a sunflower spiral centred in the canvas. Index 0 is
// near the centre; later indices spiral outward, filling the disc evenly.
function layoutCareers(careers, cx, cy, maxRadius) {
  const n = careers.length;
  return careers.map((career, i) => {
    // sqrt keeps the areal density uniform; the 0.5 offset avoids a node dead
    // centre and a hard outer edge.
    const t = n <= 1 ? 0 : Math.sqrt((i + 0.5) / n);
    const radius = t * maxRadius;
    const angle = i * GOLDEN_ANGLE;
    const p = polar(cx, cy, radius, angle);
    return { id: career.id, kind: "career", label: career.name, x: p.x, y: p.y };
  });
}

// Spread a group's members across an angular band on the outer ring. A single
// member sits at the band's midpoint; multiple members are evenly inset from
// the band edges so neighbouring groups never collide.
function layoutGroup(members, cx, cy, radius, startAngle, endAngle) {
  const n = members.length;
  return members.map((input, i) => {
    const frac = n === 1 ? 0.5 : (i + 0.5) / n;
    const angle = startAngle + (endAngle - startAngle) * frac;
    const p = polar(cx, cy, radius, angle);
    return {
      id: input.id,
      kind: input.kind,
      label: input.label,
      group: input.group,
      x: p.x,
      y: p.y,
      angle,
    };
  });
}

/**
 * layout(catalog, size) -> { nodes, careerNodes, inputNodes, edges, size, center }
 * - size: { width, height } of the square viewBox (defaults to 1000x1000).
 * - nodes: every node (careers + inputs), each { id, kind, label, x, y, ... }.
 * - edges: { id, from (input id), to (career id), fromXY, toXY, control } where
 *   `control` is a bezier control point pulled toward the centre for an organic
 *   curve. Only edges whose career exists are emitted.
 */
export function layout(catalog, size) {
  const width = size && size.width ? size.width : 1000;
  const height = size && size.height ? size.height : 1000;
  const cx = width / 2;
  const cy = height / 2;

  const careers = Array.isArray(catalog.CAREERS) ? catalog.CAREERS : [];
  const careerNodes = layoutCareers(careers, cx, cy, Math.min(width, height) * 0.28);
  const careerById = new Map(careerNodes.map((node) => [node.id, node]));

  const inputs = allInputs(catalog);
  const ringRadius = Math.min(width, height) * 0.43;

  // Group inputs in a fixed, readable order around the ring.
  const groupOrder = [
    "Level 1000",
    "Level 2000",
    "Level 3000",
    "MNC",
    "Small Business",
    "Startup",
  ];
  const grouped = new Map(groupOrder.map((name) => [name, []]));
  inputs.forEach((input) => {
    if (!grouped.has(input.group)) grouped.set(input.group, []);
    grouped.get(input.group).push(input);
  });

  // Courses fill the left arc (top-left down to bottom-left); internships fill
  // the right arc (top-right down to bottom-right). Angles are in radians with
  // a small gutter between groups so the clusters stay visually distinct.
  const gutter = 0.12;
  const leftStart = Math.PI * 0.62; // upper left
  const leftEnd = Math.PI * 1.38; // lower left
  const rightStart = -Math.PI * 0.38; // upper right
  const rightEnd = Math.PI * 0.38; // lower right

  const bands = new Map();
  const courseGroups = ["Level 1000", "Level 2000", "Level 3000"];
  const internGroups = ["MNC", "Small Business", "Startup"];
  assignBands(bands, courseGroups, leftStart, leftEnd, gutter);
  assignBands(bands, internGroups, rightStart, rightEnd, gutter);

  let inputNodes = [];
  bands.forEach((band, groupName) => {
    const members = grouped.get(groupName) || [];
    inputNodes = inputNodes.concat(
      layoutGroup(members, cx, cy, ringRadius, band.start, band.end)
    );
  });

  // Build edges from each input to its destination careers.
  const inputById = new Map(inputs.map((i) => [i.id, i]));
  const inputNodeById = new Map(inputNodes.map((n) => [n.id, n]));
  const edges = [];
  inputNodes.forEach((node) => {
    const input = inputById.get(node.id);
    if (!input) return;
    input.destinations.forEach((careerId) => {
      const career = careerById.get(careerId);
      if (!career) return;
      edges.push({
        id: `${node.id}__${careerId}`,
        from: node.id,
        to: careerId,
        inferred: !!(input.inferred && input.inferred.has(careerId)),
        // Relationship strength of this link (Level 1000 weak ... internship
        // strong; inferred scope-overlap edges dampened). Drives how thick and
        // how solid-vs-dotted it draws.
        weight: edgeStrength(input, careerId),
        fromXY: { x: node.x, y: node.y },
        toXY: { x: career.x, y: career.y },
        // Control point: midpoint nudged toward the centre for a gentle inward bow.
        control: {
          x: (node.x + career.x) / 2 + (cx - (node.x + career.x) / 2) * 0.35,
          y: (node.y + career.y) / 2 + (cy - (node.y + career.y) / 2) * 0.35,
        },
      });
    });
  });

  return {
    size: { width, height },
    center: { x: cx, y: cy },
    careerNodes,
    inputNodes,
    nodes: careerNodes.concat(inputNodes),
    edges,
    careerById,
    inputNodeById,
  };
}

// Split [start, end] into one band per group, leaving `gutter` radians of empty
// space between adjacent bands. Mutates `bands` (groupName -> {start,end}).
function assignBands(bands, groups, start, end, gutter) {
  const n = groups.length;
  const total = end - start;
  const span = (total - gutter * (n - 1)) / n;
  groups.forEach((group, i) => {
    const bStart = start + i * (span + gutter);
    bands.set(group, { start: bStart, end: bStart + span });
  });
}
