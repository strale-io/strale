/**
 * Regression test for the missing-retry bug surfaced by 2026-07 x402 traffic.
 * A `us-company-data` call for "Stripe Inc" failed with "SEC EDGAR search
 * returned HTTP 500" while the identical query succeeds on retry — SEC
 * EFTS/EDGAR intermittently 5xx's and 429's under fair-access throttling. The
 * previous code surfaced the first 5xx straight to the caller.
 *
 * Post-fix: fetchSec delegates to the shared `withRetry` primitive and marks
 * bare `HTTP 5xx` retryable (the shared default only covers 502/503/504/429,
 * not the plain 500 seen in prod). Transient 5xx / 429 / network errors retry
 * once; 4xx (incl. 404) is returned unretried.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { messagesCreate, resolveByTicker, resolveByTitle } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  resolveByTicker: vi.fn(),
  resolveByTitle: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

vi.mock("../lib/sec-ticker-map.js", () => ({
  resolveByTicker,
  resolveByTitle,
}));

import { fetchSec, normalizeCompanyName, classifyNameMatch } from "./us-company-data.js";
import { getDirectExecutor } from "./index.js";

function resp(status: number): Response {
  return new Response(status === 200 ? "{}" : "", { status });
}

describe("fetchSec", () => {
  it("retries a transient 500 and returns the eventual 200 (the bug case)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resp(500))
      .mockResolvedValueOnce(resp(200));

    const r = await fetchSec("https://x", "SEC EDGAR", fetchImpl);

    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries 429 throttling", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(resp(429))
      .mockResolvedValueOnce(resp(200));

    const r = await fetchSec("https://x", "SEC EDGAR", fetchImpl);
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws after the single retry on persistent 500", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(resp(500));

    await expect(fetchSec("https://x", "SEC EDGAR", fetchImpl)).rejects.toThrow(/HTTP 500/);
    // maxRetries:1 → 2 total attempts.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 404 — passes it straight through for the caller to interpret", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(resp(404));

    const r = await fetchSec("https://x", "SEC EDGAR", fetchImpl);
    expect(r.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a transient network error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      // "fetch failed" matches withRetry's default retryable network patterns.
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(resp(200));

    const r = await fetchSec("https://x", "SEC EDGAR", fetchImpl);
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

/**
 * Regression test for the wrong-company match risk flagged in the PR #148
 * six-lens review. Name lookups resolve via SEC full-text filing search, which
 * for a private company (e.g. "Stripe Inc") returns a *different* public filer
 * that merely mentions the name. classifyNameMatch surfaces that as a low /
 * non-exact match so callers don't trust a speculative identity.
 */
describe("normalizeCompanyName", () => {
  it("strips corporate suffixes and punctuation so equivalents compare equal", () => {
    expect(normalizeCompanyName("Apple Inc.")).toBe(normalizeCompanyName("APPLE INCORPORATED"));
    expect(normalizeCompanyName("Meta Platforms, Inc.")).toBe("meta platforms");
  });
});

describe("classifyNameMatch", () => {
  it("flags exact when normalized names are equal", () => {
    expect(classifyNameMatch("Apple Inc", "Apple Inc.")).toEqual({
      match_confidence: "exact",
      is_exact_match: true,
    });
  });

  it("flags LOW when the resolved company is a different filer (the Stripe bug case)", () => {
    // "Stripe Inc" (private, no filings) resolving to some unrelated public
    // company that merely mentioned it in a filing.
    const r = classifyNameMatch("Stripe Inc", "Block, Inc.");
    expect(r.is_exact_match).toBe(false);
    expect(r.match_confidence).toBe("low");
  });

  it("flags high when two multi-token names share most tokens", () => {
    const r = classifyNameMatch("Berkshire Hathaway", "Berkshire Hathaway Energy");
    expect(r.match_confidence).toBe("high");
    expect(r.is_exact_match).toBe(false);
  });

  it("does NOT let a single-token name reach high against a different longer name", () => {
    // "Stripe" shares its one token with "Stripe Financial Holdings" (Jaccard
    // 1/2) but they are different companies — must be low, not a false high.
    expect(classifyNameMatch("Stripe", "Stripe Financial Holdings").match_confidence).toBe("low");
    expect(classifyNameMatch("Uber", "Uber Freight LLC").match_confidence).toBe("low");
  });

  it("flags low when two multi-token names share too few tokens", () => {
    // Different companies that happen to share one word.
    expect(classifyNameMatch("Meta Platforms", "Meta Materials").match_confidence).toBe("low");
  });

  it("errs toward LOW for a correct-but-abbreviated name (safe direction)", () => {
    // False "low" is acceptable; a false "exact" asserting a wrong identity is not.
    expect(classifyNameMatch("IBM", "International Business Machines Corp").match_confidence).toBe(
      "low",
    );
  });

  it("returns low, non-exact for an empty resolved name", () => {
    expect(classifyNameMatch("Anything", "")).toEqual({
      match_confidence: "low",
      is_exact_match: false,
    });
  });
});

