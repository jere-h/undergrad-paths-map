# Human sign-off report — ground-catalog run `pilot-20260709T145556Z`

- **University / scope:** MIT, EECS (course 6) only, pilot slice (3 careers, 1 department, 3 company boards)
- **Generated:** 2026-07-09T14:58:04Z · O*NET 29.1 · sources: <https://catalog.mit.edu/subjects/6/>, O*NET db_29_1_text.zip
- **Dataset:** `data/dataset.json` · generated artifact: `data/catalog.generated.js` · current production file: `data/catalog.js`

---

## 1. Verdict

**Validation: PASSED — pilot gates only.** `validate-dataset.mjs --pilot` returned zero errors and zero warnings (validation result: `[]`). The distributional and coverage gates were **not evaluated**: they are skipped in pilot mode because with 3 careers, edge saturation is indistinguishable from success. Passing this run says the plumbing works and every node/edge carries verified provenance; it says nothing about whether a full-scale run would produce a well-shaped graph.

**Honest framing of what this dataset is:** every edge is a *verified skill-overlap heuristic over requirement-side evidence* — official catalog descriptions, live job postings, and O*NET occupation data. It measures "the skills this course/internship claims to teach overlap the skills this career demonstrably requires." It does **not** measure student outcomes. No placement data, no alumni trajectories, no hiring statistics support any edge. Confidence numbers are calibrated judgments about evidence overlap, not probabilities of career entry.

**Before `data/catalog.js` may be replaced, a human must review:**

1. **Scope loss.** `data/catalog.js` currently ships 18 careers, ~30 courses, and internships across multiple org types. `data/catalog.generated.js` contains **3 careers, 6 courses, 2 internship groups**. Replacing wholesale deletes 15 careers (backend, data-scientist, ml-engineer, ux, designer, quant, ibanking, fin-analyst, consultant, founder, bizops, researcher, biotech, economist, growth) and every non-EECS course from the UI. Do not swap files until a full (non-pilot) run covers the intended scope, or explicitly accept the shrunken pilot map.
2. **The PM career node** (posting-grounded, no O*NET anchor, no local snapshots of its three source postings, and no internship feeding it — see flags 2.1, 2.3, 2.6).
3. **The SWE ratings fallback** — skills/work-activities importance ratings came from related occupation 15-1299.08, not 15-1252.00 itself (flag 2.5).
4. **The judge-vs-skeptic discrepancy** — the orchestrator's summary claimed 0% disagreement; the source files show the skeptic dropped one edge and downgraded another (flag 2.7). Reconcile before trusting run-level metrics.
5. **Spot-check quotes** — verify at least the three PM posting quotes and two catalog quotes against the live URLs, since postings churn in weeks (section 4).

---

## 2. Flags

### 2.1 Posting-grounded careers (lower provenance)

| Career | Grounding | Why it is weaker |
|---|---|---|
| `pm` (Product Manager) | `postings` (3 live postings: ID.me, Cloudflare, Samsara) | No O*NET SOC anchor; skill pool synthesized from 3 postings retrieved the same day. Unlike the internship evidence, **none of the 3 PM posting URLs has a local snapshot** — they are not in `data/sources/postings/manifest.json` (which covers only stripe/ramp/palantir) and carry no `snapshot` field. If those postings close, the evidence chain for the entire PM node becomes unverifiable link rot. Recommend snapshotting before sign-off. |

`data-analyst` and `swe` are SOC-grounded (O*NET 29.1 text release, vendored at `data/sources/onet/db/`), the strongest provenance tier in this run.

### 2.2 Careers dropped for lack of honest grounding

- **No career that entered the pilot was dropped**: all 3 attempted careers (`data-analyst`, `pm`, `swe`) survived, with `pm` surviving only by falling back from SOC to posting grounding.
- **One SOC mapping was rejected as dishonest** (recorded in `data/sources/careers/data-analyst.json` evidence): the hinted code **15-2041.00 (Statisticians)** was rejected for Data Analyst as "a dishonest match for the undergrad understanding of Data Analyst"; 15-2051.01 (Business Intelligence Analysts), which lists "Data Analyst" as an alternate title, was used instead. Human should confirm they agree with this substitution.
- The 15 legacy careers absent from this dataset were excluded by **pilot scope**, not by a grounding failure — they have not yet been attempted. Do not read their absence as "ungroundable."

