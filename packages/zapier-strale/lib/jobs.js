// Platform-independent job definitions. n8n and Sheets can reuse this export;
// callers supply execute(slug, inputs), which returns the /v1/do envelope.
const field = (key, label, type = "string", required = false, extra = {}) => ({
  key,
  label,
  type,
  required,
  ...extra,
});
const country = field("country", "Country (ISO code)", "string", true);
const registration = field(
  "registration_number",
  "Registration number",
  "string"
);
const name = field("name", "Name", "string", true);
const common = [
  field("source", "Source"),
  field("fetched_at", "Source fetch time", "datetime"),
];
const routes = {
  GB: {
    slug: "uk-company-data",
    input: "company_number",
    output: "company_number",
  },
  SE: {
    slug: "swedish-company-data",
    input: "org_number",
    output: "org_number",
  },
  NO: {
    slug: "norwegian-company-data",
    input: "org_number",
    output: "org_number",
  },
  FI: {
    slug: "finnish-company-data",
    input: "business_id",
    output: "business_id",
  },
};
const time = "2026-10-27T12:00:00.000Z";
const companySample = {
  company_name: "Example Company",
  registration_number: "EXAMPLE",
  country: "GB",
  status: "active",
  address: "Example address",
  source: "Example registry",
  fetched_at: time,
};
const evidence = (r) => ({
  source: r.provenance?.source ?? null,
  fetched_at: r.provenance?.fetched_at ?? null,
});
function requiredText(value, label) {
  if (typeof value !== "string" || value.trim().length < 2)
    throw new JobInputError(`${label} must contain at least two characters.`);
  return value.trim();
}
function countryCode(value) {
  const code = requiredText(value, "Country").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code))
    throw new JobInputError("Use a two-letter country code.");
  return code === "UK" ? "GB" : code;
}
class JobInputError extends Error {}
const jobs = {
  lookup_company: {
    title: "Look Up a Company",
    description:
      "Look up a company by country and registration number, or by name where supported.",
    hidden: false,
    tools: Object.values(routes).map((r) => r.slug),
    inputFields: [
      { ...country, choices: Object.keys(routes) },
      registration,
      field("company_name", "Company name", "string", false, {
        helpText:
          "Name lookup in GB, NO and FI returns the best fuzzy match; check the registration number. Supply either a number or a name.",
      }),
    ],
    outputFields: [
      field("company_name", "Company name"),
      registration,
      country,
      field("status", "Registry status"),
      field("address", "Registered address"),
      ...common,
    ],
    sample: companySample,
    async run(i, execute) {
      const code = countryCode(i.country);
      const route = routes[code];
      if (!route) throw new JobInputError("Choose GB, SE, NO or FI.");
      if (i.registration_number && i.company_name)
        throw new JobInputError(
          "Supply a registration number or a company name, not both."
        );
      const inputs = i.registration_number
        ? {
            [route.input]: requiredText(
              i.registration_number,
              "Registration number"
            ),
          }
        : { company_name: requiredText(i.company_name, "Company name") };
      if (!i.registration_number && code === "SE")
        throw new JobInputError(
          "Swedish lookup requires a registration number."
        );
      const r = await execute(route.slug, inputs);
      const o = r.output;
      const a = o.registered_address;
      return {
        company_name: o.company_name ?? null,
        registration_number: o[route.output] ?? null,
        country: code,
        status: o.status ?? null,
        address:
          o.address ??
          (a
            ? [a.street, a.postal_code, a.city, a.country]
                .filter(Boolean)
                .join(", ")
            : null),
        ...evidence(r),
      };
    },
  },
  check_company_status: {
    title: "Check Company Status",
    description:
      "Check a company’s registry status and available insolvency notices.",
    hidden: true,
    tools: ["company-status-check"],
    inputFields: [country, { ...registration, required: true }],
    outputFields: [
      field("company_name", "Company name"),
      field("status", "Status"),
      field("registry_status_raw", "Original status"),
      field("identifier", "Registry identifier"),
      country,
      field("registry_name", "Registry"),
      field("insolvency_checked", "Insolvency checked", "boolean"),
      field("insolvency_notices_found", "Insolvency notices", "integer"),
      field("as_of", "As of", "datetime"),
      ...common,
    ],
    sample: {
      company_name: "Example Company",
      status: "active",
      registry_status_raw: "active",
      identifier: "EXAMPLE",
      country: "GB",
      registry_name: "Example registry",
      insolvency_checked: true,
      insolvency_notices_found: 0,
      as_of: time,
      source: "Example registry",
      fetched_at: time,
    },
    async run(i, execute) {
      const r = await execute("company-status-check", {
        country: countryCode(i.country),
        identifier: requiredText(i.registration_number, "Registration number"),
      });
      const o = r.output;
      return {
        company_name: o.company_name,
        status: o.status,
        registry_status_raw: o.registry_status_raw,
        identifier: o.identifier,
        country: o.country,
        registry_name: o.registry?.name ?? null,
        insolvency_checked: o.insolvency?.checked ?? null,
        insolvency_notices_found: o.insolvency?.notices_found ?? null,
        as_of: o.as_of,
        ...evidence(r),
      };
    },
  },
  check_eu_vat: {
    title: "Check an EU VAT Number",
    description:
      "Check an EU VAT number and return the name and address where available.",
    hidden: false,
    tools: ["vat-validate"],
    inputFields: [
      field(
        "vat_number",
        "EU VAT number including country prefix",
        "string",
        true
      ),
    ],
    outputFields: [
      field("valid", "Valid", "boolean"),
      field("vat_number", "VAT number"),
      field("company_name", "Company name"),
      field("company_address", "Company address"),
      field("country_code", "Country"),
      ...common,
    ],
    sample: {
      valid: false,
      vat_number: "EXAMPLE",
      company_name: "",
      company_address: "",
      country_code: "SE",
      source: "VIES",
      fetched_at: time,
    },
    async run(i, execute) {
      const r = await execute("vat-validate", {
        vat_number: requiredText(i.vat_number, "VAT number"),
      });
      const o = r.output;
      return {
        valid: o.valid,
        vat_number: o.vat_number,
        company_name: o.company_name ?? null,
        company_address: o.company_address ?? null,
        country_code: o.country_code,
        ...evidence(r),
      };
    },
  },
  screen_name: {
    title: "Screen a Name",
    description:
      "Screen a person’s name against sanctions and politically exposed person lists. Review potential matches yourself.",
    hidden: false,
    tools: ["sanctions-check", "pep-check"],
    inputFields: [
      name,
      field("country", "Country context (ISO code)", "string", false, {
        helpText:
          "Returned as context by the API; it does not narrow vendor matches.",
      }),
      field("birth_date", "Date of birth (YYYY-MM-DD)"),
    ],
    outputFields: [
      name,
      field("sanctions_match_count", "Potential sanctions matches", "integer"),
      field("pep_match_count", "Potential PEP matches", "integer"),
      field("sanctions_matches", "Sanctions matches JSON"),
      field("pep_matches", "PEP matches JSON"),
      field("sanctions_lists", "Sanctions lists JSON"),
      field("pep_lists", "PEP lists JSON"),
      field("sanctions_source", "Sanctions source"),
      field("pep_source", "PEP source"),
      field("sanctions_queried_at", "Sanctions queried at", "datetime"),
      field("pep_screened_at", "PEP screened at", "datetime"),
    ],
    sample: {
      name: "Example Person",
      sanctions_match_count: 0,
      pep_match_count: 0,
      sanctions_matches: "[]",
      pep_matches: "[]",
      sanctions_lists: "{}",
      pep_lists: "{}",
      sanctions_source: "Example source",
      pep_source: "Example source",
      sanctions_queried_at: time,
      pep_screened_at: time,
    },
    async run(i, execute) {
      const n = requiredText(i.name, "Name");
      const c = i.country ? { country: countryCode(i.country) } : {};
      if (
        i.birth_date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(i.birth_date) ||
          Number.isNaN(Date.parse(i.birth_date)) ||
          new Date(i.birth_date).toISOString().slice(0, 10) !== i.birth_date)
      )
        throw new JobInputError("Use a valid birth date in YYYY-MM-DD format.");
      // Sequential: do not start the second billable check if the first fails.
      const s = (
        await execute("sanctions-check", {
          name: n,
          entity_type: "person",
          ...c,
          ...(i.birth_date ? { birth_date: i.birth_date } : {}),
        })
      ).output;
      const p = (
        await execute("pep-check", {
          name: n,
          ...c,
          ...(i.birth_date ? { date_of_birth: i.birth_date } : {}),
        })
      ).output;
      return {
        name: n,
        sanctions_match_count: s.match_count,
        pep_match_count: p.match_count,
        sanctions_matches: JSON.stringify(s.matches),
        pep_matches: JSON.stringify(p.matches),
        sanctions_lists: JSON.stringify(s.lists_queried),
        pep_lists: JSON.stringify(p.lists_queried),
        sanctions_source: s.source,
        pep_source: p.source,
        sanctions_queried_at: s.queried_at,
        pep_screened_at: p.screened_at,
      };
    },
  },
  check_invoice_issuer: {
    title: "Check an Invoice Issuer",
    description:
      "Check an invoice issuer’s tax ID, registry status and potential name matches. Returns evidence for review.",
    hidden: true,
    tools: ["invoice-counterparty-check"],
    inputFields: [
      field("tax_id", "Tax ID including country prefix", "string", true),
      field("country", "Country (ISO code)"),
      field("company_id", "Registry identifier"),
      field("company_name", "Name on invoice"),
    ],
    outputFields: [
      field("tax_status", "Tax check status"),
      field("tax_valid", "Tax ID valid", "boolean"),
      field("tax_verification", "Tax verification method"),
      field("registered_name", "Registered name"),
      field("registry_check_status", "Registry check status"),
      field("company_status", "Company status"),
      field("sanctions_status", "Screening status"),
      field("potential_match_count", "Potential name matches", "integer"),
      field("name_match", "Invoice name comparison"),
      field("checks_completed", "Completed checks JSON"),
      field("checks_not_available", "Unavailable checks JSON"),
      field("checks_errored", "Errored checks JSON"),
      field("findings", "Findings JSON"),
      ...common,
    ],
    sample: {
      tax_status: "completed",
      tax_valid: false,
      tax_verification: "vies",
      registered_name: null,
      registry_check_status: "not_available",
      company_status: null,
      sanctions_status: "completed",
      potential_match_count: 0,
      name_match: null,
      checks_completed: '["tax_id","sanctions"]',
      checks_not_available: '["registry_status"]',
      checks_errored: "[]",
      findings: "[]",
      source: "Example sources",
      fetched_at: time,
    },
    async run(i, execute) {
      const inputs = {
        tax_id: requiredText(i.tax_id, "Tax ID"),
        ...(i.country ? { country: countryCode(i.country) } : {}),
        ...(i.company_id
          ? { company_id: requiredText(i.company_id, "Registry identifier") }
          : {}),
        ...(i.company_name
          ? { company_name: requiredText(i.company_name, "Company name") }
          : {}),
      };
      const r = await execute("invoice-counterparty-check", inputs);
      const o = r.output;
      return {
        tax_status: o.tax_id.status,
        tax_valid: o.tax_id.valid ?? null,
        tax_verification: o.tax_id.verification ?? null,
        registered_name:
          o.registry_status.registered_name ?? o.tax_id.registered_name ?? null,
        registry_check_status: o.registry_status.status,
        company_status: o.registry_status.company_status ?? null,
        sanctions_status: o.sanctions.status,
        potential_match_count: o.sanctions.potential_match_count ?? null,
        name_match: o.name_match?.match ?? null,
        checks_completed: JSON.stringify(o.checks_completed),
        checks_not_available: JSON.stringify(o.checks_not_available),
        checks_errored: JSON.stringify(o.checks_errored),
        findings: JSON.stringify(o.findings),
        ...evidence(r),
      };
    },
  },
};
module.exports = { jobs, JobInputError };
