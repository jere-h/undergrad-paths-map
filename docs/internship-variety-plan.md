# Internship variety — detect scarcity, broaden grounding, add a validated-canonical tier

**Status: v1 draft, pre-review.** Companion to docs/grounding-workflow-plan.md
(the honesty rules there govern everything here) and docs/narrowing-plan.md.

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
  `listings.json` has 15,034 entries, 1,275 active+visible, 472 active in
  category "AI/ML/Data" from 250 distinct companies.)
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

1. **Detect**: a deterministic validator gate — at least
   `MIN_INTERNSHIP_VARIETY = 4` distinct internship roles per industry
   dataset — that FAILS full runs (never a silent pass) when variety is short.
2. **Fix**, by two complementary mechanisms:
   - **Broaden grounding breadth** (more evidence in): SimplifyJobs intern
     list, more ATS boards by config, employer career pages and web-searched
     postings with local snapshots as durable evidence.
   - **Validated-canonical judgment tier** (honest judgment where evidence is
     seasonally thin): an LLM proposes canonical common intern roles for the
     career set; grounding search must validate each against ≥1 real posting
     (current or archived) or employer page; validated roles ship with a
     distinct grounding marker and their career edges ride the existing
     judged-edge machinery (dampened, labeled, capped, balance-gated).

## Design

### A. Broaden grounding breadth (deterministic first)

**A1. SimplifyJobs source in `fetch-postings.mjs`.**
New flag `--simplify <url>` (default the Summer2026 `listings.json` raw URL,
overridable for future seasons). Deterministic pipeline, no LLM:

- Fetch via `curl` (proxy-honoring, same as existing sources).
- Filter to `active && is_visible` entries. The list is huge (15k entries) and
  carries a maintained `category` field; accept an optional
  `--simplify-categories "AI/ML/Data,Quant"` filter so an industry run keeps
  only its relevant slice (default: keep all categories; the workflow passes
  industry-appropriate ones).
- Emit `simplify.json` snapshot in the postings dir:
  `{ source: "simplify", url, retrievedAt, totalListings, postings: [{ title,
  company, url, locations, datePostedISO, category, entryLevel: "intern" }] }`.
  All entries are intern roles by construction; no description text exists, so
  `content` is absent — **a Simplify entry is title+company evidence, not
  skill evidence** (consumed accordingly downstream).
- Manifest entry like any board: ok/counts/error; zero matches after filtering
  is a recorded failure.

**A2. More boards by configuration.** No code change needed (the flags already
take arbitrary slug lists); the workflow's Data-industry runs get a longer
seed list. Boards stay the primary skill-text source.

**A3. Web-searched postings / employer pages as durable evidence.** Already a
repo pattern (`postings/web-*.txt` snapshots for posting-grounded careers).
Formalized here: any agent citing a web posting or employer page MUST save the
relevant text to `data/sources/<industry>/postings/web-<slug>-<n>.txt` and
reference it in the evidence entry's `snapshot` field with `retrievedAt`.
Evidence `type` gains two honest values: `"employer-page"` and
`"intern-list"` (a SimplifyJobs entry), alongside `"posting"`.

**A4. Clustering uses the broadened pool.** The clustering agent's inputs now
include `simplify.json`. Rules (enforced in prompt, checked by validator):
- Simplify entries count toward the ≥2-distinct-companies requirement and
  provide `exampleTitles`.
- `requiredSkills` must still come from full posting text (an ATS snapshot or
  a web-fetched posting snapshot). A cluster supported only by Simplify titles
  must have 1–2 of its listing URLs fetched and snapshotted before it can
  carry skills; otherwise it is not emitted.

### B. Validated-canonical internship tier (judgment + grounding validation)

A new workflow stage between internship clustering and edge inference. Runs
when clustered variety falls short of the target (plain-code check in the
workflow), toggle `canonicalInterns` (default **on**).

**B1. Proposer (judgment; inherits session model).** Given the career set
(names + one-line scopes), the org types, and the ALREADY-clustered role list,
propose up to `maxCanonicalInterns = 6` canonical, commonly-offered intern
roles for this career set (e.g. Data Analyst Intern, Data Science Intern,
Data Engineering Intern, BI Intern) that do NOT duplicate clustered roles.
For each: `{ id, role, orgType (from the industry's org types, where such
roles are most commonly offered), whyCommon, requiredSkills (5-8, the
industry-standard asks for this role title), candidateEdges: [{ career,
confidence 0.4-0.7, rationale }] (≤3, the gap-review bar: would an undergrad
AND their advisor nod?), searchHints }`.
Writes TWO files:
- `internships-canonical/_proposals.json` (full proposals; underscore = never
  read by the assembler),
- `edges-gap/canonical-interns.json` in the existing judged-edge shape
  (`{ judged: [{ input, career, confidence, rationale }] }`) for ALL
  proposals. Unvalidated roles never become dataset inputs, so their judged
  edges are inert by construction (`mergeJudgedEdges` skips unknown inputs) —
  no coupling between proposal and validation outcomes.

**B2. Validator (grounding search; mid tier).** For each proposed role, hunt
for REAL evidence that this role exists in the world: first the local
snapshots (ATS boards, `simplify.json`), then WebSearch for live/archived
postings or employer early-careers pages. Each evidence item must be
snapshotted (A3) with `retrievedAt`. A role validates with ≥1 real evidence
item; a role with none is dropped and listed in the manifest `failures`
(fail-visible). Writes `internships/canonical.json`:
`{ canonical: true, roles: [{ id, role, orgType, grounding: "canonical",
exampleTitles, requiredSkills, evidence: [...] }] }` — only validated roles.
The validator copies proposer fields verbatim (it validates existence; it does
not re-judge edges or rewrite skills).

