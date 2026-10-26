import { registerCapability, getDirectExecutor, type CapabilityInput } from "./index.js";
import { gleifFetch } from "./lib/gleif.js";
import { EntityResolveError, parseIdentifier } from "./lib/entity-identifier.js";
import "./vat-validate.js";

type GleifRecord = {
  id: string;
  attributes: {
    lei: string;
    entity: {
      legalName: { name: string }; jurisdiction?: string; legalForm?: { id?: string };
      registeredAt?: { id?: string }; registeredAs?: string; status?: string;
      legalAddress?: Record<string, unknown>; headquartersAddress?: { country?: string };
    };
    registration?: { status?: string }; bic?: string[] | null;
  };
};
type Document = {
  data: unknown;
  meta?: { pagination?: { total?: number }; goldenCopy?: { publishDate?: string } };
};
async function request(path: string, allow404 = false): Promise<Document | null> {
  const response = await gleifFetch(path);
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new EntityResolveError("execution_failed", "GLEIF is unavailable. Retry later.", { upstream_status: response.status });
  const body = await response.json();
  if (!body || body.errors || !("data" in body)) throw new EntityResolveError("execution_failed", "GLEIF returned an invalid response. Retry later.");
  return body;
}
function search(filters: Record<string, string>): Promise<Document | null> {
  const query = new URLSearchParams({ "page[size]": "2" });
  for (const [key, value] of Object.entries(filters)) query.set(`filter[${key}]`, value);
  return request(`/lei-records?${query}`);
}
function records(doc: Document | null): GleifRecord[] {
  if (!doc) return [];
  if (!Array.isArray(doc.data)) throw new EntityResolveError("execution_failed", "GLEIF returned an invalid result set. Retry later.");
  return doc.data;
}
function unique(doc: Document | null): GleifRecord | undefined {
  const rows = records(doc);
  if (rows.length > 1 || (doc?.meta?.pagination?.total ?? 0) > 1) return undefined;
  return rows[0];
}

export async function resolveEntity(input: CapabilityInput) {
  const { identifier, type, country } = parseIdentifier(input);
  const match_method = { lei: "lei_direct", isin: "isin_mapping", bic: "bic_mapping", registry: "registry_id", vat: "name_country" }[type];
  const confidence = type === "vat" ? "probable" : "exact";
  const fetchedAt = new Date().toISOString();
  let vatProvenance: Record<string, unknown> | undefined;
  let confirmedVat: string | undefined;
  const result = (output: Record<string, unknown>) => ({ output, provenance: {
    source: type === "vat" ? "GLEIF; VIES via vat-validate" : "GLEIF",
    fetched_at: fetchedAt, acquisition_method: "direct_api", data_access_lane: "preferred", upstream_vendor: "gleif",
    ...(vatProvenance ? { vat_validation: vatProvenance } : {}),
  } });
  const unresolved = (reason: string) => result({ resolved: false, reason, as_of: fetchedAt });
  try {
    let doc: Document | null;
    let record: GleifRecord | undefined;
    if (type === "lei") {
      doc = await request(`/lei-records/${identifier}`, true);
      if (doc) record = doc.data as GleifRecord;
    } else if (type === "vat") {
      const validate = getDirectExecutor("vat-validate");
      if (!validate) throw new EntityResolveError("execution_failed", "VAT validation is unavailable. Retry later.");
      const vat = await validate({ vat_number: identifier });
      vatProvenance = vat.provenance;
      if (vat.output.stale === true) throw new EntityResolveError("execution_failed", "Fresh VAT validation is unavailable. Retry later.");
      if (vat.output.valid === false) return unresolved("vat_not_valid");
      if (vat.output.valid !== true) throw new EntityResolveError("execution_failed", "VAT validation returned an invalid response. Retry later.");
      confirmedVat = identifier;
      const name = vat.output.company_name;
      if (typeof name !== "string" || !name.trim() || /^[\s.-]+$/.test(name)) return unresolved("vat_legal_name_unavailable");
      const vatCountry = identifier.startsWith("EL") ? "GR" : identifier.startsWith("XI") ? "GB" : identifier.slice(0, 2);
      doc = await search({ "entity.legalName": name, "entity.legalAddress.country": vatCountry });
      record = unique(doc);
      // Name searches are partial/fuzzy; never pick a merely similar legal name.
      if (record && (record.attributes.entity.legalName.name.trim().toUpperCase() !== name.trim().toUpperCase()
        || record.attributes.entity.legalAddress?.country !== vatCountry)) return unresolved("no_name_country_match");
    } else if (type === "registry") {
      // Discover only this number's candidates; never download the authority list.
      doc = await search({ "entity.registeredAs": identifier, "entity.legalAddress.country": country! });
      record = unique(doc);
      if (record) {
        const entity = record.attributes.entity;
        const authority = entity.registeredAt?.id;
        if (!authority || authority === "RA999999") return unresolved("registration_authority_unavailable");
        const authorityDoc = await request(`/registration-authorities/${encodeURIComponent(authority)}`);
        const jurisdictions = (authorityDoc?.data as { attributes?: { jurisdictions?: { countryCode: string }[] } })?.attributes?.jurisdictions;
        if (!jurisdictions?.some(j => j.countryCode === country)) return unresolved("registry_country_mismatch");
        doc = await search({ "entity.registeredAs": identifier, "entity.registeredAt": authority });
        record = unique(doc);
        if (record && (record.attributes.entity.registeredAs?.toUpperCase() !== identifier || record.attributes.entity.registeredAt?.id !== authority)) {
          throw new EntityResolveError("execution_failed", "GLEIF returned inconsistent registry identifiers. Retry later.");
        }
      }
    } else {
      doc = await search({ [type]: type === "bic" && identifier.length === 8 ? `${identifier}XXX` : identifier });
      record = unique(doc);
    }
    if (!record) return unresolved((doc?.meta?.pagination?.total ?? records(doc).length) > 1 ? "multiple_entities_matched" : "no_gleif_match");
    const a = record.attributes;
    const e = a?.entity;
    if (!a?.lei || !e?.legalName?.name || (type === "lei" && a.lei !== identifier)) {
      throw new EntityResolveError("execution_failed", "GLEIF returned incomplete entity data. Retry later.");
    }
    const isins = await request(`/lei-records/${encodeURIComponent(a.lei)}/isins?page[size]=1`);
    const isin_count = isins?.meta?.pagination?.total;
    if (!Number.isInteger(isin_count) || isin_count! < 0) throw new EntityResolveError("execution_failed", "GLEIF returned an invalid ISIN count. Retry later.");
    return result({ resolved: true, match_method, confidence,
      entity: {
        legal_name: e.legalName.name, lei: a.lei, lei_status: a.registration?.status ?? null,
        jurisdiction: e.jurisdiction ?? null, legal_form: e.legalForm?.id ?? null,
        registration_authority_id: e.registeredAt?.id ?? null, registry_number: e.registeredAs ?? null,
        entity_status: e.status ?? null, headquarters_country: e.headquartersAddress?.country ?? null,
        legal_address: e.legalAddress ?? null,
      },
      identifiers: { lei: a.lei, bic: a.bic ?? [], isin_count,
        ...(confirmedVat ? { vat: confirmedVat } : {}), registry_number: e.registeredAs ?? null },
      as_of: doc?.meta?.goldenCopy?.publishDate ?? fetchedAt,
    });
  } catch (error) {
    if (error instanceof EntityResolveError) throw error;
    throw new EntityResolveError("execution_failed", "Entity resolution upstream failed. Retry later.");
  }
}
registerCapability("entity-resolve", resolveEntity);
