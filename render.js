// render.js - all DOM / SVG concerns for Open Doors.
// Builds the sidebar filter chips, draws the constellation map once, applies the
// open/dim/heat state on every selection change, and runs the detail panel.
// Pure scoring and layout live in score.js / graph.js; this file only touches
// the DOM.
import { allInputs, heat, heatColor } from "./score.js";

const SVGNS = "http://www.w3.org/2000/svg";

// Remembers which element opened the panel so closePanel can restore focus.
let lastFocused = null;

// ---------- Sidebar ----------

// buildSidebar(catalog, onToggle) -> void
// Renders the filter groups (courses by level, internships by org type) into
// #filter-list. Each item is an aria-pressed toggle button wired to onToggle(id).
export function buildSidebar(catalog, onToggle) {
  const root = document.getElementById("filter-list");
  if (!root) return;
  root.textContent = "";

  const inputs = allInputs(catalog);

  const courseGroups = [
    { key: "Level 1000", title: "Level 1000 courses", sub: "Broad introductions that keep many doors open" },
    { key: "Level 2000", title: "Level 2000 courses", sub: "Intermediate courses that start to specialise" },
    { key: "Level 3000", title: "Level 3000 courses", sub: "Advanced courses that commit to a few deep paths" },
  ];
  const internGroups = [
    { key: "MNC", title: "Internships at MNCs", sub: "Large multinational employers" },
    { key: "Small Business", title: "Internships at small businesses", sub: "Lean teams, generalist roles" },
    { key: "Startup", title: "Internships at startups", sub: "Early-stage, high-ownership roles" },
  ];

  [...courseGroups, ...internGroups].forEach((group) => {
    const members = inputs.filter((i) => i.group === group.key);
    if (members.length === 0) return;

    const section = document.createElement("div");
    section.className = "filter-group";

    const title = document.createElement("h3");
    title.className = "filter-group__title";
    title.textContent = group.title;

    const sub = document.createElement("p");
    sub.className = "filter-group__sub";
    sub.textContent = group.sub;

    const row = document.createElement("div");
    row.className = "chip-row";

    members.forEach((input) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.id = input.id;
      chip.setAttribute("aria-pressed", "false");

      const dot = document.createElement("span");
      dot.className = "chip__dot";
      dot.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.textContent = input.label;

      chip.append(dot, label);
      chip.addEventListener("click", () => onToggle(input.id));
      row.appendChild(chip);
    });

    section.append(title, sub, row);
    root.appendChild(section);
  });
}

// ---------- Map ----------

// buildGraph(graph, handlers) -> void
// Draws edges then nodes into the SVG once. Career nodes get a circle + label;
// input nodes get a small marker + label. Clicking a node calls the matching
// handler. Subsequent visual changes are done by applyState, never a redraw.
export function buildGraph(graph, handlers) {
  const edgeLayer = document.getElementById("edges");
  const nodeLayer = document.getElementById("nodes");
  if (!edgeLayer || !nodeLayer) return;
  edgeLayer.textContent = "";
  nodeLayer.textContent = "";

  graph.edges.forEach((edge) => {
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("class", "edge");
    path.setAttribute(
      "d",
      `M ${edge.fromXY.x} ${edge.fromXY.y} Q ${edge.control.x} ${edge.control.y} ${edge.toXY.x} ${edge.toXY.y}`
    );
    path.dataset.from = edge.from;
    path.dataset.to = edge.to;
    edgeLayer.appendChild(path);
  });

  // Careers first (centre), inputs on top so their markers sit above the lines.
  graph.careerNodes.forEach((node) => {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "node-career is-dim");
    g.dataset.id = node.id;
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `${node.label} career path`);

    const circle = document.createElementNS(SVGNS, "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", "9");

    const text = document.createElementNS(SVGNS, "text");
    text.setAttribute("class", "node-label");
    text.setAttribute("x", node.x);
    text.setAttribute("y", node.y - 16);
    text.setAttribute("text-anchor", "middle");
    text.textContent = node.label;

    g.append(circle, text);
    g.addEventListener("click", () => handlers.onCareer(node.id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlers.onCareer(node.id);
      }
    });
    nodeLayer.appendChild(g);
  });

  graph.inputNodes.forEach((node) => {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", `node-input kind-${node.kind}`);
    g.dataset.id = node.id;
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-pressed", "false");
    g.setAttribute("aria-label", `${node.label}, ${node.group}`);

    const marker = document.createElementNS(SVGNS, node.kind === "internship" ? "rect" : "circle");
    if (node.kind === "internship") {
      marker.setAttribute("x", node.x - 7);
      marker.setAttribute("y", node.y - 7);
      marker.setAttribute("width", "14");
      marker.setAttribute("height", "14");
    } else {
      marker.setAttribute("cx", node.x);
      marker.setAttribute("cy", node.y);
      marker.setAttribute("r", "7");
    }

    // Label grows INWARD toward the centre (into the empty band between the ring
    // and the career cluster) so a long label never clips at the canvas edge.
    // Hidden by default; CSS reveals it on selection / hover / focus.
    const onLeft = node.x < graph.center.x;
    const text = document.createElementNS(SVGNS, "text");
    text.setAttribute("class", "node-label");
    text.setAttribute("x", node.x + (onLeft ? 14 : -14));
    text.setAttribute("y", node.y + 4);
    text.setAttribute("text-anchor", onLeft ? "start" : "end");
    text.textContent = node.label;

    g.append(marker, text);
    g.addEventListener("click", () => handlers.onInput(node.id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlers.onInput(node.id);
      }
    });
    nodeLayer.appendChild(g);
  });
}

