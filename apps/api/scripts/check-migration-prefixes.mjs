#!/usr/bin/env node
// Guard: prevent duplicate XXXX_ prefixes among migration files (excluding the
// known historical 0046 collision documented in apps/api/drizzle/README.md).
// Runs in CI (npm run lint:migration-prefixes).
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const drizzleDir = resolve(__dirname, "../drizzle");

// Was ["0046"] until the 2026-04-30 rename of 0046_suggest_log.sql →
// 0099_suggest_log.sql resolved the historical collision. Empty now;
// keep the set so future intentional collisions can be allowlisted with
// a documented rationale rather than removing the guard wholesale.
const KNOWN_HISTORICAL = new Set([]);

const files = readdirSync(drizzleDir).filter((f) => /^\d{4}_.*\.sql$/.test(f));
const byPrefix = new Map();
for (const f of files) {
  const prefix = f.slice(0, 4);
  if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
  byPrefix.get(prefix).push(f);
}

const offenders = [];
for (const [prefix, group] of byPrefix) {
  if (group.length > 1 && !KNOWN_HISTORICAL.has(prefix)) {
    offenders.push({ prefix, files: group });
  }
}

if (offenders.length > 0) {
  console.error(
    "Duplicate migration prefixes found. Each new migration must have a unique 4-digit prefix.",
  );
  for (const o of offenders) {
    console.error(`  ${o.prefix}: ${o.files.join(", ")}`);
  }
  console.error("\nSee apps/api/drizzle/README.md for the historical 0046 exception.");
  process.exit(1);
}

console.log(`OK — ${files.length} migrations, no new prefix collisions.`);