/**
 * Regression tests for the wrong-company resolution reported 2026-08-11:
 * both `{"company":"Apple"}` and `{"company":"AAPL"}` resolved to "Apple
 * Hospitality REIT, Inc." because `searchEdgar()` (SEC EFTS full-text
 * *filing* search) ranks by filing-text relevance, not entity identity, and
 * the executor blindly took `hits[0]`.
 *
 * Post-fix resolution order: CIK → explicit `ticker` field (any casing —
 * unambiguous caller intent) → exact company title (SEC ticker map,
 * ../lib/sec-ticker-map.ts) → ticker map for generic input ONLY when the
 * raw string is already all-uppercase ticker shape → LLM name extraction +
 * EFTS search (last resort, unchanged, still gated by
 * match_confidence/allow_low_confidence).
 *
 * Title is deliberately checked BEFORE the shape-gated ticker path, and the
 * ticker path does NOT uppercase-coerce generic input: coercion made
 * ordinary names hijackable by unrelated tickers ("Ford" → FORD = Forward
 * Industries, Inc.) with the wrong identity stamped match_confidence
 * "exact" — a bypass of the DEC-20260428-B low-confidence gate.
 *
 * The ticker/title map is mocked here (`resolveByTicker`/`resolveByTitle`
 * from ../lib/sec-ticker-map.js) — its own network behaviour is covered by
 * sec-ticker-map.test.ts. `fetchCompany`'s call to data.sec.gov and
 * `searchEdgar`'s call to efts.sec.gov both go through the global `fetch`,
 * which is stubbed per-test below.
 */
