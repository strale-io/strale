import { registerCapability, type CapabilityInput } from "./index.js";
import {
  fetchRenderedHtml,
  htmlToText,
} from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

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

  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname;

  // Step 1: HTTP fetch to capture Set-Cookie headers
  const cookies: CookieInfo[] = [];
  try {
    const httpResponse = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    // Parse Set-Cookie headers
    const setCookieHeaders = httpResponse.headers.getSetCookie?.() ?? [];
    for (const header of setCookieHeaders) {
      cookies.push(parseSetCookieHeader(header));
    }
  } catch {
    // HTTP fetch failed — we'll still try Browserless
  }

  // Step 2: Render with Browserless and analyze with Claude
  const html = await fetchRenderedHtml(url);
  const text = htmlToText(html);

  if (text.length < 100) {
    throw new Error(`Could not load page at ${url}.`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
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

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);

  let trackingScripts: Array<{ name: string; detected: boolean }> = [];
  let consentBannerDetected = false;
  let consentBannerText: string | null = null;
  let thirdPartyDomains: string[] = [];
  let potentialIssues: string[] = [];

  if (jsonMatch) {
    try {
      const analysis = JSON.parse(jsonMatch[0]);
      trackingScripts = (analysis.tracking_scripts ?? []).filter(
        (s: { detected: boolean }) => s.detected,
      );
      consentBannerDetected = analysis.consent_banner_detected ?? false;
      consentBannerText = analysis.consent_banner_text ?? null;
      thirdPartyDomains = analysis.third_party_domains_detected ?? [];
      potentialIssues = analysis.potential_issues ?? [];
    } catch {
      // Parsing failed — continue with defaults
    }
  }

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
  if (hasTrackingCookies && !consentBannerDetected && !potentialIssues.some((i) => i.toLowerCase().includes("consent"))) {
    potentialIssues.push("Tracking cookies detected but no cookie consent banner found.");
  }

  return {
    output: {
      url,
      cookies,
      total_cookies: cookies.length,
      first_party_count: firstPartyCookies.length,
      third_party_count: thirdPartyCookies.length,
      tracking_scripts: trackingScripts,
      consent_banner_detected: consentBannerDetected,
      consent_banner_text: consentBannerText,
      third_party_domains: thirdPartyDomains,
      potential_issues: potentialIssues,
    },
    provenance: { source: domain, fetched_at: new Date().toISOString() },
  };
});
