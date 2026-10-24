/**
 * Web provider abstraction layer — retry, caching, and resilience for all
 * Browserless-dependent capabilities.
 *
 * Two-route chain:
 *   1. Plain HTTP fetch (free, ~100ms, works for server-rendered pages)
 *   3. Browserless (headless Chrome) — for pages that need JavaScript
 * (The numbering keeps the historical tier names used across comments and
 * tests; tier 2, Jina Reader, was removed — see "Data-access rule" below.)
 *
 * ## Data-access rule (DEC-20261023-A)
 *
 * This is the "customer-directed fetch of one public page" and "per-call read
 * of a public source" path, so it carries the rule's checks:
 *
 *   - robots.txt is consulted before the first request (`lib/robots-txt.ts`);
 *     a `Disallow` for the path is a refusal.
 *   - Every route identifies as Strale (`STRALE_USER_AGENT`): the plain fetch
 *     in its header, Browserless through `userAgent` in the request body.
 *   - A block STOPS the chain. HTTP 401/403/407/429 from the target, or an
 *     anti-bot challenge page, is answered with a `SiteAccessRefusedError`
 *     (`lib/site-access.ts`) at the route that saw it. Before this rule the
 *     plain-fetch tier treated 400/403/429 as routine bot-gating and fell
 *     through to Jina and then Browserless, and a challenge page was handed to
 *     the real browser precisely so it would execute the challenge: retrying
 *     around a block, which the rule puts in the never lane.
 *   - Escalating from the plain fetch to Browserless is still allowed when the
 *     plain fetch got a NON-block answer that is not usable — a JavaScript
 *     shell, a non-HTML body, a 5xx, a timeout. Rendering a page the site
 *     served freely is not getting around a block.
 *   - Jina Reader is off this path. Its hosted reader, unless told otherwise,
 *     retries a non-200 fetch through its own rotating proxy pool, and it does
 *     not report the target's status back, so Strale could neither see a block
 *     on that route nor promise not to route around one (checked against the
 *     reader's source, jina-ai/reader `src/api/crawler.ts`, 2026-10-24).
 *     Browserless reports the target's status in `X-Response-Code` — both
 *     the production image (`browserless/chrome:1.61.1`, `functions/content.js`)
 *     and v2 set it, and both accept `userAgent` in the request body.
 *   - A redirect is checked again: if the fetch ended on another URL, that
 *     URL's robots.txt must allow it too.
 *   - Who chose the page decides who the block belongs to. A caller's URL
 *     blocking Strale is a refusal (exempt from health accounting); a source
 *     Strale chose blocking Strale (`source: "strale"`) is a capability fault
 *     (`SourceBlockedError`), so a dead source cannot stay listed unnoticed.
 *
 * All 47+ capability files call fetchRenderedHtml() and get the resilience
 * upgrade without any code changes.
 *
 * F-0-006: tier 1 (plain fetch of the user URL) goes through `safeFetch`
 * so DNS rebinding and redirect-to-private-IP attacks are blocked.
 * Tier 3 (Browserless) goes to our internal Railway URL; the user URL is
 * forwarded in the body but Browserless fetches it from its own network.
 * `validateUrl` at the top of `fetchPage` is the only layer we own for it.
 *
 * ## Resource bounds (#428) — what is and is not bounded
 *
 * Both tiers read their body through `readPageHtml`, capped at
 * `MAX_FETCHED_HTML_BYTES`; the cache carries a total byte budget as well as
 * an entry count. Precisely:
 *
 *   BOUNDED — the bytes materialised from any ONE remote response (streamed
 *   and cut at the cap, never `.text()`-then-measured), and the heap residency
 *   of the response cache. The cache accounts each entry at `length * 2`
 *   (#432), V8's worst case for a JS string, rather than at its UTF-8 payload
 *   size — the earlier measure could understate residency by 2x for a page
 *   with a single non-Latin-1 character, which made this line optimistic.
 *
 *   NOT BOUNDED — the process's global footprint under concurrency. Tier 1
 *   sits outside `withBrowserLimit`, so N simultaneous requests can each
 *   hold up to the cap; the real ceiling is (concurrent requests x cap) +
 *   cache budget, plus transport chunk overhead, the string built by the
 *   streaming decoder as it grows, and whatever a downstream parser allocates
 *   from the returned HTML. Turning "unbounded" into "bounded per response and
 *   per cache" is the claim here; global containment is not.
 *
 *   NOT BOUNDED, per request — a request that falls through both tiers
 *   can transiently hold up to two capped bodies before GC reclaims the
 *   earlier ones. The realistic shape of that is narrow: a large body is
 *   ACCEPTED at tier 1, so falling through means the page was short, a
 *   challenge, or an error — all small. The exception is a huge script-only
 *   SPA shell (over the accept bar on length, under it on visible text),
 *   which is genuinely large and genuinely falls through. Bounded per
 *   response, not per request-chain.
 *
 * Compressed responses are counted AFTER decompression: undici inflates
 * before `response.body` yields, so a gzip bomb is measured at its real size
 * rather than its wire size.
 *
 * Oversize is TERMINAL, not a fallback trigger: a page too large on one tier
 * is not re-fetched by the next. See the ResourceLimitError re-throws below.
 * So is a block (see "Data-access rule" above): SiteAccessRefusedError is
 * re-thrown the same way.
 */

