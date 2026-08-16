/**
 * Recording what x402 buyers asked for and could not get.
 *
 * `failed_requests` — the table whose entire purpose is "demand we could not
 * serve" — is written only by `/v1/do`. x402 is where essentially all our
 * revenue comes from, and on that rail an agent that asks for a capability we
 * do not have, or sends input we reject, is turned away silently. We keep the
 * money we did earn and throw away the sentence telling us what to build next.
 *
 * That gap is why "unmet demand" has been unusable as a build signal: what it
 * contains is mostly our own probes on the rail nobody pays for, while the
 * paying rail records nothing. This closes it.
 *
 * Two distinct misses, deliberately distinguished, because they call for
 * opposite responses:
 *
 *   - `x402_unknown_slug` — they wanted something we do not sell. That is a
 *     *catalogue* signal: build it, or learn the name they expected.
 *   - `x402_bad_input` — we sell it and they could not use it. That is a
 *     *product* signal: our schema, examples or error text failed them. Nine
 *     paying attempts at tech-stack-detect died this way in one week.
 *
 * Fire-and-forget: a demand-capture write must never add latency to, or fail,
 * a request that is already being refused. The swallow is logged, per the
 * visibility discipline in DEC-20260504-A — a silent recorder is worse than
 * none, because it looks like an absence of demand.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { logWarn } from "./log.js";
import { saltedIpHash } from "./attribution.js";

/**
 * `x402_unknown_slug` — we do not sell this at all. A build signal.
 * `x402_not_on_rail`  — we sell it, just not for USDC. A pricing/rail signal,
 *                       and emphatically NOT a request to build anything.
 * `x402_bad_input`    — we sell it and the caller could not use it.
 *
 * The middle kind exists because production disagreed with the first
 * measurement. After the agent card stopped advertising unservable endpoints
 * (2026-08-16), the misses did not stop — 202 in 24 hours, and **every single
 * missed slug was a real capability or solution of ours**, probed by third-
 * party discovery crawlers (hermes-contact-discovery, 402explorer,
 * x402-observer, vale-census-probe and friends) walking our public catalogue,
 * which lists everything regardless of rail. Filed under "unknown slug", those
 * would have read as overwhelming demand for things we already sell, and a
 * build queue reading this table would have been steered by a crawler's
 * enumeration order.
 */
export type X402MissKind = "x402_unknown_slug" | "x402_not_on_rail" | "x402_bad_input";

export interface X402MissContext {
  /** What they asked for — the slug from the URL, even if we have no such thing. */
  slug: string;
  kind: X402MissKind;
  /** Why we refused, in the words the caller received. */
  detail?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Records one unmet x402 request. Never throws, never awaited by the caller.
 *
 * Note what is NOT stored: the caller's input. This table exists to tell us
 * which capability was wanted and why the call failed, and the customer-data
 * boundary in CHARTER.md means we do not retain their content to answer a
 * question that the slug and the error already answer.
 */
export function recordX402Miss(ctx: X402MissContext): void {
  try {
    const db = getDb();
    void db
      .execute(sql`
        INSERT INTO failed_requests (task, category, failure_type, error_detail, user_agent, ip_hash)
        VALUES (
          ${ctx.slug},
          ${"x402"},
          ${ctx.kind},
          ${ctx.detail ? String(ctx.detail).slice(0, 500) : null},
          ${ctx.userAgent ? String(ctx.userAgent).slice(0, 255) : null},
          ${saltedIpHash(ctx.ip ?? undefined) ?? null}
        )`)
      .catch((err) => {
        logWarn("x402-demand-write-failed", "failed_requests insert failed", {
          slug: ctx.slug,
          kind: ctx.kind,
          err: (err as Error).message,
        });
      });
  } catch (err) {
    logWarn("x402-demand-capture-failed", (err as Error).message, { slug: ctx.slug });
  }
}
