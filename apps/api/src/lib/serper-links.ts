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
 *     which is why resolution takes a deadline rather than a fixed slice.
 *   - Links roughly five minutes stale still resolved, so Serper's "within
 *     about 30 seconds of the search" is looser than their note says. Nothing
 *     here relies on either figure: an unresolved link is handled, not feared.
 *
 * Three deliberate choices:
 *
 *   1. **Lazy.** No `/resolve` call unless a `goto` link is actually present.
 *      Detecting the prefix is a string test, and a response that needs no
 *      resolution must not pay for a second round trip.
 *   2. **Fails open, never silently.** This never throws and never rewrites a
 *      link it did not get a real URL for. It reports what it could not
 *      resolve, and each caller decides — because the right answer differs:
 *      a ranking tool must refuse rather than report a wrong domain, while a
 *      compliance tool must keep the finding and mark the link absent.
 *   3. **Bounded by a shared deadline, not a per-call timeout.** Round-2
 *      review: a fixed 8 s slice on top of the search's own 15 s could total
 *      23 s against the 15 s `SYNC_TRANSACTION_WALL_MS` on the wallet
 *      transaction, so the caller would get an infrastructure error instead
 *      of the designed refusal — and the >100-link loop gave *each* batch its
 *      own slice, so the bound was per-batch rather than total.
 *      `resolveSerperLinks` takes a wall-clock deadline, shares it across
 *      every batch, and gives up when it is gone.
 *
 * Nothing here ever lets a Google host stand in for a result's own domain.
 * That is the bug this module exists to prevent, and it is enforced twice
 * over: by refusing the wrapper, and by refusing any Google host.
 */
import { meteredVendorFetch } from "./metered-vendor-fetch.js";
import { logWarn } from "./log.js";
import { MAX_FETCHED_API_RESPONSE_BYTES, readJsonWithLimit } from "./resource-limits.js";
import { GOOGLE_HOST_RE } from "./tos-blocklist.js";

const RESOLVE_URL = "https://google.serper.dev/resolve";

/** Serper's documented ceiling for one `/resolve` call. */
export const MAX_RESOLVE_LINKS_PER_CALL = 100;

/**
 * Default wall-clock budget for the whole resolution, every batch included.
 * Generous against the 1.1-1.6 s observed warm, and small enough to sit
 * inside what the search call leaves of the 15 s sync wall. A caller on a
 * tighter budget passes its own `deadline`.
 */
export const DEFAULT_RESOLVE_BUDGET_MS = 8000;

/** Per-attempt floor: below this a call cannot plausibly complete. */
const MIN_ATTEMPT_MS = 500;

/**
 * Timeout for the Serper *search* call in a capability that also resolves.
 *
 * Round-2 review: the search asked for 15 s, the whole of
 * `SYNC_TRANSACTION_WALL_MS`, leaving resolution nothing to spend without
 * blowing the wall — every one of these capabilities routes sync
 * (`avg_latency_ms` 1500-2000 where it is declared at all). Ten seconds is
 * still four times the slowest observed Serper search and leaves room for a
 * second hop.
 */
export const SERPER_SEARCH_TIMEOUT_MS = 10_000;

/**
 * One wall-clock budget for a capability's whole Serper leg, taken at the top
 * of the executor so the search and the resolution cannot each spend the
 * sync wall in turn. 13 s of the 15 s wall, leaving the wallet transaction
 * and the DB work the rest.
 */
export function startSerperBudget(totalMs = 13_000): {
  searchTimeoutMs: number;
  resolveDeadline: number;
} {
  return {
    searchTimeoutMs: SERPER_SEARCH_TIMEOUT_MS,
    resolveDeadline: Date.now() + totalMs,
  };
}

/**
 * Keys whose string values are treated as result links.
 *
 * Round-2 review: `link`/`url` alone missed `knowledgeGraph.website` and
 * `knowledgeGraph.descriptionLink`, so a wrapped Knowledge-Graph "Website"
 * button — exactly the kind of link Google wraps — was neither resolved nor
 * suppressed on any path. These are Serper's own field names, not guesses.
 */
const LINK_KEYS = new Set(["link", "url", "website", "descriptionLink", "sourceLink"]);

/**
 * True for a Google redirect wrapper — the links that must never reach a
 * caller, and must never have a domain derived from them.
 *
 * Matched on host and path rather than on the literal `www.google.com/goto`
 * string, because the host varies by market (`google.co.uk`, `google.de`)
 * and `www.` is not guaranteed. The path test is case-insensitive and
 * percent-decoded, since `/GOTO` and `/got%6f` are the same path to Google.
 */