### 2.3 Internship-starved careers

`meta.flags.internshipStarved = ["pm"]`. No internship/new-grad role node feeds Product Manager. Both internship nodes route to `swe` and `data-analyst`. A PM career card with zero internship inbound edges is a visible gap in the map; either source PM intern postings (APM programs, the ID.me PM intern posting already cited as career evidence is a candidate) or accept the gap knowingly.

### 2.4 Level tie-breaks (`levelNote`)

**None.** No course in `data/sources/courses/EECS.json` carries a `levelNote`; all six levels derive mechanically from `levelBasis` (no-prereq → 1000; prerequisite chain depth 1 → 2000; depth 2–3 → 3000). Nothing to adjudicate here.

### 2.5 Same-SOC collisions

**None.** The two SOC-grounded careers use distinct codes (`data-analyst` → 15-2051.01, `swe` → 15-1252.00). **Related flag:** `swe`'s skills/work-activities/knowledge importance ratings were sourced from *related occupation* **15-1299.08 (Computer Systems Engineers/Architects)** because 15-1252.00 lacks its own ratings in O*NET 29.1 (`ratedSources` fallback, disclosed in the evidence). `data-analyst`'s ratings are on-occupation with no fallback. The fallback is disclosed and reasonable, but it means SWE's "distinctive skills" ordering rests partly on an adjacent occupation's ratings.

### 2.6 Dead / empty company boards

From `data/sources/postings/manifest.json` (retrieved 2026-07-09T14:58:40Z):

| Company | Source | ok | Total jobs | Intern | New grad | Note |
|---|---|---|---|---|---|---|
| stripe | greenhouse | true | 502 | **0** | 3 | Board alive but **zero intern postings**; all Stripe evidence in the "intern" role groups is actually New Grad (and the two ops roles are Mexico-located). The `mnc-*-intern` node names overstate what the Stripe evidence shows. |
| ramp | greenhouse | **false** | 0 | 0 | 0 | **Dead/empty board**: "zero postings returned (bad slug or empty board)". One of three planned boards contributed nothing; internship evidence rests on Palantir + Stripe only. Fix the slug or replace the company before a full run. |
| palantir | lever | true | 270 | 31 | 17 | Healthy; carries most of the intern-side evidence. |

### 2.7 Judge-vs-skeptic disagreement rate — **the stated 0% is wrong; measured rate is 20%, skeptic is NOT decorative**

The run summary handed to this report claimed a 0% disagreement rate, which would trigger the "skeptic decorative" flag. **The source files contradict that.** Diffing `data/sources/edges-judge/` (judge proposals, 10 edges) against `data/sources/edges/` (post-skeptic, 9 edges):

| Judge proposal | Skeptic action |
|---|---|
| `mit-6-3720` → `pm` (0.35, "KPIs and adoption metrics") | **DROPPED.** Judge itself conceded "the catalog offers no product-facing evidence"; skeptic removed the edge entirely. |
| `mit-6-9140` → `pm` (0.60; stakeholder management, roadmap prioritization, product launches and change management) | **DOWNGRADED** to 0.55 and matched skills narrowed to stakeholder management + cross-functional collaboration — the roadmap/launch claims did not survive scrutiny of an engineering-PM course. |
| Remaining 8 edges | Accepted unchanged (confidence and matched skills identical). |

Measured: **1/10 rejected (10%), 2/10 touched (20%)** — a small sample, but non-zero, so the "skeptic decorative" flag does **not** apply. What *does* need human attention is the metrics discrepancy: whatever computed "0%" is not reading these files correctly. At full scale that bug would silently hide a decorative skeptic. Fix the measurement before the full run.

---

## 3. Every node and edge, with evidence and confidence

All `retrievedAt` timestamps below are **2026-07-09T14:58:04Z** unless noted. Quotes abridged with "…" only inside long passages; full text in `data/dataset.json`.

### 3.1 Career nodes (3)

#### `data-analyst` — Data Analyst · grounding: **soc** (15-2051.01)

