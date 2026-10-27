import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { apiKeys, users } from "../db/schema.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "./auth.js";
import { log } from "./log.js";
import { authenticateApiKey, keyCapError, keySpending } from "./api-keys.js";
import { authMiddleware, optionalAuthMiddleware } from "./middleware.js";
import { runMigration0124_apiKeys, BLOCKS } from "./startup-migrations.js";
import { publicKey } from "../routes/api-keys.js";
import { debit } from "./wallet-service.js";
import { reserve } from "./wallet-reservations.js";
import { walletTransactions } from "../db/schema.js";
import type { AppEnv } from "../types.js";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../db/index.js", () => ({ getDb: () => state.db }));
const dialect = new PgDialect();
function checked(query: SQL) {
  const compiled = dialect.sqlToQuery(query);
  for (const param of compiled.params) {
    expect(param).not.toBeInstanceOf(Date);
    expect(Buffer.isBuffer(param)).toBe(false);
  }
  return compiled;
}
let key: typeof apiKeys.$inferSelect;
let user: typeof users.$inferSelect;
let secret: string;
let primary: string;
let primaryRows: any[];
let additionalRows: any[];
let selects: string[];
let updates: SQL[];
let usage: { spent_hour_cents: string; spent_total_cents: string };
let queries: SQL[];
beforeEach(() => {
  primary = generateApiKey(); secret = generateApiKey();
  user = { id: randomUUID(), apiKeyHash: hashApiKey(primary), keyPrefix: getKeyPrefix(primary), deletedAt: null } as any;
  key = { id: randomUUID(), userId: user.id, apiKeyHash: hashApiKey(secret), keyPrefix: getKeyPrefix(secret), label: "Agent",
    maxSpendPerHourCents: null, maxSpendTotalCents: null, createdAt: new Date(), revokedAt: null, lastUsedAt: new Date() };
  primaryRows = []; additionalRows = [{ key, user }]; selects = []; updates = []; queries = [];
  usage = { spent_hour_cents: "20", spent_total_cents: "90" };
  state.db = {
    select: () => {
      let table: any;
      const q: any = {
        from: (t: any) => { table = t; return q; }, innerJoin: () => q,
        where: (condition: SQL) => {
          selects.push(checked(condition).sql);
          return Promise.resolve(table === users ? primaryRows : additionalRows);
        },
      };
      return q;
    },
    update: () => ({ set: (values: any) => ({ where: async (condition: SQL) => { checked(values.lastUsedAt); checked(condition); updates.push(condition); } }) }),
    execute: async (query: SQL) => { checked(query); queries.push(query); return [{ id: key.id, ...usage }]; },
  };
});
describe("additional-key authentication", () => {
  it("authenticates through required and optional middleware without logging the key", async () => {
    const records: any[] = [];
    const logger: any = { child: (v: any) => { records.push(v); return logger; } };
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => { c.set("log", logger); await next(); });
    app.get("/required", authMiddleware, (c) => c.json({ user: c.get("user").id, key: c.get("apiKeyId") }));
    app.get("/optional", optionalAuthMiddleware, (c) => c.json({ user: c.get("user").id, key: c.get("apiKeyId") }));
    for (const path of ["/required", "/optional"]) {
      const res = await app.request(path, { headers: { Authorization: `Bearer ${secret}` } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ user: user.id, key: key.id });
    }
    expect(JSON.stringify(records)).not.toContain(secret);
    expect(selects.join(" ")).toContain('"api_keys"."key_prefix"');
    expect(selects.join(" ")).toContain('"api_keys"."revoked_at" is null');
    expect(selects.join(" ")).toContain('"users"."deleted_at" is null');
  });
  it("unknown and revoked keys produce identical 401 bodies", async () => {
    const app = new Hono<AppEnv>();
    app.get("/", authMiddleware, (c) => c.json({ ok: true }));
    key.revokedAt = new Date(); // Keep a real matching revoked row in the double.
    additionalRows = [{ key, user }];
    const revoked = await app.request("/", { headers: { Authorization: `Bearer ${secret}` } });
    const unknown = await app.request("/", { headers: { Authorization: `Bearer ${generateApiKey()}` } });
    expect(revoked.status).toBe(401); expect(unknown.status).toBe(401);
    expect(await revoked.json()).toEqual(await unknown.json());
  });
  it("rejects prefix collisions and malformed stored hashes", async () => {
    key.apiKeyHash = hashApiKey(generateApiKey());
    expect(await authenticateApiKey(secret)).toBeNull();
    key.apiKeyHash = "bad";
    expect(await authenticateApiKey(secret)).toBeNull();
  });
  it("keeps the primary identity without additional-key queries or writes", async () => {
    primaryRows = [user];
    expect(await authenticateApiKey(primary)).toEqual({ user, apiKeyId: null });
    expect(selects).toHaveLength(1); expect(updates).toHaveLength(0);
  });
  it("avoids writes for recently used keys", async () => {
    await authenticateApiKey(secret);
    expect(updates).toHaveLength(0);
  });
  it("throttles last_used_at with a database predicate and primitive binds", async () => {
    key.lastUsedAt = null;
    await authenticateApiKey(secret);
    expect(updates).toHaveLength(1);
    expect(checked(updates[0]).sql).toContain("interval '1 minute'");
    key.lastUsedAt = new Date(Date.now() - 61_000);
    await authenticateApiKey(secret);
    expect(updates).toHaveLength(2);
  });
});
function policyTx() {
  return { ...state.db, select: () => ({ from: () => ({ where: async (condition: SQL) => { checked(condition); return [key]; } }) }) };
}
describe("key limits and ledger accounting", () => {
  it("refuses the hourly cap with a stable code and actionable message", async () => {
    key.maxSpendPerHourCents = 25;
    const error = await keyCapError(policyTx(), user.id, key.id, 6);
    expect(error).toMatchObject({ error_code: "key_hourly_cap_exceeded", details: { spent_cents: 20, requested_cents: 6, limit_cents: 25 } });
    expect(error!.message).toContain("primary key");
    expect(error!.details).toMatchObject({retryable: false});
  });
  it("refuses the total cap with its own stable code", async () => {
    key.maxSpendTotalCents = 100;
    expect(await keyCapError(policyTx(), user.id, key.id, 11)).toMatchObject({ error_code: "key_total_cap_exceeded" });
  });
  it("allows exact boundaries; null is unlimited and zero blocks paid calls", async () => {
    key.maxSpendPerHourCents = 25; key.maxSpendTotalCents = 95;
    expect(await keyCapError(policyTx(), user.id, key.id, 5)).toBeNull();
    key.maxSpendPerHourCents = null; key.maxSpendTotalCents = null;
    expect(await keyCapError(policyTx(), user.id, key.id, 10000)).toBeNull();
    key.maxSpendTotalCents = 0;
    expect(await keyCapError(policyTx(), user.id, key.id, 1)).toMatchObject({ error_code: "key_total_cap_exceeded" });
  });
  it("rechecks revocation inside the wallet lock", async () => {
    key.revokedAt = new Date();
    expect(await keyCapError(policyTx(), user.id, key.id, 5)).toEqual({ error_code: "unauthorized", message: "Invalid API key." });
  });
  it("leaves primary-key and x402 calls out of the additional policy", async () => {
    expect(await keyCapError({}, user.id, null, 100)).toBeNull();
  });
  it("uses purchase-time net ledger accounting with primitive binds", async () => {
    expect(await keySpending(state.db, user.id, key.id)).toEqual([{ id: key.id, spent_hour_cents: 20, spent_total_cents: 90 }]);
    const { sql: text, params } = checked(queries[0]);
    expect(text).toContain("r.reference_id = d.reference_id");
    expect(text).toContain("r.wallet_id = d.wallet_id");
    expect(text).toContain("p.created_at >= now() - interval '1 hour'");
    expect(params).toEqual([user.id, key.id]);
  });
  it("never exposes hash or plaintext in key metadata", () => {
    const result = publicKey(key);
    expect(result).not.toHaveProperty("apiKeyHash");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(hashApiKey(secret));
  });
});
describe("migration 0124", () => {
  it("guards ALTERs, validates separately, bounds lock waits and builds concurrent indexes", async () => {
    const statements: string[] = [];
    const tx = { execute: async (query: SQL) => { statements.push(checked(query).sql); return []; } };
    expect(BLOCKS).toContain(runMigration0124_apiKeys);
    await runMigration0124_apiKeys(tx);
    const text = statements.join(" ");
    expect(statements[0]).toContain("SET lock_timeout = '3s'");
    expect(statements.at(-1)).toContain("RESET lock_timeout");
    expect(text).toMatch(/IF NOT EXISTS[\s\S]*information_schema.columns[\s\S]*ALTER TABLE wallet_transactions ADD COLUMN/);
    expect(text).toContain("NOT VALID");
    expect(text).toMatch(/NOT convalidated[\s\S]*VALIDATE CONSTRAINT/);
    expect(statements.filter(s => s.includes("CREATE INDEX CONCURRENTLY IF NOT EXISTS wallet_transactions"))).toHaveLength(2);
  });
  it("repairs an interrupted concurrent index build and resets timeout even on failure", async () => {
    const statements: string[] = [];
    const tx = {execute: async (q: SQL) => {
      const text = checked(q).sql; statements.push(text);
      if (text.includes("SELECT c.relname")) return [{relname: "wallet_transactions_reference_idx"}];
      if (text.includes("CREATE INDEX CONCURRENTLY IF NOT EXISTS wallet_transactions_reference_idx")) throw new Error("lock timeout");
      return [];
    }};
    await expect(runMigration0124_apiKeys(tx)).rejects.toThrow("lock timeout");
    expect(statements.join(" ")).toContain("DROP INDEX CONCURRENTLY IF EXISTS wallet_transactions_reference_idx");
    expect(statements.at(-1)).toContain("RESET lock_timeout");
  });
});

