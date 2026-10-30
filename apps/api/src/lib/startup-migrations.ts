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
 * Adding a new block: write a `runMigrationXXXX_<name>` function in its
 * own file under `src/startup-migrations/blocks/` that uses
 * `IF NOT EXISTS` / `WHERE` for idempotency, register it in `BLOCKS`
 * below, declare its run policy in `src/startup-migrations/run-policy.ts`
 * ("every_boot" unless it provably qualifies as "once"), ledger it
 * (`npm run migrations:check -- --update`), ship a
 * regression test that asserts both shape (the SQL
 * has the idempotency markers) and behaviour (a second invocation
 * with the same input is a no-op).
 */

import postgres, { type Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDb } from "../db/index.js";
import { handlePgNotice } from "../db/pg-notice.js";
import { log } from "./log.js";
import { runStartupMigrationBlock } from "./startup-migration-block.js";
import type { BlockResult, MigrationExecutor } from "../startup-migrations/types.js";
import { runMigration0029_actualCostCents } from "../startup-migrations/blocks/0029-actual-cost-cents.js";
import { runMigration0030_complianceColumns } from "../startup-migrations/blocks/0030-compliance-columns.js";
import { runMigration0031_testResultsCompositeIdx } from "../startup-migrations/blocks/0031-test-results-composite-idx.js";
import { runMigration0060_marketplaceEligible } from "../startup-migrations/blocks/0060-marketplace-eligible.js";
import { runMigration0062_paidVendorCosts } from "../startup-migrations/blocks/0062-paid-vendor-costs.js";
import { runMigration0063_invoiceExtractCostReclassify } from "../startup-migrations/blocks/0063-invoice-extract-cost-reclassify.js";
import { runMigration0064_alwaysLlmHaikuCosts } from "../startup-migrations/blocks/0064-always-llm-haiku-costs.js";
import { runMigration0065_pr86LeakyCapsCleanup } from "../startup-migrations/blocks/0065-pr86-leaky-caps-cleanup.js";
import { runMigration0066_ensureEligibilityColumnAndReconcile } from "../startup-migrations/blocks/0066-ensure-eligibility-column-and-reconcile.js";
import { runMigration0067_costClassTaxonomy } from "../startup-migrations/blocks/0067-cost-class-taxonomy.js";
import { runMigration0068_seedDeDkSkCostClass } from "../startup-migrations/blocks/0068-seed-de-dk-sk-cost-class.js";
import { runMigration0069_reconcileEligibilityFromCostClass } from "../startup-migrations/blocks/0069-reconcile-eligibility-from-cost-class.js";
import { runMigration0070_capabilityBudgetCounters } from "../startup-migrations/blocks/0070-capability-budget-counters.js";
import { runMigration0071_bulkClassifyFreeUnlimited } from "../startup-migrations/blocks/0071-bulk-classify-free-unlimited.js";
import { runMigration0072_classifyFreeQuotaHighConfidence } from "../startup-migrations/blocks/0072-classify-free-quota-high-confidence.js";
import { runMigration0073_classifyFreeUnlimitedMediumConfidence } from "../startup-migrations/blocks/0073-classify-free-unlimited-medium-confidence.js";
import { runMigration0074_classifyAnthropicPaidPrepaid } from "../startup-migrations/blocks/0074-classify-anthropic-paid-prepaid.js";
import { runMigration0075_classifyFreeQuotaLowConfidence } from "../startup-migrations/blocks/0075-classify-free-quota-low-confidence.js";
import { runMigration0076_classifyNonAnthropicPaidPrepaid } from "../startup-migrations/blocks/0076-classify-non-anthropic-paid-prepaid.js";
import { runMigration0077_classifyFreeQuotaOverrides } from "../startup-migrations/blocks/0077-classify-free-quota-overrides.js";
import { runMigration0078_transactionsCapabilityIdCreatedAtIdx } from "../startup-migrations/blocks/0078-transactions-capability-id-created-at-idx.js";
import { runMigration0079_eeDirectors } from "../startup-migrations/blocks/0079-ee-directors.js";
import { runMigration0080_cyDirectors } from "../startup-migrations/blocks/0080-cy-directors.js";
import { runMigration0095_walletReservations } from "../startup-migrations/blocks/0095-wallet-reservations.js";
import { runMigration0096_x402SettlementIntents } from "../startup-migrations/blocks/0096-x402-settlement-intents.js";
import { runMigration0097_chainSequence } from "../startup-migrations/blocks/0097-chain-sequence.js";
import { runMigration0098_perCustomerIdempotency } from "../startup-migrations/blocks/0098-per-customer-idempotency.js";
import { runMigration0099_noHalfQuarantine } from "../startup-migrations/blocks/0099-no-half-quarantine.js";
import { runMigration0100_relistUrlToMarkdown } from "../startup-migrations/blocks/0100-relist-url-to-markdown.js";
import { runMigration0101_capabilityInvocations } from "../startup-migrations/blocks/0101-capability-invocations.js";
import { runMigration0102_accountLifecycleTables } from "../startup-migrations/blocks/0102-account-lifecycle-tables.js";
import { runMigration0103_redactedContentStaysRedacted } from "../startup-migrations/blocks/0103-redacted-content-stays-redacted.js";
import { runMigration0104_jobSchedule } from "../startup-migrations/blocks/0104-job-schedule.js";
import { runMigration0105_onboardingHookFailures } from "../startup-migrations/blocks/0105-onboarding-hook-failures.js";
import { runMigration0106_executionManifestSnapshots } from "../startup-migrations/blocks/0106-execution-manifest-snapshots.js";
import { runMigration0107_executionReceiptColumns } from "../startup-migrations/blocks/0107-execution-receipt-columns.js";
import { runMigration0108_receiptStateInvariants } from "../startup-migrations/blocks/0108-receipt-state-invariants.js";
import { runMigration0109_receiptEpoch } from "../startup-migrations/blocks/0109-receipt-epoch.js";
import { runMigration0110_receiptExecutionContext } from "../startup-migrations/blocks/0110-receipt-execution-context.js";
import { runMigration0111_vendorControlTower } from "../startup-migrations/blocks/0111-vendor-control-tower.js";
import { runMigration0081_attribution } from "../startup-migrations/blocks/0081-attribution.js";
import { runMigration0082_reclassifyThrottledFreeUnlimited } from "../startup-migrations/blocks/0082-reclassify-throttled-free-unlimited.js";
import { runMigration0083_x402PayerHash } from "../startup-migrations/blocks/0083-x402-payer-hash.js";
import { runMigration0084_danishQuotaHeadroom } from "../startup-migrations/blocks/0084-danish-quota-headroom.js";
import { runMigration0085_actorIdentity } from "../startup-migrations/blocks/0085-actor-identity.js";
import { runMigration0086_srcBasis } from "../startup-migrations/blocks/0086-src-basis.js";
import { runMigration0087_unhideRedactedRows } from "../startup-migrations/blocks/0087-unhide-redacted-rows.js";
import { runMigration0088_solutionGateCondition } from "../startup-migrations/blocks/0088-solution-gate-condition.js";
import { runMigration0089_deactivateUsCourtSearch } from "../startup-migrations/blocks/0089-deactivate-us-court-search.js";
import { runMigration0090_capabilityOutputContracts } from "../startup-migrations/blocks/0090-capability-output-contracts.js";
import { runMigration0091_bolStaleValidationRules } from "../startup-migrations/blocks/0091-bol-stale-validation-rules.js";
import { runMigration0092_x402GrowthBundles } from "../startup-migrations/blocks/0092-x402-growth-bundles.js";
import { runMigration0093_fixtureRecaptureFailures } from "../startup-migrations/blocks/0093-fixture-recapture-failures.js";
import { runMigration0094_clearChurnInvalidatedBaselines } from "../startup-migrations/blocks/0094-clear-churn-invalidated-baselines.js";
import { runMigration0112_promoteFreeApiEight } from "../startup-migrations/blocks/0112-promote-free-api-eight.js";
import { runMigration0113_releaseWronglyQuarantinedRefusalSuites } from "../startup-migrations/blocks/0113-release-wrongly-quarantined-refusal-suites.js";
import { runMigration0114_releaseCorrectedDependencyHealthFixtures } from "../startup-migrations/blocks/0114-release-corrected-dependency-health-fixtures.js";
import { runMigration0115_resyncCanadianCompanyDataDependencyHealth } from "../startup-migrations/blocks/0115-resync-canadian-company-data-dependency-health.js";
import { runMigration0116_resyncSpanishCompanyDataDependencyHealth } from "../startup-migrations/blocks/0116-resync-spanish-company-data-dependency-health.js";
import { runMigration0117_clearStandingCatalogueAlerts } from "../startup-migrations/blocks/0117-clear-standing-catalogue-alerts.js";
import { runMigration0118_clearDanishFalseBreakerSuccess } from "../startup-migrations/blocks/0118-clear-danish-false-breaker-success.js";
import { runMigration0119_resyncGermanCompanyDataDependencyHealth } from "../startup-migrations/blocks/0119-resync-german-company-data-dependency-health.js";
import { runMigration0120_declareFearGreedAttribution } from "../startup-migrations/blocks/0120-declare-fear-greed-attribution.js";
import { runMigration0121_phase0CatalogueRepairs } from "../startup-migrations/blocks/0121-phase0-catalogue-repairs.js";
import { runMigration0122_correctSanctionsSourceCopy } from "../startup-migrations/blocks/0122-correct-sanctions-source-copy.js";
import { runMigration0123_catalogueCopy } from "../startup-migrations/blocks/0123-catalogue-copy.js";
import { runMigration0124_publicDescriptions } from "../startup-migrations/blocks/0124-public-descriptions.js";
import { runMigration0125_apiKeys } from "../startup-migrations/blocks/0125-api-keys.js";
import { runMigration0126_signupSource } from "../startup-migrations/blocks/0126-signup-source.js";
import { runMigration0127_integrityHashIndex } from "../startup-migrations/blocks/0127-integrity-hash-index.js";
import { runMigration0128_manifestTextHash } from "../startup-migrations/blocks/0128-manifest-text-hash.js";
import { runMigration0129_transactionCost } from "../startup-migrations/blocks/0129-transaction-cost.js";
import { runMigration0130_syncWalletHolds } from "../startup-migrations/blocks/0130-sync-wallet-holds.js";
import { runMigration0131_startupMigrationApplied } from "../startup-migrations/blocks/0131-startup-migration-applied.js";
import { runMigration0132_dropSqsResidualSchema } from "../startup-migrations/blocks/0132-drop-sqs-residual-schema.js";
import { runMigration0133_oauthConnector } from "../startup-migrations/blocks/0133-oauth-connector.js";
import { runMigration0134_renameCapabilityHealthToSourceHealth } from "../startup-migrations/blocks/0134-rename-capability-health-to-source-health.js";
import { runMigration0135_batchOrders } from "../startup-migrations/blocks/0135-batch-orders.js";
import { runMigration0136_asyncJobFiles } from "../startup-migrations/blocks/0136-async-job-files.js";
import { runMigration0137_completeComplianceColumns } from "../startup-migrations/blocks/0137-complete-compliance-columns.js";
import { runMigration0138_redactedRowDeletionReason } from "../startup-migrations/blocks/0138-redacted-row-deletion-reason.js";
import { runMigration0139_redeleteCustomerDeletedRedactedRows } from "../startup-migrations/blocks/0139-redelete-customer-deleted-redacted-rows.js";
import { runMigration0140_deactivatePriceCompare } from "../startup-migrations/blocks/0140-deactivate-price-compare.js";
import { LEDGER_BY_FUNCTION, planBlock, readApplied, recordApplied, type LedgerRow } from "../startup-migrations/applied.js";
import { BLOCK_RUN_POLICY } from "../startup-migrations/run-policy.js";

