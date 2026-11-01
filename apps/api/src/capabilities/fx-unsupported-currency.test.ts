/**
 * A currency the source does not carry is a refusal, not a source fault.
 *
 * Production, 2026-10-30 to 11-01: 25 paid exchange-rate calls failed with "ECB
 * API returned HTTP 404 for NGN" and the like. As plain errors they count against
 * the tool's health, and three in a row would open its breaker for every buyer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getExecutor } from "./index.js";
import "./exchange-rate.js";
import "./currency-convert.js";
import "./forex-history.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { classifyTransactionFailure } from "../lib/transaction-failure-taxonomy.js";

afterEach(() => vi.unstubAllGlobals());

const answer = (status: number) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>x</html>", { status })));

const CALLS = [
  ["exchange-rate", { from: "EUR", to: "NGN" }],
  ["currency-convert", { amount: 5, from: "NGN", to: "EUR" }],
  ["forex-history", { from: "EUR", to: "NGN" }],
] as const;

describe.each(CALLS)("%s", (slug, input) => {
  const run = () => getExecutor(slug)!({ ...input });

  it("refuses a currency the source answers 404 for, in every health consumer", async () => {
    answer(404);
    const err = (await run().catch((e: unknown) => e)) as Error;
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(isUserInputError(err.message)).toBe(true);
    expect(classifyTransactionFailure(err.message)).toBe("caller_input");
    expect(err.message).toContain("NGN");
  });

  it("keeps a source 5xx as a real failure", async () => {
    answer(522);
    const err = (await run().catch((e: unknown) => e)) as Error;
    expect(isCapabilityRefusal(err)).toBe(false);
    expect(isUserInputError(err.message)).toBe(false);
    expect(classifyTransactionFailure(err.message)).toBe("upstream");
    expect(err.message).not.toContain("<html");
  });
});

describe("forex-history dates", () => {
  it.each([
    [{ start_date: "2024-02-01", end_date: "2024-01-01" }, "start_date"],
    [{ start_date: "abc", end_date: "2024-01-01" }, "start_date"],
    [{ start_date: "2024-01-01", end_date: "2024-13-45" }, "end_date"],
  ])("refuses %j without calling the source or blaming the currency", async (dates, field) => {
    const source = vi.fn();
    vi.stubGlobal("fetch", source);
    const err = (await getExecutor("forex-history")!({ from: "EUR", to: "USD", ...dates }).catch((e: unknown) => e)) as Error;
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(isUserInputError(err.message)).toBe(true);
    expect(err.message).toContain(field);
    expect(source).not.toHaveBeenCalled();
  });
});