it("attributes both sync debits and async reservations to the authenticating key", async () => {
  const ledger: any[] = [];
  const tx = {
    update: () => ({ set: (values: any) => {
      checked(values.balanceCents);
      return { where: (condition: SQL) => { checked(condition); return { returning: async () => [{ balanceCents: 975 }] }; } };
    } }),
    insert: (table: any) => ({ values: (values: any) => {
      if (table === walletTransactions) { ledger.push(values); return Promise.resolve(); }
      return { returning: async () => [{ id: randomUUID() }] };
    } }),
  };
  const wallet = { id: randomUUID(), balanceCents: 1000 };
  await debit(tx, { wallet, amountCents: 25, description: "sync", apiKeyId: key.id });
  await reserve(tx, { wallet, userId: user.id, amountCents: 25, description: "async", apiKeyId: key.id, transactionId: randomUUID() });
  expect(ledger).toHaveLength(2);
  expect(ledger.every(row => row.apiKeyId === key.id && row.amountCents === -25)).toBe(true);
  await debit(tx, { wallet, amountCents: 25, description: "primary" });
  expect(ledger[2].apiKeyId).toBeNull();
});

it("validates a revoked key before returning wallet balance after waiting for the lock", () => {
  const doSource = readFileSync(new URL("../routes/do.ts", import.meta.url), "utf8");
  for (const name of ["executeSync", "executeAsync"]) {
    const source = doSource.slice(doSource.indexOf(`async function ${name}(`));
    const lock = source.indexOf("await walletService.lockWalletForUser(tx, user.id)");
    const policy = source.indexOf("await keyCapError(tx, user.id");
    const balance = source.indexOf("if (!wallet || wallet.balanceCents < capability.priceCents)", lock);
    expect(lock).toBeGreaterThan(-1); expect(policy).toBeGreaterThan(lock);
    expect(balance).toBeGreaterThan(policy);
  }
  const solution = readFileSync(new URL("../routes/solution-execute.ts", import.meta.url), "utf8");
  expect(solution.indexOf("await keyCapError(tx, user.id")).toBeLessThan(solution.indexOf("if (!wallet || wallet.balanceCents < sol.priceCents)"));
});

it("authenticates when last-used persistence fails and logs the structured failure", async () => {
  key.lastUsedAt = null;
  const failure = new Error("synthetic update failure");
  state.db.update = () => ({set: () => ({where: async () => {throw failure;}})});
  const logged = vi.spyOn(log, "error").mockImplementation(() => {});
  try {
    const app = new Hono<AppEnv>();
    app.get("/", authMiddleware, (c) => c.json({id: c.get("apiKeyId")}));
    const res = await app.request("/", {headers: {Authorization: `Bearer ${secret}`}});
    expect(res.status).toBe(200); expect(await res.json()).toEqual({id: key.id});
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({label: "api-key-last-used-update-failed", api_key_id: key.id, err: expect.objectContaining({message: failure.message})}), "api-key-last-used-update-failed");
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secret);
  } finally { logged.mockRestore(); }
});
