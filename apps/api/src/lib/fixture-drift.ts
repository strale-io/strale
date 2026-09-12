/**
 * A test fixture the repository has already corrected, and production has not.
 *
 * ── The failure this exists to catch ────────────────────────────────────────
 *
 * `manifests/canadian-company-data.yaml` carries this comment, written on
 * 2026-08-12:
 *
 *   "Fixture corp swapped 2026-08-12: 2408951 is not resolvable via the
 *    official JSON API (pre-migration scrape-era fixture)."
 *
 * The manifest was corrected. Production was not. On 2026-09-12 the
 * `dependency_health` suite for that capability still held corporation number
 * 2408951 — a corporation the official Canadian registry says does not exist
 * ("could not find corporation 2408951", verified live) — and had passed 0 of
 * 173 runs in fourteen days, firing `regression_detected` every two hours for
 * a month.
 *
 * The reason nothing corrected it is structural, not an oversight:
 * `scripts/onboard.ts --backfill` inserts only test types that are MISSING,
 * and updates only `known_answer` (and only under `--discover` / `--fix`). An
 * existing `dependency_health` row's input is never rewritten from the
 * manifest. So fixing the manifest is, for that suite, a no-op against
 * production, and nothing anywhere compared the two.
 *
 * ── Why the check is narrow on purpose ──────────────────────────────────────
 *
 * "The DB fixture differs from the manifest" is NOT the signal. Measured over
 * the whole catalogue on 2026-09-12: of 326 active `dependency_health` suites,
 * **81** differ from their manifest's `health_check_input` — 36 of them
 * passing, 39 with no run in the window, 6 actionable. Reporting all 81 would
 * be a wrong-denominator finding of exactly the kind LESSONS.md F2 tracks, and
 * it would be ignored within a week.
 *
 * **A passing divergence does not mean production holds the better fixture**,
 * and an earlier draft of this comment asserted that it did. Of those 36, nine
 * carry an `auto_remediation_log`: their `input` was rewritten at runtime by
 * `lib/self-heal.ts` (rule `missing_input`), which is a THIRD writer of
 * `test_suites.input` besides the onboarding pipeline and a manual edit. And
 * two go the other way — `skill-extract`'s manifest holds a rich, realistic
 * input while production holds a generic one that passes trivially, and
 * `public-holiday-lookup`'s manifest is simply the stale side (`year: 2025`
 * against production's 2026). So the 36 are excluded because *a passing suite
 * is not the actionable signal*, which is all this check claims — not because
 * production is known to be right. Some of them are worth a look on their own
 * account; that is a different question from this one.
 *
 * The signal is the CONJUNCTION:
 *
 *   the DB fixture differs from the manifest  AND  the suite never passes.
 *
 * Then the repository is holding a fixture that production is not using, and
 * the fixture production IS using does not work. That pair is actionable and
 * nothing else here is. A suite that matches its manifest and still fails is a
 * real upstream problem and belongs to the vendor tower, not to this check.
 */

/** One active test suite as production holds it. */
export interface SuiteRow {
  /**
   * The suite's own id. Carried so a finding can name the row to fix, and
   * because grouping by (slug, test_type, input) instead silently collapses
   * two suites for one capability into one row with their runs summed —
   * `risk-narrative-generate` has two, which is how an earlier revision
   * counted 325 active suites and 80 divergences instead of 326 and 81.
   */
  suiteId: string;
  capabilitySlug: string;
  testType: string;
  /** The suite's input, already parsed from jsonb. */
  input: unknown;
  /** Runs recorded in the measurement window. */
  runs: number;
  /** Of those runs, how many passed. */
  passed: number;
  /** Most recent failure reason, for the report. */
  sampleFailure?: string | null;
  /** Whether the capability itself is switched on. */
  capabilityActive: boolean;
}

/** What the manifest says the fixture should be. */
export interface ManifestFixture {
  slug: string;
  /** `test_fixtures.health_check_input`, or undefined when the manifest has none. */
  healthCheckInput?: unknown;
}

export interface DriftFinding {
  suiteId: string;
  slug: string;
  capabilityActive: boolean;
  runs: number;
  /** The input production is actually using, canonicalised. */
  productionInput: string;
  /** The input the manifest says it should be, canonicalised. */
  manifestInput: string;
  sampleFailure: string | null;
}

/**
 * Order-insensitive, whitespace-insensitive comparison of two fixture inputs.
 *
 * Key order in jsonb is not stable and carries no meaning, so comparing raw
 * text would report every suite as drifted. Nested objects are sorted too:
 * a shallow sort declared two identical fixtures different as soon as one
 * carried an options object.
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
}

/**
 * The actionable set: suites whose production fixture both differs from the
 * manifest and never passes.
 *
 * Deliberately excluded, each for its own reason:
 *  - suites with no runs in the window — nothing is claimed about them;
 *  - suites that pass at all — the production fixture works, so whatever the
 *    manifest says, nothing is broken;
 *  - manifests with no `health_check_input` — there is no corrected value to
 *    compare against, so there is no drift to report;
 *  - suites that match their manifest and fail — a real upstream failure,
 *    owned by the vendor tower.
 */
export function findFixtureDrift(
  suites: readonly SuiteRow[],
  manifests: readonly ManifestFixture[],
  { testType = "dependency_health" }: { testType?: string } = {},
): DriftFinding[] {
  // Last wins on a duplicate slug. There are none today (all 350 manifests
  // checked, 2026-09-12) and `manifest-sync` would be the place to enforce it;
  // the behaviour is pinned by a test so a future duplicate changes visibly.
  const byslug = new Map(manifests.map((m) => [m.slug, m]));
  const findings: DriftFinding[] = [];

  for (const suite of suites) {
    if (suite.testType !== testType) continue;
    const manifest = byslug.get(suite.capabilitySlug);
    if (!manifest || manifest.healthCheckInput === undefined) continue;

    const productionInput = canonicalise(suite.input);
    const manifestInput = canonicalise(manifest.healthCheckInput);
    if (productionInput === manifestInput) continue;

    if (suite.runs === 0) continue;
    if (suite.passed > 0) continue;

    findings.push({
      suiteId: suite.suiteId,
      slug: suite.capabilitySlug,
      capabilityActive: suite.capabilityActive,
      runs: suite.runs,
      productionInput,
      manifestInput,
      sampleFailure: suite.sampleFailure ?? null,
    });
  }

  // Loudest first: an active capability failing the most runs is the one whose
  // health signal has been false for longest.
  return findings.sort(
    (a, b) => Number(b.capabilityActive) - Number(a.capabilityActive) || b.runs - a.runs,
  );
}
