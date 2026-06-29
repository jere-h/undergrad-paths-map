// main.js - controller / bootstrap for Open Doors.
// type=module entry point: imports the catalog, the pure scoring + layout, and
// the DOM render functions. Builds the sidebar and the constellation once,
// pre-selects an illustrative combo so the map demonstrates itself on first
// paint, then keeps the map, summary, and panel in sync as the selection changes.
import * as catalog from "./data/catalog.js";
import { reach, reinforcementMax, summarize, allInputs } from "./score.js";
import { layout } from "./graph.js";
import {
  buildSidebar,
  buildGraph,
  applyState,
  openCareerPanel,
  closePanel,
} from "./render.js";

// Selection state: a Set of selected input ids (courses + internships).
const selected = new Set();

// Lookups built once at boot.
let inputsById = new Map();
let careersById = new Map();

function update() {
  const reachMap = reach(selected, catalog);
  const max = reinforcementMax(reachMap);
  applyState(selected, reachMap, max);
  updateSummary(reachMap, max);

  const count = selected.size;
  const countEl = document.getElementById("selected-count");
  if (countEl) {
    countEl.textContent =
      count === 0
        ? "No selections yet"
        : count === 1
        ? "1 choice selected"
        : `${count} choices selected`;
  }

  const hint = document.getElementById("map-hint");
  if (hint) hint.hidden = count > 0;
}

function updateSummary(reachMap, max) {
  const { openCount, top } = summarize(reachMap, catalog.CAREERS);

  const countEl = document.getElementById("open-count");
  if (countEl) countEl.textContent = String(openCount);

  const detail = document.getElementById("summary-detail");
  if (!detail) return;
  if (openCount === 0) {
    detail.textContent = "Nothing selected yet. Your open paths will appear here.";
  } else if (top) {
    const reach1 = top.count === 1 ? "1 of your choices" : `${top.count} of your choices`;
    detail.textContent = `Strongest path: ${top.name}, reinforced by ${reach1}.`;
  } else {
    detail.textContent = "";
  }
}

function toggleInput(id) {
  if (!inputsById.has(id)) return;
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  update();
}

function clearAll() {
  selected.clear();
  update();
}

// Open the detail panel for a career: who currently opens it, and who could.
function showCareer(careerId) {
  const career = careersById.get(careerId);
  if (!career) return;

  const reachers = allInputs(catalog).filter((input) =>
    input.destinations.includes(careerId)
  );
  const contributors = reachers.filter((r) => selected.has(r.id));
  openCareerPanel(career, contributors, reachers);
}

function wireChrome() {
  const clearBtn = document.getElementById("clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", clearAll);

  const toggle = document.getElementById("filter-toggle");
  const sidebar = document.getElementById("sidebar");
  if (toggle && sidebar) {
    toggle.addEventListener("click", () => {
      const open = sidebar.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  const closeBtn = document.getElementById("panel-close");
  if (closeBtn) closeBtn.addEventListener("click", closePanel);

  const backdrop = document.getElementById("panel-backdrop");
  if (backdrop) backdrop.addEventListener("click", closePanel);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const panel = document.getElementById("detail-panel");
    if (panel && !panel.hidden) closePanel();
  });
}

function init() {
  inputsById = new Map(allInputs(catalog).map((i) => [i.id, i]));
  careersById = new Map((catalog.CAREERS || []).map((c) => [c.id, c]));

  buildSidebar(catalog, toggleInput);
  buildGraph(layout(catalog, { width: 1000, height: 1000 }), {
    onInput: toggleInput,
    onCareer: showCareer,
  });
  wireChrome();

  // Pre-select an illustrative combo (one course per level plus an internship)
  // so the network shows paths opening on first paint, not an empty shell. This
  // is clearly example state the user can clear or change.
  ["cs101", "stats101", "ml301", "mnc-data"].forEach((id) => {
    if (inputsById.has(id)) selected.add(id);
  });

  update();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
