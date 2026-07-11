export const meta = {
  name: 'ground-catalog',
  description: 'Regenerate the Open Doors dataset from real evidence: O*NET, university catalog pages, live intern postings',
  whenToUse: 'Use to produce an evidence-grounded dataset for this repo, per docs/grounding-workflow-plan.md. Outputs are namespaced by args.industry (data/datasets/<industry>.json, data/catalogs/<industry>.js); apply: true registers the catalog as an app tab on gate-passing full runs. Pass {pilot: true} to prove the plumbing cheaply first. Reusable for other industries: pass industry, careers (plain strings are fine), companies (any orgType labels), catalogPages; pass tiers to override per-stage model/effort.',
  phases: [
    { title: 'Setup', detail: 'O*NET bulk DB, posting boards, run metadata' },
    { title: 'Careers', detail: 'batched grounding + distinctiveness + scope-overlap adjacency' },
    { title: 'Courses', detail: 'parse catalog pages, shortlist, label taught skills' },
    { title: 'Internships', detail: 'cluster intern roles across org types' },
    { title: 'Simplify', detail: 'collapse title-similar courses within each level for brevity' },
    { title: 'Edges', detail: 'batched judges; skeptics only on the uncertain band' },
    { title: 'Intern variety', detail: 'canonical common roles proposed by judgment, validated against real postings' },
    { title: 'Gaps', detail: 'user-intuition gap review; capped judged edges' },
    { title: 'Finalize', detail: 'assemble (mechanical edge policy), gates, report' },
  ],
}

// ---------------------------------------------------------------------------
// Configuration (args override any of these; see docs/grounding-workflow-plan.md)
//
// Design rules that keep this workflow lean (see plan, "v3 simplification"):
//   - agents are BATCHED: fixed per-agent overhead must amortize over many
//     items, never one
//   - agents only produce JUDGMENTS; every threshold/ranking rule lives in
//     scripts/assemble-dataset.mjs (fail-closed for unreviewed banded edges)
//   - agents never edit existing structured files; each writes its own new file
// ---------------------------------------------------------------------------

const DEFAULTS = {
  // Namespace for every output path, so runs for different industries never
  // collide: data/sources/<industry>/, data/datasets/<industry>.json,
  // data/catalogs/<industry>.js, data/review-report-<industry>.md. The O*NET
  // DB is shared across industries at data/sources/onet/.
  industry: 'tech',
  industryLabel: 'Tech (MIT)',
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
  // postings + public degree/outcome pages instead; 'auto' (the default for
  // plain-string careers) lets the agent decide honestly.
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
  careerBatchSize: 6, // careers grounded per agent
  skepticBatchSize: 12, // banded edges verified per agent
  inferAdjacency: true, // judgment tier: infer scope-overlap edges between careers
  reviewGaps: true, // judgment tier: repair user-intuition gaps with capped judged edges
  // Course de-duplication for brevity: an agent proposes which title-similar
  // courses within a level to collapse into one representative; the assembler
  // (mergeCourses) applies it deterministically, unioning edges + evidence.
  simplifyCourses: true,
  // Intern-variety repair (judgment tier 3): when fewer clustered roles
  // SURVIVE edge policy than minInternshipVariety (the validator gate), an
  // LLM proposes canonical common intern roles and a grounding search must
  // validate each against real postings from >= 2 distinct employers.
  // Validated roles ship with grounding: "canonical" and judgment-only edges.
  canonicalInterns: true,
  minInternshipVariety: 4, // mirrors GATES.minInternshipVariety in the validator
  maxCanonicalInterns: 6,
  // SimplifyJobs intern list: broad title+company coverage across hundreds of
  // employers (title evidence only, never skill text). Set simplifyUrl: null
  // to disable; bump the season as new lists open.
  simplifyUrl: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json',
  simplifyCategories: '', // token/substring filter, e.g. 'data,quant'; empty keeps all
  // MyCareersFuture (Singapore's national jobs portal): comma-separated search
  // terms, queried for Internship/Attachment postings WITH full descriptions +
  // a structured skills array. A genuine skill source (unlike the title-only
  // SimplifyJobs list) that fills the Greenhouse/Lever gap for Singapore. Off
  // by default (set e.g. 'accounting,audit,tax' for a Singapore run).
  mycareersfuture: '',
  onetZipUrl: 'https://www.onetcenter.org/dl_files/database/db_29_1_text.zip',
  // apply: true registers the generated catalog as an app tab (via
  // scripts/register-catalog.mjs) when a full, gate-passing run finishes.
  // Without it the catalog is only staged at data/catalogs/<industry>.js for
  // inspection. The illustrative demo catalog is never overwritten.
  apply: false,
  pilot: false,
}

// args can arrive as a JSON-encoded string depending on the caller; accept both.
const argObj = typeof args === 'string' ? JSON.parse(args) : args || {}
const cfg = { ...DEFAULTS, ...argObj }
if (!cfg.runId) throw new Error('ground-catalog requires args.runId (workflow scripts cannot mint timestamps)')

// Careers may be passed as plain strings ("Nurse Practitioner") for other
// industries; they normalize to grounding "auto".
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
  career: { model: 'sonnet', effort: 'medium' }, // batched distillation
  distinctiveness: {}, // inherit: whole-set judgment gates edge quality
  adjacency: {}, // inherit: domain judgment of career scope overlap
  gaps: {}, // inherit: user-perspective judgment repairing sparse spots
  courses: { model: 'sonnet', effort: 'medium' }, // shortlist + label parsed JSON
  simplify: { model: 'sonnet', effort: 'medium' }, // judge which courses are near-duplicates
  internships: { model: 'sonnet', effort: 'medium' }, // cluster prefiltered titles
  judge: { model: 'sonnet', effort: 'medium' }, // batched edge proposals
  skeptic: {}, // inherit: adversarial verification is where quality binds
  canonicalPropose: {}, // inherit: domain judgment of what roles are commonly offered gates the tier
  canonicalValidate: { model: 'sonnet', effort: 'medium' }, // search + verify existence
  finalize: { model: 'sonnet', effort: 'low' }, // executes scripts, reports verbatim
  report: { model: 'sonnet', effort: 'high' }, // long-form synthesis, no discovery
}
const tiers = { ...TIER_DEFAULTS, ...(argObj.tiers || {}) }
const tier = (stage) => tiers[stage] || {}

