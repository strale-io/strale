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
  runMigration0070_capabilityBudgetCounters,
];

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
