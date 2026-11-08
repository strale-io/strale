import { discardBody, safeFetch } from "../safe-fetch.js";
import { MAX_WHOIS_RESPONSE_BYTES, readJsonWithLimit } from "../resource-limits.js";

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const BOOTSTRAP_FAILURE_TTL_MS = 60 * 1000;

interface BootstrapDocument {
  services?: Array<[string[], string[]]>;
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapEntity {
  roles?: string[];
  handle?: string;
  vcardArray?: [string, Array<[string, Record<string, unknown>, string, unknown]>];
}

interface RdapDomainDocument {
  events?: RdapEvent[];
  entities?: RdapEntity[];
}

export interface RdapDomainResult {
  status: "found" | "not_found" | "no_registration_event";
  host: string;
  created: Date | null;
  expires: Date | null;
  registrar: string | null;
}

let bootstrapCache: { expiresAt: number; bases: Map<string, string> } | null = null;
let bootstrapPromise: Promise<Map<string, string>> | null = null;
let bootstrapFailureUntil = 0;

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function bootstrapBases(document: BootstrapDocument): Map<string, string> {
  const bases = new Map<string, string>();
  for (const [tlds, urls] of document.services ?? []) {
    const base = urls.find((url) => url.startsWith("https://"));
    if (!base) continue;
    for (const tld of tlds) bases.set(tld.toLowerCase(), base.endsWith("/") ? base : `${base}/`);
  }
  return bases;
}

export async function getRdapBase(tld: string): Promise<string | null> {
  const now = Date.now();
  if (bootstrapCache && bootstrapCache.expiresAt > now) return bootstrapCache.bases.get(tld) ?? null;
  if (bootstrapFailureUntil > now) return null;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const response = await safeFetch(BOOTSTRAP_URL, {
        headers: { Accept: "application/json" },
        timeoutMs: 5_000,
      });
      if (!response.ok) {
        await discardBody(response, "IANA RDAP bootstrap error");
        throw new Error(`IANA RDAP bootstrap returned HTTP ${response.status}`);
      }
      const document = await readJsonWithLimit<BootstrapDocument>(response, MAX_WHOIS_RESPONSE_BYTES, "rdap_bootstrap", "the IANA RDAP bootstrap file is");
      const bases = bootstrapBases(document);
      bootstrapCache = { expiresAt: Date.now() + BOOTSTRAP_TTL_MS, bases };
      return bases;
    })();
  }

  try {
    return (await bootstrapPromise).get(tld) ?? null;
  } catch (error) {
    bootstrapFailureUntil = Date.now() + BOOTSTRAP_FAILURE_TTL_MS;
    throw error;
  } finally {
    bootstrapPromise = null;
  }
}

function registrarName(entities: RdapEntity[] | undefined): string | null {
  const registrar = entities?.find((entity) => entity.roles?.includes("registrar"));
  if (!registrar) return null;
  const fn = registrar.vcardArray?.[1]?.find((property) => property[0] === "fn")?.[3];
  return typeof fn === "string" && fn.trim() ? fn.trim() : registrar.handle?.trim() || null;
}

export async function lookupRdapDomain(base: string, domain: string): Promise<RdapDomainResult> {
  const url = new URL(`domain/${encodeURIComponent(domain)}`, base);
  const response = await safeFetch(url, {
    headers: { Accept: "application/rdap+json" },
    timeoutMs: 8_000,
  });
  const host = url.hostname;
  if (response.status === 404) {
    await discardBody(response, "RDAP domain not found");
    return { status: "not_found", host, created: null, expires: null, registrar: null };
  }
  if (!response.ok) {
    await discardBody(response, "RDAP registry error");
    throw new Error(`RDAP registry ${host} returned HTTP ${response.status}`);
  }

  const document = await readJsonWithLimit<RdapDomainDocument>(response, MAX_WHOIS_RESPONSE_BYTES, "rdap_response", "the registry RDAP response is");
  const created = parseDate(document.events?.find((event) => event.eventAction === "registration")?.eventDate);
  const expires = parseDate(document.events?.find((event) => event.eventAction === "expiration")?.eventDate);
  return {
    status: created ? "found" : "no_registration_event",
    host,
    created,
    expires,
    registrar: registrarName(document.entities),
  };
}

/** Test-only reset: module state must not make offline cases order-dependent. */
export function resetRdapBootstrapCacheForTests(): void {
  bootstrapCache = null;
  bootstrapPromise = null;
  bootstrapFailureUntil = 0;
}
