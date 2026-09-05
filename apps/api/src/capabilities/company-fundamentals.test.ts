import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { padCik, latestAnnual, pickUnit } from "./company-fundamentals.js";

const exec = getDirectExecutor("company-fundamentals")!;

describe("company-fundamentals", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("pads a CIK to the ten digits the data API path needs", () => {
    expect(padCik(320193)).toBe("0000320193");
    expect(padCik("320193")).toBe("0000320193");
    expect(padCik("0000320193")).toBe("0000320193");
  });

  // Filers restate, so several rows share a fiscal year. The row for the
  // latest period wins; among equal periods, the latest filing wins.
  it("picks the latest annual period, then the latest filing", () => {
    const facts = [
      { end: "2024-09-28", val: 391, form: "10-K", fp: "FY", filed: "2024-11-01" },
      { end: "2025-09-27", val: 416, form: "10-K", fp: "FY", filed: "2025-10-31" },
      { end: "2025-09-27", val: 999, form: "10-K", fp: "FY", filed: "2025-01-01" },
      { end: "2025-12-31", val: 123, form: "10-Q", fp: "Q1", filed: "2026-01-01" },
    ];
    expect(latestAnnual(facts)?.val).toBe(416);
  });

  it("ignores quarterly rows and returns null when no annual row exists", () => {
    expect(latestAnnual([{ end: "2025-06-30", val: 1, form: "10-Q", fp: "Q2" }])).toBeNull();
    expect(latestAnnual([])).toBeNull();
  });

  it("prefers USD, then per-share, then share-count units", () => {
    expect(pickUnit({ shares: [], USD: [] })?.unit).toBe("USD");
    expect(pickUnit({ "USD/shares": [] })?.unit).toBe("USD/shares");
    expect(pickUnit({ shares: [] })?.unit).toBe("shares");
    expect(pickUnit({})).toBeNull();
  });

  it("refuses a call with neither ticker nor cik, and a malformed cik", async () => {
    await expect(exec({})).rejects.toThrow(/'ticker' must be given, or 'cik'/);
    await expect(exec({ cik: "not-a-cik" })).rejects.toThrow(/'cik' must be up to 10 digits/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls through the concept chain and reports what the filer does not tag", async () => {
    // Revenues 404s (the pre-2019 tag), the modern tag answers; every other
    // metric 404s and must land in metrics_unavailable rather than vanish.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("RevenueFromContractWithCustomerExcludingAssessedTax")) {
        return new Response(JSON.stringify({
            cik: 320193,
            entityName: "Apple Inc.",
            units: { USD: [{ end: "2025-09-27", start: "2024-09-29", val: 416161000000, form: "10-K", fp: "FY", fy: 2025, filed: "2025-10-31", accn: "0000320193-25-000079" }] },
          }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    const { output } = await exec({ cik: "320193" });
    expect(output.cik).toBe("0000320193");
    expect(output.entity_name).toBe("Apple Inc.");
    expect(output.latest_period_end).toBe("2025-09-27");
    const f = output.fundamentals as Record<string, Record<string, unknown> | null>;
    expect(f.revenue?.value).toBe(416161000000);
    expect(f.revenue?.concept).toBe("RevenueFromContractWithCustomerExcludingAssessedTax");
    expect(f.revenue?.unit).toBe("USD");
    expect(f.net_income).toBeNull();
    expect(output.metrics_unavailable).toContain("net_income");
    expect(output.metrics_unavailable).not.toContain("revenue");
  });

  it("fails clearly when the filer has no annual XBRL data at all", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(exec({ cik: "1" })).rejects.toThrow(/must be a registrant with annual \(10-K\) XBRL data/);
  });
});
