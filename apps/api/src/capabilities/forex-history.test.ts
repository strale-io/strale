import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock("../lib/safe-fetch.js", () => ({ safeFetch: safeFetchMock, discardBody: vi.fn(async () => undefined) }));
import { getDirectExecutor, getExecutor } from "./index.js";
import "./forex-history.js";
import { __resetFxRateCachesForTests } from "../lib/fx/rates.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { __resetDataAccessForTests, registerDataAccess } from "../lib/data-access.js";

const response = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const run = (input: Record<string, unknown>, stamped = false) => (stamped ? getExecutor("forex-history") : getDirectExecutor("forex-history"))!(input);

beforeEach(() => {
  safeFetchMock.mockReset();
  __resetFxRateCachesForTests();
  __resetDataAccessForTests();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("global fetch must not be called"); }));
});
afterEach(() => vi.useRealTimers());

describe("forex-history v2", () => {
  it("preserves arithmetic and output shape for a sorted USD to EUR fixture", async () => {
    safeFetchMock.mockResolvedValue(response([
      { date: "2026-11-03", base: "USD", quote: "EUR", rate: 1.2 },
      { date: "2026-11-01", base: "USD", quote: "EUR", rate: 1 },
      { date: "2026-11-02", base: "USD", quote: "EUR", rate: 1.1 },
    ]));
    const result = await run({ from_currency: "USD", to_currency: "EUR", start_date: "2026-11-01", end_date: "2026-11-03" });
    expect(result.output).toMatchObject({ rates: [{ date: "2026-11-01", rate: 1 }, { date: "2026-11-02", rate: 1.1 }, { date: "2026-11-03", rate: 1.2 }], average: 1.1, min: 1, max: 1.2, change_percent: 20, data_points: 3, rate_source: "Frankfurter blended central-bank rate" });
    expect(result.provenance).toMatchObject({ source: "frankfurter.dev", acquisition_method: "vendor_api", data_access_lane: "allowed_with_checks", upstream_vendor: "Frankfurter" });
    expect(result.provenance).not.toHaveProperty("data_access_checks");

    registerDataAccess("forex-history", { lane: "allowed_with_checks", acquisition_method: "vendor_api", upstream_vendor: "Frankfurter", checks: "recorded", checks_note: "Frankfurter published terms permit use of the blended endpoint." });
    safeFetchMock.mockResolvedValue(response([{ date: "2026-11-01", base: "USD", quote: "EUR", rate: 1 }]));
    const stamped = await run({ from: "USD", to: "EUR", start_date: "2026-11-01", end_date: "2026-11-01" }, true);
    expect(stamped.provenance.data_access_checks).toBe("recorded");
  });

  it("supports a non-ECB NGN to KWD pair", async () => {
    safeFetchMock.mockResolvedValue(response([{ date: "2026-11-01", base: "NGN", quote: "KWD", rate: 0.00022 }]));
    await expect(run({ from: "NGN", to: "KWD", start_date: "2026-11-01", end_date: "2026-11-01" })).resolves.toMatchObject({ output: { rates: [{ rate: 0.00022 }] } });
  });

  it("refuses an empty series on start_date", async () => {
    safeFetchMock.mockResolvedValue(response([]));
    const error = await run({ from: "USD", to: "EUR", start_date: "2026-11-01", end_date: "2026-11-02" }).catch(e => e);
    expect(isCapabilityRefusal(error)).toBe(true);
    expect(error.details.field).toBe("start_date");
    expect(error.message).toContain("no published rates in this range");
  });

  it.each([
    ["USD", "XYZ", [{ iso_code: "USD" }], "to"],
    ["NGN", "XYZ", [{ iso_code: "NGN" }], "to"],
    ["XYZ", "KWD", [{ iso_code: "KWD" }], "from"],
  ])("uses the currency list after 422 to name the unsupported field", async (from, to, currencies, field) => {
    safeFetchMock.mockImplementation(async (url: string) => String(url).includes("/currencies") ? response(currencies) : response({ message: "invalid currency" }, 422));
    const error = await run({ from, to, start_date: "2026-11-01", end_date: "2026-11-02" }).catch(e => e);
    expect(isCapabilityRefusal(error)).toBe(true);
    expect(error.details.field).toBe(field);
    expect(safeFetchMock).toHaveBeenCalled();
  });

  it("names both currencies when the currency list is unavailable", async () => {
    safeFetchMock.mockImplementation(async (url: string) => String(url).includes("/currencies") ? response("down", 503) : response({}, 422));
    const error = await run({ from: "NGN", to: "XYZ", start_date: "2026-11-01", end_date: "2026-11-02" }).catch(e => e);
    expect(isCapabilityRefusal(error)).toBe(true);
    expect(error.details.field).toBe("from");
    expect(error.message).toContain("NGN and XYZ");
  });

  it.each([
    [{ from: "USD", to: "EUR", start_date: "2020-01-01", end_date: "2026-01-01" }, "start_date"],
    [{ from: "US", to: "EUR", start_date: "2026-11-01", end_date: "2026-11-02" }, "from"],
    [{ from: "USD", to: "EURO", start_date: "2026-11-01", end_date: "2026-11-02" }, "to"],
    [{ from: "USD", to: "EUR", start_date: "2026-02-30", end_date: "2026-03-01" }, "start_date"],
    [{ from: "USD", to: "EUR", start_date: "2026-02-01", end_date: "2026-02-30" }, "end_date"],
    [{ from: "USD", to: "USD", start_date: "2026-02-30", end_date: "2026-03-01" }, "start_date"],
    [{ from: "USD", to: "USD", start_date: "2026-02-01", end_date: "2026-02-30" }, "end_date"],
  ])("refuses invalid local input without a fetch", async (input, field) => {
    const error = await run(input).catch(e => e);
    expect(isCapabilityRefusal(error)).toBe(true);
    expect(error.details.field).toBe(field);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("returns every identity day without fetching and uses computed provenance", async () => {
    const result = await run({ from: "USD", to: "USD", start_date: "2026-11-01", end_date: "2026-11-03" });
    expect(result.output).toMatchObject({ rates: [{ date: "2026-11-01", rate: 1 }, { date: "2026-11-02", rate: 1 }, { date: "2026-11-03", rate: 1 }], rate_source: "identity", average: 1, change_percent: 0 });
    expect(result.provenance).toMatchObject({ source: "identity", acquisition_method: "computed", data_access_lane: "not_applicable" });
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

});
