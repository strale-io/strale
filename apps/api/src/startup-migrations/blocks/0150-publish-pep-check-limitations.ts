import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0150 — publish pep-check's current limitations (DQ-47, 2026-11-07).
 *
 * Production's pep-check limitations were written before the switch to
 * Dilisense (2026-04-27, commit 16ca790) and never replaced, because the boot
 * sync refuses compliance rows (`isReportOnly`, manifest-publication-policy.ts).
 * Read from the public /v1/public/ops/limitations/capabilities/pep-check route
 * on 2026-11-07, two of the five say what is not true: that coverage depends on
 * OpenSanctions, and that an "LLM fallback" exists. Approval: Petter, in session
 * 2026-11-07 ("approve DQ-47"), answering DQ-47 in docs/company/DECISION-QUEUE.md:
 * replace the five rows with the three of manifests/pep-check.yaml, word for
 * word.
 *
 * Narrower than block 0143's diff: it deletes only the five rows it has seen,
 * matched by their exact production text (the freshness row in either its
 * original or its block-0149 wording, since 0149 runs first), so a row added
 * later by anyone else is never touched. It then inserts the manifest's three
 * rows, in manifest order, where they are not already present, in the same
 * statement so the two commit together. Both parts are skipped when the
 * pep-check capability row does not exist (a fresh database is seeded from
 * the manifest). Run policy "once"; the statement is also idempotent on its
 * own. Rows touched: at most eight, of one capability; no bulk operation
 * (DEC-20260504-B). Only strings and integers are bound (DEC-20260504-A).
 */
export const PEP_CHECK_SLUG = "pep-check";

/** The five active rows read from production on 2026-11-07 (limitation_text). */
export const DQ47_OLD_PEP_LIMITATION_TEXTS: readonly string[] = [
  "Coverage depends on OpenSanctions dataset — may not include all national PEP lists",
  "Name matching is fuzzy — common names may produce false positives. Birth date strongly recommended for disambiguation.",
  "PEP coverage varies by country — major economies and EU members have strong coverage, smaller nations may have gaps",
  "Name matching uses fuzzy logic — common names may produce false positives. Birth date strongly recommended for disambiguation",
  // The freshness row, before and after block 0149 (DQ-46):
  "PEP lists updated multiple times per day — recently appointed officials may take up to 48 hours to appear",
  "Dilisense updates its PEP data once a day by default, and more often for highly important PEPs. Recently appointed officials may take up to 48 hours to appear.",
];

export interface PepLimitation {
  title: string;
  limitationText: string;
  category: string;
  severity: string;
  workaround: string | null;
}

/** manifests/pep-check.yaml, in order; the index is the sort_order. */
export const DQ47_PEP_LIMITATIONS: readonly PepLimitation[] = [
  {
    title: "National coverage is not verified for each call",
    limitationText:
      "Dilisense reports coverage of parliament, government, central-bank, judiciary and state-owned-enterprise board sources across over 230 territories, with per-country sources at `source_catalog_url`. This coverage is not independently confirmed on each call; check national sources for jurisdiction-critical screening.",
    category: "coverage",
    severity: "info",
    workaround: "For high-stakes screening, cross-reference with the national parliament or central-bank website.",
  },
  {
    title: "Common names can produce false matches",
    limitationText: "Common names may produce false-positive matches. Provide date_of_birth for disambiguation.",
    category: "accuracy",
    severity: "warning",
    workaround: "Provide date_of_birth and an ISO country code.",
  },
  {
    title: "Per-list update timestamps are not available",
    limitationText:
      "Dilisense updates its PEP data once a day by default, and more often for highly important PEPs, but the screening API does not return a per-list last_updated_at value per call. Output sets lists_queried.last_updated_at = null with a freshness_note attesting to the publisher's refresh cadence.",
    category: "freshness",
    severity: "info",
    workaround: null,
  },
];

export async function runMigration0150_publishPepCheckLimitations(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const oldTexts = sql.join(
    DQ47_OLD_PEP_LIMITATION_TEXTS.map((t) => sql`${t}`),
    sql`, `,
  );
  const wanted = sql.join(
    DQ47_PEP_LIMITATIONS.map(
      (l, i) => sql`(${i}::int, ${l.title}, ${l.limitationText}, ${l.category}, ${l.severity}, ${l.workaround}::text)`,
    ),
    sql`, `,
  );
  // One statement, so the delete and the insert commit together: a failed
  // insert can never leave pep-check with no published limitations. The
  // NOT EXISTS reads the table as it was before this statement, which is
  // right here, since no row to keep is among the rows deleted.
  const rows = (await tx.execute(sql`
    WITH deleted AS (
      DELETE FROM capability_limitations
       WHERE capability_slug = ${PEP_CHECK_SLUG}
         AND active = true
         AND limitation_text IN (${oldTexts})
         AND EXISTS (SELECT 1 FROM capabilities c WHERE c.slug = ${PEP_CHECK_SLUG})
      RETURNING 1
    ), inserted AS (
      INSERT INTO capability_limitations
        (capability_slug, title, limitation_text, category, severity, workaround, sort_order)
      SELECT ${PEP_CHECK_SLUG}, w.title, w.limitation_text, w.category, w.severity, w.workaround, w.sort_order
        FROM (VALUES ${wanted}) AS w(sort_order, title, limitation_text, category, severity, workaround)
       WHERE EXISTS (SELECT 1 FROM capabilities c WHERE c.slug = ${PEP_CHECK_SLUG})
         AND NOT EXISTS (
           SELECT 1 FROM capability_limitations cl
            WHERE cl.capability_slug = ${PEP_CHECK_SLUG}
              AND cl.active = true
              AND cl.limitation_text = w.limitation_text
         )
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM deleted)::int AS deleted, (SELECT count(*) FROM inserted)::int AS inserted
  `)) as unknown as Array<{ deleted: number; inserted: number }>;
  const deleted = Number(rows[0]?.deleted ?? 0);
  const inserted = Number(rows[0]?.inserted ?? 0);

  const total = deleted + inserted;
  return {
    block: "0150_publishPepCheckLimitations",
    outcome:
      total === 0
        ? "no change (pep-check limitations already published)"
        : `pep-check limitations published (-${deleted}/+${inserted})`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}
