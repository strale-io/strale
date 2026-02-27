import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth } from "../db/schema.js";

// Circuit breaker states
type CircuitState = "closed" | "open" | "half_open";

// Thresholds
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const INITIAL_BACKOFF_MINUTES = 5;
const MAX_BACKOFF_MINUTES = 30;

export interface CircuitBreakerCheck {
  allowed: boolean;
  state: CircuitState;
  reason?: string;
  next_retry_at?: string;
}

/**
 * Check if a capability is allowed to execute.
 * Returns { allowed: true } if circuit is closed or half_open and ready to test.
 * Returns { allowed: false } if circuit is open and not yet ready to retry.
 */
export async function checkCircuitBreaker(
  slug: string,
): Promise<CircuitBreakerCheck> {
  const db = getDb();

  const [health] = await db
    .select()
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  // No health record yet — capability is healthy (never failed)
  if (!health) {
    return { allowed: true, state: "closed" };
  }

  const state = health.state as CircuitState;

  if (state === "closed") {
    return { allowed: true, state: "closed" };
  }

  if (state === "open") {
    const now = new Date();
    const nextRetry = health.nextRetryAt;

    // Check if it's time to transition to half_open
    if (nextRetry && now >= nextRetry) {
      // Transition to half_open — allow one test request
      await db
        .update(capabilityHealth)
        .set({ state: "half_open", updatedAt: now })
        .where(eq(capabilityHealth.id, health.id));

      return { allowed: true, state: "half_open" };
    }

    // Still in backoff period
    return {
      allowed: false,
      state: "open",
      reason: `Capability '${slug}' is temporarily suspended due to repeated failures.`,
      next_retry_at: nextRetry?.toISOString(),
    };
  }

  // half_open — allow the test request through
  return { allowed: true, state: "half_open" };
}

/**
 * Record a successful execution. Resets circuit to closed.
 */
export async function recordSuccess(slug: string): Promise<void> {
  const db = getDb();

  const [health] = await db
    .select()
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  const now = new Date();

  if (!health) {
    // First success — create record in closed state
    await db.insert(capabilityHealth).values({
      capabilitySlug: slug,
      state: "closed",
      consecutiveFailures: 0,
      totalSuccesses: 1,
      totalFailures: 0,
      lastSuccessAt: now,
      backoffMinutes: INITIAL_BACKOFF_MINUTES,
      updatedAt: now,
    });
    return;
  }

  // Reset to closed on any success
  await db
    .update(capabilityHealth)
    .set({
      state: "closed",
      consecutiveFailures: 0,
      totalSuccesses: health.totalSuccesses + 1,
      lastSuccessAt: now,
      backoffMinutes: INITIAL_BACKOFF_MINUTES, // Reset backoff
      openedAt: null,
      nextRetryAt: null,
      updatedAt: now,
    })
    .where(eq(capabilityHealth.id, health.id));
}

/**
 * Record a failed execution. May trip the circuit breaker open.
 */
export async function recordFailure(slug: string): Promise<void> {
  const db = getDb();

  const [health] = await db
    .select()
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  const now = new Date();

  if (!health) {
    // First failure — create record, still closed
    await db.insert(capabilityHealth).values({
      capabilitySlug: slug,
      state: "closed",
      consecutiveFailures: 1,
      totalFailures: 1,
      totalSuccesses: 0,
      lastFailureAt: now,
      backoffMinutes: INITIAL_BACKOFF_MINUTES,
      updatedAt: now,
    });
    return;
  }

  const newConsecutive = health.consecutiveFailures + 1;
  const newTotalFailures = health.totalFailures + 1;

  // Check if we should trip the breaker
  if (
    health.state === "half_open" ||
    newConsecutive >= CONSECUTIVE_FAILURE_THRESHOLD
  ) {
    // Trip to open with exponential backoff
    const backoff =
      health.state === "half_open"
        ? Math.min(health.backoffMinutes * 2, MAX_BACKOFF_MINUTES)
        : INITIAL_BACKOFF_MINUTES;

    const nextRetry = new Date(now.getTime() + backoff * 60_000);

    await db
      .update(capabilityHealth)
      .set({
        state: "open",
        consecutiveFailures: newConsecutive,
        totalFailures: newTotalFailures,
        lastFailureAt: now,
        openedAt: now,
        nextRetryAt: nextRetry,
        backoffMinutes: backoff,
        updatedAt: now,
      })
      .where(eq(capabilityHealth.id, health.id));
    return;
  }

  // Increment failure count but stay closed
  await db
    .update(capabilityHealth)
    .set({
      consecutiveFailures: newConsecutive,
      totalFailures: newTotalFailures,
      lastFailureAt: now,
      updatedAt: now,
    })
    .where(eq(capabilityHealth.id, health.id));
}

/**
 * Get health status for all capabilities (for monitoring endpoint).
 */
export async function getAllHealth(): Promise<
  Array<{
    capability_slug: string;
    state: string;
    consecutive_failures: number;
    total_failures: number;
    total_successes: number;
    last_failure_at: string | null;
    last_success_at: string | null;
    next_retry_at: string | null;
  }>
> {
  const db = getDb();

  const rows = await db.select().from(capabilityHealth);

  return rows.map((r) => ({
    capability_slug: r.capabilitySlug,
    state: r.state,
    consecutive_failures: r.consecutiveFailures,
    total_failures: r.totalFailures,
    total_successes: r.totalSuccesses,
    last_failure_at: r.lastFailureAt?.toISOString() ?? null,
    last_success_at: r.lastSuccessAt?.toISOString() ?? null,
    next_retry_at: r.nextRetryAt?.toISOString() ?? null,
  }));
}
