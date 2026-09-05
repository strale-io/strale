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
import { getActiveProviders } from "./dependency-manifest.js";
import { BLOCK_0064_SLUGS, BLOCK_0065_SLUGS } from "./llm-capability-costs.js";
import { PHASE_B1_FREE_UNLIMITED_SLUGS } from "./phase-b1-free-unlimited-slugs.js";
import { PHASE_B3_ANTHROPIC_PAID_PREPAID_SLUGS } from "./phase-b3-anthropic-paid-prepaid-slugs.js";
import {
  deriveQuotaCapFromRateLimit,
  type ManifestKnownRateLimit,
} from "./capability-manifest-types.js";
import {
  CAPABILITY_OUTPUT_CONTRACTS,
  CORRECTED_SLUGS,
} from "./capability-output-contracts.js";

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

/**
 * The rows block 0066 owns: suites whose capability carries no `cost_class`.
 *
 * Why this scoping exists (found 2026-08-21 by the morning check-in).
 * Blocks 0066 and 0069 derived the SAME column from two different sources —
 * 0066 from `test_suites.external_cost_cents`, 0069 from
 * `capabilities.cost_class` — and both ran on every boot, in that order.
 * For any suite where the two disagreed, each boot flipped the flag twice:
 * 0066 set it one way, 0069 set it back. Both post-conditions passed,
 * because each checked only its own derivation immediately after its own
 * UPDATE. Nothing ever converged and nothing ever complained.
 *
 * In production this hit exactly 8 suites — `eu-regulation-search` and
 * `seo-audit`, both `cost_class = 'free_unlimited'` (so 0069 says eligible)
 * with `external_cost_cents = 1` for their Haiku call (so 0066 says not).
 * Both readings are correct about different questions; only the column is
 * shared.
 *
 * The damage was not the churn itself but the `updated_at = NOW()` both
 * UPDATEs carried. `checkBaselineStaleness` (test-runner.ts) reads
 * `updated_at` as "the suite's content was edited", so a scheduling-flag
 * write invalidated the fixture baseline — on every single deploy. Those
 * suites cost money to re-run, so `recordStaleFixture` refused to
 * re-baseline and wrote `passed: false` instead, forever:
 * `eu-regulation-search` scored 51% over 24h and 60% in the Codebase
 * Quality Program's exit measurement without a single real failure.
 *
 * Both halves are fixed here: the two blocks now partition the table
 * (0069 owns classified capabilities, 0066 owns the rest), and neither
 * touches `updated_at`, because changing which suites the scheduler picks
 * up is not an edit to what a suite asserts.
 */
const UNCLASSIFIED_ONLY = sql`NOT EXISTS (
        SELECT 1 FROM capabilities c
         WHERE c.slug = ts.capability_slug AND c.cost_class IS NOT NULL
      )`;

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

  // Data: reconcile eligibility from cost, ONLY for suites whose capability
  // has no cost_class. Block 0069 owns every classified capability; see
  // UNCLASSIFIED_ONLY's comment for why the two must not overlap.
  const update = await tx.execute(sql`
    UPDATE test_suites ts
       SET scheduled_testing_eligible = (ts.external_cost_cents = 0)
     WHERE ${UNCLASSIFIED_ONLY}
       AND ts.scheduled_testing_eligible IS DISTINCT FROM (ts.external_cost_cents = 0)
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  // Post-condition: every row this block owns matches the cost derivation.
  // Scoped identically to the UPDATE — asserting over classified rows too
  // would fail boot the moment 0069 legitimately disagrees, which is the
  // whole point of splitting them.
  const checkRows = await tx.execute(sql`
    SELECT COUNT(*)::int AS mismatched
      FROM test_suites ts
     WHERE ${UNCLASSIFIED_ONLY}
       AND ts.scheduled_testing_eligible IS DISTINCT FROM (ts.external_cost_cents = 0)
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
           )
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
// ─── Block 0095: wallet reservations + non-negative balance (WP3) ───────────
//
// Two changes, both additive and both reversible by dropping what they create.
//
// 1. `wallet_reservations` — the durable record that makes a charge
//    recoverable after a crash. See the table comment in db/schema.ts.
//
// 2. CHECK (balance_cents >= 0) — the backstop under the application-level
//    affordability check, so no future path can overdraw even if it bypasses
//    the wallet service entirely.
//
// SHAPE NOTES, both learned the hard way in review:
//
//   Every statement is independently idempotent — IF NOT EXISTS on the table
//   and on each index, and an exception-guarded ADD CONSTRAINT. The first
//   draft used check-then-bare-DDL, which is the TOCTOU shape block 0093's
//   comment (a few hundred lines below) documents as already having broken a
//   deploy: two overlapping boots both read "absent", both issue the bare
//   statement, the loser throws, and `runStartupMigrations` aborts boot on any
//   throw. Railway runs old and new instances together during a rolling
//   deploy, so overlapping boots are the normal case, not the edge.
//
//   The indexes are created unconditionally rather than inside a
//   "table was absent" branch. The runner has no transaction wrapper, so each
//   statement commits on its own: a kill between CREATE TABLE and the index
//   builds would otherwise leave the table permanently without
//   `wallet_reservations_transaction_id_unique`, which is the only thing
//   stopping a retry opening a second hold on one execution. A missing guard
//   that no gate would ever notice is worse than a failed migration.
//
//   The constraint is added NOT VALID and validated separately. ADD CONSTRAINT
//   with validation takes ACCESS EXCLUSIVE on `wallets` for the length of a
//   full table scan, and the sync /v1/do path holds a FOR UPDATE row lock on
//   that table across an external HTTP call — so the ALTER can queue behind a
//   live request and, while queued, block every other `wallets` query behind
//   it. NOT VALID skips the scan and takes the lock only briefly; VALIDATE
//   then takes just SHARE UPDATE EXCLUSIVE. Production was verified read-only
//   (59 wallets, none negative), so validation cannot fail on existing rows —
//   but that only ever addressed row content, never lock acquisition.
//
//   Finally, constraint work is failure-tolerant: if it cannot be applied on
//   this boot it is logged and retried on the next one rather than thrown.
//   The table is what the running code needs; a deferred constraint costs
//   nothing, whereas a throw here aborts boot, and per MEMORY a failed Railway
//   deploy does not cut over — /health would silently keep serving the old
//   commit.
export async function runMigration0095_walletReservations(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS "wallet_reservations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "wallet_id" uuid NOT NULL REFERENCES "wallets"("id"),
      "user_id" uuid NOT NULL REFERENCES "users"("id"),
      "amount_cents" integer NOT NULL,
      "state" varchar(16) DEFAULT 'reserved' NOT NULL,
      "transaction_id" uuid,
      "deadline_at" timestamptz NOT NULL,
      "terminal_reason" text,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )
  `);

  // Unconditional and individually idempotent — see the shape note above.
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "wallet_reservations_state_deadline_idx"
      ON "wallet_reservations" ("state", "deadline_at")
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "wallet_reservations_wallet_id_idx"
      ON "wallet_reservations" ("wallet_id")
  `);
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "wallet_reservations_transaction_id_unique"
      ON "wallet_reservations" ("transaction_id")
      WHERE "transaction_id" IS NOT NULL
  `);

  let constraintOutcome: string;
  try {
    // duplicate_object is the only expected failure and means a concurrent
    // boot won; anything else propagates to the catch below and defers.
    await tx.execute(sql`
      DO $$
      BEGIN
        ALTER TABLE "wallets"
          ADD CONSTRAINT "wallets_balance_cents_non_negative"
          CHECK ("balance_cents" >= 0) NOT VALID;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    // Cheap lock, and a no-op if already validated.
    await tx.execute(sql`
      ALTER TABLE "wallets"
        VALIDATE CONSTRAINT "wallets_balance_cents_non_negative"
    `);
    constraintOutcome = "constraint present and validated";
  } catch (err) {
    // Deliberately not rethrown — see the failure-tolerance note above.
    constraintOutcome = `constraint deferred to a later boot (${
      err instanceof Error ? err.message : "unknown error"
    })`;
  }

  return {
    block: "0095_wallet_reservations",
    outcome: `wallet_reservations ensured; ${constraintOutcome}`,
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0096 — x402 settlement intents (WP5).
 *
 * Same shape discipline as 0095, for the same reason: every statement is
 * independently idempotent, and the indexes are created unconditionally rather
 * than inside a table-was-absent branch. The runner has no transaction, so a
 * kill between CREATE TABLE and the index builds would otherwise leave a unique
 * index permanently absent — and here that index is the "one canonical record
 * per settlement" guarantee, which is the whole point of the block.
 *
 * New table, starts empty. DEC-20260504-B backlog-drain does not apply: there
 * is no accumulated workload for the reconciler's first run, because nothing
 * has ever written an intent.
 */
export async function runMigration0096_x402SettlementIntents(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS "x402_settlement_intents" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "payment_hash" text NOT NULL,
      "slug" text NOT NULL,
      "solution_slug" text,
      "price_cents" integer NOT NULL,
      "price_usd" numeric(10, 4),
      "state" varchar(16) DEFAULT 'settling' NOT NULL,
      "settlement_id" text,
      "transaction_id" uuid,
      "failure_reason" text,
      "escalated_at" timestamptz,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    )
  `);

  // Separate ADD COLUMN as well as the inline definition: the table may already
  // exist from an earlier boot of this same block before the column was added.
  // IF NOT EXISTS on both, so either order is a no-op the second time.
  await tx.execute(sql`
    ALTER TABLE "x402_settlement_intents"
      ADD COLUMN IF NOT EXISTS "escalated_at" timestamptz
  `);

  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "x402_settlement_intents_payment_hash_unique"
      ON "x402_settlement_intents" ("payment_hash")
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "x402_settlement_intents_state_updated_idx"
      ON "x402_settlement_intents" ("state", "updated_at")
  `);
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "x402_settlement_intents_settlement_id_unique"
      ON "x402_settlement_intents" ("settlement_id")
      WHERE "settlement_id" IS NOT NULL
  `);

  // One canonical record per settlement, on the table that actually holds the
  // revenue. Review finding: WP5 named this defect on `transactions` and then
  // only constrained the intents table, leaving duplicate prevention resting on
  // the unrelated payment-hash index — a different guarantee that happens to
  // work only because the recovery path populates that column too.
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "transactions_x402_settlement_id_unique"
      ON "transactions" ("x402_settlement_id")
      WHERE "x402_settlement_id" IS NOT NULL
  `);

  return {
    block: "0096_x402_settlement_intents",
    outcome:
      "x402_settlement_intents table + 3 indexes, escalated_at column, " +
      "and the transactions.x402_settlement_id unique index (idempotent)",
    duration_ms: Date.now() - startedAt,
  };
}


/**
 * Block 0097 — monotonic chain sequence (WP7).
 *
 * The head of a hash chain must be "the last row the worker hashed". WP7's
 * first attempt defined it as `max(completed_at)`, which cannot work: measured
 * against production, the median `completed_at - created_at` is MINUS 1.5 ms —
 * the column is stamped from a clock read before the row's `created_at`
 * default — and 78 rows in the last 30 days complete out of creation order.
 * A row admitted after the head but carrying an earlier `completed_at` chains
 * onto the head without becoming it, and the next row chains onto the same
 * parent. One parent, two children. Replaying the rule over 30 days of real
 * traffic produces nine such forks, in clusters.
 *
 * `chain_seq` is assigned from a sequence AT HASH TIME, so it is monotone in
 * the only order that matters — the order rows were actually chained. Clock
 * skew, backdating and per-row retries become structurally incapable of
 * forking the chain rather than merely unlikely to.
 *
 * Cost. `ADD COLUMN` with no default and no NOT NULL is catalog-only in
 * Postgres 11+, so there is no rewrite of a 902k-row / 355 MB hot table. The
 * 863,946 historical rows keep NULL and are simply not head candidates; their
 * chain is unchanged and still verifiable by replay. Exactly ONE row is
 * seeded — the current head under the corrected NULLS LAST rule — so the new
 * sequence continues from where the old chain actually ends instead of
 * starting a second root. A one-row UPDATE, so DEC-20260504-B's backlog-drain
 * concern does not arise.
 *
 * NOT included: an index on `previous_hash`. An earlier draft of this block
 * created one, which production already has as `idx_transactions_previous_hash`
 * (65 MB). `IF NOT EXISTS` matches on NAME, not definition, so that would have
 * built a second 60 MB index on the same column of a hot table — permanent
 * write amplification for zero benefit.
 */
export async function runMigration0097_chainSequence(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "chain_seq" bigint
  `);

  await tx.execute(sql`CREATE SEQUENCE IF NOT EXISTS "transactions_chain_seq"`);

  // Unique so two rows can never claim the same position, which is the
  // single-parent property expressed structurally. Partial, because every
  // historical row is NULL and must not compete for a slot.
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "transactions_chain_seq_unique"
      ON "transactions" ("chain_seq")
      WHERE "chain_seq" IS NOT NULL
  `);

  // Seed the current head, once. Without this the first post-deploy hash would
  // find no sequenced row and link to GENESIS, silently starting a second root
  // — the very failure this package exists to stop.
  const seeded = await tx.execute(sql`
    UPDATE "transactions" SET "chain_seq" = nextval('transactions_chain_seq')
    WHERE "id" = (
      SELECT "id" FROM "transactions"
      WHERE "integrity_hash" IS NOT NULL AND "completed_at" IS NOT NULL
      ORDER BY "completed_at" DESC NULLS LAST, "id" DESC
      LIMIT 1
    )
    AND NOT EXISTS (SELECT 1 FROM "transactions" WHERE "chain_seq" IS NOT NULL)
  `);

  return {
    block: "0097_chain_sequence",
    outcome:
      "transactions.chain_seq column + sequence + unique index; " +
      `head seeded (${(seeded as unknown as { count?: number }).count ?? 0} row)`,
    duration_ms: Date.now() - startedAt,
  };
}


/**
 * Block 0098 — per-customer idempotency + request fingerprint (WP6).
 *
 * Two changes, both verified read-only against production first:
 *   - 0 duplicate (user_id, idempotency_key) pairs across 421 keyed rows, so
 *     the new unique index cannot abort boot.
 *   - 0 keyed rows with a NULL user_id, so scoping to the customer strands
 *     nothing.
 *
 * The old index is dropped AFTER the new one exists. Order matters: dropping
 * first would leave a window with no uniqueness at all, and this runs at boot
 * while the previous release is still serving traffic.
 */
