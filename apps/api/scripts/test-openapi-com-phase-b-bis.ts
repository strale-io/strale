/**
 * Openapi.com Phase B-bis production sweep.
 *
 * Scope: NL + Gap-8 (HU, SI, BG, RO, LU, SK, MT, CY) — the 9 countries where
 * Openapi positioning under DEC-20260506-A is "best-effort fallback via
 * WW-Start". This sweep answers whether Openapi has *any* coverage on these
 * 9 countries.
 *
 * Skipped (deferred to operator-question response): DE / ES / PT / AT / IT
 * production calls. The DE/ES/PT/AT advanced schema gap identified in the
 * Phase B walker probe is operator-question-gated (Openapi case 151296).
 *
 * Identifier strategy: Openapi WW-Start expects country-local registry IDs
 * (Phase A established the convention — KVK for NL, cégjegyzékszám for HU,
 * matična for SI, UIC for BG, CUI for RO, RCS for LU, IČO for SK, Maltese
 * company number for MT, Cypriot HE-prefix for CY). VAT-format IDs are NOT
 * universally accepted on these countries.
 *
 * SMEs: production scopes do not include a Search endpoint for any of the 9
 * target countries (only IT-Search and FR-Search exist). SME sourcing
 * deferred — mid-cap signal is sufficient to answer the per-country coverage
 * existence question. Documented per prompt's gap-fallback rule.
 *
 * Hard cost cap: €3 across this script + the prod-verify call (~€0.06). Per-
 * call running tripwire halts the sweep mid-loop on cap hit.
 *
 * Output: per-call fixtures under
 *   docs/research/2026-05-06-openapi-phase-b-fixtures/{country}-{tier}-{id}.json
 * Console summary suitable for the Phase B report.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { OpenapiClient } from "../src/lib/vendors/openapi-com/client.js";
import type { OpenapiResult } from "../src/lib/vendors/openapi-com/types.js";

config({ path: resolve(import.meta.dirname, "../../../.env") });
const ENV_KEYS = ["OPENAPI_COM_API_TOKEN_PROD", "OPENAPI_COM_EMAIL"];
if (!process.env.OPENAPI_COM_API_TOKEN_PROD) {
  try {
    const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
    const text = buf.toString("utf16le");
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    for (const line of clean.split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (ENV_KEYS.includes(k) && !process.env[k]) process.env[k] = v;
      }
    }
  } catch {
    /* missing .env is fine if env is set in the shell */
  }
}

const FIXTURE_DIR = resolve(
  import.meta.dirname,
  "../../../docs/research/2026-05-06-openapi-phase-b-fixtures",
);
mkdirSync(FIXTURE_DIR, { recursive: true });

// ─── Hard cost cap (across this script + the prod-verify call) ────────────
// Step 2 verify already spent ~€0.06. This script must stay under €2.94.
const PROD_VERIFY_PRIOR_SPEND_EUR = 0.06;
const HARD_CAP_EUR = 3.0;
const SCRIPT_BUDGET_EUR = HARD_CAP_EUR - PROD_VERIFY_PRIOR_SPEND_EUR;

const PRICE: Record<string, number> = {
  "WW-start": 0.06,
  "WW-advanced": 0.11,
};

// ─── Mid-cap entities (registry IDs, not VAT) ────────────────────────────
// Each entry's `id` is the country-local registry primary key Openapi's
// WW-Start most commonly accepts. Public sources, well-documented listed
// companies. VIES VAT validation skipped because Openapi treats registry
// IDs (not VATs) as the lookup key on these countries — VIES would only
// confirm EU VAT-system existence, not Openapi data presence.

interface Entity {
  country: string;
  id: string;
  name: string;
  altIds?: string[]; // alternate IDs to try if primary 404s
}