import { buildBrowserlessRequestUrl } from "../../lib/browserless-launch.js";
import { browserlessFetch } from "../../lib/metered-vendor-fetch.js";
import { discardBody, safeFetch } from "../../lib/safe-fetch.js";
import { assertTargetAllowed } from "../../lib/tos-blocklist.js";
import { assertRedirectAllowed, assertRobotsAllowed } from "../../lib/robots-txt.js";
import {
  STRALE_USER_AGENT,
  SiteAccessRefusedError,
  asSourceBlocked,
  isBlockStatus,
  siteAccessRefusal,
} from "../../lib/site-access.js";
import { ResourceLimitError, readErrorTextTruncated, readPageHtml } from "../../lib/resource-limits.js";

/**
 * Detect JS-challenge / anti-bot interstitials that come back with HTTP 200
 * and enough bytes to pass the "substantial content" heuristics. Observed
 * live: EUR-Lex's "verify that you're not a robot … Enable JavaScript and
 * then reload" shell (2KB, HTTP 200/202). Under DEC-20261023-A a challenge is
 * a block: the fetch path refuses on it rather than handing it to a real
 * browser to solve. Markers are deliberately narrow —
 * a real article MENTIONING robots must not trip this — so each pattern
 * targets interstitial phrasing, not topic words.
 */
