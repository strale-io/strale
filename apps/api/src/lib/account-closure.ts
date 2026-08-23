/**
 * The one authority for "what does closing an account do to each table, and
 * what does the customer get told about it" (WP11, cert-audit G1, GDPR Art. 17).
 *
 * This module exists because the same defect survived three rounds of review.
 *
 * `DELETE /v1/auth/me` returns an itemised `anonymized` / `deleted` / `retained`
 * summary. That is a written representation to a data subject, and it read as
 * exhaustive while being assembled from hand-maintained string literals sitting
 * beside a transaction that touched a different set of tables. Every round the
 * literals were corrected where the reviewer pointed and stayed wrong somewhere
 * else:
 *
 *   - round 1: it claimed `users.signup_ip_hash` was anonymised while the WP11
 *     migration copied that exact column into `trial_grants.ip_hash`;
 *   - round 2: fixing those two tables left `transactions.client_meta` and
 *     `audit_trail.request_context` undisclosed — 476 user-linked production
 *     rows across 6 users;
 *   - round 3: disclosing `request_context` enumerated five of its seven fields,
 *     and four further user-linked tables (`failed_requests`,
 *     `dispute_requests`, `wallet_reservations`, `capability_invocations`) were
 *     absent from all three lists entirely.
 *
 * The pattern is not carelessness about any one table. It is that the CLAIM and
 * the BEHAVIOUR were two separate artifacts that had to be kept in agreement by
 * hand, and nothing checked that they were. So they are one artifact now: the
 * plan below both performs the closure and produces the summary, and
 * `account-closure.test.ts` fails if any user-linked table in `schema.ts` is
 * missing from it. A new table carrying `user_id` cannot be added without
 * either handling it here or stating why it is retained.
 */

import { eq, sql } from "drizzle-orm";

import {
  disputeRequests,
  failedRequests,
  transactions,
  users,
} from "../db/schema.js";
import { generateApiKey, hashApiKey } from "./auth.js";
import { anonymiseTrialGrantOnClosure } from "./trial-eligibility.js";
import { purgeRecoveryTokensOnClosure } from "./key-recovery.js";

/**
 * The fields `/v1/do` records on every authenticated call as
 * `audit_trail.request_context`.
 *
 * Declared here rather than described in prose because the receipt has to name
 * all of them and the list drifted the moment it was written out twice — round
 * 3 found `fingerprintHash` and `mcpClient` present in the data and absent from
 * the disclosure. `request-context.ts` owns the list; this is the consumer.
 */
export { REQUEST_CONTEXT_FIELDS } from "./request-context.js";
import { REQUEST_CONTEXT_FIELDS } from "./request-context.js";

export type ClosureDisposition = "anonymized" | "deleted" | "retained";

export interface ClosureRule {
  /** Physical table name, as it appears in the summary. */
  table: string;
  /** The identifying columns this rule accounts for. */
  columns: string[];
  disposition: ClosureDisposition;
  /** Required for `retained` — why it cannot be cleared. */
  reason?: string;
}

/**
 * What closure does to every table that can carry a link to the account.
 *
 * Ordering is presentation order in the receipt, nothing more.
 */
