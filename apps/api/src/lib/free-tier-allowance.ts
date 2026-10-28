import type { Context } from "hono";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { STATIC_FACTS } from "./platform-facts.js";
import { apiError } from "./errors.js";
import { logError } from "./log.js";

// Anti-abuse only; the advertised allowance is the calendar month.
export const FREE_TIER_HOURLY_GUARD = 60;
// Callers identified only by a header fingerprint (no IP from the proxy) share
// buckets with every caller whose UA/language/origin match, so they get a much
// smaller allowance than an IP; the old fingerprint cap was 3/day.
export const FREE_TIER_FINGERPRINT_MONTHLY = 30;
export const FREE_TIER_FINGERPRINT_HOURLY = 10;
class HourlyGuardReached extends Error {}

export function freeTierMonth(now = new Date()) {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/** Capped atomic reservation: rejected requests cannot overflow the counter. */
async function reserve(db: { execute(query: SQL): PromiseLike<unknown> }, key: string, start: Date, limit: number) {
  const rows = await db.execute(sql`
    INSERT INTO rate_limit_counters (bucket_key, window_start, count, updated_at)
    VALUES (${key}, ${start.toISOString()}::timestamptz, 1, NOW())
    ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET count = rate_limit_counters.count + 1, updated_at = NOW()
    WHERE rate_limit_counters.count < ${limit}
    RETURNING count
  `);
  const result = rows as Array<{ count: number }>;
  return result[0] ? Number(result[0].count) : null;
}

/** Called only after matching an anonymous free tool; auth and x402 bypass it. */
export async function enforceFreeTierAllowance(c: Context, db: ReturnType<typeof getDb>) {
  if (c.get("user") || c.get("x402_paid" as any)) return;
  const ctx = c.get("requestContext" as any) as { ipHash?: string | null; fingerprintHash?: string | null } | undefined;
  const identity = ctx?.ipHash ? `ip:${ctx.ipHash}` : ctx?.fingerprintHash ? `fp:${ctx.fingerprintHash}` : null;
  if (!identity) {
    return c.json(apiError("rate_limited", "Unable to identify this free-tier caller.", {
      retryable: false, fix: "Sign up for an API key at https://strale.dev/signup?src=free-tier-limit.",
    }), 429);
  }
  const now = new Date();
  const month = freeTierMonth(now);
  const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const byFingerprint = identity.startsWith("fp:");
  const limit = byFingerprint ? FREE_TIER_FINGERPRINT_MONTHLY : STATIC_FACTS.free_tier_monthly_limit;
  const hourlyGuard = byFingerprint ? FREE_TIER_FINGERPRINT_HOURLY : FREE_TIER_HOURLY_GUARD;
  try {
    // Lock the monthly row first on every request. If the hourly guard refuses,
    // throw to roll back the monthly reservation; abuse cannot consume the allowance.
    const count = await db.transaction(async tx => {
      const monthly = await reserve(tx, `free-tier:month:${identity}`, month.start, limit);
      if (monthly === null) return null;
      const hourly = await reserve(tx, `free-tier:hour:${identity}`, hour, hourlyGuard);
      if (hourly === null) throw new HourlyGuardReached();
      return monthly;
    });
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(count === null ? 0 : limit - count));
    c.header("X-RateLimit-Reset", String(month.end.getTime() / 1000));
    if (count === null) {
      const retryAfterSeconds = Math.ceil((month.end.getTime() - now.getTime()) / 1000);
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json(apiError("rate_limited", `Free-tier monthly allowance reached (${limit} calls/month).`, {
        limit, window: "month", resets_at: month.end.toISOString(), retryable: false,
        retry_after_seconds: retryAfterSeconds,
        fix: `Sign up for an API key at https://strale.dev/signup?src=free-tier-limit, or wait until ${month.end.toISOString()}.`,
      }), 429);
    }
    c.set("freeTierUsage" as any, buildFreeTierUsage(count, month.end));
  } catch (err) {
    if (err instanceof HourlyGuardReached) {
      const end = new Date(hour.getTime() + 3_600_000);
      const hourRetryAfterSeconds = Math.ceil((end.getTime() - now.getTime()) / 1000);
      c.header("X-RateLimit-Limit", String(hourlyGuard));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(end.getTime() / 1000));
      c.header("Retry-After", String(hourRetryAfterSeconds));
      return c.json(apiError("rate_limited", "Free-tier hourly anti-abuse guard reached.", {
        limit: hourlyGuard, window: "hour", resets_at: end.toISOString(), retryable: true,
        retry_after_seconds: hourRetryAfterSeconds,
        fix: `Retry after ${end.toISOString()}, or sign up for an API key at https://strale.dev/signup?src=free-tier-limit.`,
      }), 429);
    }
    logError("free-tier-counter-read-failed", err, { identifiedBy: ctx?.ipHash ? "ip" : "fingerprint" });
    c.header("Retry-After", "30");
    return c.json(apiError("rate_limited", "Free-tier usage counter is temporarily unavailable.", { retry_after_seconds: 30 }), 503);
  }
}

export function buildFreeTierUsage(count: number, end = freeTierMonth().end) {
  return { calls_this_month: count, monthly_limit: STATIC_FACTS.free_tier_monthly_limit, resets_at: end.toISOString() };
}
