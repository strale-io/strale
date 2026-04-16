/**
 * DB-backed rate limiter for abuse-class endpoints (F-0-002).
 *
 * The in-memory limiter in `rate-limit.ts` resets on every Railway restart,
 * which defeats day-scale limits like "1 signup per IP per day" — a
 * redeploy hands the attacker another quota. This helper persists the
 * counter across restarts.
 *
 * Design:
 *  - One row per (bucket_key, window_start) in `rate_limit_counters`.
 *  - Atomic increment via INSERT ... ON CONFLICT DO UPDATE RETURNING count.
 *  - The window is aligned to a fixed boundary (e.g., UTC day start) so
 *    concurrent requests land on the same row.
 *  - On DB error, fails CLOSED: returns 503 rather than silently allowing
 *    through, mirroring F-0-020's fail-closed principle.
 *
 * Scope (what uses this vs. what stays in-memory):
 *  - USE this for: /v1/signup (1/day/IP), /v1/auth/register (3/min/IP),
 *    /v1/auth/recover (2/5min/IP). These are abuse-class, day-to-minute
 *    windows.
 *  - KEEP in-memory `rateLimitByIp`/`rateLimitByKey` for: per-second
 *    burst limits (/v1/do, /v1/wallet/*, /mcp). Sub-second windows don't
 *    benefit from persistence and the DB round-trip would dominate.
 */

import type { Context, Next } from "hono";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../db/index.js";
import { apiError } from "./errors.js";
import { logError } from "./log.js";

// ─── IP extraction (mirrors do.ts / middleware.ts) ────────────────────────────

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;

function isPlausibleIp(value: string): boolean {
  return IPV4_RE.test(value) || IPV6_RE.test(value);
}

function extractClientIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isPlausibleIp(forwarded)) return forwarded;
  const cfIp = c.req.header("cf-connecting-ip")?.trim();
  if (cfIp && isPlausibleIp(cfIp)) return cfIp;
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp && isPlausibleIp(realIp)) return realIp;
  return null;
}

/**
 * Hash an IP identically to how do.ts / middleware.ts hash it, so DB-backed
 * and in-memory counters can be reconciled by hash later if needed.
 */
function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// ─── Window alignment ─────────────────────────────────────────────────────────

/**
 * Round the current time down to the start of a window. All concurrent
 * requests within the same window land on the same row, so the atomic
 * increment actually works. Exported for tests.
 */
export function windowStart(windowSeconds: number, now = Date.now()): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now / ms) * ms);
}

// ─── Core counter: atomic increment + check ───────────────────────────────────

interface RateCheckResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Atomically increment the counter for `bucketKey` in the current window
 * and return whether the request is allowed.
 *
 * Throws on DB error — callers translate this into 503 (fail closed).
 */
async function incrementAndCheck(
  bucketKey: string,
  windowSeconds: number,
  max: number,
): Promise<RateCheckResult> {
  const db = getDb();
  const start = windowStart(windowSeconds);
  const end = new Date(start.getTime() + windowSeconds * 1000);

  // INSERT ... ON CONFLICT DO UPDATE is atomic in postgres — the row is
  // locked for the duration of the statement. RETURNING count gives the
  // post-increment value; no extra round-trip needed.
  const rows = await db.execute(sql`
    INSERT INTO rate_limit_counters (bucket_key, window_start, count, updated_at)
    VALUES (${bucketKey}, ${start.toISOString()}::timestamptz, 1, NOW())
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = rate_limit_counters.count + 1, updated_at = NOW()
    RETURNING count
  `);

  const arr = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
  const count = Number((arr[0] as { count?: number })?.count ?? 0);

  const allowed = count <= max;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((end.getTime() - Date.now()) / 1000));

  return { allowed, count, retryAfterSeconds, windowStart: start, windowEnd: end };
}

// ─── Response headers ─────────────────────────────────────────────────────────

function setHeaders(
  c: Context,
  max: number,
  result: RateCheckResult,
): void {
  c.header("X-RateLimit-Limit", String(max));
  c.header(
    "X-RateLimit-Remaining",
    String(Math.max(0, max - result.count)),
  );
  c.header(
    "X-RateLimit-Reset",
    String(Math.ceil(result.windowEnd.getTime() / 1000)),
  );
  if (!result.allowed) {
    c.header("Retry-After", String(result.retryAfterSeconds));
  }
}

// ─── Public middleware factory ────────────────────────────────────────────────

export interface DbRateLimitOptions {
  /** Window size in seconds (e.g., 86_400 for 1 day). */
  windowSeconds: number;
  /** Max requests permitted per window. */
  max: number;
  /** Stable short label for the endpoint, used as the bucket prefix. */
  scope: string;
  /**
   * When true, a request with no extractable IP is rejected. When false
   * (default), such a request is allowed through — the caller is expected
   * to have its own layer (auth, CORS) catching anonymous traffic.
   *
   * Abuse-class endpoints (signup, register, recover) set this to `true`.
   */
  rejectUnknownIp?: boolean;
}

/**
 * Hono middleware that rate-limits by client IP against a DB-persisted
 * counter. Fails CLOSED on DB error.
 */
export function rateLimitByIpDb(opts: DbRateLimitOptions) {
  const { windowSeconds, max, scope, rejectUnknownIp = true } = opts;

  return async (c: Context, next: Next) => {
    const ip = extractClientIp(c);

    if (!ip) {
      if (rejectUnknownIp) {
        // No IP means we cannot enforce the per-IP limit. For abuse-class
        // endpoints, refusing is safer than allowing through.
        return c.json(
          apiError(
            "rate_limited",
            "Unable to determine client IP for rate limiting. Retry with a standard HTTP client.",
          ),
          429,
        );
      }
      return next();
    }

    const bucketKey = `${scope}:${hashIp(ip)}`;

    let result: RateCheckResult;
    try {
      result = await incrementAndCheck(bucketKey, windowSeconds, max);
    } catch (err) {
      // F-0-002 / F-0-020: fail CLOSED. A DB hiccup must not open the
      // floodgate on an abuse-class endpoint.
      logError("db-rate-limit-failed", err, { scope, windowSeconds, max });
      return c.json(
        apiError(
          "rate_limited",
          "Rate-limit service is temporarily unavailable. Retry in a moment.",
        ),
        503,
      );
    }

    setHeaders(c, max, result);

    if (!result.allowed) {
      return c.json(
        apiError(
          "rate_limited",
          `Rate limit exceeded (${max} requests per ${formatWindow(windowSeconds)}). Try again in ${result.retryAfterSeconds} seconds.`,
          {
            retry_after_seconds: result.retryAfterSeconds,
            limit: max,
            window_seconds: windowSeconds,
          },
        ),
        429,
      );
    }

    return next();
  };
}

function formatWindow(seconds: number): string {
  if (seconds >= 86_400 && seconds % 86_400 === 0) {
    const d = seconds / 86_400;
    return d === 1 ? "day" : `${d} days`;
  }
  if (seconds >= 3600 && seconds % 3600 === 0) {
    const h = seconds / 3600;
    return h === 1 ? "hour" : `${h} hours`;
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    const m = seconds / 60;
    return m === 1 ? "minute" : `${m} minutes`;
  }
  return `${seconds} seconds`;
}