export const CLOSURE_PLAN: readonly ClosureRule[] = [
  {
    table: "users",
    columns: ["email", "name", "api_key_hash", "key_prefix", "signup_ip_hash"],
    disposition: "anonymized",
  },
  {
    table: "trial_grants",
    columns: ["user_id", "ip_hash"],
    disposition: "anonymized",
  },
  {
    table: "trial_grants",
    columns: ["email_hash"],
    disposition: "retained",
    reason:
      "A SHA-256 of your address, with the date and amount of the trial credit. " +
      "It is the only way to enforce one trial credit per address without storing the address, " +
      "and deleting it would let the same address claim the credit again by closing and re-registering. " +
      "A hash of an email address is pseudonymous, not anonymous — someone who already guesses your address can confirm it by hashing it — so we do not present it as anonymised data. " +
      "Basis: Art. 6(1)(f), preventing repeat claims of a one-off credit.",
  },
  {
    table: "api_key_recovery_tokens",
    columns: ["user_id", "requested_ip_hash", "token_hash"],
    disposition: "deleted",
  },
  {
    table: "transactions",
    columns: ["client_meta"],
    disposition: "anonymized",
    reason:
      "Channel attribution: referer, user-agent, the client header, MCP client info, " +
      "the discovery source, and a day-salted HMAC of your IP address. " +
      "Outside the hashed payload, so it can be cleared without breaking the chain.",
  },
  {
    table: "failed_requests",
    columns: ["user_id", "ip_hash", "user_agent"],
    disposition: "anonymized",
    reason:
      "Rows recording a request no capability could serve. The linkage and the request metadata are cleared; " +
      "the task text itself is retained, unlinked, as an aggregate demand signal and is pruned at 90 days.",
  },
  {
    table: "dispute_requests",
    columns: ["user_id", "contact_email"],
    disposition: "anonymized",
    reason:
      "If you have a dispute open, contact petter@strale.io — clearing the address means we can no longer reach you about it.",
  },
  {
    table: "transactions",
    columns: [
      "rows",
      "user_id",
      "input",
      "output",
      "error",
      "idempotency_key",
      "audit_trail",
    ],
    disposition: "retained",
    reason:
      "Processing records under Art. 30, and the hashed chain that gives the audit trail its tamper-evidence. " +
      "The row still carries your user id, pointing at the anonymised users row — the id itself is not a name, " +
      "and severing it would break the chain for every transaction recorded after yours. " +
      "`error` is part of the hashed payload too and often echoes what you sent (\"Country 'TH' is not covered by …\"); " +
      "`idempotency_key` is free text you chose, so it can carry whatever you put in it.",
  },
  {
    table: "transactions.audit_trail.request_context",
    columns: [...REQUEST_CONTEXT_FIELDS],
    disposition: "retained",
    reason:
      "The request each call arrived on: a truncated SHA-256 of your IP address, your user-agent, your Accept-Language, " +
      "the referer and origin headers if your client sent them, a fingerprint hash derived from those headers, and the MCP client name if we recognised one. " +
      "This sits inside audit_trail, which is part of the hashed payload, so clearing it would break the integrity chain for every transaction recorded after yours — " +
      "the same constraint that applies to executionInput.",
  },
  {
    table: "wallet_transactions",
    columns: ["rows", "stripe_session_id"],
    disposition: "retained",
    reason:
      "The ledger for your wallet, including the closure forfeit this request writes. " +
      "A top-up row carries the Stripe Checkout Session id, which resolves through Stripe's own API to the billing name, " +
      "email and card you paid with — so it is an identifier, even though it is not one we hold. " +
      "It is retained because it is what makes a credit idempotent and reconcilable against Stripe. " +
      "No production row carries one yet.",
  },
  {
    table: "wallets",
    columns: ["rows", "user_id", "balance_cents"],
    disposition: "retained",
    reason:
      "Your wallet row survives with a zero balance, carrying no identifier beyond the user id that points at the anonymised users row. " +
      "It is what the retained ledger rows link to.",
  },
  {
    table: "suggest_log",
    columns: ["ip_hash", "query"],
    disposition: "retained",
    reason:
      "Search queries typed into the catalogue, with a truncated hash of the IP they came from and no account link at all — " +
      "so closure cannot find yours among them. The hash of your signup IP is cleared from your users row by this request, " +
      "which removes the key that would have connected the two. Pruned at 90 days.",
  },
  {
    table: "discovery_hits",
    columns: ["ip_hash"],
    disposition: "retained",
    reason:
      "Which catalogue entries were viewed, with a truncated IP hash and no account link. Same shape as suggest_log above; pruned at 90 days.",
  },
  {
    table: "wallet_reservations",
    columns: ["user_id"],
    disposition: "retained",
    reason:
      "Short-lived records of funds held during an execution. `user_id` is NOT NULL on this table, so it cannot be cleared; " +
      "rows are resolved by the reconciler within their deadline and do not accumulate.",
  },
  {
    table: "capability_invocations",
    columns: ["user_id"],
    disposition: "retained",
    reason:
      "Append-only evidence about capability reliability — a database trigger refuses UPDATE and DELETE on this table, " +
      "which is what makes it usable as evidence at all, so the linkage cannot be cleared. Rows are pruned at 180 days.",
  },
];

export interface ClosureSummary {
  anonymized: string[];
  deleted: string[];
  retained: string[];
  disclosures: Record<string, string>;
}

