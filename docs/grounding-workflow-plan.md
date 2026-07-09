# Grounding workflow plan — from illustrative catalog to evidence-backed dataset

**Status: v2 — revised after engineering-feasibility and effectiveness review.**
The findings that drove each revision are summarized at the end of this document.

## Problem

`data/catalog.js` is hand-authored: the 18 careers, 17 courses, 10 internships, and
every `destinations` edge between them are imagined. The README warns users not to
make real decisions from it. The goal is a **reusable Claude workflow**
(`.claude/workflows/ground-catalog.js`) that regenerates the catalog from real
evidence so the tool becomes usable:

- **Courses** are real courses (codes, titles, levels) from a target university's
  published catalog, with taught skills inferred from their official descriptions.
- **Internship roles** are canonicalized from live, real intern job postings.
- **Careers** carry responsibilities and skills grounded in the O*NET occupational
  database where a clean occupation code exists, and in aggregated live postings
  where one does not.
- **Edges** (course/internship → career) are inferred from *distinctive* skill
  overlap, adversarially verified, and every edge carries provenance (evidence,
  confidence, retrieval date).

### What "usable" means (acceptance gates)

Completing all phases is not success. The generated dataset replaces the
illustrative one only when **all** of the following hold (enforced by
`scripts/validate-dataset.mjs`, not by judgment):

1. Every existing test invariant passes: unique ids, every destination resolves,
   every input has ≥1 destination, no orphan careers, levels ∈ {1000,2000,3000},
   no em/en dashes in career text.
2. **Differentiation gates** (the product's core signal is that different picks
   light different careers):
   - No career's in-degree exceeds 25% of total edges.
   - Career in-degree Gini coefficient ≤ 0.45.
   - Mean pairwise Jaccard similarity of destination sets among same-level
     courses ≤ 0.5 (picks must discriminate, not saturate).
3. **Coverage gates** (missing coverage renders as "this path is closed" in the
   UI, which is a labor-market claim we must not make by accident):
   - Every career has course in-degree ≥ 1, from ≥ 2 distinct departments where
     the career plausibly spans them.
   - Every career has ≥ 1 internship edge, or is explicitly flagged
     `internshipStarved` in the review report with a stated reason.
   - Every internship role is backed by postings from ≥ 2 distinct companies.
4. Every node and edge has ≥ 1 evidence entry with `retrievedAt`, and posting/
   catalog text snapshots exist under `data/sources/` (URLs are pointers; the
   snapshot is the durable evidence).
5. A human has signed off on `data/review-report.md` (low-confidence and flagged
   items listed first).

Until all gates pass, `data/catalog.js` stays illustrative and the README keeps
its disclaimer. Even after they pass, the README banner is **rewritten, not
removed**: edges are a verified skill-overlap heuristic over official
descriptions and postings — requirement-side evidence, not measured student
outcomes. The word "grounded" is reserved for what the evidence actually shows.

## Evidence sources (reachability verified from this environment, 2026-07-09)

| Source | What it grounds | Access | Verified |
|---|---|---|---|
| O*NET bulk database (onetcenter.org, ~13 MB zip of tab-separated text) | Career task statements, skills, technology skills, detailed work activities, knowledge domains per SOC code | Public download, one fetch per run, then deterministic lookup | HTTP 200 |
| University public course catalog (default `catalog.mit.edu`, configurable) | Real course codes, titles, prerequisites, official descriptions | Public HTML (~600 KB, ~430 courses per department page) — parsed deterministically, never pushed raw through an LLM | HTTP 200 |
| Greenhouse board API (`boards-api.greenhouse.io/v1/boards/{co}/jobs?content=true`) | Live intern postings with full descriptions | Public JSON, no auth; multi-MB (Stripe: 3.7 MB, 503 jobs, 12 interns) — pre-filtered with `jq` before any LLM sees it | HTTP 200 |
| Lever postings API (`api.lever.co/v0/postings/{co}?mode=json`) | Same, Lever-hosted companies. Returns `200 []` for bad slugs — zero postings is treated as a per-company failure, not success | HTTP 200 |
| GitHub `SimplifyJobs/Summer{YYYY}-Internships` list | Broad intern-title coverage incl. non-tech employers (finance, consulting, CPG) that don't use Greenhouse/Lever | Public README/JSON | reachable |
| Web search | Corroboration only (e.g. university degree-map pages, first-destination surveys); never sole support for an edge | WebSearch tool | available |
| ~~LinkedIn profiles~~ | ~~career-transition evidence~~ | **Rejected**: bot-blocked (HTTP 999) and scraping violates LinkedIn ToS | blocked |