describe("us-company-data — resolution order (the Apple/AAPL bug)", () => {
  const APPLE_CIK = "0000320193";
  const APPLE_SUBMISSION = {
    name: "Apple Inc.",
    cik: APPLE_CIK,
    entityType: "operating",
    sic: "3571",
    sicDescription: "Electronic Computers",
    stateOfIncorporation: "CA",
    addresses: {
      business: { street1: "ONE APPLE PARK WAY", city: "CUPERTINO", stateOrCountry: "CA", zipCode: "95014" },
    },
    ein: "942404110",
    fiscalYearEnd: "0930",
    tickers: ["AAPL"],
    exchanges: ["Nasdaq"],
  };

  const MSFT_CIK = "0000789019";
  const MSFT_SUBMISSION = {
    name: "MICROSOFT CORP",
    cik: MSFT_CIK,
    entityType: "operating",
    sic: "7372",
    sicDescription: "Services-Prepackaged Software",
    stateOfIncorporation: "WA",
    addresses: { business: { street1: "ONE MICROSOFT WAY", city: "REDMOND", stateOrCountry: "WA", zipCode: "98052" } },
    ein: "911144442",
    fiscalYearEnd: "0630",
    tickers: ["MSFT"],
    exchanges: ["Nasdaq"],
  };

  /** Stubs global fetch for fetchCompany's data.sec.gov call, keyed by CIK. */
  function stubCompanyFetch(byCik: Record<string, unknown>) {
    const fetchSpy = vi.fn(async (url: string) => {
      const m = /CIK(\d+)\.json/.exec(url);
      const data = m && byCik[m[1]];
      if (!data) return new Response("", { status: 404 });
      return new Response(JSON.stringify(data), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  }

  const exec = () => getDirectExecutor("us-company-data")!;

  beforeEach(() => {
    resolveByTicker.mockReset();
    resolveByTitle.mockReset();
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('"AAPL" resolves to Apple\'s CIK via the exact ticker map, WITHOUT calling Anthropic', async () => {
    resolveByTicker.mockResolvedValueOnce({ cik: APPLE_CIK, title: "Apple Inc.", ticker: "AAPL" });
    stubCompanyFetch({ [APPLE_CIK]: APPLE_SUBMISSION });

    const result = await exec()({ company: "AAPL" });

    expect(result.output.cik).toBe(APPLE_CIK);
    expect(result.output.company_name).toBe("Apple Inc.");
    expect(result.output.match_confidence).toBe("exact");
    expect(result.output.resolution_method).toBe("ticker");
    expect(resolveByTicker).toHaveBeenCalledWith("AAPL");
    expect(messagesCreate).not.toHaveBeenCalled();
    // Title is consulted first for generic input (anti-hijack ordering);
    // "AAPL" has no title entry, so the mock's default undefined return
    // correctly falls through to the ticker path.
    expect(resolveByTitle).toHaveBeenCalledWith("AAPL");
  });

  it('"Apple" resolves to Apple\'s CIK via the exact title map (ticker miss, title hit), WITHOUT calling Anthropic', async () => {
    resolveByTicker.mockResolvedValueOnce(null); // "APPLE" is not a ticker
    resolveByTitle.mockResolvedValueOnce({ cik: APPLE_CIK, title: "Apple Inc.", ticker: "AAPL" });
    stubCompanyFetch({ [APPLE_CIK]: APPLE_SUBMISSION });

    const result = await exec()({ company: "Apple" });

    expect(result.output.cik).toBe(APPLE_CIK);
    expect(result.output.match_confidence).toBe("exact");
    expect(result.output.resolution_method).toBe("title");
    expect(resolveByTitle).toHaveBeenCalledWith("Apple");
    expect(messagesCreate).not.toHaveBeenCalled();
    // Mixed-case input never reaches the generic ticker path (anti-hijack
    // gate) — and the title hit short-circuits resolution anyway.
    expect(resolveByTicker).not.toHaveBeenCalled();
  });

  it('REGRESSION (six-lens HIGH-1): "Ford" must NOT resolve via the FORD ticker (Forward Industries hijack)', async () => {
    // Pre-fix, looksLikeTicker uppercased the input, so "Ford" → "FORD" hit
    // the ticker map — FORD is Forward Industries, Inc., not Ford Motor Co —
    // and the wrong identity shipped with match_confidence "exact",
    // bypassing the DEC-20260428-B gate. Post-fix, mixed-case generic input
    // skips the ticker map entirely and takes the LLM+EFTS fallback.
    const FORD_MOTOR_CIK = "0000037996";
    resolveByTitle.mockResolvedValueOnce(null); // "ford" ≠ normalized "ford motor"
    resolveByTicker.mockResolvedValueOnce({
      cik: "0000038264",
      title: "FORWARD INDUSTRIES, INC.",
      ticker: "FORD",
    }); // would be the hijack if consulted — must never be called
    messagesCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "Ford Motor Company" }] });
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("efts.sec.gov")) {
        return new Response(
          JSON.stringify({ hits: { hits: [{ _source: { ciks: [FORD_MOTOR_CIK] } }] } }),
          { status: 200 },
        );
      }
      const m = /CIK(\d+)\.json/.exec(url);
      if (m?.[1] === FORD_MOTOR_CIK) {
        return new Response(
          JSON.stringify({ name: "Ford Motor Co", cik: FORD_MOTOR_CIK, entityType: "operating" }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await exec()({ company: "Ford" });

    expect(resolveByTicker).not.toHaveBeenCalled();
    expect(result.output.cik).toBe(FORD_MOTOR_CIK);
    expect(result.output.company_name).toBe("Ford Motor Co");
    expect(result.output.resolution_method).toBe("search");
  });

  it('explicit {"ticker":"aapl"} resolves via the ticker map regardless of casing (declared intent)', async () => {
    resolveByTicker.mockResolvedValueOnce({ cik: APPLE_CIK, title: "Apple Inc.", ticker: "AAPL" });
    stubCompanyFetch({ [APPLE_CIK]: APPLE_SUBMISSION });

    const result = await exec()({ ticker: "aapl" });

    expect(result.output.cik).toBe(APPLE_CIK);
    expect(result.output.resolution_method).toBe("ticker");
    expect(result.output.match_confidence).toBe("exact");
    expect(resolveByTicker).toHaveBeenCalledWith("aapl");
    // Explicit field intent — no title lookup, no LLM.
    expect(resolveByTitle).not.toHaveBeenCalled();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('"Apple Inc." resolves via the exact title map', async () => {
    resolveByTitle.mockResolvedValueOnce({ cik: APPLE_CIK, title: "Apple Inc.", ticker: "AAPL" });
    stubCompanyFetch({ [APPLE_CIK]: APPLE_SUBMISSION });

    const result = await exec()({ company: "Apple Inc." });

    expect(result.output.cik).toBe(APPLE_CIK);
    expect(result.output.match_confidence).toBe("exact");
    expect(messagesCreate).not.toHaveBeenCalled();
    // "Apple Inc." contains a space, so it never looked like a ticker.
    expect(resolveByTicker).not.toHaveBeenCalled();
  });

  it('"MSFT" resolves to Microsoft\'s CIK via the exact ticker map', async () => {
    resolveByTicker.mockResolvedValueOnce({ cik: MSFT_CIK, title: "MICROSOFT CORP", ticker: "MSFT" });
    stubCompanyFetch({ [MSFT_CIK]: MSFT_SUBMISSION });

    const result = await exec()({ company: "MSFT" });

    expect(result.output.cik).toBe(MSFT_CIK);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('still refuses "Stripe" (private company, no SEC filings of its own) even after the ticker/title map fix', async () => {
    // Neither the ticker nor the title map has an entry for a private company.
    resolveByTicker.mockResolvedValueOnce(null);
    resolveByTitle.mockResolvedValueOnce(null);
    // Falls through to the LLM+EFTS path: extraction succeeds, but EFTS's
    // top hit is a different public filer that merely mentions "Stripe".
    messagesCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "Stripe" }] });
    const BLOCK_CIK = "0001091883";
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("efts.sec.gov")) {
        return new Response(
          JSON.stringify({ hits: { hits: [{ _source: { ciks: [BLOCK_CIK] } }] } }),
          { status: 200 },
        );
      }
      const m = /CIK(\d+)\.json/.exec(url);
      if (m?.[1] === BLOCK_CIK) {
        return new Response(
          JSON.stringify({ name: "Block, Inc.", cik: BLOCK_CIK, entityType: "operating" }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(exec()({ company: "Stripe" })).rejects.toThrow(
      /No confident SEC EDGAR match for "Stripe"/,
    );
  });

  it("falls through cleanly to the LLM+EFTS path when the ticker/title map is unavailable (does not throw)", async () => {
    // Simulates a ticker-map load failure: resolveByTicker/resolveByTitle
    // already swallow the failure internally (sec-ticker-map.test.ts covers
    // that directly) and return null — this proves the executor treats that
    // null as "try the next path" rather than surfacing an error.
    resolveByTicker.mockResolvedValueOnce(null);
    resolveByTitle.mockResolvedValueOnce(null);
    messagesCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "Apple" }] });

    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("efts.sec.gov")) {
        return new Response(
          JSON.stringify({ hits: { hits: [{ _source: { ciks: [APPLE_CIK] } }] } }),
          { status: 200 },
        );
      }
      const m = /CIK(\d+)\.json/.exec(url);
      if (m?.[1] === APPLE_CIK) {
        return new Response(JSON.stringify(APPLE_SUBMISSION), { status: 200 });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await exec()({ company: "Apple" });
    expect(result.output.cik).toBe(APPLE_CIK);
    expect(messagesCreate).toHaveBeenCalledOnce();
  });
});
