import type { Context, Next } from "hono";
import { apiError } from "./errors.js";

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
//   - POST /v1/do                        rateLimitByIp(60, 60_000)
//   - POST /v1/do                        rateLimitByKey(10, 1000)
//   - /mcp all methods                   rateLimitByIp(60, 60_000)
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
      // Free-tier daily limit is enforced in the handler (DB-based counter in do.ts).
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
    const cfIp = c.req.header("cf-connecting-ip")?.trim();
    const realIp = c.req.header("x-real-ip")?.trim();

    let ip = "unknown";
    if (forwarded && isPlausibleIp(forwarded)) {
      ip = forwarded;
    } else if (cfIp && isPlausibleIp(cfIp)) {
      ip = cfIp;
    } else if (realIp && isPlausibleIp(realIp)) {
      ip = realIp;
    }
    // NOTE: When running behind Railway's proxy, x-forwarded-for is set by
    // the load balancer and cannot be spoofed by clients. If deployed
    // behind a different proxy, configure trusted proxy headers accordingly.

    // Skip rate limiting if IP can't be detected — don't share a single
    // "unknown" bucket across all unidentified users.
    if (ip === "unknown") return next();

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
