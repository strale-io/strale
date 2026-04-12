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
 */

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
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 200;

const cache = new Map<string, CacheEntry>();

function getCached(url: string): string | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > DEFAULT_TTL_MS) {
    cache.delete(url);
    return null;
  }
  return entry.html;
}

function setCache(url: string, html: string): void {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, { html, createdAt: Date.now() });
}

// ─── Retry with exponential backoff + jitter ────────────────────────────────

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
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
  } = options ?? {};

  // SSRF protection — validate URL before fetching
  const { validateUrl } = await import("../../lib/url-validator.js");
  await validateUrl(targetUrl);

  // Check cache first (before acquiring browser slot)
  if (!skipCache) {
    const cached = getCached(targetUrl);
    if (cached) {
      return { html: cached, cached: true, fetchTimeMs: 0, attempt: 0 };
    }
  }

  // ── Fast-path: try plain HTTP fetch first ──────────────────────────────────
  // Many pages serve full HTML without JavaScript rendering. This avoids
  // Browserless entirely — faster, cheaper, more reliable. Falls through to
  // Browserless if the response looks like an SPA shell or is too short.
  // IMPORTANT: DNS failures and connection refused are fatal — don't waste
  // 30+ seconds on Browserless for a URL that doesn't resolve.
  if (!options?.waitUntil || options.waitUntil === "networkidle0") {
    try {
      const start = Date.now();
      const plainResp = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StraleBot/1.0; +https://strale.dev)",
          "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });

      if (plainResp.ok) {
        const contentType = plainResp.headers.get("content-type") ?? "";
        if (contentType.includes("text/html") || contentType.includes("xhtml")) {
          const html = await plainResp.text();
          // Heuristic: if body has substantial text content, skip Browserless
          const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, "").trim() : "";
          if (html.length > 2000 && bodyText.length > 200) {
            const fetchTimeMs = Date.now() - start;
            if (!skipCache) setCache(targetUrl, html);
            return { html, cached: false, fetchTimeMs, attempt: 0 };
          }
        }
        // HTTP response received but not usable HTML — fall through to Browserless
      } else if (plainResp.status >= 400 && plainResp.status < 500) {
        // 4xx errors (404, 403, etc.) are permanent — don't retry via Browserless
        throw new Error(`URL returned HTTP ${plainResp.status}. Check the URL is correct.`);
      }
      // 5xx errors: fall through to Browserless (server might render differently)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // DNS failures, connection refused, and SSL errors are fatal — no point
      // sending to Browserless, the domain simply doesn't resolve.
      if (
        msg.includes("ENOTFOUND") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ERR_TLS") ||
        msg.includes("getaddrinfo") ||
        msg.includes("URL returned HTTP 4")
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
  if (!options?.waitUntil || options.waitUntil === "networkidle0") {
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
        const html = await jinaResp.text();
        if (html.length > 500) {
          const fetchTimeMs = Date.now() - start;
          if (!skipCache) setCache(targetUrl, html);
          return { html, cached: false, fetchTimeMs, attempt: 0 };
        }
      }
      // Jina returned empty/short content or error — fall through to Browserless
    } catch {
      // Jina timeout or network error — fall through to Browserless
    }
  }

  // ── Browserless path (paid, full headless Chrome — last resort) ──────────
  // Acquire a browser concurrency slot to prevent OOM on Railway (1GB limit)
  return withBrowserLimit(async () => {
    const { url, key } = getBrowserlessConfig();
    const contentUrl = `${url}/content`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, backoffMs(attempt - 1)));
      }

      const start = Date.now();
      try {
        const response = await fetch(contentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify({
            url: targetUrl,
            gotoOptions: { waitUntil, timeout: pageTimeout },
          }),
          signal: AbortSignal.timeout(fetchTimeout),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          if (isTransient(response.status) && attempt < maxRetries - 1) {
            lastError = new Error(
              `Browserless HTTP ${response.status}: ${errText.slice(0, 200)}`,
            );
            continue;
          }
          const humanMsg = response.status === 408
            ? "The web page took too long to load. This capability uses web scraping which can be slow for some sites. Please try again."
            : response.status === 429
            ? "The web scraping service is temporarily rate-limited. Please try again in a few minutes."
            : `The web page could not be loaded (HTTP ${response.status}). Please try again later.`;
          throw new Error(humanMsg);
        }

        const html = await response.text();
        const fetchTimeMs = Date.now() - start;

        if (!html || html.length < 100) {
          if (attempt < maxRetries - 1) {
            lastError = new Error("Browserless returned empty or too-short HTML.");
            continue;
          }
          throw new Error("Browserless returned empty or too-short HTML response.");
        }

        // Cache the result
        if (!skipCache) {
          setCache(targetUrl, html);
        }

        return { html, cached: false, fetchTimeMs, attempt: attempt + 1 };
      } catch (err) {
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
export async function fetchRenderedHtml(targetUrl: string): Promise<string> {
  const result = await fetchPage(targetUrl);
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
