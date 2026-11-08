import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock("../lib/safe-fetch.js", () => ({ safeFetch: safeFetchMock }));

import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { classifyTransactionFailure } from "../lib/transaction-failure-taxonomy.js";
import { __resetFxRateCachesForTests } from "../lib/fx/rates.js";
import { __resetDataAccessForTests, registerDataAccess } from "../lib/data-access.js";
import { getExecutor } from "./index.js";
import "./exchange-rate.js";
import "./currency-convert.js";

const XML = `<Envelope><Cube><Cube time="2026-11-06"><Cube currency="USD" rate="1.2"/><Cube currency="SEK" rate="12"/></Cube></Cube></Envelope>`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const run = (slug: "exchange-rate" | "currency-convert", input: Record<string, unknown>) => getExecutor(slug)!(input);

beforeEach(() => {
  __resetFxRateCachesForTests();
  safeFetchMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T16:30:00Z"));
  registerDataAccess("exchange-rate", { lane: "preferred", acquisition_method: "direct_api" });
  registerDataAccess("currency-convert", { lane: "preferred", acquisition_method: "direct_api" });
});
afterEach(() => {
  __resetDataAccessForTests();
  vi.useRealTimers();
});

it.each([
  [{ from: "EUR", to: "USD" }, 1.2, 0.833333],
  [{ from: "USD", to: "EUR" }, 0.833333, 1.2],
  [{ from: "USD", to: "SEK" }, 10, 0.1],
] as const)("keeps ECB arithmetic and rounding for %j", async (input, rate, inverse) => {
  safeFetchMock.mockResolvedValue(new Response(XML));
  const answer = await run("exchange-rate", input);
  expect(answer.output).toMatchObject({ rate, inverse_rate: inverse, date: "2026-11-06", rate_date: "2026-11-06", rate_source: "ECB euro reference rate" });
  expect(answer.provenance).toMatchObject({ source: "ecb.europa.eu", data_access_lane: "preferred" });
});

it.each([
  ["EUR", "NGN", 1600],
  ["NGN", "KWD", 0.00022],
] as const)("uses only Frankfurter's pair answer for %s to %s", async (from, to, rate) => {
  safeFetchMock.mockResolvedValueOnce(new Response(XML)).mockResolvedValueOnce(json({ date: "2026-11-06", base: from, quote: to, rate }));
  const answer = await run("exchange-rate", { from, to });
  expect(answer.output).toMatchObject({ rate, rate_source: "Frankfurter blended central-bank rate", rate_date: "2026-11-06" });
  expect(answer.provenance).toMatchObject({ source: "frankfurter.dev", data_access_lane: "allowed_with_checks", acquisition_method: "vendor_api", data_access_checks: "recorded" });
  expect(safeFetchMock.mock.calls.map(([url]) => String(url))).not.toContain(expect.stringContaining("data-api.ecb.europa.eu"));
});

it("turns a Frankfurter 404 into the existing caller-input refusal contract", async () => {
  safeFetchMock.mockResolvedValueOnce(new Response(XML)).mockResolvedValueOnce(json({}, 404));
  const error = await run("exchange-rate", { from: "EUR", to: "XYZ" }).catch((value) => value as Error);
  expect(isCapabilityRefusal(error)).toBe(true);
  expect(classifyTransactionFailure(error.message)).toBe("caller_input");
  expect(error.message).toContain("XYZ");
  expect(error.message).toContain("has no published reference rate");
});

it.each([503, "timeout"])("keeps Frankfurter %s as an upstream failure", async (failure) => {
  safeFetchMock.mockResolvedValueOnce(new Response(XML));
  if (typeof failure === "number") safeFetchMock.mockResolvedValueOnce(json({}, failure));
  else safeFetchMock.mockRejectedValueOnce(new Error(failure));
  const error = await run("exchange-rate", { from: "EUR", to: "NGN" }).catch((value) => value as Error);
  expect(isCapabilityRefusal(error)).toBe(false);
  expect(classifyTransactionFailure(error.message)).toMatch(/upstream|timeout/);
});

it("currency-convert multiplies by the same pair rate", async () => {
  safeFetchMock.mockResolvedValue(new Response(XML));
  const exchange = await run("exchange-rate", { from: "USD", to: "SEK" });
  const conversion = await run("currency-convert", { amount: 12.34, from: "USD", to: "SEK" });
  expect(conversion.output.rate).toBe(exchange.output.rate);
  expect(conversion.output.converted_amount).toBe(123.4);
  expect(safeFetchMock).toHaveBeenCalledTimes(1);
});
