// render.js - all DOM / SVG concerns for Open Doors.
// Builds the sidebar filter chips, draws the constellation map once, applies the
// strength + convergence state on every selection change, and runs the detail
// panel. Pure scoring and layout live in score.js / graph.js; this file only
// touches the DOM.
import {
  allInputs,
  heatColor,
  strengthWidth,
  strengthDash,
} from "./score.js";

const SVGNS = "http://www.w3.org/2000/svg";

// Remembers which element opened the panel so closePanel can restore focus.
let lastFocused = null;

// ---------- Sidebar ----------

// buildSidebar(catalog, onToggle) -> void
export function buildSidebar(catalog, onToggle) {
  const root = document.getElementById("filter-list");
  if (!root) return;
  root.textContent = "";

  const inputs = allInputs(catalog);

  // Course levels are fixed by the strength model; internship sections are
  // driven by whatever org types the catalog actually ships, so a dataset for
  // another industry (hospitals, agencies, government) renders without edits.
  const KNOWN_ORG = {
    MNC: { title: "Internships at MNCs", sub: "Large multinational employers" },
    "Small Business": { title: "Internships at small businesses", sub: "Lean teams, generalist roles" },
    Startup: { title: "Internships at startups", sub: "Early-stage, high-ownership roles" },
  };
  const orgTypes = [...new Set(inputs.filter((i) => i.kind === "internship").map((i) => i.orgType))];
  const groups = [
    { key: "Level 1000", title: "Level 1000 courses", sub: "Broad introductions, weak links to many fields" },
    { key: "Level 2000", title: "Level 2000 courses", sub: "Intermediate courses that start to specialise" },
    { key: "Level 3000", title: "Level 3000 courses", sub: "Advanced courses, strong links to a few paths" },
    ...orgTypes.map((t) => ({
      key: t,
      title: (KNOWN_ORG[t] && KNOWN_ORG[t].title) || `Internships: ${t}`,
      sub: (KNOWN_ORG[t] && KNOWN_ORG[t].sub) || "Internship roles at this kind of employer",
    })),
  ];

  groups.forEach((group) => {
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
    // Honesty note when the group mixes evidence-clustered and canonical
    // roles: the group prose must not claim posting evidence for all members.
    if (members.some((m) => m.canonical)) {
      sub.textContent +=
        " Roles marked “common role” are validated to exist at real employers; their career links are judgment-based.";
    }

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
      if (input.canonical) {
        chip.classList.add("chip--canonical");
        const badge = document.createElement("span");
        badge.className = "chip__badge";
        badge.textContent = "common role";
        chip.appendChild(badge);
        chip.title =
          "Common intern role, validated to exist at real employers; career links are judgment-based.";
      }
      chip.addEventListener("click", () => onToggle(input.id));
      row.appendChild(chip);
    });

    section.append(title, sub, row);
    root.appendChild(section);
  });
}

// ---------- Map ----------

