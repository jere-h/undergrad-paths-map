# Human sign-off report — Accounting (Singapore)

- **Run ID:** `accounting-sg-20260711T074821Z`
- **Industry:** `accounting-sg`
- **University:** NTU (Nanyang Technological University)
- **Generated:** 2026-07-11T08:14:13Z by `ground-catalog`
- **O\*NET version:** 29.1
- **Dataset:** `data/datasets/accounting-sg.json`
- **Catalog module:** `data/catalogs/accounting-sg.js` (registered as app tab **"Accounting (Singapore)"** in `data/catalogs/index.js`)
- **Report generated:** 2026-07-11 (supersedes an earlier stale report that reflected a FAILED run)

> **What this dataset is — read first.** This is a *verified skill-overlap heuristic* over requirement-side evidence: NTU course descriptions, O\*NET task/skill statements, and live/canonical job postings. An edge means "the skills this course/internship teaches overlap the skills this career requires." It is **NOT** a measured outcome. **Nothing in this dataset says a graduate of course X actually got hired into career Y.** Read every edge as "plausible skill preparation," not "observed destination."

> **Update (2026-07-11): advanced-course coverage.** Several genuinely-relevant advanced (2000/3000-level) courses had been dropped because the direct edge-judge under-connected them (missed the obvious career, or scored just below the strict L3000 floor) — e.g. *Risk Reporting & Analysis* was dropped despite obviously serving Risk & Compliance Analyst. A focused gap-review rescued them as **judgment-tier edges** (advisor-nod bar, 0.4–0.7, drawn softer, labelled judgment-based). After this, **9 of 10 careers have advanced-course support**; only **tax-consultant** remains *coursework-thin* — a genuine curriculum gap (no advanced tax course in the fetched NTU sweeps), now surfaced honestly in the app's career panel (`career.courseworkThin`) rather than left as a silent dead-end. As a result, some downstream counts elsewhere in this report have moved: course total 19 → 29, dropped inputs shrank to 7 (all L1000 intro/law/ethics), judged (gap) edges 37, and there is now a third advisory warning (`coursework-thin: tax-consultant`).

---

## 1. Verdict

**GATES PASSED — full gates.** `PASS: data/datasets/accounting-sg.json (full gates), 0 error(s), 2 warning(s)`. `node --test`: all **68** tests pass.

This catalog was generated with `apply: true`, so it **is already registered as a live app tab** ("Accounting (Singapore)"). The two warnings below are advisory, not blocking; they are documented in this report by design.

```
WARN  career accounting-systems-analyst: internship-starved (flagged; see review report)
WARN  narrowing simulation (target financial-accountant): breadth closes 0; senior stack peaks 7 open, ends 5 open / 3 crowded out
PASS: data/datasets/accounting-sg.json (full gates), 0 error(s), 2 warning(s)
```

### What a human must review before this ships

1. **Two careers rest on posting evidence, not O\*NET** (`accounting-systems-analyst`, `forensic-accountant`) — lower provenance. Confirm the role framing is fair (Section 2).
2. **The entire company-board (ATS) layer returned nothing.** All 11 configured boards (deloitte, pwc, ey, kpmg, bdo, rsm, crowe, bakertilly, mazars, temasek, grab) were dead/empty. **100% of the Singapore intern evidence comes from MyCareersFuture (34 live dated postings) plus manually-sourced canonical employer pages.** If you expected Big-4 ATS coverage, that gap is real (Section 2).
3. **The validated-canonical internship tier is judgment-linked, not measured** (Section 2b). Those 4 diamond roles are validated to *exist* at real employers; their career links and their `requiredSkills` are analyst judgment, not posting-extracted.
4. **17 course inputs were dropped** (no surviving edges) and **2 proposed canonical internships were skipped** (undated evidence). Confirm nothing important was silently lost (Sections 2, 2b, "Corrections applied").
5. **Four careers collide on one SOC code** (13-2011.00). Confirm they read as genuinely distinct roles, not one role four times (Section 2).

---

## Corrections applied (history — the earlier run FAILED; this one PASSES)

This report **overwrites a stale report that documented a failed run.** The dataset has since been corrected and now passes full gates. For an honest audit trail, here is what changed:

- **Duplicate course inputs (cross-listing).** Two NTU courses were swept twice under two subject-code crawls and appeared as duplicate input ids. Resolved by keeping **one canonical copy each**: `ntu-ac3104` (*Enterprise Risk Management & Sustainability*, **AC** code) kept under **Accountancy**; `ntu-ab5102` (*Forensic Accounting & Fraud Investigation*, **AB** code) kept under **Business Core**. Edges are keyed by `id` and were unaffected by the de-duplication.
- **Two canonical internships failed the current-evidence gate.** `deal-advisory-valuation-intern` and `finance-transformation-systems-intern` had **only undated employer career-page evidence** (both `postedAt: null`) and **no matching dated MyCareersFuture posting**. They were moved to **failures (NOT validated)** — see `meta.flags.canonicalSkipped`. **The gate was never weakened**; the roles were dropped instead.
- **Gap-review re-run.** After the evidence was corrected, the gap-review re-ran and wrote **19 judged edges** to `data/sources/accounting-sg/edges-gap/judged.json`.

---

## 2. Flags (advisory)

### 2.1 Posting-grounded careers (lower provenance)
Two of the ten careers are grounded on job-posting evidence rather than an O\*NET SOC anchor. Treat their skill lists as posting-derived, not standards-derived:

| Career | Grounding | Evidence |
| --- | --- | --- |
| `accounting-systems-analyst` (Accounting Systems and Business Analyst) | **postings** | 2 web JD snapshots (elevatus.io ERP systems-analyst JD; velvetjobs SAP FI/CO ERP business-analyst JD), retrieved 2026-07-11 |
| `forensic-accountant` (Forensic Accountant) | **postings** | 2 web postings (EY "Associate — Assurance, Forensic — Fraud & Investigation, 2026 Graduates"; jobslah forensic-accountant JD), retrieved 2026-07-11 |

The other 8 careers are SOC-grounded (O\*NET 29.1).

### 2.2 Dropped inputs — 17 courses with no surviving edges
`meta.flags.droppedInputs` (17 course ids). These were crawled but produced no edge that survived the skeptic pass, so they do **not** appear in the dataset. Confirm none is a course you would expect to route somewhere:

`ntu-ac3102`, `ntu-bf3204`, `ntu-bf2100`, `ntu-bf2229`, `ntu-bf2209`, `ntu-bf3202`, `ntu-bf2214`, `ntu-bf2228`, `ntu-bc2406`, `ntu-bc3405`, `ntu-ab0301`, `ntu-ab0403`, `ntu-ab1201`, `ntu-ab1202`, `ntu-ab1301`, `ntu-ab3601`, `ntu-ac3105`

(Two of these — `ntu-ab0301`, `ntu-ab1301` — were explicitly dropped by the skeptic as "matched only on generic O\*NET *Law and government knowledge*"; see the verdicts in Section 3.5.)

### 2.3 Inferred (adjacency / scope-overlap) edges — 17
`meta.flags.inferredEdges = 17`. These are **not backed by a direct skill match.** They are propagated across the career adjacency graph (`careers/_adjacency.json`): if input X matches career A, and career A is adjacent to career B, a softened edge X→B is created carrying `via`, `adjacencyWeight`, and `matchedSkills: ["scope overlap with A"]`. **These rest on judgment (scope overlap), not evidence, and are drawn softer (lower confidence).**

Verified against the dataset: **11 on courses + 6 on clustered internships = 17.**

| Input | → Career | Confidence | Via |
| --- | --- | --- | --- |
| ntu-ac2105 | corporate-finance-analyst | 0.414 | management-accountant |
| ntu-ac3104 | external-auditor | 0.446 | internal-auditor |
| ntu-ac3104 | risk-compliance-analyst | 0.414 | internal-auditor |
| ntu-ac2104 | internal-auditor | 0.574 | external-auditor |
| ntu-ac2104 | financial-accountant | 0.535 | external-auditor |
| ntu-ac2104 | forensic-accountant | 0.459 | external-auditor |
| ntu-ac3103 | corporate-finance-analyst | 0.542 | financial-analyst |
| ntu-bf2201 | corporate-finance-analyst | 0.459 | financial-analyst |
| ntu-bf3203 | corporate-finance-analyst | 0.561 | financial-analyst |
| ntu-ab5101 | corporate-finance-analyst | 0.542 | financial-analyst |
| ntu-ab5102 | external-auditor | 0.43 | forensic-accountant |
| corporate-finance-finance-intern | external-auditor | 0.433 | financial-accountant |
| corporate-finance-finance-intern | management-accountant | 0.433 | financial-accountant |
| corporate-finance-fpa-controlling-intern | financial-analyst | 0.547 | corporate-finance-analyst |
| corporate-finance-fpa-controlling-intern | management-accountant | 0.469 | corporate-finance-analyst |
| mid-tier-firm-accounting-intern | external-auditor | 0.433 | financial-accountant |
| mid-tier-firm-accounting-intern | management-accountant | 0.433 | financial-accountant |

### 2.4 Gap-review judged edges — 19 (with rationales)
`meta.flags.judgedEdges = 19`. When a course's direct-match destinations were sparse, the gap-review proposed additional edges on **reasoned judgment**, each written with an explicit rationale. **These rest on gap-review judgment, not a direct skill match, and are drawn softer.** Full list from `edges-gap/judged.json`:

