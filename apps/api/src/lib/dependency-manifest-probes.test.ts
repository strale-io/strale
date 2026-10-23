import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/** Every `AbortSignal.timeout(n)` in a capability's executor file. */
function toolTimeoutsMs(slug: string): number[] {
  const src = readFileSync(resolve(import.meta.dirname, "../capabilities", `${slug}.ts`), "utf8");
  return [...src.matchAll(/AbortSignal\.timeout\(\s*([\d_]+)\s*\)/g)].map((m) => Number(m[1].replace(/_/g, "")));
}

/**
 * PROBE_TIMEOUT_MATCHES_TOOL. A probe that gives up sooner than the tool it
 * guards calls a slow-but-working source down. Measured over 7 days to
 * 2026-10-23: Hacker News search failed 19 probes at its 5s limit while its
 * tool (8s) failed 0 of 58 real calls; USGS's 6s probe failed ~10% of runs
 * against a 12s tool. The listed sources are the ones whose probe failures
 * were timeouts; the rest of the manifest is not yet aligned.
 */
describe("a probe does not give up sooner than the tool it guards", () => {
  const VIES_TOOL_TIMEOUT_MS = 15_000; // lib/vat-providers/vies.ts, not a capability file
  // The longest call each tool makes to the source: croatian-company-data's
  // token call is 10s but its data call — the one the probe resembles — is 15s.
  const cases: Array<[string, number]> = [
    ["usgs-earthquake", Math.max(...toolTimeoutsMs("usgs-earthquake-search"))],
    ["hn-algolia", Math.max(...toolTimeoutsMs("hacker-news-search"))],
    ["sudreg", Math.max(...toolTimeoutsMs("croatian-company-data"))],
    ["arxiv", Math.max(...toolTimeoutsMs("arxiv-search"))],
    ["vies", VIES_TOOL_TIMEOUT_MS],
  ];

  it.each(cases)("%s probe waits at least as long as its tool (%i ms)", (name, toolMs) => {
    expect(Number.isFinite(toolMs)).toBe(true);
    const probe = PROVIDERS.find((p) => p.name === name)?.healthProbe;
    expect(probe?.timeoutMs).toBeGreaterThanOrEqual(toolMs);
  });

  it("still reads VIES's tool timeout from where it lives", () => {
    const src = readFileSync(resolve(import.meta.dirname, "../capabilities/lib/vat-providers/vies.ts"), "utf8");
    expect(src).toMatch(new RegExp(`AbortSignal\\.timeout\\(${VIES_TOOL_TIMEOUT_MS}\\)`));
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
