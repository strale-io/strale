/**
 * How Strale reads a page somebody else publishes (DEC-20261023-A).
 *
 * The data-access rule allows a customer-directed fetch of one public page,
 * and a per-call read of a public source Strale chose, on four conditions:
 *
 *   1. Strale identifies itself honestly on every route — {@link STRALE_USER_AGENT}.
 *   2. It stops at an explicit block: HTTP 401/403/407/429, an anti-bot
 *      challenge page, or robots.txt `Disallow` for the path.
 *   3. It never retries a blocked request through another route (a second
 *      vendor, a real browser, a proxy).
 *   4. The ToS blocklist (`tos-blocklist.ts`) stays in force.
 *
 * This module owns 1 and 2, `robots-txt.ts` owns the robots half of 2, and the
 * fetch paths (`capabilities/lib/web-provider.ts` and the executors that fetch
 * directly) own 3 by throwing what this module builds instead of falling
 * through to the next tier.
 *
 * A block is answered with {@link SiteAccessRefusedError}: a refusal, not a
 * fault. The capability did what the rule requires, so the circuit breaker, the
 * quality floor and the trust surfaces must not count it — every one of them
 * recognises {@link SITE_BLOCK_MARKER} through `isRefusalMessage`.
 *
 * That holds when the CALLER chose the page. When Strale chose the source (a
 * registry, a carrier's tracking page, a price index) and that source blocks
 * Strale, the capability cannot do what it is sold to do — exempting the
 * failure would keep a dead capability listed and billed. Those fetches pass
 * `source: "strale"` and get {@link SourceBlockedError} instead: the same
 * stop, but a fault the health machinery counts.
 */

import { CapabilityRefusalError, ROBOTS_UNAVAILABLE_DETAILS } from "./capability-refusal.js";
import { SITE_BLOCK_MARKER } from "./tos-blocklist.js";

/**
 * The user agent on every route that fetches a third-party page: plain HTTP,
 * Browserless (`userAgent` in the request body), and robots.txt itself.
 *
 * The `Mozilla/5.0 (compatible; …)` prefix is the convention honest crawlers
 * use (Googlebot, Bingbot): it says "not a browser" in the place servers look,
 * while keeping sites that refuse an unprefixed UA from serving an error page
 * for a reason that has nothing to do with automation.
 */
export const STRALE_USER_AGENT = "Mozilla/5.0 (compatible; StraleBot/1.0; +https://strale.dev)";

/** The product token robots.txt groups are matched against (RFC 9309 §2.2.1). */
export const STRALE_ROBOTS_TOKEN = "StraleBot";

/** Default headers for a page fetch. Spread first so a caller can add Accept etc. */
export const STRALE_PAGE_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent": STRALE_USER_AGENT,
};

/**
 * Statuses that mean "this site refuses this request": authentication (401,
 * 407 — the never lane forbids gated access), forbidden (403) and rate limiting
 * (429). Each is the site's own answer to Strale, so no other route may be
 * tried after one.
 *
 * Deliberately not 400: a 400 is far more often a malformed URL than a block,
 * so it keeps its ordinary "URL returned HTTP 400" wording. It is terminal on
 * the fetch path all the same — since 2026-10-24 every 4xx from the target
 * ends the chain (web-provider.ts), because each is the site's own answer
 * about that URL and some (EUR-Lex's 400 to datacenter IPs, 451) are blocks
 * in all but name.
 */
const BLOCK_STATUSES: ReadonlySet<number> = new Set([401, 403, 407, 429]);

export function isBlockStatus(status: number): boolean {
  return BLOCK_STATUSES.has(status);
}

export type SiteBlock =
  | { kind: "http"; status: number }
  | { kind: "challenge" }
  | { kind: "robots_disallow" }
  | { kind: "robots_unavailable"; status: number };

/**
 * The target site declined Strale. Extends the refusal class, so the object
 * path (`isCapabilityRefusal`) recognises it; the message carries
 * {@link SITE_BLOCK_MARKER} for every path where only the string survives.
 */
export class SiteAccessRefusedError extends CapabilityRefusalError {
  readonly block: SiteBlock;

