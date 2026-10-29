/**
 * POST /v1/do/batch against real Postgres: reserve once, run outside the
 * transaction, capture only items that succeeded (DEC-14).
 *
 * Every money assertion here is on rows, not on the response: the wallet
 * balance, the ledger, the holds and the transactions must agree with each
 * other and with what the customer was told. A mocked db cannot show any of
 * that, which is why the H4 model was proved on this lane and the batch is too.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import {
  batchOrders,
  capabilities,
  transactions,
  users,
  walletReservations,
  wallets,
  walletTransactions,
} from "../db/schema.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "batch-int-secret-at-least-32-chars-long-0000";
  process.env.ADMIN_SECRET ??= "batch-int-admin-secret-at-least-32-chars-000";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_batch_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_batch_placeholder";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const PRICE = 25;

describeMaybe("POST /v1/do/batch — reserve once, capture per succeeded item", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];
  let slug: string;
  let capabilityId: string;
  /** Items with probe "slow" wait here until a test lets them go. */
  let releaseSlow: () => void = () => {};
  let slowGate: Promise<void> = Promise.resolve();
  const seeded: Array<{ userId: string; walletId: string }> = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 10 });
    db = drizzle(client);
    const { registerCapability } = await import("../capabilities/index.js");
    slug = `batch-int-${randomUUID().slice(0, 8)}`;
    registerCapability(slug, async (input: Record<string, unknown>) => {
      if (input.probe === "fail") throw new Error("upstream said no");
      if (input.probe === "slow") await slowGate;
      return {
        output: { echoed: input.probe },
        provenance: { source: "batch-int", fetched_at: new Date().toISOString() },
      };
    });
    capabilityId = randomUUID();
    await db.insert(capabilities).values({
      id: capabilityId,
      slug,
      name: "Batch integration probe",
      description: "Seeded by the batch integration test.",
      category: "developer-tools",
      inputSchema: { type: "object", required: ["probe"], properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { echoed: { type: "string" } } },
      priceCents: PRICE,
      isActive: true,
      isFreeTier: false,
      avgLatencyMs: 50,
      lifecycleState: "active",
      visible: true,
    });
    ({ app } = await import("../app.js"));
  }, 120_000);

  afterEach(async () => {
    releaseSlow();
    for (const { userId, walletId } of seeded) {
      await db.delete(batchOrders).where(eq(batchOrders.userId, userId));
      await db.delete(walletReservations).where(eq(walletReservations.userId, userId));
      await db.delete(transactions).where(eq(transactions.userId, userId));
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
      await db.delete(users).where(eq(users.id, userId));
    }
    seeded.length = 0;
  });

  afterAll(async () => {
    await db.delete(transactions).where(eq(transactions.capabilityId, capabilityId));
    await db.delete(capabilities).where(eq(capabilities.id, capabilityId));
    await client.end();
  });

  async function seed(balance: number, maxSpendPerHourCents: number | null = null) {
    const userId = randomUUID();
    const walletId = randomUUID();
    const apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;
    await db.insert(users).values({
      id: userId,
      email: `batch-int-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
      ...(maxSpendPerHourCents !== null ? { maxSpendPerHourCents } : {}),
    });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents: balance });
    seeded.push({ userId, walletId });
    return { userId, walletId, apiKey };
  }

  function batch(apiKey: string, body: Record<string, unknown>, idempotencyKey?: string) {
    return app.request("http://localhost/v1/do/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ capability_slug: slug, ...body }),
    });
  }

  async function balanceOf(walletId: string) {
    const [w] = await db.select({ balanceCents: wallets.balanceCents }).from(wallets).where(eq(wallets.id, walletId));
    return w!.balanceCents;
  }

  async function ledgerOf(walletId: string) {
    return db.select().from(walletTransactions).where(eq(walletTransactions.walletId, walletId));
  }

  it("charges every item once when all succeed, in input order", async () => {
    const { walletId, userId, apiKey } = await seed(1000);
    const res = await batch(apiKey, {
      inputs: [{ probe: "a" }, { probe: "b" }, { probe: "c" }],
      max_total_price_cents: 75,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(body.quoted_total_cents).toBe(75);
    expect(body.charged_cents).toBe(75);
    expect(body.released_cents).toBe(0);
    expect(body.results.map((r: any) => r.output.echoed)).toEqual(["a", "b", "c"]);
    expect(body.results.map((r: any) => r.index)).toEqual([0, 1, 2]);

    expect(await balanceOf(walletId)).toBe(925);
    expect(body.wallet_balance_cents).toBe(925);
    const ledger = await ledgerOf(walletId);
    expect(ledger.map((l) => l.amountCents)).toEqual([-25, -25, -25]);
    expect(1000 + ledger.reduce((s, l) => s + l.amountCents, 0)).toBe(925);

    const holds = await db.select().from(walletReservations).where(eq(walletReservations.userId, userId));
    expect(holds).toHaveLength(3);
    expect(holds.every((h) => h.state === "captured" && h.mode === "hold" && h.transactionId)).toBe(true);
    // Each ledger debit references the item's own transaction.
    const txIds = new Set(body.results.map((r: any) => r.transaction_id));
    expect(new Set(ledger.map((l) => l.referenceId))).toEqual(txIds);
  }, 60_000);

  it("captures only the items that succeeded and releases the rest (DEC-14)", async () => {
    const { walletId, userId, apiKey } = await seed(1000);
    const res = await batch(apiKey, {
      inputs: [{ probe: "a" }, { probe: "fail" }, { probe: "c" }, { probe: "fail" }],
      max_total_price_cents: 100,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("partial");
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(2);
    expect(body.charged_cents).toBe(50);
    expect(body.released_cents).toBe(50);
    expect(body.results.map((r: any) => r.status)).toEqual(["completed", "failed", "completed", "failed"]);
    expect(body.results[1].price_cents).toBe(0);
    expect(body.results[1].error.error_code).toBe("execution_failed");

    // Reserve 100, capture 50, release 50: the balance moves by exactly 50 and
    // the ledger agrees. A hold that is released never touched the ledger, so
    // there is no refund row to find either.
    expect(await balanceOf(walletId)).toBe(950);
    const ledger = await ledgerOf(walletId);
    expect(ledger.filter((l) => l.type === "purchase")).toHaveLength(2);
    expect(ledger.filter((l) => l.type === "refund")).toHaveLength(0);
    expect(1000 + ledger.reduce((s, l) => s + l.amountCents, 0)).toBe(950);

    const holds = await db.select().from(walletReservations).where(eq(walletReservations.userId, userId));
    expect(holds.filter((h) => h.state === "captured")).toHaveLength(2);
    expect(holds.filter((h) => h.state === "released")).toHaveLength(2);
    const failedRows = await db.select().from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "failed")));
    expect(failedRows).toHaveLength(2);
    expect(failedRows.every((t) => t.priceCents === PRICE)).toBe(true);
  }, 60_000);

  it("refuses the whole batch when the wallet cannot fund the quote, reserving nothing", async () => {
    const { walletId, userId, apiKey } = await seed(70);
    const res = await batch(apiKey, { inputs: [{ probe: "a" }, { probe: "b" }, { probe: "c" }], max_total_price_cents: 75 });
    expect(res.status).toBe(402);
    expect((await res.json()).error_code).toBe("insufficient_balance");
    expect(await balanceOf(walletId)).toBe(70);
    expect(await db.select().from(walletReservations).where(eq(walletReservations.userId, userId))).toHaveLength(0);
    expect(await db.select().from(batchOrders).where(eq(batchOrders.userId, userId))).toHaveLength(0);
  }, 60_000);

  it("refuses a quote above max_total_price_cents before reserving", async () => {
    const { userId, apiKey } = await seed(1000);
    const res = await batch(apiKey, { inputs: [{ probe: "a" }, { probe: "b" }], max_total_price_cents: 49 });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error_code).toBe("budget_exceeded");
    expect(body.details.quoted_total_cents).toBe(50);
    expect(await db.select().from(walletReservations).where(eq(walletReservations.userId, userId))).toHaveLength(0);
  }, 60_000);

  it("refuses the whole batch when any item is invalid, naming it by index", async () => {
    const { walletId, apiKey } = await seed(1000);
    const res = await batch(apiKey, { inputs: [{ probe: "a" }, {}, { probe: "c" }], max_total_price_cents: 75 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.invalid_items.map((i: any) => i.index)).toEqual([1]);
    expect(await balanceOf(walletId)).toBe(1000);
  }, 60_000);

  it("counts every item against the hourly spend cap", async () => {
    // Three items at 25 against a cap of 60: one call at a time would get two
    // through, so a batch of three must be refused whole.
    const { walletId, apiKey } = await seed(1000, 60);
    const res = await batch(apiKey, { inputs: [{ probe: "a" }, { probe: "b" }, { probe: "c" }], max_total_price_cents: 75 });
    expect(res.status).toBe(429);
    expect((await res.json()).error_code).toBe("spend_cap_exceeded");
    expect(await balanceOf(walletId)).toBe(1000);
  }, 60_000);

  it("holds the spend cap for items that have not started yet", async () => {
    // Six items, five run at once and wait on the gate; the sixth is held but
    // has no transaction row. Cap 150 = the batch exactly. A single call made
    // now would bring the hour to 175. Counting only transaction rows sees 125
    // and lets it through; counting the unlinked hold refuses it.
    slowGate = new Promise((resolve) => { releaseSlow = resolve; });
    const { walletId, apiKey } = await seed(1000, 150);
    const pending = batch(apiKey, {
      inputs: Array.from({ length: 6 }, () => ({ probe: "slow" })),
      max_total_price_cents: 150,
    });
    // Wait until the five running items have their rows.
    for (let i = 0; i < 100; i++) {
      const rows = await db.select().from(transactions).where(eq(transactions.capabilityId, capabilityId));
      if (rows.filter((r) => r.status === "executing").length >= 5) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const single = await app.request("http://localhost/v1/do", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ capability_slug: slug, inputs: { probe: "x" }, max_price_cents: PRICE }),
    });
    expect(single.status).toBe(429);
    releaseSlow();
    const res = await pending;
    expect((await res.json()).charged_cents).toBe(150);
    expect(await balanceOf(walletId)).toBe(850);
  }, 60_000);

  it("replays a batch for the same Idempotency-Key without charging again", async () => {
    const { walletId, apiKey } = await seed(1000);
    const key = randomUUID();
    const body = { inputs: [{ probe: "a" }, { probe: "fail" }], max_total_price_cents: 50 };
    const first = await (await batch(apiKey, body, key)).json();
    const res = await batch(apiKey, body, key);
    expect(res.status).toBe(200);
    const second = await res.json();
    expect(second.meta.idempotency_replay).toBe(true);
    expect(second.batch_id).toBe(first.batch_id);
    expect(second.charged_cents).toBe(25);
    expect(second.results.map((r: any) => [r.status, r.transaction_id, r.price_cents]))
      .toEqual(first.results.map((r: any) => [r.status, r.transaction_id, r.price_cents]));
    expect(await balanceOf(walletId)).toBe(975);
    expect((await ledgerOf(walletId)).filter((l) => l.type === "purchase")).toHaveLength(1);
  }, 60_000);

  it("refuses the same Idempotency-Key for different inputs", async () => {
    const { walletId, apiKey } = await seed(1000);
    const key = randomUUID();
    expect((await batch(apiKey, { inputs: [{ probe: "a" }], max_total_price_cents: 25 }, key)).status).toBe(200);
    const res = await batch(apiKey, { inputs: [{ probe: "b" }], max_total_price_cents: 25 }, key);
    expect(res.status).toBe(409);
    expect((await res.json()).error_code).toBe("idempotency_key_reused");
    expect(await balanceOf(walletId)).toBe(975);
  }, 60_000);

  it("refuses a key already spent on a single call", async () => {
    const { apiKey } = await seed(1000);
    const key = randomUUID();
    const single = await app.request("http://localhost/v1/do", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": key },
      body: JSON.stringify({ capability_slug: slug, inputs: { probe: "x" }, max_price_cents: PRICE }),
    });
    expect(single.status).toBe(200);
    const res = await batch(apiKey, { inputs: [{ probe: "a" }], max_total_price_cents: 25 }, key);
    expect(res.status).toBe(409);
    expect((await res.json()).error_code).toBe("idempotency_key_reused");
  }, 60_000);

  it("leaves holds the reconciler can release when a crash strands them", async () => {
    // A batch that dies after reserving: its holds are open, unlinked, and past
    // their deadline once time passes. The reconciler must release them
    // without a transaction row to mark, and without moving money.
    const { walletId, userId } = await seed(1000);
    const { reserveBatch } = await import("../lib/do/batch.js");
    const { getDb } = await import("../db/index.js");
    const [cap] = await db.select().from(capabilities).where(eq(capabilities.id, capabilityId));
    const reserved = await reserveBatch({
      db: getDb(), user: { id: userId }, apiKeyId: null, capability: cap as any,
      itemCount: 3, maxTotalPriceCents: 75, idempotencyKey: null, fingerprint: "f".repeat(64),
    });
    expect(reserved.kind).toBe("reserved");
    if (reserved.kind !== "reserved") return;
    await db.update(walletReservations).set({ deadlineAt: new Date(Date.now() - 1000) })
      .where(inArray(walletReservations.id, reserved.reservationIds));

    const { runReservationReconcilerOnce } = await import("../jobs/reservation-reconciler.js");
    const summary = await runReservationReconcilerOnce();
    expect(summary.released).toBeGreaterThanOrEqual(3);
    const holds = await db.select().from(walletReservations).where(inArray(walletReservations.id, reserved.reservationIds));
    expect(holds.every((h) => h.state === "released")).toBe(true);
    expect(await balanceOf(walletId)).toBe(1000);
    expect(await ledgerOf(walletId)).toHaveLength(0);
  }, 60_000);
});
