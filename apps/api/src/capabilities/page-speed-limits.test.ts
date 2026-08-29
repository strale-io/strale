/**
 * #434 — `page-speed-test` was the last sanctioned unbounded body read in the
 * caller-URL guard's ledger.
 *
 * Two properties, and the second is the unusual one:
 *
 *   1. The Lighthouse report is streamed under `MAX_PAGESPEED_REPORT_BYTES`
 *      and parsed only after the bytes are accepted.
 *   2. Crossing that cap is an UPSTREAM fault, not a caller refusal. Every
 *      other cap in this family blames the caller because the caller chose the
 *      input; here the cap sits 1.8x above the mathematical ceiling of the
 *      report format, so no page a caller can name reaches it. A response
 *      above it means Google emitted something outside its own structure —
 *      which must count against the capability rather than be excused as the
 *      caller's doing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDirectExecutor } from "./index.js";
import "./page-speed-test.js";
import {
  MAX_PAGESPEED_REPORT_BYTES,
  ResourceLimitError,
} from "../lib/resource-limits.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import {
  classifyTransactionFailure,
  countsAgainstCapability,
} from "../lib/transaction-failure-taxonomy.js";
import { streamingResponseOf } from "./lib/streaming-response-testutil.js";

const run = (inputs: Record<string, unknown> = { url: "https://example.com" }) =>
  getDirectExecutor("page-speed-test")!(inputs);

/**
 * A structurally real PSI response, padded to EXACTLY `bytes` by growing the
 * field that actually grows in life — the base64 full-page screenshot.
 */
function psiReport(bytes: number): Buffer {
  const skeleton = {
    lighthouseResult: {
      categories: { performance: { score: 0.87 } },
      audits: {
        "largest-contentful-paint": { numericValue: 2400.5 },
        "first-contentful-paint": { numericValue: 1200.25 },
        "cumulative-layout-shift": { numericValue: 0.0512 },
        "total-blocking-time": { numericValue: 310.7 },
        "speed-index": { numericValue: 3300.9 },
        "server-response-time": { numericValue: 180.4 },
        "unused-javascript": {
          title: "Reduce unused JavaScript",
          description: "Remove dead code.",
          details: { type: "opportunity", overallSavingsMs: 1234.6 },
        },
        "render-blocking-resources": {
          title: "Eliminate render-blocking resources",
          description: "Defer non-critical CSS.",
          score: 0.4,
          displayValue: "Potential savings of 900 ms",
        },
        "full-page-screenshot": { details: { screenshot: { data: "" } } },
      },
    },
  };
  const base = Buffer.byteLength(JSON.stringify(skeleton), "utf8");
  const pad = bytes - base;
  if (pad < 0) throw new Error(`psiReport: ${bytes} is smaller than the skeleton (${base})`);
  skeleton.lighthouseResult.audits["full-page-screenshot"].details.screenshot.data = "A".repeat(pad);
  const buf = Buffer.from(JSON.stringify(skeleton), "utf8");
  if (buf.byteLength !== bytes) throw new Error(`psiReport produced ${buf.byteLength}, wanted ${bytes}`);
  return buf;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.PAGESPEED_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── The output contract, unchanged ──────────────────────────────────────────

describe("a normal report still produces the same output", () => {
  it("extracts score, metrics, opportunities, diagnostics and grade", async () => {
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(40_000)).response);
    const r = (await run()) as { output: Record<string, any> };
    expect(r.output.performance_score).toBe(87);
    expect(r.output.grade).toBe("B");
    expect(r.output.metrics).toEqual({
      lcp_ms: 2401,
      fcp_ms: 1200,
      cls_score: 0.051,
      tbt_ms: 311,
      ttfb_ms: 180,
      speed_index: 3301,
    });
    expect(r.output.opportunities).toEqual([
      { title: "Reduce unused JavaScript", savings_ms: 1235, description: "Remove dead code." },
    ]);
    expect(r.output.diagnostics).toEqual([
      {
        title: "Eliminate render-blocking resources",
        description: "Defer non-critical CSS.",
        displayValue: "Potential savings of 900 ms",
      },
    ]);
  });
});

// ─── The byte boundary ───────────────────────────────────────────────────────

