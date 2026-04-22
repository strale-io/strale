import { registerCapability, type CapabilityInput } from "./index.js";
import { deriveVatSE } from "../lib/vat-derivation.js";

// Swedish company data via Bolagsverket Värdefulla datamängder API (HVD).
// OAuth2 client_credentials, scope `vardefulla-datamangder:read`.
// Base: https://gw.api.bolagsverket.se/vardefulla-datamangder/v1
// Spec archived at docs/research/bolagsverket-hvd-swagger.json.
// DEC-20260405-A Phase 2: replaced Allabolag scraping with direct Bolagsverket API.

const TOKEN_URL = "https://portal.api.bolagsverket.se/oauth2/token";
const API = "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1";
const SCOPE = "vardefulla-datamangder:read";

const ORG_NUMBER_RE = /^(\d{6})-?(\d{4})$/;

function normaliseOrgNumber(raw: string): { orgnr10: string; formatted: string } | null {
  const cleaned = raw.replace(/[\s-]/g, "");
  const match = cleaned.match(/^(\d{6})(\d{4})$/);
  if (!match) return null;
  return { orgnr10: `${match[1]}${match[2]}`, formatted: `${match[1]}-${match[2]}` };
}

function findOrgNumberInText(input: string): string | null {
  const match = input.match(/\d{6}-?\d{4}/);
  if (!match) return null;
  const normalised = normaliseOrgNumber(match[0]);
  return normalised ? normalised.orgnr10 : null;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}
let tokenCache: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const id = process.env.BOLAGSVERKET_CLIENT_ID;
  const secret = process.env.BOLAGSVERKET_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "BOLAGSVERKET_CLIENT_ID and BOLAGSVERKET_CLIENT_SECRET are required.",
    );
  }
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: SCOPE,
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    throw new Error(`Bolagsverket token endpoint returned HTTP ${r.status}`);
  }
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) {
    throw new Error("Bolagsverket token endpoint returned no access_token.");
  }
  tokenCache = {
    token: d.access_token,
    expiresAt: now + (d.expires_in ?? 3600) * 1000,
  };
  return d.access_token;
}

// ─── Response types (subset of OrganisationerSvar, see swagger) ────────────────
interface Fel {
  typ?: string;
  felBeskrivning?: string | null;
}
interface KodKlartext {
  kod?: string | null;
  klartext?: string | null;
}
interface WithSource {
  dataproducent?: string | null;
  fel?: Fel | null;
}
interface OrganisationsnamnObjekt {
  namn?: string;
  organisationsnamntyp?: KodKlartext;
  registreringsdatum?: string | null;
  verksamhetsbeskrivningSarskiltForetagsnamn?: string | null;
}
interface Postadress {
  utdelningsadress?: string | null;
  postnummer?: string | null;
  postort?: string | null;
  land?: string | null;
  coAdress?: string | null;
}
interface PagaendeObj {
  kod?: string;
  klartext?: string | null;
  fromDatum?: string | null;
}
interface Organisation {
  organisationsidentitet?: { identitetsbeteckning?: string; typ?: KodKlartext };
  organisationsnamn?: WithSource & { organisationsnamnLista?: OrganisationsnamnObjekt[] };
  organisationsform?: WithSource & KodKlartext;
  juridiskForm?: WithSource & KodKlartext;
  registreringsland?: KodKlartext;
  verksamOrganisation?: WithSource & { kod?: "JA" | "NEJ" | null };
  organisationsdatum?: WithSource & { registreringsdatum?: string | null; infortHosScb?: string | null };
  avregistreradOrganisation?: WithSource & { avregistreringsdatum?: string | null };
  avregistreringsorsak?: WithSource & KodKlartext;
  postadressOrganisation?: WithSource & { postadress?: Postadress | null };
  verksamhetsbeskrivning?: WithSource & { beskrivning?: string | null };
  naringsgrenOrganisation?: WithSource & { sni?: KodKlartext[] | null };
  pagaendeAvvecklingsEllerOmstruktureringsforfarande?: WithSource & {
    pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista?: PagaendeObj[] | null;
  };
}
interface OrganisationerSvar {
  organisationer?: Organisation[];
}

function pickPrimaryName(lista?: OrganisationsnamnObjekt[]): string | null {
  if (!lista || lista.length === 0) return null;
  const primary = lista.find((n) => n.organisationsnamntyp?.kod === "FORETAGSNAMN");
  return (primary?.namn ?? lista[0]?.namn ?? null)?.trim() || null;
}

function alternativeNames(lista?: OrganisationsnamnObjekt[]): Array<{ name: string; type: string | null; registered_date: string | null }> {
  if (!lista) return [];
  return lista
    .filter((n) => n.organisationsnamntyp?.kod !== "FORETAGSNAMN" && n.namn)
    .map((n) => ({
      name: n.namn!.trim(),
      type: n.organisationsnamntyp?.klartext ?? n.organisationsnamntyp?.kod ?? null,
      registered_date: n.registreringsdatum ?? null,
    }));
}

function cleanDescription(text?: string | null): string | null {
  if (!text) return null;
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed || null;
}

function mapAddress(p?: Postadress | null): Record<string, string | null> | null {
  if (!p) return null;
  const street = p.utdelningsadress?.trim() || null;
  const postal_code = p.postnummer?.trim() || null;
  const city = p.postort?.trim() || null;
  const country = (p.land?.trim() || "Sverige") || null;
  const co_address = p.coAdress?.trim() || null;
  if (!street && !postal_code && !city) return null;
  return { street, postal_code, city, country, co_address };
}

