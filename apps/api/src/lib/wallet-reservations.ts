/**
 * Durable wallet reservations (WP3, risks CR-01 / N1).
 *
 * The defect this closes, proved mechanically in WP1: the async `/v1/do` path
 * debits, commits, answers 202, then runs the capability in an in-memory
 * promise whose catch block holds the only refund. A SIGKILL between the commit
 * and that catch strands the charge — the customer stays debited, the
 * transaction stays `executing`, and nothing anywhere transitions it.
 * `lib/shutdown.ts` claimed the integrity-hash janitor recovered these; it does
 * not, it only ever writes `compliance_hash_state`. Production holds 11 such
 * rows, the oldest from 2026-04-07.
 *
 * The fix is not to move the debit — moving it just relocates the window. It is
 * to write down, in the same transaction as the debit, the fact that this money
 * movement is still provisional. That record outlives the process, so a
 * reconciler can find what a crash abandoned.
 *
 * Money movement itself is unchanged and still goes through the wallet service
 * (WP2). A reservation records why funds moved and whether that movement is
 * settled. `reserve` debits, `capture` marks the debit final, `release` returns
 * the money.
 *
 * Every transition is a conditional UPDATE predicated on the expected current
 * state. That is what makes duplicate capture and duplicate release no-ops
 * instead of second money movements: the second caller matches no row and is
 * told so, rather than racing. It is also why the reconciler can run
 * concurrently with a live execution finishing — exactly one of them wins.
 */

import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { walletReservations } from "../db/schema.js";
import * as walletService from "./wallet-service.js";
import type { WalletTx } from "./wallet-service.js";

/**
 * How long a reservation may stay non-terminal before the reconciler treats it
 * as abandoned.
 *
 * Deliberately generous relative to the 15s sync ceiling and the async paths
 * that motivate it: releasing a still-running execution would refund a customer
 * who is about to get their result, which is worse than waiting. The capture
 * and release transitions are conditional, so a late finisher racing the
 * reconciler cannot double-move money either way.
 */
export const DEFAULT_RESERVATION_TTL_MS = 15 * 60 * 1000;

/**
 * The TTL must exceed the executor's hard timeout, or the reconciler would
 * refund executions that are still running and about to deliver a result.
 * The two constants live in different modules and EXEC_HARD_TIMEOUT_MS is
 * env-tunable, so the relationship is asserted rather than assumed — set it
 * above the TTL on Railway and this fails at boot instead of silently
 * refunding live work.
 */
export function assertReservationTtlExceedsExecutionTimeout(
  execHardTimeoutMs: number,
  ttlMs: number = DEFAULT_RESERVATION_TTL_MS,
): void {
  if (ttlMs <= execHardTimeoutMs) {
    throw new Error(
      `Reservation TTL (${ttlMs}ms) must exceed the executor hard timeout ` +
        `(${execHardTimeoutMs}ms); otherwise the reconciler releases executions ` +
        "that are still running and refunds work the customer is about to receive.",
    );
  }
}

export type ReservationState =
  | "reserved"
  | "executing"
  | "captured"
  | "released";

/** Non-terminal states — the reconciler's search space. */
const OPEN_STATES: ReservationState[] = ["reserved", "executing"];

export interface Reservation {
  id: string;
  walletId: string;
  amountCents: number;
  state: ReservationState;
  /**
   * The balance the database settled on, straight from the debit's RETURNING.
   * WP2 introduced that value specifically so callers would stop doing
   * arithmetic on a snapshot; discarding it here would have quietly restored
   * the habit, with correctness resting on a lock held in another module.
   */
  balanceAfter: number;
}

export class ReservationNotOpenError extends Error {
  constructor(
    public readonly reservationId: string,
    public readonly attempted: string,
  ) {
    super(
      `Reservation ${reservationId} is not open; ${attempted} did not apply`,
    );
    this.name = "ReservationNotOpenError";
  }
}

/**
 * Debit the wallet and record that the debit is provisional.
 *
 * Must run inside the caller's transaction, alongside the transaction-row
 * insert. If the reservation were written separately, a crash between the two
 * would leave exactly the untracked debit this exists to prevent.
 *
 * Affordability is enforced by the wallet service's conditional UPDATE, so an
 * unaffordable reserve throws rather than opening a hold it cannot fund.
 */