Known structural bias, stated rather than hidden: Greenhouse/Lever skew tech.
The SimplifyJobs list and web-searched employer career pages fill part of the
gap; any orgType or career whose internship evidence stays thin is *flagged*,
never silently padded.

## Target data model

`data/dataset.json` becomes the source of truth; `data/catalog.js` is
**generated** from it in the exact shape the app already imports (no app changes).

```jsonc
{
  "meta": {
    "generatedBy": "ground-catalog", "runId": "…",       // runId passed in as an arg
    "university": "MIT", "onetVersion": "29.x",
    "generatedAt": "…"                                    // stamped by finalizer agent via `date -u`
  },
  "careers": [{
    "id": "swe", "name": "Software Engineer",
    "grounding": "soc",                    // "soc" | "postings" — no forced SOC codes
    "soc": ["15-1252.00"],                 // present only when grounding === "soc"
    "responsibilities": ["…"], "skills": ["…"],
    "distinctiveSkills": ["…"],            // skills shared by < 1/3 of the career set
    "evidence": [{ "type": "onet", "url": "…", "quote": "…", "retrievedAt": "…" }]
  }],
  "courses": [{
    "id": "mit-6-1010", "name": "Fundamentals of Programming",
    "level": 1000,                         // deterministic prereq-depth mapping, see Phase B
    "levelBasis": "no subject prerequisites",
    "dept": "EECS", "catalogCode": "6.1010",
    "taughtSkills": ["…"],
    "destinations": ["swe"],
    "edges": { "swe": { "confidence": 0.9, "matchedSkills": ["…"], "distinctive": true } },
    "evidence": [{ "type": "catalog", "url": "…", "quote": "…", "retrievedAt": "…" }]
  }],
  "internships": [{
    "id": "startup-swe", "role": "Software Engineer Intern", "orgType": "Startup",
    "exampleTitles": ["Software Engineering Intern — Stripe"],
    "requiredSkills": ["…"],
    "destinations": ["swe"],
    "edges": { … },
    "evidence": [{ "type": "posting", "url": "…", "company": "…", "title": "…", "retrievedAt": "…", "snapshot": "data/sources/postings/…" }]
  }]
}
```

### Career grounding tiers

- **SOC-clean** (swe, backend†, data-analyst, data-scientist, ml-engineer†, ux,
  designer, quant, fin-analyst, consultant, researcher, biotech, economist):
  grounded in O*NET task statements + skills, distilled by LLM with citations.
- **Posting-grounded** (pm, founder, bizops, growth, ibanking): no honest SOC
  match exists (nearest SOC codes describe materially different jobs). These are
  grounded in aggregated live postings + curated profile, marked
  `"grounding": "postings"` and listed as lower-provenance in the review report.
  Phase A is *forbidden* from asserting a SOC below a stated match bar — a wrong
  SOC silently redefines the career while looking evidence-backed.
- **† Same-SOC collision rule**: swe/backend both resolve to 15-1252.00, and
  data-scientist/ml-engineer gravitate to 15-2051. When two careers share a SOC,
  their skill profiles must be differentiated using posting-derived skills
  before both are kept; otherwise they are merged or flagged for the human
  reviewer. Identical profiles would produce identical destination sets — two
  hubs pretending to be distinct paths.

## Division of labor: deterministic scripts vs. agents

