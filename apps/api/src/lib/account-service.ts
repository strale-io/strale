/**
 * The one authority for account creation (WP11, risk CR-09).
 *
 * Two handlers created accounts, each with the same two-commit shape:
 *
 *     const [user] = await db.insert(users)...        // commit 1
 *     await db.transaction(tx => openWallet(tx, ...)) // commit 2
 *
 * WP2 made the *second* commit atomic — the wallet and its opening ledger row
 * are written together, so a balance can no longer exist without a matching
 * entry. It left the gap between the two commits open, and said so: "The three
 * signup writes are still not one transaction — that is CR-09 and belongs to
 * WP11."
 *
 * What that gap produces is an account that cannot be recovered from either
 * side. The user row is committed, so the address is taken and a second
 * registration returns 409. The wallet is missing, so `/v1/wallet/balance`
 * reports 0, `/v1/do` finds no wallet to debit, and `/v1/auth/recover` will
 * happily hand out a key to an account that can never spend. Nothing sweeps
 * it, because nothing knows it happened: the request 500s and the row stays.
 *
 * Production (2026-08-23) holds 60 users and 59 wallets. The one user without
 * a wallet is `system@strale.internal`, the test-harness principal, created
 * deliberately without one — so the window has not yet been hit by a real
 * signup. That is luck plus low volume (21 signups in 90 days), not a
 * property of the code.
 *
 * Everything the account needs is now one transaction: the user row, the
 * wallet, the opening grant's ledger entry, and the trial-entitlement record
 * that stops the same identity taking the grant twice. Either all four exist
 * or none do.
 */

import { eq } from "drizzle-orm";

import { users } from "../db/schema.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "./auth.js";
import { pgErrorCode } from "./db-error.js";
import { normaliseEmail, recordTrialGrant, type TrialChannel } from "./trial-eligibility.js";
import * as walletService from "./wallet-service.js";

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

export class EmailAlreadyRegisteredError extends Error {
  constructor(public readonly email: string) {
    super(`An account already exists for ${email}`);
    this.name = "EmailAlreadyRegisteredError";
  }
}

export interface CreatedAccount {
  userId: string;
  email: string;
  /** Plaintext key. Returned to the caller once; only the hash is stored. */
  apiKey: string;
  keyPrefix: string;
  /** What the wallet was actually opened with — not what was requested. */
  grantedCents: number;
  /** False when the trial-entitlement row was rejected by a concurrent signup. */
  trialRecorded: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  // Since drizzle-orm 0.44, `db.transaction()` rethrows driver errors
  // wrapped in DrizzleQueryError — `.code` lives on `.cause`, not on the
  // caught error itself. See db-error.ts for the full incident.
  return pgErrorCode(err) === UNIQUE_VIOLATION;
}

/**
 * Create a user, a wallet, its opening grant and the trial-entitlement record
 * as one atomic unit.
 *
 * `grantCents` comes from `assessTrialGrant` and may be zero — a withheld
 * grant still gets an account and a wallet, just an empty one. Zero-grant
 * signups write no `trial_grants` row: withholding is not an entitlement being
 * consumed, and recording it would make a NAT-shared IP permanently poison
 * every address behind it.
 *
 * Duplicate-email handling is by constraint, not by a preceding SELECT. The
 * pre-check both handlers ran is a TOCTOU race that turns a concurrent
 * duplicate registration into a 500 with a raw Postgres error; catching the
 * unique violation makes the answer the same 409 either way.
 */
export async function createAccount(
  db: any,
  params: {
    email: string;
    name?: string | null;
    /** Exact-address hash, stored on the users row for abuse investigation. */
    ipHash: string | null;
    /** Bucketed hash (IPv6 counted by /64) the trial cap measures against. */
    trialIpHash: string | null;
    grantCents: number;
    grantDescription: string;
    channel: TrialChannel;
    tosVersion: string;
    now?: Date;
  },
): Promise<CreatedAccount> {
  const email = normaliseEmail(params.email);
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);
  const acceptedAt = params.now ?? new Date();

  try {
    return await db.transaction(async (tx: any) => {
      const [user] = await tx
        .insert(users)
        .values({
          email,
          name: params.name ?? null,
          apiKeyHash,
          keyPrefix,
          signupIpHash: params.ipHash,
          // Cert-audit G7: account creation is acceptance of the in-force
          // Terms version, recorded at the moment the row is written.
          tosAcceptedAt: acceptedAt,
          tosVersion: params.tosVersion,
        })
        .returning({ id: users.id, email: users.email });

      let trialRecorded = false;
      let grantedCents = 0;

      if (params.grantCents > 0) {
        // Claim the entitlement BEFORE crediting. The unique index on
        // email_hash is what makes "one trial per address" true under
        // concurrency, and claiming after the credit would let two
        // simultaneous signups both credit and only then discover the
        // conflict.
        trialRecorded = await recordTrialGrant(tx, {
          email,
          ipHash: params.trialIpHash,
          userId: user.id,
          grantCents: params.grantCents,
          channel: params.channel,
        });
        if (trialRecorded) grantedCents = params.grantCents;
      }

      await walletService.openWallet(tx, {
        userId: user.id,
        grantCents: grantedCents,
        type: "trial_credit",
        description: params.grantDescription,
      });

      return {
        userId: user.id,
        email: user.email,
        apiKey,
        keyPrefix,
        grantedCents,
        trialRecorded,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new EmailAlreadyRegisteredError(email);
    throw err;
  }
}

/** Fast-path duplicate check so the common case answers 409 without a write. */
export async function emailIsRegistered(db: any, email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normaliseEmail(email)))
    .limit(1);
  return rows.length > 0;
}
