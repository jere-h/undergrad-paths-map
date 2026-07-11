#!/usr/bin/env node
// register-catalog.mjs - add or update an entry in the app's catalog registry
// (data/catalogs/index.js), which drives the industry tabs. The registry file
// is regenerated wholesale from its parsed entries, so it stays valid JS.
//
// Usage:
//   node scripts/register-catalog.mjs --id tech --label "Tech (MIT)" \
//        --module ./tech.js --note "Evidence-grounded ..." [--registry data/catalogs/index.js]
//
// Same --id replaces the existing entry (idempotent re-runs); a new id
// appends. The "illustrative" entry is ordinary data and can be replaced or
// left as the default first tab.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const HEADER = `// Catalog registry - the datasets the app can display as tabs.
//
// Each entry: { id, label, module, note }
//   module - import specifier RELATIVE TO THIS FILE (main.js resolves it as
//            "./data/catalogs/" + module).
//   note   - the epistemic banner shown in the header while this catalog is
//            active. Keep it honest: say what the dataset's edges actually are.
//
// Entries are added by scripts/register-catalog.mjs (the ground-catalog
// workflow does this on gate-passing full runs with apply: true), or by hand.
// With a single entry the tab strip stays hidden and the app behaves exactly
// as before.
`;

export function renderRegistry(entries) {
  const body = entries
    .map((e) => {
      const lines = [
        `    id: ${JSON.stringify(e.id)},`,
        `    label: ${JSON.stringify(e.label)},`,
        `    module: ${JSON.stringify(e.module)},`,
        `    note: ${JSON.stringify(e.note || "")},`,
      ];
      // Optional first-paint selection (input ids) so a default tab opens on a
      // meaningful convergence instead of an empty map. Preserved across
      // re-registration so re-runs don't strip a hand-tuned preselect.
      if (Array.isArray(e.preselect) && e.preselect.length)
        lines.push(`    preselect: ${JSON.stringify(e.preselect)},`);
      return `  {\n${lines.join("\n")}\n  },`;
    })
    .join("\n");
  return `${HEADER}\nexport const CATALOGS = [\n${body}\n];\n`;
}

export function upsert(entries, entry) {
  const i = entries.findIndex((e) => e.id === entry.id);
  const next = [...entries];
  if (i >= 0) {
    // Re-registration must not strip a hand-tuned preselect: workflow re-runs
    // pass no --preselect, so a wholesale replace would silently clobber it.
    const keep =
      !Array.isArray(entry.preselect) && Array.isArray(next[i].preselect)
        ? { preselect: next[i].preselect }
        : {};
    next[i] = { ...entry, ...keep };
  } else next.push(entry);
  return next;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const registryPath = opt("--registry", "data/catalogs/index.js");
  const preselect = opt("--preselect", "");
  const entry = {
    id: opt("--id"),
    label: opt("--label"),
    module: opt("--module"),
    note: opt("--note", ""),
    ...(preselect ? { preselect: preselect.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
  };
  if (!entry.id || !entry.label || !entry.module) {
    console.error("usage: register-catalog.mjs --id ID --label LABEL --module ./file.js [--note TEXT]");
    process.exit(2);
  }
  // Cache-bust the import so repeated runs in one process see fresh contents.
  const { CATALOGS } = await import(
    `${pathToFileURL(resolve(registryPath)).href}?t=${readFileSync(registryPath, "utf8").length}`
  );
  const entries = upsert(CATALOGS, entry);
  writeFileSync(registryPath, renderRegistry(entries));
  console.log(`registered "${entry.id}" (${entries.length} catalog(s) in ${registryPath})`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
