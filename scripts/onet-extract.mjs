#!/usr/bin/env node
// onet-extract.mjs - deterministic extraction from the O*NET bulk text
// database (tab-separated files from the ~13 MB db_XX_X_text zip at
// onetcenter.org). Per-career HTML scraping of onetonline.org is fragile and
// rate-limit-prone; the bulk DB is downloaded once per run and this script
// answers every SOC lookup locally and reproducibly.
//
// Expected one-time setup (documented Bash, done by the workflow's Phase 0):
//   curl -L -o onet.zip "https://www.onetcenter.org/dl_files/database/db_29_1_text.zip"
//   unzip -o onet.zip -d data/sources/onet
//
// Usage:
//   node scripts/onet-extract.mjs --db data/sources/onet/db_29_1_text \
//        --soc 15-1252.00,15-2051.00 [--top 12]
//
// Emits JSON to stdout:
//   { onetDir, occupations: { "15-1252.00": { title, description,
//       tasks: [..], skills: [{name, importance}], techSkills: [..],
//       workActivities: [{name, importance}], knowledge: [{name, importance}] } } }

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function loadFile(dir, name) {
  try {
    return parseTsv(readFileSync(join(dir, name), "utf8"));
  } catch {
    return null;
  }
}

// Scale-rated files (Skills, Work Activities, Knowledge) carry one row per
// element per scale; IM is the 1-5 importance scale.
function importanceRanked(rows, soc, top) {
  if (!rows) return [];
  return rows
    .filter(
      (r) =>
        r["O*NET-SOC Code"] === soc &&
        r["Scale ID"] === "IM" &&
        r["Recommend Suppress"] !== "Y" &&
        r["Not Relevant"] !== "Y"
    )
    .map((r) => ({ name: r["Element Name"], importance: Number(r["Data Value"]) }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, top);
}

export function extractOccupations(dir, socCodes, top = 12) {
  const occData = loadFile(dir, "Occupation Data.txt");
  const tasks = loadFile(dir, "Task Statements.txt");
  const skills = loadFile(dir, "Skills.txt");
  const tech = loadFile(dir, "Technology Skills.txt");
  const activities = loadFile(dir, "Work Activities.txt");
  const knowledge = loadFile(dir, "Knowledge.txt");
  const related = loadFile(dir, "Related Occupations.txt");
  if (!occData) {
    throw new Error(`Occupation Data.txt not found under ${dir} (contents: ${readdirSync(dir).slice(0, 8).join(", ")}…)`);
  }
  const occupations = {};
  for (const soc of socCodes) {
    const occ = occData.find((r) => r["O*NET-SOC Code"] === soc);
    if (!occ) {
      occupations[soc] = { error: "unknown SOC code" };
      continue;
    }
    // Not every occupation carries importance-rated data in every O*NET
    // release (e.g. 15-1252.00 Software Developers has none in 29.1). Fall
    // back to the closest related occupation that does, and say so: the
    // provenance must never imply ratings the release doesn't contain.
    const relatedSocs = (related || [])
      .filter((r) => r["O*NET-SOC Code"] === soc)
      .sort((a, b) => Number(a["Index"] || 99) - Number(b["Index"] || 99))
      .map((r) => r["Related O*NET-SOC Code"]);
    const ratedLookup = (rows) => {
      const own = importanceRanked(rows, soc, top);
      if (own.length > 0) return { items: own, ratedSource: soc };
      for (const rel of relatedSocs) {
        const viaRelated = importanceRanked(rows, rel, top);
        if (viaRelated.length > 0) return { items: viaRelated, ratedSource: rel };
      }
      return { items: [], ratedSource: null };
    };
    const skillsR = ratedLookup(skills);
    const activitiesR = ratedLookup(activities);
    const knowledgeR = ratedLookup(knowledge);
    occupations[soc] = {
      title: occ["Title"],
      description: occ["Description"],
      tasks: (tasks || [])
        .filter((r) => r["O*NET-SOC Code"] === soc && r["Task Type"] !== "Supplemental")
        .map((r) => r["Task"])
        .slice(0, top),
      skills: skillsR.items,
      techSkills: [
        ...new Set(
          (tech || [])
            .filter((r) => r["O*NET-SOC Code"] === soc)
            .map((r) => r["Commodity Title"])
        ),
      ].slice(0, top * 2),
      workActivities: activitiesR.items,
      knowledge: knowledgeR.items,
      ratedSources: {
        skills: skillsR.ratedSource,
        workActivities: activitiesR.ratedSource,
        knowledge: knowledgeR.ratedSource,
      },
    };
  }
  return occupations;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt = "") => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const dir = opt("--db");
  const socs = opt("--soc").split(",").map((s) => s.trim()).filter(Boolean);
  if (!dir || socs.length === 0) {
    console.error("usage: onet-extract.mjs --db <onet-text-dir> --soc <code>[,<code>…] [--top N]");
    process.exit(2);
  }
  const occupations = extractOccupations(dir, socs, Number(opt("--top", "12")));
  process.stdout.write(JSON.stringify({ onetDir: dir, occupations }, null, 2));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