export function looksLikeJsChallenge(html: string): boolean {
  const head = html.slice(0, 6000);
  // NOTE: no bare `_Incapsula_Resource` marker — Imperva injects that script
  // tag into NORMALLY SERVED pages too, so it false-positives on good content
  // (review M-1). `__cf_chl_` / `cf-browser-verification` are challenge-only.
  return (
    /verify that you'?re not a robot/i.test(head) ||
    /enable javascript and then reload/i.test(head) ||
    /checking your browser before accessing/i.test(head) ||
    /__cf_chl_|cf-browser-verification/i.test(head)
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WebProviderOptions {
  /** Override the wait strategy (default: networkidle0). */
  waitUntil?: "networkidle0" | "networkidle2" | "domcontentloaded" | "load";
  /** Per-request timeout in ms (default: 25000). */
  pageTimeout?: number;
  /** Outer fetch timeout in ms (default: 35000). */
  fetchTimeout?: number;
  /** Max retry attempts on transient failures (default: 2). */
  maxRetries?: number;
  /** Skip the response cache (default: false). */
  skipCache?: boolean;
  /**
   * Skip the plain-fetch tier and go straight to Browserless (default: false).
   * Tier 1 substitutes non-rendered HTML for what a real headless-Chrome
   * render would produce. Callers whose output contract promises actual
   * rendered-DOM content (e.g. web-extract's "full JavaScript rendering")
   * must set this so a JS-heavy page never silently falls back to a plain
   * fetch that never ran the page's scripts.
   */
  skipFallback?: boolean;
  /**
   * Minimum accepted HTML length in bytes for the Browserless tier (default:
   * 100). Below this, the response is treated as empty/broken and retried
   * (or thrown after the last attempt). Callers with a looser pre-existing
   * contract can lower this explicitly rather than silently inheriting the
   * shared default.
   */
  minHtmlLength?: number;
  /**
   * Who chose this URL (default "caller"). Pass "strale" when the capability
   * reads a source Strale selected — a registry, a carrier, a price index —
   * so a block there is reported as a capability fault (`SourceBlockedError`)
   * rather than as the caller's refusal. See "Data-access rule" above.
   */
  source?: "caller" | "strale";
}

export interface WebProviderResult {
  html: string;
  /** Whether this result came from cache. */
  cached: boolean;
  /** How long the fetch took in ms (0 if cached). */
  fetchTimeMs: number;
  /** Which attempt succeeded (1-based). */
  attempt: number;
}

// ─── Response cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  html: string;
  createdAt: number;
  /** UTF-8 payload size, recorded at insert so accounting never re-measures. */
  bytes: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 200;

/**
 * Total cache payload budget (#428).
 *
 * The entry count alone bounded nothing: 200 entries x an unbounded per-entry
 * size was an unbounded cache. Even with the new 16 MiB per-response cap the
 * count limit alone would permit 3.2 GB on a 1 GB Railway box.
 *
 * 64 MiB of ACCOUNTED bytes, which since #432 is `length * 2` per entry —
 * V8's worst case for a JS string rather than its UTF-8 payload size (see
 * `setCache`). BOTH limits still bind in the traffic that actually occurs:
 * registry pages run 1-30 KB, so 200 entries (~12 MB accounted) is reached
 * first and current behaviour is unchanged; heavy content pages run 0.4-3 MB,
 * so the byte budget binds first and the cache stops at ~10-75 entries instead
 * of hoarding gigabytes. Worst case is 6.25% of the box, and now that figure
 * is a heap number rather than a wire number.
 *
 * Lives here rather than in the byte-limit authority module: this is the
 * web-provider's own cache policy, not a limit on what any capability may
 * fetch. `MAX_FETCHED_HTML_BYTES` (the fetch cap) is the authority's.
 */
const MAX_WEB_PROVIDER_CACHE_BYTES = 64 * 1024 * 1024;

const cache = new Map<string, CacheEntry>();

/**
 * Cache-key namespace for a given call's rendering semantics.
 *
 * BLOCKER fix (external review, 2026-08-16): the cache used to be keyed by
 * URL alone, shared across every tier and every `waitUntil`. That let a
 * `skipFallback` caller (web-extract, whose contract promises full JS
 * rendering) read back plain-fetch or Jina HTML cached by an unrelated
 * caller for the same URL — and let a non-default `waitUntil` render (e.g.
 * fetchCompanyPage's `domcontentloaded`) get served to a caller that
 * expected `networkidle0`. Namespacing by (skipFallback, waitUntil)
 * partitions the cache so:
 *   - a `skipFallback: true` call only ever reads/writes entries also
 *     written by a `skipFallback: true` call at the same `waitUntil` (i.e.
 *     genuine Browserless-only renders — tiers 1/2 never run when
 *     skipFallback is set, so they can never populate this namespace);
 *   - a call with a non-default `waitUntil` never reads/writes an entry
 *     produced under a different `waitUntil`.
 * Tier 1 (plain fetch) only ever runs for the default
 * `networkidle0`/unset case with `skipFallback` false, so it always lands
 * in the same namespace as a same-shaped Browserless render — preserving
 * the pre-existing "any tier is interchangeable for an equivalent call"
 * caching behavior for the 47+ non-skipFallback callers.
 */
function cacheNamespace(skipFallback: boolean, waitUntil: string): string {
  return `${skipFallback ? "skipFallback" : "default"}:${waitUntil}`;
}

function cacheKey(namespace: string, url: string): string {
  return `${namespace}::${url}`;
}

/**
 * Live payload total, summed on demand (#428 /simplify).
 *
 * A running counter would be O(1), but it is derivable state: it has to be
 * adjusted on every expiry, eviction and overwrite, and one missed path makes
 * it silently wrong. Summing over a map hard-capped at 200 entries costs at
 * most 200 additions on a path that has just streamed up to 16 MiB, and drift
 * becomes unrepresentable rather than something tests have to chase.
 */
function totalCacheBytes(): number {
  let total = 0;
  for (const entry of cache.values()) total += entry.bytes;
  return total;
}

function getCached(namespace: string, url: string): string | null {
  const key = cacheKey(namespace, url);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > DEFAULT_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.html;
}

function setCache(namespace: string, url: string, html: string): void {
  const key = cacheKey(namespace, url);
  // V8's worst-case residency for the string, not its UTF-8 payload size
  // (#432, closing a #428 review note).
  //
  // The old measure was `Buffer.byteLength(html, "utf8")`, which describes the
  // wire and understates the heap. V8 stores a string as one byte per
  // character while every character is Latin-1, and switches the WHOLE string
  // to two bytes per character the moment one is not — so a mostly-ASCII page
  // containing a single emoji or CJK character measures ~N on the wire and
  // occupies ~2N in the heap. A 64 MiB budget accounted that way could hold
  // 128 MiB, and the module header said the cache payload was bounded.
  //
  // `length * 2` is the ceiling for any JS string, so the budget now means
  // what it says. It over-charges pure-ASCII pages by 2x, which costs
  // approximately nothing in practice: at typical page sizes the 200-entry cap
  // binds long before the byte budget does.
  const bytes = html.length * 2;

  // Overwrite is delete-then-insert. Two reasons: the eviction loop below is
  // measured after the removal, and a refreshed entry earning a new position
  // is the coherent reading of insertion-order eviction. It also fixes a
  // pre-existing bug — the old code evicted an unrelated oldest entry whenever
  // it wrote at size >= the cap, even when the write was an overwrite that
  // grew the cache by nothing.
  cache.delete(key);

  // An entry that cannot fit the budget alone is not cached at all, rather
  // than evicting the whole cache to make room for one page. Unreachable while
  // MAX_FETCHED_HTML_BYTES < the budget; kept so the invariant holds if either
  // number moves.
  if (bytes > MAX_WEB_PROVIDER_CACHE_BYTES) return;

  // Evict oldest-first until BOTH bounds admit the new entry.
  while (
    cache.size > 0 &&
    (cache.size >= MAX_CACHE_ENTRIES ||
      totalCacheBytes() + bytes > MAX_WEB_PROVIDER_CACHE_BYTES)
  ) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }

  cache.set(key, { html, createdAt: Date.now(), bytes });
}

/** Reset the cache. Test seam only (`__…ForTests` convention). */
export function __resetWebProviderCacheForTests(): void {
  cache.clear();
}

/** Observe cache occupancy without exporting the map. Test seam only. */
export function __webProviderCacheStatsForTests(): { entries: number; bytes: number } {
  return { entries: cache.size, bytes: totalCacheBytes() };
}

// ─── Retry with exponential backoff + jitter ────────────────────────────────

// MAJOR fix (external review, 2026-08-16): 408 (Request Timeout) is exactly
// the class of failure this layer exists to absorb — Browserless returns it
// for slow-but-alive target pages — but it was missing from the transient
// set, so a 408 never got the retry that would likely have recovered it.
function isTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Chrome/Browserless navigation-level net-error patterns embedded in a
 * response body — Browserless wraps these in a 5xx HTTP status when Chrome
 * itself fails to navigate (DNS doesn't resolve, TCP connection refused,
 * TLS cert invalid). This is a different failure class from "the target's
 * server errored", and it is NOT transient: retrying does not change DNS
 * resolution, TCP refusal, or a broken certificate.
 *
 * Shared between the retry-decision site in the Browserless loop below
 * (skip the retry — classify immediately) and netErrorMessage() (construct
 * the user-facing message), so the two can never drift out of sync: a
 * six-lens review round (2026-08-16) flagged that the message said
 * "retrying will not help" while the code retried once anyway.
 */
function isPermanentNetError(bodyText: string): boolean {
  // Anchored on Chrome's canonical `net::` prefix (round-5 review): an error
  // body that merely *mentions* a bare token in prose should not suppress a
  // retry; real Chrome navigation failures always surface as `net::ERR_*`.
  return (
    /net::ERR_NAME_NOT_RESOLVED/.test(bodyText) ||
    /net::ERR_CONNECTION_REFUSED/.test(bodyText) ||
    /net::ERR_CERT_[A-Z_]+/.test(bodyText)
  );
}

/**
 * Build the permanent-failure message for a body matched by
 * isPermanentNetError(). Six-lens review finding Medium 2b (2026-08-16):
 * these were getting the 5xx branch's "usually transient — try again"
 * advice, which is actively wrong for a domain that will never resolve.
 * Returns null when no known net-error pattern matches. Fixed strings only —
 * no upstream bytes are echoed into the message. Round-5 review caught the
 * previous version interpolating the matched ERR_CERT_* token (unbounded,
 * body-controlled — `net::ERR_CERT_FAKE_SECRET` would have been echoed
 * verbatim); the cert branch is now a fixed string like every other branch.
 */
function netErrorMessage(bodyText: string, domain: string): string | null {
  if (!isPermanentNetError(bodyText)) return null;
  if (/net::ERR_NAME_NOT_RESOLVED/.test(bodyText)) {
    return `The domain${domain} does not resolve. This is a permanent failure — retrying will not help.`;
  }
  if (/net::ERR_CONNECTION_REFUSED/.test(bodyText)) {
    return `The connection to the target site${domain} was refused. This is a permanent failure — retrying will not help.`;
  }
  if (/net::ERR_CERT_[A-Z_]+/.test(bodyText)) {
    return `The target site${domain}'s TLS certificate is invalid. This is a permanent failure — retrying will not help.`;
  }
  return null;
}

/** Map a non-OK Browserless response status into an honest, actionable message. */
function humanizeBrowserlessStatus(status: number, targetUrl: string, bodyText = ""): string {
  let hostname = "";
  try { hostname = new URL(targetUrl).hostname; } catch { /* ignore */ }
  const domain = hostname ? ` (${hostname})` : "";

  if (status === 408) {
    return `The web page${domain} took too long to load. The target site is slow or heavy; try again, or try a simpler page on the same site.`;
  }
  if (status === 429) {
    return `The web scraping service is temporarily rate-limited. Please try again in a few minutes.`;
  }
  if (status === 404) {
    return `This page does not exist (HTTP 404)${domain}. The server is reachable, but this specific URL returned 'not found'. This often happens when a site migrates and old URLs redirect to pages that have been removed. Check the path, or try the site's homepage.`;
  }
  if (status === 410) {
    return `This page has been permanently removed (HTTP 410)${domain}. The URL is gone and will not return.`;
  }
  if (status === 401 || status === 407) {
    return `This page requires authentication (HTTP ${status})${domain}. Only publicly available pages can be scraped.`;
  }
  if (status === 403) {
    return `The site${domain} blocks automated access (HTTP 403 Forbidden). This is bot protection on the target site, not a Strale issue. Retrying will not help.`;
  }
  if (status >= 500) {
    const netErr = netErrorMessage(bodyText, domain);
    if (netErr) return netErr;
    return `The target site${domain} returned a server error (HTTP ${status}). This is usually transient — try again in a few minutes.`;
  }
  // Six-lens review finding HIGH (2026-08-16, round 3): a prior version of
  // this branch appended a sanitized snippet of the upstream response body
  // to this message. A denylist sanitizer (strip markup/control chars)
  // cannot be made secret-safe — a token, signed URL, or credential in a
  // Browserless error body would survive markup-stripping untouched. Fixed
  // string, HTTP status only. No upstream bytes reach the caller here.
  return `The web page${domain} could not be loaded (HTTP ${status}).`;
}

function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 8000);
  const jitter = Math.random() * 500;
  return base + jitter;
}