// Every block lives in its own file under src/startup-migrations/blocks/;
// this module keeps the run order (BLOCKS) and the runner. Re-exported so
// callers and tests keep one import path.
export type { BlockResult, MigrationExecutor } from "../startup-migrations/types.js";
export * from "../startup-migrations/blocks/0029-actual-cost-cents.js";
export * from "../startup-migrations/blocks/0030-compliance-columns.js";
export * from "../startup-migrations/blocks/0031-test-results-composite-idx.js";
export * from "../startup-migrations/blocks/0060-marketplace-eligible.js";
export * from "../startup-migrations/blocks/0062-paid-vendor-costs.js";
export * from "../startup-migrations/blocks/0063-invoice-extract-cost-reclassify.js";
export * from "../startup-migrations/blocks/0064-always-llm-haiku-costs.js";
export * from "../startup-migrations/blocks/0065-pr86-leaky-caps-cleanup.js";
export * from "../startup-migrations/blocks/0066-ensure-eligibility-column-and-reconcile.js";
export * from "../startup-migrations/blocks/0067-cost-class-taxonomy.js";
export * from "../startup-migrations/blocks/0068-seed-de-dk-sk-cost-class.js";
export * from "../startup-migrations/blocks/0069-reconcile-eligibility-from-cost-class.js";
export * from "../startup-migrations/blocks/0070-capability-budget-counters.js";
export * from "../startup-migrations/blocks/0071-bulk-classify-free-unlimited.js";
export * from "../startup-migrations/blocks/0072-classify-free-quota-high-confidence.js";
export * from "../startup-migrations/blocks/0073-classify-free-unlimited-medium-confidence.js";
export * from "../startup-migrations/blocks/0074-classify-anthropic-paid-prepaid.js";
export * from "../startup-migrations/blocks/0075-classify-free-quota-low-confidence.js";
export * from "../startup-migrations/blocks/0076-classify-non-anthropic-paid-prepaid.js";
export * from "../startup-migrations/blocks/0077-classify-free-quota-overrides.js";
export * from "../startup-migrations/blocks/0078-transactions-capability-id-created-at-idx.js";
export * from "../startup-migrations/blocks/0079-ee-directors.js";
export * from "../startup-migrations/blocks/0080-cy-directors.js";
export * from "../startup-migrations/blocks/0095-wallet-reservations.js";
export * from "../startup-migrations/blocks/0096-x402-settlement-intents.js";
export * from "../startup-migrations/blocks/0097-chain-sequence.js";
export * from "../startup-migrations/blocks/0098-per-customer-idempotency.js";
export * from "../startup-migrations/blocks/0099-no-half-quarantine.js";
export * from "../startup-migrations/blocks/0100-relist-url-to-markdown.js";
export * from "../startup-migrations/blocks/0101-capability-invocations.js";
export * from "../startup-migrations/blocks/0102-account-lifecycle-tables.js";
export * from "../startup-migrations/blocks/0103-redacted-content-stays-redacted.js";
export * from "../startup-migrations/blocks/0104-job-schedule.js";
export * from "../startup-migrations/blocks/0105-onboarding-hook-failures.js";
export * from "../startup-migrations/blocks/0106-execution-manifest-snapshots.js";
export * from "../startup-migrations/blocks/0107-execution-receipt-columns.js";
export * from "../startup-migrations/blocks/0108-receipt-state-invariants.js";
export * from "../startup-migrations/blocks/0109-receipt-epoch.js";
export * from "../startup-migrations/blocks/0110-receipt-execution-context.js";
export * from "../startup-migrations/blocks/0111-vendor-control-tower.js";
export * from "../startup-migrations/blocks/0081-attribution.js";
export * from "../startup-migrations/blocks/0082-reclassify-throttled-free-unlimited.js";
export * from "../startup-migrations/blocks/0083-x402-payer-hash.js";
export * from "../startup-migrations/blocks/0084-danish-quota-headroom.js";
export * from "../startup-migrations/blocks/0085-actor-identity.js";
export * from "../startup-migrations/blocks/0086-src-basis.js";
export * from "../startup-migrations/blocks/0087-unhide-redacted-rows.js";
export * from "../startup-migrations/blocks/0088-solution-gate-condition.js";
export * from "../startup-migrations/blocks/0089-deactivate-us-court-search.js";
export * from "../startup-migrations/blocks/0090-capability-output-contracts.js";
export * from "../startup-migrations/blocks/0091-bol-stale-validation-rules.js";
export * from "../startup-migrations/blocks/0092-x402-growth-bundles.js";
export * from "../startup-migrations/blocks/0093-fixture-recapture-failures.js";
export * from "../startup-migrations/blocks/0094-clear-churn-invalidated-baselines.js";
export * from "../startup-migrations/blocks/0112-promote-free-api-eight.js";
export * from "../startup-migrations/blocks/0113-release-wrongly-quarantined-refusal-suites.js";
export * from "../startup-migrations/blocks/0114-release-corrected-dependency-health-fixtures.js";
export * from "../startup-migrations/blocks/0115-resync-canadian-company-data-dependency-health.js";
export * from "../startup-migrations/blocks/0116-resync-spanish-company-data-dependency-health.js";
export * from "../startup-migrations/blocks/0117-clear-standing-catalogue-alerts.js";
export * from "../startup-migrations/blocks/0118-clear-danish-false-breaker-success.js";
export * from "../startup-migrations/blocks/0119-resync-german-company-data-dependency-health.js";
export * from "../startup-migrations/blocks/0120-declare-fear-greed-attribution.js";
export * from "../startup-migrations/blocks/0121-phase0-catalogue-repairs.js";
export * from "../startup-migrations/blocks/0122-correct-sanctions-source-copy.js";
export * from "../startup-migrations/blocks/0123-catalogue-copy.js";
export * from "../startup-migrations/blocks/0124-public-descriptions.js";
export * from "../startup-migrations/blocks/0125-api-keys.js";
export * from "../startup-migrations/blocks/0126-signup-source.js";
export * from "../startup-migrations/blocks/0127-integrity-hash-index.js";
export * from "../startup-migrations/blocks/0128-manifest-text-hash.js";
export * from "../startup-migrations/blocks/0129-transaction-cost.js";
export * from "../startup-migrations/blocks/0130-sync-wallet-holds.js";
export * from "../startup-migrations/blocks/0131-startup-migration-applied.js";
export * from "../startup-migrations/blocks/0132-drop-sqs-residual-schema.js";
export * from "../startup-migrations/blocks/0133-oauth-connector.js";
export * from "../startup-migrations/blocks/0134-rename-capability-health-to-source-health.js";
export * from "../startup-migrations/blocks/0135-batch-orders.js";
export * from "../startup-migrations/blocks/0136-async-job-files.js";
export * from "../startup-migrations/blocks/0137-complete-compliance-columns.js";
export * from "../startup-migrations/blocks/0138-redacted-row-deletion-reason.js";
export * from "../startup-migrations/blocks/0139-redelete-customer-deleted-redacted-rows.js";
export * from "../startup-migrations/blocks/0140-deactivate-price-compare.js";

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
  runMigration0113_releaseWronglyQuarantinedRefusalSuites,
  runMigration0114_releaseCorrectedDependencyHealthFixtures,
  runMigration0115_resyncCanadianCompanyDataDependencyHealth,
  runMigration0116_resyncSpanishCompanyDataDependencyHealth,
  runMigration0117_clearStandingCatalogueAlerts,
  runMigration0118_clearDanishFalseBreakerSuccess,
  runMigration0119_resyncGermanCompanyDataDependencyHealth,
  runMigration0120_declareFearGreedAttribution,
  runMigration0121_phase0CatalogueRepairs,
  runMigration0122_correctSanctionsSourceCopy,
  runMigration0123_catalogueCopy,
  runMigration0124_publicDescriptions,
  runMigration0125_apiKeys,
  runMigration0126_signupSource,
  runMigration0127_integrityHashIndex,
  runMigration0128_manifestTextHash,
  runMigration0129_transactionCost,
  runMigration0130_syncWalletHolds,
  runMigration0131_startupMigrationApplied,
  runMigration0132_dropSqsResidualSchema,
  runMigration0133_oauthConnector,
  runMigration0134_renameCapabilityHealthToSourceHealth,
  runMigration0135_batchOrders,
  runMigration0136_asyncJobFiles,
  runMigration0137_completeComplianceColumns,
  // 0139 needs 0138's trigger rule to change deletion_reason.
  runMigration0138_redactedRowDeletionReason,
  runMigration0139_redeleteCustomerDeletedRedactedRows,
  runMigration0140_deactivatePriceCompare,
];

