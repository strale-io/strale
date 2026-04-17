import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilityHealth } from "../db/schema.js";
import { logHealthEvent } from "./health-monitor.js";
import { categorizeFailureReason, isRetryableFailure } from "./trust-helpers.js";

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

  // Log recovery if previously open or half_open
  if (health.state === "open" || health.state === "half_open") {
    logHealthEvent({
      eventType: "circuit_breaker",
      capabilitySlug: slug,
      tier: 1,
      actionTaken: "Circuit breaker recovered",
      details: { previous_state: health.state },
    }).catch(() => {});
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
 * Errors caused by user input, not by capability malfunction.
 * These should NOT count toward circuit breaker tripping — the capability
 * worked correctly, the user just asked for something that doesn't exist.
 */
const USER_INPUT_ERROR_PATTERNS = [
  "No DNS records found",        // dns-lookup: non-existent domain (correct result)
  "Domain may not exist",        // dns-lookup: variant
  "URL returned HTTP 4",         // url-to-markdown: 400/401/403/404 from target site
  "URL returned HTTP 5",         // url-to-markdown: 5xx from target site (target's problem, not ours)
  "returned a server error",     // url-to-markdown browserless path: target-site 5xx
  "could not be loaded (HTTP",   // url-to-markdown browserless path: generic target-site HTTP failure
  "This site exists but blocks", // url-to-markdown: 403 bot protection
  "blocks automated access",     // url-to-markdown: known blocked sites
  "is required",                 // missing input field
  "not found",                   // package/entity not found in registry
  "This URL returns JSON",       // url-to-markdown: user passed an API endpoint
  "This URL points to a PDF",    // url-to-markdown: PDF file
  "This URL points to an image", // url-to-markdown: image file
  "Could not repair JSON",       // json-repair: unrecoverable input
];

function isUserInputError(reason: string): boolean {
  return USER_INPUT_ERROR_PATTERNS.some((p) => reason.includes(p));
}

/**
 * Record a failed execution. May trip the circuit breaker open.
 * Non-retryable failures (permanent_move, endpoint_gone, auth_expired, etc.)
 * trip the breaker immediately with max backoff. Transient failures use the
 * normal 3-consecutive threshold with exponential backoff.
 *
 * User-input errors (non-existent domains, 404s on target URLs, missing fields)
 * are silently ignored — the capability worked correctly, it's the input that's
 * invalid. See USER_INPUT_ERROR_PATTERNS.
 */
export async function recordFailure(slug: string, failureReason?: string): Promise<void> {
  // Skip circuit breaker for user-input errors — the capability is healthy
  if (failureReason && isUserInputError(failureReason)) {
    return;
  }

  const db = getDb();
  const category = categorizeFailureReason(failureReason ?? null);
  const retryable = isRetryableFailure(category);

  const [health] = await db
    .select()
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  const now = new Date();

  if (!health) {
    // First failure — non-retryable trips immediately, transient stays closed
    if (!retryable) {
      const nextRetry = new Date(now.getTime() + MAX_BACKOFF_MINUTES * 60_000);
      await db.insert(capabilityHealth).values({
        capabilitySlug: slug,
        state: "open",
        consecutiveFailures: 1,
        totalFailures: 1,
        totalSuccesses: 0,
        lastFailureAt: now,
        openedAt: now,
        nextRetryAt: nextRetry,
        backoffMinutes: MAX_BACKOFF_MINUTES,
        updatedAt: now,
      });

      logHealthEvent({
        eventType: "circuit_breaker",
        capabilitySlug: slug,
        tier: 1,
        actionTaken: `Circuit breaker tripped immediately: ${category} failure`,
        details: { state: "open", category, backoff_minutes: MAX_BACKOFF_MINUTES },
      }).catch(() => {});
    } else {
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
    }
    return;
  }

  const newConsecutive = health.consecutiveFailures + 1;
  const newTotalFailures = health.totalFailures + 1;

  // Non-retryable failures trip immediately; transient failures use threshold
  const shouldTrip = !retryable
    || health.state === "half_open"
    || newConsecutive >= CONSECUTIVE_FAILURE_THRESHOLD;

  if (shouldTrip) {
    const backoff = !retryable
      ? MAX_BACKOFF_MINUTES
      : health.state === "half_open"
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

    const tripReason = !retryable
      ? `non-retryable ${category} failure`
      : `${newConsecutive} consecutive failures`;

    logHealthEvent({
      eventType: "circuit_breaker",
      capabilitySlug: slug,
      tier: 1,
      actionTaken: `Circuit breaker tripped: ${tripReason}`,
      details: { state: "open", category, consecutive_failures: newConsecutive, backoff_minutes: backoff },
    }).catch(() => {});

    return;
  }

  // Increment failure count but stay closed (transient failure, below threshold)
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
 * Record a successful test execution as evidence of capability health.
 * Only called for test types that prove end-to-end functionality
 * (known_answer, edge_case) — NOT for dry-run schema checks.
 *
 * Transitions: open (past retry) → closed, open (in backoff) → half_open,
 * half_open → closed, closed → no-op.
 */
export async function recordTestEvidence(slug: string): Promise<void> {
  const db = getDb();

  const [health] = await db
    .select()
    .from(capabilityHealth)
    .where(eq(capabilityHealth.capabilitySlug, slug))
    .limit(1);

  if (!health) return; // No breaker record — nothing to recover
  const state = health.state as CircuitState;
  if (state === "closed") return; // Already healthy

  const now = new Date();

  if (state === "half_open" || (state === "open" && health.nextRetryAt && now >= health.nextRetryAt)) {
    // Retry window passed or already half_open — close immediately
    await db
      .update(capabilityHealth)
      .set({
        state: "closed",
        consecutiveFailures: 0,
        lastSuccessAt: now,
        backoffMinutes: INITIAL_BACKOFF_MINUTES,
        openedAt: null,
        nextRetryAt: null,
        updatedAt: now,
      })
      .where(eq(capabilityHealth.id, health.id));

    console.log(`[circuit-breaker] ${slug} recovered via test evidence (was ${state})`);
    logHealthEvent({
      eventType: "circuit_breaker",
      capabilitySlug: slug,
      tier: 1,
      actionTaken: "Circuit breaker recovered via test evidence",
      details: { previous_state: state, recovery_source: "test_evidence" },
    }).catch(() => {});
    return;
  }

  // Open but still in backoff — move to half_open so next call goes through
  if (state === "open") {
    await db
      .update(capabilityHealth)
      .set({ state: "half_open", updatedAt: now })
      .where(eq(capabilityHealth.id, health.id));

    console.log(`[circuit-breaker] ${slug} half_open via test evidence (retry window not yet passed)`);
  }
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
