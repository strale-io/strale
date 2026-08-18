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
 * Design (per session brief, constraints 1-2, hardened by the 2026-08-18
 * Codex closing-pass review — HIGH-2a and the EDGE case below):
 *   1. Each of the 12 capabilities keeps exactly ONE live suite — the
 *      `known_answer` suite where present (it's the only test_type that
 *      feeds `recordTestEvidence`/the circuit breaker on a pass — see
 *      `shouldRecordTestEvidence` in test-runner.ts — so keeping it live is
 *      strictly better signal-per-call than keeping `dependency_health`
 *      live), converted to `test_mode = 'canary'` (24h floor, see
 *      `minRetestIntervalHours` in jobs/test-scheduler.ts). Falls back to
 *      `dependency_health` if a capability has no active `known_answer`
 *      suite.
 *
 *      EDGE (Codex-noted): if a capability has NEITHER an active
 *      `known_answer` NOR an active `dependency_health` suite, converting
 *      its other suites to fixture mode would leave it with ZERO live
 *      suites — a silent blind spot with no genuine signal at all. The
 *      planner refuses to convert ANY suite for such a capability
 *      (`refused_no_live_candidate`) and reports it distinctly, rather than
 *      partially converting. None of the 12 target capabilities hit this
 *      today (all 12 have an active known_answer suite — confirmed against
 *      prod 2026-08-18), but the guard exists so a future suite
 *      deactivation can't silently create the blind spot.
 *
 *   2. The other Browserless-touching suite types on that capability
 *      (`dependency_health`|`edge_case`|`known_bad`|`negative`, whichever
 *      isn't the chosen canary) convert to `test_mode = 'fixture'`.
 *
 *      HIGH-2a (Codex review): the conversion itself must not force an
 *      unnecessary recapture. A suite whose existing baseline is already
 *      fresh (present, dateable, and not edited since capture — the same
 *      edit-invalidation check `checkBaselineStaleness` in test-runner.ts
 *      applies) gets its `test_mode` flipped WITHOUT touching `updated_at`
 *      — `bumpUpdatedAt: false` on its plan — so the fresh baseline stays
 *      fresh and the suite goes straight to zero-cost fixture replay on its
 *      very next dispatch. Only suites whose baseline is missing or already
 *      stale get `bumpUpdatedAt: true` (moot for them either way — they
 *      need a live recapture regardless of what this migration does). This
 *      is deliberately a NARROW, LOCAL mirror of `checkBaselineStaleness`'s
 *      edit-invalidation axis only (`hasFreshBaseline` below) — not an
 *      import of test-runner.ts, which pulls in DB/executor-registry
 *      machinery this module has no other reason to depend on. The two
 *      checks are cross-referenced in comments so they don't silently
 *      drift; `hasFreshBaseline`'s own tests pin the exact boundary
 *      conditions against `checkBaselineStaleness`'s documented behavior.
 *      (The max-age axis — `fixture_last_refreshed` — is untouched by
 *      whether `updated_at` gets bumped, so the planner doesn't need to
 *      reason about it at all.)
 *
 *      If a suite has no baseline yet (or its baseline is already stale),
 *      the very next scheduled run executes live exactly once to capture
 *      one, then settles into the zero-cost fixture replay path — by
 *      design, "fine" per the session brief.
 *
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
 * wrapper around `planMigration`.
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
  /** Whether test_suites.baseline_output is non-null. */
  hasBaseline: boolean;
  baselineCapturedAt: Date | null;
  updatedAt: Date | null;
}

export type SuiteAction =
  | "convert_to_canary"
  | "convert_to_fixture"
  | "unchanged"
  | "not_targeted"
  | "refused_no_live_candidate";

