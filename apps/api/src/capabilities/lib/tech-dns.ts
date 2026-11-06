/**
 * Public DNS lookups for technology detection (MX, TXT, NS, CNAME).
 *
 * Reads what anyone can resolve from public DNS, and nothing else. A lookup
 * that fails for a reason other than "no such record" is REPORTED as failed,
 * never folded into an empty list: an empty `mx` array must mean the domain
 * has no MX records, not that the resolver was unreachable (LESSONS F1/F5).
 */

import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

export type DnsRecordStatus = "ok" | "empty" | "failed";
export type DnsOverall = "ok" | "partial" | "unavailable" | "skipped";

export interface TechDns {
  mx: Array<{ exchange: string; priority: number }>;
  txt: string[];
  ns: string[];
  cname: string[];
  a: string[];
  status: Record<"a" | "mx" | "txt" | "ns" | "cname", DnsRecordStatus>;
  overall: DnsOverall;
  /** Record types whose lookup failed, with the resolver's error code. */
  failures: Array<{ type: string; code: string }>;
}

/** Codes that mean the name has no such record, as opposed to a resolver fault. */
const NO_RECORD_CODES: ReadonlySet<string> = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN"]);

const SECOND_LEVEL_LABELS: ReadonlySet<string> = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go"]);

/**
 * Best guess at the registrable domain without a public-suffix list: the last
 * two labels, or the last three under a two-letter country code with a common
 * second-level label (example.co.uk). MX, TXT and NS describe the organisation,
 * so for a subdomain input they are read from this domain.
 */
export function registrableGuess(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  if (tld.length === 2 && SECOND_LEVEL_LABELS.has(sld)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

export function hostnameOf(urlOrHost: string): string {
  try {
    return new URL(urlOrHost.includes("://") ? urlOrHost : `https://${urlOrHost}`).hostname.toLowerCase();
  } catch {
    return urlOrHost.toLowerCase();
  }
}

function emptyDns(overall: DnsOverall): TechDns {
  return {
    mx: [], txt: [], ns: [], cname: [], a: [],
    status: { a: "empty", mx: "empty", txt: "empty", ns: "empty", cname: "empty" },
    overall,
    failures: [],
  };
}

async function settle<T>(
  type: string,
  run: () => Promise<T[]>,
  failures: TechDns["failures"],
): Promise<{ values: T[]; status: DnsRecordStatus }> {
  try {
    const values = await run();
    return { values, status: values.length > 0 ? "ok" : "empty" };
  } catch (err) {
    const code = String((err as { code?: unknown })?.code ?? "UNKNOWN");
    if (NO_RECORD_CODES.has(code)) return { values: [], status: "empty" };
    failures.push({ type, code });
    return { values: [], status: "failed" };
  }
}

export interface TechDnsOptions {
  /** Domain whose MX, TXT, NS and A records are read. */
  domain: string;
  /** Hosts whose CNAME is read (the input host and the host actually fetched). */
  cnameHosts: string[];
  includeA?: boolean;
}

/** Never rejects: a resolver fault is returned as `overall: "unavailable"`. */
export async function lookupTechDns(options: TechDnsOptions): Promise<TechDns> {
  try {
    return await lookupTechDnsUnsafe(options);
  } catch (err) {
    const dns = emptyDns("unavailable");
    dns.failures.push({ type: "DNS", code: String((err as { code?: unknown })?.code ?? "UNKNOWN") });
    for (const key of Object.keys(dns.status) as Array<keyof TechDns["status"]>) dns.status[key] = "failed";
    return dns;
  }
}

async function lookupTechDnsUnsafe(options: TechDnsOptions): Promise<TechDns> {
  const domain = options.domain.toLowerCase().replace(/\.$/, "");
  if (!domain || isIP(domain)) return emptyDns("skipped");

  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  const failures: TechDns["failures"] = [];
  const cnameHosts = [...new Set(options.cnameHosts.map((h) => h.toLowerCase()).filter((h) => h && !isIP(h)))];

  const [a, mx, txt, ns, cnames] = await Promise.all([
    options.includeA
      ? settle("A", () => resolver.resolve4(domain), failures)
      : Promise.resolve({ values: [] as string[], status: "empty" as DnsRecordStatus }),
    settle("MX", async () => (await resolver.resolveMx(domain)).map((r) => ({ exchange: r.exchange.toLowerCase().replace(/\.$/, ""), priority: r.priority })), failures),
    settle("TXT", async () => (await resolver.resolveTxt(domain)).map((r) => r.join("")), failures),
    settle("NS", async () => (await resolver.resolveNs(domain)).map((n) => n.toLowerCase().replace(/\.$/, "")), failures),
    Promise.all(cnameHosts.map((host) => settle(`CNAME ${host}`, () => resolver.resolveCname(host), failures))),
  ]);

  const cname = [...new Set(cnames.flatMap((c) => c.values.map((v) => v.toLowerCase().replace(/\.$/, ""))))];
  const cnameStatus: DnsRecordStatus = cnames.some((c) => c.status === "failed")
    ? "failed"
    : cname.length > 0 ? "ok" : "empty";

  const status = { a: a.status, mx: mx.status, txt: txt.status, ns: ns.status, cname: cnameStatus };
  const checked = Object.entries(status).filter(([k]) => k !== "a" || options.includeA).map(([, v]) => v);
  const failed = checked.filter((s) => s === "failed").length;
  const overall: DnsOverall = failed === 0 ? "ok" : failed === checked.length ? "unavailable" : "partial";

  return { a: a.values, mx: mx.values, txt: txt.values, ns: ns.values, cname, status, overall, failures };
}
