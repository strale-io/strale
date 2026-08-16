/**
 * Capability promotion — the missing counterpart to the quality floor.
 *
 * `lib/quality-floor.ts` takes capabilities OFF the catalog. Nothing put them
 * back. Its header says so in as many words: "Promotion is NOT automatic in
 * v1 — the platform-doctor flow ... restores the flags." The doctor flow is a
 * human, and the SQS engine that used to run `validating → active` was deleted
 * on 2026-05-05 (DEC-20260503-B). So since May there has been no code path,
 * automatic or scheduled, that makes a capability visible.
 *
 * Measured, prod 2026-08-16: 17 capabilities are `is_active = true,
 * visible = false` — absent from /v1/capabilities (290 listed) and unbuyable
 * on x402, the rail essentially all revenue arrives on. Five of them are
 * genuine dark launches from 2026-08-13/14 with a 91–100% harness record and
 * no way to ever become visible. They are the population this job exists for.
 *
 * The other twelve are not, and finding that out is why the takedown
 * interlock below exists. `brazilian-company-data`, `url-to-text` and
 * `screenshot-url` all show a 100% harness pass rate over the full week — and
 * all three were quarantined by the quality floor in ENFORCE mode on
 * 2026-08-12/13 for 39–59% completion on real paid customer calls. A
 * promotion job reading only the harness would have re-listed all three the
 * night after the floor delisted them, forever, on evidence from an
 * instrument that never sees a customer. That gap between "100% in our tests"
 * and "39% for people paying" is the most important thing this module's
 * authoring turned up, and it is a measurement problem, not a promotion one.
 *
 * This module is the pure decision core. Given per-capability evidence, it
 * decides who gets published.
 *
 * ## Why the test harness is the instrument here
 *
 * The floor reads `transactions` — real external traffic. That instrument is
 * unavailable by construction on this side: a delisted capability receives no
 * catalog traffic, so its real-traffic record is empty and stays empty. The
 * only evidence a dark capability can generate is the scheduled harness, which
 * is also what DEC-20260812-A means by "first green week". Piggyback suites
 * are fed by real customer calls and are strictly better evidence — so they
 * get their own gate rather than being averaged in (see below).
 *
 * ## Why the bar is higher than the floor's
 *
 * The floor quarantines below 70%. Promotion does NOT use 70% — a capability
 * that only just clears the delisting bar has no business being advertised.
 * The bar is ≥95% over ≥`minTests` results spanning ≥`minDistinctTestDays`
 * days, AND the `known_answer` suite must itself be green. That last clause is
 * the one that matters: schema, negative and dependency-health tests can all
 * pass while the capability returns confidently wrong answers, and an
 * aggregate pass rate hides that behind volume.
 *
 * ## What cross-provider review changed (2026-08-16, sol@high)
 *
 * The first draft of this module was reviewed by the other provider before
 * merge. Five of its findings are answered by code here, and they are the
 * reason several gates exist that a reading of DEC-20260812-A alone would not
 * suggest:
 *
 * 1. **A floor quarantine must not be undone by harness evidence — unless the
 *    floor itself now agrees.** The floor delists on real paid traffic and
 *    leaves `lifecycle_state='active'`, `deactivation_reason` NULL — which is
 *    exactly the shape of a promotable dark launch. Without an interlock this
 *    job would re-list a capability every day that the floor delists every
 *    night, on evidence from a harness that never sees the failing customer
 *    calls. `wasDelisted` distinguishes "never listed" (a dark launch,
 *    promotable) from "taken down" (a floor quarantine, a human unpublish, or
 *    a suspension). A human/operator takedown (`wasDelisted &&
 *    !wasFloorQuarantine`) is still flagged, never auto-promoted — this job
 *    does not overturn a person's decision. A *floor* takedown
 *    (`wasFloorQuarantine`) is different as of the 2026-08-16 "promotion
 *    grace" fix: DEC-20260812-A lists "auto-promote on recovery" as a
 *    platform-acts-alone action, and `jobs/quality-floor.ts` now clamps its
 *    own evidence window to since-last-promotion — so if this job reverses a
 *    floor quarantine wrongly, the floor re-quarantines on fresh
 *    post-promotion traffic instead of replaying the same contaminated 30d
 *    window that caused the original bounce (screenshot-url,
 *    2026-08-13T07:34 → re-quarantined 07:47 on stale pre-fix data). Every
 *    other gate in this function — correctness, recency, piggyback — still
 *    applies before a floor takedown is reversed; only the flag-instead-of-
 *    promote branch is skipped. The floor has really quarantined 6 times, so
 *    this is not hypothetical.
 * 2. **Harness volume must not outvote real customers.** ~98% of platform
 *    traffic is our own harness. A capability with 100 green harness results
 *    and 2 failing piggyback results — piggyback being real customer calls —
 *    averages to 98% and would promote on a 0% real-world record. Piggyback
 *    evidence is therefore gated separately, and never averaged in.
 * 3. **A seven-day aggregate can promote something broken right now.** 95
 *    passes followed by 5 fresh failures still averages to 95%. So the most
 *    recent `known_answer` result must be a pass, and the trailing 24h must
 *    clear the bar on its own.
 * 4. **Enforcement default.** The reviewer's argument was that "the floor will
 *    catch a bad promotion" is weaker than it sounds: the floor needs ≥10
 *    external calls in 30 days before it can act, and a wrongly promoted
 *    low-traffic capability may never reach that. That is correct and it
 *    defeats the self-correcting claim for exactly the capabilities most
 *    likely to be promoted in error. The job is dry-run by default.
 * 5. **A NULL breaker row is not affirmative health.** True, but 14 of the
 *    active capabilities have no `capability_health` row at all and 10 of the
 *    17 current candidates are among them — rows are created lazily on first
 *    incident, so requiring one would permanently exclude every capability
 *    that has never failed. NULL stays permitted; the pass-rate, recency and
 *    known_answer gates carry the weight. A non-closed breaker is still an
 *    absolute no.
 *
 * ## Deliberate boundaries (v1)
 *
 * - Only `visible = false` capabilities are candidates. 35 capabilities are
 *   visible with `x402_enabled = false`; some of those are deliberate and
 *   deciding which needs a separate pass. They are not touched here.
 * - `deactivation_reason IS NOT NULL` is a human "no", forever. A capability
 *   someone switched off on purpose is not re-litigated by a job.
 * - Fragile maintenance classes are never auto-promoted — they are flagged for
 *   a human, because a scraping target that passed all week is exactly the
 *   thing that breaks the week after.
 */

