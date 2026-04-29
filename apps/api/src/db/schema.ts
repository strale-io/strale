import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  decimal,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComplianceCoverageItem {
  framework: string;
  reference: string;
  requirement: string;
  straleProvides: string;
  scope: "eu" | "us" | "global";
  geographyRelevance: "primary" | "supporting";
}

// ─── users ──────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  signupIpHash: varchar("signup_ip_hash", { length: 16 }),
  maxSpendPerHourCents: integer("max_spend_per_hour_cents")
    .notNull()
    .default(10000), // €100/hr
  // Activation funnel tracking
  firstTransactionAt: timestamp("first_transaction_at", { withTimezone: true }),
  activationEmailStage: integer("activation_email_stage").notNull().default(0),
  activationCompletedAt: timestamp("activation_completed_at", { withTimezone: true }),
  // Cert-audit G1 (GDPR Art. 17): erasure marker. When set, the row is
  // anonymized (email/name/apiKeyHash overwritten with sentinel values)
  // and the user can no longer authenticate. Historical transactions are
  // NOT deleted because they participate in the audit hash chain (Art. 30
  // records-of-processing balance, DEC-20260428-B); the FK still points
  // to this redacted row.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletionReason: text("deletion_reason"),
  // Cert-audit G7: ToS acceptance is recorded at signup so we can show
  // proof of contract formation if disputed. Version string lets us
  // identify which Terms revision the user accepted.
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  tosVersion: varchar("tos_version", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── wallets ────────────────────────────────────────────────────────────────
export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  balanceCents: integer("balance_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── wallet_transactions ────────────────────────────────────────────────────
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    amountCents: integer("amount_cents").notNull(), // positive = top-up, negative = purchase
    type: varchar("type", { length: 20 }).notNull(), // 'top_up' | 'purchase' | 'refund' | 'trial_credit'
    referenceId: uuid("reference_id"), // links to transactions.id if purchase
    stripeSessionId: varchar("stripe_session_id", { length: 255 }),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("wallet_transactions_stripe_session_id_unique")
      .on(table.stripeSessionId)
      .where(sql`stripe_session_id IS NOT NULL`),
  ],
);