// ─── Concurrency limiter (Railway 1GB → max 2 concurrent browser pages) ─────

const MAX_CONCURRENT_BROWSER = 2;
let activeBrowserRequests = 0;
const browserQueue: Array<() => void> = [];

async function withBrowserLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeBrowserRequests >= MAX_CONCURRENT_BROWSER) {
    await new Promise<void>((resolve) => browserQueue.push(resolve));
  }
  activeBrowserRequests++;
  try {
    return await fn();
  } finally {
    activeBrowserRequests--;
    const next = browserQueue.shift();
    if (next) next();
  }
}

// ─── Core fetch function ────────────────────────────────────────────────────

export function getBrowserlessConfig() {
  const url = process.env.BROWSERLESS_URL;
  const key = process.env.BROWSERLESS_API_KEY;
  if (!url || !key) {
    throw new Error("BROWSERLESS_URL and BROWSERLESS_API_KEY are required.");
  }
  return { url, key };
}

/**
 * Fetch a rendered page via the current web provider (Browserless).
 * Includes retry with exponential backoff and optional caching.
 */
export async function fetchPage(
  targetUrl: string,
  options?: WebProviderOptions,
): Promise<WebProviderResult> {
  try {
    return await fetchPageOnce(targetUrl, options);
  } catch (err) {
    if (options?.source === "strale" && err instanceof SiteAccessRefusedError) {
      throw asSourceBlocked(err, targetUrl);
    }
    throw err;
  }
}

