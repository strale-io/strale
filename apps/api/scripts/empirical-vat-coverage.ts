/**
 * Empirical VAT validation coverage across Payee Assurance target countries.
 * EU27 + UK + NO + CH for v1; v1.1 has no VAT (US uses sales tax).
 *
 * One real-world VAT per country, calls /v1/do, captures: provider, valid flag,
 * name returned (for Payee Assurance name-match), error if any.
 *
 * Goal: confirm the capability routes correctly to the right provider for each
 * jurisdiction and returns a structured response. Some VATs may be deregistered
 * — that still tests the provider; "valid: false" is success, not failure.
 *
 * Usage: cd apps/api && STRALE_TEST_API_KEY=sk_live_... npx tsx scripts/empirical-vat-coverage.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const STRALE_API = process.env.STRALE_API_URL ?? "https://api.strale.io";
const STRALE_KEY = process.env.STRALE_TEST_API_KEY;

if (!STRALE_KEY) {
  console.error("STRALE_TEST_API_KEY not set. Export your sk_live_... key first.");
  process.exit(1);
}

type Case = { cc: string; name: string; vat: string; group: "v1-eu27" | "v1-uk" | "v1-no" | "v1-ch" };

const CASES: Case[] = [
  // EU27 via VIES
  { cc: "AT", name: "Austria", vat: "ATU13585627", group: "v1-eu27" },
  { cc: "BE", name: "Belgium", vat: "BE0203068811", group: "v1-eu27" },
  { cc: "BG", name: "Bulgaria", vat: "BG175325652", group: "v1-eu27" },
  { cc: "CY", name: "Cyprus", vat: "CY10110089R", group: "v1-eu27" },
  { cc: "CZ", name: "Czech Republic", vat: "CZ45272956", group: "v1-eu27" },
  { cc: "DE", name: "Germany", vat: "DE811128135", group: "v1-eu27" },
  { cc: "DK", name: "Denmark", vat: "DK13063894", group: "v1-eu27" },
  { cc: "EE", name: "Estonia", vat: "EE100247201", group: "v1-eu27" },
  { cc: "EL", name: "Greece", vat: "EL094014730", group: "v1-eu27" },
  { cc: "ES", name: "Spain", vat: "ESA28005018", group: "v1-eu27" },
  { cc: "FI", name: "Finland", vat: "FI16602075", group: "v1-eu27" },
  { cc: "FR", name: "France", vat: "FR40303265045", group: "v1-eu27" },
  { cc: "HR", name: "Croatia", vat: "HR75550412900", group: "v1-eu27" },
  { cc: "HU", name: "Hungary", vat: "HU13991013", group: "v1-eu27" },
  { cc: "IE", name: "Ireland", vat: "IE6388047V", group: "v1-eu27" },
  { cc: "IT", name: "Italy", vat: "IT00892410010", group: "v1-eu27" },
  { cc: "LT", name: "Lithuania", vat: "LT100001331613", group: "v1-eu27" },
  { cc: "LU", name: "Luxembourg", vat: "LU22416707", group: "v1-eu27" },
  { cc: "LV", name: "Latvia", vat: "LV40103184480", group: "v1-eu27" },
  { cc: "MT", name: "Malta", vat: "MT15121333", group: "v1-eu27" },
  { cc: "NL", name: "Netherlands", vat: "NL859048691B01", group: "v1-eu27" },
  { cc: "PL", name: "Poland", vat: "PL5260250274", group: "v1-eu27" },
  { cc: "PT", name: "Portugal", vat: "PT500100144", group: "v1-eu27" },
  { cc: "RO", name: "Romania", vat: "RO15068500", group: "v1-eu27" },
  { cc: "SE", name: "Sweden", vat: "SE556703748501", group: "v1-eu27" },
  { cc: "SI", name: "Slovenia", vat: "SI23998441", group: "v1-eu27" },
  { cc: "SK", name: "Slovakia", vat: "SK2020443693", group: "v1-eu27" },
  // UK via HMRC
  { cc: "GB", name: "United Kingdom", vat: "GB220430231", group: "v1-uk" },
  // NO via Brreg
  { cc: "NO", name: "Norway", vat: "NO971526157MVA", group: "v1-no" },
  // CH via UID
  { cc: "CH", name: "Switzerland", vat: "CHE116281710", group: "v1-ch" },
];

type Result = {
  cc: string; name: string; group: string; vat: string;
  valid: boolean | null; provider: string | null; entity_name: string | null;
  has_name: boolean; status: string; error: string | null;
};

async function test(c: Case): Promise<Result> {
  try {
    const res = await fetch(`${STRALE_API}/v1/do`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${STRALE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ capability_slug: "vat-validate", inputs: { vat_number: c.vat }, max_price_cents: 50 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text();
      return { cc: c.cc, name: c.name, group: c.group, vat: c.vat, valid: null, provider: null, entity_name: null, has_name: false, status: `HTTP ${res.status}`, error: body.slice(0, 200) };
    }
    const data = await res.json() as { result?: { output?: Record<string, unknown>; status?: string }; error_code?: string; message?: string };
    if (data.error_code) {
      return { cc: c.cc, name: c.name, group: c.group, vat: c.vat, valid: null, provider: null, entity_name: null, has_name: false, status: data.error_code, error: data.message ?? null };
    }
    const out = data.result?.output ?? {};
    const validRaw = out.valid ?? out.is_valid ?? null;
    const name = (out.name ?? out.entity_name ?? out.legal_name ?? null) as string | null;
    return {
      cc: c.cc, name: c.name, group: c.group, vat: c.vat,
      valid: typeof validRaw === "boolean" ? validRaw : null,
      provider: (out.provider ?? out.source ?? null) as string | null,
      entity_name: name,
      has_name: typeof name === "string" && name.trim().length > 0,
      status: data.result?.status ?? "ok",
      error: null,
    };
  } catch (err) {
    return { cc: c.cc, name: c.name, group: c.group, vat: c.vat, valid: null, provider: null, entity_name: null, has_name: false, status: "exception", error: err instanceof Error ? err.message : String(err) };
  }
}

console.log(`\n=== Empirical VAT coverage — ${new Date().toISOString()} ===\n`);
const results: Result[] = [];
for (const c of CASES) {
  const r = await test(c);
  results.push(r);
  const validLabel = r.valid === true ? "✓" : r.valid === false ? "✗" : "—";
  const nameLabel = r.has_name ? `name="${r.entity_name?.slice(0, 30)}"` : "no_name";
  const status = r.error ? `ERR(${r.error.slice(0, 50)})` : `${validLabel} ${nameLabel}`;
  console.log(`  [${r.cc}] ${r.name.padEnd(20)} ${r.vat.padEnd(20)} ${status}`);
  await new Promise((r) => setTimeout(r, 1500)); // throttle for VIES rate limit
}

const out: string[] = [];
out.push(`# Empirical VAT Coverage — ${new Date().toISOString().slice(0, 10)}`);
out.push("");
out.push("**Method:** One real-world VAT per Payee Assurance target country, called via Strale /v1/do → vat-validate. Throttled 1.5s between calls (VIES rate limit). v1.1 (US) has no VAT — sales tax instead, out of scope for this capability.");
out.push("");
out.push("| Country | Code | VAT | valid | Name returned | Provider | Status | Notes |");
out.push("|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const valid = r.valid === true ? "✓ true" : r.valid === false ? "✗ false" : "—";
  const name = r.has_name ? `\`${r.entity_name}\`` : "—";
  const status = r.error ? `ERR` : r.status;
  const notes = r.error ? r.error.slice(0, 80) : "";
  out.push(`| ${r.name} | ${r.cc} | \`${r.vat}\` | ${valid} | ${name} | ${r.provider ?? "—"} | ${status} | ${notes} |`);
}

const ok = results.filter((r) => !r.error).length;
const hasName = results.filter((r) => r.has_name).length;
out.push("");
out.push("## Summary");
out.push(`- Capability returned a structured response: ${ok} / ${results.length}`);
out.push(`- Response included an entity name: ${hasName} / ${results.length} (Payee Assurance name-match availability per country)`);

const reportPath = resolve(import.meta.dirname, "../../../docs/research/2026-04-28-vat-coverage-empirical.md");
await writeFile(reportPath, out.join("\n"));
console.log(`\nReport written: ${reportPath}\n`);
process.exit(0);
