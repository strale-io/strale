/**
 * Per-provider outbound rate limits for vat-validate.
 *
 * Only a provider listed in PROVIDER_RATE_LIMITS is limited; every other call
 * passes straight through. The budget is shared across instances through
 * `rate_limit_counters` (lib/db-rate-limit.ts).
 *
 * Swiss UID register: the public tier allows 20 requests a minute, and the
 * FSO's written permission for Strale's commercial use (vendor-terms record,
 * accepted by Petter on 2026-11-16) holds only while Strale stays inside it.
 * The counter uses fixed windows, and a fixed 60-second window of 20 can
 * still let 40 through in the minute that straddles a boundary. Three per
 * 15-second window cannot: any 60 seconds touches at most five such windows,
 * so at most 15 calls. The spare 5 absorb what Strale's count cannot see:
 * network delay that bunches requests on arrival, and a clock difference
 * between Strale and the register.
 *
 * When the budget is used up, or the counter cannot be read, the call is
 * refused with a retryable UpstreamUnavailableError instead of being sent,
 * and the caller is not charged. vat-validate's stale-cache fallback rarely
 * applies here: its cache sweep drops entries as soon as they stop being
 * fresh, so in practice the caller gets the retryable error. The refusal is
 * marked `ownBudget`, so it does not count against the capability's quality
 * floor. Failing open on a database error would risk the permission on the
 * one day the database is struggling.
 *
 * The budget is shared by every process that uses the production database.
 * A manual run against another database (a local smoke test, `onboard.ts
 * --discover` on a dev DB) counts in that database and is outside it, so keep
 * such runs to single calls.
 */

import { takeUpstreamSlot } from "../../../lib/db-rate-limit.js";
import { logError } from "../../../lib/log.js";
import { UpstreamUnavailableError } from "../../../lib/upstream-result.js";

export interface ProviderRateLimit {
  windowSeconds: number;
  max: number;
  /** The upstream's name in words an operator recognises. */
  upstream: string;
}

export const PROVIDER_RATE_LIMITS: Readonly<Record<string, ProviderRateLimit>> = {
  "uid-ch": { windowSeconds: 15, max: 3, upstream: "Swiss UID register" },
};

type TakeSlot = typeof takeUpstreamSlot;

export async function withProviderRateLimit<T>(
  providerName: string,
  fn: () => Promise<T>,
  take: TakeSlot = takeUpstreamSlot,
): Promise<T> {
  const limit = PROVIDER_RATE_LIMITS[providerName];
  if (!limit) return fn();

  let slot: Awaited<ReturnType<TakeSlot>>;
  try {
    slot = await take(providerName, limit.windowSeconds, limit.max);
  } catch (err) {
    logError("upstream-rate-budget-unreadable", err, { provider: providerName });
    throw new UpstreamUnavailableError(
      limit.upstream,
      "Strale could not confirm its share of the register's published rate limit, so the call was not sent; retry shortly.",
      { code: "rate_budget_unreadable", retryable: true, cause: err, ownBudget: true },
    );
  }
  if (!slot.allowed) {
    throw new UpstreamUnavailableError(
      limit.upstream,
      `Strale's share of the register's published rate limit is used for now; retry in ${slot.retryAfterSeconds} seconds.`,
      { code: "rate_budget_spent", retryable: true, ownBudget: true },
    );
  }
  return fn();
}
