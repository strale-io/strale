// Austria — Firmenbuch via the JustizOnline IWG/HVD API (direct official API).
//
// Replaces the Openapi.com WW-Top vendor-aggregator path (2026-05-16 →
// 2026-08-27, never activated in prod — it stayed double-gated behind
// OPENAPI_ENABLED pending the case-151296 countersignature). The IWG reuse
// grant to Moonlighter AB (token issued by BRZ/JustizOnline 2026-08-27,
// terms CC BY 4.0) is the exact reactivation trigger named in
// DEC-20260427-I-6: "licensed contract with the Austrian Justizministerium
// for direct Firmenbuch API access". Preference-order top per DEC-20260813-A.
//
// API: SOAP 1.2, X-API-KEY header auth. The WSDL itself requires the key
// (401 without). Spring-WS validates requests strictly: every element of a
// request type must be present, in schema order — empty elements are fine,
// missing ones are a 400.
//   Endpoint: https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws
//   WSDL:     .../ws/fbw.wsdl
//   Community docs: github.com/Open-Justiz-Online/companyregister-api-documentation
//
// Two operations used:
//   SUCHEFIRMAREQUEST  — name search → candidates {FNR, NAME, SITZ, ...}
//   AUSZUG_V2_REQUEST  — extract by FNR, UMFANG=Kurzinformation:
//                        name, address, seat, legal form, court, first
//                        registration date, homepage, EUID, and current
//                        officers with role + representation authority.
//
// Fault behaviour (verified live 2026-08-27): invalid/unknown FNR → SOAP
// Fault (HTTP 500) with a German-language Reason text; zero-hit search →
// HTTP 200 with no ERGEBNIS blocks.

import { registerCapability, type CapabilityInput } from "./index.js";
import { firstString } from "./lib/input-aliases.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { pickByName } from "../lib/company-name-match.js";

const FBW_ENDPOINT = "https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws";

function normaliseFnr(raw: string): { fnr: string; formatted: string } | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^fn\s*/, "")
    .replace(/[\s.-]/g, "");
  const m = cleaned.match(/^(\d{1,6})([a-z])$/);
  if (!m) return null;
  const digits = m[1];
  // The registry accepts both padded and unpadded; send zero-padded (the
  // form the search endpoint itself returns, e.g. "093363z").
  return {
    fnr: `${digits.padStart(6, "0")}${m[2]}`,
    formatted: `FN ${String(Number(digits))} ${m[2]}`,
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function requireApiKey(): string {
  const key = process.env.JUSTIZONLINE_API_KEY;
  if (!key) {
    throw new Error(
      "JUSTIZONLINE_API_KEY is required (IWG token issued by JustizOnline/BRZ).",
    );
  }
  return key;
}

async function soapCall(bodyXml: string): Promise<string> {
  const r = await fetch(FBW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
      "X-API-KEY": requireApiKey(),
    },
    body: bodyXml,
    signal: AbortSignal.timeout(12_000),
  });
  const text = await r.text();
  // SOAP faults arrive as HTTP 500 with a structured Fault body; surface
  // the human-readable Reason rather than the raw envelope. A fault about
  // the Firmenbuchnummer itself ("Firmenbuchnummer ist ungültig!") is the
  // caller's input being wrong, not the upstream failing — type it as a
  // refusal so it cannot trip the circuit breaker or the quality floor.
  const fault = text.match(
    /<(?:\w+:)?Fault[\s>][\s\S]*?<(?:\w+:)?Text[^>]*>([\s\S]*?)<\/(?:\w+:)?Text>/,
  );
  if (fault) {
    const reason = decodeXml(fault[1].trim());
    if (/firmenbuchnummer/i.test(reason)) {
      throw new CapabilityRefusalError(
        `The registry rejected the Firmenbuchnummer: ${reason}`,
      );
    }
    throw new Error(`Firmenbuch API fault: ${reason}`);
  }
  if (!r.ok) {
    throw new Error(`Firmenbuch API returned HTTP ${r.status}`);
  }
  return text;
}

// ─── Name search ──────────────────────────────────────────────────────────────

interface SearchHit {
  fnr: string;
  name: string;
  seat: string | null;
  legal_form: string | null;
  status: string | null;
}

