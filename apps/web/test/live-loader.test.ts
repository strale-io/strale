// The live loader against a local API with the real wire shapes (test/mock-api.ts).
process.env.STRALE_OPS_INTERVAL_MS = "0";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLive, getJson } from "../src/lib/load-live.ts";
import { startMockApi } from "./mock-api.ts";

test("loadLive reads every endpoint the site needs and keys them by slug", async () => {
  const { server, base, requests } = await startMockApi();
  try {
    const d = await loadLive(base);
    assert.ok(d.capabilities.length > 10);
    assert.equal(d.solutions[0].slug, "fixture-company-check");
    assert.deepEqual(d.solutions[0].detail?.example_input, { company_number: "00445790" });
    assert.equal(d.solutions[0].detail?.steps.length, 3);
    assert.equal(d.x402.network, "base");
    assert.equal(d.trust.size, d.capabilities.length);
    assert.equal(d.limitations.size, d.capabilities.length);
    assert.match(d.limitations.get("uk-company-data")![0].title!, /uk-company-data/);
    assert.equal(d.solutionLimitations.get("fixture-company-check")![0].step, "sanctions-check");
    for (const p of ["/v1/platform/facts", "/v1/capabilities", "/v1/solutions", "/x402/catalog", "/v1/public/ops/trust/capabilities/batch"]) assert.ok(requests.includes(p), p);
  } finally {
    server.close();
  }
});

test("a missing endpoint fails the build with the URL in the message", async () => {
  const { server, base } = await startMockApi();
  try {
    await assert.rejects(getJson(base, "/v1/nope"), /could not read .*\/v1\/nope: .*404/);
  } finally {
    server.close();
  }
});
