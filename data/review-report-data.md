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

## Judgment tier: adjacency inference

A later structural addition lets the workflow assert relationships that are
professionally true even without direct course/posting evidence. An LLM judges
directional **career scope overlap** (e.g. `data-scientist → data-analyst`
0.75: a DS qualification largely covers a DA role; the reverse only 0.35), and
the assembler propagates **softer, clearly-marked "inferred" edges** along it.
Inferred edges are dampened (×0.55 in the app, so they draw thinner/dashed),
capped per input, never shadow a directly-grounded edge, and never chain.

Effect on this dataset: **+11 inferred edges**. Data Analyst went from 1 direct
edge (starved) to 7 (1 direct internship + 6 inferred via Data Scientist) — the
Data-Science courses now also keep the Data-Analyst path reachable, exactly the
overlapping-scope relationship a practitioner would affirm. BI Analyst 1 → 4.
The map is both more expressive and better balanced (Gini fell 0.42 → 0.33), so
no hub trimming was needed. Careers reachable *only* via inference are flagged
`meta.flags.inferenceOnlyCareers`; their reachability rests on judgment, not
evidence, and the detail panel labels those links "(scope overlap)".

analytics-engineer stayed dropped: even with adjacency, no directly-supported
neighbor propagated an edge above the inference floor to it.

## Judgment tier 2: user-intuition gap review

A user-perspective review found 20 of 32 courses opening fewer doors than
their level promises — worst, foundational 1000-level courses with a single
destination ("Introduction to Probability" → statistician only; "Linear
Algebra" → ml-engineer only). Structural cause: the distinctive-skill rule
that prevents saturation also under-connects foundational material, whose
value to several careers flows through skills distinctive to none of them.

The gap-review agent proposed **23 judged edges** (confidence 0.45–0.65, each
with an advisor-defensible rationale, ≤2 per input), and showed honest
restraint: it left the pure-theory Combinatorial Optimization course narrow
and declined to force edges to data-engineer/data-architect, correctly naming
their sparsity a *coverage* gap (MIT's applied-database offerings beyond
6.1830/6.5831 were dropped upstream), not a judgment gap.

**Balance held**: the agent over-proposed toward data-scientist (as it
predicted), and the in-degree balancer trimmed the 10 weakest judged edges to
keep the hub at 24% share. Net: sparse inputs 20 → 12, and every repaired
course now opens 2 doors instead of 1. The remaining 12 sit at 2 destinations
against the 1000-level aspiration of 3 — the deliberate ceiling of an 8-career
map, where giving every intro course 3+ doors would re-saturate the hubs the
gates exist to prevent.

## Distribution (post-balance + both judgment tiers)

- Careers: 8 · Courses: 32 · Internship roles: 1 · Edges: 70
  (46 direct + 11 adjacency-inferred + 23 gap-judged, minus 10 balance-trimmed)
- Max career in-degree share 24% (cap 25%) · **Gini 0.34** (cap 0.45)
- Judged-edge rationales preserved in `data/sources/data/edges-gap/judged.json`

## What a human should confirm before this stays the default map

1. Accept the quant-skew limitation and the Aug–Oct internship refresh plan,
   **or** narrow the advertised career set to the well-supported quant core.
2. Decide data-engineer vs data-architect: keep separate or merge (SOC collision).
3. Spot-check the data-analyst ↔ business-operations-intern edge; it is the
   single weakest link and the only thing keeping data-analyst reachable.
4. Confirm dropping analytics-engineer is acceptable (vs sourcing dedicated
   evidence for it).
