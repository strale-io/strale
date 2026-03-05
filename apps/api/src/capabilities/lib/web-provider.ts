/**
 * Web provider abstraction layer — retry, caching, and resilience for all
 * Browserless-dependent capabilities.
 *
 * Today this wraps Browserless.io's /content endpoint. The design leaves room
 * for alternative providers (Notte, Firecrawl, Stagehand) later without
 * touching the 47+ capability files that call fetchRenderedHtml().
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

  // Check cache first
  if (!skipCache) {
    const cached = getCached(targetUrl);
    if (cached) {
      return { html: cached, cached: true, fetchTimeMs: 0, attempt: 0 };
    }
  }

  const { url, key } = getBrowserlessConfig();
  const contentUrl = `${url}/content?token=${key}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, backoffMs(attempt - 1)));
    }

    const start = Date.now();
    try {
      const response = await fetch(contentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        throw new Error(
          `Browserless returned HTTP ${response.status}: ${errText.slice(0, 200)}`,
        );
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
      // Retry on network errors (timeout, connection refused, etc.)
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