  constructor(message: string, block: SiteBlock) {
    super(message, block.kind === "robots_unavailable" ? ROBOTS_UNAVAILABLE_DETAILS : undefined);
    this.name = "SiteAccessRefusedError";
    this.block = block;
  }
}

function hostOf(targetUrl: string): string {
  try {
    return new URL(targetUrl).hostname;
  } catch {
    return "The site";
  }
}

function describeBlock(host: string, block: SiteBlock): string {
  switch (block.kind) {
    case "http":
      if (block.status === 401 || block.status === 407) {
        return `${host} requires authentication (HTTP ${block.status}). Strale reads only public, logged-out pages.`;
      }
      if (block.status === 429) {
        return `${host} is rate-limiting automated requests (HTTP 429).`;
      }
      return `${host} refuses automated access (HTTP ${block.status}).`;
    case "challenge":
      return `${host} answered with an anti-bot challenge page instead of the content.`;
    case "robots_disallow":
      return `${host}'s robots.txt disallows this path for automated agents.`;
    case "robots_unavailable":
      return (
        `${host}'s robots.txt could not be read (${block.status === 0 ? "transport failure or timeout" : `HTTP ${block.status}`}); ` +
        `the robots.txt standard (RFC 9309) treats that as "do not fetch".`
      );
  }
}

/**
 * Build the refusal for a blocked fetch. Callers `throw` it at the point the
 * block is seen, before any other route is tried.
 *
 * Fixed wording plus the hostname and status: no upstream bytes reach the
 * caller.
 */
export function siteAccessRefusal(
  targetUrl: string,
  block: SiteBlock,
  /** Replaces the generic closing advice, e.g. to name a purpose-built capability. */
  advice = "Use a page the site serves publicly, or the site's official API if it has one.",
): SiteAccessRefusedError {
  const message =
    `Site refused automated access: ${describeBlock(hostOf(targetUrl), block)} ` +
    `${SITE_BLOCK_MARKER} and does not retry it through another route. ` +
    (block.kind === "robots_unavailable"
      ? "Wait at least 5 minutes before retrying this URL after robots.txt becomes reachable. "
      : "Retrying the same URL will not succeed. ") +
    advice;
  return new SiteAccessRefusedError(message, block);
}

/** Throw the refusal if `status` is a block status. */
export function assertNotBlockStatus(targetUrl: string, status: number): void {
  if (isBlockStatus(status)) throw siteAccessRefusal(targetUrl, { kind: "http", status });
}

/**
 * Should a multi-page visit to the same site stop on this error?
 *
 * Capabilities that try several paths on one site (privacy, terms and
 * return-policy finders) swallow per-path failures and move on. A site-wide
 * block — the site answering 401/403/407/429, a challenge page, or an
 * unreadable robots.txt — must end the visit: asking the same site for the
 * next path is asking again after being told no. A robots.txt `Disallow` is
 * per path, so the next path may still be allowed and is checked on its own.
 */
export function isSiteWideBlock(err: unknown): boolean {
  return err instanceof SiteAccessRefusedError && err.block.kind !== "robots_disallow";
}

/**
 * A source STRALE chose refused Strale (see the module header). Same stop as a
 * site-access refusal — nothing is retried through another route — but a
 * capability fault, not the caller's choice: the wording carries
 * "unavailable", which the failure taxonomy classifies `upstream`, and none of
 * the refusal or user-input markers.
 */
export class SourceBlockedError extends Error {
  readonly block: SiteBlock;

  constructor(message: string, block: SiteBlock) {
    super(message);
    this.name = "SourceBlockedError";
    this.block = block;
  }
}

/** Re-issue a site-access refusal as a source block, for a Strale-chosen source. */
export function asSourceBlocked(refusal: SiteAccessRefusedError, targetUrl: string): SourceBlockedError {
  return new SourceBlockedError(
    `Source unavailable to Strale: ${describeBlock(hostOf(targetUrl), refusal.block)} ` +
      `This is the source this capability reads; Strale does not route around a source's block, ` +
      `so the capability cannot answer until the source allows access or an official API replaces it.`,
    refusal.block,
  );
}
