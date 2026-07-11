// score.js
// Pure, side-effect-free, DOM-free reachability + convergence logic for Open
// Doors. No browser globals, so it imports cleanly in Node and is unit-tested
// with node:test.
//
// The model has two layers, deliberately kept separate:
//
//   Edge strength (per input).  How committal a qualification is. A broad Level
//   1000 intro relates weakly to each of its many fields; an advanced 3000
//   course or a real internship relates strongly to its few. This drives how
//   THICK and how SOLID-vs-DOTTED each line is drawn.
//
//   Career convergence (across the selection).  A career's "support" is the sum
//   of the strengths of the selected inputs that reach it. Where your picks
//   OVERLAP, support stacks and the career becomes a viable SPECIALIZATION
//   (large, hot, bold links). Careers reached by only a stray pick fall behind
//   your strongest paths and FADE (dim, thin dotted, no label). A contrast term
//   sharpens this as the stack grows, so adding more focuses rather than
//   clutters. Faded never means unreachable - only de-emphasised.

// Per-input strength. Internships (real experience) are the strongest signal;
// course strength rises with level.
const COURSE_STRENGTH = { 1000: 0.35, 2000: 0.6, 3000: 0.85 };
const INTERNSHIP_STRENGTH = 1.0;
// Inferred edges (a career reached only because its scope overlaps one the
// input directly opens, e.g. Data Scientist -> Data Analyst) are real but
// softer: they draw thinner/dottier and contribute less support than a
// directly-grounded edge of the same input.
const INFERRED_MULTIPLIER = 0.55;

// Tuning for the convergence layer.
const STRONG_REF = 2.2; // support at which a career reads as fully hot / large
const FADE_K = 0.35; // how fast contrast sharpens per extra selection
const FADE_THRESHOLD = 0.15; // relative-emphasis floor below which a career fades
const SPECIALIZATION_AT = 0.6; // absolute strength at/above which a career is a specialization

// Crowding-out layer: doors can CLOSE, not just fade, so the open count is
// non-monotone - a senior's committal stack narrows options the way real
// specialization does. Two ingredients, both deliberate:
//   - Only COMMITTAL picks (3000-level courses, internships; strength >=
//     COMMITTAL_STRENGTH) count toward the closing gate, so no quantity of
//     broad intros ever closes anything. Breadth keeps doors open by design.
//   - Once committal commitment passes CLOSE_FREE_COMMITMENT, a reached career
//     whose gamma-sharpened leader-relative emphasis falls below
//     CLOSE_EMPHASIS is CROWDED OUT (tier "closed"). Reusing the emphasis
//     signal keeps one normalization for fade and close (leader-relative, so
//     it is invariant to how many careers a catalog has), and it reopens
//     honestly: add support for the career and its emphasis recovers.
const COMMITTAL_STRENGTH = 0.85; // picks at/above this strength commit
const CLOSE_FREE_COMMITMENT = 2.5; // committal sum below which nothing closes (~3 advanced courses)
const CLOSE_EMPHASIS = 1e-3; // emphasis floor below which a reached career is crowded out

// Heat ramp endpoints (mirror --color-accent cool end and --color-hot warm end).
const HEAT_COOL = { r: 0x5e, g: 0xb3, b: 0xd6 };
const HEAT_HOT = { r: 0xe8, g: 0xa0, b: 0x4b };

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
 * with a kind, a group, and a normalised destinations array.
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
    inferred: new Set(Array.isArray(c.inferred) ? c.inferred : []),
  }));

  const fromInternships = internships.map((i) => ({
    id: i.id,
    kind: "internship",
    label: i.role,
    orgType: i.orgType,
    group: i.orgType,
    destinations: Array.isArray(i.destinations) ? i.destinations : [],
    inferred: new Set(Array.isArray(i.inferred) ? i.inferred : []),
    // Validated-canonical roles (LLM-proposed, grounding-validated to exist;
    // every career edge judgment-based). The UI renders them distinctly.
    // NOTE, deliberate: inputStrength stays 1.0 for canonical internships -
    // doing an internship is a committal life choice regardless of how its
    // career edges were grounded. What the evidence tier dampens is the
    // SUPPORT its edges contribute (all its edges are inferred, so they carry
    // the inferred multiplier), not the commitment of the pick.
    canonical: !!i.canonical,
  }));

  return fromCourses.concat(fromInternships);
}

/**
 * inputStrength(input) -> number in (0,1]
 * How committal a qualification is. Internships are strongest; course strength
 * rises with level. Unknown shapes fall back to a mid value.
 */
export function inputStrength(input) {
  if (!input) return 0.5;
  if (input.kind === "internship") return INTERNSHIP_STRENGTH;
  const s = COURSE_STRENGTH[input.level];
  return typeof s === "number" ? s : 0.5;
}

/**
 * edgeStrength(input, careerId) -> number in (0,1]
 * Strength of one link. Equal to inputStrength for a directly-grounded edge;
 * dampened for an inferred (scope-overlap) edge so it draws softer and adds
 * less convergence support than direct evidence from the same input.
 */
export function edgeStrength(input, careerId) {
  const base = inputStrength(input);
  return input && input.inferred && input.inferred.has(careerId)
    ? base * INFERRED_MULTIPLIER
    : base;
}

/**
 * strengthWidth(weight) -> number
 * Stroke width in SVG units for an edge of the given strength. Thin for weak
 * links, thick for strong ones.
 */
export function strengthWidth(weight) {
  return 0.9 + 2.6 * clamp(Number(weight) || 0, 0, 1);
}

/**
 * strengthDash(weight) -> string
 * SVG stroke-dasharray for an edge of the given strength: a fine dotted pattern
 * at low strength easing to solid ("") at high strength.
 */
