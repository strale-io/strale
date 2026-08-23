import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigserial,
  boolean,
  timestamp,
  date,
  jsonb,
  decimal,
  uniqueIndex,
  index,
  primaryKey,
  bigint,
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
// ─── WP11: trial entitlement ledger ─────────────────────────────────────────
//
// The durable record of "this identity has already been given trial credit".
//
// Before this table the fact lived nowhere: it was inferred, per request, from
// whichever gate the route handler happened to run. `/v1/auth/register` ran
// none, `/v1/signup` ran four, and manual admin grants ran none while reusing
// the same `trial_credit` ledger type. Production shows what that costs — 8
// accounts created from one signup IP over 44 hours, each granted EUR 2.00,
// all through the ungated register path.
//
// It is a separate table rather than a column on `users` for one reason that
// decides the design: the erasure endpoint anonymises the users row, so any
// entitlement fact stored there is destroyed by the delete → re-register loop
// it is meant to close. `email_hash` is a one-way SHA-256 of the normalised
// address, which survives Art. 17 anonymisation precisely because it is not
// the address. `user_id` is intentionally nullable and carries no foreign key
// for the same reason — the entitlement outlives the account.
export const trialGrants = pgTable(
  "trial_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** SHA-256 hex of the normalised (trimmed, lower-cased) email address. */
    emailHash: varchar("email_hash", { length: 64 }).notNull().unique(),
    /** Same 16-char truncated SHA-256 the users row stores. Nullable: an IP is not always resolvable. */
    ipHash: varchar("ip_hash", { length: 16 }),
    /** Who received it, when known. No FK — the grant outlives the account. */
    userId: uuid("user_id"),
    grantedCents: integer("granted_cents").notNull(),
    /** 'register' | 'agent_signup' | 'backfill' */
    channel: varchar("channel", { length: 32 }).notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("trial_grants_ip_granted_idx").on(table.ipHash, table.grantedAt)],
);

