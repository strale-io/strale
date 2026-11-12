import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { UrlValidationError, validateUrl } from "../lib/url-validator.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { logWarn } from "../lib/log.js";
import { readTextTruncated } from "../lib/resource-limits.js";
import { assertNotBlockStatus } from "../lib/site-access.js";
import { ssrfBlocked, targetUnavailable, UpstreamUnavailableError } from "../lib/upstream-result.js";

/**
 * page-exists — content-aware existence check.
 *
 * uptime-check and url-health-check only look at the HTTP status code.
 * That's not enough to answer "does this specific page still exist?" —
 * many sites return HTTP 200 for a "soft 404": a generic page, a redirect
 * to the homepage, or a "this listing is no longer available" message,
 * all served with a 200 status. This capability GETs the page, reads the
 * first 20KB of HTML, and runs deterministic heuristics against the
 * title, visible body text, redirect target, and content length. No LLM
 * call — every signal is a regex/string match, so behavior is
 * reproducible and free to run at scale.
 *
 * Every answer is `exists` true or false. A host name that does not exist
 * (DNS NXDOMAIN, errno ENOTFOUND) is an answer: no page can exist there, so
 * it is a billed `exists: false`, reason `dns_nxdomain` (PR #1018 review, B1).
 * When the site does not let the check decide (2026-11-06 swallowed-failures
 * audit, row 29), the call throws, unbilled, instead of returning a billed
 * `exists: null`:
 *   - a block (401, 403, 407, 429) or a robots.txt Disallow is the site
 *     refusing Strale: a refusal, not counted against this capability's health;
 *   - a 5xx, a timeout, a resolver or network error, or a redirect loop is
 *     the caller's target failing: `targetUnavailable`, worded so the
 *     breaker's USER_INPUT_ERROR_PATTERNS leave this capability's health
 *     alone, and marked `targetFault` so the quality floor does too;
 *   - any other non-2xx status is the site's own answer about that URL
 *     ("URL returned HTTP n"), which says nothing about existence.
 */

const SOFT_404_PHRASES = [
  "not found",
  "no longer available",
  "page doesn't exist",
  "page does not exist",
  "has been removed",
  "no longer exists",
  "cannot be found",
];

// "404" needs structural context to be a signal. As a bare substring it
// false-positives everywhere: asset hashes (main.404abc.js) and inline JS
// in the body, legitimate titles like "Area code 404 - Wikipedia", and
// address-shaped titles like "404 Main St, Springfield" — common on
// exactly the listing pages this capability targets. Real error-page
// titles have a recognizable shape: "404" paired with an error word
// ("Error 404", "HTTP 404"), or leading the title followed by a separator
// or nothing ("404 - Page Not Found", "404 | Site", "404"). Only those
// shapes count, and only in the <title>, never in the body scan.
const TITLE_404_PATTERN =
  /(?:\berror\s*[:\-–—]?\s*404\b|\b404\s*error\b|\bhttp\s*404\b|^\s*404\s*(?:[-–—|:.]|$))/i;

const BODY_SCAN_LIMIT = 20_000; // ~20KB — enough to catch phrases near the top of the page without reading megabyte-scale bodies.
const THIN_CONTENT_BYTES = 512;

const hostKey = (host: string) => host.toLowerCase().replace(/\.$/, "");

/**
 * The resolver said the requested URL's own host name does not resolve.
 * safe-fetch's robots.txt pre-check rethrows the resolver's Error itself
 * (code and hostname on the error); a direct fetch wraps it in undici's
 * `TypeError: fetch failed` (on the cause). Only a failure for the requested
 * host answers the question: an ENOTFOUND for a redirect hop's host, or for
 * a host robots.txt redirected to, says nothing about the requested page
 * and stays a target outage (PR #1018 review round 2). Node reports NODATA (a
 * name with no address record) as ENOTFOUND too, so this means "does not
 * resolve", not strictly "does not exist". EAI_AGAIN and other resolver
 * failures are not an answer either.
 */
