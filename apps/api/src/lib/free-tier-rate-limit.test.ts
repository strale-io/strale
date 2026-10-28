import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { STATIC_FACTS } from "./platform-facts.js";
import { enforceFreeTierAllowance, FREE_TIER_HOURLY_GUARD, FREE_TIER_FINGERPRINT_MONTHLY, FREE_TIER_FINGERPRINT_HOURLY } from "./free-tier-allowance.js";

const state = vi.hoisted(() => ({ counts: new Map<string, number>(), queries: [] as unknown[], fail: false, log: vi.fn() }));
vi.mock("./log.js", () => ({ logError: state.log, logWarn: vi.fn() }));
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
function execute(q: any) {
  state.queries.push(q);
  const { sql: text, params } = new PgDialect().sqlToQuery(q);
  expect(text).toMatch(/ON CONFLICT \(bucket_key, window_start\) DO UPDATE/);
  expect(text).toContain("SET count = rate_limit_counters.count + 1");
  expect(text).toMatch(/WHERE rate_limit_counters.count < \$\d+/);
  expect(text).toContain("RETURNING count");
  for (const p of params) {
    expect(p).not.toBeInstanceOf(Date);
    expect(Buffer.isBuffer(p)).toBe(false);
  }
  if (state.fail) throw new Error("counter unavailable");
  const [bucket, start, max] = params as [string, string, number];
  const key = `${bucket}|${start}`;
  const count = state.counts.get(key) ?? 0;
  if (count >= max) return Promise.resolve([]);
  state.counts.set(key, count + 1);
  return Promise.resolve([{ count: count + 1 }]);
}
// Serialize the mock's transactions like the monthly row lock, and roll back on refusal.
let pending: Promise<unknown> = Promise.resolve();
const db = { execute, transaction: (fn: (tx: { execute: typeof execute }) => Promise<unknown>) => {
  const run = pending.then(async () => {
    const snapshot = new Map(state.counts);
    try { return await fn({ execute }); }
    catch (error) { state.counts = snapshot; throw error; }
  });
  // Keep the serialization chain alive after a refused (rolled-back) transaction.
  pending = run.then(() => undefined, (error: unknown) => error);
  return run;
} };
const limit = STATIC_FACTS.free_tier_monthly_limit;
function app(user = false, paid = false, identified: boolean | "fingerprint" = true) {
  const api = new Hono();
  api.get("/", async c => {
    c.set("user", user ? { id: "test-user" } : undefined);
    c.set("x402_paid" as any, paid);
    c.set("requestContext" as any, identified === "fingerprint" ? { fingerprintHash: "synthetic-fp" } : identified ? { ipHash: "synthetic-hash" } : {});
    const denied = await enforceFreeTierAllowance(c, db as any);
    return denied ?? c.json({ usage: c.get("freeTierUsage" as any) });
  });
  return api;
}
beforeEach(() => {
  state.counts.clear(); state.queries = []; state.fail = false; state.log.mockClear();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("monthly free allowance", () => {
  it("allows the last call and refuses the next with the monthly contract", async () => {
    const api = app();
    for (let i = 0; i < limit; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 1, Math.floor(i / FREE_TIER_HOURLY_GUARD))));
      const response = await api.request("/");
      expect(response.status).toBe(200);
      expect(response.headers.get("X-RateLimit-Limit")).toBe(String(limit));
      expect(response.headers.get("X-RateLimit-Remaining")).toBe(String(limit - i - 1));
    }
    const response = await api.request("/");
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error_code).toBe("rate_limited");
    expect(body.details).toMatchObject({ limit, window: "month", resets_at: "2026-11-01T00:00:00.000Z", retryable: false });
    expect(body.details.fix).toContain("https://strale.dev/signup?src=free-tier-limit");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).toBe(String(Date.parse(body.details.resets_at) / 1000));
  });
  it.each(["2026-02-28T23:59:59Z", "2028-02-29T23:59:59Z", "2026-12-31T23:59:59Z"])("resets at the UTC calendar boundary after %s", async timestamp => {
    vi.setSystemTime(new Date(timestamp));
    const api = app();
    const first = await api.request("/");
    const usage = (await first.json()).usage;
    expect(usage.monthly_limit).toBe(limit);
    const key = [...state.counts.keys()].find(k => k.startsWith("free-tier:month:"))!;
    state.counts.set(key, limit);
    expect((await api.request("/")).status).toBe(429);
    vi.setSystemTime(new Date(usage.resets_at));
    const reset = await api.request("/");
    expect(reset.status).toBe(200);
    expect((await reset.json()).usage.calls_this_month).toBe(1);
  });
  it("enforces the hourly anti-abuse guard without consuming more monthly calls", async () => {
    const api = app();
    for (let i = 0; i < FREE_TIER_HOURLY_GUARD; i++) expect((await api.request("/")).status).toBe(200);
    const response = await api.request("/");
    expect(response.status).toBe(429);
    expect((await response.json()).details).toMatchObject({ window: "hour", limit: FREE_TIER_HOURLY_GUARD, retryable: true, retry_after_seconds: 3600 });
    expect([...state.counts.entries()].find(([k]) => k.startsWith("free-tier:month:"))![1]).toBe(FREE_TIER_HOURLY_GUARD);
    vi.setSystemTime(new Date("2026-10-01T01:00:00Z"));
    expect((await api.request("/")).status).toBe(200);
  });
  it("gives fingerprint-only callers the smaller shared allowance", async () => {
    const api = app(false, false, "fingerprint");
    for (let i = 0; i < FREE_TIER_FINGERPRINT_HOURLY; i++) expect((await api.request("/")).status).toBe(200);
    const hourly = await api.request("/");
    expect(hourly.status).toBe(429);
    expect((await hourly.json()).details).toMatchObject({ window: "hour", limit: FREE_TIER_FINGERPRINT_HOURLY });
    for (let h = 1; h <= 3; h++) {
      vi.setSystemTime(new Date(`2026-10-0${h + 1}T00:00:00Z`));
      for (let i = 0; i < FREE_TIER_FINGERPRINT_HOURLY; i++) await api.request("/");
    }
    const monthly = await api.request("/");
    expect(monthly.status).toBe(429);
    expect((await monthly.json()).details).toMatchObject({ window: "month", limit: FREE_TIER_FINGERPRINT_MONTHLY });
  });
  it("caps concurrent reservations", async () => {
    const api = app();
    state.counts.set("free-tier:month:ip:synthetic-hash|2026-10-01T00:00:00.000Z", limit - 1);
    const responses = await Promise.all([api.request("/"), api.request("/")]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 429]);
  });
  it.each([[true, false], [false, true]])("bypasses counters for authenticated=%s x402=%s", async (user, paid) => {
    state.fail = true;
    expect((await app(user, paid).request("/")).status).toBe(200);
    expect(state.queries).toHaveLength(0);
  });
  it("fails closed on a DB error and emits the counter failure", async () => {
    state.fail = true;
    expect((await app().request("/")).status).toBe(503);
    expect(state.log).toHaveBeenCalledWith("free-tier-counter-read-failed", expect.any(Error), { identifiedBy: "ip" });
  });
  it("does not grant unidentifiable callers an unlimited bucket", async () => {
    expect((await app(false, false, false).request("/")).status).toBe(429);
    expect(state.queries).toHaveLength(0);
  });
  it("is wired into the anonymous free route before execution", () => {
    const source = readFileSync(new URL("../routes/do.ts", import.meta.url), "utf8");
    expect(source).toMatch(/if \(!user && \(isFreeTier \|\| isUnlockedForIp\)\) \{\s*const refusal = await enforceFreeTierAllowance\(c, db\);\s*if \(refusal\) return refusal;\s*return executeFreeTier/);
    expect(source).toContain("if (user && isFreeTier)");
    expect(source).toContain("executeFreeTierAuthenticated");
  });
});

it("drift sweep refuses a planted hardcoded allowance on a surface", () => {
  vi.useRealTimers();
  const surface = new URL("../../../../packages/mcp-server/allowance-drift-probe.txt", import.meta.url);
  writeFileSync(surface, `${limit} free calls a month`);
  try {
    const run = spawnSync("npx", ["tsx", "apps/api/scripts/check-platform-facts-drift.ts"], { cwd: new URL("../../../../", import.meta.url), encoding: "utf8" });
    expect(run.status, run.stderr).toBe(1);
    expect(run.stdout).toContain("allowance-drift-probe.txt");
    expect(run.stdout).toContain("hardcoded free-tier allowance");
  } finally { unlinkSync(surface); }
}, 20000);
