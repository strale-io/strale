/**
 * Demand capture on the rail that actually earns.
 *
 * `failed_requests` is the table for "demand we could not serve", and until
 * 2026-08-15 only `/v1/do` wrote to it. x402 is ~99% of revenue, so the
 * paying rail recorded nothing while the table filled with our own probes —
 * which is why "unmet demand" was never usable as a build signal.
 *
 * These tests pin the properties that make the signal trustworthy: the two
 * miss kinds stay distinguishable, the write can never break the request it
 * observes, and the caller's input is never stored.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
const logWarn = vi.fn();
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
vi.mock("./log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logWarn, logError: vi.fn(),
}));
vi.mock("./attribution.js", () => ({ saltedIpHash: (ip?: string) => (ip ? "hashed" : null) }));

const { recordX402Miss } = await import("./x402-demand.js");

/** Flatten a drizzle sql template into text plus its bind values. */
function captured() {
  const q = execute.mock.calls[0]?.[0] as { queryChunks?: unknown[] } | undefined;
  const text: string[] = [];
  const params: unknown[] = [];
  const walk = (chunks: unknown[]) => {
    for (const ch of chunks) {
      const val = (ch as { value?: unknown } | null)?.value;
      const nested = (ch as { queryChunks?: unknown[] } | null)?.queryChunks;
      if (Array.isArray(val) && val.every((v) => typeof v === "string")) text.push(val.join(""));
      else if (Array.isArray(nested)) walk(nested);
      else params.push(ch);
    }
  };
  walk(q?.queryChunks ?? []);
  return { sql: text.join(""), params };
}

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue([]);
  logWarn.mockReset();
});

describe("the two misses stay distinguishable", () => {
  it("records a slug we do not sell as a catalogue signal", () => {
    recordX402Miss({ slug: "mexican-company-data", kind: "x402_unknown_slug",
      detail: "no such x402 capability", userAgent: "agent/1", ip: "1.2.3.4" });
    const { sql, params } = captured();
    expect(sql).toContain("INSERT INTO failed_requests");
    expect(params).toContain("mexican-company-data");
    expect(params).toContain("x402_unknown_slug");
  });

  it("records rejected input on a capability we DO sell as a product signal", () => {
    // Nine paying attempts at tech-stack-detect died this way in one week.
    recordX402Miss({ slug: "tech-stack-detect", kind: "x402_bad_input",
      detail: "Provide one of: url, domain" });
    const { params } = captured();
    expect(params).toContain("x402_bad_input");
    expect(params).toContain("Provide one of: url, domain");
  });

  it("tags every row to the x402 rail so it cannot be confused with /v1/do", () => {
    recordX402Miss({ slug: "x", kind: "x402_unknown_slug" });
    expect(captured().params).toContain("x402");
  });
});

describe("it never stores the caller's content", () => {
  it("has no parameter for input, because the type has no field for it", () => {
    // The slug and the error answer the question; the customer-data boundary
    // says we do not retain their content to answer a question already
    // answered. This asserts the shape rather than a value, so adding an
    // `input` field later fails here.
    recordX402Miss({ slug: "translate", kind: "x402_bad_input", detail: "bad param" });
    const { params } = captured();
    for (const p of params) {
      expect(String(p)).not.toMatch(/SIGNAL_ATLAS|<<</);
    }
    expect(params.length).toBeLessThanOrEqual(6);
  });

  it("clips an overlong error so one caller cannot bloat the table", () => {
    recordX402Miss({ slug: "s", kind: "x402_bad_input", detail: "e".repeat(5000) });
    const long = captured().params.find((p) => typeof p === "string" && (p as string).length > 100);
    expect((long as string).length).toBeLessThanOrEqual(500);
  });
});

describe("it can never break the request it is observing", () => {
  it("does not throw when the insert rejects, and logs the swallow", async () => {
    execute.mockReturnValue(Promise.reject(new Error("db down")));
    expect(() => recordX402Miss({ slug: "s", kind: "x402_unknown_slug" })).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(logWarn, "a silent recorder reads as an absence of demand").toHaveBeenCalled();
  });

  it("does not throw when the database is unavailable entirely", () => {
    execute.mockImplementation(() => { throw new Error("no db"); });
    expect(() => recordX402Miss({ slug: "s", kind: "x402_bad_input" })).not.toThrow();
    expect(logWarn).toHaveBeenCalled();
  });
});
