import { eq } from "drizzle-orm";
import { registerCapability, getExecutor, type CapabilityInput } from "./index.js";
import { runCompanyStatusCheck } from "../lib/company-status/compose.js";
import { getDb } from "../db/index.js";
import { capabilityHealth } from "../db/schema.js";
import { logWarn } from "../lib/log.js";

// "Is this company still alive?" (portfolio plan 1C.1, DEC-20261024-B).
// Composes the registry and insolvency executors listed in
// lib/company-status/routing.ts; no fetch code lives here. A data lookup:
// it returns the registry's status and any official insolvency notices, never
// a recommendation.

/**
 * Read-only peek at an underlying capability's circuit breaker. Unlike
 * circuit-breaker.ts checkCircuitBreaker it never writes (that function flips
 * open -> half_open, which would leave the state stuck when this capability
 * does not record the outcome). Fails open: a health-table error must not
 * take the lookup down.
 */
async function isCircuitOpen(slug: string): Promise<boolean> {
  try {
    const [row] = await getDb()
      .select({ state: capabilityHealth.state, nextRetryAt: capabilityHealth.nextRetryAt })
      .from(capabilityHealth)
      .where(eq(capabilityHealth.capabilitySlug, slug))
      .limit(1);
    return row?.state === "open" && !!row.nextRetryAt && row.nextRetryAt.getTime() > Date.now();
  } catch (err) {
    logWarn("company-status-breaker-peek-failed", "could not read circuit breaker state; treating as closed", {
      capability_slug: slug,
      err: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
    });
    return false;
  }
}

registerCapability("company-status-check", (input: CapabilityInput) =>
  runCompanyStatusCheck(input, { getExecutor, isCircuitOpen, now: () => new Date() }),
);
