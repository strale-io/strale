import type { Context, Next } from "hono";
import { apiError } from "./errors.js";
import { clientIpOrNull, isLoopbackPeer } from "./client-ip.js";

// ─── Sliding window counter ────────────────────────────────────────────────────
// In-memory store keyed by identifier. Each entry tracks request timestamps
// within the window. Stale entries are cleaned up periodically.
//
// ⚠ EXPLICITLY A CHEAP HEDGE, NOT A SAFETY CONTROL (F-0-002).
// This module is only suitable for SHORT-WINDOW, LOW-RISK limits where a
// Railway restart resetting the window is acceptable. Day-scale or
// abuse-class limits (signup, auth) MUST use lib/db-rate-limit.ts instead.
//
// Legitimate current users (sub-minute, burst-level):
//   - POST /v1/do                        60/min per IP (anonymous or invalid key)
//   - POST /v1/do                        rateLimitByKey(10, 1000)
//   - /mcp all methods                   rateLimitByIp(60, 60_000)
//   - /a2a all methods                   rateLimitByIp(60, 60_000)
//   - /v1/wallet/*                       rateLimitByKey(5, 1000)
//   - /v1/internal/*                     rateLimitByIp(120, 60_000)
//
// Do NOT add this middleware to new abuse-class endpoints. If you need
// day-scale protection, import `rateLimitByIpDb` from `./db-rate-limit.js`.
//
// LIMITATIONS:
// - In-memory: state is NOT shared across multiple Railway replicas. Today
//   the service runs as 1 replica (FIX_PHASE_A_verification.md Q2); if
//   that changes, effective limits multiply by the replica count.
// - Non-durable: all state is lost on restart, allowing a full-quota burst
//   immediately after every deploy.

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

// Clean up stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 60_000).unref();

interface RateCheckResult {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
}

function checkRate(
  identifier: string,
  maxRequests: number,
  windowMs: number,
  units = 1,
): RateCheckResult {
  const now = Date.now();
  let entry = store.get(identifier);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(identifier, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length + units > maxRequests) {
    // When enough of the window expires for `units` more. For one unit that
    // is the oldest entry; a weighted request waits for as many as it needs.
    // An empty window that still cannot fit is a request larger than the
    // bucket, which callers bound before asking.
    const oldest = entry.timestamps[Math.max(0, entry.timestamps.length + units - maxRequests - 1)] ?? now;
    const retryAfterMs = oldest + windowMs - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      limit: maxRequests,
      remaining: 0,
      resetAt: Math.ceil((oldest + windowMs) / 1000),
    };
  }

  for (let i = 0; i < units; i++) entry.timestamps.push(now);
  const resetAt = Math.ceil((now + windowMs) / 1000);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    limit: maxRequests,
    remaining: maxRequests - entry.timestamps.length,
    resetAt,
  };
}

// ─── Rate limit response headers ──────────────────────────────────────────────

function setRateLimitHeaders(c: Context, result: RateCheckResult): void {
  c.header("X-RateLimit-Limit", String(result.limit));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  c.header("X-RateLimit-Reset", String(result.resetAt));
  if (!result.allowed) {
    c.header("Retry-After", String(result.retryAfterSeconds));
  }
}

// ─── Middleware factories ───────────────────────────────────────────────────────

/**
 * Rate limit by API key. Requires authMiddleware to have run first.
 * @param maxRequests - max requests per window
 * @param windowMs - window duration in ms
 */
export function rateLimitByKey(maxRequests: number, windowMs: number, scope: "key" | "account" = "key") {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as { id: string } | undefined;
    if (!user) {
      // No user set — expected for unauthenticated free-tier requests.
      // Free-tier monthly allowance is enforced in the handler (DB-based counter in do.ts).
      return next();
    }

    const key = `${scope}:${scope === "account" ? user.id : c.get("apiKeyId") ?? user.id}`;
    const result = checkRate(key, maxRequests, windowMs);
    setRateLimitHeaders(c, result);

    if (!result.allowed) {
      return c.json(
        apiError("rate_limited", `Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds.`, {
          retry_after_seconds: result.retryAfterSeconds,
        }),
        429,
      );
    }

    return next();
  };
}

/**
 * Count `units` against the authenticated key's bucket in one step, for a
 * request that does the work of several (POST /v1/do/batch counts its items).
 * All or nothing: a request that does not fit consumes nothing. Returns the
 * 429 response when it does not fit, null when it may proceed.
 */
export function consumeKeyUnits(c: Context, units: number, maxUnits: number, windowMs: number, scope: string): Response | null {
  const user = c.get("user") as { id: string } | undefined;
  if (!user) return null;
  const result = checkRate(`${scope}:key:${c.get("apiKeyId") ?? user.id}`, maxUnits, windowMs, units);
  setRateLimitHeaders(c, result);
  if (result.allowed) return null;
  return c.json(
    apiError("rate_limited", `Rate limit exceeded: this request needs ${units} of ${maxUnits} units per ${Math.round(windowMs / 1000)}s. Try again in ${result.retryAfterSeconds} seconds.`, {
      retry_after_seconds: result.retryAfterSeconds,
      units_requested: units,
      units_per_window: maxUnits,
    }),
    429,
  );
}

/**
 * The client IP the limiter keys on, or null when there is none. The rule
 * (the public X-Forwarded-For entry one hop left of Railway's edge; X-Real-IP
 * and CF-Connecting-IP ignored)
 * and its evidence live in lib/client-ip.ts.
 */
const rateLimitIp = clientIpOrNull;

/**
 * Count one request against the caller's IP bucket. Returns the 429 response
 * when the bucket is full, null when the request may proceed.
 */
export function consumeIpRate(c: Context, maxRequests: number, windowMs: number, scope?: string): Response | null {
  const ip = rateLimitIp(c);
  // No usable client IP AND a loopback TCP peer: an in-process self-call (MCP
  // trust prewarm / trust-profile tool). Not an internet client, so no IP limit,
  // as before WP12 batch 4. A loopback peer with a usable public X-Forwarded-For
  // is keyed on that IP as usual; with an internal-only one it is still a
  // self-call. See isLoopbackPeer in client-ip.ts.
  if (ip === null && isLoopbackPeer(c)) return null;
  // No usable client IP: fail closed on one shared "unknown" bucket rather than
  // letting unidentifiable callers skip the limit (WP12 batch 4 review).
  // A scope gives a route its own bucket instead of sharing the IP's.
  const key = ip ?? "unknown";
  const result = checkRate(scope ? `${scope}:ip:${key}` : `ip:${key}`, maxRequests, windowMs);
  setRateLimitHeaders(c, result);
  if (result.allowed) return null;
  return c.json(
    apiError("rate_limited", `Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds.`, {
      retry_after_seconds: result.retryAfterSeconds,
    }),
    429,
  );
}

/**
 * Rate limit by IP address. For unauthenticated endpoints.
 * @param maxRequests - max requests per window
 * @param windowMs - window duration in ms
 */
export function rateLimitByIp(maxRequests: number, windowMs: number, scope?: string) {
  return async (c: Context, next: Next) => {
    const limited = consumeIpRate(c, maxRequests, windowMs, scope);
    if (limited) return limited;
    return next();
  };
}
