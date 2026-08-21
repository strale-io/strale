/**
 * Concurrent wallet debits cannot overspend (WP1, DEC-8).
 *
 * DEC-8 mandates `SELECT ... FOR UPDATE` row-level locking on wallet debits.
 * That claim is unfalsifiable against a mocked db module: a mock can be made
 * to return whatever the test wants, and it has no notion of a row lock. The
 * existing unit test asserts only that `.for("update")` appears in the query
 * builder chain, which is a shape assertion, not a behaviour one — it would
 * still pass if Postgres ignored the lock entirely.
 *
 * This drives the real sync `/v1/do` path concurrently against a wallet funded
 * for exactly one call, and asserts the business invariant the lock exists to
 * protect: the customer is charged once, the balance never goes negative, and
 * the ledger agrees with the balance.
 *
 * Discrimination was verified by removing `.for("update")` from the debit
 * transaction in do.ts, at which point concurrent requests both read the same
 * pre-debit balance and the wallet is driven negative.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import {
  users,
  wallets,
  walletTransactions,
  capabilities,
  transactions,
} from "../db/schema.js";


// Environment is set only when the lane is actually going to run. These
// module-level assignments execute even when the suite skips, so applying them
// unconditionally leaked configuration into every other suite in a full-suite
// run and made an unrelated admin-auth test fail intermittently.
if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "wp1-concurrency-secret-at-least-32-chars-long";
  process.env.ADMIN_SECRET ??= "wp1-concurrency-admin-secret-at-least-32-chars";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_wp1_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_wp1_placeholder";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const PRICE_CENTS = 250;
/** Funds exactly one call. Any second successful debit is an overspend. */
const STARTING_BALANCE = PRICE_CENTS;
const CONCURRENT_CALLS = 6;

describeMaybe("concurrent /v1/do debits — no overspend", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  let userId: string;
  let walletId: string;
  let capabilityId: string;
  let slug: string;
  let apiKey: string;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 10 });
    db = drizzle(client);

    const { registerCapability } = await import("../capabilities/index.js");
    slug = `wp1-conc-${randomUUID().slice(0, 8)}`;
    // Resolves immediately: the point under test is the wallet transaction,
    // not the executor. A slow executor would only widen the window.
    registerCapability(slug, async () => ({
      output: { ok: true },
      provenance: { source: "wp1-test", fetched_at: new Date().toISOString() },
    }));

    ({ app } = await import("../app.js"));
  }, 120_000);

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

  async function seed() {
    userId = randomUUID();
    walletId = randomUUID();
    capabilityId = randomUUID();
    apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;

    await db.insert(users).values({
      id: userId,
      email: `wp1-conc-${userId}@example.test`,
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
      name: "WP1 concurrency probe",
      description: "Seeded by the WP1 wallet-concurrency test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      priceCents: PRICE_CENTS,
      isActive: true,
      isFreeTier: false,
      // Below ASYNC_THRESHOLD_MS, so this takes the synchronous debit path.
      avgLatencyMs: 50,
      lifecycleState: "active",
    });
  }

  function callDo() {
    return app.request("http://localhost/v1/do", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // A shared idempotency key would collapse these into one replay, which
        // would hide the very race being tested. Each call is distinct.
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        capability_slug: slug,
        inputs: { probe: "wp1" },
        max_price_cents: PRICE_CENTS,
      }),
    });
  }

  it("charges exactly once when calls race for the last of the balance", async () => {
    await seed();

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () => callDo()),
    );
    const statuses = responses.map((r) => r.status);

    // Exactly one call may succeed — the wallet funds one.
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);

    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    // The invariant that actually matters. Without the row lock every racing
    // request reads the same pre-debit balance and they all debit.
    expect(wallet!.balanceCents).toBe(0);
    expect(wallet!.balanceCents).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it("keeps the ledger reconciled with the balance under contention", async () => {
    await seed();

    await Promise.all(Array.from({ length: CONCURRENT_CALLS }, () => callDo()));

    const purchases = await db
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, walletId),
          eq(walletTransactions.type, "purchase"),
        ),
      );

    // One debit, one ledger row, and the two agree. A lost update would show
    // up here as a ledger that does not sum to the balance — the same
    // divergence the solutions refund produces (CR-01).
    expect(purchases).toHaveLength(1);

    const ledgerSum = purchases.reduce((sum, row) => sum + row.amountCents, 0);
    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    expect(STARTING_BALANCE + ledgerSum).toBe(wallet!.balanceCents);
  }, 120_000);

  it("refuses the call outright once the balance is spent", async () => {
    await seed();

    expect((await callDo()).status).toBe(200);

    // Sequential follow-up: no race, simply no money. Distinguishes "the lock
    // held" from "the balance check works at all".
    const second = await callDo();
    expect(second.status).toBe(402);

    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);
    expect(wallet!.balanceCents).toBe(0);
  }, 120_000);
});