export interface PromotionStats {
  slug: string;
  lifecycleState: string;
  visible: boolean;
  x402Enabled: boolean;
  isFreeTier: boolean;
  maintenanceClass: string | null;
  marketplaceEligible: boolean;
  deactivationReason: string | null;
  /** A capability with no x402 method cannot be served on the paid rail. */
  hasX402Method: boolean;
  /** capability_health.state; null when the capability has no breaker row yet. */
  breakerState: string | null;
  /**
   * True when the most recent listing-state event was a takedown (floor
   * quarantine, human unpublish, suspension) rather than a promotion. False
   * for a capability that has simply never been listed.
   */
  wasDelisted: boolean;
  /** What that takedown was, for the flag message. */
  delistingReason: string | null;
  /**
   * True when `wasDelisted` and the takedown specifically was the quality
   * floor's own quarantine (`health_monitor_events.action_taken =
   * 'quarantined'`) — never true for a human unpublish/suspend. This is the
   * only class of takedown DEC-20260812-A permits this job to auto-reverse;
   * see the "promotion grace" note in the module header (finding 1).
   */
  wasFloorQuarantine: boolean;
  totalTests: number;
  passedTests: number;
  /** Distinct calendar days carrying at least one result — the "week" in "green week". */
  distinctTestDays: number;
  /** known_answer results only: correctness, as distinct from liveness. */
  knownAnswerTotal: number;
  knownAnswerPassed: number;
  /** Did the single most recent known_answer result pass? Null when there is none. */
  latestKnownAnswerPassed: boolean | null;
  /** Trailing 24h, all suites — the "is it working right now" gate. */
  recentTotal: number;
  recentPassed: number;
  /** Piggyback suites only: real customer traffic, gated separately from harness volume. */
  piggybackTotal: number;
  piggybackPassed: number;
}

