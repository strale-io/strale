import { registerCapability, type CapabilityInput } from "./index.js";
import dns from "node:dns/promises";
import { dnsOrEmpty, dnsOrNull } from "../lib/upstream-result.js";

// F-0-006 Bucket C: pure DNS resolution on the user domain. No socket
// to the resolved IP. validateHost not required.

registerCapability("mx-lookup", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!domain) throw new Error("'domain' (domain name) is required.");

  // Strip protocol/path if URL provided
  const cleaned = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

  interface DnsResults {
    mx: { exchange: string; priority: number }[];
    a: string[];
    aaaa: string[];
    ns: string[];
    txt: string[][];
    soa: { nsname: string; hostmaster: string; serial: number; refresh: number; retry: number; expire: number; minttl: number } | null;
  }

  // Run all DNS queries in parallel. A record type the domain does not have
  // comes back empty; a resolver that could not answer throws, so a timeout
  // is never reported as "this domain has no MX" (unbilled, retried).
  const [mx, a, aaaa, ns, txt, soa] = await Promise.all([
    dnsOrEmpty(() => dns.resolveMx(cleaned), "DNS MX query"),
    dnsOrEmpty(() => dns.resolve4(cleaned), "DNS A query"),
    dnsOrEmpty(() => dns.resolve6(cleaned), "DNS AAAA query"),
    dnsOrEmpty(() => dns.resolveNs(cleaned), "DNS NS query"),
    dnsOrEmpty(() => dns.resolveTxt(cleaned), "DNS TXT query"),
    dnsOrNull(() => dns.resolveSoa(cleaned), "DNS SOA query"),
  ]);
  const results: DnsResults = { mx: mx.sort((a, b) => a.priority - b.priority), a, aaaa, ns, txt, soa };

  // Detect email provider from MX records
  const mxHosts = results.mx.map(r => r.exchange.toLowerCase());
  let emailProvider = "unknown";
  if (mxHosts.some(h => h.includes("google") || h.includes("gmail"))) emailProvider = "Google Workspace";
  else if (mxHosts.some(h => h.includes("outlook") || h.includes("microsoft"))) emailProvider = "Microsoft 365";
  else if (mxHosts.some(h => h.includes("zoho"))) emailProvider = "Zoho Mail";
  else if (mxHosts.some(h => h.includes("protonmail") || h.includes("proton"))) emailProvider = "Proton Mail";
  else if (mxHosts.some(h => h.includes("mimecast"))) emailProvider = "Mimecast";
  else if (mxHosts.some(h => h.includes("barracuda"))) emailProvider = "Barracuda";
  else if (mxHosts.some(h => h.includes("pphosted") || h.includes("proofpoint"))) emailProvider = "Proofpoint";

  // Extract SPF, DKIM, DMARC from TXT records
  const txtFlat = results.txt.map(t => t.join(""));
  const spf = txtFlat.find(t => t.startsWith("v=spf1")) ?? null;
  const dmarc = txtFlat.find(t => t.startsWith("v=DMARC1")) ?? null;

  return {
    output: {
      domain: cleaned,
      mx_records: results.mx.map(r => ({ priority: r.priority, exchange: r.exchange })),
      email_provider: emailProvider,
      a_records: results.a,
      aaaa_records: results.aaaa,
      nameservers: results.ns,
      spf_record: spf,
      dmarc_record: dmarc,
      soa: results.soa ? {
        primary_ns: results.soa.nsname,
        admin_email: results.soa.hostmaster,
        serial: results.soa.serial,
      } : null,
      has_ipv6: results.aaaa.length > 0,
      has_mx: results.mx.length > 0,
      has_spf: !!spf,
      has_dmarc: !!dmarc,
    },
    provenance: { source: "dns-resolve", fetched_at: new Date().toISOString() },
  };
});
