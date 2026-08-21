/**
 * The one authority for wallet balance mutations (WP2, risk CR-01).
 *
 * Before this module, ten call sites changed a balance with inline SQL. Most
 * were individually correct — locked, transactional, delta-based — but the
 * pattern was a convention rather than a rule, and the two sites that departed
 * from it are exactly where the money bugs were:
 *
 *   - the solutions refund wrote an ABSOLUTE balance captured before execution,
 *     outside any transaction and without a row lock, so any concurrent debit
 *     or top-up in that window was silently clobbered;
 *   - account closure zeroed the balance with no ledger row at all, so the
 *     ledger stopped summing to the balance — permanently, and silently, on a
 *     platform whose product is an audit trail.
 *
 * The invariant this module exists to enforce is therefore not "use a lock" but
 * something stronger and simpler to check: **every balance change writes a
 * matching ledger row in the same transaction, and every change is a delta.**
 * There is no exported way to set a balance to an absolute value.
 *
 * Composition: operations take the caller's transaction rather than opening
 * their own. `/v1/do` debits, inserts the transaction row, and writes the audit
 * trail as one atomic unit; a service that opened its own transaction would
 * break that atomicity and reintroduce the crash window WP3 is about to close.
 *
 * Scope boundary: this package makes mutation single-authority. The durable
 * reserve/capture/release state machine is WP3 and deliberately not here — the
 * ledger primitives below are what it will be built on.
 */

import { and, eq, gte, sql } from "drizzle-orm";

import { wallets, walletTransactions } from "../db/schema.js";

/**
 * A drizzle transaction or the db handle. Typed loosely on purpose, matching
 * `spendCapWouldExceed` in do.ts: drizzle's transaction type is awkward to name
 * at call sites and the structural surface used here is small.
 */
export type WalletTx = any;

/**
 * Ledger entry kinds. Declared here because this is the only module that
 * writes them, so the union cannot drift from what is actually recorded.
 *
 * `closure_forfeit` is new in WP2: closing an account previously zeroed the
 * balance with no entry, which is the one balance change that had no audit
 * trail. Only consumer of `type` is the customer-facing transaction list in
 * routes/wallet.ts, which renders it without branching, so the added value is
 * display-safe.
 */
export type LedgerEntryType =
  | "top_up"
  | "purchase"
  | "refund"
  | "trial_credit"
  | "closure_forfeit";

export interface LockedWallet {
  id: string;
  balanceCents: number;
}

export class WalletNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`No wallet for user ${userId}`);
    this.name = "WalletNotFoundError";
  }
}

export class InsufficientFundsError extends Error {
  constructor(
    public readonly balanceCents: number,
    public readonly requiredCents: number,
  ) {
    super(
      `Insufficient balance: have ${balanceCents} cents, need ${requiredCents}`,
    );
    this.name = "InsufficientFundsError";
  }
}

/**
 * Reject the bare db handle where multi-statement atomicity is required.
 *
 * Drizzle's transaction object carries a rollback method; the top-level handle
 * does not. That is the only structural difference available, and it is enough
 * to catch the mistake that matters — passing `db` where `tx` was meant.
 */
function assertTransactional(tx: WalletTx, operation: string): void {
  if (typeof tx?.rollback !== "function") {
    throw new Error(
      `${operation} must run inside a transaction: its writes are not atomic ` +
        "otherwise, and a crash between them leaves the balance and the ledger " +
        "disagreeing. Wrap the call in db.transaction(...).",
    );
  }
}

/**
 * Take the row lock and read the balance.
 *
 * Separate from the debit so callers can run their own checks between the two
 * while still holding the lock — the spend cap re-check in `/v1/do` depends on
 * that ordering, because concurrent requests for one user serialise here and
 * the SUM it runs must see every committed debit.
 *
 * Returns null rather than throwing so callers can map a missing wallet onto
 * their own response shape.
 */
export async function lockWalletForUser(
  tx: WalletTx,
  userId: string,
): Promise<LockedWallet | null> {
  const [wallet] = await tx
    .select({ id: wallets.id, balanceCents: wallets.balanceCents })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .for("update");
  return wallet ?? null;
}

/** Read a balance without locking. For display and pre-checks only. */
export async function readBalance(
  tx: WalletTx,
  userId: string,
): Promise<number | null> {
  const [wallet] = await tx
    .select({ balanceCents: wallets.balanceCents })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  return wallet?.balanceCents ?? null;
}

/**
 * Apply a signed delta and record it. The single mutation primitive — every
 * other operation here is a thin wrapper, so the balance-and-ledger pairing
 * cannot be forgotten at a call site.
 *
 * The balance is changed with a SQL expression rather than a value computed in
 * JavaScript. A read-modify-write can only be correct while holding the row
 * lock; an in-database delta is correct either way, which removes the failure
 * mode that produced the solutions-refund bug.
 */
async function applyDelta(
  tx: WalletTx,
  params: {
    walletId: string;
    deltaCents: number;
    type: LedgerEntryType;
    description: string;
    referenceId?: string | null;
    /** Set on Stripe credits; the unique index on it is what makes the
     * webhook idempotent against a replayed delivery. */
    stripeSessionId?: string | null;
  },
): Promise<void> {
  const { walletId, deltaCents, type, description, referenceId } = params;

  await tx
    .update(wallets)
    .set({
      balanceCents: sql`${wallets.balanceCents} + ${deltaCents}`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.id, walletId));

  await tx.insert(walletTransactions).values({
    walletId,
    amountCents: deltaCents,
    type,
    referenceId: referenceId ?? null,
    stripeSessionId: params.stripeSessionId ?? null,
    description,
  });
}