describe("the report is bounded", () => {
  it("accepts a report one byte under the limit", async () => {
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(MAX_PAGESPEED_REPORT_BYTES - 1)).response);
    await expect(run()).resolves.toHaveProperty("output");
  });

  it("accepts a report of EXACTLY the limit", async () => {
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(MAX_PAGESPEED_REPORT_BYTES)).response);
    await expect(run()).resolves.toHaveProperty("output");
  });

  it("refuses limit + 1", async () => {
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(MAX_PAGESPEED_REPORT_BYTES + 1)).response);
    await expect(run()).rejects.toThrow(/report larger than 24MB/);
  });

  it("refuses a declared over-limit content-length WITHOUT pulling, and cancels", async () => {
    // A small body with a huge declaration: the refusal must come from the
    // header alone. Without the early check this body would parse fine.
    const handle = streamingResponseOf(psiReport(40_000), {
      declare: MAX_PAGESPEED_REPORT_BYTES + 1,
    });
    fetchMock.mockResolvedValue(handle.response);
    await expect(run()).rejects.toThrow(/upstream fault/);
    expect(handle.pulls(), "body was pulled despite an over-limit declaration").toBe(0);
    expect(handle.cancelled(), "unconsumed body was not cancelled").toBe(true);
  });

  it("does not trust an understated content-length — the byte counter refuses", async () => {
    const handle = streamingResponseOf(psiReport(MAX_PAGESPEED_REPORT_BYTES + 65_536), {
      declare: 4096,
    });
    fetchMock.mockResolvedValue(handle.response);
    await expect(run()).rejects.toThrow(/upstream fault/);
    expect(handle.cancelled()).toBe(true);
  });

  it("enforces on actual bytes with no content-length at all", async () => {
    const handle = streamingResponseOf(psiReport(MAX_PAGESPEED_REPORT_BYTES + 65_536));
    fetchMock.mockResolvedValue(handle.response);
    await expect(run()).rejects.toThrow(/upstream fault/);
    expect(handle.cancelled(), "chunked over-limit body was not cancelled").toBe(true);
  });

  it("never reaches the parser once the cap is crossed", async () => {
    // The bytes ARE valid JSON, so a parse-then-check implementation would
    // succeed here. Only a bound-then-parse one refuses.
    const spy = vi.spyOn(JSON, "parse");
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(MAX_PAGESPEED_REPORT_BYTES + 4096)).response);
    await expect(run()).rejects.toThrow(/upstream fault/);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── Pre-existing error semantics ────────────────────────────────────────────

describe("existing failure behaviour is unchanged", () => {
  it("malformed JSON under the limit still surfaces as a parse error", async () => {
    fetchMock.mockResolvedValue(streamingResponseOf(Buffer.from("<html>not json</html>")).response);
    await expect(run()).rejects.toThrow(SyntaxError);
  });

  it("a report without lighthouseResult still says so", async () => {
    fetchMock.mockResolvedValue(streamingResponseOf(Buffer.from('{"kind":"pagespeedonline#result"}')).response);
    await expect(run()).rejects.toThrow(/did not return Lighthouse results/);
  });

  it("a non-2xx still reports the upstream status and a truncated body", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":{"code":500,"message":"Lighthouse returned error: Something went wrong."}}', {
        status: 500,
      }),
    );
    await expect(run()).rejects.toThrow(/PageSpeed Insights returned HTTP 500.*Something went wrong/s);
  });

  it("a missing url is still a caller error, before any fetch", async () => {
    await expect(run({})).rejects.toThrow(/'url' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an invalid strategy is still refused", async () => {
    await expect(run({ url: "https://example.com", strategy: "tablet" })).rejects.toThrow(
      /'strategy' must be 'mobile' or 'desktop'/,
    );
  });
});

// ─── API key policy ──────────────────────────────────────────────────────────

describe("PAGESPEED_API_KEY remains optional", () => {
  const requestedUrl = () => String(fetchMock.mock.calls[0][0]);

  it("sends the key when one is configured", async () => {
    process.env.PAGESPEED_API_KEY = "test-key-value";
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(40_000)).response);
    await run();
    expect(requestedUrl()).toContain("&key=test-key-value");
  });

  it("still calls PSI keyless when none is configured", async () => {
    // Production has run keyless for the whole 90-day window with zero 429s,
    // so removing the fallback would break a working path. Verified rather
    // than assumed: the failure evidence is 400/500/timeout, never quota.
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(40_000)).response);
    await run();
    expect(requestedUrl()).not.toContain("key=");
    expect(requestedUrl()).toContain("category=performance");
  });

  it("passes the caller's strategy through", async () => {
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(40_000)).response);
    await run({ url: "https://example.com", strategy: "desktop" });
    expect(requestedUrl()).toContain("strategy=desktop");
  });
});

// ─── Health semantics: upstream, not a caller refusal ────────────────────────

describe("an oversize report is judged an UPSTREAM fault by every consumer", () => {
  const message =
    "PageSpeed Insights returned a report larger than 24MB, beyond what Lighthouse " +
    "can produce for any page — treating it as an upstream fault.";

  it("the taxonomy classifies it upstream", () => {
    expect(classifyTransactionFailure(message)).toBe("upstream");
  });

  it("it COUNTS against the capability — a vendor anomaly is real ill health", () => {
    // The deliberate inversion of every other cap in this family. Excusing it
    // would hide a genuine upstream problem behind a size policy.
    expect(countsAgainstCapability(classifyTransactionFailure(message))).toBe(true);
  });

  it("it is not a capability refusal on the object", async () => {
    fetchMock.mockResolvedValue(streamingResponseOf(psiReport(MAX_PAGESPEED_REPORT_BYTES + 4096)).response);
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ResourceLimitError);
    expect(isCapabilityRefusal(err)).toBe(false);
  });

  it("the circuit breaker does not read it as user input", () => {
    expect(isUserInputError(message)).toBe(false);
  });

  it("NEGATIVE CONTROL: a genuine 5xx classifies upstream too, and is not reclassified", () => {
    const upstream = "PageSpeed Insights returned HTTP 500: Lighthouse returned error: Something went wrong.";
    expect(classifyTransactionFailure(upstream)).toBe("upstream");
    expect(isUserInputError(upstream)).toBe(false);
  });

  it("NEGATIVE CONTROL: the caller's own bad input stays caller_input", () => {
    const caller = "'url' is required. Provide a URL to test page speed.";
    expect(classifyTransactionFailure(caller)).toBe("caller_input");
    expect(countsAgainstCapability(classifyTransactionFailure(caller))).toBe(false);
  });
});