export function isGotoLink(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!isGoogleHost(url.hostname)) return false;
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // A malformed escape leaves the raw path, which is still worth testing.
  }
  return /\/goto\/*$/i.test(path);
}

/**
 * A Google host, in any market. Shares the blocklist's maintained regex
 * rather than keeping a second copy here: two matchers that must agree on
 * "is this Google" diverge silently when each owns its own pattern, and the
 * blocklist's is the one under integrity tests ("one list, many matchers").
 */
function isGoogleHost(hostname: string): boolean {
  return GOOGLE_HOST_RE.test(hostname.toLowerCase());
}

/** What a resolution attempt did, so the caller can be honest about it. */
export interface SerperLinkResolution {
  /** A `goto` link was present, so `/resolve` was called. */
  attempted: boolean;
  /** Distinct wrapped links rewritten to a real URL. */
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
 * tested for wrapping (People-Also-Ask, `answerBox`, `knowledgeGraph`) are
 * covered by walking the response for link-bearing keys rather than by naming
 * paths — a field Google starts wrapping tomorrow is resolved without a code
 * change.
 *
 * **Resolution is not suppression.** A link this could not resolve is still a
 * wrapper afterwards, so anything a capability emits must go through
 * `usableResultUrl`, or the whole sub-object through
 * `stripUnresolvedGotoLinks`.
 */
export async function resolveSerperLinks(
  response: unknown,
  serperKey: string,
  fetchImpl?: (url: string | URL, init?: RequestInit) => Promise<Response>,
  deadline: number = Date.now() + DEFAULT_RESOLVE_BUDGET_MS,
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
  const errors: string[] = [];

  for (let i = 0; i < wrapped.length; i += MAX_RESOLVE_LINKS_PER_CALL) {
    // Capped as well as bounded: a caller that left plenty of wall should
    // still not wait minutes on one `/resolve`.
    const remaining = Math.min(deadline - Date.now(), DEFAULT_RESOLVE_BUDGET_MS);
    if (remaining < MIN_ATTEMPT_MS) {
      // The budget is shared, so a slow first batch must not let later ones
      // push the request past the sync wall one slice at a time.
      errors.push("the resolution budget ran out before every link was sent");
      break;
    }
    const batch = wrapped.slice(i, i + MAX_RESOLVE_LINKS_PER_CALL);
    try {
      // `/resolve` costs 0 credits (observed in the response body), so it is
      // metered at 0 units: the control tower still sees the call, but a
      // resolution never consumes the search quota.
      const res = await meteredVendorFetch(
        "serper",
        RESOLVE_URL,
        {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ organic: batch.map((link) => ({ link })) }),
          signal: AbortSignal.timeout(remaining),
        },
        0,
        fetchImpl,
        // A `/resolve` failure is not evidence about the search credential or
        // the account: classifying it would withdraw every Serper capability
        // on one bad resolution.
        false,
      );
      if (!res.ok) {
        errors.push(`Serper /resolve returned HTTP ${res.status}`);
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
        errors.push(`Serper /resolve returned ${returned.length} entries for ${batch.length} links`);
        continue;
      }
      batch.forEach((original, index) => {
        const candidate = returned[index]?.link;
        if (typeof candidate !== "string") return;
        if (!/^https?:\/\//i.test(candidate)) return;
        // Google sometimes cannot release a link (their `retryAfter` case).
        // Echoing the wrapper back is not a resolution — and neither is any
        // other Google URL, which also covers a future wrapper shape this
        // module does not recognise yet.
        if (isGotoLink(candidate) || hostIsGoogle(candidate)) return;
        mapping.set(original, candidate);
      });
    } catch (err) {
      errors.push(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
  }

  try {
    rewriteLinks(response, mapping);
  } catch (err) {
    // Belt and braces: a frozen or getter-bearing object from a future caller
    // would throw on assignment, and this function is documented as never
    // throwing. The links simply stay wrapped, which every caller handles.
    errors.push(err instanceof Error ? `rewrite failed: ${err.message}` : String(err));
  }

  // Read back what the response now HOLDS rather than what the mapping says
  // it should hold. Round-2 review: deriving `unresolved` from the mapping
  // would report a link as resolved when the rewrite was refused — a frozen
  // or getter-bearing payload — leaving the caller told one thing and handed
  // another. Both numbers are distinct links, so they share a denominator.
  const unresolved = collectGotoLinks(response);
  const resolved = wrapped.length - unresolved.length;
  // Every batch's failure, not just the last one: `unresolved` lists them all,
  // so the explanation must too.
  const error = errors.length > 0 ? [...new Set(errors)].join("; ") : undefined;

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

/**
 * Null every still-wrapped link inside `value`, in place, and report how many.
 *
 * Round-2 review: resolution rewrites links when it succeeds, but a capability
 * that forwards a Serper sub-object wholesale (`sitelinks`, `answerBox`,
 * `knowledgeGraph`) still emits the wrapper when it fails. Projecting selected
 * fields through `usableResultUrl` covers what a capability names; this covers
 * what it passes through untouched.
 */
export function stripUnresolvedGotoLinks(value: unknown): number {
  let stripped = 0;
  try {
    walk(value, (link, set) => {
      if (isGotoLink(link)) {
        set(null);
        stripped += 1;
      }
    });
  } catch {
    // Same reasoning as the rewrite above: never throw out of a sanitiser.
  }
  return stripped;
}

/** Unique `goto` links under a link-bearing key, in document order. */
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

/** Depth-bounded walk over every string under a link-bearing key. */
function walk(
  value: unknown,
  visit: (link: string, set: (next: string | null) => void) => void,
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

/** Where a result's host was established, when it could be at all. */
export interface ResultDomain {
  domain: string | null;
  /**
   * `url` — the destination URL named it, and it is trustworthy.
   * `breadcrumb` — only Google's display breadcrumb named it. Usable, but
   *   Google's *display* URL is routinely not the destination host for AMP,
   *   syndicated and redirecting results, so a caller must be told.
   * `none` — neither could.
   */
  source: "url" | "breadcrumb" | "none";
}

/**
 * The host a result genuinely sits on, with where that host came from.
 *
 * **Never returns a Google host.** That is the whole point: before this
 * existed, `new URL(link).hostname` on an unresolved wrapper returned
 * `www.google.com`, and the ranking, SERP and backlink tools reported it as
 * the result's domain — a wrong answer a customer pays for, which is worse
 * than no answer. Round-2 review: the Google test is applied to the link
 * branch as well as the breadcrumb branch, not only via the `/goto` path. If
 * Google ever moves to `/url?q=` or `/aclk`, `isGotoLink` stops matching, and
 * without this the original bug would re-arm silently with no test failing.
 * A Google host is never an organic result's own domain.
 *
 * `displayedLink` is a free second source: Serper returns Google's own
 * breadcrumb ("https://www.teamwork.com › Blog") alongside the wrapper, and it
 * names the real host even when resolution failed. It is used for the
 * *domain* only, never as a URL — a breadcrumb is not an address — and it is
 * always reported as `breadcrumb` so no caller mistakes it for the
 * destination.
 */
export function describeResultDomain(link: unknown, displayedLink?: unknown): ResultDomain {
  if (typeof link === "string" && link && !isGotoLink(link)) {
    const host = hostOf(link);
    if (host && !GOOGLE_HOST_RE.test(host)) return { domain: host, source: "url" };
  }
  if (typeof displayedLink === "string" && displayedLink) {
    const host = hostOf(firstBreadcrumbToken(displayedLink));
    if (host && !GOOGLE_HOST_RE.test(host)) return { domain: host, source: "breadcrumb" };
  }
  return { domain: null, source: "none" };
}

/** `describeResultDomain` without the provenance, for callers that need only the host. */
export function deriveResultDomain(link: unknown, displayedLink?: unknown): string | null {
  return describeResultDomain(link, displayedLink).domain;
}

/**
 * The host part of a Google breadcrumb.
 *
 * Serper returns these as `"https://www.teamwork.com › Blog"` — the separator
 * is U+203A, but splitting on whitespace as well keeps an ASCII `>` or a plain
 * `"example.com/blog x"` from being parsed as a host with a path. Anything
 * after the first token is display text, never part of the address.
 */
function firstBreadcrumbToken(displayedLink: string): string {
  return displayedLink.trim().split(/[\s›>]+/)[0] ?? "";
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

function hostIsGoogle(value: string): boolean {
  const host = hostOf(value);
  return host !== null && GOOGLE_HOST_RE.test(host);
}

/** A usable result URL, or `null` for an unresolved wrapper. */
export function usableResultUrl(link: unknown): string | null {
  if (typeof link !== "string" || !link) return null;
  return isGotoLink(link) ? null : link;
}
