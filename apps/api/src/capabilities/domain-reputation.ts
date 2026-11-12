import { registerCapability, type CapabilityInput } from "./index.js";
import dns from "node:dns/promises";
import { dnsOrEmpty, isConnectionFailure, targetUnavailable } from "../lib/upstream-result.js";
import { validateHost } from "../lib/url-validator.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { SiteAccessRefusedError, SourceBlockedError, isChallengeResponse, siteAccessRefusal } from "../lib/site-access.js";

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
  // on the interstitial's headers). Only a failure at the network or TLS layer
  // of the domain itself is graded as "HTTPS connection failed"; Strale's own
  // refusals, a refused redirect target, a redirect loop and the probe's own
  // timeout say nothing about the domain's HTTPS and are thrown, unbilled
  // (promise-audit T1 follow-up 23).
  const httpsUrl = `https://${domain}/`;
  let resp: Response | null = null;
  try {
    // F-0-006: user-supplied domain → safeFetch validates + re-checks redirects.
    resp = await safeFetch(httpsUrl, {
      method: "HEAD",
      purpose: "availability_probe",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    // degraded-ok: a connection or TLS failure of the domain itself is this check's finding, https_works false; anything else is rethrown, unbilled.
    if (err instanceof SiteAccessRefusedError || err instanceof SourceBlockedError) throw err;
    if (!isConnectionFailure(err)) throw targetUnavailable(httpsUrl, err);
    checks.https_works = false;
    issues.push("HTTPS connection failed");
    score -= 20;
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