const MIDCAPS: Entity[] = [
  { country: "NL", id: "17014545", name: "ASML Holding N.V. (KVK 17014545)", altIds: ["NL821218833B01"] },
  { country: "HU", id: "0110041683", name: "MOL Magyar Olaj- és Gázipari Nyrt. (cégjegyzékszám 01-10-041683)", altIds: ["10625790", "HU10625790"] },
  { country: "SI", id: "5043611000", name: "Krka, d.d., Novo mesto (matična 5043611000)", altIds: ["82646716", "SI82646716"] },
  { country: "BG", id: "831902088", name: "Sopharma AD (UIC 831902088)", altIds: ["BG831902088"] },
  { country: "RO", id: "1590082", name: "OMV Petrom S.A. (CUI 1590082)", altIds: ["RO1590082"] },
  { country: "LU", id: "B82454", name: "ArcelorMittal S.A. (RCS B82454)", altIds: ["LU22850926"] },
  { country: "SK", id: "31560636", name: "Tatry mountain resorts, a.s. (IČO 31560636)", altIds: ["SK2020481748"] },
  { country: "MT", id: "C2833", name: "Bank of Valletta plc (C2833)", altIds: ["MT16234415"] },
  { country: "CY", id: "HE165638", name: "Bank of Cyprus Holdings plc (HE165638)", altIds: ["CY10165638X"] },
];

// ─── Field-coverage scoring (mirror Phase A walker, pinned for portability) ─

const REQUIRED_FIELDS = [
  "legal_name",
  "registration_number",
  "status",
  "registered_address",
  "directors",
  "incorporation_date",
  "legal_form",
  "vat_number",
  "lei",
  "nace_code",
  "share_capital",
  "financials",
] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

const FIELD_CANDIDATES: Record<RequiredField, string[]> = {
  legal_name: ["companyName", "company_name", "legal_name", "denomination", "name", "ragioneSociale", "ragione_sociale", "denominazione"],
  registration_number: ["registration_number", "registrationNumber", "company_number", "companyNumber", "taxCode", "tax_code", "vatCode", "vat_code", "vatNumber", "vat_number", "siren", "siret", "krs", "regon", "company_id", "id", "reaCode"],
  status: ["activityStatus", "activity_status", "status", "companyStatus", "company_status", "stato_attivita", "active"],
  registered_address: ["registeredOffice", "registered_office", "registered_address", "address", "headquarters", "indirizzo"],
  directors: ["managers", "stakeholders", "directors", "officers", "board", "rappresentanti", "amministratori", "shareHolders", "shareholders"],
  incorporation_date: ["registrationDate", "registration_date", "incorporation_date", "incorporationDate", "dateOfCreation", "date_of_creation", "constituzione", "data_iscrizione", "startDate"],
  legal_form: ["detailedLegalForm", "legalForm", "legal_form", "companyType", "company_type", "type", "forma_giuridica", "formaGiuridica", "rechtsform", "juridicalForm", "juridicalType", "natureOfBusiness", "entityType"],
  vat_number: ["vatNumber", "vatCode", "vat_number", "vat_code", "vatId", "vat_id"],
  lei: ["lei", "leiCode", "lei_code"],
  nace_code: ["nace", "ateco", "naceCode", "nace_code", "atecoCode", "atecoDescription", "sicCodes", "sic_codes", "activityCode", "activity_code", "industryCode", "industry_code", "naics", "sic"],
  share_capital: ["shareCapital", "share_capital", "capitalAmount", "capital_amount", "capitale_sociale", "capitaleSociale", "capital"],
  financials: ["balanceSheets", "balance_sheets", "financials", "financialStatements", "lastFinancials"],
};

type FieldStatus = "populated" | "null" | "missing" | "empty";

function valueStatus(value: unknown): FieldStatus {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string" && value.trim() === "") return "empty";
  if (Array.isArray(value) && value.length === 0) return "empty";
  if (typeof value === "object" && value !== null && Object.keys(value).length === 0) return "empty";
  return "populated";
}

