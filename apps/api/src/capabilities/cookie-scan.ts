import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { assertRobotsAllowed } from "../lib/robots-txt.js";
import { STRALE_USER_AGENT, assertNotBlockStatus } from "../lib/site-access.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { extractJsonObject } from "./lib/llm-json.js";
import { assertTargetAllowed } from "./lib/tos-blocklist.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import type Anthropic from "@anthropic-ai/sdk";
import { messageText } from "../lib/llm-response.js";
import { fetchUnavailable, UpstreamUnavailableError } from "../lib/upstream-result.js";

/** Named in unavailable_sources when the model's page analysis is unusable. */
const PAGE_ANALYSIS = "page analysis";

/**
 * The caller's own site failed: its 5xx, a timeout or a network error. Still
 * unbilled and retryable, but worded as the target's failure ("URL returned
 * HTTP 5", "URL did not answer"), which the breaker's USER_INPUT_ERROR_PATTERNS
 * in lib/circuit-breaker.ts recognise, as for url-to-markdown: one caller's
 * broken site retried three times must not suspend cookie-scan for everyone
 * (PR #1015 review). Anything else passes through as fetchUnavailable leaves it.
 */
function targetUnavailable(site: string, failure: number | unknown): Error {
  if (typeof failure === "number") {
    return new UpstreamUnavailableError(site, `URL returned HTTP ${failure}, a server error on the site itself; retry later.`, {
      code: `HTTP ${failure}`,
      retryable: true,
    });
  }
  const err = fetchUnavailable(site, failure);
  if (!(err instanceof UpstreamUnavailableError) || !err.retryable) return err;
  return new UpstreamUnavailableError(site, `URL did not answer (${err.code ?? "network error"}); retry later.`, {
    code: err.code,
    retryable: true,
    cause: failure,
  });
}

// ─── Cookie scan — Browserless + HTTP fetch + Claude ─────────────────────────

// Known cookie name patterns for categorization
const NECESSARY_PATTERNS = [
  /^__host-/i, /^__secure-/i, /^sess/i, /^csrf/i, /^xsrf/i,
  /^_csrf/i, /^connect\.sid$/i, /^phpsessid$/i, /^jsessionid$/i,
  /^asp\.net_sessionid$/i, /^laravel_session$/i,
];

const ANALYTICS_PATTERNS = [
  /^_ga$/i, /^_ga_/i, /^_gid$/i, /^_gat/i,
  /^__utm[a-z]$/i, /^_hjid$/i, /^_hjSession/i, /^_hjAbsoluteSessionInProgress$/i,
  /^_hj[a-z]/i, /^mp_/i, /^ajs_/i, /^amplitude/i,
  /^_pk_/i, /^_clck$/i, /^_clsk$/i,
];

const MARKETING_PATTERNS = [
  /^_fbp$/i, /^_fbc$/i, /^fr$/i, /^IDE$/i, /^NID$/i,
  /^_gcl_/i, /^_pin_/i, /^_ttp$/i, /^_tt_/i,
  /^li_sugr$/i, /^UserMatchHistory$/i, /^bcookie$/i,
  /^_uetsid$/i, /^_uetvid$/i, /^_rdt_uuid$/i,
];

interface CookieInfo {
  name: string;
  domain: string | null;
  path: string | null;
  expires: string | null;
  secure: boolean;
  httponly: boolean;
  samesite: string | null;
  category: "necessary" | "analytics" | "marketing" | "functional";
  known_service: string | null;
}

// Known service detection by cookie name
function detectService(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.startsWith("_ga") || lower.startsWith("_gid") || lower.startsWith("_gat") || lower.startsWith("__utm")) return "Google Analytics";
  if (lower.startsWith("_hj")) return "Hotjar";
  if (lower.startsWith("_fbp") || lower.startsWith("_fbc") || lower === "fr") return "Facebook/Meta Pixel";
  if (lower === "ide" || lower === "nid") return "Google Ads";
  if (lower.startsWith("_gcl_")) return "Google Ads";
  if (lower.startsWith("mp_")) return "Mixpanel";
  if (lower.startsWith("ajs_")) return "Segment";
  if (lower.startsWith("_pk_")) return "Matomo/Piwik";
  if (lower.startsWith("_clck") || lower.startsWith("_clsk")) return "Microsoft Clarity";
  if (lower.startsWith("_pin_")) return "Pinterest";
  if (lower.startsWith("_tt_") || lower.startsWith("_ttp")) return "TikTok";
  if (lower === "li_sugr" || lower === "usermatchhistory" || lower === "bcookie") return "LinkedIn";
  if (lower.startsWith("_uetsid") || lower.startsWith("_uetvid")) return "Microsoft Ads";
  if (lower.startsWith("_rdt_uuid")) return "Reddit";
  if (lower.startsWith("amplitude")) return "Amplitude";
  return null;
}

