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
  check_iban: {
    title: "Check an IBAN",
    description:
      "Check an IBAN’s format, length and checksum, and return its country and bank code. Does not confirm the account is open.",
    hidden: false,
    tools: ["iban-validate"],
    inputFields: [field("iban", "IBAN", "string", true)],
    outputFields: [
      field("valid", "Valid", "boolean"),
      field("country_code", "Country"),
      field("bank_code", "Bank code"),
      field("branch_code", "Branch code"),
      field("reason", "Reason when not valid"),
      ...common,
    ],
    sample: {
      valid: true,
      country_code: "SE",
      bank_code: "500",
      branch_code: null,
      reason: null,
      source: "iban-validate:algorithmic",
      fetched_at: time,
    },
    async run(i, execute) {
      const r = await execute("iban-validate", {
        iban: requiredText(i.iban, "IBAN"),
      });
      const o = r.output;
      return {
        valid: o.valid,
        country_code: o.country_code || null,
        bank_code: o.bank_code || null,
        branch_code: o.branch_code || null,
        reason: o.error ?? null,
        ...evidence(r),
      };
    },
  },
  check_email: {
    title: "Check an Email Address",
    description:
      "Check an email address’s format, mail-server records and disposable domain. Does not confirm the mailbox exists.",
    hidden: false,
    tools: ["email-validate"],
    inputFields: [field("email", "Email address", "string", true)],
    outputFields: [
      field("valid", "Valid", "boolean"),
      field("email", "Email address"),
      field("format_valid", "Format valid", "boolean"),
      field("domain", "Domain"),
      field("has_mx_records", "Has mail-server records", "boolean"),
      field("is_disposable", "Disposable domain", "boolean"),
      field("is_role_address", "Role address", "boolean"),
      field("is_free_provider", "Free email provider", "boolean"),
      field("did_you_mean", "Suggested correction"),
      field("reason", "Reason when not valid"),
      ...common,
    ],
    sample: {
      valid: true,
      email: "person@example.com",
      format_valid: true,
      domain: "example.com",
      has_mx_records: true,
      is_disposable: false,
      is_role_address: false,
      is_free_provider: false,
      did_you_mean: null,
      reason: null,
      source: "algorithmic+dns",
      fetched_at: time,
    },
    async run(i, execute) {
      const r = await execute("email-validate", {
        email: requiredText(i.email, "Email address"),
      });
      const o = r.output;
      // A format failure returns early without the DNS fields; keep them empty
      // rather than reporting false for checks that did not run.
      return {
        valid: o.valid,
        email: o.email,
        format_valid: o.format_valid,
        domain: o.domain ?? null,
        has_mx_records: o.has_mx_records ?? null,
        is_disposable: o.is_disposable ?? null,
        is_role_address: o.is_role_address ?? null,
        is_free_provider: o.is_free_provider ?? null,
        did_you_mean: o.did_you_mean ?? null,
        reason: o.reason ?? null,
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
};
module.exports = { jobs, JobInputError };
