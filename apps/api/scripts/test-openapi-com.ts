/**
 * Openapi.com sandbox + production testing harness.
 *
 * Phase A (always runs): exercises the sandbox-supported entity matrix
 * against virtual credit. Cost in real money: €0.
 *
 * Phase B (gated by --production flag and interactive confirmation):
 * runs the full 19-country production matrix against real top-up balance.
 * Hard cost ceiling €15.
 *
 * The script writes a dated markdown report to docs/research/.
 *
 * NOT a capability onboarding pipeline run. No DB writes, no source_health,
 * no manifests. Per DEC-20260506-A, this is evaluation infrastructure.
 *
 * Sandbox entity matrix verified 2026-05-06 from
 * https://docs.openapi.it/company-sandbox-examples.html:
 *
 *   IT  21 entities (e.g. 12485671007 OPENAPI SRL)
 *   FR  11 entities (e.g. 883480147 LES MAISONS DES ASPRES)
 *   DE  3  (DE811115368 Audi, DE132490588 adidas, DE119429301 Henkel)
 *   ES  3  (ESA81948077 Endesa, ESA82489451 Repsol Trading, ESA95929659 Iberdrola)
 *   PT  3  (PT500273170 Sonae, PT516663275 Kalorama, PT501533303 Bertrand Editora)
 *   GB  3  (GB226335521 MDN, GB730934930 Inmarsat, GB226312538 Mcloud)
 *   BE  3  (BE0202239951 Proximus, BE0417497106 AB InBev, BE0836159992 Showpad)
 *   AT  3  (ATU22852606 Oberbank, ATU37043800 Rheinmetall, ATU63391207 Eralytics)
 *   CH  3  (CHE-101.447.456, CHE-106.970.179, CHE-108.167.035)
 *   PL  3  (PL5213787274, PL6462441581, PL8271818828)
 *
 * NOT in sandbox: NL HU SI BG RO LU SK MT CY (Phase B production-only).
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { OpenapiClient } from "../src/lib/vendors/openapi-com/client.js";
import type { OpenapiResult } from "../src/lib/vendors/openapi-com/types.js";

// ─── Env loading (UTF-16LE fallback for Windows-encoded .env) ───────────────

config({ path: resolve(import.meta.dirname, "../../../.env") });
const ENV_KEYS = ["OPENAPI_COM_API_TOKEN_SANDBOX", "OPENAPI_COM_API_TOKEN_PROD"];
if (!process.env.OPENAPI_COM_API_TOKEN_SANDBOX) {
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
    // .env missing is fine if env vars are already set in the shell
  }
}

// ─── CLI flags ──────────────────────────────────────────────────────────────

const RUN_PRODUCTION = process.argv.includes("--production");
const PROD_COST_CEILING_EUR = 15;

// ─── Required-field schema (Strale identity contract) ──────────────────────

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
] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

// ─── Phase A: sandbox entity matrix ─────────────────────────────────────────

interface SandboxEntity {
  country: string;
  identifier: string;
  name: string;
}

const SANDBOX_ENTITIES: SandboxEntity[] = [
  { country: "IT", identifier: "12485671007", name: "OPENAPI SRL" },
  { country: "FR", identifier: "883480147", name: "LES MAISONS DES ASPRES" },
  { country: "DE", identifier: "DE811115368", name: "AUDI Aktiengesellschaft" },
  { country: "DE", identifier: "DE132490588", name: "adidas AG" },
  { country: "DE", identifier: "DE119429301", name: "Henkel AG & Co. KGaA" },
  { country: "ES", identifier: "ESA81948077", name: "Endesa Energia SAU" },
  { country: "ES", identifier: "ESA82489451", name: "Repsol Trading SA" },
  { country: "ES", identifier: "ESA95929659", name: "Iberdrola Renovables Internacional" },
  { country: "PT", identifier: "PT500273170", name: "Sonae SGPS SA" },
  { country: "PT", identifier: "PT516663275", name: "Kalorama Festival" },
  { country: "PT", identifier: "PT501533303", name: "Bertrand Editora" },
  { country: "GB", identifier: "GB226335521", name: "MDN Supplies Limited" },
  { country: "GB", identifier: "GB730934930", name: "Inmarsat Global Limited" },
  { country: "GB", identifier: "GB226312538", name: "Mcloud Limited" },
  { country: "BE", identifier: "BE0202239951", name: "Proximus" },
  { country: "BE", identifier: "BE0417497106", name: "Anheuser-Busch InBev" },
  { country: "BE", identifier: "BE0836159992", name: "Showpad" },
  { country: "AT", identifier: "ATU22852606", name: "Oberbank AG" },
  { country: "AT", identifier: "ATU37043800", name: "Rheinmetall Waffe Munition ARGES" },
  { country: "AT", identifier: "ATU63391207", name: "ERALYTICS GmbH" },
  { country: "CH", identifier: "CHE-101.447.456", name: "Arthur Girardi AG" },
  { country: "CH", identifier: "CHE-106.970.179", name: "Societa Fiduciaria e Consulenza" },
  { country: "CH", identifier: "CHE-108.167.035", name: "CPM Switzerland AG" },
  { country: "PL", identifier: "PL5213787274", name: "Queisser Pharma Poland" },
  { country: "PL", identifier: "PL6462441581", name: "Wilk Elektronik SA" },
  { country: "PL", identifier: "PL8271818828", name: "BAXTER Polska" },
];

// One representative entity per country for sandbox endpoint sweeps —
// avoids burning virtual credit on duplicates of the same registry surface.
const SANDBOX_REPRESENTATIVE: SandboxEntity[] = [
  SANDBOX_ENTITIES[0]!,  // IT OPENAPI SRL
  SANDBOX_ENTITIES[1]!,  // FR
  SANDBOX_ENTITIES[2]!,  // DE Audi
  SANDBOX_ENTITIES[5]!,  // ES Endesa
  SANDBOX_ENTITIES[8]!,  // PT Sonae
  SANDBOX_ENTITIES[11]!, // GB MDN
  SANDBOX_ENTITIES[14]!, // BE Proximus
  SANDBOX_ENTITIES[17]!, // AT Oberbank
  SANDBOX_ENTITIES[20]!, // CH Arthur Girardi
  SANDBOX_ENTITIES[23]!, // PL Queisser Pharma
];

// Countries with country-specific Start/Advanced products on Openapi.com —
// per public pricing 2026-05-06: IT FR DE ES PT GB BE AT CH PL.
const COUNTRY_SPECIFIC_PRODUCTS = new Set([
  "IT", "FR", "DE", "ES", "PT", "GB", "BE", "AT", "CH", "PL",
]);

// ─── Phase B: production entity matrix ──────────────────────────────────────

interface ProdEntity {
  country: string;
  identifier: string;
  name: string;
  scope: "mid-rebuild" | "gap-8" | "live-overlap";
}

const PROD_ENTITIES: ProdEntity[] = [
  // Mid-rebuild (6) — using sandbox-listed entities where available so we
  // can compare sandbox-vs-production response shape directly.
  { country: "DE", identifier: "DE811115368", name: "AUDI AG", scope: "mid-rebuild" },
  { country: "NL", identifier: "33002587", name: "Heineken NV (KVK)", scope: "mid-rebuild" },
  { country: "IT", identifier: "12485671007", name: "OPENAPI SRL", scope: "mid-rebuild" },
  { country: "ES", identifier: "ESA81948077", name: "Endesa Energia SAU", scope: "mid-rebuild" },
  { country: "PT", identifier: "PT500273170", name: "Sonae SGPS SA", scope: "mid-rebuild" },
  { country: "AT", identifier: "ATU22852606", name: "Oberbank AG", scope: "mid-rebuild" },
  // Gap-8 (8) — these are NOT sandbox-supported; production-only.
  { country: "HU", identifier: "10915577", name: "MOL Nyrt (cégjegyzékszám)", scope: "gap-8" },
  { country: "SI", identifier: "5860571000", name: "Krka dd (matična)", scope: "gap-8" },
  { country: "BG", identifier: "204055590", name: "Bulgarian EAD (UIC)", scope: "gap-8" },
  { country: "RO", identifier: "13267221", name: "Banca Transilvania (CUI)", scope: "gap-8" },
  { country: "LU", identifier: "B6307", name: "ArcelorMittal (RCS)", scope: "gap-8" },
  { country: "SK", identifier: "00151700", name: "Slovnaft as (IČO)", scope: "gap-8" },
  { country: "MT", identifier: "C2833", name: "Bank of Valletta plc", scope: "gap-8" },
  { country: "CY", identifier: "HE3", name: "Bank of Cyprus", scope: "gap-8" },
  // Live overlap (5)
  { country: "FR", identifier: "542051180", name: "TotalEnergies SE", scope: "live-overlap" },
  { country: "GB", identifier: "02723534", name: "AstraZeneca PLC", scope: "live-overlap" },
  { country: "BE", identifier: "BE0417497106", name: "AB InBev SA/NV", scope: "live-overlap" },
  { country: "CH", identifier: "CHE-105.909.036", name: "Nestlé SA", scope: "live-overlap" },
  { country: "PL", identifier: "PL7740001454", name: "PKN Orlen SA", scope: "live-overlap" },
];

// ─── Pricing (per call, EUR) ────────────────────────────────────────────────

const PRICE_EUR: Record<string, number> = {
  "WW-start": 0.06,
  "WW-advanced": 0.11,
  "IT-start": 0.05,
  "IT-advanced": 0.10,
  "IT-stakeholders": 0.20,
  "FR-start": 0.05,
  "FR-advanced": 0.10,
  // All other country-specific Start/Advanced
  "country-start-default": 0.06,
  "country-advanced-default": 0.11,
};

function priceFor(endpoint: string): number {
  if (endpoint in PRICE_EUR) return PRICE_EUR[endpoint]!;
  if (endpoint.endsWith("-start")) return PRICE_EUR["country-start-default"]!;
  if (endpoint.endsWith("-advanced")) return PRICE_EUR["country-advanced-default"]!;
  return 0;
}

// ─── Field-coverage scoring ─────────────────────────────────────────────────

type FieldStatus = "populated" | "null" | "missing" | "empty" | "not_applicable";

function valueStatus(value: unknown): FieldStatus {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string" && value.trim() === "") return "empty";
  if (Array.isArray(value) && value.length === 0) return "empty";
  if (typeof value === "object" && value !== null && Object.keys(value).length === 0) return "empty";
  return "populated";
}

/**
 * Best-effort mapper: walks the Openapi response (incl. arrays) and returns
 * the first field value matching any of the candidate keys (case-insensitive).
 * Openapi.com wraps payloads in `{ data: [{...}], success, ... }` — so the
 * walker must descend into arrays. Field names in the response are camelCase.
 */
