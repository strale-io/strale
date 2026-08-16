/**
 * Regression tests for what the 2026-08-16 post-deploy verification found.
 *
 * The deploy checks passed on their own terms — the card stopped advertising
 * dead endpoints, the retention repair landed, the chain still verifies — but
 * production then contradicted three things the code believed about itself.
 * Each of those is locked out below.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const readCode = (rel: string) =>
  readFileSync(join(HERE, "..", rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── "unmet demand" must not mean "we sell it, just not for USDC" ───────────
describe("x402 demand signal", () => {
  const gw = readCode("routes/x402-gateway-v2.ts");

  it("separates a slug we do not sell from one that is merely off this rail", () => {
    // After the card stopped advertising unservable endpoints, the misses did
    // NOT stop: 202 in 24 hours, and every missed slug was a real capability
    // or solution of ours, probed by third-party discovery crawlers walking
    // our public catalogue — which lists everything regardless of rail. Filed
    // as "unknown slug", those read as demand for what we already sell.
    expect(readCode("lib/x402-demand.ts")).toMatch(/"x402_not_on_rail"/);
    const misses = gw.match(/recordX402Miss\(\{[^}]*kind:[^,]*/g) ?? [];
    expect(misses.length).toBeGreaterThanOrEqual(3);
    const slugMisses = misses.filter((m) => /unknown_slug/.test(m));
    expect(slugMisses.length).toBeGreaterThan(0);
    for (const m of slugMisses) {
      expect(m, "an unknown-slug miss must first check whether we know the slug")
        .toMatch(/known \? "x402_not_on_rail" : "x402_unknown_slug"/);
    }
  });

  it("the known-slug lookup is cached and fails toward the quieter answer", () => {
    // This runs on an unauthenticated route that crawlers hammer, so an
    // uncached lookup would be a DB round-trip per stray 404. And on failure
    // it must return true: an unclassified miss recorded as "unknown" is a
    // false build signal, which is the harm being fixed.
    const fn = gw.slice(gw.indexOf("async function isKnownSlug"));
    expect(fn).toMatch(/KNOWN_SLUG_TTL_MS/);
    expect(fn.slice(0, fn.indexOf("return _knownSlugs.has"))).toMatch(/catch\s*\{[\s\S]*?return true;/);
  });
});

// ── a public integrity endpoint must not contradict its own structured field ─
describe("verify: redaction prose", () => {
  const src = readCode("routes/verify.ts");

  it("recognises the renamed retention reason in prose, not just in the tally", () => {
    // Live response, 2026-08-16: `deletion_reason: "content_retention_purge"`
    // sitting beside `redaction_reason: "...deletion_reason unknown — flagged
    // for operator review"`. The rename updated the counter and left the prose
    // behind.
    const fn = src.slice(src.indexOf("function redactionReasonText"));
    const body = fn.slice(0, fn.indexOf("Unknown reason") > 0 ? fn.indexOf("Unknown reason") : 2000);
    expect(body).toMatch(/isRetentionReason\(reason\)/);
    expect(body).not.toMatch(/if \(reason === "retention_purge"\)/);
  });

  it("explains to a reader that the record itself survived", () => {
    // The 90-day sweep redacts content and leaves the row readable. Someone
    // following an audit URL needs that said plainly, not inferred.
    expect(src).toMatch(/content_retention_purge/);
    expect(readCode("routes/verify.ts")).toMatch(/still readable/);
  });
});

// ── an audited backlog figure production has since falsified ────────────────
describe("data-retention: the DEC-20260504-B audit note", () => {
  it("records what the sweep actually did, not only what was predicted", () => {
    // Predicted 3,032. The first sweep after the .count fix redacted 173,000.
    // The contradiction was visible before the deploy — the narrower selector
    // had been audited at 57,345, and a widened selector is a strict superset
    // — and it was waved through because the smaller number was convenient.
    const src = readFileSync(join(HERE, "data-retention.ts"), "utf8");
    expect(src).toMatch(/173,000/);
    expect(src).toMatch(/MAX_BATCHES_PER_RUN is what made the miss survivable/);
  });
});