export function strengthDash(weight) {
  const w = clamp(Number(weight) || 0, 0, 1);
  if (w >= 0.85) return ""; // solid
  const dash = (1 + 4 * w).toFixed(2);
  const gap = (7 - 5 * w).toFixed(2);
  return `${dash} ${gap}`;
}

/**
 * heatColor(t) -> string (CSS rgb)
 * Maps strength t in [0,1] from the cool accent end to the warm amber end.
 */
export function heatColor(t) {
  const u = clamp(Number(t) || 0, 0, 1);
  return `rgb(${lerpChannel(HEAT_COOL.r, HEAT_HOT.r, u)}, ${lerpChannel(
    HEAT_COOL.g,
    HEAT_HOT.g,
    u
  )}, ${lerpChannel(HEAT_COOL.b, HEAT_HOT.b, u)})`;
}

/**
 * reach(selectedIds, catalog) -> Map<careerId, count>
 * Plain reinforcement count (how many selected inputs reach each career),
 * ignoring strength. Kept as a simple primitive; analyze() is the richer view.
 */
export function reach(selectedIds, catalog) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const counts = new Map();
  allInputs(catalog).forEach((input) => {
    if (!selected.has(input.id)) return;
    input.destinations.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
  });
  return counts;
}

/**
 * analyze(selectedIds, catalog) -> {
 *   careers: Map<careerId, {
 *     support,        // summed strength of selected inputs reaching it
 *     supporters,     // how many selected inputs reach it
 *     strength,       // absolute, support / STRONG_REF clamped to [0,1] (heat + size)
 *     rel,            // support / maxSupport in [0,1]
 *     emphasis,       // rel sharpened by stack size (drives fade)
 *     faded,          // true when this path recedes behind stronger ones
 *     tier,           // 'specialization' | 'open' | 'fading'
 *   }>,
 *   selectedCount, maxSupport, gamma
 * }
 *
 * Only reached careers (support > 0) appear in the map. With one selection
 * nothing fades (no contrast yet); as overlapping selections stack, weakly
 * supported careers fall below the emphasis floor and fade while converged ones
 * rise into specializations.
 */
export function analyze(selectedIds, catalog) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const inputs = allInputs(catalog).filter((i) => selected.has(i.id));

  const raw = new Map(); // careerId -> { support, supporters }
  inputs.forEach((input) => {
    input.destinations.forEach((careerId) => {
      const cur = raw.get(careerId) || { support: 0, supporters: 0 };
      cur.support += edgeStrength(input, careerId);
      cur.supporters += 1;
      raw.set(careerId, cur);
    });
  });

  const n = inputs.length;
  let maxSupport = 0;
  raw.forEach((v) => {
    if (v.support > maxSupport) maxSupport = v.support;
  });

  // Contrast sharpens as the stack grows: with more selections, the gap between
  // converged and marginal careers widens, so marginal ones fade.
  const gamma = 1 + FADE_K * Math.max(0, n - 1);

  // Committal commitment: how much of the stack is advanced/experience picks.
  // Intros never contribute, so breadth alone can never trigger closing.
  const committal = inputs.reduce((sum, input) => {
    const w = inputStrength(input);
    return w >= COMMITTAL_STRENGTH ? sum + w : sum;
  }, 0);
  const closingActive = committal > CLOSE_FREE_COMMITMENT;

  const careers = new Map();
  raw.forEach((v, careerId) => {
    const strength = maxSupport > 0 ? clamp(v.support / STRONG_REF, 0, 1) : 0;
    const rel = maxSupport > 0 ? v.support / maxSupport : 0;
    const emphasis = Math.pow(rel, gamma);
    // Fade only once there is a stack to contrast against (n > 1).
    const faded = n > 1 && emphasis < FADE_THRESHOLD;
    // Crowded out: the stack has committed hard elsewhere and this reached
    // career has fallen far behind the leaders. Closed is a subset of faded;
    // it reopens if later picks bring its support (hence emphasis) back up.
    const closed = closingActive && emphasis < CLOSE_EMPHASIS;
    let tier;
    if (closed) tier = "closed";
    else if (faded) tier = "fading";
    else if (strength >= SPECIALIZATION_AT) tier = "specialization";
    else tier = "open";
    careers.set(careerId, {
      support: v.support,
      supporters: v.supporters,
      strength,
      rel,
      emphasis,
      faded: faded || closed,
      closed,
      tier,
    });
  });

  return { careers, selectedCount: n, maxSupport, gamma, committal, closingActive };
}

/**
 * summarize(analysis, careers) -> { open, specializations, fadingCount,
 *   closedCount, top }
 * Headline figures for the summary band. `open` counts reached careers that
 * are NOT crowded out, so it is deliberately non-monotone: early breadth grows
 * it, a committal senior stack narrows it. `closedCount` reports the crowded-
 * out doors; fading counts de-emphasised-but-open paths only.
 */
export function summarize(analysis, careers) {
  const list = Array.isArray(careers) ? careers : [];
  const specs = [];
  let fadingCount = 0;
  let closedCount = 0;
  let top = null;

  list.forEach((career) => {
    const info = analysis.careers.get(career.id);
    if (!info) return;
    if (info.tier === "specialization") {
      specs.push({ id: career.id, name: career.name, strength: info.strength });
    }
    if (info.closed) closedCount += 1;
    else if (info.faded) fadingCount += 1;
    if (top === null || info.support > top.support) {
      top = { id: career.id, name: career.name, support: info.support };
    }
  });

  specs.sort((a, b) => b.strength - a.strength);
  return {
    open: analysis.careers.size - closedCount,
    specializations: specs,
    fadingCount,
    closedCount,
    top,
  };
}