**B3. Assembly (deterministic).** `assemble-dataset.mjs`:
- Internship files may carry `canonical: true`; their roles get
  `grounding: "canonical"` and are EXCLUDED from the direct edge-judge
  pipeline (they have no posting-cluster skill evidence to judge). Their only
  edges arrive via `mergeJudgedEdges` from `edges-gap/canonical-interns.json`.
- `JUDGED.maxPerInput` becomes per-kind: courses keep 2, internships get 3
  (an intern role honestly opens its home career plus 1-2 neighbours).
- Dedupe: a canonical role whose normalized title matches a clustered role's
  is dropped (clustered evidence wins), recorded in a flag.
- New flags: `meta.flags.canonicalInternships = [ids]` and
  `meta.flags.internshipVariety = { total, clustered, canonical }`.
- Zero-edge canonical roles drop into `droppedInputs` like any input.

**B4. Validation gates (`validate-dataset.mjs`).** All deterministic:
- **Variety gate (the DETECT requirement)**: full runs FAIL when
  `internships.length < MIN_INTERNSHIP_VARIETY (4)`.
- Canonical structural gates: `grounding: "canonical"` roles require ≥1
  evidence entry of type posting/employer-page/intern-list WITH a `snapshot`
  path and `retrievedAt`; all their edges must be `judged` (a canonical role
  with a "direct" edge is a tier-blurring bug and FAILS).
- Clustered roles keep the ≥2-distinct-companies gate, now counting
  companies across evidence of type posting AND intern-list (Simplify made
  that meaningful). Skill evidence rule from A4: at least one evidence entry
  must be a full-text source (type posting or employer-page).
- Balance: judged internship edges already flow through `balanceInDegree`
  and the hub/Gini gates; nothing new needed, but the narrowing simulation
  now exercises internship-heavy stacks (canonical edges are dampened via the
  inferred machinery, so their committal contribution is honest).

**B5. Honesty surfaces (app + report).**
- `build-catalog.mjs` passes `canonical: true` through to the generated
  catalog module for canonical roles.
- `render.js`: canonical internship chips and map nodes get a visually
  distinct treatment (dashed/hollow square + "common role" affordance) and an
  aria/title note: "Common intern role, validated against real postings;
  career links are judgment-based." The detail panel already labels judged
  edges "(judgment-based)".
- Review report: a dedicated canonical-tier section listing each canonical
  role, its validation evidence, and its judged-edge rationales; the tab note
  in the registry mentions the canonical tier plainly.

### C. Workflow phase changes (`.claude/workflows/ground-catalog.js`)

- **Setup**: `fetch-postings.mjs` call gains `--simplify` (+ categories) when
  `cfg.simplifyUrl` is set (default set for the built-in config; disable with
  `simplify: false`). Manifest logging includes the Simplify counts.
- **Internships phase**: clustering prompt updated per A4.
- **New "Intern variety" stage** (inside the Internships phase, after
  clustering): plain code counts clustered roles; if
  `< cfg.minInternshipVariety (4)` and `cfg.canonicalInterns !== false`, run
  B1 then B2. Tier defaults: proposer inherits the session model (judgment
  quality gates the dataset); validator runs sonnet/medium (search + verify).
- **Edges phase**: `judgeBatches` excludes canonical internship files.
- **Finalize/report prompts**: mention the variety gate and canonical tier.

### D. Live Data tab repair (task 5)

Agents only where judgment is needed; everything else deterministic re-runs:
1. `fetch-postings.mjs --simplify ...` to add the Simplify snapshot (new
   evidence, new `retrievedAt`); existing board snapshots stay as-is.
2. One clustering-update agent reads the broadened pool and writes NEW file(s)
   (`internships/broadened.json`) with any additional ≥2-company clusters it
   can now support (skills from fetched posting text, snapshotted).
3. Canonical proposer + validator agents (B1/B2) for the Data career set.
4. One edge-judge agent for the new clustered (non-canonical) roles; skeptic
   batch if any edges land in the uncertain band.
5. Deterministic: assemble → validate (full gates incl. variety) →
   build-catalog → register-catalog (updated note; preselect updated to
   include an internship) → `node --test`.
6. Reporter agent refreshes `data/review-report-data.md`.
7. Browser verification (Chromium/Playwright over `python3 -m http.server`)
   + screenshot.

## Honesty rules recap (unchanged, restated because this plan touches them)

- Canonical roles are never disguised as posting-clustered roles: distinct
  `grounding` marker in the dataset, distinct visual in the app, distinct
  section in the review report, listed in `meta.flags`.
- All canonical career edges are judged-tier: dampened, labeled
  judgment-based, capped, balance-gated, floored.
- Gaps become flags or FAILs, never padding: an unvalidatable canonical role
  is dropped and reported; a short-variety dataset fails its gates.
- Evidence snapshots with `retrievedAt` remain the durable evidence; Simplify
  entries are title-level evidence and are never used as skill text.
- Thresholds/policy live in deterministic unit-tested code; agents only judge.
- `data/catalog.js` (illustrative) is never written; registry preselects
  survive re-registration.

## Test additions (all deterministic rules get unit tests)

- `filterSimplify`: active/visible filtering, category filter, shape mapping,
  epoch→ISO conversion.
- Variety gate: fails at 3 roles, passes at 4; pilot skips.
- Canonical structural gates: missing snapshot fails; direct edge on a
  canonical role fails; clustered role with intern-list-only evidence (no
  full-text source) fails; companies counted across posting+intern-list.
- Assembler: canonical exclusion from direct judging, per-kind judged caps,
  dedupe-by-title flag, canonical flags emitted.
- `generateCatalog`: canonical marker passthrough.