export async function reserve(
  tx: WalletTx,
  params: {
    wallet: walletService.LockedWallet;
    userId: string;
    amountCents: number;
    transactionId: string;
    description: string;
    ttlMs?: number;
  },
): Promise<Reservation> {
  const { wallet, userId, amountCents, transactionId, description } = params;

  const balanceAfter = await walletService.debit(tx, {
    wallet,
    amountCents,
    referenceId: transactionId,
    description,
  });

  const deadlineAt = new Date(
    Date.now() + (params.ttlMs ?? DEFAULT_RESERVATION_TTL_MS),
  );

  const [row] = await tx
    .insert(walletReservations)
    .values({
      walletId: wallet.id,
      userId,
      amountCents,
      state: "reserved",
      transactionId,
      deadlineAt,
    })
    .returning({ id: walletReservations.id });

  return {
    id: row.id,
    walletId: wallet.id,
    amountCents,
    state: "reserved",
    balanceAfter,
  };
}

/**
 * Mark that execution has begun.
 *
 * Distinguishes "we took the money and never started" from "we took the money
 * and the work was in flight", which is the difference between a bug and a
 * crash when reading the table afterwards. Advisory only: the reconciler
 * releases both, and a caller that skips this is not penalised.
 */
export async function markExecuting(
  tx: WalletTx,
  reservationId: string,
): Promise<void> {
  await tx
    .update(walletReservations)
    .set({ state: "executing", updatedAt: new Date() })
    .where(
      and(
        eq(walletReservations.id, reservationId),
        eq(walletReservations.state, "reserved"),
      ),
    );
}

/**
 * Settle the debit. The money already moved at reserve time, so this only
 * closes the record.
 *
 * Returns false when no open reservation matched — a duplicate capture, or one
 * the reconciler already released. Callers should not treat that as an error:
 * it means someone else reached a terminal state first, which is precisely the
 * outcome the conditional transition exists to guarantee.
 */
export async function capture(
  tx: WalletTx,
  params: { reservationId: string; reason?: string },
): Promise<boolean> {
  const rows = await tx
    .update(walletReservations)
    .set({
      state: "captured",
      terminalReason: params.reason ?? "execution succeeded",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(walletReservations.id, params.reservationId),
        inArray(walletReservations.state, OPEN_STATES),
      ),
    )
    .returning({ id: walletReservations.id });

  return rows.length > 0;
}

/**
 * Return the money and close the record.
 *
 * The refund and the state change are one conditional statement pair inside the
 * caller's transaction: the row is claimed first, and only a caller that
 * actually claimed it issues the credit. Two concurrent releases therefore
 * refund once, which is the invariant that keeps the reconciler safe to run
 * against a live system.
 */
export async function release(
  tx: WalletTx,
  params: { reservationId: string; reason: string },
): Promise<boolean> {
  const [claimed] = await tx
    .update(walletReservations)
    .set({
      state: "released",
      terminalReason: params.reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(walletReservations.id, params.reservationId),
        inArray(walletReservations.state, OPEN_STATES),
      ),
    )
    .returning({
      id: walletReservations.id,
      walletId: walletReservations.walletId,
      amountCents: walletReservations.amountCents,
      transactionId: walletReservations.transactionId,
    });

  // Someone else reached a terminal state first. Nothing to refund.
  if (!claimed) return false;

  await walletService.refund(tx, {
    walletId: claimed.walletId,
    amountCents: claimed.amountCents,
    referenceId: claimed.transactionId,
    description: `Reservation released: ${params.reason}`,
  });

  return true;
}

export interface AbandonedReservation {
  id: string;
  transactionId: string | null;
  amountCents: number;
  userId: string;
}

/**
 * Reservations a crash left behind: non-terminal and past their deadline.
 *
 * Ordered oldest-first and bounded, so a large backlog drains over successive
 * ticks rather than in one burst. That bound is deliberate — the 2026-05-04
 * Postgres incident came from a long-silent bulk job resuming all at once
 * (DEC-20260504-B), and this job's first real run has 11 waiting for it.
 */
export async function findAbandoned(
  tx: WalletTx,
  limit = 100,
): Promise<AbandonedReservation[]> {
  return tx
    .select({
      id: walletReservations.id,
      transactionId: walletReservations.transactionId,
      amountCents: walletReservations.amountCents,
      userId: walletReservations.userId,
    })
    .from(walletReservations)
    .where(
      and(
        inArray(walletReservations.state, OPEN_STATES),
        lt(walletReservations.deadlineAt, sql`now()`),
      ),
    )
    .orderBy(walletReservations.deadlineAt)
    .limit(limit);
}
