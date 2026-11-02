import { describe, expect, it } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";

import { computeBatchFingerprint, reserveBatch, validateBatchItem, BATCH_ITEMS_PER_MINUTE } from "./batch.js";
import { linkTransaction } from "../wallet-reservations.js";
import { consumeKeyUnits } from "../rate-limit.js";

/**
 * A drizzle-shaped transaction that records every raw `tx.execute(sql``)` and
 * answers builder queries from a per-table queue of results (the last one
 * repeats). Enough of the surface for reserveBatch to run without a database.
 */
function makeTx(tables: Record<string, unknown[][]>) {
  const executed: SQL[] = [];
  const inserted: Array<{ table: string; values: unknown }> = [];
  const chain = (table?: string): any => {
    const self: any = {
      from: (t: any) => chain(getTableName(t)),
      where: () => self,
      limit: () => self,
      for: () => self,
      orderBy: () => self,
      set: () => self,
      values: (v: unknown) => { inserted.push({ table: table!, values: v }); return self; },
      returning: () => self,
      then: (resolve: any, reject: any) => {
        const queue = tables[table ?? ""] ?? [[]];
        const result = queue.length > 1 ? queue.shift()! : queue[0];
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return self;
  };
  const tx = {
    rollback: () => {},
    execute: async (q: SQL) => { executed.push(q); return [{ cents: 0 }]; },
    select: () => chain(),
    insert: (t: any) => chain(getTableName(t)),
    update: (t: any) => chain(getTableName(t)),
  };
  return { tx, executed, inserted, db: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
}

/** Raw values a postgres-js bind cannot encode (the PR-43 incident class). */
function unencodable(q: SQL): unknown[] {
  const out: unknown[] = [];
  const walk = (chunks: unknown[]) => {
    for (const c of chunks) {
      if (c instanceof Date || Buffer.isBuffer(c)) out.push(c);
      const nested = (c as { queryChunks?: unknown[] } | null)?.queryChunks;
      if (Array.isArray(nested)) walk(nested);
    }
  };
  walk((q as unknown as { queryChunks?: unknown[] }).queryChunks ?? []);
  return out;
}

const capability = {
  id: "cap-1", slug: "probe", name: "Probe", priceCents: 25, lifecycleState: "active", capabilityType: "api",
  transparencyTag: "algorithmic", dataSource: null, dataClassification: null, freshnessCategory: null,
  isFreeTier: false, dataUpdateCycleDays: null, datasetLastUpdated: null, processesPersonalData: false,
  personalDataCategories: null,
};

describe("reserveBatch — bind-parameter shape (DEC-20260504-A)", () => {
  it("passes no Date or Buffer through tx.execute(sql``) on the reserve path", async () => {
    const m = makeTx({
      wallets: [[{ id: "w-1", balanceCents: 1000 }]],
      // Idempotency-key collision check (none), then the spend-cap SUM.
      transactions: [[], [{ total: "0" }]],
      // Spend-cap SUM of unlinked holds, then each hold's RETURNING id.
      wallet_reservations: [[{ total: "0" }], [{ id: "r-1" }]],
      // Idempotency check (none), then the order's RETURNING id.
      batch_orders: [[], [{ id: "b-1" }]],
    });
    const outcome = await reserveBatch({
      db: m.db as any, user: { id: "u-1", maxSpendPerHourCents: 10_000 }, apiKeyId: null, capability,
      itemCount: 3, maxTotalPriceCents: 75, idempotencyKey: "k-1", fingerprint: "f".repeat(64),
    });
    expect(outcome.kind).toBe("reserved");
    expect(m.executed.length).toBeGreaterThan(0);
    for (const q of m.executed) expect(unencodable(q)).toEqual([]);
    // One hold per item, all hold-mode and unlinked, then one order row.
    const holds = m.inserted.filter((i) => i.table === "wallet_reservations").map((i) => i.values as any);
    expect(holds).toHaveLength(3);
    expect(holds.every((h) => h.mode === "hold" && h.transactionId === null && h.amountCents === 25)).toBe(true);
    const order = m.inserted.find((i) => i.table === "batch_orders")!.values as any;
    expect(order.quotedTotalCents).toBe(75);
    expect(order.itemReservationIds).toHaveLength(3);
  });

  it("reserves nothing when the balance net of holds cannot fund the quote", async () => {
    const m = makeTx({ wallets: [[{ id: "w-1", balanceCents: 70 }]] });
    const outcome = await reserveBatch({
      db: m.db as any, user: { id: "u-1" }, apiKeyId: null, capability,
      itemCount: 3, maxTotalPriceCents: 75, idempotencyKey: null, fingerprint: "f".repeat(64),
    });
    expect(outcome).toEqual({ kind: "insufficient_balance", balance: 70, required: 75 });
    expect(m.inserted).toHaveLength(0);
  });
});

describe("linkTransaction", () => {
  it("reports false when no open, unlinked hold matched, so the item must not run", async () => {
    const m = makeTx({ wallet_reservations: [[]] });
    expect(await linkTransaction(m.tx, { reservationId: "r-1", transactionId: "t-1" })).toBe(false);
    const m2 = makeTx({ wallet_reservations: [[{ id: "r-1" }]] });
    expect(await linkTransaction(m2.tx, { reservationId: "r-1", transactionId: "t-1" })).toBe(true);
  });
});

describe("consumeKeyUnits — rate limits count items", () => {
  function ctx(keyId: string) {
    const headers: Record<string, string> = {};
    return {
      headers,
      get: (k: string) => (k === "user" ? { id: `user-${keyId}` } : k === "apiKeyId" ? keyId : undefined),
      header: (k: string, v: string) => { headers[k] = v; },
      json: (body: unknown, status: number) => ({ body, status }),
    } as any;
  }

  it("admits batches until their items fill the bucket, all or nothing", () => {
    const c = ctx(`k-${Math.random()}`);
    expect(consumeKeyUnits(c, 250, BATCH_ITEMS_PER_MINUTE, 60_000, "t")).toBeNull();
    // 250 + 100 > 300: refused whole, and it consumes nothing...
    const refused = consumeKeyUnits(c, 100, BATCH_ITEMS_PER_MINUTE, 60_000, "t") as any;
    expect(refused.status).toBe(429);
    expect(refused.body.details.units_requested).toBe(100);
    expect(Number(c.headers["Retry-After"])).toBeGreaterThan(0);
    // ...so 50 still fits exactly.
    expect(consumeKeyUnits(c, 50, BATCH_ITEMS_PER_MINUTE, 60_000, "t")).toBeNull();
    expect((consumeKeyUnits(c, 1, BATCH_ITEMS_PER_MINUTE, 60_000, "t") as any).status).toBe(429);
  });

  it("keeps one-unit behaviour identical to the request limiter", () => {
    const c = ctx(`k-${Math.random()}`);
    for (let i = 0; i < 3; i++) expect(consumeKeyUnits(c, 1, 3, 1000, "t")).toBeNull();
    expect((consumeKeyUnits(c, 1, 3, 1000, "t") as any).status).toBe(429);
  });
});

describe("validateBatchItem", () => {
  const cap = { slug: "probe", inputSchema: { type: "object", required: ["probe"], properties: { probe: { type: "string" } } } };

  it("applies the single-call required-field rule to each item", () => {
    expect(validateBatchItem(cap, { probe: "a" })).toBeNull();
    expect(validateBatchItem(cap, {})?.details?.missing_fields).toEqual(["probe"]);
    expect(validateBatchItem(cap, "a")?.error_code).toBe("invalid_request");
    expect(validateBatchItem(cap, { capability_slug: "probe", inputs: {} })?.details?.confused_keys).toEqual(["capability_slug", "inputs"]);
  });
});

describe("computeBatchFingerprint", () => {
  it("binds the key to the slug and every input, in order", () => {
    const a = computeBatchFingerprint("probe", [{ x: 1 }, { x: 2 }]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(computeBatchFingerprint("probe", [{ x: 1 }, { x: 2 }])).toBe(a);
    expect(computeBatchFingerprint("probe", [{ x: 2 }, { x: 1 }])).not.toBe(a);
    expect(computeBatchFingerprint("other", [{ x: 1 }, { x: 2 }])).not.toBe(a);
  });
});
