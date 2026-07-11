# Human sign-off report — ground-catalog, Data industry

- **Run:** `data-20260709T180456Z`, internship-variety pass **2026-07-11** ·
  MIT · O*NET 29.1
- **Dataset:** `data/datasets/data.json` → `data/catalogs/data.js` (app tab "Data")
- **Verdict:** full gates **PASS** (0 errors, 2 warnings). This report
  supersedes the v3.1 report; the 2026-07-11 pass added the internship-variety
  detection gate, broadened intern grounding, and the validated-canonical
  internship tier (docs/internship-variety-plan.md).

## What this dataset is (read before trusting it)

Edges are a **verified skill-overlap heuristic** over official MIT course
descriptions, the O*NET occupational database, and live intern postings. It is
requirement-side evidence, **not measured student outcomes**. No placement or
alumni data supports any edge. Internship roles come in two honestly-marked
tiers (see below): posting-clustered (real postings, ≥2 employers, skills from
posting text) and **validated-canonical** (a common role validated to *exist*
at real employers, but whose career links are judgment, not measured).

## Headline change (2026-07-11): the one-internship problem is fixed

The prior run shipped **exactly one internship** (`mnc-business-operations-intern`)
reaching 2 careers, with 6 of 8 careers flagged internship-starved — an
unrealistic and unhelpful map. Root causes were diagnosed and repaired:

- The internship stage consumed only Greenhouse/Lever boards, which in
  mid-July carried almost no data-intern postings (seasonal drought).
- The ≥2-distinct-companies rule (correct) killed nearly every cluster when
  one board dominated.
- The planned SimplifyJobs breadth source had never been implemented.
- Internship edges came only from the direct-evidence tier, so thin postings
  meant thin internship coverage.

**Result now: 7 internship roles reaching ALL 9 careers; zero
internship-starved.** A deterministic **variety gate** (≥4 roles) and
**coverage gate** (internship edges must reach ≥4 careers at ≥6-career scale)
now FAIL any full run that regresses — the scarcity can never silently return.

## Internship tiers (both shipped, visibly distinguished)

The app draws posting-clustered roles as **squares** and canonical roles as
**diamonds**, with a legend, a "common role" chip badge, and a detail-panel
"(common role, judgment-based)" label on canonical career links.

### Tier 1 — posting-clustered (4 roles)

Real postings, ≥2 distinct employers, `requiredSkills` extracted from posting
text (ATS `content` or a web-fetched, snapshotted posting).

| Role | Employers | Home career | Skill source |
|---|---|---|---|
| Business Operations Intern | Airbnb, Palantir, Stripe | data-analyst | ATS postings |
| Data Scientist Intern | Uber Freight, TikTok, Home Depot, BCG, SOTI | data-scientist | Uber Freight posting (`web-data-scientist-intern-1.txt`) |
| Data Engineer Intern | Hone Health, Tesla, TikTok, Medpace, Jump Trading | data-engineer | Hone Health posting (`web-data-engineer-intern-1.txt`) |
| Machine Learning Engineer Intern | Neuralink, Instacart, ByteDance, PlusAI, PayPal | ml-engineer | Neuralink posting (`web-ml-engineer-intern-1.txt`) |

The three new roles were clustered from the broadened pool (SimplifyJobs list +
web-fetched postings). Their non-home edges (e.g. data-scientist-intern →
statistician 0.68) fell below the 0.75 internship confidence floor and were
auto-dropped; adjacency then re-added the honest scope-overlap neighbours as
softer inferred edges.

### Tier 2 — validated-canonical (3 roles)

LLM-proposed common roles, each **validated to exist** by grounding search
against ≥2 distinct current employers (snapshots checked on disk). Their
`requiredSkills` are industry priors, marked `skillsBasis: "judgment"` — **not**
posting-extracted — and every career link is judgment-tier (dampened ×0.55,
dashed, capped, balance-gated).

| Role | Validation employers (current) | Judged career links |
|---|---|---|
| Business Intelligence / Analytics Intern | Eurofins, KPH Healthcare | bi-analyst, data-analyst |
| Quantitative / Operations Research Intern | Point72, Stevens Capital, Amazon | or-analyst, statistician |
| Statistics Intern | Vertex Pharmaceuticals, Johnson & Johnson (ASA StatTr@k 2026) | statistician, or-analyst |

Three proposed canonical roles (Data Scientist Intern, Data Engineering Intern,
Machine Learning Engineer Intern) **deduped against the clustered tier**
(clustered evidence wins) and were dropped — `meta.flags.canonicalSkipped`. The
dedupe now stems morphological title variants, so the proposed *Data
Engineering Intern* collapses onto the clustered *Data Engineer Intern* (the
same job written two ways) instead of shipping as a redundant diamond. Evidence
age: the OR Amazon page
was bot-blocked (postedAt null) so currency there rests on the two current
quant intern-list entries; the statistics entries use the ASA listing's
2025-12 page date, inside the 550-day currency window. **All canonical
evidence is seasonal — re-validate each cycle.**

`meta.flags.canonicalOnlyInternshipCareers = [or-analyst, statistician]`:
these two careers' internship support rests *entirely* on canonical judgment,
not posting evidence. Honest to weigh accordingly.