/**
 * Charge a wallet. The caller must already hold the lock from
 * `lockWalletForUser`, and is expected to have checked affordability — the
 * assertion here is a backstop against a caller that forgets, not the primary
 * gate, because callers need to map insufficient funds onto their own error
 * responses rather than catch an exception.
 */
export async function debit(
  tx: WalletTx,
  params: {
    wallet: LockedWallet;
    amountCents: number;
    description: string;
    referenceId?: string | null;
    type?: Extract<LedgerEntryType, "purchase">;
  },
): Promise<number> {
  const { wallet, amountCents, description, referenceId } = params;

  if (amountCents <= 0) {
    throw new Error(`debit requires a positive amount, got ${amountCents}`);
  }

  // Affordability is enforced by the database, not by the balance the caller
  // happens to be holding. `wallet.balanceCents` is a snapshot: it is accurate
  // while the caller holds the row lock, but the service cannot verify that it
  // does, and a caller that forgets would otherwise overdraw silently. The
  // predicate below cannot be wrong — if the row no longer satisfies it, no row
  // is returned and nothing was written.
  const [row] = await tx
    .update(wallets)
    .set({
      balanceCents: sql`${wallets.balanceCents} - ${amountCents}`,
      updatedAt: new Date(),
    })
    .where(and(eq(wallets.id, wallet.id), gte(wallets.balanceCents, amountCents)))
    .returning({ balanceCents: wallets.balanceCents });

  if (!row) {
    throw new InsufficientFundsError(wallet.balanceCents, amountCents);
  }

  await tx.insert(walletTransactions).values({
    walletId: wallet.id,
    amountCents: -amountCents,
    type: params.type ?? "purchase",
    referenceId: referenceId ?? null,
    description,
  });

  // The value the database actually settled on, not arithmetic on the snapshot.
  return row.balanceCents;
}

/**
 * Add funds. No lock required: the delta is applied in-database, so a
 * concurrent debit cannot be lost.
 */
export async function credit(
  tx: WalletTx,
  params: {
    walletId: string;
    amountCents: number;
    type: Extract<LedgerEntryType, "top_up" | "trial_credit" | "refund">;
    description: string;
    referenceId?: string | null;
    stripeSessionId?: string | null;
  },
): Promise<void> {
  if (params.amountCents <= 0) {
    throw new Error(
      `credit requires a positive amount, got ${params.amountCents}`,
    );
  }
  await applyDelta(tx, {
    walletId: params.walletId,
    deltaCents: params.amountCents,
    type: params.type,
    description: params.description,
    referenceId: params.referenceId,
    stripeSessionId: params.stripeSessionId,
  });
}

/**
 * Return a charge. A credit with refund semantics, kept as its own name so
 * call sites read as what they mean and so refunds stay greppable in the
 * ledger.
 */
export async function refund(
  tx: WalletTx,
  params: {
    walletId: string;
    amountCents: number;
    description: string;
    referenceId?: string | null;
  },
): Promise<void> {
  await credit(tx, { ...params, type: "refund" });
}

/**
 * Create a wallet with an opening grant, recording the grant.
 *
 * Signup previously inserted the wallet with a non-zero starting balance and
 * then wrote the ledger row separately, so a failure between the two produced a
 * balance with no corresponding entry. Opening at zero and crediting through
 * the same primitive as everything else makes that impossible.
 *
 * MUST be given a transaction, not the bare db handle. Opening and granting are
 * two statements; run outside a transaction they are two commits, and a crash
 * between them leaves a wallet that exists but never received its grant. The
 * assertion below makes that a loud failure rather than a rare silent one.
 */
export async function openWallet(
  tx: WalletTx,
  params: {
    userId: string;
    grantCents: number;
    type: Extract<LedgerEntryType, "trial_credit">;
    description: string;
  },
): Promise<LockedWallet> {
  assertTransactional(tx, "openWallet");

  const [wallet] = await tx
    .insert(wallets)
    .values({ userId: params.userId, balanceCents: 0 })
    .returning({ id: wallets.id, balanceCents: wallets.balanceCents });

  if (params.grantCents > 0) {
    await credit(tx, {
      walletId: wallet.id,
      amountCents: params.grantCents,
      type: params.type,
      description: params.description,
    });
  }

  return { id: wallet.id, balanceCents: params.grantCents };
}

/**
 * Forfeit whatever remains when an account closes.
 *
 * Closure is not a refund — the balance is not returned to the customer, which
 * is a documented product decision (a refund would need a Stripe payout flow).
 * It is still a balance change, so it gets a ledger entry like every other one.
 * Without it the ledger stopped summing to the balance for that wallet forever.
 *
 * Returns the amount forfeited so the caller can disclose it.
 */
export async function forfeitOnClosure(
  tx: WalletTx,
  params: { userId: string; description: string },
): Promise<number> {
  const wallet = await lockWalletForUser(tx, params.userId);
  if (!wallet) return 0;
  if (wallet.balanceCents === 0) return 0;

  await applyDelta(tx, {
    walletId: wallet.id,
    deltaCents: -wallet.balanceCents,
    type: "closure_forfeit",
    description: params.description,
  });

  return wallet.balanceCents;
}