| Evidence source | Quote / content |
|---|---|
| O*NET 29.1 `Occupation Data.txt#15-2051.01` (Business Intelligence Analysts) | "Produce financial and market intelligence by querying data repositories and generating periodic reports. Devise methods for identifying data patterns and trends in available information sources." |
| O*NET 29.1 `Alternate Titles.txt#15-2051.01` | "15-2051.01 Data Analyst" — listed alternate title; hinted code 15-2041.00 (Statisticians) rejected as a dishonest match (flag 2.2). |
| O*NET 29.1 `Task Statements.txt#15-2051.01` | "Generate standard or custom reports summarizing business, financial, or economic data … Maintain or update business intelligence tools, databases, dashboards … Synthesize current business intelligence or trend data to support recommendations for action." |
| O*NET 29.1 `Technology Skills.txt#15-2051.01` | DB reporting, DB query, BI/data-analysis, DBMS, data mining, financial analysis, metadata management software. |
| O*NET 29.1 `Work Activities.txt#15-2051.01` | "Analyzing Data or Information (importance 4.73), Working with Computers (4.68), Processing Information (4.64), Interpreting the Meaning of Information for Others (4.55); knowledge: Computers and Electronics (4.29), Mathematics (3.82), Economics and Accounting (3.00)" — rated on 15-2051.01 itself, no fallback. |

#### `pm` — Product Manager · grounding: **postings** (flags 2.1, 2.3)

| Evidence source (retrieved 2026-07-09T14:58:04Z) | Quote |
|---|---|
| ID.me — "University 2026 Intern: Product Manager" — job-boards.greenhouse.io/idmeuniversityrecruiting/jobs/7388902003 | "Build and prioritize roadmaps, translating complex requirements into clear deliverables … Technical fluency in APIs, data modeling, and scalable architectures. … Strong communicator able to influence across technical and executive audiences." |
| Cloudflare — "Product Manager, AI Access" — boards.greenhouse.io/cloudflare/jobs/7904142 | "Deliver product specifications, prototypes, product positioning, and high-impact launches. Partner with Engineering, Design, Research, and GTM … comfortable with ambiguity. Technically literate … able to push back on a tech lead on the merits of a particular direction." |
| Samsara — "Product Manager - Revenue Tools" — samsara.com/company/careers/roles/7750279 | "Discovery: Lead deep user research … Design: Draft comprehensive Product Requirements Documents (PRDs) and design artifacts (wireframes) … Launch: Coordinate all aspects of release, including change management … Define and track key performance indicators (KPIs and adoption metrics) to measure business impact and inform rapid roadmap iterations." |

No local snapshots of these three postings exist (flag 2.1).

#### `swe` — Software Engineer · grounding: **soc** (15-1252.00)

| Evidence source | Quote / content |
|---|---|
| O*NET 29.1 `Occupation Data.txt#15-1252.00` (Software Developers) | "Research, design, and develop computer and network software or specialized utility programs. Analyze user needs and develop software solutions, applying principles and techniques of computer science, engineering, and mathematical analysis." |
| O*NET 29.1 `Task Statements.txt#15-1252.00` | "Design, develop and modify software systems, using scientific analysis and mathematical models to predict and measure outcomes and consequences of design." |
| O*NET 29.1 `Technology Skills.txt#15-1252.00` | Development environment, object/component-oriented development, file versioning, database, web platform, cloud-based management software. |
| O*NET 29.1 `Skills.txt#15-1299.08` — **related-occupation fallback** (flag 2.5) | "Systems Analysis (importance 3.88), Systems Evaluation (3.88), Complex Problem Solving (3.75); knowledge: Computers and Electronics (4.91), Engineering and Technology (3.77)" — rated on Computer Systems Engineers/Architects, not 15-1252.00. |

### 3.2 Course nodes (6) — all evidence type `catalog`, source <https://catalog.mit.edu/subjects/6/>, retrieved 2026-07-09T14:58:04Z

