import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth } from "../db/schema.js";
import { logWarn } from "./log.js";

/**
 * Read-only peek at an underlying capability's circuit breaker. Unlike
 * circuit-breaker.ts checkCircuitBreaker it never writes (that function flips
 * open -> half_open, which would leave the state stuck when this capability
 * does not record the outcome). Fails open: a health-table error must not
 * take the lookup down.
 */
export async function isCircuitOpen(slug: string): Promise<boolean> {
  try {
    const [row] = await getDb()
      .select({ state: capabilityHealth.state, nextRetryAt: capabilityHealth.nextRetryAt })
      .from(capabilityHealth)
      .where(eq(capabilityHealth.capabilitySlug, slug))
      .limit(1);
    return row?.state === "open" && !!row.nextRetryAt && row.nextRetryAt.getTime() > Date.now();
  } catch (err) {
    logWarn("composite-breaker-peek-failed", "could not read circuit breaker state; treating as closed", {
      capability_slug: slug,
      err: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
    });
    return false;
  }
}
