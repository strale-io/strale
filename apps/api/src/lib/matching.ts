import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { tokenize } from "./tokenize.js";

type CapabilityRow = typeof capabilities.$inferSelect;

export interface MatchResult {
  capability: CapabilityRow;
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
          // Probation allows internal testing by slug; draft/validating/suspended blocked
          inArray(capabilities.lifecycleState, ["active", "degraded", "probation"]),
        ),
      )
      .limit(1);

    if (!cap) return null;
    // Free-tier capabilities bypass the price check
    if (!cap.isFreeTier && cap.priceCents > req.maxPriceCents) return null;
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
  const rateA = a.successRate ? parseFloat(a.successRate) : 0;
  const rateB = b.successRate ? parseFloat(b.successRate) : 0;
  return rateA > rateB;
}