// buildGraph(graph, handlers) -> void
// Draws edges then nodes once. Each edge stores its strength weight and is given
// its resting (unselected) thin-dotted style; applyState restyles per selection.
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
    path.dataset.weight = String(edge.weight);
    // Resting style: thin + dotted per strength, very faint.
    path.style.strokeWidth = String(strengthWidth(edge.weight) * 0.7);
    path.style.strokeDasharray = strengthDash(edge.weight);
    edgeLayer.appendChild(path);
  });

  graph.careerNodes.forEach((node) => {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "node-career is-dim");
    g.dataset.id = node.id;
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `${node.label} career path`);

    // Transparent enlarged hit area so even a small faded dot is easy to tap.
    // Inline styles beat the node-circle stylesheet rules so it stays invisible.
    const hit = document.createElementNS(SVGNS, "circle");
    hit.setAttribute("class", "hit");
    hit.setAttribute("cx", node.x);
    hit.setAttribute("cy", node.y);
    hit.setAttribute("r", "20");
    hit.style.fill = "transparent";
    hit.style.stroke = "none";
    hit.style.pointerEvents = "all";

    const circle = document.createElementNS(SVGNS, "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", "8");

    const text = document.createElementNS(SVGNS, "text");
    text.setAttribute("class", "node-label");
    text.setAttribute("x", node.x);
    text.setAttribute("y", node.y - 16);
    text.setAttribute("text-anchor", "middle");
    text.textContent = node.label;

    g.append(hit, circle, text);
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
    g.setAttribute(
      "class",
      `node-input kind-${node.kind}${node.canonical ? " is-canonical" : ""}`
    );
    g.dataset.id = node.id;
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-pressed", "false");
    g.setAttribute(
      "aria-label",
      `${node.label}, ${node.group}` +
        (node.canonical ? ", common intern role (validated to exist; career links judgment-based)" : "")
    );

    // Transparent enlarged hit area, same idea as career nodes.
    const hit = document.createElementNS(SVGNS, "circle");
    hit.setAttribute("class", "hit");
    hit.setAttribute("cx", node.x);
    hit.setAttribute("cy", node.y);
    hit.setAttribute("r", "16");
    hit.style.fill = "transparent";
    hit.style.stroke = "none";
    hit.style.pointerEvents = "all";
    g.appendChild(hit);

    const marker = document.createElementNS(SVGNS, node.kind === "internship" ? "rect" : "circle");
    if (node.kind === "internship") {
      marker.setAttribute("x", node.x - 7);
      marker.setAttribute("y", node.y - 7);
      marker.setAttribute("width", "14");
      marker.setAttribute("height", "14");
      // Canonical roles draw as a DIAMOND: a shape distinction (not a
      // dash/hollow one, which already encode edge weakness and crowded-out
      // careers) that survives the solid selection fill.
      if (node.canonical) marker.setAttribute("transform", `rotate(45 ${node.x} ${node.y})`);
    } else {
      marker.setAttribute("cx", node.x);
      marker.setAttribute("cy", node.y);
      marker.setAttribute("r", "7");
    }

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

// applyState(selectedIds, analysis) -> void
// Repaints the existing SVG from the convergence analysis:
//   - edges keep their strength-based thickness / dottedness; active edges into
//     a viable career brighten and thicken, edges into a fading career recede.
//   - reached careers take a heat colour + size from their strength; faded ones
//     dim and drop their label; converged ones become bold specializations.
export function applyState(selectedIds, analysis) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const careers = analysis.careers;

  document.querySelectorAll(".edge").forEach((edge) => {
    const weight = parseFloat(edge.dataset.weight) || 0;
    const baseWidth = strengthWidth(weight);
    const info = careers.get(edge.dataset.to);
    const active = selected.has(edge.dataset.from) && !!info;

    edge.classList.toggle("is-active", active);
    edge.style.strokeDasharray = strengthDash(weight);

    if (active) {
      const faded = info.faded;
      // Strong target -> thicker, brighter. Faded target -> recede.
      edge.style.strokeWidth = String(baseWidth * (0.7 + 0.7 * info.strength));
      edge.style.stroke = faded ? "var(--color-line)" : "var(--color-accent)";
      edge.style.opacity = faded ? "0.18" : String(0.45 + 0.5 * info.strength);
    } else {
      edge.style.strokeWidth = String(baseWidth * 0.7);
      edge.style.stroke = "";
      edge.style.opacity = "";
    }
  });

  document.querySelectorAll(".node-career").forEach((node) => {
    const info = careers.get(node.dataset.id);
    const circle = node.querySelector("circle:not(.hit)");
    node.classList.remove("is-open", "is-dim", "tier-specialization", "tier-open", "tier-fading", "tier-closed");

    if (info) {
      node.classList.add("is-open", `tier-${info.tier}`);
      if (circle) {
        // Crowded-out careers shrink harder than faded ones and lose their heat.
        circle.style.fill = info.closed ? "" : heatColor(info.strength);
        const base = 8 + Math.round(info.strength * 12);
        circle.setAttribute("r", String(info.closed ? 5 : info.faded ? Math.round(base * 0.6) : base));
      }
    } else {
      node.classList.add("is-dim");
      if (circle) {
        circle.style.fill = "";
        circle.setAttribute("r", "8");
      }
    }
  });

  document.querySelectorAll(".node-input").forEach((node) => {
    const isSel = selected.has(node.dataset.id);
    node.classList.toggle("is-selected", isSel);
    node.setAttribute("aria-pressed", isSel ? "true" : "false");
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    const isSel = selected.has(chip.dataset.id);
    chip.setAttribute("aria-pressed", isSel ? "true" : "false");
  });
}

// ---------- Detail panel ----------