## The residual limitation (unchanged, structural to MIT's catalog)

The *course* side still over-represents quantitative/research data careers:
MIT teaches probability, optimization, ML, and statistics far more than
applied data engineering, ELT/warehousing, or BI tooling. The internship tiers
now counterbalance this on the reachability side (every career has an
internship path), but course-derived depth for data-engineer, data-architect,
and bi-analyst stays thin. Treat their *course* reachability as course-limited.

## Flags

| Flag | Value |
|---|---|
| Internship variety | **7 roles** (4 clustered + 3 canonical); variety + coverage gates PASS |
| Canonical internships | data-engineering, business-intelligence-analytics, operations-research, statistics |
| Canonical-only internship careers | **or-analyst, statistician** (internship support is entirely judgment) |
| Canonical skipped (deduped vs clustered) | data-scientist-intern, machine-learning-engineer-intern |
| Inference-only careers | **analytics-engineer** (was dropped as unsupported last run; the new Data Engineer Intern's adjacency now reaches it — reachability rests on judgment, drawn softer) |
| SOC collision | **data-engineer / data-architect** (both 15-1243.00); kept separate, a merge is defensible |
| Edges trimmed for balance | 9 |
| Dropped inputs (no surviving edges) | 16 courses + `mnc-software-engineer-intern` (a general SWE role whose only edges fell below the internship floor; correctly dropped) |

## Course de-duplication (brevity)

Several MIT courses are title-and-scope near-duplicates within a level and were
collapsed into a single representative node for a simpler experience. The
*decision* of what is similar is judgment (`data/sources/data/courses/_merges.json`,
also produced by the workflow's Simplify stage); the *application* is
deterministic (`mergeCourses` in `assemble-dataset.mjs`, unit-tested). A merged
node keeps one member's id (so preselects and edges survive), takes a
representative title, and carries the **union of edges + all members' catalog
evidence** — `mergedFrom` on each course and `meta.flags.mergedCourses` record
exactly what was combined.

**Courses 32 → 23.** Five collapses:

| Representative (level) | Combines |
|---|---|
| Introduction to Probability and Statistics (1000) | Intro to Probability, Intro to Statistical Methods in Economics, Applied Probability and Statistics, Intro to Probability and Statistics, Probability and Random Variables |
| Linear Algebra (1000) | Linear Algebra, Linear Algebra and Optimization |
| Fundamentals of Statistics (2000) | Fundamentals of Statistics, Introduction to Statistical Data Analysis, Statistical Thinking and Data Analysis |
| Introduction to Machine Learning (3000) | Introduction to Machine Learning, Modeling with Machine Learning for Computer Science |
| Optimization Methods (3000) | Optimization Methods, Optimization Methods in Business Analytics |

Collapsing removes the highest-similarity course pairs, so the same-level
Jaccard and hub gates get easier, not harder; full gates still PASS.

## Judgment tier: adjacency inference

An LLM judges directional **career scope overlap** (e.g. `data-scientist →
data-analyst` 0.75) and the assembler propagates **softer, marked "inferred"
edges** along it (dampened ×0.55, capped, non-shadowing, non-chaining).
**+17 inferred edges** this run. Notably, the new Data Engineer Intern's
adjacency rescued **analytics-engineer**, which was dropped entirely last run —
its reachability now rests on judgment and is flagged `inferenceOnlyCareers`.

## Judgment tier 2: user-intuition gap review

The gap-review agent proposed **23 judged edges** (0.45–0.65, advisor-defensible
rationale, ≤2 per course) to repair foundational courses that opened too few
doors, with honest restraint on genuinely narrow material. Rationales preserved
in `data/sources/data/edges-gap/judged.json`.

## Distribution (post-balance, all tiers)

- Careers: **9** · Courses: **23** (32 harvested, 14 collapsed into 5 for
  brevity) · Internship roles: **8** · edges are unioned across merged members
- Distribution gates PASS: max career in-degree share ≤ 25% (cap 25%),
  Gini ≤ 0.45
- Senior-narrowing simulation: breadth closes 0; committal stack peaks 5 open,
  ends 4 open / 1 crowded out (the open-then-specialize arc holds)

## Note on the tech pilot tab

`data/datasets/tech.json` (the 3-career MIT pilot slice) ships 2 internships
and was validated under **pilot gates**, which skip the variety/coverage/
distributional gates by design. It remains a clearly-labeled pilot tab; a
future full-scale tech re-run must satisfy the new internship-variety gates.

## What a human should confirm before this stays the default map

1. Accept the canonical internship tier's epistemics: canonical roles are
   validated to *exist* at real employers, but their career links and skills
   are judgment. The UI marks them (diamonds, badge, panel label); confirm the
   distinction reads clearly for your audience.
2. Spot-check the two canonical-only careers (or-analyst, statistician): their
   internship reachability rests entirely on judgment.
3. Decide data-engineer vs data-architect (SOC collision): keep separate or merge.
4. Confirm analytics-engineer's inference-only reachability is acceptable (vs
   sourcing dedicated direct evidence for it).
5. Re-validate the internship tiers next posting cycle (Aug–Oct); canonical and
   clustered evidence alike is seasonal.
