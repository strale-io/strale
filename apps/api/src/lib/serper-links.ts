/**
 * Serper result links: Google's `/goto` redirect wrapper, and undoing it.
 *
 * Since 2026-10-30 ~01:30 UTC Google only hands out a few openable result
 * links per search. Everything past the top three comes back as an opaque
 * `https://www.google.com/goto?url=<ciphertext>` wrapper, and Serper passes
 * those through verbatim. Verified live on 2026-10-31 against `/search` and
 * `/news`: positions 1-3 are real URLs, 4-10 are `goto` links.
 *
 * Serper's answer is a free `/resolve` endpoint. Verified live on 2026-10-31:
 *
 *   POST https://google.serper.dev/resolve   X-API-KEY: <the search key>
 *   {"organic":[{"link":"https://www.google.com/goto?url=…"}, …]}
 *   → {"organic":[{"link":"https://www.teamwork.com/blog/…"}, …],"credits":0}
 *
 * Observed, not assumed:
 *   - `credits: 0` in the response body, on every call made.
 *   - Entries come back in the order they were sent, one for one.
 *   - Latency 1.1-1.6 s warm; one first call of the session exceeded 20 s,
 *     which is why the timeout here is a budget rather than a guess.
 *   - Links roughly five minutes stale still resolved, so Serper's "within
 *     about 30 seconds of the search" is looser than their note says. Nothing
 *     here relies on either figure: an unresolved link is handled, not feared.
 *
 * Two deliberate choices:
 *
 *   1. **Lazy.** No `/resolve` call unless a `goto` link is actually present.
 *      Detecting the prefix is a string test, and a response that needs no
 *      resolution must not pay for a second round trip.
 *   2. **Fails open, never silently.** This never throws and never rewrites a
 *      link it did not get a real URL for. It reports what it could not
 *      resolve, and each caller decides — because the right answer differs:
 *      a ranking tool must refuse rather than report a wrong domain, while a
 *      compliance tool must keep the finding and mark the link absent.
 *
 * Latency sits inside the `/v1/do` sync budget (15 s wall, see
 * `project_v1_do_sync_15s_ceiling`). The search call already asks for up to
 * 15 s, so resolution gets its own smaller slice and gives up rather than
 * pushing the whole request past the ceiling.
 */
import { meteredVendorFetch } from "./metered-vendor-fetch.js";
import { logWarn } from "./log.js";
import { MAX_FETCHED_API_RESPONSE_BYTES, readJsonWithLimit } from "./resource-limits.js";

const RESOLVE_URL = "https://google.serper.dev/resolve";

/** Serper's documented ceiling for one `/resolve` call. */
export const MAX_RESOLVE_LINKS_PER_CALL = 100;

/**
 * Resolution gets 8 s of the 15 s sync budget: generous against the 1.1-1.6 s
 * observed warm, and short enough that a hung `/resolve` degrades this one
 * response instead of timing out the caller's whole request.
 */
const RESOLVE_TIMEOUT_MS = 8000;

/** Keys whose string values are treated as result links. */
const LINK_KEYS = new Set(["link", "url"]);

/**
 * True for a Google redirect wrapper — the links that must never reach a
 * caller, and must never have a domain derived from them.
 *
 * Matched on host and path rather than on the full `www.google.com/goto`
 * string, because the host varies by market (`google.co.uk`, `google.de`)
 * and `www.` is not guaranteed.
 */
export function isGotoLink(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return isGoogleHost(url.hostname) && url.pathname.replace(/\/+$/, "").endsWith("/goto");
}

/**
 * A Google search host, in any market: `google.com`, `google.co.uk`,
 * `www.google.de`, `news.google.com`.
 *
 * The suffix is bounded to one or two short labels — `.com`, `.de`,
 * `.co.uk`, `.com.au`. A looser `google(\.[a-z]+)+$` would call
 * `google.com.phishing.example` a Google host, and an unbounded prefix test
 * would do the same; either way `deriveResultDomain` would then discard a real
 * (if hostile) breadcrumb host, and `isGotoLink` would read a lookalike's
 * `/goto` path as Google's. Pragmatic rather than a public-suffix list: an
 * exotic Google market TLD would simply not be recognised, which fails toward
 * "not a wrapper" and so toward the link Serper actually returned.
 */
function isGoogleHost(hostname: string): boolean {
  return /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(hostname.toLowerCase());
}

/** What a resolution attempt did, so the caller can be honest about it. */
export interface SerperLinkResolution {
  /** A `goto` link was present, so `/resolve` was called. */
  attempted: boolean;
  /** Links rewritten to a real URL. */
  resolved: number;
  /** `goto` links still opaque afterwards — empty when nothing was wrapped. */
  unresolved: string[];
  /** Why resolution could not run or complete. Absent on success. */
  error?: string;
}

/**
 * Rewrite every `goto` link in a parsed Serper response, in place, to the real
 * URL. Returns what happened; never throws.
 *
 * `response` is mutated: the links a capability already reads become real
 * URLs, so no call site has to learn a second shape. Surfaces nobody has
 * tested for wrapping (People-Also-Ask, `answerBox`, `topStories`) are covered
 * by walking the response for `link`/`url` keys rather than by naming paths —
 * a field Google starts wrapping tomorrow is resolved without a code change.
 */
