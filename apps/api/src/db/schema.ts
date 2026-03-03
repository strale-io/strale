import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  decimal,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── users ──────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  maxSpendPerHourCents: integer("max_spend_per_hour_cents")
    .notNull()
    .default(10000), // €100/hr
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
      .notNull()
      .references(() => users.id),
    capabilityId: uuid("capability_id")
      .notNull()
      .references(() => capabilities.id),
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
  ],
);

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── failed_requests (DEC-20260225-P-c5d6) ─────────────────────────────────
// Logs every no_matching_capability response — demand signal for future capabilities
export const failedRequests = pgTable(
  "failed_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    task: text("task").notNull(),
    category: varchar("category", { length: 50 }),
    maxPriceCents: integer("max_price_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("failed_requests_user_id_idx").on(table.userId)],
);

// ─── solutions ──────────────────────────────────────────────────────────────
// Bundled multi-capability workflows with outcome-level pricing
export const solutions = pgTable("solutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
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
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
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
    capabilitySlug: varchar("capability_slug", { length: 255 }).notNull(),
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
  },
  (table) => [
    index("test_results_capability_slug_idx").on(table.capabilitySlug),
    index("test_results_executed_at_idx").on(table.executedAt),
    index("test_results_test_suite_id_idx").on(table.testSuiteId),
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
});

// ─── capability_limitations ─────────────────────────────────────────────────
// Known limitations per capability for trust transparency
export const capabilityLimitations = pgTable(
  "capability_limitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    capabilitySlug: text("capability_slug").notNull(),
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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
