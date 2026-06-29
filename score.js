// score.js
// Pure, side-effect-free, DOM-free reachability + heat logic for Open Doors.
//
// No browser globals are referenced anywhere in this file, so it imports
// cleanly in Node and is unit-tested with node:test. Everything here is a plain
// function of its inputs.
//
// The model: the user selects input nodes (courses + internships). Each input
// lists the career ids it keeps reachable. A career is "open" when at least one
// selected input reaches it; its HEAT is how many selected inputs reach it
// (reinforcement). One broad pick opens many doors; a stack of related picks
// makes a few careers burn bright - the option-value signal from the original
// heat map, re-expressed on the network.

// Heat ramp endpoints. Cool (low reinforcement) sits near the page accent; hot
// (high reinforcement) moves to a warm amber. These mirror the CSS custom
// properties --color-accent and --color-hot so the SVG matches the legend.
const HEAT_COOL = { r: 0x5e, g: 0xb3, b: 0xd6 }; // muted sky  (just reached)
const HEAT_HOT = { r: 0xe8, g: 0xa0, b: 0x4b }; // warm amber (strongly reinforced)

function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/**
 * allInputs(catalog) -> Input[]
 * Flattens courses and internships into one selectable-input list, tagging each
 * with a `kind` and a normalised `destinations` array. The label is the course
 * name or the internship role. Order is courses-then-internships, stable.
 */
export function allInputs(catalog) {
  const courses = Array.isArray(catalog.COURSES) ? catalog.COURSES : [];
  const internships = Array.isArray(catalog.INTERNSHIPS) ? catalog.INTERNSHIPS : [];

  const fromCourses = courses.map((c) => ({
    id: c.id,
    kind: "course",
    label: c.name,
    level: c.level,
    group: `Level ${c.level}`,
    destinations: Array.isArray(c.destinations) ? c.destinations : [],
  }));

  const fromInternships = internships.map((i) => ({
    id: i.id,
    kind: "internship",
    label: i.role,
    orgType: i.orgType,
    group: i.orgType,
    destinations: Array.isArray(i.destinations) ? i.destinations : [],
  }));

  return fromCourses.concat(fromInternships);
}

/**
 * reach(selectedIds, catalog) -> Map<careerId, count>
 * For the set of selected input ids, counts how many selected inputs reach each
 * career. Careers reached zero times are absent from the map. `selectedIds` may
 * be a Set or an array; unknown ids are ignored.
 */
export function reach(selectedIds, catalog) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const inputs = allInputs(catalog);
  const counts = new Map();

  inputs.forEach((input) => {
    if (!selected.has(input.id)) return;
    input.destinations.forEach((careerId) => {
      counts.set(careerId, (counts.get(careerId) || 0) + 1);
    });
  });

  return counts;
}

/**
 * reinforcementMax(reachMap) -> number
 * The largest reinforcement count in a reach map (how hot the hottest career
 * is). Returns 0 for an empty map. Used to normalise heat to [0,1].
 */
export function reinforcementMax(reachMap) {
  let max = 0;
  reachMap.forEach((count) => {
    if (count > max) max = count;
  });
  return max;
}

/**
 * heat(count, max) -> number in [0,1]
 * Normalises a reinforcement count against the current maximum. With a single
 * reached career (max === 1) heat is 1 so it still reads as fully open rather
 * than dividing toward zero.
 */
export function heat(count, max) {
  if (count <= 0) return 0;
  if (max <= 1) return 1;
  return clamp((count - 1) / (max - 1), 0, 1);
}

/**
 * heatColor(t) -> string (CSS rgb color)
 * Maps heat t in [0,1] from the cool accent end to the warm amber end. Clamped
 * so out-of-range input still yields a valid color.
 */
export function heatColor(t) {
  const u = clamp(Number(t) || 0, 0, 1);
  const r = lerpChannel(HEAT_COOL.r, HEAT_HOT.r, u);
  const g = lerpChannel(HEAT_COOL.g, HEAT_HOT.g, u);
  const b = lerpChannel(HEAT_COOL.b, HEAT_HOT.b, u);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * summarize(reachMap, careers) -> { openCount, max, top }
 * Headline numbers for the summary band: how many careers are open, the peak
 * reinforcement, and the single most-reinforced career (name + count), or null
 * when nothing is selected. Ties resolve to the career listed first.
 */
export function summarize(reachMap, careers) {
  const list = Array.isArray(careers) ? careers : [];
  const max = reinforcementMax(reachMap);

  let top = null;
  list.forEach((career) => {
    const count = reachMap.get(career.id) || 0;
    if (count > 0 && (top === null || count > top.count)) {
      top = { id: career.id, name: career.name, count };
    }
  });

  return { openCount: reachMap.size, max, top };
}
