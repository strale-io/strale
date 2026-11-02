import { test } from "node:test";
import assert from "node:assert/strict";
import { probe } from "./boot-probe.mjs";
const commit = "a".repeat(40);
const good = { health: { status: "ok", commit: commit.slice(0, 12) }, deep: { status: "ok", write_path: "ok" }, capabilities: { capabilities: [{ slug: "fixture" }] } };
function fetcher(overrides = {}) {
  return async (url) => {
    const key = url.endsWith("/health") ? "health" : url.endsWith("/deep") ? "deep" : "capabilities";
    return { status: 200, json: async () => ({ ...good, ...overrides })[key] };
  };
}
const opts = { startedAt: 0, commit, now: () => 1, pause: async () => {}, minimum: 1 };
test("checks commit, DB write health, catalogue, and records elapsed time", async () => {
  assert.equal((await probe({ ...opts, fetchFn: fetcher() })).boot_ms, 1);
});
for (const [name, change] of [
  ["wrong commit", { health: { status: "ok", commit: "bad" } }],
  ["unhealthy DB", { deep: { status: "degraded", write_path: "failed" } }],
  ["empty catalogue", { capabilities: { capabilities: [] } }],
]) test(`rejects ${name}`, async () => {
  await assert.rejects(probe({ ...opts, fetchFn: fetcher(change) }));
});
test("fails beyond the 30-second CI window", async () => {
  await assert.rejects(probe({ ...opts, now: () => 30_001, fetchFn: fetcher() }), /30000ms/);
});
test("does not poll deep health while waiting for listen (avoids its rate limit)", async () => {
  let t = 0;
  const urls = [];
  await assert.rejects(probe({ ...opts, now: () => t, pause: async () => { t += 1000; }, fetchFn: async (url) => { urls.push(url); throw new Error("refused"); } }));
  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => url.endsWith("/health")));
});
