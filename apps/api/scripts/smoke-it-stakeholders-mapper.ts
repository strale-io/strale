// Mapper smoke for italian-company-stakeholders — verifies the mapping
// from the documented Openapi IT-Stakeholders response shape (per the
// OpenAPI spec sample at company-oas.json) into Strale's canonical
// legal_representatives[] shape. Mocks the fetch layer so no network
// call is made and OPENAPI_ENABLED is not required. Phase 7a.
//
// The fixture is SYNTHETIC and must stay that way. It previously carried a real
// vendor response: two named individuals with their codice fiscale, birth dates
// and birthplace. A codice fiscale encodes name, date and place of birth, so that
// is personal data under GDPR sitting in the repo. The names were scrubbed from
// manifests/italian-company-stakeholders.yaml because check-manifest-pii.mjs scans
// manifests — it does not scan scripts/, so this copy survived the gate. Shapes are
// preserved (16-char CF, 11-digit company codes) so the mapper is still exercised.

import { executeOpenapiCapability } from "../src/capabilities/lib/openapi-resolver.js";

const sample = {
  data: {
    managers: [
      {
        name: "MARIO",
        surname: "ROSSI",
        roles: [
          {
            role: { code: "AUN", description: "Managing director" },
            roleStartDate: "2020-09-10T00:00:00",
          },
        ],
        taxCode: "RSSMRA70A01H501X",
        birthDate: "1970-01-01T00:00:00",
        age: 55,
        birthTown: "ROMA (RM)",
        isLegalRepresentative: true,
      },
      {
        companyName: "EXAMPLE HOLDING SRL",
        roles: [
          {
            role: { code: "SOU", description: "Sole owner" },
            roleStartDate: "2022-12-05T00:00:00",
          },
        ],
        taxCode: "12345678901",
        isLegalRepresentative: false,
      },
      {
        name: "GIULIA",
        surname: "BIANCHI",
        roles: [
          {
            role: { code: "PP", description: "Special representative/agent" },
            roleStartDate: "2013-10-17T00:00:00",
          },
        ],
        taxCode: "BNCGLI80A41H501X",
        birthDate: "1980-01-01T00:00:00",
        isLegalRepresentative: false,
      },
    ],
    companyDetails: {
      vatCode: "12345678903",
      taxCode: "12345678903",
      lastUpdateDate: "2023-03-08T11:25:08.0331456Z",
      companyName: "EXAMPLE SPA",
      openapiNumber: "ITEXAMPLE0000001",
    },
  },
  success: true,
  message: "",
  error: null,
};

const original = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request) => {
  const u = typeof url === "string" ? url : url.toString();
  if (u.includes("oauth.openapi.it/token")) {
    return new Response(JSON.stringify({ token: "fake-token" }), {
      status: 200,
    });
  }
  if (u.includes("IT-stakeholders")) {
    return new Response(JSON.stringify(sample), { status: 200 });
  }
  return new Response("nope", { status: 500 });
}) as typeof fetch;

process.env.OPENAPI_ENABLED = "true";
process.env.OPENAPI_COM_EMAIL = "x";
process.env.OPENAPI_COM_API_TOKEN_PROD = "x";

const result = await executeOpenapiCapability(
  {
    countryCode: "IT",
    identifierRegex: /^\d{11}$/,
    openapiProduct: "it-stakeholders",
    capabilitySlug: "italian-company-stakeholders",
  },
  "12345678903",
);

globalThis.fetch = original;

const o = result.output as Record<string, unknown>;
const reps = o.legal_representatives as Array<Record<string, unknown>>;

const checks: Array<{ name: string; pass: boolean; got: unknown; want: unknown }> = [
  { name: "total reps (SOU filtered)", pass: reps.length === 2, got: reps.length, want: 2 },
  { name: "first.name", pass: reps[0]?.name === "MARIO ROSSI", got: reps[0]?.name, want: "MARIO ROSSI" },
  { name: "first.role_code", pass: reps[0]?.role_code === "AUN", got: reps[0]?.role_code, want: "AUN" },
  { name: "first.role", pass: reps[0]?.role === "Managing director", got: reps[0]?.role, want: "Managing director" },
  { name: "first.is_legal_representative", pass: reps[0]?.is_legal_representative === true, got: reps[0]?.is_legal_representative, want: true },
  { name: "first.start_date", pass: reps[0]?.start_date === "2020-09-10", got: reps[0]?.start_date, want: "2020-09-10" },
  { name: "first.birth_date", pass: reps[0]?.birth_date === "1970-01-01", got: reps[0]?.birth_date, want: "1970-01-01" },
  { name: "first.tax_code", pass: reps[0]?.tax_code === "RSSMRA70A01H501X", got: reps[0]?.tax_code, want: "RSSMRA70A01H501X" },
  { name: "first.type", pass: reps[0]?.type === "person", got: reps[0]?.type, want: "person" },
  { name: "second.name", pass: reps[1]?.name === "GIULIA BIANCHI", got: reps[1]?.name, want: "GIULIA BIANCHI" },
  { name: "second.role_code", pass: reps[1]?.role_code === "PP", got: reps[1]?.role_code, want: "PP" },
  { name: "second.is_legal_representative", pass: reps[1]?.is_legal_representative === false, got: reps[1]?.is_legal_representative, want: false },
  { name: "SOU not in legal_representatives", pass: !reps.some((r) => r.role_code === "SOU"), got: reps.map((r) => r.role_code).join(","), want: "no SOU" },
  { name: "company_name", pass: o.company_name === "EXAMPLE SPA", got: o.company_name, want: "EXAMPLE SPA" },
  { name: "registration_number", pass: o.registration_number === "12345678903", got: o.registration_number, want: "12345678903" },
  { name: "vat_number", pass: o.vat_number === "12345678903", got: o.vat_number, want: "12345678903" },
  { name: "country_code", pass: o.country_code === "IT", got: o.country_code, want: "IT" },
  { name: "total_legal_representatives", pass: o.total_legal_representatives === 2, got: o.total_legal_representatives, want: 2 },
  { name: "source_as_of", pass: o.source_as_of === "2023-03-08T11:25:08.0331456Z", got: o.source_as_of, want: "2023-03-08T11:25:08.0331456Z" },
  { name: "provenance.source", pass: result.provenance.source === "Openapi.com IT-Stakeholders", got: result.provenance.source, want: "Openapi.com IT-Stakeholders" },
  { name: "provenance.openapi_record_id", pass: result.provenance.openapi_record_id === "ITEXAMPLE0000001", got: result.provenance.openapi_record_id, want: "ITEXAMPLE0000001" },
];

let passed = 0;
let failed = 0;
for (const c of checks) {
  if (c.pass) {
    console.log(`  ✓ ${c.name}`);
    passed++;
  } else {
    console.log(`  ✗ ${c.name} — got: ${JSON.stringify(c.got)}, want: ${JSON.stringify(c.want)}`);
    failed++;
  }
}
console.log(`\n=== ${passed} passed, ${failed} failed (${checks.length} total) ===`);
process.exit(failed === 0 ? 0 : 1);
