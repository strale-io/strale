import type { Context, Next } from "hono";
import { apiError } from "./errors.js";

// ─── Sliding window counter ────────────────────────────────────────────────────
// In-memory store keyed by identifier. Each entry tracks request timestamps
// within the window. Stale entries are cleaned up periodically.
//
// LIMITATIONS:
// - In-memory: state is NOT shared across multiple Railway replicas. If the
//   service is scaled horizontally, each instance has its own counter, so
//   effective limits are multiplied by the number of instances.
// - Non-durable: all state is lost on restart, allowing a brief burst window.
// - For production multi-instance deployments, consider Redis-based rate
//   limiting (e.g., @hono-rate-limiter/redis or a sliding-window-log in Redis).

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
): RateCheckResult {
  const now = Date.now();
  let entry = store.get(identifier);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(identifier, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    // Calculate when the oldest request in the window expires
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      limit: maxRequests,
      remaining: 0,
      resetAt: Math.ceil((oldest + windowMs) / 1000),
    };
  }

  entry.timestamps.push(now);
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
export function rateLimitByKey(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as { id: string } | undefined;
    if (!user) {
      // No user set — expected for unauthenticated free-tier requests.
      // IP-based rate limiting handles this path (rateLimitFreeTierByIp or rateLimitByIp).
      return next();
    }

    const key = `key:${user.id}`;
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

// ─── Daily IP-based rate limiter (free-tier) ──────────────────────────────────
// Resets at midnight UTC. Separate from the sliding-window limiter above because
// the daily window is too large for the timestamp-array approach.

const dailyStore = new Map<string, { count: number; resetAt: number }>();

// Clean up stale daily entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of dailyStore) {
    if (now > entry.resetAt) dailyStore.delete(key);
  }
}, 5 * 60_000).unref();

function getNextMidnightUTC(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
  ));
  return tomorrow.getTime();
}

function checkDailyRate(
  identifier: string,
  maxPerDay: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = dailyStore.get(identifier);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: getNextMidnightUTC() };
    dailyStore.set(identifier, entry);
  }

  if (entry.count >= maxPerDay) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxPerDay - entry.count, resetAt: entry.resetAt };
}

/**
 * Rate limit free-tier unauthenticated requests by IP: N calls per day.
 * Only applied when no authenticated user is present.
 */
export function rateLimitFreeTierByIp(maxPerDay: number) {
  return async (c: Context, next: Next) => {
    // Skip if user is authenticated (they get normal rate limits)
    const user = c.get("user") as { id: string } | undefined;
    if (user) return next();

    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = c.req.header("x-real-ip")?.trim();

    let ip = "unknown";
    if (forwarded && isPlausibleIp(forwarded)) {
      ip = forwarded;
    } else if (realIp && isPlausibleIp(realIp)) {
      ip = realIp;
    }

    const key = `free:${ip}`;
    const result = checkDailyRate(key, maxPerDay);

    // Set rate limit headers for daily free-tier limiter
    c.header("X-RateLimit-Limit", String(maxPerDay));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json(
        apiError("rate_limited",
          `Free-tier daily limit reached (${maxPerDay} calls/day). Sign up at strale.dev/signup for unlimited access.`,
          { retry_after_seconds: retryAfterSeconds, limit: maxPerDay },
        ),
        429,
      );
    }

    return next();
  };
}

// Simple validation: an IP must be a plausible IPv4 or IPv6 string.
// This prevents header injection from producing pathological cache keys.
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;
function isPlausibleIp(value: string): boolean {
  return IPV4_RE.test(value) || IPV6_RE.test(value);
}

/**
 * Rate limit by IP address. For unauthenticated endpoints.
 * @param maxRequests - max requests per window
 * @param windowMs - window duration in ms
 */
export function rateLimitByIp(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    // Extract IP from proxy headers, validating format to prevent
    // header spoofing from creating arbitrary rate-limit buckets.
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = c.req.header("x-real-ip")?.trim();

    let ip = "unknown";
    if (forwarded && isPlausibleIp(forwarded)) {
      ip = forwarded;
    } else if (realIp && isPlausibleIp(realIp)) {
      ip = realIp;
    }
    // NOTE: When running behind Railway's proxy, x-forwarded-for is set by
    // the load balancer and cannot be spoofed by clients. If deployed
    // behind a different proxy, configure trusted proxy headers accordingly.

    const key = `ip:${ip}`;
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
