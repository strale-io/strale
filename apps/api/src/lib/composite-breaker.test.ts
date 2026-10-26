import { beforeEach, describe, expect, it, vi } from "vitest";
const { getDb, warn, limit } = vi.hoisted(() => ({ getDb: vi.fn(), warn: vi.fn(), limit: vi.fn() }));
vi.mock("../db/index.js", () => ({ getDb }));
vi.mock("./log.js", () => ({ logWarn: warn }));
import { isCircuitOpen } from "./composite-breaker.js";

describe("shared composite breaker read-only peek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDb.mockReturnValue({ select: () => ({ from: () => ({ where: () => ({ limit }) }) }) });
  });
  it.each([
    ["open", 60000, true], ["open", -60000, false], ["closed", 60000, false], ["half_open", 60000, false],
  ])("%s with retry offset %s returns %s with only select available", async (state, offset, expected) => {
    limit.mockResolvedValue([{ state, nextRetryAt: new Date(Date.now() + offset) }]);
    expect(await isCircuitOpen("vat-validate")).toBe(expected);
    expect(limit).toHaveBeenCalledWith(1);
  });
  it.each([[], [{ state: "open", nextRetryAt: null }]])("missing retry state %j is not open", async rows => {
    limit.mockResolvedValue(rows); expect(await isCircuitOpen("vat-validate")).toBe(false);
  });
  it("health-table failure logs a warning and fails open without writing", async () => {
    getDb.mockImplementation(() => { throw new Error("no database"); });
    expect(await isCircuitOpen("vat-validate")).toBe(false);
    expect(warn).toHaveBeenCalledWith("composite-breaker-peek-failed", expect.any(String), expect.objectContaining({ capability_slug: "vat-validate" }));
  });
});
