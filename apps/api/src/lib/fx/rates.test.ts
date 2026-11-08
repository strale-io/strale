import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock("../safe-fetch.js", () => ({ safeFetch: safeFetchMock, discardBody: vi.fn(async () => undefined) }));

import { __resetFxRateCachesForTests, getEcbReferenceRates, getFrankfurterCurrencies, getFrankfurterRate, getFrankfurterSeries } from "./rates.js";
import { classifyFailure } from "../failure-classifier.js";
import { classifyTransactionFailure } from "../transaction-failure-taxonomy.js";

const XML = `<?xml version="1.0"?><Envelope><Cube><Cube time="2026-11-06"><Cube currency="USD" rate="1.2"/><Cube currency="SEK" rate="12"/></Cube></Cube></Envelope>`;
const response = (body: string, status = 200) => new Response(body, { status });
const expectUpstream = async (promise: Promise<unknown>) => {
  const error = await promise.catch((value) => value as Error) as Error;
  expect(classifyTransactionFailure(error.message)).toBe("upstream");
  expect(classifyFailure(error.message, false, false, "known_answer", {}).verdict).toMatch(/^upstream_/);
};

beforeEach(() => {
  __resetFxRateCachesForTests();
  safeFetchMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T16:30:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("ECB daily rates", () => {
  it("shares one in-flight daily-file fetch and parses EUR plus published currencies", async () => {
    safeFetchMock.mockResolvedValue(response(XML));
    const [a, b] = await Promise.all([getEcbReferenceRates(), getEcbReferenceRates()]);
    expect(a.rates.get("EUR")).toBe(1);
    expect(b.rates.get("USD")).toBe(1.2);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(String(safeFetchMock.mock.calls[0][0])).toContain("eurofxref-daily.xml");
    expect(String(safeFetchMock.mock.calls[0][0])).not.toContain("data-api.ecb.europa.eu");
  });

  it("serves a last good copy after refresh failure and marks it stale after the next publication", async () => {
    safeFetchMock.mockResolvedValueOnce(response(XML)).mockRejectedValueOnce(new Error("timeout"));
    await getEcbReferenceRates();
    vi.setSystemTime(new Date("2026-11-09T16:30:00Z"));
    await expect(getEcbReferenceRates()).resolves.toMatchObject({ date: "2026-11-06", stale: true });
  });

  it("backs off for five minutes after a failed refresh", async () => {
    safeFetchMock.mockRejectedValue(new Error("timeout"));
    await expect(getEcbReferenceRates()).rejects.toThrow("timeout");
    await expect(getEcbReferenceRates()).rejects.toThrow("timeout");
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails when no good copy exists", async () => {
    safeFetchMock.mockRejectedValue(new Error("timeout"));
    await expect(getEcbReferenceRates()).rejects.toThrow("timeout");
  });

  it("does not serve a last good copy beyond four days", async () => {
    // Fetched two days after its rate date: past four days of the rate date
    // but inside four days of the fetch, so only a rate-date window refuses it.
    vi.setSystemTime(new Date("2026-11-08T16:30:00Z"));
    safeFetchMock.mockResolvedValueOnce(response(XML)).mockRejectedValueOnce(new Error("refresh failed"));
    await getEcbReferenceRates();
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
    await expect(getEcbReferenceRates()).rejects.toThrow("refresh failed");
  });

  it("caps an oversized XML response", async () => {
    safeFetchMock.mockResolvedValue(response("x".repeat(4 * 1024 * 1024 + 1)));
    await expectUpstream(getEcbReferenceRates());
  });
});

describe("Frankfurter blended rate", () => {
  it("caches each pair for an hour", async () => {
    safeFetchMock.mockResolvedValue(response(JSON.stringify({ date: "2026-11-06", base: "NGN", quote: "KWD", rate: 0.00022 })));
    await getFrankfurterRate("NGN", "KWD");
    await getFrankfurterRate("NGN", "KWD");
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { date: "2026-11-06", base: "NGN", quote: "USD", rate: 1 },
    { date: "2026-11-06", base: "NGN", quote: "KWD", rate: 0 },
  ])("rejects invalid or mismatched answer %#", async (answer) => {
    safeFetchMock.mockResolvedValue(response(JSON.stringify(answer)));
    await expectUpstream(getFrankfurterRate("NGN", "KWD"));
  });

  it.each(["null", "not-json"])("classifies %s bodies as upstream failures", async (body) => {
    safeFetchMock.mockResolvedValue(response(body));
    await expectUpstream(getFrankfurterRate("NGN", "KWD"));
  });
});

describe("Frankfurter currency list", () => {
  it("reads ISO codes from the array answer", async () => {
    safeFetchMock.mockResolvedValue(response(JSON.stringify([{ iso_code: "NGN" }, { iso_code: "AAVE" }, { iso_code: "KWD" }])));
    expect([...(await getFrankfurterCurrencies())].sort()).toEqual(["KWD", "NGN"]);
  });

  it("refuses an object answer instead of caching its keys as codes", async () => {
    safeFetchMock.mockResolvedValue(response(JSON.stringify({ error: "maintenance" })));
    await expect(getFrankfurterCurrencies()).rejects.toThrow("Frankfurter currency list unavailable");
  });
});

describe("Frankfurter blended series", () => {
  const valid = { date: "2026-11-01", base: "NGN", quote: "KWD", rate: 0.00022 };

  it("uses the uncached v2 range endpoint with the series limits", async () => {
    safeFetchMock.mockImplementation(async () => response(JSON.stringify([valid])));
    await getFrankfurterSeries("NGN", "KWD", "2026-11-01", "2026-11-02");
    await getFrankfurterSeries("NGN", "KWD", "2026-11-01", "2026-11-02");
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
    expect(safeFetchMock.mock.calls[0]).toEqual(expect.arrayContaining([
      "https://api.frankfurter.dev/v2/rates?base=NGN&quotes=KWD&from=2026-11-01&to=2026-11-02",
      expect.objectContaining({ timeoutMs: 10_000, acquisitionMethod: "vendor_api" }),
    ]));
  });

  it("accepts a leading publication before the requested start date", async () => {
    const points = [
      { date: "2025-02-28", base: "GBP", quote: "NGN", rate: 1900 },
      { date: "2025-03-02", base: "GBP", quote: "NGN", rate: 1910 },
      { date: "2025-03-03", base: "GBP", quote: "NGN", rate: 1920 },
      { date: "2025-03-04", base: "GBP", quote: "NGN", rate: 1930 },
    ];
    safeFetchMock.mockResolvedValue(response(JSON.stringify(points)));

    await expect(getFrankfurterSeries("GBP", "NGN", "2025-03-01", "2025-03-04")).resolves.toEqual(points);
  });

  it("accepts a single earlier publication for a weekend-only range", async () => {
    const point = { date: "2025-02-28", base: "USD", quote: "VES", rate: 64.2 };
    safeFetchMock.mockResolvedValue(response(JSON.stringify([point])));

    await expect(getFrankfurterSeries("USD", "VES", "2025-03-01", "2025-03-02")).resolves.toEqual([point]);
  });

  it.each([
    [
      { ...valid, date: "2026-11-01" },
      { ...valid, date: "2026-10-31" },
    ],
    [{ ...valid, date: "2026-11-03" }],
  ])("rejects a misplaced earlier point or a point after the end as upstream", async (...points) => {
    safeFetchMock.mockResolvedValue(response(JSON.stringify(points)));
    await expectUpstream(getFrankfurterSeries("NGN", "KWD", "2026-11-01", "2026-11-02"));
  });

  it.each([
    { ...valid, quote: "USD" },
    { ...valid, rate: 0 },
    { ...valid, date: "November 1" },
  ])("rejects malformed point %# as upstream in both classifiers", async (bad) => {
    safeFetchMock.mockResolvedValue(response(JSON.stringify([bad])));
    await expectUpstream(getFrankfurterSeries("NGN", "KWD", "2026-11-01", "2026-11-02"));
  });

  it("rejects a non-array and a 503 as upstream in both classifiers", async () => {
    safeFetchMock.mockResolvedValueOnce(response("{}")).mockResolvedValueOnce(response("secret", 503));
    await expectUpstream(getFrankfurterSeries("NGN", "KWD", "2026-11-01", "2026-11-02"));
    await expectUpstream(getFrankfurterSeries("NGN", "KWD", "2026-11-01", "2026-11-02"));
  });
});
