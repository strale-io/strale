/**
 * Regression coverage for CHECK 14 (`checkFixtureInputDrift`), the detector
 * half of the wider-input-drift deliverable: this check must fire an alert
 * carrying a by-cause breakdown when the actionable set is non-empty, and
 * must stay silent (no event, no alert) when every suite matches its
 * manifest or is currently passing.
 *
 * Proved by planting: with `findFixtureDrift`'s conjunction removed (see
 * `fixture-drift.test.ts` for that side), the "stays silent" case here would
 * fire; these tests pin the observable side effect (the health event and
 * alert), `fixture-drift.test.ts` pins the underlying comparison.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
vi.mock("../db/index.js", () => ({ getDb: () => ({ execute }) }));
vi.mock("../lib/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const logHealthEvent = vi.fn();
vi.mock("../lib/health-monitor.js", () => ({ logHealthEvent }));

const alertOnce = vi.fn();
vi.mock("../lib/alert-once.js", () => ({ alertOnce }));

vi.mock("../lib/alerting.js", () => ({ sendAlert: vi.fn() }));

const MANIFESTS: Record<string, string> = {};
vi.mock("node:fs", () => ({
  existsSync: () => true,
  readdirSync: () => Object.keys(MANIFESTS),
  readFileSync: (path: string) => {
    const file = Object.keys(MANIFESTS).find((f) => path.toString().endsWith(f));
    if (!file) throw new Error(`no fixture manifest for ${path}`);
    return MANIFESTS[file];
  },
}));

const { checkFixtureInputDrift } = await import("./invariant-checker.js");

/** One test_suites/test_results aggregate row, as the raw SQL query returns it. */
function suiteRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    suite_id: "11111111-1111-1111-1111-111111111111",
    capability_slug: "canadian-company-data",
    test_type: "dependency_health",
    input: { corporation_number: "2408951" },
    is_active: true,
    runs: 10,
    passed: 0,
    sample_failure: 'No Canadian federal corporation found for "2408951".',
    ...over,
  };
}

beforeEach(() => {
  execute.mockReset();
  logHealthEvent.mockReset();
  alertOnce.mockReset();
  for (const key of Object.keys(MANIFESTS)) delete MANIFESTS[key];
});

describe("checkFixtureInputDrift", () => {
  it("fires an alert with a by-cause breakdown when the actionable set is non-empty", async () => {
    MANIFESTS["canadian-company-data.yaml"] =
      "slug: canadian-company-data\ntest_fixtures:\n  health_check_input:\n    corporation_number: \"1007\"\n";
    execute.mockResolvedValue([suiteRow()]);

    const result = await checkFixtureInputDrift();

    expect(result.alerts).toBe(1);
    expect(logHealthEvent).toHaveBeenCalledTimes(1);
    const [event] = logHealthEvent.mock.calls[0]!;
    expect(event.details.count).toBe(1);
    expect(event.details.by_cause.stale_identifier).toEqual(["canadian-company-data"]);
    expect(event.details.slugs).toEqual(["canadian-company-data"]);

    expect(alertOnce).toHaveBeenCalledTimes(1);
    const [key, cooldownMs, opts] = alertOnce.mock.calls[0]!;
    expect(key).toBe("invariant-fixture-input-drift");
    expect(cooldownMs).toBe(24 * 60 * 60 * 1000);
    expect(opts.body).toContain("stale_identifier");
    expect(opts.body).toContain("canadian-company-data");
  });

  it("stays silent when the stored input already matches the manifest", async () => {
    MANIFESTS["canadian-company-data.yaml"] =
      "slug: canadian-company-data\ntest_fixtures:\n  health_check_input:\n    corporation_number: \"2408951\"\n";
    execute.mockResolvedValue([suiteRow()]);

    const result = await checkFixtureInputDrift();

    expect(result.alerts).toBe(0);
    expect(logHealthEvent).not.toHaveBeenCalled();
    expect(alertOnce).not.toHaveBeenCalled();
  });

  it("stays silent when the suite is currently passing despite the divergence", async () => {
    MANIFESTS["canadian-company-data.yaml"] =
      "slug: canadian-company-data\ntest_fixtures:\n  health_check_input:\n    corporation_number: \"1007\"\n";
    execute.mockResolvedValue([suiteRow({ passed: 3 })]);

    const result = await checkFixtureInputDrift();

    expect(result.alerts).toBe(0);
    expect(logHealthEvent).not.toHaveBeenCalled();
  });

  it("groups a policy refusal separately from a stale identifier in the same run", async () => {
    MANIFESTS["canadian-company-data.yaml"] =
      "slug: canadian-company-data\ntest_fixtures:\n  health_check_input:\n    corporation_number: \"1007\"\n";
    MANIFESTS["translate.yaml"] = "slug: translate\ntest_fixtures:\n  health_check_input:\n    text: test\n";
    execute.mockResolvedValue([
      suiteRow(),
      suiteRow({
        suite_id: "22222222-2222-2222-2222-222222222222",
        capability_slug: "translate",
        input: { text: "This is a test input for automated capability testing." },
        sample_failure:
          "Capability 'translate' (cost_class=paid_prepaid) refuses invocation from context kind 'internal_test'. ALLOW_MATRIX governs this.",
      }),
    ]);

    const result = await checkFixtureInputDrift();

    expect(result.alerts).toBe(1);
    const [event] = logHealthEvent.mock.calls[0]!;
    expect(event.details.count).toBe(2);
    expect(event.details.by_cause.stale_identifier).toEqual(["canadian-company-data"]);
    expect(event.details.by_cause.policy_refusal).toEqual(["translate"]);
  });
});