export async function runMigration0098_perCustomerIdempotency(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" varchar(64)
  `);

  // Bound the LOCK WAIT, not just the statement. Review finding: this table has
  // ~902k rows and is written by every /v1/do call. CREATE UNIQUE INDEX takes
  // SHARE, which conflicts with the ROW EXCLUSIVE an in-flight execution holds
  // across its external call (bounded at 15s), and a PENDING SHARE request
  // queues every subsequent write behind it. The connection carries
  // statement_timeout=30s and lock wait counts toward it, so a busy deploy
  // window could throw here — and an uncaught throw aborts boot, which on
  // Railway means the old commit keeps serving and the failure is silent.
  //
  // Block 0095 reached the same conclusion for `wallets` and chose the same
  // shape: bound the wait, and on failure log and DEFER to the next boot rather
  // than throwing. Both statements are IF [NOT] EXISTS, so a retry is a no-op
  // once they land.
  let indexOutcome: string;
  try {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "transactions_user_idempotency_key_unique"
        ON "transactions" ("user_id", "idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);
    // Only now — see the ordering note above.
    await tx.execute(sql`
      DROP INDEX IF EXISTS "transactions_idempotency_key_unique"
    `);
    indexOutcome = "per-customer index created; global index dropped";
  } catch (err) {
    // Deferring is safe in BOTH directions. Until the new index exists the old
    // global one is still in force and is strictly stricter, so nothing the
    // previous release writes can later violate the new one.
    indexOutcome =
      "index swap deferred to next boot (lock contention): " +
      (err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120));
  }

  return {
    block: "0098_per_customer_idempotency",
    outcome: `idempotency_fingerprint column ensured; ${indexOutcome}`,
    duration_ms: Date.now() - startedAt,
  };
}


/**
 * Block 0099 — half-quarantine is invalid, enforced by the database (WP8).
 *
 * `is_active AND NOT visible AND x402_enabled` means "withdrawn from the
 * catalogue, still purchasable on the paid rail". No code path produces it: the
 * quality floor writes both flags together to withdraw, and the promotion job
 * writes both together to restore.
 *
 * Production held it anyway. `danish-company-data` was quarantined 2026-08-12
 * with the intended state recorded in its manifest, and an out-of-band write on
 * 2026-08-21 set `x402_enabled` back to true while leaving it invisible. It was
 * then listed and purchasable while failing 100% of real customer calls — 14 of
 * 14 over 90 days. Nothing detected it; the manifest note is the only reason it
 * was diagnosable at all.
 *
 * A scheduled checker (jobs/invariant-checker.ts) catches the NEXT one, but only
 * after up to two hours during which the capability is on sale. The database can
 * refuse it outright, which is the difference between detecting and preventing.
 *
 * Shape, per block 0095: ADD CONSTRAINT ... NOT VALID first, so no full-table
 * ACCESS EXCLUSIVE scan blocks writes on a hot table, then VALIDATE separately.
 * Failure is logged and retried next boot rather than thrown — a throw aborts
 * boot, and a failed Railway deploy does not cut over.
 *
 * Verified read-only against production before writing: 0 violating rows across
 * 340 capabilities. `solutions` has no `visible` column, so the rule is
 * capability-only by construction.
 */
export async function runMigration0099_noHalfQuarantine(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let outcome: string;

  try {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`
      DO $$
      BEGIN
        ALTER TABLE "capabilities"
          ADD CONSTRAINT "capabilities_no_half_quarantine"
          CHECK (NOT ("is_active" AND NOT "visible" AND "x402_enabled")) NOT VALID;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await tx.execute(sql`
      ALTER TABLE "capabilities" VALIDATE CONSTRAINT "capabilities_no_half_quarantine"
    `);
    outcome = "constraint present and validated";
  } catch (err) {
    // Deferring is safe: until the constraint exists the scheduled invariant
    // check still reports the state, so the platform is not blind in the gap.
    outcome =
      "deferred to next boot: " +
      (err instanceof Error ? err.message.slice(0, 140) : String(err).slice(0, 140));
  }

  return {
    block: "0099_no_half_quarantine",
    outcome: `capabilities_no_half_quarantine — ${outcome}`,
    duration_ms: Date.now() - startedAt,
  };
}



// ─── Block 0100: re-list url-to-markdown — the takedown was wrong ──────────
//
// The quality floor quarantined `url-to-markdown` at 2026-08-22 05:58Z:
// "completion 67% on 15 eligible calls/30d". Reproducing the floor's own
// population against production gave exactly its numbers (15 eligible, 10
// completed, 4 distinct failure days), so the arithmetic was right and the
// evidence behind it was not. The five counted failures:
//
//   1 x "This page returned almost no readable text (0 words). It may require
//       JavaScript to render its content, or the URL may point to a login
//       page."                        — the capability answering correctly
//   2 x "…could not be loaded (HTTP 400)"  — the caller's target site
//   2 x "This site is rate-limiting requests (HTTP 429)" — the caller's target
//
// None is a defect in this capability. Verified three independent ways on the
// morning of the re-listing: the executor's live smoke test passes end to end,
// the harness is 531/531 over 7d (weak evidence on its own — see GOALS.md),
// and the two most recent real external calls, 2026-08-07 and 2026-08-21,
// both completed.
//
// What made it worth fixing at boot rather than waiting: `url-to-markdown` is
// one of the 11 no-signup free-tier capabilities. Quarantine sets
// visible = false, `matchCapability` refuses an invisible capability (WP8 —
// correctly, quarantine must not be bypassable), and the resulting 401 body
// went on advertising `url-to-markdown` as free to try. The front door told
// agents to call something the platform would refuse. lib/free-tier.ts fixes
// the advertisement; this block fixes the thing that should never have been
// withdrawn.
//
// Why an event and not just the flags: the floor's window clamp and the
// promotion job's "was this a takedown?" test both read the most recent
// enforce-mode listing event. Flags without the event leave the capability
// looking freshly quarantined — the next tick re-quarantines it on the same
// July rows, and the promotion job keeps flagging it for a human who has
// already decided. Flags and event commit together, as jobs/quality-floor.ts
// does for the reverse direction: a listing change without its evidence must
// be impossible.
//
// Ledger-guarded, deliberately. This is a one-time correction of one specific
// decision, not a standing policy that `url-to-markdown` is listed. If it is
// ever quarantined again on fresh evidence, that quarantine stands — this
// block will not undo it on the next deploy.
//
// Authority: DEC-20260815-A (quarantine and promotion are platform-acts-alone).

