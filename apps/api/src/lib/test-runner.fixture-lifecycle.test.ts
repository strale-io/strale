/**
 * Regression tests for the fixture-mode lifecycle fixes from the 2026-08-18
 * Codex closing-pass review of the Browserless harness-burn mitigation
 * (branch ops/cut-browserless-harness-burn):
 *
 *   HIGH-1: a fixture baseline older than 30 days is stale by age alone,
 *   independent of edit-invalidation, referenced against fixture_last_refreshed
 *   (never updated_at). Regression tests required: "fresh fixture replays
 *   without live call; 31-day-old fixture triggers live recapture;
 *   successful recapture resets the clock."
 *
 *   HIGH-2b: a failing recapture attempt must be bounded — capped at
 *   MAX_FIXTURE_RECAPTURE_FAILURES consecutive failures before the suite
 *   quarantines, instead of retrying a permanently-broken suite on every
 *   dispatch tick forever.
 *
 * This file has its own local `../db/index.js` mock (module-scoped, does
 * not touch or interfere with test-runner.test.ts's separate mock in the
 * same directory — vitest mocks are per test-file). It exercises
 * `captureBaseline` and `recordFixtureRecaptureFailure` directly (both
 * exported specifically for this coverage) rather than mocking the entire
 * runSingleTest() DB surface, per the DEC-20260504-A test-harness
 * exemption's "unit test that captures the structural shape of the fix"
 * standard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Minimal update-chain mock recording every set()/where() call ──────────

interface RecordedUpdate {
  table: unknown;
  set: Record<string, unknown>;
  whereId: string | undefined;
}

let recordedUpdates: RecordedUpdate[] = [];
// Simulates the counter column server-side: recordFixtureRecaptureFailure's
// `sql\`${col} + 1\`` increment needs a stateful mock to return a realistic
// post-increment count via .returning().
let fixtureRecaptureFailuresByRowId: Record<string, number> = {};

const mockDb = {
  update: (table: unknown) => ({
    set: (setArgs: Record<string, unknown>) => ({
      // `.where()` must serve two shapes: some call sites `await` it
      // directly (captureBaseline, the plain quarantine UPDATE); others
      // chain `.returning(...)` on it first (recordFixtureRecaptureFailure's
      // increment). Returning an object with both a `.then` (thenable —
      // `await` works on any object exposing one) and a `.returning` method
      // satisfies both without needing to distinguish call sites.
      where: (_whereArg: unknown) => {
        // The suite id under test is threaded via `currentSuiteId` (set in
        // beforeEach / per-test) since the mock doesn't parse drizzle's eq()
        // internals — consistent with this file's scope: proving the SET
        // shape and the increment-then-quarantine sequencing, not re-testing
        // drizzle's query builder.
        recordedUpdates.push({ table, set: setArgs, whereId: currentSuiteId });
        return {
          then: (resolve: (v: undefined) => void) => resolve(undefined),
          returning: (_shape: unknown) => {
            // recordFixtureRecaptureFailure's increment: emulate
            // `fixture_recapture_failures = fixture_recapture_failures + 1`.
            const next = (fixtureRecaptureFailuresByRowId[currentSuiteId] ?? 0) + 1;
            fixtureRecaptureFailuresByRowId[currentSuiteId] = next;
            return Promise.resolve([{ count: next }]);
          },
        };
      },
    }),
  }),
};

let currentSuiteId = "";

vi.mock("../db/index.js", () => ({ getDb: () => mockDb }));

import {
  captureBaseline,
  recordFixtureRecaptureFailure,
  checkBaselineStaleness,
  isBaselineStale,
  MAX_FIXTURE_RECAPTURE_FAILURES,
  FIXTURE_MAX_AGE_DAYS,
} from "./test-runner.js";
import { testSuites } from "../db/schema.js";

function baseSuite(overrides: Partial<typeof testSuites.$inferSelect> = {}) {
  return {
    id: "suite-1",
    capabilitySlug: "screenshot-url",
    testName: "known_answer",
    testType: "known_answer",
    input: {},
    expectedOutput: null,
    validationRules: { checks: [] },
    active: true,
    scheduleTier: "B",
    estimatedCostCents: 0,
    baselineOutput: null,
    baselineCapturedAt: null,
    testStatus: "normal",
    quarantineReason: null,
    lastClassification: null,
    autoRemediationLog: null,
    testMode: "fixture",
    fixtureLastRefreshed: null,
    fixtureRecaptureFailures: 0,
    externalCostCents: 0,
    scheduledTestingEligible: true,
    generationCapabilityUpdatedAt: null,
    groundTruthVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as typeof testSuites.$inferSelect;
}

beforeEach(() => {
  recordedUpdates = [];
  fixtureRecaptureFailuresByRowId = {};
  currentSuiteId = "";
});

describe("HIGH-1: fixture max-age staleness (30-day floor via fixture_last_refreshed)", () => {
  it("a fresh fixture (refreshed today) is NOT stale — replays without a live call", () => {
    const suite = {
      baselineOutput: { ok: true },
      baselineCapturedAt: new Date(),
      updatedAt: new Date(),
      fixtureLastRefreshed: new Date(),
    };
    const result = checkBaselineStaleness(suite);
    expect(result.stale).toBe(false);
    expect(result.reason).toBe("not_stale");
  });

  it("a 31-day-old fixture IS stale by age — triggers a live recapture", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const refreshed31DaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    const suite = {
      baselineOutput: { ok: true },
      baselineCapturedAt: refreshed31DaysAgo,
      updatedAt: refreshed31DaysAgo,
      fixtureLastRefreshed: refreshed31DaysAgo,
    };
    const result = checkBaselineStaleness(suite, now);
    expect(result.stale).toBe(true);
    expect(result.reason).toBe("max_age_exceeded");
  });

  it("exactly 30 days old is still fresh; 30 days + 1ms is stale — the boundary is strict", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const exactly30Days = new Date(now.getTime() - FIXTURE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const over30Days = new Date(exactly30Days.getTime() - 1);

    expect(
      checkBaselineStaleness(
        { baselineOutput: { ok: true }, baselineCapturedAt: exactly30Days, updatedAt: exactly30Days, fixtureLastRefreshed: exactly30Days },
        now,
      ).stale,
    ).toBe(false);

    expect(
      checkBaselineStaleness(
        { baselineOutput: { ok: true }, baselineCapturedAt: over30Days, updatedAt: over30Days, fixtureLastRefreshed: over30Days },
        now,
      ).stale,
    ).toBe(true);
  });

  it("a null fixture_last_refreshed (never captured under this check) is treated as maximally stale by age", () => {
    // Real prod rows converted by this migration, or captured before this
    // feature existed, read fixture_last_refreshed as NULL — one live
    // recapture starts their clock, per the module's design comment.
    const now = new Date();
    const result = checkBaselineStaleness(
      { baselineOutput: { ok: true }, baselineCapturedAt: now, updatedAt: now, fixtureLastRefreshed: null },
      now,
    );
    expect(result.stale).toBe(true);
    expect(result.reason).toBe("max_age_exceeded");
  });

  it("omitting fixture_last_refreshed entirely opts out of the age axis — pre-existing callers unaffected", () => {
    // test-runner.stale-baseline.test.ts's fixtures never set this field.
    const now = new Date("2026-08-18T12:00:00.000Z");
    const veryOld = new Date("2020-01-01T00:00:00.000Z");
    const result = checkBaselineStaleness(
      { baselineOutput: { ok: true }, baselineCapturedAt: veryOld, updatedAt: veryOld },
      now,
    );
    expect(result.stale).toBe(false);
    // isBaselineStale's boolean wrapper matches.
    expect(isBaselineStale({ baselineOutput: { ok: true }, baselineCapturedAt: veryOld, updatedAt: veryOld }, now)).toBe(false);
  });

  it("edit-invalidation still takes priority over a fresh age — both axes are OR'd", () => {
    const now = new Date();
    const result = checkBaselineStaleness(
      {
        baselineOutput: { ok: true },
        baselineCapturedAt: new Date(now.getTime() - 1000),
        updatedAt: now, // edited AFTER capture
        fixtureLastRefreshed: new Date(now.getTime() - 1000), // age-fresh
      },
      now,
    );
    expect(result.stale).toBe(true);
    expect(result.reason).toBe("edited_since_capture");
  });
});

describe("HIGH-1: captureBaseline resets the age clock on a successful recapture", () => {
  it("sets fixture_last_refreshed on capture — 'successful recapture resets the clock'", async () => {
    currentSuiteId = "suite-fresh-capture";
    const suite = baseSuite({
      id: currentSuiteId,
      baselineOutput: null, // no baseline yet -> not short-circuited by the early-return guard
      baselineCapturedAt: null,
      fixtureLastRefreshed: null,
    });

    await captureBaseline(suite, { hello: "world" });

    const write = recordedUpdates.find((u) => u.table === testSuites && "fixtureLastRefreshed" in u.set);
    expect(write).toBeTruthy();
    expect(write!.set.fixtureLastRefreshed).toBeInstanceOf(Date);
    // Same instant as baselineCapturedAt/updatedAt (ONE timestamp for all
    // three columns — see captureBaseline's own comment on why).
    expect(write!.set.baselineCapturedAt).toBe(write!.set.fixtureLastRefreshed);
    expect(write!.set.updatedAt).toBe(write!.set.fixtureLastRefreshed);
  });

  it("resets fixture_recapture_failures to 0 on a successful capture — 'success before cap resets the counter'", async () => {
    currentSuiteId = "suite-recovering";
    const suite = baseSuite({
      id: currentSuiteId,
      baselineOutput: null,
      baselineCapturedAt: null,
      fixtureLastRefreshed: null,
      fixtureRecaptureFailures: 2, // one away from the cap
    });

    await captureBaseline(suite, { hello: "world" });

    const write = recordedUpdates.find((u) => u.table === testSuites && "fixtureRecaptureFailures" in u.set);
    expect(write).toBeTruthy();
    expect(write!.set.fixtureRecaptureFailures).toBe(0);
  });

  it("does NOT re-capture (no DB write) when the existing baseline is already fresh", async () => {
    currentSuiteId = "suite-already-fresh";
    const now = new Date();
    const suite = baseSuite({
      id: currentSuiteId,
      baselineOutput: { already: "here" },
      baselineCapturedAt: now,
      updatedAt: now,
      fixtureLastRefreshed: now,
    });

    await captureBaseline(suite, { new: "output" });

    expect(recordedUpdates.length).toBe(0);
  });
});

describe("HIGH-2b: recordFixtureRecaptureFailure caps consecutive failures and quarantines", () => {
  it("increments the counter on a single failure without quarantining below the cap", async () => {
    currentSuiteId = "suite-failing-once";
    const suite = baseSuite({ id: currentSuiteId, fixtureRecaptureFailures: 0 });

    await recordFixtureRecaptureFailure(suite);

    const quarantineWrite = recordedUpdates.find((u) => u.set.testStatus === "quarantined");
    expect(quarantineWrite).toBeUndefined();
  });

  it("quarantines exactly at MAX_FIXTURE_RECAPTURE_FAILURES consecutive failures, with a reason", async () => {
    currentSuiteId = "suite-failing-repeatedly";
    // Simulate MAX_FIXTURE_RECAPTURE_FAILURES - 1 prior failures already recorded.
    fixtureRecaptureFailuresByRowId[currentSuiteId] = MAX_FIXTURE_RECAPTURE_FAILURES - 1;
    const suite = baseSuite({
      id: currentSuiteId,
      fixtureRecaptureFailures: MAX_FIXTURE_RECAPTURE_FAILURES - 1,
    });

    await recordFixtureRecaptureFailure(suite);

    const quarantineWrite = recordedUpdates.find((u) => u.set.testStatus === "quarantined");
    expect(quarantineWrite).toBeTruthy();
    expect(String(quarantineWrite!.set.quarantineReason)).toMatch(/fixture recapture failing/i);
    expect(String(quarantineWrite!.set.quarantineReason)).toContain(String(MAX_FIXTURE_RECAPTURE_FAILURES));
  });

  it("does not quarantine at one below the cap", async () => {
    currentSuiteId = "suite-almost-capped";
    fixtureRecaptureFailuresByRowId[currentSuiteId] = MAX_FIXTURE_RECAPTURE_FAILURES - 2;
    const suite = baseSuite({
      id: currentSuiteId,
      fixtureRecaptureFailures: MAX_FIXTURE_RECAPTURE_FAILURES - 2,
    });

    await recordFixtureRecaptureFailure(suite);

    const quarantineWrite = recordedUpdates.find((u) => u.set.testStatus === "quarantined");
    expect(quarantineWrite).toBeUndefined();
  });

  it("continues to (re-)quarantine past the cap rather than throwing or going silent — bounded by the scheduler's weekly floor, not by freezing the counter", async () => {
    currentSuiteId = "suite-way-past-cap";
    fixtureRecaptureFailuresByRowId[currentSuiteId] = MAX_FIXTURE_RECAPTURE_FAILURES + 5;
    const suite = baseSuite({
      id: currentSuiteId,
      fixtureRecaptureFailures: MAX_FIXTURE_RECAPTURE_FAILURES + 5,
      testStatus: "quarantined",
    });

    await expect(recordFixtureRecaptureFailure(suite)).resolves.not.toThrow();
    const quarantineWrite = recordedUpdates.find((u) => u.set.testStatus === "quarantined");
    expect(quarantineWrite).toBeTruthy();
  });
});
