/**
 * Invocation facts — the single authority on "did this capability work?" (WP9).
 *
 * ── The defect this closes ──────────────────────────────────────────────────
 *
 * The quality floor decides whether a capability stays on sale by joining
 * `transactions ON capability_id`. That works only because, for a direct
 * `/v1/do` call, the billing row and the invocation happen to be the same row.
 * For a solution step they are not: a bundle writes ONE transaction with
 * `capability_id = NULL`, and the step outcomes live inside an `output.steps`
 * JSONB blob. Production carries 694 such rows all-time, every one with a null
 * capability_id, and the sub-calls buried inside them exist nowhere else — so a capability that fails ONLY
 * inside bundles is invisible to the floor and cannot be quarantined at all.
 *
 * The fix is not a better join. It is to stop asking a billing artefact a
 * quality question. `transactions` records what we charged for; this records
 * what ran. WP4's `ExecutionOutcome` already computes exactly the verdict
 * needed and then discards it after the billing decision — here it is kept.
 *
 * ── What a fact deliberately does not carry ─────────────────────────────────
 *
 * No inputs, no outputs, no error strings. Only the verdict and enough context
 * to know which rail produced it. That is what lets the table outlive the
 * 90-day content redaction: there is nothing here the redaction exists to
 * remove, so retention can be set by what the floor needs.
 *
 * ── Failure handling ────────────────────────────────────────────────────────
 *
 * A fact write must never fail a customer's call — the call already happened,
 * and refusing to return its result because bookkeeping failed helps nobody.
 * So the write is best-effort. But a best-effort write whose failures are
 * invisible turns "the floor saw no traffic" and "the recorder is broken" into
 * the same observation, which is how a delisting decision gets made on a hole.
 * Two defences:
 *
 *   1. Every failure writes a marker event, so the floor can suppress action on
 *      the affected slug.
 *   2. The floor independently cross-checks fact volume against transaction
 *      volume per slug, which catches loss even when the marker write fails for
 *      the same reason the fact write did (the database being unreachable).
 *
 * Defence 2 is the load-bearing one. Defence 1 exists because it names the
 * cause, and a cross-check tells you only that something is wrong.
 *
 * Both live in jobs/quality-floor.ts: the marker query, and
 * `detectFactVolumeShortfall`. The first version of this file described both
 * and shipped only the first — the one this comment calls insufficient — so the
 * stated protection on an armed, non-self-reversing, public-surface write path
 * reduced to the mechanism it itself called inadequate. Found by review.
 */

import { getDb } from "../db/index.js";
import { capabilityInvocations, healthMonitorEvents } from "../db/schema.js";
import type { ExecutionOutcome } from "./execution-outcome.js";
import type { InvocationContext } from "../capabilities/guarded-executor.js";
import { logError } from "./log.js";

/**
 * Which ENTRY POINT produced the invocation — not which payment rail settled
 * it. `/v1/do` serves both wallet-funded and X-Payment (x402) callers, so a
 * payment-rail label would be wrong for a large share of its traffic; the entry
 * point is a fact about the call that is always true. Payment rail is already
 * recorded on the transaction, which is where a billing question belongs.
 *
 * Not derivable from the other columns: a solution step and a direct `/v1/do`
 * call agree on every one of them.
 */
export type InvocationRail =
  | "v1_do"
  | "x402_gateway"
  | "solution_step"
  | "harness"
  | "onboarding";

export const INVOCATION_RAILS: readonly InvocationRail[] = [
  "v1_do",
  "x402_gateway",
  "solution_step",
  "harness",
  "onboarding",
] as const;

