/**
 * Hard-process-kill recovery for the async /v1/do path (WP1, risk N1).
 *
 * The async path debits the wallet FIRST, commits, answers 202, and then runs
 * the capability in an in-memory promise. A refund only happens in that
 * promise's catch block. So if the process dies between the commit and the
 * catch — OOM, SIGKILL, a Railway container replacement — the refund never
 * fires and the charge is stranded.
 *
 * `lib/shutdown.ts` documents this, and says the 30-minute integrity-hash
 * janitor flips such rows to `failed`. It does not: that job only ever writes
 * `compliance_hash_state`, never `transactions.status`. Nothing in the
 * codebase transitions a stale `executing` row, and nothing refunds it.
 * Production currently holds 11 such rows, the oldest from 2026-04-07.
 *
 * These tests kill a real child process running the real route, then assert
 * what survives.
 *
 * WP3 UPDATE — the two expectations that pinned the bug have now inverted,
 * which is exactly the signal the WP1 versions were written to produce. The
 * crash still strands the charge in the moment (nothing can prevent that; the
 * debit is committed and the process is gone). What changed is that the
 * reservation written in the same transaction outlives the process, so the
 * reconciler finds it and gives the money back. The tests below drive that
 * reconciler explicitly rather than waiting on its interval.
 *
 * Why a child process: SIGKILL cannot be delivered to the vitest worker
 * without taking the run down with it. The child drives production code end to
 * end (real auth, real route, real transaction) so nothing about billing is
 * duplicated in test-land.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import {
  users,
  wallets,
  walletTransactions,
  walletReservations,
  capabilities,
  transactions,
} from "../db/schema.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const CHILD = fileURLToPath(
  new URL("../test-support/crash-child.ts", import.meta.url),
);

const STARTING_BALANCE = 5_000;
const PRICE_CENTS = 250;

describeMaybe("async /v1/do — surviving a hard process kill", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  let userId: string;
  let walletId: string;
  let capabilityId: string;
  let slug: string;
  let apiKey: string;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    await db
      .delete(walletReservations)
      .where(eq(walletReservations.userId, userId));
    await db.delete(transactions).where(eq(transactions.userId, userId));
    await db
      .delete(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId));
    await db.delete(wallets).where(eq(wallets.id, walletId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(capabilities).where(eq(capabilities.id, capabilityId));
  });

  /**
   * Seed a paid capability whose declared latency pushes /v1/do onto the async
   * path (ASYNC_THRESHOLD_MS is 10s), plus a funded user to call it.
   */
  async function seed() {
    userId = randomUUID();
    walletId = randomUUID();
    capabilityId = randomUUID();
    slug = `wp1-crash-${randomUUID().slice(0, 8)}`;
    apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;

    await db.insert(users).values({
      id: userId,
      email: `wp1-crash-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });
    await db.insert(wallets).values({
      id: walletId,
      userId,
      balanceCents: STARTING_BALANCE,
    });
    await db.insert(capabilities).values({
      id: capabilityId,
      slug,
      name: "WP1 crash probe",
      description: "Seeded by the WP1 crash-recovery test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      priceCents: PRICE_CENTS,
      isActive: true,
      isFreeTier: false,
      // Above ASYNC_THRESHOLD_MS, so /v1/do takes the debit-first async path.
      avgLatencyMs: 20_000,
      lifecycleState: "active",
    });
  }

  /** Run the child until it reports the debit, then wait for the kill. */
  async function runChildUntilKilled(): Promise<void> {
    return new Promise((resolve, reject) => {
      // node --import tsx rather than the npx shim: Node refuses to spawn a
      // .cmd without a shell on Windows (EINVAL), and this form behaves the
      // same on the Linux CI runner.
      const child = spawn(
        process.execPath,
        ["--import", "tsx", CHILD],
        {
          env: {
            ...process.env,
            CRASH_TEST_DATABASE_URL: DATABASE_URL_TEST!,
            CRASH_TEST_API_KEY: apiKey,
            CRASH_TEST_SLUG: slug,
          },
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        },
      );

      let sawDebit = false;
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("CHILD_DEBITED")) sawDebit = true;
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("exit", () => {
        if (!sawDebit) {
          reject(
            new Error(
              `crash child never reached the debit window.\n${stderr.slice(0, 2000)}`,
            ),
          );
          return;
        }
        resolve();
      });

      child.on("error", reject);
    });
  }

  async function balanceOf(id: string): Promise<number> {
    const [row] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, id))
      .limit(1);
    return row!.balanceCents;
  }

  /**
   * Age the reservation past its deadline instead of waiting fifteen real
   * minutes. The reconciler's own predicate is what is under test, so moving
   * the clock on the row is the honest way to reach it.
   */
  async function expireReservations(): Promise<void> {
    await db
      .update(walletReservations)
      .set({ deadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(walletReservations.userId, userId));
  }

  async function runReconciler() {
    const { runReservationReconcilerOnce } = await import(
      "../jobs/reservation-reconciler.js"
    );
    return runReservationReconcilerOnce();
  }

  it("leaves the customer debited with the execution unfinished", async () => {
    await seed();
    await runChildUntilKilled();

    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    // The debit committed before the kill, so it survives it. This is the
    // durability half of the story and is correct on its own.
    expect(wallet!.balanceCents).toBe(STARTING_BALANCE - PRICE_CENTS);

    const purchases = await db
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, walletId),
          eq(walletTransactions.type, "purchase"),
        ),
      );
    expect(purchases).toHaveLength(1);
    expect(purchases[0]!.amountCents).toBe(-PRICE_CENTS);
  }, 180_000);

  it("leaves an open reservation the reconciler can find", async () => {
    await seed();
    await runChildUntilKilled();

    // The durable half of the fix. Before WP3 the only record of the charge
    // being provisional lived in a promise that died with the process.
    const open = await db
      .select({
        id: walletReservations.id,
        state: walletReservations.state,
        amountCents: walletReservations.amountCents,
      })
      .from(walletReservations)
      .where(eq(walletReservations.userId, userId));

    expect(open).toHaveLength(1);
    expect(["reserved", "executing"]).toContain(open[0]!.state);
    expect(open[0]!.amountCents).toBe(PRICE_CENTS);
  }, 180_000);

  it("refunds the stranded charge once the reconciler runs", async () => {
    await seed();
    await runChildUntilKilled();

    // Immediately after the crash the customer is still out of pocket.
    expect(await balanceOf(walletId)).toBe(STARTING_BALANCE - PRICE_CENTS);

    await expireReservations();
    const summary = await runReconciler();
    expect(summary.released).toBe(1);

    // The money is back, and the ledger explains why.
    expect(await balanceOf(walletId)).toBe(STARTING_BALANCE);
    const refunds = await db
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, walletId),
          eq(walletTransactions.type, "refund"),
        ),
      );
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amountCents).toBe(PRICE_CENTS);
  }, 180_000);

  it("is idempotent — a second reconciler pass refunds nothing further", async () => {
    // The reconciler runs every minute against a live system. A second pass
    // over an already-released reservation must not credit again.
    await seed();
    await runChildUntilKilled();
    await expireReservations();

    expect((await runReconciler()).released).toBe(1);
    const afterFirst = await balanceOf(walletId);

    const second = await runReconciler();
    expect(second.released).toBe(0);
    expect(await balanceOf(walletId)).toBe(afterFirst);
  }, 180_000);

  it("drives the stranded transaction to a terminal state", async () => {
    await seed();
    await runChildUntilKilled();

    const [beforeReconcile] = await db
      .select({ status: transactions.status })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .limit(1);
    expect(beforeReconcile!.status).toBe("executing");

    await expireReservations();
    await runReconciler();

    const [after] = await db
      .select({ status: transactions.status, error: transactions.error })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .limit(1);

    // Both consequences of the old behaviour are closed. A client polling per
    // the 202 contract now reaches a terminal state, and spendCapWouldExceed
    // no longer counts this row toward the hourly cap forever — which used to
    // shrink a capped customer's budget permanently.
    expect(after!.status).toBe("failed");
    expect(after!.error).toContain("refunded automatically");
  }, 180_000);
});