async function fetchPageOnce(
  targetUrl: string,
  options?: WebProviderOptions,
): Promise<WebProviderResult> {
  const {
    waitUntil = "networkidle0",
    pageTimeout = 25000,
    fetchTimeout = 35000,
    maxRetries = 2,
    skipCache = false,
    skipFallback = false,
    minHtmlLength = 100,
  } = options ?? {};

  // See cacheNamespace() — partitions the cache so skipFallback callers
  // never read/write a fallback-tier entry, and different waitUntil
  // renders never collide.
  const renderMode = cacheNamespace(skipFallback, waitUntil);

  // Per-source ToS policy enforced at the pipeline entry (P2, 2026-08-12):
  // tier 3 (Browserless) never touches safeFetch, so its gate alone
  // would leave the rendering path open. Pure string check, runs before DNS.
  assertTargetAllowed(targetUrl);

  // SSRF protection — validate URL before fetching
  const { validateUrl } = await import("../../lib/url-validator.js");
  await validateUrl(targetUrl);

  // Check cache first (before acquiring browser slot)
  if (!skipCache) {
    const cached = getCached(renderMode, targetUrl);
    // Six-lens review finding Medium 3 (2026-08-16): a cache entry is
    // written under whatever minHtmlLength the writer used, but a later
    // caller in the same namespace with a stricter minHtmlLength has no
    // guarantee the cached HTML actually clears ITS bar — getCached()
    // returns whatever was stored regardless of length. Treat a
    // too-short hit as a miss and fall through to a fresh fetch rather
    // than silently handing back HTML this caller would have rejected
    // from a live response. The stale-short entry is left in place —
    // another caller with a looser minHtmlLength may still want it.
    if (cached && cached.length >= minHtmlLength) {
      return { html: cached, cached: true, fetchTimeMs: 0, attempt: 0 };
    }
  }

  // DEC-20261023-A: robots.txt before the first request on ANY route. After
  // the cache read, because a cached page was fetched under a verdict that is
  // itself cached for longer than the page.
  await assertRobotsAllowed(targetUrl);

  // ── Fast-path: try plain HTTP fetch first ──────────────────────────────────
  // Many pages serve full HTML without JavaScript rendering. This avoids
  // Browserless entirely — faster, cheaper, more reliable. Falls through to
  // Browserless if the response looks like an SPA shell or is too short.
  // IMPORTANT: DNS failures and connection refused are fatal — don't waste
  // 30+ seconds on Browserless for a URL that doesn't resolve.
  // Whether a plain request has seen the site's first answer (and so its
  // block or challenge) before Chrome is asked; if not, the preflight below
  // takes that look (DEC-20261023-A).
  let sawFirstAnswer = false;
  if (!skipFallback && (!options?.waitUntil || options.waitUntil === "networkidle0")) {
    try {
      const start = Date.now();
      // F-0-006: safeFetch validates, re-validates every redirect, and
      // refuses connection-time DNS rebinding. Redirects still follow
      // transparently (maxRedirects defaults to 3).
      const plainResp = await safeFetch(targetUrl, {
        headers: {
          "User-Agent": STRALE_USER_AGENT,
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      });

      // safeFetch followed any redirects; the page it landed on needs the
      // same robots.txt permission as the one that was asked for.
      try {
        await assertRedirectAllowed(targetUrl, plainResp.url);
      } catch (err) {
        await discardBody(plainResp, "plain-fetch redirect target disallowed by robots.txt");
        throw err;
      }
      // Every branch below checks this response for a block or a challenge.
      sawFirstAnswer = true;

      if (plainResp.ok) {
        const contentType = plainResp.headers.get("content-type") ?? "";
        if (contentType.includes("text/html") || contentType.includes("xhtml")) {
          // #428: bounded read, then decode. `plainResp.text()` resolved with
          // the whole body resident, so the length heuristics below described
          // the page instead of bounding it.
          const html = await readPageHtml(plainResp);
          // Heuristic: if body has substantial text content, skip Browserless.
          // Style content is stripped like scripts — embedded CSS inflated
          // bodyText past the bar on EUR-Lex's 2KB challenge page.
          //
          // Computed LAZILY (#428 /simplify): the strip allocates several full
          // copies of the document, and at the 16 MiB cap that is a lot of
          // churn to spend on a page the two cheap guards are about to reject.
          const visibleText = () => {
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            return bodyMatch
              ? bodyMatch[1]
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                  .replace(/<[^>]+>/g, "")
                  .trim()
              : "";
          };
          // A JS-challenge interstitial ("enable JavaScript and reload") is
          // not content. Accepting it is how eu-regulation-search silently
          // returned "no results" for weeks (P2 triage, 2026-08-12). It used
          // to be handed to the real browser (tier 3) to execute; under
          // DEC-20261023-A that is solving the site's block, so it ends here.
          if (looksLikeJsChallenge(html)) {
            throw siteAccessRefusal(targetUrl, { kind: "challenge" });
          }
          if (html.length > 2000 && visibleText().length > 200) {
            const fetchTimeMs = Date.now() - start;
            if (!skipCache) setCache(renderMode, targetUrl, html);
            return { html, cached: false, fetchTimeMs, attempt: 0 };
          }
        } else {
          // Not HTML at all — nothing here will be read, so release it (#428).
          await discardBody(plainResp, `plain-fetch content-type ${contentType || "(none)"}`);
        }
        // HTTP response received but not usable HTML (a JavaScript shell, a
        // non-HTML body) — not a block, so rendering it is allowed.
      } else {
        // DEC-20261023-A: the site's own refusal ends the chain here. Until
        // 2026-10-24 400/403/429 fell through to Jina and Browserless as
        // "routine bot-gating" — retrying a blocked request through another
        // route, which the rule forbids.
        if (isBlockStatus(plainResp.status)) {
          await discardBody(plainResp, `plain-fetch HTTP ${plainResp.status} (site block)`);
          throw siteAccessRefusal(targetUrl, { kind: "http", status: plainResp.status });
        }
        if (plainResp.status >= 400 && plainResp.status < 500) {
          await discardBody(plainResp, `plain-fetch HTTP ${plainResp.status}`);
          // Every other 4xx is the target's final answer about this URL —
          // missing (404/410), or a request it will not serve (400, which
          // EUR-Lex sends datacenter IPs as bot-gating). No other route.
          // Prefix with "URL returned HTTP" so the catch block below
          // recognizes it as fatal.
          throw new Error(`URL returned HTTP ${plainResp.status}. ${humanizeBrowserlessStatus(plainResp.status, targetUrl)}`);
        }
        // 5xx: the server failed rather than refused, and may render
        // differently. A challenge page served with a 5xx (Cloudflare uses
        // 503) is still a block, so read the start of the body to tell.
        const errText = await readErrorTextTruncated(plainResp);
        if (looksLikeJsChallenge(errText)) {
          throw siteAccessRefusal(targetUrl, { kind: "challenge" });
        }
      }
    } catch (err) {
      // #428: an oversized page is TERMINAL, never a reason to fall through.
      // Letting it cascade would have Browserless render the same huge
      // resource — a second transfer of a page already judged too big. A
      // different tier is a different representation, not a smaller one: a
      // rendered DOM is typically LARGER than the raw HTML.
      if (err instanceof ResourceLimitError) throw err;
      // A block is terminal too — never a reason to try the next route.
      if (err instanceof SiteAccessRefusedError) throw err;
      // A connection-time SSRF refusal is Strale's own, not a transport blip.
      const ssrf = ssrfRefusalIn(err);
      if (ssrf) throw ssrf;
      // A refusal Strale made itself (validateUrl or the blocklist on a
      // redirect hop), or the 4xx message built above: never a reason to have
      // Chrome visit the same place.
      if (!isPreflightTransportFailure(err)) throw err;
      // A name that does not resolve, or a refused connection, will not render
      // either; no point paying Browserless for it. (undici's message is
      // always "fetch failed"; the reason is the cause's code.)
      const code = (err as { cause?: { code?: unknown } }).cause?.code;
      if (code === "ENOTFOUND" || code === "ECONNREFUSED") {
        const hostname = new URL(targetUrl).hostname;
        throw new Error(
          `Could not reach ${hostname}. The domain may not exist or is not responding. Check the URL and try again.`,
        );
      }
      // Timeouts, a long redirect chain, other transport failures: fall
      // through to Browserless, after the plain look below.
    }
  }

  // When no plain request saw the site's first answer (no tier 1, or tier 1
  // failed in transport), look at it plainly before Chrome runs its scripts.
  if (!sawFirstAnswer) {
    const status = await assertPlainPreflightAllowed(targetUrl);
    // As in tier 1, any other 4xx is the target's final answer about this
    // URL; 416 is the one a ranged GET can draw by itself.
    if (status !== undefined && status >= 400 && status < 500 && status !== 416) {
      throw new Error(`URL returned HTTP ${status}. ${humanizeBrowserlessStatus(status, targetUrl)}`);
    }
  }

  // ── Browserless path (paid, full headless Chrome — last resort) ──────────
  // Acquire a browser concurrency slot to prevent OOM on Railway (1GB limit)
  return withBrowserLimit(async () => {
    const { url, key } = getBrowserlessConfig();
    // Browserless v2 cloud (production-*.browserless.io) uses ?token= query
    // string auth, not Authorization: Bearer. Bearer is rejected at the
    // openresty edge with HTTP 500 before reaching the account.
    // buildBrowserlessRequestUrl also appends the per-request `?launch=`
    // query param Browserless v2 requires for Chrome flags (LAUNCH_ARGS
    // env var is deprecated and ignored — see lib/browserless-launch.ts).
    const contentUrl = buildBrowserlessRequestUrl(url, "/content", key);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, backoffMs(attempt - 1)));
      }

      const start = Date.now();
      try {
        const response = await browserlessFetch(contentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: targetUrl,
            // DEC-20261023-A: identify as Strale on this route too. Browserless
            // (v1.61.1 in production, and v2) applies it with
            // page.setUserAgent before navigating.
            userAgent: STRALE_USER_AGENT,
            gotoOptions: { waitUntil, timeout: pageTimeout },
          }),
          signal: AbortSignal.timeout(fetchTimeout),
        });

        if (!response.ok) {
          // #428: bounded, and TRUNCATED rather than refused — this body
          // exists to explain a failure that already happened, so a size
          // refusal here would discard the diagnostic and replace an accurate
          // upstream error with a size error. Never throws (same contract as
          // the `.catch(() => "")` it replaces), but no longer unbounded.
          const errText = await readErrorTextTruncated(response);
          // Six-lens review finding Medium (2026-08-16, round 3): a
          // Chrome/Browserless net-error (DNS doesn't resolve, connection
          // refused, bad cert) arrives wrapped in a 5xx/408/429 status that
          // isTransient() would otherwise retry — making the resulting
          // "retrying will not help" message a lie for the one internal
          // retry's worth of time it takes to find that out.
          // isPermanentNetError() gates the retry decision on the SAME
          // patterns netErrorMessage() uses to build that message, so
          // "classified transient" and "worded as permanent" can't diverge.
          // Scoped to >=500 (round-5 review): Browserless wraps Chrome
          // navigation failures in 5xx — that is where a net-error body means
          // "this will never work". A 408/429 keeps its own retry semantics
          // (timeout / rate-limit) regardless of what the body text mentions,
          // matching humanizeBrowserlessStatus, which only consults
          // netErrorMessage() inside its >=500 branch.
          if (
            isTransient(response.status) &&
            !(response.status >= 500 && isPermanentNetError(errText)) &&
            attempt < maxRetries - 1
          ) {
            lastError = new Error(
              `Browserless HTTP ${response.status}: ${errText.slice(0, 200)}`,
            );
            continue;
          }
          const humanMsg = humanizeBrowserlessStatus(response.status, targetUrl, errText);
          throw new Error(humanMsg);
        }

        // DEC-20261023-A: Browserless answers 200 for a rendered page whatever
        // the target said, and reports the target's own status in
        // X-Response-Code. A block there ends the chain — no retry, no other
        // route.
        await assertRenderedTargetAllowed(targetUrl, response);

        // #428: bounded read, then decode — same cap as tier 1, so a
        // page too large to fetch plainly is not silently accepted when a
        // rendered DOM (typically LARGER than the raw HTML) comes back here.
        const html = await readPageHtml(response);
        const fetchTimeMs = Date.now() - start;

        if (!html || html.length < minHtmlLength) {
          if (attempt < maxRetries - 1) {
            lastError = new Error("Browserless returned empty or too-short HTML.");
            continue;
          }
          throw new Error("Browserless returned empty or too-short HTML response.");
        }

        // An anti-bot interstitial in the rendered page is the site refusing
        // automation. Strale does not attempt to defeat bot walls.
        if (looksLikeJsChallenge(html)) {
          throw siteAccessRefusal(targetUrl, { kind: "challenge" });
        }

        // Cache the result
        if (!skipCache) {
          setCache(renderMode, targetUrl, html);
        }

        return { html, cached: false, fetchTimeMs, attempt: attempt + 1 };
      } catch (err) {
        // #428: an oversize refusal is deterministic — the page is the size it
        // is — so it must not consume a retry. Re-rendering it would transfer
        // 16 MiB+ again to reach the identical answer.
        if (err instanceof ResourceLimitError) throw err;
        // A block is the site's answer; re-asking is what the rule forbids.
        if (err instanceof SiteAccessRefusedError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries - 1) {
          const msg = lastError.message.toLowerCase();
          if (
            msg.includes("timeout") ||
            msg.includes("econnrefused") ||
            msg.includes("enotfound") ||
            msg.includes("fetch failed") ||
            msg.includes("abort")
          ) {
            continue;
          }
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error("fetchPage: all retries exhausted");
  });
}

