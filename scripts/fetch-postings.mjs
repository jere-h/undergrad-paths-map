#!/usr/bin/env node
// fetch-postings.mjs - fetch live intern postings from public ATS APIs and
// pre-filter them BEFORE any LLM reads the data. Boards are multi-MB
// (Stripe: 3.7 MB, 503 jobs, of which 12 are interns), so pushing raw
// responses through an agent context truncates or hallucinates; this script
// leaves only the intern-matching postings, entity-decoded and tag-stripped.
//
// Fetching shells out to curl so the environment's proxy configuration is
// honored (Node's fetch does not read HTTPS_PROXY).
//
// Usage:
//   node scripts/fetch-postings.mjs --out data/sources/postings \
//        [--greenhouse stripe,databricks] [--lever palantir] \
//        [--simplify <listings.json url>] [--simplify-categories "AI/ML/Data,Quant"] \
//        [--mycareersfuture "accounting,audit,tax"] [--mcf-max 40]
//
// --mycareersfuture queries Singapore's national jobs portal
// (mycareersfuture.gov.sg) for Internship/Attachment postings matching each
// comma-separated search term, deduped by job id, WITH full descriptions and a
// structured skills array (a genuine skill source, unlike the title-only
// SimplifyJobs list). It fills the Greenhouse/Lever gap for Singapore.
//
// Writes one snapshot file per company plus a summary manifest to stdout:
//   { retrievedAt, companies: [{ company, source, url, ok, totalJobs,
//       internCount, file, error? }] }
//
// A company returning zero jobs or zero intern matches is recorded ok: false.
// Lever returns HTTP 200 with [] for unknown slugs, so "no postings" must be
// treated as a per-company failure to keep bad seed lists visible.
//
// --simplify pulls the SimplifyJobs intern list (a community-maintained GitHub
// list; broad title+company coverage across hundreds of employers). Its
// entries carry NO description text, so they are title+company evidence only,
// never skill evidence. Two files are written: simplify.json (the durable
// snapshot, one posting per line so agents can grep it) and
// simplify-companies.json (a compact {company: [titles]} view sized for agent
// reading). Category filtering is token/substring based because the live list
// carries alias categories ("AI/ML/Data" vs "Data Science, AI & Machine
// Learning"); kept counts per category land in the manifest so partial
// misses are visible.

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { decodeEntities, stripTags } from "./parse-catalog-html.mjs";

// True intern/co-op titles are the primary signal; intern postings churn
// seasonally (boards can carry zero in July), so entry-level "new grad"
// postings are also kept, tagged, as supplementary skill evidence only.
const INTERN_RE = /\b(intern(ship)?|co[- ]?op)\b/i;
const NEWGRAD_RE = /\bnew grad(uate)?\b|\buniversity grad|\bcampus hire\b|\bearly career\b/i;
const MAX_CONTENT = 4000; // chars of description kept per posting

export function entryLevel(title) {
  if (INTERN_RE.test(title || "")) return "intern";
  if (NEWGRAD_RE.test(title || "")) return "new-grad";
  return null;
}

