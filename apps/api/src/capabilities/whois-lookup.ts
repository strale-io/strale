import { registerCapability, type CapabilityInput } from "./index.js";
import { createConnection } from "node:net";

// F-0-006 Bucket D: opens a WHOIS TCP connection to a HARDCODED server
// (TLD map elsewhere in the file). The user domain is the query payload
// only; the TCP target is never user-controlled.

// IANA root WHOIS server — redirects to the correct TLD server
const IANA_WHOIS = "whois.iana.org";

const TLD_SERVERS: Record<string, string> = {
  com: "whois.verisign-grs.com",
  net: "whois.verisign-grs.com",
  org: "whois.pir.org",
  io: "whois.nic.io",
  dev: "whois.nic.google",
  app: "whois.nic.google",
  co: "whois.nic.co",
  se: "whois.iis.se",
  no: "whois.norid.no",
  dk: "whois.dk-hostmaster.dk",
  fi: "whois.fi",
  de: "whois.denic.de",
  fr: "whois.nic.fr",
  nl: "whois.domain-registry.nl",
  uk: "whois.nic.uk",
  eu: "whois.eu",
  ch: "whois.nic.ch",
  at: "whois.nic.at",
  be: "whois.dns.be",
  es: "whois.nic.es",
  it: "whois.nic.it",
  pt: "whois.dns.pt",
  pl: "whois.dns.pl",
  ie: "whois.weare.ie",
  lv: "whois.nic.lv",
  lt: "whois.domreg.lt",
  ee: "whois.tld.ee",
  us: "whois.nic.us",
  ca: "whois.cira.ca",
  au: "whois.auda.org.au",
  in: "whois.registry.in",
  sg: "whois.sgnic.sg",
  hk: "whois.hkirc.hk",
  jp: "whois.jprs.jp",
  br: "whois.registro.br",
  ai: "whois.nic.ai",
  info: "whois.afilias.net",
  biz: "whois.biz",
};

registerCapability("whois-lookup", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!domain) {
    throw new Error("'domain' is required. Provide a domain name (e.g. example.com).");
  }

  const cleaned = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const tld = cleaned.split(".").pop() ?? "";
  const server = TLD_SERVERS[tld] ?? IANA_WHOIS;

  let rawText: string;
  try {
    rawText = await queryWhois(server, cleaned);
  } catch (err) {
    // If the TLD-specific server fails, fall back to IANA root
    if (server !== IANA_WHOIS) {
      rawText = await queryWhois(IANA_WHOIS, cleaned);
    } else {
      throw err;
    }
  }

  // Parse common WHOIS fields
  const output: Record<string, unknown> = {
    domain: cleaned,
    raw_whois: rawText.slice(0, 3000),
  };

  const lines = rawText.split("\n");
  for (const line of lines) {
    const [key, ...valueParts] = line.split(":");
    if (!key || valueParts.length === 0) continue;
    const k = key.trim().toLowerCase();
    const v = valueParts.join(":").trim();
    if (!v) continue;

    if (k.includes("registrar") && !k.includes("url") && !k.includes("abuse") && !output.registrar) {
      output.registrar = v;
    } else if ((k.includes("creation") || k.includes("created") || k === "registered") && !output.created) {
      output.created = v;
    } else if ((k.includes("expir") || k.includes("renewal") || k === "expires") && !output.expires) {
      output.expires = v;
    } else if ((k.includes("updated") || k.includes("modified") || k.includes("last update")) && !output.updated) {
      output.updated = v;
    } else if (k.includes("name server") || k.includes("nserver") || k.includes("nameserver")) {
      if (!output.name_servers) output.name_servers = [];
      (output.name_servers as string[]).push(v.toLowerCase());
    } else if (k.includes("status") || k.includes("domain status")) {
      if (!output.statuses) output.statuses = [];
      (output.statuses as string[]).push(v);
    } else if ((k.includes("registrant") && k.includes("name")) || (k === "holder" && !output.registrant)) {
      output.registrant = v;
    } else if (k.includes("registrant") && k.includes("country") && !output.registrant_country) {
      output.registrant_country = v;
    }
  }

  // For .se domains, Whois format is different
  if (tld === "se" && !output.registrar) {
    const regMatch = rawText.match(/registrar:\s*(.+)/i);
    if (regMatch) output.registrar = regMatch[1].trim();
  }

  return {
    output,
    provenance: { source: `whois (${server})`, fetched_at: new Date().toISOString() },
  };
});

function queryWhois(server: string, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`WHOIS query to ${server} timed out.`));
    }, 10000);

    const socket = createConnection(43, server, () => {
      socket.write(`${domain}\r\n`);
    });

    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { data += chunk; });
    socket.on("end", () => {
      clearTimeout(timeout);
      if (!data.trim()) {
        reject(new Error(`Empty WHOIS response from ${server} for ${domain}.`));
      } else {
        resolve(data);
      }
    });
    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`WHOIS query failed: ${err.message}`));
    });
  });
}
