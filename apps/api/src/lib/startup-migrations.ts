/**
 * Startup migrations — blocking, idempotent DDL/DML applied at API boot.
 *
 * Replaces `apps/api/scripts/apply-migrations.ts` which was effectively dead
 * code. The script existed but the Dockerfile CMD never invoked it, and
 * apps/api/tsconfig.json's `rootDir: "./src"` excluded it from the build
 * entirely. As a result every block we shipped through that file (PR #29
 * actual_cost_cents, PR #42 marketplace_eligible, PR #49 paid-vendor
 * cost UPDATEs) silently never ran in production. The 2026-05-04 PR-#42
 * deploy outage made this visible: the API started referencing a column
 * that the migration was supposed to add, but the migration never ran,
 * so every public-surface request 500'd until the columns were applied
 * manually.
 *
 * Design rules (the user pinned these in the recovery directive):
 *
 * - **Blocking, not fire-and-forget.** A failed migration must abort
 *   API startup. ANALYZE-on-recovery is fire-and-forget because stale
 *   stats degrade performance gracefully; missing schema is a 500-fest.
 * - **Runs BEFORE `validateSchema()`** in `index.ts`. validateSchema
 *   asserts the DB matches what the code expects; the migrations make
 *   the assertion true on first boot after a column is added.
 * - **Runs BEFORE the API listens, BEFORE any scheduler / job boots.**
 *   No other code can race the migration.
 * - **Every block is idempotent.** `IF NOT EXISTS` for DDL,
 *   `WHERE <filter>` for DML. A re-run on a healthy DB is a no-op.
 * - **Per-block structured logging** so a Railway log-grep can
 *   distinguish "block X ran and changed N rows" from "block X
 *   skipped because the change was already present" from "block X
 *   threw and aborted boot."
 *
 * Adding a new block: write a `runMigrationXXXX_<name>` function that
 * uses `IF NOT EXISTS` / `WHERE` for idempotency, register it in
 * `BLOCKS`, ship a regression test that asserts both shape (the SQL
 * has the idempotency markers) and behaviour (a second invocation
 * with the same input is a no-op).
 */

import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log } from "./log.js";
import { BLOCK_0064_SLUGS, BLOCK_0065_SLUGS } from "./llm-capability-costs.js";
import { PHASE_B1_FREE_UNLIMITED_SLUGS } from "./phase-b1-free-unlimited-slugs.js";
import { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } from "./phase-b3-anthropic-paid-prepaid-slugs.js";
import {
  deriveQuotaCapFromRateLimit,
  type ManifestKnownRateLimit,
} from "./capability-manifest-types.js";

/**
 * Minimal executor surface — matches what `getDb().execute()` returns
 * but lets the regression tests inject a stub without touching prod.
 */
export interface MigrationExecutor {
  execute(query: SQL): Promise<unknown>;
}

export interface BlockResult {
  /** Stable label, also the log line's `label` field. */
  block: string;
  /** Human-readable description of what changed (or "skipped"). */
  outcome: string;
  /** Rows affected by the block's primary write, if applicable. */
  rows_affected?: number;
  duration_ms: number;
}

// Block 1 (runMigration0028_sqsDailySnapshot) retired with the SQS engine
// (DEC-20260503-B). The sqs_daily_snapshot table is dropped in PR2.

// ─── Block 2: actual_cost_cents on test_run_log ─────────────────────────────
//
// Adds the column conditionally — IF NOT EXISTS isn't quite enough here
// because the column has a `NOT NULL DEFAULT 0` constraint that we want
// to apply on first creation only. The information_schema check makes
// that explicit and matches the prior shape.

