export const meta = {
  name: 'ground-catalog',
  description: 'Regenerate the Open Doors dataset from real evidence: O*NET, university catalog pages, live intern postings',
  whenToUse: 'Use to produce an evidence-grounded data/dataset.json (and staged catalog) for this repo, per docs/grounding-workflow-plan.md. Pass {pilot: true} to prove the plumbing cheaply first. Reusable for other industries: pass your own careers (plain strings are fine), companies (with any orgType labels), and catalogPages; pass tiers to override per-stage model/effort.',
  phases: [
    { title: 'Setup', detail: 'O*NET bulk DB, source probes, run metadata' },
    { title: 'Postings', detail: 'fetch + prefilter ATS boards mechanically' },
    { title: 'Careers', detail: 'ground each career, then cross-career distinctiveness' },
    { title: 'Courses', detail: 'parse catalog pages, shortlist, label taught skills' },
    { title: 'Internships', detail: 'cluster intern roles per org type' },
    { title: 'Edges', detail: 'judge per input, then skeptic verification' },
    { title: 'Finalize', detail: 'assemble, run acceptance gates, review report' },
  ],
}

// ---------------------------------------------------------------------------
// Configuration (args override any of these; see docs/grounding-workflow-plan.md)
// ---------------------------------------------------------------------------

const DEFAULTS = {
  university: 'MIT',
  catalogPages: [
    { dept: 'EECS', url: 'https://catalog.mit.edu/subjects/6/' },
    { dept: 'Mathematics', url: 'https://catalog.mit.edu/subjects/18/' },
    { dept: 'Economics', url: 'https://catalog.mit.edu/subjects/14/' },
    { dept: 'Management', url: 'https://catalog.mit.edu/subjects/15/' },
    { dept: 'Biology', url: 'https://catalog.mit.edu/subjects/7/' },
    { dept: 'Brain and Cognitive Sciences', url: 'https://catalog.mit.edu/subjects/9/' },
  ],
  // grounding: 'soc' careers get O*NET profiles (agent verifies the hint);
  // 'postings' careers have no honest SOC match and are grounded in live
  // postings + public degree/outcome pages instead (see plan: wrong-SOC
  // grounding is worse than none).
  careers: [
    { id: 'swe', name: 'Software Engineer', grounding: 'soc', socHint: '15-1252.00' },
    { id: 'backend', name: 'Backend Engineer', grounding: 'soc', socHint: '15-1252.00' },
    { id: 'data-analyst', name: 'Data Analyst', grounding: 'soc', socHint: '15-2041.00' },
    { id: 'data-scientist', name: 'Data Scientist', grounding: 'soc', socHint: '15-2051.00' },
    { id: 'ml-engineer', name: 'Machine Learning Engineer', grounding: 'soc', socHint: '15-2051.01' },
    { id: 'pm', name: 'Product Manager', grounding: 'postings' },
    { id: 'ux', name: 'UX Researcher', grounding: 'soc', socHint: '19-3022.00' },
    { id: 'designer', name: 'Product Designer', grounding: 'soc', socHint: '27-1021.00' },
    { id: 'quant', name: 'Quantitative Analyst', grounding: 'soc', socHint: '13-2099.01' },
    { id: 'ibanking', name: 'Investment Banking', grounding: 'postings' },
    { id: 'fin-analyst', name: 'Financial Analyst', grounding: 'soc', socHint: '13-2051.00' },
    { id: 'consultant', name: 'Management Consultant', grounding: 'soc', socHint: '13-1111.00' },
    { id: 'founder', name: 'Startup Founder', grounding: 'postings' },
    { id: 'bizops', name: 'Operations and BizOps', grounding: 'postings' },
    { id: 'researcher', name: 'Research Scientist', grounding: 'soc', socHint: '19-1042.00' },
    { id: 'biotech', name: 'Biotech and Bioinformatics', grounding: 'soc', socHint: '15-2099.01' },
    { id: 'economist', name: 'Economist and Policy', grounding: 'soc', socHint: '19-3011.00' },
    { id: 'growth', name: 'Marketing and Growth', grounding: 'postings' },
  ],
  // Seed ATS boards. Greenhouse/Lever skew tech; orgType coverage gaps are
  // flagged by validation, never silently padded. Extend this list rather
  // than trusting it to be representative.
  companies: [
    { slug: 'stripe', source: 'greenhouse', orgType: 'MNC' },
    { slug: 'databricks', source: 'greenhouse', orgType: 'MNC' },
    { slug: 'palantir', source: 'lever', orgType: 'MNC' },
    { slug: 'airbnb', source: 'greenhouse', orgType: 'MNC' },
    { slug: 'vercel', source: 'greenhouse', orgType: 'Startup' },
    { slug: 'anthropic', source: 'greenhouse', orgType: 'Startup' },
    { slug: 'scaleai', source: 'greenhouse', orgType: 'Startup' },
    { slug: 'gusto', source: 'greenhouse', orgType: 'Small Business' },
  ],
  maxCoursesPerDept: 12,
  onetZipUrl: 'https://www.onetcenter.org/dl_files/database/db_29_1_text.zip',
  // Replace data/catalog.js only when explicitly asked AND full gates pass;
  // otherwise the generated catalog is staged next to it for inspection.
  apply: false,
  pilot: false,
}

