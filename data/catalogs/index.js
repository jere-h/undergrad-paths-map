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
    id: "data",
    label: "Data",
    module: "./data.js",
    note: "Evidence-grounded Data-industry map (MIT courses, O*NET, live postings). Course and clustered-internship edges are a verified skill-overlap heuristic over official descriptions and postings, not measured outcomes. Internship roles marked as common roles (diamonds) are validated to exist at real employers via the SimplifyJobs list and web postings; their career links are judgment-based. Some near-duplicate courses are collapsed for brevity (see data/review-report-data.md).",
    preselect: ["mit-18-05","mit-6-c01","mit-18-650-j","mit-6-3900","mnc-data-scientist-intern"],
  },
  {
    id: "accounting-sg",
    label: "Accounting (Singapore)",
    module: "./accounting-sg.js",
    note: "Evidence-grounded dataset (NTU, live postings, O*NET). Edges are a verified skill-overlap heuristic over official descriptions and postings, not measured student outcomes.",
  },
];