function buildSearchEnvelope(name: string, exact: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:suc="ns://firmenbuch.justiz.gv.at/Abfrage/SucheFirmaRequest">
  <soap:Body>
    <suc:SUCHEFIRMAREQUEST>
      <suc:FIRMENWORTLAUT>${escapeXml(name)}</suc:FIRMENWORTLAUT>
      <suc:EXAKTESUCHE>${exact}</suc:EXAKTESUCHE>
      <suc:SUCHBEREICH>1</suc:SUCHBEREICH>
      <suc:GERICHT></suc:GERICHT>
      <suc:RECHTSFORM></suc:RECHTSFORM>
      <suc:RECHTSEIGENSCHAFT></suc:RECHTSEIGENSCHAFT>
      <suc:ORTNR></suc:ORTNR>
    </suc:SUCHEFIRMAREQUEST>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Strip SOAP namespace prefixes from ELEMENT NAMES only (`<ns6:FNR>` →
 * `<FNR>`). A global prefix strip would also corrupt text content like
 * "TEAM:WORK AG"; element names are safe because `<` is always escaped
 * inside XML text nodes. Attribute prefixes (`ns6:AUFRECHT="..."`) are left
 * in place — every attribute regex below matches the local name as a
 * substring, which works with or without the prefix.
 */
function stripNs(xml: string): string {
  return xml.replace(/(<\/?)[A-Za-z][A-Za-z0-9]*:/g, "$1");
}

/** Decode the five predefined XML entities plus numeric character refs. */
function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function grabIn(block: string, tag: string): string | null {
  const raw = block
    .match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]
    ?.trim();
  return raw ? decodeXml(raw) : null;
}

function parseSearchResults(xml: string): SearchHit[] {
  const plain = stripNs(xml);
  const hits: SearchHit[] = [];
  for (const m of plain.matchAll(/<ERGEBNIS>([\s\S]*?)<\/ERGEBNIS>/g)) {
    const block = m[1];
    const grab = (tag: string) => grabIn(block, tag);
    const fnr = grab("FNR");
    const name = grab("NAME");
    if (!fnr || !name) continue;
    const legalFormRaw = block.match(
      /<RECHTSFORM>[\s\S]*?<TEXT>([^<]*)<\/TEXT>[\s\S]*?<\/RECHTSFORM>/,
    )?.[1]?.trim();
    const legalForm = legalFormRaw ? decodeXml(legalFormRaw) : null;
    hits.push({
      fnr,
      name,
      seat: grab("SITZ"),
      legal_form: legalForm,
      status: grab("STATUS"),
    });
  }
  return hits;
}

async function resolveByName(name: string): Promise<SearchHit> {
  // Exact search first; fall back to fuzzy only if exact finds nothing.
  let hits = parseSearchResults(await soapCall(buildSearchEnvelope(name, true)));
  if (hits.length === 0) {
    hits = parseSearchResults(await soapCall(buildSearchEnvelope(name, false)));
  }
  // Shared scorer (suffix stripping, diacritic folding, refuse-on-ambiguity):
  // "voestalpine" resolves against "voestalpine AG", while the two distinct
  // Red Bull entities (Red Bull GmbH / RED BULL GmbH, different FNs) refuse
  // with a candidate list. Throws CapabilityRefusalError on no-match and
  // ambiguity, which the circuit breaker and quality floor recognise.
  const resolved = pickByName(name, hits, (h) => h.name, (h) => h.fnr, {
    subjectLabel: "Austrian company",
    disambiguationHint:
      'Call again with \'registration_number\' (Firmenbuchnummer, e.g. "FN 93363 z").',
  });
  return resolved.candidate;
}

// ─── Extract (Auszug v2, Kurzinformation) ─────────────────────────────────────

function buildAuszugEnvelope(fnr: string): string {
  // STICHTAG is interpreted in the registry's timezone; the UTC date is a day
  // behind Vienna between midnight and 01:00/02:00 CET/CEST.
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
  }).format(new Date());
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:az="ns://firmenbuch.justiz.gv.at/Abfrage/v2/AuszugRequest">
  <soap:Body>
    <az:AUSZUG_V2_REQUEST>
      <az:FNR>${escapeXml(fnr)}</az:FNR>
      <az:STICHTAG>${today}</az:STICHTAG>
      <az:UMFANG>Kurzinformation</az:UMFANG>
    </az:AUSZUG_V2_REQUEST>
  </soap:Body>