// args can arrive as a JSON-encoded string depending on the caller; accept both.
const argObj = typeof args === 'string' ? JSON.parse(args) : args || {}
const cfg = { ...DEFAULTS, ...argObj }
if (!cfg.runId) throw new Error('ground-catalog requires args.runId (workflow scripts cannot mint timestamps)')

// Careers may be passed as plain strings ("Nurse Practitioner") for other
// industries; they normalize to grounding "auto", where the agent attempts an
// honest SOC mapping and falls back to posting-grounding itself.
cfg.careers = cfg.careers.map((c) =>
  typeof c === 'string'
    ? { id: c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: c, grounding: 'auto' }
    : { grounding: 'auto', ...c }
)
// Org types are whatever labels the company list uses (e.g. Hospital, Agency,
// Government); the app sidebar, validator, and generator are all data-driven.
cfg.orgTypes = argObj.orgTypes || [...new Set(cfg.companies.map((c) => c.orgType))]

if (cfg.pilot) {
  // Generic pilot slice: works for custom career/company lists too.
  cfg.careers = cfg.careers.slice(0, 3)
  cfg.catalogPages = cfg.catalogPages.slice(0, 1)
  cfg.companies = cfg.companies.slice(0, 3)
  cfg.maxCoursesPerDept = 6
}

// Per-stage model/effort tiering. Mechanical stages run cheap; judgment-heavy
// stages (cross-career distinctiveness, skeptic verification) inherit the
// session model. Override any stage via args.tiers, e.g.
// { tiers: { judge: { model: 'haiku' }, skeptic: {} } }.
const TIER_DEFAULTS = {
  setup: { model: 'sonnet', effort: 'low' }, // scripted bash steps
  postings: { model: 'haiku', effort: 'low' }, // runs one script, copies a manifest
  career: { model: 'sonnet', effort: 'medium' }, // per-career distillation
  distinctiveness: {}, // inherit: whole-set judgment gates edge quality
  courses: { model: 'sonnet', effort: 'medium' }, // shortlist + label parsed JSON
  internships: { model: 'sonnet', effort: 'medium' }, // cluster prefiltered titles
  judge: { model: 'sonnet', effort: 'medium' }, // the fan-out cost driver
  skeptic: {}, // inherit: adversarial verification is where quality binds
  finalize: { model: 'sonnet', effort: 'low' }, // executes scripts, reports verbatim
  report: { model: 'sonnet', effort: 'high' }, // long-form synthesis, no discovery
}
const tiers = { ...TIER_DEFAULTS, ...(argObj.tiers || {}) }
const tier = (stage) => tiers[stage] || {}

const ROOT = 'data/sources'
const careerIdList = cfg.careers.map((c) => c.id).join(', ')
const careerProfilesNote = `Career profiles live in ${ROOT}/careers/<id>.json (ids: ${careerIdList}).`

