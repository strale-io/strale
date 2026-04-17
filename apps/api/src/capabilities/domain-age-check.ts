import { registerCapability, type CapabilityInput } from "./index.js";
import { createConnection } from "node:net";

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

function whoisQuery(server: string, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error("WHOIS timeout")); }, 10000);
    const socket = createConnection(43, server, () => {
      socket.write(domain + "\r\n");
    });
    let data = "";
    socket.on("data", (chunk) => { data += chunk.toString(); });
    socket.on("end", () => { clearTimeout(timeout); resolve(data); });
    socket.on("error", (err) => { clearTimeout(timeout); reject(err); });
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

registerCapability("domain-age-check", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.task as string) ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) throw new Error("'domain' is required.");

  const tld = domain.split(".").pop() ?? "";
  const server = TLD_SERVERS[tld];

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

  const whoisText = await whoisQuery(server, domain);
  const { created, expires, registrar } = extractDates(whoisText);

  if (!created) {
    return {
      output: {
        domain, age_days: null, age_years: null, created_date: null,
        registrar, expiry_date: expires?.toISOString().split("T")[0] ?? null,
        is_new: null, risk_indicator: "unknown",
        note: "Creation date not found in WHOIS data",
      },
      provenance: { source: "whois", fetched_at: new Date().toISOString() },
    };
  }

  const now = new Date();
  const ageDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  const ageYears = Math.round(ageDays / 365.25 * 10) / 10;
  const isNew = ageDays < 30;

  let riskIndicator = "low";
  if (ageDays < 7) riskIndicator = "critical";
  else if (ageDays < 30) riskIndicator = "high";
  else if (ageDays < 180) riskIndicator = "medium";

  return {
    output: {
      domain,
      created_date: created.toISOString().split("T")[0],
      age_days: ageDays,
      age_years: ageYears,
      registrar,
      expiry_date: expires?.toISOString().split("T")[0] ?? null,
      is_new: isNew,
      risk_indicator: riskIndicator,
    },
    provenance: { source: "whois", fetched_at: new Date().toISOString() },
  };
});
