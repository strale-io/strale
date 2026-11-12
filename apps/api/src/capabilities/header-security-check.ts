import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { UrlValidationError, validateUrl } from "../lib/url-validator.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { isBlockStatus, siteAccessRefusal } from "../lib/site-access.js";
import { ssrfBlocked, targetUnavailable } from "../lib/upstream-result.js";

const SECURITY_HEADERS: Array<{
  header: string;
  severity: "high" | "medium" | "low";
  recommendation: string;
  deprecated?: boolean;
}> = [
  { header: "strict-transport-security", severity: "high", recommendation: "Add: Strict-Transport-Security: max-age=31536000; includeSubDomains" },
  { header: "content-security-policy", severity: "high", recommendation: "Add Content-Security-Policy to prevent XSS and injection attacks" },
  { header: "x-frame-options", severity: "medium", recommendation: "Add: X-Frame-Options: DENY (or SAMEORIGIN) to prevent clickjacking" },
  { header: "x-content-type-options", severity: "medium", recommendation: "Add: X-Content-Type-Options: nosniff to prevent MIME sniffing" },
  { header: "referrer-policy", severity: "medium", recommendation: "Add: Referrer-Policy: strict-origin-when-cross-origin" },
  { header: "permissions-policy", severity: "medium", recommendation: "Add Permissions-Policy to restrict browser features (camera, microphone, etc.)" },
  { header: "x-xss-protection", severity: "low", recommendation: "X-XSS-Protection is deprecated but consider: X-XSS-Protection: 0 (rely on CSP instead)", deprecated: true },
];

registerCapability("header-security-check", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);

  const site = new URL(fullUrl).hostname;
  let res: Response;
  try {
    res = await safeFetch(fullUrl, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
      // safeFetch follows up to 3 hops with per-hop re-validation
    });
  } catch (err: unknown) {
    // Strale's own refusals (robots.txt, a challenge page, the ToS blocklist)
    // and SSRF refusals on a redirect hop fail the call as they stand. Any
    // other failure is the site not answering: it served no headers to grade,
    // and it is the caller's site, so it does not count against this
    // capability (promise-audit T1 follow-up 30).
    if (isCapabilityRefusal(err)) throw err;
    const ssrf = ssrfBlocked(err);
    if (ssrf) throw ssrf;
    // The validator refuses a redirect hop to a restricted address with its
    // own class; matching the word "restricted" would also catch a host name.
    if (err instanceof UrlValidationError) throw err;
    throw targetUnavailable(site, err);
  }

  // A 401, 403, 407 or 429 is the site refusing Strale (DEC-20261023-A: stop
  // at the block), and the headers on a login wall, WAF or rate-limit page are
  // not the site's policy, so it is refused unbilled instead of graded
  // (follow-up 30). A 429 is refused like the other block statuses, as every
  // other page fetcher does, not offered back as retryable (follow-up 38). A
  // 5xx or 408 means the site did not serve its page; grading those sold an F
  // for an outage (promise-audit T1 wave 6). Any other answer, a 404
  // included, is the site's own response and is graded as it stands.
  if (isBlockStatus(res.status)) {
    await discardBody(res, "header-security-check: refused");
    throw siteAccessRefusal(fullUrl, { kind: "http", status: res.status });
  }
  if (res.status >= 500 || res.status === 408) {
    await discardBody(res, "header-security-check: site unavailable");
    throw targetUnavailable(site, res.status);
  }

  const present: Array<{ header: string; value: string; status: string }> = [];
  const missing: Array<{ header: string; severity: string; recommendation: string }> = [];

  for (const check of SECURITY_HEADERS) {
    const value = res.headers.get(check.header);
    if (value) {
      present.push({
        header: check.header,
        value: value.slice(0, 200),
        status: check.deprecated ? "present (deprecated header)" : "present",
      });
    } else if (!check.deprecated) {
      missing.push({ header: check.header, severity: check.severity, recommendation: check.recommendation });
    }
  }

  // Check CORS headers
  const corsHeaders = ["access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers"];
  const corsPresent: Record<string, string> = {};
  for (const h of corsHeaders) {
    const val = res.headers.get(h);
    if (val) corsPresent[h] = val;
  }

  // Calculate score
  const highMissing = missing.filter((m) => m.severity === "high").length;
  const mediumMissing = missing.filter((m) => m.severity === "medium").length;
  const score = Math.max(0, 100 - (highMissing * 25) - (mediumMissing * 10));

  // Grade
  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 60) grade = "C";
  else if (score >= 40) grade = "D";
  else grade = "F";

  return {
    output: {
      url: fullUrl,
      score,
      grade,
      present,
      missing,
      cors: Object.keys(corsPresent).length > 0 ? corsPresent : null,
      server: res.headers.get("server") ?? null,
      response_status: res.status,
    },
    provenance: { source: "http-headers", fetched_at: new Date().toISOString() },
  };
});
