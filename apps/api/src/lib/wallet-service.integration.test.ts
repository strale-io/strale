/**
 * The wallet authority against a real Postgres (WP2, risk CR-01).
 *
 * Two behaviours here were broken before this package and are the reason it
 * exists. Both are asserted against real rows, because both are about what the
 * database ends up holding, which a mocked db module cannot show:
 *
 *   1. The solutions refund wrote an ABSOLUTE balance captured before the
 *      solution ran. Execution takes seconds to minutes, so any debit or
 *      top-up landing in that window was silently overwritten.
 *   2. Account closure zeroed the balance with no ledger entry, so the ledger
 *      stopped summing to the balance for that wallet permanently.
 *
 * The invariant tying them together, and the one this module exists to make
 * unbreakable: **the ledger always sums to the balance.** Each test below
 * asserts that directly rather than checking an intermediate step.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { users, wallets, walletTransactions } from "../db/schema.js";
import * as walletService from "./wallet-service.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("wallet service against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  let userId = "";
  let walletId = "";

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    // Not every test seeds — the transaction-requirement test asserts a
    // refusal before anything is created — so clean up only what exists.
    if (walletId) {
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
    }
    if (userId) await db.delete(users).where(eq(users.id, userId));
    walletId = "";
    userId = "";
  });

  async function seed(startingBalance: number) {
    userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `wp2-${userId}@example.test`,
      apiKeyHash: `hash-${userId}`,
      keyPrefix: "sk_live_wp2",
    });
    // openWallet requires a transaction: opening and granting are two
    // statements, and outside one they are two commits.
    const wallet = await db.transaction((tx) =>
      walletService.openWallet(tx, {
        userId,
        grantCents: startingBalance,
        type: "trial_credit",
        description: "WP2 test opening grant",
      }),
    );
    walletId = wallet.id;
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

  /** The invariant, asserted the same way everywhere. */
  async function expectLedgerReconciled() {
    expect(await ledgerSum()).toBe(await balance());
  }

  it("refuses to open a wallet outside a transaction", async () => {
    // The two writes are not atomic without one, so a crash between them
    // leaves a wallet that exists but never received its grant. Codex found
    // this: signup was passing the bare db handle.
    await expect(
      walletService.openWallet(db, {
        userId: randomUUID(),
        grantCents: 100,
        type: "trial_credit",
        description: "should refuse",
      }),
    ).rejects.toThrow(/must run inside a transaction/);
  });

  it("opens a wallet whose ledger already explains its balance", async () => {
    await seed(200);
    expect(await balance()).toBe(200);
    await expectLedgerReconciled();
  });

  it("keeps the ledger reconciled across a debit and a refund", async () => {
    await seed(1000);

    await db.transaction(async (tx) => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      await walletService.debit(tx, {
        wallet: wallet!,
        amountCents: 250,
        description: "WP2 test debit",
      });
    });
    expect(await balance()).toBe(750);
    await expectLedgerReconciled();

    await db.transaction(async (tx) => {
      await walletService.refund(tx, {
        walletId,
        amountCents: 250,
        description: "WP2 test refund",
      });
    });
    expect(await balance()).toBe(1000);
    await expectLedgerReconciled();
  });

  it("refunds without clobbering a concurrent balance change", async () => {
    // The solutions-refund bug, reproduced exactly. Before WP2 the refund
    // wrote back a balance read BEFORE execution, so the top-up below — which
    // lands while the solution is still running — was erased. Now the refund
    // is an in-database delta, so both survive.
    await seed(1000);

    // Balance as the caller saw it when the solution started.
    const balanceBeforeExecution = await balance();
    expect(balanceBeforeExecution).toBe(1000);

    // The solution charges.
    await db.transaction(async (tx) => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      await walletService.debit(tx, {
        wallet: wallet!,
        amountCents: 250,
        description: "Solution: wp2-test",
      });
    });

    // While it executes, an unrelated top-up arrives.
    await db.transaction(async (tx) => {
      await walletService.credit(tx, {
        walletId,
        amountCents: 5000,
        type: "top_up",
        description: "Concurrent top-up during execution",
      });
    });

    // The solution fails and refunds.
    await db.transaction(async (tx) => {
      await walletService.refund(tx, {
        walletId,
        amountCents: 250,
        description: "Refund: wp2-test (all steps failed)",
      });
    });

    // 1000 - 250 + 5000 + 250. The old absolute write would have produced
    // 1000 here, silently destroying the customer's 5000-cent top-up.
    expect(await balance()).toBe(6000);
    await expectLedgerReconciled();
  });

  it("records a ledger entry when a closing account forfeits its balance", async () => {
    // Closure is not a refund — the money is not returned, which is a
    // documented product decision. It is still a balance change, and before
    // WP2 it was the only one on the platform with no audit trail.
    await seed(1234);

    const forfeited = await db.transaction((tx) =>
      walletService.forfeitOnClosure(tx, {
        userId,
        description: "Balance forfeited on account closure",
      }),
    );

    expect(forfeited).toBe(1234);
    expect(await balance()).toBe(0);
    await expectLedgerReconciled();

    const [entry] = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.type, "closure_forfeit"));
    expect(entry).toBeTruthy();
    expect(entry!.amountCents).toBe(-1234);
  });

  it("forfeits nothing, and records nothing, for an empty wallet", async () => {
    await seed(0);
    const forfeited = await db.transaction((tx) =>
      walletService.forfeitOnClosure(tx, { userId, description: "closure" }),
    );
    expect(forfeited).toBe(0);
    const entries = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId));
    expect(entries).toHaveLength(0);
  });

  it("refuses to overdraw", async () => {
    await seed(100);
    await expect(
      db.transaction(async (tx) => {
        const wallet = await walletService.lockWalletForUser(tx, userId);
        await walletService.debit(tx, {
          wallet: wallet!,
          amountCents: 101,
          description: "overdraw attempt",
        });
      }),
    ).rejects.toThrow(walletService.InsufficientFundsError);

    expect(await balance()).toBe(100);
    await expectLedgerReconciled();
  });

  it("refuses non-positive amounts rather than inverting a movement", async () => {
    // A negative credit would be a debit with no affordability check, and a
    // negative debit would be a silent credit. Both are rejected outright.
    await seed(100);
    await expect(
      db.transaction((tx) =>
        walletService.credit(tx, {
          walletId,
          amountCents: -50,
          type: "top_up",
          description: "negative credit",
        }),
      ),
    ).rejects.toThrow();
    expect(await balance()).toBe(100);
  });
});
