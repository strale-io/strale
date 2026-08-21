import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { SERVABLE_LIFECYCLE_STATES } from "./x402-eligibility.js";
import { tokenize } from "./tokenize.js";

type CapabilityRow = typeof capabilities.$inferSelect;

export interface MatchResult {
  capability: CapabilityRow;
  budgetExceeded?: boolean; // true when slug matched but price > max_price_cents
}

export interface MatchRequest {
  task?: string;
  capabilitySlug?: string;
  category?: string;
  maxPriceCents: number;
}

/**
 * Match a request to a capability.
 *
 * Matching logic (per spec — intentionally simple for 5 capabilities):
 * 1. If capability_slug provided → direct lookup, verify active + within budget
 * 2. Filter active capabilities within budget
 * 3. If category provided → filter by category
 * 4. Multiple matches → pick highest success_rate
 * 5. No match from above → keyword match on task vs capability descriptions
 * 6. Still no match → return null
 */
export async function matchCapability(
  req: MatchRequest,
): Promise<MatchResult | null> {
  const db = getDb();

  // Path 1: Direct slug lookup
  if (req.capabilitySlug) {
    const [cap] = await db
      .select()
      .from(capabilities)
      .where(
        and(
          eq(capabilities.slug, req.capabilitySlug),
          eq(capabilities.isActive, true),
          // Quarantine is unbypassable by naming the slug. The floor sets
          // visible=false, so omitting this would let an explicit /v1/do call
          // reach a capability the platform had just withdrawn.
          eq(capabilities.visible, true),
          // WP8: the shared servability floor, not a third rule.
          //
          // This admitted 'degraded' — a state every other rail refuses — so a
          // capability the platform had assessed as failing could still be
          // bought by naming it explicitly. That is quarantine-bypass in
          // another costume: an assessment that does not bind is not an
          // assessment. Behaviour change recorded rather than slipped in; it
          // has no live effect today because no capability is currently both
          // degraded and active.
          //
          // Probation stays, which is what the original comment was protecting.
          inArray(
            capabilities.lifecycleState,
            [...SERVABLE_LIFECYCLE_STATES],
          ),
        ),
      )
      .limit(1);

    if (!cap) return null;
    // Free-tier capabilities bypass the price check
    if (!cap.isFreeTier && cap.priceCents > req.maxPriceCents) {
      return { capability: cap, budgetExceeded: true };
    }
    return { capability: cap };
  }

  // Path 2: Filter active + visible capabilities within budget (free-tier always included)
  const allActive = await db
    .select()
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        eq(capabilities.visible, true),
        // Deliberately STRICTER than the servability floor, and allowed to be.
        // The floor answers "may this be served if asked for"; automatic
        // routing additionally requires that we are willing to CHOOSE it, and
        // 'probation' means not yet. A rail may be stricter than the authority.
        // It may never be more permissive — that is the direction that produced
        // the divergence WP8 exists to remove.
        eq(capabilities.lifecycleState, "active"),
      ),
    );

  const candidates = allActive.filter(
    (c) => c.isFreeTier || c.priceCents <= req.maxPriceCents,
  );

  if (candidates.length === 0) return null;

  let filtered = candidates;

  // Step 3: Filter by category if provided
  if (req.category) {
    const byCategory = filtered.filter((c) => c.category === req.category);
    if (byCategory.length > 0) {
      filtered = byCategory;
    }
    // If no category match, fall through to keyword matching with all candidates
  }

  // Step 4: If we have matches and task keywords, score them
  if (req.task && filtered.length > 1) {
    const scored = scoreByKeywords(req.task, filtered);
    if (scored) return { capability: scored };
  }

  // Step 5: Pick the best from remaining by success rate
  if (filtered.length > 0) {
    const best = pickBySuccessRate(filtered);
    // Only return if we have some signal it's relevant
    // With a task string, require at least one keyword hit
    if (req.task) {
      const scored = scoreByKeywords(req.task, filtered);
      if (scored) return { capability: scored };
      return null; // No keyword overlap at all — don't guess
    }
    return { capability: best };
  }

  return null;
}

/**
 * Simple keyword matching: tokenize task and capability descriptions,
 * count overlapping words, pick the highest overlap. Ties broken by success rate.
 */
function scoreByKeywords(
  task: string,
  candidates: CapabilityRow[],
): CapabilityRow | null {
  const taskWords = tokenize(task);
  if (taskWords.size === 0) return null;

  let bestCap: CapabilityRow | null = null;
  let bestScore = 0;

  for (const cap of candidates) {
    const descWords = tokenize(`${cap.name} ${cap.description} ${cap.slug}`);
    let score = 0;
    for (const word of taskWords) {
      if (descWords.has(word)) score++;
    }
    if (
      score > bestScore ||
      (score === bestScore && score > 0 && betterRate(cap, bestCap))
    ) {
      bestScore = score;
      bestCap = cap;
    }
  }

  return bestScore > 0 ? bestCap : null;
}

function pickBySuccessRate(candidates: CapabilityRow[]): CapabilityRow {
  return candidates.reduce((best, c) => (betterRate(c, best) ? c : best));
}

function betterRate(
  a: CapabilityRow,
  b: CapabilityRow | null,
): boolean {
  if (!b) return true;
  // Tiebreaker: cheaper price wins; equal price → alphabetical slug.
  // Replaces the SQS-DESC tiebreaker retired with the SQS engine
  // (DEC-20260503-B). Deterministic and price-aware so a low-cost
  // capability is preferred when match quality is identical.
  if (a.priceCents !== b.priceCents) return a.priceCents < b.priceCents;
  return a.slug < b.slug;
}
