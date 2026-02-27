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