| Input | → Career | Conf. | Rationale |
| --- | --- | --- | --- |
| ntu-ac1103 | external-auditor | 0.55 | Intro financial accounting under SFRS is the statement-literacy auditors rely on to know which line items carry audit risk. |
| ntu-ac1103 | management-accountant | 0.50 | Recognising and measuring the core accounting elements is the foundational accounting knowledge management accountants build costing and reporting on. |
| ntu-ac2401 | internal-auditor | 0.55 | Evaluating business processes and enterprise information systems is exactly the systems-reliability and data-integrity review internal auditors perform. |
| ntu-ac2401 | financial-accountant | 0.45 | Fluency with enterprise information systems underpins the ERP/accounting-software work of closing the books and preparing statements. |
| ntu-ac1104 | financial-accountant | 0.55 | Intermediate recognition and measurement is the core financial-reporting knowledge needed to prepare a set of statements end to end. |
| ntu-ac1104 | external-auditor | 0.45 | Understanding costing systems and how items are recognised and measured lets an auditor test where those numbers could be misstated. |
| ntu-ac2301 | financial-accountant | 0.50 | Knowing Singapore income tax and GST is needed to book tax expense and deferred tax correctly in the financial statements. |
| ntu-ac2301 | forensic-accountant | 0.40 | Applying tax law to transactions supports the bank-record and tax-return analysis forensic accountants use to trace financial trails. |
| ntu-ac2302 | internal-auditor | 0.50 | Corporate governance mechanisms and the legal framework for companies are the governance baseline internal auditors assess controls against. |
| ntu-ac2302 | corporate-finance-analyst | 0.40 | Understanding corporate finance and insolvency law informs the debt-restructuring and refinancing advice corporate finance analysts support. |
| ntu-ac2101 | external-auditor | 0.55 | Recognition and measurement of revenue and other elements is precisely the area (e.g. revenue recognition) auditors scope as highest risk. |
| ntu-ac2101 | financial-analyst | 0.40 | Knowing how statement elements are recognised and measured lets an analyst read fast enough to see which line moved a valuation and why. |
| ntu-bf2213 | internal-auditor | 0.55 | Designing internal control mechanisms and identifying compliance risks is the control-evaluation core of internal audit work. |
| ntu-bf2213 | forensic-accountant | 0.45 | AML risk assessment and spotting compliance risks feed directly into fraud investigation and detecting suspicious activity. |
| ntu-bf2302 | risk-compliance-analyst | 0.45 | International tax law, treaties and trade-law analysis build the law-and-regulation knowledge a compliance analyst applies to cross-border activity. |
| ntu-bc2402 | internal-auditor | 0.45 | Database design and querying is what lets an auditor pull and test a whole population of transactions rather than eyeball a sample. |
| ntu-bc2402 | financial-analyst | 0.40 | Data management and querying skills back the business-intelligence and database work analysts use to support an argument with data. |
| ntu-bc3409 | financial-analyst | 0.50 | Building predictive models and automating financial analysis in R/Python is directly the modelling analysts do to analyse company performance. |
| ntu-bc3409 | forensic-accountant | 0.45 | Using AI on prepared data to flag anomalies maps onto finding the outlier in a large population of transactions during a fraud investigation. |

### 2.5 Internship-starved careers
`meta.flags.internshipStarved = ["accounting-systems-analyst"]`. Of the 10 careers, 9 have at least one internship feeding them; **`accounting-systems-analyst` has none.** The role is real (2 posting sources) and well-served by course edges (AC2401, BC2402, BC3409), but no Singapore intern posting in this pull maps to it, and its would-be canonical feeder (`finance-transformation-systems-intern`) was one of the two that failed validation (Section 2b). Treat the systems-analyst destination as course-supported but internship-unsupported.

### 2.6 Level tie-breaks (`levelNote` on courses)
Levels were LLM-assigned (the NTU catalog has no courseblock structure), primarily by prerequisite depth: no prereq → 1000, intro-level prereq → 2000, deeper chain → 3000. Every course carries a `levelNote` explaining the call. Three needed a **catalog-code-vs-prereq override** worth a human glance:

| Course | Code | Assigned level | Note |
| --- | --- | --- | --- |
| ntu-bf3201 (Corporate Finance & Strategy) | BF3201 | 3000 | Prereq depth alone → 2000, but code + "expands upon AB1201" + advanced strategy framing → set to 3000. |
| ntu-bf3203 (Equity Securities) | BF3203 | 3000 | Prereq depth alone → 2000, but code + advanced valuation topics and Bloomberg/Thomson Reuters tooling → set to 3000. |
| ntu-bc3409 (AI in Accounting & Finance) | BC3409 | 3000 | **`levelTieBreak: true`** — deeper two-step prereq chain, consistent with the 3000-series code. |