</soap:Envelope>`;
}

interface Representative {
  type: "person" | "organisation";
  name: string;
  role: string;
  role_code: string | null;
  role_group: string;
  start_date: string | null;
  date_of_birth: string | null;
  representation: string | null;
}

/** "19440310" → "1944-03-10" */
function toIsoDate(yyyymmdd: string | null | undefined): string | null {
  const m = yyyymmdd?.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Among repeated DKZ blocks of one kind, return the body of the current one
 * (AUFRECHT="true"). Amended entries keep their historical AUFRECHT="false"
 * blocks alongside the current block, so "first match" is wrong whenever an
 * entry was ever amended.
 */
function currentIn(scope: string, tag: string): string | null {
  for (const m of scope.matchAll(
    new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)</${tag}>`, "g"),
  )) {
    if (m[1].includes('AUFRECHT="true"')) return m[2];
  }
  return null;
}

export function parseAuszug(xml: string) {
  const plain = stripNs(xml);
  const header = plain.match(/<AUSZUG_V2_RESPONSE([^>]*)>/)?.[1] ?? "";
  const attr = (name: string) =>
    header.match(new RegExp(`${name}="([^"]*)"`))?.[1]?.trim() || null;

  const nameBlock = currentIn(plain, "FI_DKZ02");
  const addrBlock = currentIn(plain, "FI_DKZ03");
  const seatBlock = currentIn(plain, "FI_DKZ06");
  const formBlock = currentIn(plain, "FI_DKZ07");
  const courtBlock = currentIn(plain, "FI_DKZ09");
  const homepageBlock = currentIn(plain, "FI_DKZ25");

  const companyName = nameBlock ? grabIn(nameBlock, "BEZEICHNUNG") : null;

  let address: string | null = null;
  if (addrBlock) {
    const street = grabIn(addrBlock, "STRASSE");
    const number = grabIn(addrBlock, "HAUSNUMMER");
    const plz = grabIn(addrBlock, "PLZ");
    const city = grabIn(addrBlock, "ORT");
    const stiege = grabIn(addrBlock, "STIEGE");
    const tuer = grabIn(addrBlock, "TUER");
    const line1 = [street, number, stiege, tuer].filter(Boolean).join(" ");
    const line2 = [plz, city].filter(Boolean).join(" ");
    address = [line1, line2].filter(Boolean).join(", ") || null;
  }

  const legalFormBlock = formBlock?.match(
    /<RECHTSFORM>([\s\S]*?)<\/RECHTSFORM>/,
  )?.[1];
  const courtInner = courtBlock?.match(/<HGALT>([\s\S]*?)<\/HGALT>/)?.[1];

  // Officers are a join: <FUN> blocks (role + representation authority)
  // reference a sibling <PER> block (person identity) through the PNR key
  // attribute. PNR values carry leading whitespace (' DR') — trim for the
  // join, never assume they are clean.
  const persons = new Map<
    string,
    { name: string | null; birth: string | null }
  >();
  for (const pm of plain.matchAll(/<PER([^>]*)>([\s\S]*?)<\/PER>/g)) {
    const pnr = pm[1].match(/PNR="([^"]*)"/)?.[1]?.trim();
    if (!pnr) continue;
    const block = currentIn(pm[2], "PE_DKZ02");
    if (!block) continue;
    const formatted = grabIn(block, "NAME_FORMATIERT");
    const bare = [grabIn(block, "VORNAME"), grabIn(block, "NACHNAME")]
      .filter(Boolean)
      .join(" ");
    persons.set(pnr, {
      name: formatted ?? (bare || null),
      birth: grabIn(block, "GEBURTSDATUM"),
    });
  }

  const representatives: Representative[] = [];
  for (const fm of plain.matchAll(/<FUN([^>]*)>([\s\S]*?)<\/FUN>/g)) {
    const funAttrs = fm[1];
    const roleCode = funAttrs.match(/FKEN="([^"]*)"/)?.[1]?.trim() || null;
    const roleText = funAttrs.match(/FKENTEXT="([^"]*)"/)?.[1]?.trim() || null;
    const pnr = funAttrs.match(/PNR="([^"]*)"/)?.[1]?.trim() || null;
    const dkz = currentIn(fm[2], "FU_DKZ10");
    if (!dkz) continue; // former officer, or amended entry with no current block
    const person = pnr ? persons.get(pnr) : undefined;
    if (!person?.name) continue;
    const reprText = [...dkz.matchAll(/<TEXT>([^<]*)<\/TEXT>/g)]
      .map((t) => decodeXml(t[1].trim()))
      .join(" ");
    representatives.push({
      // Kurzinformation officer entries resolve to PE_DKZ02 natural-person
      // blocks; the PER join only yields natural persons at this UMFANG.
      type: "person",
      name: person.name,
      role: roleText ?? roleCode ?? "Officer",
      role_code: roleCode,
      role_group: "management",
      start_date: toIsoDate(grabIn(dkz, "DATVON")),
      date_of_birth: toIsoDate(person.birth),
      representation: reprText || null,
    });
  }

  // Legal facts (RECHTSTATSACHE): coded registry events — insolvency opened
  // (0930), dissolution (0938), liquidation, continuation. Verified live
  // 2026-08-27 against NIKI Luftfahrt GmbH (FN 230533 w): still registered,
  // carrying "KONKURS eröffnet" and "…infolge Eröffnung des
  // Konkursverfahrens aufgelöst." as current facts.
  const legalFacts: Array<{
    code: string | null;
    date: string | null;
    reference: string | null;
    text: string | null;
  }> = [];
  for (const rm of plain.matchAll(
    /<RECHTSTATSACHE[^>]*>([\s\S]*?)<\/RECHTSTATSACHE>/g,
  )) {
    const dkz = currentIn(rm[1], "RTS_DKZ50");
    if (!dkz) continue;
    const texts = [...dkz.matchAll(/<TEXT>([^<]*)<\/TEXT>/g)]
      .map((t) => decodeXml(t[1].trim()))
      .join(" ");
    legalFacts.push({
      code: grabIn(dkz, "CODE"),
      date: grabIn(dkz, "DATUM_VOM"),
      reference: grabIn(dkz, "ZEICHEN"),
      text: texts || null,
    });
  }

  return {
    company_name: companyName,
    address,
    seat: seatBlock ? grabIn(seatBlock, "SITZ") : null,
    legal_form: legalFormBlock ? grabIn(legalFormBlock, "TEXT") : null,
    legal_form_code: legalFormBlock ? grabIn(legalFormBlock, "CODE") : null,
    court: courtInner ? grabIn(courtInner, "TEXT") : null,
    court_code: courtInner ? grabIn(courtInner, "CODE") : null,
    first_registered_date: toIsoDate(
      courtBlock ? grabIn(courtBlock, "DATERST") : null,
    ),
    historical_registration_number: courtBlock
      ? grabIn(courtBlock, "HRAHRB")
      : null,
    homepage: homepageBlock ? grabIn(homepageBlock, "HOMEPAGE") : null,
    // EUID lives in its own wrapper block (no AUFRECHT lifecycle); the inner
    // <EUID> text node is the value, and [^<]* skips the wrapper.
    euid: grabIn(plain, "EUID"),
    representatives,
    legal_facts: legalFacts,
    source_as_of: attr("ABFRAGEZEITPUNKT"),
    source_checksum: attr("PRUEFSUMME"),
  };
}