export interface SuitePlan {
  id: string;
  capabilitySlug: string;
  testType: string;
  currentMode: string | null;
  targetMode: string | null; // null when not_targeted/refused (no change intended, ever)
  action: SuiteAction;
  reason: string;
  /**
   * Whether the apply step's UPDATE should bump `updated_at`. Only ever
   * `true` for `convert_to_fixture` plans whose existing baseline is
   * missing or already stale (where it's moot — see HIGH-2a above);
   * `false` for `convert_to_fixture` plans with a fresh baseline, so the
   * conversion doesn't manufacture an edit-invalidation staleness that
   * wasn't there before. `true` for `convert_to_canary` (canary mode
   * doesn't read baseline_output at all, so this is harmless either way).
   * Meaningless (left `true`) for actions the apply step never writes.
   */
  bumpUpdatedAt: boolean;
}

/**
 * Narrow, local mirror of `checkBaselineStaleness`'s edit-invalidation axis
 * ONLY (test-runner.ts) — deliberately not the age axis, since whether
 * `updated_at` gets bumped has no bearing on `fixture_last_refreshed`-based
 * staleness. See this module's header for why this isn't an import of
 * test-runner.ts itself.
 */
export function hasFreshBaseline(suite: {
  hasBaseline: boolean;
  baselineCapturedAt: Date | null;
  updatedAt: Date | null;
}): boolean {
  if (!suite.hasBaseline) return false;
  if (!suite.baselineCapturedAt) return false; // undateable — mirrors "no_capture_timestamp" => stale
  if (suite.updatedAt && suite.baselineCapturedAt.getTime() < suite.updatedAt.getTime()) return false; // edited since capture
  return true;
}

/**
 * Plan the migration for ONE capability's active test suites.
 *
 * `suites` should be every `test_suites` row for a single capability (any
 * capability, not necessarily one of the 12 — callers are responsible for
 * pre-filtering to `TARGET_SLUGS`; this function doesn't re-check the slug
 * itself so it stays trivially testable with synthetic slugs).
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

  // EDGE (Codex-noted): would this capability be left with zero live
  // suites? True only if there's no canary candidate AND there's at least
  // one suite that would otherwise be converted (canary or fixture) — a
  // capability whose only suites are schema_check/piggyback has nothing to
  // refuse in the first place.
  const hasAnyConvertCandidate = suites.some(
    (s) => s.active && s.testType !== PIGGYBACK_TYPE && !NEVER_TOUCHED_TYPES.has(s.testType),
  );
  const refuseWholeCapability = canaryId === null && hasAnyConvertCandidate;

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
        bumpUpdatedAt: false,
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
        bumpUpdatedAt: false,
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
        bumpUpdatedAt: false,
      });
      continue;
    }

    if (refuseWholeCapability) {
      plans.push({
        id: suite.id,
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        currentMode: suite.testMode,
        targetMode: null,
        action: "refused_no_live_candidate",
        reason:
          "capability has no active known_answer or dependency_health suite to keep live — " +
          "converting the rest to fixture would leave it with ZERO live suites (silent blind spot). " +
          "Refusing the whole capability's conversion; needs a human to add/reactivate a canary candidate first.",
        bumpUpdatedAt: false,
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
          bumpUpdatedAt: true,
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
          bumpUpdatedAt: true,
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
        bumpUpdatedAt: true,
      });
    } else {
      const fresh = hasFreshBaseline(suite);
      plans.push({
        id: suite.id,
        capabilitySlug: suite.capabilitySlug,
        testType: suite.testType,
        currentMode: suite.testMode,
        targetMode: "fixture",
        action: "convert_to_fixture",
        reason: fresh
          ? "Browserless-touching, not the canary — converting to zero-cost fixture replay; " +
            "baseline is already fresh, so updated_at is left untouched to avoid forcing an unnecessary recapture"
          : "Browserless-touching, not the canary — converting to zero-cost fixture replay; " +
            "baseline is missing or already stale, so the next dispatch recaptures it live once regardless",
        bumpUpdatedAt: !fresh,
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