function categorizeCookie(name: string): CookieInfo["category"] {
  for (const pattern of NECESSARY_PATTERNS) {
    if (pattern.test(name)) return "necessary";
  }
  for (const pattern of ANALYTICS_PATTERNS) {
    if (pattern.test(name)) return "analytics";
  }
  for (const pattern of MARKETING_PATTERNS) {
    if (pattern.test(name)) return "marketing";
  }
  return "functional";
}

function parseSetCookieHeader(header: string): CookieInfo {
  const parts = header.split(";").map((p) => p.trim());
  const [nameValue, ...attrs] = parts;
  const eqIdx = nameValue.indexOf("=");
  const name = eqIdx > 0 ? nameValue.slice(0, eqIdx).trim() : nameValue.trim();

  let domain: string | null = null;
  let path: string | null = null;
  let expires: string | null = null;
  let secure = false;
  let httponly = false;
  let samesite: string | null = null;

  for (const attr of attrs) {
    const lowerAttr = attr.toLowerCase();
    if (lowerAttr.startsWith("domain=")) {
      domain = attr.slice(7).trim();
    } else if (lowerAttr.startsWith("path=")) {
      path = attr.slice(5).trim();
    } else if (lowerAttr.startsWith("expires=")) {
      expires = attr.slice(8).trim();
    } else if (lowerAttr.startsWith("max-age=")) {
      const maxAge = parseInt(attr.slice(8).trim(), 10);
      if (!isNaN(maxAge)) {
        expires = `max-age: ${maxAge}s`;
      }
    } else if (lowerAttr === "secure") {
      secure = true;
    } else if (lowerAttr === "httponly") {
      httponly = true;
    } else if (lowerAttr.startsWith("samesite=")) {
      samesite = attr.slice(9).trim();
    }
  }

  return {
    name,
    domain,
    path,
    expires,
    secure,
    httponly,
    samesite,
    category: categorizeCookie(name),
    known_service: detectService(name),
  };
}

