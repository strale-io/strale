/**
 * The reservation state machine against a real Postgres (WP3, CR-01 / N1).
 *
 * The master plan names four invariants for this package. Three of them are
 * about what happens when two things try to settle the same reservation at
 * once, which no mocked db module can show — the guarantee comes from a
 * conditional UPDATE matching zero rows, and a mock will happily report
 * whatever it was told to.
 *
 *   - one reservation reaches exactly one terminal state
 *   - duplicate capture is idempotent
 *   - duplicate release is idempotent
 *   - a hard crash cannot strand customer funds indefinitely
 *
 * The fourth is covered end-to-end, with a real SIGKILL, in
 * do.crash-recovery.integration.test.ts. This file covers the primitives that
 * one relies on, plus the money invariant they exist to protect: the ledger
 * always sums to the balance.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import {
  users,
  apiKeys,
  wallets,
  walletTransactions,
  walletReservations,
  capabilities,
  transactions,
} from "../db/schema.js";
import * as walletService from "./wallet-service.js";
import * as reservations from "./wallet-reservations.js";
import { keyCapError, keySpending } from "./api-keys.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const STARTING_BALANCE = 1000;
const AMOUNT = 250;

describeMaybe("wallet reservations against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  let userId = "";
  let walletId = "";
  let capabilityId = "";
  let transactionId = "";

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 8 });
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.end();
    const { closeDbPool } = await import("../db/index.js");
    await closeDbPool();
  });

  afterEach(async () => {
    if (userId) {
      await db
        .delete(walletReservations)
        .where(eq(walletReservations.userId, userId));
      await db.delete(transactions).where(eq(transactions.userId, userId));
    }
    if (walletId) {
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
    }
    if (userId) await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
    if (capabilityId)
      await db.delete(capabilities).where(eq(capabilities.id, capabilityId));
    userId = walletId = capabilityId = transactionId = "";
  });

  async function seed() {
    userId = randomUUID();
    capabilityId = randomUUID();

    await db.insert(users).values({
      id: userId,
      email: `wp3-${userId}@example.test`,
      apiKeyHash: `hash-${userId}`,
      keyPrefix: "sk_live_wp3",
    });
    const wallet = await db.transaction((tx) =>
      walletService.openWallet(tx, {
        userId,
        grantCents: STARTING_BALANCE,
        type: "trial_credit",
        description: "WP3 opening grant",
      }),
    );
    walletId = wallet.id;

    await db.insert(capabilities).values({
      id: capabilityId,
      slug: `wp3-${randomUUID().slice(0, 8)}`,
      name: "WP3 reservation probe",
      description: "Seeded by the WP3 reservation test.",
      category: "developer-tools",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      priceCents: AMOUNT,
    });

    const [txn] = await db
      .insert(transactions)
      .values({
        userId,
        capabilityId,
        status: "executing",
        input: {},
        priceCents: AMOUNT,
        transparencyMarker: "algorithmic",
        dataJurisdiction: "EU",
      })
      .returning({ id: transactions.id });
    transactionId = txn!.id;
  }

  async function openReservation(ttlMs?: number) {
    return db.transaction(async (tx) => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      return reservations.reserve(tx, {
        wallet: wallet!,
        userId,
        amountCents: AMOUNT,
        transactionId,
        description: "WP3 reservation",
        ttlMs,
      });
    });
  }

  async function balance(): Promise<number> {
    const [row] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);
    return row!.balanceCents;
  }

  async function ledgerSum(): Promise<number> {
    const rows = await db
      .select({ amountCents: walletTransactions.amountCents })
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId));
    return rows.reduce((sum, r) => sum + r.amountCents, 0);
  }

  async function stateOf(id: string): Promise<string> {
    const [row] = await db
      .select({ state: walletReservations.state })
      .from(walletReservations)
      .where(eq(walletReservations.id, id))
      .limit(1);
    return row!.state;
  }

  it("moves the money and records the hold in one step", async () => {
    await seed();
    const reservation = await openReservation();

    expect(await balance()).toBe(STARTING_BALANCE - AMOUNT);
    expect(await ledgerSum()).toBe(await balance());
    expect(await stateOf(reservation.id)).toBe("reserved");
  });

  it("settles a capture without moving money again", async () => {
    await seed();
    const reservation = await openReservation();

    const captured = await db.transaction((tx) =>
      reservations.capture(tx, { reservationId: reservation.id }),
    );

    expect(captured).toBe(true);
    expect(await stateOf(reservation.id)).toBe("captured");
    // The debit happened at reserve time; capture only closes the record.
    expect(await balance()).toBe(STARTING_BALANCE - AMOUNT);
    expect(await ledgerSum()).toBe(await balance());
  });

  it("is idempotent under duplicate capture", async () => {
    await seed();
    const reservation = await openReservation();

    expect(
      await db.transaction((tx) =>
        reservations.capture(tx, { reservationId: reservation.id }),
      ),
    ).toBe(true);
    // The second caller matches no open row and is told so, rather than
    // silently succeeding and inviting a second money movement.
    expect(
      await db.transaction((tx) =>
        reservations.capture(tx, { reservationId: reservation.id }),
      ),
    ).toBe(false);

    expect(await balance()).toBe(STARTING_BALANCE - AMOUNT);
    expect(await ledgerSum()).toBe(await balance());
  });

  it("is idempotent under duplicate release", async () => {
    await seed();
    const reservation = await openReservation();

    expect(
      await db.transaction((tx) =>
        reservations.release(tx, {
          reservationId: reservation.id,
          reason: "first",
        }),
      ),
    ).toBe(true);
    expect(
      await db.transaction((tx) =>
        reservations.release(tx, {
          reservationId: reservation.id,
          reason: "second",
        }),
      ),
    ).toBe(false);

    // Refunded exactly once. A second credit here is the double-refund the
    // conditional transition exists to prevent.
    expect(await balance()).toBe(STARTING_BALANCE);
    expect(await ledgerSum()).toBe(await balance());
    const refunds = await db
      .select()
      .from(walletTransactions)
      .where(and(eq(walletTransactions.walletId, walletId), eq(walletTransactions.type, "refund")));
    expect(refunds).toHaveLength(1);
  });

  it("reaches exactly one terminal state when capture and release race", async () => {
    // The reconciler running against a live system that is finishing at the
    // same moment. Whoever claims the row wins; the loser must be a no-op.
    await seed();
    const reservation = await openReservation();

    const [captured, released] = await Promise.all([
      db.transaction((tx) =>
        reservations.capture(tx, { reservationId: reservation.id }),
      ),
      db.transaction((tx) =>
        reservations.release(tx, {
          reservationId: reservation.id,
          reason: "reconciler",
        }),
      ),
    ]);

    // Exactly one of them applied.
    expect([captured, released].filter(Boolean)).toHaveLength(1);

    const finalState = await stateOf(reservation.id);
    expect(["captured", "released"]).toContain(finalState);

    // And the money agrees with whichever won.
    const expected = released ? STARTING_BALANCE : STARTING_BALANCE - AMOUNT;
    expect(await balance()).toBe(expected);
    expect(await ledgerSum()).toBe(await balance());
  });

  it("finds only reservations past their deadline", async () => {
    await seed();
    // Long TTL: still plausibly in flight, so it must be left alone. Releasing
    // a running execution refunds a customer about to get their result.
    const fresh = await openReservation(10 * 60_000);

    expect(await reservations.findAbandoned(db)).toHaveLength(0);

    // Back-dated with the DATABASE clock, because `findAbandoned` compares
    // `deadline_at < now()` in SQL. Writing `new Date(Date.now() - 1000)` here
    // straddles two clocks that are not the same clock — the database runs in
    // its own container — so when the app clock leads by more than a second
    // the row is still in the future to `now()` and the query finds nothing.
    // This flaked in the full lane and passed in isolation, which is what a
    // clock-skew flake looks like. Found while fixing the identical defect in
    // WP11's recovery-token expiry.
    await db.execute(
      sql`UPDATE wallet_reservations
             SET deadline_at = now() - interval '1 second'
           WHERE id = ${fresh.id}::uuid`,
    );

    const abandoned = await reservations.findAbandoned(db);
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]!.id).toBe(fresh.id);
  });

  it("stops looking once a reservation is terminal", async () => {
    await seed();
    const reservation = await openReservation();
    await db
      .update(walletReservations)
      .set({ deadlineAt: new Date(Date.now() - 1000) })
      .where(eq(walletReservations.id, reservation.id));

    await db.transaction((tx) =>
      reservations.capture(tx, { reservationId: reservation.id }),
    );

    // Past its deadline but settled — the reconciler must not revisit it.
    expect(await reservations.findAbandoned(db)).toHaveLength(0);
  });

  it("refuses to reserve more than the wallet holds", async () => {
    await seed();
    await expect(
      db.transaction(async (tx) => {
        const wallet = await walletService.lockWalletForUser(tx, userId);
        return reservations.reserve(tx, {
          wallet: wallet!,
          userId,
          amountCents: STARTING_BALANCE + 1,
          transactionId,
          description: "overdraw",
        });
      }),
    ).rejects.toThrow(walletService.InsufficientFundsError);

    // No hold opened, no money moved.
    expect(await balance()).toBe(STARTING_BALANCE);
    expect(
      await db
        .select()
        .from(walletReservations)
        .where(eq(walletReservations.userId, userId)),
    ).toHaveLength(0);
  });

  it("refuses a second reservation against the same execution", async () => {
    // Without the unique index a retry could open a second hold on one
    // transaction, and the reconciler would release both — refunding twice.
    await seed();
    await openReservation();
    await expect(openReservation()).rejects.toThrow();
  });
  it("H4 sync holds leave balance and ledger unchanged until capture and protect funds from another debit", async () => {
    await seed();
    const hold = await db.transaction(async tx => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      return reservations.reserve(tx, { wallet: wallet!, userId, amountCents: STARTING_BALANCE,
        transactionId, description: "sync hold", mode: "hold" });
    });
    expect(await balance()).toBe(STARTING_BALANCE);
    expect(await db.select().from(walletTransactions).where(and(eq(walletTransactions.walletId, walletId), eq(walletTransactions.type, "purchase")))).toHaveLength(0);
    await expect(db.transaction(async tx => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      expect(wallet!.balanceCents).toBe(0);
      await walletService.debit(tx, { wallet: wallet!, amountCents: 1, description: "competing call" });
    })).rejects.toThrow(walletService.InsufficientFundsError);
    await db.transaction(async tx => {
      await walletService.lockWalletForUser(tx, userId);
      expect(await reservations.capture(tx, { reservationId: hold.id })).toBe(true);
    });
    expect(await balance()).toBe(0);
    expect(await db.transaction(tx => reservations.capture(tx, { reservationId: hold.id }))).toBe(false);
    expect(await db.transaction(tx => reservations.release(tx, { reservationId: hold.id, reason: "duplicate" }))).toBe(false);
  });
  it.each(["hourly", "total"] as const)("H4 open sync holds enforce the additional-key %s cap without double-counting capture", async kind => {
    await seed();
    const apiKeyId = randomUUID();
    await db.insert(apiKeys).values({ id: apiKeyId, userId, label: "H4 test", apiKeyHash: `hash-${apiKeyId}`,
      keyPrefix: "sk_live_h4", maxSpendPerHourCents: kind === "hourly" ? AMOUNT : null,
      maxSpendTotalCents: kind === "total" ? AMOUNT : null });
    const hold = await db.transaction(async tx => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      return reservations.reserve(tx, { wallet: wallet!, userId, amountCents: AMOUNT,
        transactionId, apiKeyId, description: "key cap hold", mode: "hold" });
    });
    expect(await balance()).toBe(STARTING_BALANCE);
    expect(await db.select().from(walletTransactions).where(and(
      eq(walletTransactions.walletId, walletId), eq(walletTransactions.type, "purchase"),
    ))).toHaveLength(0);
    await db.transaction(async tx => {
      await walletService.lockWalletForUser(tx, userId);
      expect(await keyCapError(tx, userId, apiKeyId, 1)).toMatchObject({
        error_code: kind === "hourly" ? "key_hourly_cap_exceeded" : "key_total_cap_exceeded",
        details: { spent_cents: AMOUNT },
      });
      expect(await reservations.capture(tx, { reservationId: hold.id })).toBe(true);
    });
    const [spending] = await keySpending(db, userId, apiKeyId);
    expect(spending).toMatchObject({ spent_hour_cents: AMOUNT, spent_total_cents: AMOUNT });
  });
  it("H4 releasing a stale sync hold never refunds money that was not debited", async () => {
    await seed();
    const hold = await db.transaction(async tx => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      return reservations.reserve(tx, { wallet: wallet!, userId, amountCents: AMOUNT,
        transactionId, description: "crashed sync hold", mode: "hold", ttlMs: -1 });
    });
    expect((await reservations.findAbandoned(db)).map(r => r.id)).toContain(hold.id);
    expect(await db.transaction(tx => reservations.release(tx, { reservationId: hold.id, reason: "crash" }))).toBe(true);
    expect(await balance()).toBe(STARTING_BALANCE);
    expect(await db.select().from(walletTransactions).where(and(eq(walletTransactions.walletId, walletId), eq(walletTransactions.type, "refund")))).toHaveLength(0);
  });

  it.each(["hold", "debit"] as const)("Round 2 reconciler selects %s mode and reports its actual financial effect", async mode => {
    await seed();
    const reservation = await db.transaction(async tx => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      return reservations.reserve(tx, { wallet: wallet!, userId, amountCents: AMOUNT,
        transactionId, description: "recovery wording", mode, ttlMs: -1 });
    });
    expect((await reservations.findAbandoned(db)).find(r => r.id === reservation.id)?.mode).toBe(mode);
    const { runReservationReconcilerOnce } = await import("../jobs/reservation-reconciler.js");
    expect((await runReservationReconcilerOnce()).released).toBe(1);
    const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    expect(row!.error).toContain(mode === "hold" ? "released automatically" : "refunded automatically");
    expect(await balance()).toBe(STARTING_BALANCE);
    const refunds = await db.select().from(walletTransactions).where(and(
      eq(walletTransactions.walletId, walletId), eq(walletTransactions.type, "refund"),
    ));
    expect(refunds).toHaveLength(mode === "hold" ? 0 : 1);
  });

});
