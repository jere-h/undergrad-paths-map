// score.js
// Pure, side-effect-free, DOM-free scoring + color module for "Open Doors".
//
// No browser globals are referenced anywhere in this file, so it imports
// cleanly in Node (and is unit-tested with node:test). Everything here is a
// plain function of its inputs.
//
// Heat scale endpoints: these mirror the CSS custom properties --heat-cool
// (low/cool end) and --heat-hot (high/hot end) so the colors the grid paints
// match the inline-SVG legend. They are perceptually ordered cool -> hot.
const HEAT_COOL = { r: 0x1f, g: 0x6f, b: 0xb2 }; // calm blue  (low score)
const HEAT_MID = { r: 0xf2, g: 0xc0, b: 0x4d }; // warm amber (mid score)
const HEAT_HOT = { r: 0xd6, g: 0x45, b: 0x2b }; // hot ember  (high score)

// Clamp a number into the inclusive [lo, hi] range.
function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

// Linear interpolation between two integers, rounded to a byte.
function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// Blend two {r,g,b} stops by t in [0,1].
function mixStop(from, to, t) {
  return {
    r: lerpChannel(from.r, to.r, t),
    g: lerpChannel(from.g, to.g, t),
    b: lerpChannel(from.b, to.b, t),
  };
}

/**
 * rawScore(course) -> number
 * The fixed, printed tile number: how many distinct career destinations the
 * course keeps reachable. Equal to destinations.length.
 */
export function rawScore(course) {
  if (!course || !Array.isArray(course.destinations)) return 0;
  return course.destinations.length;
}

/**
 * weightedScore(course, w) -> number
 * rawScore(course) - w * course.effort, with w in [0, 1].
 * - At w === 0 this equals rawScore exactly.
 * - Increasing w monotonically penalizes higher-effort courses.
 * Negative results are allowed; only the relative ordering matters.
 */
export function weightedScore(course, w) {
  const weight = clamp(Number(w) || 0, 0, 1);
  const effort = course && Number.isFinite(course.effort) ? course.effort : 0;
  return rawScore(course) - weight * effort;
}

/**
 * scoreMin(scores) -> number
 * Smallest value in a number[] (helper for the live color range / legend min).
 * Returns 0 for an empty array.
 */
export function scoreMin(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return 0;
  let lo = scores[0];
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i] < lo) lo = scores[i];
  }
  return lo;
}

/**
 * scoreMax(scores) -> number
 * Largest value in a number[] (helper for the live color range / legend max).
 * Returns 0 for an empty array.
 */
export function scoreMax(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return 0;
  let hi = scores[0];
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i] > hi) hi = scores[i];
  }
  return hi;
}

/**
 * scoreToColor(score, min, max) -> string (CSS rgb color)
 * Maps a score onto a perceptually-ordered cool -> hot scale.
 * - On the degenerate max === min case it returns the MID-SCALE color (t=0.5)
 *   instead of dividing by zero (no NaN).
 * - t is clamped to [0,1] so out-of-range scores still produce a valid color.
 */
export function scoreToColor(score, min, max) {
  let t;
  if (max === min) {
    t = 0.5;
  } else {
    t = clamp((score - min) / (max - min), 0, 1);
  }

  // Two-segment ramp through the mid stop for a perceptual cool -> hot feel.
  let stop;
  if (t <= 0.5) {
    stop = mixStop(HEAT_COOL, HEAT_MID, t / 0.5);
  } else {
    stop = mixStop(HEAT_MID, HEAT_HOT, (t - 0.5) / 0.5);
  }
  return `rgb(${stop.r}, ${stop.g}, ${stop.b})`;
}