// openCareerPanel(career, info, contributors, allReachers) -> void
// career carries the end-goal content (responsibilities + skills). info is the
// analysis entry for this career (or null when nothing reaches it).
export function openCareerPanel(career, info, contributors, allReachers) {
  const panel = document.getElementById("detail-panel");
  const backdrop = document.getElementById("panel-backdrop");
  const title = document.getElementById("panel-title");
  const status = document.getElementById("panel-status");
  const body = document.getElementById("panel-body");
  if (!panel || !body) return;

  lastFocused = document.activeElement;
  if (title) title.textContent = career.name;

  if (status) {
    if (!info) {
      status.textContent = "Not open yet by your current choices.";
    } else if (info.tier === "specialization") {
      status.textContent = `A strong specialization right now, opened by ${labelCount(contributors.length)}.`;
    } else if (info.tier === "closed") {
      status.textContent =
        "Crowded out by your current specialization: your committed picks point elsewhere. " +
        "Not gone for good, but reopening it would take choices that lead here.";
    } else if (info.tier === "fading") {
      status.textContent = `Reachable, but fading behind your stronger paths. Opened by ${labelCount(contributors.length)}.`;
    } else {
      status.textContent = `An open path, opened by ${labelCount(contributors.length)}.`;
    }
  }

  body.textContent = "";

  // Honesty note: this role has no advanced (3000-level) course opening it, so
  // it never surfaces when a student explores senior electives. Say so, and
  // point at the real path, rather than let the career silently disappear.
  if (career.courseworkThin) {
    const note = document.createElement("p");
    note.className = "panel-note";
    note.textContent =
      "No advanced (Level 3000) course here maps to this role. You reach it " +
      "through internships and earlier courses, not senior electives - so it " +
      "won't surface on its own when you pick advanced courses.";
    body.appendChild(note);
  }

  // The end goal: what this job actually is, so the courses and internships
  // become a means to demonstrating these in a resume and interview.
  body.appendChild(
    pointSection(
      "What you would actually do",
      career.responsibilities || [],
      "Common responsibilities for this role."
    )
  );
  body.appendChild(
    pointSection(
      "Skills to demonstrate",
      career.skills || [],
      "What the courses and internships are really for: be able to show these, not just list them."
    )
  );

  // How the current selection connects to this job.
  const reachSection = document.createElement("section");
  reachSection.className = "panel-section";
  const reachTitle = document.createElement("h3");
  reachTitle.className = "panel-section__title";
  reachTitle.textContent = "How your selections open this";
  reachSection.appendChild(reachTitle);
  const list = document.createElement("ul");
  list.className = "detail-panel__list";
  allReachers.forEach((reacher) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = reacher.label;
    const group = document.createElement("span");
    group.className = "muted";
    const isActive = contributors.some((c) => c.id === reacher.id);
    // An inferred reacher opens this career by judgment (career scope overlap
    // or gap review), not a direct skill match; label it so the softer link is
    // explained, not mysterious. Canonical roles say what they are outright.
    const viaJudgment = reacher.inferred && reacher.inferred.has(career.id);
    const suffix = reacher.canonical
      ? " (common role, judgment-based)"
      : viaJudgment
      ? " (judgment-based)"
      : "";
    group.textContent = (isActive ? `${reacher.group}, selected` : reacher.group) + suffix;
    li.append(name, group);
    list.appendChild(li);
  });
  reachSection.appendChild(list);
  body.appendChild(reachSection);

  panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  panel.scrollTop = 0;
  const close = document.getElementById("panel-close");
  if (close) close.focus();
}

// Build a titled section of bullet-style points (responsibilities / skills).
function pointSection(titleText, items, note) {
  const section = document.createElement("section");
  section.className = "panel-section";

  const title = document.createElement("h3");
  title.className = "panel-section__title";
  title.textContent = titleText;
  section.appendChild(title);

  if (note) {
    const p = document.createElement("p");
    p.className = "panel-section__note";
    p.textContent = note;
    section.appendChild(p);
  }

  const ul = document.createElement("ul");
  ul.className = "panel-points";
  items.forEach((text) => {
    const li = document.createElement("li");
    li.className = "panel-points__item";
    li.textContent = text;
    ul.appendChild(li);
  });
  section.appendChild(ul);
  return section;
}

function labelCount(n) {
  return n === 1 ? "1 of your choices" : `${n} of your choices`;
}

export function closePanel() {
  const panel = document.getElementById("detail-panel");
  const backdrop = document.getElementById("panel-backdrop");
  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  lastFocused = null;
}
