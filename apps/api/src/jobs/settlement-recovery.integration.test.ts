/**
 * WP5 acceptance signal: an irreversible settlement survives a crash.
 *
 * The defect these pin: `recordX402Transaction` captured an orphaned settlement
 * in a catch block, which handles "the INSERT threw" and cannot handle "the
 * process died" — then the catch never runs either. A SIGKILL between the
 * settlement succeeding and the row committing left the customer's USDC moved
 * and Strale holding no row anywhere.
 *
 * These drive the reconciler against real rows rather than asserting on source
 * text, and they cover the three populations separately, because the whole
 * design is that those three are NOT treated alike.
 *
 * The third case is the one worth reading. An intent interrupted mid-facilitator
 * is genuinely unresolvable from our side: assuming it settled invents revenue,
 * assuming it did not gives the work away. The test asserts the reconciler
 * LEAVES IT ALONE — that refusing to guess is the specified behaviour, not an
 * omission someone should later "fix" by picking a default.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { transactions, x402SettlementIntents } from "../db/schema.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.AUDIT_HMAC_SECRET ??= "wp5-secret-at-least-32-chars-long-000000";
  process.env.ADMIN_SECRET ??= "wp5-admin-secret-at-least-32-chars-00000";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/** Older than INTENT_STALE_AFTER_MS, so the reconciler considers it abandoned. */
const STALE = new Date(Date.now() - 10 * 60 * 1000);

