import { registerCapability, type CapabilityInput } from "./index.js";
import { createConnection } from "node:net";
import { MAX_WHOIS_RESPONSE_BYTES, createCappedTextSink } from "../lib/resource-limits.js";
import { inputRefusal } from "../lib/capability-refusal.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { WHOIS_NOT_REGISTERED, WHOIS_RATE_LIMITED, WHOIS_REFUSED } from "./lib/whois-replies.js";

// F-0-006 Bucket D: opens a WHOIS TCP connection to a HARDCODED server
// (TLD map elsewhere in the file). The user domain is the query payload
// only; the TCP target is never user-controlled.

// Upstream failures (2026-11-06 swallowed-failures audit, row 28). A WHOIS
// reply is billed only when it is the registry's answer about the domain:
//   - The TLD's registry server is asked and nothing else. There used to be
//     a fallback to whois.iana.org, for a failed registry server and for any
//     TLD missing below, but IANA answers about the TLD, not the domain, so
//     its record (the TLD's own creation date, say) was billed as the
//     domain's. A registry server that fails now throws, unbilled, and a TLD
//     with no registry server here is a refusal (a coverage limit).
//   - A reply with no field this parser reads that is a rate-limit or
//     refusal notice is no answer and throws, unbilled. A "not registered"
//     reply is the real negative and is returned as before. Any other reply
//     with no parsed field is still returned, raw, because some registries
//     (JPRS for .jp, say) answer in a format this parser does not split.

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

/** Keys (lower-cased) whose value is the registrar's name itself. */
const REGISTRAR_NAME_KEYS = new Set(["registrar", "sponsoring registrar", "registrar name"]);

/**
 * Keys that mention the registrar but hold one of its details: its WHOIS
 * server, URL, IANA id, abuse contact and so on. Never the registrar's name.
 */
const REGISTRAR_DETAIL_KEY = /whois|server|url|abuse|iana|\bid\b|phone|email|contact/;

registerCapability("whois-lookup", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!domain) {
    throw new Error("'domain' is required. Provide a domain name (e.g. example.com).");
  }

  // A fully qualified name's trailing dot ("example.com.") would leave an
  // empty TLD, so it is stripped with the scheme, path and www.
  const cleaned = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/\.$/, "");
  const tld = cleaned.split(".").pop() ?? "";
  const server = TLD_SERVERS[tld];
  if (!server) {
    throw inputRefusal(
      `'domain' must be under a TLD Strale has a WHOIS registry server for; .${tld} is not one of them, so this domain cannot be looked up.`,
      "domain",
      "Send 'domain' under a TLD with a known registry server, such as .com, .net, .org, .io, .se, .de, .uk or .eu.",
    );
  }

  const rawText = await queryWhois(server, cleaned);

  // Parse common WHOIS fields
  const output: Record<string, unknown> = {
    domain: cleaned,
    raw_whois: rawText.slice(0, 3000),
  };

  // The registrar is the value of the "Registrar" line itself. A .com or
  // .net record lists "Registrar WHOIS Server" first, and taking the first
  // key that merely contains "registrar" billed the registrar's WHOIS host
  // name as the registrar (PR #1018 review round 4, T4). A key naming the
  // registrar outright wins over any looser match, wherever it appears.
  let registrarNamed = false;
  const lines = rawText.split("\n");
  for (const line of lines) {
    const [key, ...valueParts] = line.split(":");
    if (!key || valueParts.length === 0) continue;
    const k = key.trim().toLowerCase();
    const v = valueParts.join(":").trim();
    if (!v) continue;

    if (REGISTRAR_NAME_KEYS.has(k)) {
      if (!registrarNamed) output.registrar = v;
      registrarNamed = true;
    } else if (k.includes("registrar") && !REGISTRAR_DETAIL_KEY.test(k) && !output.registrar) {
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

  // Nothing parsed beyond the domain and the raw text, and the reply is not
  // the "not registered" negative: a rate-limit or refusal notice is the
  // registry declining to answer, not an answer.
  const parsedAny = Object.keys(output).some((k) => k !== "domain" && k !== "raw_whois");
  if (!parsedAny && !WHOIS_NOT_REGISTERED.test(rawText)) {
    if (WHOIS_RATE_LIMITED.test(rawText)) {
      throw new UpstreamUnavailableError(registry(server), "the registry is rate-limiting queries; retry shortly.", {
        code: "rate_limited",
      });
    }
    if (WHOIS_REFUSED.test(rawText)) {
      throw new UpstreamUnavailableError(registry(server), "the registry refused the query.", {
        code: "refused",
        retryable: false,
      });
    }
  }

  return {
    output,
    provenance: { source: `whois (${server})`, fetched_at: new Date().toISOString() },
  };
});

function registry(server: string): string {
  return `WHOIS registry ${server}`;
}

function queryWhois(server: string, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new UpstreamUnavailableError(registry(server), "timeout; retry shortly.", { code: "timeout" }));
    }, 10000);

    const socket = createConnection(43, server, () => {
      socket.write(`${domain}\r\n`);
    });

    // Capped (WP12 batch 3): plain TCP from a registry, so the reply size is
    // not ours to choose, and this file turns every Name Server / Status line
    // into an output array entry. The prefix holds every field parsed below.
    const sink = createCappedTextSink(MAX_WHOIS_RESPONSE_BYTES);
    socket.on("data", (chunk) => {
      if (sink.push(chunk)) {
        clearTimeout(timeout);
        socket.destroy();
        resolve(sink.value());
      }
    });
    socket.on("end", () => {
      clearTimeout(timeout);
      const data = sink.value();
      if (!data.trim()) {
        reject(new UpstreamUnavailableError(registry(server), "empty reply; retry shortly.", { code: "empty" }));
      } else {
        resolve(data);
      }
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      const code = typeof err.code === "string" ? err.code : null;
      reject(
        new UpstreamUnavailableError(registry(server), `network error${code ? ` (${code})` : ""}; retry shortly.`, {
          code,
          cause: err,
        }),
      );
    });
  });
}