The workflow script body has no filesystem or network access — only agents do,
and LLM agents are unreliable at bulk transcription. So all mechanical work
lives in committed, unit-testable scripts that agents *execute via Bash*:

| Script | Role |
|---|---|
| `scripts/onet-extract.mjs` | Given SOC codes and the unzipped O*NET text DB, emit task statements / skills / technology skills / work activities / knowledge as JSON. (The one-time `curl` + `unzip` of the 13 MB DB is a documented Bash step.) |
| `scripts/parse-catalog-html.mjs` | Parse `courseblock` HTML (saved by `curl`) into course JSON: code, title, prereq text, units, description. Also computes the deterministic level mapping. |
| `scripts/fetch-postings.mjs` | `curl` Greenhouse/Lever boards (curl inherits the proxy config; Node fetch does not), filter titles on intern/co-op patterns with entity-decoding and tag-stripping, write snapshots + filtered JSON, and report per-company counts. **0 intern postings ⇒ recorded as a company-level failure.** |
| `scripts/validate-dataset.mjs` | Every gate in "What usable means" above, including the distributional gates. Exits non-zero on any failure. |
| `scripts/build-catalog.mjs` | `dataset.json` → `data/catalog.js` (existing export shape), stripping provenance, rejecting em/en dashes and shape violations deterministically. |

Agents do only semantic work: SOC mapping, distillation, relevance filtering,
skill labeling, edge judging, refutation, report writing.

### State passing (no giant payloads through prompts)

Each phase agent **Writes its own output** to `data/sources/<phase>/<key>.json`
and returns a small schema-validated manifest to the workflow script: `{ path,
counts, sha256, failures[] }` (hash via `sha256sum` in Bash). Later phases
receive file paths, not payloads. Phase E re-validates the files themselves, so
nothing depends on an LLM having faithfully transcribed bulk data. Resume is
file-based: each agent checks for its own valid output file before doing work,
which also makes re-runs cheap and diffs inspectable.

## Workflow phases (`.claude/workflows/ground-catalog.js`)

Invoked as `Workflow({name: "ground-catalog", args: {…}})`.

**Args** (all with working defaults): `{ runId, university, catalogUrls,
departments: "auto" | […], careers: "existing" | […], companies: { greenhouse:
[…], lever: […] }, extraInternSources: true, pilot: false }`.
`departments: "auto"` derives the department list *from* the career set (every
career must be reachable from courses in ≥ 2 departments where plausible) —
crawl scope must never masquerade as labor-market fact. `runId` is a required
arg because workflow scripts cannot mint timestamps.

### Phase 0 — Setup (one agent)

Downloads/unzips the O*NET DB (skipped if present), records the O*NET version
and `date -u` timestamp, probes each configured source, and returns a manifest
of what is reachable. Hard-fails the run early if a required source is down.

### Phase A — Career grounding (parallel per career)

SOC-clean careers: agent maps name → SOC (justifying the match), runs
`onet-extract.mjs`, distills 3 responsibilities + 4 skills in the catalog's
existing voice, and computes candidate `distinctiveSkills`. Posting-grounded
careers: agent aggregates skills from Phase C-style posting evidence plus
degree-map corroboration via web search. After the parallel step, a single
cross-career pass computes skill inverse-frequency across the whole career set
(generic skills like "critical thinking" appear everywhere and carry no edge
signal) and enforces the same-SOC collision rule. Output schema bans em/en
dashes at the source.

### Phase B — Course harvest (parallel per department)

Agent: `curl` the catalog page(s) to disk, run `parse-catalog-html.mjs` (431
courses parse deterministically; no LLM enumeration of 600 KB pages), then the
LLM pass only (a) filters the parsed list to courses plausibly relevant to any
career in the set and (b) labels `taughtSkills` on that shortlist, quoting the
official description. **Level mapping is deterministic**, computed in the
parser from prerequisite depth (no subject prereqs → 1000; 1000-level prereqs →
2000; deeper chains or explicitly advanced → 3000), recorded per-course as
`levelBasis`; the LLM only breaks ties, and every tie-break is listed in the
review report for human confirmation.