const MANIFEST = {
  type: 'object',
  required: ['ok', 'path', 'ids'],
  properties: {
    ok: { type: 'boolean' },
    path: { type: 'string', description: 'file this agent wrote' },
    ids: { type: 'array', items: { type: 'string' }, description: 'ids of items in the file' },
    failures: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

// ---------------------------------------------------------------------------
// Phase 0 - Setup
// ---------------------------------------------------------------------------

phase('Setup')
log(`ground-catalog run ${cfg.runId}${cfg.pilot ? ' (pilot)' : ''}: ${cfg.careers.length} careers, ${cfg.catalogPages.length} departments, ${cfg.companies.length} boards`)

const setup = await agent(
  `You are Phase 0 of the ground-catalog workflow in this repo (read docs/grounding-workflow-plan.md if unsure). Do exactly this, via Bash:
1. mkdir -p ${ROOT}/onet ${ROOT}/careers ${ROOT}/courses ${ROOT}/catalog-html ${ROOT}/internships ${ROOT}/postings ${ROOT}/edges-judge ${ROOT}/edges
2. If ${ROOT}/onet/db/ does not already contain "Occupation Data.txt" in some subdirectory: curl -sSL --max-time 300 -o ${ROOT}/onet/db.zip "${cfg.onetZipUrl}" and unzip -oq into ${ROOT}/onet/db/. Record the O*NET version from the zip filename or Read Me.txt.
3. Verify: node scripts/onet-extract.mjs --db ${ROOT}/onet/db/<subdir> --soc 15-1252.00 --top 3 returns JSON with a title.
4. Probe each catalog URL with curl -sS -o /dev/null -w "%{http_code}": ${cfg.catalogPages.map((p) => p.url).join(' ')}
5. Get the current UTC timestamp with: date -u +%Y-%m-%dT%H:%M:%SZ
6. Write ${ROOT}/meta.json: { "runId": "${cfg.runId}", "university": ${JSON.stringify(cfg.university)}, "generatedBy": "ground-catalog", "onetVersion": "<found>", "generatedAt": "<timestamp>", "pilot": ${cfg.pilot}, "orgTypes": ${JSON.stringify(cfg.orgTypes)}, "sources": [<the catalog URLs and "${cfg.onetZipUrl}">] }
Fail (ok:false, explain in failures) if the O*NET DB cannot be fetched/verified or any catalog URL is unreachable. Return the manifest with path=${ROOT}/meta.json, ids=[], and notes = the onet db directory path (the one containing Occupation Data.txt) and the timestamp.`,
  {
    ...tier('setup'),
    label: 'setup',
    phase: 'Setup',
    schema: {
      ...MANIFEST,
      required: ['ok', 'path', 'ids', 'onetDbDir', 'generatedAt'],
      properties: {
        ...MANIFEST.properties,
        onetDbDir: { type: 'string' },
        generatedAt: { type: 'string' },
      },
    },
  }
)
if (!setup || !setup.ok) throw new Error(`Setup failed: ${JSON.stringify(setup && setup.failures)}`)
const ONET_DB = setup.onetDbDir
const NOW = setup.generatedAt

// ---------------------------------------------------------------------------
// Phase 1 - Postings fetch (mechanical, before career/internship semantics)
// ---------------------------------------------------------------------------

phase('Postings')
const bySource = { greenhouse: [], lever: [] }
for (const c of cfg.companies) bySource[c.source].push(c.slug)

const postings = await agent(
  `Run this repo's posting fetcher via Bash (it curls public ATS APIs and prefilters intern/new-grad titles so no giant payload ever enters an LLM context):
node scripts/fetch-postings.mjs --out ${ROOT}/postings ${bySource.greenhouse.length ? `--greenhouse ${bySource.greenhouse.join(',')}` : ''} ${bySource.lever.length ? `--lever ${bySource.lever.join(',')}` : ''}
It prints a JSON summary. Write that summary verbatim to ${ROOT}/postings/manifest.json (if the script didn't already), then return: ok=true if at least one company succeeded, path=${ROOT}/postings/manifest.json, ids=[slugs of companies with ok:true], failures=["slug: reason" for each ok:false company]. Do not retry failed slugs with guessed alternatives.`,
  { ...tier('postings'), label: 'fetch-postings', phase: 'Postings', schema: MANIFEST }
)
if (!postings || !postings.ok) throw new Error(`Postings fetch failed: ${JSON.stringify(postings && postings.failures)}`)
const liveCompanies = new Set(postings.ids)
const orgTypes = [...new Set(cfg.companies.filter((c) => liveCompanies.has(c.slug)).map((c) => c.orgType))]
log(`postings: ${postings.ids.length}/${cfg.companies.length} boards usable (org types: ${orgTypes.join(', ')}); failures: ${(postings.failures || []).join('; ') || 'none'}`)

// ---------------------------------------------------------------------------
// Phases 2-4 - Careers, Courses, Internships (independent, run concurrently)
// ---------------------------------------------------------------------------

const EDGE_RULES = `EVIDENCE RULES (non-negotiable):
- Every claim needs a source you actually fetched/read this run; put {type, url, quote?, company?, title?, retrievedAt: "${NOW}"} entries in "evidence".
- Never write em dashes or en dashes in responsibilities/skills text (the build rejects them). Use commas, colons, or parentheses.
- Write 3 responsibilities and 4 skills, in the concrete, opinionated voice of the existing catalog (read data/catalog.js for tone): what you would own and what you can demonstrate, not buzzwords.`

const socSteps = (career) => `SOC GROUNDING. This repo's O*NET bulk DB is at ${ONET_DB}.
- ${career.socHint ? `Verify the SOC mapping: start from hint ${career.socHint}. Check its title/description via: node scripts/onet-extract.mjs --db ${ONET_DB} --soc ${career.socHint} --top 10.` : `Find the SOC code: grep -i likely title words in "${ONET_DB}/Occupation Data.txt" and "${ONET_DB}/Alternate Titles.txt", then check candidates with node scripts/onet-extract.mjs.`} A code only counts if its description honestly describes this career as an undergrad would understand it; a wrong SOC silently redefines the career.
- From the extracted tasks, skills, techSkills, workActivities, knowledge, distill the profile. Prefer occupation-specific material (techSkills, knowledge, workActivities) over generic skills like "Critical Thinking" which appear in every occupation. If ratedSources shows ratings came from a related SOC, cite that code.
- Set "grounding": "soc" and "soc": ["<verified code>"], with onet evidence entries citing the SOC code and DB version.`

const postingsSteps = (career) => `POSTING GROUNDING (no SOC code; do not force one).
- Read the prefiltered live postings under ${ROOT}/postings/*.json and collect every posting relevant to "${career.name}" (entry-level and intern where possible). If fewer than 2 relevant postings exist there, use WebSearch to find 2-4 public, non-paywalled postings or official university career-outcome/degree-map pages for this path, WebFetch them, and SAVE each fetched page's relevant text to ${ROOT}/postings/web-${career.id}-<n>.txt (postings churn in weeks; the local snapshot is the durable evidence, the URL is just a pointer). Reference the snapshot path in that evidence entry's "snapshot" field.
- Aggregate what these sources actually ask for into the profile. Do not invent requirements no source states.
- Set "grounding": "postings", with evidence entries {type:"posting"|"web", url, company?, title?, quote?, snapshot?, retrievedAt:"${NOW}"} for each source used. If you cannot find 2+ real sources, return ok:false and say so in failures; never pad.`

const careerPrompt = (career) => {
  const strategy =
    career.grounding === 'soc'
      ? socSteps(career)
      : career.grounding === 'postings'
        ? postingsSteps(career)
        : `Decide the grounding honestly, in this order:
1. ${socSteps(career)}
2. Only if NO SOC code honestly fits (say why in notes): ${postingsSteps(career)}`
  return `Ground the career "${career.name}" (id: ${career.id}) for the ground-catalog workflow.
${strategy}
Write ${ROOT}/careers/${career.id}.json:
{ "id": "${career.id}", "name": ${JSON.stringify(career.name)}, "grounding": "soc"|"postings" (as decided above), "soc": [only when soc-grounded], "responsibilities": [3 strings], "skills": [4 strings], "rawSkillPool": [10-16 short skill/knowledge/tech phrases for edge matching, occupation-specific ones first], "evidence": [...] }
${EDGE_RULES}
Return the manifest (path, ids=["${career.id}"]); notes = which grounding you used and why.`
}

const careerTask = async () => {
  const results = await parallel(
    cfg.careers.map((career) => () =>
      agent(careerPrompt(career), {
        ...tier('career'),
        label: `career:${career.id}`,
        phase: 'Careers',
        schema: MANIFEST,
      })
    )
  )
  const okCareers = results.filter(Boolean).filter((r) => r.ok)
  const failed = cfg.careers.filter((c, i) => !(results[i] && results[i].ok)).map((c) => c.id)
  if (failed.length) log(`careers with no honest grounding this run: ${failed.join(', ')} (they are dropped, not faked)`)

  // Barrier is genuine: distinctiveness is a property of the whole career set.
  const distinct = await agent(
    `Cross-career distinctiveness pass for the ground-catalog workflow. Read every file in ${ROOT}/careers/ (ids present: ${okCareers.flatMap((r) => r.ids).join(', ')}).
1. Across all rawSkillPool lists, identify skills that are effectively shared by more than 1/3 of the careers (normalize wording: "SQL" == "SQL fluency"). Those are GENERIC and cannot carry an edge.
2. Edit each career file (Read then Write) adding: "distinctiveSkills": the subset of its rawSkillPool shared by fewer than 1/3 of careers, most distinctive first (aim for 5-10; if a career has fewer than 3 distinctive skills, note it in your manifest failures).
3. Same-SOC collision rule: if two careers cite the same SOC code (or near-identical pools, e.g. swe/backend), differentiate their distinctiveSkills using posting evidence under ${ROOT}/postings/ (what do backend-titled vs generalist postings ask for?). If you cannot differentiate them with real evidence, record "collision: <id> <id>" in failures so the review report flags a merge decision.
Return the manifest: path=${ROOT}/careers, ids=[career ids updated], failures as above.`,
    { ...tier('distinctiveness'), label: 'distinctiveness', phase: 'Careers', schema: MANIFEST }
  )
  return { okCareers, distinct }
}

const parseSteps = (page, slug) =>
  page.parser === 'llm'
    ? `2. This catalog does NOT use courseblock markup, so there is no deterministic parser. Read the saved HTML in slices (grep for course-title patterns first to find the structure) and build ${ROOT}/catalog-html/${slug}.parsed.json yourself in the parser's output shape: { "courses": [{ "catalogCode", "name", "prereqText", "description", "undergrad": true|false, "level": <see below>, "levelBasis": "LLM-assigned (no courseblock structure)", "levelTieBreak": true }] }. Map levels from prerequisite depth exactly like the deterministic rule (no prereqs: 1000; intro-level prereqs: 2000; deeper chains: 3000) and set levelTieBreak true on EVERY course so the review report lists all of them for human confirmation. Never invent courses or descriptions; extract only what the page states.`
    : `2. Bash: node scripts/parse-catalog-html.mjs ${ROOT}/catalog-html/${slug}.html --dept ${JSON.stringify(page.dept)} --source-url "${page.url}" > ${ROOT}/catalog-html/${slug}.parsed.json
   This parses every course deterministically (code, title, description, level from prerequisite depth, levelTieBreak flags). Do NOT re-derive levels yourself; the parser's assignment is the auditable rule.`

const courseTask = () =>
  parallel(
    cfg.catalogPages.map((page) => () => {
      const slug = page.dept.replace(/\W+/g, '-')
      return agent(
        `Harvest real courses for the ground-catalog workflow, department "${page.dept}".
1. Bash: curl -sSL --max-time 60 -o ${ROOT}/catalog-html/${slug}.html "${page.url}"
${parseSteps(page, slug)}
3. Read the parsed JSON (it may be large; read in slices). Shortlist AT MOST ${cfg.maxCoursesPerDept} undergraduate courses most relevant to these careers: ${careerIdList}. Prefer real taught courses over seminars/UROP/special-topics shells. Balance levels: aim for roughly 1/3 each of level 1000 / 2000 / 3000 where the department offers them.
4. For each shortlisted course, derive "taughtSkills": 4-8 short skill phrases stated or directly implied by the OFFICIAL description text only (quote the description in evidence; do not project skills the text doesn't support). If levelTieBreak is true, decide the level from the prereq text and description, and record your reasoning in "levelNote".
5. Write ${ROOT}/courses/${slug}.json:
{ "dept": ${JSON.stringify(page.dept)}, "sourceUrl": "${page.url}", "courses": [{ "id": "${cfg.university.toLowerCase().replace(/\W+/g, '-')}-<code with dots as dashes, lowercase>", "name": "<title>", "level": <from parser or your tie-break>, "dept": ${JSON.stringify(page.dept)}, "catalogCode": "<code>", "taughtSkills": [...], "levelBasis": "<from parser>", "levelNote": "<only if tie-break>", "evidence": [{ "type": "catalog", "url": "${page.url}", "quote": "<the official description>", "retrievedAt": "${NOW}" }] }] }
Return the manifest (path, ids=[course ids]).`,
        { ...tier('courses'), label: `courses:${page.dept}`, phase: 'Courses', schema: MANIFEST }
      )
    })
  )

const internshipTask = () =>
  parallel(
    orgTypes.map((orgType) => () =>
      agent(
        `Canonicalize intern roles for org type "${orgType}" (ground-catalog workflow).
Companies of this org type with live data: ${cfg.companies.filter((c) => c.orgType === orgType && liveCompanies.has(c.slug)).map((c) => `${c.source}-${c.slug}`).join(', ')}. Their prefiltered postings are ${ROOT}/postings/<source>-<slug>.json (title, entryLevel: "intern"|"new-grad", url, content).
1. Read those files. Cluster the intern-titled postings into 2-4 canonical roles (e.g. "Software Engineer Intern", "Data Analyst Intern"). A role needs intern or new-grad postings from >= 2 distinct companies; prefer entryLevel "intern", use "new-grad" postings only to supplement skills. If this org type cannot support 2 roles from real postings, output fewer and say so in failures; NEVER invent roles.
2. For each role, extract "requiredSkills": 5-10 short phrases that the posting texts actually ask for (quote-derived, not imagined).
3. Write ${ROOT}/internships/${orgType.replace(/\W+/g, '-')}.json:
{ "orgType": ${JSON.stringify(orgType)}, "roles": [{ "id": "<orgtype-slug>-<role-slug>", "role": "<canonical title>", "orgType": ${JSON.stringify(orgType)}, "exampleTitles": ["<title> (<Company>)"], "requiredSkills": [...], "evidence": [{ "type": "posting", "company": "<slug>", "title": "<posting title>", "url": "<posting url>", "snapshot": "<the postings file path>", "retrievedAt": "${NOW}" } for each supporting posting] }] }
Return the manifest (path, ids=[role ids]).`,
        { ...tier('internships'), label: `internships:${orgType}`, phase: 'Internships', schema: MANIFEST }
      )
    )
  )

const [careerOut, courseManifests, internshipManifests] = await parallel([careerTask, courseTask, internshipTask])
if (!careerOut || !careerOut.okCareers.length) throw new Error('No careers grounded; aborting before edge inference')
const courseFiles = (courseManifests || []).filter(Boolean).filter((m) => m.ok)
const internshipFiles = (internshipManifests || []).filter(Boolean).filter((m) => m.ok)
const groundedCareerIds = careerOut.okCareers.flatMap((r) => r.ids)
log(`grounded: ${groundedCareerIds.length} careers, ${courseFiles.flatMap((m) => m.ids).length} courses, ${internshipFiles.flatMap((m) => m.ids).length} internship roles`)

// ---------------------------------------------------------------------------
// Phase 5 - Edge inference (judge per input) + adversarial verification
// (skeptic per input, different evidence). Pipeline: no barrier between the
// two stages, an input's skeptic runs while other inputs are still judged.
// ---------------------------------------------------------------------------

const inputs = [
  ...courseFiles.flatMap((m) => m.ids.map((id) => ({ id, kind: 'course', path: m.path }))),
  ...internshipFiles.flatMap((m) => m.ids.map((id) => ({ id, kind: 'internship', path: m.path }))),
]
const TOPK = { 1000: 5, 2000: 4, 3000: 3, internship: 4 }
const FLOORS = { 1000: 0.5, 2000: 0.6, 3000: 0.7, internship: 0.75 }

const VERDICT = {
  type: 'object',
  required: ['id', 'kept', 'dropped'],
  properties: {
    id: { type: 'string' },
    kept: { type: 'array', items: { type: 'string' } },
    dropped: { type: 'array', items: { type: 'string' } },
    disagreed: { type: 'boolean', description: 'true if you overturned at least one judge decision' },
  },
}

const edgeResults = await pipeline(
  inputs,
  (input) =>
    agent(
      `Edge judge (ground-catalog). Input: ${input.kind} "${input.id}" defined in ${input.path} (find it by id; its skills are taughtSkills or requiredSkills). ${careerProfilesNote}
For each career, judge whether this ${input.kind}'s skills genuinely overlap that career's profile. Rules:
- An edge REQUIRES at least one matched skill from the career's "distinctiveSkills" (generic matches like "problem solving" saturate the map and are worthless).
- Score confidence 0-1: how strongly the official evidence says this ${input.kind} develops what the career demands. Require a clear margin over the typical career; when in doubt, score low.
- Keep at most ${input.kind === 'internship' ? TOPK.internship : `${TOPK[1000]} for level 1000 / ${TOPK[2000]} for 2000 / ${TOPK[3000]} for 3000`} proposed edges (ranked); fewer is fine.
Write ${ROOT}/edges-judge/${input.id}.json:
{ "id": "${input.id}", "kind": "${input.kind}", "proposed": [{ "career": "<id>", "confidence": <0-1>, "matchedSkills": ["..."], "distinctive": true, "rationale": "<one sentence>" }] }
Return {id, kept: [career ids proposed], dropped: [], disagreed: false}.`,
      { ...tier('judge'), label: `judge:${input.id}`, phase: 'Edges', schema: VERDICT }
    ),
  (judgeResult, input) => {
    if (!judgeResult) return null
    return agent(
      `Edge skeptic (ground-catalog). Read ${ROOT}/edges-judge/${input.id}.json. Your job is to REFUTE weak proposed edges using DIFFERENT evidence than the judge used:
- For each proposed edge with confidence between 0.40 and 0.85: check the live postings under ${ROOT}/postings/ (and WebSearch if needed: real intern/new-grad postings for that career, or the university's own degree-map/roadmap pages). Ask: would a hiring manager or advisor for career X actually count this ${input.kind} toward it? If the outside evidence does not support the edge, DROP it. Default to dropping when uncertain.
- Edges below their confidence floor are dropped automatically: floors are 1000: ${FLOORS[1000]}, 2000: ${FLOORS[2000]}, 3000: ${FLOORS[3000]}, internship: ${FLOORS.internship}.
- Edges at or above 0.85 pass through; edges below 0.40 drop.
- If EVERY edge would drop, keep the single best-evidenced one only if it clears its floor; otherwise the input keeps zero edges (the finalizer will drop the input, which is honest).
Write the surviving edges to ${ROOT}/edges/${input.id}.json as:
{ "id": "${input.id}", "destinations": [career ids], "edges": { "<careerId>": { "confidence": <number>, "matchedSkills": [...], "distinctive": true } } }
Only career ids among: ${groundedCareerIds.join(', ')}. Return {id, kept, dropped, disagreed: true if you overturned any judge decision}.`,
      { ...tier('skeptic'), label: `skeptic:${input.id}`, phase: 'Edges', schema: VERDICT }
    ).then((v) => {
      if (!v) return null
      // Disagreement is a mechanical set difference, not agent self-assessment
      // (the pilot showed skeptics under-report their own overturns).
      const judged = new Set(judgeResult.kept)
      const kept = new Set(v.kept)
      const disagreed = judgeResult.kept.length !== v.kept.length || [...judged].some((c) => !kept.has(c))
      return { ...v, disagreed }
    })
  }
)
const verdicts = edgeResults.filter(Boolean)
const disagreements = verdicts.filter((v) => v.disagreed).length
log(`edges: ${verdicts.length}/${inputs.length} inputs judged+verified; skeptic overturned something on ${disagreements} (${inputs.length ? Math.round((100 * disagreements) / verdicts.length) : 0}%). Near-0% would mean the skeptic is decorative.`)

// ---------------------------------------------------------------------------
// Phase 6 - Assemble, validate against acceptance gates, report
// ---------------------------------------------------------------------------

phase('Finalize')
const finalize = await agent(
  `Finalizer for the ground-catalog workflow (run ${cfg.runId}). Execute via Bash, in order, and report VERBATIM outputs:
1. node scripts/assemble-dataset.mjs --sources ${ROOT} --out data/dataset.json
   (If it fails because some input has no edge file, delete that input's entry ONLY by removing it from its ${ROOT}/courses/ or ${ROOT}/internships/ file - an input the skeptic zeroed out must not ship - then rerun. Record every removal.)
2. node scripts/validate-dataset.mjs data/dataset.json ${cfg.pilot ? '--pilot' : ''}
3. If validation PASSED: node scripts/build-catalog.mjs data/dataset.json --out ${cfg.apply && !cfg.pilot ? 'data/catalog.js' : 'data/catalog.generated.js'}
4. node --test (must stay green; if you generated to data/catalog.js and tests fail, revert that file via git checkout -- data/catalog.js and say so)
Do not edit the validator, the gates, or data/dataset.json by hand to force a pass; a failing gate is a finding, not an obstacle. Return ok = whether validation passed, path = the generated catalog path (or data/dataset.json if generation was skipped), ids = [], failures = every validator FAIL line, notes = removals + test summary.`,
  { ...tier('finalize'), label: 'assemble+validate', phase: 'Finalize', schema: MANIFEST }
)

const report = await agent(
  `Write the human sign-off report for ground-catalog run ${cfg.runId} to data/review-report.md. Sources: data/dataset.json, ${ROOT}/ (careers, courses, internships, edges-judge vs edges for what the skeptic dropped), the postings manifest ${ROOT}/postings/manifest.json, and this validation result: ${JSON.stringify((finalize && finalize.failures) || []).slice(0, 2000)}.
Structure, flagged items FIRST:
1. Verdict: gates ${finalize && finalize.ok ? 'PASSED' : 'FAILED'} (${cfg.pilot ? 'pilot gates only, distributional gates not evaluated' : 'full gates'}); what a human must review before data/catalog.js may be replaced.
2. Flags: posting-grounded careers (lower provenance), careers dropped for lack of honest grounding, internship-starved careers, level tie-breaks (levelNote), same-SOC collisions, dead/empty company boards, judge-vs-skeptic disagreement rate ${verdicts.length ? Math.round((100 * disagreements) / verdicts.length) : 0}% (flag "skeptic decorative" if near 0).
3. Every node and edge with its evidence (source, quote or company/title, retrievedAt) and confidence, in tables.
4. Staleness: postings churn in weeks; recommend a re-run cadence.
Be honest: this dataset is a verified skill-overlap heuristic over requirement-side evidence, not measured outcomes. Return the manifest (path=data/review-report.md, ids=[]).`,
  { ...tier('report'), label: 'review-report', phase: 'Finalize', schema: MANIFEST }
)

return {
  runId: cfg.runId,
  pilot: cfg.pilot,
  careers: groundedCareerIds.length,
  courses: courseFiles.flatMap((m) => m.ids).length,
  internshipRoles: internshipFiles.flatMap((m) => m.ids).length,
  inputsWithEdges: verdicts.length,
  skepticDisagreementRate: verdicts.length ? disagreements / verdicts.length : 0,
  validationPassed: !!(finalize && finalize.ok),
  validationFailures: (finalize && finalize.failures) || [],
  generated: finalize && finalize.path,
  reviewReport: report && report.path,
  postingFailures: postings.failures || [],
}
