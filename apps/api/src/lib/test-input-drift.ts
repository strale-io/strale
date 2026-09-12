/**
 * Detects drift between a stored `test_suites.input` row and the manifest
 * fixture it was generated from, for the two test types onboard.ts's
 * `buildTestSuites` derives entirely from manifest state rather than a
 * hand-written fixture of their own:
 *
 *  - `dependency_health`: `healthInput ?? knownAnswerEntries[0]?.input ?? {}`
 *  - `schema_check` (when the manifest has no known_answer fixture at all):
 *    `healthInput ?? {}`
 *
 * Neither test type has a supported concept of a permanently, intentionally
 * different stored input: both exist to answer "does the manifest's own
 * known-good input still work," not "does some other entity work." If an
 * operator wants a different health probe, the manifest's
 * `test_fixtures.health_check_input` is where that decision belongs. This
 * module treats any stored input that no longer equals the current
 * derivation as staleness, never as a deliberate override to preserve.
 *
 * ## Background: the incident this closes
 *
 * `irish-company-data`, `lithuanian-company-data`, and `swiss-company-data`
 * each had their manifest's `health_check_input` corrected at some point
 * (a bad CRO number / company code / UID replaced with one that resolves),
 * but the already-onboarded `dependency_health` row's `input` was never
 * resynced: onboard.ts's `--backfill --discover` path only ever updated
 * the `known_answer` row (`onboard.ts` around the `hasKnownAnswerUpdate`
 * block). The three suites quarantined for real: three consecutive live
 * recapture attempts against a no-longer-resolving identifier, correctly
 * capped by the fixture-recapture-exhausted guard. See
 * `handoff/_general/from-code/2026-09-11-recapture-refusal-lock.md`.
 *
 * `known_answer` is deliberately NOT covered by this module: its input is
 * the manifest's own declared fixture (single or array-form, one row per
 * entry point), which onboard.ts already resyncs on `--discover`/`--fix`
 * via a dedicated update keyed on `testType = 'known_answer'`. That path is
 * unchanged by this module.
 */

import { getKnownAnswerFixtures } from "./capability-manifest-types.js";
import type { Manifest } from "./capability-manifest-types.js";

/** Deep-equal by structural JSON comparison. Inputs are plain JSON objects. */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The `dependency_health` suite's input, as onboard.ts's `buildTestSuites`
 * derives it. Falls back to the first `known_answer` fixture's input when
 * the manifest declares no `health_check_input`, then to `{}` when neither
 * exists, identical fallback order to `buildTestSuites`.
 */
export function deriveDependencyHealthInput(manifest: Pick<Manifest, "test_fixtures">): unknown {
  const healthInput = manifest.test_fixtures?.health_check_input;
  if (healthInput !== undefined && healthInput !== null) return healthInput;
  const knownAnswerEntries = getKnownAnswerFixtures(manifest);
  return knownAnswerEntries[0]?.input ?? {};
}

export interface DriftCheck {
  capabilitySlug: string;
  testType: "dependency_health";
  storedInput: unknown;
  derivedInput: unknown;
  drifted: boolean;
}

/**
 * Compares one capability's stored `dependency_health` suite input against
 * the manifest's current derivation. `drifted: true` means the stored row is
 * stale relative to the manifest and is a candidate for resync, never a
 * signal to touch any other test type or any other capability's row.
 */
export function checkDependencyHealthDrift(
  capabilitySlug: string,
  storedInput: unknown,
  manifest: Pick<Manifest, "test_fixtures">,
): DriftCheck {
  const derivedInput = deriveDependencyHealthInput(manifest);
  return {
    capabilitySlug,
    testType: "dependency_health",
    storedInput,
    derivedInput,
    drifted: !deepEqual(storedInput, derivedInput),
  };
}