### Phase C — Internship harvest (parallel per source, then per orgType)

`fetch-postings.mjs` pulls and pre-filters each company board; the SimplifyJobs
list and employer-page searches supplement non-tech coverage. Per orgType, one
agent clusters raw titles into 3–4 canonical intern roles and extracts
`requiredSkills` from posting text, with ≥ 2 distinct companies per kept role.
Validation enforces a minimum company count per orgType; if an orgType cannot
be evidenced (genuine small businesses rarely use ATS APIs), the taxonomy
shrinks or the gap is flagged — the map must not imply evidence it lacks.

### Phase D — Edge inference + adversarial verification

**Judge (one agent per input, not per pair):** each course/internship agent
receives all career profiles (compact: distinctive skills + top work
activities) and proposes destinations. Scoring must rest on *distinctive*
overlap: each proposed edge needs ≥ 1 matched skill shared by < 1/3 of careers,
and a score margin over the median career — generic-skill matches produce a
near-complete bipartite graph that top-K would merely truncate.

**Skeptic (one agent per input, batch-refuting its 3–5 proposed edges):** runs
only on edges in the uncertain band (confidence 0.40–0.80; extremes are
auto-accepted/rejected). Crucially, the skeptic gets *different evidence* than
the judge — real intern/new-grad postings for the target career ("do they ask
for this course's subject matter?") and the university's own degree-map pages —
so it can catch saturating-but-plausible edges the judge's own evidence cannot.
Judge/skeptic disagreement rate is measured; near-0% rejection means the
skeptic is decorative and the run report says so.

**Degree shaping as ranking, not invention:** 1000-level keep top ~5 surviving
edges, 2000-level ~4, 3000-level ~3, internships ~3–4. In-degree and
separation are *not* controlled here — they are enforced by the Phase E
distributional gates, which can fail the whole dataset even when every
individual edge verified.

**Confidence must reach the UI honestly:** `score.js` renders internship edges
as the boldest links (strength 1.0). A low-confidence internship edge drawn
bold would contradict the evidence. Resolution: per-kind confidence floors
scale with rendered strength — internship edges require ≥ 0.75, 3000-level
≥ 0.70, 2000 ≥ 0.60, 1000 ≥ 0.50. (Rendering confidence-weighted strength is a
possible later app change; floors keep the current app honest without one.)

### Phase E — Assemble, validate, report (finalizer agent executing scripts)

A finalizer agent (agents, not the script body, have Bash/Write) merges phase
outputs into `data/dataset.json`, runs `validate-dataset.mjs` (all gates), runs
`build-catalog.mjs`, runs `node --test`, and returns the verbatim outputs. On
gate failure the dataset is still written — with the validator report — so
humans can inspect; only `catalog.js` generation is withheld. A reporter agent
then writes `data/review-report.md`: every node and edge with evidence,
confidence, and age; flagged items first (level tie-breaks, posting-grounded
careers, internship-starved careers, same-SOC merges, dead-source companies).

### Cost tiering and reuse across industries

Per-stage model/effort tiers keep the fan-out affordable: mechanical stages
(setup, posting fetch, finalize) run on small models at low effort; per-item
stages (career distillation, course labeling, edge judging) run mid-tier at
medium effort; only the stages where judgment quality gates the whole dataset
(cross-career distinctiveness, the adversarial skeptics) inherit the session's
full model. All tiers are overridable via `args.tiers`.

Outputs are namespaced by `args.industry` so runs never collide:
`data/sources/<industry>/`, `data/datasets/<industry>.json`,
`data/catalogs/<industry>.js`, `data/review-report-<industry>.md`, with the
O*NET DB shared at `data/sources/onet/`. The app renders registered catalogs
(`data/catalogs/index.js`) as header tabs, each with its own selections and
epistemic banner; `apply: true` on a gate-passing full run registers the tab
via `scripts/register-catalog.mjs` and the illustrative demo is never
overwritten.

The workflow is industry-agnostic by argument: `careers` accepts plain strings
(grounding mode `auto` lets the agent honestly choose SOC vs. postings per
career), `companies` accepts arbitrary `orgType` labels which flow through
`meta.orgTypes` to the validator, generator, and the data-driven sidebar, and
`catalogPages` accepts `parser: "llm"` for non-CourseLeaf catalogs — with every
LLM-assigned level flagged `levelTieBreak` so the review report lists all of
them for human confirmation (the deterministic parser remains the default and
the auditable path).

### v3 simplification — less orchestration, same guarantees

A post-pilot efficiency review (the pilot spent 842k tokens / 26 agents on a
3-career slice; a full run projected ~170 agents) found the bloat concentrated
in per-item fan-out and agents executing deterministic policy. Measured
against the pilot's own data: 8 skeptic agents were spawned to make 4 actual
judgment calls — 6 of 10 edge decisions were pure threshold mechanics. The
v3 rules, now encoded in the workflow:

1. **Batch every fan-out.** Careers ground in batches (default 6/agent), edge
   judges run one per department file (not per input), skeptics run one per
   ~12 banded edges. Fixed per-agent overhead must amortize over many items.
2. **Agents produce judgments; code applies policy.** Confidence floors,
   auto-accept (≥ 0.85), and top-K ranking moved from skeptic prompts into
   `scripts/assemble-dataset.mjs` — deterministic, unit-tested, and
   **fail-closed**: a banded edge (floor–0.85) ships only with an explicit
   skeptic "keep" verdict; unreviewed banded edges drop. Skeptics are spawned
   only for the banded set, and skipped entirely when it is empty.
3. **No LLM read-modify-write of evidence files.** The distinctiveness pass
   writes one new `_distinctive.json` merged deterministically at assembly,
   instead of editing all N career files in place. The finalizer's
   "repair the inputs and rerun" loop is gone: the assembler drops zero-edge
   inputs itself and records them in `meta.flags.droppedInputs`.
4. **No courier agents.** The posting fetch (one script invocation) folded
   into setup; internship clustering is one agent across all org types
   instead of one per org type.
5. **Trim what agents read.** The parser's `--compact` view (code/name/level,
   truncated description) serves shortlisting; full records are pulled only
   for the ~12 shortlisted courses per department.

