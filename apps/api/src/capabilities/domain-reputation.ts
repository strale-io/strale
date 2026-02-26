import { registerCapability, type CapabilityInput } from "./index.js";
import { promises as dns } from "dns";

registerCapability("domain-reputation", async (input: CapabilityInput) => {
  let domain = ((input.domain as string) ?? (input.url as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!domain) throw new Error("'domain' (domain name) is required.");

  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

  const checks: Record<string, unknown> = {};
  const issues: string[] = [];
  let score = 100;

  // 1. DNS resolution check
  try {
    const addrs = await dns.resolve4(domain);
    checks.resolves = true;
    checks.ip_addresses = addrs;
  } catch {
    checks.resolves = false;
    issues.push("Domain does not resolve to any IP address");
    score -= 30;
  }

  // 2. MX record check
  try {
    const mx = await dns.resolveMx(domain);
    checks.has_mx = mx.length > 0;
    checks.mx_count = mx.length;
  } catch {
    checks.has_mx = false;
    checks.mx_count = 0;
  }

  // 3. SPF check
  try {
    const txt = await dns.resolveTxt(domain);
    const flat = txt.map(t => t.join(""));
    checks.has_spf = flat.some(t => t.startsWith("v=spf1"));
    checks.has_dmarc = false;
    // Also check _dmarc subdomain
    try {
      const dmarc = await dns.resolveTxt(`_dmarc.${domain}`);
      checks.has_dmarc = dmarc.some(t => t.join("").startsWith("v=DMARC1"));
    } catch { /* no DMARC */ }
    if (!checks.has_spf) { issues.push("No SPF record"); score -= 10; }
    if (!checks.has_dmarc) { issues.push("No DMARC record"); score -= 10; }
  } catch {
    checks.has_spf = false;
    checks.has_dmarc = false;
  }

  // 4. HTTPS check
  try {
    const resp = await fetch(`https://${domain}/`, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
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
  } catch {
    checks.https_works = false;
    issues.push("HTTPS connection failed");
    score -= 20;
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
