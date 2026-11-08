import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock("../safe-fetch.js", () => ({ safeFetch: safeFetchMock }));

import { __resetFxRateCachesForTests, getEcbReferenceRates, getFrankfurterRate } from "./rates.js";

const XML = `<?xml version="1.0"?><Envelope><Cube><Cube time="2026-11-06"><Cube currency="USD" rate="1.2"/><Cube currency="SEK" rate="12"/></Cube></Cube></Envelope>`;
const response = (body: string, status = 200) => new Response(body, { status });

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

  it("fails when no good copy exists", async () => {
    safeFetchMock.mockRejectedValue(new Error("timeout"));
    await expect(getEcbReferenceRates()).rejects.toThrow("timeout");
  });

  it("does not serve a last good copy beyond four days", async () => {
    safeFetchMock.mockResolvedValueOnce(response(XML)).mockRejectedValueOnce(new Error("refresh failed"));
    await getEcbReferenceRates();
    vi.setSystemTime(new Date("2026-11-10T16:30:01Z"));
    await expect(getEcbReferenceRates()).rejects.toThrow("refresh failed");
  });

  it("caps an oversized XML response", async () => {
    safeFetchMock.mockResolvedValue(response("x".repeat(4 * 1024 * 1024 + 1)));
    await expect(getEcbReferenceRates()).rejects.toThrow("4.0MB or less");
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
    await expect(getFrankfurterRate("NGN", "KWD")).rejects.toThrow("invalid or mismatched");
  });
});
