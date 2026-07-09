# Grounding workflow plan — from illustrative catalog to evidence-backed dataset

**Status: DRAFT v1 (pre-review)**

## Problem

`data/catalog.js` is hand-authored: the 18 careers, 17 courses, 10 internships, and
every `destinations` edge between them are imagined. The README warns users not to
make real decisions from it. The goal is a **reusable Claude workflow** that
regenerates the catalog from real evidence so the tool becomes usable:

- **Courses** are real courses (codes, titles, levels) from a target university's
  published catalog, with skills inferred from their published descriptions /
  learning outcomes.
- **Internship roles** are canonicalized from live, real intern job postings.
- **Careers** carry responsibilities and skills grounded in an authoritative
  occupational database, not vibes.
- **Edges** (course/internship → career) are inferred from skill overlap between
  what a course teaches / an internship exercises and what a career demands, and
  every edge carries provenance (which evidence supports it, at what confidence).

## Evidence sources (reachability verified from this environment, 2026-07-09)

| Source | What it grounds | Access | Verified |
|---|---|---|---|
| O*NET (onetonline.org pages; onetcenter.org bulk text DB) | Career responsibilities (task statements), skills, technology skills, per SOC occupation code | Public HTML + public bulk `.txt` downloads (web-services API needs a key — not used) | HTTP 200 |
| University public course catalog (default: `catalog.mit.edu`, configurable) | Real course codes, titles, unit levels, prerequisites, official descriptions | Public HTML | HTTP 200 |
| Greenhouse public board API (`boards-api.greenhouse.io/v1/boards/{co}/jobs?content=true`) | Live job postings incl. intern roles, full descriptions with requirements | Public JSON, no auth | HTTP 200 |
| Lever public postings API (`api.lever.co/v0/postings/{co}?mode=json`) | Same, for Lever-hosted companies | Public JSON, no auth | HTTP 200 |
| Web search (general) | Supplementary/corroborating evidence only, never sole support for an edge | Via WebSearch tool | available |
| ~~LinkedIn profiles~~ | ~~career transition evidence~~ | **Rejected**: bot-blocked (HTTP 999) and scraping violates LinkedIn ToS | blocked |

The LinkedIn idea from the original brief is replaced by the combination of
O*NET (what a career actually involves) + live postings (what employers actually
ask for) + course outlines (what a course actually teaches). All three are public,
legal to use, and machine-readable.

## Target data model

A new `data/dataset.json` becomes the source of truth; `data/catalog.js` is
**generated** from it (same shape the app already imports, so no app changes).

```jsonc
{
  "meta": { "university": "MIT", "generatedBy": "ground-catalog", "sources": [...] },
  "careers": [{
    "id": "swe", "name": "Software Engineer",
    "soc": ["15-1252.00"],                     // O*NET occupation code(s)
    "responsibilities": ["..."],               // distilled from O*NET task statements
    "skills": ["..."],                         // distilled from O*NET skills + posting requirements
    "evidence": [{ "type": "onet", "url": "...", "quote": "..." }]
  }],
  "courses": [{
    "id": "6-1010", "name": "Fundamentals of Programming", "level": 1000,
    "dept": "EECS", "catalogCode": "6.1010",
    "taughtSkills": ["..."],
    "destinations": ["swe", "..."],
    "evidence": [{ "type": "catalog", "url": "...", "quote": "official description" }],
    "edgeEvidence": { "swe": { "confidence": 0.9, "matchedSkills": ["..."] } }
  }],
  "internships": [{
    "id": "mnc-swe", "role": "Software Engineer Intern", "orgType": "MNC",
    "exampleTitles": ["Software Engineering Intern (Stripe)", "..."],
    "requiredSkills": ["..."],
    "destinations": ["swe", "..."],
    "evidence": [{ "type": "posting", "url": "...", "title": "...", "company": "..." }],
    "edgeEvidence": { ... }
  }]
}
```

Level mapping: the app's 1000/2000/3000 grouping is preserved by mapping each
university's numbering (e.g. MIT intro/foundation subjects → 1000, core → 2000,
advanced undergraduate → 3000) during extraction.

## Workflow design (`.claude/workflows/ground-catalog.js`)

Reusable via the Workflow tool: `Workflow({name: "ground-catalog", args: {...}})`.

**Args** (all optional, defaulting to a working config):
`{ university, catalogUrls: [...], departments: [...], careers: [...ids or "existing"],
   companies: { greenhouse: [...], lever: [...] }, orgTypeMap: {...}, pilot: false }`

### Phase A — Career grounding (parallel per career)

One agent per career: map career name → O*NET SOC code (search onetonline.org),
fetch the occupation summary, extract task statements and skills, distill into
3 responsibilities + 4 skills in the catalog's existing voice, with citations.
Structured output enforced by JSON schema.

### Phase B — Course harvest (parallel per department)

One agent per department: fetch the catalog listing page(s), extract every
undergraduate course (code, title, level, description), then keep only courses
relevant to the career set and label each with `taughtSkills` inferred from the
official description text (quotes retained as evidence). Structured output.

### Phase C — Internship harvest (parallel per company, then cluster)

Mechanical fetch: agents pull Greenhouse/Lever JSON for each seed company, filter
titles matching intern/co-op patterns. Semantic pass: one agent per orgType
clusters raw titles into 3–4 canonical intern roles, extracts `requiredSkills`
from posting descriptions, keeps posting URLs as evidence.

### Phase D — Edge inference + adversarial verification (pipeline)

For each course and internship, a judge agent scores skill overlap against every
career's grounded skill profile and proposes `destinations` with confidence and
matched skills. A second, independent skeptic agent tries to **refute** each
proposed edge ("would selecting this course genuinely keep this career
reachable?"); edges failing verification are dropped. Degree expectations from
the product design are enforced as *ranking*, not invention: 1000-level courses
keep their top ~5 edges, 3000-level their top ~3, internships their top ~3–4.

### Phase E — Assemble, validate, generate

Deterministic scripts (not agents):
- `scripts/validate-dataset.mjs` — schema, referential integrity (every
  destination id exists), degree bounds, every node/edge has ≥1 evidence entry.
- `scripts/build-catalog.mjs` — `dataset.json` → `data/catalog.js` (existing
  shape; provenance kept in dataset.json only).
- `node --test` must pass (existing catalog-integrity tests).

A final agent writes `data/review-report.md`: every node and edge with its
evidence, flagged low-confidence items first, for human sign-off before the
generated catalog is committed over the illustrative one.

### Pilot mode

`pilot: true` restricts to 3 careers, 1 department, 2 companies — proves the
pipeline end-to-end cheaply before a full run.

## Failure handling

- Unreachable source → agent logs it, phase degrades (node marked
  `"evidence": []` fails validation, so gaps are visible, never silent).
- Intermediate outputs written to `data/sources/*.json` so re-runs resume
  cheaply and results are inspectable/diffable.
- Workflow resume (`resumeFromRunId`) covers mid-run failures.

## Open questions for review

1. Is per-career / per-department / per-company fan-out the right granularity?
2. Should mechanical JSON fetching (Greenhouse/Lever) be a script agents call,
   rather than agent WebFetch, for reliability and token cost?
3. How to keep the O*NET → career mapping honest for fuzzy careers
   ("Startup Founder", "BizOps") that have no clean SOC code?
4. Licensing/attribution requirements for O*NET and catalog excerpts.
5. Should edge confidence surface in the UI (link strength already exists)?