/**
 * Run every registered migration block, in order. Throws on first
 * failure — the caller in index.ts has the catch that exits the
 * process with a fatal log. Don't catch internally; missing schema
 * is not something the API can run with.
 *
 * A block whose run policy is "once" is skipped once its ledger hash is
 * recorded as applied (see startup-migrations/applied.ts); `force` runs
 * every block regardless, which the admin endpoint uses.
 *
 * Returns the per-block summary so callers (the admin endpoint) can
 * surface it as an HTTP response. The startup wiring in index.ts
 * ignores the return value; the throw-on-failure semantics is what
 * matters there.
 */
// Fixed signed bigint key reserved for the startup runner (ASCII STRALE).
// String binding avoids JS precision loss for 64-bit advisory-lock keys.
const STARTUP_MIGRATIONS_LOCK_KEY = "91621622369349";
const STARTUP_MIGRATIONS_LOCK_WAIT_MS = 60_000;

export async function runStartupMigrations(
  options: { force?: boolean } = {},
): Promise<BlockResult[]> {
  const startedAt = Date.now();
  const db = getDb();
  const results: BlockResult[] = [];
  // A separate one-session client prevents pool starvation: blocks 0125,
  // 0127 and 0130 reserve their own main-pool connections for CONCURRENTLY.
  // Never run those blocks on this session or inside a transaction.
  const lockClient = postgres(process.env.DATABASE_URL!, {
    max: 1,
    connect_timeout: 5,
    connection: { statement_timeout: 5_000 },
    // The blocks below are idempotent DDL, so every boot emits a burst of
    // "already exists, skipping" notices. Without this handler postgres-js
    // prints each to the console as a raw multi-line object, which is what
    // crossed Railway's 500-logs/sec-per-replica limit and made it drop real
    // lines (2026-10-30). These two runner-owned clients are the ones that
    // emit them — getDb()'s pool barely does, so handling it only there
    // changed nothing.
    onnotice: handlePgNotice,
  });
  let connection: Awaited<ReturnType<Sql["reserve"]>> | undefined;
  let acquired = false;
  let blockClient: Sql | undefined;
  try {
    connection = await lockClient.reserve();
    const deadline = Date.now() + STARTUP_MIGRATIONS_LOCK_WAIT_MS;
    while (Date.now() < deadline) {
      const rows = await connection.unsafe<{ acquired: boolean }[]>(
        "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
        [STARTUP_MIGRATIONS_LOCK_KEY],
      );
      if (rows[0]?.acquired) {
        acquired = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!acquired) {
      log.warn({ label: "startup-migrations-lock-timeout", wait_ms: Date.now() - startedAt },
        "startup-migrations-lock-timeout");
      // Boot ignores the result; the emergency admin caller needs an
      // explicit skip outcome instead of an empty apparent success.
      return [{ block: "startup-migrations-lock", outcome: "skipped (advisory lock timeout; no migrations ran)", duration_ms: Date.now() - startedAt }];
    }
    log.info({ label: "startup-migrations-lock-acquired", wait_ms: Date.now() - startedAt },
      "startup-migrations-lock-acquired");
    log.info({ label: "startup-migrations-begin", block_count: BLOCKS.length }, "startup-migrations-begin");

    const pool = (db as typeof db & { $client: Sql }).$client;
    // A runner-owned pool can be closed if resetting a block session fails,
    // without recycling altered settings or closing the API's traffic pool.
    blockClient = postgres(process.env.DATABASE_URL!, {
      max: 1,
      connection: pool.options.connection,
      onnotice: handlePgNotice,
    });
    // Match getDb()'s transparent JSON/date codecs before executing compiled
    // SQL on reserved sessions (otherwise JSON strings are double-encoded).
    drizzle(blockClient);
    // Kept well inside Railway's 20 s healthcheck window, which also covers boot work.
    const lockBudget = { remainingMs: 10_000 };
    // null until block 0131 has created the table: nothing is skipped, and
    // blocks that ran before it are recorded as soon as it exists.
    // STARTUP_MIGRATIONS_FORCE=1 is the recovery path when boot itself fails
    // (the admin endpoint needs a running API).
    const force = options.force === true || process.env.STARTUP_MIGRATIONS_FORCE === "1";
    if (force) log.warn({ label: "startup-migrations-force" }, "startup-migrations-force: every block runs");
    let applied = await readApplied(db);
    const unrecorded: LedgerRow[] = [];
    let skipped = 0;
    for (const block of BLOCKS) {
      const ledgerRow = LEDGER_BY_FUNCTION.get(block.name);
      const plan = planBlock(block.name, ledgerRow, applied?.get(block.name),
        BLOCK_RUN_POLICY[block.name]?.policy, force);
      if (plan.action === "skip") {
        skipped++;
        const result = { block: block.name, outcome: `skipped (applied; ledger ${plan.ledgerId} hash recorded)`, duration_ms: 0 };
        results.push(result);
        log.info({ label: "startup-migration-block", block: result.block, outcome: result.outcome,
          rows_affected: null, duration_ms: 0 }, `startup-migration-block ${result.block}`);
        continue;
      }
      const result = await runStartupMigrationBlock(block, pool, blockClient, lockBudget);
      results.push(result);
      if (ledgerRow) unrecorded.push(ledgerRow);
      else log.warn({ label: "startup-migration-unledgered", block: block.name }, "startup-migration-unledgered");
      if (applied === null && block === runMigration0131_startupMigrationApplied) applied = await readApplied(db);
      if (applied) {
        for (const row of unrecorded.splice(0)) {
          // Not fatal: an unrecorded block only runs again on the next boot.
          try {
            await recordApplied(db, row);
            applied.set(row.function, row.sha256);
          } catch (err) {
            log.error({ label: "startup-migration-record-failed", block: row.function,
              err: err instanceof Error ? err.message : String(err) }, "startup-migration-record-failed");
          }
        }
      }
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
        skipped_count: skipped,
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
  } finally {
    try {
      if (acquired) {
        // A dead lock session already lost the lock; a failed unlock must not
        // turn a completed migration run into a boot failure.
        try {
          await connection!.unsafe("SELECT pg_advisory_unlock($1::bigint)", [STARTUP_MIGRATIONS_LOCK_KEY]);
        } catch (err) {
          const { log } = await import("./log.js");
          log.warn({ label: "startup-migrations-unlock-failed", err: err instanceof Error ? err.message : String(err) }, "advisory unlock failed; session is closed below");
        }
      }
    } finally {
      connection?.release();
      // Close the dedicated session even if unlock fails; a session-level
      // lock must never leak into a reusable pool after a failed migration.
      try { await blockClient?.end({ timeout: 0 }); }
      finally { await lockClient.end({ timeout: 5 }); }
    }
  }
}