| Course | Level (basis) | Catalog quote (abridged) |
|---|---|---|
| `mit-6-c35` — 6.C35[J] Interactive Data Visualization and Society | 1000 (no subject prerequisites) | "Covers the design, ethical, and technical skills for creating effective visualizations. … familiarity with the data analysis and visualization design process. Weekly lab sessions present coding and technical skills. A final project provides experience working with real-world big data … to expose and communicate insights about societal issues." |
| `mit-6-9140` — 6.9140 Fundamentals of Engineering Project Management | 1000 (no subject prerequisites) | "Introduces principles, methods, and tools for project management and teamwork in engineering. … target setting and charters, stakeholders, project architecture, scope estimation, resource allocation, schedule forecasts, and risk mitigation. … flow-based, waterfall, set-based, spiral, and agile approaches." |
| `mit-6-1010` — 6.1010 Fundamentals of Programming | 2000 (prereq chain depth 1: 6.1000, 6.100A, 6.100B, 16.C20) | "Introduces fundamental concepts of programming. … programming and Python basics, computational concepts, software engineering, algorithmic techniques, data types, and recursion. Lab component consists of software design, construction, and implementation of design." |
| `mit-6-3720` — 6.3720 Introduction to Statistical Data Analysis | 2000 (prereq chain depth 1: 6.100A, 6.3700, 6.3800, 18.600) | "Introduction to the central concepts and methods of data science … data exploration, feature selection, model fitting, and performance assessment. Topics include … hypothesis testing …, linear and nonlinear regression and prediction, classification, time series, uncertainty quantification, model validation, causal inference, optimization, and decisions." |
| `mit-6-1020` — 6.1020 Software Construction | 3000 (prereq chain depth 2: 6.1010) | "…how to write software that is safe from bugs, easy to understand, and ready for change. Topics include specifications and invariants; testing, test-case generation, and coverage; abstract data types …; design patterns for object-oriented programming; concurrent programming …; and functional programming …" |
| `mit-6-1040` — 6.1040 Software Design | 3000 (prereq chain depth 3: 6.1020, 6.1200) | "…classic human-computer interaction (HCI) design tactics (need finding, heuristic evaluation, prototyping, user testing), conceptual design …, abstract data modeling, and visual design. Implementation topics include reactive front-ends, web services, and databases. … design and build full-stack web applications." |

### 3.3 Internship nodes (2) — all evidence type `posting`, retrieved 2026-07-09T14:58:04Z, with local snapshots

#### `mnc-software-engineer-intern` — Software Engineer Intern (MNC)

| Company / title | URL | Snapshot |
|---|---|---|
| Palantir — Software Engineer, Internship | jobs.lever.co/palantir/373eb939-6f57-4836-8479-be79a5e07249 | `data/sources/postings/lever-palantir.json` |
| Palantir — Software Engineer, Internship - Infrastructure | jobs.lever.co/palantir/b229baac-494b-4a0d-9a13-2e38806e06f3 | `data/sources/postings/lever-palantir.json` |
| Stripe — Software Engineer, New Grad, Developer & End User Experience Platform | stripe.com/jobs/search?gh_jid=7991718 | `data/sources/postings/greenhouse-stripe.json` |

#### `mnc-data-operations-analyst-intern` — Data & Operations Analyst Intern (MNC)

| Company / title | URL | Snapshot |
|---|---|---|
| Palantir — Deployment Strategist, Internship | jobs.lever.co/palantir/774cf5c9-bf6a-4d77-bf60-d50ef1beb1a0 | `data/sources/postings/lever-palantir.json` |
| Palantir — Deployment Strategist, Internship - US Government | jobs.lever.co/palantir/a49d4181-a289-435a-b581-7f5af0497c8e | `data/sources/postings/lever-palantir.json` |
| Stripe — Tech Operations Associate, New Grad (Mexico) | stripe.com/jobs/search?gh_jid=7718947 | `data/sources/postings/greenhouse-stripe.json` |
| Stripe — Operations Associate, New Grad (Mexico) | stripe.com/jobs/search?gh_jid=7544547 | `data/sources/postings/greenhouse-stripe.json` |

Note (flag 2.6): all Stripe rows are New Grad, not intern, and the two ops roles are Mexico-located; the node is branded "Intern."

### 3.4 Edges (9 final; 10 proposed by judge)

Edge evidence = skill overlap between the source node's evidenced skills and the career's O*NET/posting-evidenced skill pool, adjudicated by the judge (rationales in `data/sources/edges-judge/`) and independently challenged by the skeptic (results in `data/sources/edges/`). Confidence is heuristic overlap strength, **not** an outcome probability.

