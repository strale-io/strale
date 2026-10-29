/**
 * POST /v1/do rate limiting: per key for valid keys, per IP for everyone else.
 *
 * Clay, Zapier and n8n send many customers' keyed calls from a few shared IPs.
 * The 60/min IP limit used to run before auth, so their keyed traffic shared
 * one IP bucket. A valid key now skips the IP bucket and is limited per key
 * (DEC-21, 10 req/s); no key and an invalid key stay IP-limited (S-5).
 */
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID = new Map<string, { user: { id: string }; apiKeyId: string }>();
vi.mock("./api-keys.js", () => ({
  authenticateApiKey: vi.fn(async (key: string) => VALID.get(key) ?? null),
}));

const { authMiddleware, optionalAuthIpLimitedUnlessKeyed, optionalAuthMiddleware } = await import("./middleware.js");
const { rateLimitByKey } = await import("./rate-limit.js");
const { authenticateApiKey } = await import("./api-keys.js");

// The same chain POST /v1/do mounts, in front of a handler that only says who
// the caller was.
function makeApp() {
  const app = new Hono();
  app.post("/v1/do", optionalAuthIpLimitedUnlessKeyed(60, 60_000), rateLimitByKey(10, 1000), (c) =>
    c.json({ user: (c.get("user" as never) as { id: string } | undefined)?.id ?? null }));
  return app;
}

let ipCounter = 0;
function freshIp() { ipCounter++; return `198.51.100.${ipCounter % 250}`; }

async function call(app: Hono, ip: string, key?: string) {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (key !== undefined) headers.Authorization = `Bearer ${key}`;
  return app.request("/v1/do", { method: "POST", headers });
}

function validKey(): string {
  const key = `sk_live_${Math.random().toString(36).slice(2)}`;
  VALID.set(key, { user: { id: `user-${key}` }, apiKeyId: `key-${key}` });
  return key;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
  vi.mocked(authenticateApiKey).mockClear();
});

