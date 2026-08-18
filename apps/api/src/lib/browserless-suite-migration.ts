/**
 * Pure planning logic for the Browserless harness-burn mitigation
 * (2026-08-18, branch `ops/cut-browserless-harness-burn`).
 *
 * Finding (verified against prod, read-only, 2026-08-18): Browserless
 * consumed ~22,306 calls in 30 days; 12 `cost_class = 'free_unlimited'`
 * capabilities whose test suites run `test_mode = 'live'` on the normal
 * hourly schedule accounted for the large majority of it. Root cause:
 * `external_cost_cents = 0` means "free to the customer" (registry data is
 * free), but every live render still burns a real Browserless unit — the
 * cost model has no notion of infrastructure units, so
 * `scheduled_testing_eligible = true` schedules these freely.
 *
 * Design (per session brief, constraints 1-2):
 *   1. Each of the 12 capabilities keeps exactly ONE live suite — the
 *      `known_answer` suite where present (it's the only test_type that
 *      feeds `recordTestEvidence`/the circuit breaker on a pass — see
 *      `shouldRecordTestEvidence` in test-runner.ts — so keeping it live is
 *      strictly better signal-per-call than keeping `dependency_health`
 *      live), converted to `test_mode = 'canary'` (24h floor, see
 *      `minRetestIntervalHours` in jobs/test-scheduler.ts). Falls back to
 *      `dependency_health` if a capability has no active `known_answer`
 *      suite (none observed in the 12, but the logic doesn't assume it).
 *   2. The other Browserless-touching suite types on that capability
 *      (`dependency_health`|`edge_case`|`known_bad`|`negative`, whichever
 *      isn't the chosen canary) convert to `test_mode = 'fixture'`. If a
 *      suite has no baseline yet (or its baseline has gone stale per
 *      `isBaselineStale` in test-runner.ts), the very next scheduled run
 *      executes live exactly once to capture one, then settles into the
 *      zero-cost fixture replay path — by design, "fine" per the session
 *      brief.
 *   3. `schema_check` and `regression` suites are NEVER touched — they
 *      already short-circuit to a free dry-run/structural check in
 *      test-runner.ts's `runSingleTest` regardless of `test_mode` (the
 *      `testType === "schema_check"` branch runs before the fixture-mode
 *      check), so they were never part of the Browserless burn. `piggyback`
 *      suites are NEVER touched — Principle C (CLAUDE.md) keeps them out of
 *      scheduled testing entirely; they only receive data from real
 *      customer traffic.
 *   4. Suites already at their target `test_mode` are reported `unchanged`
 *      — the migration is idempotent, and the script/CLI wrapper must never
 *      re-touch (and thus re-bump `updated_at` on, forcing an unnecessary
 *      baseline recapture for) a suite that's already correct.
 *
 * apps/api/scripts is outside vitest's include glob (see the sibling
 * `repair-limitation-titles.ts` script's header comment for the established
 * convention), so the decision logic that needs test coverage lives here in
 * src/lib; `scripts/convert-browserless-suites-to-fixture.ts` is a thin DB
 * wrapper around `planSuiteMigration`.
 */

/**
 * The 12 capabilities identified in the 2026-08-18 finding. Hardcoded
 * deliberately, not derived from a live query against `cost_class` /
 * `capability_type` — the session brief is explicit ("Do NOT touch suites
 * of capabilities outside the 12"), and a live query could silently widen
 * scope if the catalog changes cost_class classification later. Widening
 * this list is a conscious future decision, not a side effect of a schema
 * drift.
 */
export const TARGET_SLUGS: readonly string[] = [
  "screenshot-url",
  "html-to-pdf",
  "url-to-markdown",
  "tech-stack-detect",
  "seo-audit",
  "accessibility-audit",
  "eu-regulation-search",
  "japanese-company-data",
  "swiss-company-data",
  "latvian-company-data",
  "lithuanian-company-data",
  "irish-company-data",
] as const;

/** Suite test_types that never touch the executor — never part of the burn, never touched. */
const NEVER_TOUCHED_TYPES = new Set(["schema_check", "regression"]);

/** Piggyback suites are scheduler-exempt (Principle C) — never touched. */
const PIGGYBACK_TYPE = "piggyback";

