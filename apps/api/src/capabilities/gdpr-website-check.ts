import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("gdpr-website-check", async (input: CapabilityInput) => {
  let url = ((input.url as string) ?? (input.domain as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' (website URL) is required.");

  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StraleBot/1.0)" },
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);

  const html = await response.text();
  const htmlLower = html.toLowerCase();
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => { headers[k] = v; });

  // Check for cookie consent mechanisms
  const cookieConsentPatterns = [
    "cookie-consent", "cookie-banner", "cookie-notice", "cookieconsent",
    "gdpr-consent", "consent-banner", "onetrust", "cookiebot",
    "trustarc", "didomi", "quantcast", "osano", "termly",
    "cookie_consent", "cc-banner", "js-cookie-consent",
  ];
  const hasCookieConsent = cookieConsentPatterns.some(p => htmlLower.includes(p));

  // Check for privacy policy link
  const privacyPatterns = [
    /privacy[- ]?policy/i, /datenschutz/i, /politique[- ]de[- ]confidentialit/i,
    /integritetspolicy/i, /personuppgifts/i,
  ];
  const hasPrivacyPolicy = privacyPatterns.some(p => p.test(html));

  // Check for cookie policy link
  const hasCookiePolicy = /cookie[- ]?policy/i.test(html);

  // Check for terms of service
  const hasTerms = /terms[- ]?(of|and)[- ]?(service|use|conditions)/i.test(html);

  // Check headers
  const hasHSTS = !!headers["strict-transport-security"];
  const hasCSP = !!headers["content-security-policy"];
  const setCookies = headers["set-cookie"] ?? "";

  // Analyze cookies for compliance
  const cookieIssues: string[] = [];
  if (setCookies) {
    if (!setCookies.toLowerCase().includes("secure")) cookieIssues.push("Cookies set without Secure flag");
    if (!setCookies.toLowerCase().includes("samesite")) cookieIssues.push("Cookies set without SameSite attribute");
  }

  // Check for tracking scripts
  const trackers = {
    google_analytics: /google-analytics\.com|gtag|googletagmanager/i.test(html),
    facebook_pixel: /facebook\.com\/tr|fbevents|fbq\(/i.test(html),
    hotjar: /hotjar\.com/i.test(html),
    mixpanel: /mixpanel\.com/i.test(html),
    segment: /segment\.com\/analytics|analytics\.js/i.test(html),
    linkedin_insight: /snap\.licdn\.com|linkedin\.com\/px/i.test(html),
    tiktok_pixel: /analytics\.tiktok\.com/i.test(html),
  };
  const trackerCount = Object.values(trackers).filter(Boolean).length;

  // Score (simplified)
  let score = 100;
  const findings: string[] = [];

  if (!hasCookieConsent) { score -= 25; findings.push("No cookie consent mechanism detected"); }
  if (!hasPrivacyPolicy) { score -= 25; findings.push("No privacy policy link found"); }
  if (!hasHSTS) { score -= 10; findings.push("Missing HSTS header"); }
  if (trackerCount > 0 && !hasCookieConsent) { score -= 15; findings.push(`${trackerCount} tracking script(s) found without cookie consent`); }
  if (cookieIssues.length > 0) { score -= 10; findings.push(...cookieIssues); }
  if (!hasCookiePolicy && hasCookieConsent) { score -= 5; findings.push("Cookie consent present but no dedicated cookie policy"); }

  return {
    output: {
      url: response.url,
      gdpr_score: Math.max(0, score),
      grade: score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F",
      has_cookie_consent: hasCookieConsent,
      has_privacy_policy: hasPrivacyPolicy,
      has_cookie_policy: hasCookiePolicy,
      has_terms_of_service: hasTerms,
      tracking_scripts: trackers,
      tracker_count: trackerCount,
      security_headers: { hsts: hasHSTS, csp: hasCSP },
      cookie_issues: cookieIssues,
      findings,
      uses_https: response.url.startsWith("https://"),
    },
    provenance: { source: "http-analysis", fetched_at: new Date().toISOString() },
  };
});
