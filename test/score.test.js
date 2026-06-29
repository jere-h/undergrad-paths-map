// Unit suite for the pure score.js scoring/color module.
// Runs with `node --test` (no browser, no DOM required).
//
//   node --test
//
// Covers:
//   - rawScore(course) == course.destinations.length for every fixture course
//   - weightedScore(course, 0) reduces exactly to rawScore
//   - weightedScore monotonically penalizes higher-effort courses as w rises
//   - scoreToColor is monotonic across a score range
//   - scoreToColor returns the mid-scale color (no NaN) when max === min
//   - a data-integrity guard over data/courses.js (the real bundled dataset)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  rawScore,
  weightedScore,
  scoreToColor,
  scoreMin,
  scoreMax,
} from '../score.js';
import { COURSES } from '../data/courses.js';

// A small, self-contained fixture set so these score-math assertions do not
// depend on the hand-authored dataset's exact numbers. Efforts deliberately
// differ so the monotonic-penalty checks have something to bite on.
const FIXTURES = [
  { name: 'Fixture Broad', destinations: ['a', 'b', 'c', 'd', 'e'], effort: 5 },
  { name: 'Fixture Mid', destinations: ['a', 'b', 'c'], effort: 3 },
  { name: 'Fixture Niche', destinations: ['a'], effort: 1 },
  { name: 'Fixture Zero Effort', destinations: ['a', 'b'], effort: 0 },
];

test('rawScore equals destinations.length for each fixture course', () => {
  for (const course of FIXTURES) {
    assert.equal(
      rawScore(course),
      course.destinations.length,
      `rawScore(${course.name}) should equal its destination count`,
    );
  }
});

test('weightedScore reduces exactly to rawScore at w=0', () => {
  for (const course of FIXTURES) {
    assert.equal(
      weightedScore(course, 0),
      rawScore(course),
      `weightedScore(${course.name}, 0) should equal rawScore`,
    );
  }
});

test('weightedScore matches the rawScore - w*effort formula', () => {
  for (const course of FIXTURES) {
    for (const w of [0, 0.25, 0.5, 0.75, 1]) {
      const expected = rawScore(course) - w * course.effort;
      assert.ok(
        Math.abs(weightedScore(course, w) - expected) < 1e-9,
        `weightedScore(${course.name}, ${w}) should be rawScore - w*effort`,
      );
    }
  }
});

test('weightedScore monotonically penalizes a higher-effort course as w rises', () => {
  // For any course with effort > 0, its weighted score must strictly decrease
  // as w increases. A zero-effort course must stay flat.
  const weights = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

  for (const course of FIXTURES) {
    let prev = weightedScore(course, weights[0]);
    for (let i = 1; i < weights.length; i += 1) {
      const current = weightedScore(course, weights[i]);
      if (course.effort > 0) {
        assert.ok(
          current < prev,
          `weightedScore(${course.name}) should strictly decrease as w rises ` +
            `(w=${weights[i]}: ${current} !< ${prev})`,
        );
      } else {
        assert.equal(
          current,
          prev,
          `weightedScore(${course.name}) with effort 0 should be flat as w rises`,
        );
      }
      prev = current;
    }
  }
});

test('a higher-effort course is penalized more than a lower-effort one at the same w', () => {
  // Equal raw breadth, different effort: the higher-effort course should lose
  // strictly more value as w grows.
  const slow = { name: 'Slow', destinations: ['a', 'b', 'c'], effort: 4 };
  const fast = { name: 'Fast', destinations: ['a', 'b', 'c'], effort: 1 };

  for (const w of [0.25, 0.5, 0.75, 1]) {
    const slowDrop = rawScore(slow) - weightedScore(slow, w);
    const fastDrop = rawScore(fast) - weightedScore(fast, w);
    assert.ok(
      slowDrop > fastDrop,
      `at w=${w} the higher-effort course should be penalized more ` +
        `(slowDrop=${slowDrop} !> fastDrop=${fastDrop})`,
    );
  }
});

test('scoreToColor is monotonic (distinct, ordered) across a score range', () => {
  const min = 0;
  const max = 10;
  const samples = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const colors = samples.map((s) => scoreToColor(s, min, max));

  // No NaN leaking into any channel of any produced color.
  for (let i = 0; i < colors.length; i += 1) {
    assert.equal(typeof colors[i], 'string', 'scoreToColor must return a string');
    assert.ok(
      !/nan/i.test(colors[i]),
      `scoreToColor(${samples[i]}) produced a NaN color: ${colors[i]}`,
    );
  }

  // Monotonic in the sense that the mapping is a stable, order-preserving
  // function of the input: a higher score must never reproduce a lower score's
  // color, and walking up the range must visit distinct colors. We assert
  // strict monotonicity by extracting an orderable key from each color.
  const keys = colors.map(colorOrderKey);
  for (let i = 1; i < keys.length; i += 1) {
    assert.ok(
      keys[i] > keys[i - 1],
      `scoreToColor should move monotonically cool->hot: ` +
        `score ${samples[i]} (${colors[i]}, key ${keys[i]}) ` +
        `must rank above score ${samples[i - 1]} (${colors[i - 1]}, key ${keys[i - 1]})`,
    );
  }

  // Endpoints differ.
  assert.notEqual(
    colors[0],
    colors[colors.length - 1],
    'cool and hot endpoints must differ',
  );
});