// applyState(selectedIds, reachMap, max) -> void
// Repaints the existing SVG to reflect the current selection: edges from a
// selected input light up, reached careers open (size + heat color) and the
// rest dim, selected input markers fill. No nodes are created or destroyed.
export function applyState(selectedIds, reachMap, max) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);

  document.querySelectorAll(".edge").forEach((edge) => {
    const active = selected.has(edge.dataset.from) && reachMap.has(edge.dataset.to);
    edge.classList.toggle("is-active", active);
  });

  document.querySelectorAll(".node-career").forEach((node) => {
    const id = node.dataset.id;
    const count = reachMap.get(id) || 0;
    const circle = node.querySelector("circle");
    if (count > 0) {
      const t = heat(count, max);
      const color = heatColor(t);
      node.classList.add("is-open");
      node.classList.remove("is-dim");
      if (circle) {
        circle.style.fill = color;
        circle.setAttribute("r", String(9 + Math.round(t * 8)));
      }
    } else {
      node.classList.remove("is-open");
      node.classList.add("is-dim");
      if (circle) {
        circle.style.fill = "";
        circle.setAttribute("r", "9");
      }
    }
  });

  document.querySelectorAll(".node-input").forEach((node) => {
    const isSel = selected.has(node.dataset.id);
    node.classList.toggle("is-selected", isSel);
    node.setAttribute("aria-pressed", isSel ? "true" : "false");
  });

  // Mirror selection onto the sidebar chips.
  document.querySelectorAll(".chip").forEach((chip) => {
    const isSel = selected.has(chip.dataset.id);
    chip.setAttribute("aria-pressed", isSel ? "true" : "false");
  });
}

// ---------- Detail panel ----------

// openCareerPanel(career, contributors, allReachers) -> void
// Shows which selected inputs currently open a career, plus every input that
// could. contributors / allReachers are arrays of { label, group }.
export function openCareerPanel(career, contributors, allReachers) {
  const panel = document.getElementById("detail-panel");
  const backdrop = document.getElementById("panel-backdrop");
  const title = document.getElementById("panel-title");
  const lead = document.getElementById("panel-lead");
  const list = document.getElementById("panel-list");
  if (!panel || !list) return;

  lastFocused = document.activeElement;

  if (title) title.textContent = career.name;
  if (lead) {
    lead.textContent = contributors.length
      ? `Opened by ${contributors.length} of your current choices. Every choice that can reach it:`
      : "Not open yet. Choices that can reach it:";
  }

  list.textContent = "";
  allReachers.forEach((reacher) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = reacher.label;
    const group = document.createElement("span");
    group.className = "muted";
    const isActive = contributors.some((c) => c.label === reacher.label);
    group.textContent = isActive ? `${reacher.group}, selected` : reacher.group;
    li.append(name, group);
    list.appendChild(li);
  });

  panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  const close = document.getElementById("panel-close");
  if (close) close.focus();
}

// closePanel() -> void
export function closePanel() {
  const panel = document.getElementById("detail-panel");
  const backdrop = document.getElementById("panel-backdrop");
  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  lastFocused = null;
}