// ─── WP11: proof-before-rotation for API key recovery ───────────────────────
//
// `/v1/auth/recover` used to rotate the key and email the new one on an
// unauthenticated request whose only input was an email address. Two defects
// in one handler: anyone who knew a customer's address could revoke their
// working key at will, and the replacement was a reusable bearer secret
// delivered over email.
//
// The token below separates the request from the rotation. Requesting costs
// the account nothing; only redeeming a single-use, short-lived token that
// was delivered to the mailbox rotates anything.
export const apiKeyRecoveryTokens = pgTable(
  "api_key_recovery_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** SHA-256 hex of the token. The token itself is never stored. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedIpHash: varchar("requested_ip_hash", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("api_key_recovery_tokens_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

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
  // ... plus 'hook_failed', written by lib/capability-persistence.ts when the
  // post-commit onboarding hook throws.
  //
  // WP10: how many times the onboarding-retry sweeper has re-run that hook and
  // had it fail again. Bounds the retry blast radius the same way
  // test_suites.fixture_recapture_failures does, and for the same reason: a
  // hook that fails deterministically will not start working on the sixth
  // attempt, and retrying forever buries the escalation an operator is meant
  // to act on. Reset to 0 when the hook finally succeeds.
  //
  // This lives on the row rather than being counted from health_monitor_events
  // because that table is pruned at 30 days (jobs/db-retention.ts). Counting
  // attempts there would silently reset the budget every month AND age out the
  // escalation marker, so an already-escalated capability would rejoin the
  // retry set forever in 30-day cycles.
  onboardingHookFailures: integer("onboarding_hook_failures").notNull().default(0),
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
  // x402 payment gateway (DB-driven, no-deploy exposure).
  // Per DEC-20260502-A, USDC price is derived at runtime from price_cents
  // × EUR_USD_RATE — there is no separate stored USD column.
  x402Enabled: boolean("x402_enabled").notNull().default(false),
  x402Method: varchar("x402_method", { length: 4 }).notNull().default("POST"),
  // Per DEC-20260503-A — controls whether the capability appears on
  // strale.dev's public surfaces (listing, MCP card, A2A card, llms.txt,
  // x402 manifest, /v1/suggest). Internal callers (do.ts, products,
  // routing, lifecycle) IGNORE this flag and see all capabilities.
  // Default true: classified at onboarding time. Set false for thin
  // passthroughs of paid 3rd-party vendors where strale.dev surfacing
  // would constitute reseller-style competitor enablement, or for
  // capabilities whose ToS forbids resale, or for fixed-cost vendors
  // where a self-serve marketplace would burn the budget.
  marketplaceEligible: boolean("marketplace_eligible")
    .notNull()
    .default(true),
  marketplaceEligibleReason: text("marketplace_eligible_reason"),
  // Bucket C — GDPR Art. 22 classification per capability (migration 0058).
  // Surfaced in audit body so the customer (controller) sees the
  // automated-decision posture and the data subject can find the
  // dispute endpoint when applicable.
  //   data_lookup       — factual data, not decision-supporting
  //   screening_signal  — produces matches/findings the customer uses to decide
  //   risk_synthesis    — AI synthesis producing a recommendation
  gdprArt22Classification: varchar("gdpr_art_22_classification", { length: 20 })
    .notNull()
    .default("data_lookup"),
  // Cost-class taxonomy (Phase A0b). Inverted-default: NULL means
  // "not yet classified" — scheduler skips, dispatcher refuses internal
  // callers, customer_paid still allowed during GRACE backfill.
  // Enum enforced by CHECK constraint in Block 0067, not by varchar length.
  //   free_unlimited       — no cost, no quota (gov registries, BRREG, GLEIF)
  //   free_quota           — no per-call cost but vendor enforces a window quota (OpenRegister 50/mo)
  //   paid_with_free_tier  — paid above a free allowance (Dilisense, GitHub)
  //   paid_prepaid         — every call bills (Anthropic, Browserless)
  //   paid_subscription    — flat subscription, calls free at the margin
  costClass: text("cost_class"),
  // Quota reset window — daily, monthly, or none. NULL for free_unlimited
  // and paid_prepaid (no quota). 'none' allowed when cost_class is
  // free_unlimited and there's no rate-limit cap to track.
  quotaWindow: text("quota_window"),
  // Quota cap in calls per window. NULL for free_unlimited (no cap),
  // paid_prepaid (no quota), paid_subscription (no quota).
  // Required for free_quota and paid_with_free_tier (validated at app layer).
  quotaCap: integer("quota_cap"),
  // Day-of-month reset (1..31) for monthly window. NULL for daily / none.
  // OpenRegister resets on the 1st → 1.
  quotaResetDom: integer("quota_reset_dom"),
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
    /**
     * Hash of the request this key was first used for (WP6).
     *
     * A key without one is a key to nothing in particular: the platform
     * replayed on the string alone, so the same key reused for different work
     * returned the earlier answer to the later question. Null on rows predating
     * this column; those still replay, because refusing would break clients
     * holding keys issued before the deploy.
     */
    idempotencyFingerprint: varchar("idempotency_fingerprint", { length: 64 }),
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
    /**
     * Position in the hash chain, assigned from a sequence AT HASH TIME (WP7).
     *
     * The head must be "the last row the worker hashed". It cannot be
     * `max(completed_at)`: that column is stamped from a clock read before the
     * row's own `created_at` default (median delta in production: MINUS 1.5 ms),
     * so a row can be admitted after the head while carrying an earlier
     * completion time — it then chains onto the head without becoming it, and
     * the next row chains onto the same parent. Nine such forks in 30 days of
     * real traffic.
     *
     * NULL on the 863,946 rows hashed before this existed. They are not head
     * candidates; their chain is unchanged.
     */
    chainSeq: bigint("chain_seq", { mode: "number" }),
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
    // read, write, or modify from API code. Declared here so the schema
    // shape reflects reality on disk (avoids spurious diff signals from
    // any future schema-introspection tooling). See
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
    // Channel attribution (migration 0081, design doc 2026-08-12): weak-but-
    // joinable signals per call — {ua, referer, src, client_header,
    // ip_day_hash (daily-salted; the ONLY join key against discovery_hits —
    // client_ip_hash below is a different, unsalted keyspace),
    // mcp_client_info}. Write-only at execution time; read by the weekly
    // attribution rollup, never on the hot path. Retention: rides the
    // transactions row (TRANSACTION_RETENTION_DAYS).
    clientMeta: jsonb("client_meta"),
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
    // MCP funnel P0 (migration 0083, 2026-08-15): stable (non-rotating)
    // secret-salted sha256 over (AUDIT_HMAC_SECRET || lowercased payer address),
    // truncated to
    // 16 hex chars — see hashX402Payer in lib/attribution.ts. Deliberately
    // NOT daily-salted like discovery_hits.ip_hash / client_meta.ip_day_hash:
    // those rotate on purpose so cross-day correlation is impossible, but a
    // payer hash exists precisely to answer "is this the same wallet as last
    // week" (distinct-payer and repeat-rate questions) — a rotating hash
    // would make that unanswerable. The raw payer address already lives
    // unhashed in audit_trail->>'payer_address' (needed for refund/
    // reconciliation — see x402_orphan_settlements.payer_address) and is
    // NOT duplicated here; this column is the pseudonymous, low-sensitivity
    // surface the weekly rollup and any future analytics should read
    // instead of extracting the raw address from JSONB. Null on wallet-paid
    // rows and on x402 rows recorded before this migration.
    x402PayerHash: varchar("x402_payer_hash", { length: 16 }),
    priceUsd: decimal("price_usd", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // WP6: scoped to the CUSTOMER. A global unique index meant two customers
    // picking the same key collided — the second neither replayed (the lookup
    // is per-user) nor inserted (the index is not), surfacing as a 500. It was
    // also a weak oracle for whether a key existed anywhere on the platform.
    uniqueIndex("transactions_user_idempotency_key_unique")
      .on(table.userId, table.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    index("transactions_user_id_idx").on(table.userId),
    index("transactions_status_idx").on(table.status),
    // Phase A0c.1.v3 (Block 0078, 2026-05-13): compound index for the
    // list-endpoint GROUP BY MAX(created_at) per capability_id. The
    // detail handler's per-cap query (capabilities.ts:136-144) ALSO
    // benefits — previously seq-scanned the status='completed' filter
    // set looking for one capability_id.
    index("transactions_capability_id_created_at_idx").on(
      table.capabilityId,
      table.createdAt,
    ),
    // Cert-audit C9: x402 payment-header dedup. Partial index so wallet
    // rows (NULL) don't compete for slots; uniqueness keeps two distinct
    // requests with the same X-Payment header from each becoming a
    // recorded charge.
    uniqueIndex("transactions_x402_payment_hash_unique")
      .on(table.x402PaymentHash)
      .where(sql`x402_payment_hash IS NOT NULL`),
    // MCP funnel P0: distinct-payer / repeat-rate rollup queries filter on
    // payment_method='x402' and group by this column — not unique (a repeat
    // payer is expected to produce many rows with the same hash).
    index("transactions_x402_payer_hash_idx")
      .on(table.x402PayerHash)
      .where(sql`x402_payer_hash IS NOT NULL`),
  ],
);

// ─── dispute_requests ───────────────────────────────────────────────────────
// Bucket C — GDPR Art. 22(3) "right to obtain human intervention".
// Receives data-subject objections to a recorded transaction. Storage
// only; admins review disposition out-of-band. Anonymous disputes are
// supported (data subject is rarely the same person as the API caller).
// See migration 0058 for the column-by-column rationale.
export const disputeRequests = pgTable("dispute_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id),
  userId: uuid("user_id").references(() => users.id),
  reason: text("reason").notNull(),
  affectedField: text("affected_field"),
  contactEmail: varchar("contact_email", { length: 255 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  disposition: varchar("disposition", { length: 20 })
    .notNull()
    .default("received"),
  // 'received' | 'reviewing' | 'upheld' | 'rejected' | 'no_action'
  dispositionAt: timestamp("disposition_at", { withTimezone: true }),
  dispositionNotes: text("disposition_notes"),
});

// ─── x402_settlement_intents ────────────────────────────────────────────────
// WP5: durable intent, written BEFORE the facilitator is called. The orphan
// table below only catches "the INSERT threw"; it cannot catch "the process
// died", because then its catch block never runs either. This table is what
// survives a SIGKILL between an irreversible on-chain settlement and the row
// that records it.
export const x402SettlementIntents = pgTable(
  "x402_settlement_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // One intent per payment authorization. Unique so a replayed header cannot
    // create a second attempt record for one platform action.
    paymentHash: text("payment_hash").notNull(),
    slug: text("slug").notNull(),
    solutionSlug: text("solution_slug"),
    priceCents: integer("price_cents").notNull(),
    priceUsd: decimal("price_usd", { precision: 10, scale: 4 }),
    // 'settling' | 'settled' | 'recorded' | 'failed' | 'escalated'
    //
    // 'escalated' is terminal-from-the-job's-perspective: a human must resolve
    // it against the chain. It exists so an unresolvable row LEAVES the
    // reconciler's selection set. Without it, a stuck row keeps its original
    // updated_at, stays permanently the oldest row, and — with an ordered,
    // limited sweep — starves every later crash out of ever being examined.
    state: varchar("state", { length: 16 }).notNull().default("settling"),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    settlementId: text("settlement_id"),
    transactionId: uuid("transaction_id"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("x402_settlement_intents_payment_hash_unique").on(
      table.paymentHash,
    ),
    index("x402_settlement_intents_state_updated_idx").on(
      table.state,
      table.updatedAt,
    ),
    // One canonical record per settlement, enforced structurally rather than by
    // convention. Partial, because the column is null until the facilitator
    // answers and null values must not compete for the slot.
    uniqueIndex("x402_settlement_intents_settlement_id_unique")
      .on(table.settlementId)
      .where(sql`${table.settlementId} IS NOT NULL`),
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
  // x402 payment gateway (DB-driven, no-deploy exposure).
  // Per DEC-20260502-A, USDC price is derived at runtime from price_cents
  // × EUR_USD_RATE — there is no separate stored USD column.
  x402Enabled: boolean("x402_enabled").notNull().default(false),
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
    /**
     * Optional precondition. When this step's output matches, the rest of the
     * solution is skipped and the caller is refunded — the bundle could not do
     * the work it was paid for. Shape: {field, equals}. See
     * lib/solution-executor.ts and migration block 0087.
     */
    gateCondition: jsonb("gate_condition"),
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
    // Written ONLY by test-runner.ts's captureBaseline() on an actual
    // (re)capture — the dedicated timestamp for fixture-baseline max-age
    // staleness (checkBaselineStaleness), deliberately never overloading
    // updated_at, which unrelated suite edits also bump. See that function's
    // doc comment (HIGH-1, Codex review 2026-08-18).
    fixtureLastRefreshed: timestamp("fixture_last_refreshed", { withTimezone: true }),
    // Consecutive failed fixture-recapture attempts (HIGH-2b, Codex review
    // 2026-08-18). Incremented by recordFixtureRecaptureFailure in
    // test-runner.ts; reset to 0 by captureBaseline on any successful
    // recapture. At MAX_FIXTURE_RECAPTURE_FAILURES the suite is quarantined
    // (test_status), which the scheduler's minRetestIntervalHours floors at
    // a 168h cadence — bounds the retry blast radius instead of retrying a
    // permanently-broken suite on every dispatch tick forever.
    fixtureRecaptureFailures: integer("fixture_recapture_failures")
      .notNull()
      .default(0),
    externalCostCents: integer("external_cost_cents").default(0),
    // Scheduling eligibility — explicit billing/scheduling decoupling per PR A
    // of the May 2026 Haiku-leak structural follow-up (see DEC-20260511-?).
    // The hourly test scheduler reads this column to decide what to dispatch;
    // `external_cost_cents` is billing-only. Block 0066 reconciles eligibility
    // from cost at every boot as an interim derivation bridge (PR A).
    scheduledTestingEligible: boolean("scheduled_testing_eligible")
      .notNull()
      .default(false),
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

// ─── capability_budget_counters (Phase A0b) ─────────────────────────────────
// Per-capability test-budget counter for free_quota and paid_with_free_tier
// classes. Atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING increments
// under burst load (race-free). Modeled on rate_limit_counters above.
//
// budget_cap is snapshotted from a percentage of capabilities.quota_cap at
// counter creation:
//   - free_quota: 10% daily / 20% monthly
//   - paid_with_free_tier: 5% daily / 10% monthly
// (Customer traffic against free_quota does NOT increment this counter —
// the budget protects Strale's own test/CI usage. See guarded-executor.ts.)
export const capabilityBudgetCounters = pgTable(
  "capability_budget_counters",
  {
    capabilitySlug: text("capability_slug").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowKind: text("window_kind").notNull(),
    // 'daily' | 'monthly' — CHECK enforced by Block 0070.
    testCount: integer("test_count").notNull().default(0),
    budgetCap: integer("budget_cap").notNull(),
    alert30FiredAt: timestamp("alert_30_fired_at", { withTimezone: true }),
    alert50FiredAt: timestamp("alert_50_fired_at", { withTimezone: true }),
    alert80FiredAt: timestamp("alert_80_fired_at", { withTimezone: true }),
    hardStopFiredAt: timestamp("hard_stop_fired_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.capabilitySlug, table.windowStart, table.windowKind],
    }),
    index("capability_budget_counters_window_idx").on(
      table.windowKind,
      table.windowStart,
    ),
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

// ─── ee_directors ───────────────────────────────────────────────────────────
// Estonian directors/representatives cache. Daily ingest of the RIK Ariregister
// CC BY 4.0 open-data dump (`kaardile_kantud_isikud.json.zip`) — see
// `apps/api/src/jobs/ingest-ee-directors.ts`. Primary key is `kirje_id` from
// upstream (unique per registry-card filing). PIDs are redacted by RIK at
// source since 2024-11-01; the hashed UUID lands in `isikukood_hash`. Names
// + roles + start/end dates are retained.
export const eeDirectors = pgTable(
  "ee_directors",
  {
    kirjeId: integer("kirje_id").primaryKey(),
    entityRegCode: text("entity_reg_code").notNull(),
    personType: text("person_type").notNull(), // 'F' (natural) | 'J' (legal entity)
    roleCode: text("role_code").notNull(), // JUHL, NOOK, PROK, LIK, etc.
    roleText: text("role_text").notNull(), // localised label, e.g. "Juhatuse liige"
    firstName: text("first_name"),
    lastName: text("last_name"), // also business name when person_type='J'
    isikukoodHash: text("isikukood_hash"),
    foreignCode: text("foreign_code"),
    foreignCountryCode: text("foreign_country_code"),
    foreignCountryText: text("foreign_country_text"),
    addressText: text("address_text"),
    addressCountryCode: text("address_country_code"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ee_directors_entity_idx").on(table.entityRegCode),
    index("ee_directors_last_synced_idx").on(table.lastSyncedAt),
  ],
);

// ─── ee_directors_sync ──────────────────────────────────────────────────────
// Single-row marker for the EE directors ingest. Tracks the upstream
// `Last-Modified` header so the ingest can skip when there's no new data.
// `id = 1` is the only valid row (CHECK constraint enforced by the migration).
export const eeDirectorsSync = pgTable("ee_directors_sync", {
  id: integer("id").primaryKey(),
  lastModifiedUpstream: text("last_modified_upstream"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  rowCount: integer("row_count"),
});

// ─── cy_directors ───────────────────────────────────────────────────────────
// Cyprus directors/officers cache. Monthly ingest of the data.gov.cy DRCOR
// open-data CSV (`organisation_officials_83.csv`, CC BY 4.0) — see
// `apps/api/src/jobs/ingest-cy-directors.ts`. DRCOR publishes no stable per-row
// identifier, so the natural composite key is (entity_reg_code,
// person_or_organisation_name, official_position). The CSV does NOT include
// per-row appointment/cessation dates — all rows are treated as currently-active
// per the snapshot semantics of the upstream file. Greek role labels are stored
// verbatim plus a normalized English `role_standardized` for handler ergonomics.
export const cyDirectors = pgTable(
  "cy_directors",
  {
    entityRegCode: text("entity_reg_code").notNull(),
    personOrOrganisationName: text("person_or_organisation_name").notNull(),
    officialPosition: text("official_position").notNull(),
    organisationName: text("organisation_name"),
    organisationTypeCode: text("organisation_type_code"),
    organisationType: text("organisation_type"),
    roleStandardized: text("role_standardized").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.entityRegCode,
        table.personOrOrganisationName,
        table.officialPosition,
      ],
    }),
    index("cy_directors_entity_idx").on(table.entityRegCode),
    index("cy_directors_last_synced_idx").on(table.lastSyncedAt),
  ],
);

// ─── cy_directors_sync ──────────────────────────────────────────────────────
// Single-row marker for the CY directors ingest. Tracks the upstream
// `Last-Modified` header so the weekly ingest can skip when the monthly
// DRCOR refresh hasn't fired yet. `id = 1` only (CHECK constraint).
export const cyDirectorsSync = pgTable("cy_directors_sync", {
  id: integer("id").primaryKey(),
  lastModifiedUpstream: text("last_modified_upstream"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  rowCount: integer("row_count"),
});

// ─── discovery_hits ─────────────────────────────────────────────────────────
// Channel attribution (migration 0081): one row per discovery-surface fetch
// (/x402/catalog, /.well-known/x402.json, agent-card, llms.txt). src_tag
// comes from tagged directory-submission URLs (?src=bazaar). ip_hash is
// DAILY-salted (cross-day correlation deliberately impossible); 90-day
// retention via db-retention RULES. Read only by the attribution rollup.
export const discoveryHits = pgTable(
  "discovery_hits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    endpoint: text("endpoint").notNull(),
    srcTag: text("src_tag"),
    ua: text("ua"),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("discovery_hits_created_at_idx").on(table.createdAt),
    index("discovery_hits_src_tag_idx").on(table.srcTag).where(sql`src_tag IS NOT NULL`),
  ],
);

// ─── wallet_reservations (WP3) ──────────────────────────────────────────────
//
// The durable record that makes a charge recoverable after a crash.
//
// The async /v1/do path debits, commits, answers 202, then executes in an
// in-memory promise whose catch block holds the only refund. A SIGKILL between
// the commit and that catch — an OOM, a container replacement — strands the
// charge: the customer stays debited, the transaction stays 'executing', and
// nothing in the codebase ever transitions it. Production is holding 11 such
// rows, the oldest from 2026-04-07.
//
// A row here is the intent, written in the SAME transaction as the debit. It
// outlives the process, so a reconciler can find what the crash abandoned and
// release it. The money movement itself is unchanged and still flows through
// the wallet service (WP2) — this table records WHY it moved and whether that
// movement is still provisional.
//
// State machine, one terminal state per reservation:
//
//     reserved ──▶ executing ──▶ captured
//          ╰────────────┴──────▶ released
//
// Transitions are conditional UPDATEs predicated on the expected current
// state, so a duplicate capture or release is a no-op rather than a second
// money movement — the idempotency the master plan asks for, enforced by the
// database rather than by callers remembering.
export const walletReservations = pgTable(
  "wallet_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Always positive. The direction is implied by the state. */
    amountCents: integer("amount_cents").notNull(),
    /** reserved | executing | captured | released */
    state: varchar("state", { length: 16 }).notNull().default("reserved"),
    /** The execution this reservation is holding funds for. */
    transactionId: uuid("transaction_id"),
    /**
     * When this reservation stops being plausibly in-flight. The reconciler
     * releases anything still non-terminal past it. Stored rather than derived
     * so a long-running capability can be given a longer window without
     * changing the reconciler.
     */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    /** Why it reached its terminal state — set on capture and release. */
    terminalReason: text("terminal_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The reconciler's only query: non-terminal rows past their deadline.
    index("wallet_reservations_state_deadline_idx").on(
      table.state,
      table.deadlineAt,
    ),
    index("wallet_reservations_wallet_id_idx").on(table.walletId),
    // One reservation per execution. Without this a retry could open a second
    // hold against the same transaction and the reconciler would release both.
    uniqueIndex("wallet_reservations_transaction_id_unique")
      .on(table.transactionId)
      .where(sql`transaction_id IS NOT NULL`),
  ],
);

// ─── capability_invocations ──────────────────────────────────────────────────
// WP9 — what a capability invocation actually DID, recorded once, as a fact.
//
// Distinct from `transactions` on purpose. A transaction is a BILLING artefact:
// it records a call the platform charged (or declined to charge) a customer for.
// An invocation is a QUALITY artefact: it records that a specific capability ran
// and how it went. For a direct /v1/do call the two coincide, which is why the
// quality floor got away with joining `transactions ON capability_id` for so
// long. For a solution step they do not coincide at all — a bundle writes ONE
// transaction with `capability_id = NULL` and buries its step results in an
// `output.steps` JSONB blob, so every capability invoked inside a bundle was
// invisible to the floor. 694 such rows exist in production; 126 sub-calls in a
// 30-day window had no per-capability record anywhere.
//
// Deliberately carries NO customer content — no inputs, no outputs, no error
// strings. Only the canonical ExecutionOutcome verdict (lib/execution-outcome.ts,
// WP4) plus enough context to know which rail produced it. That is what lets
// this table outlive the 90-day content redaction without holding anything the
// redaction exists to remove.
export const capabilityInvocations = pgTable(
  "capability_invocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    capabilitySlug: text("capability_slug").notNull(),
    // Which serving path produced this: wallet | x402 | solution_step |
    // harness | onboarding. Not derivable from the other columns — a solution
    // step and a direct call can share every other field.
    rail: text("rail").notNull(),
    // The guarded-executor InvocationContext kind that authorised the call:
    // customer_paid | internal_test | health_probe | ci. The floor counts only
    // customer_paid.
    //
    // Note what this does NOT currently buy. Every live write site hardcodes
    // customer_paid, because the internal test harness invokes executors
    // in-process rather than over /v1/do and so writes no facts at all. The
    // harness exclusion therefore still rests on the email-pattern list, as it
    // did before WP9. The column earns its place the moment any non-customer
    // path starts recording — but it is not what keeps the harness out today,
    // and an earlier version of this comment said it was.
    contextKind: text("context_kind").notNull(),
    // Set when rail = 'solution_step'. The bundle this invocation served.
    // The id, not the slug: it is the durable key (slugs get renamed), it needs
    // no lookup on the execution path, and `solutions` is one join away for
    // anyone who wants the name.
    solutionId: uuid("solution_id"),
    // The billing row this invocation belongs to, when one exists. Nullable by
    // design: solution steps share their parent's transaction, and some rails
    // (dry-run, gate refusals) produce a fact with no transaction at all.
    transactionId: uuid("transaction_id"),
    // Who called. Nullable: x402 callers have no account, and neither do
    // anonymous free-tier callers. Recorded so the floor can apply the SAME
    // internal-account exclusion it already applies to transactions, from the
    // same canonical email-pattern list, rather than this table inventing a
    // second notion of "internal".
    //
    // Precisely what the harness does, because two comments in this PR
    // previously contradicted each other about it and review was right to call
    // that out. `lib/test-runner.ts` invokes executors IN-PROCESS via
    // getExecutor and then INSERTs its own transaction row directly
    // (test-runner.ts:1875), carrying a capability_id and the system account.
    // It never calls /v1/do and never calls recordInvocation. So it accounts
    // for ~98% of `transactions` — about 10k rows a day — and for zero facts.
    //
    // The consequence for this column: it is not what keeps harness traffic out
    // of the floor today, because none of it arrives here. It is what keeps the
    // NEXT non-customer writer out, and it is what makes the fact-versus-billing
    // volume cross-check compare like with like, since the transaction side has
    // to exclude those 10k rows explicitly.
    userId: uuid("user_id"),
    // Whether this call was served under the free tier. Anonymous zero-cost
    // traffic is the cheapest way to fabricate failures against a capability,
    // so the floor excludes it (review H-1). Recorded per call rather than read
    // from `capabilities.is_free_tier`, because an AUTHENTICATED caller of a
    // free-tier capability gets normal treatment and is not free-tier traffic.
    isFreeTier: boolean("is_free_tier").notNull().default(false),
    // ── The canonical WP4 verdict, persisted rather than recomputed ──────────
    success: boolean("success").notNull(),
    failureClass: text("failure_class"),
    fault: text("fault"),
    billable: boolean("billable").notNull(),
    countsAgainstCapability: boolean("counts_against_capability").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // The floor's read: one capability, one window, newest first.
    bySlugTime: index("capability_invocations_slug_created_idx").on(
      table.capabilitySlug,
      table.createdAt,
    ),
    // Reserved. NO rail populates transaction_id today -- every live call site
    // omits it, so the column is null for 100% of writes and this index is
    // currently dead. It is kept rather than dropped because the linkage is the
    // natural way to answer "what did this bundle actually run?", and adding
    // the index later costs a migration; but the honest statement is that the
    // question is not answerable yet. Review found the previous wording
    // asserting the linkage as delivered.
    byTransaction: index("capability_invocations_transaction_idx").on(
      table.transactionId,
    ),
    // Serves the floor's epoch probe (MIN(created_at)) and retention pruning.
    // Declared because block 0101 creates it: the migration owns this table's
    // DDL, but a schema that lists two of three indexes is a declaration that
    // is already wrong, and drizzle-kit would propose dropping the third.
    byCreated: index("capability_invocations_created_idx").on(table.createdAt),
  }),
);

// ─── WP10: the durable job coordinator ──────────────────────────────────────
//
// One row per named recurring job. This table owns a fact that used to live
// nowhere durable: *when is this job next due*.
//
// Before WP10 that fact lived in a `setTimeout`/`setInterval` closure, which
// is destroyed and rebuilt on every process start. Measured on production
// over the seven days to 2026-08-23: the median gap between process starts
// was 1.0 hour, so the `setInterval` arm of every job declared at 6h/24h/7d
// was effectively unreachable — the *only* arm that ever fired was the
// startup delay. A job's real cadence was therefore the deploy cadence.
// quality-floor, declared daily, ran 51 times in seven days; the weekly
// health sweep ran 141 times in 17.6 days, 56x its declared frequency.
//
// `next_run_at` is deliberately NOT reset at boot. Registration reconciles
// `interval_ms` from code (code owns recurrence) and leaves `next_run_at`
// alone (the table owns the schedule), clamping it down only when a shorter
// interval makes the stored value unreachable.
export const jobSchedule = pgTable("job_schedule", {
  /** Stable job name, chosen by the caller. Primary key: one row per job. */
  jobName: varchar("job_name", { length: 64 }).primaryKey(),
  /** Recurrence, reconciled from code at every registration. */
  intervalMs: bigint("interval_ms", { mode: "number" }).notNull(),
  /** THE fact. A job is due when this is <= now(). Survives restarts. */
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  /** Non-null while a runner holds the job. Cleared on release. */
  leaseOwner: varchar("lease_owner", { length: 64 }),
  /** Deadline. A crashed holder's lease expires and the job becomes claimable. */
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
  /** 'ok' | 'error' | 'recovered' — the last terminal outcome. */
  lastOutcome: varchar("last_outcome", { length: 16 }),
  /** Truncated failure message from the last errored run. */
  lastError: text("last_error"),
  /** Drives retry backoff. Reset to 0 on success. */
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
