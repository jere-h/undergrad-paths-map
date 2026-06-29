// main.js — Controller / bootstrap for Open Doors.
// type=module entry point: imports the inlined dataset and the DOM render
// functions, validates the data once, paints the grid + an initial recolor at
// the slider's default weight, then wires the live interactions. No fetch, no
// rebuilds on slider input, and nothing logged to the console in the happy path.
import { COURSES } from './data/courses.js';
import { mountGrid, recolor, openPanel, closePanel } from './render.js';

// validateCourses(courses)
// Data-integrity guard. Throws on any structural problem so a bad dataset fails
// loudly at boot rather than rendering a quietly-wrong UI. Defensively dedupes
// each course's destinations in place so a duplicate label can never inflate the
// printed raw score. Returns the (cleaned) array.
function validateCourses(courses) {
  if (!Array.isArray(courses) || courses.length !== 12) {
    throw new Error('COURSES must be an array of exactly 12 courses.');
  }

  const seenNames = new Set();

  courses.forEach((course, i) => {
    if (!course || typeof course !== 'object') {
      throw new Error(`Course ${i} is not an object.`);
    }

    const name = course.name;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`Course ${i} has a missing or empty name.`);
    }
    if (seenNames.has(name)) {
      throw new Error(`Duplicate course name: ${name}`);
    }
    seenNames.add(name);

    if (!Array.isArray(course.destinations) || course.destinations.length === 0) {
      throw new Error(`Course "${name}" has a missing or empty destinations array.`);
    }

    // Defensively dedupe destinations: keep first occurrence, drop empties,
    // preserve order. Mutating in place keeps rawScore == the cleaned length.
    const cleaned = [];
    const seenDest = new Set();
    course.destinations.forEach((dest) => {
      if (typeof dest !== 'string') {
        throw new Error(`Course "${name}" has a non-string destination.`);
      }
      const trimmed = dest;
      if (trimmed.trim() === '') return;
      if (seenDest.has(trimmed)) return;
      seenDest.add(trimmed);
      cleaned.push(trimmed);
    });

    if (cleaned.length === 0) {
      throw new Error(`Course "${name}" has no non-empty destinations.`);
    }
    course.destinations = cleaned;

    if (typeof course.effort !== 'number' || Number.isNaN(course.effort)) {
      throw new Error(`Course "${name}" has a non-numeric effort.`);
    }
  });

  return courses;
}

// readWeight(slider) -> number in [0,1]
// Reads the slider's value, clamped defensively so an out-of-range value can
// never feed a NaN or out-of-domain weight into the scoring.
function readWeight(slider) {
  const value = Number.parseFloat(slider.value);
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function init() {
  const courses = validateCourses(COURSES);
  const slider = document.getElementById('slider');

  // First paint: build the tiles once, then color them at the slider's current
  // (default) weight so the app demonstrates itself immediately.
  mountGrid(courses);
  recolor(courses, slider ? readWeight(slider) : 0);

  // Slider drives a live recolor only — no reload, no DOM rebuild. The printed
  // destination numbers are written once by mountGrid and never touched here.
  if (slider) {
    slider.addEventListener('input', () => {
      recolor(courses, readWeight(slider));
    });
  }

  // Tile activation: a click (or Enter/Space, which a <button> turns into a
  // click for free) resolves the tile to its Course by data-index and opens the
  // detail panel. Delegated on #grid so it survives any future re-mount.
  const grid = document.getElementById('grid');
  if (grid) {
    grid.addEventListener('click', (event) => {
      const tile = event.target.closest('.tile');
      if (!tile || !grid.contains(tile)) return;
      const index = Number(tile.dataset.index);
      if (Number.isNaN(index) || index < 0 || index >= courses.length) return;
      openPanel(courses[index]);
    });
  }

  // Close the panel via its button, the backdrop, or Escape.
  const closeButton = document.getElementById('panel-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => closePanel());
  }

  const backdrop = document.getElementById('panel-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => closePanel());
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const panel = document.getElementById('detail-panel');
    if (panel && !panel.hidden) closePanel();
  });
}

// Run after the DOM is parsed. Because this is a deferred module script it may
// already be ready; guard for both cases.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