Projected full run: ~25 agents (was ~172), with the biggest reductions in the
stages that were least judgment-dense. The acceptance gates, evidence rules,
and adversarial verification of genuinely uncertain edges are unchanged.

### Pilot mode — proves plumbing, not quality

`pilot: true` restricts scope (≈3 careers, 1 department, 2–3 companies) and
**skips the distributional gates** (they are meaningless at pilot scale — with
3 careers, saturation is indistinguishable from success). The pilot's exit
criteria are mechanical: every phase produces schema-valid files, scripts run,
manifests reconcile, judge/skeptic disagreement is measured. Quality is only
assessed on a full run against the full gate set.

## Test-suite decoupling (prerequisite, done before any catalog replacement)

`test/score.test.js` behavioral tests hardcode illustrative ids (`cs101`,
`ml301`, `mnc-data`…). They move to a frozen fixture
(`test/fixtures/catalog.js`, a verbatim copy of the illustrative dataset) so
behavior stays tested forever, while the data-integrity guards keep running
against the live bundled `data/catalog.js` — whatever dataset ships must
satisfy them. New unit tests cover the deterministic scripts (parser, level
mapping, validator gates, generator sanitation).

## Failure handling

- Unreachable source → Phase 0 hard-fails (required) or records degradation
  (supplementary); a node without evidence fails validation — gaps are visible,
  never silent.
- `200 []` from Lever / zero intern matches → per-company failure in the
  manifest, surfaced in the review report, counted against orgType minimums.
- Mid-run death → `resumeFromRunId` plus file-based resume (agents skip work
  whose valid output already exists).
