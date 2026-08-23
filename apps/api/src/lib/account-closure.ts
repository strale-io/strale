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
} from "../db/schema.js";
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
    columns: ["rows", "user_id", "input", "output", "audit_trail"],
    disposition: "retained",
    reason:
      "Processing records under Art. 30, and the hashed chain that gives the audit trail its tamper-evidence. " +
      "The row still carries your user id, pointing at the anonymised users row — the id itself is not a name, " +
      "and severing it would break the chain for every transaction recorded after yours.",
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
    columns: ["rows"],
    disposition: "retained",
    reason:
      "The ledger for your wallet, including the closure forfeit this request writes. " +
      "It carries no identifier of its own; it links to the wallet, which links to the anonymised users row.",
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
  params: { userId: string },
): Promise<void> {
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
export const CLOSURE_PLAN_EXCLUSIONS: Readonly<Record<string, string>> = {
  wallets:
    "Carries `user_id` but no independent identifier; the balance is forfeited " +
    "through the wallet service and the row links to the anonymised users row.",
};

/** Every table name the plan accounts for, for the completeness check. */
export function tablesCovered(): Set<string> {
  const covered = new Set<string>();
  for (const rule of CLOSURE_PLAN) covered.add(rule.table.split(".")[0]!);
  for (const t of Object.keys(CLOSURE_PLAN_EXCLUSIONS)) covered.add(t);
  return covered;
}

/** Present so a caller can assert the plan ran against a real database. */
export async function countRemainingLinkage(
  db: any,
  userId: string,
): Promise<Record<string, number>> {
  const rows = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM trial_grants WHERE user_id = ${userId}::uuid)::int AS trial_grants,
      (SELECT COUNT(*) FROM api_key_recovery_tokens WHERE user_id = ${userId}::uuid)::int AS api_key_recovery_tokens,
      (SELECT COUNT(*) FROM transactions WHERE user_id = ${userId}::uuid AND client_meta IS NOT NULL)::int AS transactions_client_meta,
      (SELECT COUNT(*) FROM failed_requests WHERE user_id = ${userId}::uuid)::int AS failed_requests,
      (SELECT COUNT(*) FROM dispute_requests WHERE user_id = ${userId}::uuid)::int AS dispute_requests
  `);
  const first = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] })?.rows?.[0]) as
    | Record<string, number>
    | undefined;
  return first ?? {};
}