/**
 * Apply the data-access rule to a Browserless response for `targetUrl`, on any
 * route (/content, /screenshot, /pdf). Browserless answers 200 whatever the
 * target said and reports the target's own status in `X-Response-Code` and
 * its final URL in `X-Response-URL` (browserless/chrome 1.61.1, the
 * production image, and v2 alike). A block status is a site-access refusal;
 * a redirect to a URL robots.txt disallows is one too. The body is released
 * before throwing. A missing header passes: there is nothing to read.
 */
export async function assertRenderedTargetAllowed(targetUrl: string, response: Response): Promise<void> {
  const targetStatus = Number(response.headers.get("x-response-code"));
  if (isBlockStatus(targetStatus)) {
    await discardBody(response, `browserless target HTTP ${targetStatus} (site block)`);
    throw siteAccessRefusal(targetUrl, { kind: "http", status: targetStatus });
  }
  const finalUrl = response.headers.get("x-response-url");
  try {
    // Chrome followed the redirects itself, so the blocklist safeFetch applies
    // to every hop has not seen where it landed.
    if (finalUrl) assertTargetAllowed(finalUrl);
    await assertRedirectAllowed(targetUrl, finalUrl);
  } catch (err) {
    await discardBody(response, "browserless redirect target refused");
    throw err;
  }
}

