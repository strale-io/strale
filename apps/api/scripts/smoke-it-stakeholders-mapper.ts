// Mapper smoke for italian-company-stakeholders — verifies the mapping
// from the documented Openapi IT-Stakeholders response shape (per the
// OpenAPI spec sample at company-oas.json) into Strale's canonical
// legal_representatives[] shape. Mocks the fetch layer so no network
// call is made and OPENAPI_ENABLED is not required. Phase 7a.

import { executeOpenapiCapability } from "../src/capabilities/lib/openapi-resolver.js";

const sample = {
  data: {
    managers: [
      {
        name: "LUCA",
        surname: "SCURIATTI",
        roles: [
          {
            role: { code: "AUN", description: "Managing director" },
            roleStartDate: "2020-09-10T00:00:00",
          },
        ],
        taxCode: "SCRLCU73R02H501H",
        birthDate: "1973-10-02T00:00:00",
        age: 49,
        birthTown: "ROMA (RM)",
        isLegalRepresentative: true,
      },
      {
        companyName: "OPEN HOLDING SRL",
        roles: [
          {
            role: { code: "SOU", description: "Sole owner" },
            roleStartDate: "2022-12-05T00:00:00",
          },
        ],
        taxCode: "16935371001",
        isLegalRepresentative: false,
      },
      {
        name: "SIMONE",
        surname: "DESANTIS",
        roles: [
          {
            role: { code: "PP", description: "Special representative/agent" },
            roleStartDate: "2013-10-17T00:00:00",
          },
        ],
        taxCode: "DSNSMN80M11L117F",
        birthDate: "1980-08-11T00:00:00",
        isLegalRepresentative: false,
      },
    ],
    companyDetails: {
      vatCode: "12485671007",
      taxCode: "12485671007",
      lastUpdateDate: "2023-03-08T11:25:08.0331456Z",
      companyName: "OPENAPI SPA",
      openapiNumber: "IT93E20F0DS0001",
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
  "12485671007",
);

globalThis.fetch = original;

const o = result.output as Record<string, unknown>;
const reps = o.legal_representatives as Array<Record<string, unknown>>;

const checks: Array<{ name: string; pass: boolean; got: unknown; want: unknown }> = [
  { name: "total reps (SOU filtered)", pass: reps.length === 2, got: reps.length, want: 2 },
  { name: "first.name", pass: reps[0]?.name === "LUCA SCURIATTI", got: reps[0]?.name, want: "LUCA SCURIATTI" },
  { name: "first.role_code", pass: reps[0]?.role_code === "AUN", got: reps[0]?.role_code, want: "AUN" },
  { name: "first.role", pass: reps[0]?.role === "Managing director", got: reps[0]?.role, want: "Managing director" },
  { name: "first.is_legal_representative", pass: reps[0]?.is_legal_representative === true, got: reps[0]?.is_legal_representative, want: true },
  { name: "first.start_date", pass: reps[0]?.start_date === "2020-09-10", got: reps[0]?.start_date, want: "2020-09-10" },
  { name: "first.birth_date", pass: reps[0]?.birth_date === "1973-10-02", got: reps[0]?.birth_date, want: "1973-10-02" },
  { name: "first.tax_code", pass: reps[0]?.tax_code === "SCRLCU73R02H501H", got: reps[0]?.tax_code, want: "SCRLCU73R02H501H" },
  { name: "first.type", pass: reps[0]?.type === "person", got: reps[0]?.type, want: "person" },
  { name: "second.name", pass: reps[1]?.name === "SIMONE DESANTIS", got: reps[1]?.name, want: "SIMONE DESANTIS" },
  { name: "second.role_code", pass: reps[1]?.role_code === "PP", got: reps[1]?.role_code, want: "PP" },
  { name: "second.is_legal_representative", pass: reps[1]?.is_legal_representative === false, got: reps[1]?.is_legal_representative, want: false },
  { name: "SOU not in legal_representatives", pass: !reps.some((r) => r.role_code === "SOU"), got: reps.map((r) => r.role_code).join(","), want: "no SOU" },
  { name: "company_name", pass: o.company_name === "OPENAPI SPA", got: o.company_name, want: "OPENAPI SPA" },
  { name: "registration_number", pass: o.registration_number === "12485671007", got: o.registration_number, want: "12485671007" },
  { name: "vat_number", pass: o.vat_number === "12485671007", got: o.vat_number, want: "12485671007" },
  { name: "country_code", pass: o.country_code === "IT", got: o.country_code, want: "IT" },
  { name: "total_legal_representatives", pass: o.total_legal_representatives === 2, got: o.total_legal_representatives, want: 2 },
  { name: "source_as_of", pass: o.source_as_of === "2023-03-08T11:25:08.0331456Z", got: o.source_as_of, want: "2023-03-08T11:25:08.0331456Z" },
  { name: "provenance.source", pass: result.provenance.source === "Openapi.com IT-Stakeholders", got: result.provenance.source, want: "Openapi.com IT-Stakeholders" },
  { name: "provenance.openapi_record_id", pass: result.provenance.openapi_record_id === "IT93E20F0DS0001", got: result.provenance.openapi_record_id, want: "IT93E20F0DS0001" },
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
