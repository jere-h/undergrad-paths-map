// main.js - controller / bootstrap for Open Doors.
// type=module entry point: loads the active catalog from the registry
// (data/catalogs/index.js), builds the sidebar and constellation for it, and
// keeps the map, summary, and panel in sync as the selection changes. When the
// registry lists more than one catalog (e.g. datasets for different
// industries), a tab strip in the header switches between them; selections do
// not carry across tabs because edges are only valid within their own dataset.
import { CATALOGS } from "./data/catalogs/index.js";
import { analyze, summarize, allInputs } from "./score.js";
import { layout } from "./graph.js";
import {
  buildSidebar,
  buildGraph,
  applyState,
  openCareerPanel,
  closePanel,
} from "./render.js";
import { startTour } from "./tour.js";

const INTRO_KEY = "openDoors.introSeen";

// Active catalog module ({ CAREERS, COURSES, INTERNSHIPS }) and its registry entry.
let catalog = null;
let activeEntry = null;

// Selection state: a Set of selected input ids (courses + internships).
const selected = new Set();

let inputsById = new Map();
let careersById = new Map();
let lastAnalysis = null;

function update() {
  lastAnalysis = analyze(selected, catalog);
  applyState(selected, lastAnalysis);
  updateSummary(lastAnalysis);

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

function updateSummary(analysis) {
  const { open, specializations, fadingCount, closedCount } = summarize(analysis, catalog.CAREERS);

  const countEl = document.getElementById("open-count");
  if (countEl) countEl.textContent = String(open);

  const detail = document.getElementById("summary-detail");
  if (!detail) return;

  if (open === 0) {
    detail.textContent = "Nothing selected yet. Your open paths will appear here.";
    return;
  }

  const parts = [];
  if (specializations.length > 0) {
    const names = specializations.slice(0, 2).map((s) => s.name).join(" and ");
    parts.push(`Converging on ${names}`);
  } else {
    parts.push("Broadly open, no strong specialization yet");
  }

  const tail = [];
  tail.push(specializations.length === 1 ? "1 strongly viable" : `${specializations.length} strongly viable`);
  if (fadingCount > 0) {
    tail.push(`${fadingCount} fading as you specialize`);
  }
  if (closedCount > 0) {
    tail.push(`${closedCount} crowded out by your specialization`);
  }
  detail.textContent = `${parts[0]}. ${open} paths reachable, ${tail.join(", ")}.`;
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

function currentPreselect() {
  return (activeEntry && activeEntry.preselect) || ["cs101", "stats101", "ml301", "mnc-data"];
}

// Set the selection to the catalog's demo stack (an overlapping set that shows
// convergence). Used for the first-paint state and to restore it after the
// intro tour, which clears then re-adds it to make the map visibly react.
function selectDemo() {
  selected.clear();
  currentPreselect().forEach((id) => {
    if (inputsById.has(id)) selected.add(id);
  });
  update();
}

// The picker lives in the sidebar on wide screens and behind the "Choose..."
// toggle on mobile; the tour highlights whichever is actually on-screen.
function pickerTarget() {
  const toggle = document.getElementById("filter-toggle");
  if (toggle && toggle.offsetParent !== null) return toggle;
  return document.getElementById("sidebar");
}

// First-open walkthrough. Three steps, show-don't-tell: it empties the map,
// then re-fills it live so the user watches the paths appear and the open
// count jump, rather than reading about it. `force` replays it past the
// localStorage gate (the header "?" button).
function runIntro(force) {
  if (!force) {
    try {
      if (localStorage.getItem(INTRO_KEY)) return;
    } catch (_) {
      /* private mode: treat as unseen, just don't persist later */
    }
  }
  startTour(
    [
      { target: pickerTarget, caption: "Start with a few choices.", onEnter: clearAll },
      { target: () => document.getElementById("map-wrap"), caption: "Watch the paths light up.", onEnter: selectDemo },
      { target: () => document.getElementById("summary"), caption: "See which careers stay open." },
    ],
    { storageKey: force ? null : INTRO_KEY, onDone: selectDemo }
  );
}

function showCareer(careerId) {
  const career = careersById.get(careerId);
  if (!career) return;
  const info = lastAnalysis ? lastAnalysis.careers.get(careerId) || null : null;
  const reachers = allInputs(catalog).filter((input) => input.destinations.includes(careerId));
  const contributors = reachers.filter((r) => selected.has(r.id));
  openCareerPanel(career, info, contributors, reachers);
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

  const introBtn = document.getElementById("intro-btn");
  if (introBtn) introBtn.addEventListener("click", () => runIntro(true));

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

// (Re)build everything that depends on the active catalog. Safe to call on
// every tab switch: buildSidebar/buildGraph clear their containers first.
function initCatalog() {
  closePanel();
  selected.clear();
  inputsById = new Map(allInputs(catalog).map((i) => [i.id, i]));
  careersById = new Map((catalog.CAREERS || []).map((c) => [c.id, c]));

  const disclaimer = document.getElementById("disclaimer");
  if (disclaimer && activeEntry) disclaimer.textContent = activeEntry.note || "";

  // The internship marker legend only makes sense when this catalog actually
  // ships validated-canonical roles alongside posting-clustered ones.
  const internLegend = document.getElementById("legend-internships");
  if (internLegend) internLegend.hidden = !allInputs(catalog).some((i) => i.canonical);

  buildSidebar(catalog, toggleInput);
  buildGraph(layout(catalog, { width: 1000, height: 1000 }), {
    onInput: toggleInput,
    onCareer: showCareer,
  });

  // Pre-select an overlapping stack so the map shows convergence on first
  // paint. Each catalog carries its own preselect (registry); the illustrative
  // demo falls back to its known data-leaning stack. Missing ids are skipped,
  // so a catalog without a preselect simply starts empty.
  const preselect =
    (activeEntry && activeEntry.preselect) || ["cs101", "stats101", "ml301", "mnc-data"];
  preselect.forEach((id) => {
    if (inputsById.has(id)) selected.add(id);
  });

  update();
}

async function activate(entry) {
  // Module specifiers in the registry are relative to data/catalogs/.
  catalog = await import(`./data/catalogs/${entry.module}`);
  activeEntry = entry;
  const tabs = document.getElementById("catalog-tabs");
  if (tabs) {
    tabs.querySelectorAll(".catalog-tab").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.id === entry.id);
      b.setAttribute("aria-selected", b.dataset.id === entry.id ? "true" : "false");
    });
  }
  initCatalog();
}

function buildTabs() {
  const tabs = document.getElementById("catalog-tabs");
  if (!tabs || CATALOGS.length < 2) return;
  tabs.hidden = false;
  CATALOGS.forEach((entry) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "catalog-tab";
    btn.dataset.id = entry.id;
    btn.setAttribute("role", "tab");
    btn.textContent = entry.label;
    btn.addEventListener("click", () => {
      if (activeEntry && activeEntry.id === entry.id) return;
      activate(entry).catch((err) => console.error(`failed to load catalog ${entry.id}`, err));
    });
    tabs.appendChild(btn);
  });
}

function init() {
  wireChrome();
  buildTabs();
  activate(CATALOGS[0])
    .then(() => {
      // Let the first paint settle so the tour can measure real element rects.
      requestAnimationFrame(() => setTimeout(() => runIntro(false), 180));
    })
    .catch((err) => console.error("failed to load default catalog", err));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
