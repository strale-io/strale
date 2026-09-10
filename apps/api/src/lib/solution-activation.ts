/**
 * The single authority on whether an automated sweep may switch a solution ON.
 *
 * Two independent code paths auto-activate solutions:
 *
 *  - `db/seed-solutions.ts` — the qualification pass at the end of seeding;
 *  - `jobs/test-scheduler.ts` `checkSolutionGates()` — runs after EVERY
 *    capability test, for every inactive solution containing that capability.
 *
 * They were written separately and disagreed. On 2026-09-06 the seeding pass
 * was taught to respect a deliberate deactivation; the scheduler's copy was not
 * found, kept the old rule — "every step passed a test in the last 30 days" —
 * and revived four solutions within minutes of each deactivation for the next
 * four days. Its rule ignored both the solution's `deactivation_reason` and
 * whether the step capabilities were still switched on, so a capability
 * deactivated today kept its bundle "qualified" on the strength of passing
 * results from last week.
 *
 * This is the "one list, many matchers" failure class: the fix belongs in a
 * predicate both callers import, not in two copies kept in step by hand. A
 * third caller that auto-activates a solution must import this module — and
 * `solution-activation.test.ts` fails the build if it doesn't.
 */

/**
 * Whether a solution was switched off for a stated reason, and so must not be
 * switched back on by any automated sweep.
 *
 * `vendor:` reasons are excluded because vendor-control-tower.ts owns those and
 * runs its own restore cycle; it applies the same convention to this table
 * (`deactivation_reason IS NULL OR LIKE 'vendor:%'`). Anything else was
 * written by a person or a control that meant it.
 */
export function wasDeactivatedDeliberately(deactivationReason: unknown): boolean {
  const reason = typeof deactivationReason === "string" ? deactivationReason : "";
  return reason.trim() !== "" && !reason.startsWith("vendor:");
}

/** What an auto-activation sweep knows about one step of a solution. */
export interface StepState {
  capabilitySlug: string;
  /** `capabilities.is_active` right now. Past test results say nothing about this. */
  capabilityActive: boolean;
  /** At least one passing test_result inside the caller's recency window. */
  hasRecentPass: boolean;
}

/**
 * Whether an inactive solution may be switched on automatically.
 *
 * Every condition is necessary:
 *  - it has at least one step (an empty bundle is not "fully qualified");
 *  - it was not deactivated deliberately;
 *  - every step capability is switched on NOW — the condition the scheduler's
 *    copy lacked, and the one that let a dropped capability keep its bundle
 *    alive on historical results;
 *  - every step has a recent passing result.
 */
export function mayAutoActivateSolution(input: {
  deactivationReason: unknown;
  steps: StepState[];
}): boolean {
  if (input.steps.length === 0) return false;
  if (wasDeactivatedDeliberately(input.deactivationReason)) return false;
  return input.steps.every((s) => s.capabilityActive && s.hasRecentPass);
}
