/**
 * Web provider abstraction layer — retry, caching, and resilience for all
 * Browserless-dependent capabilities.
 *
 * Three-tier fallback chain:
 *   1. Plain HTTP fetch (free, ~100ms, works for server-rendered pages)
 *   2. Jina Reader (free tier 200 RPM, handles JS rendering)
 *   3. Browserless.io (paid, full headless Chrome — last resort)
 *
 * All 47+ capability files call fetchRenderedHtml() and get the resilience
 * upgrade without any code changes.
 *
 * F-0-006: tier 1 (plain fetch of the user URL) goes through `safeFetch`
 * so DNS rebinding and redirect-to-private-IP attacks are blocked.
 * Tier 2 (Jina r.jina.ai) is a hardcoded public prefix so raw `fetch`
 * is safe — `targetUrl` is embedded in the path and Jina fetches it
 * from its own network. Tier 3 (Browserless) goes to our internal
 * Railway URL; the user URL is forwarded in the body but Browserless
 * fetches it from its own network. `validateUrl` at the top of
 * `fetchPage` is the only layer we own for tiers 2 and 3.
 *
 * ## Resource bounds (#428) — what is and is not bounded
 *
 * All three tiers read their body through `readPageHtml`, capped at
 * `MAX_FETCHED_HTML_BYTES`; the cache carries a total byte budget as well as
 * an entry count. Precisely:
 *
 *   BOUNDED — the bytes materialised from any ONE remote response (streamed
 *   and cut at the cap, never `.text()`-then-measured), and the total payload
 *   residency of the response cache.
 *
 *   NOT BOUNDED — the process's global footprint under concurrency. Tiers 1
 *   and 2 sit outside `withBrowserLimit`, so N simultaneous requests can each
 *   hold up to the cap; the real ceiling is (concurrent requests x cap) +
 *   cache budget, plus transport chunk overhead, the Buffer→string copy (the
 *   buffer and the decoded string are both live during the decode), and
 *   whatever a downstream parser allocates from the returned HTML. Turning
 *   "unbounded" into "bounded per response and per cache" is the claim here;
 *   global containment is not.
 *
 *   NOT BOUNDED, per request — a request that falls through all three tiers
 *   can transiently hold up to three capped bodies before GC reclaims the
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
 */

import { buildBrowserlessRequestUrl } from "../../lib/browserless-launch.js";
import { browserlessFetch } from "../../lib/metered-vendor-fetch.js";
import { discardBody, safeFetch } from "../../lib/safe-fetch.js";
import { assertTargetAllowed } from "../../lib/tos-blocklist.js";
import { ResourceLimitError, readErrorTextTruncated, readPageHtml } from "../../lib/resource-limits.js";