export interface InvocationFact {
  capabilitySlug: string;
  rail: InvocationRail;
  contextKind: InvocationContext["kind"];
  /** Set when rail is 'solution_step' — the bundle this served. */
  solutionId?: string | null;
  /** The billing row this belongs to, where one exists. */
  transactionId?: string | null;
  /**
   * The calling account, where there is one. The floor applies the same
   * internal-account exclusion it applies to transactions.
   *
   * Note what this does NOT currently do. The internal test harness — roughly
   * 98% of platform traffic — invokes executors in-process via getExecutor
   * rather than over /v1/do, so it writes no facts at all, and this column is
   * not what keeps it out. An earlier version of this comment said the harness
   * reaches /v1/do over HTTP; it does not. The exclusion earns its place the
   * moment any non-customer path starts recording.
   */
  userId?: string | null;
  /**
   * Whether the call was served under the free tier. Anonymous zero-cost
   * traffic is the cheapest failure-fabrication vector, so the floor excludes
   * it. Per CALL, not per capability: an authenticated caller of a free-tier
   * capability is ordinary traffic.
   */
  isFreeTier?: boolean;
  latencyMs: number;
  /** The canonical WP4 verdict. Persisted, never re-derived downstream. */
  outcome: ExecutionOutcome;
}

/**
 * The window inside which the database refuses to DELETE a fact (block 0101).
 *
 * Mirrors the `INTERVAL '35 days'` in the trigger. Kept here as a number so the
 * retention rule can be checked against it: a retention window shorter than this
 * guard would make the nightly purge throw every time it ran, and it would throw
 * from inside a bulk job whose failures this platform has previously swallowed
 * for days at a time.
 */
export const INVOCATION_FACT_DELETE_GUARD_DAYS = 35;

/**
 * Record a fact for a CUSTOMER-SERVING invocation.
 *
 * Exists because the fields that decide whether the floor can READ a row turned
 * out to be the easiest thing in the package to break and the hardest to guard.
 * Five review rounds produced nine hollow assertions, and the last three were
 * all the same shape: a source-text guard pinned one writer file, and the same
 * one-token change stayed available in the next one. Reviewers kept finding it
 * because the guards were chasing call sites instead of removing them.
 *
 * So `context_kind` is no longer something a call site can get wrong — it is
 * written here, once, and customer rails cannot express any other value. A
 * mutation at a call site cannot make a paid call look like harness traffic,
 * because call sites no longer say.
 *
 * `is_free_tier` is derived here too, from the same two facts the transaction
 * row derives it from: the capability is free-tier AND there is no account. An
 * authenticated caller of a free-tier capability is ordinary traffic on both
 * sides, which is what keeps the fact branch and the pre-epoch transaction
 * branch measuring the same population.
 */
/**
 * Was an anonymous `/v1/do` call served WITHOUT payment?
 *
 * `executeFreeTier` serves three anonymous cases and only one of them paid:
 *
 *   - a genuinely free-tier capability      -> free
 *   - a progressive-unlock call             -> free
 *   - an X-Payment (x402) call              -> PAID
 *
 * The route stashes `x402_paid` on the context only after verifying a payment,
 * so its absence is the discriminator. Extracted as a pure function purely so
 * it can be asserted: review found the expression unguarded in BOTH directions
 * while every hop the value took afterwards was pinned. Inverted to always-true
 * the anonymous rail becomes permanently invisible to the floor; inverted to
 * always-false, genuine free traffic is scored as customer experience AND the
 * same variable disables the 10/day per-IP free cap, since that counter reads
 * `is_free_tier = true`.
 */
export function computeServedFree(x402Paid: unknown): boolean {
  return !x402Paid;
}

/**
 * Record a fact for a PAID customer invocation.
 *
 * Takes no free-tier input, and that is the point. Seven of the nine call sites
 * that used to supply one had no guard, and review kept finding the same defect
 * one file over because each round pinned one more file with a source-text
 * assertion. A rail that cannot say "free" cannot say it wrongly.
 */
export async function recordPaidInvocation(
  fact: Omit<InvocationFact, "contextKind" | "isFreeTier">,
): Promise<void> {
  await recordInvocation({ ...fact, contextKind: "customer_paid", isFreeTier: false });
}

