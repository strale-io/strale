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
 * Dry-run and --apply both run the exact same read + match logic; --apply
 * additionally opens one transaction wrapping every write for this run
 * (all rows across both tables), so the repair is all-or-nothing.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { readFileSync, readdirSync } from "node:fs";
import * as yaml from "js-yaml";
import postgres from "postgres";

const MANIFEST_DIR = resolve(import.meta.dirname, "../../../manifests");
const APPLY = process.argv.includes("--apply");

const COERCED_MISSING_TITLE_VALUES = new Set(["undefined", "null", "NaN"]);

function looksLikeMissingTitle(title: unknown): boolean {
  if (title === null || title === undefined) return true;
  if (typeof title !== "string") return false;
  const trimmed = title.trim();
  return trimmed === "" || COERCED_MISSING_TITLE_VALUES.has(trimmed);
}

interface ManifestLimitation {
  title?: string | null;
  text: string;
  [k: string]: unknown;
}

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

/** Find the manifest limitation matching `text` for `slug`. Returns
 *  undefined if no manifest, no limitations array, or no text match. */
function findManifestMatch(
  manifestLims: Map<string, ManifestLimitation[]>,
  slug: string,
  text: string,
): { match: ManifestLimitation | undefined; ambiguous: boolean } {
  const lims = manifestLims.get(slug);
  if (!lims) return { match: undefined, ambiguous: false };
  const norm = (s: string) => s.trim();
  const matches = lims.filter((l) => norm(l.text ?? "") === norm(text));
  return { match: matches[0], ambiguous: matches.length > 1 };
}

interface RepairAction {
  table: "capability_limitations" | "onboarding_manifest";
  slug: string;
  rowId?: string; // capability_limitations.id, when table is that
  limitationIndex?: number; // index within onboarding_manifest.limitations, when table is that
  text: string;
  oldTitle: string | null;
  newTitle: string;
}

