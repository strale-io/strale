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

describe("metered free APIs are probed with a call that costs nothing", () => {
  it("probes OpenAlex with a single-record lookup, not a metered search or list", () => {
    // OpenAlex bills searches ($0.001) and lists ($0.0001) against a $0.10/day
    // keyless budget shared per IP; single-record lookups cost $0. The search
    // probe, run ~1,000 times a day, exhausted the budget by ~02:15 UTC every
    // day from at least 2026-09-24, so OpenAlex answered 429 — to the probe
    // and to customer calls alike — for the remaining ~21 hours.
    const openalex = PROVIDERS.find((p) => p.name === "openalex");
    const path = openalex?.healthProbe.path ?? "";
    expect(path).toMatch(/^\/works\/W\d+\?/);
    expect(path).not.toMatch(/[?&](search|filter)=/);
  });

  it("lists every capability that calls OpenAlex, so its outages skip and count them", () => {
    const openalex = PROVIDERS.find((p) => p.name === "openalex");
    expect(openalex?.capabilities).toEqual(
      expect.arrayContaining(["academic-paper-search", "paper-details", "citation-graph"]),
    );
  });
});