// ─── Capability ───────────────────────────────────────────────────────────────

registerCapability("austrian-company-data", async (input: CapabilityInput) => {
  const rawFnr = firstString(
    input,
    "registration_number",
    "fnr",
    "fn_number",
    "identifier",
  );
  const rawName = firstString(input, "company_name", "name");

  let fnr: string;
  let formattedFnr: string;
  let resolvedVia: "registration_number" | "company_name";
  let searchStatus: string | null = null;

  if (rawFnr) {
    const normalised = normaliseFnr(rawFnr);
    if (!normalised) {
      throw new CapabilityRefusalError(
        `'${rawFnr.trim()}' is not a valid Austrian Firmenbuchnummer. Expected up to 6 digits plus a check letter (e.g. "FN 93363 z"). Alternatively provide 'company_name' for a registry name search.`,
      );
    }
    fnr = normalised.fnr;
    formattedFnr = normalised.formatted;
    resolvedVia = "registration_number";
  } else if (rawName.trim().length >= 2) {
    const hit = await resolveByName(rawName.trim());
    const normalised = normaliseFnr(hit.fnr);
    if (!normalised) {
      throw new Error(
        `Firmenbuch search returned an unparseable Firmenbuchnummer '${hit.fnr}' for '${rawName.trim()}'.`,
      );
    }
    fnr = normalised.fnr;
    formattedFnr = normalised.formatted;
    resolvedVia = "company_name";
    searchStatus = hit.status;
  } else if (firstString(input, "vat_number", "uid")) {
    // The WW-Top era accepted only UID (VAT) input. The Firmenbuch is keyed
    // by FN and offers no UID lookup, so tell retired-contract callers what
    // changed instead of a generic "field required".
    throw new CapabilityRefusalError(
      "The 'vat_number' input was retired when this capability moved to the official Firmenbuch API — UID numbers cannot be resolved to Firmenbuch entries. Provide 'registration_number' (e.g. \"FN 93363 z\") or 'company_name' instead.",
    );
  } else {
    throw new CapabilityRefusalError(
      "'registration_number' (Firmenbuchnummer, e.g. \"FN 93363 z\") or 'company_name' is required.",
    );
  }

  const auszugXml = await soapCall(buildAuszugEnvelope(fnr));
  const parsed = parseAuszug(auszugXml);

  if (!parsed.company_name) {
    throw new CapabilityRefusalError(
      `Firmenbuch returned no current registration data for ${formattedFnr}. The company may be struck off (gelöscht); historical extracts are not part of this capability.`,
    );
  }

  // Status: the register has no boolean status field. Dissolution surfaces
  // as a current RECHTSTATSACHE ("…aufgelöst", e.g. on insolvency); an entity
  // can be dissolved yet still registered while winding up. The raw facts are
  // in legal_facts; status_note carries the dissolution wording (or, on the
  // name path, the search STATUS marker).
  const dissolution = parsed.legal_facts.find((f) =>
    /aufgel(ö|oe?)st/i.test(f.text ?? ""),
  );
  const status = dissolution ? "dissolved" : "active";
  const statusNote = dissolution?.text ?? searchStatus ?? null;

  return {
    output: {
      company_name: parsed.company_name,
      registration_number: formattedFnr,
      euid: parsed.euid,
      country_code: "AT",
      legal_form: parsed.legal_form,
      legal_form_code: parsed.legal_form_code,
      status,
      status_note: statusNote,
      is_active: status === "active",
      registered_address: parsed.address,
      seat: parsed.seat,
      court: parsed.court,
      court_code: parsed.court_code,
      first_registered_date: parsed.first_registered_date,
      historical_registration_number: parsed.historical_registration_number,
      homepage: parsed.homepage,
      legal_facts: parsed.legal_facts,
      resolved_via: resolvedVia,
      // Evidence Tier 1 canonical aliases (DEC-20260518-A)
      legal_name: parsed.company_name,
      primary_registration_id: formattedFnr,
      date_incorporated: parsed.first_registered_date,
      legal_representatives: parsed.representatives,
      total_legal_representatives: parsed.representatives.length,
      // Legacy convention (NO/CZ/EE/SK): name-only list. All Kurzinformation
      // officers are natural persons (the PER join yields nothing else), so
      // no type filter is needed.
      directors: parsed.representatives.map((r) => r.name),
      // Evidence Tier framework labels (DEC-20260518-A). Length-gated.
      tier_2_available: parsed.representatives.length > 0,
      tier_2_available_reason:
        parsed.representatives.length > 0
          ? "Current officers (role, representation authority, start date) extracted from the Firmenbuch Kurzinformation extract."
          : "No current officers listed in the Firmenbuch Kurzinformation extract for this entity.",
      ubo_availability: "unavailable_no_registry",
      ubo_availability_reason:
        "Austrian UBO data lives in the WiEReg (Wirtschaftliche Eigentümer Registergesetz register), which has no free public API; access requires a paid BMF account.",
      source_checksum: parsed.source_checksum,
      source_as_of: parsed.source_as_of,
    },
    provenance: {
      source: "Firmenbuch (Republik Österreich) via JustizOnline IWG/HVD API",
      source_url: FBW_ENDPOINT,
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: `${FBW_ENDPOINT} (AUSZUG_V2, FNR ${fnr})`,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      attribution:
        "Quelle: Firmenbuch der Republik Österreich (Bundesministerium für Justiz), JustizOnline IWG/HVD-Schnittstelle, Lizenz CC BY 4.0.",
      source_note:
        "EU High-Value Dataset per Implementing Regulation (EU) 2023/138 Annex 5. IWG reuse authorisation issued to Moonlighter AB by BRZ/JustizOnline, 2026-08-27.",
    },
  };
});

// Re-exported for tests.
export { normaliseFnr, parseSearchResults };
