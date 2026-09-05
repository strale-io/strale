import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// Certificate Transparency log search. Cert Spotter is primary (fast, JSON,
// keyless for a modest allowance); crt.sh is the fallback because it is slow
// (6s+ observed) but has no allowance and deeper history.
// Verified live 2026-09-05 (strale.dev -> 16 issuances; crt.sh github.com OK).
const CERTSPOTTER = "https://api.certspotter.com/v1/issuances";
const CRTSH = "https://crt.sh";
const USER_AGENT = "Strale/1.0 (support@strale.io)";

interface SpotterIssuance {
  id?: string;
  dns_names?: string[];
  issuer?: { friendly_name?: string; name?: string };
  not_before?: string;
  not_after?: string;
  revoked?: boolean;
  cert_sha256?: string;
}
interface CrtShRow {
  id?: number;
  name_value?: string;
  issuer_name?: string;
  not_before?: string;
  not_after?: string;
  serial_number?: string;
}

// Hostname, not URL: labels of alphanumerics and hyphens, at least two.
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

/** Accept a bare hostname, or pull one out of a URL or an email address. */
export function normalizeDomain(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  if (v.includes("://")) {
    try { v = new URL(v).hostname; } catch { return null; }
  } else if (v.includes("@")) {
    v = v.slice(v.lastIndexOf("@") + 1);
  }
  v = v.replace(/\.$/, "").replace(/:\d+$/, "");
  return DOMAIN_RE.test(v) ? v : null;
}

/**
 * Collect the distinct hostnames a set of certificates covers. Wildcards are
 * kept as-is: `*.example.com` is evidence of a wildcard issuance, not a host.
 */
export function collectHostnames(names: string[][], apex: string): string[] {
  const seen = new Set<string>();
  for (const list of names) {
    for (const n of list) {
      const host = n.trim().toLowerCase();
      if (host.length === 0) continue;
      // crt.sh packs SANs one per line into name_value.
      if (host === apex || host.endsWith(`.${apex}`) || host === `*.${apex}`) seen.add(host);
    }
  }
  return [...seen].sort();
}

function iso(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

registerCapability("cert-transparency-search", async (input: CapabilityInput) => {
  const raw = typeof input.domain === "string" ? input.domain : "";
  const domain = normalizeDomain(raw);
  if (!domain) {
    throw new Error("'domain' is required and must be a hostname such as example.com (a URL or email address is also accepted).");
  }
  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 100, fallback: 50 });
  const includeSubdomains = input.include_subdomains === undefined || input.include_subdomains === null
    ? true
    : input.include_subdomains === true || input.include_subdomains === "true";

  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  let certificates: Record<string, unknown>[] = [];
  let nameLists: string[][] = [];
  let source = "Cert Spotter (SSLMate) Certificate Transparency API";

  const params = new URLSearchParams({ domain, expand: "dns_names" });
  if (includeSubdomains) params.set("include_subdomains", "true");
  // `expand` repeats rather than taking a list.
  const spotterUrl = `${CERTSPOTTER}?${params.toString()}&expand=issuer`;

  let spotterOk = false;
  try {
    const res = await fetch(spotterUrl, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const rows = await readJsonWithLimit<SpotterIssuance[]>(res);
      if (Array.isArray(rows)) {
        nameLists = rows.map((r) => r.dns_names ?? []);
        certificates = rows.slice(0, limit).map((r) => ({
          id: r.id ?? null,
          dns_names: r.dns_names ?? [],
          issuer: r.issuer?.friendly_name ?? r.issuer?.name ?? null,
          not_before: iso(r.not_before),
          not_after: iso(r.not_after),
          revoked: r.revoked === true,
          sha256: r.cert_sha256 ?? null,
        }));
        spotterOk = true;
      }
    }
  } catch {
    // Fall through to crt.sh.
  }

  if (!spotterOk) {
    // crt.sh is slow but unmetered; give it a longer budget than Cert Spotter.
    const url = `${CRTSH}/?q=${encodeURIComponent(includeSubdomains ? `%.${domain}` : domain)}&output=json`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      throw new Error(`Certificate Transparency lookup failed: Cert Spotter was unavailable and crt.sh returned HTTP ${res.status}.`);
    }
    const rows = await readJsonWithLimit<CrtShRow[]>(res);
    if (!Array.isArray(rows)) {
      throw new Error("crt.sh returned an unexpected response shape.");
    }
    source = "crt.sh Certificate Transparency search (Sectigo)";
    nameLists = rows.map((r) => (r.name_value ?? "").split("\n"));
    certificates = rows.slice(0, limit).map((r) => ({
      id: r.id ?? null,
      dns_names: (r.name_value ?? "").split("\n").map((n) => n.trim()).filter(Boolean),
      issuer: r.issuer_name ?? null,
      not_before: iso(r.not_before),
      not_after: iso(r.not_after),
      revoked: null,
      sha256: null,
    }));
  }

  const hostnames = collectHostnames(nameLists, domain);
  const befores = certificates
    .map((c) => c.not_before)
    .filter((v): v is string => typeof v === "string")
    .sort();

  return {
    output: {
      domain,
      include_subdomains: includeSubdomains,
      certificate_count: certificates.length,
      // The number of log entries the upstream matched, which can exceed the
      // page returned when `limit` cuts it.
      total_matched: nameLists.length,
      hostnames,
      hostname_count: hostnames.length,
      earliest_certificate: befores[0] ?? null,
      latest_certificate: befores[befores.length - 1] ?? null,
      certificates,
    },
    provenance: { source, fetched_at: new Date().toISOString() },
  };
});
