# Internship variety — detect scarcity, broaden grounding, add a validated-canonical tier

**Status: v2 — revised after two independent adversarial reviews (engineering
feasibility; product honesty and effectiveness). The findings that drove each
revision are summarized at the end.** Companion to
docs/grounding-workflow-plan.md (the honesty rules there govern everything
here) and docs/narrowing-plan.md.

## Problem, quantified from this repo's own data

The Data tab (the app's default) ships exactly **one internship** node,
`mnc-business-operations-intern`, against 32 courses and 8 careers.
Measured from the run artifacts (`data/sources/data/`, run
`data-20260709T180456Z`):

- **Seasonal posting drought.** `postings/manifest.json` (retrieved
  2026-07-09): 8 ATS boards yielded 35 intern + 22 new-grad postings total, of
  which Palantir alone contributed 31 + 17. Stripe: 0 intern. Vercel,
  Anthropic: 0 entry-level at all (recorded failures). Mid-July is the bottom
  of the intern-posting cycle; most Summer 2026 reqs are not yet on boards.
- **Clustering starved by the ≥2-companies rule.** The clustering agent could
  form only 2 MNC roles (`internships/mnc.json`); `startup.json` and
  `small-business.json` have `roles: []`. The rule is correct (one company's
  posting is not an industry-wide role) but with one dominant board it kills
  almost everything.
- **The SWE cluster died at assembly.** `mnc-software-engineer-intern`'s only
  proposed edges (data-engineer 0.35, data-architect 0.3, both honest scores —
  it is a general SWE role) fell below the internship floor 0.75, so the
  assembler dropped the input (`meta.flags.droppedInputs`). Correct behavior,
  but it halved the already tiny internship set.
- **The planned breadth source was never built.**
  docs/grounding-workflow-plan.md lists the GitHub
  `SimplifyJobs/Summer{YYYY}-Internships` list as a verified-reachable source
  and the v2 changelog cites it as the fix for ATS skew; `fetch-postings.mjs`
  supports only Greenhouse and Lever. (Reachability re-verified 2026-07-11:
  `listings.json` has ~15,000 entries, ~1,270 active+visible, ~470 active in
  category "AI/ML/Data" from ~250 distinct companies.)
- **No mechanism can create internship NODES from judgment.** Both existing
  judgment tiers (adjacency, gap review) add EDGES to existing inputs.
  Internship scarcity is node scarcity; the gap-review agent literally cannot
  repair it.

### Where the scarcity leaks into the UX (every surface)

1. **Sidebar**: `buildSidebar` renders one internship group ("Internships at
   MNCs") with a single chip; the Startup and Small Business groups vanish
   (empty groups are skipped). A whole product dimension is one button.
2. **Map right arc**: `graph.js` reserves the entire right arc for
   internships; it holds one square node against 32 course nodes on the left.
3. **Preselect**: the Data tab's registry preselect is 5 courses, no
   internship, so the first-paint story never shows the strongest input kind.
4. **Career reachability**: `meta.flags.internshipStarved` lists 6 of 8
   careers; data-analyst is internship-ONLY-reachable-by-one, and the detail
   panel for the other 6 shows no internship reacher at all.
5. **Narrowing simulation**: internships are the only strength-1.0 committal
   picks; with one, every committal stack the validator simulates is
   course-only, so the "senior specializes via experience" story is untold.
6. **Review report**: `data/review-report-data.md` leads with the limitation;
   the registry tab note admits "internship evidence was seasonally sparse".

### Required outcome

1. **Detect**: deterministic validator gates — at least
   `MIN_INTERNSHIP_VARIETY = 4` distinct internship roles per industry
   dataset, AND internship edges reaching at least
   `MIN_INTERNSHIP_CAREERS = 4` distinct careers (career sets ≥ 6) — that
   FAIL full runs (never a silent pass) when internship coverage is short.
2. **Fix**, by two complementary mechanisms:
   - **Broaden grounding breadth** (more evidence in): SimplifyJobs intern
     list, more ATS boards by config, employer career pages and web-searched
     postings with local snapshots as durable evidence.
   - **Validated-canonical judgment tier** (honest judgment where evidence is
     seasonally thin): an LLM proposes canonical common intern roles for the
     career set; grounding search must validate each against real postings
     from **≥ 2 distinct employers** (current or recent, snapshotted);
     validated roles ship with a distinct grounding marker and their career
     edges ride the existing judged-edge machinery (dampened, labeled,
     capped, balance-gated).

## Design

### A. Broaden grounding breadth (deterministic first)

**A1. SimplifyJobs source in `fetch-postings.mjs`.**
New flags `--simplify <url>` (URL mandatory — the flag parser has no boolean
mode) and optional `--simplify-categories <tokens>`. Deterministic pipeline,
no LLM:

- Fetch via `curl` (proxy-honoring, same as existing sources).
- Filter to `active && is_visible` entries. Category filtering is
  case-insensitive substring/token matching (the live list has alias
  categories: "AI/ML/Data" vs "Data Science, AI & Machine Learning", "Quant"
  vs "Quantitative Finance"), and the manifest records kept counts per
  category so partial misses are visible, not silent.
- Emit TWO files in the postings dir:
  - `simplify.json` — the durable snapshot: `{ source: "simplify", url,
    retrievedAt, totalListings, categoryCounts, postings: [{ title, company,
    url, locations, postedAt (ISO from epoch date_posted), category,
    entryLevel: "intern" }] }`, serialized one posting per line (the filtered
    list is 400–1300 entries; pretty-printing would blow past what an agent
    can Read).
  - `simplify-companies.json` — the compact agent view: `{ "<company>":
    ["<title>", ...] }` aggregation, a few hundred lines.
  All entries are intern roles by construction; no description text exists,
  so `content` is absent — **a Simplify entry is title+company evidence, not
  skill evidence** (consumed accordingly downstream).
- Manifest entry like any board: ok/counts/error; zero matches after
  filtering is a recorded failure.

**A2. More boards by configuration.** No code change needed (the flags
already take arbitrary slug lists); the workflow's Data-industry runs get a
longer seed list. Boards stay the primary skill-text source.

**A3. Web-searched postings / employer pages as durable evidence.** Already a
repo pattern (`postings/web-*.txt` snapshots for posting-grounded careers).
Formalized here: any agent citing a web posting or employer page MUST save the
relevant text to `data/sources/<industry>/postings/web-<slug>-<n>.txt` and
reference it in the evidence entry's `snapshot` field with `retrievedAt`, and
record `postedAt` when the page states a posting date (null when it does
not). Evidence `type` gains two honest values: `"employer-page"` and
`"intern-list"` (a SimplifyJobs entry), alongside `"posting"`.

**A4. Company identity is normalized before it is counted.** Existing ATS
evidence uses source-prefixed slugs (`lever-palantir`); Simplify uses display
names (`Palantir`). A shared, unit-tested `normalizeCompany()` (lowercase,
strip `greenhouse-`/`lever-` prefixes and non-alphanumerics) is applied
wherever distinct companies are counted, so one employer can never count
twice across sources.

**A5. Clustering uses the broadened pool.** The clustering agent's inputs now
include `simplify-companies.json` (never raw `simplify.json`). Rules
(enforced in prompt, checked by validator):
- Simplify entries count toward the ≥2-distinct-companies requirement
  (normalized per A4) and provide `exampleTitles`.
- `requiredSkills` must still come from full posting text: a clustered role
  needs ≥ 1 evidence entry of type `posting` or `employer-page` (validator
  gate). A cluster supported only by Simplify titles must have 1–2 of its
  listing URLs fetched and snapshotted before it can carry skills; otherwise
  it is not emitted.

### B. Validated-canonical internship tier (judgment + grounding validation)

A new workflow stage, toggle `canonicalInterns` (default **on**). Placement
and trigger are specified in C (after the Edges phase, on a post-policy
survivor count — not the raw clustered count, which overstates what assembly
will keep).

**B1. Proposer (judgment; inherits session model).** Given the career set
(the grounded career files exist by this point — see C), the org types, the
ALREADY-clustered role list, and the current internship-starved career list,
propose up to `maxCanonicalInterns = 6` canonical, commonly-offered intern
roles for this career set (e.g. Data Analyst Intern, Data Science Intern,
Data Engineering Intern, BI Intern) that do NOT duplicate clustered roles,
**targeting starved careers where honest** (a canonical role must not be
invented for coverage's sake; the proposer reports starved careers it left
unserved and why). For each: `{ id (slug; the assembler enforces a
"canonical-" prefix), role, orgType (from the industry's org types, where
such roles are most commonly offered), whyCommon, requiredSkills (5-8, the
industry-standard asks for this role title — these are JUDGMENT, marked as
such downstream), candidateEdges: [{ career, confidence 0.4-0.7, rationale
}] (≤3, the gap-review bar: would an undergrad AND their advisor nod?),
searchHints }`.
Writes ONE file: `internships-canonical/_proposals.json`. (Underscore = never
read by the assembler's directory scans; the assembler reads it explicitly.)

**B2. Validator (grounding search; mid tier).** For each proposed role, hunt
for REAL evidence that this role exists in the world: first the local
snapshots (ATS boards, `simplify.json` — grep, don't read it whole), then
WebSearch for live/archived postings or employer early-careers pages. Each
web evidence item must be snapshotted (A3) with `retrievedAt` and `postedAt`
where determinable. **A role validates only with evidence from ≥ 2 distinct
employers (normalized per A4), of which ≥ 1 must be CURRENT** — an
`intern-list` entry (the snapshot is filtered to active listings) or a
posting/page with `postedAt` within `CANONICAL.currentWindowDays = 550` of
retrieval. A role that falls short is dropped and listed in the manifest
`failures` (fail-visible). The validator may not add roles the proposer did
not propose (the deterministic join intersects on id), may not rewrite
skills or edges, and records its search queries per role for audit.
Writes ONE file: `internships-canonical/validation.json`:
`{ validated: [{ id, evidence: [{ type, company, title, url, snapshot,
retrievedAt, postedAt? }], queries: [...] }], failures: ["id: reason"] }`.
No proposer fields are transcribed — the courier/transcription risk is
removed by construction.

**B3. Deterministic join + assembly (`assemble-dataset.mjs`).**
A new exported `buildCanonicalRoles(proposals, validation, careerIds,
orgTypes)`:
- joins proposals with validation on id (intersection only), enforces the
  `canonical-` id prefix (prefixing if absent) so a proposal id can never
  collide with an existing input id and silently attach judged edges to an
  evidence-tier input;
- emits roles `{ id, role, orgType, grounding: "canonical", skillsBasis:
  "judgment", requiredSkills (from the proposal, marked), exampleTitles
  (DERIVED from validation evidence — "<title> (<company>)" — never
  invented), evidence (from validation, verbatim JSON) }`;
- emits their edges directly as judged-tier edges (floor `JUDGED.floor` 0.4,
  cap `CANONICAL.maxEdges = 3` per role, rationale required, unknown careers
  skipped) — there is no separate edges-gap file to keep in sync;
- dedupes canonical roles whose normalized title matches a clustered role
  (clustered evidence wins), recorded in `meta.flags.canonicalDuplicates`.
Other assembler changes:
- Canonical roles never appear in `internships/` files or edge-judge
  proposals, so they are structurally outside the direct-evidence pipeline;
  no exclusion logic is needed — isolation is by construction.
- `mergeJudgedEdges` gains per-kind caps (courses 2 — the existing default
  when `kind` is absent, preserving the current test contract — internships
  3) and counts a row's PRE-EXISTING judged edges toward the cap, so
  gap-review top-ups cannot stack past the cap on canonical roles.
- New flags: `meta.flags.canonicalInternships = [ids]`,
  `meta.flags.internshipVariety = { total, clustered, canonical }`,
  `meta.flags.canonicalDuplicates`, and
  `meta.flags.canonicalOnlyInternshipCareers` (careers whose every internship
  edge is canonical-judged — symmetric with `inferenceOnlyCareers`).
- Zero-edge canonical roles drop into `droppedInputs` like any input.

**B4. Validation gates (`validate-dataset.mjs`).** All deterministic, all
full-run-only except the structural ones:
- **Variety gate (the DETECT requirement)**: FAIL when
  `internships.length < MIN_INTERNSHIP_VARIETY (4)`.
- **Coverage gate**: FAIL when career sets of ≥ 6 have internship edges
  reaching fewer than `MIN_INTERNSHIP_CAREERS (4)` distinct careers (four
  titles all pointing at one hub career would otherwise pass while every
  starved career stays starved). Below 6 careers the coverage gate is
  skipped, mirroring the narrowing gates' scale guard. The variety gate has
  NO scale guard — that would silently defeat detection.
- Canonical structural gates (always on): `grounding: "canonical"` roles
  require the `canonical-` id prefix, `skillsBasis: "judgment"`, ≥ 2 distinct
  normalized companies across evidence of type
  posting/employer-page/intern-list, each evidence entry carrying `snapshot`
  + `retrievedAt`, ≥ 1 CURRENT item (per B2's rule), every `exampleTitle`
  matching an evidence entry, and **snapshot files that exist on disk, are
  non-empty, and contain the role title or company token** (a rubber-stamp
  `snapshot` string that was never written fails the gate). All their edges
  must be `judged` (a canonical role with a "direct" edge is a tier-blurring
  bug and FAILS).
- Clustered roles (grounding absent or `"postings"`) keep the
  ≥2-distinct-companies gate, now counting normalized companies across
  posting AND intern-list evidence, and additionally require ≥ 1 full-text
  evidence entry (type posting or employer-page) as the skill-text source.
- Balance: judged internship edges already flow through `balanceInDegree`
  and the hub/Gini gates. Balance trimming removes edges into
  OVER-represented careers, so it cannot re-starve the under-covered careers
  the coverage gate protects; `balanceInDegree` also never drops a row's
  last edge, so it cannot reduce the variety count.
- The test fixture `validDataset()` grows to 4 internships so the suite
  exercises the gates rather than tripping them.

**B5. Honesty surfaces (app + report).**
- `build-catalog.mjs` emits `canonical: true` on canonical internship entries
  in the generated catalog module.
- `score.js allInputs` passes `canonical` through on internship inputs (the
  full plumbing is allInputs → graph.js inputNodes → render.js; all three
  change — additive fields only, existing exact-key test assertions are
  unaffected because fixtures carry no canonical roles).
- `render.js` + `index.html` + `styles.css`:
  - Canonical map nodes render as a DIAMOND (square rotated 45°) — a shape
    distinction, not a dash/hollow one, because dashes already encode edge
    weakness and dashed-hollow already encodes crowded-out careers, and a
    fill change on selection would erase a stroke-only distinction.
  - A legend row is added: "◆ common intern role (validated to exist;
    career links are judgment-based)".
  - Canonical sidebar chips get a visible "common role" text badge, not just
    a hover tooltip (tooltips never fire on touch).
  - Internship group subtitles gain one appended sentence when the group
    contains canonical members.
  - aria-labels carry the same disclosure.
  - UI copy claims only what the evidence proves: "validated to exist at
    real employers" — never "common" as a fact, never plural evidence the
    role does not have.
- The committal model keeps `inputStrength = 1.0` for canonical internships
  — a DELIBERATE, documented position: doing an internship is a committal
  life choice regardless of how its career edges were grounded; what the
  evidence tier dampens is the SUPPORT its edges contribute (0.55×), not the
  commitment of the pick. A canonical-heavy narrowing unit test pins this.
- Review report: a dedicated canonical-tier section listing each canonical
  role, its validation evidence WITH AGE (postedAt/retrievedAt — a 2021
  archived posting must read as historical, not July-2026), its judged-edge
  rationales, starved careers that remain unserved, and the explicit
  statement that canonical `requiredSkills` are judgment (skillsBasis), not
  posting-extracted. The seasonal re-run recommendation extends to the
  canonical tier.
- The registry tab note mentions the canonical tier plainly.

### C. Workflow phase changes (`.claude/workflows/ground-catalog.js`)

- **Setup**: the `fetch-postings.mjs` call gains
  `--simplify <cfg.simplifyUrl>` (+ `--simplify-categories`) when
  `cfg.simplifyUrl` is set (default: the Summer2026 listings.json raw URL;
  disable with `simplifyUrl: null`). Manifest logging includes Simplify
  counts.
- **Internships phase**: clustering prompt updated per A5 (reads
  `simplify-companies.json`, snapshots any Simplify URLs it relies on for
  skills).
- **New "Intern variety" stage — AFTER the Edges phase (skeptics done),
  BEFORE the Gaps phase.** Placement rationale: (a) the career files the
  proposer needs are guaranteed written (the Careers/Courses/Internships
  phases run concurrently; during clustering they may not exist yet);
  (b) the trigger can be computed post-edge-policy. The workflow already
  holds every judge proposal and every skeptic verdict in memory, so PLAIN
  CODE reproduces the assembler's keep-decision per internship edge
  (floor/auto-accept/fail-closed verdict) and counts SURVIVING clustered
  roles — the raw clustered count would overstate survival (this exact gap
  killed `mnc-software-engineer-intern`). If survivors <
  `cfg.minInternshipVariety (4)` and `cfg.canonicalInterns !== false`, run
  B1 (proposer) then B2 (validator). The Gaps phase then runs unchanged —
  its draft assembly naturally includes the canonical roles, so gap review
  sees the complete map and can top up sparse canonical roles within the
  shared per-kind judged cap.
- **Tier defaults**: proposer inherits the session model (judgment quality
  gates the dataset); validator runs sonnet/medium (search + verify).
- **Finalize/report prompts**: mention the variety + coverage gates and the
  canonical tier's disclosure duties.
- meta.phases gains the "Intern variety" entry.

### D. Live Data tab repair (the apply step)

Agents only where judgment is needed; everything else deterministic re-runs:
1. `fetch-postings.mjs --simplify ...` to add the Simplify snapshot (new
   evidence, new `retrievedAt`); existing board snapshots stay as-is.
2. One clustering-update agent reads the broadened pool and writes NEW
   file(s) (`internships/broadened.json`) with any additional ≥2-company
   clusters it can now support (skills from fetched posting text,
   snapshotted). It never edits `mnc.json`/`startup.json`/etc.
3. One edge-judge agent for the new clustered roles; skeptic batch for any
   banded edges (same fail-closed policy).
4. Canonical proposer + validator agents (B1/B2) for the Data career set,
   sized by the post-policy survivor count.
5. Deterministic: assemble → validate (full gates incl. variety + coverage)
   → build-catalog → register-catalog (updated note; preselect updated to
   include an internship whose primary destination is not faded at first
   paint) → `node --test`.
6. Reporter agent refreshes `data/review-report-data.md` (canonical section
   with evidence ages; starved careers remaining).
7. Browser verification (Chromium/Playwright over `python3 -m http.server`):
   check canonical vs clustered internships are visually distinguishable in
   BOTH selected and unselected states, the legend renders, the preselected
   internship's primary career is neither faded nor closed at first paint;
   screenshot to the user.

**Known consequence, stated:** `data/datasets/tech.json` (the 3-career pilot
slice tab) ships 2 internships and would fail the new variety gate on a
re-validation with full gates. It was validated under pilot gates (which skip
variety, like every distributional gate) and remains registered as a
clearly-labeled pilot tab; a future tech re-run at full scale must satisfy
the new gates. The review report and this doc state that plainly.

### E. Registry preselect survival (bug fix folded in)

`register-catalog.mjs upsert()` currently replaces entries wholesale, so the
workflow's `apply: true` re-registration (which passes no `--preselect`)
would strip a hand-tuned preselect — contradicting the repo's stated
invariant. Fix: `upsert` keeps the existing entry's `preselect` when the new
entry lacks one (deterministic, unit-tested). Task-5's preselect then
survives future re-runs.

## Honesty rules recap (unchanged, restated because this plan touches them)

- Canonical roles are never disguised as posting-clustered roles: distinct
  `grounding` marker + `skillsBasis: "judgment"` in the dataset, distinct
  shape + badge + legend in the app, distinct section in the review report,
  listed in `meta.flags`.
- All canonical career edges are judged-tier: dampened, labeled
  judgment-based, capped, balance-gated, floored.
- Gaps become flags or FAILs, never padding: an unvalidatable canonical role
  is dropped and reported; a short-variety or short-coverage dataset fails
  its gates.
- Evidence snapshots with `retrievedAt` (+ `postedAt` where determinable)
  remain the durable evidence; Simplify entries are title-level evidence and
  are never used as skill text; the validator gate opens snapshots rather
  than trusting path strings.
- Thresholds/policy live in deterministic unit-tested code; agents only
  judge. The proposer/validator boundary transcribes nothing (deterministic
  join).
- `data/catalog.js` (illustrative) is never written.

## Test additions/updates (all deterministic rules get unit tests)

- `filterSimplify`: active/visible filtering, token category matching with
  alias categories, per-category counts, epoch→ISO `postedAt`, compact
  serialization shape, company passthrough.
- `normalizeCompany`: `lever-palantir` ≡ `Palantir` counts as 1.
- Variety gate: fails at 3 roles, passes at 4; pilot skips. Coverage gate:
  4 roles on 1 career fails at ≥ 6 careers; skipped below 6.
- Canonical structural gates: missing snapshot file fails; snapshot without
  role/company token fails; 1-company evidence fails; no-current-evidence
  fails; direct edge on a canonical role fails; missing skillsBasis fails;
  exampleTitle not matching evidence fails.
- Clustered gates: intern-list-only evidence (no full-text source) fails;
  companies counted across posting+intern-list with normalization.
- `buildCanonicalRoles`: join-on-intersection, id prefixing, derived
  exampleTitles, edge floor/cap/rationale policy, title dedupe vs clustered,
  flags.
- `mergeJudgedEdges`: per-kind caps with the existing no-kind default (2)
  preserved; pre-existing judged edges count toward the cap.
- `generateCatalog`: canonical marker passthrough; `allInputs`: canonical
  passthrough.
- `upsert`: preselect preserved on re-registration.
- Narrowing simulation on a canonical-heavy dataset: gates hold; committal
  position pinned.
- `validDataset()` fixture grows to 4 internships (the variety gate must
  make the suite exercise it, not trip over it).

---

## Review findings that shaped v2 (changelog from v1)

Two independent adversarial reviews were run on v1: engineering feasibility
(14 findings) and product honesty/effectiveness (12 findings). Every finding
and its disposition:

**Feasibility** — (1) BLOCKER: the existing ≥2-posting-companies validator
loop fails every canonical role (verified empirically against the real
validator) → gate now conditioned on grounding, canonical roles get their own
evidence gates, exemption unit-tested. (2) BLOCKER: `MIN_INTERNSHIP_VARIETY=4`
turns the suite red (three fixture assertions ship 1 internship) →
`validDataset()` grows to 4 internships; explicitly NO scale guard on the
variety gate. (3) Pre-assembly trigger counts clustered roles before edge
policy drops them (the SWE cluster died exactly this way) → trigger moved to
a post-policy survivor count computed in plain code from judge proposals +
skeptic verdicts the workflow already holds. (4) "Inside the Internships
phase" races the concurrent Careers phase (career files may not exist) →
stage moved after the Edges phase. (5) "Validator copies proposer fields
verbatim" is LLM courier/transcription across the proposal/evidence boundary
→ validator writes validation results only; a deterministic
`buildCanonicalRoles` join produces roles and edges. (6) `lever-palantir` +
`Palantir` count as two companies → shared `normalizeCompany()` applied at
every distinct-company count, unit-tested. (7) The plan restated "preselects
survive re-registration" but `upsert` replaces wholesale and the workflow
passes no preselect → upsert now merges the existing preselect; invariant
becomes true. (8) `canonical` never reaches render.js (allInputs/graph strip
it) → plumbing specified through score.js and graph.js with tests.
(9) simplify.json exceeds agent Read limits (~13k pretty lines) → compact
one-line-per-posting snapshot + `simplify-companies.json` aggregation; agents
read only the compact view. (10) Exact-match category filter silently drops
alias categories → token/substring matching + per-category kept counts in
the manifest. (11) "Canonical edges are dampened so committal is honest" is
false against score.js (committal ignores edge damping) → position stated
deliberately (pick commitment ≠ edge evidence), pinned by a unit test.
(12) Per-kind judged caps must default missing `kind` to 2 or an existing
test breaks → specified. (13) The tech dataset would fail the new gate → its
pilot status and future re-run duty stated in the plan and report. (14) A
bare `--simplify` flag swallows the next flag under the existing parser →
URL made mandatory.

**Honesty/effectiveness** — (1) BLOCKER: "≥1 posting anywhere, ever" cannot
support the word "common", and the plan defended the ≥2-companies rule 40
lines earlier → canonical validation bar raised to ≥2 distinct normalized
employers with ≥1 current item; UI copy weakened to "validated to exist at
real employers". (2) Proposer-written `requiredSkills`/invented
`exampleTitles` beside real citations is evidence-laundering →
`skillsBasis: "judgment"` required on canonical roles and surfaced in the
report; `exampleTitles` derived deterministically from validation evidence
and gated. (3) Dashed/hollow markers collide with existing encodings (dash =
weak edge; dashed-hollow = crowded-out) and tooltips don't exist on touch →
diamond shape distinction + legend row + visible chip badge + group-subtitle
note; browser verification explicitly checks distinguishability in both
selection states. (4) Same committal falsehood as feasibility-11 →
same fix. (5) The variety gate counts titles, not careers served (4 roles on
one hub career would pass while 6 careers stay starved) → coverage gate
added (≥4 internship-reached careers at ≥6-career scale); proposer prompt
receives the starved list and reports what it left unserved. (6) Unvalidated
proposals' judged edges could attach to an EXISTING input on id collision →
`canonical-` id prefix enforced by the deterministic join; the separate
edges-gap file is gone entirely. (7) A hard FAIL gate pressures rubber-stamp
validation; the planned snapshot gate checked only string presence →
validator gate opens snapshot files (exists, non-empty, contains
role/company token); search queries recorded for audit; validator cannot add
roles. (8) "Archived posting" evidence hides its age behind `retrievedAt` →
`postedAt` captured where determinable, currency window (550 days) for the
≥1-current requirement, evidence age surfaced in the report. (9) No feedback
loop when assembly zeroes a canonical role → accepted as fail-visible;
canonical roles are constructed post-policy so the window is small; the gate
failure message documents the remedy (no retry loop, deliberately).
(10) First-paint could show the flagship internship as a faded path →
browser verification asserts the preselected internship's primary career is
neither faded nor closed. (11) No flag disclosed careers whose internship
support is 100% canonical → `canonicalOnlyInternshipCareers` flag added.
(12) Sidebar group subtitles over-claim for mixed groups → appended
disclosure sentence when a group contains canonical members.
