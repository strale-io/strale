/**
 * Whether a newly onboarded capability's test suites may be scheduled.
 *
 * `test_suites.scheduled_testing_eligible` defaults to FALSE and `onboard.ts`
 * used to set nothing, so a capability onboarded WITH a `cost_class` got five
 * suites the scheduler skips forever (`test-scheduler.ts` requires the flag
 * TRUE) and therefore never earned the green week its promotion depends on.
 *
 * The boot reconcile in `startup-migrations.ts` block 0066 does not rescue it:
 * that block's `UNCLASSIFIED_ONLY` predicate is `cost_class IS NULL`, and the
 * manifest template tells authors to declare a cost_class. So the two
 * mechanisms between them covered every capability EXCEPT a correctly
 * authored new one.
 *
 * Found 2026-09-06 by onboarding eight capabilities and noticing that the only
 * 40 non-eligible free suites in production were the 40 just inserted.
 *
 * ## Why this keys on cost_class and not external_cost_cents
 *
 * The platform's own invariant is `eligible = (external_cost_cents = 0)`, and
 * block 0066 reconciles exactly that. But `onboard.ts` does not set
 * `external_cost_cents` either, so reading it at insert time would see the
 * column default of 0 for a PAID capability and put vendor-billed calls on a
 * timer — the failure Principle A ("health probes must never consume billable
 * API calls") and the scheduler's paid-capability exclusion both exist to
 * prevent.
 *
 * A declared free class is the only thing the manifest actually asserts, so it
 * is the only thing that grants scheduling. Everything else — paid classes,
 * and an absent cost_class — stays FALSE, which is today's behaviour and lets
 * block 0066 keep owning the unclassified case.
 */

/** Cost classes the manifest may declare. */
export type CostClass =
  | "free_unlimited"
  | "free_quota"
  | "paid_with_free_tier"
  | "paid_prepaid"
  | "paid_subscription";

/**
 * True only for a class that asserts the upstream is free at every call.
 *
 * `paid_with_free_tier` is deliberately excluded: its free allowance is real
 * but finite, and nothing in the manifest says how much of it a scheduled
 * sweep may spend. Scheduling it would burn a customer-facing allowance on
 * internal tests. If that ever becomes desirable it needs its own budget, not
 * a widened predicate here.
 */
export function suitesAreSchedulable(costClass: CostClass | string | undefined | null): boolean {
  return costClass === "free_unlimited" || costClass === "free_quota";
}
