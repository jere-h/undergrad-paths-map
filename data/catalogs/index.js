// Catalog registry - the datasets the app can display as tabs.
//
// Each entry: { id, label, module, note }
//   module - import specifier RELATIVE TO THIS FILE (main.js resolves it as
//            "./data/catalogs/" + module).
//   note   - the epistemic banner shown in the header while this catalog is
//            active. Keep it honest: say what the dataset's edges actually are.
//
// Entries are added by scripts/register-catalog.mjs (the ground-catalog
// workflow does this on gate-passing full runs with apply: true), or by hand.
// With a single entry the tab strip stays hidden and the app behaves exactly
// as before.

export const CATALOGS = [
  {
    id: "illustrative",
    label: "Demo",
    module: "../catalog.js",
    note: "Illustrative dataset, not validated curriculum or labor-market data.",
  },
  {
    id: "tech",
    label: "Tech (MIT pilot)",
    module: "./tech.js",
    note: "Evidence-grounded pilot slice: 3 careers, MIT EECS courses, live intern postings. Edges are a verified skill-overlap heuristic over official descriptions and postings, not measured student outcomes.",
  },
];