// ─── capabilities ───────────────────────────────────────────────────────────
export const capabilities = pgTable("capabilities", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  inputSchema: jsonb("input_schema").notNull(),
  outputSchema: jsonb("output_schema").notNull(), // documentation only, not enforcement (DEC-16 area)
  priceCents: integer("price_cents").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  avgLatencyMs: integer("avg_latency_ms"),
  successRate: decimal("success_rate", { precision: 5, scale: 4 }),
  transparencyTag: varchar("transparency_tag", { length: 30 }),
  // 'ai_generated' | 'algorithmic' | 'mixed'
  geography: varchar("geography", { length: 50 }),
  // 'global' | 'eu' | 'nordic' | 'us' | 'uk' | etc.
  dataSource: text("data_source"),
  dataClassification: text("data_classification"),
  // SA.2b (F-A-003, F-A-009, migrations 0049 + 0050): per-capability PII
  // classification. NOT NULL after SA.2b.d backfill (all 307 rows have
  // a non-NULL value). Heuristic fallback in audit-helpers.ts was deleted
  // in the paired commit; runtime reads this column directly.
  processesPersonalData: boolean("processes_personal_data").notNull().default(false),
  personalDataCategories: text("personal_data_categories").array().default([]),
  freshnessCategory: text("freshness_category"),
  // 'live-fetch' | 'reference-data' | 'computed'
  dataUpdateCycleDays: integer("data_update_cycle_days"),
  datasetLastUpdated: timestamp("dataset_last_updated", { withTimezone: true }),
  isFreeTier: boolean("is_free_tier").notNull().default(false),
  // Dual-profile SQS columns
  capabilityType: text("capability_type").notNull().default("stable_api"),
  // 'deterministic' | 'stable_api' | 'scraping' | 'ai_assisted'
  fallbackCapabilitySlug: text("fallback_capability_slug"),
  fallbackCoverage: text("fallback_coverage"),
  // 'full' | 'partial' | 'degraded' | null
  fallbackVerificationLevel: text("fallback_verification_level"),
  // 'tested' | 'manual' | 'untested' | null
  errorCodesJson: jsonb("error_codes_json"),
  // Computed SQS scores (written after each test run)
  qpScore: decimal("qp_score", { precision: 5, scale: 2 }),
  rpScore: decimal("rp_score", { precision: 5, scale: 2 }),
  matrixSqs: decimal("matrix_sqs", { precision: 5, scale: 2 }),
  // Trust metadata (written after each test run + staleness refresh job)
  matrixSqsRaw: decimal("matrix_sqs_raw", { precision: 5, scale: 1 }),
  trend: varchar("trend", { length: 20 }).default("stable"),
  // 'improving' | 'declining' | 'stable' | 'stale'
  freshnessLevel: varchar("freshness_level", { length: 20 }).default("fresh"),
  // 'fresh' | 'aging' | 'stale' | 'expired' | 'unverified'
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  freshnessDecayedAt: timestamp("freshness_decayed_at", { withTimezone: true }),
  // Execution guidance cache (written after each test run)
  guidanceUsable: boolean("guidance_usable"),
  guidanceStrategy: text("guidance_strategy"),
  // 'direct' | 'retry_with_backoff' | 'queue_for_later' | 'unavailable'
  guidanceConfidence: decimal("guidance_confidence", { precision: 5, scale: 1 }),
  // Pipeline Phase I: Lifecycle management
  lifecycleState: varchar("lifecycle_state", { length: 20 }).notNull().default("draft"),
  // 'draft' | 'validating' | 'probation' | 'active' | 'degraded' | 'suspended' | 'deactivated'
  deactivationReason: text("deactivation_reason"),
  outputFieldReliability: jsonb("output_field_reliability"),
  // { field_name: 'guaranteed' | 'common' | 'rare' }
  visible: boolean("visible").notNull().default(false),
  onboardingManifest: jsonb("onboarding_manifest"),
  degradedRecoveryCount: integer("degraded_recovery_count").notNull().default(0),
  searchTags: text("search_tags").array().default([]),
  // Maintenance classification (operational overhead for Strale to maintain)
  maintenanceClass: varchar("maintenance_class", { length: 40 })
    .notNull()
    .default("scraping-fragile-target"),
  // 'free-stable-api' | 'commercial-stable-api' | 'pure-computation' |
  // 'scraping-stable-target' | 'scraping-fragile-target' | 'requires-domain-expertise'
  // x402 payment gateway (DB-driven, no-deploy exposure)
  x402Enabled: boolean("x402_enabled").notNull().default(false),
  x402PriceUsd: decimal("x402_price_usd", { precision: 10, scale: 4 }),
  x402Method: varchar("x402_method", { length: 4 }).notNull().default("POST"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── transactions ───────────────────────────────────────────────────────────
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id), // nullable: free-tier unauthenticated calls have no user
    capabilityId: uuid("capability_id")
      .references(() => capabilities.id), // nullable: solution executions have no single capability
    solutionSlug: text("solution_slug"), // set for solution executions, null for capability executions
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // 'pending' | 'executing' | 'completed' | 'failed'
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    error: text("error"),
    priceCents: integer("price_cents").notNull(),
    latencyMs: integer("latency_ms"),
    provenance: jsonb("provenance"),
    // EU AI Act compliance (DEC-20260226-P-s3t4)
    auditTrail: jsonb("audit_trail"), // full execution trace for regulatory compliance
    transparencyMarker: varchar("transparency_marker", { length: 20 })
      .notNull()
      .default("ai_generated"), // 'ai_generated' | 'algorithmic' | 'hybrid'
    dataJurisdiction: varchar("data_jurisdiction", { length: 10 })
      .notNull()
      .default("EU"), // ISO 3166-1 region code where data was processed
    isFreeTier: boolean("is_free_tier").notNull().default(false), // unauthenticated free-tier calls: public lookup allowed by transaction_id
    // Compliance infrastructure
    integrityHash: varchar("integrity_hash", { length: 128 }),
    previousHash: varchar("previous_hash", { length: 128 }),
    // F-0-009 Stage 2: 'pending' | 'complete' | 'failed'.
    // Hashing moved off the hot path; jobs/integrity-hash-retry.ts fills it in.
    // NOT called integrity_hash_status — that column exists on prod and is
    // owned by a separate, untracked workflow that tags 'customer' / 'test'.
    // See PHASE_C_COLUMN_INVESTIGATION.md.
    complianceHashState: varchar("compliance_hash_state", { length: 16 })
      .notNull()
      .default("pending"),
    // EXTERNALLY MANAGED — owned by an untracked external workflow (SCF-3)
    // that tags transactions as 'customer' / 'test' for analytics. Do NOT
    // read, write, or modify from API code. Declared here only to prevent
    // drizzle-kit generate from proposing a destructive DROP. See
    // SESSION_5_CARRY_FORWARD.md and PHASE_C_COLUMN_INVESTIGATION.md.
    // Lint guard: scripts/check-no-external-column-access.mjs.
    integrityHashStatus: varchar("integrity_hash_status", { length: 16 })
      .notNull()
      .default("pending"),
    legalHold: boolean("legal_hold").notNull().default(false),
    // SA.2a soft-delete (migration 0048). deletedAt marks the row logically
    // gone; redactedAt marks input/output/audit_trail zeroed. Two-step so
    // the chain-walk can still traverse deleted rows until retention purges.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    deletionReason: text("deletion_reason"),
    // MED-10 (migration 0055): IP hash for free-tier rate-limit queries.
    // Was previously read from audit_trail->'request_context'->>'ipHash' —
    // a JSONB extract that can't use a native index and that races the
    // post-INSERT audit_trail UPDATE on async paths. Free-tier INSERTs
    // populate this column directly from c.get("requestContext").ipHash;
    // the audit_trail JSONB still carries the same value for record
    // completeness.
    clientIpHash: varchar("client_ip_hash", { length: 16 }),
    // x402 payment tracking
    paymentMethod: varchar("payment_method", { length: 20 }).notNull().default("wallet"),
    x402SettlementId: text("x402_settlement_id"),
    // Cert-audit C9: SHA-256 hash of the X-Payment header (first 32 hex
    // chars). Set on every x402 path BEFORE verifyX402PaymentOnly returns;
    // a unique partial index lets the gateway return cached output if the
    // same header is replayed (an upstream client retry, a misbehaving
    // proxy, or an attacker trying to double-charge during the
    // verify-then-settle window). Null on wallet-paid rows.
    x402PaymentHash: varchar("x402_payment_hash", { length: 32 }),
    priceUsd: decimal("price_usd", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("transactions_idempotency_key_unique")
      .on(table.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    index("transactions_user_id_idx").on(table.userId),
    index("transactions_status_idx").on(table.status),
    // Cert-audit C9: x402 payment-header dedup. Partial index so wallet
    // rows (NULL) don't compete for slots; uniqueness keeps two distinct
    // requests with the same X-Payment header from each becoming a
    // recorded charge.
    uniqueIndex("transactions_x402_payment_hash_unique")
      .on(table.x402PaymentHash)
      .where(sql`x402_payment_hash IS NOT NULL`),
  ],
);

// ─── x402_orphan_settlements ────────────────────────────────────────────────
// CCO P0 #12: log of x402 settlements that succeeded on-chain but whose
// transactions row INSERT failed. See migration 0053 for the recovery
// playbook. A row here means: customer paid USDC, settlement succeeded,
// but our DB write failed — orphaned settlement awaiting reconciliation.
export const x402OrphanSettlements = pgTable("x402_orphan_settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  settlementId: text("settlement_id").notNull(),
  capabilitySlug: text("capability_slug"),
  solutionSlug: text("solution_slug"),
  payerAddress: text("payer_address"),
  priceUsd: decimal("price_usd", { precision: 10, scale: 4 }).notNull(),
  priceCents: integer("price_cents").notNull(),
  rawArgs: jsonb("raw_args").notNull(),
  failureReason: text("failure_reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  reconciliationStatus: text("reconciliation_status"),
});

// ─── transaction_quality ────────────────────────────────────────────────────
// Quality signals captured per transaction for SQI scoring
export const transactionQuality = pgTable("transaction_quality", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id")
    .notNull()
    .unique()
    .references(() => transactions.id, { onDelete: "cascade" }),
  responseTimeMs: integer("response_time_ms").notNull(),
  upstreamLatencyMs: integer("upstream_latency_ms"),
  schemaConformant: boolean("schema_conformant").notNull(),
  fieldsReturned: integer("fields_returned").notNull(),
  fieldsExpected: integer("fields_expected").notNull(),
  fieldCompletenessPct: decimal("field_completeness_pct", {
    precision: 5,
    scale: 2,
  }).notNull(),
  errorType: text("error_type"),
  // null = success, otherwise: 'upstream_timeout', 'upstream_error',
  // 'schema_mismatch', 'internal_error', 'rate_limited'
  qualityFlags: jsonb("quality_flags").notNull().default({}),
  // SA.2a soft-delete cascade marker (migration 0048).
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── failed_requests (DEC-20260225-P-c5d6) ─────────────────────────────────
// Logs demand signals: no-match responses, validation errors, input confusion.
// userId nullable to capture unauthenticated free-tier failures.
export const failedRequests = pgTable(
  "failed_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    ipHash: varchar("ip_hash", { length: 16 }),
    task: text("task").notNull(),
    category: varchar("category", { length: 50 }),
    maxPriceCents: integer("max_price_cents"),
    failureType: varchar("failure_type", { length: 50 }).notNull().default("no_match"),
    errorDetail: text("error_detail"),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("failed_requests_user_id_idx").on(table.userId)],
);

// ─── suggest_log ────────────────────────────────────────────────────────────
// Logs every query against /v1/suggest and /v1/suggest/typeahead so we can
// see what prospects search for — including zero-result queries that indicate
// capability/solution gaps. Non-PII: only the query string + result count.
export const suggestLog = pgTable(
  "suggest_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    query: text("query").notNull(),
    queryLength: integer("query_length").notNull(),
    resultCount: integer("result_count").notNull(),
    searchType: varchar("search_type", { length: 20 }).notNull(), // 'typeahead' | 'suggest'
    typeFilter: varchar("type_filter", { length: 20 }),           // null | 'solution' | 'capability'
    geo: varchar("geo", { length: 10 }),
    ipHash: varchar("ip_hash", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("suggest_log_created_at_idx").on(table.createdAt),
    index("suggest_log_result_count_idx").on(table.resultCount),
  ],
);

// ─── solutions ──────────────────────────────────────────────────────────────
// Bundled multi-capability workflows with outcome-level pricing
export const solutions = pgTable("solutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  longDescription: text("long_description"),
  agentDescription: text("agent_description"),
  category: varchar("category", { length: 50 }).notNull(),
  // Categories: "compliance-verification", "finance-banking", "legal-regulatory",
  //             "sales-outreach", "security-risk", "data-research"
  priceCents: integer("price_cents").notNull(),
  componentSumCents: integer("component_sum_cents").notNull(),
  valueTier: varchar("value_tier", { length: 20 }).notNull(),
  // "data-lookup" (1.2-1.3x), "verification" (1.3-1.5x), "compliance" (1.5-2.0x)
  maintenanceLevel: varchar("maintenance_level", { length: 20 }).notNull(),
  // "near-zero", "very-low", "low", "low-medium"
  geography: varchar("geography", { length: 50 }).notNull(),
  // "nordic", "eu", "us", "us-global", "global", "eu-global"
  inputSchema: jsonb("input_schema").notNull(),
  exampleInput: jsonb("example_input"),
  exampleOutput: jsonb("example_output"),
  targetAudience: text("target_audience"),
  marketingName: varchar("marketing_name", { length: 255 }),
  transparencyTag: varchar("transparency_tag", { length: 30 }),
  // null = all algorithmic, "ai_generated", "mixed"
  extendsWith: jsonb("extends_with").$type<string[]>().default([]),
  complianceCoverage: jsonb("compliance_coverage").$type<ComplianceCoverageItem[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  searchTags: text("search_tags").array().default([]),
  // x402 payment gateway (DB-driven, no-deploy exposure)
  x402Enabled: boolean("x402_enabled").notNull().default(false),
  x402PriceUsd: decimal("x402_price_usd", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── solution_steps ─────────────────────────────────────────────────────────
// Individual capability steps within a solution, with data flow mapping
export const solutionSteps = pgTable(
  "solution_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    solutionId: uuid("solution_id")
      .notNull()
      .references(() => solutions.id, { onDelete: "cascade" }),
    capabilitySlug: varchar("capability_slug", { length: 255 })
      .notNull()
      .references(() => capabilities.slug, { onDelete: "restrict" }),
    stepOrder: integer("step_order").notNull(),
    canParallel: boolean("can_parallel").notNull().default(false),
    parallelGroup: integer("parallel_group"),
    inputMap: jsonb("input_map").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("solution_steps_solution_id_idx").on(table.solutionId),
    uniqueIndex("solution_steps_solution_order_unique").on(
      table.solutionId,
      table.stepOrder,
    ),
  ],
);

// ─── test_suites ────────────────────────────────────────────────────────────
// Automated test definitions for capability quality verification
export const testSuites = pgTable(
  "test_suites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    capabilitySlug: text("capability_slug").notNull(),
    testName: text("test_name").notNull(),
    testType: text("test_type").notNull(),
    // 'known_answer', 'schema_check', 'edge_case', 'negative'
    input: jsonb("input").notNull(),
    expectedOutput: jsonb("expected_output"),
    validationRules: jsonb("validation_rules").notNull(),
    active: boolean("active").notNull().default(true),
    scheduleTier: text("schedule_tier").notNull().default("B"),
    // 'A' = every 6h (cheap), 'B' = every 24h (moderate), 'C' = every 72h (expensive)
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    baselineOutput: jsonb("baseline_output"),
    baselineCapturedAt: timestamp("baseline_captured_at", { withTimezone: true }),
    // Adaptive Test Intelligence columns
    testStatus: text("test_status").notNull().default("normal"),
    // 'normal' | 'infra_limited' | 'env_dependent' | 'upstream_broken' | 'quarantined'
    quarantineReason: text("quarantine_reason"),
    lastClassification: jsonb("last_classification"),
    autoRemediationLog: jsonb("auto_remediation_log"),
    // Test mode and cost tracking
    testMode: varchar("test_mode", { length: 20 }).default("live"),
    // 'live' (real API), 'fixture' (saved data), 'canary' (periodic live check)
    fixtureLastRefreshed: timestamp("fixture_last_refreshed", { withTimezone: true }),
    externalCostCents: integer("external_cost_cents").default(0),
    // For auto-generated tests: the capability's updated_at at generation time.
    // If the capability was modified after this timestamp, the ground truth
    // may be contaminated and should be re-verified.
    generationCapabilityUpdatedAt: timestamp(
      "generation_capability_updated_at",
      { withTimezone: true },
    ),
    // When the ground truth was last verified (human review or clean post-fix run).
    // NULL = never verified — treat with caution for auto-generated tests.
    groundTruthVerifiedAt: timestamp(
      "ground_truth_verified_at",
      { withTimezone: true },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("test_suites_capability_slug_idx").on(table.capabilitySlug)],
);

// ─── test_results ───────────────────────────────────────────────────────────
// Results from automated test suite runs
export const testResults = pgTable(
  "test_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    testSuiteId: uuid("test_suite_id")
      .notNull()
      .references(() => testSuites.id, { onDelete: "cascade" }),
    capabilitySlug: text("capability_slug").notNull(),
    passed: boolean("passed").notNull(),
    actualOutput: jsonb("actual_output"),
    failureReason: text("failure_reason"),
    responseTimeMs: integer("response_time_ms").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    outputHash: text("output_hash"), // SHA-256 of JSON output for staleness detection
    // Adaptive Test Intelligence columns
    failureClassification: text("failure_classification"),
    // 'upstream_transient' | 'upstream_degraded' | 'upstream_changed' | 'test_infrastructure'
    // | 'test_design' | 'capability_bug' | 'stale_input' | 'unknown'
    autoFixed: boolean("auto_fixed").notNull().default(false),
  },
  (table) => [
    index("test_results_capability_slug_idx").on(table.capabilitySlug),
    index("test_results_executed_at_idx").on(table.executedAt),
    index("test_results_test_suite_id_idx").on(table.testSuiteId),
    index("test_results_slug_executed_idx").on(table.capabilitySlug, table.executedAt),
    index("test_results_suite_executed_idx").on(table.testSuiteId, table.executedAt),
  ],
);

// ─── test_run_log ───────────────────────────────────────────────────────────
// Summary log per scheduled test run for cost tracking
export const testRunLog = pgTable("test_run_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tier: text("tier").notNull(), // 'A', 'B', 'C', or 'all'
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  totalTests: integer("total_tests").notNull(),
  passed: integer("passed").notNull(),
  failed: integer("failed").notNull(),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
  actualCostCents: integer("actual_cost_cents").notNull().default(0),
});

// ─── capability_limitations ─────────────────────────────────────────────────
// Known limitations per capability for trust transparency
export const capabilityLimitations = pgTable(
  "capability_limitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    capabilitySlug: text("capability_slug").notNull(),
    title: text("title"),
    limitationText: text("limitation_text").notNull(),
    category: text("category").notNull(),
    // 'coverage', 'freshness', 'accuracy', 'performance', 'availability'
    severity: text("severity").notNull().default("info"),
    // 'info', 'warning', 'critical'
    affectedPercentage: decimal("affected_percentage", {
      precision: 5,
      scale: 1,
    }),
    workaround: text("workaround"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("capability_limitations_slug_idx").on(table.capabilitySlug),
  ],
);

// ─── capability_health (circuit breaker) ────────────────────────────────────
// Tracks health state per capability for circuit breaker pattern
export const capabilityHealth = pgTable("capability_health", {
  id: uuid("id").defaultRandom().primaryKey(),
  capabilitySlug: varchar("capability_slug", { length: 255 })
    .notNull()
    .unique(),
  state: varchar("state", { length: 20 }).notNull().default("closed"),
  // 'closed' = healthy, 'open' = suspended, 'half_open' = testing
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  totalFailures: integer("total_failures").notNull().default(0),
  totalSuccesses: integer("total_successes").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  backoffMinutes: integer("backoff_minutes").notNull().default(5),
  // lastFailureCategory deferred until migration 0033 is applied to production
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── health_monitor_events (Platform Health Monitor audit trail) ─────────────
export const healthMonitorEvents = pgTable("health_monitor_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  // 'auto_fix' | 'lifecycle_transition' | 'classification' | 'sqs_exclusion'
  // | 'interrupt_sent' | 'proposal_created' | 'proposal_approved' | 'proposal_rejected'
  capabilitySlug: text("capability_slug"), // nullable for platform-level events
  tier: integer("tier").notNull(), // 1, 2, or 3
  actionTaken: text("action_taken").notNull(),
  details: jsonb("details").notNull().default({}),
  humanOverride: boolean("human_override").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── sqs_daily_snapshot ──────────────────────────────────────────────────────
// Daily snapshots of SQS scores for historical trend analysis
export const sqsDailySnapshot = pgTable(
  "sqs_daily_snapshot",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    capabilitySlug: text("capability_slug").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    matrixSqs: decimal("matrix_sqs", { precision: 5, scale: 2 }).notNull(),
    qpScore: decimal("qp_score", { precision: 5, scale: 2 }),
    rpScore: decimal("rp_score", { precision: 5, scale: 2 }),
    qpGrade: varchar("qp_grade", { length: 2 }),
    rpGrade: varchar("rp_grade", { length: 2 }),
    trend: varchar("trend", { length: 20 }),
    healthState: varchar("health_state", { length: 20 }),
    runsAnalyzed: integer("runs_analyzed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sqs_daily_snapshot_slug_date_unique").on(
      table.capabilitySlug,
      table.snapshotDate,
    ),
    index("sqs_daily_snapshot_slug_date_desc_idx").on(
      table.capabilitySlug,
      table.snapshotDate,
    ),
  ],
);

// ─── rate_limit_counters (F-0-002) ──────────────────────────────────────────
// DB-backed, restart-safe counters for abuse-class endpoints (signup,
// register, recover). Composite PK (bucket_key, window_start) + atomic
// INSERT ... ON CONFLICT DO UPDATE increment. See lib/db-rate-limit.ts.
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    bucketKey: text("bucket_key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.bucketKey, table.windowStart] }),
    index("rate_limit_counters_window_idx").on(table.windowStart),
  ],
);

// ─── digest_snapshots ───────────────────────────────────────────────────────
// Daily digest data snapshots for delta computation
export const digestSnapshots = pgTable("digest_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotDate: date("snapshot_date").notNull().unique(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
