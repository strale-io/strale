import { registerCapability, type CapabilityInput } from "./index.js";
import dns from "node:dns/promises";

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

  const results: DnsResults = { mx: [], a: [], aaaa: [], ns: [], txt: [], soa: null };

  // Run all DNS queries in parallel
  const [mx, a, aaaa, ns, txt, soa] = await Promise.allSettled([
    dns.resolveMx(cleaned),
    dns.resolve4(cleaned),
    dns.resolve6(cleaned),
    dns.resolveNs(cleaned),
    dns.resolveTxt(cleaned),
    dns.resolveSoa(cleaned),
  ]);

  if (mx.status === "fulfilled") results.mx = mx.value.sort((a, b) => a.priority - b.priority);
  if (a.status === "fulfilled") results.a = a.value;
  if (aaaa.status === "fulfilled") results.aaaa = aaaa.value;
  if (ns.status === "fulfilled") results.ns = ns.value;
  if (txt.status === "fulfilled") results.txt = txt.value;
  if (soa.status === "fulfilled") results.soa = soa.value;

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