Also note two Accountancy courses with 2xxx-style codes assigned **1000** because they carry no prerequisite (`ntu-ac2401` AC2401 → 1000 on the no-prereq baseline). Confirm the year-level labels look right on the map.

### 2.7 Same-SOC collisions
Four careers share O\*NET **13-2011.00** (Accountants and Auditors): `external-auditor`, `financial-accountant`, `internal-auditor`, `management-accountant`. Their skill pools are differentiated by the distinctive-skills pass (`careers/_distinctive.json`, `collisions: []` — no unresolved skill collisions), but a human should confirm they read as four genuinely distinct roles on the map and not one role repeated. (Other SOCs: 13-2051.00 shared by `financial-analyst` + `corporate-finance-analyst`; 13-2061.00 `risk-compliance-analyst`; 13-2082.00 `tax-consultant`.)

### 2.8 Dead / empty company boards (ATS layer)
`postings/manifest.json` (retrieved 2026-07-11T08:13:08Z): **all 11 configured ATS boards returned zero postings** — every one flagged `"zero postings returned (bad slug or empty board)"`:

`temasek` (greenhouse), `grab` (greenhouse), `deloitte`, `pwc`, `ey`, `kpmg`, `bdo`, `rsm`, `crowe`, `bakertilly`, `mazars` (all lever).

The **only** productive posting source was **MyCareersFuture** (`api.mycareersfuture.gov.sg`): **34 results, all 34 intern-level, all 34 with descriptions**, dated **2026-06-15 → 2026-07-10**. Every clustered-internship node and every posting-grounded career in this dataset traces to that single MCF pull (the canonical tier adds manually-sourced employer pages on top — Section 2b). **This is a single-source dependency for the live-posting layer.** If the Big-4/mid-tier ATS slugs are wrong, fixing them would materially broaden and de-risk the evidence base on the next run.

### 2.9 Senior-narrowing simulation
`WARN narrowing simulation (target financial-accountant): breadth closes 0; senior stack peaks 7 open, ends 5 open / 3 crowded out.` A student who keeps options open closes **0** doors (the breadth path stays fully open); a student who commits early toward `financial-accountant` sees the senior-course stack **peak at 7 open destinations, then narrow to 5, crowding out 3.** The intended "explore broadly, then specialize" story holds — specialization costs 3 destinations, and only at the senior end. Advisory only; nothing to fix.

---

## 2b. Validated-canonical internship tier (dedicated section)

`meta.flags.internshipVariety = { total: 7, clustered: 3, canonical: 4 }`. Seven internship nodes total: **3 clustered** (aggregated from live MCF postings) + **4 canonical** (named standing roles validated against real employer evidence). Rendered as diamonds in the app.

> **Say it plainly:** the 4 canonical roles are validated to **EXIST** at real employers. Their **career links are analyst judgment, and their `requiredSkills` are judgment** (`skillsBasis: "judgment"`), **not posting-extracted.** They are *not* measured student outcomes.

### The 4 validated canonical roles

Each lists its validation evidence **with age** (`postedAt` vs `retrievedAt` = 2026-07-11). **Undated / older evidence must be read as historical, not current.**

#### `canonical-audit-assurance-intern` — Audit / Assurance Intern (Big 4)
- **Evidence & age:**
  - Deloitte — "A&A - External Audit Intern - Audit & Assurance (Summer 2026 Internship)" — **`postedAt: null` (UNDATED → treat as historical)**. `web-audit-assurance-intern-1.txt`.
  - KPMG Singapore — "Audit - Technology Assurance | Summer Internship 2026" — **`postedAt: 2025-12-01` (~7 months old at retrieval → historical/seasonal)**. `web-audit-assurance-intern-2.txt`.
- **Judged-edge rationales (from `_proposals.json`):** external-auditor **0.70** ("an assurance intern is a trainee external auditor: the day-to-day of testing balances, vouching to source documents, and building workpapers is exactly the junior half of this role"); internal-auditor **0.50** ("controls walkthroughs and transaction testing overlap… a plausible bridge into internal audit even though scoping differs"); financial-accountant **0.50** ("reading and reconciling a full set of statements against reporting standards is the same knowledge base the accountant uses to prepare them").
- **requiredSkills = JUDGMENT** (`skillsBasis: "judgment"`): vouching/tracing to source docs, audit workpaper documentation, sampling & substantive testing, SFRS/IFRS familiarity, account reconciliations, Excel, audit software/data-analytics exposure (e.g. CaseWare).