registerCapability("cookie-scan", async (input: CapabilityInput) => {
  const rawUrl = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!rawUrl) {
    throw new Error("'url' is required. Provide a website URL to scan for cookies.");
  }

  // Normalize URL
  let url = rawUrl;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  // Per-source ToS policy gates every arbitrary-URL fetch path (P1 review, 2026-08-12).
  assertTargetAllowed(url);
  // DEC-20261023-A: robots.txt before either request.
  await assertRobotsAllowed(url);

  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname;

  // Step 1: HTTP fetch to capture Set-Cookie headers. This request is the
  // only source of the cookie inventory, so when it fails (timeout, network
  // error, 5xx) the call fails unbilled: an empty list would claim the site
  // sets no cookies (2026-11-06 swallowed-upstream-failures audit, row 9).
  const site = `website ${domain}`;
  const cookies: CookieInfo[] = [];
  let httpResponse: Response;
  try {
    httpResponse = await safeFetch(url, {
      method: "GET",
      // safeFetch follows up to 3 hops with per-hop re-validation
      signal: AbortSignal.timeout(15000),
      headers: {
        // DEC-20261023-A: honest identification. This was a spoofed
        // desktop-Chrome user agent until 2026-10-24.
        "User-Agent": STRALE_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (err) {
    // Refusals, URL validation and Strale's own states pass through unchanged.
    throw targetUnavailable(site, err);
  }
  // Only the headers are read here; release the body (#428).
  await discardBody(httpResponse, "cookie-scan: header-only fetch");
  // A block ends the scan: the render below would be the same request
  // through another route, which the data-access rule forbids.
  assertNotBlockStatus(url, httpResponse.status);
  if (httpResponse.status >= 500) throw targetUnavailable(site, httpResponse.status);

  // Parse Set-Cookie headers
  const setCookieHeaders = httpResponse.headers.getSetCookie?.() ?? [];
  for (const header of setCookieHeaders) {
    cookies.push(parseSetCookieHeader(header));
  }

  // Step 2: Render with Browserless and analyze with Claude
  const html = await fetchRenderedHtml(url);
  const text = htmlToText(html);

  if (text.length < 100) {
    throw new Error(`Could not load page at ${url}.`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = createAnthropicClient({ apiKey });
  const r = await client.messages.create({
    model: MODELS.capability_default.id,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Analyze this webpage source for cookie/tracking related elements. Look for tracking scripts, cookie consent banners, and third-party domains.

URL: ${url}

Page text (first 10000 chars):
${text.slice(0, 10000)}

Raw HTML snippet (first 5000 chars for script detection):
${html.slice(0, 5000)}

Return ONLY valid JSON:
{
  "tracking_scripts": [
    {"name": "Google Analytics", "detected": true/false},
    {"name": "Facebook Pixel", "detected": true/false},
    {"name": "Hotjar", "detected": true/false},
    {"name": "Mixpanel", "detected": true/false},
    {"name": "Segment", "detected": true/false},
    {"name": "Google Tag Manager", "detected": true/false},
    {"name": "LinkedIn Insight Tag", "detected": true/false},
    {"name": "TikTok Pixel", "detected": true/false},
    {"name": "Microsoft Clarity", "detected": true/false}
  ],
  "consent_banner_detected": true/false,
  "consent_banner_text": "text of the consent banner if found, or null",
  "third_party_domains_detected": ["list of third-party domains found in scripts/iframes"],
  "potential_issues": ["list of potential compliance issues found"]
}

Only include tracking scripts where detected is true. For potential_issues, consider: missing consent banner, tracking before consent, third-party cookies without disclosure, etc.`,
      },
    ],
  });

  // An empty response, a model safety decline on this third-party page, or a
  // reply that is not the requested JSON leaves the analysis unknown. The
  // cookie inventory above still stands, so the analysis fields read null and
  // "page analysis" is named in unavailable_sources; they never default to
  // "no tracking scripts" and "no consent banner" (audit row 9).
  let responseText = "";
  try {
    responseText = messageText(r).trim();
  } catch (err) {
    // degraded-ok: a model decline leaves the analysis fields null and names the page analysis in unavailable_sources; the cookie inventory is unaffected.
    if (!isCapabilityRefusal(err)) throw err;
  }
  // Real brace-matching, not the greedy object-capture regex: an unbalanced
  // (truncated) response yields null.
  const analysis = readAnalysis(extractJsonObject(responseText));

  // Count first-party vs third-party cookies
  const firstPartyCookies = cookies.filter(
    (c) => !c.domain || c.domain === domain || c.domain === `.${domain}`,
  );
  const thirdPartyCookies = cookies.filter(
    (c) => c.domain && c.domain !== domain && c.domain !== `.${domain}`,
  );

  // Add issue if no consent banner detected but tracking cookies exist
  const hasTrackingCookies = cookies.some(
    (c) => c.category === "analytics" || c.category === "marketing",
  );
  // Only a banner the analysis looked for and did not find is reported
  // missing; an analysis that did not say (null) adds nothing.
  const potentialIssues = analysis ? [...analysis.potential_issues] : null;
  if (
    analysis && potentialIssues && hasTrackingCookies && analysis.consent_banner_detected === false &&
    !potentialIssues.some((i) => i.toLowerCase().includes("consent"))
  ) {
    potentialIssues.push("Tracking cookies detected but no cookie consent banner found.");
  }

  return {
    output: {
      url,
      cookies,
      total_cookies: cookies.length,
      first_party_count: firstPartyCookies.length,
      third_party_count: thirdPartyCookies.length,
      tracking_scripts: analysis?.tracking_scripts ?? null,
      consent_banner_detected: analysis?.consent_banner_detected ?? null,
      consent_banner_text: analysis?.consent_banner_text ?? null,
      third_party_domains: analysis?.third_party_domains ?? null,
      potential_issues: potentialIssues,
      ...(analysis ? {} : { unavailable_sources: [PAGE_ANALYSIS] }),
    },
    provenance: { source: domain, fetched_at: new Date().toISOString() },
  };
});

interface PageAnalysis {
  tracking_scripts: Array<{ name: string; detected: boolean }>;
  /** Null when the analysis did not say: unknown, never "no banner". */
  consent_banner_detected: boolean | null;
  consent_banner_text: string | null;
  third_party_domains: string[];
  potential_issues: string[];
}

/** A model's yes/no: a boolean or its string form; undefined when it is neither. */
function readFlag(v: unknown): boolean | undefined {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return undefined;
}

/**
 * The model's analysis, or null when the reply does not carry one in the
 * requested shape. A missing list reads as empty, as before; a missing
 * consent_banner_detected reads null (unknown); a field of the wrong type
 * means the reply is not the analysis that was asked for.
 */
function readAnalysis(raw: unknown): PageAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const list = (v: unknown): unknown[] | null => (v === undefined || v === null ? [] : Array.isArray(v) ? v : null);
  const scripts = list(a.tracking_scripts);
  const domains = list(a.third_party_domains_detected);
  const issues = list(a.potential_issues);
  const bannerRaw = a.consent_banner_detected;
  const banner = bannerRaw === undefined || bannerRaw === null ? null : readFlag(bannerRaw);
  const bannerText = a.consent_banner_text ?? null;
  if (!scripts || !domains || !issues || banner === undefined) return null;
  if (bannerText !== null && typeof bannerText !== "string") return null;
  return {
    tracking_scripts: scripts
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && readFlag((x as { detected?: unknown }).detected) === true)
      .map((x) => ({ ...x, detected: true }) as { name: string; detected: boolean }),
    consent_banner_detected: banner,
    consent_banner_text: bannerText,
    third_party_domains: domains.filter((d): d is string => typeof d === "string"),
    potential_issues: issues.filter((i): i is string => typeof i === "string"),
  };
}
