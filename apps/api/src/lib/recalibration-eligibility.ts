/**
 * Pure eligibility/selection logic for `POST /v1/internal/tests/recalibrate`
 * (Codex closing-pass review, round 3, 2026-08-18).
 *
 * `/recalibrate` calls the executor directly (`internal-tests.ts`),
 * bypassing `runSingleTest` entirely — so the runtime refusal gate
 * `runSingleTest` enforces for a suite quarantined after exhausted
 * fixture-recapture attempts (`FIXTURE_RECAPTURE_QUARANTINE_MARKER` on
 * `quarantine_reason` — see `test-runner.ts`'s `checkBaselineStaleness` /
 * `recordFixtureRecaptureFailure` doc comments for the full mechanism)
 * never sees this path at all. Without this check, an admin running
 * `/recalibrate` — even with `?dry-run`, since the live executor call is
 * NOT gated by `dryRun`, only the later DB write is — would silently
 * re-spend the exact Browserless calls the quarantine exists to stop,
 * defeating it via a side door.
 *
 * Extracted as pure functions (rather than left inline in the route
 * handler) so the selection logic is unit-testable without a DB/HTTP
 * harness — the route itself has neither, and this is the only part of
 * `/recalibrate` complex enough to be worth pulling out for that reason
 * (matches the convention `browserless-suite-migration.ts` already
 * established in this same effort: routes/scripts without a harness stay
 * thin, decision logic that needs coverage moves to src/lib).
 */

import { FIXTURE_RECAPTURE_QUARANTINE_MARKER } from "./test-runner.js";

export interface RecalSuiteLike {
  id: string;
  testType: string;
  testMode: string | null;
  testStatus: string | null;
  quarantineReason: string | null;
}

/**
 * Is this suite quarantined specifically for exhausted fixture-recapture
 * attempts? Scoped to that one cause (via the marker prefix), not any
 * quarantine reason — a suite quarantined for an unrelated cause
 * (upstream breakage, health-sweep escalation) is still eligible for
 * recalibration; only this specific "the runtime gate already refuses
 * this suite" state must be respected here too.
 */
export function isExhaustedRecapture(s: RecalSuiteLike): boolean {
  return (
    s.testMode === "fixture" &&
    s.testStatus === "quarantined" &&
    !!s.quarantineReason?.startsWith(FIXTURE_RECAPTURE_QUARANTINE_MARKER)
  );
}

/**
 * Pick the suite `/recalibrate` calls the executor with for one capability
 * slug, excluding any suite quarantined for exhausted recapture from both
 * the preferred candidate pool (known_answer / schema_check /
 * dependency_health) and the plain fallback. Returns `undefined` when
 * every suite for the slug is exhausted-recapture — the caller must then
 * skip calling the executor for this slug entirely, not fall back to a
 * quarantined suite.
 */
export function selectRecalibrationBestSuite<T extends RecalSuiteLike>(
  slugSuites: T[],
): T | undefined {
  const eligible = slugSuites.filter((s) => !isExhaustedRecapture(s));
  const calibratable = eligible.filter(
    (s) => s.testType === "known_answer" || s.testType === "schema_check" || s.testType === "dependency_health",
  );
  return calibratable[0] ?? eligible[0];
}