#### `canonical-tax-intern` — Tax Intern (Big 4)
- **Evidence & age:**
  - KPMG Singapore — "Tax - Corporate Tax Planning & Compliance | Off-Cycle Internship (Jul 2026 to Dec 2026)" — **`postedAt: 2026-07-09` (CURRENT — 2 days before retrieval)**. `web-tax-intern-1.txt`.
  - Deloitte Singapore — "Tax & Legal Intern - Business Tax Advisory, International Tax (Summer 2026 Internship)" — **`postedAt: null` (UNDATED → historical)**; note the URL is a third-party career-advice guide (`founditgulf.com`), not the employer ATS. `web-tax-intern-2.txt`.
- **Judged-edge rationales:** tax-consultant **0.70** ("a tax intern does the junior work of the consultant role directly: preparing computations, researching tax treatment, and drafting returns under review"); financial-accountant **0.40** ("tax work requires reading income statements and expense documentation to determine treatment, which an advisor would accept as adjacent to statement preparation").
- **requiredSkills = JUDGMENT:** corporate income tax computations, GST return prep, tax-law/IRAS research, reviewing income statements & expense records, tax prep/compliance software, Excel, arithmetic/data-entry care.

#### `canonical-risk-advisory-internal-audit-intern` — Risk Advisory / Internal Audit Intern (Big 4)
- **Evidence & age:**
  - AlixPartners — "Risk Advisory Intern" — **`postedAt: 2026-07-01` (CURRENT — 10 days before retrieval)**. `web-risk-advisory-internal-audit-intern-1.txt`.
  - Grant Thornton Singapore — "Business Risk Intern (Jul - Dec 2026)" — **`postedAt: null` (UNDATED → historical)**. `web-risk-advisory-internal-audit-intern-2.txt`.
- **Judged-edge rationales:** internal-auditor **0.65** ("risk advisory internal-audit interns do the core internal-audit work of walkthroughs, controls testing, and recommendation drafting; this is the recognised feeder role"); risk-compliance-analyst **0.60** ("evaluating activity against regulatory standards and writing examination-style findings is central to both, and undergrads routinely enter compliance through risk advisory"); external-auditor **0.45** ("controls testing and evidence documentation overlap with financial-statement audit… even though the opinion scope differs").
- **requiredSkills = JUDGMENT:** internal-controls testing & walkthroughs, risk/compliance framework familiarity, process mapping & documentation, audit/examination report drafting, data analysis of transaction populations, Excel, GRC/ERP exposure.

#### `canonical-forensic-financial-crime-intern` — Forensic / Financial Crime Intern (Big 4)
- **Evidence & age:**
  - EY (Ernst & Young Singapore) — "Intern - Assurance, Forensic - Fraud & Investigation (Off-cycle Jul - Dec 2026)" — **`postedAt: 2026-06-27` (CURRENT — ~2 weeks before retrieval)**. `web-forensic-financial-crime-intern-1.txt`.
  - FTI Consulting — "Intern, Forensic Accounting & Investigations (between March to December 2026)" — **`postedAt: 2026-02-11` (~5 months old → historical/seasonal)**. `web-forensic-financial-crime-intern-2.txt`.
- **Judged-edge rationales:** forensic-accountant **0.65** ("a forensic-advisory intern does the junior version of this role directly: reconstructing trails from messy records and running analytics to surface anomalies"); risk-compliance-analyst **0.50** ("financial-crime and AML investigation work overlaps regulatory-violation review, a bridge both a student and advisor would recognise"); external-auditor **0.40** ("fraud detection, evidence documentation, and tracing to source are shared with audit testing, a plausible but weaker adjacency").
- **requiredSkills = JUDGMENT:** transaction tracing/reconstruction, forensic data analytics (IDEA, ACL), fraud/anomaly ID in large datasets, findings-report writing, review of bank records/financial docs, confidentiality & evidence handling, Excel.

### Variety split
`meta.flags.internshipVariety`: **3 clustered + 4 canonical = 7** internship nodes total.

### The 2 roles the join SKIPPED — and why
`meta.flags.canonicalSkipped`. Both were proposed but **failed the current-evidence gate** and were moved to `internships-canonical/validation.json → failures`:

| Skipped role | orgType | Why (verbatim reason) |
| --- | --- | --- |
| `deal-advisory-valuation-intern` | Corporate Finance | "No CURRENT evidence: both employer sources are undated career/landing pages (`postedAt:null`) and MyCareersFuture carries no matching dated posting within the currency window. Cannot validate a current role on archived/undated pages alone." |
| `finance-transformation-systems-intern` | Big 4 | Same reason — both sources undated (`postedAt:null`), no matching dated MCF posting in the currency window. |