function findField(
  body: Record<string, unknown> | null,
  candidates: string[],
): { status: FieldStatus; matchedKey: string | null } {
  if (!body) return { status: "missing", matchedKey: null };
  const lc = new Set(candidates.map((c) => c.toLowerCase()));
  const visit = (
    val: unknown,
    depth: number,
  ): { status: FieldStatus; matchedKey: string | null } | null => {
    if (depth < 0) return null;
    if (Array.isArray(val)) {
      for (const item of val) {
        const r = visit(item, depth - 1);
        if (r) return r;
      }
      return null;
    }
    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (lc.has(k.toLowerCase())) {
          return { status: valueStatus(v), matchedKey: k };
        }
      }
      for (const v of Object.values(obj)) {
        const r = visit(v, depth - 1);
        if (r) return r;
      }
    }
    return null;
  };
  return visit(body, 6) ?? { status: "missing", matchedKey: null };
}

// ─── Sweep accumulator ─────────────────────────────────────────────────────

interface SweepCall {
  country: string;
  tier: "WW-start" | "WW-advanced";
  identifier: string;
  entityName: string;
  result: OpenapiResult;
  costEur: number;
}

const calls: SweepCall[] = [];
let runningSpendEur = 0;

function fixturePath(country: string, tier: string, id: string): string {
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, "_");
  return resolve(FIXTURE_DIR, `prod-${country}-${tier}-${safeId}.json`);
}

async function execAndRecord(
  client: OpenapiClient,
  country: string,
  id: string,
  entityName: string,
  tier: "WW-start" | "WW-advanced",
): Promise<SweepCall> {
  const cost = PRICE[tier]!;
  if (runningSpendEur + cost > SCRIPT_BUDGET_EUR) {
    throw new Error(
      `BUDGET TRIPWIRE: would push spend to €${(runningSpendEur + cost).toFixed(2)} ` +
        `(script budget €${SCRIPT_BUDGET_EUR.toFixed(2)}). Halting sweep mid-loop.`,
    );
  }
  const fn =
    tier === "WW-start" ? client.wwStart.bind(client) : client.wwAdvanced.bind(client);
  const result = await fn(country, id);
  runningSpendEur += cost;
  const call: SweepCall = { country, tier, identifier: id, entityName, result, costEur: cost };
  calls.push(call);
  // eslint-disable-next-line no-console
  console.log(
    `  ${result.ok ? "✓" : "✗"} ${tier.padEnd(12)} ${country} ${id.padEnd(15)} → ${result.status} (${result.latencyMs}ms)${result.error ? ` [${result.error}]` : ""} | spent €${runningSpendEur.toFixed(2)}`,
  );
  // Persist fixture (success and failure both — diagnostic value).
  writeFileSync(
    fixturePath(country, tier, id),
    JSON.stringify({ entityName, result }, null, 2),
    "utf8",
  );
  return call;
}

