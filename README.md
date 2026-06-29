# Open Doors - map the paths your choices open

A single-page, static decision-aid for an undergraduate weighing what to take.
Pick **courses** (grouped by level 1000 / 2000 / 3000) and **internship roles**
(grouped by employer type: MNC, small business, startup) from the left sidebar,
and a constellation network on the right lights up the **career paths each choice
keeps reachable**. A career glows brighter the more of your selections reach it,
so broad early choices open many doors while a stack of related picks makes a few
paths burn bright.

> **Illustrative dataset, not validated curriculum or labor-market data.** The
> courses, internships, and the careers they map to are hand-authored to
> demonstrate the tool, not measured outcomes. Do not make real enrollment
> decisions from them.

## How it works

- **Left sidebar:** toggle the courses and internship roles you are considering.
  A live count and a "Clear all" keep the selection manageable.
- **Right network:** career nodes sit in the centre; your selected courses and
  internships ring the outside and draw links inward to the careers they open.
  Unreached careers stay as faint dots.
- **Link strength:** each link is drawn by how committal the qualification is. A
  Level 1000 intro draws thin dotted threads to its many fields; a Level 3000
  course or an internship draws bold solid lines to its few. (Strength: 1000 <
  2000 < 3000 < internship.)
- **Convergence, not just breadth:** a career's support is the summed strength of
  the selected inputs that reach it. Where your picks overlap, support stacks and
  that career becomes a hot, larger **specialization** with bold links. Careers
  touched by only a stray pick fall behind and **fade** (dim, thin dotted, no
  label). They stay reachable, just de-emphasised, so adding more qualifications
  sharpens your direction instead of cluttering the map. The summary band names
  the specializations you are converging on.
- **Detail panel:** tap any career to see whether it is a specialization, open,
  or fading, which of your current choices open it, and every choice that could.

## Highlights

- **Inlined dataset.** The catalog ships as an ES module (`data/catalog.js`), so
  there is no `fetch` and no fetch-error surface. The page runs identically over
  `file://` and on GitHub Pages.
- **Pure, tested core.** Reachability and heat (`score.js`) and the constellation
  layout (`graph.js`) are DOM-free and unit-tested with Node's test runner.
- **Self-contained.** Every visual is inline SVG / CSS; no external assets, no
  build step.
- **Mobile-first and responsive.** The sidebar collapses into a sheet on phones;
  the network never overflows the viewport.

## Run locally

No build, no server, no dependencies. Just open the file:

```
# from this directory
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

Because the dataset is an inlined ES module and nothing is fetched, opening
`index.html` directly over `file://` works exactly like the hosted version.

## Tests

The pure logic is unit-tested. Run the suite with Node's built-in test runner:

```
node --test
```

`test/score.test.js` covers reachability counting, reinforcement heat, the color
ramp, and a catalog-integrity guard. `test/graph.test.js` covers the layout
geometry (bounds, central careers, left/right input placement, edge count,
determinism).

## Host on GitHub Pages

This repository deploys itself: a GitHub Actions workflow
(`.github/workflows/deploy-pages.yml`) publishes the repo root to GitHub Pages on
every push to `main`. The included `.nojekyll` file tells Pages to serve every
file verbatim so the ES-module imports load as-is.

## Files

- `index.html` - the page shell (header, sidebar, map, detail panel).
- `data/catalog.js` - inlined courses, internships, and careers (ES module).
- `score.js` - pure reachability + reinforcement-heat logic.
- `graph.js` - pure constellation layout (node positions and edges).
- `render.js` - DOM / SVG rendering (sidebar, map, detail panel).
- `main.js` - controller: selection state and wiring.
- `styles.css` - mobile-first responsive stylesheet.
- `test/` - Node unit tests for the pure modules.
