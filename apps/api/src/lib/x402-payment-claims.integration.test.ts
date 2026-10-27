import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { useTestDatabase } from "../test-support/integration-db.js";
import { transactions, x402SettlementIntents } from "../db/schema.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;
let getDb: typeof import("../db/index.js").getDb;
let closeDbPool: typeof import("../db/index.js").closeDbPool;
let claims: typeof import("./x402-payment-claims.js");
describeMaybe("Round 2 durable x402 claims against Postgres", () => {
  const hashes: string[] = [];
  const hash = () => { const value = randomUUID().replaceAll("-", ""); hashes.push(value); return value; };
  beforeAll(async () => {
    ({ getDb, closeDbPool } = await import("../db/index.js"));
    claims = await import("./x402-payment-claims.js");
  });
  afterAll(async () => { await closeDbPool(); });
  afterEach(async () => {
    for (const h of hashes.splice(0)) {
      await getDb().delete(x402SettlementIntents).where(eq(x402SettlementIntents.paymentHash, h));
      await getDb().delete(transactions).where(sql`x402_payment_hash = ${h} OR x402_execution_attempts->>'paymentHash' = ${h}`);
    }
  });
  it("admits one concurrent owner, deletes rejected claims, and allows exactly two failed executions", async () => {
    const h = hash();
    const owners = await Promise.all(Array.from({ length: 5 }, () => claims.claimX402Payment(h, null, null)));
    const ids = owners.filter((id): id is string => id !== null);
    expect(ids).toHaveLength(1);
    await claims.releaseX402Claim(ids[0]!, h, false);
    expect(await getDb().select().from(transactions).where(eq(transactions.x402PaymentHash, h))).toHaveLength(0);
    for (let n = 0; n < 2; n++) {
      const id = await claims.claimX402Payment(h, null, null);
      expect(id).not.toBeNull();
      await claims.beginX402Execution(id!, h);
      await claims.releaseX402Claim(id!, h, true);
    }
    expect(await claims.claimX402Payment(h, null, null)).toBeNull();
    const rows = await getDb().select().from(transactions).where(sql`x402_execution_attempts->>'paymentHash' = ${h}`);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.x402ExecutionAttempts?.count)).toEqual([1, 1]);
  });
  it("releases stale claims, retains every intent and settlement, and fences late settlement", async () => {
    const staleHash = hash(), intentHash = hash(), settledHash = hash(), freshHash = hash();
    const stale = (await claims.claimX402Payment(staleHash, null, null))!;
    const withIntent = (await claims.claimX402Payment(intentHash, null, null))!;
    const settled = (await claims.claimX402Payment(settledHash, null, null))!;
    const fresh = (await claims.claimX402Payment(freshHash, null, null))!;
    await claims.beginX402Execution(stale, staleHash);
    await claims.openClaimedX402Intent(withIntent, { paymentHash: intentHash, slug: "test-round2", priceCents: 5 });
    await getDb().update(transactions).set({ x402SettlementId: `test-${settledHash}` }).where(eq(transactions.id, settled));
    for (const id of [stale, withIntent, settled]) {
      await getDb().update(transactions).set({ createdAt: new Date(Date.now() - 660_000) }).where(eq(transactions.id, id));
    }
    expect(await getDb().transaction(tx => claims.releaseStaleX402Claims(tx, 25))).toBe(1);
    const [released] = await getDb().select().from(transactions).where(eq(transactions.id, stale));
    expect(released).toMatchObject({ status: "failed", x402PaymentHash: null });
    for (const id of [withIntent, settled, fresh]) {
      const [retained] = await getDb().select().from(transactions).where(eq(transactions.id, id));
      expect(retained!.x402PaymentHash).not.toBeNull();
    }
    await expect(claims.openClaimedX402Intent(stale, { paymentHash: staleHash, slug: "test-round2", priceCents: 5 })).rejects.toThrow("no longer owned");
  });
});