async function tryWithFallback(
  client: OpenapiClient,
  e: Entity,
  tier: "WW-start" | "WW-advanced",
): Promise<SweepCall> {
  // First attempt with primary id.
  const primary = await execAndRecord(client, e.country, e.id, e.name, tier);
  if (primary.result.ok) return primary;
  if (primary.result.status !== 404 || !e.altIds?.length) return primary;
  // 404 + alt-ids available — try first alt.
  const alt = e.altIds[0]!;
  // eslint-disable-next-line no-console
  console.log(`    ↳ 404 on primary id; retrying with alt: ${alt}`);
  return await execAndRecord(client, e.country, alt, `${e.name} [alt:${alt}]`, tier);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Openapi.com Phase B-bis — NL + Gap-8 production sweep");
  // eslint-disable-next-line no-console
  console.log(`Hard cap: €${HARD_CAP_EUR.toFixed(2)} (less €${PROD_VERIFY_PRIOR_SPEND_EUR.toFixed(2)} prior verify spend = €${SCRIPT_BUDGET_EUR.toFixed(2)} for this script)`);
  // eslint-disable-next-line no-console
  console.log(`Mid-caps: ${MIDCAPS.length} entities. SMEs: deferred (no production search scope for target countries; confident SME IDs require lookup beyond €1 sub-cap).\n`);

  if (!process.env.OPENAPI_COM_API_TOKEN_PROD) {
    // eslint-disable-next-line no-console
    console.error("OPENAPI_COM_API_TOKEN_PROD is not set. Halt.");
    process.exit(1);
  }

  const client = new OpenapiClient("production");

  // Sweep loop — for each country, WW-Start (existence check) then
  // WW-Advanced (depth probe). Tripwire halts on budget exhaustion.
  try {
    for (const e of MIDCAPS) {
      // eslint-disable-next-line no-console
      console.log(`\n[${e.country}] ${e.name}`);
      const startCall = await tryWithFallback(client, e, "WW-start");
      // Only run WW-Advanced if WW-Start succeeded — no point paying €0.11
      // for a depth probe on a country Openapi clearly doesn't cover.
      if (startCall.result.ok) {
        await tryWithFallback(client, e, "WW-advanced");
      } else {
        // eslint-disable-next-line no-console
        console.log(`    ↳ WW-Start failed; skipping WW-Advanced for ${e.country}.`);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`\n${err instanceof Error ? err.message : String(err)}`);
    // Fall through to summary so partial data is reported.
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log("\n=== Summary ===\n");
  // eslint-disable-next-line no-console
  console.log(`Total calls: ${calls.length}, total spend €${runningSpendEur.toFixed(2)} of €${SCRIPT_BUDGET_EUR.toFixed(2)} script budget.`);

  // Per-country verdict
  // eslint-disable-next-line no-console
  console.log("\nPer-country verdict (WW-Start status):");
  const byCountry = new Map<string, SweepCall[]>();
  for (const c of calls) {
    const prev = byCountry.get(c.country) ?? [];
    prev.push(c);
    byCountry.set(c.country, prev);
  }
  for (const [country, cs] of byCountry) {
    const start = cs.find((c) => c.tier === "WW-start");
    const adv = cs.find((c) => c.tier === "WW-advanced");
    const startStr = start ? `WW-start=${start.result.status}` : "WW-start=skipped";
    const advStr = adv ? `WW-adv=${adv.result.status}` : "WW-adv=skipped";
    // eslint-disable-next-line no-console
    console.log(`  ${country}: ${startStr} ${advStr}`);
  }

  // Field coverage on successful calls
  // eslint-disable-next-line no-console
  console.log("\nField coverage (populated/total successful):");
  const okCalls = calls.filter((c) => c.result.ok);
  if (okCalls.length === 0) {
    // eslint-disable-next-line no-console
    console.log("  (no successful responses)");
  } else {
    for (const f of REQUIRED_FIELDS) {
      const populated = okCalls.filter((c) => findField(c.result.body, FIELD_CANDIDATES[f]).status === "populated").length;
      // eslint-disable-next-line no-console
      console.log(`  ${f.padEnd(22)} ${populated}/${okCalls.length}`);
    }
  }

  // Write a machine-readable sweep result for the report builder
  const summaryPath = resolve(FIXTURE_DIR, "phase-b-bis-sweep-summary.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        runStartedAt: new Date().toISOString(),
        scriptBudgetEur: SCRIPT_BUDGET_EUR,
        priorSpendEur: PROD_VERIFY_PRIOR_SPEND_EUR,
        totalSpendEur: runningSpendEur,
        cumulativeSpendEur: runningSpendEur + PROD_VERIFY_PRIOR_SPEND_EUR,
        calls: calls.map((c) => ({
          country: c.country,
          tier: c.tier,
          identifier: c.identifier,
          entityName: c.entityName,
          status: c.result.status,
          ok: c.result.ok,
          error: c.result.error,
          latencyMs: c.result.latencyMs,
          costEur: c.costEur,
          fieldCoverage: REQUIRED_FIELDS.reduce<Record<string, { status: FieldStatus; matchedKey: string | null }>>(
            (acc, f) => {
              acc[f] = findField(c.result.body, FIELD_CANDIDATES[f]);
              return acc;
            },
            {},
          ),
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  // eslint-disable-next-line no-console
  console.log(`\nSummary fixture → ${summaryPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
