# Open Doors — Option-Value Heat Map for Course Selection

A single-page, static decision-aid for a door-anxious underclassman. It shows
~12 courses as a CSS-grid of tiles colored cool-to-hot by how many career
destinations each course keeps reachable. The destination **count is always
printed on every tile** — a non-color channel that equals the raw count and never
changes; only the **color** responds to a single re-weighting slider that trades
breadth against effort / time-to-payoff. Click a tile to open a detail panel
listing that course's specific destinations.

> **Illustrative dataset, not validated labor-market data.** The numbers here are
> hand-authored to demonstrate the tool, not measured outcomes. Don't make real
> enrollment decisions from them.

## Highlights

- **Inlined dataset.** The course data ships as an ES module (`data/courses.js`),
  so there is no `fetch` and no fetch-error surface. The page runs identically over
  `file://` and on GitHub Pages.
- **Color-only re-weighting.** The slider changes the heat color, never the printed
  destination count — the count is a tested invariant.
- **Self-contained imagery.** Heat legend, icons, and styling are inline SVG/CSS;
  no external assets or build step.
- **Mobile-first responsive layout.**

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

The scoring logic is unit-tested in `test/score.test.js`. Run it with any test
runner that understands ES modules (for example Node's built-in test runner):

```
node --test test/score.test.js
```

The key invariant covered: the destination count printed on each tile equals the
raw count from the dataset and is independent of the slider weight.

## Host on GitHub Pages

1. Push this `app/` directory's contents to the root of a GitHub repository.
2. In the repo: **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**, choose your default branch and the
   **/ (root)** folder, and save.
4. Wait for the Pages build to finish; your site goes live at
   `https://<user>.github.io/<repo>/`.

The included `.nojekyll` file tells GitHub Pages to serve every file verbatim
(including paths that Jekyll would otherwise skip), so the ES-module imports and
static assets load as-is.

## Files

- `index.html` — the page shell.
- `data/courses.js` — inlined course dataset (ES module).
- `score.js` — pure scoring / re-weighting logic.
- `render.js` — DOM rendering (tiles, detail panel, legend).
- `main.js` — wiring and the slider interaction.
- `styles.css` — mobile-first responsive stylesheet.
- `test/score.test.js` — scoring/invariant tests.
