/**
 * One account-closure path for every caller.
 *
 * `DELETE /v1/auth/me` (the account holder, with their own primary key) and
 * `POST /v1/admin/accounts/close` (an operator acting on a holder's
 * written request) both run this function, so the forfeit, the clearing plan
 * and the response body cannot drift between them. The handler body used to
 * live inline in `routes/auth.ts`; it moved here unchanged when the operator
 * path was added (2026-11-16), because an operator path with its own copy of
 * the closure is how two copies of the same list drifted apart in four review
 * rounds before (see `lib/account-closure.ts`).
 *
 * The comments below are the ones the inline handler carried.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import * as walletService from "./wallet-service.js";
import { logError } from "./log.js";
import {
  applyClosurePlan,
  buildClosureSummary,
  describeAuditKeysHeld,
  type ClosureOutcome,
} from "./account-closure.js";

type Db = ReturnType<typeof getDb>;

/**
 * The account was already closed when the closure transaction took its lock.
 *
 * A route's own "is it open?" read happens before the transaction, so two
 * concurrent closures (two operator calls, or an operator call racing the
 * holder's own DELETE /me) would both pass it. Without the in-transaction
 * check the second run re-anonymised the row, overwrote the first run's
 * `deleted_at` and `deletion_reason`, and returned a second 200 receipt.
 * Routes map this to 409.
 */
export class AccountAlreadyClosedError extends Error {
  constructor(userId: string) {
    super(`Account ${userId} is already closed`);
    this.name = "AccountAlreadyClosedError";
  }
}

/**
 * Close an account. Returns the customer-facing receipt (`body`, exactly what
 * DELETE /v1/auth/me has always returned) and the forfeited balance for the
 * operator's log, which is not part of the receipt.
 */
