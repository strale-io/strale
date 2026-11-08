import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock("../lib/safe-fetch.js", () => ({ safeFetch: safeFetchMock, discardBody: vi.fn(async () => undefined) }));

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
const manifestAccess = { lane: "allowed_with_checks" as const, acquisition_method: "vendor_api" as const, upstream_vendor: "Frankfurter", checks: "recorded" as const };

beforeEach(() => {
  __resetFxRateCachesForTests();
  safeFetchMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T16:30:00Z"));
  registerDataAccess("exchange-rate", manifestAccess);
  registerDataAccess("currency-convert", manifestAccess);
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
  expect(answer.provenance).not.toHaveProperty("data_access_checks");
});

it.each([
  ["EUR", "NGN", 1600],
  ["NGN", "KWD", 0.00022],
] as const)("uses only Frankfurter's pair answer for %s to %s", async (from, to, rate) => {
  safeFetchMock.mockResolvedValueOnce(json({ date: "2026-11-06", base: from, quote: to, rate }));
  const answer = await run("exchange-rate", { from, to });
  expect(answer.output).toMatchObject({ rate, rate_source: "Frankfurter blended central-bank rate", rate_date: "2026-11-06" });
  expect(answer.provenance).toMatchObject({ source: "frankfurter.dev", data_access_lane: "allowed_with_checks", acquisition_method: "vendor_api", data_access_checks: "recorded" });
  expect(safeFetchMock.mock.calls.map(([url]) => String(url))).not.toContain(expect.stringContaining("data-api.ecb.europa.eu"));
});

it("turns a Frankfurter 404 into the existing caller-input refusal contract", async () => {
  safeFetchMock.mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json([{ iso_code: "EUR" }]));
  const error = await run("exchange-rate", { from: "EUR", to: "XYZ" }).catch((value) => value as Error);
  expect(isCapabilityRefusal(error)).toBe(true);
  expect(classifyTransactionFailure(error.message)).toBe("caller_input");
  expect(error.message).toContain("XYZ");
  expect(error.message).toContain("has no published reference rate");
});

it.each([
  ["NGN", "XYZ", "to"],
  ["XYZ", "NGN", "from"],
] as const)("names the unknown field for %s to %s", async (from, to, field) => {
  safeFetchMock.mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json([{ iso_code: "NGN" }]));
  const error = await run("exchange-rate", { from, to }).catch((value) => value as Error);
  expect(isCapabilityRefusal(error)).toBe(true);
  expect(error.message).toContain(`'${field}'`);
  expect(error.message).toContain(field === "from" ? from : to);
});

it("names both codes when the Frankfurter currency list is unavailable", async () => {
  safeFetchMock.mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({}, 503));
  const error = await run("exchange-rate", { from: "NGN", to: "XYZ" }).catch((value) => value as Error);
  expect(isCapabilityRefusal(error)).toBe(true);
  expect(error.message).toContain("NGN");
  expect(error.message).toContain("XYZ");
  expect(error.message).toContain("'from' and 'to'");
});

it.each([503, "timeout"])("keeps Frankfurter %s as an upstream failure", async (failure) => {
  if (typeof failure === "number") safeFetchMock.mockResolvedValueOnce(json({}, failure));
  else safeFetchMock.mockRejectedValueOnce(new Error(failure));
  const error = await run("exchange-rate", { from: "EUR", to: "NGN" }).catch((value) => value as Error);
  expect(isCapabilityRefusal(error)).toBe(false);
  expect(classifyTransactionFailure(error.message)).toMatch(/upstream|timeout/);
});

it("routes a non-ECB pair without depending on ECB availability", async () => {
  safeFetchMock.mockResolvedValue(json({ date: "2026-11-06", base: "NGN", quote: "KWD", rate: 0.00022 }));
  await expect(run("exchange-rate", { from: "NGN", to: "KWD" })).resolves.toMatchObject({ output: { rate: 0.00022 } });
  expect(safeFetchMock.mock.calls.every(([url]) => !String(url).includes("ecb.europa.eu"))).toBe(true);
});

it.each(["USD", "NGN"])("returns identity for %s without fetching", async (code) => {
  const answer = await run("exchange-rate", { from: code, to: code });
  expect(answer).toMatchObject({ output: { rate: 1 }, provenance: { source: "identity", acquisition_method: "computed", data_access_lane: "not_applicable" } });
  expect(answer.provenance).not.toHaveProperty("upstream_vendor");
  expect(answer.provenance).not.toHaveProperty("data_access_checks");
  expect(safeFetchMock).not.toHaveBeenCalled();
});

it("currency-convert multiplies by the same pair rate", async () => {
  safeFetchMock.mockResolvedValue(new Response(XML));
  const exchange = await run("exchange-rate", { from: "USD", to: "SEK" });
  const conversion = await run("currency-convert", { amount: 12.34, from: "USD", to: "SEK" });
  expect(conversion.output.rate).toBe(exchange.output.rate);
  expect(conversion.output.converted_amount).toBe(123.4);
  expect(safeFetchMock).toHaveBeenCalledTimes(1);
});

it("currency-convert identity returns the amount unrounded without fetching", async () => {
  const answer = await run("currency-convert", { amount: 12.345678, from: "SEK", to: "SEK" });
  expect(answer.output).toMatchObject({ amount: 12.345678, converted_amount: 12.345678, rate: 1 });
  expect(answer.provenance).toMatchObject({ source: "identity" });
  expect(safeFetchMock).not.toHaveBeenCalled();
});

it("routes a listed ECB code the file no longer carries to Frankfurter instead of returning NaN", async () => {
  // XML carries USD and SEK only; GBP is on the static list but missing here.
  safeFetchMock
    .mockResolvedValueOnce(new Response(XML))
    .mockResolvedValueOnce(json({ date: "2026-11-06", base: "USD", quote: "GBP", rate: 0.78 }));
  const answer = await run("exchange-rate", { from: "USD", to: "GBP" });
  expect(Number.isFinite(answer.output.rate)).toBe(true);
  expect(answer.output.rate).toBe(0.78);
  expect(answer.provenance).toMatchObject({ source: "frankfurter.dev" });
});
