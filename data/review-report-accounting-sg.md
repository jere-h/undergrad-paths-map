# Human sign-off report — ground-catalog run `accounting-sg-20260711T074821Z`

- **University / scope:** NTU, Accountancy department, pilot slice (3 careers, 1 department, org types: Big 4 / Mid-Tier Firm / Corporate Finance)
- **Generated:** 2026-07-11T07:50:04Z · O*NET 29.1 · sources: <https://wis.ntu.edu.sg/webexe/owa/AUS_SUBJ_CONT.main_display1?acadsem=2025_1&r_course_yr=&r_subj_code=AC&boption=Search&acad=2025&semester=1>, O*NET `db_29_1_text.zip`
- **Dataset:** `data/datasets/accounting-sg.json` · sources: `data/sources/accounting-sg/` · generated catalog artifact: **not produced** — `data/catalogs/accounting-sg.js` does not exist on disk, and `data/catalog.js` (the live app file) is untouched, because this run did not pass gates (see §1)

---

## 1. Verdict

**Validation: FAILED — pilot gates only; distributional gates not evaluated.**

`meta.pilot = true` for this run, so `validate-dataset.mjs --pilot` skipped the distributional/coverage gates (in-degree share, Gini, pairwise Jaccard, internship-coverage-by-career, and the senior-narrowing simulation) — they are meaningless at 3-career scale and were never run one way or the other. What **did** run, because they are structural/evidence gates that are always on (pilot included), is the validated-canonical-internship honesty check, and it failed four times:

```
FAIL  canonical internship canonical-big-4-audit-assurance-intern: no CURRENT evidence (an active intern-list entry, or postedAt within 550 days of retrieval); archived history alone cannot validate a current role
FAIL  canonical internship canonical-mid-tier-firm-audit-intern: no CURRENT evidence (an active intern-list entry, or postedAt within 550 days of retrieval); archived history alone cannot validate a current role
FAIL  canonical internship canonical-big-4-risk-advisory-intern: no CURRENT evidence (an active intern-list entry, or postedAt within 550 days of retrieval); archived history alone cannot validate a current role
FAIL  canonical internship canonical-big-4-tax-advisory-intern: no CURRENT evidence (an active intern-list entry, or postedAt within 550 days of retrieval); archived history alone cannot validate a current role
```

Every one of these four canonical roles carries evidence from ≥2 distinct employers (so they clear the *breadth* bar), but **all of their evidence rows have `postedAt: null`** — the grounding pass captured a live posting page or an employer careers page at retrieval time but never extracted (or the page never stated) an actual post date. With no `postedAt` and no `intern-list`-type entry, the gate cannot tell an archived/evergreen careers page from a page describing this year's actual intake, so it fails closed. The **fifth** canonical role, `canonical-corporate-finance-internal-audit-intern`, is the sole survivor: its Temasek evidence row carries `"postedAt": "2026-02"`, ~5 months before the `2026-07-11` retrieval and inside the 550-day window, so it clears the CURRENT-evidence bar on that one dated posting alone.

Because gates failed, **the catalog must not ship as an app tab.** `apply: true` was requested for this run, but it must not register `accounting-sg` in `data/catalogs/index.js` / swap into `data/catalog.js` until the failures below are resolved — either by re-fetching the four postings with an actual post date (or confirming an active intern-list snapshot), or by demoting those four roles out of the `canonical-` tier (e.g. into ordinary clustered/posting-grounded internships with reduced confidence) so they no longer claim "validated current role" status they cannot support.

**Before this catalog may ship, a human must review:**

1. **The four undated canonical internships** (§2b) — re-fetch with post dates, or downgrade their evidence-tier claim. This is the blocking issue; everything else below is lower-severity but should be read before sign-off.
2. **`internal-auditor`'s internship support is 100% canonical** (judgment-linked), with zero posting-grounded (clustered) internship reaching it directly — and the one internship-support career (`canonical-mid-tier-firm-audit-intern` → `internal-auditor`) it partly relies on is one of the four failing roles.
3. **Dead Big 4 ATS boards** — Lever returned zero postings for Deloitte, PwC, and EY (bad slugs or empty boards), which is why the entire Big 4 org type has no clustered/posting-tier internship and had to be filled entirely by the canonical (judgment) tier.
4. **4 judged/inferred edges and 1 skeptic-reviewed ("banded") edge** rest on LLM scope-overlap judgment, not direct skill-text matches — see §2 for each rationale.
5. **7 dropped inputs** (3 courses, 4 clustered internships) — confirm none of them should have survived; they were dropped because their strongest candidate edges fell at/under the 0.4 inference floor or found no destination at all.
6. Spot-check at least the four undated internship snapshots and the two dated/live mycareersfuture postings against their live URLs — postings churn in weeks (§4).