function isRequestedHostUnresolvable(err: unknown, requestedHost: string): boolean {
  for (const e of [err, (err as { cause?: unknown } | null)?.cause]) {
    if (!e || typeof e !== "object") continue;
    const { code, hostname } = e as { code?: unknown; hostname?: unknown };
    if (code === "ENOTFOUND") {
      return typeof hostname === "string" && hostKey(hostname) === hostKey(requestedHost);
    }
  }
  return false;
}

// Same entity decoding as meta-extract.ts / url-to-text.ts apply to titles —
// keeps title values consistent across capabilities and lets the phrase scan
// match "Page Not&nbsp;Found" / "doesn&#39;t exist" style markup.
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  return decodeEntities(match[1].replace(/\s+/g, " ").trim()) || null;
}

/**
 * Reduce a raw HTML window to scannable text: drop the <title> element
 * (scored separately), <script>/<style> blocks (inline JS/i18n bundles are
 * full of literal "not found" strings), any block left unterminated by the
 * 20KB cut, and finally all remaining tags. Phrase-scanning raw markup
 * false-positives on framework payloads (__NEXT_DATA__, analytics snippets).
 */
function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:script|style)[^>]*>[\s\S]*$/i, " ")
      .replace(/<[^>]*>/g, " "),
  );
}

function containsSoft404Phrase(text: string): boolean {
  const lower = text.toLowerCase();
  return SOFT_404_PHRASES.some((phrase) => lower.includes(phrase));
}

// Whole-path match only. A substring test (/search|home/) would flag live
// deep pages like /homes/for-sale/123 or /searchable-archive/x.
function isGenericPath(pathname: string): boolean {
  return /^\/(?:home|index(?:\.html?)?|search)?\/?$/i.test(pathname);
}

interface PageExistsOutput {
  [key: string]: unknown;
  url: string;
  exists: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  signals: string[];
  status_code: number | null;
  final_url: string | null;
  redirected: boolean;
  title: string | null;
  content_length: number | null;
  checked_at: string;
}

