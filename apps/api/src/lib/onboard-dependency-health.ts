/**
 * The validation checks a generated `dependency_health` suite should carry.
 *
 * `onboard.ts` used to emit `[{ field: "status", operator: "not_null" }]` for
 * every capability, unconditionally. Most executors return no `status` field,
 * so that suite fails on every run, forever. Four of five suites pass, which
 * pins the capability at a permanent 80% against `capability-promotion`'s 95%
 * bar — it is scheduled, it is healthy, and it can never be promoted.
 *
 * This is the "non-null on an optional field" trap CLAUDE.md warns about,
 * arriving through the generator rather than through a hand-written fixture.
 *
 * ## Why this needed fixing at the source
 *
 * Two mechanisms already clean it up downstream, and neither stops it:
 *
 *  - `startup-migrations.ts` carries a block (2026-09-05) that rewrites the
 *    rules to `{"checks":[]}` for six HARDCODED slugs. It fixed that session's
 *    capabilities and cannot fix anyone else's.
 *  - `auto-remediation.ts` empties the check after the SECOND failure. That
 *    works, but the two failures stay in the pass-rate history: at
 *    `minTests = 40` two failures is exactly 95.0%, sitting on the promotion
 *    boundary where one transient upstream blip restarts the wait.
 *
 * Eight capabilities onboarded 2026-09-06 hit it again, at 80-83%. Three had
 * already been auto-remediated; five had not. Fixing the generator is what
 * stops the ninth.
 *
 * ## The rule
 *
 * Assert `status` only when the manifest declares it `guaranteed`. That is
 * the same rule CLAUDE.md already states for `known_answer` — "only
 * `guaranteed` fields are used in known_answer test assertions ... this
 * prevents the 'expected non-null on optional field' problem" — applied to the
 * one suite that was exempt from it.
 *
 * It keeps the legitimate cases: `cve-details` declares `status: guaranteed`
 * (NVD's "Analyzed"), as do the registry capabilities that return a company
 * status, and their checks are correct and stay.
 */

/** A generated validation check, in the shape `test_suites.validation_rules` stores. */
export interface GeneratedCheck {
  field: string;
  operator: string;
}

/**
 * Checks for a capability's generated `dependency_health` suite.
 *
 * Empty is the correct answer for most capabilities: the suite still executes
 * the capability against its live dependency, and an executor that throws
 * fails the run. The check list adds an assertion on TOP of that, and an
 * assertion on a field the output does not have tests nothing but the
 * generator's own assumption.
 */
export function dependencyHealthChecks(manifest: {
  output_field_reliability?: Record<string, string> | null;
}): GeneratedCheck[] {
  const declared = manifest.output_field_reliability ?? {};
  return declared.status === "guaranteed"
    ? [{ field: "status", operator: "not_null" }]
    : [];
}
