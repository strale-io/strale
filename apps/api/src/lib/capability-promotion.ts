/**
 * Capability promotion — the missing counterpart to the quality floor.
 *
 * `lib/quality-floor.ts` takes capabilities OFF the catalog. Nothing put them
 * back on. Its header says so in as many words: "Promotion is NOT automatic in
 * v1 — the platform-doctor flow ... restores the flags." The doctor flow is a
 * human, and the SQS engine that used to run `validating → active` was deleted
 * on 2026-05-05 (DEC-20260503-B). So since May there has been no code path,
 * automatic or scheduled, that makes a capability visible.
 *
 * Measured consequence, prod, 2026-08-16: eight capabilities with a 91–100%
 * pass rate over the trailing week were `is_active = true, visible = false,
 * x402_enabled = false` — absent from /v1/capabilities (290 listed, none of
 * them) and unbuyable on x402, which is the rail essentially all revenue
 * arrives on. Two of them (`url-to-text`, `screenshot-url`) are utility
 * primitives, the exact class GOALS.md records x402 buyers actually paying
 * for. The factory kept dark-launching under DEC-20260812-A; the "until first
 * green week" half of that sentence was never implemented.
 *
 * This module is the pure decision core. Given per-capability evidence from
 * the test harness, it decides who gets published.
 *
 * ## Why the test harness is the instrument here
 *
 * The floor reads `transactions` — real external traffic. That instrument is
 * unavailable by construction on this side: a delisted capability receives no
 * catalog traffic, so its real-traffic record is empty and stays empty. The
 * only evidence a dark capability can generate is the scheduled harness, which
 * is also precisely what DEC-20260812-A means by "first green week". Piggyback
 * suites (fed by real customer calls) are counted too and are strictly better
 * evidence when present.
 *
 * ## Why the bar is higher than the floor's
 *
 * The floor quarantines below 70%. Promotion does NOT use 70% — a capability
 * that only just clears the delisting bar has no business being advertised.
 * The bar is ≥95% over ≥`minTests` results spanning ≥`minDistinctTestDays`
 * calendar days, AND the `known_answer` suite must itself be green. That last
 * clause is the one that matters: schema, negative and dependency-health tests
 * can all pass while the capability returns confidently wrong answers, and an
 * aggregate pass rate hides that behind volume.
 *
 * ## Direction of risk (why this side enforces and the floor does not)
 *
 * The floor is dry-run by default because delisting is not self-reversing:
 * once delisted, a capability stops receiving the traffic that could prove it
 * healthy. Promotion has the opposite shape. It is reversible in one flag, and
 * it is *self-correcting* — anything promoted in error walks straight into the
 * floor's daily tick. The failure mode of being too cautious here is the one
 * already observed: green capabilities sitting dark for three months. So this
 * job enforces by default and takes `CAPABILITY_PROMOTION_DRY_RUN=true` as the
 * brake, rather than the other way round.
 *
 * ## Deliberate boundaries (v1)
 *
 * - Only `visible = false` capabilities are candidates. 35 capabilities are
 *   visible with `x402_enabled = false`; some of those are deliberate and
 *   deciding which needs a separate pass. They are not touched here.
 * - `deactivation_reason IS NOT NULL` is treated as a human "no", forever.
 *   A capability someone switched off on purpose is not re-litigated by a job.
 * - Fragile maintenance classes are never auto-promoted — they are flagged
 *   for a human, because a scraping target that passed all week is exactly the
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
  totalTests: number;
  passedTests: number;
  /** Distinct calendar days carrying at least one result — the "week" in "green week". */
  distinctTestDays: number;
  /** known_answer results only: correctness, as distinct from liveness. */
  knownAnswerTotal: number;
  knownAnswerPassed: number;
}

export interface PromotionConfig {
  minTests: number;
  minDistinctTestDays: number;
  minPassRate: number;
  minKnownAnswerTests: number;
  minKnownAnswerPassRate: number;
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
  /** Whether the promotion should also open the x402 rail. */
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

    // Correctness gate. An aggregate pass rate is dominated by schema,
    // negative and dependency-health suites; a capability can be 97% green
    // overall while every known_answer assertion fails. Promotion advertises
    // correctness, so correctness is what has to be proven.
    if (r.knownAnswerTotal < config.minKnownAnswerTests) {
      decisions.push({
        slug: r.slug,
        action: "none",
        enableX402: false,
        passRate: r.passRate,
        totalTests: r.totalTests,
        reason: `${pct(r.passRate)} over ${r.totalTests} results, but only ${r.knownAnswerTotal} known_answer result(s) (need ${config.minKnownAnswerTests}) — correctness unproven`,
      });
      continue;
    }
    const kaRate = r.knownAnswerPassed / r.knownAnswerTotal;
    if (kaRate < config.minKnownAnswerPassRate) {
      decisions.push({
        slug: r.slug,
        action: "none",
        enableX402: false,
        passRate: r.passRate,
        totalTests: r.totalTests,
        reason: `${pct(r.passRate)} overall but known_answer is ${pct(kaRate)} (${r.knownAnswerPassed}/${r.knownAnswerTotal}) — passing liveness, failing correctness`,
      });
      continue;
    }

    if (r.maintenanceClass !== null && config.manualReviewClasses.includes(r.maintenanceClass)) {
      decisions.push({
        slug: r.slug,
        action: "flag",
        enableX402: false,
        passRate: r.passRate,
        totalTests: r.totalTests,
        reason: `clears the bar (${pct(r.passRate)} over ${r.totalTests}, known_answer ${pct(kaRate)}) but maintenance_class '${r.maintenanceClass}' is never auto-promoted — a fragile target passing all week is the one that breaks next week; human call`,
      });
      continue;
    }

    if (budget <= 0) {
      decisions.push({
        slug: r.slug,
        action: "none",
        enableX402: false,
        passRate: r.passRate,
        totalTests: r.totalTests,
        reason: `clears the bar but the per-run promotion budget (${config.maxPromotionsPerRun}) is spent — next tick`,
      });
      continue;
    }

    budget--;
    // The free tier is served without payment by design, so opening a payment
    // rail on it would be incoherent. Everything else that has a method and is
    // marketplace-eligible goes onto x402 with the promotion: DEC-20260812-A
    // dark-launches "invisible + non-x402", and one green week ends both.
    const enableX402 = r.hasX402Method && !r.isFreeTier;
    decisions.push({
      slug: r.slug,
      action: "promote",
      enableX402,
      passRate: r.passRate,
      totalTests: r.totalTests,
      reason: `${pct(r.passRate)} over ${r.totalTests} results across ${r.distinctTestDays} days, known_answer ${pct(kaRate)} (${r.knownAnswerPassed}/${r.knownAnswerTotal}), breaker ${r.breakerState ?? "none"} — green week met${enableX402 ? "; x402 opened" : r.isFreeTier ? "; free tier, x402 not applicable" : "; no x402 method, catalog only"}`,
    });
  }

  return decisions;
}