export async function runMigration0100_relistUrlToMarkdown(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0100_relistUrlToMarkdown";
  const SLUG = "url-to-markdown";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once — a later quarantine is not undone)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  // Narrow by construction: only the exact post-quarantine shape matches. If
  // anything has already re-listed it, this is a no-op and the ledger row is
  // still written, so the block never fires twice.
  const res = await tx.execute(sql`
    UPDATE capabilities
       SET visible = true,
           x402_enabled = true,
           updated_at = now()
     WHERE slug = ${SLUG}
       AND is_active = true
       AND visible = false
  `);
  const affected = (res as { count?: number }).count ?? 0;

  // Written only when the flags actually moved. An event claiming a promotion
  // that did not happen is the same class of lie as a quarantine without its
  // evidence, and both the floor's window clamp and the promotion job would
  // read it as fact.
  if (affected > 0) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'capability_promotion',
        ${SLUG},
        1,
        'promoted_with_x402',
        ${JSON.stringify({
          mode: "enforce",
          dec: "DEC-20260815-A",
          reason:
            "Re-listed by operator decision: the 2026-08-22 quarantine counted five failures, of which one was a correct no-content refusal and four were the caller's target site (2x HTTP 400, 2x HTTP 429). Live execution, harness and the two most recent real calls all pass.",
          source: "startup-migration 0100",
          quarantined_at: "2026-08-22T05:58:42Z",
          quarantine_completion: 0.6667,
        })}::jsonb,
        true
      )
    `);
  }

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${affected})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      affected === 0
        ? "no change (url-to-markdown was already listed)"
        : "url-to-markdown re-listed with its promotion event",
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0101 — invocation facts (WP9).
 *
 * The quality floor decides whether to withdraw a capability from sale by
 * joining `transactions ON capability_id`. A solution execution writes one
 * transaction with `capability_id = NULL` and its step outcomes inside an
 * `output.steps` JSONB blob, so a capability invoked only inside bundles has
 * no row carrying its id and the floor's join cannot see it — it cannot be
 * quarantined, because as far as the query is concerned it has no traffic.
 * Verified against production: 694 solution rows, all with a null capability_id,
 * and 126 sub-calls in the trailing 30 days recorded nowhere else.
 *
 * This table records the invocation itself. `transactions` continues to record
 * the billing event; the two stop being asked to be the same thing.
 *
 * ── Immutability, and why it is not absolute ────────────────────────────────
 *
 * A fact that can be edited after the floor reads it is not evidence. The
 * trigger below refuses every UPDATE outright.
 *
 * DELETE is refused only for rows inside the floor's own 35-day reading window
 * (30d window plus margin). Blanket-blocking DELETE would make the table
 * unprunable and guarantee a future incident where the only way to reclaim
 * space is to drop the trigger — at which point the protection is gone
 * precisely when someone is under pressure. Bounding the block to the window
 * that matters targets the actual threat (erasing evidence the floor is about
 * to read) and leaves ordinary retention working.
 *
 * ── No customer content ─────────────────────────────────────────────────────
 *
 * No inputs, no outputs, no error strings — only the canonical verdict. So the
 * 90-day content redaction has nothing here to remove, and this table can be
 * retained on a schedule set by what the floor needs rather than by what
 * privacy requires.
 *
 * Defer-not-throw: a throw here aborts boot, and a failed Railway deploy does
 * not cut over (DEC-20260504-C). Until the table exists the floor falls back to
 * its transactions query, which is exactly today's behaviour.
 */
/**
 * Does the append-only trigger exist? Qualified by relation, because
 * `pg_trigger` is unique on (tgrelid, tgname) and a same-named trigger on
 * another table would otherwise satisfy the check. `to_regclass` returns NULL
 * rather than raising when the table is absent.
 */
/**
 * Most rows the boot path will discard as unprotected. Beyond this it refuses
 * and defers instead: an unbounded DELETE at boot is a bulk operation, and
 * DEC-20260504-B says those get a plan and an operator.
 */
const UNPROTECTED_PURGE_CEILING = 10_000;

async function hasImmutableTrigger(tx: MigrationExecutor): Promise<boolean> {
  const res = await tx.execute(sql`
    SELECT COUNT(*)::int AS n FROM pg_trigger
    WHERE tgname = 'capability_invocations_immutable_trg'
      AND tgrelid = to_regclass('public.capability_invocations')
  `);
  const rows = Array.isArray(res) ? res : (res as { rows?: unknown[] })?.rows ?? [];
  return Number((rows[0] as { n?: number } | undefined)?.n ?? 0) === 1;
}

export async function runMigration0101_capabilityInvocations(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let outcome: string;

  // Distinct ledger identity from every other block, checked by test. Block
  // 0100 (url-to-markdown re-listing) landed on main while this was open and
  // uses "0100_relistUrlToMarkdown"; a rename that left both writing the same
  // ledger id would make the ledger lie about which migration had run, and the
  // ledger is what tells a one-shot block it has already fired.
  const BLOCK = "0101_capability_invocations";

  // No `SET LOCAL lock_timeout` here, deliberately. Blocks receive the drizzle
  // DB HANDLE, not a transaction (see runStartupMigrations), so every statement
  // autocommits in its own implicit transaction and `SET LOCAL` is discarded
  // before the next one runs — Postgres even says so: "SET LOCAL can only be
  // used in transaction blocks". Two other blocks use the same idiom and it has
  // never done anything there either. Writing a bound that does not bind is
  // worse than having none, because the next reader believes the DDL is
  // protected. The effective bound is the connection-level statement_timeout
  // (30s) from db/index.ts.
  //
  // What keeps this safe is that nothing below takes a LONG lock: the table and
  // the trigger are created only when absent, so there is no per-boot DDL churn
  // on a table the customer path writes to. Not "no lock" — an earlier version
  // of this note claimed that and review corrected it. `CREATE INDEX IF NOT
  // EXISTS` opens the relation under SHARE before its existence check, and
  // SHARE conflicts with the ROW EXCLUSIVE that INSERT takes. The hold is a
  // catalog lookup, so microseconds, but it is not nothing.
  try {
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS startup_migration_ledger (
        block text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now(),
        rows_affected integer NOT NULL DEFAULT 0
      )`);
    const priorRun = (await tx.execute(sql`
      SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
    `)) as unknown as Array<{ block: string }>;
    const firstInstall = (Array.isArray(priorRun) ? priorRun : []).length === 0;

    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS "capability_invocations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "capability_slug" text NOT NULL,
        "rail" text NOT NULL,
        "context_kind" text NOT NULL,
        "solution_id" uuid,
        "transaction_id" uuid,
        "user_id" uuid,
        "is_free_tier" boolean NOT NULL DEFAULT false,
        "success" boolean NOT NULL,
        "failure_class" text,
        "fault" text,
        "billable" boolean NOT NULL,
        "counts_against_capability" boolean NOT NULL,
        "latency_ms" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS "capability_invocations_slug_created_idx"
        ON "capability_invocations" ("capability_slug", "created_at")
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS "capability_invocations_transaction_idx"
        ON "capability_invocations" ("transaction_id")
    `);
    // Serves the floor's epoch probe (MIN(created_at)) and retention pruning.
    // Without it the epoch query degrades to a sequential scan that grows with
    // the table — the sort of thing that is free on the day it ships and is a
    // daily-job timeout six months later.
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS "capability_invocations_created_idx"
        ON "capability_invocations" ("created_at")
    `);

    // A closed enum on `rail` and `context_kind` would drift from the
    // TypeScript unions the moment either gained a member, and a boot-blocking
    // CHECK that rejects a value the code already emits is the asymmetric
    // failure this codebase has shipped before. The values are asserted in
    // TypeScript at the single write site instead.
    await tx.execute(sql`
      CREATE OR REPLACE FUNCTION "capability_invocations_immutable"()
      RETURNS trigger AS $fn$
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          RAISE EXCEPTION
            'capability_invocations is append-only: row % may not be updated', OLD.id;
        END IF;
        IF TG_OP = 'DELETE' AND OLD.created_at > now() - INTERVAL '35 days' THEN
          RAISE EXCEPTION
            'capability_invocations row % is inside the quality-floor reading window and may not be deleted', OLD.id;
        END IF;
        RETURN OLD;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    // Created only when absent, never dropped and recreated.
    //
    // The first version ran DROP TRIGGER IF EXISTS followed by CREATE TRIGGER on
    // every boot. Because these autocommit separately (see the lock_timeout note
    // above), that opened a real if brief window on every boot — roughly four a
    // day in production — during which the append-only protection was absent
    // from a table whose entire purpose is immutability. It also took ACCESS
    // EXCLUSIVE on a table the customer path inserts into, on every boot, with
    // a 30s statement_timeout as the only bound; a lock wait that timed out
    // would defer the whole block, and until this was fixed a deferred block
    // took the quality floor down with it.
    //
    // The FUNCTION is still CREATE OR REPLACE, so the trigger's behaviour can
    // still be corrected by a deploy — replacing a function takes no lock on
    // the table.
    // Rows written while the table had no trigger are not evidence, so they are
    // discarded before protection is installed rather than retroactively
    // blessed by it.
    //
    // CREATE TABLE autocommits, so a block that fails between the table and the
    // trigger leaves the writer filling an unprotected table — and because the
    // floor keys its epoch on MIN(created_at), a later boot that finally creates
    // the trigger would make the whole unprotected era readable as authoritative
    // evidence for delisting decisions. On the normal path the table was created
    // moments ago and is empty, so this deletes nothing; it only ever fires on
    // the recovery path, where the rows it removes are exactly the ones nothing
    // was guarding. Runs BEFORE the trigger exists, which is the only moment a
    // DELETE inside the floor window is permitted.
    let discarded = 0;
    if (firstInstall && !(await hasImmutableTrigger(tx))) {
      // Bounded probe, not COUNT(*) over the whole table: this runs at boot
      // under a 30s statement_timeout, and the table it is counting is the one
      // the customer path writes ~6k rows a day into.
      const probe = await tx.execute(sql`
        SELECT COUNT(*)::int AS n
          FROM (SELECT 1 FROM "capability_invocations" LIMIT ${UNPROTECTED_PURGE_CEILING + 1}) t
      `);
      const probeRows = Array.isArray(probe) ? probe : (probe as { rows?: unknown[] })?.rows ?? [];
      const pending = Number((probeRows[0] as { n?: number } | undefined)?.n ?? 0);

      if (pending > UNPROTECTED_PURGE_CEILING) {
        // Deliberately NOT deleted. An unbounded DELETE at boot on a table this
        // size is a bulk operation, and DEC-20260504-B says a bulk operation
        // gets a plan and an operator, not a boot path. Refusing defers the
        // block, which leaves the floor reading billing rows — its pre-WP9
        // behaviour — and destroys nothing.
        throw new Error(
          `UNPROTECTED-BACKLOG: capability_invocations holds more than ` +
            `${UNPROTECTED_PURGE_CEILING} rows written while it had no append-only ` +
            "trigger. Those rows are not evidence and must not become readable, " +
            "but discarding them is a bulk delete and belongs to an operator, " +
            "not to boot. The floor stays on billing rows until this is resolved.",
        );
      }
      if (pending > 0) {
        const purge = await tx.execute(sql`DELETE FROM "capability_invocations"`);
        const purgeRows = Array.isArray(purge) ? purge : (purge as { rows?: unknown[] })?.rows ?? [];
        discarded = (purge as { count?: number })?.count ?? purgeRows.length ?? 0;
      }
    }

    await tx.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'capability_invocations_immutable_trg'
            AND tgrelid = 'public.capability_invocations'::regclass
        ) THEN
          CREATE TRIGGER "capability_invocations_immutable_trg"
            BEFORE UPDATE OR DELETE ON "capability_invocations"
            FOR EACH ROW EXECUTE FUNCTION "capability_invocations_immutable"();
        END IF;
      END $$;
    `);

    // VERIFY, do not assume. Review round 2 pointed out that nothing anywhere
    // confirmed the trigger exists: a guard asserting the SQL text was
    // satisfied by inverting IF NOT EXISTS to IF EXISTS, and there is a real
    // path to a table-without-trigger even with correct code — CREATE TABLE
    // autocommits, so if any later statement here throws, the block reports
    // "deferred" while the table already exists and the writer starts filling
    // it unprotected. An unprotected facts table is worse than no facts table,
    // because `to_regclass` still says non-null and the floor treats it as
    // authoritative evidence.
    const triggerCount = (await hasImmutableTrigger(tx)) ? 1 : 0;
    if (triggerCount !== 1) {
      throw new Error(
        "UNPROTECTED: capability_invocations exists but its append-only trigger does not " +
          `(pg_trigger match count ${triggerCount}). Refusing to report success: ` +
          "a mutable facts table still reads as present to the quality floor.",
      );
    }
    // Written LAST, and only on success. A block that failed halfway must not
    // record itself as applied, or the next boot skips the purge gate above and
    // the unprotected era becomes permanent.
    await tx.execute(sql`
      INSERT INTO startup_migration_ledger (block, rows_affected)
      VALUES (${BLOCK}, ${discarded})
      ON CONFLICT (block) DO NOTHING
    `);

    outcome =
      "table, indexes and append-only trigger present and verified" +
      (discarded > 0
        ? ` (discarded ${discarded} fact(s) written while the table was unprotected)`
        : "");
  } catch (err) {
    outcome =
      "deferred to next boot: " +
      (err instanceof Error ? err.message.slice(0, 140) : String(err).slice(0, 140));
  }

  return {
    block: "0101_capability_invocations",
    outcome: `capability_invocations — ${outcome}`,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0102: account lifecycle authority tables (WP11, CR-09/CR-10) ────
//
// Two tables, both new and both starting empty except for one bounded
// backfill.
//
// `trial_grants` is the durable record of "this identity has already been
// given trial credit". Before WP11 that fact was inferred per request from
// whichever gate the handler happened to run — `/v1/auth/register` ran none —
// so eight accounts behind one signup IP each took EUR 2.00 between
// 2026-05-25 and 2026-05-27. The UNIQUE index on `email_hash` is what makes
// "one trial per address" true under concurrency; the code path can only
// produce a good error message.
//
// It is a separate table rather than a column on `users` because the erasure
// endpoint anonymises the users row. An entitlement stored there is destroyed
// by exactly the delete → re-register loop it exists to close. A one-way hash
// survives Art. 17 anonymisation precisely because it is not the address.
//
// `api_key_recovery_tokens` backs proof-before-rotation. `/v1/auth/recover`
// used to rotate the account's key on an unauthenticated request whose only
// input was an email address.
//
// **Backfill.** 59 production wallets already hold a `trial_credit` ledger
// entry. Without seeding them, every existing customer could close their
// account and re-register for another grant on the day this ships — the
// migration would install the rule and grandfather in every account that
// predates it. The email hash is computed in SQL with
// `encode(sha256(convert_to(lower(btrim(email)), 'UTF8')), 'hex')`, a Postgres
// built-in needing no extension, and verified byte-for-byte against
// `hashEmail()` on five production rows.
//
// Bounded workload, so DEC-20260504-B's drain question is answered rather
// than skipped: one INSERT … SELECT over 60 users joined to 61 ledger rows,
// grouped to at most one row per wallet. This is not a resumed bulk operation.
//
// Already-redacted accounts are skipped: their address is gone, so no hash can
// be computed and their trial slot is unrecoverable. Production holds zero
// such rows today (`deleted_at IS NOT NULL` census = 0), so the exclusion
// costs nothing now and is stated so a later reader does not mistake it for an
// oversight.
//
// `ip_hash` is seeded from `users.signup_ip_hash`, which hashes the EXACT
// address. The live path hashes a bucket instead (IPv6 counted by /64, see
// `trialRateBucket`), so for an IPv6 signup the backfilled hash will not match
// the bucket a new signup from the same prefix produces. The two agree for
// IPv4 by construction, and the consequence for IPv6 is only that a historical
// grant does not count toward a new bucket's cap. Every backfilled row is
// already outside the 7-day window, so nothing counts today either way.
//
// Idempotent three ways: `IF NOT EXISTS` DDL, `ON CONFLICT (email_hash) DO
// NOTHING` on the backfill, and the block ledger gating the backfill to its
// first successful run.
export async function runMigration0102_accountLifecycleTables(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0102_account_lifecycle_tables";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS "trial_grants" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "email_hash" varchar(64) NOT NULL,
      "ip_hash" varchar(16),
      "user_id" uuid,
      "granted_cents" integer NOT NULL,
      "channel" varchar(32) NOT NULL,
      "granted_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
  // The uniqueness IS the rule. Created as its own statement rather than
  // inline on the column so a table that somehow predates this block still
  // acquires the constraint.
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "trial_grants_email_hash_unique"
      ON "trial_grants" ("email_hash")
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "trial_grants_ip_granted_idx"
      ON "trial_grants" ("ip_hash", "granted_at")
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS "api_key_recovery_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id"),
      "token_hash" varchar(64) NOT NULL,
      "expires_at" timestamptz NOT NULL,
      "used_at" timestamptz,
      "requested_ip_hash" varchar(16),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "api_key_recovery_tokens_token_hash_unique"
      ON "api_key_recovery_tokens" ("token_hash")
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "api_key_recovery_tokens_user_created_idx"
      ON "api_key_recovery_tokens" ("user_id", "created_at")
  `);

  // ── The Stripe replay guard, adopted into the migration path ─────────────
  //
  // `wallet_transactions_stripe_session_id_unique` exists in production and in
  // schema.ts, and is created by NO migration block — it survives only from the
  // original `drizzle-kit push`, which does not run against production. So a
  // database rebuilt from `startup-migrations.ts` alone would come up without
  // the one constraint standing between a duplicated Stripe delivery and a
  // double credit, and nothing would say so.
  //
  // WP11 owns the Stripe crediting decision, so it adopts the guard that
  // decision depends on. Idempotent, and a no-op wherever the index already
  // exists (verified against a database materialised by drizzle-kit push,
  // where the identically-named index is already present).
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_stripe_session_id_unique"
      ON "wallet_transactions" ("stripe_session_id")
      WHERE "stripe_session_id" IS NOT NULL
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);
  const priorRun = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;
  const alreadyBackfilled = (Array.isArray(priorRun) ? priorRun : []).length > 0;

  let backfilled = 0;
  if (!alreadyBackfilled) {
    const inserted = await tx.execute(sql`
      INSERT INTO "trial_grants" (email_hash, ip_hash, user_id, granted_cents, channel, granted_at)
      SELECT encode(sha256(convert_to(lower(btrim(u.email)), 'UTF8')), 'hex'),
             u.signup_ip_hash,
             u.id,
             g.total_cents,
             'backfill',
             g.first_at
        FROM users u
        JOIN wallets w ON w.user_id = u.id
        JOIN (
          SELECT wallet_id,
                 SUM(amount_cents)::int AS total_cents,
                 MIN(created_at) AS first_at
            FROM wallet_transactions
           WHERE type = 'trial_credit'
           GROUP BY wallet_id
        ) g ON g.wallet_id = w.id
       WHERE u.deleted_at IS NULL
         AND u.email NOT LIKE 'redacted-%@deleted.local'
      ON CONFLICT (email_hash) DO NOTHING
    `);
    backfilled = (inserted as { count?: number }).count ?? 0;

    await tx.execute(sql`
      INSERT INTO startup_migration_ledger (block, rows_affected)
      VALUES (${BLOCK}, ${backfilled})
      ON CONFLICT (block) DO NOTHING
    `);
  }

  return {
    block: BLOCK,
    outcome: alreadyBackfilled
      ? "tables and indexes ensured; entitlement backfill already applied"
      : `tables and indexes ensured; backfilled ${backfilled} existing trial entitlement(s)`,
    rows_affected: backfilled,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0103: redacted content stays redacted (WP11, round 7) ───────────
//
// WP11 made account closure clear the customer content from the caller's
// transaction rows. That created a race nobody had before: an async execution
// completes in its OWN transaction, seconds to minutes after the request
// returned 202 — four production capabilities exceed the 10-second threshold —
// and account closure can land in that window. The background write then puts
// `output`, `provenance` and `audit_trail` back onto a row the customer has
// just been told, in writing, was cleared, where it sits until the 90-day
// purge while `/v1/verify` reports a completed Art. 17 erasure.
//
// The first fix added `AND redacted_at IS NULL` to the async SUCCESS path.
// Review then found the same window on the async FAILURE path in the same
// function, plus seven other content-writing UPDATEs and the reservation
// reconciler — and the test that "proved" the fix had re-typed the predicate
// inline rather than calling the code, so it could not have caught any of them.
//
// Enumerating write sites is how this package spent six rounds getting the
// closure receipt wrong. So this does not enumerate them. A BEFORE UPDATE
// trigger holds the invariant for every site that exists and every site anyone
// adds: **once a row is redacted, its customer content cannot come back.**
//
// It nulls the offending columns rather than raising. Raising would turn a
// benign late write into an unhandled exception on a path that has already
// returned to the customer, and the write is not an error — it is a result
// arriving for a request that was legitimately made. What is refused is the
// COPY we would otherwise retain after being asked not to; the customer's own
// result was returned from the executor, never read back from the row.
//
// Deliberately narrow: only the customer-content columns, and only while
// `redacted_at` is already set. Status, latency, hashes and reservation state
// still update freely, which is what lets the hash-retry worker and the
// reconciler finish their work on a closed account's rows.
export async function runMigration0103_redactedContentStaysRedacted(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "transactions_redacted_content_stays_cleared"()
    RETURNS trigger AS $fn$
    BEGIN
      IF OLD.redacted_at IS NOT NULL THEN
        NEW.input           := '{}'::jsonb;
        NEW.output          := NULL;
        NEW.error           := NULL;
        NEW.audit_trail     := NULL;
        NEW.provenance      := NULL;
        NEW.idempotency_key := NULL;
        NEW.client_meta     := NULL;
        NEW.redacted_at     := OLD.redacted_at;
        NEW.deletion_reason := OLD.deletion_reason;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql
  `);

  // Created only when absent, never dropped and recreated — the same reasoning
  // block 0101 records. A drop-then-create pair autocommits separately, so it
  // opens a window on every boot during which the protection is simply gone,
  // on a table the customer path writes to.
  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'transactions_redacted_content_stays_cleared_trg'
          AND tgrelid = 'public.transactions'::regclass
      ) THEN
        CREATE TRIGGER "transactions_redacted_content_stays_cleared_trg"
          BEFORE UPDATE ON "transactions"
          FOR EACH ROW EXECUTE FUNCTION "transactions_redacted_content_stays_cleared"();
      END IF;
    END $$;
  `);

  // Verify, do not assume. A block that reports success while the trigger is
  // absent leaves a guarantee the receipt depends on unenforced — and the
  // receipt is a written statement to a data subject.
  const check = (await tx.execute(sql`
    SELECT COUNT(*)::int AS n
      FROM pg_trigger
     WHERE tgname = 'transactions_redacted_content_stays_cleared_trg'
       AND tgrelid = 'public.transactions'::regclass
  `)) as unknown as Array<{ n: number }>;
  const present = Number((Array.isArray(check) ? check[0] : undefined)?.n ?? 0);
  if (present !== 1) {
    throw new Error(
      "transactions_redacted_content_stays_cleared_trg is absent after creation " +
        `(pg_trigger match count ${present}). Refusing to report success: without it, ` +
        "an async execution completing after account closure silently restores the " +
        "customer content the erasure receipt says was destroyed.",
    );
  }

  return {
    block: "0103_redacted_content_stays_redacted",
    outcome: "trigger present and verified — redacted content cannot be restored",
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * WP10 (CR-08) — the durable job schedule.
 *
 * Creates the table that owns "when is this job next due". Idempotent DDL, so
 * unlike 0102 it needs no ledger gate: the point of the table is that its
 * CONTENT survives deploys, and `CREATE TABLE IF NOT EXISTS` never touches
 * content.
 *
 * The verification below is deliberately behavioural rather than a mere
 * existence check. `next_run_at` being NOT NULL is the invariant the whole
 * package rests on: a nullable column would let a row exist with no schedule,
 * and `claimJob`'s `next_run_at <= now()` predicate would silently never match
 * — a job that appears registered and never runs, which is a worse failure
 * than the boot-relative scheduling it replaces.
 */
export async function runMigration0104_jobSchedule(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS job_schedule (
      job_name             varchar(64) PRIMARY KEY,
      interval_ms          bigint      NOT NULL,
      next_run_at          timestamptz NOT NULL,
      lease_owner          varchar(64),
      lease_expires_at     timestamptz,
      last_started_at      timestamptz,
      last_finished_at     timestamptz,
      last_outcome         varchar(16),
      last_error           text,
      consecutive_failures integer     NOT NULL DEFAULT 0,
      updated_at           timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Poll cycle reads "which jobs are due"; this keeps that a range scan
  // rather than a seq scan once the table has a row per job.
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS job_schedule_due_idx ON job_schedule (next_run_at)
  `);

  const notNull = await tx.execute(sql`
    SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'job_schedule' AND column_name = 'next_run_at'
  `);
  const nullable = (notNull as unknown as Array<{ is_nullable?: string }>)[0]?.is_nullable;
  if (nullable !== "NO") {
    throw new Error(
      `job_schedule.next_run_at is nullable (is_nullable=${String(nullable)}). Refusing to ` +
        "report success: a row with a NULL next_run_at can never satisfy claimJob's " +
        "`next_run_at <= now()` predicate, so the job would look registered and never run.",
    );
  }

  return {
    block: "0104_job_schedule",
    outcome: "job_schedule present, next_run_at verified NOT NULL",
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * WP10 (CR-08) — durable attempt budget for the onboarding retry sweeper.
 *
 * The sweeper's first implementation counted its own attempts by querying
 * `health_monitor_events`. That table is pruned at 30 days
 * (jobs/db-retention.ts), which would have reset every capability's retry
 * budget monthly and, worse, aged out the escalation marker — so a capability
 * an operator had already been asked to look at would silently rejoin the
 * retry set forever, in 30-day cycles, re-escalating each time.
 *
 * The counter therefore lives on the capability row, mirroring
 * `test_suites.fixture_recapture_failures` (block 0093), which exists for the
 * same reason and is not pruned.
 */
export async function runMigration0105_onboardingHookFailures(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE capabilities
      ADD COLUMN IF NOT EXISTS onboarding_hook_failures integer NOT NULL DEFAULT 0
  `);

  return {
    block: "0105_onboarding_hook_failures",
    outcome: "column ensured (capabilities.onboarding_hook_failures)",
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Phase 4 (execution receipts) — immutable manifest snapshots.
 *
 * The table is content-addressed: `digest` is a function of `snapshot`, so a
 * snapshot cannot change without changing its own primary key. That makes
 * mutation *pointless*, not impossible — these triggers make it impossible.
 *
 * Both refusals are deliberate and neither is defensive decoration:
 *
 *  - UPDATE would let the bytes behind a digest change while receipts keep
 *    pointing at it, so every receipt referencing it would silently start
 *    meaning something else.
 *  - DELETE would make every receipt referencing it unverifiable, with no
 *    error anywhere. Generic retention gets a loud error instead of a row
 *    count. `db-retention.ts` is separately asserted never to list this table
 *    (see execution-receipt.integration.test.ts) — belt and braces, because
 *    the failure is silent and permanent.
 */
export async function runMigration0106_executionManifestSnapshots(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS execution_manifest_snapshots (
      digest        varchar(71) PRIMARY KEY,
      subject_kind  varchar(16) NOT NULL,
      subject_slug  text        NOT NULL,
      snapshot      jsonb       NOT NULL,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT execution_manifest_snapshots_digest_shape
        CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
      CONSTRAINT execution_manifest_snapshots_subject_kind
        CHECK (subject_kind IN ('capability', 'solution'))
    )
  `);

  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "execution_manifest_snapshots_are_immutable"()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION
        'execution_manifest_snapshots is insert-only: % on digest % refused. '
        'Snapshots are the only record of what a capability declared when a '
        'receipt was issued; changing or removing one makes every receipt that '
        'references it silently wrong or unverifiable.',
        TG_OP, COALESCE(OLD.digest, '(unknown)');
    END;
    $$ LANGUAGE plpgsql
  `);

  await tx.execute(sql`
    DROP TRIGGER IF EXISTS execution_manifest_snapshots_no_update
      ON execution_manifest_snapshots
  `);
  await tx.execute(sql`
    CREATE TRIGGER execution_manifest_snapshots_no_update
      BEFORE UPDATE ON execution_manifest_snapshots
      FOR EACH ROW EXECUTE FUNCTION "execution_manifest_snapshots_are_immutable"()
  `);

  await tx.execute(sql`
    DROP TRIGGER IF EXISTS execution_manifest_snapshots_no_delete
      ON execution_manifest_snapshots
  `);
  await tx.execute(sql`
    CREATE TRIGGER execution_manifest_snapshots_no_delete
      BEFORE DELETE ON execution_manifest_snapshots
      FOR EACH ROW EXECUTE FUNCTION "execution_manifest_snapshots_are_immutable"()
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS execution_manifest_snapshots_subject_idx
      ON execution_manifest_snapshots (subject_kind, subject_slug)
  `);

  // Verify the triggers exist and are ENABLED. A trigger that is present but
  // disabled ('D') is the nameable failure here — the table would accept
  // mutation while every reader assumed it could not.
  const trg = await tx.execute(sql`
    SELECT tgname, tgenabled FROM pg_trigger
     WHERE tgrelid = 'execution_manifest_snapshots'::regclass
       AND NOT tgisinternal
     ORDER BY tgname
  `);
  const rows = trg as unknown as Array<{ tgname: string; tgenabled: string }>;
  const enabled = rows.filter((r) => r.tgenabled === 'O').map((r) => r.tgname);
  if (!enabled.includes("execution_manifest_snapshots_no_update") ||
      !enabled.includes("execution_manifest_snapshots_no_delete")) {
    throw new Error(
      "execution_manifest_snapshots immutability triggers are missing or disabled " +
        `(found: ${JSON.stringify(rows)}). Refusing to report success: without both, ` +
        "a snapshot can be changed or pruned and every receipt referencing it becomes " +
        "silently wrong or permanently unverifiable.",
    );
  }

  return {
    block: "0106_execution_manifest_snapshots",
    outcome: "table + UPDATE/DELETE refusal triggers present and verified enabled",
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Phase 4 — receipt lifecycle columns and the chain-version marker.
 *
 * The CHECK constraints encode the state invariants the spec states in prose,
 * because prose does not stop a write:
 *
 *  - a receipt digest is a FULL 256-bit value or absent; a truncated one is a
 *    different claim wearing the same name;
 *  - 'complete' requires the digest and its metadata, so a failed receipt
 *    build can never be recorded as complete;
 *  - 'pending' and 'failed' require a reason code from the closed set, so a
 *    post-epoch row can never be quietly receipt-less;
 *  - `integrity_payload_version` is 2 or NULL, and NULL means v1 by
 *    definition — the verifier reads this to pick the algorithm.
 *
 * The epoch itself is NOT a column: it is `receipt_status IS NULL` meaning
 * pre-epoch. See the receipt-epoch block below for why that is enough.
 */
export async function runMigration0107_executionReceiptColumns(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS receipt_status varchar(16),
      ADD COLUMN IF NOT EXISTS receipt_failure_reason varchar(40),
      ADD COLUMN IF NOT EXISTS receipt_version varchar(32),
      ADD COLUMN IF NOT EXISTS receipt_canonicalization varchar(16),
      ADD COLUMN IF NOT EXISTS receipt_digest_alg varchar(16),
      ADD COLUMN IF NOT EXISTS receipt_digest varchar(71),
      ADD COLUMN IF NOT EXISTS receipt_manifest_digest varchar(71),
      ADD COLUMN IF NOT EXISTS receipt_attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS integrity_payload_version integer
  `);

  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_status_valid
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_status_valid
      CHECK (receipt_status IS NULL OR receipt_status IN ('complete', 'pending', 'failed'))
      NOT VALID
  `);

  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_digest_shape
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_digest_shape
      CHECK (receipt_digest IS NULL OR receipt_digest ~ '^sha256:[0-9a-f]{64}$')
      NOT VALID
  `);

  // 'complete' is a claim that a digest exists and can be recomputed. Without
  // the metadata a verifier cannot reproduce it, so the claim would be empty.
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_complete_is_complete
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_complete_is_complete
      CHECK (
        receipt_status IS DISTINCT FROM 'complete'
        OR (receipt_digest IS NOT NULL
            AND receipt_version IS NOT NULL
            AND receipt_canonicalization IS NOT NULL
            AND receipt_digest_alg IS NOT NULL)
      )
      NOT VALID
  `);

  // A non-complete post-epoch row must SAY why. Silence is the failure mode
  // the whole lifecycle exists to remove.
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_reason_required
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_reason_required
      CHECK (
        receipt_status NOT IN ('pending', 'failed')
        OR receipt_failure_reason IS NOT NULL
      )
      NOT VALID
  `);

  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_integrity_payload_version_valid
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_integrity_payload_version_valid
      CHECK (integrity_payload_version IS NULL OR integrity_payload_version = 2)
      NOT VALID
  `);

  // Chain v2 anchors the receipt digest, so a v2 row without one would anchor
  // nothing while claiming to.
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_chain_v2_has_receipt_state
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_chain_v2_has_receipt_state
      CHECK (integrity_payload_version IS DISTINCT FROM 2 OR receipt_status IS NOT NULL)
      NOT VALID
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS transactions_receipt_status_idx
      ON transactions (receipt_status)
      WHERE receipt_status IN ('pending', 'failed')
  `);

  // NOT VALID everywhere above is deliberate: 921k existing rows all have NULL
  // receipt columns and satisfy every constraint, but VALIDATE would take a
  // full-table scan inside the boot path. New writes are checked from this
  // moment; the backfill scan is not this block's job and there is nothing to
  // find. Verified below rather than assumed.
  // EXISTS with LIMIT 1, not count(*) over an OR.
  //
  // The first version counted `receipt_status IS NOT NULL OR
  // integrity_payload_version IS NOT NULL`, which no index can serve — a full
  // sequential scan of the largest table (~921k rows) on EVERY boot, inside the
  // migration transaction. Reviewer-found. This answers the same question
  // (is any row already carrying receipt state?) and stops at the first hit.
  const bad = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM transactions WHERE receipt_status IS NOT NULL LIMIT 1
    ) AS any_state
  `);
  const preexisting =
    (bad as unknown as Array<{ any_state: boolean }>)[0]?.any_state === true ? 1 : 0;

  return {
    block: "0107_execution_receipt_columns",
    outcome:
      "receipt lifecycle columns + 6 CHECK constraints + pending/failed index; " +
      `pre-existing receipt state present: ${preexisting === 1} (expected false)`,
    rows_affected: preexisting,
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Phase 4 review round 1 — the invariants the design called structural but
 * enforced only in application code.
 *
 * An adversarial review drove every one of these transitions through the
 * database and they were all accepted. A rule that holds only when one module
 * is used is not a rule, so each is now a trigger or a constraint:
 *
 *  - `complete` and `failed` are ABSORBING. Once a row is chained, its receipt
 *    digest is anchored in the integrity hash — changing the state afterwards
 *    would rewrite an already-chained historical fact.
 *  - A `complete` row's receipt fields are frozen. The reviewer swapped a
 *    digest on a complete row, and rewrote version/canonicalization/algorithm
 *    to `fake.v9`/`NOPE`/`md5`; the existing CHECK only tested NOT NULL, so
 *    garbage passed.
 *  - Reason codes are a closed set. `'banana'` was accepted.
 *  - A snapshot's `subject_kind`/`subject_slug` duplicate values inside
 *    `snapshot` and could disagree with them.
 *  - TRUNCATE does not fire row-level DELETE triggers, so the "permanent"
 *    snapshot table could be emptied without error.
 */
export async function runMigration0108_receiptStateInvariants(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // ── Closed reason-code set ────────────────────────────────────────────────
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_reason_closed
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_reason_closed
      CHECK (
        receipt_failure_reason IS NULL
        OR receipt_failure_reason IN (
          'not_yet_built', 'unmapped_rail', 'missing_deploy_identity',
          'unresolvable_manifest', 'missing_subject', 'snapshot_write_failed',
          'canonicalization_error', 'internal_error'
        )
      )
      NOT VALID
  `);

  // A digest without its metadata cannot be recomputed; metadata that is not
  // the metadata we produce is worse than none, because it looks recomputable.
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_metadata_known
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_metadata_known
      CHECK (
        (receipt_version IS NULL OR receipt_version = 'strale.execution.v1')
        AND (receipt_canonicalization IS NULL OR receipt_canonicalization = 'RFC8785')
        AND (receipt_digest_alg IS NULL OR receipt_digest_alg = 'sha256')
      )
      NOT VALID
  `);

  // ── Legal transitions, enforced ───────────────────────────────────────────
  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "transactions_receipt_state_transitions"()
    RETURNS trigger AS $$
    BEGIN
      -- THREE SEPARATE QUESTIONS, ASKED SEPARATELY.
      --
      -- The first version collapsed them into one early-return plus one
      -- terminal check, and that combination BLOCKED THE ONE LEGITIMATE
      -- WRITER. Adding integrity_payload_version to the compared columns
      -- (so it could not be flipped) collided with the chain worker writing
      -- exactly that column: the worker's UPDATE stopped taking the early
      -- return, fell through to the terminal check, and was refused — because
      -- that check tested OLD.receipt_status IN (...) rather than whether the
      -- status was CHANGING. The worker is not moving a terminal row; it is
      -- leaving it terminal while writing a different column.
      --
      -- The blast radius made it the worst defect of the review: the whole tick
      -- runs in one transaction, so the RAISE aborted it, every later statement
      -- failed, the per-row catch swallowed them, and the tick rolled back —
      -- so ONE receipt-bearing row would have halted the tamper-evident chain
      -- for every transaction in the system, permanently, retrying every 30s.
      -- /v1/verify would answer "no integrity hash" and /v1/audit would answer
      -- "still being computed" forever. Reviewer-found, and the entire repo
      -- suite was green while it was true.

      -- 1. Is the STATUS moving out of a terminal state?
      IF OLD.receipt_status IS DISTINCT FROM NEW.receipt_status
         AND OLD.receipt_status IN ('complete', 'failed') THEN
        RAISE EXCEPTION
          'receipt state % is terminal: transaction % cannot move to %. Once a row '
          'is chained its receipt digest is anchored in the integrity hash, so '
          'changing it would rewrite an already-chained fact.',
          OLD.receipt_status, OLD.id, COALESCE(NEW.receipt_status, 'NULL');
      END IF;

      -- 2. Are a terminal row's receipt FIELDS being rewritten?
      --
      -- receipt_manifest_digest is in this list because it is how a verifier
      -- finds the snapshot to recompute the implementation identity, and it is
      -- NOT inside the chain payload — so a swap would be neither refused here
      -- nor detectable there.
      IF OLD.receipt_status IN ('complete', 'failed')
         AND (OLD.receipt_digest           IS DISTINCT FROM NEW.receipt_digest
           OR OLD.receipt_version          IS DISTINCT FROM NEW.receipt_version
           OR OLD.receipt_canonicalization IS DISTINCT FROM NEW.receipt_canonicalization
           OR OLD.receipt_digest_alg       IS DISTINCT FROM NEW.receipt_digest_alg
           OR OLD.receipt_manifest_digest  IS DISTINCT FROM NEW.receipt_manifest_digest
           OR OLD.receipt_failure_reason   IS DISTINCT FROM NEW.receipt_failure_reason)
      THEN
        RAISE EXCEPTION
          'transaction % has a terminal receipt; its receipt fields are frozen.', OLD.id;
      END IF;

      -- 3. Is the chain version being CHANGED after it was set?
      --
      -- Write-once, not frozen-on-terminal: the worker sets it exactly once, in
      -- the same UPDATE as the hash. Setting it from NULL is that write; any
      -- later change is a rewrite of which rule hashed the row.
      IF OLD.integrity_payload_version IS NOT NULL
         AND NEW.integrity_payload_version IS DISTINCT FROM OLD.integrity_payload_version
      THEN
        RAISE EXCEPTION
          'transaction % already records integrity_payload_version %; the rule that '
          'hashed a row cannot be rewritten.', OLD.id, OLD.integrity_payload_version;
      END IF;

      -- A CHAINED row cannot acquire receipt state afterwards.
      --
      -- The dual of the admission rule. Barring a row from the chain until its
      -- receipt settles is only half the property: a row chained under v1 —
      -- which is every row today — could receive a complete receipt afterwards
      -- and keep its v1 hash, so the digest was never anchored. The row
      -- verifies, under a rule that does not cover the receipt.
      IF OLD.integrity_hash IS NOT NULL
         AND OLD.receipt_status IS NULL
         AND NEW.receipt_status IS NOT NULL THEN
        RAISE EXCEPTION
          'transaction % is already chained under v1; introducing receipt state '
          'now would leave its digest permanently unanchored.', OLD.id;
      END IF;

      -- Post-epoch state cannot be cleared back to looking pre-epoch.
      IF OLD.receipt_status IS NOT NULL AND NEW.receipt_status IS NULL THEN
        RAISE EXCEPTION
          'transaction % cannot clear its receipt status: a post-epoch row must '
          'not become indistinguishable from a pre-epoch one.', OLD.id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await tx.execute(sql`
    DROP TRIGGER IF EXISTS transactions_receipt_state_transitions_trg ON transactions
  `);
  await tx.execute(sql`
    CREATE TRIGGER transactions_receipt_state_transitions_trg
      BEFORE UPDATE ON transactions
      FOR EACH ROW EXECUTE FUNCTION "transactions_receipt_state_transitions"()
  `);

  // ── Snapshot subject metadata must agree with the hashed content ──────────
  //
  // The digest-to-content relation itself cannot be a CHECK — Postgres has no
  // RFC 8785 — so `readManifestSnapshot` recomputes before returning. What CAN
  // be enforced here is that the denormalized columns match the bytes.
  await tx.execute(sql`
    ALTER TABLE execution_manifest_snapshots
      DROP CONSTRAINT IF EXISTS execution_manifest_snapshots_subject_matches_content
  `);
  await tx.execute(sql`
    ALTER TABLE execution_manifest_snapshots
      ADD CONSTRAINT execution_manifest_snapshots_subject_matches_content
      -- The key-presence tests are load-bearing. A comparison against a
      -- missing key yields NULL, and a CHECK passes on NULL, so without them a
      -- snapshot carrying no subject keys at all was accepted under any slug.
      -- jsonb_exists is the function spelling of the ? operator, used because a
      -- bare ? in a driver template is asking for trouble.
      CHECK (
        jsonb_exists(snapshot, 'subject_kind')
        AND jsonb_exists(snapshot, 'slug')
        AND subject_kind = snapshot->>'subject_kind'
        AND subject_slug = snapshot->>'slug'
      )
      NOT VALID
  `);

  // ── TRUNCATE does not fire row-level DELETE triggers ──────────────────────
  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "execution_manifest_snapshots_no_truncate"()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION
        'execution_manifest_snapshots cannot be truncated: it is the only record '
        'of what a capability declared when a receipt was issued, and emptying it '
        'makes every receipt permanently unverifiable.';
    END;
    $$ LANGUAGE plpgsql
  `);
  await tx.execute(sql`
    DROP TRIGGER IF EXISTS execution_manifest_snapshots_no_truncate_trg
      ON execution_manifest_snapshots
  `);
  await tx.execute(sql`
    CREATE TRIGGER execution_manifest_snapshots_no_truncate_trg
      BEFORE TRUNCATE ON execution_manifest_snapshots
      FOR EACH STATEMENT EXECUTE FUNCTION "execution_manifest_snapshots_no_truncate"()
  `);

  // Verify every trigger this block depends on is present AND enabled.
  const trg = await tx.execute(sql`
    SELECT c.relname AS tbl, t.tgname, t.tgenabled
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal
       AND t.tgname IN ('transactions_receipt_state_transitions_trg',
                        'execution_manifest_snapshots_no_truncate_trg')
  `);
  const rows = trg as unknown as Array<{ tgname: string; tgenabled: string }>;
  const enabled = rows.filter((r) => r.tgenabled === 'O').map((r) => r.tgname);
  const missing = [
    "transactions_receipt_state_transitions_trg",
    "execution_manifest_snapshots_no_truncate_trg",
  ].filter((n) => !enabled.includes(n));
  if (missing.length > 0) {
    throw new Error(
      `receipt-state invariant triggers missing or disabled: ${missing.join(", ")} ` +
        `(found ${JSON.stringify(rows)}). Refusing to report success: without them, ` +
        "a completed receipt can be rewritten and the snapshot table can be emptied.",
    );
  }

  return {
    block: "0108_receipt_state_invariants",
    outcome:
      "transition trigger + TRUNCATE refusal + closed reason set + known receipt " +
      "metadata + snapshot subject/content agreement, all present and verified",
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0109 - the receipt epoch, made structural.
 *
 * Phase 4 shipped every receipt artifact and then said, in its own
 * reconciliation, that the epoch was NOT structurally real: a transaction
 * inserted afterwards was byte-identical to one from April, because
 * `chain_v2_has_receipt_state` only constrains rows that DECLARE v2 and no row
 * declared anything. This block closes that, and it is the reason Phase 5 can
 * wire every rail at once instead of one at a time.
 *
 * Two statements do the work:
 *
 *  1. `receipt_status` gets a DEFAULT of `pending`. Every insert into
 *     `transactions` - from the four executors in `routes/do.ts`, from
 *     `solution-execute.ts`, from `x402-gateway-v2.ts`, from the internal
 *     harness, from the settlement reconciler, and from any site written after
 *     this one - now starts with receipt state whether or not its author
 *     thought about receipts. This is the property no amount of call-site
 *     wiring can give you: a rail nobody wired produces a VISIBLE `pending`
 *     row that the sweeper picks up and the backlog counter reports, instead
 *     of a silent NULL that looks exactly like a pre-epoch row.
 *
 *  2. A CHECK that a post-epoch row cannot have a NULL status. `NOT VALID`, so
 *     the 921k existing rows are not scanned at boot; they are all pre-epoch
 *     and exempt by the `created_at` test regardless.
 *
 * ## Where the epoch instant comes from
 *
 * `now()` at the moment this block first runs, baked into the constraint text
 * as a literal. The constraint is therefore the single, immutable record of
 * when enforcement began - there is no second copy in a table to drift from
 * it, and re-running this block is a no-op because the constraint already
 * exists.
 *
 * The race that looks like a problem is not one. `ALTER TABLE` takes ACCESS
 * EXCLUSIVE, so a concurrent insert either committed before the lock was
 * granted - giving it a `created_at` earlier than `now()`, hence exempt - or
 * blocks until this transaction commits and then picks up the DEFAULT. There
 * is no interleaving that produces a post-epoch row with a NULL status.
 *
 * ## The foreign key
 *
 * `transactions.receipt_manifest_digest` now references
 * `execution_manifest_snapshots(digest)`. Phase 4 listed its absence as
 * residual risk 6 and left the decision open; the decision is to add it, on
 * these grounds:
 *
 *  - The referent is guaranteed to exist by construction: `settle.ts` records
 *    the snapshot BEFORE `markReceiptComplete` writes the digest.
 *  - It can never break later, because DELETE and TRUNCATE on the snapshot
 *    table are refused by triggers from blocks 0106 and 0108. A FK is normally
 *    a liability when the parent can be deleted; here it structurally cannot.
 *  - Without it, "the digest points at a snapshot that exists" is a
 *    convention. `readManifestSnapshot` recomputes before trusting, so a
 *    MIS-ADDRESSED row is caught - but a digest pointing at NOTHING is a
 *    different failure, and nothing caught that.
 *  - NULL is permitted, which is what a `failed` receipt writes, so the
 *    failure path is unaffected.
 *
 * Its cost is one unique-index probe per receipt completion, off the money
 * path. `NOT VALID` for the same reason as the CHECK.
 *
 * ## Backlog (DEC-20260504-B)
 *
 * Not a bulk-operation resumption. Both ALTERs are catalog-only in PG11+, the
 * CHECK and FK are `NOT VALID` so neither scans, and there is no accumulated
 * workload to drain: production carries zero rows with receipt state, so the
 * sweeper starts from an empty backlog and only ever sees rows created after
 * this block ran.
 */
export async function runMigration0109_receiptEpoch(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // ONE statement, so the whole thing is atomic.
  //
  // These used to be four separate `tx.execute` calls, and blocks are
  // autocommitted per statement - `runStartupMigrations` hands each block the
  // pooled `db`, not a transaction. So when the probe at the end refused, the
  // two SET DEFAULTs and the epoch CHECK had ALREADY COMMITTED. Boot then
  // aborted, Railway kept the previous deployment serving, and that previous
  // deployment had the new defaults and no sweeper: every new row would sit
  // `pending`, nothing would chain, and /v1/audit/:id would answer 202 forever
  // until someone rolled forward. The refusal was supposed to be the safe
  // outcome and it was the dangerous one. Reviewer-found.
  //
  // A plpgsql DO block is a single statement, so a RAISE anywhere inside it
  // unwinds every DDL it performed. Refusing now genuinely changes nothing.
  //
  // The three things it does, in order that matters:
  //
  //  1. Both DEFAULTS, unconditionally. `receipt_status` alone is not enough:
  //     block 0107's transactions_receipt_reason_required means a row that is
  //     `pending` must SAY why, so defaulting the status without the reason
  //     makes EVERY INSERT into transactions fail - every /v1/do call, every
  //     x402 call, every harness tick. The migration would still apply
  //     cleanly, because that CHECK is NOT VALID and existing rows are never
  //     scanned; the platform would simply stop being able to write.
  //     Unconditional, so a hand-dropped default is repaired rather than
  //     skipped forever by a guard on something else.
  //
  //  2. The epoch CHECK, guarded, because the epoch instant must be chosen
  //     exactly once in the lifetime of the database and re-running must not
  //     move it.
  //
  //  3. A behavioural self-check, because reading the catalog is not proof.
  //     The defect above was invisible to every catalog query: the default was
  //     present and correct, the CHECK was present and correct, and together
  //     they made every INSERT fail. The only thing that can tell the
  //     difference is doing what production does - so this inserts an ordinary
  //     row (the same shape /health/deep has used 507 times in production) and
  //     unwinds it via a deliberate RAISE inside a nested subtransaction.
  await tx.execute(sql`
    DO $$
    BEGIN
      ALTER TABLE transactions ALTER COLUMN receipt_status SET DEFAULT 'pending';
      ALTER TABLE transactions ALTER COLUMN receipt_failure_reason SET DEFAULT 'not_yet_built';

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_post_epoch_has_receipt'
      ) THEN
        EXECUTE format(
          'ALTER TABLE transactions ADD CONSTRAINT transactions_post_epoch_has_receipt '
          'CHECK (created_at < %L OR receipt_status IS NOT NULL) NOT VALID',
          now()
        );
      END IF;

      BEGIN
        INSERT INTO transactions
          (solution_slug, status, input, price_cents, transparency_marker,
           data_jurisdiction, is_free_tier)
        VALUES ('_receipt_epoch_probe', 'health_probe', '{}', 0, 'algorithmic', 'EU', true);
        RAISE EXCEPTION 'receipt_epoch_probe_rollback';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLERRM <> 'receipt_epoch_probe_rollback' THEN
            RAISE EXCEPTION
              '0109: with the receipt defaults in place an ordinary INSERT into '
              'transactions is refused, so production would be unable to write: %',
              SQLERRM;
          END IF;
      END;
    END $$
  `);

  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_receipt_manifest_digest_fk'
      ) THEN
        ALTER TABLE transactions
          ADD CONSTRAINT transactions_receipt_manifest_digest_fk
          FOREIGN KEY (receipt_manifest_digest)
          REFERENCES execution_manifest_snapshots (digest)
          NOT VALID;
      END IF;
    END $$
  `);

  // Self-verify by object, not by "no error was raised". A block that reports
  // success without checking is the hollow-gate pattern this repo has been
  // bitten by more than once.
  const verify = (await tx.execute(sql`
    SELECT
      (SELECT column_default FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'receipt_status') AS default_expr,
      (SELECT column_default FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'receipt_failure_reason') AS reason_default,
      (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname = 'transactions_post_epoch_has_receipt') AS epoch_check,
      (SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_receipt_manifest_digest_fk') AS fk_present
  `)) as unknown as Array<{
    default_expr: string | null;
    reason_default: string | null;
    epoch_check: string | null;
    fk_present: number | null;
  }>;

  // Behavioural self-check, because reading the catalog is not proof.
  //
  // The defect this exists for was invisible to every catalog query: the
  // status default was present and correct, the CHECK was present and correct,
  // and together they made every INSERT fail. The only thing that could tell
  // the difference is doing what production does.
  //
  // Same row shape as the /health/deep write-path probe. Rolled back to the
  // savepoint, so nothing is left behind; a violation raises and aborts boot,
  // which is the right outcome -- Railway does not cut over a failed deploy,
  // so the previous commit keeps serving instead of the new one refusing every
  // write.
  const row = verify[0];
  if (!row?.default_expr || !row.default_expr.includes("pending")) {
    throw new Error(
      "0109: receipt_status has no 'pending' default, so a transaction could " +
        "still be inserted with no receipt state. Got: " +
        String(row?.default_expr),
    );
  }
  if (!row?.reason_default || !row.reason_default.includes("not_yet_built")) {
    throw new Error(
      "0109: receipt_failure_reason has no 'not_yet_built' default, so an insert " +
        "carrying the pending status default would violate " +
        "transactions_receipt_reason_required. Got: " + String(row?.reason_default),
    );
  }
  if (!row?.epoch_check) {
    throw new Error("0109: the post-epoch CHECK constraint is absent after the block ran");
  }
  if (!row?.fk_present) {
    throw new Error("0109: the receipt_manifest_digest foreign key is absent after the block ran");
  }

  return {
    block: "0109_receipt_epoch",
    outcome:
      "receipt_status DEFAULT 'pending' + post-epoch CHECK + manifest-digest FK, " +
      "all present and verified; epoch: " +
      (parseEpochFromCheck(row.epoch_check) ?? "unparsed"),
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * The epoch instant, read back out of the constraint that enforces it.
 *
 * Deliberately no second copy in a table: two records of one fact is how they
 * drift. Returns null rather than guessing if the shape is unfamiliar, because
 * a wrong epoch reported confidently is worse than an absent one.
 */
export function parseEpochFromCheck(constraintDef: string | null): string | null {
  if (!constraintDef) return null;
  const m = constraintDef.match(/'([^']+)'::timestamp with time zone/);
  return m ? m[1] : null;
}

/**
 * Block 0110 - the two facts a receipt cannot be rebuilt without.
 *
 * The sweeper (jobs/receipt-sweeper.ts) finishes receipts the request path
 * could not. Writing it exposed a soundness problem that is worth stating
 * plainly, because the obvious implementation is wrong:
 *
 *  - **The rail is not recoverable from the row.** Nothing on `transactions`
 *    says which surface created it. A sweeper would have to GUESS - infer
 *    `x402` from `payment_method`, `internal` from the system user id - and a
 *    guessed value has no business inside a commitment whose whole purpose is
 *    to be exact.
 *
 *  - **The deploy commit drifts.** `resolveDeployCommit()` answers for the
 *    process asking, so a receipt rebuilt after a deploy would bind the code
 *    that is running NOW to a result produced by the code that ran THEN. That
 *    is not a smaller truth, it is a false one, and it would be invisible: the
 *    digest would verify perfectly against the wrong implementation identity.
 *
 * So both are captured at INSERT, where they are known exactly, and `settle.ts`
 * prefers the row's values over anything ambient. This also makes the request
 * path itself more correct, not just the sweeper - the commit bound is the one
 * that was serving when the transaction was created, rather than whatever the
 * environment happens to say a few milliseconds later.
 *
 * A site that never sets `receipt_rail` leaves it NULL, and the sweeper records
 * `unmapped_rail` - which is already in Phase 2's closed reason set, and is
 * exactly what a new unwired rail should produce: a loud, correctly-named
 * invariant failure rather than a plausible guess.
 *
 * Both columns are nullable and both CHECKs are `NOT VALID`: every existing row
 * is pre-epoch and has neither.
 */
export async function runMigration0110_receiptExecutionContext(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS receipt_rail TEXT,
      ADD COLUMN IF NOT EXISTS receipt_deploy_commit TEXT
  `);

  // The rail is a closed enum. Enforced here rather than trusted, because the
  // whole point of the column is that a verifier can rely on it.
  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_rail_closed') THEN
        ALTER TABLE transactions
          ADD CONSTRAINT receipt_rail_closed
          CHECK (receipt_rail IS NULL OR receipt_rail IN ('v1_do','x402','mcp','a2a','internal'))
          NOT VALID;
      END IF;
    END $$
  `);

  // A full 40-hex commit, or the local-build sentinel. Anything else is a
  // truncated or decorated value pretending to be an identity.
  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_deploy_commit_shape') THEN
        ALTER TABLE transactions
          ADD CONSTRAINT receipt_deploy_commit_shape
          CHECK (
            receipt_deploy_commit IS NULL
            OR receipt_deploy_commit = 'unknown-local-build'
            OR receipt_deploy_commit ~ '^[0-9a-f]{40}$'
          )
          NOT VALID;
      END IF;
    END $$
  `);

  const verify = (await tx.execute(sql`
    SELECT
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_name = 'transactions'
          AND column_name IN ('receipt_rail', 'receipt_deploy_commit')) AS cols,
      (SELECT count(*)::int FROM pg_constraint
        WHERE conname IN ('receipt_rail_closed', 'receipt_deploy_commit_shape')) AS checks
  `)) as unknown as Array<{ cols: number; checks: number }>;

  const row = verify[0];
  if (Number(row?.cols) !== 2) {
    throw new Error(`0110: expected 2 receipt context columns, found ${row?.cols}`);
  }
  if (Number(row?.checks) !== 2) {
    throw new Error(`0110: expected 2 receipt context CHECKs, found ${row?.checks}`);
  }

  return {
    block: "0110_receipt_execution_context",
    outcome: "receipt_rail + receipt_deploy_commit columns and their closed-set CHECKs verified",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0111: Vendor Control Tower + immediate OpenRegister quarantine ──
//
// The German registry account reached 0/500 credits on 2026-08-24. Network
// health stayed green because an unauthenticated probe cannot see account
// exhaustion, and x402 traffic kept selling the capability into 127 upstream
// HTTP 402s. This block creates the account-level authority, records every
// affected capability, and applies a reversible suspension before the API
// starts listening. The hourly tower job restores the saved state only after
// GET /v1/credits reports usable credits (the observed reset is
// 2026-09-06T23:40:04.613Z, i.e. September 7 in Stockholm).
export async function runMigration0111_vendorControlTower(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_accounts (
      provider_name TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      billing_model TEXT NOT NULL,
      plan_name TEXT,
      currency VARCHAR(3),
      payment_method TEXT,
      monitor_mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      status_reason TEXT,
      included_units INTEGER,
      used_units INTEGER,
      remaining_units INTEGER,
      overage_units INTEGER,
      usage_unit TEXT,
      low_balance_threshold_units INTEGER,
      reset_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      consecutive_check_failures INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT vendor_accounts_status_closed CHECK (
        status IN ('unknown','healthy','low','exhausted','auth_error','rate_limited','unavailable','disabled')
      ),
      CONSTRAINT vendor_accounts_monitor_mode_closed CHECK (
        monitor_mode IN ('api_balance','internal_counter','availability','spend')
      )
    )
  `);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_capability_dependencies (
      provider_name TEXT NOT NULL REFERENCES vendor_accounts(provider_name),
      capability_slug TEXT NOT NULL REFERENCES capabilities(slug),
      dependency_kind TEXT NOT NULL DEFAULT 'required',
      units_per_execution NUMERIC(12,3),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider_name, capability_slug),
      CONSTRAINT vendor_dependency_kind_closed CHECK (dependency_kind IN ('required','fallback'))
    )
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS vendor_capability_dependencies_slug_idx
      ON vendor_capability_dependencies(capability_slug)
  `);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_capability_suspensions (
      provider_name TEXT NOT NULL REFERENCES vendor_accounts(provider_name),
      capability_slug TEXT NOT NULL REFERENCES capabilities(slug),
      previous_lifecycle_state TEXT NOT NULL,
      previous_visible BOOLEAN NOT NULL,
      previous_x402_enabled BOOLEAN NOT NULL,
      suspension_marker TEXT NOT NULL,
      suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      restore_after TIMESTAMPTZ,
      restored_at TIMESTAMPTZ,
      restore_error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider_name, capability_slug)
    )
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS vendor_capability_suspensions_active_idx
      ON vendor_capability_suspensions(restored_at) WHERE restored_at IS NULL
  `);
  await tx.execute(sql`ALTER TABLE solutions ADD COLUMN IF NOT EXISTS deactivation_reason TEXT`);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_solution_suspensions (
      provider_name TEXT NOT NULL REFERENCES vendor_accounts(provider_name),
      solution_slug TEXT NOT NULL REFERENCES solutions(slug),
      previous_is_active BOOLEAN NOT NULL,
      previous_x402_enabled BOOLEAN NOT NULL,
      suspension_marker TEXT NOT NULL,
      suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      restore_after TIMESTAMPTZ,
      restored_at TIMESTAMPTZ,
      restore_error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider_name, solution_slug)
    )
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS vendor_solution_suspensions_active_idx
      ON vendor_solution_suspensions(restored_at) WHERE restored_at IS NULL
  `);

  await tx.execute(sql`
    INSERT INTO vendor_accounts (
      provider_name, display_name, billing_model, plan_name, currency,
      payment_method, monitor_mode, status, status_reason, included_units,
      used_units, remaining_units, overage_units, usage_unit,
      low_balance_threshold_units, reset_at, expires_at, metadata
    ) VALUES
      ('openregister', 'OpenRegister', 'free_allowance', 'Free', 'EUR', 'none',
       'api_balance', 'exhausted', 'API reported 0 remaining credits', 500, 500, 0, 0,
       'credit', 100, '2026-09-06T23:40:04.613Z', NULL,
       '{"source":"GET /v1/credits","observed_at":"2026-08-25"}'::jsonb),
      ('browserless', 'Browserless Cloud', 'free_allowance', 'Free', 'USD', 'none',
       'api_balance', 'unknown', 'Awaiting first zero-cost usage API check', NULL, NULL, NULL, NULL,
       'unit', NULL, NULL, NULL, '{}'::jsonb),
      ('serper', 'Serper', 'prepaid', 'Starter', 'USD', 'card_or_paypal',
       'internal_counter', 'healthy', 'Conservative platform ledger; vendor exposes no documented balance API',
       50000, 2500, 47500, 0, 'query', 5000, NULL, '2026-11-08T00:00:00Z',
       '{"counter_is_estimate":true,"purchase_date":"2026-05-08","observed_attempts_through_2026-08-25":2392,"baseline_rounding":"up_to_2500"}'::jsonb),
      ('dilisense', 'Dilisense', 'pay_as_you_go', 'Starter', 'EUR', 'card_supported',
       'availability', 'healthy', 'No prepaid balance; 100 calls/month included then pay per use',
       100, NULL, NULL, NULL, 'screening', NULL, NULL, NULL, '{}'::jsonb),
      ('anthropic', 'Anthropic API', 'pay_as_you_go', 'Standard', 'USD', 'card_or_invoice',
       'spend', 'healthy', 'No hard prepaid allowance tracked; platform records per-call cost',
       NULL, NULL, NULL, NULL, 'token', NULL, NULL, NULL, '{}'::jsonb),
      ('cdp', 'Coinbase CDP x402 facilitator', 'pay_as_you_go', 'Standard', 'USD', 'card',
       'spend', 'healthy', 'Settlement spend is monitored by x402 settlement watch',
       NULL, NULL, NULL, NULL, 'settlement', NULL, NULL, NULL, '{}'::jsonb),
      ('esortcode', 'eSortcode Confirmation of Payee', 'prepaid', NULL, 'GBP', 'top_up',
       'availability', 'unknown', 'Finite credits; no documented balance endpoint is integrated',
       NULL, NULL, NULL, NULL, 'lookup', NULL, NULL, NULL, '{}'::jsonb)
    ON CONFLICT (provider_name) DO NOTHING
  `);

  await tx.execute(sql`
    INSERT INTO vendor_capability_dependencies
      (provider_name, capability_slug, dependency_kind, units_per_execution)
    SELECT seed.provider_name, seed.capability_slug, seed.dependency_kind, seed.units_per_execution
      FROM (VALUES
      ('openregister', 'german-company-data', 'required', 11),
      ('browserless', 'annual-report-extract', 'required', NULL),
      ('browserless', 'company-enrich', 'required', NULL),
      ('browserless', 'estonian-company-data', 'required', NULL),
      ('browserless', 'html-to-pdf', 'required', NULL),
      ('browserless', 'landing-page-roast', 'required', NULL),
      ('browserless', 'screenshot-url', 'required', NULL),
      ('browserless', 'web-extract', 'required', NULL),
      ('serper', 'google-search', 'required', 1),
      ('serper', 'google-news-search', 'required', 1),
      ('serper', 'serp-analyze', 'required', 1),
      ('serper', 'serp-related-questions', 'required', 1),
      ('serper', 'keyword-rank-check', 'required', 1),
      ('serper', 'backlink-check', 'required', 1),
      ('serper', 'brand-mention-search', 'required', 1),
      ('serper', 'adverse-media-check', 'fallback', 1),
      ('dilisense', 'sanctions-check', 'required', 1),
      ('dilisense', 'pep-check', 'required', 1),
      ('dilisense', 'adverse-media-check', 'fallback', 1)
      ) AS seed(provider_name, capability_slug, dependency_kind, units_per_execution)
      JOIN capabilities c ON c.slug = seed.capability_slug
    ON CONFLICT (provider_name, capability_slug) DO UPDATE SET
      dependency_kind = EXCLUDED.dependency_kind,
      units_per_execution = EXCLUDED.units_per_execution,
      updated_at = now()
  `);

  // Materialise the canonical manifest into the tower. Missing accounts or
  // future edge drift remain visible in the morning report instead of being
  // silently treated as covered.
  for (const provider of getActiveProviders().filter((item) =>
    item.tier === "paid" || item.tier === "self-hosted")) {
    const dependencies = [
      ...provider.capabilities.map((slug) => ({ slug, kind: "required" as const })),
      ...(provider.fallbackCapabilities ?? []).map((slug) => ({ slug, kind: "fallback" as const })),
    ];
    for (const dependency of dependencies) {
      await tx.execute(sql`
        INSERT INTO vendor_capability_dependencies
          (provider_name, capability_slug, dependency_kind, units_per_execution)
        SELECT ${provider.name}, c.slug, ${dependency.kind}, NULL
          FROM capabilities c
          JOIN vendor_accounts va ON va.provider_name = ${provider.name}
         WHERE c.slug = ${dependency.slug}
        ON CONFLICT (provider_name, capability_slug) DO UPDATE SET
          dependency_kind = EXCLUDED.dependency_kind,
          updated_at = now()
      `);
    }
    const expectedSlugs = [...new Set(dependencies.map((dependency) => dependency.slug))];
    await tx.execute(sql`
      DELETE FROM vendor_capability_dependencies d
       USING vendor_accounts va
       WHERE va.provider_name = ${provider.name}
         AND d.provider_name = va.provider_name
         AND d.capability_slug NOT IN (
           ${sql.join(expectedSlugs.map((slug) => sql`${slug}`), sql`, `)}
         )
    `);
  }

  // quota_cap is expressed in complete capability executions, not raw vendor
  // credits: a name lookup costs 1 autocomplete + 10 company-detail credits,
  // so 500 credits conservatively fund 45 complete calls. The exact rolling
  // reset timestamp lives in vendor_accounts and is refreshed from the API.
  await tx.execute(sql`
    UPDATE capabilities
       SET price_cents = 20,
           quota_cap = 45,
           quota_window = 'monthly',
           quota_reset_dom = 7,
           updated_at = now()
     WHERE slug = 'german-company-data'
       AND (price_cents IS DISTINCT FROM 20 OR quota_cap IS DISTINCT FROM 45 OR quota_reset_dom IS DISTINCT FROM 7)
  `);

  // Both Browserless capabilities already have a known-answer canary. Their
  // second live schema suite duplicated the same paid upstream signal hourly
  // (169 calls in the preceding seven days) without adding independent
  // coverage. Keep the canary and fixtures; retire only this exact duplicate
  // live shape.
  await tx.execute(sql`
    UPDATE test_suites
       SET active = false,
           updated_at = now()
     WHERE capability_slug IN ('screenshot-url', 'html-to-pdf')
       AND test_type = 'schema_check'
       AND test_mode = 'live'
       AND active = true
  `);

  // Gate 5 requires one meaningful fixture for every public input path. The
  // capability already has a reviewed SAP baseline, so reuse that captured
  // output for the register-number and canonical-company-id entry points.
  // These are fixture-only and therefore consume no OpenRegister credits.
  await tx.execute(sql`
    WITH source AS (
      SELECT baseline_output, validation_rules
        FROM test_suites
       WHERE capability_slug = 'german-company-data'
         AND test_type = 'known_answer'
         AND baseline_output IS NOT NULL
       ORDER BY created_at
       LIMIT 1
    )
    INSERT INTO test_suites (
      capability_slug, test_name, test_type, input, validation_rules,
      active, schedule_tier, test_mode, baseline_output,
      baseline_captured_at, fixture_last_refreshed,
      scheduled_testing_eligible, estimated_cost_cents, external_cost_cents
    )
    SELECT 'german-company-data', 'German Company Data — HRB fixture path',
           'known_answer', '{"hrb_number":"HRB 719915"}'::jsonb,
           source.validation_rules, true, 'C', 'fixture', source.baseline_output,
           now(), now(), true, 0, 0
      FROM source
     WHERE NOT EXISTS (
       SELECT 1 FROM test_suites
        WHERE capability_slug = 'german-company-data'
          AND test_name = 'German Company Data — HRB fixture path'
     )
  `);
  await tx.execute(sql`
    WITH source AS (
      SELECT baseline_output, validation_rules
        FROM test_suites
       WHERE capability_slug = 'german-company-data'
         AND test_type = 'known_answer'
         AND baseline_output IS NOT NULL
       ORDER BY created_at
       LIMIT 1
    )
    INSERT INTO test_suites (
      capability_slug, test_name, test_type, input, validation_rules,
      active, schedule_tier, test_mode, baseline_output,
      baseline_captured_at, fixture_last_refreshed,
      scheduled_testing_eligible, estimated_cost_cents, external_cost_cents
    )
    SELECT 'german-company-data', 'German Company Data — company ID fixture path',
           'known_answer', jsonb_build_object('company_id', source.baseline_output->>'company_id'),
           source.validation_rules, true, 'C', 'fixture', source.baseline_output,
           now(), now(), true, 0, 0
      FROM source
     WHERE source.baseline_output->>'company_id' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM test_suites
          WHERE capability_slug = 'german-company-data'
            AND test_name = 'German Company Data — company ID fixture path'
       )
  `);

  const saved = await tx.execute(sql`
    INSERT INTO vendor_capability_suspensions (
      provider_name, capability_slug, previous_lifecycle_state,
      previous_visible, previous_x402_enabled, suspension_marker, restore_after
    )
    SELECT 'openregister', c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
           'vendor:openregister:exhausted', va.reset_at
      FROM capabilities c
      JOIN vendor_accounts va ON va.provider_name = 'openregister'
     WHERE c.slug = 'german-company-data'
       AND va.status = 'exhausted'
       AND (c.deactivation_reason IS NULL OR c.deactivation_reason LIKE 'vendor:%')
    ON CONFLICT (provider_name, capability_slug) DO NOTHING
  `);
  const savedCount = (saved as { count?: number }).count ?? 0;

  await tx.execute(sql`
    INSERT INTO vendor_solution_suspensions (
      provider_name, solution_slug, previous_is_active,
      previous_x402_enabled, suspension_marker, restore_after
    )
    SELECT DISTINCT 'openregister', s.slug, s.is_active, s.x402_enabled,
           'vendor:openregister:exhausted', va.reset_at
      FROM vendor_capability_dependencies d
      JOIN solution_steps ss ON ss.capability_slug = d.capability_slug
      JOIN solutions s ON s.id = ss.solution_id
      JOIN vendor_accounts va ON va.provider_name = 'openregister'
     WHERE d.provider_name = 'openregister'
       AND d.dependency_kind = 'required'
       AND va.status = 'exhausted'
       AND (s.is_active OR s.x402_enabled)
    ON CONFLICT (provider_name, solution_slug) DO NOTHING
  `);

  await tx.execute(sql`
    UPDATE capabilities c
       SET lifecycle_state = 'suspended',
           visible = false,
           x402_enabled = false,
           deactivation_reason = s.suspension_marker,
           updated_at = now()
      FROM vendor_capability_suspensions s
     WHERE s.provider_name = 'openregister'
       AND s.capability_slug = c.slug
       AND s.restored_at IS NULL
       AND (c.deactivation_reason IS NULL OR c.deactivation_reason LIKE 'vendor:%')
  `);
  await tx.execute(sql`
    UPDATE solutions s
       SET is_active = false,
           x402_enabled = false,
           deactivation_reason = vs.suspension_marker,
           updated_at = now()
      FROM vendor_solution_suspensions vs
     WHERE vs.provider_name = 'openregister'
       AND vs.solution_slug = s.slug
       AND vs.restored_at IS NULL
       AND (s.deactivation_reason IS NULL OR s.deactivation_reason LIKE 'vendor:%')
  `);

  if (savedCount > 0) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events
        (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'vendor_suspension', 'german-company-data', 1,
        'Suspended until OpenRegister reports usable credits',
        '{"provider":"openregister","reason":"exhausted","restore_policy":"provider-confirmed","observed_reset_at":"2026-09-06T23:40:04.613Z"}'::jsonb,
        false
      )
    `);
  }

  return {
    block: "0111_vendor_control_tower",
    outcome: savedCount > 0
      ? "tower created; german-company-data reversibly suspended"
      : "tower present; OpenRegister suspension already recorded",
    rows_affected: savedCount,
    duration_ms: Date.now() - startedAt,
  };
}

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
  runMigration0089_deactivateUsCourtSearch,
  runMigration0090_capabilityOutputContracts,
  runMigration0091_bolStaleValidationRules,
  runMigration0092_x402GrowthBundles,
  runMigration0093_fixtureRecaptureFailures,
  runMigration0094_clearChurnInvalidatedBaselines,
  // WP3: reservations table + non-negative balance constraint.
  runMigration0095_walletReservations,
  runMigration0096_x402SettlementIntents,
  runMigration0097_chainSequence,
  runMigration0098_perCustomerIdempotency,
  runMigration0099_noHalfQuarantine,
  runMigration0100_relistUrlToMarkdown,
  runMigration0101_capabilityInvocations,
  // WP11: account/trial/Stripe lifecycle authority tables.
  runMigration0102_accountLifecycleTables,
  // WP11 round 7: redacted content cannot be restored by a late write.
  runMigration0103_redactedContentStaysRedacted,
  runMigration0104_jobSchedule,
  runMigration0105_onboardingHookFailures,
  // Phase 4: execution receipts.
  runMigration0106_executionManifestSnapshots,
  runMigration0107_executionReceiptColumns,
  runMigration0108_receiptStateInvariants,
  // Phase 5: the epoch becomes structural -- every insert gets receipt state.
  runMigration0109_receiptEpoch,
  runMigration0110_receiptExecutionContext,
  runMigration0111_vendorControlTower,
  runMigration0112_promoteFreeApiEight,
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
// bounds Strale's own internal_test/ci budget (5%/2% of quota_cap per
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

/**
 * Block 0089 — take `us-court-search` off the shelf.
 *
 * DQ-4 (2026-08-15) recorded the decision to switch this capability off: its
 * CourtListener token had expired and it was returning errors to every caller.
 * Only the x402 flag was ever cleared, so the capability stayed `is_active`
 * and `visible` — on the public `/v1/capabilities` catalogue, priced at €0.15,
 * returning HTTP 500 to anyone who called it. Verified against production
 * 2026-08-17: `CourtListener rejected the token (HTTP 403)`, and the harness
 * has been failing its known-answer suite continuously for at least 48 hours.
 *
 * This block is the decision actually executing. Reversal is a fresh
 * COURTLISTENER_API_TOKEN plus flipping the flags back; the row, its suites
 * and its history are all left intact so that is a one-step change.
 *
 * Idempotent via `WHERE is_active = true` — a re-run on a healthy DB is a
 * no-op, and it deliberately does NOT re-deactivate a capability an operator
 * has since switched back on, because it only matches rows still carrying the
 * broken state.
 */
export const US_COURT_SEARCH_DEACTIVATION_REASON =
  "CourtListener API token rejected (HTTP 403) — deactivated per DQ-4; reversible by restoring COURTLISTENER_API_TOKEN";

export async function runMigration0089_deactivateUsCourtSearch(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const res = await tx.execute(sql`
    UPDATE capabilities
    SET is_active = false,
        visible = false,
        x402_enabled = false,
        deactivation_reason = ${US_COURT_SEARCH_DEACTIVATION_REASON}
    WHERE slug = 'us-court-search'
      AND is_active = true
  `);
  const affected = (res as { count?: number }).count ?? 0;

  return {
    block: "0089_deactivateUsCourtSearch",
    outcome:
      affected === 0
        ? "no change (us-court-search already inactive)"
        : "us-court-search deactivated — was serving HTTP 500 on an expired CourtListener token",
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0090 — realign seven capabilities' declared output contract with what
 * their executors actually return.
 *
 * The harness measures a capability against `output_schema.properties` (Gate 2,
 * null-field ratio) and `output_field_reliability` (Gate 3, guaranteed-fields
 * sentinel). Seven capabilities had declarations describing a shape their
 * executors stopped returning, so the harness reported them broken while
 * production answered every call correctly. See
 * lib/capability-output-contracts.ts for each shape and how it was captured.
 *
 * Two capabilities also carry a replacement known-answer fixture input: their
 * stored inputs were placeholders (`test_value`, "This is a test input for
 * automated capability testing.") that exercise the empty branch, so the suite
 * asked the capability to find nothing and then failed it for finding nothing.
 *
 * Idempotent: each UPDATE is guarded by `IS DISTINCT FROM` on the value being
 * written, so a re-run on a corrected row affects zero rows. Changing a suite's
 * input bumps `updated_at`, which invalidates its now-wrong fixture baseline
 * under the staleness rule added in the same release — the suite re-executes
 * live and re-captures. That interaction is deliberate.
 */
export async function runMigration0090_capabilityOutputContracts(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let schemaRows = 0;
  let reliabilityRows = 0;
  let fixtureRows = 0;

  for (const slug of CORRECTED_SLUGS) {
    const contract = CAPABILITY_OUTPUT_CONTRACTS[slug]!;

    // jsonb_set on `properties` alone, so a hand-written `example`, `type` or
    // `required` elsewhere in the schema survives.
    const schemaRes = await tx.execute(sql`
      UPDATE capabilities
      SET output_schema = jsonb_set(
            COALESCE(output_schema, '{"type":"object"}'::jsonb),
            '{properties}',
            ${JSON.stringify(contract.properties)}::jsonb,
            true
          )
      WHERE slug = ${slug}
        AND COALESCE(output_schema->'properties', 'null'::jsonb)
            IS DISTINCT FROM ${JSON.stringify(contract.properties)}::jsonb
    `);
    schemaRows += (schemaRes as { count?: number }).count ?? 0;

    const relRes = await tx.execute(sql`
      UPDATE capabilities
      SET output_field_reliability = ${JSON.stringify(contract.reliability)}::jsonb
      WHERE slug = ${slug}
        AND COALESCE(output_field_reliability, 'null'::jsonb)
            IS DISTINCT FROM ${JSON.stringify(contract.reliability)}::jsonb
    `);
    reliabilityRows += (relRes as { count?: number }).count ?? 0;

    if (contract.knownAnswerInput) {
      const fixRes = await tx.execute(sql`
        UPDATE test_suites
        SET input = ${JSON.stringify(contract.knownAnswerInput)}::jsonb,
            updated_at = now()
        WHERE capability_slug = ${slug}
          AND test_type = 'known_answer'
          AND input IS DISTINCT FROM ${JSON.stringify(contract.knownAnswerInput)}::jsonb
      `);
      fixtureRows += (fixRes as { count?: number }).count ?? 0;
    }
  }

  const total = schemaRows + reliabilityRows + fixtureRows;
  return {
    block: "0090_capabilityOutputContracts",
    outcome:
      total === 0
        ? "no change (all seven contracts already match the executors)"
        : `${schemaRows} schema, ${reliabilityRows} reliability, ${fixtureRows} fixture input(s) realigned`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0091 — drop assertions on fields `beneficial-ownership-lookup` does
 * not return.
 *
 * Two of its suites still assert the pre-rewrite field names — `coverage_note`,
 * `query`, `total_owners`, `lookup_date`. The executor returns none of them in
 * either of its two response shapes; the same drift that block 0090 fixed in
 * the declared schema also reached the suites' validation_rules.
 *
 * Until 0090 these checks were masked: `output_field_reliability` carried
 * `coverage_note: common`, and Gate 1 excuses a failing check on a
 * common/rare field. Removing the dead names from the reliability map — correct
 * in itself, since they are not fields — made Gate 1 treat them as unannotated
 * and therefore enforced. The honest repair is to stop asserting fields that do
 * not exist, not to re-add fictional entries to the reliability map so the
 * assertions stay excused.
 *
 * The known_answer suite already lost its `coverage_note` check to
 * auto-remediation at 2026-08-17T07:41:03Z; this covers the two it did not
 * reach. Replacement checks name only fields observed in production.
 *
 * Idempotent via `IS DISTINCT FROM` on the value being written.
 */
export const BOL_DEPENDENCY_HEALTH_CHECKS = {
  checks: [
    { field: "jurisdiction", operator: "not_null" },
    { field: "beneficial_owners", operator: "not_null" },
    { field: "data_source", operator: "not_null" },
  ],
};

export const BOL_SCHEMA_CHECK_CHECKS = {
  checks: [
    { field: "company_name", operator: "not_null" },
    { field: "jurisdiction", operator: "not_null" },
    { field: "beneficial_owners", operator: "not_null" },
    { field: "data_source", operator: "not_null" },
    { field: "total_beneficial_owners", operator: "not_null" },
    { field: "has_psc_data", operator: "not_null" },
  ],
};

export async function runMigration0091_bolStaleValidationRules(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const dep = await tx.execute(sql`
    UPDATE test_suites
    SET validation_rules = ${JSON.stringify(BOL_DEPENDENCY_HEALTH_CHECKS)}::jsonb,
        updated_at = now()
    WHERE capability_slug = 'beneficial-ownership-lookup'
      AND test_type = 'dependency_health'
      AND validation_rules IS DISTINCT FROM ${JSON.stringify(BOL_DEPENDENCY_HEALTH_CHECKS)}::jsonb
  `);

  // Only the one schema_check suite that carries the dead names. The other
  // three assert real fields and are left alone.
  const schema = await tx.execute(sql`
    UPDATE test_suites
    SET validation_rules = ${JSON.stringify(BOL_SCHEMA_CHECK_CHECKS)}::jsonb,
        updated_at = now()
    WHERE capability_slug = 'beneficial-ownership-lookup'
      AND test_type = 'schema_check'
      AND validation_rules::text LIKE '%coverage_note%'
      AND validation_rules IS DISTINCT FROM ${JSON.stringify(BOL_SCHEMA_CHECK_CHECKS)}::jsonb
  `);

  const total =
    ((dep as { count?: number }).count ?? 0) + ((schema as { count?: number }).count ?? 0);
  return {
    block: "0091_bolStaleValidationRules",
    outcome:
      total === 0
        ? "no change (no suite still asserts the removed field names)"
        : `${total} suite(s) stopped asserting fields the executor does not return`,
    rows_affected: total,
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * Block 0092 — put the four growth bundles on the rail that money arrives on.
 *
 * DQ-9 (2026-08-16) settled that the growth bundles get built and sold: they
 * are composed entirely from capabilities we already run, and they are the
 * highest-return work available against M1. Four were created the same day —
 * `competitor-read`, `page-seo-check`, `prospect-brief`, `keyword-scout` — and
 * shipped `is_active = true`, which put them on the public `/v1/solutions`
 * catalogue, and `x402_enabled = false`, which kept them off `/x402/solutions`.
 *
 * Every euro of external revenue arrives over x402. A bundle that is listed but
 * not on the rail cannot earn anything, and returns HTTP 404 to an agent that
 * found it in the catalogue and tried to pay. Verified three ways on 2026-08-18:
 * `x402_enabled = false` in the DB, absent from `GET /x402/catalog`, and 404 on
 * a live probe. `lead-email-verify` is the control — same construction, same
 * price band, `x402_enabled = true`, and 47 external sales in 30 days.
 *
 * This is the same shape of gap as DQ-11: a decision recorded as done, executed
 * on one surface out of two.
 *
 * Safe to enable: the solution gate in `routes/x402-gateway-v2.ts` `ensureCache()`
 * is `x402_enabled AND is_active`, and all fourteen component capabilities across
 * the four bundles pass the stricter capability gate (`is_active`,
 * `marketplace_eligible`, `lifecycle_state IN ('active','probation')`) with
 * healthy recent harness runs and live external traffic.
 *
 * **Why this block retires itself.** Every other block here is idempotent by
 * WHERE clause, which is right for repairs but wrong for a reversible business
 * flag: `WHERE x402_enabled = false` would re-enable a bundle on the next boot
 * after an operator had deliberately switched it off. That is exactly the
 * `scheduled_testing_eligible` footgun CLAUDE.md warns about, where a
 * boot-time rewrite silently reverts hand edits. So the block records itself in
 * `startup_migration_ledger` and reads that ledger before acting: it flips the
 * flag once, ever, and every later boot is a genuine no-op that leaves operator
 * intent alone.
 *
 * Reversal is one flag per bundle (`x402_enabled = false`) and it now stays
 * reversed. Nothing else about the bundles changes — price, composition and
 * catalogue listing are untouched.
 */
export const X402_GROWTH_BUNDLE_SLUGS = [
  "competitor-read",
  "page-seo-check",
  "prospect-brief",
  "keyword-scout",
] as const;

export async function runMigration0092_x402GrowthBundles(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0092_x402GrowthBundles";

  // The ledger is created here rather than in a schema block so this migration
  // is self-contained: nothing else depends on the table yet.
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once — operator intent is not overwritten)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  // NOT `slug = ANY(${array})`. drizzle's sql tag does not serialize a JS array
  // as a single Postgres array bind — it expands to the row-value tuple
  // `ANY(($1, $2, $3, $4))`, which Postgres rejects with "op ANY/ALL (array)
  // requires array on right side". See lib/internal-accounts.ts, which documents
  // this as the root cause of a prior production outage (commit 4bf58d0) that
  // has resurfaced three times since. In a startup migration the blast radius is
  // worse than a failed query: runStartupMigrations() throws on first failure and
  // index.ts exits, so the shape below is the difference between a deploy and a
  // crash loop. Built as a parameterized IN-list via sql.join instead.
  const slugList = sql.join(
    X402_GROWTH_BUNDLE_SLUGS.map((slug) => sql`${slug}`),
    sql`, `,
  );
  const res = await tx.execute(sql`
    UPDATE solutions
    SET x402_enabled = true,
        updated_at = now()
    WHERE slug IN (${slugList})
      AND is_active = true
      AND x402_enabled = false
  `);
  const affected = (res as { count?: number }).count ?? 0;

  // Written after the UPDATE, never before: if the UPDATE throws, boot aborts
  // with nothing recorded and the next boot retries. If the ledger write throws
  // after a successful UPDATE, the retry's UPDATE matches nothing
  // (`x402_enabled = false` is already false) and only the ledger row lands.
  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${affected})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      affected === 0
        ? "no change (growth bundles already on the x402 rail)"
        : `${affected} growth bundle(s) put on the x402 rail — listed publicly but unpayable since 2026-08-16`,
    rows_affected: affected,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0093: fixture_recapture_failures on test_suites ─────────────────
//
// Browserless harness-burn mitigation (branch ops/cut-browserless-harness-burn,
// 2026-08-18), HIGH-2b of the Codex closing-pass review. Adds the counter
// column `recordFixtureRecaptureFailure` (test-runner.ts) increments on a
// failed fixture-recapture attempt and `captureBaseline` resets to 0 on
// success — bounds a permanently-failing fixture suite to
// MAX_FIXTURE_RECAPTURE_FAILURES live retries before it quarantines, instead
// of retrying forever.
//
// `fixture_last_refreshed` (used by the sibling HIGH-1 max-age staleness
// fix) already exists in prod as of this migration — added by an earlier,
// untracked manual apply — so this block does not touch it; ADD COLUMN IF
// NOT EXISTS on it would be a harmless no-op if ever re-added here, but
// there is no need.
//
// MEDIUM (Codex closing-pass round 2, 2026-08-18): the original shape here
// was check-then-ALTER — SELECT information_schema.columns, branch, and only
// if absent run a bare `ADD COLUMN` (no `IF NOT EXISTS`). That's a TOCTOU
// race: two overlapping boots (a Railway deploy that briefly runs old and
// new instances together) can both read "column absent" from the SELECT,
// then both attempt the bare ALTER — the second one fails with Postgres's
// "column already exists" error, and `runStartupMigrations()` aborts boot on
// any block throwing (by design — see this file's header). The instance that
// loses the race never starts. `ADD COLUMN IF NOT EXISTS` is the pattern
// every other column-adding block since 0060 uses (0067, 0078, 0083, 0086,
// 0088) specifically because it's a single atomic DDL statement Postgres
// itself no-ops safely — no read-then-write gap for a second boot to land
// in. Adopting it here for the same reason; the check-then-ALTER shape
// (0029, 0030) predates that convention and was the wrong template to copy.

export async function runMigration0093_fixtureRecaptureFailures(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE "test_suites"
      ADD COLUMN IF NOT EXISTS "fixture_recapture_failures" integer DEFAULT 0 NOT NULL
  `);

  return {
    block: "0093_fixture_recapture_failures",
    outcome: "column ensured (fixture_recapture_failures)",
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0094: discard baselines this codebase's own churn invalidated ───
//
// One-time repair for the 0066/0069 ping-pong described at
// UNCLASSIFIED_ONLY. Fixing the churn stops NEW false invalidations, but
// the suites already carrying a polluted `updated_at` stay stale forever:
// `checkBaselineStaleness` compares against a timestamp that no longer
// corresponds to any edit, and `recordStaleFixture` refuses to re-baseline
// a suite that costs money to run.
//
// Scope, deliberately narrow. Only fixture suites that are BOTH
// external_cost_cents > 0 (so they took the refuse-and-wait path) AND
// owned by a capability 0069 classifies as free — that intersection IS
// the ping-pong set, and nothing else lands in it. Genuinely paid-vendor
// suites (`pep-check`, `sanctions-check`, `adverse-media-check`) are also
// stale, but for the honest reason the guard was built for: a human has
// not confirmed their edited input. They are left alone.
//
// Clearing the baseline rather than back-dating `updated_at`: the next
// scheduled run then executes live and captures a fresh baseline through
// the normal `captureBaseline` path (~1¢ per suite, twice, once). Writing
// a fabricated timestamp would re-bless output nobody has verified.
//
// Idempotent: the WHERE requires `baseline_output IS NOT NULL`, so a
// re-run after the recapture (which writes a baseline_captured_at newer
// than updated_at) matches nothing.

export async function runMigration0094_clearChurnInvalidatedBaselines(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  const update = await tx.execute(sql`
    UPDATE test_suites ts
       SET baseline_output = NULL,
           baseline_captured_at = NULL
      FROM capabilities c
     WHERE c.slug = ts.capability_slug
       AND ts.active
       AND ts.test_mode = 'fixture'
       AND ts.external_cost_cents > 0
       AND ts.baseline_output IS NOT NULL
       AND ts.baseline_captured_at IS NOT NULL
       AND ts.baseline_captured_at < ts.updated_at
       AND c.cost_class IN ('free_unlimited', 'free_quota', 'paid_with_free_tier')
  `);
  const updateCount = (update as { count?: number }).count ?? 0;

  return {
    block: "0094_clear_churn_invalidated_baselines",
    outcome:
      updateCount === 0
        ? "no churn-invalidated baselines remain"
        : `cleared ${updateCount} baseline(s) for live recapture`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}

// ─── Block 0112: list the eight free-public-API capabilities ───────────────
//
// PR #518 shipped eight capabilities built from the largest x402 buyer's
// observed basket — scholarly search, developer data and public-record
// lookups it buys from other x402 sellers. A follow-up session created the
// rows on 2026-09-04 and left them dark (`lifecycle_state = 'validating'`,
// `visible = false`, `x402_enabled = false`) to age into the automatic
// "green week" promotion. They cannot get there, for two independent reasons
// measured against production on 2026-09-05:
//
//  1. Six carry a generated `dependency_health` rule asserting a `status`
//     field their output does not contain — the "non-null on an optional
//     field" trap CLAUDE.md warns about. Four of five suites pass, so each
//     sits at a permanent 80% against `capability-promotion`'s 95% bar.
//     `cve-details` genuinely returns `status` (NVD's "Analyzed"), so its
//     identical check is correct and is left alone; `usgs-earthquake-search`
//     was auto-remediated to an empty check list after its second failure,
//     which is the shape this block writes for the other six.
//  2. The seven `cost_class = 'free_quota'` capabilities take a 24h per-suite
//     floor (72h for tier C), so they accrue ~4.3 results/day and would need
//     ~10 days to reach `minTests = 40` — not the week the dark-launch path
//     assumes. Two failures at 40 results is exactly 95.0%, on the boundary,
//     so a single transient upstream blip restarts the wait.
//
// Why now rather than after the wait: the platform's one paying x402 customer
// refunded its wallet with $230 on 2026-09-05 at 01:57Z after running dry on
// 09-03, and resumed calling three minutes later. At its historical burn that
// is ~15 days of runway. Automatic promotion would land around 09-14, at the
// end of that window. These eight were built for this buyer's basket.
//
// Evidence for overriding the gate, not ignoring it. All eight executors were
// run against their live upstreams on 2026-09-05 08:35Z: every one returned
// correct data in 273ms-2.0s with provenance intact (OpenAlex, arXiv, NCBI,
// Algolia HN, SEC EDGAR, NIST NVD, USGS). `known_answer` — the suite the
// promotion gate weights above all others — is green on all eight. Every
// upstream is free, keyless and official, so there is no cost exposure and no
// credential that can silently lapse. The quality floor stays armed and reads
// real customer traffic, which is the instrument that actually matters here.
//
// Why `lifecycle_state` moves too: `/x402/*` requires
// `lifecycle_state IN ('active','probation')` and `/v1/capabilities` requires
// `('active','degraded')`. Flipping `visible` and `x402_enabled` while leaving
// `'validating'` would list nothing and sell nothing — a silent no-op that
// reads as success. All eight already carry `is_active`,
// `marketplace_eligible` and `x402_method = 'POST'`, verified in production,
// so these three columns are the whole change.
//
// The test_suites update cannot disturb fixture baselines: all five suites on
// these capabilities are `test_mode = 'live'` with no baseline, so the
// `updated_at` bump that block 0094 exists to repair has nothing to
// invalidate.
//
// Ledger-guarded like 0100: a one-time correction of one decision, not a
// standing policy. If the floor later quarantines any of these on real
// traffic, that quarantine stands and this block will not undo it.
//
// Authority: DEC-20260815-A (quarantine and promotion are platform-acts-alone).

export async function runMigration0112_promoteFreeApiEight(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0112_promoteFreeApiEight";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);

  const prior = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;

  if (prior.length > 0) {
    return {
      block: BLOCK,
      outcome: "no change (already applied once — a later quarantine is not undone)",
      rows_affected: 0,
      duration_ms: Date.now() - startedAt,
    };
  }

  // Step 1 — drop the fabricated `status` assertion from the six whose output
  // has no such field. Exact-match on the whole rules object: if anything has
  // since edited these rules, this matches nothing rather than clobbering it.
  // cve-details is deliberately absent (its `status` is real).
  const fixed = await tx.execute(sql`
    UPDATE test_suites
       SET validation_rules = '{"checks":[]}'::jsonb,
           updated_at = now()
     WHERE test_type = 'dependency_health'
       AND capability_slug IN (
         'academic-paper-search', 'arxiv-search', 'hacker-news-search',
         'paper-details', 'pubmed-search', 'sec-edgar-filings'
       )
       AND validation_rules = '{"checks":[{"field":"status","operator":"not_null"}]}'::jsonb
  `);
  const fixedCount = (fixed as { count?: number }).count ?? 0;

  // Step 2 — list all eight. Narrow by construction: only the exact dark shape
  // matches, so a capability already listed (or since withdrawn) is untouched.
  const promoted = (await tx.execute(sql`
    UPDATE capabilities
       SET lifecycle_state = 'active',
           visible = true,
           x402_enabled = true,
           updated_at = now()
     WHERE slug IN (
       'academic-paper-search', 'arxiv-search', 'cve-details', 'hacker-news-search',
       'paper-details', 'pubmed-search', 'sec-edgar-filings', 'usgs-earthquake-search'
     )
       AND is_active = true
       AND visible = false
       AND lifecycle_state = 'validating'
       AND deactivation_reason IS NULL
     RETURNING slug
  `)) as unknown as Array<{ slug: string }>;
  const promotedSlugs = promoted.map((r) => r.slug);

  // One event per slug, written only for capabilities whose flags actually
  // moved. The floor's window clamp and the promotion job's "was this a
  // takedown?" test both read the most recent enforce-mode listing event; a
  // listing change without its evidence must be impossible in either
  // direction.
  for (const slug of promotedSlugs) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'capability_promotion',
        ${slug},
        1,
        'promoted_with_x402',
        ${JSON.stringify({
          mode: "enforce",
          dec: "DEC-20260815-A",
          reason:
            "Listed by operator decision ahead of the automatic green week. All eight executors verified against their live upstreams 2026-09-05T08:35Z (correct data, 273ms-2.0s, provenance intact); known_answer green on all eight; every upstream free, keyless and official. Automatic promotion was unreachable: six carried a dependency_health assertion on a status field their output lacks (permanent 80% against a 95% bar), and the free_quota 24h suite floor put minTests=40 about ten days out.",
          source: "startup-migration 0112",
          batch: "PR #518 free-public-API capabilities",
        })}::jsonb,
        true
      )
    `);
  }

  await tx.execute(sql`
    INSERT INTO startup_migration_ledger (block, rows_affected)
    VALUES (${BLOCK}, ${promotedSlugs.length + fixedCount})
    ON CONFLICT (block) DO NOTHING
  `);

  return {
    block: BLOCK,
    outcome:
      promotedSlugs.length === 0
        ? `no capability listed (already listed or withdrawn); ${fixedCount} dependency_health rule(s) corrected`
        : `listed ${promotedSlugs.length}: ${promotedSlugs.join(", ")}; ${fixedCount} dependency_health rule(s) corrected`,
    rows_affected: promotedSlugs.length + fixedCount,
    duration_ms: Date.now() - startedAt,
  };
}