function findField(body: Record<string, unknown> | null, candidates: string[]): {
  status: FieldStatus;
  matchedKey: string | null;
} {
  if (!body) return { status: "missing", matchedKey: null };
  const lc = candidates.map((c) => c.toLowerCase());
  const visit = (val: unknown, depth: number): { status: FieldStatus; matchedKey: string | null } | null => {
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
      for (const [key, v] of Object.entries(obj)) {
        if (lc.includes(key.toLowerCase())) {
          return { status: valueStatus(v), matchedKey: key };
        }
      }
      for (const v of Object.values(obj)) {
        const r = visit(v, depth - 1);
        if (r) return r;
      }
    }
    return null;
  };
  return visit(body, 5) ?? { status: "missing", matchedKey: null };
}

// Candidates include camelCase, snake_case, and country-specific variants —
// Openapi.com responses are camelCase but per-country schemas vary.
const FIELD_CANDIDATES: Record<RequiredField, string[]> = {
  legal_name: ["companyName", "company_name", "legal_name", "denomination", "name", "ragioneSociale", "ragione_sociale", "denominazione"],
  registration_number: ["registration_number", "registrationNumber", "company_number", "companyNumber", "taxCode", "tax_code", "vatCode", "vat_code", "vatNumber", "vat_number", "siren", "siret", "krs", "regon", "company_id", "id"],
  status: ["activityStatus", "activity_status", "status", "companyStatus", "company_status", "stato_attivita", "active"],
  registered_address: ["registeredOffice", "registered_office", "registered_address", "address", "headquarters", "indirizzo"],
  directors: ["stakeholders", "directors", "officers", "board", "rappresentanti", "amministratori"],
  incorporation_date: ["registrationDate", "registration_date", "incorporation_date", "incorporationDate", "dateOfCreation", "date_of_creation", "constituzione", "data_iscrizione"],
  legal_form: ["legalForm", "legal_form", "companyType", "company_type", "type", "forma_giuridica", "formaGiuridica"],
  vat_number: ["vatNumber", "vatCode", "vat_number", "vat_code", "vatId", "vat_id"],
  lei: ["lei", "leiCode", "lei_code"],
  nace_code: ["naceCode", "nace_code", "ateco", "atecoCode", "atecoDescription", "sicCodes", "sic_codes", "activityCode", "activity_code", "industryCode", "industry_code"],
  share_capital: ["shareCapital", "share_capital", "capitalAmount", "capital_amount", "capitale_sociale", "capitaleSociale", "capital"],
};