interface UnrepairableEntry {
  table: "capability_limitations" | "onboarding_manifest";
  slug: string;
  text: string;
  reason: string;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}\n`);

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
  const manifestLims = loadManifestLimitations();
  console.log(`Loaded ${manifestLims.size} manifest files from ${MANIFEST_DIR}\n`);

  const actions: RepairAction[] = [];
  const unrepairable: UnrepairableEntry[] = [];

  try {
    // ── 1. capability_limitations (relational, customer-facing) ──────────
    const relRows = await sql<
      Array<{ id: string; capability_slug: string; title: string | null; limitation_text: string }>
    >`
      SELECT id, capability_slug, title, limitation_text
      FROM capability_limitations
      WHERE title = 'undefined'
    `;

    for (const row of relRows) {
      const { match, ambiguous } = findManifestMatch(manifestLims, row.capability_slug, row.limitation_text);
      if (ambiguous) {
        console.warn(
          `  [warn] ${row.capability_slug}: multiple manifest limitations share the same text — using the first match`,
        );
      }
      if (!match) {
        unrepairable.push({
          table: "capability_limitations",
          slug: row.capability_slug,
          text: row.limitation_text,
          reason: "no matching manifest limitation found (by slug + text)",
        });
        continue;
      }
      if (looksLikeMissingTitle(match.title)) {
        unrepairable.push({
          table: "capability_limitations",
          slug: row.capability_slug,
          text: row.limitation_text,
          reason: `manifest source also lacks a title (manifest title=${JSON.stringify(match.title ?? null)})`,
        });
        continue;
      }
      actions.push({
        table: "capability_limitations",
        slug: row.capability_slug,
        rowId: row.id,
        text: row.limitation_text,
        oldTitle: row.title,
        newTitle: match.title!,
      });
    }

    // ── 2. capabilities.onboarding_manifest -> 'limitations' (JSONB snapshot) ──
    const jsonbCaps = await sql<Array<{ slug: string; limitations: unknown }>>`
      SELECT slug, onboarding_manifest->'limitations' AS limitations
      FROM capabilities
      WHERE jsonb_typeof(onboarding_manifest->'limitations') = 'array'
    `;

    // Per-capability full array + which indices need repair, so the UPDATE
    // can jsonb_set the whole array back in one shot per capability.
    const jsonbRepairsByCap = new Map<
      string,
      { fullArray: Array<Record<string, unknown>>; touchedIndices: number[] }
    >();

    for (const cap of jsonbCaps) {
      const arr = cap.limitations as Array<Record<string, unknown>>;
      let touched: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        const entry = arr[i];
        if (entry?.title !== "undefined") continue;
        const text = String(entry.text ?? "");
        const { match, ambiguous } = findManifestMatch(manifestLims, cap.slug, text);
        if (ambiguous) {
          console.warn(
            `  [warn] ${cap.slug} (onboarding_manifest): multiple manifest limitations share the same text — using the first match`,
          );
        }
        if (!match) {
          unrepairable.push({
            table: "onboarding_manifest",
            slug: cap.slug,
            text,
            reason: "no matching manifest limitation found (by slug + text)",
          });
          continue;
        }
        if (looksLikeMissingTitle(match.title)) {
          unrepairable.push({
            table: "onboarding_manifest",
            slug: cap.slug,
            text,
            reason: `manifest source also lacks a title (manifest title=${JSON.stringify(match.title ?? null)})`,
          });
          continue;
        }
        actions.push({
          table: "onboarding_manifest",
          slug: cap.slug,
          limitationIndex: i,
          text,
          oldTitle: entry.title as string,
          newTitle: match.title!,
        });
        arr[i] = { ...entry, title: match.title! };
        touched.push(i);
      }
      if (touched.length > 0) {
        jsonbRepairsByCap.set(cap.slug, { fullArray: arr, touchedIndices: touched });
      }
    }

    // ── Report ─────────────────────────────────────────────────────────
    console.log("═".repeat(70));
    console.log("SUMMARY");
    console.log("═".repeat(70));
    console.log(`capability_limitations rows with title='undefined': ${relRows.length}`);
    console.log(`onboarding_manifest limitation entries with title='undefined': ${
      jsonbCaps.reduce(
        (n, cap) => n + (cap.limitations as Array<Record<string, unknown>>).filter((e) => e?.title === "undefined").length,
        0,
      )
    }`);
    console.log(`\nRepairable (manifest source has a real title): ${actions.length}`);
    console.log(`Unrepairable (reported separately, not touched): ${unrepairable.length}`);

    if (actions.length > 0) {
      console.log("\nPer-capability repair counts:");
      const byCap = new Map<string, number>();
      for (const a of actions) byCap.set(a.slug, (byCap.get(a.slug) ?? 0) + 1);
      for (const [slug, count] of [...byCap.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${slug}: ${count}`);
      }
      console.log("\nRepair detail:");
      for (const a of actions) {
        console.log(
          `  [${a.table}] ${a.slug}: "${a.oldTitle}" -> "${a.newTitle}" (text: "${a.text.slice(0, 60)}${a.text.length > 60 ? "…" : ""}")`,
        );
      }
    }

    if (unrepairable.length > 0) {
      console.log("\nUnrepairable entries (needs a human-authored title, not auto-fixable):");
      for (const u of unrepairable) {
        console.log(`  [${u.table}] ${u.slug}: "${u.text.slice(0, 60)}${u.text.length > 60 ? "…" : ""}" — ${u.reason}`);
      }
    }

    if (!APPLY) {
      console.log("\n[DRY RUN] No changes written. Re-run with --apply to write.");
      return;
    }

    if (actions.length === 0) {
      console.log("\nNothing to apply.");
      return;
    }

    // ── Apply (transactional — the whole run is one transaction) ────────
    await sql.begin(async (tx) => {
      // postgres-js types `TransactionSql` via `Omit<Sql<T>, ...>`, which
      // (like all Omit<> on a callable interface) drops the tagged-template
      // call signature — a known upstream typing limitation, not a real
      // runtime issue. Cast to the callable base type once per transaction
      // (same pattern as scripts/sync-known-answer-fixtures.ts).
      const t = tx as unknown as typeof sql;
      const relActions = actions.filter((a) => a.table === "capability_limitations");
      for (const a of relActions) {
        await t`
          UPDATE capability_limitations
          SET title = ${a.newTitle}, updated_at = now()
          WHERE id = ${a.rowId!}
        `;
      }

      for (const [slug, { fullArray }] of jsonbRepairsByCap) {
        await t`
          UPDATE capabilities
          SET onboarding_manifest = jsonb_set(
            onboarding_manifest,
            '{limitations}',
            ${JSON.stringify(fullArray)}::jsonb,
            false
          ),
          updated_at = now()
          WHERE slug = ${slug}
        `;
      }
    });

    console.log(`\n[APPLIED] ${actions.length} title(s) repaired across ${
      new Set(actions.map((a) => a.slug)).size
    } capabilities. Transaction committed.`);
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
