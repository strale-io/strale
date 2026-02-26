import { registerCapability, type CapabilityInput } from "./index.js";

// LEI (Legal Entity Identifier) lookup via GLEIF API — free, no auth required
const GLEIF_API = "https://api.gleif.org/api/v1";

// LEI format: 20 alphanumeric characters
const LEI_RE = /^[A-Z0-9]{20}$/;

async function lookupByLei(lei: string): Promise<Record<string, unknown>> {
  const url = `${GLEIF_API}/lei-records/${lei}`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    throw new Error(`LEI ${lei} not found in GLEIF database.`);
  }
  if (!response.ok) throw new Error(`GLEIF API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  return parseGleifRecord(data.data);
}

async function searchByName(name: string): Promise<Record<string, unknown>> {
  const url = `${GLEIF_API}/lei-records?filter[entity.legalName]=${encodeURIComponent(name)}&page[size]=1`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GLEIF API search returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const records = data?.data;
  if (!records || records.length === 0) {
    throw new Error(`No LEI found matching "${name}".`);
  }
  return parseGleifRecord(records[0]);
}

function parseGleifRecord(record: any): Record<string, unknown> {
  const entity = record?.attributes?.entity || {};
  const registration = record?.attributes?.registration || {};

  const legalAddress = entity.legalAddress || {};
  const hqAddress = entity.headquartersAddress || {};

  return {
    lei: record?.attributes?.lei || record?.id || "",
    legal_name: entity.legalName?.name || "",
    jurisdiction: entity.jurisdiction || null,
    category: entity.category || null,
    legal_form: entity.legalForm?.id || null,
    status: entity.status || null,
    registration_status: registration.status || null,
    initial_registration_date: registration.initialRegistrationDate || null,
    last_update_date: registration.lastUpdateDate || null,
    legal_address: {
      line1: legalAddress.addressLines?.[0] || null,
      city: legalAddress.city || null,
      country: legalAddress.country || null,
      postal_code: legalAddress.postalCode || null,
    },
    headquarters_address: {
      line1: hqAddress.addressLines?.[0] || null,
      city: hqAddress.city || null,
      country: hqAddress.country || null,
      postal_code: hqAddress.postalCode || null,
    },
  };
}

registerCapability("lei-lookup", async (input: CapabilityInput) => {
  const raw = (input.lei as string) ?? (input.company_name as string) ?? (input.task as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'lei' or 'company_name' is required. Provide a 20-character LEI code or company name.");
  }

  const trimmed = raw.trim().toUpperCase();
  let result: Record<string, unknown>;

  if (LEI_RE.test(trimmed)) {
    result = await lookupByLei(trimmed);
  } else {
    result = await searchByName(raw.trim());
  }

  return {
    output: result,
    provenance: {
      source: "gleif.org",
      fetched_at: new Date().toISOString(),
    },
  };
});
