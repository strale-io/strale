#!/usr/bin/env node
/**
 * F-0-006 CI guard: refuse PRs that reintroduce unguarded network fetches
 * in capability files.
 *
 * A capability file is "guarded" if it imports at least one of:
 *   - safeFetch / validateUrl / validateHost   (direct protection)
 *   - fetchRenderedHtml / fetchPage / fetchCompanyPage / fetchViaJina
 *     (shared helpers that validate internally)
 *
 * A capability file is "eligible" if it accepts user URL-like input
 * (input.url | input.link | input.domain | input.hostname | input.website).
 *
 * A capability file is "acknowledged-safe" if it contains a comment
 * mentioning "F-0-006 Bucket" — the on-disk record that it was reviewed
 * and decided to require no validation. Every file that passes the
 * inventory grep below must be either guarded or acknowledged-safe.
 *
 * Usage:  node apps/api/scripts/check-ssrf-inventory.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CAPS = "apps/api/src/capabilities";
const INPUT_RE = /input\.(?:url|link|domain|hostname|website)\b/;
const GUARD_RE = /\b(?:safeFetch|validateUrl|validateHost|fetchRenderedHtml|fetchPage|fetchCompanyPage|fetchViaJina)\b/;
const ACK_RE = /F-0-006 Bucket/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    try {
      const st = readdirSync(full);
      out.push(...walk(full));
      void st;
    } catch {
      if (full.endsWith(".ts") && !full.endsWith(".d.ts") && !full.endsWith(".test.ts")) {
        out.push(full);
      }
    }
  }
  return out;
}

const files = walk(CAPS);
const unguarded = [];

for (const file of files) {
  const text = readFileSync(file, "utf-8");
  if (!INPUT_RE.test(text)) continue;     // not URL-accepting
  if (GUARD_RE.test(text)) continue;      // actively protected
  if (ACK_RE.test(text)) continue;        // reviewed as safe-by-construction
  unguarded.push(file.replace(/\\/g, "/"));
}

if (unguarded.length === 0) {
  console.log(
    `F-0-006 guard: every URL-accepting capability is either protected or has an acknowledging comment.`,
  );
  process.exit(0);
}

console.error(
  "F-0-006: unguarded URL-accepting capability found. Every capability\n" +
    "that takes input.url/link/domain/hostname/website must EITHER import\n" +
    "safeFetch/validateUrl/validateHost (or use one of the shared helpers:\n" +
    "fetchRenderedHtml/fetchPage/fetchCompanyPage/fetchViaJina) OR contain\n" +
    "a `F-0-006 Bucket D` comment explaining why validation is not needed.\n" +
    "Offenders:",
);
for (const f of unguarded) console.error(`  ${f}`);
process.exit(1);
