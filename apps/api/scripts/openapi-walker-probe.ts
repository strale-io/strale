/**
 * Openapi.com walker probe — sandbox-only body dump.
 *
 * Phase A reported directors=0/41 and legal_form=0/41 across all 41 sandbox
 * calls. The walker's candidate list already includes plausible keys
 * (legalForm, formaGiuridica, stakeholders, directors, …) — yet zero hits.
 * Two possible explanations: (a) the actual response uses a key not in the
 * candidate list, or (b) the data really is absent in sandbox. This script
 * resolves the question by dumping raw bodies for four sandbox calls so the
 * key paths can be read directly.
 *
 * Cost: €0 (sandbox virtual credit).
 *
 * Output: docs/research/2026-05-06-openapi-phase-b-fixtures/{file}.json
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { OpenapiClient } from "../src/lib/vendors/openapi-com/client.js";
import type { OpenapiResult } from "../src/lib/vendors/openapi-com/types.js";

// UTF-16LE fallback for Windows-encoded .env (matches Phase A script)
config({ path: resolve(import.meta.dirname, "../../../.env") });
const ENV_KEYS = [
  "OPENAPI_COM_API_TOKEN_SANDBOX",
  "OPENAPI_COM_API_TOKEN_PROD",
  "OPENAPI_COM_EMAIL",
];
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
    /* missing .env is fine if env is set in the shell */
  }
}

const FIXTURE_DIR = resolve(
  import.meta.dirname,
  "../../../docs/research/2026-05-06-openapi-phase-b-fixtures",
);
mkdirSync(FIXTURE_DIR, { recursive: true });

interface Probe {
  label: string;
  fn: (c: OpenapiClient) => Promise<OpenapiResult>;
}

const PROBES: Probe[] = [
  {
    label: "sandbox-IT-advanced-12485671007",
    fn: (c) => c.countryAdvanced("IT", "12485671007"),
  },
  {
    label: "sandbox-IT-stakeholders-12485671007",
    fn: (c) => c.itStakeholders("12485671007"),
  },
  {
    label: "sandbox-DE-advanced-DE811115368",
    fn: (c) => c.countryAdvanced("DE", "DE811115368"),
  },
  {
    label: "sandbox-ES-advanced-ESA81948077",
    fn: (c) => c.countryAdvanced("ES", "ESA81948077"),
  },
  {
    label: "sandbox-PT-advanced-PT500273170",
    fn: (c) => c.countryAdvanced("PT", "PT500273170"),
  },
  {
    label: "sandbox-AT-advanced-ATU22852606",
    fn: (c) => c.countryAdvanced("AT", "ATU22852606"),
  },
];

/** Walks an object and returns every leaf key path with its value type. */
function flattenKeys(
  val: unknown,
  prefix = "",
  acc: Array<{ path: string; type: string; sample: string }> = [],
  depth = 0,
): Array<{ path: string; type: string; sample: string }> {
  if (depth > 8) return acc;
  if (val === null) {
    acc.push({ path: prefix || "(root)", type: "null", sample: "null" });
    return acc;
  }
  if (Array.isArray(val)) {
    acc.push({ path: prefix, type: `array[${val.length}]`, sample: "" });
    val.slice(0, 2).forEach((v, i) => flattenKeys(v, `${prefix}[${i}]`, acc, depth + 1));
    return acc;
  }
  if (typeof val === "object") {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      flattenKeys(v, prefix ? `${prefix}.${k}` : k, acc, depth + 1);
    }
    return acc;
  }
  const sample = typeof val === "string" ? `"${val.slice(0, 60)}"` : String(val);
  acc.push({ path: prefix, type: typeof val, sample });
  return acc;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Openapi.com walker probe — sandbox body dump\n");

  if (!process.env.OPENAPI_COM_API_TOKEN_SANDBOX) {
    // eslint-disable-next-line no-console
    console.error("OPENAPI_COM_API_TOKEN_SANDBOX not set. Aborting.");
    process.exit(1);
  }

  const client = new OpenapiClient("sandbox");

  for (const probe of PROBES) {
    const result = await probe.fn(client);
    // eslint-disable-next-line no-console
    console.log(
      `${result.ok ? "✓" : "✗"} ${probe.label.padEnd(40)} ${result.status} (${result.latencyMs}ms)`,
    );
    const fixturePath = resolve(FIXTURE_DIR, `${probe.label}.json`);
    writeFileSync(fixturePath, JSON.stringify(result.body, null, 2), "utf8");

    // Also print a flattened key map showing every leaf path. Useful for
    // identifying directors/legal_form keys without scrolling through 50KB
    // of nested JSON.
    if (result.body) {
      const keys = flattenKeys(result.body);
      // eslint-disable-next-line no-console
      console.log(`  ${keys.length} leaf paths. Searching for legal-form / director-shaped keys:`);
      const hits = keys.filter((k) => {
        const lc = k.path.toLowerCase();
        return (
          lc.includes("form") ||
          lc.includes("type") ||
          lc.includes("director") ||
          lc.includes("officer") ||
          lc.includes("stakeholder") ||
          lc.includes("rappresent") ||
          lc.includes("amminist") ||
          lc.includes("rechts") ||
          lc.includes("juridic") ||
          lc.includes("nature") ||
          lc.includes("classification") ||
          lc.includes("category") ||
          lc.includes("shareholders") ||
          lc.includes("auditor") ||
          lc.includes("role") ||
          lc.includes("management")
        );
      });
      for (const h of hits.slice(0, 30)) {
        // eslint-disable-next-line no-console
        console.log(`    ${h.path.padEnd(60)} ${h.type.padEnd(12)} ${h.sample}`);
      }
      if (hits.length > 30) {
        // eslint-disable-next-line no-console
        console.log(`    … ${hits.length - 30} more hits truncated`);
      }
      if (hits.length === 0) {
        // eslint-disable-next-line no-console
        console.log("    (no candidate keys found)");
      }
    }
    // eslint-disable-next-line no-console
    console.log("");
  }

  // eslint-disable-next-line no-console
  console.log(`Fixtures written to ${FIXTURE_DIR}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