// ─── Result accumulator ────────────────────────────────────────────────────

interface RecordedCall {
  result: OpenapiResult;
  estCostEur: number;
}

const allCalls: RecordedCall[] = [];

async function call(
  fn: () => Promise<OpenapiResult>,
  endpoint: string,
): Promise<OpenapiResult> {
  const result = await fn();
  allCalls.push({ result, estCostEur: priceFor(endpoint) });
  const symbol = result.ok ? "✓" : "✗";
  // eslint-disable-next-line no-console
  console.log(
    `  ${symbol} [${result.mode.padEnd(10)}] ${result.endpoint.padEnd(20)} ${result.country ?? "  "} ${result.identifier.padEnd(20)} → ${result.status} (${result.latencyMs}ms)${result.error ? ` [${result.error}]` : ""}`,
  );
  return result;
}

// ─── Phase A run ────────────────────────────────────────────────────────────

async function runPhaseA(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("\n=== Phase A — Sandbox (virtual credit) ===\n");
  const client = new OpenapiClient("sandbox");

  // Auth pre-flight
  // eslint-disable-next-line no-console
  console.log("[pre-flight] IT-start against sandbox OPENAPI SRL...");
  const preflight = await call(
    () => client.countryStart("IT", "12485671007"),
    "IT-start",
  );
  if (preflight.status === 401) {
    throw new Error(
      "Sandbox auth failed (401). Regenerate sandbox key at console.openapi.com > Authentication > Sandbox box.",
    );
  }
  if (preflight.status === 402) {
    throw new Error(
      "Sandbox virtual credit exhausted (402). Bump the slider at console.openapi.com > Configs > Preferences > Sandbox tab.",
    );
  }

  // Sweep one representative entity per country across endpoints they support
  // eslint-disable-next-line no-console
  console.log("\n[sweep] one representative per country, all applicable endpoints");
  for (const e of SANDBOX_REPRESENTATIVE) {
    if (e.country === "IT" && e.identifier === "12485671007") {
      // already preflighted
    } else {
      await call(() => client.countryStart(e.country, e.identifier), `${e.country}-start`);
    }
    if (COUNTRY_SPECIFIC_PRODUCTS.has(e.country)) {
      await call(() => client.countryAdvanced(e.country, e.identifier), `${e.country}-advanced`);
    }
    await call(() => client.wwStart(e.country, e.identifier), "WW-start");
    await call(() => client.wwAdvanced(e.country, e.identifier), "WW-advanced");
  }

  // IT-stakeholders for the IT representative
  await call(() => client.itStakeholders("12485671007"), "IT-stakeholders");
}