**Honest framing of what this dataset is:** every edge is a *verified skill-overlap heuristic over requirement-side evidence* — NTU catalog descriptions, live/employer-page job postings, and O*NET occupation data. It measures "the skills this course/internship claims to teach or require overlap the skills this career demonstrably requires." It does **not** measure student outcomes, actual hiring, or placement. No alumni trajectories or hiring statistics back any edge. Confidence numbers are calibrated judgments about evidence overlap, not probabilities of career entry.

---

## 2. Flags

### 2.1 Posting-grounded careers (lower provenance)

**None.** All 3 careers in this run are SOC-grounded, the strongest tier:

| Career | SOC | Grounding |
|---|---|---|
| `external-auditor` | 13-2011.00 (Accountants and Auditors) | `soc` |
| `internal-auditor` | 13-2011.00 (Accountants and Auditors) | `soc` |
| `tax-consultant` | 13-2082.00 (Tax Preparers) | `soc` |

No career in this run fell back to posting-only grounding. (Internship *nodes* feeding these careers are a mix of posting and canonical grounding — see §2b.)

### 2.2 Careers dropped for lack of honest grounding

**None** (`meta.flags.unsupportedCareers` is absent/empty). All 3 attempted careers survived on SOC grounding; none was demoted to posting-only or dropped.

### 2.3 Dropped inputs (`meta.flags.droppedInputs`, 7 total)

Three courses and four clustered (posting-grouped) internships were proposed, found no career destination that cleared the acceptance bar, and were cut rather than shipped with fabricated edges:

