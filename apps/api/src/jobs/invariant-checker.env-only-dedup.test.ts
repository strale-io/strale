/**
 * CHECK 5's environmental-only report must fire once per failure, not once per
 * run that can still see it. The check runs every 2 hours over a 12-hour
 * window; before this, one timeout was re-reported up to six times (measured
 * 2026-10-26: ~104 alerts in a week across five capabilities, all harness).
 *
 * Proved by planting: with the `hasUnreportedFailure` guard removed from
 * `reportEnvironmentalOnly`, "stays silent when already reported" fires.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
const caps = [{ slug: "slovak-company-data", name: "Slovak Company Data" }];
vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute,
    select: () => ({ from: () => ({ where: async () => caps }) }),
  }),
}));
vi.mock("../lib/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const logHealthEvent = vi.fn();
vi.mock("../lib/health-monitor.js", () => ({ logHealthEvent }));
vi.mock("../lib/alert-once.js", () => ({ alertOnce: vi.fn() }));
vi.mock("../lib/alerting.js", () => ({ sendAlert: vi.fn() }));

const { checkAlgorithmicCorrectnessFloor, hasUnreportedFailure } = await import("./invariant-checker.js");

const TIMEOUT_ROW = {
  test_name: "slovak-company-data-known-answer",
  passed: false,
  failure_reason: "Execution error: The operation was aborted due to timeout",
  executed_at: "2026-10-26T01:00:00Z",
};

beforeEach(() => {
  execute.mockReset();
  logHealthEvent.mockReset();
});

describe("hasUnreportedFailure", () => {
  it("is true when nothing was reported before", () => {
    expect(hasUnreportedFailure(["2026-10-26T01:00:00Z"], null)).toBe(true);
  });
  it("is false when every failure predates the last report", () => {
    expect(hasUnreportedFailure(["2026-10-26T01:00:00Z"], "2026-10-26T01:01:40Z")).toBe(false);
  });
  it("is true when a newer failure arrived after the last report", () => {
    expect(
      hasUnreportedFailure(["2026-10-26T01:00:00Z", "2026-10-26T04:00:00Z"], "2026-10-26T01:01:40Z"),
    ).toBe(true);
  });
  it("is false with no failures", () => {
    expect(hasUnreportedFailure([], null)).toBe(false);
  });
  it("accepts Date objects as postgres-js returns them", () => {
    expect(hasUnreportedFailure([new Date("2026-10-26T01:00:00Z")], new Date("2026-10-26T01:01:40Z"))).toBe(false);
  });
  it("reports when the last-report timestamp is unreadable", () => {
    expect(hasUnreportedFailure(["2026-10-26T01:00:00Z"], "not a date")).toBe(true);
  });
});

describe("checkAlgorithmicCorrectnessFloor — environmental-only reporting", () => {
  it("reports a timeout the first time it is seen", async () => {
    execute.mockResolvedValueOnce([TIMEOUT_ROW]).mockResolvedValueOnce([{ last_reported_at: null }]);
    await checkAlgorithmicCorrectnessFloor(new Set());
    expect(logHealthEvent).toHaveBeenCalledTimes(1);
    expect(logHealthEvent.mock.calls[0][0].details.check).toBe("algorithmic_correctness_environmental_only");
  });

  it("stays silent on the next run when the same timeout was already reported", async () => {
    execute
      .mockResolvedValueOnce([TIMEOUT_ROW])
      .mockResolvedValueOnce([{ last_reported_at: "2026-10-26T01:01:40Z" }]);
    await checkAlgorithmicCorrectnessFloor(new Set());
    expect(logHealthEvent).not.toHaveBeenCalled();
  });

  it("reports anyway when the last-report lookup fails", async () => {
    execute.mockResolvedValueOnce([TIMEOUT_ROW]).mockRejectedValueOnce(new Error("connection reset"));
    await checkAlgorithmicCorrectnessFloor(new Set());
    expect(logHealthEvent).toHaveBeenCalledTimes(1);
  });

  it("reports again when a new timeout arrives after the last report", async () => {
    execute
      .mockResolvedValueOnce([{ ...TIMEOUT_ROW, executed_at: "2026-10-26T03:00:00Z" }, TIMEOUT_ROW])
      .mockResolvedValueOnce([{ last_reported_at: "2026-10-26T01:01:40Z" }]);
    await checkAlgorithmicCorrectnessFloor(new Set());
    expect(logHealthEvent).toHaveBeenCalledTimes(1);
  });
});
