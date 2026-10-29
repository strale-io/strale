/**
 * How often each startup-migration block runs (H7d).
 *
 * The runner records every block's ledger hash after it runs
 * (`startup_migration_applied`, block 0131). A block marked "once" is then
 * skipped on later boots while its recorded hash equals its ledger hash. A
 * block marked "every_boot" keeps running on every boot, as all blocks did
 * before: reconcilers, blocks that read live code, blocks that can return
 * normally with their work deferred, and blocks whose effect needs rows that
 * may not exist yet.
 *
 * "once" needs all of: every normal return means the work is complete; no
 * input outside the block's own text and frozen data; not a reconciler; a
 * re-run on a database where it completed changes nothing; and every object
 * it creates is one schema validation checks (a column, a table or a plain
 * index), so a hand-dropped object fails boot loudly instead of staying
 * missing. A unique index, CHECK, view or trigger is not checked, so a block
 * that creates one keeps running every boot, which is what restores it. When in doubt,
 * "every_boot": it is always safe. Every block in BLOCKS must be listed here
 * (startup-migrations.test.ts).
 */
export type BlockRunPolicy = "once" | "every_boot";

export const BLOCK_RUN_POLICY: Readonly<Record<string, { policy: BlockRunPolicy; reason: string }>> = {
  runMigration0029_actualCostCents: { policy: "once", reason: "single ADD COLUMN; its skip check covers the whole change" },
  runMigration0030_complianceColumns: { policy: "every_boot", reason: "its skip check covers only the first of its columns, and the runner opens no transaction" },
  runMigration0031_testResultsCompositeIdx: { policy: "once", reason: "one CREATE INDEX IF NOT EXISTS" },
  runMigration0060_marketplaceEligible: { policy: "once", reason: "ADD COLUMN IF NOT EXISTS only" },
  runMigration0062_paidVendorCosts: { policy: "every_boot", reason: "post-condition re-checks suites created after it first ran" },
  runMigration0063_invoiceExtractCostReclassify: { policy: "every_boot", reason: "post-condition re-checks suites created after it first ran" },
  runMigration0064_alwaysLlmHaikuCosts: { policy: "every_boot", reason: "its slug list is a registry that grows with new LLM capabilities" },
  runMigration0065_pr86LeakyCapsCleanup: { policy: "every_boot", reason: "its slug list is a registry that grows; post-condition re-checks later suites" },
  runMigration0066_ensureEligibilityColumnAndReconcile: { policy: "every_boot", reason: "reconciler: re-derives scheduled_testing_eligible from external_cost_cents (CLAUDE.md)" },
  runMigration0067_costClassTaxonomy: { policy: "every_boot", reason: "its CHECK constraints are not checked by schema validation; a re-run restores a dropped one" },
  runMigration0068_seedDeDkSkCostClass: { policy: "every_boot", reason: "returns normally when its target rows are not present yet" },
  runMigration0069_reconcileEligibilityFromCostClass: { policy: "every_boot", reason: "reconciler: re-derives eligibility from capabilities.cost_class" },
  runMigration0070_capabilityBudgetCounters: { policy: "every_boot", reason: "its CHECK constraint is not checked by schema validation; a re-run restores a dropped one" },
  runMigration0071_bulkClassifyFreeUnlimited: { policy: "every_boot", reason: "returns normally when target capabilities are not present yet" },
  runMigration0072_classifyFreeQuotaHighConfidence: { policy: "every_boot", reason: "returns normally when target capabilities are not present yet" },
  runMigration0073_classifyFreeUnlimitedMediumConfidence: { policy: "every_boot", reason: "returns normally when target capabilities are not present yet" },
  runMigration0074_classifyAnthropicPaidPrepaid: { policy: "every_boot", reason: "returns normally when target capabilities are not present yet" },
  runMigration0075_classifyFreeQuotaLowConfidence: { policy: "every_boot", reason: "returns normally when target capabilities are not present yet" },
  runMigration0076_classifyNonAnthropicPaidPrepaid: { policy: "every_boot", reason: "returns normally when target capabilities are not present yet" },
  runMigration0077_classifyFreeQuotaOverrides: { policy: "every_boot", reason: "returns normally when target capabilities are not present yet" },
  runMigration0078_transactionsCapabilityIdCreatedAtIdx: { policy: "once", reason: "one CREATE INDEX IF NOT EXISTS" },
  runMigration0079_eeDirectors: { policy: "every_boot", reason: "its UNIQUE and CHECK constraints are not checked by schema validation; a re-run restores them" },
  runMigration0080_cyDirectors: { policy: "every_boot", reason: "its UNIQUE and CHECK constraints are not checked by schema validation; a re-run restores them" },
  runMigration0081_attribution: { policy: "once", reason: "ADD COLUMN and CREATE TABLE/INDEX IF NOT EXISTS only" },
  runMigration0082_reclassifyThrottledFreeUnlimited: { policy: "every_boot", reason: "imports lib/capability-manifest-types.js; re-applies to capabilities onboarded later" },
  runMigration0083_x402PayerHash: { policy: "once", reason: "ADD COLUMN and CREATE INDEX IF NOT EXISTS only" },
  runMigration0084_danishQuotaHeadroom: { policy: "every_boot", reason: "returns normally when its capability is absent" },
  runMigration0085_actorIdentity: { policy: "every_boot", reason: "re-creates its view each run; schema validation does not check views" },
  runMigration0086_srcBasis: { policy: "once", reason: "ADD COLUMN and CREATE INDEX IF NOT EXISTS only" },
  runMigration0087_unhideRedactedRows: { policy: "every_boot", reason: "its predicate keeps matching rows written at runtime" },
  runMigration0088_solutionGateCondition: { policy: "once", reason: "one ADD COLUMN IF NOT EXISTS" },
  runMigration0089_deactivateUsCourtSearch: { policy: "every_boot", reason: "re-deactivates the capability whenever it is active again" },
  runMigration0090_capabilityOutputContracts: { policy: "every_boot", reason: "re-syncs rows from the live lib/capability-output-contracts.js" },
  runMigration0091_bolStaleValidationRules: { policy: "every_boot", reason: "overwrites drifted validation_rules; no-op when suites are absent" },
  runMigration0092_x402GrowthBundles: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0093_fixtureRecaptureFailures: { policy: "once", reason: "one ADD COLUMN IF NOT EXISTS" },
  runMigration0094_clearChurnInvalidatedBaselines: { policy: "every_boot", reason: "its predicate keeps matching suites whose updated_at moves" },
  runMigration0095_walletReservations: { policy: "every_boot", reason: "defers its constraint to a later boot on failure" },
  runMigration0096_x402SettlementIntents: { policy: "every_boot", reason: "its unique indexes guard x402 settlement against double settling and are not checked by schema validation" },
  runMigration0097_chainSequence: { policy: "every_boot", reason: "returns normally before any hashed row exists to seed from" },
  runMigration0098_perCustomerIdempotency: { policy: "every_boot", reason: "defers its index swap to a later boot on lock contention" },
  runMigration0099_noHalfQuarantine: { policy: "every_boot", reason: "defers its constraint to a later boot on failure" },
  runMigration0100_relistUrlToMarkdown: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0101_capabilityInvocations: { policy: "every_boot", reason: "defer-not-throw: returns normally with the work deferred" },
  runMigration0102_accountLifecycleTables: { policy: "every_boot", reason: "its unique index guards Stripe sessions against double crediting and is not checked by schema validation" },
  runMigration0103_redactedContentStaysRedacted: { policy: "every_boot", reason: "recreates the redaction trigger if it was dropped or disabled" },
  runMigration0104_jobSchedule: { policy: "once", reason: "IF NOT EXISTS DDL; verification throws" },
  runMigration0105_onboardingHookFailures: { policy: "once", reason: "one ADD COLUMN IF NOT EXISTS" },
  runMigration0106_executionManifestSnapshots: { policy: "every_boot", reason: "drops and recreates its immutability triggers each run" },
  runMigration0107_executionReceiptColumns: { policy: "every_boot", reason: "re-asserts its NOT VALID CHECK constraints each run" },
  runMigration0108_receiptStateInvariants: { policy: "every_boot", reason: "re-asserts its constraints, functions and triggers each run" },
  runMigration0109_receiptEpoch: { policy: "every_boot", reason: "sets its DEFAULTs each run so a hand-dropped default is repaired" },
  runMigration0110_receiptExecutionContext: { policy: "every_boot", reason: "its CHECK constraints are not checked by schema validation; a re-run restores a dropped one" },
  runMigration0111_vendorControlTower: { policy: "every_boot", reason: "syncs from the live lib/dependency-manifest.js every boot" },
  runMigration0112_promoteFreeApiEight: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0113_releaseWronglyQuarantinedRefusalSuites: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0114_releaseCorrectedDependencyHealthFixtures: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0115_resyncCanadianCompanyDataDependencyHealth: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0116_resyncSpanishCompanyDataDependencyHealth: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0117_clearStandingCatalogueAlerts: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0118_clearDanishFalseBreakerSuccess: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0119_resyncGermanCompanyDataDependencyHealth: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0120_declareFearGreedAttribution: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0121_phase0CatalogueRepairs: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0122_correctSanctionsSourceCopy: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0123_catalogueCopy: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0124_publicDescriptions: { policy: "once", reason: "already one-shot through startup_migration_ledger" },
  runMigration0125_apiKeys: { policy: "every_boot", reason: "CREATE INDEX CONCURRENTLY IF NOT EXISTS can return with an invalid index" },
  runMigration0126_signupSource: { policy: "every_boot", reason: "its CHECK constraint is not checked by schema validation; a re-run restores a dropped one" },
  runMigration0127_integrityHashIndex: { policy: "every_boot", reason: "CREATE INDEX CONCURRENTLY repair, checked every boot by design" },
  runMigration0128_manifestTextHash: { policy: "once", reason: "guarded ADD COLUMN in one DO block" },
  runMigration0129_transactionCost: { policy: "once", reason: "guarded ADD COLUMNs in one DO block" },
  runMigration0130_syncWalletHolds: { policy: "every_boot", reason: "CREATE INDEX CONCURRENTLY IF NOT EXISTS can return with an invalid index" },
  runMigration0131_startupMigrationApplied: { policy: "once", reason: "one CREATE TABLE IF NOT EXISTS" },
  runMigration0132_dropSqsResidualSchema: { policy: "every_boot", reason: "returns deferred until a build without the SQS fields has served; then drops once" },
  runMigration0133_oauthConnector: { policy: "every_boot", reason: "creates a UNIQUE and a CHECK constraint, which schema validation does not check; when in doubt, every_boot" },
  runMigration0134_renameCapabilityHealthToSourceHealth: { policy: "every_boot", reason: "creates a view, which schema validation does not check; a re-run costs one catalogue query and skips unless capability_health is a table" },
  runMigration0135_batchOrders: { policy: "every_boot", reason: "creates a partial UNIQUE index, which schema validation does not check" },
};