describe("POST /v1/do rate limits", () => {
  it("lets a keyed burst from one IP pass up to the key limit, then limits the key", async () => {
    const app = makeApp();
    const ip = freshIp();
    const key = validKey();
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await call(app, ip, key)).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    const limited = await call(app, ip, key);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("X-RateLimit-Limit")).toBe("10");
  });

  it("does not share one IP bucket across many keys behind an integration platform's IP", async () => {
    const app = makeApp();
    const ip = freshIp();
    const keys = Array.from({ length: 8 }, validKey);
    // 80 keyed calls from one IP inside a minute, each key under its own limit.
    const statuses = [];
    for (let round = 0; round < 10; round++) {
      for (const key of keys) statuses.push((await call(app, ip, key)).status);
      vi.advanceTimersByTime(1_000);
    }
    expect(statuses.filter((s) => s !== 200)).toEqual([]);
    // And none of them spent the IP's anonymous allowance.
    expect((await call(app, ip)).headers.get("X-RateLimit-Remaining")).toBe("59");
  });

  it("limits an unkeyed burst per IP", async () => {
    const app = makeApp();
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 61; i++) statuses.push((await call(app, ip)).status);
    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(200));
    expect(statuses[60]).toBe(429);
  });

  it("limits an invalid key per IP, and answers 429 once the IP's bucket is full", async () => {
    const app = makeApp();
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 61; i++) statuses.push((await call(app, ip, "sk_live_not_a_real_key")).status);
    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(401));
    expect(statuses[60]).toBe(429);
  });

  it("counts invalid keys and anonymous calls in the same IP bucket", async () => {
    const app = makeApp();
    const ip = freshIp();
    for (let i = 0; i < 30; i++) await call(app, ip);
    for (let i = 0; i < 30; i++) expect((await call(app, ip, "not-even-sk-live")).status).toBe(401);
    expect((await call(app, ip)).status).toBe(429);
    expect((await call(app, ip, "sk_live_junk")).status).toBe(429);
    // A malformed key never reaches the key lookup.
    expect(vi.mocked(authenticateApiKey).mock.calls.every(([key]) => key.startsWith("sk_live_"))).toBe(true);
  });

  it.each([["Basic dXNlcjpwYXNz"], ["Bearer "], ["bearer sk_live_lowercase_scheme"]])("counts Authorization %j against the IP bucket", async (header) => {
    const app = makeApp();
    const ip = freshIp();
    const send = () => app.request("/v1/do", { method: "POST", headers: { "x-forwarded-for": ip, Authorization: header } });
    for (let i = 0; i < 60; i++) expect((await send()).status).not.toBe(429);
    expect((await send()).status).toBe(429);
  });

  it.each(["${STRALE_API_KEY}", "<your-key>", "YOUR_API_KEY", ""])(
    "serves placeholder key %j anonymously, from the same IP bucket as no key, without a key lookup",
    async (placeholder) => {
      const app = makeApp();
      const ip = freshIp();
      const res = await call(app, ip, placeholder);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ user: null });
      expect(vi.mocked(authenticateApiKey)).not.toHaveBeenCalled();
      for (let i = 0; i < 29; i++) await call(app, ip, placeholder);
      for (let i = 0; i < 30; i++) expect((await call(app, ip)).status).toBe(200);
      expect((await call(app, ip, placeholder)).status).toBe(429);
    },
  );

  it.each(["sk_live_${STRALE_API_KEY}", "not-a-key", "sk_test_abc"])("still refuses malformed key %j", async (key) => {
    const res = await call(makeApp(), freshIp(), key);
    expect(res.status).toBe(401);
    expect((await res.json()).error_code).toBe("unauthorized");
  });

  it("still serves a valid key from an IP whose anonymous bucket is full", async () => {
    const app = makeApp();
    const ip = freshIp();
    for (let i = 0; i < 61; i++) await call(app, ip);
    expect((await call(app, ip)).status).toBe(429);
    const key = validKey();
    const res = await call(app, ip, key);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: `user-${key}` });
  });

  it("is the chain POST /v1/do actually mounts", () => {
    const src = readFileSync(new URL("../routes/do.ts", import.meta.url), "utf8");
    const route = src.slice(src.indexOf('doRoute.post(\n  "/do"'), src.indexOf("async (c) =>", src.indexOf('doRoute.post(\n  "/do"')));
    expect(route).toMatch(/optionalAuthIpLimitedUnlessKeyed\(60, 60_000\),[\s\S]*rateLimitByKey\(10, 1000\)/);
    expect(route).not.toMatch(/rateLimitByIp\(/);
    expect(route).not.toMatch(/optionalAuthMiddleware/);
  });
});

// The other two bearer readers: a placeholder is the same as no header.
describe("authMiddleware and optionalAuthMiddleware with a placeholder key", () => {
  const who = (c: any) => c.json({ user: c.get("user")?.id ?? null });
  const send = (app: Hono, header?: string) =>
    app.request("/x", { headers: header === undefined ? {} : { Authorization: header } });

  it.each(["Bearer ${STRALE_API_KEY}", "Bearer <your-key>", "Bearer "])("optionalAuthMiddleware proceeds anonymously on %j", async (header) => {
    const app = new Hono().get("/x", optionalAuthMiddleware, who);
    const res = await send(app, header);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it("optionalAuthMiddleware still refuses a malformed key", async () => {
    const app = new Hono().get("/x", optionalAuthMiddleware, who);
    expect((await send(app, "Bearer not-a-key")).status).toBe(401);
  });

  it("authMiddleware answers a placeholder exactly like a missing header", async () => {
    const app = new Hono().get("/x", authMiddleware, who);
    const missing = await send(app);
    const placeholder = await send(app, "Bearer ${STRALE_API_KEY}");
    expect(placeholder.status).toBe(401);
    expect(await placeholder.json()).toEqual(await missing.json());
  });
});