export async function resolveSerperLinks(
  response: unknown,
  serperKey: string,
  fetchImpl?: (url: string | URL, init?: RequestInit) => Promise<Response>,
): Promise<SerperLinkResolution> {
  const wrapped = collectGotoLinks(response);
  if (wrapped.length === 0) return { attempted: false, resolved: 0, unresolved: [] };

  if (!serperKey) {
    return {
      attempted: false,
      resolved: 0,
      unresolved: wrapped,
      error: "SERPER_API_KEY is not set, so Google redirect links cannot be resolved.",
    };
  }

  const mapping = new Map<string, string>();
  let error: string | undefined;

  for (let i = 0; i < wrapped.length; i += MAX_RESOLVE_LINKS_PER_CALL) {
    const batch = wrapped.slice(i, i + MAX_RESOLVE_LINKS_PER_CALL);
    try {
      // `/resolve` costs 0 credits (observed in the response body), so it is
      // metered at 0 units: the control tower still sees the call and its HTTP
      // failures, but a resolution never consumes the search quota.
      const res = await meteredVendorFetch(
        "serper",
        RESOLVE_URL,
        {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ organic: batch.map((link) => ({ link })) }),
          signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
        },
        0,
        fetchImpl,
        // A `/resolve` failure is not evidence about the search credential or
        // the account: classifying it would withdraw every Serper capability
        // on one bad resolution.
        false,
      );
      if (!res.ok) {
        error = `Serper /resolve returned HTTP ${res.status}.`;
        continue;
      }
      const body = await readJsonWithLimit<{ organic?: Array<{ link?: unknown }> }>(
        res,
        MAX_FETCHED_API_RESPONSE_BYTES,
        "query",
      );
      // Positional, one for one with what was sent — verified live. A length
      // mismatch means the contract moved, and guessing an alignment would
      // silently attach the wrong URL to a result, so the batch is dropped.
      const returned = Array.isArray(body?.organic) ? body.organic : [];
      if (returned.length !== batch.length) {
        error = `Serper /resolve returned ${returned.length} entries for ${batch.length} links.`;
        continue;
      }
      batch.forEach((original, index) => {
        const candidate = returned[index]?.link;
        if (typeof candidate !== "string") return;
        if (!/^https?:\/\//i.test(candidate)) return;
        // Google sometimes cannot release a link (their `retryAfter` case).
        // Echoing the wrapper back is not a resolution, and neither is any
        // other Google URL.
        if (isGotoLink(candidate)) return;
        mapping.set(original, candidate);
      });
    } catch (err) {
      error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
  }

  const resolved = rewriteLinks(response, mapping);
  const unresolved = wrapped.filter((link) => !mapping.has(link));

  if (unresolved.length > 0) {
    logWarn("serper-links-unresolved", "Google redirect links could not be resolved", {
      wrapped: wrapped.length,
      resolved,
      unresolved: unresolved.length,
      err: error,
    });
  }

  return { attempted: true, resolved, unresolved, ...(error ? { error } : {}) };
}

/** Unique `goto` links under a `link`/`url` key, in document order. */
function collectGotoLinks(value: unknown, into = new Set<string>()): string[] {
  walk(value, (link) => {
    if (isGotoLink(link)) into.add(link);
  });
  return [...into];
}

function rewriteLinks(value: unknown, mapping: Map<string, string>): number {
  if (mapping.size === 0) return 0;
  let changed = 0;
  walk(value, (link, set) => {
    const replacement = mapping.get(link);
    if (replacement) {
      set(replacement);
      changed += 1;
    }
  });
  return changed;
}

/** Depth-bounded walk over every string under a `link`/`url` key. */
function walk(
  value: unknown,
  visit: (link: string, set: (next: string) => void) => void,
  depth = 0,
): void {
  // Serper responses nest a handful of levels (organic → sitelinks → link).
  // The bound stops a pathological or cyclic payload from recursing forever.
  if (depth > 8 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (typeof child === "string") {
      if (LINK_KEYS.has(key)) {
        visit(child, (next) => {
          record[key] = next;
        });
      }
      continue;
    }
    walk(child, visit, depth + 1);
  }
}

/**
 * The host a result genuinely sits on, or `null` when it cannot be known.
 *
 * **Never returns a Google host for a `goto` link.** That is the whole point:
 * before this existed, `new URL(link).hostname` on an unresolved wrapper
 * returned `www.google.com`, and the ranking, SERP and backlink tools reported
 * it as the result's domain — a wrong answer a customer pays for, which is
 * worse than no answer.
 *
 * `displayedLink` is a free second source: Serper returns Google's own
 * breadcrumb ("https://www.teamwork.com › Blog") alongside the wrapper, and it
 * names the real host even when resolution failed. It is used for the
 * *domain* only, never as a URL — a breadcrumb is not an address.
 */
export function deriveResultDomain(link: unknown, displayedLink?: unknown): string | null {
  if (typeof link === "string" && link && !isGotoLink(link)) {
    const host = hostOf(link);
    if (host) return host;
  }
  if (typeof displayedLink === "string" && displayedLink) {
    const host = hostOf(displayedLink.split("›")[0].trim());
    if (host && !isGoogleHost(host)) return host;
  }
  return null;
}

function hostOf(value: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const host = new URL(candidate).hostname.replace(/^www\./, "").toLowerCase();
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** A usable result URL, or `null` for an unresolved wrapper. */
export function usableResultUrl(link: unknown): string | null {
  if (typeof link !== "string" || !link) return null;
  return isGotoLink(link) ? null : link;
}
