import { registerCapability, type CapabilityInput } from "./index.js";
import dns from "node:dns/promises";
import { dnsOrEmpty, isConnectionFailure, targetUnavailable } from "../lib/upstream-result.js";
import { UrlValidationError, validateHost } from "../lib/url-validator.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { SiteAccessRefusedError, SourceBlockedError, isChallengeResponse, siteAccessRefusal } from "../lib/site-access.js";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** EAI_AGAIN, bare or as a fetch failure's cause: Strale's own resolver could not answer for now. */
function isResolverRetry(err: unknown): boolean {
  return [err, (err as { cause?: unknown } | null)?.cause].some(
    (e) => (e as { code?: unknown } | null)?.code === "EAI_AGAIN",
  );
}

registerCapability("domain-reputation", async (input: CapabilityInput) => {
  let domain = ((input.domain as string) ?? (input.url as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!domain) throw new Error("'domain' (domain name) is required.");

  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  await validateHost(domain);

  const checks: Record<string, unknown> = {};
  const issues: string[] = [];
  let score = 100;

  // DNS checks go through dnsOrEmpty: a record the domain does not have reads
  // as absent (and is penalised as before), while a resolver that could not
  // answer throws (unbilled, retried) instead of costing the domain points.

  // 1. DNS resolution check
  const addrs = await dnsOrEmpty(() => dns.resolve4(domain), "DNS A query");
  if (addrs.length > 0) {
    checks.resolves = true;
    checks.ip_addresses = addrs;
  } else {
    checks.resolves = false;
    issues.push("Domain does not resolve to any IP address");
    score -= 30;
  }

  // 2. MX record check
  const mx = await dnsOrEmpty(() => dns.resolveMx(domain), "DNS MX query");
  checks.has_mx = mx.length > 0;
  checks.mx_count = mx.length;

  // 3. SPF check. A domain with no TXT records at all keeps its historical
  // treatment (has_spf and has_dmarc false, no DMARC lookup, no penalty);
  // changing that scoring is out of scope for the swallowed-failure fix.
  const txt = await dnsOrEmpty(() => dns.resolveTxt(domain), "DNS TXT query");
  if (txt.length > 0) {
    const flat = txt.map(t => t.join(""));
    checks.has_spf = flat.some(t => t.startsWith("v=spf1"));
    checks.has_dmarc = false;
    // Also check _dmarc subdomain
    const dmarc = await dnsOrEmpty(() => dns.resolveTxt(`_dmarc.${domain}`), "DNS DMARC TXT query");
    checks.has_dmarc = dmarc.some(t => t.join("").startsWith("v=DMARC1"));
    if (!checks.has_spf) { issues.push("No SPF record"); score -= 10; }
    if (!checks.has_dmarc) { issues.push("No DMARC record"); score -= 10; }
  } else {
    checks.has_spf = false;
    checks.has_dmarc = false;
  }

  // 4. HTTPS check. A HEAD probe reads only the status and headers, so it is
  // an availability probe (safe-fetch.ts, H6 round 2): robots.txt does not
  // govern it, and a domain whose HTTPS is broken is graded as broken rather
  // than refused because its robots.txt could not be read over that same
  // HTTPS. An anti-bot challenge marked by cf-mitigated is the one answer that
  // is refused, unbilled: its headers belong to the interstitial, not the
  // domain's site (a HEAD carries no body, so a body-only challenge is graded
  // on the interstitial's headers).
  //
  // Only the domain's own HTTPS is graded (promise-audit T1 follow-up 23): a
  // failure at its network or TLS layer ("HTTPS connection failed") or no
  // answer within the probe's 8 s ("HTTPS did not answer within 8 seconds";
  // undici's own connect timeout is 10 s, so a port that drops connections
  // ends here, and a retry would not change it). So the domain is asked
  // first on its own, with no redirect followed. If it answers with a
  // redirect, its HTTPS works; the redirect is followed (two more hops) only
  // to read the site's headers, and a hop that then does not answer leaves
  // the grade on the redirect. Strale's own refusals, a URL Strale will not
  // follow and a temporary failure of Strale's own resolver say nothing about
  // the domain's HTTPS and are thrown, unbilled.
  const httpsUrl = `https://${domain}/`;
  const probeSignal = AbortSignal.timeout(8000);
  const probe = (url: string, maxRedirects: number) =>
    // F-0-006: user-supplied domain → safeFetch validates + re-checks redirects.
    safeFetch(url, { method: "HEAD", purpose: "availability_probe", signal: probeSignal, maxRedirects, returnOnRedirectCap: true });
  /** The issue text when the failure is the probed host's own; otherwise throws the failure, unbilled. */
  const ownFailure = (err: unknown, url: string): string => {
    if (err instanceof SiteAccessRefusedError || err instanceof SourceBlockedError) throw err;
    if (isResolverRetry(err)) throw targetUnavailable(url, err);
    if ((err as { name?: unknown } | null)?.name === "TimeoutError") return "HTTPS did not answer within 8 seconds";
    if (isConnectionFailure(err)) return "HTTPS connection failed";
    throw targetUnavailable(url, err);
  };

  let resp: Response | null = null;
  try {
    resp = await probe(httpsUrl, 0);
  } catch (err) {
    // degraded-ok: a connection or TLS failure of the domain itself, or no answer in 8 s, is this check's finding, https_works false; ownFailure rethrows anything else, unbilled.
    const issue = ownFailure(err, httpsUrl);
    checks.https_works = false;
    issues.push(issue);
    score -= 20;
  }

  const location = resp && REDIRECT_STATUSES.has(resp.status) ? resp.headers.get("location") : null;
  if (resp && location) {
    let next: string | null = null;
    try {
      next = new URL(location, httpsUrl).toString();
    } catch {
      // degraded-ok: a Location that is not a URL; the domain answered, so it is graded on that redirect.
    }
    if (next) {
      try {
        const followed = await probe(next, 2);
        await discardBody(resp, "domain-reputation redirect");
        resp = followed;
      } catch (err) {
        // degraded-ok: the domain's own HTTPS answered with this redirect; a hop that does not answer leaves the grade on it, and ownFailure rethrows anything else.
        if (err instanceof UrlValidationError) {
          throw new UrlValidationError(`${domain} redirected to a URL Strale did not follow. ${err.message}`);
        }
        ownFailure(err, next);
      }
    }
  }

  if (resp) {
    if (await isChallengeResponse(resp)) {
      await discardBody(resp, "anti-bot challenge page");
      throw siteAccessRefusal(resp.url || httpsUrl, { kind: "challenge" });
    }
    await discardBody(resp, "domain-reputation HEAD probe");
    checks.https_works = true;
    checks.https_status = resp.status;

    // Check security headers
    const hsts = resp.headers.get("strict-transport-security");
    const csp = resp.headers.get("content-security-policy");
    const xfo = resp.headers.get("x-frame-options");
    const xcto = resp.headers.get("x-content-type-options");

    checks.has_hsts = !!hsts;
    checks.has_csp = !!csp;
    checks.has_xfo = !!xfo;
    checks.has_xcto = !!xcto;

    if (!hsts) { issues.push("No HSTS header"); score -= 5; }
    if (!xcto) { issues.push("No X-Content-Type-Options header"); score -= 3; }
  }

  // 5. Domain age heuristic (check WHOIS-like indicators)
  // Check if domain is in common TLD
  const tld = domain.split(".").pop() ?? "";
  const suspiciousTlds = ["tk", "ml", "ga", "cf", "gq", "buzz", "top", "xyz", "club", "work", "click"];
  if (suspiciousTlds.includes(tld)) {
    issues.push(`Potentially suspicious TLD: .${tld}`);
    score -= 10;
  }

  // 6. Check for suspicious patterns
  const parts = domain.split(".");
  const baseDomain = parts.slice(0, -1).join(".");
  if (baseDomain.length > 30) { issues.push("Unusually long domain name"); score -= 5; }
  if (/\d{4,}/.test(baseDomain)) { issues.push("Domain contains long numeric sequence"); score -= 5; }
  if (baseDomain.split("-").length > 3) { issues.push("Domain contains many hyphens"); score -= 5; }

  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

  return {
    output: {
      domain,
      reputation_score: Math.max(0, score),
      grade,
      checks,
      issues,
      issue_count: issues.length,
    },
    provenance: { source: "dns-and-http-analysis", fetched_at: new Date().toISOString() },
  };
});