// ─── Phase B run (gated) ───────────────────────────────────────────────────

async function runPhaseB(): Promise<boolean> {
  // eslint-disable-next-line no-console
  console.log("\n=== Phase B — Production (real money) ===\n");

  if (!process.env.OPENAPI_COM_API_TOKEN_PROD) {
    // eslint-disable-next-line no-console
    console.error(
      "OPENAPI_COM_API_TOKEN_PROD is not set. Add the production key from " +
        "console.openapi.com > Authentication > Production box, then re-run with --production.",
    );
    return false;
  }

  const client = new OpenapiClient("production");

  // Pre-run cost estimate: WW-start + WW-advanced for every country, plus
  // country-specific Start+Advanced for the 10 countries that support them.
  const estimatedCalls = PROD_ENTITIES.length * 2 +
    PROD_ENTITIES.filter((e) => COUNTRY_SPECIFIC_PRODUCTS.has(e.country)).length * 2 +
    1; // IT-stakeholders for OPENAPI SRL
  const estimatedCost =
    PROD_ENTITIES.length * (PRICE_EUR["WW-start"]! + PRICE_EUR["WW-advanced"]!) +
    PROD_ENTITIES.filter((e) => COUNTRY_SPECIFIC_PRODUCTS.has(e.country)).reduce((s, e) => {
      const startKey = `${e.country}-start`;
      const advKey = `${e.country}-advanced`;
      return s + priceFor(startKey) + priceFor(advKey);
    }, 0) +
    PRICE_EUR["IT-stakeholders"]!;

  // eslint-disable-next-line no-console
  console.log(`Pre-run estimate: ${estimatedCalls} calls, €${estimatedCost.toFixed(2)}`);
  if (estimatedCost > PROD_COST_CEILING_EUR) {
    throw new Error(
      `Estimated cost €${estimatedCost.toFixed(2)} exceeds ceiling €${PROD_COST_CEILING_EUR}. Halting.`,
    );
  }

  const rl = createInterface({ input, output });
  const answer = (await rl.question(`Proceed with €${estimatedCost.toFixed(2)} of production calls? (y/yes to confirm): `)).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "yes") {
    // eslint-disable-next-line no-console
    console.log("Phase B not confirmed. Halting.");
    return false;
  }

  let consecutiveErrors = 0;
  for (const e of PROD_ENTITIES) {
    if (consecutiveErrors >= 5) {
      // eslint-disable-next-line no-console
      console.error("5+ consecutive country errors — halting Phase B early.");
      break;
    }
    let countryAllErrored = true;

    if (COUNTRY_SPECIFIC_PRODUCTS.has(e.country)) {
      const r1 = await call(() => client.countryStart(e.country, e.identifier), `${e.country}-start`);
      const r2 = await call(() => client.countryAdvanced(e.country, e.identifier), `${e.country}-advanced`);
      if (r1.ok || r2.ok) countryAllErrored = false;
    }
    const r3 = await call(() => client.wwStart(e.country, e.identifier), "WW-start");
    const r4 = await call(() => client.wwAdvanced(e.country, e.identifier), "WW-advanced");
    if (r3.ok || r4.ok) countryAllErrored = false;

    if (countryAllErrored) consecutiveErrors++;
    else consecutiveErrors = 0;
  }

  // IT-stakeholders for OPENAPI SRL
  await call(() => client.itStakeholders("12485671007"), "IT-stakeholders");
  return true;
}

