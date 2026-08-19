/**
 * Regression suite for the 2026-08-19 morning check-in finding: the test
 * harness's own fixture-staleness guard was being scored as a capability
 * defect.
 *
 * The guard (`test-runner.recordStaleFixture`) records `passed: false` with a
 * message that ends "Not evidence about the capability." Three separate
 * consumers disagreed with that sentence:
 *
 *   1. `classifyTransactionFailure` returned `internal` ("OUR bug until proven
 *      otherwise"), so the correctness invariant counted it in the denominator
 *      — despite `recordStaleFixture`'s own docstring asserting it classified
 *      as `config` and was excluded.
 *   2. `checkNewFailures` opened a `regression_detected` alert on any
 *      `passed: false`, whatever the cause. Production fired three for
 *      `eu-regulation-search` on 2026-08-18 ("was passing (100% over 10
 *      runs), now failing") while the capability answered correctly.
 *   3. `SingleTestResult` never declared `failureClassification`, and every
 *      consumer read it through `(r as any)`. It was therefore `undefined`
 *      everywhere: 14 of 14 production `infrastructure_alert` events grouped
 *      as `{"unknown": 6}`.
 *
 * Each test below fails against the pre-fix code.
 */
import { describe, it, expect } from "vitest";
import { classifyTransactionFailure } from "./transaction-failure-taxonomy.js";
import { isCapabilityAttributable, checkNewFailures } from "./meta-monitoring.js";
import { isEnvironmentalFailure } from "../jobs/invariant-checker.js";

/** Verbatim from production `test_results`, 2026-08-19. */
const REAL_STALE_REASON =
  "fixture_refresh_required: baseline captured 2026-03-13T15:41:01.759Z predates " +
  "the suite's last edit 2026-08-18T13:15:21.316Z and the suite is not free to " +
  "re-run (external_cost_cents=1). Not evidence about the capability.";

describe("fixture staleness is not a capability fault", () => {
  it("classifies the real production marker as config, not internal", () => {
    // Pre-fix: "internal".
    expect(classifyTransactionFailure(REAL_STALE_REASON)).toBe("config");
  });

  it("leaves the correctness denominator, as recordStaleFixture's docstring promises", () => {
    // Pre-fix: false — the docstring was simply untrue.
    expect(isEnvironmentalFailure(REAL_STALE_REASON)).toBe(true);
  });

  it("matches on our own prefix rather than the embedded third-party text", () => {
    // The message embeds timestamps and suite metadata. Classification must
    // come from our literal marker, so a baseline whose payload happens to
    // contain caller-ish or upstream-ish words still lands in `config`.
    const adversarial =
      "fixture_refresh_required: baseline captured 2026-01-01T00:00:00.000Z predates " +
      "the suite's last edit and the suite is not free to re-run. " +
      "Raw: {\"error\":\"not found\",\"status\":503,\"detail\":\"timed out\"}";
    expect(classifyTransactionFailure(adversarial)).toBe("config");
  });

  it("does not claim unrelated messages that merely mention fixtures", () => {
    // The marker is anchored at the start of the string; prose about fixtures
    // must keep its ordinary classification.
    expect(classifyTransactionFailure("the fixture_refresh_required flag was set")).not.toBe("config");
  });
});

describe("isCapabilityAttributable", () => {
  it("excuses instrument- and world-shaped verdicts", () => {
    for (const cls of [
      "stale_input",
      "test_infrastructure",
      "test_design",
      "upstream_transient",
      "upstream_changed",
    ]) {
      expect(isCapabilityAttributable(cls), cls).toBe(false);
    }
  });

  it("keeps genuine capability verdicts attributable", () => {
    for (const cls of ["capability_bug", "internal", "schema_mismatch"]) {
      expect(isCapabilityAttributable(cls), cls).toBe(true);
    }
  });

  it("treats an unclassified failure as attributable", () => {
    // Deliberate: silently excusing the unexplained is how a real regression
    // would go unreported.
    expect(isCapabilityAttributable(undefined)).toBe(true);
    expect(isCapabilityAttributable(null)).toBe(true);
    expect(isCapabilityAttributable("")).toBe(true);
  });
});

describe("checkNewFailures", () => {
  it("opens no regression when every failure is a stale fixture", async () => {
    // Pre-fix this reached the DB, found prior history and alerted. Post-fix
    // the batch is empty before any query runs, so the check short-circuits —
    // which is also why this test needs no database.
    const res = await checkNewFailures([
      { capabilitySlug: "eu-regulation-search", passed: false, failureClassification: "stale_input" },
      { capabilitySlug: "eu-regulation-search", passed: false, failureClassification: "stale_input" },
    ]);
    expect(res.passed).toBe(true);
    expect(res.details).toMatch(/No failures in this batch/);
  });

  it("still short-circuits when the whole batch passed", async () => {
    const res = await checkNewFailures([
      { capabilitySlug: "email-validate", passed: true },
    ]);
    expect(res.passed).toBe(true);
  });
});