- Evidence staleness → every evidence entry carries `retrievedAt` and the run
  records the O*NET version; posting snapshots under `data/sources/` are the
  durable evidence (URLs rot within weeks of a req closing). The review report
  surfaces evidence age; posting-derived nodes should be re-run each season.

## Licensing and ethics

- O*NET: public, requires attribution ("This page includes information from
  O*NET … by the U.S. Department of Labor" — added to README and dataset meta).
- Course catalog: short quotes of official descriptions with citation (fair
  use); no wholesale republication.
- Job postings: titles/URLs/short requirement quotes with attribution;
  snapshots kept locally for audit, not republished.
- LinkedIn: not used — scraping violates its ToS and is bot-blocked anyway.

---

## Review findings that shaped v2 (changelog from v1)

Two independent adversarial reviews were run on v1: engineering feasibility and
product effectiveness. Every finding and its disposition:

**Feasibility** — (1) Phase E was assigned to "deterministic scripts" the
workflow body cannot execute → finalizer-agent pattern. (2) No defined path
from agent outputs to disk → Write-plus-manifest protocol with hashes, Phase E
re-validates files. (3) 600 KB / 431-course catalog pages can't go through
WebFetch → deterministic `courseblock` parser, LLM touches only the parsed
shortlist. (4) Multi-MB Greenhouse payloads (Stripe 3.7 MB, 12/503 interns) →
`curl` + `jq` pre-filter script. (5) Skeptic pruning + top-K can strand inputs
or orphan careers, which the test suite rejects → validator enforces
test-suite invariants with explicit repair rules. (6) LLM text routinely emits
em dashes the tests ban → schema pattern ban + deterministic sanitation.
(7) Lever returns `200 []` for bad slugs → zero-posting = logged failure with
orgType minimums. (8) Per-career HTML scraping of O*NET is fragile and
rate-limit-prone → one bulk download, deterministic extraction. (9) Required
`soc` field would make agents hallucinate codes for founder/PM/BizOps →
grounding tiers, SOC optional. (10) No `Date.now`/filesystem in script body →
`runId` as arg, timestamps from agent Bash, file-based resume. (11) Per-edge
skeptic invocations dominate cost → skeptic per input, confidence-banded.
(12) Level mapping by agent vibes → deterministic prereq-depth rule with
audited tie-breaks.

**Effectiveness** — (1) Generic O*NET skills ("critical thinking") match every
career, saturating the graph → distinctive-skill requirement, inverse-frequency
weighting, margin-over-median. (2) Top-K bounds out-degree but hub careers
absorb the map → hard distributional gates (in-degree cap, Gini, pairwise
Jaccard) that can fail a dataset even when every edge verified. (3) Fuzzy
careers grounded to wrong SOC is worse than ungrounded → posting-grounded tier,
SOC match bar. (4) Greenhouse/Lever structurally starve non-tech orgTypes →
SimplifyJobs + employer-page supplements, flag-don't-pad rule, orgType
minimums. (5) Crawl-scope gaps render as "path closed" in the UI → departments
derived from career set, zero-course-support careers fail validation.
(6) Confidence computed then discarded while internships render boldest →
per-kind confidence floors scaled to rendered strength. (7) Skill overlap is
requirement-side evidence, not outcomes; dropping the disclaimer would be
dishonest → banner rewritten not removed, "grounded" reserved, outcome-survey
corroboration where available. (8) Level mapping drives strength and degree →
same fix as feasibility 12. (9) Judge and skeptic sharing evidence makes
verification decorative → skeptic gets different evidence and measured
disagreement rates. (10) Posting URLs rot in weeks → `retrievedAt`, snapshots
as canonical evidence, re-run cadence. (11) Same-SOC careers collapse into
identical hubs → collision rule (differentiate via postings, else merge/flag).
(12) Pilot can't surface distributional failures → pilot demoted to plumbing
proof; quality gates evaluated only at full scale before any catalog
replacement.

**Own finding** — behavioral tests hardcode illustrative ids and would break on
any regenerated catalog → fixture decoupling as a prerequisite step.
