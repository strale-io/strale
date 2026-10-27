import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";
import { apiKeys, users, wallets } from "../db/schema.js";
import { hashApiKey } from "../lib/auth.js";
import { apiKeysRoute } from "./api-keys.js";
import type { AppEnv } from "../types.js";

const state = vi.hoisted(() => ({ db: null as any, user: null as any, callerId: null as string | null }));
vi.mock("../db/index.js", () => ({ getDb: () => state.db }));
vi.mock("../lib/middleware.js", async (importOriginal) => ({ ...await importOriginal<typeof import("../lib/middleware.js")>(), authMiddleware: async (c: any, next: any) => {
  c.set("user", state.user); c.set("apiKeyId", state.callerId); await next();
} }));
vi.mock("../lib/rate-limit.js", () => ({ rateLimitByKey: () => async (_c: any, next: any) => next() }));
const dialect = new PgDialect();
let keys: any[], writes: any[], events: string[], closed: boolean, app: Hono<AppEnv>;
beforeEach(() => {
  state.user = { id: randomUUID() }; state.callerId = null;
  keys = []; writes = []; events = []; closed = false;
  function query(operation: string, initialTable?: any) {
    let table = initialTable, values: any, rows: any[] = [];
    const q: any = {
      from: (t: any) => { table = t; return q; },
      set: (v: any) => { values = v; return q; },
      values: (v: any) => {
        values = v; writes.push(v);
        const row = { id: randomUUID(), createdAt: new Date(), revokedAt: null, lastUsedAt: null, ...v };
        keys.push(row); rows = [row]; events.push("insert"); return q;
      },
      where: (condition: any) => {
        const { sql, params } = dialect.sqlToQuery(condition);
        expect(params.every((p) => !(p instanceof Date) && !Buffer.isBuffer(p))).toBe(true);
        if (table === users) rows = closed ? [] : [state.user];
        else if (table === wallets) rows = [{ id: randomUUID(), balanceCents: 1000 }];
        else if (table === apiKeys) {
          expect(params).toContain(state.user.id); // ownership on EVERY key query
          rows = keys.filter(k => k.userId === state.user.id);
          if (sql.includes('"api_keys"."id" =')) rows = rows.filter(k => k.id === params[0]);
          if (sql.includes('"api_keys"."revoked_at" is null')) rows = rows.filter(k => !k.revokedAt);
        }
        if (operation === "update") {
          events.push("update"); writes.push(values);
          for (const row of rows) for (const [k,v] of Object.entries(values)) if (v !== undefined) row[k] = k === "revokedAt" ? row[k] ?? new Date() : v;
        }
        return q;
      },
      for: (mode: string) => { expect(mode).toBe("update"); events.push("lock"); return q; },
      returning: () => q, orderBy: () => q, limit: (n: number) => { rows = rows.slice(0, n); return q; },
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    };
    return q;
  }
  state.db = {
    transaction: (f: any) => f(state.db), select: () => query("select"),
    update: (t: any) => query("update", t), insert: (t: any) => query("insert", t),
    execute: async (s: any) => {
      const {params} = dialect.sqlToQuery(s);
      expect(params.every((p) => !(p instanceof Date) && !Buffer.isBuffer(p))).toBe(true);
      return keys.map(k => ({ id: k.id, spent_hour_cents: "10", spent_total_cents: "20" }));
    },
  };
  app = new Hono<AppEnv>(); app.route("/v1/api-keys", apiKeysRoute);
});
function request(path = "", method = "GET", body?: unknown) {
  return app.request(`/v1/api-keys${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
it("creates a once-only secret, stores the primary hash format, and never lists it", async () => {
  const created = await request("", "POST", { label: " Agent ", max_spend_total_cents: 50 });
  expect(created.status).toBe(201);
  const key = await created.json() as any;
  expect(key.api_key).toMatch(/^sk_live_[0-9a-f]{64}$/);
  expect(keys[0]).toMatchObject({ apiKeyHash: hashApiKey(key.api_key), label: "Agent", maxSpendTotalCents: 50, maxSpendPerHourCents: null });
  expect(JSON.stringify(writes)).not.toContain(key.api_key);
  expect(events.indexOf("lock")).toBeLessThan(events.indexOf("insert"));
  const listed = await request(); expect(listed.status).toBe(200);
  const body = await listed.text();
  expect(body).not.toContain(key.api_key); expect(body).not.toContain(keys[0].apiKeyHash);
  expect(JSON.parse(body).keys[0]).toMatchObject({ spent_hour_cents: 10, spent_total_cents: 20 });
});
it("updates only supplied fields under the lock; null removes caps and zero is preserved", async () => {
  await request("", "POST", { label: "Agent", max_spend_total_cents: 50 });
  const id = keys[0].id;
  let response = await request(`/${id}`, "PATCH", { max_spend_total_cents: 0 });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ label: "Agent", max_spend_total_cents: 0 });
  response = await request(`/${id}`, "PATCH", { max_spend_total_cents: null, label: "New" });
  expect(await response.json()).toMatchObject({ label: "New", max_spend_total_cents: null });
  expect(events).toEqual(["lock", "insert", "lock", "update", "lock", "update"]);
});
it.each([
  ["GET", "", undefined, 200],
  ["POST", "", {label: "Replacement"}, 201],
  ["PATCH", "/ID", {label: "Replacement"}, 200],
  ["DELETE", "/ID", undefined, 200],
] as const)("%s key management requires primary authorization and accepts the primary", async (method, template, body, status) => {
  await request("", "POST", { label: "Agent" });
  const path = template.replace("ID", keys[0].id);
  state.callerId = keys[0].id;
  const res = await request(path, method, body);
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({error_code: "primary_key_required", message: "Use the account's primary key for this action"});
  expect(keys).toHaveLength(1); expect(keys[0].revokedAt).toBeNull();
  state.callerId = null;
  expect((await request(path, method, body)).status).toBe(status);
});
it("cannot revoke the primary id through additional-key management", async () => {
  expect((await request(`/${state.user.id}`, "DELETE")).status).toBe(404);
});
it("rechecks closed accounts after the wallet lock", async () => {
  await request("", "POST", {label: "Agent"});
  closed = true;
  expect((await request(`/${keys[0].id}`, "PATCH", {label: "Replacement"})).status).toBe(401);
});
it("allows 25 active keys, refuses the 26th, and reuses a revoked slot", async () => {
  for (let i = 0; i < 25; i++) expect((await request("", "POST", {label: `Agent ${i}`})).status).toBe(201);
  const refused = await request("", "POST", {label: "Overflow"});
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({error_code: "active_key_limit_exceeded", message: expect.stringContaining("Revoke an unused key first")});
  await request(`/${keys[0].id}`, "DELETE");
  expect((await request("", "POST", {label: "Replacement"})).status).toBe(201);
  const listed = await (await request()).json() as any;
  expect(listed.keys).toHaveLength(25);
  expect(listed.keys.every((k: any) => k.revoked_at === null)).toBe(true);
});
it("serializes two concurrent creates at 24 using the wallet lock", async () => {
  for (let i = 0; i < 24; i++) await request("", "POST", {label: `Agent ${i}`});
  let tail = Promise.resolve();
  state.db.transaction = async (run: any) => {
    let release: (() => void) | undefined;
    const tx = {...state.db, select: () => {
      const q = state.db.select();
      const originalFor = q.for, originalThen = q.then;
      let pending = Promise.resolve();
      q.for = (mode: string) => {
        originalFor(mode);
        pending = tail;
        tail = new Promise<void>(resolve => {release = resolve;});
        return q;
      };
      q.then = async (resolve: any, reject: any) => {await pending; return originalThen(resolve, reject);};
      return q;
    }};
    try {return await run(tx);} finally {release?.();}
  };
  const results = await Promise.all([request("", "POST", {label: "25"}), request("", "POST", {label: "26"})]);
  expect(results.map(r => r.status).sort()).toEqual([201,409]);
  expect(keys).toHaveLength(25);
});
it.each(["line\nbreak", "\tx", "x\r", "x\u0000", "x\u007f", "x\u0085", "x".repeat(65)])("rejects invalid label %j before writing", async (label) => {
  expect((await request("", "POST", {label})).status).toBe(400);
  expect((await request(`/${randomUUID()}`, "PATCH", {label})).status).toBe(400);
  expect(writes).toHaveLength(0);
});
it("accepts trimmed labels through 64 characters", async () => {
  const res = await request("", "POST", {label: `  ${"x".repeat(64)}  `});
  expect(res.status).toBe(201); expect(keys[0].label).toBe("x".repeat(64));
});
it("rejects invalid money values, labels, fields, and empty updates before writes", async () => {
  for (const body of [{ label: "" }, { label: "x", max_spend_total_cents: -1 }, { label: "x", max_spend_total_cents: 1.5 }, { label: "x", max_spend_total_cents: 2147483648 }]) {
    expect((await request("", "POST", body)).status).toBe(400);
  }
  expect((await request(`/${randomUUID()}`, "PATCH", {})).status).toBe(400);
  expect(writes).toHaveLength(0);
});
it("does not disclose or mutate another account's key", async () => {
  keys.push({ id: randomUUID(), userId: randomUUID() });
  expect((await request(`/${keys[0].id}`, "PATCH", { label: "wrong" })).status).toBe(404);
  expect((await request(`/${keys[0].id}`, "DELETE")).status).toBe(404);
  expect(keys[0]).not.toHaveProperty("revokedAt");
});
