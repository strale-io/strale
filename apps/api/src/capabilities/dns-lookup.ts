import { inputRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt, resolveCname } from "node:dns/promises";
import { dnsOrEmpty } from "../lib/upstream-result.js";

// F-0-006 Bucket C: pure DNS resolution on a user-supplied hostname. No
// HTTP fetch; no socket open to the resolved IP. `node:dns` does not
// follow URLs, so there is no private-IP exfiltration surface beyond the
// resolver's own traffic (outside our threat model). validateHost is
// unnecessary here.

registerCapability("dns-lookup", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.hostname as string) ?? "").trim().toLowerCase();
  if (!domain) {
    throw inputRefusal("'domain' is required. Provide a domain name (e.g. example.com).", "domain", "Send 'domain' as a DNS hostname such as example.com.");
  }

  // Strip protocol and path if provided
  const cleaned = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

  const results: Record<string, unknown> = { domain: cleaned };

  // Run all lookups in parallel. A record type the domain does not have comes
  // back empty; a resolver that could not answer throws, so a partial outage
  // never reads as "this domain has no MX/TXT records".
  const [a, aaaa, mx, ns, txt, cname] = await Promise.all([
    dnsOrEmpty(() => resolve4(cleaned), "DNS A query"),
    dnsOrEmpty(() => resolve6(cleaned), "DNS AAAA query"),
    dnsOrEmpty(() => resolveMx(cleaned), "DNS MX query"),
    dnsOrEmpty(() => resolveNs(cleaned), "DNS NS query"),
    dnsOrEmpty(() => resolveTxt(cleaned), "DNS TXT query"),
    dnsOrEmpty(() => resolveCname(cleaned), "DNS CNAME query"),
  ]);

  results.a_records = a;
  results.aaaa_records = aaaa;
  results.mx_records = mx
    .sort((a, b) => a.priority - b.priority)
    .map((r) => ({ priority: r.priority, exchange: r.exchange }));
  results.ns_records = ns;
  results.txt_records = txt.map((r) => r.join(""));
  results.cname_records = cname;

  // Check for common TXT records
  const allTxt = (results.txt_records as string[]).join(" ");
  results.has_spf = allTxt.includes("v=spf1");
  results.has_dmarc = false;

  // Check DMARC separately
  const dmarc = await dnsOrEmpty(() => resolveTxt(`_dmarc.${cleaned}`), "DNS DMARC TXT query");
  results.has_dmarc = dmarc.some((r) => r.join("").startsWith("v=DMARC1"));
  if (results.has_dmarc) {
    results.dmarc_record = dmarc.map((r) => r.join("")).find((r) => r.startsWith("v=DMARC1")) ?? null;
  }

  const hasAny = (results.a_records as string[]).length > 0 || (results.aaaa_records as string[]).length > 0;
  if (!hasAny) {
    throw new Error(`No DNS records found for "${cleaned}". Domain may not exist.`);
  }

  return {
    output: results,
    provenance: { source: "dns", fetched_at: new Date().toISOString() },
  };
});
