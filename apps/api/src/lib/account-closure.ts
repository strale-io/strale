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

import { and, eq, sql } from "drizzle-orm";

import {
  disputeRequests,
  failedRequests,
  transactions,
  users,
} from "../db/schema.js";
import { generateApiKey, hashApiKey } from "./auth.js";
import {
  CUSTOMER_CONTENT_CLEAR_SQL,
  CUSTOMER_CONTENT_COLUMNS,
  CUSTOMER_CONTENT_COLUMN_NAMES,
} from "./customer-content.js";
import { anonymiseTrialGrantOnClosure } from "./trial-eligibility.js";
import { purgeRecoveryTokensOnClosure } from "./key-recovery.js";

export type ClosureDisposition = "anonymized" | "deleted" | "retained";

export interface ClosureRule {
  /** Physical table name, as it appears in the summary. */
  table: string;
  /** The identifying columns this rule accounts for. */
  columns: string[];
  disposition: ClosureDisposition;
  /** Required for `retained` — why it cannot be cleared. */
  reason?: string;
  /**
   * True when the clearing statement for this rule skips rows under a legal
   * hold, so the summary must report it as withheld rather than cleared.
   *
   * Declared per rule rather than inferred from the table name. Round 7 found
   * the inference (`rule.table === "transactions"`) mis-sorting in both
   * directions at once: `client_meta` was destroyed on held rows and reported
   * as withheld — destroying data on a row we are legally required to preserve,
   * and telling the subject in writing that we had not — while `audit_trail`,
   * whose rule is keyed `transactions.audit_trail`, was preserved and reported
   * as cleared.
   */
  respectsLegalHold?: boolean;
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
    respectsLegalHold: true,
    reason:
      "Channel attribution: referer, user-agent, the client header, MCP client info, " +
      "the discovery source, and a day-salted HMAC of your IP address. " +
      "Outside the hashed payload, so it can be cleared without breaking the chain.",
  },
  {
    table: "failed_requests",
    columns: ["user_id", "ip_hash", "user_agent", "error_detail"],
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
    // Derived from CUSTOMER_CONTENT_COLUMNS, not retyped. Round 5: the
    // hand-written version dropped `provenance` — 559 user-linked production
    // rows carry it, holding upstream source records keyed to whatever entity
    // the customer queried — one commit after that canonical list landed in
    // this repo for exactly this reason. The list exists because someone once
    // answered a privacy question from two columns out of thirty and reported
    // it as exhaustive.
    columns: [...CUSTOMER_CONTENT_COLUMN_NAMES],
    disposition: "anonymized",
    respectsLegalHold: true,
    reason:
      "Everything you sent and everything we made directly from it — the request payload, the response, " +
      "failure messages (which routinely echo the offending input back), the audit body, upstream source records, " +
      "and the idempotency key you chose. Cleared in place, immediately, by this request. " +
      "Rows under a legal hold are the one exception and are left intact.",
  },
  {
    table: "transactions",
    columns: [
      "rows",
      "user_id",
      "integrity_hash",
      "previous_hash",
      "price_cents",
      "created_at",
      "x402_payer_hash",
      "client_ip_hash",
    ],
    disposition: "retained",
    reason:
      "The processing record itself under Art. 30: that a call happened, when, what it cost, and its place in the hash chain. " +
      "The row keeps your user id, which points at the anonymised users row — a bare id is not a name. " +
      "The hashes ARE computed over the content just cleared, so this row\'s own content hash no longer recomputes — " +
      "which is why the row is stamped `redacted_at`, and why chain verification skips the recomputation for a redacted row " +
      "and reports it as redacted rather than broken. Every later transaction still verifies. " +
      "(An earlier version of this text claimed the hashes were not derived from the content. They are; the conclusion was right for the wrong reason.) " +
      "`x402_payer_hash` identifies a crypto wallet that paid on the x402 rail, which needs no account and is never linked to one; " +
      "`client_ip_hash` is only ever written on unauthenticated free-tier calls, so no row of yours carries it.",
  },
  {
    table: "transactions.audit_trail",
    columns: ["see erased_audit_trail_keys"],
    disposition: "anonymized",
    respectsLegalHold: true,
    reason:
      "The audit body, including whatever request context the call recorded — a truncated hash of your IP, " +
      "your user-agent, Accept-Language, referer and origin, and for solution runs a per-step record. " +
      "It is cleared along with the rest of the content above. The keys your rows held are listed in " +
      "`erased_audit_trail_keys`, read from those rows rather than from a list somebody maintains: " +
      "four review rounds each found another writer putting another shape in here, so it is no longer described from memory.",
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
    table: "x402_orphan_settlements",
    columns: ["payer_address"],
    disposition: "retained",
    reason:
      "On-chain wallet addresses from x402 payments that need reconciling. The x402 rail has no accounts — the payment is the authentication — " +
      "so these rows never carried a link to yours and closure cannot find them among them.",
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
export function buildClosureSummary(outcome?: ClosureOutcome): ClosureSummary {
  const summary: ClosureSummary = {
    anonymized: [],
    deleted: [],
    retained: [],
    disclosures: {},
  };

  for (const rule of CLOSURE_PLAN) {
    const text = label(rule);
    // A transaction under a legal hold is not cleared, so on an account whose
    // rows are all held, listing its content as "anonymized" would hand the
    // subject a confirmation indistinguishable from a complete erasure.
    const heldBack =
      rule.respectsLegalHold === true &&
      rule.disposition === "anonymized" &&
      outcome !== undefined &&
      outcome.contentRedacted === 0 &&
      outcome.legalHoldSkipped > 0;

    if (heldBack) {
      summary.retained.push(`${text} — withheld under legal hold`);
      summary.disclosures[text] =
        "Not cleared: every one of your transactions is under a legal hold, which we are required to preserve intact. " +
        "Contact petter@strale.io about the hold; the content is cleared as soon as it lifts.";
      continue;
    }

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
export interface ClosureOutcome {
  /** Transaction rows whose customer content this request cleared. */
  contentRedacted: number;
  /**
   * Transaction rows left intact because they are under a legal hold.
   *
   * Returned because the receipt claimed the response reported it and the
   * response did not — and because the summary is otherwise a pure function of
   * the plan, so a subject every one of whose rows is held would have been
   * handed a confirmation identical to a complete erasure.
   */
  legalHoldSkipped: number;
}

export async function applyClosurePlan(
  tx: any,
  params: { userId: string; anonymisedAt: Date; deletionReason: string },
): Promise<ClosureOutcome> {
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
  // `legal_hold` here too. Without it a held row lost its `client_meta` —
  // referer, user-agent, the day-salted IP HMAC — while the receipt reported
  // it as withheld: data destroyed on a row we are legally required to
  // preserve intact, and a written statement to the subject that it was not.
  await tx
    .update(transactions)
    .set({ clientMeta: null })
    .where(
      and(eq(transactions.userId, params.userId), eq(transactions.legalHold, false)),
    );

  // Not in any hash chain, so the linkage and the request metadata go. The
  // task text stays as an unlinked demand signal and is pruned at 90 days.
  await tx
    .update(failedRequests)
    // `error_detail` carries caller-supplied JSON key names and validator text,
    // so it is request metadata like the rest of this set rather than the
    // aggregate demand signal `task` is kept for.
    .set({ userId: null, ipHash: null, userAgent: null, errorDetail: null })
    .where(eq(failedRequests.userId, params.userId));

  await tx
    .update(disputeRequests)
    .set({ userId: null, contactEmail: null })
    .where(eq(disputeRequests.userId, params.userId));

  // Erasure that erases.
  //
  // The receipt used to tell the data subject that `input`, `output`, `error`
  // and `audit_trail` could not be cleared because "severing it would break
  // the chain for every transaction recorded after yours". That was false, and
  // the platform's own scheduled behaviour is the proof: `purgeCustomerContent`
  // sets exactly these columns to NULL on EVERY transaction at 90 days.
  // `integrity_hash` and `previous_hash` are not on the clear list, so link
  // N→N+1 survives untouched and `verify.ts` classifies a redacted predecessor
  // as "redacted" rather than broken. Production already carries `redacted_at`
  // on 308,347 of 909,107 user-linked rows.
  //
  // So a subject asking on day 10 was told it was technically impossible, and
  // on day 90 we did it anyway, to everyone. Closure now does it immediately,
  // using the same statement the retention job uses rather than a second
  // opinion about which columns count.
  //
  // `legal_hold` is respected, exactly as the retention purge does: a row we
  // are legally required to preserve is the one thing erasure cannot reach,
  // and the receipt says so.
  // ISO string, never a Date. postgres-js's bind encoder cannot serialise a
  // Date through the sql-template path — it falls through to
  // Buffer.byteLength(date) and throws — which is the PR-43 defect class this
  // repo has a protocol about, and which I reintroduced here while fixing the
  // receipt/row clock split. The integration lane caught it as a 500.
  const cleared = await tx.execute(sql`
    UPDATE transactions
       SET ${CUSTOMER_CONTENT_CLEAR_SQL},
           redacted_at = ${params.anonymisedAt.toISOString()}::timestamptz,
           deletion_reason = 'account_closure_erasure'
     WHERE user_id = ${params.userId}::uuid
       AND legal_hold = false
       AND redacted_at IS NULL
  `);

  const held = await tx.execute(sql`
    SELECT COUNT(*)::int AS n
      FROM transactions
     WHERE user_id = ${params.userId}::uuid
       AND legal_hold = true
  `);

  return {
    contentRedacted: (cleared as { count?: number }).count ?? 0,
    legalHoldSkipped: readCount(held),
  };
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
 * The audit-trail keys this account's own rows hold, read before they are
 * cleared.
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
 * The receipt reports the keys THIS account's rows actually carried, which is
 * exhaustive by construction and cannot drift, because there is nothing left
 * to keep in sync.
 *
 * Runs INSIDE the closure transaction, before the content is cleared —
 * otherwise it reads an already-nulled column and reports nothing, which would
 * be an honest answer to the wrong question. What the subject wants to know is
 * what we were holding.
 *
 * Keys only, never values: the point is to tell the customer what categories of
 * data survive, and echoing the contents back would be a fresh disclosure of
 * the very data they are asking us to stop holding.
 *
 * Nested one level, because that is where the identifier-bearing objects sit
 * (`request_context`, `requestContext`) and deeper recursion would surface
 * per-capability output field names, which are not about them.
 */
export async function describeAuditKeysHeld(
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
    UNION
    -- Arrays too. audit_trail.steps on a solution run is an array of
    -- per-step objects, one field of which is error — the same
    -- input-echoing text the column-level rule discloses. An object-only
    -- walk reported "steps" and stopped there.
    SELECT DISTINCT outer_k || '[].' || elem_k AS key
      FROM transactions t,
           LATERAL jsonb_object_keys(t.audit_trail) AS outer_k,
           LATERAL jsonb_array_elements(t.audit_trail -> outer_k) AS elem,
           LATERAL jsonb_object_keys(elem) AS elem_k
     WHERE t.user_id = ${userId}::uuid
       AND jsonb_typeof(t.audit_trail) = 'object'
       AND jsonb_typeof(t.audit_trail -> outer_k) = 'array'
       AND jsonb_typeof(elem) = 'object'
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
    // "Cleared" is not always "null". `transactions.input` is NOT NULL and
    // empties to `{}` instead — which `CUSTOMER_CONTENT_COLUMNS` already
    // records as `clearsTo: "empty_json"`, and which an IS NOT NULL check
    // reads as "survived". Taking the predicate from the same declaration the
    // clearing statement is built from, rather than assuming.
    const spec = CUSTOMER_CONTENT_COLUMNS.find((c) => c.column === column);
    const stillSet =
      spec?.clearsTo === "empty_json"
        ? sql`${sql.raw(`"${column}"`)} IS NOT NULL AND ${sql.raw(`"${column}"`)}::text <> '{}'`
        : sql`${sql.raw(`"${column}"`)} IS NOT NULL`;
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS n
        FROM ${sql.raw(`"${table}"`)}
       WHERE "id" IN (${idList})
         AND ${stillSet}
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