// ─── Report builder ─────────────────────────────────────────────────────────

function buildReport(phaseBRan: boolean, phaseBConfirmed: boolean, estimatedCostB: number): string {
  const phaseACalls = allCalls.filter((c) => c.result.mode === "sandbox");
  const phaseBCalls = allCalls.filter((c) => c.result.mode === "production");

  const okA = phaseACalls.filter((c) => c.result.ok).length;
  const okB = phaseBCalls.filter((c) => c.result.ok).length;
  const realCostB = phaseBCalls.reduce((s, c) => s + c.estCostEur, 0);

  const lines: string[] = [];

  // 1. Headline
  lines.push("# Openapi.com sandbox + production testing report");
  lines.push("");
  lines.push(`**Date:** 2026-05-06`);
  lines.push(`**Branch:** test/openapi-com-sandbox-2026-05-06`);
  lines.push(`**Vendor status:** Pending eval (per Vendor Roster, DEC-20260506-A).`);
  lines.push("");
  lines.push("## 1. Headline summary");
  lines.push("");
  lines.push(`- Phase A (sandbox): ${phaseACalls.length} calls, ${okA} ok / ${phaseACalls.length - okA} failed. Real-money cost: €0.00 (virtual credit).`);
  if (phaseBRan && phaseBConfirmed) {
    lines.push(`- Phase B (production): ${phaseBCalls.length} calls, ${okB} ok / ${phaseBCalls.length - okB} failed. Real-money cost: €${realCostB.toFixed(2)} (estimate was €${estimatedCostB.toFixed(2)}).`);
  } else if (phaseBRan && !phaseBConfirmed) {
    lines.push("- Phase B (production): NOT RUN — required preconditions not met (missing prod key or user did not confirm).");
  } else {
    lines.push("- Phase B (production): NOT INVOKED — re-run with `--production` to enable.");
  }
  lines.push("");

  // 2. Phase A results
  lines.push("## 2. Phase A (sandbox) results");
  lines.push("");
  lines.push("| Mode | Endpoint | Country | Identifier | Status | Latency | Error |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const c of phaseACalls) {
    lines.push(
      `| ${c.result.mode} | ${c.result.endpoint} | ${c.result.country ?? ""} | ${c.result.identifier} | ${c.result.status} | ${c.result.latencyMs}ms | ${c.result.error ?? ""} |`,
    );
  }
  lines.push("");

  // 3. Phase B results
  if (phaseBCalls.length > 0) {
    lines.push("## 3. Phase B (production) results");
    lines.push("");
    lines.push("| Mode | Endpoint | Country | Identifier | Status | Latency | Error |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const c of phaseBCalls) {
      lines.push(
        `| ${c.result.mode} | ${c.result.endpoint} | ${c.result.country ?? ""} | ${c.result.identifier} | ${c.result.status} | ${c.result.latencyMs}ms | ${c.result.error ?? ""} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("## 3. Phase B (production) results");
    lines.push("");
    lines.push("Phase B did not run.");
    lines.push("");
  }

  // 4. Field-coverage matrix
  lines.push("## 4. Field-coverage matrix");
  lines.push("");
  lines.push("Per (country, endpoint, mode) cell — each Strale required field marked populated/null/missing/empty, with the Openapi response key that mapped (best-effort case-insensitive lookup, depth 2).");
  lines.push("");
  lines.push("| Mode | Endpoint | Country | Entity | " + REQUIRED_FIELDS.join(" | ") + " |");
  lines.push("|" + Array(4 + REQUIRED_FIELDS.length).fill("---").join("|") + "|");
  for (const c of allCalls) {
    if (!c.result.ok) continue;
    const cells = REQUIRED_FIELDS.map((f) => {
      const r = findField(c.result.body, FIELD_CANDIDATES[f]);
      return r.matchedKey ? `${r.status}(${r.matchedKey})` : r.status;
    });
    lines.push(
      `| ${c.result.mode} | ${c.result.endpoint} | ${c.result.country ?? ""} | ${c.result.identifier} | ${cells.join(" | ")} |`,
    );
  }
  lines.push("");

  // 5. Cross-finding observations
  lines.push("## 5. Cross-finding observations");
  lines.push("");
  const observations = computeObservations();
  for (const obs of observations) lines.push(`- ${obs}`);
  lines.push("");

  // 6. Cost analysis
  lines.push("## 6. Cost analysis");
  lines.push("");
  lines.push("- Phase A: €0.00 real money (virtual sandbox credit).");
  if (phaseBCalls.length > 0) {
    const byEndpoint = new Map<string, { count: number; cost: number }>();
    for (const c of phaseBCalls) {
      const cur = byEndpoint.get(c.result.endpoint) ?? { count: 0, cost: 0 };
      cur.count++;
      cur.cost += c.estCostEur;
      byEndpoint.set(c.result.endpoint, cur);
    }
    lines.push("- Phase B per-endpoint breakdown:");
    for (const [ep, v] of [...byEndpoint.entries()].sort()) {
      lines.push(`  - ${ep}: ${v.count} calls × €${(v.cost / v.count).toFixed(2)} = €${v.cost.toFixed(2)}`);
    }
    lines.push(`- Phase B total: €${realCostB.toFixed(2)}`);
    lines.push(`- Projected v1 cost @ 1k calls/mo (assuming WW-Advanced mix): €${(1000 * PRICE_EUR["WW-advanced"]!).toFixed(2)}/mo PAYG.`);
  }
  lines.push("");

  // 7. Suggested follow-ups
  lines.push("## 7. Suggested follow-up actions (NOT executed)");
  lines.push("");
  lines.push("- Review the field-coverage matrix manually against the addendum decision.");
  lines.push("- For any country where Phase A succeeded but Phase B failed (or vice versa), capture the divergence in a separate note before signing.");
  lines.push("- If addendum is signed: run the capability onboarding pipeline (DEC-20260320-B) to register Openapi-backed handlers per country. The OpenapiClient is already in place and reusable.");
  lines.push("- If addendum is rejected: deactivate the OpenapiClient module or leave dormant; no live capability depends on it.");
  lines.push("");

  // Audit-phase deviations (transparency)
  lines.push("## Appendix — audit-phase deviations from prompt");
  lines.push("");
  lines.push("- Prompt specified `apps/api/.env.example`; actual `.env.example` lives at repo root. Used the actual location.");
  lines.push("- Prompt specified `apps/api/src/scripts/test-openapi-com.ts`; the convention in this repo is `apps/api/scripts/` (155 existing scripts). Used the convention.");
  lines.push("- Sandbox does NOT cover NL, HU, SI, BG, RO, LU, SK, MT, CY (9 of 19 target countries). Phase A coverage capped at the 10 sandbox-supported countries; the other 9 are Phase B-only.");
  lines.push("");

  return lines.join("\n");
}

function computeObservations(): string[] {
  const out: string[] = [];
  // Per-endpoint success rate
  const byEndpoint = new Map<string, { ok: number; total: number }>();
  for (const c of allCalls) {
    const cur = byEndpoint.get(c.result.endpoint) ?? { ok: 0, total: 0 };
    cur.total++;
    if (c.result.ok) cur.ok++;
    byEndpoint.set(c.result.endpoint, cur);
  }
  for (const [ep, v] of [...byEndpoint.entries()].sort()) {
    out.push(`Endpoint ${ep}: ${v.ok}/${v.total} ok (${Math.round((v.ok / v.total) * 100)}%).`);
  }
  // Field availability per endpoint
  for (const f of REQUIRED_FIELDS) {
    const populated = allCalls.filter((c) => c.result.ok && findField(c.result.body, FIELD_CANDIDATES[f]).status === "populated").length;
    const okTotal = allCalls.filter((c) => c.result.ok).length;
    if (okTotal > 0) {
      out.push(`Field ${f}: populated in ${populated}/${okTotal} successful responses (${Math.round((populated / okTotal) * 100)}%).`);
    }
  }
  return out;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Openapi.com testing harness");
  // eslint-disable-next-line no-console
  console.log(`Phase A: sandbox (always)`);
  // eslint-disable-next-line no-console
  console.log(`Phase B: production (--production flag): ${RUN_PRODUCTION ? "ENABLED" : "skipped"}`);

  if (!process.env.OPENAPI_COM_API_TOKEN_SANDBOX) {
    // eslint-disable-next-line no-console
    console.error(
      "OPENAPI_COM_API_TOKEN_SANDBOX is not set. Get the sandbox key from " +
        "console.openapi.com > Authentication > Sandbox box (right-hand box, beach-umbrella icon), " +
        "and add it to .env.",
    );
    process.exit(1);
  }

  await runPhaseA();

  let phaseBRan = false;
  let phaseBConfirmed = false;
  let estimatedCostB = 0;
  if (RUN_PRODUCTION) {
    phaseBRan = true;
    phaseBConfirmed = await runPhaseB();
  }

  // Write report
  const reportDir = resolve(import.meta.dirname, "../../../docs/research");
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, "2026-05-06-openapi-com-sandbox-test.md");
  const report = buildReport(phaseBRan, phaseBConfirmed, estimatedCostB);
  writeFileSync(reportPath, report, "utf8");
  // eslint-disable-next-line no-console
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