| Dropped input | Kind | Why dropped |
|---|---|---|
| `ntu-ac1103` (Accounting I) | course | Foundational intro course; gap-review found **zero** candidate edges (`edges-gap/_gaps.json` → `"ntu-ac1103": []`) — its taught skills (recognizing/measuring assets, liabilities, revenue) don't distinctively overlap any of the 3 careers' distinctive skill sets. |
| `ntu-ac2401` (Accounting Information Systems) | course | Same: zero candidate edges found. |
| `ntu-ac3102` (Risk Reporting & Analysis) | course | Same: zero candidate edges found (its FX/derivatives/consolidation content doesn't match any distinctive skill here). |
| `mid-tier-firm-accounting-bookkeeping-intern` | internship (clustered, 3 postings: Audit Alliance, RSM Stone Forest Accountserve, Chartsworth) | Its only candidate edge (→ `external-auditor` on "account reconciliations") sat at the 0.4 inference floor and did not survive as a shipped edge. |
| `corporate-finance-accounts-bookkeeping-intern` | internship (clustered, 7 postings) | Two candidates found, both weak: → `external-auditor` at 0.4 (floor) and → `tax-consultant` at 0.3 (**below** the 0.4 inference floor on "GST schedules and submission" alone) — neither survived. |
| `corporate-finance-finance-reporting-intern` | internship (clustered, 5 postings) | → `external-auditor` at 0.55 and → `internal-auditor` at 0.25 (below floor); the 0.55 candidate was itself in the reviewable band but was not one of the edges actually sent to skeptic review this run (see §2.7's fail-closed note), so it dropped along with its parent input. |
| `corporate-finance-fpa-finance-controlling-intern` | internship (clustered, 3 postings: Tod's, Innowave Tech, China Taiping Insurance) | Zero candidate edges — FP&A/forecasting/IFRS-17 skills don't distinctively overlap audit or tax. |

This reconciles with the "5 below floor" figure in the edge-pipeline stats: the candidates at 0.4 (×2), 0.3, and 0.25 (×2, counting `corporate-finance-finance-reporting-intern`'s two candidates) plus the unreviewed 0.55 band account for the discarded population; the two zero-candidate courses and one zero-candidate internship never generated a below-floor edge to begin with, they simply found nothing.

### 2.4 Inferred edges (`meta.flags.inferredEdges = 2`)

Course-to-course adjacency propagation (not gap-review judgment) — a course's direct edge to one career is propagated to an adjacent career at a dampened weight:

| Course | Direct edge | Propagated (inferred) edge | Adjacency weight | Confidence |
|---|---|---|---|---|
| `ntu-ac2104` (Assurance & Auditing) | → `external-auditor` 0.85 | → `internal-auditor` (via `external-auditor`) | 0.75 | 0.542 |
| `ntu-ac3104` (Enterprise Risk Mgmt & Sustainability) | → `internal-auditor` 0.75 | → `external-auditor` (via `internal-auditor`) | 0.70 | 0.446 |

Both rest on the career-adjacency pair `external-auditor ⇄ internal-auditor` (weights 0.75 / 0.70, rationale in `careers/_adjacency.json`: both careers test controls, evaluate against compliance standards, and document findings via the same ERP/audit-software base). These are **not** skill-text matches — they exist because the course already reaches one auditor career and the two auditor careers were judged adjacent.

### 2.5 Gap-review judged edges (`meta.flags.judgedEdges = 4`, rationales in `data/sources/accounting-sg/edges-gap/judged.json`)

These four edges rest on explicit LLM judgment calls during the second-pass gap review (not the initial skill-overlap match, and not mechanical adjacency propagation), each with a stated rationale:

| From | To | Confidence | Rationale |
|---|---|---|---|
| `ntu-ac2301` (Principles of Taxation) | `external-auditor` | 0.45 | "Understanding SG income tax and GST treatment helps an external auditor test the tax provisions, deferred tax and regulatory compliance sitting inside a client's financial statements." |
| `mid-tier-firm-tax-intern` | `external-auditor` | 0.40 | "Hands-on tax computations plus basic accounting principles give an audit junior the grounding to vouch and challenge the tax-related accounts in a set of financial statements." |
| `canonical-mid-tier-firm-audit-intern` | `internal-auditor` | 0.65 | "Audit fieldwork, working papers, vouching and reconciliations transfer directly to internal audit; the sibling Big 4 audit intern already maps to both external and internal auditor." |
| `canonical-big-4-tax-advisory-intern` | `external-auditor` | 0.45 | "Reading financial statements for tax adjustments and preparing tax computations equips the intern to audit tax provisions and tax-compliance accounts as an external auditor." |

All four sit right at or just above the 0.4 inference floor — read them as directionally plausible judgment, not measured skill overlap. Note that one of the four (`canonical-mid-tier-firm-audit-intern` → `internal-auditor`) is a judged edge attached to one of the four canonical internships that **failed** the CURRENT-evidence gate (§1) — its underlying role's own validity is in question independent of the edge's own confidence.

### 2.6 Careers reachable only via inference (`meta.flags.inferenceOnlyCareers`)

Not present as a distinct flag in this run's metadata, but functionally: every edge into `internal-auditor` from a *canonical* internship (all five, see §2b) is judged/inferred, and its only non-canonical internship connection is a course, not an internship. Treat every one of these as resting on scope-overlap judgment or gap-review judgment, not direct posting-text evidence — none of it is a measured outcome.

### 2.7 Level tie-breaks (`levelNote`)

Two courses needed a tie-break beyond the mechanical prereq-depth rule; both are disclosed inline:

| Course | Mechanical level | Assigned level | Why overridden |
|---|---|---|---|
| `ntu-ac3104` (Enterprise Risk Mgmt & Sustainability) | 2000 (listed prereq is only a corequisite of an intro course) | **3000** | Catalog code (AC3104, third-year numbering) and description's advanced scope (enterprise-wide ERM frameworks, sustainability assurance, audit analytics, explicit auditor-facing content) overrode the mechanical rule. |
| `ntu-ac2104`, `ntu-ac2301` | 2000 | 2000 (no override) | Standard one-step prereq depth; catalog code corroborates — no tie-break needed, included for completeness. |

Human should confirm agreement with the AC3104 override, since it is the one place level was set by narrative judgment rather than mechanical prerequisite counting.

### 2.8 Same-SOC collisions (`meta.flags.socCollisions`)

Not flagged as a distinct list this run (empty), but worth surfacing explicitly: **`external-auditor` and `internal-auditor` share the same O*NET SOC code, 13-2011.00 (Accountants and Auditors)** — O*NET does not distinguish these as separate occupations. The pipeline's distinctive-skill separation (`careers/_distinctive.json`) reports **zero overlapping distinctive skills** between the two (external-auditor's 3 distinctive skills — inspecting account books, reconciling cash/receivables, communicating with clients — versus internal-auditor's 7 — detecting fraud, supervising scope, interviewing staff, coordination, admin/management knowledge, analytical software, organizing/prioritizing — do not intersect), so the LLM successfully carved two non-colliding skill profiles out of one shared SOC code. Human should sanity-check that this hand-carved split still reads as "two real, distinct jobs" rather than one job cut in half to hit a career count.

### 2.9 Edges trimmed for balance (`meta.flags.edgesTrimmedForBalance`)

**None** — flag absent. No edge was cut purely to rebalance in-degree/out-degree distribution this run (unsurprising at 3-career, pilot scale, where the distributional gates that would trigger trimming were not evaluated at all, see §1).

### 2.10 Dead / empty company boards

From `data/sources/accounting-sg/postings/manifest.json` (retrieved 2026-07-11T07:49:16Z):

| Company | Source | ok | Total jobs | Intern | New grad | Note |
|---|---|---|---|---|---|---|
| deloitte | lever | **false** | 0 | 0 | 0 | "zero postings returned (bad slug or empty board)" |
| pwc | lever | **false** | 0 | 0 | 0 | "zero postings returned (bad slug or empty board)" |
| ey | lever | **false** | 0 | 0 | 0 | "zero postings returned (bad slug or empty board)" |
| mycareersfuture | mycareersfuture API | true | 34 | 34 | — | Healthy; queries `accounting`, `audit`, `tax`, `finance`; all 34 results had descriptions and none of the 34 belonged to a Big 4 firm (per `internships/big-4.json`'s note) |

**All three Lever boards for the Big 4 firms named in this industry's `orgTypes` returned nothing.** That is why the entire Big 4 org type in this run's internship layer is carried exclusively by the canonical (judgment + web-search-validated) tier, not by aggregated live postings — and why four of the five canonical roles are the ones now failing the CURRENT-evidence gate (§1). Fix the Lever slugs or add a working Big 4 source before the next run; until then, Big 4-specific internship claims in this dataset rest on hand-fetched individual postings/employer pages, not a systematic board pull.

### 2.11 Skeptic band

**Not empty — the adversarial pass had exactly one edge to review, and it kept it.** Per the edge-pipeline stats: 3 edges auto-accepted (≥0.85 confidence, no review needed), 5 candidate edges fell below the 0.4 inference floor and were discarded before reaching a skeptic, and exactly **1 edge landed in the reviewable band** and was sent to skeptic review:

| Input | Career | Confidence | Skeptic verdict | Skeptic's stated reason |
|---|---|---|---|---|
| `ntu-ac3104` (Enterprise Risk Mgmt & Sustainability) | `internal-auditor` | 0.75 | **keep** | "The NTU catalog quote for AC3104 explicitly names internal auditors as needing ERM to appreciate risks, controls and governance, and live postings ask for the same subject matter (posting #27 'Support finance process compliance and internal controls'; posting #8 audit processes and compliance), matching the internal auditor's distinctive 'detecting deficient controls or fraud' skill." |

So the skeptic pass was exercised this run (it is not decorative), but its workload was thin — one edge in, one edge kept, zero dropped or downgraded. Per the fail-closed rule ("unreviewed banded edges drop"), any other banded candidate that did not make it into a skeptic batch this run (e.g., the `corporate-finance-finance-reporting-intern` → `external-auditor` 0.55 candidate noted in §2.3) was dropped by default rather than shipped unreviewed.

### 2.12 Senior-narrowing simulation

**Not evaluated this run.** `NARROWING.minCareers = 6` in `scripts/validate-dataset.mjs`; this dataset has only 3 careers, below that floor, so the breadth-must-close-nothing / committal-stack-peaks-then-narrows simulation was skipped entirely — consistent with the pilot's distributional gates being skipped for the same reason (§1). No narrowing-simulation warning line exists for this run; do not read the absence of a narrowing failure as a pass. This check can only be exercised meaningfully once the catalog covers 6+ careers (i.e., not before a full, non-pilot run).

---

## 2b. Validated-canonical internship tier (`meta.flags.canonicalInternships`, 5 roles)

`meta.flags.internshipVariety = { total: 6, clustered: 1, canonical: 5 }` — five of this run's six internship nodes are **canonical**: roles proposed by LLM judgment as "the internship every student in this track recognizes" and then validated to **exist at real employers** by web search, not aggregated from a company-board pull. **Their `requiredSkills` are `skillsBasis: "judgment"` — LLM-estimated typical requirements for the role, not text extracted from a specific posting.** Their career-edges are, without exception, `judged: true` / `inferred: true` — i.e., scope-overlap judgment about what the role plausibly feeds, never a direct skill-text match. Treat every row below as "this employer really runs this internship" (validated) plus "a person who advises students judges it leads here" (judgment) — not as a measured outcome.

| Canonical role | Org type | Employers (evidence) | postedAt vs retrievedAt (age) | CURRENT-evidence gate |
|---|---|---|---|---|
| `canonical-big-4-audit-assurance-intern` (Audit & Assurance Intern) | Big 4 | Deloitte SG, PwC SG, KPMG SG, EY SG (4 employers) | All 4 evidence rows: `postedAt: null`, `retrievedAt: 2026-07-11`. **No dated evidence at all.** | **FAIL** |
| `canonical-mid-tier-firm-audit-intern` (Audit Intern) | Mid-Tier Firm | RSM SG, Baker Tilly SG (2 employers) | Both rows: `postedAt: null`, `retrievedAt: 2026-07-11`. | **FAIL** |
| `canonical-corporate-finance-internal-audit-intern` (Internal Audit Intern) | Corporate Finance | Standard Chartered Bank (`postedAt: null`), Temasek (**`postedAt: "2026-02"`**) | Temasek row: ~5 months before `2026-07-11` retrieval (≈150 days, inside the 550-day window). | **PASS** (on the Temasek row alone) |
| `canonical-big-4-risk-advisory-intern` (Risk & Internal Audit Advisory Intern) | Big 4 | PwC SG, EY SG (2 employers) | Both rows: `postedAt: null`. | **FAIL** |
| `canonical-big-4-tax-advisory-intern` (Tax Advisory Intern) | Big 4 | Deloitte SG, PwC SG, KPMG SG, EY SG (4 employers) | All 4 rows: `postedAt: null`. | **FAIL** |

**Judged-edge rationales** (from `internships-canonical/_proposals.json`'s `candidateEdges`, carried through unchanged into the shipped dataset):

| Canonical role | → Career | Confidence | Rationale |
|---|---|---|---|
| `canonical-big-4-audit-assurance-intern` | `external-auditor` | 0.70 | "An assurance intern does exactly the entry-level version of external audit fieldwork: testing balances, gathering evidence, and drafting findings under a senior." |
| `canonical-big-4-audit-assurance-intern` | `internal-auditor` | 0.45 | "Controls testing and evidence documentation learned in assurance transfer to internal audit, a common lateral move students and advisors both recognize." |
| `canonical-mid-tier-firm-audit-intern` | `external-auditor` | 0.65 | "A mid-tier audit intern performs the same statutory audit support work as a first-year external auditor, just on smaller SME engagements." |
| `canonical-mid-tier-firm-audit-intern` | `internal-auditor` | 0.65 | "Audit fieldwork, working papers, vouching and reconciliations transfer directly to internal audit; the sibling Big 4 audit intern already maps to both external and internal auditor." (§2.5) |
| `canonical-corporate-finance-internal-audit-intern` | `internal-auditor` | 0.65 | "This is the direct entry point to internal audit: interns scope, test controls, and write up findings for management, mirroring the career's core work." |
| `canonical-corporate-finance-internal-audit-intern` | `external-auditor` | 0.40 | "Controls-testing and reconciliation skills overlap with external audit, a crossover both students and advisors acknowledge." |
| `canonical-big-4-risk-advisory-intern` | `internal-auditor` | 0.55 | "Risk advisory interns perform outsourced internal audit work - control reviews and remediation recommendations - which is the internal auditor's day job." |
| `canonical-big-4-risk-advisory-intern` | `external-auditor` | 0.40 | "Controls-focused testing and standards knowledge give a recognized path back into assurance." |
| `canonical-big-4-tax-advisory-intern` | `tax-consultant` | 0.60 | "A Big 4 tax intern prepares computations and researches treatments under supervision - the entry-level form of a tax consultant's advisory work - and differs from the existing mid-tier Tax Intern by org context and advisory scope." |
| `canonical-big-4-tax-advisory-intern` | `external-auditor` | 0.45 | "Reading financial statements for tax adjustments and preparing tax computations equips the intern to audit tax provisions and tax-compliance accounts as an external auditor." |

**Variety split:** `internshipVariety.total = 6`, of which **1 clustered** (posting-grouped, directly text-evidenced: `mid-tier-firm-tax-intern`) and **5 canonical** (judgment-proposed, existence-validated). Five-sixths of this run's internship layer is the softer, judgment-linked tier — the clustered/posting tier barely exists here (see §2.10 on why: the Lever boards for all three named Big 4 firms were dead).

**Careers whose internship support is entirely canonical (`meta.flags.canonicalOnlyInternshipCareers`):** `["internal-auditor"]`. No clustered/posting-only internship reaches `internal-auditor` at all — its only internship-sourced edges come from four canonical roles, one of which (`canonical-mid-tier-firm-audit-intern`) is itself failing the CURRENT-evidence gate. (`external-auditor` narrowly avoided this list because the one clustered internship, `mid-tier-firm-tax-intern`, picked up a judged edge to it in gap review — §2.5.)

**Roles the join skipped (`meta.flags.canonicalSkipped`):** none — absent from this run's metadata; all 5 proposed canonical roles were validated and joined (see `internships-canonical/validation.json`: `"failures": []`).

**Starved careers remaining unserved:** none by the proposer's own accounting — `edges-gap/_gaps.json` reports `"sparseCareers": []`, i.e. after gap review and the canonical tier, no career was left below its expected internship-edge count. Read this alongside the point above: "not starved" here is achieved partly by counting internship support that is currently failing the honesty gate.

**Bottom line for this section:** canonical roles are validated to **exist** at real employers (Deloitte, PwC, KPMG, EY, RSM, Baker Tilly, Standard Chartered, Temasek all really run these programs) — but their career links are judgment calls by an LLM playing "advisor," not measured outcomes, and four of the five currently cannot prove the posting evidence itself is *current* rather than an archived/evergreen careers page.

---

## 2c. Course de-duplication

`meta.flags.mergedCourses` is **absent** — `data/sources/accounting-sg/courses/_merges.json` contains `{"merges": []}`. **No course merge happened in this run.** Of the 6 NTU Accountancy courses considered, none were judged title-similar/same-level duplicates of one another, so there was nothing to collapse. `meta.flags.mergeSkipped` is likewise absent (no merge group was proposed and then refused).

For context on the mechanism this dataset didn't need: merges only collapse **same-level**, title-similar courses into one representative, keep a single member id, and union both the surviving edges and all members' catalog evidence, so grounding is not lost in the collapse. That machinery simply had nothing to do here — the 6 candidate courses (`ntu-ac1103`, `ntu-ac2401`, `ntu-ac2104`, `ntu-ac2301`, `ntu-ac3102`, `ntu-ac3104`) are 6 distinct catalog codes with 6 distinct topics (intro accounting, AIS, assurance/auditing, taxation, risk reporting/derivatives, ERM/sustainability) at three different levels.

---

## 3. Every node and edge, with evidence and confidence

All `retrievedAt` timestamps below are **2026-07-11T07:50:04Z** unless noted (the postings manifest fetch itself was logged at `2026-07-11T07:49:16Z`). Quotes are as recorded in `data/datasets/accounting-sg.json`; full text there.

### 3.1 Career nodes (3)

#### `external-auditor` — External Auditor · grounding: **soc** (13-2011.00)

| Evidence source | Quote |
|---|---|
| O*NET 13-2011.00 (Accountants and Auditors) | "Examine, analyze, and interpret accounting records to prepare financial statements, give advice, or audit and evaluate statements prepared by others." |
| O*NET 13-2011.00, Tasks | "Prepare detailed reports on audit findings. Inspect account books and accounting systems for efficiency, effectiveness, and use of accepted accounting procedures to record transactions. Inspect cash on hand, notes receivable and payable, negotiable securities, and canceled checks to confirm records are accurate." |

Distinctive skills: inspecting account books and accounting systems; reconciling cash, receivables, and payables; communicating with supervisors, peers, or clients.

#### `internal-auditor` — Internal Auditor · grounding: **soc** (13-2011.00 — same SOC as `external-auditor`, §2.8)

| Evidence source | Quote |
|---|---|
| O*NET 13-2011.00, Tasks | "Collect and analyze data to detect deficient controls, duplicated effort, extravagance, fraud, or non-compliance with laws, regulations, and management policies." |
| O*NET 13-2011.00, Tasks | "Report to management about asset utilization and audit results, and recommend changes in operations and financial activities. Supervise auditing of establishments, and determine scope of investigation required." |

Distinctive skills: detecting deficient controls or fraud; supervising audit scope and investigation depth; interviewing staff about transactions and controls; coordination with process owners; administration and management knowledge; analytical/scientific software; organizing, planning, and prioritizing work.

#### `tax-consultant` — Tax Consultant · grounding: **soc** (13-2082.00, Tax Preparers)

| Evidence source | Quote |
|---|---|
| O*NET 13-2082.00 | "Prepare tax returns for individuals or small businesses." (alternate title "Tax Consultant" listed under this SOC) |
| O*NET 13-2082.00, Tasks | "Use all appropriate adjustments, deductions, and credits to keep clients' taxes to a minimum. Interview clients to obtain additional information on taxable income and deductible expenses and allowances. Consult tax law handbooks or bulletins to determine procedures for preparation of atypical returns. Answer questions and provide future tax planning to clients." |

Distinctive skills: tax preparation software; computing taxes owed or overpaid; consulting tax law handbooks for atypical returns; future tax planning advice; explaining tax law to clients; reviewing financial records for deductible expenses; service orientation; spreadsheet software.

### 3.2 Course nodes (3 shipped of 6 considered) — all evidence type `catalog`, source NTU WIS, retrieved 2026-07-11T07:50:04Z

| Course | Level (basis) | Catalog quote (abridged) |
|---|---|---|
| `ntu-ac2104` — Assurance & Auditing | 2000 (intro-prereq, one step deep) | "…in-depth understanding of key assurance concepts and methodologies… conduct financial statements audits and other assurance services… problem solving and decision making, critical thinking, research, communication, teamwork… professional skepticism and a passion for proactive self-learning." |
| `ntu-ac2301` — Principles of Taxation | 2000 (intro-prereq, one step deep) | "…framework to understand the structure of the Singapore income tax and the goods and services tax… apply the tax laws to ascertain the tax treatment of common business and personal transactions, and to devise appropriate strategies for the minimization of tax costs." |
| `ntu-ac3104` — Enterprise Risk Management & Sustainability | 3000 (narrative override, §2.7) | "…both the internal and external auditors increasingly need to understand ERM to properly appreciate key risks, controls and governance issues… carbon management, sustainability reporting and assurance… hands-on data analytics and data-mining application in the areas of business and fraud risk assessments and audit analytics." |

Dropped courses (`ntu-ac1103`, `ntu-ac2401`, `ntu-ac3102`) are listed with full evidence in §2.3.

### 3.3 Internship nodes (6)

#### `mid-tier-firm-tax-intern` — Tax Intern (Mid-Tier Firm) · grounding: clustered postings

| Company / title | URL | Snapshot |
|---|---|---|
| Audit Alliance LLP — Accounting and Tax Intern | mycareersfuture.gov.sg/.../accounting-tax-intern-audit-alliance-... | `postings/mycareersfuture.json` |
| Chartsworth Pte. Ltd. — Accounting and Tax Intern | mycareersfuture.gov.sg/.../accounting-tax-intern-chartsworth-... | `postings/mycareersfuture.json` |

#### The five canonical roles (`canonical-big-4-audit-assurance-intern`, `canonical-mid-tier-firm-audit-intern`, `canonical-corporate-finance-internal-audit-intern`, `canonical-big-4-risk-advisory-intern`, `canonical-big-4-tax-advisory-intern`)

Full employer evidence, ages, and gate status are in §2b's table — not repeated here to avoid duplication; treat that table as this section's internship-node evidence for the canonical tier.

### 3.4 Edges (13 total in the shipped dataset)

| From → To | Conf. | Tier | Distinctive / matched skills | Notes |
|---|---|---|---|---|
| `ntu-ac2104` → `external-auditor` | 0.85 | direct, auto-accepted | "Communicating with supervisors, peers, or clients" | §2.11 |
| `ntu-ac2104` → `internal-auditor` | 0.542 | inferred (via `external-auditor`, adjacency 0.75) | "scope overlap with external-auditor" | §2.4 |
| `ntu-ac2301` → `tax-consultant` | 0.90 | direct, auto-accepted | future tax planning advice; consulting tax law handbooks; explaining tax law to clients | §2.11 |
| `ntu-ac2301` → `external-auditor` | 0.45 | judged (gap review) | — | §2.5 |
| `ntu-ac3104` → `internal-auditor` | 0.75 | direct, **skeptic-reviewed (kept)** | "Detecting deficient controls or fraud" | §2.11 |
| `ntu-ac3104` → `external-auditor` | 0.446 | inferred (via `internal-auditor`, adjacency 0.70) | "scope overlap with internal-auditor" | §2.4 |
| `mid-tier-firm-tax-intern` → `tax-consultant` | 0.85 | direct, auto-accepted | corporate/individual tax computation; income tax & GST returns preparation | §2.11 |
| `mid-tier-firm-tax-intern` → `external-auditor` | 0.40 | judged (gap review) | — | §2.5 |
| `canonical-big-4-audit-assurance-intern` → `external-auditor` | 0.70 | judged (canonical tier) | — | §2b — **role fails CURRENT-evidence gate** |
| `canonical-big-4-audit-assurance-intern` → `internal-auditor` | 0.45 | judged (canonical tier) | — | §2b — **role fails CURRENT-evidence gate** |
| `canonical-mid-tier-firm-audit-intern` → `external-auditor` | 0.65 | judged (canonical tier) | — | §2b — **role fails CURRENT-evidence gate** |
| `canonical-mid-tier-firm-audit-intern` → `internal-auditor` | 0.65 | judged (gap review + canonical tier) | — | §2.5, §2b — **role fails CURRENT-evidence gate** |
| `canonical-corporate-finance-internal-audit-intern` → `internal-auditor` | 0.65 | judged (canonical tier) | — | §2b — role **passes** CURRENT-evidence gate |
| `canonical-corporate-finance-internal-audit-intern` → `external-auditor` | 0.40 | judged (canonical tier) | — | §2b — role **passes** CURRENT-evidence gate |
| `canonical-big-4-risk-advisory-intern` → `internal-auditor` | 0.55 | judged (canonical tier) | — | §2b — **role fails CURRENT-evidence gate** |
| `canonical-big-4-risk-advisory-intern` → `external-auditor` | 0.40 | judged (canonical tier) | — | §2b — **role fails CURRENT-evidence gate** |
| `canonical-big-4-tax-advisory-intern` → `tax-consultant` | 0.60 | judged (canonical tier) | — | §2b — **role fails CURRENT-evidence gate** |
| `canonical-big-4-tax-advisory-intern` → `external-auditor` | 0.45 | judged (gap review + canonical tier) | — | §2.5, §2b — **role fails CURRENT-evidence gate** |

(13 edges listed once each; two rows above document the same edge from two angles — §2.5 gap-review rationale and §2b canonical-tier evidence — for `canonical-mid-tier-firm-audit-intern → internal-auditor` and `canonical-big-4-tax-advisory-intern → external-auditor`.)

**Edge pipeline summary this run:** 3 auto-accepted (≥0.85 confidence, no review needed); 5 candidate edges fell below the 0.4 inference floor and were discarded before any review (§2.3); 1 edge landed in the reviewable band and was sent to the skeptic, who kept it (§2.11, fail-closed rule: any other unreviewed banded candidate drops); the remaining edges above the floor were accepted via gap-review judgment (§2.5) or the canonical-tier proposal-and-validate flow (§2b), neither of which is a direct skill-text match.

---

## 4. Staleness and re-run cadence

| Evidence tier | Volatility | Consequence |
|---|---|---|
| Clustered/mycareersfuture postings (`mid-tier-firm-tax-intern` and the 4 dropped clustered internships) | **Weeks.** Live government job-board listings churn with recruiting cycles. | Re-verify the 2 live posting quotes backing `mid-tier-firm-tax-intern` before relying on this run past a few weeks. |
| Canonical-tier internship postings/employer pages (all 5 canonical roles) | **Weeks to a season**, and currently unmeasurable for 4 of 5 roles since they carry no `postedAt` at all (§1, §2b). Treat their "current" status as unverified until re-fetched with a date, even though the run happened this week. | This is also **seasonal**: audit/tax/risk vacation-scheme intakes for Big 4 and mid-tier firms in Singapore run on an annual recruiting calendar (typically posted a few months ahead of a June–August or December start), so a posting that looks "current" in July may be entirely stale by the next intake cycle. **Re-validate the canonical tier every cycle**, not just re-fetch it — a page that still exists is not proof a new intake is open. |
| NTU catalog (Accountancy dept) | Semesterly/annual; catalog codes and prerequisite chains are stable within an academic year. | Course quotes and prereq-derived levels (including the AC3104 override, §2.7) should hold for the current academic year; re-check at the next catalog publication. |
| O*NET database | Pinned to release 29.1, vendored. New releases roughly annually. | Effectively frozen; refresh on new O*NET release. |

**Recommended cadence:**

- **Fix the four undated canonical postings first, before any re-run cadence matters** — either re-fetch each with a real `postedAt` (or confirm each is on an active intern-list snapshot) or explicitly relabel them as non-current pending re-verification. This is the one item that blocks sign-off.
- **Postings refresh every 4–6 weeks** during Singapore's audit/tax internship recruiting season (roughly Q1–Q2 for June–August starts, and again ahead of December intakes), 8 weeks otherwise: re-fetch the mycareersfuture queries, fix or replace the three dead Big 4 Lever boards (§2.10), and re-snapshot every canonical-tier posting/employer page with a captured date.
- **Re-validate the canonical tier every cycle**, independent of the clustered-posting refresh — "the employer really runs this program" (validated) and "this specific posting is current" (dated evidence) are two different claims, and only the first is durable across a season.
- **Re-run the full (non-pilot) grounding pass before treating career/course coverage as final** — at 3 careers, the distributional and coverage gates and the senior-narrowing simulation (§2.12) have never actually been exercised on this industry; a full run is required before any of "balanced," "not internship-starved at scale," or "the map narrows correctly for a senior" can be claimed.
- **Re-ground SOC careers on each O*NET release** (check `onetVersion` against onetcenter.org; currently 29.1).

---

*Report generated 2026-07-11 for run `accounting-sg-20260711T074821Z`. This report covers a pilot dataset that FAILED its (pilot-scope) gates; sign-off here does not authorize registering `accounting-sg` as an app tab, applying `apply: true`, or writing `data/catalogs/accounting-sg.js` (see §1).*