export interface PromotionConfig {
  minTests: number;
  minDistinctTestDays: number;
  minPassRate: number;
  minKnownAnswerTests: number;
  minKnownAnswerPassRate: number;
  /** Minimum results in the trailing 24h before recency can be judged at all. */
  minRecentTests: number;
  maxPromotionsPerRun: number;
  /** Lifecycle states a capability may be promoted out of. */
  promotableLifecycles: string[];
  /** Maintenance classes that are flagged for a human instead of promoted. */
  manualReviewClasses: string[];
}

export const DEFAULT_PROMOTION_CONFIG: PromotionConfig = {
  minTests: 40,
  minDistinctTestDays: 5,
  minPassRate: 0.95,
  minKnownAnswerTests: 5,
  minKnownAnswerPassRate: 0.95,
  minRecentTests: 3,
  // Self-throttle, same reasoning as the floor (DEC-20260504-B): a long-silent
  // bulk operation's first successful run is a workload-resumption event. Three
  // per tick means the backlog drains over days, each batch observable.
  maxPromotionsPerRun: 3,
  promotableLifecycles: ["validating", "probation", "active"],
  manualReviewClasses: ["scraping-fragile-target"],
};

export interface PromotionDecision {
  slug: string;
  action: "promote" | "flag" | "none";
  /**
   * Whether the paid rail should be open after this promotion. Written
   * unconditionally by the job — `false` clears a stale `true` rather than
   * leaving an unusable paid route on a capability that cannot serve one.
   */
  enableX402: boolean;
  passRate: number;
  totalTests: number;
  reason: string;
}

/** Breaker states that permit promotion. `null` = no breaker row recorded yet. */
const HEALTHY_BREAKER_STATES = new Set([null, "closed"]);

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

