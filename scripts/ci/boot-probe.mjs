// Run INSIDE the production container via docker exec, with its normal CMD
// still running. No host-network route is needed on the internal network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

export async function probe({ startedAt, commit, fetchFn = fetch, now = Date.now, pause = setTimeout, minimum }) {
  assert.match(commit, /^[0-9a-f]{40}$/);
  assert.ok(Number.isFinite(startedAt));
  // CI boot budget; slow boots warn separately in the workflow.
  const budgetMs = 30_000;
  let health;
  while (now() - startedAt < budgetMs) {
    try {
      const response = await fetchFn("http://127.0.0.1:3000/health", { signal: AbortSignal.timeout(500) });
      if (response.status === 200) { health = await response.json(); break; }
    } catch { /* Refused connections are expected until serve() listens. */ }
    await pause(100);
  }
  const bootMs = now() - startedAt;
  assert.ok(health && bootMs <= budgetMs, `Boot did not listen within the ${budgetMs}ms window (${bootMs}ms)`);
  assert.equal(health.status, "ok");
  assert.equal(health.commit, commit.slice(0, 12));
  const deep = await fetchFn("http://127.0.0.1:3000/health/deep", { signal: AbortSignal.timeout(3000) });
  assert.equal(deep.status, 200);
  const deepBody = await deep.json();
  assert.equal(deepBody.status, "ok");
  assert.equal(deepBody.write_path, "ok");
  const catalogue = await fetchFn("http://127.0.0.1:3000/v1/capabilities", { signal: AbortSignal.timeout(3000) });
  assert.equal(catalogue.status, 200);
  const body = await catalogue.json();
  assert.ok(Array.isArray(body.capabilities) && body.capabilities.length >= minimum,
    `Catalogue must contain >= ${minimum} entries; got ${body.capabilities?.length}`);
  return { boot_ms: bootMs, commit: health.commit, catalogue_count: body.capabilities.length, minimum_executors: minimum, deep: deepBody };
}

// stdin execution has no file argument; imports by the unit tests do.
if (process.argv[1] === "-") {
  const source = readFileSync("apps/api/src/index.ts", "utf8");
  const minimum = Number(source.match(/const MIN_EXPECTED_EXECUTORS = (\d+);/)?.[1]);
  assert.ok(minimum > 0, "Cannot read executor health-gate minimum from index.ts");
  console.log(JSON.stringify(await probe({ startedAt: Date.parse(process.argv[2]), commit: process.argv[3], minimum })));
}