function label(rule: ClosureRule): string {
  if (rule.columns.length === 1 && rule.columns[0] === "rows") {
    return `${rule.table} (rows)`;
  }
  return `${rule.table} (${rule.columns.filter((c) => c !== "rows").join(", ")})`;
}

/**
 * Render the plan as the customer-facing summary.
 *
 * Derived, never written out a second time — that duplication is the whole
 * reason this module exists.
 */
export function buildClosureSummary(): ClosureSummary {
  const summary: ClosureSummary = {
    anonymized: [],
    deleted: [],
    retained: [],
    disclosures: {},
  };

  for (const rule of CLOSURE_PLAN) {
    const text = label(rule);
    if (rule.disposition === "anonymized") summary.anonymized.push(text);
    else if (rule.disposition === "deleted") summary.deleted.push(text);
    else summary.retained.push(text);
    if (rule.reason) summary.disclosures[text] = rule.reason;
  }

  return summary;
}

/**
 * Perform every clearing step the plan declares.
 *
 * MUST run inside the erasure transaction. Nothing here is fire-and-forget:
 * either the account closes completely or it does not close at all.
 */
export async function applyClosurePlan(
  tx: any,
  params: { userId: string; anonymisedAt: Date; deletionReason: string },
): Promise<void> {
  // The `users` rule used to be written in routes/auth.ts, outside the function
  // whose docstring says it performs every clearing step the plan declares. A
  // second caller — an admin-initiated closure, a bulk Art. 17 job — would have
  // cleared everything else while the customer's API key kept working, and
  // `buildClosureSummary()` would have reported it anonymised.
  const sentinel = `redacted-${params.userId}@deleted.local`;
  await tx
    .update(users)
    .set({
      email: sentinel,
      name: null,
      // A random hash, so the current key fails immediately on next use.
      apiKeyHash: hashApiKey(generateApiKey()),
      keyPrefix: "REDACTED",
      signupIpHash: null,
      deletedAt: params.anonymisedAt,
      deletionReason: params.deletionReason,
      updatedAt: params.anonymisedAt,
    })
    .where(eq(users.id, params.userId));

  await anonymiseTrialGrantOnClosure(tx, { userId: params.userId });
  await purgeRecoveryTokensOnClosure(tx, { userId: params.userId });

  // `client_meta` is the one identifier-bearing field on `transactions` that
  // is NOT inside the hashed payload (`lib/integrity-hash.ts` hashes input,
  // output, error, price, auditTrail, markers and createdAt — not this
  // column), so it can be cleared without breaking the chain.
  await tx
    .update(transactions)
    .set({ clientMeta: null })
    .where(eq(transactions.userId, params.userId));

  // Not in any hash chain, so the linkage and the request metadata go. The
  // task text stays as an unlinked demand signal and is pruned at 90 days.
  await tx
    .update(failedRequests)
    .set({ userId: null, ipHash: null, userAgent: null })
    .where(eq(failedRequests.userId, params.userId));

  await tx
    .update(disputeRequests)
    .set({ userId: null, contactEmail: null })
    .where(eq(disputeRequests.userId, params.userId));
}

/**
 * Tables the plan deliberately says nothing about, with the reason.
 *
 * Read by the completeness test so an unhandled table is a failure rather than
 * an omission nobody notices.
 */
export const CLOSURE_PLAN_EXCLUSIONS: Readonly<Record<string, string>> = {};

/** Every table name the plan accounts for, for the completeness check. */
export function tablesCovered(): Set<string> {
  const covered = new Set<string>();
  for (const rule of CLOSURE_PLAN) covered.add(rule.table.split(".")[0]!);
  for (const t of Object.keys(CLOSURE_PLAN_EXCLUSIONS)) covered.add(t);
  return covered;
}

/**
 * The audit-trail keys this account's own rows actually hold.
 *
 * The receipt used to enumerate what `audit_trail` contains from a list
 * somebody maintained by hand, and four consecutive review rounds each found
 * another writer putting another shape in there: `client_meta` and
 * `request_context` (round 2), `fingerprintHash` and `mcpClient` inside
 * `request_context` (round 3), and a second `requestContext` object — camelCase,
 * different fields — written by the solution executor (round 4). Three
 * production rows carry it today.
 *
 * A hand-written list cannot enumerate a JSONB blob. So this reads the blob.
 * The receipt reports the keys THIS account's rows actually carry, which is
 * exhaustive by construction and cannot drift, because there is nothing left
 * to keep in sync.
 *
 * Keys only, never values: the point is to tell the customer what categories of
 * data survive, and echoing the contents back would be a fresh disclosure of
 * the very data they are asking us to stop holding.
 *
 * Nested one level, because that is where the identifier-bearing objects sit
 * (`request_context`, `requestContext`) and deeper recursion would surface
 * per-capability output field names, which are not about them.
 */
