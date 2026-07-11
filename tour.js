// tour.js - a tiny, dependency-free spotlight coach-mark engine.
// startTour(steps) dims the page, cuts a highlight "hole" over each step's
// target element, and shows a short caption with Next / Skip. It is generic:
// the app supplies the steps (target + caption + optional onEnter side effect),
// so the engine knows nothing about courses or careers. Deliberately minimal -
// captions are meant to be a few words; the demonstration does the explaining.

const REDUCED = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Resolve a step's target to a currently-visible element. `target` may be an
// element, a selector string, or a function returning either - a function lets
// the app pick the element that is actually on-screen for this viewport (e.g.
// the sidebar on desktop vs. the "Choose..." toggle on mobile).
function resolveTarget(target) {
  let el = typeof target === "function" ? target() : target;
  if (typeof el === "string") el = document.querySelector(el);
  if (el && el.offsetParent === null && el !== document.body) return null; // hidden
  return el || null;
}

export function startTour(steps, { onDone, storageKey } = {}) {
  const list = (steps || []).filter(Boolean);
  if (!list.length) return;

  const root = document.createElement("div");
  root.className = "tour";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "How to use this page");
  root.innerHTML = `
    <div class="tour__catch"></div>
    <div class="tour__hole" aria-hidden="true"></div>
    <div class="tour__card" role="document">
      <p class="tour__text"></p>
      <div class="tour__foot">
        <div class="tour__dots" aria-hidden="true"></div>
        <div class="tour__actions">
          <button type="button" class="tour__skip">Skip</button>
          <button type="button" class="tour__next">Next</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const hole = root.querySelector(".tour__hole");
  const card = root.querySelector(".tour__card");
  const text = root.querySelector(".tour__text");
  const dots = root.querySelector(".tour__dots");
  const nextBtn = root.querySelector(".tour__next");
  const skipBtn = root.querySelector(".tour__skip");

  list.forEach((_, i) => {
    const d = document.createElement("span");
    d.className = "tour__dot";
    dots.appendChild(d);
  });

  let idx = -1;

  function position(el) {
    if (!el) {
      // No visible target: dim the whole screen, centre the card.
      hole.style.opacity = "0";
      card.style.left = "50%";
      card.style.top = "auto";
      card.style.bottom = "24px";
      card.style.transform = "translateX(-50%)";
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 6;
    const x = Math.max(4, r.left - pad);
    const y = Math.max(4, r.top - pad);
    const w = Math.min(window.innerWidth - 8, r.width + pad * 2);
    const h = Math.min(window.innerHeight - 8, r.height + pad * 2);
    hole.style.opacity = "1";
    hole.style.left = `${x}px`;
    hole.style.top = `${y}px`;
    hole.style.width = `${w}px`;
    hole.style.height = `${h}px`;

    // Prefer placing the card below the target; flip above if it would overflow.
    const cardH = card.offsetHeight || 120;
    const below = y + h + 12;
    const placeBelow = below + cardH < window.innerHeight - 8;
    const top = placeBelow ? below : Math.max(8, y - cardH - 12);
    const cardW = card.offsetWidth || 260;
    let left = Math.min(Math.max(8, x), window.innerWidth - cardW - 8);
    card.style.transform = "none";
    card.style.bottom = "auto";
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function render() {
    const step = list[idx];
    const el = resolveTarget(step.target);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", behavior: REDUCED() ? "auto" : "smooth" });
    }
    text.textContent = step.caption || "";
    nextBtn.textContent = idx === list.length - 1 ? "Done" : "Next";
    dots.querySelectorAll(".tour__dot").forEach((d, i) =>
      d.classList.toggle("is-active", i === idx)
    );
    // Let a smooth scroll settle before measuring the target's rect.
    requestAnimationFrame(() => setTimeout(() => position(el), REDUCED() ? 0 : 120));
  }

  function go(n) {
    idx = n;
    const step = list[idx];
    if (step && typeof step.onEnter === "function") {
      try {
        step.onEnter();
      } catch (_) {
        /* a demo side effect must never break the tour */
      }
    }
    render();
  }

  function finish() {
    window.removeEventListener("resize", reflow);
    window.removeEventListener("scroll", reflow, true);
    document.removeEventListener("keydown", onKey, true);
    root.remove();
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, "1");
      } catch (_) {
        /* private mode: just skip persistence */
      }
    }
    if (typeof onDone === "function") onDone();
  }

  const reflow = () => position(resolveTarget(list[idx] && list[idx].target));
  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
    } else if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      idx < list.length - 1 ? go(idx + 1) : finish();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      go(idx - 1);
    }
  }

  nextBtn.addEventListener("click", () => (idx < list.length - 1 ? go(idx + 1) : finish()));
  skipBtn.addEventListener("click", finish);
  window.addEventListener("resize", reflow);
  window.addEventListener("scroll", reflow, true);
  document.addEventListener("keydown", onKey, true);

  go(0);
  nextBtn.focus();
  return { finish };
}
