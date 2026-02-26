import type { Context, Next } from "hono";
import { apiError } from "./errors.js";

// ─── Sliding window counter ────────────────────────────────────────────────────
// In-memory store keyed by identifier. Each entry tracks request timestamps
// within the window. Stale entries are cleaned up periodically.

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

function checkRate(
  identifier: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
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
    };
  }

  entry.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
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
      // No user set — auth middleware hasn't run or failed
      return next();
    }

    const key = `key:${user.id}`;
    const result = checkRate(key, maxRequests, windowMs);

    if (!result.allowed) {
      return c.json(
        apiError("rate_limited", "Too many requests. Please slow down.", {
          retry_after_seconds: result.retryAfterSeconds,
        }),
        429,
      );
    }

    return next();
  };
}

/**
 * Rate limit by IP address. For unauthenticated endpoints.
 * @param maxRequests - max requests per window
 * @param windowMs - window duration in ms
 */
export function rateLimitByIp(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    // Try various headers for the real IP behind proxies
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const key = `ip:${ip}`;
    const result = checkRate(key, maxRequests, windowMs);

    if (!result.allowed) {
      return c.json(
        apiError("rate_limited", "Too many requests. Please try again later.", {
          retry_after_seconds: result.retryAfterSeconds,
        }),
        429,
      );
    }

    return next();
  };
}