/** Preference order for the one suite kept genuinely live per capability. */
const CANARY_TYPE_PREFERENCE = ["known_answer", "dependency_health"] as const;

export interface SuiteRow {
  id: string;
  capabilitySlug: string;
  testType: string;
  testMode: string | null;
  active: boolean;
}

export type SuiteAction =
  | "convert_to_canary"
  | "convert_to_fixture"
  | "unchanged"
  | "not_targeted";

export interface SuitePlan {
  id: string;
  capabilitySlug: string;
  testType: string;
  currentMode: string | null;
  targetMode: string | null; // null when not_targeted (no change intended, ever)
  action: SuiteAction;
  reason: string;
}

/**
 * Plan the migration for ONE capability's active test suites.
 *
 * `suites` should be every active `test_suites` row for a single capability
 * (any capability, not necessarily one of the 12 — callers are responsible
 * for pre-filtering to `TARGET_SLUGS`; this function doesn't re-check the
 * slug itself so it stays trivially testable with synthetic slugs).
 */
export function planCapabilityMigration(suites: SuiteRow[]): SuitePlan[] {
  const plans: SuitePlan[] = [];

  // Pick the canary: first active suite whose testType matches the
  // preference order. At most one canary per capability.
  let canaryId: string | null = null;
  for (const preferredType of CANARY_TYPE_PREFERENCE) {
    const candidate = suites.find((s) => s.active && s.testType === preferredType);
    if (candidate) {
      canaryId = candidate.id;
      break;
    }
  }

  for (const suite of suites) {
    if (!suite.active) {
      plans.push({
        id: suite.id,
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        currentMode: suite.testMode,
        targetMode: null,
        action: "not_targeted",
        reason: "suite is inactive",
      });
      continue;
    }

    if (suite.testType === PIGGYBACK_TYPE) {
      plans.push({
        id: suite.id,
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        currentMode: suite.testMode,
        targetMode: null,
        action: "not_targeted",
        reason: "piggyback — Principle C, never scheduled proactively, never touched",
      });
      continue;
    }

    if (NEVER_TOUCHED_TYPES.has(suite.testType)) {
      plans.push({
        id: suite.id,
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        currentMode: suite.testMode,
        targetMode: null,
        action: "not_targeted",
        reason: `${suite.testType} already short-circuits to a free dry-run/structural check regardless of test_mode — never touched Browserless`,
      });
      continue;
    }

    const currentMode = suite.testMode ?? "live";

    if (suite.id === canaryId) {
      if (currentMode === "canary") {
        plans.push({
          id: suite.id,
          capabilitySlug: suite.capabilitySlug,
          testType: suite.testType,
          currentMode: suite.testMode,
          targetMode: "canary",
          action: "unchanged",
          reason: "already the kept-live canary suite",
        });
      } else {
        plans.push({
          id: suite.id,
          capabilitySlug: suite.capabilitySlug,
          testType: suite.testType,
          currentMode: suite.testMode,
          targetMode: "canary",
          action: "convert_to_canary",
          reason: `chosen as the one kept-live suite (${suite.testType}) — will drop from hourly to a 24h floor via minRetestIntervalHours`,
        });
      }
      continue;
    }

    // Every other executor-invoking suite type on this capability converts
    // to fixture mode.
    if (currentMode === "fixture") {
      plans.push({
        id: suite.id,
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        currentMode: suite.testMode,
        targetMode: "fixture",
        action: "unchanged",
        reason: "already fixture mode",
      });
    } else {
      plans.push({
        id: suite.id,
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        currentMode: suite.testMode,
        targetMode: "fixture",
        action: "convert_to_fixture",
        reason: "Browserless-touching, not the canary — converting to zero-cost fixture replay",
      });
    }
  }

  return plans;
}

/** Convenience: plan across many capabilities' suites at once, grouped by capabilitySlug. */
export function planMigration(allSuites: SuiteRow[]): SuitePlan[] {
  const bySlug = new Map<string, SuiteRow[]>();
  for (const suite of allSuites) {
    const list = bySlug.get(suite.capabilitySlug) ?? [];
    list.push(suite);
    bySlug.set(suite.capabilitySlug, list);
  }
  const plans: SuitePlan[] = [];
  for (const slug of bySlug.keys()) {
    plans.push(...planCapabilityMigration(bySlug.get(slug)!));
  }
  return plans;
}
