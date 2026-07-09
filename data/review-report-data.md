# Human sign-off report — ground-catalog, Data industry

- **Run:** `data-20260709T180456Z` · MIT · O*NET 29.1 · generated 2026-07-09
- **Dataset:** `data/datasets/data.json` → `data/catalogs/data.js` (app tab "Data")
- **Verdict:** full gates **PASS** (0 errors, 8 warnings) after the v3.1
  structural fixes below. This report supersedes the first-pass report; the
  initial assembly failed validation and drove the workflow improvements.

## What this dataset is (read before trusting it)

Edges are a **verified skill-overlap heuristic** over official MIT course
descriptions, the O*NET occupational database, and live intern postings. It is
requirement-side evidence, **not measured student outcomes**. No placement or
alumni data supports any edge.

## The headline limitation (honest, and structural to the evidence base)

**This map over-represents the quantitative/research data careers and
under-represents applied data roles — because that is what the evidence base
actually contains, not a bug.** Four careers (data-scientist, statistician,
ml-engineer, operations-research-analyst) hold ~87% of edges; data-engineer,
data-architect, BI-analyst, and data-analyst are thin.

Two causes, both real:

1. **MIT's catalog is theory-heavy.** It teaches probability, optimization,
   ML, and statistics (which genuinely feed the quant careers) far more than
   applied data engineering, ELT/warehousing, BI tooling, or "data analysis as
   a job." Database Systems (6.5831) and Software Systems for Data Science
   (6.1830) *do* ground data-engineer/data-architect, but there are only a
   handful of such courses.
2. **Internship evidence was seasonally unavailable.** Probed across ~20
   data-focused company boards (Databricks, Snowflake, Datadog, MongoDB,
   Instacart, Cloudflare, Plaid, …) on 2026-07-09, only 3 data-relevant
   entry-level postings existed, all PhD ML-research internships. Summer
   intern reqs are already filled in July; applied data-analyst/engineer
   intern postings were not on public ATS boards. Re-running the internship
   stage was therefore **contraindicated** — it would have added only more
   research-role evidence and worsened the quant skew.

**Recommendation:** refresh the internship-derived edges in Aug–Oct when the
next cycle's postings open; the applied-role coverage should improve
materially then. Until then, treat applied-role reachability as course-limited.

## Structural workflow improvements this run produced (v3.1)

The first assembly failed with hub saturation (Gini 0.52, statistician 30% of
edges) and orphan/path-closed careers. Three deterministic, generalizable
fixes (in `scripts/`, unit-tested) fixed it without fabricating evidence:

1. **In-degree balancing** (`assemble-dataset.mjs`): greedily trims the most
   over-represented career's *weakest* valid edges until the share/Gini gates
   hold. Trimmed 5 edges here. Never fabricates; never orphans an input.
2. **Coverage-gate recalibration** (`validate-dataset.mjs`): a career reachable
   only via internships is genuinely reachable, so course-only-absent is now a
   *warning*, not a failure. Hard failure is reserved for zero *total* support.
3. **Unsupported-career reconciliation** (`assemble-dataset.mjs`): a career
   reached by nothing is dropped into `meta.flags.unsupportedCareers` rather
   than shipped as an orphan / "path closed" node.

## Flags

| Flag | Value |
|---|---|
| Dropped as unsupported | **analytics-engineer** (0 valid course edges, no data intern postings on the seeded/probed boards; a real but MIT-untaught, ATS-sparse role) |
| SOC collision | **data-engineer / data-architect** (both 15-1243.00 Database Architects); kept separate but both thin — a merge is defensible |
| Internship-only | **data-analyst** (sole support: one MNC business-operations intern role; weakest career in the set) |
| Internship-starved (course-only) | data-scientist, statistician, ml-engineer, or-analyst, data-engineer, data-architect, bi-analyst |
| Edges trimmed for balance | 5 |
| Dropped inputs (no surviving edges) | 16 courses + 1 internship (mostly non-data econ/math courses that correctly matched no data career) |

## Distribution (post-balance)

- Careers: 8 · Courses: 32 · Internship roles: 1 · Edges: 41
- In-degree: data-scientist 24%, statistician 24%, ml-engineer 22%,
  or-analyst 17%, data-engineer 5%, bi-analyst 2%, data-analyst 2%,
  data-architect 2%
- Career in-degree **Gini 0.42** (cap 0.45) · same-level course mean
  Jaccard 0.15–0.23 (courses are well-differentiated)

## What a human should confirm before this stays the default map

1. Accept the quant-skew limitation and the Aug–Oct internship refresh plan,
   **or** narrow the advertised career set to the well-supported quant core.
2. Decide data-engineer vs data-architect: keep separate or merge (SOC collision).
3. Spot-check the data-analyst ↔ business-operations-intern edge; it is the
   single weakest link and the only thing keeping data-analyst reachable.
4. Confirm dropping analytics-engineer is acceptable (vs sourcing dedicated
   evidence for it).
