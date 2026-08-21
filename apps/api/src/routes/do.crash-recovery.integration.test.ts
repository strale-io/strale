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
 * what survives. They describe CURRENT behaviour deliberately: the customer
 * stays debited and the row stays non-terminal. WP3 introduces the reservation
 * state machine and reconciler, at which point the final two expectations
 * invert — that is the signal WP3 has actually worked, so they are written to
 * fail loudly rather than quietly pass.
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

  it("PINS BUG: the charge is never refunded after the crash", async () => {
    await seed();
    await runChildUntilKilled();

    // The refund lives in the catch block of an in-memory promise that died
    // with the process. Nothing else refunds it. WP3 must make this fail.
    const refunds = await db
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, walletId),
          eq(walletTransactions.type, "refund"),
        ),
      );
    expect(refunds).toHaveLength(0);
  }, 180_000);

  it("PINS BUG: the transaction is stranded in a non-terminal state", async () => {
    await seed();
    await runChildUntilKilled();

    const [txn] = await db
      .select({ status: transactions.status })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .limit(1);

    // Two consequences, both customer-visible. A client polling this
    // transaction per the 202 contract never reaches a terminal state, and
    // spendCapWouldExceed counts `executing` rows toward the hourly cap
    // forever, so a capped customer's budget shrinks permanently.
    expect(txn).toBeDefined();
    expect(txn!.status).toBe("executing");
  }, 180_000);
});
