/**
 * Repair script for the "undefined"-titled-limitation finding
 * (2026-08-17 Phase-2 session).
 *
 * Scans both places a limitation's `title` is persisted for the literal
 * string "undefined" (the JS-coercion artifact `sanitizeLimitationTitle`
 * in capability-persistence.ts now guards against on write):
 *
 *   1. `capability_limitations.title` — the relational table served by
 *      GET /v1/public/ops/limitations/capabilities/:slug (public,
 *      customer-facing, no auth).
 *   2. `capabilities.onboarding_manifest -> 'limitations' -> [].title` —
 *      the raw manifest snapshot read internally by self-heal.ts,
 *      capability-onboarding.ts, and internal-tests.ts.
 *
 * For each affected row, restores the title from the corresponding
 * manifests/{slug}.yaml entry, matched by (slug, limitation text). A
 * manifest entry is matched to a DB row by exact trimmed text match; if
 * more than one manifest entry has the same text (should not happen —
 * text is the diff-hash's other content field — but defensively handled),
 * the first match wins and a warning is printed.
 *
 * Entries whose manifest source is ALSO missing a title (null, absent,
 * empty, or itself "undefined") are never touched — they're reported
 * separately under "cannot repair: manifest source also lacks a title"
 * so a human can author the missing title instead of the script guessing.
 * Same for DB rows with no matching manifest slug/text at all.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx scripts/repair-limitation-titles.ts              # dry-run (default)
 *   npx tsx scripts/repair-limitation-titles.ts --apply       # write for real
 *
 * ── Concurrency (Codex review, 2026-08-18 — HIGH) ──────────────────────
 * --apply runs the ENTIRE scan-match-write cycle inside one
 * `sql.begin` transaction, using CAS-guarded writes, instead of scanning
 * outside the transaction and writing stale snapshots back in:
 *   - relational: `UPDATE ... WHERE id = X AND title = 'undefined'`, i.e.
 *     the write only applies if the row still has the exact bad value
 *     this run scanned. 0 rows affected -> raced-and-skipped, reported.
 *   - JSONB: `UPDATE ... WHERE slug = X AND onboarding_manifest->'limitations'
 *     = <the exact array this run just read>::jsonb`. This is a full-value
 *     compare-and-set on the sub-document being replaced — it guards not
 *     just against the entries we're fixing changing, but against the
 *     whole-array `jsonb_set` write silently clobbering an unrelated
 *     concurrent edit to the same array (the lost-update problem a naive
 *     "did our specific entries change" check would miss). 0 rows
 *     affected -> raced-and-skipped, reported, nothing written.
 * Dry-run has no CAS concerns (it never writes) and reads once, outside
 * any transaction, purely for the preview report.
 *
 * The matching/repair logic itself (planRelationalRepairs,
 * repairJsonbLimitationsArray) lives in ../src/lib/limitation-repair.ts,
 * pure and unit-tested — apps/api/scripts is outside vitest's include
 * glob, so logic that needs test coverage belongs in src/lib, not here.
 */

import { openOperatorWriteDb } from "../src/lib/operator-db.js";
import { autonomousAuthority } from "../src/lib/production-authority.js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { readFileSync, readdirSync } from "node:fs";
import * as yaml from "js-yaml";
import {
  planRelationalRepairs,
  repairJsonbLimitationsArray,
  type ManifestLimitation,
  type RelationalAction,
  type RelationalRow,
  type UnrepairableEntry,
} from "../src/lib/limitation-repair.js";

const MANIFEST_DIR = resolve(import.meta.dirname, "../../../manifests");
const APPLY = process.argv.includes("--apply");

/** slug -> limitations parsed from manifests/{slug}.yaml */
function loadManifestLimitations(): Map<string, ManifestLimitation[]> {
  const map = new Map<string, ManifestLimitation[]>();
  const files = readdirSync(MANIFEST_DIR).filter((f) => f.endsWith(".yaml"));
  for (const f of files) {
    const slug = f.replace(/\.yaml$/, "");
    try {
      const parsed = yaml.load(readFileSync(resolve(MANIFEST_DIR, f), "utf8")) as {
        limitations?: ManifestLimitation[];
      } | null;
      map.set(slug, Array.isArray(parsed?.limitations) ? parsed!.limitations! : []);
    } catch (err) {
      console.warn(`  [warn] failed to parse ${f}: ${(err as Error).message}`);
      map.set(slug, []);
    }
  }
  return map;
}

interface JsonbCapRow {
  slug: string;
  limitations: unknown;
}

interface Report {
  relScanned: number;
  relApplied: RelationalAction[];
  relRaced: RelationalAction[];
  relUnrepairable: UnrepairableEntry[];
  jsonbAffected: number;
  jsonbApplied: Array<{ slug: string; text: string; oldTitle: string; newTitle: string }>;
  jsonbRaced: Array<{ slug: string; reason: string; skippedCount: number }>;
  jsonbUnrepairable: Array<{ slug: string; text: string; reason: string }>;
}