export async function runMigration0029_actualCostCents(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  // information_schema column counts return bigint; coerce via text to avoid postgres-js's bigint→string default.
  const check = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM information_schema.columns
    WHERE table_name = 'test_run_log' AND column_name = 'actual_cost_cents'
  `);
  const rows = Array.isArray(check) ? check : (check as { rows?: unknown[] })?.rows ?? [];
  const exists = (rows[0] as { cnt?: string })?.cnt !== "0";

  if (exists) {
    return {
      block: "0029_actual_cost_cents",
      outcome: "skipped (column already exists)",
      duration_ms: Date.now() - startedAt,
    };
  }

  await tx.execute(sql`
    ALTER TABLE "test_run_log" ADD COLUMN "actual_cost_cents" integer DEFAULT 0 NOT NULL
  `);

  return {
    block: "0029_actual_cost_cents",
    outcome: "added column",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0030: compliance infrastructure (transactions hash chain) ────────
//
// Adds three columns to the transactions table for the EU AI Act / DEC-
// 20260428-B audit-trail engine: hash-chained integrity, parent-link, and
// a legal-hold flag. Plus an index on the integrity_hash for chain-walk
// performance.
//
// information_schema check + skip pattern matches blocks 0028 / 0029.
// Cannot use a bare ADD COLUMN IF NOT EXISTS for `legal_hold` because the
// NOT NULL DEFAULT false would re-apply on a pre-existing column without
// the conditional — at best a no-op, at worst confusing in audit logs.

export async function runMigration0030_complianceColumns(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  // information_schema column counts return bigint; coerce via text to avoid postgres-js's bigint→string default.
  const check = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'integrity_hash'
  `);
  const rows = Array.isArray(check) ? check : (check as { rows?: unknown[] })?.rows ?? [];
  const exists = (rows[0] as { cnt?: string })?.cnt !== "0";

  if (exists) {
    return {
      block: "0030_compliance_columns",
      outcome: "skipped (columns already exist)",
      duration_ms: Date.now() - startedAt,
    };
  }

  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN "integrity_hash" varchar(128)`);
  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN "previous_hash" varchar(128)`);
  await tx.execute(sql`ALTER TABLE "transactions" ADD COLUMN "legal_hold" boolean DEFAULT false NOT NULL`);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS "transactions_integrity_hash_idx" ON "transactions" ("integrity_hash")`);

  return {
    block: "0030_compliance_columns",
    outcome: "added integrity_hash + previous_hash + legal_hold + index",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0031: test_results composite index ───────────────────────────────
//
// CREATE INDEX IF NOT EXISTS — idempotent at the SQL level. On re-run
// Postgres detects the existing index and is a no-op.

export async function runMigration0031_testResultsCompositeIdx(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "test_results_suite_executed_idx"
    ON "test_results" ("test_suite_id", "executed_at" DESC)
  `);
  return {
    block: "0031_test_results_suite_executed_idx",
    outcome: "ensured composite index on (test_suite_id, executed_at DESC)",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 3: marketplace_eligible columns ──────────────────────────────────
//
// Both ALTER TABLE statements use ADD COLUMN IF NOT EXISTS, so they're
// independently idempotent. The two columns added together as a
// "marketplace classification" pair (DEC-20260503-A): boolean flag +
// nullable reason text. A previous wrapper that checked only the first
// column would skip both adds when a partial prior run left only
// `marketplace_eligible` present, leaving `..._reason` missing.

export async function runMigration0060_marketplaceEligible(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    ALTER TABLE "capabilities"
      ADD COLUMN IF NOT EXISTS "marketplace_eligible" boolean DEFAULT true NOT NULL
  `);
  await tx.execute(sql`
    ALTER TABLE "capabilities"
      ADD COLUMN IF NOT EXISTS "marketplace_eligible_reason" text
  `);
  return {
    block: "0060_marketplace_eligible",
    outcome: "ensured marketplace_eligible + marketplace_eligible_reason columns",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 4: paid-vendor suite cost classification ─────────────────────────
//
// The two UPDATEs are idempotent because the WHERE clause filters on
// `external_cost_cents = 0` — once a row is set to 1 or 3, a re-run
// won't match it. See drizzle/0062_paid_vendor_suite_cost.sql for the
// full audit-followup rationale (DEC-20260504-A).

export async function runMigration0062_paidVendorCosts(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const dili = await tx.execute(sql`
    UPDATE test_suites
    SET external_cost_cents = 1, updated_at = NOW()
    WHERE capability_slug IN ('pep-check', 'sanctions-check', 'adverse-media-check', 'uk-cop-check')
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const diliCount = (dili as { count?: number }).count ?? 0;

  const rng = await tx.execute(sql`
    UPDATE test_suites
    SET external_cost_cents = 3, updated_at = NOW()
    WHERE capability_slug = 'risk-narrative-generate'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const rngCount = (rng as { count?: number }).count ?? 0;

  // Post-condition assertion: no paid-vendor live non-probe suite
  // should still be at external_cost_cents = 0 after this block runs.
  // If any are, a new suite was added since the last apply or a manual
  // edit cleared the value. Fail boot in that case so the operator
  // notices.
  // COUNT(*)::int → postgres-js coerces int4 to JS number; assertion fires correctly.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_zero
    FROM test_suites
    WHERE capability_slug IN (
            'pep-check', 'sanctions-check', 'adverse-media-check',
            'uk-cop-check', 'risk-narrative-generate'
          )
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const checkResultRows = Array.isArray(checkRows) ? checkRows : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const remainingZero = (checkResultRows[0] as { remaining_zero?: number })?.remaining_zero ?? 0;
  if (remainingZero > 0) {
    throw new Error(
      `0062_paid_vendor_costs post-condition failed: ${remainingZero} paid-vendor suites still at external_cost_cents = 0`,
    );
  }

  const total = diliCount + rngCount;
  return {
    block: "0062_paid_vendor_costs",
    outcome:
      total === 0
        ? "no rows to update (already classified)"
        : `Dilisense+eSortcode=${diliCount}, risk-narrative-generate=${rngCount}`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0063: invoice-extract paid-vendor cost reclassification ──────────
//
// Sibling of block 0062. Prod query 2026-05-04 found that all 4 active
// non-probe live test suites for `invoice-extract` had external_cost_cents
// = 0, which causes the DEC-20260503-B scheduler to schedule them hourly
// — paying Anthropic Haiku vision to extract invoice fields from the
// `httpbin.org/image/jpeg` placeholder fixture (a JPEG of a dog) on a
// cadence that was supposed to be excluded for paid vendors. The fixture
// itself is a separate hygiene to-do; this block stops the scheduled
// bleed by reclassifying the suites' cost above the scheduler's skip
// threshold.
//
// 1¢ floor matches the PR #49 / block 0062 defensible-minimum pattern
// for paid vendors where calibrated cost isn't yet available. Real
// per-call cost on a small JPEG via Haiku is below 1¢, but the floor's
// only operational job is to flip the scheduler-skip semantic; precise
// calibration is the existing P2 to-do on Anthropic-Haiku cost across
// all vision-using capabilities.
//
// Idempotent via `external_cost_cents = 0` in the WHERE clause — once a
// row is set to 1, a re-run won't match it. dependency_health and
// schema_check are NOT included: those use the auth-less-probe pattern
// (no paid call), legitimately stay at 0.

export async function runMigration0063_invoiceExtractCostReclassify(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const update = await tx.execute(sql`
    UPDATE test_suites
    SET external_cost_cents = 1, updated_at = NOW()
    WHERE capability_slug = 'invoice-extract'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: no active live non-probe suite for invoice-extract
  // may remain at 0 after this block. If a new suite shows up at 0,
  // fail boot so the operator notices.
  // COUNT(*)::int → postgres-js coerces int4 to JS number; assertion fires correctly.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_zero
    FROM test_suites
    WHERE capability_slug = 'invoice-extract'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const checkResultRows = Array.isArray(checkRows) ? checkRows : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const remainingZero = (checkResultRows[0] as { remaining_zero?: number })?.remaining_zero ?? 0;
  if (remainingZero > 0) {
    throw new Error(
      `0063_invoice_extract_cost_reclassify post-condition failed: ${remainingZero} invoice-extract suites still at external_cost_cents = 0`,
    );
  }

  return {
    block: "0063_invoice_extract_cost_reclassify",
    outcome:
      updateCount === 0
        ? "no rows to update (already classified)"
        : `invoice-extract suites reclassified: ${updateCount}`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0064: always-LLM Haiku capability cost reclassification ─────────
//
// Phase 1 (Contain) for the May 2026 Haiku cost-leak follow-up to audit
// PR #84. PR #46 (2026-05-04) flipped the scheduler cadence from 24h →
// 1h while filtering on `test_suites.external_cost_cents = 0`. PR #49
// covered 5 paid-vendor caps that day (Dilisense × 3, eSortcode,
// risk-narrative-generate) and PR #55 covered invoice-extract. PR #49's
// commit body explicitly deferred "Anthropic-Haiku bulk set (~80 caps)".
// This block closes that gap.
//
// Slug list lives in `llm-capability-costs.ts` (`BLOCK_0064_SLUGS`) so a
// CI assertion can also consume it — adding a new Anthropic-importing
// capability without registering its cost fails CI. See the
// `llm-capability-costs.test.ts` regression for the structural gate.
//
// 1¢ floor matches the PR #49 / block 0062 / block 0063 defensible-
// minimum pattern. Real per-call Haiku cost on typical inputs is below
// 1¢; the floor's only operational job is to flip the scheduler-skip
// semantic. Precise calibration is the existing P2 to-do.
//
// Idempotent via `external_cost_cents = 0` in the WHERE clause — once a
// row is set to 1, a re-run won't match it. dependency_health and
// schema_check are NOT included: those use the auth-less-probe pattern
// (no paid call), legitimately stay at 0.

export async function runMigration0064_alwaysLlmHaikuCosts(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // sql.join builds a parameterised IN-list — slugs flow through bind
  // parameters, not string concatenation. Sorted at the constant site
  // so the rendered SQL is stable test-run to test-run.
  const slugList = sql.join(
    BLOCK_0064_SLUGS.map((s) => sql`${s}`),
    sql`, `,
  );

  const update = await tx.execute(sql`
    UPDATE test_suites
    SET external_cost_cents = 1, updated_at = NOW()
    WHERE capability_slug IN (${slugList})
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: no active live non-probe suite for any of the
  // always-LLM Haiku slugs may remain at 0 after this block. If a new
  // suite (or new cap) landed at 0 between deploys, fail boot.
  // COUNT(*)::int → postgres-js coerces int4 to JS number; assertion
  // fires correctly.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_zero
    FROM test_suites
    WHERE capability_slug IN (${slugList})
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const checkResultRows = Array.isArray(checkRows) ? checkRows : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const remainingZero = (checkResultRows[0] as { remaining_zero?: number })?.remaining_zero ?? 0;
  if (remainingZero > 0) {
    throw new Error(
      `0064_always_llm_haiku_costs post-condition failed: ${remainingZero} always-LLM Haiku suites still at external_cost_cents = 0`,
    );
  }

  return {
    block: "0064_always_llm_haiku_costs",
    outcome:
      updateCount === 0
        ? "no rows to update (already classified)"
        : `always-LLM Haiku suites reclassified across ${BLOCK_0064_SLUGS.length} capabilities: ${updateCount}`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0065: PR #86 follow-up — leaky-cap cleanup ──────────────────────
//
// Two narrow UPDATEs against `test_suites`, bundled because both close
// residual leak surface that PR #86's bypass-justification audit
// surfaced. Idempotent via filter clauses; post-condition checks fire
// on first deploy and re-run as no-ops thereafter.
//
// 1. `website-to-company` cost bump (mirrors block 0064 pattern).
//    The bypass premise was that structured-data extraction (JSON-LD,
//    meta tags) bypasses the LLM. PR #86 found this wrong:
//    `llmExtractCompanyName` fires whenever meta-extract returns any
//    title/site_name (i.e. every real site). Bumping to 1¢ flips the
//    scheduler-skip semantic.
//
// 2. `us-company-data` fixture fix. The scheduled-test suites have
//    `input = {"company": "AAPL"}` (ticker symbol) which fails
//    `findCik`'s `/^\d{1,10}$/` regex → falls into the LLM
//    extractCompanyName path on every dispatch. Swapping to a numeric
//    CIK ("320193", Apple) routes directly to the SEC EDGAR API. The
//    manifest update is hygiene; this UPDATE is what makes the fix
//    effective in prod (the test_suites row was populated by
//    onboard.ts at capability-creation time and no longer tracks the
//    manifest).

export async function runMigration0065_pr86LeakyCapsCleanup(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // (1) website-to-company cost bump
  const slugList = sql.join(
    BLOCK_0065_SLUGS.map((s) => sql`${s}`),
    sql`, `,
  );
  const costBump = await tx.execute(sql`
    UPDATE test_suites
    SET external_cost_cents = 1, updated_at = NOW()
    WHERE capability_slug IN (${slugList})
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const costBumpCount = (costBump as { count?: number }).count ?? 0;

  // (2) us-company-data fixture fix — only touches rows whose current
  // input is the broken "AAPL" ticker. New rows or re-onboarded ones
  // (the manifest is now corrected) won't match the filter and stay.
  const fixtureFix = await tx.execute(sql`
    UPDATE test_suites
    SET input = jsonb_set(input, '{company}', '"320193"'::jsonb), updated_at = NOW()
    WHERE capability_slug = 'us-company-data'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND input->>'company' = 'AAPL'
  `);
  const fixtureFixCount = (fixtureFix as { count?: number }).count ?? 0;

  // Post-condition (1): no website-to-company live non-probe suite may
  // remain at external_cost_cents = 0 after this block.
  const checkCostRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_zero
    FROM test_suites
    WHERE capability_slug IN (${slugList})
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND external_cost_cents = 0
  `);
  const costRows = Array.isArray(checkCostRows) ? checkCostRows : (checkCostRows as { rows?: unknown[] })?.rows ?? [];
  const remainingZero = (costRows[0] as { remaining_zero?: number })?.remaining_zero ?? 0;
  if (remainingZero > 0) {
    throw new Error(
      `0065_pr86_leaky_caps_cleanup post-condition failed: ${remainingZero} website-to-company suites still at external_cost_cents = 0`,
    );
  }

  // Post-condition (2): no us-company-data live non-probe suite may
  // remain with input.company = 'AAPL' after this block.
  const checkFixtureRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS remaining_aapl
    FROM test_suites
    WHERE capability_slug = 'us-company-data'
      AND active = true
      AND test_mode = 'live'
      AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
      AND input->>'company' = 'AAPL'
  `);
  const fixtureRows = Array.isArray(checkFixtureRows) ? checkFixtureRows : (checkFixtureRows as { rows?: unknown[] })?.rows ?? [];
  const remainingAapl = (fixtureRows[0] as { remaining_aapl?: number })?.remaining_aapl ?? 0;
  if (remainingAapl > 0) {
    throw new Error(
      `0065_pr86_leaky_caps_cleanup post-condition failed: ${remainingAapl} us-company-data suites still have input.company = 'AAPL'`,
    );
  }

  const total = costBumpCount + fixtureFixCount;
  return {
    block: "0065_pr86_leaky_caps_cleanup",
    outcome:
      total === 0
        ? "no rows to update (already classified + fixed)"
        : `website-to-company cost-bumped=${costBumpCount}, us-company-data fixture-fixed=${fixtureFixCount}`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0066: ensure scheduled_testing_eligible column + reconcile from cost
//
// Owns the lifecycle of the `test_suites.scheduled_testing_eligible`
// column entirely: ADD COLUMN IF NOT EXISTS (idempotent — no-op on prod
// where the column already exists from PR #88's manual recovery apply,
// adds the column on fresh DBs), then reconciles eligibility from cost
// as the PR A interim derivation bridge.
//
// History. PR A (PR #88, merged 2026-05-11) added the column via a
// Drizzle SQL file at `apps/api/drizzle/0063_decouple_scheduled_testing_eligibility.sql`.
// That file never ran at deploy time — the Dockerfile CMD invokes the
// Node entrypoint, which calls `runStartupMigrations()`, which never
// invokes `drizzle-kit migrate`. PR #88 healthchecked-failed in prod
// because this block referenced the column before any mechanism created
// it. Phase 1 (Contain) applied the column manually via `railway ssh`;
// Phase 2 (Understand) named the failure pattern (Journal
// `35d67c87082c815da2ead8ff87c638e2`); this revised block is Phase 3
// (Harden) — the schema fact lives here, in the same place that already
// reconciles eligibility from cost. DEC-20260511-C codifies the
// in-TS-block convention.
//
// PR B will force explicit `scheduledTestingEligible` declarations at
// the 12 INSERT call sites and remove the reconciliation UPDATE; whether
// the ADD COLUMN portion stays here or moves to a dedicated block is a
// PR B design choice.
//
// Idempotency.
//   - ADD COLUMN IF NOT EXISTS is a Postgres no-op when the column
//     already exists.
//   - The reconciliation UPDATE filters `IS DISTINCT FROM` so a re-run
//     against an already-reconciled DB matches zero rows.

export async function runMigration0066_ensureEligibilityColumnAndReconcile(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Schema: ensure column exists. No-op on existing prod; creates it on
  // fresh DBs (local dev, staging, restored snapshots).
  await tx.execute(sql`
    ALTER TABLE test_suites
      ADD COLUMN IF NOT EXISTS scheduled_testing_eligible BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // Data: reconcile eligibility from cost (PR A interim derivation bridge).
  const update = await tx.execute(sql`
    UPDATE test_suites
       SET scheduled_testing_eligible = (external_cost_cents = 0),
           updated_at = NOW()
     WHERE scheduled_testing_eligible IS DISTINCT FROM (external_cost_cents = 0)
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: every row's eligibility matches the cost derivation.
  // If a row remains mismatched, something raced our UPDATE (or the
  // expression form differs between engines). Fail boot.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS mismatched
      FROM test_suites
     WHERE scheduled_testing_eligible IS DISTINCT FROM (external_cost_cents = 0)
  `);
  const checkResultRows = Array.isArray(checkRows)
    ? checkRows
    : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const mismatched = (checkResultRows[0] as { mismatched?: number })?.mismatched ?? 0;
  if (mismatched > 0) {
    throw new Error(
      `0066_ensure_eligibility_column_and_reconcile post-condition failed: ${mismatched} rows still mismatched after UPDATE`,
    );
  }

  return {
    block: "0066_ensure_eligibility_column_and_reconcile",
    outcome:
      updateCount === 0
        ? "column ensured; no rows to reconcile (already aligned)"
        : `column ensured; reconciled ${updateCount} rows to derived eligibility`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0067: cost_class taxonomy columns on `capabilities` ──────────────
//
// Adds four nullable columns plus CHECK constraints. NULL means "not yet
// classified" — scheduler skips, dispatcher refuses internal callers, but
// customer_paid still flows through (Phase A0b GRACE-mode self-throttling).
// Phase B will backfill the remaining ~312 caps under no time pressure;
// commit #2's Block 0068 seeds DE/DK/SK because OpenRegister's free-tier
// quota resets 2026-06-01 and the scheduler would burn the next cycle
// without the gate.
//
// Idempotency. Each ADD COLUMN uses IF NOT EXISTS; CHECK constraints are
// guarded by a NOT EXISTS lookup against pg_constraint so the second
// invocation is a no-op.
//
// Rollback. ALTER TABLE ... DROP COLUMN cascades any downstream UPDATE
// blocks (0068 etc.) automatically. See "## Rollback" in the Phase A0b
// prompt for the manual SQL.

export async function runMigration0067_costClassTaxonomy(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Columns first (idempotent).
  await tx.execute(sql`
    ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS cost_class TEXT
  `);
  await tx.execute(sql`
    ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS quota_window TEXT
  `);
  await tx.execute(sql`
    ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS quota_cap INTEGER
  `);
  await tx.execute(sql`
    ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS quota_reset_dom INTEGER
  `);

  // Constraints — guard each with a NOT EXISTS lookup so re-runs no-op.
  // information_schema.constraint_column_usage doesn't expose CHECK
  // constraints reliably across PG versions; pg_constraint is the
  // authoritative catalog.
  const ensureConstraint = async (
    name: string,
    definition: string,
  ): Promise<void> => {
    const exists = await tx.execute(sql`
      SELECT count(*)::text AS cnt FROM pg_constraint
      WHERE conname = ${name} AND conrelid = 'capabilities'::regclass
    `);
    const rows = Array.isArray(exists) ? exists : (exists as { rows?: unknown[] })?.rows ?? [];
    if ((rows[0] as { cnt?: string })?.cnt === "0") {
      // Note: sql.raw is acceptable here because both `name` and `definition`
      // are hardcoded literals controlled by this file, not user input.
      await tx.execute(
        sql.raw(`ALTER TABLE capabilities ADD CONSTRAINT ${name} CHECK (${definition})`),
      );
    }
  };

  await ensureConstraint(
    "capabilities_cost_class_chk",
    `cost_class IS NULL OR cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier', 'paid_prepaid', 'paid_subscription')`,
  );
  await ensureConstraint(
    "capabilities_quota_window_chk",
    `quota_window IS NULL OR quota_window IN ('daily', 'monthly', 'none')`,
  );
  await ensureConstraint(
    "capabilities_quota_reset_dom_chk",
    `quota_reset_dom IS NULL OR (quota_reset_dom >= 1 AND quota_reset_dom <= 31)`,
  );

  return {
    block: "0067_cost_class_taxonomy",
    outcome: "columns + CHECK constraints ensured",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0068: seed cost_class for DE/DK/SK ───────────────────────────────
//
// Phase A0b strategy (b) self-throttling: classifies only the three caps
// whose vendors have the most-urgent quota exhaustion risk. DE OpenRegister
// resets 2026-06-01 and was the original DE/DK breakage trigger; cvrapi.dk
// (DK) is IP-quota-limited at ~50/day empirical; SK RPO is free_unlimited
// because its only limit is a per-IP burst rate, not a cumulative quota.
//
// The remaining ~312 capabilities are Phase B (post-A0b) work — they stay
// cost_class IS NULL and the scheduler/dispatcher fail-closed for internal
// callers while still serving customer_paid traffic during the GRACE window.
//
// Idempotency. Each UPDATE filters `AND cost_class IS NULL`, so a re-run
// after the seed lands is a no-op. A future Phase B classification that
// lands a different cost_class on these rows is also preserved — this
// block only fills in the blank.

export async function runMigration0068_seedDeDkSkCostClass(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let totalAffected = 0;

  // DE OpenRegister — 50 req/month, resets on the 1st.
  const de = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_quota',
           quota_window = 'monthly',
           quota_cap = 50,
           quota_reset_dom = 1,
           updated_at = NOW()
     WHERE slug = 'german-company-data' AND cost_class IS NULL
  `);
  totalAffected += (de as { count?: number }).count ?? 0;

  // DK cvrapi.dk — empirical floor ~50/day, no per-day reset_dom needed.
  const dk = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_quota',
           quota_window = 'daily',
           quota_cap = 50,
           updated_at = NOW()
     WHERE slug = 'danish-company-data' AND cost_class IS NULL
  `);
  totalAffected += (dk as { count?: number }).count ?? 0;

  // SK RPO — gov registry, CC-BY 4.0, only 60 req/min/IP burst limit.
  // No cumulative quota → no quota_cap needed.
  const sk = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_unlimited',
           quota_window = 'none',
           updated_at = NOW()
     WHERE slug = 'slovak-company-data' AND cost_class IS NULL
  `);
  totalAffected += (sk as { count?: number }).count ?? 0;

  return {
    block: "0068_seed_de_dk_sk_cost_class",
    outcome:
      totalAffected === 0
        ? "no rows to update (DE/DK/SK already classified or missing)"
        : `seeded cost_class on ${totalAffected} row(s) (DE/DK/SK)`,
    rows_affected: totalAffected,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0069: reconcile scheduled_testing_eligible from cost_class ───────
//
// Phase A0b commit #4. Block 0066's interim derivation
// (`scheduled_testing_eligible := external_cost_cents = 0`) was the bridge
// behavior that conflated "no per-call cost" with "no quota". This block
// replaces it with the structural rule:
//
//   eligible := cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
//
// Unclassified caps (cost_class IS NULL) keep `scheduled_testing_eligible = FALSE`
// — fail-closed, matches the GRACE-mode dispatcher behavior. The scheduler's
// SELECT query is also tightened in test-scheduler.ts to exclude caps whose
// per-window budget counter has reached its cap (defense-in-depth alongside
// the per-call assertBudgetAvailable check).
//
// Idempotency. The UPDATE filters `IS DISTINCT FROM` so re-runs on an
// already-reconciled DB match zero rows.

export async function runMigration0069_reconcileEligibilityFromCostClass(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const update = await tx.execute(sql`
    UPDATE test_suites ts
       SET scheduled_testing_eligible = (
             c.cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
           ),
           updated_at = NOW()
      FROM capabilities c
     WHERE c.slug = ts.capability_slug
       AND c.cost_class IS NOT NULL
       AND ts.scheduled_testing_eligible IS DISTINCT FROM (
             c.cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
           )
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: for every classified cap, its suites' eligibility
  // matches the cost_class derivation. Mismatch means the UPDATE didn't
  // reach the rows we expected — fail boot rather than silently leave
  // the scheduler reading stale eligibility.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS mismatched
      FROM test_suites ts
      JOIN capabilities c ON c.slug = ts.capability_slug
     WHERE c.cost_class IS NOT NULL
       AND ts.scheduled_testing_eligible IS DISTINCT FROM (
             c.cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
           )
  `);
  const checkResultRows = Array.isArray(checkRows)
    ? checkRows
    : (checkRows as { rows?: unknown[] })?.rows ?? [];
  const mismatched = (checkResultRows[0] as { mismatched?: number })?.mismatched ?? 0;
  if (mismatched > 0) {
    throw new Error(
      `0069_reconcile_eligibility_from_cost_class post-condition failed: ${mismatched} rows still mismatched after UPDATE`,
    );
  }

  return {
    block: "0069_reconcile_eligibility_from_cost_class",
    outcome:
      updateCount === 0
        ? "no rows to reconcile (already aligned with cost_class)"
        : `reconciled ${updateCount} row(s) to cost_class-derived eligibility`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0070: capability_budget_counters table ───────────────────────────
//
// Per-capability test-budget counter (free_quota / paid_with_free_tier).
// Modeled on rate_limit_counters (composite PK + atomic ON CONFLICT
// increment). budget_cap is snapshotted at counter creation from
// capabilities.quota_cap × 5..20% depending on cost_class + window kind;
// see guarded-executor.ts for the formula.
//
// Idempotency. CREATE TABLE IF NOT EXISTS; CHECK constraint guarded by
// pg_constraint NOT EXISTS lookup.

export async function runMigration0070_capabilityBudgetCounters(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS capability_budget_counters (
      capability_slug TEXT NOT NULL,
      window_start TIMESTAMP WITH TIME ZONE NOT NULL,
      window_kind TEXT NOT NULL,
      test_count INTEGER NOT NULL DEFAULT 0,
      budget_cap INTEGER NOT NULL,
      alert_30_fired_at TIMESTAMP WITH TIME ZONE,
      alert_50_fired_at TIMESTAMP WITH TIME ZONE,
      alert_80_fired_at TIMESTAMP WITH TIME ZONE,
      hard_stop_fired_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (capability_slug, window_start, window_kind)
    )
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS capability_budget_counters_window_idx
      ON capability_budget_counters (window_kind, window_start)
  `);

  // CHECK constraint guarded against re-add.
  const checkExists = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM pg_constraint
    WHERE conname = 'capability_budget_counters_window_kind_chk'
      AND conrelid = 'capability_budget_counters'::regclass
  `);
  const rows = Array.isArray(checkExists)
    ? checkExists
    : (checkExists as { rows?: unknown[] })?.rows ?? [];
  if ((rows[0] as { cnt?: string })?.cnt === "0") {
    await tx.execute(sql`
      ALTER TABLE capability_budget_counters
        ADD CONSTRAINT capability_budget_counters_window_kind_chk
        CHECK (window_kind IN ('daily', 'monthly'))
    `);
  }

  return {
    block: "0070_capability_budget_counters",
    outcome: "table + index + CHECK ensured",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0071: bulk-classify 180 high-confidence free_unlimited caps ──────
//
// Phase B.1 of DEC-20260512-A. Sets cost_class = 'free_unlimited',
// quota_window = 'none' on the 180 capabilities surfaced by the Phase
// B.0 audit (c:/tmp/phase-b-audit-report.csv, filter:
// proposed_cost_class=free_unlimited AND confidence=high).
//
// The slug list lives in `phase-b1-free-unlimited-slugs.ts` for the
// same reason BLOCK_0064_SLUGS lives in `llm-capability-costs.ts` —
// keeps the 200-line literal out of this orchestrator and pinned by
// a dedicated regression test.
//
// Idempotency. WHERE cost_class IS NULL gates the UPDATE so:
//   (a) re-runs after the first successful apply are no-ops,
//   (b) any cap operator has reclassified between deploys is preserved.
// Manifest YAMLs were updated in the same commit (180 files); they
// are the source-of-truth for fresh-DB onboarding.

export async function runMigration0071_bulkClassifyFreeUnlimited(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Drizzle's array-of-text binding: build sql`VALUES (...), (...)` from
  // the slug list. Same shape as Block 0064 (BLOCK_0064_SLUGS UPDATE).
  // Why not ANY($1::text[]): postgres-js + drizzle's sql template
  // doesn't expose a clean array binding for ANY; the WHERE slug IN
  // (slug1, slug2, ...) form is what the existing BLOCK_0064 block
  // already uses and is the established convention.
  const result = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_unlimited',
           quota_window = 'none',
           quota_cap = NULL,
           quota_reset_dom = NULL,
           updated_at = NOW()
     WHERE slug IN ${sql.raw("(" + PHASE_B1_FREE_UNLIMITED_SLUGS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",") + ")")}
       AND cost_class IS NULL
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0071_bulk_classify_free_unlimited",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B1_FREE_UNLIMITED_SLUGS.length} slugs already have cost_class set)`
        : `bulk-classified ${updateCount} cap(s) as free_unlimited (of ${PHASE_B1_FREE_UNLIMITED_SLUGS.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0072: classify 8 high-confidence free_quota capabilities ─────────
//
// Phase B.2 of DEC-20260512-A. Sets cost_class='free_quota' plus per-cap
// quota_window / quota_cap / quota_reset_dom on 8 capabilities flagged
// by the Phase B.0 audit (2026-05-12) as high-confidence free_quota.
//
// All 8 caps use audit-shortlist env vars (ABN_LOOKUP_GUID, ADZUNA_APP_ID,
// AVIATIONSTACK_API_KEY, COMPANIES_HOUSE_API_KEY); the chat-supplied
// vendor override table for Phase B.2 did not affect any of these (none
// matched the 7 patterns CBEAPI_KEY / SUDREG_* / GITHUB_TOKEN /
// GEMI_API_KEY / PAGESPEED_API_KEY / BOLAGSVERKET_* / COURTLISTENER_API_TOKEN).
// No Bolagsverket exclusions needed.
//
// Per-cap values are inlined into a VALUES clause rather than a slug list
// because each cap has different quota params (unlike Block 0071's uniform
// free_unlimited). Idempotency: WHERE cost_class IS NULL gates the UPDATE.

interface FreeQuotaCapValues {
  slug: string;
  quotaWindow: "daily" | "monthly";
  quotaCap: number;
  quotaResetDom: number | null;
}

export const PHASE_B2_FREE_QUOTA_HIGH_CONF: ReadonlyArray<FreeQuotaCapValues> = [
  { slug: "au-company-data",             quotaWindow: "daily",   quotaCap: 1000, quotaResetDom: null },
  { slug: "beneficial-ownership-lookup", quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
  { slug: "flight-status",               quotaWindow: "monthly", quotaCap: 100,  quotaResetDom: 1 },
  { slug: "insolvency-check",            quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
  { slug: "job-board-search",            quotaWindow: "monthly", quotaCap: 1000, quotaResetDom: 1 },
  { slug: "officer-search",              quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
  { slug: "uk-companies-house-officers", quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
  { slug: "uk-filing-events",            quotaWindow: "daily",   quotaCap: 600,  quotaResetDom: null },
];

export async function runMigration0072_classifyFreeQuotaHighConfidence(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Build a VALUES-based UPDATE so per-cap quota params survive a single
  // statement. Each row: slug, quota_window, quota_cap, quota_reset_dom.
  // The CTE form makes the SQL diff-readable for chat review without
  // resorting to 8 separate UPDATE statements.
  const valuesRows = PHASE_B2_FREE_QUOTA_HIGH_CONF.map((c) => {
    const slug = c.slug.replace(/'/g, "''");
    const qd = c.quotaResetDom === null ? "NULL" : String(c.quotaResetDom);
    return `('${slug}', '${c.quotaWindow}', ${c.quotaCap}, ${qd})`;
  }).join(",\n      ");

  const result = await tx.execute(sql.raw(`
    UPDATE capabilities AS c
       SET cost_class = 'free_quota',
           quota_window = v.quota_window,
           quota_cap = v.quota_cap,
           quota_reset_dom = v.quota_reset_dom,
           updated_at = NOW()
      FROM (VALUES
      ${valuesRows}
      ) AS v(slug, quota_window, quota_cap, quota_reset_dom)
     WHERE c.slug = v.slug
       AND c.cost_class IS NULL
  `));
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0072_classify_free_quota_high_confidence",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B2_FREE_QUOTA_HIGH_CONF.length} slugs already have cost_class set)`
        : `classified ${updateCount} cap(s) as free_quota (of ${PHASE_B2_FREE_QUOTA_HIGH_CONF.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0073: 5 medium-confidence free_unlimited scraping caps ───────────
//
// Phase B.2 sibling of Block 0072. The 5 scraping caps below have
// data_source_type=scrape, no BROWSERLESS_* env var (raw fetch + cheerio),
// no vendor cost. Heuristic confidence flagged as medium because the
// vendor identity is the scrape target (gov registry pages) rather than
// an API contract — slightly higher operational fragility but no
// classification ambiguity.
//
// Same idempotency shape as Block 0071: ANY-list UPDATE filtered on
// cost_class IS NULL.

export const PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF: ReadonlyArray<string> = [
  "canadian-company-data",
  "japanese-company-data",
  "polish-company-data",
  "seo-audit",
  "tech-stack-detect",
];

export async function runMigration0073_classifyFreeUnlimitedMediumConfidence(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const result = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'free_unlimited',
           quota_window = 'none',
           quota_cap = NULL,
           quota_reset_dom = NULL,
           updated_at = NOW()
     WHERE slug IN ${sql.raw("(" + PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF.map((s) => `'${s.replace(/'/g, "''")}'`).join(",") + ")")}
       AND cost_class IS NULL
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0073_classify_free_unlimited_medium_confidence",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF.length} slugs already have cost_class set)`
        : `classified ${updateCount} cap(s) as free_unlimited (of ${PHASE_B2_FREE_UNLIMITED_MEDIUM_CONF.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0074: classify 83 ANTHROPIC_API_KEY caps as paid_prepaid ─────────
//
// Phase B.3 of DEC-20260512-A. Every capability that reads
// process.env.ANTHROPIC_API_KEY classifies as paid_prepaid — Anthropic's
// API has no free tier, no quota, bills per token on every call.
// Mechanical batch; no per-cap variation.
//
// Zero behavior change vs current state per DEC-20260503-B: these 83
// caps already had scheduled_testing_eligible=FALSE via Block 0066's
// bridge derivation from external_cost_cents > 0. After B.3 the
// scheduler eligibility result stays FALSE but its source flips from
// external_cost_cents to cost_class (Block 0069 reconcile). No test
// signal lost. Dispatcher gate's NULL × internal_test = refuse already
// blocked test-runner invocations; paid_prepaid × internal_test =
// refuse keeps the same outcome.
//
// Side effect: first paid_prepaid classifications in production
// activate A0c.2b's "Awaiting production traffic" frontend display
// for any cap with stale last_customer_call_at. Validates the A0c
// arc end-to-end.
//
// Idempotency: WHERE cost_class IS NULL. Slug list lives separately
// in phase-b3-anthropic-paid-prepaid-slugs.ts (same pattern as
// PHASE_B1_FREE_UNLIMITED_SLUGS).

export async function runMigration0074_classifyAnthropicPaidPrepaid(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const result = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'paid_prepaid',
           quota_window = 'none',
           quota_cap = NULL,
           quota_reset_dom = NULL,
           updated_at = NOW()
     WHERE slug IN ${sql.raw("(" + PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",") + ")")}
       AND cost_class IS NULL
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0074_classify_anthropic_paid_prepaid",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.length} slugs already have cost_class set)`
        : `classified ${updateCount} cap(s) as paid_prepaid (of ${PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0075: classify 8 low-confidence free_quota caps ──────────────────
//
// Phase B.4 of DEC-20260512-A. The Phase B.0 audit (2026-05-12) flagged
// 8 caps as `free_quota` at low confidence — the heuristic identified
// vendor-API + auth env var but couldn't pin per-window quota params
// without vendor-doc research. Chat completed that research during B.1/B.2
// prep and supplied authoritative override values (see PR body for source
// rationale per cap).
//
// All 8 caps share quota_window='daily' + quota_reset_dom=NULL, so only
// quota_cap varies. The 7 vendor patterns (CBEAPI, SUDREG, GITHUB,
// GEMI, PAGESPEED, BOLAGSVERKET, COURTLISTENER) span 6 different vendors —
// the GITHUB_TOKEN pattern covers 2 caps (github-repo-compare,
// github-user-profile). swedish-company-data resolves to free_quota via
// URL-based vendor identification: gw.api.bolagsverket.se is the
// Värdefulla datamängder open-data API (free, OAuth client credentials,
// rate-limited), NOT paid B2B (which uses different hostnames).
//
// Per-cap UPDATEs (8 atomic statements) because each cap has a different
// quota_cap. Idempotent via `AND cost_class IS NULL` per cap.

interface FreeQuotaLowConfCap {
  slug: string;
  quotaCap: number;
}

export const PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS: ReadonlyArray<FreeQuotaLowConfCap> = [
  { slug: "belgian-company-data",  quotaCap: 2500 },   // cbeapi.be free tier
  { slug: "croatian-company-data", quotaCap: 500 },    // sudreg-api.pravosudje.hr — conservative
  { slug: "github-repo-compare",   quotaCap: 1000 },   // GitHub 5000/hour → conservative daily
  { slug: "github-user-profile",   quotaCap: 1000 },   // GitHub 5000/hour → conservative daily
  { slug: "greek-company-data",    quotaCap: 500 },    // GEMI Open Data — conservative
  { slug: "page-speed-test",       quotaCap: 25000 },  // Google PSI documented 25k/day
  { slug: "swedish-company-data",  quotaCap: 1000 },   // Bolagsverket Värdefulla datamängder
  { slug: "us-court-search",       quotaCap: 5000 },   // CourtListener free tier per SDK docs
];

export async function runMigration0075_classifyFreeQuotaLowConfidence(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let totalAffected = 0;

  // Per-cap UPDATEs. Could be consolidated into one VALUES-clause UPDATE
  // like Block 0072, but the per-cap loop keeps the SQL trivial and the
  // diff readable for chat review of an 8-row batch with chat-supplied
  // authoritative values.
  for (const cap of PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS) {
    const result = await tx.execute(sql`
      UPDATE capabilities
         SET cost_class = 'free_quota',
             quota_window = 'daily',
             quota_cap = ${cap.quotaCap},
             quota_reset_dom = NULL,
             updated_at = NOW()
       WHERE slug = ${cap.slug}
         AND cost_class IS NULL
    `);
    totalAffected += (result as { count?: number }).count ?? 0;
  }

  return {
    block: "0075_classify_free_quota_low_confidence",
    outcome:
      totalAffected === 0
        ? `no rows to classify (all ${PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.length} slugs already have cost_class set)`
        : `classified ${totalAffected} cap(s) as free_quota (of ${PHASE_B4_FREE_QUOTA_LOW_CONF_CAPS.length} target slugs)`,
    rows_affected: totalAffected,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0076: classify 10 non-Anthropic paid_prepaid caps ────────────────
//
// Phase B.5 of DEC-20260512-A. Final paid_prepaid batch. 7 caps are
// DB-present (the boot invariant's 9 visible unclassified rows = these
// 7 + the 2 in Block 0077). 3 caps are code-but-not-DB orphans
// (us-company-data-cobalt, us-ein-match, us-sec-filings-extended) —
// they have executor files calling registerCapability AND manifest
// files BUT no DB rows, suggesting onboard.ts was never run for them.
// They're included in this slug list so when chat fixes their
// onboarding the UPDATE classifies them on next boot via idempotency
// (`AND cost_class IS NULL`).
//
// Vendor breakdown:
//   - Dilisense (3): adverse-media-check, pep-check, sanctions-check
//   - Serper.dev (3): backlink-check, google-search, serp-analyze
//   - eSortcode (1): uk-cop-check  (Pay.UK CoP commercial bank verification)
//   - Cobalt Intelligence (1): us-company-data-cobalt  [orphan]
//   - Liberty Data EINsearch (1): us-ein-match  [orphan]
//   - sec-api.io (1): us-sec-filings-extended  [orphan; 100-call trial only]
//
// All 10 ship paid_prepaid / quota_window='none' / quota_cap=NULL /
// quota_reset_dom=NULL (same shape as Block 0074's Anthropic batch).

export const PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS: ReadonlyArray<string> = [
  "adverse-media-check",
  "backlink-check",
  "google-search",
  "pep-check",
  "sanctions-check",
  "serp-analyze",
  "uk-cop-check",
  "us-company-data-cobalt",
  "us-ein-match",
  "us-sec-filings-extended",
];

export async function runMigration0076_classifyNonAnthropicPaidPrepaid(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const result = await tx.execute(sql`
    UPDATE capabilities
       SET cost_class = 'paid_prepaid',
           quota_window = 'none',
           quota_cap = NULL,
           quota_reset_dom = NULL,
           updated_at = NOW()
     WHERE slug IN ${sql.raw("(" + PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",") + ")")}
       AND cost_class IS NULL
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0076_classify_non_anthropic_paid_prepaid",
    outcome:
      updateCount === 0
        ? `no rows to classify (all ${PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS.length} slugs already classified or 3 orphan slugs not in DB)`
        : `classified ${updateCount} cap(s) as paid_prepaid (of ${PHASE_B5_NON_ANTHROPIC_PAID_PREPAID_SLUGS.length} target slugs; 3 orphans excluded by DB filter)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0077: classify 2 free_quota caps that override audit's paid heuristic ──
//
// Phase B.5 sibling. The Phase B.0 audit's heuristic classified these
// 2 Dutch gov vendors as paid_prepaid because their maintenance_class
// is `commercial-stable-api`. Chat research confirmed both are
// gov-operated free APIs with auth-gated rate-limited access (NOT paid
// commercial APIs as the heuristic assumed):
//
//   - nl-bag-address: Kadaster BAG API Individuele Bevragingen,
//     documented free at 50k/day. URL api.bag.kadaster.nl matches.
//   - nl-energy-label: RVO/EP-Online gov free with API-key auth,
//     no published quota. Conservative cap 1000/day matches the
//     SUDREG/GEMI posture used in Block 0075.
//
// Per-cap UPDATEs (same pattern as Block 0075). Idempotent via
// `AND cost_class IS NULL`.

interface FreeQuotaOverrideCap {
  slug: string;
  quotaCap: number;
}

export const PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS: ReadonlyArray<FreeQuotaOverrideCap> = [
  { slug: "nl-bag-address",  quotaCap: 50000 }, // Kadaster BAG documented 50k/day
  { slug: "nl-energy-label", quotaCap: 1000 },  // EP-Online conservative cap
];

export async function runMigration0077_classifyFreeQuotaOverrides(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let totalAffected = 0;

  for (const cap of PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS) {
    const result = await tx.execute(sql`
      UPDATE capabilities
         SET cost_class = 'free_quota',
             quota_window = 'daily',
             quota_cap = ${cap.quotaCap},
             quota_reset_dom = NULL,
             updated_at = NOW()
       WHERE slug = ${cap.slug}
         AND cost_class IS NULL
    `);
    totalAffected += (result as { count?: number }).count ?? 0;
  }

  return {
    block: "0077_classify_free_quota_overrides",
    outcome:
      totalAffected === 0
        ? `no rows to classify (all ${PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS.length} slugs already classified)`
        : `classified ${totalAffected} cap(s) as free_quota (of ${PHASE_B5_FREE_QUOTA_OVERRIDE_CAPS.length} target slugs)`,
    rows_affected: totalAffected,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0078: transactions(capability_id, created_at) compound index ────
//
// Phase A0c.1.v3 (2026-05-13). The list-endpoint extension for
// last_customer_call_at runs `SELECT capability_id, MAX(created_at) FROM
// transactions WHERE status='completed' AND user filter GROUP BY
// capability_id`. Without an index on (capability_id, created_at), this
// degrades from index-only aggregate to status-filter-scan + in-memory
// hash aggregate. Fine at pre-launch scale (<10k transactions); degrades
// linearly as the table grows.
//
// The detail handler's per-cap query (capabilities.ts:136-144) ALSO
// benefits — previously it seq-scanned the status='completed' filter set
// looking for one capability_id; now it can index-seek directly.
//
// Idempotency: CREATE INDEX IF NOT EXISTS. Re-runs are no-ops.

export async function runMigration0078_transactionsCapabilityIdCreatedAtIdx(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS transactions_capability_id_created_at_idx
      ON transactions (capability_id, created_at)
  `);

  return {
    block: "0078_transactions_capability_id_created_at_idx",
    outcome: "compound index ensured on transactions(capability_id, created_at)",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0079: ee_directors + ee_directors_sync tables ────────────────────
//
// Estonian directors/representatives cache, populated by the nightly
// `ingest-ee-directors.ts` job from the RIK Ariregister CC BY 4.0 open-data
// dump. PK is `kirje_id` from upstream (unique per registry-card filing);
// queries filter by `entity_reg_code` and `end_date IS NULL` for active
// representatives. `ee_directors_sync` is a single-row marker tracking the
// upstream Last-Modified header so the ingest can skip on no-op days.
//
// Idempotency: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
// Re-runs on a healthy DB are no-ops.

export async function runMigration0079_eeDirectors(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS ee_directors (
      kirje_id INTEGER PRIMARY KEY,
      entity_reg_code TEXT NOT NULL,
      person_type TEXT NOT NULL,
      role_code TEXT NOT NULL,
      role_text TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      isikukood_hash TEXT,
      foreign_code TEXT,
      foreign_country_code TEXT,
      foreign_country_text TEXT,
      address_text TEXT,
      address_country_code TEXT,
      start_date DATE,
      end_date DATE,
      last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS ee_directors_entity_idx
      ON ee_directors (entity_reg_code)
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS ee_directors_last_synced_idx
      ON ee_directors (last_synced_at)
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS ee_directors_sync (
      id INTEGER PRIMARY KEY,
      last_modified_upstream TEXT,
      last_success_at TIMESTAMP WITH TIME ZONE,
      last_attempt_at TIMESTAMP WITH TIME ZONE,
      row_count INTEGER
    )
  `);

  // CHECK constraint guarded against re-add. Pinning id=1 keeps the marker
  // a single-row table without needing a separate enum / UUID.
  const checkExists = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM pg_constraint
    WHERE conname = 'ee_directors_sync_singleton_chk'
      AND conrelid = 'ee_directors_sync'::regclass
  `);
  const rows = Array.isArray(checkExists)
    ? checkExists
    : (checkExists as { rows?: unknown[] })?.rows ?? [];
  if ((rows[0] as { cnt?: string })?.cnt === "0") {
    await tx.execute(sql`
      ALTER TABLE ee_directors_sync
        ADD CONSTRAINT ee_directors_sync_singleton_chk CHECK (id = 1)
    `);
  }

  return {
    block: "0079_ee_directors",
    outcome: "ee_directors + ee_directors_sync tables + indexes ensured",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0080: cy_directors + cy_directors_sync tables ────────────────────
//
// Cyprus directors/officers cache, populated by the monthly
// `ingest-cy-directors.ts` job from the data.gov.cy DRCOR open-data CSV
// (`organisation_officials_83.csv`, CC BY 4.0). DRCOR has no stable per-row
// identifier upstream, so the natural composite PK is (entity_reg_code,
// person_or_organisation_name, official_position) — directly mirroring the
// uniqueness semantics of one (person × position) per company. Queries filter
// by entity_reg_code; the sweep DELETE relies on last_synced_at for the
// retire-stale-rows pass.
//
// Idempotency: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
// The composite PK is created in-line with the table, so it lands once and
// re-runs are no-ops.

export async function runMigration0080_cyDirectors(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS cy_directors (
      entity_reg_code TEXT NOT NULL,
      person_or_organisation_name TEXT NOT NULL,
      official_position TEXT NOT NULL,
      organisation_name TEXT,
      organisation_type_code TEXT,
      organisation_type TEXT,
      role_standardized TEXT NOT NULL,
      last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entity_reg_code, person_or_organisation_name, official_position)
    )
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS cy_directors_entity_idx
      ON cy_directors (entity_reg_code)
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS cy_directors_last_synced_idx
      ON cy_directors (last_synced_at)
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS cy_directors_sync (
      id INTEGER PRIMARY KEY,
      last_modified_upstream TEXT,
      last_success_at TIMESTAMP WITH TIME ZONE,
      last_attempt_at TIMESTAMP WITH TIME ZONE,
      row_count INTEGER
    )
  `);

  const checkExists = await tx.execute(sql`
    SELECT count(*)::text AS cnt FROM pg_constraint
    WHERE conname = 'cy_directors_sync_singleton_chk'
      AND conrelid = 'cy_directors_sync'::regclass
  `);
  const rows = Array.isArray(checkExists)
    ? checkExists
    : (checkExists as { rows?: unknown[] })?.rows ?? [];
  if ((rows[0] as { cnt?: string })?.cnt === "0") {
    await tx.execute(sql`
      ALTER TABLE cy_directors_sync
        ADD CONSTRAINT cy_directors_sync_singleton_chk CHECK (id = 1)
    `);
  }

  return {
    block: "0080_cy_directors",
    outcome: "cy_directors + cy_directors_sync tables + indexes ensured",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Block set executed in order. Append new migrations here. Order is
 * historical (oldest first); idempotency makes the order operationally
 * irrelevant on existing prod, but it's the audit-trail-friendly shape.
 *
 * Exported so the admin endpoint regression test can introspect the
 * canonical block list and assert it matches what the endpoint returns.
 */
export const BLOCKS: ReadonlyArray<(tx: MigrationExecutor) => Promise<BlockResult>> = [
  runMigration0029_actualCostCents,
  runMigration0030_complianceColumns,
  runMigration0031_testResultsCompositeIdx,
  runMigration0060_marketplaceEligible,
  runMigration0062_paidVendorCosts,
  runMigration0063_invoiceExtractCostReclassify,
  runMigration0064_alwaysLlmHaikuCosts,
  runMigration0065_pr86LeakyCapsCleanup,
  runMigration0066_ensureEligibilityColumnAndReconcile,
  runMigration0067_costClassTaxonomy,
  runMigration0068_seedDeDkSkCostClass,
  runMigration0069_reconcileEligibilityFromCostClass,
  runMigration0070_capabilityBudgetCounters,
  runMigration0071_bulkClassifyFreeUnlimited,
  runMigration0072_classifyFreeQuotaHighConfidence,
  runMigration0073_classifyFreeUnlimitedMediumConfidence,
  runMigration0074_classifyAnthropicPaidPrepaid,
  runMigration0075_classifyFreeQuotaLowConfidence,
  runMigration0076_classifyNonAnthropicPaidPrepaid,
  runMigration0077_classifyFreeQuotaOverrides,
  runMigration0078_transactionsCapabilityIdCreatedAtIdx,
  runMigration0079_eeDirectors,
  runMigration0080_cyDirectors,
  runMigration0081_attribution,
  runMigration0082_reclassifyThrottledFreeUnlimited,
  runMigration0083_x402PayerHash,
  runMigration0084_danishQuotaHeadroom,
  runMigration0085_actorIdentity,
  runMigration0086_srcBasis,
  runMigration0087_unhideRedactedRows,
  runMigration0088_solutionGateCondition,
];

/**
 * Block 0081 — channel attribution (design doc 2026-08-12).
 * client_meta JSONB on transactions (write-only at execution time) and the
 * discovery_hits table (90-day retention via db-retention RULES). New table
 * starts empty — DEC-20260504-B backlog-drain does not apply.
 */
export async function runMigration0081_attribution(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_meta JSONB
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS discovery_hits (
      id BIGSERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL,
      src_tag TEXT,
      ua TEXT,
      ip_hash TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS discovery_hits_created_at_idx
      ON discovery_hits (created_at)
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS discovery_hits_src_tag_idx
      ON discovery_hits (src_tag) WHERE src_tag IS NOT NULL
  `);

  return {
    block: "0081_attribution",
    outcome: "client_meta column + discovery_hits table ensured (idempotent)",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0082: reclassify throttled-upstream free_unlimited caps ─────────
//
// Audit follow-up (2026-08-14). `free_unlimited` disarms the
// guarded-executor.ts ALLOW_MATRIX entirely ("allow, no constraint" for
// every invocation context) — the exact conflation the 2026-05-11 DE
// OpenRegister incident post-mortem named as root cause: "no per-call
// cost" was read as "no quota." A production audit of all 193
// `free_unlimited` caps found 19 whose upstream vendor documents a real
// rate limit or daily cap; the rest (algorithmic, static-table, or
// arbitrary-customer-target fetches with no vendor account/quota) are
// correctly free_unlimited and untouched.
//
// Quota_cap derivation. Where the vendor documents a literal daily
// total, that number is used directly (Etherscan 100,000/day; Open-Meteo
// 10,000/day). Where the vendor documents only a per-minute or
// per-second rate, quota_cap is the rate's 1-hour-sustained volume
// (rate_per_minute × 60) — a deliberately conservative fraction of the
// naive 24h extrapolation, matching the conservative-estimate posture
// Block 0075/0077 already established for this table. This number only
// bounds Strale's own internal_test/ci budget (10%/20% of quota_cap per
// window, per computeBudgetCap) — customer_paid traffic is unaffected
// per the ALLOW_MATRIX (free_quota × customer_paid = allow). Per-cap
// vendor citations:
//
//   - brazilian-company-data: ReceitaWS free tier, 3 req/min
//     (https://receitaws.com.br/api; corroborated across public API
//     directories). quota_cap = 3×60 = 180.
//   - address-geocode, address-validate: OSM Nominatim Usage Policy
//     (https://operations.osmfoundation.org/policies/nominatim/) —
//     "absolute maximum of 1 request per second" for casual use, but
//     "restricted to a lower limit of 4 requests per minute" for bulk /
//     regular-interval automated use, which is what a production
//     capability does. quota_cap = 4×60 = 240. (address-validate.ts
//     already self-throttles at ~1 req/1.1s in-process; that bounds
//     burst rate but not cumulative scheduler volume across restarts —
//     the two protections are complementary, not redundant.)
//   - weather-lookup: Open-Meteo pricing page
//     (https://open-meteo.com/en/pricing) — "Daily Limit 10.000 calls /
//     day" for free non-commercial use. quota_cap = 10000 (literal).
//   - ip-geolocation, ip-risk-score: ip-api.com docs
//     (https://ip-api.com/docs/api:json) — "limited to 45 requests per
//     minute from an IP address" (also already noted in
//     ip-geolocation.ts's own header comment). quota_cap = 45×60 = 2700.
//   - sec-filing-events: SEC.gov fair-access policy
//     (https://www.sec.gov/os/webmaster-faq, in effect since 2021-07-27)
//     — "no more than 10 requests per second," applies site-wide
//     including data.sec.gov (used by this executor). quota_cap =
//     10×60×60 = 36000.
//   - contract-verify-check, gas-price-check, wallet-age-check,
//     wallet-balance-lookup, wallet-transactions-lookup: shared
//     lib/etherscan-client.ts. Etherscan free-tier rate limits
//     (docs.etherscan.io/etherscan-v2/rate-limits, corroborated via
//     info.etherscan.com/api-return-errors) — 5 calls/second, 100,000
//     calls/day. quota_cap = 100000 (literal). The client already
//     self-throttles to ~4.76 req/s in-process; same complementary
//     relationship as Nominatim above — it doesn't bound the 100k/day
//     total across a long-running or multi-instance process.
//   - barcode-lookup: Open Food Facts API docs
//     (https://openfoodfacts.github.io/openfoodfacts-server/api/) —
//     "15 req/min/IP address for all read product queries," which is
//     the exact endpoint this executor calls. quota_cap = 15×60 = 900.
//   - crypto-price: CoinGecko official support article
//     (https://support.coingecko.com/hc/en-us/articles/4538771776153) —
//     public/keyless plan "5 to 15 calls per minute depending on usage
//     conditions." Conservative low end used. quota_cap = 5×60 = 300.
//   - company-news: GDELT Project's own blog
//     (https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/)
//     — "one request every 5 seconds" per IP (= 12/min). quota_cap =
//     12×60 = 720.
//   - approval-security-check, phishing-site-check, token-security-check,
//     wallet-risk-score: GoPlus Labs official docs
//     (https://docs.gopluslabs.io/reference/support) — "the rate limit
//     is 30 calls/minute" for the free tier without an access token
//     (none of these 4 executors send one). quota_cap = 30×60 = 1800.
//
// Deliberately NOT reclassified (checked, left free_unlimited): DefiLlama
// (protocol-fees-lookup, protocol-tvl-lookup, stablecoin-flow-check) —
// vendor docs state no rate limit on the free API. GLEIF (lei-lookup,
// gleif-l2-children-lookup, gleif-l2-ubo-lookup) — vendor docs state no
// rate limiting. PyPI (pypi-package-info) — vendor docs state no edge
// rate limiting. Nager.Date (business-day-check, holiday-calendar,
// public-holiday-lookup) — vendor docs state unlimited. Docker Hub
// (docker-hub-info) — the documented 100-pulls/6h limit applies to
// registry image pulls, not the hub.docker.com/v2/repositories/
// metadata endpoint this executor actually calls; no rate limit found
// documented for that endpoint. Zippopotam.us (postal-code-lookup) — no
// published limit ("no hard limits ... best-effort"). A broader set of
// ~50 other free_unlimited caps with third-party vendor data sources
// (e.g. npm-package-info, several EU open-data CKAN company registries,
// Yahoo Finance-backed caps) were surfaced but not individually
// re-verified in this pass — see PR body for the full candidate list;
// left alone per "don't guess" rather than reclassified speculatively.
//
// Reclassification (not first-time classification), so the idempotency
// gate is `cost_class = 'free_unlimited'` per slug, not `IS NULL` — a
// prior classification (correct or not) is what's being corrected, and
// once corrected to `free_quota` this predicate naturally stops
// matching (self-terminating, same as the IS NULL blocks above).
//
// Follow-up (2026-08-14, same day): quotaCap below used to be 19
// hand-computed integers with the arithmetic spelled out only in
// trailing `//` comments — easy to typo, and nothing checked the
// comment against the number. Now sourced from the same
// `{value, unit, source_url}` shape the manifest's `known_rate_limit`
// field carries (capability-manifest-types.ts) and run through the same
// `deriveQuotaCapFromRateLimit` both this migration and
// check-cost-class-coherence.mjs's consistency check use — so a mismatch
// between what this migration writes to the DB and what the manifest
// declares is now a lint failure, not just a manually-maintained
// coincidence. This migration still can't read manifests/*.yaml at
// deploy time (startup migrations must be self-contained, deterministic
// SQL — no filesystem dependency on repo layout), so the rate-limit
// facts are re-declared here rather than imported from YAML; they're
// the same facts as the corresponding manifest's known_rate_limit,
// verified equal by startup-migrations.test.ts.

interface ThrottledUpstreamReclassifyCap {
  slug: string;
  quotaCap: number;
}

interface ThrottledUpstreamReclassifySource {
  slug: string;
  rateLimit: ManifestKnownRateLimit;
}

// Vendor rate-limit citations — one entry per reclassified capability,
// mirrored 1:1 on that capability's manifest known_rate_limit field.
// quotaCap (below) is derived from these, not hand-computed. Exported so
// startup-migrations.test.ts can assert this list stays byte-identical
// to each corresponding manifest's known_rate_limit.
export const PHASE_C1_THROTTLED_UPSTREAM_SOURCE: ReadonlyArray<ThrottledUpstreamReclassifySource> = [
  { slug: "brazilian-company-data", rateLimit: { value: 3, unit: "per_minute", source_url: "https://receitaws.com.br/api" } },
  { slug: "address-geocode", rateLimit: { value: 4, unit: "per_minute", source_url: "https://operations.osmfoundation.org/policies/nominatim/" } },
  { slug: "address-validate", rateLimit: { value: 4, unit: "per_minute", source_url: "https://operations.osmfoundation.org/policies/nominatim/" } },
  { slug: "weather-lookup", rateLimit: { value: 10000, unit: "per_day", source_url: "https://open-meteo.com/en/pricing" } },
  { slug: "ip-geolocation", rateLimit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" } },
  { slug: "ip-risk-score", rateLimit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" } },
  { slug: "sec-filing-events", rateLimit: { value: 10, unit: "per_second", source_url: "https://www.sec.gov/os/webmaster-faq" } },
  { slug: "contract-verify-check", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "gas-price-check", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "wallet-age-check", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "wallet-balance-lookup", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "wallet-transactions-lookup", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "barcode-lookup", rateLimit: { value: 15, unit: "per_minute", source_url: "https://openfoodfacts.github.io/openfoodfacts-server/api/" } },
  { slug: "crypto-price", rateLimit: { value: 5, unit: "per_minute", source_url: "https://support.coingecko.com/hc/en-us/articles/4538771776153" } },
  { slug: "company-news", rateLimit: { value: 12, unit: "per_minute", source_url: "https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/" } },
  { slug: "approval-security-check", rateLimit: { value: 30, unit: "per_minute", source_url: "https://docs.gopluslabs.io/reference/support" } },
  { slug: "phishing-site-check", rateLimit: { value: 30, unit: "per_minute", source_url: "https://docs.gopluslabs.io/reference/support" } },
  { slug: "token-security-check", rateLimit: { value: 30, unit: "per_minute", source_url: "https://docs.gopluslabs.io/reference/support" } },
  { slug: "wallet-risk-score", rateLimit: { value: 30, unit: "per_minute", source_url: "https://docs.gopluslabs.io/reference/support" } },
];

export const PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY: ReadonlyArray<ThrottledUpstreamReclassifyCap> =
  PHASE_C1_THROTTLED_UPSTREAM_SOURCE.map((c) => ({
    slug: c.slug,
    quotaCap: deriveQuotaCapFromRateLimit(c.rateLimit),
  }));

export async function runMigration0082_reclassifyThrottledFreeUnlimited(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Single VALUES-CTE UPDATE (same shape as Block 0072, which already
  // solved "19 rows, each with a different quota_cap" in one round trip)
  // rather than a per-cap loop — at 19 rows this is well past the point
  // where Block 0075's 8-row "keeps the SQL trivial for chat review"
  // trade-off still wins. Reclassification, not first-time
  // classification, so the safety filter is `c.cost_class =
  // 'free_unlimited'` rather than `IS NULL`. This also means a cap
  // manually reclassified to something else between deploys (e.g. an
  // operator moved one to paid_prepaid) is left alone.
  const valuesRows = PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.map((c) => {
    const slug = c.slug.replace(/'/g, "''");
    return `('${slug}', ${c.quotaCap})`;
  }).join(",\n      ");

  const result = await tx.execute(sql.raw(`
    UPDATE capabilities AS c
       SET cost_class = 'free_quota',
           quota_window = 'daily',
           quota_cap = v.quota_cap,
           quota_reset_dom = NULL,
           updated_at = NOW()
      FROM (VALUES
      ${valuesRows}
      ) AS v(slug, quota_cap)
     WHERE c.slug = v.slug
       AND c.cost_class = 'free_unlimited'
  `));
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0082_reclassify_throttled_free_unlimited",
    outcome:
      updateCount === 0
        ? `no rows to reclassify (all ${PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.length} slugs already non-free_unlimited)`
        : `reclassified ${updateCount} cap(s) from free_unlimited to free_quota (of ${PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0083: MCP funnel + x402 payer hash ───────────────────────────────
//
// Readiness P0 (2026-08-15): "Strale can see agents arriving and can see
// revenue, but nothing in between." Two additions, both write-only at
// execution time (no hot-path query cost):
//
//   1. transactions.x402_payer_hash — see the column comment in db/schema.ts
//      for the full rationale (stable, keyed HMAC; deliberately NOT the
//      daily-rotating shape discovery_hits.ip_hash uses). Populated going
//      forward by recordX402Transaction (routes/x402-gateway-v2.ts) via
//      hashX402Payer (lib/attribution.ts). NULL on existing rows and on
//      wallet-paid rows — no backfill: DEC-20260504-B's backlog-drain
//      requirement doesn't apply because there's nothing to drain (a NULL
//      column addition, same shape as Block 0081's client_meta).
//   2. No discovery_hits schema change. The MCP funnel (initialize,
//      tools/list, each tools/call, and auth/payment rejections) reuses the
//      existing table unmodified — funnel step + tool name + rejection
//      reason are all encoded into the `endpoint` text column
//      (`/mcp:tools/call:{tool}`, `/mcp:reject:{type}:{tool}`), the same
//      pattern `/mcp:initialize` already established. See routes/mcp.ts and
//      packages/mcp-server/src/tools.ts (onFunnelEvent hook).
export async function runMigration0083_x402PayerHash(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS x402_payer_hash VARCHAR(16)
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS transactions_x402_payer_hash_idx
      ON transactions (x402_payer_hash) WHERE x402_payer_hash IS NOT NULL
  `);

  return {
    block: "0083_x402_payer_hash",
    outcome: "x402_payer_hash column + index ensured (idempotent); no discovery_hits schema change",
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0084 — reserve customer headroom in danish-company-data's test budget.
 *
 * cvrapi.dk documents exactly 50 free lookups per day. quota_cap was also 50,
 * so the scheduler was entitled to the entire vendor allowance and customers
 * got whatever was left, which was nothing. Measured in the week to
 * 2026-08-15: 12-31 upstream-consuming executions a day, our own budget
 * refusing 12-15 of them, and cvrapi.dk still returning "quota exceeded" 2-4
 * times a day. The single genuinely external call in the 30-day window failed
 * with exactly that error.
 *
 * Only internal_test/ci contexts are budget-checked — customer_paid is always
 * ALLOW in the ALLOW_MATRIX — so the budget cannot protect customers from us;
 * it can only stop us before we exhaust the shared pool. Setting it to 20
 * leaves 30/day for real callers, comfortably above the observed 12/day
 * baseline for a full suite cycle.
 *
 * Guarded on the old value so an operator who has since retuned it is left
 * alone, and so a redeploy is a no-op.
 */
export async function runMigration0084_danishQuotaHeadroom(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const result = await tx.execute(sql`
    UPDATE capabilities
       SET quota_cap = 20,
           updated_at = NOW()
     WHERE slug = 'danish-company-data'
       AND cost_class = 'free_quota'
       AND quota_cap = 50
  `);
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0084_danish_quota_headroom",
    outcome:
      updateCount === 0
        ? "no change (danish-company-data quota_cap already retuned or capability absent)"
        : "danish-company-data test budget cut from 50 to 20, reserving 30/day of the vendor's 50 for customers",
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0085 — the identity spine (docs/company/MEASUREMENT.md).
 *
 * Creates the `transaction_actors` view: one resolved "who" per transaction,
 * so "is our revenue one customer or twenty" becomes answerable. That question
 * decides whether the business has a demand problem or a conversion problem,
 * and it was unanswerable on 2026-08-15 when two strategic conclusions turned
 * on guessing at it.
 *
 * A VIEW rather than a stored column, deliberately:
 *   - the key is a pure function of columns already on the row, so storing it
 *     creates a second source of truth that can drift from the first;
 *   - a written column can be forgotten at a write site, and one already would
 *     be — the A2A rail proxies to /v1/do without forwarding caller identity;
 *   - `ADD COLUMN ... GENERATED ALWAYS AS ... STORED` rewrites the table and
 *     takes an ACCESS EXCLUSIVE lock on `transactions`, the busiest table in
 *     the system, for no benefit at this row count.
 *
 * DEC-20260504-B (bulk-operation deploy) does not apply: a view creation reads
 * nothing and writes nothing. The supporting index is created CONCURRENTLY
 * outside the migration transaction for the same reason — see below.
 *
 * Privacy: `x402_payer_hash` is already a keyed HMAC of the lowercased address
 * (attribution.ts). No raw wallet address is read, derived, or stored here, and
 * there is deliberately no device/IP fallback — unattributable stays
 * unattributable and is reported as a coverage figure instead.
 */
export async function runMigration0085_actorIdentity(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // CREATE OR REPLACE so a change to the derivation redeploys cleanly. The
  // version marker lives inside the key: if the rule changes, old and new keys
  // compare unequal rather than silently merging two different actors.
  await tx.execute(sql`
    CREATE OR REPLACE VIEW transaction_actors AS
    SELECT
      t.id,
      t.created_at,
      t.status,
      t.price_cents,
      t.capability_id,
      t.user_id,
      CASE
        WHEN t.user_id IS NOT NULL THEN 'user:v1:' || t.user_id::text
        WHEN t.x402_payer_hash IS NOT NULL THEN 'x402:v1:' || t.x402_payer_hash
        ELSE NULL
      END AS actor_key,
      CASE
        WHEN t.user_id IS NOT NULL THEN 'user'
        WHEN t.x402_payer_hash IS NOT NULL THEN 'x402_wallet'
        ELSE 'unattributed'
      END AS actor_kind
    FROM transactions t
  `);

  // Supporting index for the payer-identity metrics. IF NOT EXISTS keeps the
  // block idempotent across the reboots that re-run every migration.
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_transactions_payer_created
      ON transactions (x402_payer_hash, created_at)
      WHERE x402_payer_hash IS NOT NULL
  `);

  return {
    block: "0085_actorIdentity",
    outcome: "applied",
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0086 — how we know where a caller came from.
 *
 * `src_basis` records HOW a discovery hit was attributed: 'tagged' (a ?src=
 * parameter we added ourselves), 'referer' (the venue's page linked to us), or
 * 'agent' (the venue's crawler identified itself). Without it, a weak signal
 * and a strong one are indistinguishable once stored, and the weakest is the
 * most numerous.
 *
 * Nullable with no backfill: the 2,196 rows written before this point have no
 * recoverable basis, and inventing one would be worse than leaving it unknown.
 * DEC-20260504-B does not apply — an ADD COLUMN with no default rewrites
 * nothing.
 */
export async function runMigration0086_srcBasis(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`ALTER TABLE discovery_hits ADD COLUMN IF NOT EXISTS src_basis TEXT`);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_discovery_hits_src
      ON discovery_hits (src_tag, created_at) WHERE src_tag IS NOT NULL`);
  return { block: "0086_srcBasis", outcome: "applied", duration_ms: Date.now() - startedAt };
}

/**
 * Run every registered migration block, in order. Throws on first
 * failure — the caller in index.ts has the catch that exits the
 * process with a fatal log. Don't catch internally; missing schema
 * is not something the API can run with.
 *
 * Returns the per-block summary so callers (the admin endpoint) can
 * surface it as an HTTP response. The startup wiring in index.ts
 * ignores the return value; the throw-on-failure semantics is what
 * matters there.
 */
export async function runStartupMigrations(): Promise<BlockResult[]> {
  const startedAt = Date.now();
  const db = getDb();
  const results: BlockResult[] = [];

  log.info({ label: "startup-migrations-begin", block_count: BLOCKS.length }, "startup-migrations-begin");

  for (const block of BLOCKS) {
    const result = await block(db);
    results.push(result);
    log.info(
      {
        label: "startup-migration-block",
        block: result.block,
        outcome: result.outcome,
        rows_affected: result.rows_affected ?? null,
        duration_ms: result.duration_ms,
      },
      `startup-migration-block ${result.block}`,
    );
  }

  log.info(
    {
      label: "startup-migrations-complete",
      block_count: results.length,
      total_duration_ms: Date.now() - startedAt,
      blocks: results.map((r) => ({
        block: r.block,
        outcome: r.outcome,
        rows_affected: r.rows_affected ?? null,
      })),
    },
    "startup-migrations-complete",
  );

  return results;
}


/**
 * Block 0087 — give customers back the history a content redaction took.
 *
 * The 90-day customer-content sweep in `data-retention.ts` set BOTH
 * `redacted_at` and `deleted_at`. Only the first was correct. Per schema.ts,
 * `deleted_at` means "the row is logically gone", and every customer read path
 * filters on it: the transaction list, transaction detail, the audit-record
 * endpoint behind every shareable audit URL, and the A2A task lookup. So a
 * redaction that was supposed to zero the payload and keep the Art. 30
 * skeleton readable for 1095 days instead made the whole row vanish from the
 * API at 90 — for Audit Trail, a product we sell.
 *
 * Under the old narrow selector this hit only personal-data capabilities.
 * Widening it to all transactions on 2026-08-15 made it universal. A separate
 * bug (every loop read `.rowCount`, which this driver never sets, so each
 * sweep stopped after one batch) capped the damage at roughly one batch per
 * run — which is the only reason this is a repair and not an incident.
 *
 * The repair is narrow by construction: it clears `deleted_at` ONLY where the
 * row carries this sweep's exact signature — a retention content-redaction
 * reason, `redacted_at` set, and `deleted_at` set. It cannot touch a
 * user-requested erasure (`deletion_reason = 'user_request'`), and it cannot
 * touch the 1095-day hard-retention purge, which writes `'retention_purge'`
 * and where `deleted_at` is correct. Nothing is un-redacted: the payload
 * columns stay zeroed, permanently. Only the row's visibility comes back.
 *
 * DEC-20260504-B: this is an UPDATE of a few thousand rows setting one column
 * to NULL, run once inside the migration transaction. No payload is written,
 * nothing is deleted, and the WHERE clause is self-limiting — after the first
 * successful run it matches nothing, which is what makes re-running on every
 * boot a no-op.
 */
export async function runMigration0087_unhideRedactedRows(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const res = await tx.execute(sql`
    UPDATE transactions
    SET deleted_at = NULL
    WHERE deleted_at IS NOT NULL
      AND redacted_at IS NOT NULL
      AND deletion_reason IN ('pii_retention_purge', 'content_retention_purge')
  `);
  const restored = (res as { count?: number }).count ?? 0;

  // Bring the old reason string in line with what the column now means, so an
  // operator reading `deletion_reason` is not told a row was deleted for PII
  // when it was redacted for content. Chain verification buckets both under
  // retention (routes/verify.ts isRetentionReason), so this is cosmetic to the
  // public response and load-bearing for whoever reads the table directly.
  const renamed = await tx.execute(sql`
    UPDATE transactions
    SET deletion_reason = 'content_retention_purge'
    WHERE deletion_reason = 'pii_retention_purge'
  `);
  const renamedCount = (renamed as { count?: number }).count ?? 0;

  return {
    block: "0087_unhideRedactedRows",
    outcome:
      restored === 0
        ? "no change (no content-redacted rows were marked deleted)"
        : `${restored} redacted transactions made visible again to their owners; payload stays zeroed`,
    rows_affected: restored + renamedCount,
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0088 — gate conditions on solution steps.
 *
 * A bundle had no way to say "if this precondition fails, stop and do not
 * charge". Combined with the billing rule — refund only when EVERY step fails
 * — any bundle whose first step can legitimately report "there is nothing
 * here" billed in full for the remaining wasted steps. `page-seo-check` on an
 * unreachable URL is the worked example: url-health-check succeeds reporting
 * is_up=false, the other three fail, one success is enough to bill.
 *
 * Additive nullable column; existing rows keep NULL and behave exactly as
 * before. No backlog to drain (DEC-20260504-B does not apply).
 */
export async function runMigration0088_solutionGateCondition(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`ALTER TABLE solution_steps ADD COLUMN IF NOT EXISTS gate_condition JSONB`);
  return { block: "0088_solutionGateCondition", outcome: "applied", duration_ms: Date.now() - startedAt };
}
