import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatHR } from "../lib/vat-derivation.js";

// Croatian company data via Sudski registar OAuth2 REST API
// Ministarstvo pravosuđa i uprave — Croatian Court Register
// API base: https://sudreg-data.gov.hr/api/javni
// Token endpoint: https://sudreg-data.gov.hr/api/oauth/token
// Grant type: client_credentials, HTTP Basic auth with SUDREG_CLIENT_ID/SECRET
// Open API spec: https://sudreg-data.gov.hr/api/javni/dokumentacija/open_api

const TOKEN_URL = "https://sudreg-data.gov.hr/api/oauth/token";
const API = "https://sudreg-data.gov.hr/api/javni";

// OIB: 11 digits (Osobni identifikacijski broj).
// MBS: matični broj subjekta — numeric court-registry ID, up to 9 digits.
const OIB_RE = /^\d{11}$/;

interface CachedToken {
  token: string;
  expiresAt: number;
}
let tokenCache: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const id = process.env.SUDREG_CLIENT_ID;
  const secret = process.env.SUDREG_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("SUDREG_CLIENT_ID and SUDREG_CLIENT_SECRET are required.");
  }
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Sudreg token endpoint returned HTTP ${r.status}`);
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) throw new Error("Sudreg token endpoint returned no access_token.");
  tokenCache = {
    token: d.access_token,
    expiresAt: now + (d.expires_in ?? 3600) * 1000,
  };
  return d.access_token;
}

async function sudregGet(path: string, token: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
}

function extractOibOrMbs(input: string): { tip: "oib" | "mbs"; value: string } | null {
  const cleaned = input.replace(/[\s.\-/]/g, "");
  if (OIB_RE.test(cleaned)) return { tip: "oib", value: cleaned };
  // MBS is numeric, typically up to 9 digits. Accept 6–10 digit bare numbers as MBS hint.
  if (/^\d{6,10}$/.test(cleaned)) return { tip: "mbs", value: cleaned };
  return null;
}

function formatAddress(s: Record<string, unknown> | null | undefined): string | null {
  if (!s || typeof s !== "object") return null;
  const street = (s.ulica as string | undefined)?.trim();
  const num = s.kucni_broj != null ? String(s.kucni_broj) : "";
  const city = (s.naziv_naselja as string | undefined)?.trim();
  const country = (s.drzava as Record<string, unknown> | undefined)?.oznaka_2 as string | undefined;
  const parts = [[street, num].filter(Boolean).join(" "), city, country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function mapDetail(d: Record<string, unknown>): Record<string, unknown> {
  const tvrtka = d.tvrtka as Record<string, unknown> | undefined;
  const skracena = d.skracena_tvrtka as Record<string, unknown> | undefined;
  const sjediste = d.sjediste as Record<string, unknown> | undefined;
  const pravniOblik = (d.pravni_oblik as Record<string, unknown> | undefined)?.vrsta_pravnog_oblika as
    | Record<string, unknown>
    | undefined;
  const oibNum = d.oib;
  const oib = oibNum != null ? String(oibNum).padStart(11, "0") : null;
  const mbs = d.mbs != null ? String(d.mbs) : null;
  const mb = d.mb != null ? String(d.mb) : null;
  const potpuniMbs = d.potpuni_mbs != null ? String(d.potpuni_mbs) : null;

  // status: 1 = active/redovan; anything else = not currently active. We expose both the
  // normalised label and the raw code so downstream risk logic isn't forced to guess.
  const statusCode = typeof d.status === "number" ? d.status : null;
  const status = statusCode === 1 ? "active" : statusCode == null ? "unknown" : "inactive";

  const glavna = d.glavna_djelatnost;
  const mainActivityCode = glavna != null ? String(glavna) : null;

  const emails = Array.isArray(d.email_adrese) ? (d.email_adrese as Record<string, unknown>[]) : [];
  const primaryEmail = (emails[0]?.adresa as string | undefined) ?? null;

  const datumOsnivanja = typeof d.datum_osnivanja === "string" ? d.datum_osnivanja.split("T")[0] : null;

  return {
    company_name: (tvrtka?.ime as string | undefined) ?? null,
    short_name: (skracena?.ime as string | undefined) ?? null,
    oib,
    mbs,
    mb,
    potpuni_mbs: potpuniMbs,
    status,
    status_code: statusCode,
    registered_date: datumOsnivanja,
    legal_form: (pravniOblik?.naziv as string | undefined) ?? null,
    legal_form_abbr: (pravniOblik?.kratica as string | undefined) ?? null,
    address: formatAddress(sjediste),
    country_code: (sjediste?.drzava as Record<string, unknown> | undefined)?.oznaka_2 as string | undefined ?? null,
    main_activity_code: mainActivityCode,
    email: primaryEmail,
    vat_number: deriveVatHR(oib ?? ""),
  };
}

async function fetchDetail(
  tip: "oib" | "mbs",
  value: string,
  token: string,
): Promise<Record<string, unknown>> {
  const url = `/detalji_subjekta?tip_identifikatora=${tip}&identifikator=${encodeURIComponent(value)}&expand_relations=true`;
  const r = await sudregGet(url, token);
  if (r.status === 400) {
    const body = (await r.json().catch(() => ({}))) as { error_message?: string };
    throw new Error(`Sudreg rejected ${tip.toUpperCase()} '${value}': ${body.error_message ?? "invalid identifier"}`);
  }
  if (r.status === 404) {
    throw new Error(`No Croatian entity found for ${tip.toUpperCase()} '${value}'.`);
  }
  if (!r.ok) throw new Error(`Sudreg /detalji_subjekta returned HTTP ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

registerCapability("croatian-company-data", async (input: CapabilityInput) => {
  const raw = (input.oib as string) ?? (input.mbs as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'oib' (11 digits) or 'mbs' (court registry number) is required.");
  }

  const trimmed = raw.trim();
  const identifier = extractOibOrMbs(trimmed);
  if (!identifier) {
    throw new Error(`'${trimmed}' is not a valid Croatian OIB (11 digits) or MBS (numeric court registry number).`);
  }

  const token = await getAccessToken();
  const detail = await fetchDetail(identifier.tip, identifier.value, token);
  const output = mapDetail(detail);

  return {
    output,
    provenance: {
      source: "sudreg-data.gov.hr (Sudski registar — Croatian Court Register)",
      fetched_at: new Date().toISOString(),
    },
  };
});
