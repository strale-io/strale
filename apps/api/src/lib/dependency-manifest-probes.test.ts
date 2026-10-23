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
  const cases: Array<[string, number]> = [
    ["usgs-earthquake", Math.min(...toolTimeoutsMs("usgs-earthquake-search"))],
    ["hn-algolia", Math.min(...toolTimeoutsMs("hacker-news-search"))],
    ["sudreg", Math.min(...toolTimeoutsMs("croatian-company-data"))],
    ["arxiv", Math.min(...toolTimeoutsMs("arxiv-search"))],
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
