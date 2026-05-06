/**
 * Phase B-bis retry — VAT-format alts for the 8 countries that returned 406.
 *
 * Phase B-bis sweep with registry-format IDs returned HTTP 406 for 8 of 9
 * target countries (NL/HU/SI/RO/LU/SK/MT/CY) — only BG with UIC succeeded.
 * 406 (Not Acceptable) on Openapi typically signals country/ID-format
 * mismatch rather than missing coverage. This retry script tests VAT-format
 * IDs to disambiguate.
 *
 * Cost: 8 × €0.06 = €0.48 (WW-Start only).
 * Skips countries already confirmed covered (BG).
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

interface Retry {
  country: string;
  vatId: string;
  name: string;
}

// VAT-formatted IDs for the 8 countries that returned 406 with registry IDs.
const RETRIES: Retry[] = [
  { country: "NL", vatId: "NL821218833B01", name: "ASML Holding N.V. (VAT NL821218833B01)" },
  { country: "HU", vatId: "HU10625790", name: "MOL Nyrt. (VAT HU10625790)" },
  { country: "SI", vatId: "SI82646716", name: "Krka d.d. (VAT SI82646716)" },
  { country: "RO", vatId: "RO1590082", name: "OMV Petrom (VAT RO1590082)" },
  { country: "LU", vatId: "LU22850926", name: "ArcelorMittal (VAT LU22850926)" },
  { country: "SK", vatId: "SK2020481748", name: "Tatry mountain resorts (VAT SK2020481748)" },
  { country: "MT", vatId: "MT16234415", name: "Bank of Valletta (VAT MT16234415)" },
  { country: "CY", vatId: "CY10006578D", name: "Bank of Cyprus Holdings (VAT CY10006578D)" },
];

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Phase B-bis retry — VAT-format alts for 406 countries\n");

  if (!process.env.OPENAPI_COM_API_TOKEN_PROD) {
    // eslint-disable-next-line no-console
    console.error("OPENAPI_COM_API_TOKEN_PROD is not set. Halt.");
    process.exit(1);
  }
  const client = new OpenapiClient("production");

  const results: Array<{ retry: Retry; result: OpenapiResult }> = [];
  let spent = 0;
  const PRICE_PER_CALL = 0.06;
  for (const r of RETRIES) {
    const result = await client.wwStart(r.country, r.vatId);
    spent += PRICE_PER_CALL;
    results.push({ retry: r, result });
    // eslint-disable-next-line no-console
    console.log(
      `  ${result.ok ? "✓" : "✗"} WW-start ${r.country} ${r.vatId.padEnd(20)} → ${result.status} (${result.latencyMs}ms)${result.error ? ` [${result.error}]` : ""} | spent €${spent.toFixed(2)}`,
    );
    const safeId = r.vatId.replace(/[^A-Za-z0-9_-]/g, "_");
    writeFileSync(
      resolve(FIXTURE_DIR, `prod-${r.country}-WW-start-${safeId}.json`),
      JSON.stringify({ entityName: r.name, result }, null, 2),
      "utf8",
    );
  }

  // eslint-disable-next-line no-console
  console.log(`\nTotal retry spend: €${spent.toFixed(2)}`);

  // Persist machine-readable retry summary
  writeFileSync(
    resolve(FIXTURE_DIR, "phase-b-bis-retry-summary.json"),
    JSON.stringify(
      {
        runStartedAt: new Date().toISOString(),
        totalSpendEur: spent,
        results: results.map((r) => ({
          country: r.retry.country,
          vatId: r.retry.vatId,
          entityName: r.retry.name,
          status: r.result.status,
          ok: r.result.ok,
          error: r.result.error,
          latencyMs: r.result.latencyMs,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  // eslint-disable-next-line no-console
  console.log("\nVerdict per country (VAT-format retry):");
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`  ${r.retry.country}: ${r.result.status}${r.result.ok ? " ✓ COVERED via VAT" : ""}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