The gate was **not** weakened to admit them; they were dropped. (The failed `finance-transformation-systems-intern` is exactly the role that would otherwise have fed the internship-starved `accounting-systems-analyst` — see Section 2.5.)

### Careers whose internship support is ENTIRELY canonical
`meta.flags.canonicalOnlyInternshipCareers`: **`forensic-accountant`, `internal-auditor`, `risk-compliance-analyst`, `tax-consultant`.** For these four, *every* internship edge comes from a judgment-linked canonical role — there is **no clustered (posting-aggregated) internship** behind them. So their internship support is "this role exists at real employers, and an analyst judged it feeds this career," not a measured flow. Weigh accordingly.

---

## 3. Every node and edge — evidence, source, confidence

### 3.1 Careers (10)

| id | Name | Grounding | SOC | Evidence (source / quote-or-title, retrievedAt) |
| --- | --- | --- | --- | --- |
| accounting-systems-analyst | Accounting Systems and Business Analyst | **postings** | — | posting: elevatus.io "Accounting Systems Analyst JD — ERP"; posting: velvetjobs "ERP Business Analyst JD (SAP FI/CO)". 2026-07-11 |
| corporate-finance-analyst | Corporate Finance Analyst | soc | 13-2051.00 | O\*NET 13-2051.00 (FP&A/Treasury alt titles; "advise clients on… capitalization… restructure/refinance debt"); posting: MCF "Finance Controlling Intern" (TOD'S). 2026-07-11 |
| external-auditor | External Auditor | soc | 13-2011.00 | O\*NET 13-2011.00 ("examine, analyze… interpret accounting records…"; "prepare detailed reports on audit findings… detect deficient controls… fraud"). 2026-07-11 |
| financial-accountant | Financial Accountant | soc | 13-2011.00 | O\*NET 13-2011.00 ("prepare, examine, or analyze accounting records, financial statements…"; "inspect cash on hand, notes receivable/payable…"). 2026-07-11 |
| financial-analyst | Financial Analyst | soc | 13-2051.00 | O\*NET 13-2051.00 ("quantitative analyses… valuation of businesses"; "analyze financial or operational performance… identify or recommend remedies"). 2026-07-11 |
| forensic-accountant | Forensic Accountant | **postings** | — | posting: EY "Associate — Assurance, Forensic — Fraud & Investigation (2026 Graduates)"; posting: jobslah "Forensic Accountant JD". 2026-07-11 |
| internal-auditor | Internal Auditor | soc | 13-2011.00 | O\*NET 13-2011.00 ("supervise auditing… determine scope"; "examine records and interview workers… report to management…"). 2026-07-11 |
| management-accountant | Management Accountant | soc | 13-2011.00 | O\*NET 13-2011.00 ("install or advise on systems of recording costs…"; "report… asset utilization… recommend changes in operations"). 2026-07-11 |
| risk-compliance-analyst | Risk and Compliance Analyst | soc | 13-2061.00 | O\*NET 13-2061.00 ("enforce or ensure compliance with laws and regulations…"; "review balance sheets, operating income… loan documentation"). 2026-07-11 |
| tax-consultant | Tax Consultant | soc | 13-2082.00 | O\*NET 13-2082.00 ("prepare tax returns… use all appropriate adjustments, deductions, credits"; "interview clients… provide future tax planning"). 2026-07-11 |

### 3.2 Courses (19) — level, dept, primary destination, confidence, edge type
All course evidence is `type: catalog`, quoted from the NTU AUS_SUBJ_CONT catalog pages, retrieved 2026-07-11. **D** = direct skill-match (distinctive), **J** = gap-review judged, **A** = adjacency/scope-overlap (inferred). Confidence shown for the strongest (direct) destination; softer J/A edges are itemized in Sections 2.3–2.4.

By department: **Accountancy 10, Banking & Finance 5, Business Analytics & Computing 2, Business Core 2.**

| id | Name | Lvl | Dept | Primary dest (conf, type) | Other edges |
| --- | --- | --- | --- | --- | --- |
| ntu-ac1103 | Accounting I | 1000 | Accountancy | financial-accountant (0.60, D) | external-auditor (J .55), management-accountant (J .50) |
| ntu-ac2401 | Accounting Information Systems | 1000 | Accountancy | accounting-systems-analyst (0.70, D) | internal-auditor (J .55), financial-accountant (J .45) |
| ntu-ac1104 | Accounting II | 2000 | Accountancy | management-accountant (0.65, D) | financial-accountant (J .55), external-auditor (J .45) |
| ntu-ac2105 | Accounting For Decision Making & Control | 2000 | Accountancy | management-accountant (0.75, D) | corporate-finance-analyst (A .414) |
| ntu-ac2301 | Principles Of Taxation | 2000 | Accountancy | tax-consultant (0.85, D) | financial-accountant (J .50), forensic-accountant (J .40) |
| ntu-ac2302 | Company Law & Corporate Governance | 2000 | Accountancy | risk-compliance-analyst (0.60, D) | internal-auditor (J .50), corporate-finance-analyst (J .40) |
| ntu-ac3104 | Enterprise Risk Management & Sustainability | 2000 | Accountancy | internal-auditor (0.75, D) | external-auditor (A .446), risk-compliance-analyst (A .414) |
| ntu-ac2101 | Accounting Recognition & Measurement | 3000 | Accountancy | financial-accountant (0.75, D) | external-auditor (J .55), financial-analyst (J .40) |
| ntu-ac2104 | Assurance & Auditing | 3000 | Accountancy | external-auditor (0.90, D) | internal-auditor (A .574), financial-accountant (A .535), forensic-accountant (A .459) |
| ntu-ac3103 | Accounting Analysis & Valuation | 3000 | Accountancy | financial-analyst (0.85, D) | corporate-finance-analyst (A .542) |
| ntu-bf2213 | Introduction to Compliance | 2000 | Banking & Finance | risk-compliance-analyst (0.82, D) | internal-auditor (J .55), forensic-accountant (J .45) |
| ntu-bf3201 | Corporate Finance & Strategy | 3000 | Banking & Finance | financial-analyst (0.80, D) | corporate-finance-analyst (0.75, D) |
| ntu-bf2201 | Investments | 2000 | Banking & Finance | financial-analyst (0.72, D) | corporate-finance-analyst (A .459) |
| ntu-bf3203 | Equity Securities | 3000 | Banking & Finance | financial-analyst (0.88, D) | corporate-finance-analyst (A .561) |
| ntu-bf2302 | International Tax & Trading Law | 1000 | Banking & Finance | tax-consultant (0.80, D) | risk-compliance-analyst (J .45) |
| ntu-bc2402 | Designing & Developing Databases | 1000 | Business Analytics & Computing | accounting-systems-analyst (0.65, D) | internal-auditor (J .45), financial-analyst (J .40) |
| ntu-bc3409 | AI in Accounting & Finance | 3000 | Business Analytics & Computing | accounting-systems-analyst (0.75, D) | financial-analyst (J .50), forensic-accountant (J .45) |
| ntu-ab5101 | Business Valuation: From Theory to Practice | 2000 | Business Core | financial-analyst (0.85, D) | corporate-finance-analyst (A .542) |
| ntu-ab5102 | Forensic Accounting & Fraud Investigation | 2000 | Business Core | forensic-accountant (0.92, D) | external-auditor (A .43) |

### 3.3 Clustered internships (3) — aggregated from live MyCareersFuture postings
Evidence `type: posting`, snapshot `postings/mycareersfuture.json`, retrieved 2026-07-11. These `requiredSkills` are aggregated from the live postings (not judgment). **A** = adjacency-inferred edge.

| id | Role | orgType | Direct dest (conf) | Inferred (A) dest | Example employers |
| --- | --- | --- | --- | --- | --- |
| corporate-finance-finance-intern | Finance Intern | Corporate Finance | financial-accountant (0.85) | external-auditor (.433), management-accountant (.433) | OJJ Foods, Reolink, Hong Ye Group, Sunway Concrete, Cyrus Tech, NTL Naigai, Singapore Resort & Spa (7 postings) |
| corporate-finance-fpa-controlling-intern | FP&A / Finance Controlling Intern | Corporate Finance | corporate-finance-analyst (0.92) | financial-analyst (.547), management-accountant (.469) | TOD'S Singapore, Innowave Tech, Reolink (3 postings) |
| mid-tier-firm-accounting-intern | Accounting Intern | Mid-Tier Firm | financial-accountant (0.85) | external-auditor (.433), management-accountant (.433) | RSM Stone Forest AccountServe, Audit Alliance LLP (2 postings) |

### 3.4 Canonical internships (4) — full detail in Section 2b
| id | Role | orgType | skillsBasis | Judged edges (conf) | Current evidence? |
| --- | --- | --- | --- | --- | --- |
| canonical-audit-assurance-intern | Audit / Assurance Intern | Big 4 | judgment | external-auditor .70, internal-auditor .50, financial-accountant .50 | Partial — 1 dated 2025-12-01 (historical), 1 undated |
| canonical-tax-intern | Tax Intern | Big 4 | judgment | tax-consultant .70, financial-accountant .40 | Yes — KPMG dated 2026-07-09; Deloitte undated |
| canonical-risk-advisory-internal-audit-intern | Risk Advisory / Internal Audit Intern | Big 4 | judgment | internal-auditor .65, risk-compliance-analyst .60, external-auditor .45 | Yes — AlixPartners dated 2026-07-01; GT undated |
| canonical-forensic-financial-crime-intern | Forensic / Financial Crime Intern | Big 4 | judgment | forensic-accountant .65, risk-compliance-analyst .50, external-auditor .40 | Yes — EY dated 2026-06-27; FTI dated 2026-02-11 (historical) |

### 3.5 Skeptic-band decisions (edges-verdicts)
The skeptic pass (`edges-verdicts/batch-1.json`, `batch-2.json`) reviewed candidate course→career edges against the live postings and issued **keep/drop** verdicts. Kept edges are the ones present in the dataset; dropped edges are why some plausible-looking links (and some of the 17 dropped inputs) are absent. Representative decisions:

**Kept:** ac1103→financial-accountant ("FS preparation is the single most common ask — 20 of 34 postings mention preparing FS/GL/closing"); ac2401→accounting-systems-analyst ("two live systems-analyst JDs demand exactly this — ERP SAP/Oracle/NetSuite… plus 11 MCF postings reference ERP"); ac1104→management-accountant & ac2105→management-accountant (costing/budget/variance across 9 live postings); ac2302→risk-compliance-analyst ("corporate governance frameworks in scope"); ac3104→internal-auditor + external-auditor + risk-compliance-analyst (ERM/COSO, SSA/ISA 315, risk-register work); ac2101→financial-accountant; bf2213→risk-compliance-analyst ("8 postings mention compliance"); bf3201→financial-analyst & corporate-finance-analyst; bf2201→financial-analyst; bf2302→tax-consultant; bc2402 & bc3409→accounting-systems-analyst.

**Dropped:** ac1103→external-auditor ("no posting asks auditors for preparer-side SFRS application"); ac2401→internal-auditor ("AIS builds/uses systems rather than auditing their controls"); ab5102→external-auditor ("deep forensic course belongs to forensic-accountant; zero live postings mention fraud/forensic; ISA 240 fraud duty is awareness, not investigation depth"); bf2213→internal-auditor ("rests on a single skill; stronger home is risk-compliance-analyst"); **ab0301→risk-compliance-analyst** and **ab1301→risk-compliance-analyst** (both matched only on generic O\*NET "Law and government knowledge" — these two appear in the dropped-inputs list); ac3104→risk-compliance-analyst in batch-2 (generic law match; supported home is internal-auditor).

Note: some course→career pairs the skeptic *dropped* on a direct-match basis were later re-added by the **gap-review** as explicitly-reasoned **judged** edges at lower confidence (e.g. ac2401→internal-auditor, ac2401→financial-accountant). That is by design — the judged edge carries a rationale and softer weight rather than a hard direct-match claim.

---

## 4. Staleness & re-run cadence

- **The live-posting layer churns in weeks.** All 34 MyCareersFuture postings are dated 2026-06-15 → 2026-07-10; intern listings expire and rotate fast. Within ~4–6 weeks the specific example titles in Section 3.3 will largely be stale even if the aggregate role clusters remain valid.
- **Recommended cadence:** **re-run every 4–6 weeks** while the tab is live, and **at minimum once per recruiting cycle.** Treat any run older than ~2 months as directional, not current.
- **The canonical tier is seasonal too — re-validate each cycle.** The 4 canonical roles are Big-4 internships tied to recruiting seasons; two of the eight canonical evidence items are already historical (`2025-12-01` and `2026-02-11`) and several are undated. Their *existence* is stable across cycles; their *current openness* is not. Re-validate the canonical evidence (fresh dated postings) on every re-run, and re-check whether the 2 skipped roles (`deal-advisory-valuation-intern`, `finance-transformation-systems-intern`) now have current dated evidence.
- **Fix the ATS slugs before the next run.** All 11 company boards returned zero (Section 2.8), so the live layer currently rests entirely on MyCareersFuture plus manual canonical pages. Correcting the greenhouse/lever slugs would broaden coverage and reduce single-source risk.
- **O\*NET / catalog layers are stable.** O\*NET 29.1 and the NTU 2025 catalog change on annual timescales; no urgency there beyond an annual refresh.

---

### Honesty statement
This dataset is a **verified skill-overlap heuristic over requirement-side evidence** — NTU course descriptions, O\*NET task/skill statements, and live/canonical job postings. Edges mean "these skills overlap," drawn at graded confidence and softened for inferred (adjacency) and judged (gap-review) links. **It is not a record of measured outcomes. Nothing here asserts that a graduate of any course was actually hired into any career.** Use it as a structured, evidence-cited map of *plausible* preparation, and review the flagged items above before relying on it.
