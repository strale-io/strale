/**
 * Phase A0b boot invariant: surface unclassified capabilities at startup.
 *
 * Two modes, controlled by env var `COST_CLASS_MODE`:
 *
 *   - **GRACE** (default): boot succeeds, log a warning + one
 *     `skip-unclassified` line per active+visible cap with cost_class IS NULL.
 *     The scheduler and dispatcher already fail-closed for these caps;
 *     this mode just makes the count loud at every boot so the backfill
 *     window doesn't drift unnoticed.
 *   - **STRICT**: boot aborts (process.exit 1) if any active+visible cap
 *     lacks cost_class. Flipped after one clean operational cycle.
 *
 * Modeled on `assertAlertingConfigured` (lib/alerting.ts) — same fail-loud
 * boot-time shape.
 *
 * Per Phase A0b §7 and Rule 14 (deploy mechanism verified): index.ts:80
 * calls this after `validateSchema()` and before `app.ts` imports, so the
 * invariant runs on every Railway boot via Dockerfile CMD → main() entry.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log, logError } from "./log.js";

export type CostClassMode = "STRICT" | "GRACE";

export function resolveCostClassMode(envValue: string | undefined): CostClassMode {
  const normalized = (envValue ?? "").trim().toUpperCase();
  if (normalized === "STRICT") return "STRICT";
  return "GRACE"; // default + any unrecognized value
}

interface UnclassifiedRow {
  slug: string;
  name: string;
}

export async function assertCostClassTaxonomy(opts: { mode: CostClassMode }): Promise<void> {
  const { mode } = opts;
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT slug, name FROM capabilities
    WHERE is_active = true AND visible = true AND cost_class IS NULL
    ORDER BY slug
  `);
  const resultRows = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
  const unclassified = resultRows as UnclassifiedRow[];

  if (unclassified.length === 0) {
    log.info(
      { label: "cost-class-invariant-pass", mode, unclassified_count: 0 },
      `[startup] cost-class ${mode} mode: all active+visible capabilities classified.`,
    );
    return;
  }

  if (mode === "STRICT") {
    logError(
      "cost-class-invariant-strict-fail",
      new Error(
        `[FATAL] cost-class STRICT mode: ${unclassified.length} active+visible capabilities lack cost_class. ` +
          `Classify each by adding cost_class to its manifests/<slug>.yaml ` +
          `(see CLAUDE.md cost-class taxonomy), then run drizzle-kit migrate or restart.`,
      ),
      {
        mode: "STRICT",
        unclassified_count: unclassified.length,
        unclassified: unclassified.map((r) => ({ slug: r.slug, name: r.name })),
      },
    );
    process.exit(1);
  }

  // GRACE
  log.warn(
    {
      label: "cost-class-invariant-grace",
      mode: "GRACE",
      unclassified_count: unclassified.length,
    },
    `[startup] cost-class GRACE mode: ${unclassified.length} capabilities unclassified, will be skipped by scheduler and refused at dispatcher.`,
  );
  for (const r of unclassified) {
    log.warn(
      {
        label: "skip-unclassified",
        slug: r.slug,
        name: r.name,
      },
      `[startup] skip-unclassified: ${r.slug}`,
    );
  }
}