/**
 * Record a fact for an invocation on the ANONYMOUS `/v1/do` rail.
 *
 * The only entry point that may say a call was served free, because it is the
 * only one where that can be true: `executeFreeTier` serves three anonymous
 * cases — a genuinely free-tier capability, a progressive-unlock call, and an
 * X-Payment call — and only the last was paid for.
 *
 * `servedFree` is supplied rather than derived because the writer cannot know
 * it: whether a call was paid is decided at the route, before settlement, and
 * nothing about the fact reveals it. Two derivations have been falsified in
 * opposite directions — reading the capability's flag missed the two paid cases
 * that stamp `is_free_tier: true`, and reading the rail plus absence of an
 * account missed that a SUCCESSFUL X-Payment call is UPDATEd back to false on
 * settlement (5 of 5 such rows in production are false).
 *
 * So the enforceable invariant is not that the writer computes it, but that the
 * route computes it ONCE and both the transaction row and this fact get the
 * same variable.
 */
export async function recordAnonymousInvocation(
  fact: Omit<InvocationFact, "contextKind" | "isFreeTier"> & { servedFree: boolean },
): Promise<void> {
  const { servedFree, ...rest } = fact;
  await recordInvocation({ ...rest, contextKind: "customer_paid", isFreeTier: servedFree });
}

/** Marker event type. The floor reads this; nothing else writes it. */
export const FACT_WRITE_FAILED_EVENT = "invocation_fact_write_failed";

/**
 * Record one invocation. Never throws — see the failure-handling note above.
 *
 * Called once per LOGICAL invocation, at the same granularity as the
 * dispatcher gate (`assertGuardedAllow`). A retry inside one logical call is
 * one fact, carrying the outcome the caller ultimately acted on, so fact
 * volume stays comparable to transaction volume and the floor's completeness
 * cross-check means something.
 */
export async function recordInvocation(fact: InvocationFact): Promise<void> {
  try {
    const db = getDb();
    await db.insert(capabilityInvocations).values({
      capabilitySlug: fact.capabilitySlug,
      rail: fact.rail,
      contextKind: fact.contextKind,
      solutionId: fact.solutionId ?? null,
      transactionId: fact.transactionId ?? null,
      userId: fact.userId ?? null,
      isFreeTier: fact.isFreeTier ?? false,
      success: fact.outcome.success,
      failureClass: fact.outcome.failure_class,
      fault: fact.outcome.fault,
      billable: fact.outcome.billable,
      countsAgainstCapability: fact.outcome.counts_against_capability,
      // Guard against a caller handing us NaN from a mis-ordered clock read:
      // a NOT NULL integer column would reject it and turn a bookkeeping slip
      // into a dropped fact.
      latencyMs: Number.isFinite(fact.latencyMs) ? Math.max(0, Math.round(fact.latencyMs)) : 0,
    });
  } catch (err) {
    // No in-process counter here. The first version kept one and described it
    // as "exposed for the health surface"; nothing ever read it, and an
    // in-process counter dies with the process that observed the problem
    // anyway. The durable signals are the marker event below and the volume
    // cross-check the floor runs.
    logError("invocation-fact-write-failed", err, {
      slug: fact.capabilitySlug,
      rail: fact.rail,
    });
    await writeFailureMarker(fact.capabilitySlug, err);
  }
}

/**
 * Best-effort marker so the floor can name the cause. This write targets the
 * same database that just refused the fact, so when the cause is "database
 * unreachable" it fails too — which is precisely why the floor does not rely
 * on it alone.
 */
async function writeFailureMarker(slug: string, cause: unknown): Promise<void> {
  try {
    const db = getDb();
    await db.insert(healthMonitorEvents).values({
      eventType: FACT_WRITE_FAILED_EVENT,
      capabilitySlug: slug,
      tier: 2,
      actionTaken: "fact_dropped",
      details: {
        reason: cause instanceof Error ? cause.message.slice(0, 200) : String(cause).slice(0, 200),
        consequence:
          "quality-floor evidence for this capability is incomplete for this window",
      },
    });
  } catch (err) {
    logError("invocation-fact-marker-write-failed", err, { slug });
  }
}
