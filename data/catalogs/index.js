// Catalog registry - the datasets the app can display as tabs.
//
// Each entry: { id, label, module, note, preselect? }
//   module    - import specifier RELATIVE TO THIS FILE (main.js resolves it as
//               "./data/catalogs/" + module).
//   note      - the epistemic banner shown in the header while this catalog is
//               active. Keep it honest: say what the dataset's edges actually are.
//   preselect - optional input ids selected on first paint so a default tab
//               opens on a meaningful convergence instead of an empty map.
//
// Entries are added by scripts/register-catalog.mjs (the ground-catalog
// workflow does this on gate-passing full runs with apply: true), or by hand.
// With a single entry the tab strip stays hidden. The FIRST entry is the
// default tab shown on load - the Data-industry map is now the app's primary
// content; the illustrative demo is kept as a clearly-labeled reference tab.

export const CATALOGS = [
  {
    id: "data",
    label: "Data",
    module: "./data.js",
    note: "Evidence-grounded Data-industry map (MIT courses, O*NET, live postings). Edges are a verified skill-overlap heuristic over official descriptions and postings, not measured outcomes. Skews toward quantitative roles: applied-data internship evidence was seasonally sparse (see data/review-report-data.md).",
    preselect: ["mit-18-05", "mit-6-3720", "mit-6-c01", "mit-18-650-j", "mit-14-38"],
  },
  {
    id: "tech",
    label: "Tech (MIT pilot)",
    module: "./tech.js",
    note: "Evidence-grounded pilot slice: 3 careers, MIT EECS courses, live intern postings. Edges are a verified skill-overlap heuristic over official descriptions and postings, not measured student outcomes.",
  },
  {
    id: "illustrative",
    label: "Demo (illustrative)",
    module: "../catalog.js",
    note: "Illustrative dataset, not validated curriculum or labor-market data.",
  },
];
