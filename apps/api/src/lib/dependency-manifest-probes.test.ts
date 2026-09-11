import { describe, expect, it } from "vitest";
import { PROVIDERS } from "./dependency-manifest.js";

/**
 * A reachability probe is only as honest as its list of healthy answers. When a
 * vendor's real unauthenticated answer is missing from that list, the probe
 * reports a live service as down on every run — a false alarm that reaches the
 * founder and trains everyone to ignore the channel.
 */
describe("zero-cost probe expectations match what the vendor actually answers", () => {
  it("accepts sec-api.io's unauthenticated 200 on its root", () => {
    // Observed 2026-09-11 (curl, no credentials) and in production's hourly
    // probe since at least 2026-09-06, which logged "Unexpected HTTP 200" and
    // raised "sec-api-io is not responding" 138 times in five days.
    const secApi = PROVIDERS.find((p) => p.name === "sec-api-io");
    expect(secApi?.healthProbe.skipAuth).toBe(true);
    expect(secApi?.healthProbe.healthyStatuses).toContain(200);
  });
});