export function evaluatePromotion(
  rows: PromotionStats[],
  config: PromotionConfig = DEFAULT_PROMOTION_CONFIG,
): PromotionDecision[] {
  const decisions: PromotionDecision[] = [];
  let budget = config.maxPromotionsPerRun;

  const candidates = rows
    // Already listed → nothing for this job to do. The x402-off-but-visible
    // population is a separate decision (see header).
    .filter((r) => !r.visible)
    .filter((r) => config.promotableLifecycles.includes(r.lifecycleState))
    .filter((r) => r.deactivationReason === null)
    .filter((r) => r.marketplaceEligible)
    .filter((r) => HEALTHY_BREAKER_STATES.has(r.breakerState))
    .filter((r) => r.totalTests >= config.minTests)
    .filter((r) => r.distinctTestDays >= config.minDistinctTestDays)
    .map((r) => ({ ...r, passRate: r.passedTests / r.totalTests }))
    // Best-proven first, so the per-run budget is spent on the strongest
    // evidence rather than on alphabetical accident.
    .sort((a, b) => b.passRate - a.passRate || b.totalTests - a.totalTests || a.slug.localeCompare(b.slug));

  for (const r of candidates) {
    if (r.passRate < config.minPassRate) continue;

    const hold = (reason: string) =>
      decisions.push({
        slug: r.slug, action: "none", enableX402: false,
        passRate: r.passRate, totalTests: r.totalTests, reason,
      });

    // Correctness gate. An aggregate pass rate is dominated by schema,
    // negative and dependency-health suites; a capability can be 97% green
    // overall while every known_answer assertion fails. Promotion advertises
    // correctness, so correctness is what has to be proven.
    if (r.knownAnswerTotal < config.minKnownAnswerTests) {
      hold(`${pct(r.passRate)} over ${r.totalTests} results, but only ${r.knownAnswerTotal} known_answer result(s) (need ${config.minKnownAnswerTests}) — correctness unproven`);
      continue;
    }
    const kaRate = r.knownAnswerPassed / r.knownAnswerTotal;
    if (kaRate < config.minKnownAnswerPassRate) {
      hold(`${pct(r.passRate)} overall but known_answer is ${pct(kaRate)} (${r.knownAnswerPassed}/${r.knownAnswerTotal}) — passing liveness, failing correctness`);
      continue;
    }

    // Recency (review finding 3). A week's aggregate survives a fresh break:
    // 95 passes then 5 failures is still 95%. Promotion is a statement about
    // now, so now is what gets checked.
    if (r.latestKnownAnswerPassed === false) {
      hold(`${pct(r.passRate)} over the week but the most recent known_answer result failed — broken now, whatever the average says`);
      continue;
    }
    if (r.recentTotal < config.minRecentTests) {
      hold(`${pct(r.passRate)} over the week but only ${r.recentTotal} result(s) in the last 24h (need ${config.minRecentTests}) — cannot tell whether it still works`);
      continue;
    }
    const recentRate = r.recentPassed / r.recentTotal;
    if (recentRate < config.minPassRate) {
      hold(`${pct(r.passRate)} over the week but ${pct(recentRate)} (${r.recentPassed}/${r.recentTotal}) in the last 24h — currently degrading`);
      continue;
    }

    // Real customers outrank our own harness (review finding 2). Piggyback
    // rows come from actual paid calls; there are few of them, so averaging
    // them into a thousand harness results erases them entirely.
    if (r.piggybackTotal > 0) {
      const pbRate = r.piggybackPassed / r.piggybackTotal;
      if (pbRate < config.minPassRate) {
        hold(`harness is ${pct(r.passRate)} but real customer calls are ${pct(pbRate)} (${r.piggybackPassed}/${r.piggybackTotal} piggyback) — the customers are the ones who count`);
        continue;
      }
    }

    // A human/operator takedown is a decision, and this job does not
    // overturn decisions (review finding 1). Never having been listed is not
    // a takedown. A *floor* takedown (wasFloorQuarantine) is the one
    // exception DEC-20260812-A carves out — "promotion grace" fix,
    // 2026-08-16: it falls through to the normal promote path below instead
    // of being flagged, because every gate above it (correctness, recency,
    // piggyback) already had to pass, and jobs/quality-floor.ts now clamps
    // its own window to since-last-promotion so a wrong reversal gets caught
    // on fresh evidence rather than replayed stale evidence.
    if (r.wasDelisted && !r.wasFloorQuarantine) {
      decisions.push({
        slug: r.slug, action: "flag", enableX402: false,
        passRate: r.passRate, totalTests: r.totalTests,
        reason: `clears the bar (${pct(r.passRate)} over ${r.totalTests}) but was taken down, not merely never listed — "${r.delistingReason}". Re-listing after a takedown needs the evidence that the takedown was wrong, which the harness cannot supply; human call`,
      });
      continue;
    }

    if (r.maintenanceClass !== null && config.manualReviewClasses.includes(r.maintenanceClass)) {
      decisions.push({
        slug: r.slug, action: "flag", enableX402: false,
        passRate: r.passRate, totalTests: r.totalTests,
        reason: `clears the bar (${pct(r.passRate)} over ${r.totalTests}, known_answer ${pct(kaRate)}) but maintenance_class '${r.maintenanceClass}' is never auto-promoted — a fragile target passing all week is the one that breaks next week; human call`,
      });
      continue;
    }

    if (budget <= 0) {
      hold(`clears the bar but the per-run promotion budget (${config.maxPromotionsPerRun}) is spent — next tick`);
      continue;
    }

    budget--;
    // The free tier is served without payment by design, so opening a payment
    // rail on it would be incoherent. Everything else that has a method and is
    // marketplace-eligible goes onto x402 with the promotion: DEC-20260812-A
    // dark-launches "invisible + non-x402", and one green week ends both.
    const enableX402 = r.hasX402Method && !r.isFreeTier;
    // "Promotion grace" fix (2026-08-16): a floor takedown that reaches here
    // cleared every gate above, including piggyback (real customer traffic)
    // when there was any — so this is an auto-reversal of the quarantine, not
    // a first listing. Named explicitly in the reason and cited to the DEC
    // clause that authorizes it, so a `health_monitor_events` reader can tell
    // the two apart without cross-referencing the floor's own log.
    const recoveryNote = r.wasFloorQuarantine
      ? ` — was quarantined by the quality floor ("${r.delistingReason}"); auto-reversed on recovery per DEC-20260812-A`
      : "";
    decisions.push({
      slug: r.slug,
      action: "promote",
      enableX402,
      passRate: r.passRate,
      totalTests: r.totalTests,
      reason: `${pct(r.passRate)} over ${r.totalTests} results across ${r.distinctTestDays} days, known_answer ${pct(kaRate)} (${r.knownAnswerPassed}/${r.knownAnswerTotal}), last 24h ${pct(recentRate)}, breaker ${r.breakerState ?? "no row"} — green week met${enableX402 ? "; x402 opened" : r.isFreeTier ? "; free tier, x402 stays closed" : "; no x402 method, catalog only"}${recoveryNote}`,
    });
  }

  return decisions;
}