/** The bytes the preflight reads: looksLikeJsChallenge looks at the first 6000 characters. */
export const PREFLIGHT_RANGE = "bytes=0-8191";

/** Chrome follows up to 20 redirects; the preflight follows the same chain. */
const PREFLIGHT_MAX_REDIRECTS = 20;

/**
 * The connection-time SSRF refusal inside an undici "fetch failed", if that is
 * what `err` is. Rethrown as itself so its own message ("restricted address")
 * reaches the failure taxonomy, which excuses it as caller input.
 */
function ssrfRefusalIn(err: unknown): Error | null {
  const cause = (err as { cause?: unknown } | null)?.cause;
  return cause instanceof Error && (cause as { code?: unknown }).code === "ESSRFBLOCKED" ? cause : null;
}

/**
 * Whether a preflight error is a transport failure the render may still get
 * past, and will report in its own terms. undici reports every transport
 * failure (DNS, connect, TLS, a malformed response) as a TypeError "fetch
 * failed" with the reason in `cause`; a timeout is a TimeoutError. A refusal
 * Strale makes itself (validateUrl, the blocklist on a redirect hop) is a
 * plain Error and is never one; the SSRF refusal is handled before this.
 */
function isPreflightTransportFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  if (err instanceof TypeError && err.message === "fetch failed") return true;
  // safeFetch's own message names the cap first and the caller's URL last.
  return err.message.startsWith("Too many redirects");
}

