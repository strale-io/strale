/**
 * Classifies a fixture-drift finding's cause from its `sampleFailure` text.
 *
 * Split out of `scripts/fixture-drift-groups.ts` (which does the production
 * query and re-uses `findFixtureDrift`) so this pure classification step
 * has a regression test that doesn't require a database connection, same
 * split as `fixture-drift.ts` (comparison logic in `src/lib`, runner in
 * `scripts/`).
 *
 * Why this matters, not just naming: `stale_identifier` and
 * `ambiguous_match` are fixable by correcting the stored input (a
 * resyncable data problem); `policy_refusal` never is, no matter what the
 * input says, because the ALLOW_MATRIX refusal fires in
 * `assertGuardedAllow` (`apps/api/src/capabilities/guarded-executor.ts`)
 * before the executor ever sees the input; `quota_refusal` is a scheduling
 * question (when the suite runs), not a data one. Treating all four the
 * same way would recommend "fix the input" for a class where fixing the
 * input cannot possibly help.
 */
export type DriftCause = "stale_identifier" | "ambiguous_match" | "policy_refusal" | "quota_refusal" | "other";

export function classifyDriftCause(sampleFailure: string | null | undefined): DriftCause {
  const s = sampleFailure ?? "";
  if (/refuses invocation from context kind/.test(s)) return "policy_refusal";
  if (/has exhausted its .* test budget/.test(s)) return "quota_refusal";
  if (/No confident .* registry match|Ambiguous .* name|none with that exact/.test(s)) return "ambiguous_match";
  if (/quota exceeded|quota has been temporarily exceeded|daily quota .* exhausted/i.test(s)) return "quota_refusal";
  if (/No .* (found|company found)|does not exist|could not find/i.test(s)) return "stale_identifier";
  return "other";
}
