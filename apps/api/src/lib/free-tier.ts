/**
 * The free-tier advertisement — one authority, shared by every surface that
 * names a no-signup capability.
 *
 * WHY THIS EXISTS. On 2026-08-22 the quality floor quarantined
 * `url-to-markdown` (visible = false). `matchCapability` refuses an invisible
 * capability by design — quarantine is deliberately unbypassable, WP8 — so the
 * call 401'd. The 401 body then listed `url-to-markdown` among "these 11
 * capabilities are free with no signup — try them without an API key". An
 * agent that did exactly what the refusal told it to do was refused again.
 *
 * The cause was a fourth, private re-derivation of servability: `do.ts`'s
 * `getFreeTierSlugs` selected `is_free_tier AND is_active AND lifecycle_state
 * = 'active'` and never consulted `visible` — the platform's own primary
 * delisting action. Two more surfaces (`auth.ts`'s signup gate, `welcome.ts`'s
 * pricing payload) carried hand-written slug literals that no query touched at
 * all, so they could not track a withdrawal even in principle.
 *
 * The rule, and it is WP8's rule rather than a new one: an advertisement must
 * be produced by the same predicate that decides whether the call will be
 * served. `isServableCapability` is that predicate. Nothing here re-implements
 * it — that is the entire point of the module.
 *
 * Cached 5 minutes, matching the previous `do.ts` behaviour. A quarantine is
 * therefore visible to callers within five minutes rather than instantly; the
 * alternative is a DB round-trip on every unauthenticated 401, and the failure
 * mode this module fixes lasted hours, not seconds.
 */
import { and, eq } from "drizzle-orm";
import type { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { isServableCapability } from "./x402-eligibility.js";

export interface FreeTierCapability {
  slug: string;
  priceCents: number;
  description: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { rows: FreeTierCapability[]; expiresAt: number } | null = null;

/** Test seam — the cache is module-level, so tests must be able to clear it. */
export function resetFreeTierCache(): void {
  cache = null;
}

/**
 * Free-tier capabilities the platform will actually serve right now.
 *
 * `is_free_tier` is selected in SQL because it is a property of the offer, not
 * of servability. Every servability condition is applied by
 * `isServableCapability` in one place, so a future change to what "servable"
 * means reaches this surface without anyone remembering to come here.
 */
export async function getServableFreeTierCapabilities(
  db: ReturnType<typeof getDb>,
): Promise<FreeTierCapability[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.rows;

  const rows = await db
    .select({
      slug: capabilities.slug,
      priceCents: capabilities.priceCents,
      description: capabilities.description,
      isActive: capabilities.isActive,
      visible: capabilities.visible,
      lifecycleState: capabilities.lifecycleState,
    })
    .from(capabilities)
    .where(and(eq(capabilities.isFreeTier, true), eq(capabilities.isActive, true)));

  const servable = rows
    .filter((r) => isServableCapability(r))
    .map((r) => ({ slug: r.slug, priceCents: r.priceCents, description: r.description }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  cache = { rows: servable, expiresAt: Date.now() + CACHE_TTL_MS };
  return servable;
}

/** Slug-only form, for the response bodies that advertise a bare list. */
export async function getFreeTierSlugs(
  db: ReturnType<typeof getDb>,
): Promise<string[]> {
  return (await getServableFreeTierCapabilities(db)).map((c) => c.slug);
}