/**
 * A plain look at `targetUrl` before a rendered route that has no plain tier
 * (web-provider with skipFallback, /screenshot, /pdf). Chrome can run a
 * JavaScript challenge to completion before the page is read, which the rule
 * forbids (DEC-20261023-A: getting around blocks); the plain response shows
 * the block or the challenge before any script runs. Refuses a block status,
 * a challenge page (on any status), and a redirect robots.txt disallows;
 * safeFetch refuses a blocklisted host on every hop. Returns the status, so a
 * caller that ends on other 4xx answers (fetchPage, as in tier 1) can. A
 * transport failure is left to the rendered route and returns undefined.
 */
export async function assertPlainPreflightAllowed(targetUrl: string): Promise<number | undefined> {
  let res: Response;
  try {
    res = await safeFetch(targetUrl, {
      // Only the start of the body is read, so ask for only that.
      headers: { "User-Agent": STRALE_USER_AGENT, "Accept": "text/html,application/xhtml+xml", "Range": PREFLIGHT_RANGE },
      maxRedirects: PREFLIGHT_MAX_REDIRECTS,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const ssrf = ssrfRefusalIn(err);
    if (ssrf) throw ssrf;
    if (isPreflightTransportFailure(err)) return undefined;
    throw err;
  }
  try {
    await assertRedirectAllowed(targetUrl, res.url);
  } catch (err) {
    await discardBody(res, "preflight redirect target disallowed by robots.txt");
    throw err;
  }
  if (isBlockStatus(res.status)) {
    await discardBody(res, `preflight HTTP ${res.status} (site block)`);
    throw siteAccessRefusal(targetUrl, { kind: "http", status: res.status });
  }
  const head = await readErrorTextTruncated(res, 8192);
  if (looksLikeJsChallenge(head)) throw siteAccessRefusal(targetUrl, { kind: "challenge" });
  return res.status;
}

// ─── Convenience wrappers (drop-in replacements for browserless-extract) ────

/**
 * Drop-in replacement for the old fetchRenderedHtml().
 * Uses cache + retry by default.
 */
export async function fetchRenderedHtml(targetUrl: string, options?: WebProviderOptions): Promise<string> {
  const result = await fetchPage(targetUrl, options);
  return result.html;
}

/**
 * Same as fetchRenderedHtml but always bypasses cache.
 * Use for data that must be fresh (e.g. real-time prices).
 */
export async function fetchRenderedHtmlFresh(targetUrl: string): Promise<string> {
  const result = await fetchPage(targetUrl, { skipCache: true });
  return result.html;
}

/**
 * Fetch a company registry page with settings tuned for registries:
 * - domcontentloaded (registries are mostly server-rendered)
 * - 3 retries (registries are flaky)
 * - Cache enabled (registry data doesn't change minute-to-minute)
 */
export async function fetchCompanyPage(targetUrl: string): Promise<string> {
  const result = await fetchPage(targetUrl, {
    waitUntil: "domcontentloaded",
    maxRetries: 3,
    // Registries are always sources Strale chose.
    source: "strale",
  });
  return result.html;
}