function printReport(mode: "DRY RUN" | "APPLY", r: Report) {
  console.log("═".repeat(70));
  console.log("SUMMARY");
  console.log("═".repeat(70));
  console.log(`capability_limitations rows with title='undefined': ${r.relScanned}`);
  console.log(`onboarding_manifest limitation entries with title='undefined': ${r.jsonbAffected}`);

  const totalApplied = r.relApplied.length + r.jsonbApplied.length;
  const totalUnrepairable = r.relUnrepairable.length + r.jsonbUnrepairable.length;
  const totalRaced = r.relRaced.length + r.jsonbRaced.reduce((a, x) => a + x.skippedCount, 0);

  console.log(`\n${mode === "APPLY" ? "Repaired" : "Repairable (manifest source has a real title)"}: ${totalApplied}`);
  console.log(`Unrepairable (reported separately, not touched): ${totalUnrepairable}`);
  if (mode === "APPLY") {
    console.log(`Raced-and-skipped (changed since this run's scan — not touched, safe to re-run): ${totalRaced}`);
  }

  if (r.relApplied.length > 0 || r.jsonbApplied.length > 0) {
    console.log(`\nPer-capability ${mode === "APPLY" ? "repair" : "planned-repair"} counts:`);
    const byCap = new Map<string, number>();
    for (const a of r.relApplied) byCap.set(a.slug, (byCap.get(a.slug) ?? 0) + 1);
    for (const a of r.jsonbApplied) byCap.set(a.slug, (byCap.get(a.slug) ?? 0) + 1);
    for (const [slug, count] of [...byCap.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${slug}: ${count}`);
    }
    console.log("\nRepair detail:");
    for (const a of r.relApplied) {
      console.log(`  [capability_limitations] ${a.slug}: "${a.oldTitle}" -> "${a.newTitle}" (text: "${a.text.slice(0, 60)}${a.text.length > 60 ? "…" : ""}")`);
    }
    for (const a of r.jsonbApplied) {
      console.log(`  [onboarding_manifest] ${a.slug}: "${a.oldTitle}" -> "${a.newTitle}" (text: "${a.text.slice(0, 60)}${a.text.length > 60 ? "…" : ""}")`);
    }
  }

  if (totalRaced > 0) {
    console.log("\nRaced-and-skipped (re-run the script to retry these):");
    for (const a of r.relRaced) {
      console.log(`  [capability_limitations] ${a.slug}: row id=${a.rowId} no longer had title='undefined' when the write ran`);
    }
    for (const a of r.jsonbRaced) {
      console.log(`  [onboarding_manifest] ${a.slug}: ${a.reason}`);
    }
  }

  if (totalUnrepairable > 0) {
    console.log("\nUnrepairable entries (needs a human-authored title, not auto-fixable):");
    for (const u of r.relUnrepairable) {
      console.log(`  [capability_limitations] ${u.slug}: "${u.text.slice(0, 60)}${u.text.length > 60 ? "…" : ""}" — ${u.reason}`);
    }
    for (const u of r.jsonbUnrepairable) {
      console.log(`  [onboarding_manifest] ${u.slug}: "${u.text.slice(0, 60)}${u.text.length > 60 ? "…" : ""}" — ${u.reason}`);
    }
  }
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}\n`);

  const sql = openOperatorWriteDb(autonomousAuthority("catalogue_metadata_sync", "DEC-20260812-A"));
  const manifestLims = loadManifestLimitations();
  console.log(`Loaded ${manifestLims.size} manifest files from ${MANIFEST_DIR}\n`);
  const warn = (msg: string) => console.warn(`  [warn] ${msg}`);

  try {
    if (!APPLY) {
      // ── Dry run: single read-only pass, no transaction needed — nothing
      // is written, so there's no TOCTOU window to close. ──────────────
      const relRows = await sql<RelationalRow[]>`
        SELECT id, capability_slug, title, limitation_text
        FROM capability_limitations
        WHERE title = 'undefined'
      `;
      const { actions: relActions, unrepairable: relUnrepairable } = planRelationalRepairs(relRows, manifestLims, warn);

      const jsonbCaps = await sql<JsonbCapRow[]>`
        SELECT slug, onboarding_manifest->'limitations' AS limitations
        FROM capabilities
        WHERE jsonb_typeof(onboarding_manifest->'limitations') = 'array'
      `;

      let jsonbAffected = 0;
      const jsonbApplied: Report["jsonbApplied"] = [];
      const jsonbUnrepairable: Report["jsonbUnrepairable"] = [];
      for (const cap of jsonbCaps) {
        const arr = cap.limitations as Array<Record<string, unknown>>;
        const result = repairJsonbLimitationsArray(arr, cap.slug, manifestLims, warn);
        jsonbAffected += result.affectedCount;
        for (const rep of result.repaired) jsonbApplied.push({ slug: cap.slug, text: rep.text, oldTitle: rep.oldTitle, newTitle: rep.newTitle });
        for (const u of result.unrepairable) jsonbUnrepairable.push({ slug: cap.slug, text: u.text, reason: u.reason });
      }

      printReport("DRY RUN", {
        relScanned: relRows.length,
        relApplied: relActions,
        relRaced: [],
        relUnrepairable,
        jsonbAffected,
        jsonbApplied,
        jsonbRaced: [],
        jsonbUnrepairable,
      });
      console.log("\n[DRY RUN] No changes written. Re-run with --apply to write.");
      return;
    }

    // ── Apply: scan + match + write, all inside one transaction, CAS-guarded. ──
    const report: Report = {
      relScanned: 0,
      relApplied: [],
      relRaced: [],
      relUnrepairable: [],
      jsonbAffected: 0,
      jsonbApplied: [],
      jsonbRaced: [],
      jsonbUnrepairable: [],
    };

    await sql.begin(async (tx) => {
      // postgres-js types `TransactionSql` via `Omit<Sql<T>, ...>`, which
      // (like all Omit<> on a callable interface) drops the tagged-template
      // call signature — a known upstream typing limitation, not a real
      // runtime issue. Cast to the callable base type once per transaction
      // (same pattern as scripts/sync-known-answer-fixtures.ts).
      const t = tx as unknown as typeof sql;

      // 1. Relational — scan INSIDE the transaction.
      const relRows = await t<RelationalRow[]>`
        SELECT id, capability_slug, title, limitation_text
        FROM capability_limitations
        WHERE title = 'undefined'
      `;
      report.relScanned = relRows.length;
      const { actions: relActions, unrepairable: relUnrepairable } = planRelationalRepairs(relRows, manifestLims, warn);
      report.relUnrepairable = relUnrepairable;

      for (const a of relActions) {
        // Compare-and-set: only writes if the row still has the exact
        // value we scanned. A concurrent writer that changed this row
        // between our SELECT and this UPDATE makes the WHERE clause miss
        // (0 rows), which we treat as raced-and-skipped rather than
        // clobbering whatever it wrote.
        const written = await t<Array<{ id: string }>>`
          UPDATE capability_limitations
          SET title = ${a.newTitle}, updated_at = now()
          WHERE id = ${a.rowId} AND title = 'undefined'
          RETURNING id
        `;
        if (written.length > 0) report.relApplied.push(a);
        else report.relRaced.push(a);
      }

      // 2. JSONB — scan INSIDE the transaction.
      const jsonbCaps = await t<JsonbCapRow[]>`
        SELECT slug, onboarding_manifest->'limitations' AS limitations
        FROM capabilities
        WHERE jsonb_typeof(onboarding_manifest->'limitations') = 'array'
      `;

      for (const cap of jsonbCaps) {
        const arr = cap.limitations as Array<Record<string, unknown>>;
        const result = repairJsonbLimitationsArray(arr, cap.slug, manifestLims, warn);
        report.jsonbAffected += result.affectedCount;
        for (const u of result.unrepairable) {
          report.jsonbUnrepairable.push({ slug: cap.slug, text: u.text, reason: u.reason });
        }
        if (result.repaired.length === 0) continue; // nothing to write for this capability

        // Full-value compare-and-set on the exact sub-document we read:
        // guards against BOTH our own planned entries changing AND an
        // unrelated concurrent edit to a different entry in the same
        // array being silently clobbered by this whole-array jsonb_set
        // (the lost-update case a narrower "did our entries change"
        // check would miss).
        const written = await t<Array<{ slug: string }>>`
          UPDATE capabilities
          SET onboarding_manifest = jsonb_set(
            onboarding_manifest,
            '{limitations}',
            ${JSON.stringify(result.newArray)}::jsonb,
            false
          ),
          updated_at = now()
          WHERE slug = ${cap.slug}
            AND onboarding_manifest->'limitations' = ${JSON.stringify(arr)}::jsonb
          RETURNING slug
        `;
        if (written.length > 0) {
          for (const rep of result.repaired) {
            report.jsonbApplied.push({ slug: cap.slug, text: rep.text, oldTitle: rep.oldTitle, newTitle: rep.newTitle });
          }
        } else {
          report.jsonbRaced.push({
            slug: cap.slug,
            skippedCount: result.repaired.length,
            reason: `onboarding_manifest.limitations changed since this run scanned it — ${result.repaired.length} planned repair(s) skipped to avoid clobbering a concurrent write`,
          });
        }
      }
    });

    printReport("APPLY", report);

    const totalApplied = report.relApplied.length + report.jsonbApplied.length;
    const totalRaced = report.relRaced.length + report.jsonbRaced.reduce((a, x) => a + x.skippedCount, 0);
    if (totalApplied === 0) {
      console.log("\nNothing applied.");
    } else {
      console.log(`\n[APPLIED] ${totalApplied} title(s) repaired. Transaction committed.`);
    }
    if (totalRaced > 0) {
      console.log(`[RACED] ${totalRaced} planned repair(s) skipped because the data changed since this run scanned it. Re-run the script to retry.`);
    }
  } finally {
    await sql.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
  });
