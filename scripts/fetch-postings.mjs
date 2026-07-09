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
//        [--greenhouse stripe,databricks] [--lever palantir]
//
// Writes one snapshot file per company plus a summary manifest to stdout:
//   { retrievedAt, companies: [{ company, source, url, ok, totalJobs,
//       internCount, file, error? }] }
//
// A company returning zero jobs or zero intern matches is recorded ok: false.
// Lever returns HTTP 200 with [] for unknown slugs, so "no postings" must be
// treated as a per-company failure to keep bad seed lists visible.

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
  process.stdout.write(JSON.stringify({ retrievedAt, companies }, null, 2));
  if (companies.length > 0 && companies.every((c) => !c.ok)) process.exit(1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