function mapSniCodes(sni?: KodKlartext[] | null): Array<{ code: string; description: string }> {
  if (!sni) return [];
  return sni
    .map((s) => ({ code: (s.kod ?? "").trim(), description: (s.klartext ?? "").trim() }))
    .filter((s) => s.code && s.description);
}

function mapProcedures(list?: PagaendeObj[] | null): Array<{ code: string; description: string | null; from_date: string | null }> {
  if (!list) return [];
  return list.map((p) => ({
    code: p.kod ?? "",
    description: p.klartext ?? null,
    from_date: p.fromDatum ? p.fromDatum.split("T")[0] : null,
  })).filter((p) => p.code);
}

function toIsoDate(raw?: string | null): string | null {
  if (!raw) return null;
  return raw.includes("T") ? raw.split("T")[0] : raw;
}

function deriveStatus(org: Organisation): { status: "active" | "deregistered" | "unknown"; is_active: boolean | null } {
  const dereg = org.avregistreradOrganisation?.avregistreringsdatum;
  if (dereg) return { status: "deregistered", is_active: false };
  const kod = org.verksamOrganisation?.kod;
  if (kod === "JA") return { status: "active", is_active: true };
  if (kod === "NEJ") return { status: "deregistered", is_active: false };
  return { status: "unknown", is_active: null };
}

async function fetchOrganisation(orgnr10: string): Promise<Organisation> {
  const token = await getAccessToken();
  const requestId = crypto.randomUUID();
  const r = await fetch(`${API}/organisationer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      Accept: "application/json",
    },
    body: JSON.stringify({ identitetsbeteckning: orgnr10 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 400) {
    const body = (await r.json().catch(() => ({}))) as { detail?: string };
    throw new Error(
      body.detail ?? `Bolagsverket rejected org number ${orgnr10} as invalid.`,
    );
  }
  if (r.status === 404) {
    throw new Error(`No Swedish organisation found for ${orgnr10}.`);
  }
  if (!r.ok) {
    throw new Error(`Bolagsverket HVD API returned HTTP ${r.status}`);
  }
  const data = (await r.json()) as OrganisationerSvar;
  const org = data.organisationer?.[0];
  if (!org || !org.organisationsidentitet?.identitetsbeteckning) {
    throw new Error(`No Swedish organisation found for ${orgnr10}.`);
  }
  return org;
}

registerCapability(
  "swedish-company-data",
  async (input: CapabilityInput) => {
    const rawInput =
      (input.org_number as string) ??
      (input.identitetsbeteckning as string) ??
      (input.company_number as string) ??
      "";
    if (typeof rawInput !== "string" || !rawInput.trim()) {
      throw new Error(
        "'org_number' is required. Provide a 10-digit Swedish organisationsnummer (e.g. 556703-7485).",
      );
    }

    const trimmed = rawInput.trim();
    const normalised = normaliseOrgNumber(trimmed) ?? (() => {
      const found = findOrgNumberInText(trimmed);
      return found ? normaliseOrgNumber(found) : null;
    })();

    if (!normalised) {
      throw new Error(
        `'${trimmed}' is not a valid Swedish organisationsnummer. Provide 10 digits, optionally with a hyphen (e.g. 556703-7485). Name lookup is not supported by Bolagsverket's HVD API.`,
      );
    }

    const org = await fetchOrganisation(normalised.orgnr10);
    const status = deriveStatus(org);
    const nameList = org.organisationsnamn?.organisationsnamnLista;

    return {
      output: {
        company_name: pickPrimaryName(nameList),
        org_number: normalised.formatted,
        vat_number: deriveVatSE(normalised.formatted),
        country_code: "SE",
        company_type: org.organisationsform?.klartext ?? null,
        company_type_code: org.organisationsform?.kod ?? null,
        legal_form: org.juridiskForm?.klartext ?? null,
        legal_form_code: org.juridiskForm?.kod ?? null,
        status: status.status,
        is_active: status.is_active,
        registered_date: toIsoDate(org.organisationsdatum?.registreringsdatum),
        deregistered_date: toIsoDate(org.avregistreradOrganisation?.avregistreringsdatum),
        deregistration_reason: org.avregistreringsorsak?.klartext ?? null,
        registered_address: mapAddress(org.postadressOrganisation?.postadress),
        sni_codes: mapSniCodes(org.naringsgrenOrganisation?.sni),
        business_description: cleanDescription(org.verksamhetsbeskrivning?.beskrivning),
        ongoing_procedures: mapProcedures(
          org.pagaendeAvvecklingsEllerOmstruktureringsforfarande
            ?.pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista,
        ),
        alternative_names: alternativeNames(nameList),
      },
      provenance: {
        source: "Bolagsverket Värdefulla datamängder API",
        source_url: `${API}/organisationer`,
        fetched_at: new Date().toISOString(),
        attribution: "Källa: Bolagsverket",
        license: "CC BY 4.0",
        license_url: "https://creativecommons.org/licenses/by/4.0/",
        source_note: "EU Commission Implementing Regulation (EU) 2023/138",
      },
    };
  },
);

// Re-export regex for tests.
export { ORG_NUMBER_RE };
