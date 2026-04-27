/**
 * Probe GLEIF for total LEI registrations per Payee Assurance target jurisdiction.
 * Free, no auth. Just paginates the lei-records endpoint with filter[entity.legalAddress.country]
 * and reads meta.pagination.total.
 *
 * Usage: cd apps/api && npx tsx scripts/gleif-coverage-by-country.ts
 */
import { writeFile } from "node:fs/promises";

const COUNTRIES: Array<{ cc: string; name: string; group: "v1" | "v1.1" }> = [
  { cc: "SE", name: "Sweden", group: "v1" },
  { cc: "DK", name: "Denmark", group: "v1" },
  { cc: "FI", name: "Finland", group: "v1" },
  { cc: "DE", name: "Germany", group: "v1" },
  { cc: "FR", name: "France", group: "v1" },
  { cc: "IT", name: "Italy", group: "v1" },
  { cc: "ES", name: "Spain", group: "v1" },
  { cc: "NL", name: "Netherlands", group: "v1" },
  { cc: "BE", name: "Belgium", group: "v1" },
  { cc: "AT", name: "Austria", group: "v1" },
  { cc: "IE", name: "Ireland", group: "v1" },
  { cc: "PT", name: "Portugal", group: "v1" },
  { cc: "PL", name: "Poland", group: "v1" },
  { cc: "CZ", name: "Czech Republic", group: "v1" },
  { cc: "HU", name: "Hungary", group: "v1" },
  { cc: "RO", name: "Romania", group: "v1" },
  { cc: "BG", name: "Bulgaria", group: "v1" },
  { cc: "GR", name: "Greece", group: "v1" },
  { cc: "HR", name: "Croatia", group: "v1" },
  { cc: "SK", name: "Slovakia", group: "v1" },
  { cc: "SI", name: "Slovenia", group: "v1" },
  { cc: "LT", name: "Lithuania", group: "v1" },
  { cc: "LV", name: "Latvia", group: "v1" },
  { cc: "EE", name: "Estonia", group: "v1" },
  { cc: "CY", name: "Cyprus", group: "v1" },
  { cc: "MT", name: "Malta", group: "v1" },
  { cc: "LU", name: "Luxembourg", group: "v1" },
  { cc: "GB", name: "United Kingdom", group: "v1" },
  { cc: "NO", name: "Norway", group: "v1" },
  { cc: "CH", name: "Switzerland", group: "v1" },
  { cc: "US", name: "United States", group: "v1.1" },
];

type Result = { cc: string; name: string; group: string; total: number | null; error: string | null };

async function probe(cc: string): Promise<number | null> {
  try {
    const url = `https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalAddress.country%5D=${cc}&page%5Bsize%5D=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { meta?: { pagination?: { total?: number } } };
    return data.meta?.pagination?.total ?? null;
  } catch {
    return null;
  }
}

console.log(`\n=== GLEIF coverage by country — ${new Date().toISOString()} ===\n`);

const results: Result[] = [];
for (const c of COUNTRIES) {
  const total = await probe(c.cc);
  results.push({ cc: c.cc, name: c.name, group: c.group, total, error: total === null ? "fetch_failed" : null });
  const formatted = total !== null ? total.toLocaleString() : "ERR";
  console.log(`  [${c.cc}] ${c.name.padEnd(20)} ${formatted.padStart(10)} active LEIs`);
  await new Promise((r) => setTimeout(r, 200));
}

const v1 = results.filter((r) => r.group === "v1" && r.total !== null);
const v1Total = v1.reduce((sum, r) => sum + (r.total ?? 0), 0);
const us = results.find((r) => r.cc === "US");

console.log(`\n=== Summary ===`);
console.log(`v1 (EU27 + UK + NO + CH): ${v1Total.toLocaleString()} active LEIs across ${v1.length} jurisdictions`);
console.log(`v1.1 (+ US): ${us?.total?.toLocaleString() ?? "ERR"} active LEIs`);

const out: string[] = [];
out.push(`# GLEIF LEI Coverage by Target Country — ${new Date().toISOString().slice(0, 10)}`);
out.push("");
out.push("**Method:** GLEIF public API `/lei-records` with `filter[entity.legalAddress.country]` per ISO country code, reading `meta.pagination.total`. No auth required.");
out.push("");
out.push("## v1 jurisdictions (EU27 + UK + NO + CH)");
out.push("");
out.push("| Country | Code | Active LEIs |");
out.push("|---|---|---|");
for (const r of results.filter((r) => r.group === "v1")) {
  out.push(`| ${r.name} | ${r.cc} | ${r.total !== null ? r.total.toLocaleString() : "—"} |`);
}
out.push("");
out.push(`**v1 total:** ${v1Total.toLocaleString()} active LEIs across ${v1.length} jurisdictions.`);
out.push("");
out.push("## v1.1 jurisdiction (+ US)");
out.push("");
out.push("| Country | Code | Active LEIs |");
out.push("|---|---|---|");
out.push(`| United States | US | ${us?.total !== null && us?.total !== undefined ? us.total.toLocaleString() : "—"} |`);
out.push("");

const reportPath = `${process.cwd()}/../../docs/research/2026-04-27-gleif-coverage-by-country.md`;
await writeFile(reportPath, out.join("\n"));
console.log(`\nReport written: ${reportPath}\n`);

process.exit(0);