test('scoreToColor returns the mid-scale color (no NaN) when max === min', () => {
  const flat = scoreToColor(7, 5, 5); // degenerate range
  assert.equal(typeof flat, 'string', 'must still return a CSS color string');
  assert.ok(!/nan/i.test(flat), `degenerate range produced a NaN color: ${flat}`);

  // The mid-scale color is the t=0.5 interpolation; it must equal the color you
  // get from a real range evaluated exactly at its midpoint.
  const midOfRealRange = scoreToColor(5, 0, 10);
  assert.equal(
    flat,
    midOfRealRange,
    'max===min must yield the t=0.5 mid-scale color',
  );

  // And it must sit strictly between the cool and hot endpoints.
  const cool = scoreToColor(0, 0, 10);
  const hot = scoreToColor(10, 0, 10);
  const k = colorOrderKey(flat);
  assert.ok(
    k > colorOrderKey(cool) && k < colorOrderKey(hot),
    'mid-scale color must fall between cool and hot endpoints',
  );
});

test('scoreMin / scoreMax return the extremes of a score array', () => {
  const scores = [3, -1, 7, 2, 7, 0];
  assert.equal(scoreMin(scores), -1, 'scoreMin should be the smallest value');
  assert.equal(scoreMax(scores), 7, 'scoreMax should be the largest value');

  // Single-element arrays collapse to that element (drives the degenerate
  // max===min color path in recolor).
  assert.equal(scoreMin([4]), 4);
  assert.equal(scoreMax([4]), 4);
});

test('data integrity: COURSES has exactly 12 well-formed, unique courses', () => {
  assert.ok(Array.isArray(COURSES), 'COURSES must be an array');
  assert.equal(COURSES.length, 12, 'there must be exactly 12 courses');

  const seenNames = new Set();

  for (let i = 0; i < COURSES.length; i += 1) {
    const course = COURSES[i];
    const where = `COURSES[${i}]`;

    assert.ok(
      course && typeof course === 'object' && !Array.isArray(course),
      `${where} must be an object`,
    );

    // Name: non-empty string, unique across the dataset.
    assert.equal(typeof course.name, 'string', `${where}.name must be a string`);
    assert.ok(course.name.trim().length > 0, `${where}.name must be non-empty`);
    assert.ok(
      !seenNames.has(course.name),
      `${where}.name "${course.name}" must be unique`,
    );
    seenNames.add(course.name);

    // Destinations: non-empty array of non-empty, unique strings.
    assert.ok(
      Array.isArray(course.destinations),
      `${where}.destinations must be an array`,
    );
    assert.ok(
      course.destinations.length > 0,
      `${where}.destinations must be non-empty`,
    );

    const seenDest = new Set();
    for (let j = 0; j < course.destinations.length; j += 1) {
      const dest = course.destinations[j];
      assert.equal(
        typeof dest,
        'string',
        `${where}.destinations[${j}] must be a string`,
      );
      assert.ok(
        dest.trim().length > 0,
        `${where}.destinations[${j}] must be non-empty`,
      );
      assert.ok(
        !seenDest.has(dest),
        `${where}.destinations[${j}] "${dest}" must be unique within the course`,
      );
      seenDest.add(dest);
    }

    // Effort: a finite number (consumed by weightedScore).
    assert.equal(
      typeof course.effort,
      'number',
      `${where}.effort must be a number`,
    );
    assert.ok(
      Number.isFinite(course.effort),
      `${where}.effort must be a finite number`,
    );
  }
});

test('data integrity: rawScore over real COURSES equals each destination count', () => {
  for (const course of COURSES) {
    assert.equal(
      rawScore(course),
      course.destinations.length,
      `rawScore(${course.name}) must equal its destination count`,
    );
  }
});

test('data integrity: destination counts vary, so the heat map has range', () => {
  const counts = COURSES.map((c) => c.destinations.length);
  assert.ok(
    scoreMax(counts) > scoreMin(counts),
    'destination counts must vary so the color scale is meaningful',
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Derive a single orderable number from a CSS color string so the test can
// assert monotonicity regardless of the exact color space score.js emits
// (rgb(), #hex, or hsl()). A cool->hot ramp moves toward red and away from
// blue, so we rank by (red - blue), with hue handled for the hsl() case.
function colorOrderKey(color) {
  const { r, g, b } = parseColor(color);
  // Cool (blue) is low, hot (red/ember) is high. Blue falls strictly and
  // monotonically across the whole cool->mid->hot ramp, so it is the reliable
  // primary order key; redness (r - b) is a finer tie-breaker. (Green is NOT
  // usable here: it rises into the amber mid then falls toward the ember hot.)
  return (255 - b) * 1000 + (r - b);
}

function parseColor(color) {
  const str = String(color).trim();

  // rgb(r, g, b) / rgba(r, g, b, a)
  let m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }

  // #rgb or #rrggbb
  m = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  // hsl(h, s%, l%) / hsla(...)
  m = str.match(/^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
  if (m) {
    return hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
  }

  throw new assert.AssertionError({
    message: `Unparseable color string from scoreToColor: "${color}"`,
  });
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const mm = l - c / 2;
  return {
    r: Math.round((r1 + mm) * 255),
    g: Math.round((g1 + mm) * 255),
    b: Math.round((b1 + mm) * 255),
  };
}