/**
 * Detect JS-challenge / anti-bot interstitials that come back with HTTP 200
 * and enough bytes to pass the "substantial content" heuristics. Observed
 * live: EUR-Lex's "verify that you're not a robot … Enable JavaScript and
 * then reload" shell (2KB, HTTP 200/202). Markers are deliberately narrow —
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
   * Skip the plain-fetch and Jina Reader tiers and go straight to Browserless
   * (default: false). Tiers 1/2 substitute non-rendered HTML (tier 1) or a
   * reformatted document (Jina, tier 2) for what a real headless-Chrome
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
 * 64 MiB, and BOTH limits bind in the traffic that actually occurs: registry
 * pages run 1-30 KB, so 200 entries (~6 MB) is reached first and current
 * behaviour is unchanged; heavy content pages run 0.4-3 MB, so the byte budget
 * binds first and the cache stops at ~20-150 entries instead of hoarding
 * gigabytes. Worst case is 6.25% of the box.
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
 * Tiers 1 (plain fetch) and 2 (Jina) only ever run for the default
 * `networkidle0`/unset case with `skipFallback` false, so they always land
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
  // UTF-8 payload size — the same measure the fetch cap counts on the wire, so
  // a value that passed MAX_FETCHED_HTML_BYTES is accounted the same way here.
  // This bounds the PAYLOAD, not V8's heap footprint for the string; see the
  // module header for what is and is not bounded.
  const bytes = Buffer.byteLength(html, "utf8");

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
  // tiers 2/3 (Jina, Browserless) never touch safeFetch, so its gate alone
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

  // ── Fast-path: try plain HTTP fetch first ──────────────────────────────────
  // Many pages serve full HTML without JavaScript rendering. This avoids
  // Browserless entirely — faster, cheaper, more reliable. Falls through to
  // Browserless if the response looks like an SPA shell or is too short.
  // IMPORTANT: DNS failures and connection refused are fatal — don't waste
  // 30+ seconds on Browserless for a URL that doesn't resolve.
  if (!skipFallback && (!options?.waitUntil || options.waitUntil === "networkidle0")) {
    try {
      const start = Date.now();
      // F-0-006: safeFetch validates, re-validates every redirect, and
      // refuses connection-time DNS rebinding. Redirects still follow
      // transparently (maxRedirects defaults to 3).
      const plainResp = await safeFetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StraleBot/1.0; +https://strale.dev)",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      });

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
          // not content — a real browser (tier 3) executes the JS and gets
          // the actual page. Accepting it here is how eu-regulation-search
          // silently returned "no results" for weeks (P2 triage, 2026-08-12).
          if (html.length > 2000 && !looksLikeJsChallenge(html) && visibleText().length > 200) {
            const fetchTimeMs = Date.now() - start;
            if (!skipCache) setCache(renderMode, targetUrl, html);
            return { html, cached: false, fetchTimeMs, attempt: 0 };
          }
        } else {
          // Not HTML at all — nothing here will be read, so release it (#428).
          await discardBody(plainResp, `plain-fetch content-type ${contentType || "(none)"}`);
        }
        // HTTP response received but not usable HTML — fall through to Browserless
      } else {
        // Nothing below reads this body, whichever way the status goes (#428).
        await discardBody(plainResp, `plain-fetch HTTP ${plainResp.status}`);
        if ([404, 410, 401, 407].includes(plainResp.status)) {
          // Genuinely permanent 4xx: missing (404/410) or auth-gated (401/407) —
          // don't waste a 30s+ Browserless render. Prefix with "URL returned
          // HTTP" so the catch block below recognizes it as fatal.
          throw new Error(`URL returned HTTP ${plainResp.status}. ${humanizeBrowserlessStatus(plainResp.status, targetUrl)}`);
        }
        // Other 4xx (400/403/429) are routinely BOT-GATING, not permanent:
        // EUR-Lex serves HTTP 400 to datacenter IPs and a 202-empty challenge
        // to residential ones (observed live, Railway US East vs Sweden,
        // 2026-08-12) — a rendered browser still succeeds. Fall through to
        // Jina/Browserless like 5xx (server might render differently).
      }
    } catch (err) {
      // #428: an oversized page is TERMINAL, never a reason to fall through.
      // Letting it cascade would have Jina fetch the same huge resource and
      // then Browserless render it — three transfers of a page already judged
      // too big. A different tier is a different representation, not a smaller
      // one: Jina reformats the same content and a rendered DOM is typically
      // LARGER than the raw HTML.
      if (err instanceof ResourceLimitError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // Helpful 4xx message already constructed upstream — propagate as-is.
      if (msg.includes("URL returned HTTP 4")) {
        throw err;
      }
      // DNS failures, connection refused, and SSL errors are fatal — no point
      // sending to Browserless, the domain simply doesn't resolve.
      if (
        msg.includes("ENOTFOUND") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ERR_TLS") ||
        msg.includes("getaddrinfo")
      ) {
        const hostname = new URL(targetUrl).hostname;
        throw new Error(
          `Could not reach ${hostname}. The domain may not exist or is not responding. Check the URL and try again.`,
        );
      }
      // Timeouts and other transient errors: fall through to Browserless
    }
  }

  // ── Jina Reader path (free tier, handles JS rendering) ────────────────────
  // Jina converts URLs to clean text/HTML. Free at 200 RPM with API key.
  // Skip Jina for non-default waitUntil (caller needs specific rendering behavior)
  // and for URLs that need full browser features (screenshot, PDF, cookie analysis).
  if (!skipFallback && (!options?.waitUntil || options.waitUntil === "networkidle0")) {
    try {
      const start = Date.now();
      const jinaUrl = `https://r.jina.ai/${targetUrl}`;
      const jinaHeaders: Record<string, string> = {
        Accept: "text/html",
        "X-Return-Format": "html",
        "X-No-Cache": "true",
      };
      const jinaKey = process.env.JINA_API_KEY;
      if (jinaKey) jinaHeaders.Authorization = `Bearer ${jinaKey}`;

      const jinaResp = await fetch(jinaUrl, {
        headers: jinaHeaders,
        signal: AbortSignal.timeout(15000),
      });

      if (jinaResp.ok) {
        // #428: bounded read under the same shared cap as the other tiers.
        const html = await readPageHtml(jinaResp);
        if (html.length > 500 && !looksLikeJsChallenge(html)) {
          const fetchTimeMs = Date.now() - start;
          if (!skipCache) setCache(renderMode, targetUrl, html);
          return { html, cached: false, fetchTimeMs, attempt: 0 };
        }
      } else {
        await discardBody(jinaResp, `jina HTTP ${jinaResp.status}`);
      }
      // Jina returned empty/short content or error — fall through to Browserless
    } catch (err) {
      // #428: oversize is terminal here too — see the tier-1 note. Jina's
      // reformat of a 16 MiB+ page is not a smaller representation, and
      // rendering it in Browserless afterwards is strictly more work.
      if (err instanceof ResourceLimitError) throw err;
      // Jina timeout or network error — fall through to Browserless
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

        // #428: bounded read, then decode — same cap as tiers 1 and 2, so a
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

        // If even a real rendered browser gets the anti-bot interstitial, the
        // site is actively refusing automation. Fail honestly — Strale does
        // not attempt to defeat bot walls (same posture as the ToS blocklist).
        if (looksLikeJsChallenge(html)) {
          throw new Error(
            `${new URL(targetUrl).hostname} served an anti-bot challenge to the rendered ` +
              `browser as well. The site is refusing automated access; this is not retryable. ` +
              `If an official API exists for this source, that is the correct path.`,
          );
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
  });
  return result.html;
}