cfg.industry = String(cfg.industry).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ROOT = `data/sources/${cfg.industry}`
const ONET_ROOT = 'data/sources/onet' // shared across industries
const DATASET = `data/datasets/${cfg.industry}.json`
const CATALOG_OUT = `data/catalogs/${cfg.industry}.js`
const REPORT = `data/review-report-${cfg.industry}.md`

const careerIdList = cfg.careers.map((c) => c.id).join(', ')
const chunk = (arr, n) => {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

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

// Mirror of the deterministic edge policy in scripts/assemble-dataset.mjs.
// The script is the source of truth; these constants only calibrate prompts
// and pick which edges need a skeptic.
const FLOORS = { 1000: 0.5, 2000: 0.6, 3000: 0.7, internship: 0.75 }
const AUTO_ACCEPT = 0.85

// ---------------------------------------------------------------------------
// Phase 0 - Setup: O*NET DB, posting boards, run metadata (one cheap agent)
// ---------------------------------------------------------------------------

phase('Setup')
log(`ground-catalog run ${cfg.runId} [${cfg.industry}]${cfg.pilot ? ' (pilot)' : ''}: ${cfg.careers.length} careers, ${cfg.catalogPages.length} departments, ${cfg.companies.length} boards`)

const bySource = { greenhouse: [], lever: [] }
for (const c of cfg.companies) bySource[c.source].push(c.slug)

const setup = await agent(
  `You are Phase 0 of the ground-catalog workflow in this repo (read docs/grounding-workflow-plan.md if unsure). Do exactly this, via Bash:
1. mkdir -p ${ONET_ROOT} ${ROOT}/careers ${ROOT}/courses ${ROOT}/catalog-html ${ROOT}/internships ${ROOT}/internships-canonical ${ROOT}/postings ${ROOT}/edges-judge ${ROOT}/edges-verdicts ${ROOT}/edges-gap data/datasets data/catalogs
2. If ${ONET_ROOT}/db/ does not already contain "Occupation Data.txt" in some subdirectory (the DB is shared across industry runs): curl -sSL --max-time 300 -o ${ONET_ROOT}/db.zip "${cfg.onetZipUrl}" and unzip -oq into ${ONET_ROOT}/db/. Record the O*NET version from the zip filename or Read Me.txt.
3. Verify: node scripts/onet-extract.mjs --db ${ONET_ROOT}/db/<subdir> --soc 15-1252.00 --top 3 returns JSON with a title.
4. Fetch and prefilter the posting boards: node scripts/fetch-postings.mjs --out ${ROOT}/postings ${bySource.greenhouse.length ? `--greenhouse ${bySource.greenhouse.join(',')}` : ''} ${bySource.lever.length ? `--lever ${bySource.lever.join(',')}` : ''}${cfg.simplifyUrl ? ` --simplify "${cfg.simplifyUrl}"${cfg.simplifyCategories ? ` --simplify-categories "${cfg.simplifyCategories}"` : ''}` : ''}${cfg.mycareersfuture ? ` --mycareersfuture "${cfg.mycareersfuture}"` : ''}
   Save its JSON summary verbatim to ${ROOT}/postings/manifest.json. Do not retry failed slugs with guessed alternatives.${cfg.simplifyUrl ? ` The --simplify source writes ${ROOT}/postings/simplify.json (durable snapshot, one posting per line) and ${ROOT}/postings/simplify-companies.json (compact {company:[titles]} view). Simplify entries are title+company evidence only, never skill text.` : ''}${cfg.mycareersfuture ? ` The --mycareersfuture source writes ${ROOT}/postings/mycareersfuture.json (Singapore intern postings, one per line) WITH full descriptions and a skills array, so they ARE valid skill evidence (evidence type "posting").` : ''}
5. Probe each catalog URL with curl -sS -o /dev/null -w "%{http_code}": ${cfg.catalogPages.map((p) => p.url).join(' ')}
6. Get the current UTC timestamp with: date -u +%Y-%m-%dT%H:%M:%SZ
7. Write ${ROOT}/meta.json: { "runId": "${cfg.runId}", "industry": ${JSON.stringify(cfg.industry)}, "university": ${JSON.stringify(cfg.university)}, "generatedBy": "ground-catalog", "onetVersion": "<found>", "generatedAt": "<timestamp>", "pilot": ${cfg.pilot}, "orgTypes": ${JSON.stringify(cfg.orgTypes)}, "sources": [<the catalog URLs and "${cfg.onetZipUrl}">] }
Fail (ok:false, explain in failures) if the O*NET DB cannot be fetched/verified, every posting board failed, or any catalog URL is unreachable. Return the manifest with path=${ROOT}/meta.json, ids=[slugs of posting boards with ok:true], failures=["slug: reason" per failed board, plus any hard failures], onetDbDir=<dir containing Occupation Data.txt>, generatedAt=<timestamp>.`,
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
const liveCompanies = new Set(setup.ids)
const liveOrgTypes = [...new Set(cfg.companies.filter((c) => liveCompanies.has(c.slug)).map((c) => c.orgType))]
log(`setup ok: ${setup.ids.length}/${cfg.companies.length} boards usable (org types: ${liveOrgTypes.join(', ')}); failures: ${(setup.failures || []).join('; ') || 'none'}`)

// ---------------------------------------------------------------------------
// Phases 1-3 - Careers, Courses, Internships (independent, run concurrently)
// ---------------------------------------------------------------------------

const EDGE_RULES = `EVIDENCE RULES (non-negotiable):
- Every claim needs a source you actually fetched/read this run; put {type, url, quote?, company?, title?, retrievedAt: "${NOW}"} entries in "evidence".
- Never write em dashes or en dashes in responsibilities/skills text (the build rejects them). Use commas, colons, or parentheses.
- Write 3 responsibilities and 4 skills per career, in the concrete, opinionated voice of the existing catalog (read data/catalog.js for tone): what you would own and what you can demonstrate, not buzzwords.`

const socSteps = `SOC GROUNDING (grounding "soc", or "auto" when an honest code exists). The O*NET bulk DB is at ${ONET_DB}.
- Verify or find the SOC code: check a hint via node scripts/onet-extract.mjs --db ${ONET_DB} --soc <code> --top 10; without a hint, grep -i likely title words in "${ONET_DB}/Occupation Data.txt" and "${ONET_DB}/Alternate Titles.txt". A code only counts if its description honestly describes the career as an undergrad would understand it; a wrong SOC silently redefines the career.
- Extract with one call per batch where possible: node scripts/onet-extract.mjs --db ${ONET_DB} --soc <code1>,<code2>,... --top 10
- Distill from tasks, skills, techSkills, workActivities, knowledge. Prefer occupation-specific material (techSkills, knowledge, workActivities) over generic skills like "Critical Thinking". If ratedSources shows ratings came from a related SOC, cite that code.
- Set "grounding": "soc" and "soc": ["<code>"], with onet evidence entries citing the SOC code and DB version.`

const postingsSteps = `POSTING GROUNDING (grounding "postings", or "auto" when no SOC honestly fits - say why in notes).
- Read the prefiltered live postings under ${ROOT}/postings/*.json and collect postings relevant to the career (entry-level and intern where possible). If fewer than 2 relevant postings exist there, WebSearch for 2-4 public postings or official university career-outcome/degree-map pages, WebFetch them, and SAVE each page's relevant text to ${ROOT}/postings/web-<careerId>-<n>.txt (the snapshot is the durable evidence; reference it in that evidence entry's "snapshot" field).
- Aggregate what the sources actually ask for; do not invent requirements no source states.
- Set "grounding": "postings" with evidence entries per source. If you cannot find 2+ real sources for a career, mark that career failed in your manifest failures; never pad.`

const careerTask = async () => {
  const batches = chunk(cfg.careers, cfg.careerBatchSize)
  const results = await parallel(
    batches.map((batch, bi) => () =>
      agent(
        `Ground these ${batch.length} careers for the ground-catalog workflow (batch ${bi + 1}/${batches.length}):
${batch.map((c) => `- id: ${c.id}, name: ${JSON.stringify(c.name)}, grounding: ${c.grounding}${c.socHint ? `, socHint: ${c.socHint}` : ''}`).join('\n')}

${socSteps}

${postingsSteps}

For EACH career write ${ROOT}/careers/<id>.json:
{ "id", "name", "grounding": "soc"|"postings", "soc": [only when soc-grounded], "responsibilities": [3 strings], "skills": [4 strings], "rawSkillPool": [10-16 short skill/knowledge/tech phrases for edge matching, occupation-specific ones first], "evidence": [...] }
${EDGE_RULES}
Return the manifest: path=${ROOT}/careers, ids=[career ids successfully written], failures=["id: reason" for any career you could not ground honestly], notes=grounding decisions for any "auto" careers.`,
        { ...tier('career'), label: `careers:batch${bi + 1}`, phase: 'Careers', schema: MANIFEST }
      )
    )
  )
  const okCareers = results.filter(Boolean).filter((r) => r.ok !== false)
  const groundedIds = okCareers.flatMap((r) => r.ids)
  const failed = cfg.careers.map((c) => c.id).filter((id) => !groundedIds.includes(id))
  if (failed.length) log(`careers with no honest grounding this run: ${failed.join(', ')} (dropped, not faked)`)

  // Two whole-set judgment passes over the grounded careers, concurrently. Each
  // writes ONE new file and never edits the career files (LLM read-modify-write
  // of evidence files is a corruption risk).
  const distinctFn = () =>
    agent(
      `Cross-career distinctiveness pass for the ground-catalog workflow. Read every career file in ${ROOT}/careers/ (ids: ${groundedIds.join(', ')}).
1. Across all rawSkillPool lists, identify skills effectively shared by more than 1/3 of the careers (normalize wording: "SQL" == "SQL fluency"). Those are GENERIC and cannot carry an edge.
2. For each career, select "distinctiveSkills": the subset of its rawSkillPool shared by fewer than 1/3 of careers, most distinctive first (aim for 5-10; if a career has fewer than 3, record it in failures).
3. Same-SOC collision rule: if two careers cite the same SOC code (or near-identical pools, e.g. swe/backend), differentiate their distinctiveSkills using posting evidence under ${ROOT}/postings/; if you cannot differentiate with real evidence, record "collision: <id> <id>" in your output so the review report flags a merge decision.
Write ONE file ${ROOT}/careers/_distinctive.json:
{ "distinctiveSkills": { "<careerId>": ["..."] }, "collisions": ["<id> <id>", ...] }
Do NOT edit the career files themselves. Return the manifest: path=${ROOT}/careers/_distinctive.json, ids=[career ids covered], failures as above.`,
      { ...tier('distinctiveness'), label: 'distinctiveness', phase: 'Careers', schema: MANIFEST }
    )

  // Adjacency: the JUDGMENT tier. Here you deliberately assert relationships
  // that are professionally true even where no course/posting evidence proves
  // them, so the map expresses reachability a domain expert would affirm (e.g.
  // a Data Scientist qualification also keeps a Data Analyst role reachable
  // because their scope overlaps). The assembler propagates these as softer,
  // clearly-marked "inferred" edges - they enrich reachability, they do not
  // fabricate grounded evidence.
  const adjacencyFn = () =>
    cfg.inferAdjacency === false
      ? Promise.resolve({ ok: true, path: '(skipped)', ids: [], notes: 'inferAdjacency=false' })
      : agent(
          `Career-adjacency judgment pass for the ground-catalog workflow. Read every career file in ${ROOT}/careers/ (ids: ${groundedIds.join(', ')}) and their responsibilities/skills.
Your job is DOMAIN JUDGMENT, not evidence lookup: decide, for ordered pairs of careers, how much preparing for career FROM also keeps career TO reachable, because their day-to-day scope overlaps. This is where you express relationships that are arguably true even without grounding data.
Rules:
- Directional. weight(from->to) in [0,1] = "someone who built toward FROM is how-much-ready for a TO role, given overlapping scope/skills". Asymmetric is expected: a Data Scientist path strongly opens Data Analyst (a scope subset, ~0.7-0.8), but Data Analyst opens Data Scientist only weakly (~0.3-0.4, DS needs more).
- Only emit pairs you would defend to a practitioner. Unrelated careers (e.g. Data Scientist -> Investment Banking) get no pair. Aim for the few strong, obvious overlaps per career, not a dense matrix; weight >= 0.5 is what the assembler will actually use.
- Ground the JUDGMENT in the careers' own responsibilities/skills you just read, and give a one-line rationale citing the overlap. Do not invent skills.
Write ONE file ${ROOT}/careers/_adjacency.json:
{ "pairs": [{ "from": "<careerId>", "to": "<careerId>", "weight": <0-1>, "rationale": "<overlap in one line>" }] }
Only use career ids among: ${groundedIds.join(', ')}. Return the manifest: path=${ROOT}/careers/_adjacency.json, ids=["from->to" for each pair], notes=count.`,
          { ...tier('adjacency'), label: 'adjacency', phase: 'Careers', schema: MANIFEST }
        )

  const [distinct, adjacency] = await parallel([distinctFn, adjacencyFn])
  return { groundedIds, distinct, adjacency }
}

const parseSteps = (page, slug) =>
  page.parser === 'llm'
    ? `2. This catalog does NOT use courseblock markup, so there is no deterministic parser. Read the saved HTML in slices (grep for course-title patterns first to find the structure) and build ${ROOT}/catalog-html/${slug}.parsed.json yourself in the parser's output shape: { "courses": [{ "catalogCode", "name", "prereqText", "description", "undergrad": true|false, "level": <see below>, "levelBasis": "LLM-assigned (no courseblock structure)", "levelTieBreak": true }] }. Map levels from prerequisite depth exactly like the deterministic rule (no prereqs: 1000; intro-level prereqs: 2000; deeper chains: 3000) and set levelTieBreak true on EVERY course so the review report lists all of them for human confirmation. Never invent courses or descriptions; extract only what the page states.
3. Shortlist from your parsed file.`
    : `2. Bash: node scripts/parse-catalog-html.mjs ${ROOT}/catalog-html/${slug}.html --dept ${JSON.stringify(page.dept)} --source-url "${page.url}" > ${ROOT}/catalog-html/${slug}.parsed.json
   Then make the small shortlisting view: node scripts/parse-catalog-html.mjs ${ROOT}/catalog-html/${slug}.html --compact > ${ROOT}/catalog-html/${slug}.compact.json
   Levels are assigned deterministically by the parser; do NOT re-derive them.
3. Read ONLY the compact file to shortlist (code/name/level/truncated desc). Then pull the full records for just your shortlisted codes from the .parsed.json file (e.g. node -e with a code filter, or grep) - do not read the full parsed file end to end.`

const courseTask = () =>
  parallel(
    cfg.catalogPages.map((page) => () => {
      const slug = page.dept.replace(/\W+/g, '-')
      return agent(
        `Harvest real courses for the ground-catalog workflow, department "${page.dept}".
1. Bash: curl -sSL --max-time 60 -o ${ROOT}/catalog-html/${slug}.html "${page.url}"
${parseSteps(page, slug)}
4. Shortlist AT MOST ${cfg.maxCoursesPerDept} undergraduate courses most relevant to these careers: ${careerIdList}. Prefer real taught courses over seminars/UROP/special-topics shells. Balance levels: aim for roughly 1/3 each of level 1000 / 2000 / 3000 where the department offers them.
5. For each shortlisted course, derive "taughtSkills": 4-8 short skill phrases stated or directly implied by the OFFICIAL description text only (quote the description in evidence; do not project skills the text doesn't support). If levelTieBreak is true, decide the level from the prereq text and description, and record your reasoning in "levelNote".
6. Write ${ROOT}/courses/${slug}.json:
{ "dept": ${JSON.stringify(page.dept)}, "sourceUrl": "${page.url}", "courses": [{ "id": "${cfg.university.toLowerCase().replace(/\W+/g, '-')}-<code with dots as dashes, lowercase>", "name": "<title>", "level": <number>, "dept": ${JSON.stringify(page.dept)}, "catalogCode": "<code>", "taughtSkills": [...], "levelBasis": "<from parser>", "levelNote": "<only if tie-break>", "evidence": [{ "type": "catalog", "url": "${page.url}", "quote": "<the official description>", "retrievedAt": "${NOW}" }] }] }
Return the manifest (path, ids=[course ids]).`,
        { ...tier('courses'), label: `courses:${page.dept}`, phase: 'Courses', schema: MANIFEST }
      )
    })
  )

// One agent covers all org types: the postings are already prefiltered and
// small, so per-orgType agents would just re-read the same directory.
const internshipTask = async () => {
  const byOrgType = liveOrgTypes
    .map(
      (t) =>
        `- ${t}: ${cfg.companies.filter((c) => c.orgType === t && liveCompanies.has(c.slug)).map((c) => `${c.source}-${c.slug}`).join(', ')}`
    )
    .join('\n')
  const m = await agent(
    `Canonicalize intern roles for the ground-catalog workflow, across ALL org types. Prefiltered postings are ${ROOT}/postings/<source>-<slug>.json (title, entryLevel: "intern"|"new-grad", url, content). Companies by org type:
${byOrgType}
${cfg.simplifyUrl ? `Also available: ${ROOT}/postings/simplify-companies.json (a compact {company: [titles]} map from the SimplifyJobs intern list, hundreds of employers). These are TITLE + COMPANY evidence only - there is NO description text, so they can broaden a role's example titles and its distinct-company count, but they can NEVER be a role's skill source. Do not read the full simplify.json (it is thousands of lines); grep it only if you need a specific listing's URL.\n` : ''}${cfg.mycareersfuture ? `Also available: ${ROOT}/postings/mycareersfuture.json (Singapore intern postings, one per line). These DO carry full descriptions and a skills array, so they ARE a valid skill source (evidence type "posting") and count toward the >= 2 distinct companies. Use them like an ATS board.\n` : ''}1. Read the ATS posting files${cfg.mycareersfuture ? ' and mycareersfuture.json' : ''} (and the compact simplify view if present). Per org type, cluster the intern-titled postings into 2-4 canonical roles (e.g. "Software Engineer Intern"). A role needs intern or new-grad postings from >= 2 distinct companies (Simplify and MyCareersFuture entries count toward that company count via their company name); prefer entryLevel "intern", use "new-grad" postings only to supplement skills. If an org type cannot support 2 roles from real postings, output fewer and say so in failures; NEVER invent roles.
2. For each role, extract "requiredSkills": 5-10 short phrases the posting texts actually ask for (quote-derived, not imagined). A role's skills MUST come from full posting text (an ATS "content" field or a web-fetched posting you snapshot to ${ROOT}/postings/web-<slug>-<n>.txt); a role supported only by Simplify titles cannot carry skills, so either fetch+snapshot 1-2 of its listings first or do not emit it. Use evidence type "posting" for ATS/fetched postings and "intern-list" for a SimplifyJobs entry.
3. Write ONE file per org type, ${ROOT}/internships/<orgtype-slug>.json:
{ "orgType": "<label>", "roles": [{ "id": "<orgtype-slug>-<role-slug>", "role": "<canonical title>", "orgType": "<label>", "exampleTitles": ["<title> (<Company>)"], "requiredSkills": [...], "evidence": [{ "type": "posting", "company": "<slug>", "title": "<posting title>", "url": "<posting url>", "snapshot": "<the postings file path>", "retrievedAt": "${NOW}" } per supporting posting] }] }
Return the manifest: path=${ROOT}/internships, ids=[ALL role ids across org types], failures per unsupportable org type.`,
    { ...tier('internships'), label: 'internships', phase: 'Internships', schema: MANIFEST }
  )
  return m ? [m] : []
}

const [careerOut, courseManifests, internshipManifests] = await parallel([careerTask, courseTask, internshipTask])
if (!careerOut || !careerOut.groundedIds.length) throw new Error('No careers grounded; aborting before edge inference')
const courseFiles = (courseManifests || []).filter(Boolean).filter((m) => m.ok)
const internshipFiles = (internshipManifests || []).filter(Boolean).filter((m) => m.ok)
const groundedCareerIds = careerOut.groundedIds
log(`grounded: ${groundedCareerIds.length} careers, ${courseFiles.flatMap((m) => m.ids).length} courses, ${internshipFiles.flatMap((m) => m.ids).length} internship roles`)

// ---------------------------------------------------------------------------
// Phase 3b - Simplify: collapse title-similar courses within a level for
// brevity. The DECISION is judgment (one agent reads the harvested courses
// across all departments); the APPLICATION is deterministic (mergeCourses in
// assemble-dataset.mjs unions edges + evidence). The agent writes only a new
// _merges.json; it never edits course files. Edge judging still runs per real
// course, so grounding is unchanged; the merge is applied at assembly.
// ---------------------------------------------------------------------------

if (cfg.simplifyCourses !== false && courseFiles.length) {
  phase('Simplify')
  const simplify = await agent(
    `Course de-duplication (Simplify) for the ground-catalog workflow (run ${cfg.runId}). Goal: a simpler experience by collapsing courses that are title-and-scope NEAR-DUPLICATES within the SAME level into one representative, WITHOUT losing grounding.
Read every course file ${ROOT}/courses/*.json (each has { dept, courses: [{ id, name, level, catalogCode, taughtSkills, ... }] }). Consider all departments together (near-duplicates often span departments, e.g. an Economics and a Mathematics intro statistics course).
Rules:
- Only merge courses that share the SAME level (1000/2000/3000) and genuinely teach the same foundational material a student would treat as interchangeable (e.g. "Introduction to Probability", "Probability and Random Variables", "Introduction to Probability and Statistics"). When unsure, DO NOT merge - a distinct advanced/specialized course must stay separate.
- Each merge group needs >= 2 members. Pick "keep" = the member id whose title is the most representative/canonical (its id is preserved, so edges and any preselect survive). Give the group a clean representative "title".
- Prefer a few high-confidence collapses over aggressive merging. Advanced (3000) courses are usually distinct; be conservative there.
Write ONE file ${ROOT}/courses/_merges.json (do NOT edit the course files):
{ "merges": [{ "keep": "<member id>", "title": "<representative title>", "members": ["<id>", "<id>", ...], "rationale": "<one line: why these are interchangeable at this level>" }] }
The assembler applies this deterministically: it unions the members' edges (direct beats inferred) and ALL their catalog evidence into the kept id, records mergedFrom + meta.flags.mergedCourses, and refuses any cross-level group. Return the manifest: path=${ROOT}/courses/_merges.json, ids=["<keep>" per group], notes=how many courses collapse into how many, and which you deliberately left separate.`,
    { ...tier('simplify'), label: 'simplify-courses', phase: 'Simplify', schema: MANIFEST }
  )
  if (simplify) log(`course simplify: ${simplify.ids.length} merge group(s); ${simplify.notes || ''}`)
}

// ---------------------------------------------------------------------------
// Phase 4 - Edges. Judges are batched (one per department file + one for
// internships). The workflow then computes, in plain code, which proposals
// fall in the uncertain band; ONLY those get skeptic agents (also batched).
// All floors / auto-accept / top-K ranking are applied deterministically by
// scripts/assemble-dataset.mjs at assembly time - agents never apply policy.
// ---------------------------------------------------------------------------

const judgeBatches = [
  ...courseFiles.map((m) => ({ key: m.path.split('/').pop().replace(/\.json$/, ''), path: m.path, ids: m.ids, kind: 'course' })),
  ...internshipFiles.map((m, i) => ({ key: `internships-${i}`, path: m.path, ids: m.ids, kind: 'internship' })),
].filter((b) => b.ids.length > 0)

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['proposals'],
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'kindKey', 'edges'],
        properties: {
          id: { type: 'string' },
          kindKey: { type: 'string', description: '"1000"|"2000"|"3000"|"internship"' },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              required: ['career', 'confidence'],
              properties: { career: { type: 'string' }, confidence: { type: 'number' } },
            },
          },
        },
      },
    },
  },
}

const judgeResults = await parallel(
  judgeBatches.map((batch) => () =>
    agent(
      `Edge judge (ground-catalog). Inputs to judge: every ${batch.kind} in ${batch.path} (ids: ${batch.ids.join(', ')}; skills are taughtSkills or requiredSkills). Career profiles: ${ROOT}/careers/<id>.json for ids ${groundedCareerIds.join(', ')}, with each career's distinctive skills in ${ROOT}/careers/_distinctive.json.
For each input, judge which careers its skills genuinely open. Rules:
- An edge REQUIRES at least one matched skill from the career's distinctiveSkills (generic matches like "problem solving" saturate the map and are worthless).
- Score confidence 0-1: how strongly the official evidence says this input develops what the career demands. Require a clear margin over the typical career; when in doubt, score low. Propose at most 6 edges per input, fewer is normal.
- Do NOT apply cutoffs or ranking; the assembler does that deterministically (floors ${JSON.stringify(FLOORS)}, auto-accept >= ${AUTO_ACCEPT}, top-K). Your job is honest scores only.
Write ONE file ${ROOT}/edges-judge/${batch.key}.json:
{ "proposals": { "<inputId>": [{ "career": "<id>", "confidence": <0-1>, "matchedSkills": ["..."], "distinctive": true, "rationale": "<one sentence>" }] } }
Then return the same proposals compactly: for each input {id, kindKey ("1000"|"2000"|"3000" from its level, or "internship"), edges: [{career, confidence}]}.`,
      { ...tier('judge'), label: `judge:${batch.key}`, phase: 'Edges', schema: JUDGE_SCHEMA }
    )
  )
)

// Compute the uncertain band in plain code - no agent applies thresholds.
const bandedPairs = []
let autoAccepted = 0
let autoDropped = 0
for (const r of judgeResults.filter(Boolean)) {
  for (const p of r.proposals || []) {
    const floor = FLOORS[p.kindKey] ?? FLOORS[Number(p.kindKey)]
    if (floor === undefined) continue
    for (const e of p.edges || []) {
      if (e.confidence < floor) autoDropped++
      else if (e.confidence >= AUTO_ACCEPT) autoAccepted++
      else bandedPairs.push({ input: p.id, career: e.career, confidence: e.confidence })
    }
  }
}
log(`edges proposed: ${autoAccepted} auto-accept, ${autoDropped} below floor, ${bandedPairs.length} in the uncertain band (only these get skeptics)`)

const skepticChunks = chunk(bandedPairs, cfg.skepticBatchSize)
const skepticResults = bandedPairs.length
  ? await parallel(
      skepticChunks.map((pairs, ci) => () =>
        agent(
          `Edge skeptic (ground-catalog), batch ${ci + 1}/${skepticChunks.length}. These proposed edges scored in the uncertain band; each is DROPPED unless you find independent evidence to keep it (fail-closed - your "keep" is the only thing that saves it):
${pairs.map((p) => `- ${p.input} -> ${p.career} (judge confidence ${p.confidence})`).join('\n')}
Context: judge rationales and matched skills are in ${ROOT}/edges-judge/*.json; input definitions in ${ROOT}/courses/*.json and ${ROOT}/internships/*.json; career profiles in ${ROOT}/careers/.
For each edge, check evidence the judge did NOT use: the live postings under ${ROOT}/postings/ (do postings for that career ask for this input's subject matter?) and, if needed, WebSearch for the university's own degree-map/roadmap pages. Verdict "keep" only when outside evidence supports the edge; when uncertain, "drop".
Write ${ROOT}/edges-verdicts/batch-${ci + 1}.json:
{ "verdicts": [{ "input": "...", "career": "...", "verdict": "keep"|"drop", "reason": "<one sentence citing the evidence>" }] }
Return the manifest: path=that file, ids=["<input>|<career>" for kept edges], notes=drop count.`,
          { ...tier('skeptic'), label: `skeptic:batch${ci + 1}`, phase: 'Edges', schema: MANIFEST }
        )
      )
    )
  : []
const keptByskeptic = skepticResults.filter(Boolean).flatMap((r) => r.ids).length
log(`skeptics kept ${keptByskeptic}/${bandedPairs.length} banded edges; assembler applies floors/top-K deterministically`)

// ---------------------------------------------------------------------------
// Phase 4b - Intern variety. In plain code, reproduce the assembler's
// keep-decision for internship edges (floor / auto-accept / fail-closed
// skeptic verdict) to count clustered roles that will SURVIVE assembly - the
// raw clustered count overstates it (a general-SWE cluster whose edges all
// fall below the 0.75 internship floor dies at assembly and shipped nothing
// last run). If survivors fall short of the variety gate, an LLM proposes
// canonical common intern roles and a grounding search validates each against
// real postings from >= 2 distinct employers. The deterministic join in
// assemble-dataset.mjs (buildCanonicalRoles) is the sole producer of roles;
// agents never transcribe fields across the proposal/evidence boundary.
// ---------------------------------------------------------------------------

const skepticKept = new Set(skepticResults.filter(Boolean).flatMap((r) => r.ids))
const survivingInternRoles = new Set()
for (const r of judgeResults.filter(Boolean)) {
  for (const p of r.proposals || []) {
    if (p.kindKey !== 'internship') continue
    const survives = (p.edges || []).some(
      (e) => e.confidence >= FLOORS.internship && (e.confidence >= AUTO_ACCEPT || skepticKept.has(`${p.id}|${e.career}`))
    )
    if (survives) survivingInternRoles.add(p.id)
  }
}
const clusteredSurvivors = survivingInternRoles.size
const starvedForProposer = cfg.careers.map((c) => c.id).filter((id) => groundedCareerIds.includes(id))
log(`intern variety: ${clusteredSurvivors} clustered role(s) will survive edge policy (target ${cfg.minInternshipVariety})`)

let canonicalProposal = null
if (cfg.canonicalInterns !== false && clusteredSurvivors < cfg.minInternshipVariety) {
  phase('Intern variety')
  const orgTypeList = cfg.orgTypes.join(', ')
  canonicalProposal = await agent(
    `Canonical intern-role PROPOSER for the ground-catalog workflow (run ${cfg.runId}). Only ${clusteredSurvivors} posting-clustered intern role(s) will survive assembly, below the variety target of ${cfg.minInternshipVariety}. Postings are seasonally thin; your job is DOMAIN JUDGMENT: name the canonical, commonly-offered intern roles a student in this field would recognize, so the map is not misleadingly empty. You do NOT validate them (a separate agent does); you propose.
Read the career files ${ROOT}/careers/<id>.json (ids: ${groundedCareerIds.join(', ')}) for each career's real scope, and the already-clustered roles in ${ROOT}/internships/*.json (do NOT duplicate them).
Org types available: ${orgTypeList}. Careers currently short of internship support (target these where honest): ${starvedForProposer.join(', ')}.
Propose up to ${cfg.maxCanonicalInterns} canonical intern roles. For EACH:
- role: the common title (e.g. "Data Analyst Intern", "Data Engineering Intern").
- orgType: pick from [${orgTypeList}] where the role is most commonly offered.
- requiredSkills: 5-8 short phrases the role standardly asks for. These are JUDGMENT (industry priors), not posting-extracted - they will ship marked skillsBasis "judgment".
- candidateEdges: at most 3 { career (from the id list), confidence 0.4-0.7, rationale }. Bar: would both an undergrad AND their advisor nod at this link? Prefer starved careers where honest; do NOT invent a role just to cover a career.
- searchHints: 2-4 concrete queries/companies a validator could use to find real postings for this role.
Write ONE file ${ROOT}/internships-canonical/_proposals.json:
{ "proposals": [{ "id": "<role-slug>", "role", "orgType", "whyCommon": "<one line>", "requiredSkills": [...], "candidateEdges": [{ "career", "confidence", "rationale" }], "searchHints": [...] }] }
Report starved careers you deliberately left unserved (and why) in notes. Return the manifest: path=that file, ids=[role slugs], notes.`,
    { ...tier('canonicalPropose'), label: 'canonical-propose', phase: 'Intern variety', schema: MANIFEST }
  )

  const canonicalValidation = canonicalProposal && canonicalProposal.ids && canonicalProposal.ids.length
    ? await agent(
        `Canonical intern-role VALIDATOR for the ground-catalog workflow (run ${cfg.runId}). The proposer wrote ${ROOT}/internships-canonical/_proposals.json (roles it believes are commonly offered). Your job is EXISTENCE VERIFICATION only: for each proposed role, find REAL evidence it exists in the world. You do NOT re-judge edges, rewrite skills, or add roles the proposer did not propose.
For each proposal (read the file; use its searchHints):
1. First check local snapshots: grep ${ROOT}/postings/simplify.json${cfg.mycareersfuture ? ` and ${ROOT}/postings/mycareersfuture.json (Singapore intern postings with real descriptions, current by construction)` : ''} and read the ATS files ${ROOT}/postings/*.json for postings whose title matches the role.
2. If needed, WebSearch for live or recent postings / employer early-careers pages, WebFetch them, and SAVE the relevant text to ${ROOT}/postings/web-<role-slug>-<n>.txt (the snapshot IS the durable evidence).
3. A role validates ONLY with evidence from >= 2 DISTINCT employers, at least one CURRENT: an intern-list (Simplify) entry, or a posting/page whose postedAt is within ~18 months of today. Use the company's real name for "company".
Write ONE file ${ROOT}/internships-canonical/validation.json:
{ "validated": [{ "id": "<matching proposal id>", "evidence": [{ "type": "posting"|"employer-page"|"intern-list", "company": "<real name>", "title": "<posting title>", "url": "<url>", "snapshot": "<path under ${ROOT}/postings/ ; for a Simplify entry use ${ROOT}/postings/simplify.json>", "retrievedAt": "${NOW}", "postedAt": "<ISO or null>" }], "queries": ["<searches you ran>"] }], "failures": ["<id>: reason it could not be validated with 2+ current employers"] }
Only include a role in "validated" if it truly clears the >=2-distinct-employers, >=1-current bar; otherwise put it in failures (fail-visible). The assembler joins your validation with the proposals deterministically - a role you omit ships nothing. Return the manifest: path=that file, ids=[validated role ids], failures.`,
        { ...tier('canonicalValidate'), label: 'canonical-validate', phase: 'Intern variety', schema: MANIFEST }
      )
    : null
  if (canonicalValidation)
    log(`canonical interns: proposed ${canonicalProposal.ids.length}, validated ${canonicalValidation.ids.length}; ${(canonicalValidation.failures || []).join('; ') || 'no failures'}`)
} else if (cfg.canonicalInterns !== false) {
  log(`intern variety sufficient (${clusteredSurvivors} >= ${cfg.minInternshipVariety}); canonical tier skipped`)
}

// ---------------------------------------------------------------------------
// Phase 5 - Gap review: look at the ASSEMBLED map the way an undergrad user
// will, and repair intuition gaps with capped domain judgment. Detection is
// deterministic (scripts/report-gaps.mjs); only the repair is an LLM call, and
// the assembler dampens, caps (2/input), and balance-gates whatever it adds.
// ---------------------------------------------------------------------------

phase('Gaps')
const gapReview =
  cfg.reviewGaps === false
    ? null
    : await agent(
        `Gap review for the ground-catalog workflow (run ${cfg.runId}): repair user-intuition gaps with capped domain judgment.
1. Bash: node scripts/assemble-dataset.mjs --sources ${ROOT} --out ${ROOT}/edges-gap/_draft.json
2. Bash: node scripts/report-gaps.mjs ${ROOT}/edges-gap/_draft.json > ${ROOT}/edges-gap/_gaps.json - then Read it. It lists sparseInputs (courses/internships opening fewer doors than their level promises, with their skills) and sparseCareers (jobs with dead-end-few supporters), plus the full career id list.
3. For each sparse INPUT, judge which ADDITIONAL careers from the list it genuinely helps toward. This is where the distinctive-skill rule under-connects foundational material: "Introduction to Probability" really does help toward Data Scientist even though probability is not distinctive to it. The bar: would both an undergrad AND their advisor nod at the link? Confidence 0.4-0.7 (this is judgment, not evidence; score modestly). At most 2 additions per input; a genuinely narrow course SHOULD stay narrow - do not force additions.
4. For each sparse CAREER, scan the draft dataset's other inputs (names + skills are in _draft.json) for ones whose content plausibly serves it, and propose those edges under the same bar and caps.
5. Read the career profiles in ${ROOT}/careers/ if you need each career's actual scope to judge honestly.
Write ${ROOT}/edges-gap/judged.json:
{ "judged": [{ "input": "<inputId>", "career": "<careerId>", "confidence": <0.4-0.7>, "rationale": "<one line an advisor would accept>" }] }
The assembler enforces the floor (0.4), the 2-per-input cap, dedupe against existing edges, and the distributional balance gates; the app draws judged edges softer and labels them judgment-based. Return the manifest: path=${ROOT}/edges-gap/judged.json, ids=["<input>-><career>" per proposal], notes=how many sparse items you left as-is and why.`,
        { ...tier('gaps'), label: 'gap-review', phase: 'Gaps', schema: MANIFEST }
      )
if (gapReview) log(`gap review proposed ${gapReview.ids.length} judged edges; ${gapReview.notes || ''}`)

// ---------------------------------------------------------------------------
// Phase 6 - Assemble (mechanical edge policy in code), validate gates, report
// ---------------------------------------------------------------------------

phase('Finalize')
const finalize = await agent(
  `Finalizer for the ground-catalog workflow (run ${cfg.runId}, industry ${cfg.industry}). Execute via Bash, in order, and report VERBATIM outputs:
1. node scripts/assemble-dataset.mjs --sources ${ROOT} --out ${DATASET}
   (It applies all edge policy deterministically and drops inputs with no surviving edges, recording them in meta.flags.droppedInputs - that is expected behavior, not an error to fix.)
2. node scripts/validate-dataset.mjs ${DATASET} ${cfg.pilot ? '--pilot' : ''}
3. If validation PASSED: node scripts/build-catalog.mjs ${DATASET} --out ${CATALOG_OUT}
${
  cfg.apply && !cfg.pilot
    ? `4. If validation PASSED: register the catalog as an app tab: node scripts/register-catalog.mjs --id ${cfg.industry} --label ${JSON.stringify(cfg.industryLabel)} --module ./${cfg.industry}.js --note "Evidence-grounded dataset (${cfg.university}, live postings, O*NET). Edges are a verified skill-overlap heuristic over official descriptions and postings, not measured student outcomes."
5. node --test (must stay green; if registration broke it, undo via git checkout -- data/catalogs/index.js and say so)`
    : `4. node --test (must stay green)`
}
Never write to data/catalog.js (the illustrative demo tab). Do not edit the validator, the gates, any file under ${ROOT}, or ${DATASET} by hand; a failing gate is a finding, not an obstacle. Return ok = whether validation passed, path = ${CATALOG_OUT} (or ${DATASET} if generation was skipped), ids = [], failures = every validator FAIL line, notes = the assembler's summary line + test summary${cfg.apply && !cfg.pilot ? ' + whether the tab was registered' : ''}.`,
  { ...tier('finalize'), label: 'assemble+validate', phase: 'Finalize', schema: MANIFEST }
)

const report = await agent(
  `Write the human sign-off report for ground-catalog run ${cfg.runId} (industry: ${cfg.industry}) to ${REPORT}. Sources: ${DATASET}, ${ROOT}/ (careers incl. _distinctive.json, courses, internships, edges-judge for proposals, edges-verdicts for skeptic decisions), the postings manifest ${ROOT}/postings/manifest.json, and this validation result: ${JSON.stringify((finalize && finalize.failures) || []).slice(0, 2000)}.
Edge pipeline stats for context: ${autoAccepted} auto-accepted (>= ${AUTO_ACCEPT}), ${autoDropped} below floor, ${bandedPairs.length} banded of which skeptics kept ${keptByskeptic} (fail-closed: unreviewed banded edges drop).
Structure, flagged items FIRST:
1. Verdict: gates ${finalize && finalize.ok ? 'PASSED' : 'FAILED'} (${cfg.pilot ? 'pilot gates only, distributional gates not evaluated' : 'full gates'}); what a human must review before this catalog ships as an app tab (registered via apply: true).
2. Flags: posting-grounded careers (lower provenance), careers dropped for lack of honest grounding (meta.flags.unsupportedCareers), dropped inputs (meta.flags.droppedInputs), inferred edges (meta.flags.inferredEdges), gap-review judged edges (meta.flags.judgedEdges, with their rationales from ${ROOT}/edges-gap/judged.json), and careers reachable ONLY via inference (meta.flags.inferenceOnlyCareers) - state plainly that these rest on judgment (scope overlap or gap review), not direct evidence, and are drawn softer, internship-starved careers, level tie-breaks (levelNote), same-SOC collisions (meta.flags.socCollisions), edges trimmed for balance (meta.flags.edgesTrimmedForBalance), dead/empty company boards, whether the skeptic band was empty (if so, say the adversarial pass had nothing to do this run), and the senior-narrowing simulation line from the validator output (breadth must close nothing; the committal stack should peak then narrow).
2b. Validated-canonical internship tier (if meta.flags.canonicalInternships is present): a DEDICATED section. For each canonical role list its validation evidence WITH AGE (postedAt vs retrievedAt - a historical posting must read as historical, not current), its judged-edge rationales (from ${ROOT}/internships-canonical/_proposals.json), and state explicitly that its requiredSkills are JUDGMENT (skillsBasis "judgment"), not posting-extracted. Report the variety split (meta.flags.internshipVariety: clustered vs canonical), any roles the join skipped (meta.flags.canonicalSkipped: unvalidated or title-duplicate), careers whose internship support is entirely canonical (meta.flags.canonicalOnlyInternshipCareers), and which starved careers remain unserved (from the proposer's notes). Say plainly: canonical roles are validated to EXIST at real employers; their career links are judgment, not measured outcomes.
2c. Course de-duplication (if meta.flags.mergedCourses is present): a short section listing each merged representative and the courses it combines (from mergedCourses[].members), noting that merges only collapse title-similar SAME-LEVEL courses, keep one member id, and union edges + all members' catalog evidence (so grounding is preserved). Mention meta.flags.mergeSkipped if any group was refused.
3. Every node and edge with its evidence (source, quote or company/title, retrievedAt) and confidence, in tables.
4. Staleness: postings churn in weeks; recommend a re-run cadence, and note the canonical tier's evidence is seasonal too (re-validate each cycle).
Be honest: this dataset is a verified skill-overlap heuristic over requirement-side evidence, not measured outcomes. Return the manifest (path=${REPORT}, ids=[]).`,
  { ...tier('report'), label: 'review-report', phase: 'Finalize', schema: MANIFEST }
)

return {
  runId: cfg.runId,
  industry: cfg.industry,
  pilot: cfg.pilot,
  careers: groundedCareerIds.length,
  courses: courseFiles.flatMap((m) => m.ids).length,
  internshipRoles: internshipFiles.flatMap((m) => m.ids).length,
  edgeStats: { autoAccepted, autoDropped, banded: bandedPairs.length, keptBySkeptic: keptByskeptic },
  validationPassed: !!(finalize && finalize.ok),
  validationFailures: (finalize && finalize.failures) || [],
  generated: finalize && finalize.path,
  reviewReport: report && report.path,
  boardFailures: setup.failures || [],
}