export async function describeRetainedAuditKeys(
  db: any,
  userId: string,
): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT k AS key
      FROM transactions t,
           LATERAL jsonb_object_keys(t.audit_trail) AS k
     WHERE t.user_id = ${userId}::uuid
       AND jsonb_typeof(t.audit_trail) = 'object'
    UNION
    SELECT DISTINCT outer_k || '.' || inner_k AS key
      FROM transactions t,
           LATERAL jsonb_object_keys(t.audit_trail) AS outer_k,
           LATERAL jsonb_object_keys(t.audit_trail -> outer_k) AS inner_k
     WHERE t.user_id = ${userId}::uuid
       AND jsonb_typeof(t.audit_trail) = 'object'
       AND jsonb_typeof(t.audit_trail -> outer_k) = 'object'
     ORDER BY 1
  `);
  const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? []) as Array<{
    key: string;
  }>;
  return list.map((r) => r.key);
}


/**
 * Tables the plan says it clears a `user_id` on, and the columns it clears
 * alongside it. Derived, so a rule added above is checked without anyone
 * remembering to add it here.
 */
export function clearedColumnsByTable(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const rule of CLOSURE_PLAN) {
    if (rule.disposition === "retained") continue;
    if (rule.table.includes(".")) continue; // JSONB paths are reported live
    const cols = rule.columns.filter((c) => c !== "rows");
    if (cols.length === 0) continue;
    out.set(rule.table, [...(out.get(rule.table) ?? []), ...cols]);
  }
  return out;
}

/**
 * How many rows in each cleared table still point at this account.
 *
 * The `user_id` half of the check. Zero everywhere means the linkage is gone —
 * which also means the rows can no longer be found by account, so the columns
 * cleared alongside it are checked separately by row id (see
 * `countUnclearedColumns`).
 */
export async function countRemainingLinkage(
  db: any,
  userId: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [table, columns] of clearedColumnsByTable()) {
    // Only tables whose rule actually clears `user_id`. `transactions` has a
    // rule clearing `client_meta` and deliberately KEEPS its user id — the
    // hashed chain depends on the row, and the id points at an anonymised
    // users row rather than at a name. Counting it as leftover linkage would
    // report the design as a defect.
    if (!columns.includes("user_id")) continue;
    if (table === "users") continue; // anonymised in place, keeps its own id
    const r = await db.execute(
      sql`SELECT COUNT(*)::int AS n
            FROM ${sql.raw(`"${table}"`)}
           WHERE "user_id" = ${userId}::uuid`,
    );
    out[table] = readCount(r);
  }
  return out;
}

/**
 * How many of `columns` are still non-null on the given rows.
 *
 * Takes explicit ids because closure severs the only way to find them by
 * account — the check has to hold onto them from before.
 *
 * Round 4: the previous version of this check was a hand-written list of five
 * subqueries covering 5 of the 11 columns the plan declared, so narrowing
 * `applyClosurePlan` to `set({ userId: null })` would have left three IP hashes
 * and a plaintext contact address in place with the test still green. Derived
 * from the plan now, so a rule and its verification cannot disagree.
 */
export async function countUnclearedColumns(
  db: any,
  table: string,
  ids: string[],
): Promise<Record<string, number>> {
  const columns = clearedColumnsByTable().get(table) ?? [];
  const out: Record<string, number> = {};
  if (ids.length === 0) return out;
  const idList = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  for (const column of columns) {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS n
        FROM ${sql.raw(`"${table}"`)}
       WHERE "id" IN (${idList})
         AND ${sql.raw(`"${column}"`)} IS NOT NULL
    `);
    out[`${table}.${column}`] = readCount(r);
  }
  return out;
}

function readCount(r: unknown): number {
  const rows = (Array.isArray(r) ? r : (r as { rows?: unknown[] })?.rows ?? []) as Array<{
    n: number;
  }>;
  return Number(rows[0]?.n ?? 0);
}