| From → To | Conf. | Distinctive | Matched skills | Judge rationale (abridged) | Skeptic |
|---|---|---|---|---|---|
| 6.C35 → data-analyst | 0.85 | yes | analyzing data or information; interpreting information for others; dashboard design and maintenance | Catalog explicitly teaches data analysis + visualization design process and communicating insights from real-world big data. | accepted |
| 6.9140 → pm | **0.55** | yes | stakeholder management; cross-functional collaboration | Judge: catalog "stakeholder management" exactly matches PM distinctive skill; scope estimation/schedule/risk support roadmap and launch skills, "though the course covers engineering project management rather than product management specifically." | **downgraded** from 0.60; roadmap-prioritization and launch/change-management matches removed |
| 6.1010 → swe | 0.75 | yes | object oriented development; development environment software | Python programming, software engineering, and a design-construct-implement lab develop skills O*NET lists as distinctive for software developers. | accepted |
| 6.3720 → data-analyst | 0.85 | yes | analyzing data or information; trend and market analysis; interpreting information for others | Extracting information from data for predictions/decisions via exploration, hypothesis testing, regression, time series, with finance case studies. | accepted |
| ~~6.3720 → pm~~ | ~~0.35~~ | — | ~~KPIs and adoption metrics~~ | Judge conceded "the catalog offers no product-facing evidence, so confidence stays low." | **DROPPED — not in dataset** |
| 6.1020 → swe | 0.90 | yes | software testing and validation; object oriented development | Testing/test-case generation/coverage, OO design patterns, ADTs, concurrency defenses directly match SWE distinctive skills "well beyond a typical career overlap." | accepted |
| 6.1040 → swe | 0.85 | yes | web platform development | Students design and build full-stack web apps with reactive front-ends, web services, and databases in team projects. | accepted |
| 6.1040 → pm | 0.70 | yes | user research; usability testing; wireframes and design artifacts | HCI tactics — need finding, heuristic evaluation, prototyping, user testing — plus conceptual and visual design map onto PM distinctive skills. | accepted |
| mnc-software-engineer-intern → swe | 0.90 | yes | object oriented development; web platform development; cloud-based management software; systems analysis | Postings require Java/Go/TypeScript/Python, front-end frameworks, cloud infrastructure, code-review feedback. | accepted |
| mnc-data-operations-analyst-intern → data-analyst | 0.80 | yes | analyzing data or information; interpreting information for others; database query software | SQL against relational databases, quantitative analytics across large datasets, presenting to analysts through executives. | accepted |

---

## 4. Staleness and re-run cadence

The evidence tiers age at very different rates:

| Evidence tier | Volatility | Consequence |
|---|---|---|
| Job postings (PM career node, both internship nodes, edge verification evidence) | **Weeks.** Intern/new-grad postings churn with recruiting cycles; individual URLs die when filled. The Ramp board was already dead at fetch time. | The PM node's three un-snapshotted URLs are the most exposed (flag 2.1). Cited posting quotes may become unverifiable within 4–8 weeks. |
| MIT catalog | Semesterly/annual. Subject numbers occasionally renumber (the 6.xxxx scheme is itself recent). | Course quotes and prereq-derived levels stable within an academic year. |
| O*NET database | Pinned to release 29.1, vendored locally. New releases roughly annually. | Effectively frozen; refresh on new release. |

**Recommended cadence:**

- **Postings refresh every 4–6 weeks** during recruiting season (September–February), 8 weeks otherwise: re-fetch boards, re-snapshot, re-verify posting-grounded nodes and any edge whose skeptic evidence was posting-based. Alert on any board where `ok:false` or intern+newgrad count drops to 0 (Ramp-style failures and Stripe-style intern droughts should be caught automatically, not at sign-off).
- **Full re-run each semester** (before registration periods) to pick up catalog changes and re-derive course levels.
- **Re-ground SOC careers on each O*NET release** (check `onetVersion` against onetcenter.org; currently 29.1).
- **Immediately:** snapshot the three PM posting pages before they expire, and fix the Ramp slug — both are cheap and protect this run's provenance.

---

*Report generated 2026-07-09 for run `pilot-20260709T145556Z`. This report covers the pilot dataset only; sign-off here does not authorize replacing `data/catalog.js` (see Verdict item 1).*