describeMaybe("a crashed x402 settlement is recoverable", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let reconcile: typeof import("./settlement-reconciler.js").reconcileSettlementsOnce;

  const hashes: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
    ({ reconcileSettlementsOnce: reconcile } = await import(
      "./settlement-reconciler.js"
    ));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    for (const h of hashes.splice(0)) {
      const rows = await db
        .select({ settlementId: x402SettlementIntents.settlementId })
        .from(x402SettlementIntents)
        .where(eq(x402SettlementIntents.paymentHash, h));
      for (const r of rows) {
        if (r.settlementId) {
          await db
            .delete(transactions)
            .where(eq(transactions.x402SettlementId, r.settlementId));
        }
      }
      await db
        .delete(x402SettlementIntents)
        .where(eq(x402SettlementIntents.paymentHash, h));
    }
  });

  async function seedIntent(params: {
    state: "settling" | "settled";
    settlementId?: string | null;
  }): Promise<{ paymentHash: string; settlementId: string | null }> {
    const paymentHash = `wp5-${randomUUID().slice(0, 12)}`;
    hashes.push(paymentHash);
    const settlementId = params.settlementId ?? null;

    await db.insert(x402SettlementIntents).values({
      paymentHash,
      slug: "wp5-probe-capability",
      priceCents: 25,
      state: params.state,
      settlementId,
      // Backdated so findAbandonedIntents sees it as stale rather than in-flight.
      updatedAt: STALE,
    });

    return { paymentHash, settlementId };
  }

  it("recovers a settlement whose transaction row was lost to a crash", async () => {
    // THE case. The money moved — we hold a settlement id — and the process
    // died before the row was written. Pre-WP5 nothing recorded this at all.
    const settlementId = `wp5-set-${randomUUID().slice(0, 8)}`;
    const { paymentHash } = await seedIntent({ state: "settled", settlementId });

    const summary = await reconcile();
    expect(summary.recovered).toBeGreaterThanOrEqual(1);

    const [row] = await db
      .select({ id: transactions.id, priceCents: transactions.priceCents })
      .from(transactions)
      .where(eq(transactions.x402SettlementId, settlementId))
      .limit(1);

    expect(row, "a transaction row should exist for the settled intent").toBeDefined();
    expect(row!.priceCents).toBe(25);

    const [intent] = await db
      .select({ state: x402SettlementIntents.state })
      .from(x402SettlementIntents)
      .where(eq(x402SettlementIntents.paymentHash, paymentHash));
    expect(intent!.state).toBe("recorded");
  }, 120_000);

  it("does not recover it twice", async () => {
    // A second tick must be a no-op. The unique index on settlement_id is the
    // structural guarantee; this proves the job respects it rather than
    // relying on it to throw.
    const settlementId = `wp5-set-${randomUUID().slice(0, 8)}`;
    await seedIntent({ state: "settled", settlementId });

    await reconcile();
    await reconcile();

    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.x402SettlementId, settlementId));
    expect(rows).toHaveLength(1);
  }, 120_000);

  it("discharges an intent whose transaction row already exists", async () => {
    // Bookkeeping only: the row landed, the mark did not. No money question.
    const settlementId = `wp5-set-${randomUUID().slice(0, 8)}`;
    const { paymentHash } = await seedIntent({ state: "settled", settlementId });

    await db.insert(transactions).values({
      userId: null,
      capabilityId: null,
      status: "completed",
      input: {},
      priceCents: 25,
      paymentMethod: "x402",
      x402SettlementId: settlementId,
      completedAt: new Date(),
    });

    const summary = await reconcile();
    expect(summary.discharged).toBeGreaterThanOrEqual(1);

    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.x402SettlementId, settlementId));
    // Discharged, NOT recovered — recovering here would double-record a
    // settlement that was already recorded.
    expect(rows).toHaveLength(1);

    const [intent] = await db
      .select({ state: x402SettlementIntents.state })
      .from(x402SettlementIntents)
      .where(eq(x402SettlementIntents.paymentHash, paymentHash));
    expect(intent!.state).toBe("recorded");
  }, 120_000);

  it("REFUSES to guess when the crash happened mid-facilitator", async () => {
    // The honest case, and the one most likely to be "fixed" wrongly later.
    // No settlement id means we do not know whether the chain moved. The
    // reconciler must escalate and change nothing: inventing a transaction row
    // would fabricate revenue and tell a customer they paid when they may not
    // have.
    const { paymentHash } = await seedIntent({ state: "settling" });

    const summary = await reconcile();
    expect(summary.escalated).toBeGreaterThanOrEqual(1);
    expect(summary.recovered).toBe(0);

    const [intent] = await db
      .select({
        state: x402SettlementIntents.state,
        transactionId: x402SettlementIntents.transactionId,
      })
      .from(x402SettlementIntents)
      .where(eq(x402SettlementIntents.paymentHash, paymentHash));

    // Untouched. A stuck row an operator can see beats a wrong number nobody
    // can find.
    expect(intent!.state).toBe("settling");
    expect(intent!.transactionId).toBeNull();
  }, 120_000);

  it("a settlement-id collision does not fail the request", async () => {
    // Regression. The unique index on settlement_id can reject markSettled, and
    // that rejection propagated as an unhandled 500 — AFTER the USDC had
    // already left the customer's wallet. Pre-WP5 they would have received
    // their result, so the durability mechanism had made things strictly worse.
    // Found by the WP4 parity suite, not by inspection.
    const settlementId = `wp5-dup-${randomUUID().slice(0, 8)}`;
    const first = await seedIntent({ state: "settled", settlementId });
    expect(first.settlementId).toBe(settlementId);

    const secondHash = `wp5-${randomUUID().slice(0, 12)}`;
    hashes.push(secondHash);
    await db.insert(x402SettlementIntents).values({
      paymentHash: secondHash,
      slug: "wp5-probe-capability",
      priceCents: 25,
      state: "settling",
    });
    const [second] = await db
      .select({ id: x402SettlementIntents.id })
      .from(x402SettlementIntents)
      .where(eq(x402SettlementIntents.paymentHash, secondHash));

    const { markSettled } = await import("../lib/x402-settlement-intent.js");

    // Must not throw. The money already moved; bookkeeping may not turn a paid
    // call into an error.
    await expect(
      markSettled(db, { intentId: second!.id, settlementId }),
    ).resolves.toBeUndefined();

    // And it degrades to the RIGHT state: still 'settling', which is the
    // reconciler's "we do not know" class, so a human is paged rather than the
    // discrepancy being silently resolved.
    const [after] = await db
      .select({ state: x402SettlementIntents.state })
      .from(x402SettlementIntents)
      .where(eq(x402SettlementIntents.paymentHash, secondHash));
    expect(after!.state).toBe("settling");
  }, 120_000);

  it("leaves a fresh in-flight intent alone", async () => {
    // Not stale yet — a live settlement in progress. Sweeping it would race a
    // request that is about to write its own row.
    const paymentHash = `wp5-${randomUUID().slice(0, 12)}`;
    hashes.push(paymentHash);
    await db.insert(x402SettlementIntents).values({
      paymentHash,
      slug: "wp5-probe-capability",
      priceCents: 25,
      state: "settling",
      // updatedAt defaults to now(): inside the staleness window.
    });

    await reconcile();

    const [intent] = await db
      .select({
        state: x402SettlementIntents.state,
        updatedAt: x402SettlementIntents.updatedAt,
      })
      .from(x402SettlementIntents)
      .where(eq(x402SettlementIntents.paymentHash, paymentHash));

    // Asserted about THIS intent rather than the summary's global counter.
    // The counter reflects every stale row in the database, including ones
    // other suites left behind, so `escalated === 0` was a claim about the
    // whole table pretending to be a claim about this row.
    expect(intent!.state).toBe("settling");
    expect(intent!.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  }, 120_000);
});