export async function closeAccount(
  db: Db,
  params: { userId: string; reason: string; now?: Date },
) {
  const { userId, reason } = params;
  const now = params.now ?? new Date();

  // Read BEFORE the transaction opens, not inside it.
  //
  // The previous version put this read inside the closure transaction wrapped
  // in a try/catch, on the reasoning that a reporting nicety must not fail the
  // closure. The catch could not do that job: a SQL error inside a Postgres
  // transaction aborts the WHOLE transaction, so every later statement fails
  // with 25P02 and the COMMIT becomes a ROLLBACK. Catching the error in
  // JavaScript let execution carry on into `forfeitOnClosure`, which then
  // failed on an already-aborted transaction and threw — a 500 with nothing
  // closed, deterministically, on every retry. That is the same Postgres
  // semantic the retention job needed a SAVEPOINT for, in a commit that added
  // the SAVEPOINT there and this catch here.
  //
  // Outside the transaction the catch works as intended, and the read still
  // precedes the clearing, which is all it needed.
  let outcome: ClosureOutcome | undefined;
  let forfeitedCents = 0;
  let auditKeysHeld: string[];
  try {
    auditKeysHeld = await describeAuditKeysHeld(db, userId);
  } catch (err) {
    logError("closure-audit-key-read-failed", err, { user_id: userId });
    auditKeysHeld = ["<unavailable — contact petter@strale.io for the full list>"];
  }

  await db.transaction(async (tx) => {
    // Forfeit whatever remains — refund-on-delete is out of scope (it would
    // need a Stripe payout flow) and is documented in the response.
    //
    // WP2: this used to zero the balance with no ledger entry, which made it
    // the one balance change on the platform with no audit trail and left the
    // ledger permanently out of step with the balance for that wallet. It now
    // goes through the wallet service, which writes a paired closure_forfeit
    // entry, and takes the row lock the previous version skipped.
    //
    // Runs BEFORE the anonymisation so the forfeit is computed against a live
    // account, and inside the same transaction so a failure closes nothing.
    forfeitedCents = await walletService.forfeitOnClosure(tx, {
      userId,
      description: "Balance forfeited on account closure (Art. 17 erasure)",
    });

    // Then prove the account is still open, under a lock a second closure
    // must wait for. A concurrent closure blocks on the wallet lock above
    // until the first commits, then lands here, sees `deleted_at` set and
    // throws; the rollback undoes its (zero-balance) forfeit, so it changes
    // nothing.
    //
    // Order matters. Every money path takes the wallet lock first and then
    // inserts rows that reference `users`, which takes FOR KEY SHARE on the
    // users row. Locking `users` FOR UPDATE before the wallet reversed that
    // order and could deadlock against a paid call in flight (review round 2,
    // 2026-11-16). FOR NO KEY UPDATE after the wallet lock does not conflict
    // with those key-share locks, and still conflicts with itself, which is
    // all the double-closure check needs.
    const [open] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .for("no key update");
    if (!open) throw new AccountAlreadyClosedError(userId);

    // WP11: every clearing step, including the users row itself, is declared
    // once in `lib/account-closure.ts` — which also builds the summary
    // returned below. They were two hand-maintained artifacts and drifted
    // apart in four consecutive review rounds; they are one artifact now.
    outcome = await applyClosurePlan(tx, {
      userId,
      anonymisedAt: now,
      deletionReason: reason,
    });
  });

  const closureSummary = buildClosureSummary(outcome);

  // Cert-audit Y-7: be explicit about what survives erasure.
  //
  // This comment used to say the integrity hash covers input and auditTrail,
  // so clearing them would break the chain — and the response said the same to
  // the customer. Round 5 checked it against the platform's own behaviour:
  // `purgeCustomerContent` clears exactly those columns on EVERY transaction
  // at 90 days, `integrity_hash` and `previous_hash` are not on its clear
  // list, and `verify.ts` reports a redacted predecessor as redacted rather
  // than broken. 312,677 of 919,304 user-linked production rows already carry
  // `redacted_at`. So the refusal ground was false, and a subject asking on
  // day 10 was told it was impossible while the platform did it anyway on day
  // 90. Closure clears the content immediately now.
  //
  // What genuinely survives is the processing record — that a call happened,
  // when, what it cost, its hashes — under Art. 30, plus a legal-hold
  // exception the response reports.
  const body = {
    status: "redacted",
    user_id: userId,
    redacted_at: now.toISOString(),
    deletion_reason: reason,
    summary: {
      // Derived from CLOSURE_PLAN, never restated. A hand-written copy of this
      // list was wrong in three consecutive review rounds — each time in a
      // place the previous round had not pointed at.
      ...closureSummary,
      // Read from your own rows, not from a list somebody maintains. Four
      // review rounds each found another writer putting another shape into
      // `audit_trail` — `client_meta` and `request_context`, then
      // `fingerprintHash` and `mcpClient` inside it, then a second
      // `requestContext` object written by the solution executor with
      // different fields under a camelCase key. A hand-written list cannot
      // enumerate a JSONB blob, so this reports what was actually there.
      erased_audit_trail_keys: auditKeysHeld,
      retained_legal_basis:
        "GDPR Art. 30 (records of processing) + DEC-20260428-B (audit-chain integrity). " +
        "Your row's identifiers are anonymised; transaction rows still carry your user id, which points at that anonymised row — a bare id is not a name, and severing it would break the hashed chain every later transaction references. " +
        "This is the same legal basis many regulated-industry providers (banks, KYC vendors) use for retention-on-deletion. " +
        "Per-item reasons are in `disclosures` below.",
      erased_content_disclosure:
        "Everything you sent and everything derived from it is cleared from your transaction rows by this request — the request payload, the response, failure messages, the audit body, upstream source records and your idempotency keys. " +
        "This is the same in-place redaction the platform already applies to every transaction at 90 days, so it is proven not to break the hash chain: the integrity and previous-block hashes are untouched and every later transaction still verifies, with yours reported as redacted rather than broken. " +
        "Earlier versions of this response told you the opposite — that clearing this content would break the chain, and that you had to write in to have it removed. Both were wrong, and neither is how it works now.",
      legal_hold_disclosure:
        "The one exception is a transaction under a legal hold, which we are required to preserve intact and which this request therefore does not clear. " +
        "`transactions_content_redacted` and `transactions_withheld_under_legal_hold` below are the counts for your account. " +
        "An earlier version of this text told you the response reported them and it did not.",
    },
    transactions_content_redacted: outcome?.contentRedacted ?? 0,
    transactions_withheld_under_legal_hold: outcome?.legalHoldSkipped ?? 0,
    api_key_status: "burned — current key will fail on next use",
    wallet_status: "balance_zeroed",
    contact: "petter@strale.io",
  };
  return { body, forfeitedCents };
}