function curlJson(url) {
  const out = execFileSync("curl", ["-sS", "--max-time", "60", "-L", url], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

function curlPostJson(url, body) {
  const out = execFileSync(
    "curl",
    ["-sS", "--max-time", "60", "-L", "-X", "POST", "-H", "Content-Type: application/json", "-d", JSON.stringify(body), url],
    { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }
  );
  return JSON.parse(out);
}

export function cleanContent(html) {
  // Greenhouse double-escapes: content is HTML-escaped HTML.
  return stripTags(decodeEntities(String(html || ""))).slice(0, MAX_CONTENT);
}

export function filterGreenhouse(payload) {
  const jobs = payload.jobs || [];
  return {
    totalJobs: jobs.length,
    postings: jobs
      .filter((j) => entryLevel(j.title))
      .map((j) => ({
        title: j.title,
        entryLevel: entryLevel(j.title),
        url: j.absolute_url,
        location: j.location && j.location.name,
        updatedAt: j.updated_at,
        content: cleanContent(j.content),
      })),
  };
}

export function filterLever(payload) {
  const jobs = Array.isArray(payload) ? payload : [];
  return {
    totalJobs: jobs.length,
    postings: jobs
      .filter((j) => entryLevel(j.text))
      .map((j) => ({
        title: j.text,
        entryLevel: entryLevel(j.text),
        url: j.hostedUrl,
        location: j.categories && j.categories.location,
        content: cleanContent(
          (j.descriptionPlain || j.description || "") +
            " " +
            (j.lists || []).map((l) => `${l.text}: ${stripTags(l.content || "")}`).join(" ")
        ),
      })),
  };
}

// One employer must never count as two companies just because it was seen
// through two sources ("lever-palantir" from an ATS snapshot vs "Palantir"
// from the Simplify list). Every distinct-company count in the pipeline
// normalizes through this first.
export function normalizeCompany(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/^(greenhouse|lever|simplify)-/, "")
    .replace(/[^a-z0-9]+/g, "");
}

// SimplifyJobs listings.json entry -> snapshot posting. Keeps only listings
// that are currently active AND visible; category filtering is
// case-insensitive token/substring matching (alias categories exist in the
// live data). Returns per-category kept counts so filtering is auditable.
export function filterSimplify(payload, { categories = [] } = {}) {
  const listings = Array.isArray(payload) ? payload : [];
  const tokens = categories.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
  const matchesCategory = (cat) =>
    tokens.length === 0 || tokens.some((t) => String(cat || "").toLowerCase().includes(t));
  const categoryCounts = {};
  const postings = [];
  for (const l of listings) {
    if (!l || !l.active || !l.is_visible) continue;
    if (!matchesCategory(l.category)) continue;
    const cat = l.category || "(none)";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    postings.push({
      title: l.title,
      company: l.company_name,
      url: l.url,
      locations: l.locations || [],
      postedAt: l.date_posted ? new Date(l.date_posted * 1000).toISOString() : null,
      category: l.category || null,
      entryLevel: "intern",
    });
  }
  return { totalListings: listings.length, categoryCounts, postings };
}

// {company: [titles]} aggregation - the compact view agents read instead of
// the full snapshot (hundreds of lines instead of thousands).
export function simplifyCompanies(postings) {
  const byCompany = {};
  for (const p of postings) {
    const key = p.company || "(unknown)";
    if (!byCompany[key]) byCompany[key] = [];
    if (!byCompany[key].includes(p.title)) byCompany[key].push(p.title);
  }
  return Object.fromEntries(Object.keys(byCompany).sort().map((k) => [k, byCompany[k].sort()]));
}

// Serialize with the `postings` array one-entry-per-line: the filtered list
// can run to 1000+ entries and pretty-printing it would exceed what an agent
// can Read, while a single line would defeat grep.
export function serializeSimplify(snapshot) {
  const lines = (snapshot.postings || []).map((p) => `    ${JSON.stringify(p)}`);
  const shell = JSON.stringify({ ...snapshot, postings: [] }, null, 2);
  return shell.replace('"postings": []', `"postings": [\n${lines.join(",\n")}\n  ]`);
}

// MyCareersFuture (Singapore's national jobs portal, mycareersfuture.gov.sg).
// Its public v2 search API filters by employment type, so we ask for
// Internship/Attachment postings directly. Unlike the SimplifyJobs title list,
// each posting carries a structured skills array AND a full description (from
// the per-job detail endpoint), so a MyCareersFuture posting is a genuine SKILL
// source, not just title+company. This fills the Greenhouse/Lever gap for
// Singapore (and other markets those ATS boards miss).
export const MCF_SEARCH_URL = "https://api.mycareersfuture.gov.sg/v2/search";
export const MCF_JOB_URL = (uuid) => `https://api.mycareersfuture.gov.sg/v2/jobs/${uuid}`;
const MCF_JOB_PAGE = (r) =>
  (r.metadata && r.metadata.jobDetailsUrl) ||
  (r.uuid ? `https://www.mycareersfuture.gov.sg/job/${r.uuid}` : null);

// Map a search result (+ optional detail JSON with the full description) to a
// posting. Pure and testable; the network calls live in fetchMyCareersFuture.
export function mcfPosting(result, detail = null) {
  const skills = (result.skills || (detail && detail.skills) || [])
    .map((s) => (typeof s === "string" ? s : s.skill))
    .filter(Boolean);
  const categories = (result.categories || []).map((c) => (typeof c === "string" ? c : c.category)).filter(Boolean);
  const description = detail ? cleanContent(detail.description) : "";
  return {
    title: result.title,
    company: (result.postedCompany && result.postedCompany.name) || (result.hiringCompany && result.hiringCompany.name) || null,
    url: MCF_JOB_PAGE(result),
    uuid: result.uuid,
    categories,
    skills,
    postedAt: (result.metadata && (result.metadata.newPostingDate || result.metadata.originalPostingDate)) || null,
    entryLevel: "intern", // filtered to Internship/Attachment at the query
    content: description,
  };
}

// Dedupe by uuid across queries; keep genuine internship postings only.
// Staffing-agency reposts tag EVERY employment type (Full Time + Contract +
// Internship + ...), so an internship employment tag alone is not enough:
// require the title to read as an internship, or the posting to be (almost)
// internship-only.
const MCF_INTERN_TITLE = /\b(intern(ship)?|attachment|trainee)\b/i;
const MCF_SENIOR_TITLE = /\b(manager|senior|snr|director|head|lead|principal|vp|chief|executive)\b/i;
export function collectMcfResults(pages) {
  const byUuid = new Map();
  for (const page of pages)
    for (const r of (page && page.results) || []) {
      const types = (r.employmentTypes || []).map((e) => (typeof e === "string" ? e : e.employmentType));
      const title = r.title || "";
      const titleIntern = MCF_INTERN_TITLE.test(title);
      if (!types.some((t) => /intern|attachment/i.test(t || ""))) continue;
      // Agency reposts tag every employment type; a senior title with an intern
      // tag is not an internship. Keep only genuine intern signals.
      if (!titleIntern && types.length > 2) continue;
      if (!titleIntern && MCF_SENIOR_TITLE.test(title)) continue;
      if (r.uuid && !byUuid.has(r.uuid)) byUuid.set(r.uuid, r);
    }
  return [...byUuid.values()];
}

// Runs the search (one POST per query term, paginated) + per-job detail fetches
// for full descriptions. Bounded by max to keep it cheap. Returns
// { totalResults, postings }.
function fetchMyCareersFuture(queries, { limit = 20, maxPages = 3, max = 40 } = {}) {
  const pages = [];
  for (const q of queries) {
    for (let page = 0; page < maxPages; page++) {
      const res = curlPostJson(`${MCF_SEARCH_URL}?limit=${limit}&page=${page}`, {
        search: q,
        employmentTypes: ["Internship/Attachment"],
        sortBy: ["new_posting_date"],
      });
      pages.push(res);
      if (!res.results || res.results.length < limit) break; // last page for this query
    }
  }
  const results = collectMcfResults(pages).slice(0, max);
  const postings = results.map((r) => {
    let detail = null;
    try {
      detail = curlJson(MCF_JOB_URL(r.uuid));
    } catch {
      detail = null; // fall back to the search-result skills; description stays empty
    }
    return mcfPosting(r, detail);
  });
  return { totalResults: results.length, postings };
}

const SOURCES = {
  greenhouse: {
    url: (co) => `https://boards-api.greenhouse.io/v1/boards/${co}/jobs?content=true`,
    filter: filterGreenhouse,
  },
  lever: {
    url: (co) => `https://api.lever.co/v0/postings/${co}?mode=json`,
    filter: filterLever,
  },
};

function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt = "") => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const outDir = opt("--out");
  if (!outDir) {
    console.error("usage: fetch-postings.mjs --out <dir> [--greenhouse a,b] [--lever c,d]");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const retrievedAt = new Date().toISOString();
  const companies = [];
  for (const [source, def] of Object.entries(SOURCES)) {
    const list = opt(`--${source}`).split(",").map((s) => s.trim()).filter(Boolean);
    for (const company of list) {
      const url = def.url(company);
      const entry = { company, source, url, ok: false, totalJobs: 0, internCount: 0, newGradCount: 0 };
      try {
        const { totalJobs, postings } = def.filter(curlJson(url));
        entry.totalJobs = totalJobs;
        entry.internCount = postings.filter((p) => p.entryLevel === "intern").length;
        entry.newGradCount = postings.filter((p) => p.entryLevel === "new-grad").length;
        if (totalJobs === 0) {
          entry.error = "zero postings returned (bad slug or empty board)";
        } else if (postings.length === 0) {
          entry.error = "no intern/co-op/new-grad titled postings on this board";
        } else {
          entry.ok = true;
          entry.file = join(outDir, `${source}-${company}.json`);
          writeFileSync(
            entry.file,
            JSON.stringify({ company, source, url, retrievedAt, totalJobs, postings }, null, 2)
          );
        }
      } catch (err) {
        entry.error = String(err.message || err).slice(0, 300);
      }
      companies.push(entry);
    }
  }

  const simplifyUrl = opt("--simplify");
  if (simplifyUrl) {
    const categories = opt("--simplify-categories").split(",").map((s) => s.trim()).filter(Boolean);
    const entry = { company: "simplify", source: "simplify", url: simplifyUrl, ok: false };
    try {
      const { totalListings, categoryCounts, postings } = filterSimplify(curlJson(simplifyUrl), { categories });
      entry.totalListings = totalListings;
      entry.internCount = postings.length;
      entry.categoryCounts = categoryCounts;
      if (postings.length === 0) {
        entry.error = "no active+visible listings matched the category filter";
      } else {
        entry.ok = true;
        entry.file = join(outDir, "simplify.json");
        entry.companiesFile = join(outDir, "simplify-companies.json");
        writeFileSync(
          entry.file,
          serializeSimplify({ source: "simplify", url: simplifyUrl, retrievedAt, totalListings, categoryCounts, postings })
        );
        writeFileSync(entry.companiesFile, JSON.stringify(simplifyCompanies(postings), null, 2));
      }
    } catch (err) {
      entry.error = String(err.message || err).slice(0, 300);
    }
    companies.push(entry);
  }

  // MyCareersFuture (Singapore). --mycareersfuture takes comma-separated search
  // terms (e.g. "accounting,audit,tax"); each is queried for Internship/
  // Attachment postings, results deduped by uuid, and full descriptions pulled
  // from the detail endpoint. Snapshot carries real skill text, so these count
  // as full-text posting evidence downstream.
  const mcfQueries = opt("--mycareersfuture").split(",").map((s) => s.trim()).filter(Boolean);
  if (mcfQueries.length) {
    const entry = { company: "mycareersfuture", source: "mycareersfuture", url: MCF_SEARCH_URL, queries: mcfQueries, ok: false };
    try {
      const max = Number(opt("--mcf-max", "40")) || 40;
      const { totalResults, postings } = fetchMyCareersFuture(mcfQueries, { max });
      entry.totalResults = totalResults;
      entry.internCount = postings.length;
      entry.withDescription = postings.filter((p) => p.content).length;
      if (postings.length === 0) {
        entry.error = "no Internship/Attachment postings matched the search terms";
      } else {
        entry.ok = true;
        entry.file = join(outDir, "mycareersfuture.json");
        writeFileSync(
          entry.file,
          serializeSimplify({ source: "mycareersfuture", url: MCF_SEARCH_URL, queries: mcfQueries, retrievedAt, totalResults, postings })
        );
      }
    } catch (err) {
      entry.error = String(err.message || err).slice(0, 300);
    }
    companies.push(entry);
  }

  process.stdout.write(JSON.stringify({ retrievedAt, companies }, null, 2));
  if (companies.length > 0 && companies.every((c) => !c.ok)) process.exit(1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
