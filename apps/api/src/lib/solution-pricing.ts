/**
 * Dynamic solution pricing — computes solution price from component
 * capability prices plus a markup tier multiplier.
 *
 * Rule: price_cents = ceil(sum(component_capability_prices) × markup)
 *
 * Markup tiers (from CLAUDE.md / Financials Section 5.5):
 *   data-lookup:  1.25x
 *   verification: 1.40x
 *   compliance:   1.75x
 *
 * Called:
 *   - On capability price change (via recomputeAffectedSolutions)
 *   - On solution step add/remove
 *   - On backfill (recomputeAllSolutionPrices)
 */

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, solutions, solutionSteps } from "../db/schema.js";

// ─── Markup multipliers ────────────────────────────────────────────────────

const MARKUP: Record<string, number> = {
  "data-lookup": 1.25,
  "verification": 1.40,
  "compliance": 1.75,
};

const DEFAULT_MARKUP = 1.30;

export function getMarkup(valueTier: string): number {
  return MARKUP[valueTier] ?? DEFAULT_MARKUP;
}

// ─── Core recomputation ────────────────────────────────────────────────────

interface PriceUpdate {
  slug: string;
  oldPrice: number;
  newPrice: number;
  componentSum: number;
  markup: number;
  valueTier: string;
  changed: boolean;
}

/**
 * Recompute a single solution's price from its component capabilities.
 * Returns the update details. Does NOT write to DB (caller decides).
 */
export async function computeSolutionPrice(solutionSlug: string): Promise<PriceUpdate | null> {
  const db = getDb();

  const [sol] = await db
    .select({
      id: solutions.id,
      slug: solutions.slug,
      priceCents: solutions.priceCents,
      valueTier: solutions.valueTier,
    })
    .from(solutions)
    .where(eq(solutions.slug, solutionSlug))
    .limit(1);

  if (!sol) return null;

  // Sum component capability prices
  const steps = await db
    .select({ capabilitySlug: solutionSteps.capabilitySlug })
    .from(solutionSteps)
    .where(eq(solutionSteps.solutionId, sol.id));

  if (steps.length === 0) return null;

  const capSlugs = steps.map((s) => s.capabilitySlug);
  const caps = await db
    .select({ slug: capabilities.slug, priceCents: capabilities.priceCents })
    .from(capabilities)
    .where(inArray(capabilities.slug, capSlugs));

  const componentSum = caps.reduce((sum, c) => sum + c.priceCents, 0);
  const markup = getMarkup(sol.valueTier);
  const newPrice = Math.ceil(componentSum * markup);

  return {
    slug: sol.slug,
    oldPrice: sol.priceCents,
    newPrice,
    componentSum,
    markup,
    valueTier: sol.valueTier,
    changed: sol.priceCents !== newPrice,
  };
}

/**
 * Recompute and persist a single solution's price.
 */
export async function recomputeSolutionPrice(solutionSlug: string): Promise<PriceUpdate | null> {
  const update = await computeSolutionPrice(solutionSlug);
  if (!update || !update.changed) return update;

  const db = getDb();
  await db
    .update(solutions)
    .set({
      priceCents: update.newPrice,
      componentSumCents: update.componentSum,
      updatedAt: new Date(),
    })
    .where(eq(solutions.slug, solutionSlug));

  return update;
}

/**
 * Recompute prices for all solutions affected by a capability price change.
 */
export async function recomputeAffectedSolutions(capabilitySlug: string): Promise<PriceUpdate[]> {
  const db = getDb();

  // Find all solutions that include this capability
  const affectedSteps = await db
    .select({ solutionId: solutionSteps.solutionId })
    .from(solutionSteps)
    .where(eq(solutionSteps.capabilitySlug, capabilitySlug));

  const solutionIds = [...new Set(affectedSteps.map((s) => s.solutionId))];
  if (solutionIds.length === 0) return [];

  const affectedSolutions = await db
    .select({ slug: solutions.slug })
    .from(solutions)
    .where(inArray(solutions.id, solutionIds));

  const updates: PriceUpdate[] = [];
  for (const sol of affectedSolutions) {
    const update = await recomputeSolutionPrice(sol.slug);
    if (update) updates.push(update);
  }

  return updates;
}

/**
 * Recompute all solution prices. Used for backfill.
 */
export async function recomputeAllSolutionPrices(): Promise<PriceUpdate[]> {
  const db = getDb();

  const allSolutions = await db
    .select({ slug: solutions.slug })
    .from(solutions);

  const updates: PriceUpdate[] = [];
  for (const sol of allSolutions) {
    const update = await recomputeSolutionPrice(sol.slug);
    if (update) updates.push(update);
  }

  return updates;
}
