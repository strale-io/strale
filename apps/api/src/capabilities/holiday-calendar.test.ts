/**
 * Regression tests for the Nager.Date empty-body crash (2026-08-20).
 *
 * Nager.Date returns 204 No Content — an empty body with res.ok === true —
 * for ISO codes it recognizes but has no holiday data for. Thailand ('TH')
 * was the observed case: all 3 external x402 calls in the 2026-08-19→20
 * window failed with "Unexpected end of JSON input" because the executor
 * called res.json() on the empty body. The fix turns a 204 into a structured
 * "not covered" error, negative-cached so retry loops don't re-hit upstream;
 * any other unparseable body errors uncached so transient glitches retry.
 * public-holiday-lookup carried the same crash via its own duplicate fetch;
 * it now routes through the shared getHolidays().
 *
 * fetch is stubbed per test; each test uses a distinct country code because
 * the module keeps a 24h in-memory cache keyed on country+year.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDirectExecutor } from "./index.js";
import "./holiday-calendar.js";
import "./public-holiday-lookup.js";

const calendar = getDirectExecutor("holiday-calendar")!;
const lookup = getDirectExecutor("public-holiday-lookup")!;

function response(status: number, body: string): Response {
  return new Response(status === 204 ? null : body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SE_FIXTURE = JSON.stringify([
  {
    date: "2026-06-06",
    localName: "Sveriges nationaldag",
    name: "National Day of Sweden",
    fixed: true,
    global: true,
    counties: null,
    types: ["Public"],
  },
]);

describe("holiday-calendar", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("204 No Content (the TH case) yields a 'not covered' error, not a JSON parse crash", async () => {
    fetchMock.mockResolvedValue(response(204, ""));
    await expect(calendar({ country_code: "TH", year: 2026 })).rejects.toThrow(
      /Country 'TH' is not covered/
    );
    // The outcome is negative-cached: a retry throws the same structured
    // error without another upstream round trip.
    await expect(calendar({ country_code: "TH", year: 2026 })).rejects.toThrow(
      /Country 'TH' is not covered/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a 200 with an unparseable body yields a structured error", async () => {
    fetchMock.mockResolvedValue(response(200, "<html>maintenance</html>"));
    await expect(calendar({ country_code: "MY", year: 2026 })).rejects.toThrow(
      /unparseable response for 'MY'\/2026/
    );
  });

  it("an empty 200 body is a transient error, NOT negative-cached as 'not covered'", async () => {
    fetchMock.mockResolvedValue(response(200, ""));
    await expect(calendar({ country_code: "VN", year: 2026 })).rejects.toThrow(
      /unparseable response for 'VN'\/2026/
    );
    // Uncached: the next call must retry upstream.
    await expect(calendar({ country_code: "VN", year: 2026 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("404 still yields the 'not supported' error", async () => {
    fetchMock.mockResolvedValue(response(404, ""));
    await expect(calendar({ country_code: "XX", year: 2026 })).rejects.toThrow(
      /Country 'XX' not supported/
    );
  });

  it("a 200 with holiday data still returns the documented output shape", async () => {
    fetchMock.mockResolvedValue(response(200, SE_FIXTURE));
    const r = await calendar({ country_code: "SE", year: 2026 });
    expect(r.output.country_code).toBe("SE");
    expect(r.output.year).toBe(2026);
    expect(r.output.total_holidays).toBe(1);
    expect(r.output.holidays[0]).toEqual({
      date: "2026-06-06",
      name: "National Day of Sweden",
      local_name: "Sveriges nationaldag",
      type: "Public",
      fixed: true,
      global: true,
      counties: null,
    });
    expect(r.provenance.source).toBe("nager.date");
  });
});

describe("public-holiday-lookup (shares getHolidays)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("204 No Content yields the 'not covered' error instead of the pre-fix parse crash", async () => {
    fetchMock.mockResolvedValue(response(204, ""));
    await expect(lookup({ country_code: "LA", year: 2026 })).rejects.toThrow(
      /Country 'LA' is not covered/
    );
  });

  it("a 200 with holiday data still returns the documented output shape", async () => {
    fetchMock.mockResolvedValue(response(200, SE_FIXTURE));
    const r = await lookup({ country_code: "SE", year: 2027 });
    expect(r.output.country_code).toBe("SE");
    expect(r.output.total_holidays).toBe(1);
    expect(r.output.holidays[0]).toEqual({
      date: "2026-06-06",
      name: "National Day of Sweden",
      local_name: "Sveriges nationaldag",
      type: "Public",
      fixed: true,
      global: true,
    });
    expect(r.output).toHaveProperty("next_upcoming");
    expect(r.provenance.source).toBe("date.nager.at");
  });
});
