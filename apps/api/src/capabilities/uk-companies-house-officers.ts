import { registerCapability, type CapabilityInput } from "./index.js";

// Reuses Companies House API — same free key as uk-company-data
const API = "https://api.company-information.service.gov.uk";
const COMPANY_NUMBER_RE = /^(SC|NI|OC|SO|NC|R|IP|SP|RS|NO|NP)?\d{6,8}$/i;

function getApiKey(): string {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) throw new Error("COMPANIES_HOUSE_API_KEY is required.");
  return key;
}

function authHeader(key: string): string {
  return `Basic ${Buffer.from(key + ":").toString("base64")}`;
}

registerCapability("uk-companies-house-officers", async (input: CapabilityInput) => {
  const raw = ((input.company_number as string) ?? (input.company_name as string) ?? (input.task as string) ?? "").trim();
  if (!raw) throw new Error("'company_number' or 'company_name' is required.");

  const key = getApiKey();
  let companyNumber = raw.replace(/[\s.-]/g, "").toUpperCase();

  // If not a company number, search for it
  if (!COMPANY_NUMBER_RE.test(companyNumber)) {
    const searchUrl = `${API}/search/companies?q=${encodeURIComponent(raw)}&items_per_page=1`;
    const sr = await fetch(searchUrl, {
      headers: { Accept: "application/json", Authorization: authHeader(key) },
      signal: AbortSignal.timeout(10000),
    });
    if (!sr.ok) throw new Error(`Companies House search returned HTTP ${sr.status}`);
    const sd = (await sr.json()) as any;
    if (!sd?.items?.length) throw new Error(`No UK company found matching "${raw}".`);
    companyNumber = sd.items[0].company_number;
  } else {
    companyNumber = companyNumber.padStart(8, "0");
  }

  // Fetch officers
  const url = `${API}/company/${companyNumber}/officers?items_per_page=100`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: authHeader(key) },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) throw new Error(`Company ${companyNumber} not found.`);
  if (!response.ok) throw new Error(`Companies House returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const items = data.items ?? [];

  const officers = items.map((o: any) => ({
    name: o.name,
    role: o.officer_role,
    appointed_on: o.appointed_on ?? null,
    resigned_on: o.resigned_on ?? null,
    nationality: o.nationality ?? null,
    country_of_residence: o.country_of_residence ?? null,
    occupation: o.occupation ?? null,
    date_of_birth: o.date_of_birth ? `${o.date_of_birth.year}-${String(o.date_of_birth.month).padStart(2, "0")}` : null,
    address: o.address ? [o.address.address_line_1, o.address.address_line_2, o.address.locality, o.address.postal_code].filter(Boolean).join(", ") : null,
  }));

  const active = officers.filter((o: any) => !o.resigned_on);
  const resigned = officers.filter((o: any) => o.resigned_on);

  return {
    output: {
      company_number: companyNumber,
      total_officers: data.total_results ?? officers.length,
      active_count: active.length,
      resigned_count: resigned.length,
      active_officers: active,
      resigned_officers: resigned.slice(0, 20),
    },
    provenance: { source: "api.company-information.service.gov.uk", fetched_at: new Date().toISOString() },
  };
});
