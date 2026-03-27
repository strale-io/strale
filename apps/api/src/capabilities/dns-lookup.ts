import { registerCapability, type CapabilityInput } from "./index.js";
import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt, resolveCname } from "node:dns/promises";

registerCapability("dns-lookup", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.hostname as string) ?? "").trim().toLowerCase();
  if (!domain) {
    throw new Error("'domain' is required. Provide a domain name (e.g. example.com).");
  }

  // Strip protocol and path if provided
  const cleaned = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

  const results: Record<string, unknown> = { domain: cleaned };

  // Run all lookups in parallel, catching individual failures
  const [a, aaaa, mx, ns, txt, cname] = await Promise.allSettled([
    resolve4(cleaned),
    resolve6(cleaned),
    resolveMx(cleaned),
    resolveNs(cleaned),
    resolveTxt(cleaned),
    resolveCname(cleaned),
  ]);

  results.a_records = a.status === "fulfilled" ? a.value : [];
  results.aaaa_records = aaaa.status === "fulfilled" ? aaaa.value : [];
  results.mx_records = mx.status === "fulfilled"
    ? mx.value.sort((a, b) => a.priority - b.priority).map((r) => ({ priority: r.priority, exchange: r.exchange }))
    : [];
  results.ns_records = ns.status === "fulfilled" ? ns.value : [];
  results.txt_records = txt.status === "fulfilled" ? txt.value.map((r) => r.join("")) : [];
  results.cname_records = cname.status === "fulfilled" ? cname.value : [];

  // Check for common TXT records
  const allTxt = (results.txt_records as string[]).join(" ");
  results.has_spf = allTxt.includes("v=spf1");
  results.has_dmarc = false;

  // Check DMARC separately
  try {
    const dmarc = await resolveTxt(`_dmarc.${cleaned}`);
    results.has_dmarc = dmarc.some((r) => r.join("").startsWith("v=DMARC1"));
    if (results.has_dmarc) {
      results.dmarc_record = dmarc.map((r) => r.join("")).find((r) => r.startsWith("v=DMARC1")) ?? null;
    }
  } catch {
    // No DMARC record
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
