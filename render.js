// render.js — DOM rendering for Open Doors.
// Owns all DOM concerns: building tiles, mounting the grid, recoloring in place,
// and the detail panel. The printed destination number on each tile is written
// ONCE at build time and NEVER rewritten by recolor — it is the non-color
// channel and a tested invariant (number == JSON destinations.length).
import { rawScore, weightedScore, scoreToColor, scoreMin, scoreMax } from './score.js';

// Remembers which tile opened the panel so closePanel can restore focus.
let lastFocusedTile = null;

// buildTile(course) -> HTMLButtonElement
// A real <button> so it is keyboard-focusable and Enter/Space activatable for
// free. Shows the course name and its raw destination count as a permanent
// printed number (the non-color channel). The data-index is wired by mountGrid.
export function buildTile(course) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'tile';

  const count = rawScore(course);

  const name = document.createElement('span');
  name.className = 'tile__name';
  name.textContent = course.name;

  const number = document.createElement('span');
  number.className = 'tile__count';
  number.textContent = String(count);
  // Hidden, spoken label so the bare number reads sensibly to assistive tech.
  number.setAttribute('aria-hidden', 'true');

  const sr = document.createElement('span');
  sr.className = 'tile__sr';
  sr.textContent =
    count === 1
      ? `${course.name}, keeps 1 career destination reachable.`
      : `${course.name}, keeps ${count} career destinations reachable.`;

  tile.append(name, number, sr);
  return tile;
}

// mountGrid(courses) -> void
// Clears #grid and appends one tile per course, in order. Stamps each tile with
// its zero-based data-index so the controller can resolve a click back to a Course.
export function mountGrid(courses) {
  const grid = document.getElementById('grid');
  if (!grid) return;
  grid.textContent = '';

  const frag = document.createDocumentFragment();
  courses.forEach((course, index) => {
    const tile = buildTile(course);
    tile.dataset.index = String(index);
    frag.appendChild(tile);
  });
  grid.appendChild(frag);
}

// recolor(courses, w) -> void
// Recomputes weightedScore across all courses for slider weight w, then updates
// ONLY each tile's inline background-color plus the legend's min/max labels.
// It never touches .tile__count, preserving the printed-number invariant.
export function recolor(courses, w) {
  const grid = document.getElementById('grid');
  if (!grid) return;

  const tiles = grid.querySelectorAll('.tile');
  const scores = courses.map((course) => weightedScore(course, w));
  const min = scoreMin(scores);
  const max = scoreMax(scores);

  tiles.forEach((tile) => {
    const index = Number(tile.dataset.index);
    if (Number.isNaN(index) || index < 0 || index >= scores.length) return;
    const color = scoreToColor(scores[index], min, max);
    tile.style.backgroundColor = color;
  });

  const legendMin = document.getElementById('legend-min');
  const legendMax = document.getElementById('legend-max');
  if (legendMin) legendMin.textContent = formatScore(min);
  if (legendMax) legendMax.textContent = formatScore(max);
}

// Trim a weighted score to a tidy label (drops noise from w*effort fractions).
function formatScore(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// openPanel(course) -> void
// Fills and shows #detail-panel (+ #panel-backdrop) listing the course's
// destinations, then moves focus into the panel (the close button).
export function openPanel(course) {
  const panel = document.getElementById('detail-panel');
  const backdrop = document.getElementById('panel-backdrop');
  if (!panel) return;

  // Remember the tile that opened us so we can return focus on close.
  const active = document.activeElement;
  lastFocusedTile = active && active.classList && active.classList.contains('tile') ? active : null;

  const title = document.getElementById('panel-title');
  if (title) title.textContent = course.name;

  const list = document.getElementById('panel-destinations');
  if (list) {
    list.textContent = '';
    course.destinations.forEach((dest) => {
      const li = document.createElement('li');
      li.textContent = dest;
      list.appendChild(li);
    });
  }

  panel.hidden = false;
  panel.classList.add('is-open');
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.classList.add('is-open');
  }

  const close = document.getElementById('panel-close');
  if (close) close.focus();
}

// closePanel() -> void
// Hides #detail-panel + #panel-backdrop and restores focus to the tile that
// opened the panel.
export function closePanel() {
  const panel = document.getElementById('detail-panel');
  const backdrop = document.getElementById('panel-backdrop');

  if (panel) {
    panel.hidden = true;
    panel.classList.remove('is-open');
  }
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.classList.remove('is-open');
  }

  if (lastFocusedTile && typeof lastFocusedTile.focus === 'function') {
    lastFocusedTile.focus();
  }
  lastFocusedTile = null;
}