registerCapability("page-exists", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' (URL to check) is required.");

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("URL must start with http:// or https://");
  }
  await validateUrl(url);

  // Clamp to [1s, 30s]. `?? default` alone would let 0 / NaN / negative
  // through, and safeFetch treats timeoutMs <= 0 / NaN as "no timeout at
  // all" — an unauthenticated caller must not be able to disable the bound.
  const rawTimeout = Number(input.timeout_ms);
  const timeout = Math.min(
    Math.max(Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 10000, 1000),
    30000,
  );
  const checkedAt = new Date().toISOString();
  const site = `website ${new URL(url).hostname}`;

  // Every branch fills in this skeleton — one place to add a field, and the
  // result shapes can't silently drift apart.
  const result = (
    fields: Partial<PageExistsOutput> & Pick<PageExistsOutput, "exists" | "confidence" | "reason">,
  ) => ({
    output: {
      url,
      signals: [] as string[],
      status_code: null,
      final_url: null,
      redirected: false,
      title: null,
      content_length: null,
      checked_at: checkedAt,
      ...fields,
    } as PageExistsOutput,
    provenance: { source: "http-content-check", fetched_at: checkedAt },
  });

  // safeFetch (not a raw fetch with redirect:"follow") re-validates every
  // redirect hop against validateUrl — closes the SSRF-via-redirect gap
  // that a plain fetch would leave open on user-supplied URLs. It also sets
  // Strale's honest page-read User-Agent, so none is passed here.
  let response: Response;
  try {
    response = await safeFetch(url, {
      method: "GET",
      timeoutMs: timeout,
      headers: {
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
  } catch (err: unknown) {
    // degraded-ok: an ENOTFOUND for the requested URL's own host is the resolver's answer that the name does not resolve, so no page under it can be fetched; it is returned as exists:false (reason dns_nxdomain), and every other failure throws.
    if (isCapabilityRefusal(err)) throw err;
    // SSRF refusals on redirect hops (url-validator's "restricted address"
    // errors, or safe-fetch's connect-time ESSRFBLOCKED, bare or as the
    // cause of undici's wrapper) are input-safety refusals, not network
    // weather: they fail the call exactly like the pre-flight validateUrl.
    const ssrf = ssrfBlocked(err);
    if (ssrf) throw ssrf;
    // The validator's own refusal on a redirect hop (a restricted address, a
    // scheme other than http(s), an invalid Location), recognised by its type:
    // matching the word "restricted" also caught a redirect loop, whose
    // message names its starting URL (promise-audit T1 follow-up 35).
    if (err instanceof UrlValidationError) throw err;
    // The requested host name does not resolve: no page under it can.
    if (isRequestedHostUnresolvable(err, new URL(url).hostname)) {
      return result({ exists: false, confidence: "high", reason: "dns_nxdomain" });
    }
    // A timeout, a network error or a redirect loop: the site did not
    // answer, which says nothing about whether the page exists.
    throw targetUnavailable(site, err);
  }

  const statusCode = response.status;
  const finalUrl = response.url || url;
  // Compare against the WHATWG-normalized input, not the raw string —
  // response.url is normalized (trailing slash added, fragment stripped),
  // so a raw comparison reports redirected:true on zero redirects for
  // any bare-origin or fragment-carrying input.
  let normalizedInput = url;
  try {
    normalizedInput = new URL(url).href;
  } catch {
    // validateUrl already accepted it; keep the raw string as fallback.
  }
  const redirected = finalUrl !== normalizedInput;
  const common = { status_code: statusCode, final_url: finalUrl, redirected };

  // ── Hard 404 / 410: unambiguous, no content inspection needed. ──
  if (statusCode === 404 || statusCode === 410) {
    return result({ ...common, exists: false, confidence: "high", reason: "hard_404" });
  }

  // ── None of the statuses below says whether the page exists, so each one
  //    fails the call, unbilled, rather than answering "unknown". ──
  if (statusCode < 200 || statusCode >= 300) {
    await discardBody(response, "page-exists: status without a verdict");
    // A block: the site refuses Strale (bot detection, auth wall, rate limit).
    assertNotBlockStatus(url, statusCode);
    // A server error on the caller's own site, or its request timeout (408).
    if (statusCode >= 500 || statusCode === 408) throw targetUnavailable(site, statusCode);
    // Any other 4xx is the site's own answer about that URL. The wording
    // names no other status: the breaker's fallback categoriser reads a
    // "404" or "410" anywhere in a message as an endpoint gone.
    if (statusCode >= 400) {
      throw new Error(
        `URL returned HTTP ${statusCode}. The site answered with a client error status, which does not say whether the page exists.`,
      );
    }
    // A 1xx, or a 3xx safeFetch did not follow (no usable Location header).
    // The status goes on `code`, not in the message, which the breaker's
    // fallback categoriser would read as a permanent move for a 301 or 308.
    throw new UpstreamUnavailableError(site, "URL did not answer with a page (a redirect without a usable location, or an informational status).", {
      code: `HTTP ${statusCode}`,
      retryable: false,
      targetFault: true,
    });
  }

  // ── Non-HTML 2xx (PDF, image, JSON): the resource exists; the HTML
  //    heuristics don't apply. Don't read the body. ──
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
    response.body?.cancel().catch((err) => logWarn("page-exists-body-cancel-failed", "non-HTML response body cancel failed (connection may pin until GC)", { err: String(err) }));
    return result({
      ...common,
      exists: true,
      confidence: "high",
      reason: "non_html_content",
    });
  }

  // ── 200-family HTML: run soft-404 heuristics on the content. ──
  // Truncating read from the shared authority (#432). This capability held
  // the third hand-rolled copy of the same loop, and it was written with
  // `getReader()` rather than `.text()`, so no accessor sweep could see it.
  // The scan window is a deliberate prefix, so `readTextTruncated` is the
  // same semantic with one implementation behind it.
  let rawWindow: string;
  try {
    rawWindow = await readTextTruncated(response, BODY_SCAN_LIMIT);
  } catch (err) {
    // The connection dropped or timed out mid-body: no verdict.
    throw targetUnavailable(site, err);
  }
  const bytesRead = Buffer.byteLength(rawWindow, "utf8");
  const title = extractTitle(rawWindow);
  const bodyText = visibleText(rawWindow);
  // Decoded bytes actually fetched, capped at BODY_SCAN_LIMIT — a lower
  // bound for large pages, exact for small ones. (The Content-Length
  // header measures *compressed* bytes and would misfire the thin check.)
  // The shared reader cuts at exactly the cap, so the clamp is now a
  // belt rather than a correction — kept because the output contract
  // documents the ceiling.
  const contentLength = Math.min(bytesRead, BODY_SCAN_LIMIT);

  const signals: string[] = [];

  const titleHasPhrase = title
    ? containsSoft404Phrase(title) || TITLE_404_PATTERN.test(title)
    : false;
  if (titleHasPhrase) signals.push("soft_404_title");

  const bodyHasPhrase = containsSoft404Phrase(bodyText);
  if (bodyHasPhrase) signals.push("soft_404_body");

  let redirectedToGeneric = false;
  if (redirected) {
    try {
      const requestedPath = new URL(normalizedInput).pathname;
      const finalPath = new URL(finalUrl).pathname;
      const requestedIsDeep = !isGenericPath(requestedPath);
      if (requestedIsDeep && isGenericPath(finalPath)) {
        redirectedToGeneric = true;
        signals.push("redirected_to_generic");
      }
    } catch {
      // Malformed URL for path comparison — skip the redirect signal,
      // don't fail the whole check over it.
    }
  }

  const isThin = bytesRead < THIN_CONTENT_BYTES;
  if (isThin) signals.push("thin_content");

  // ── Combine signals into exists/confidence/reason. ──
  // Rule, in priority order:
  //   1. Title carries a soft-404 phrase: strongest signal a page's own
  //      <title> was rewritten by the server for a removed/missing
  //      resource. exists:false, confidence:high.
  //   2. Body phrase + redirected-to-generic together: two independent
  //      signals agree. exists:false, confidence:medium.
  //   3. Body phrase alone: a phrase match outside the title is weaker
  //      (could be an unrelated "not found" in visible boilerplate) but
  //      still the strongest single indicator available. exists:false,
  //      confidence:medium.
  //   4. Redirected-to-generic alone (no phrase match): the deep path
  //      collapsed to home/search, which many sites do for delisted
  //      content — but plenty of sites also do it for legitimate
  //      canonicalization. exists:false, confidence:low.
  //   5. Thin content alone (no phrase, no redirect): a near-empty 200
  //      body is more often a placeholder/error shell than a real page,
  //      but it's the weakest signal here (e.g. some legitimate pages
  //      really are minimal). exists:false, confidence:low.
  //   6. No signals at all: clean 200 with real content. exists:true at
  //      confidence:medium, NOT high — "no negative evidence" is not
  //      proof of life: client-rendered SPAs serve the same 200 shell
  //      for removed listings, and these heuristics cannot see through
  //      that (see the SPA limitation in the manifest).
  let exists: boolean;
  let confidence: "high" | "medium" | "low";
  let reason: string;

  if (titleHasPhrase) {
    exists = false;
    confidence = "high";
    reason = "soft_404_title";
  } else if (bodyHasPhrase && redirectedToGeneric) {
    exists = false;
    confidence = "medium";
    reason = "soft_404_body_and_redirect";
  } else if (bodyHasPhrase) {
    exists = false;
    confidence = "medium";
    reason = "soft_404_body";
  } else if (redirectedToGeneric) {
    exists = false;
    confidence = "low";
    reason = "redirected_to_generic";
  } else if (isThin) {
    exists = false;
    confidence = "low";
    reason = "thin_content";
  } else {
    exists = true;
    confidence = "medium";
    reason = "ok";
  }

  return result({
    ...common,
    exists,
    confidence,
    reason,
    signals,
    title,
    content_length: contentLength,
  });
});
