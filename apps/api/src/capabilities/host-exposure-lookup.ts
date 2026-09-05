import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { isBlockedIp } from "../lib/url-validator.js";
import { promises as dns } from "node:dns";

// Shodan InternetDB — the free, keyless tier of Shodan's host database. It
// answers from Shodan's most recent scan of an address; it never scans on
// demand, so this capability sends no traffic to the target.
// Verified live 2026-09-05 (1.1.1.1 -> 10 ports, Cloudflare CPE).
const API = "https://internetdb.shodan.io";
const USER_AGENT = "Strale/1.0 (support@strale.io)";

// F-0-006 Bucket D (recorded although the inventory grep does not match this
// file — it keys on input.url/link/domain/hostname/website and this capability
// reads input.host). A caller-supplied hostname IS resolved here, but the
// resolved address is only ever interpolated into the path of the hardcoded
// internetdb.shodan.io host; no socket is ever opened to it. isIpv4 and
// isPrivateIpv4 additionally refuse anything that is not a public dotted quad
// before the request is built. No SSRF surface.

interface InternetDb {
  ip?: string;
  ports?: number[];
  hostnames?: string[];
  cpes?: string[];
  vulns?: string[];
  tags?: string[];
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

/** True for a syntactically valid IPv4 dotted quad. */
export function isIpv4(v: string): boolean {
  const m = v.match(IPV4_RE);
  return m ? m.slice(1).every((o) => Number(o) <= 255 && !(o.length > 1 && o.startsWith("0"))) : false;
}

/**
 * Addresses that must never be looked up: they are not routable on the public
 * internet, so a query is either meaningless or a probe of our own network.
 *
 * `isBlockedIp` in lib/url-validator.ts is the platform's canonical
 * non-routable list and is deferred to rather than restated — a second copy is
 * the "one list, many matchers" family that #428/#434/#436 closed, and the two
 * had already diverged on multicast when review caught it. Only the ranges
 * specific to *scan data* rather than to SSRF are added here.
 */
export function isPrivateIpv4(v: string): boolean {
  if (isBlockedIp(v)) return true;
  const o = v.split(".").map(Number);
  if (o.length !== 4 || o.some(Number.isNaN)) return false;
  // 0.0.0.0/8 ("this network") and everything from 224 up (multicast, then
  // reserved 240/4) are absent from internet scan corpora by construction.
  return o[0] === 0 || o[0] >= 224;
}

/** Group a CVE list into the coarse buckets a caller acts on. */
export function summarizeExposure(ports: number[], vulns: string[]): {
  risk_level: "none" | "low" | "medium" | "high";
  remote_admin_ports: number[];
} {
  // Ports that expose administrative access directly to the internet.
  const ADMIN = new Set([22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379, 9200, 27017]);
  const admin = ports.filter((p) => ADMIN.has(p)).sort((a, b) => a - b);
  let risk: "none" | "low" | "medium" | "high" = "none";
  if (ports.length > 0) risk = "low";
  if (admin.length > 0) risk = "medium";
  if (vulns.length > 0) risk = "high";
  return { risk_level: risk, remote_admin_ports: admin };
}

registerCapability("host-exposure-lookup", async (input: CapabilityInput) => {
  const raw = typeof input.host === "string" ? input.host.trim().toLowerCase() : "";
  if (raw.length === 0) {
    throw new Error("'host' must be an IPv4 address or a hostname to resolve.");
  }

  let ip = raw;
  let resolvedFrom: string | null = null;

  if (!isIpv4(raw)) {
    if (!DOMAIN_RE.test(raw)) {
      throw new Error(`'host' must be an IPv4 address or a hostname; '${raw}' is neither. IPv6 is not covered by this data source.`);
    }
    let addresses: string[];
    try {
      // c-ares retries on its own and can sit for ~20s with no ceiling, which
      // would blow the sync execution budget before the fetch even starts.
      addresses = await Promise.race([
        dns.resolve4(raw),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("dns timeout")), 4_000).unref?.(),
        ),
      ]);
    } catch {
      throw new Error(`'host' must be a hostname with an IPv4 address; '${raw}' has no A record, or DNS resolution failed.`);
    }
    if (addresses.length === 0) {
      throw new Error(`'host' must be a hostname with an IPv4 address; '${raw}' has none.`);
    }
    ip = addresses[0];
    resolvedFrom = raw;
  }

  if (isPrivateIpv4(ip)) {
    throw new Error(`'host' must be a public address; '${ip}' is private, loopback or reserved and is not present in internet scan data.`);
  }

  // `ip` is a public dotted quad by this point — isIpv4 and isPrivateIpv4 have
  // both run, and it is interpolated into the path, never the host.
  // unguarded-fetch-ok: fixed internetdb.shodan.io host
  const res = await fetch(`${API}/${ip}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  // InternetDB answers 404 for an address it has never observed. That is a
  // real, useful result — "nothing exposed on record" — not a failure.
  if (res.status === 404) {
    return {
      output: {
        ip,
        resolved_from: resolvedFrom,
        found: false,
        ports: [],
        port_count: 0,
        hostnames: [],
        software: [],
        vulnerabilities: [],
        vulnerability_count: 0,
        tags: [],
        risk_level: "none",
        remote_admin_ports: [],
      },
      provenance: { source: "Shodan InternetDB", fetched_at: new Date().toISOString() },
    };
  }
  if (res.status === 429) {
    throw new Error("Shodan InternetDB is rate-limiting requests right now. Retry shortly.");
  }
  if (!res.ok) throw new Error(`Shodan InternetDB returned HTTP ${res.status}.`);

  const data = await readJsonWithLimit<InternetDb>(res);
  const ports = Array.isArray(data.ports) ? data.ports.filter((p) => typeof p === "number").sort((a, b) => a - b) : [];
  const vulns = Array.isArray(data.vulns) ? data.vulns.filter((v) => typeof v === "string") : [];
  const { risk_level, remote_admin_ports } = summarizeExposure(ports, vulns);

  return {
    output: {
      ip: data.ip ?? ip,
      resolved_from: resolvedFrom,
      found: true,
      ports,
      port_count: ports.length,
      hostnames: Array.isArray(data.hostnames) ? data.hostnames : [],
      software: Array.isArray(data.cpes) ? data.cpes : [],
      vulnerabilities: vulns,
      vulnerability_count: vulns.length,
      tags: Array.isArray(data.tags) ? data.tags : [],
      risk_level,
      remote_admin_ports,
    },
    provenance: { source: "Shodan InternetDB", fetched_at: new Date().toISOString() },
  };
});
