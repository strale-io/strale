import { inputRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { createConnection } from "node:net";
import { MAX_WHOIS_RESPONSE_BYTES, createCappedTextSink } from "../lib/resource-limits.js";
import { getRdapBase, lookupRdapDomain, type RdapDomainResult } from "../lib/rdap/domain.js";

// F-0-006 Bucket D: opens a WHOIS TCP connection to a HARDCODED server
// below (TLD_SERVERS map). The user domain is the query payload only.
// No SSRF surface — the connection target is never user-controlled.
const TLD_SERVERS: Record<string, string> = {
  com: "whois.verisign-grs.com", net: "whois.verisign-grs.com",
  org: "whois.pir.org", io: "whois.nic.io", dev: "whois.nic.google",
  se: "whois.iis.se", no: "whois.norid.no", dk: "whois.dk-hostmaster.dk",
  fi: "whois.fi", de: "whois.denic.de", fr: "whois.nic.fr",
  nl: "whois.domain-registry.nl", uk: "whois.nic.uk", eu: "whois.eu",
  ch: "whois.nic.ch", at: "whois.nic.at", be: "whois.dns.be",
  co: "whois.nic.co", app: "whois.nic.google", ai: "whois.nic.ai",
};

function transportFailure(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  if (code === "ETIMEDOUT" || /timeout|timed out|aborted/i.test(message)) return "timeout";
  if (code === "ECONNREFUSED" || /connection refused/i.test(message)) return "connection refused";
  if (code === "ECONNRESET" || /connection reset/i.test(message)) return "connection reset";
  const status = /HTTP\s+(\d{3})/i.exec(message)?.[1];
  return status ? `HTTP ${status}` : "unavailable";
}

function whoisQuery(server: string, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`WHOIS registry ${server} failed: timeout`));
    }, 10000);
    const socket = createConnection(43, server, () => {
      socket.write(domain + "\r\n");
    });
    // Capped (WP12 batch 3): plain TCP from a registry, so the reply size is
    // not ours to choose. The prefix holds every field this parser reads.
    const sink = createCappedTextSink(MAX_WHOIS_RESPONSE_BYTES);
    socket.on("data", (chunk) => {
      if (sink.push(chunk)) {
        clearTimeout(timeout);
        socket.destroy();
        resolve(sink.value());
      }
    });
    socket.on("end", () => { clearTimeout(timeout); resolve(sink.value()); });
    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`WHOIS registry ${server} failed: ${transportFailure(err)}`));
    });
  });
}

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d;
  // Try YYYYMMDD format
  const match = trimmed.match(/(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  if (match) {
    const d2 = new Date(`${match[1]}-${match[2]}-${match[3]}`);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

function extractDates(whoisText: string): { created: Date | null; expires: Date | null; registrar: string | null } {
  const lines = whoisText.split("\n");
  let created: Date | null = null;
  let expires: Date | null = null;
  let registrar: string | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (!created && (lower.startsWith("creation date:") || lower.startsWith("created:") || lower.startsWith("created date:") || lower.startsWith("registration date:") || lower.startsWith("registered:"))) {
      created = parseDate(line.split(":").slice(1).join(":"));
    }
    if (!expires && (lower.startsWith("registry expiry date:") || lower.startsWith("expiry date:") || lower.startsWith("expires:") || lower.startsWith("expiration date:"))) {
      expires = parseDate(line.split(":").slice(1).join(":"));
    }
    if (!registrar && (lower.startsWith("registrar:") || lower.startsWith("registrar name:"))) {
      registrar = line.split(":").slice(1).join(":").trim() || null;
    }
  }

  return { created, expires, registrar };
}

function unknownResult(domain: string, source: "rdap" | "whois", upstream: string | undefined, note: string) {
  return {
    output: {
      domain, age_days: null, age_years: null, created_date: null,
      registrar: null, expiry_date: null, is_new: null, risk_indicator: "unknown",
      note,
    },
    provenance: { source, ...(upstream ? { upstream } : {}), fetched_at: new Date().toISOString() },
  };
}

function resultFromDates(domain: string, source: "rdap" | "whois", upstream: string, created: Date, expires: Date | null, registrar: string | null) {
  const ageDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
  const ageYears = Math.round(ageDays / 365.25 * 10) / 10;
  const isNew = ageDays < 30;
  let riskIndicator = "low";
  if (ageDays < 7) riskIndicator = "critical";
  else if (ageDays < 30) riskIndicator = "high";
  else if (ageDays < 180) riskIndicator = "medium";
  return {
    output: {
      domain, created_date: created.toISOString().split("T")[0], age_days: ageDays,
      age_years: ageYears, registrar, expiry_date: expires?.toISOString().split("T")[0] ?? null,
      is_new: isNew, risk_indicator: riskIndicator,
    },
    provenance: { source, upstream, fetched_at: new Date().toISOString() },
  };
}

registerCapability("domain-age-check", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.task as string) ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) throw inputRefusal("'domain' is required.", "domain", "Send 'domain' as a DNS hostname such as example.com.");

  const tld = domain.split(".").pop() ?? "";
  const server = TLD_SERVERS[tld];
  let rdapBase: string | null = null;
  let rdapFailure: string | null = null;

  try {
    rdapBase = await getRdapBase(tld);
  } catch (error) {
    rdapFailure = `RDAP bootstrap data.iana.org failed: ${transportFailure(error)}`;
  }

  if (rdapBase) {
    try {
      const rdap: RdapDomainResult = await lookupRdapDomain(rdapBase, domain);
      if (rdap.status === "not_found") {
        return unknownResult(domain, "rdap", rdap.host, "Domain is not registered according to the registry RDAP service");
      }
      if (rdap.status === "found" && rdap.created) {
        return resultFromDates(domain, "rdap", rdap.host, rdap.created, rdap.expires, rdap.registrar);
      }
      rdapFailure = `RDAP registry ${rdap.host} failed: no registration event`;
    } catch (error) {
      const host = new URL(rdapBase).hostname;
      rdapFailure = `RDAP registry ${host} failed: ${transportFailure(error)}`;
    }
  }

  if (!server) {
    return {
      output: {
        domain, age_days: null, age_years: null, created_date: null,
        registrar: null, expiry_date: null, is_new: null, risk_indicator: "unknown",
        error: `WHOIS server not available for .${tld} TLD`,
      },
      provenance: { source: "whois", fetched_at: new Date().toISOString() },
    };
  }

  let whoisText: string;
  try {
    whoisText = await whoisQuery(server, domain);
  } catch (error) {
    const whoisFailure = error instanceof Error ? error.message : `WHOIS registry ${server} failed: unavailable`;
    throw new Error(rdapFailure ? `${rdapFailure}; ${whoisFailure}` : whoisFailure);
  }
  const { created, expires, registrar } = extractDates(whoisText);

  if (!created) {
    return {
      output: {
        domain, age_days: null, age_years: null, created_date: null,
        registrar, expiry_date: expires?.toISOString().split("T")[0] ?? null,
        is_new: null, risk_indicator: "unknown",
        note: "Creation date not found in WHOIS data",
      },
      provenance: { source: "whois", upstream: server, fetched_at: new Date().toISOString() },
    };
  }

  return resultFromDates(domain, "whois", server, created, expires, registrar);
});
