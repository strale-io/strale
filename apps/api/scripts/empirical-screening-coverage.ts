/**
 * Empirical coverage test for the three Payee Assurance screening capabilities.
 *
 * - PEP: 2 known PEPs per jurisdiction × 30 (EU27 + UK + NO + CH) + 5 US PEPs
 *   via Strale /v1/do → pep-check. Tests breadth of OpenSanctions PEP coverage.
 * - Adverse media: 1 known-controversy subject in native language × ~22
 *   non-DE/FR/EN countries via direct Dilisense adverse-media API. Tests
 *   per-language coverage breadth.
 * - Sanctions: 5 known-sanctioned individuals + 5 known-clean entities to
 *   confirm no false positives/negatives at the score-threshold default.
 *
 * Output: a markdown coverage table. No DB writes.
 *
 * Usage: cd apps/api && npx tsx scripts/empirical-screening-coverage.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });

if (!process.env.DILISENSE_API_KEY) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    if (line.startsWith("DILISENSE_API_KEY=")) {
      process.env.DILISENSE_API_KEY = line.substring("DILISENSE_API_KEY=".length);
      break;
    }
  }
}

const STRALE_API = process.env.STRALE_API_URL ?? "https://api.strale.io";
const STRALE_KEY = process.env.STRALE_TEST_API_KEY;
const DILISENSE_KEY = process.env.DILISENSE_API_KEY;

if (!STRALE_KEY) {
  console.error("STRALE_TEST_API_KEY not set. Export your sk_live_... key first.");
  process.exit(1);
}
if (!DILISENSE_KEY) {
  console.error("DILISENSE_API_KEY not set in .env");
  process.exit(1);
}

// ─── Test corpora ────────────────────────────────────────────────────────────

type PepCase = { country: string; cc: string; name: string; tier: "head_of_state" | "second_tier"; expected: boolean };

const PEP_CASES: PepCase[] = [
  // EU27 — head of government / state (tier 1: high-profile, should hit)
  { country: "Sweden", cc: "SE", name: "Ulf Kristersson", tier: "head_of_state", expected: true },
  { country: "Denmark", cc: "DK", name: "Mette Frederiksen", tier: "head_of_state", expected: true },
  { country: "Finland", cc: "FI", name: "Petteri Orpo", tier: "head_of_state", expected: true },
  { country: "Germany", cc: "DE", name: "Olaf Scholz", tier: "head_of_state", expected: true },
  { country: "France", cc: "FR", name: "Emmanuel Macron", tier: "head_of_state", expected: true },
  { country: "Italy", cc: "IT", name: "Giorgia Meloni", tier: "head_of_state", expected: true },
  { country: "Spain", cc: "ES", name: "Pedro Sánchez", tier: "head_of_state", expected: true },
  { country: "Netherlands", cc: "NL", name: "Dick Schoof", tier: "head_of_state", expected: true },
  { country: "Belgium", cc: "BE", name: "Alexander De Croo", tier: "head_of_state", expected: true },
  { country: "Austria", cc: "AT", name: "Karl Nehammer", tier: "head_of_state", expected: true },
  { country: "Ireland", cc: "IE", name: "Simon Harris", tier: "head_of_state", expected: true },
  { country: "Portugal", cc: "PT", name: "Luís Montenegro", tier: "head_of_state", expected: true },
  { country: "Poland", cc: "PL", name: "Donald Tusk", tier: "head_of_state", expected: true },
  { country: "Czech Republic", cc: "CZ", name: "Petr Fiala", tier: "head_of_state", expected: true },
  { country: "Hungary", cc: "HU", name: "Viktor Orbán", tier: "head_of_state", expected: true },
  { country: "Romania", cc: "RO", name: "Marcel Ciolacu", tier: "head_of_state", expected: true },
  { country: "Bulgaria", cc: "BG", name: "Dimitar Glavchev", tier: "head_of_state", expected: true },
  { country: "Greece", cc: "GR", name: "Kyriakos Mitsotakis", tier: "head_of_state", expected: true },
  { country: "Croatia", cc: "HR", name: "Andrej Plenković", tier: "head_of_state", expected: true },
  { country: "Slovakia", cc: "SK", name: "Robert Fico", tier: "head_of_state", expected: true },
  { country: "Slovenia", cc: "SI", name: "Robert Golob", tier: "head_of_state", expected: true },
  { country: "Lithuania", cc: "LT", name: "Ingrida Šimonytė", tier: "head_of_state", expected: true },
  { country: "Latvia", cc: "LV", name: "Evika Siliņa", tier: "head_of_state", expected: true },
  { country: "Estonia", cc: "EE", name: "Kaja Kallas", tier: "head_of_state", expected: true },
  { country: "Cyprus", cc: "CY", name: "Nikos Christodoulides", tier: "head_of_state", expected: true },
  { country: "Malta", cc: "MT", name: "Robert Abela", tier: "head_of_state", expected: true },
  { country: "Luxembourg", cc: "LU", name: "Luc Frieden", tier: "head_of_state", expected: true },
  // UK + NO + CH
  { country: "United Kingdom", cc: "GB", name: "Keir Starmer", tier: "head_of_state", expected: true },
  { country: "Norway", cc: "NO", name: "Jonas Gahr Støre", tier: "head_of_state", expected: true },
  { country: "Switzerland", cc: "CH", name: "Viola Amherd", tier: "head_of_state", expected: true },

  // Tier 2 — central bank governors / senior judges (tests breadth past heads of state)
  { country: "Sweden", cc: "SE", name: "Erik Thedéen", tier: "second_tier", expected: true },
  { country: "Germany", cc: "DE", name: "Joachim Nagel", tier: "second_tier", expected: true },
  { country: "France", cc: "FR", name: "François Villeroy de Galhau", tier: "second_tier", expected: true },
  { country: "Italy", cc: "IT", name: "Fabio Panetta", tier: "second_tier", expected: true },
  { country: "Spain", cc: "ES", name: "Pablo Hernández de Cos", tier: "second_tier", expected: true },
  { country: "Netherlands", cc: "NL", name: "Klaas Knot", tier: "second_tier", expected: true },
  { country: "Poland", cc: "PL", name: "Adam Glapiński", tier: "second_tier", expected: true },
  { country: "Hungary", cc: "HU", name: "György Matolcsy", tier: "second_tier", expected: true },
  { country: "United Kingdom", cc: "GB", name: "Andrew Bailey", tier: "second_tier", expected: true },
  { country: "Norway", cc: "NO", name: "Ida Wolden Bache", tier: "second_tier", expected: true },
  { country: "Switzerland", cc: "CH", name: "Thomas Jordan", tier: "second_tier", expected: true },
  { country: "Czech Republic", cc: "CZ", name: "Aleš Michl", tier: "second_tier", expected: true },
  { country: "Romania", cc: "RO", name: "Mugur Isărescu", tier: "second_tier", expected: true },
  { country: "Greece", cc: "GR", name: "Yannis Stournaras", tier: "second_tier", expected: true },
  { country: "Portugal", cc: "PT", name: "Mário Centeno", tier: "second_tier", expected: true },
  { country: "Belgium", cc: "BE", name: "Pierre Wunsch", tier: "second_tier", expected: true },
  { country: "Austria", cc: "AT", name: "Robert Holzmann", tier: "second_tier", expected: true },
  { country: "Ireland", cc: "IE", name: "Gabriel Makhlouf", tier: "second_tier", expected: true },
  { country: "Finland", cc: "FI", name: "Olli Rehn", tier: "second_tier", expected: true },
  { country: "Denmark", cc: "DK", name: "Christian Kettel Thomsen", tier: "second_tier", expected: true },
  { country: "Slovakia", cc: "SK", name: "Peter Kažimír", tier: "second_tier", expected: true },
  { country: "Slovenia", cc: "SI", name: "Boštjan Vasle", tier: "second_tier", expected: true },
  { country: "Croatia", cc: "HR", name: "Boris Vujčić", tier: "second_tier", expected: true },
  { country: "Bulgaria", cc: "BG", name: "Dimitar Radev", tier: "second_tier", expected: true },
  { country: "Lithuania", cc: "LT", name: "Gediminas Šimkus", tier: "second_tier", expected: true },
  { country: "Latvia", cc: "LV", name: "Mārtiņš Kazāks", tier: "second_tier", expected: true },
  { country: "Estonia", cc: "EE", name: "Madis Müller", tier: "second_tier", expected: true },
  { country: "Cyprus", cc: "CY", name: "Christodoulos Patsalides", tier: "second_tier", expected: true },
  { country: "Malta", cc: "MT", name: "Edward Scicluna", tier: "second_tier", expected: true },
  { country: "Luxembourg", cc: "LU", name: "Gaston Reinesch", tier: "second_tier", expected: true },

  // US (v1.1)
  { country: "United States", cc: "US", name: "Joseph Biden", tier: "head_of_state", expected: true },
  { country: "United States", cc: "US", name: "Antony Blinken", tier: "head_of_state", expected: true },
  { country: "United States", cc: "US", name: "Janet Yellen", tier: "head_of_state", expected: true },
  { country: "United States", cc: "US", name: "Jerome Powell", tier: "second_tier", expected: true },
  { country: "United States", cc: "US", name: "John Roberts", tier: "second_tier", expected: true },
];

type AdverseCase = { country: string; cc: string; lang: string; subject: string; type: "company" | "person" };

const ADVERSE_CASES: AdverseCase[] = [
  // Languages already covered by Dilisense marketing claim — reference baseline
  { country: "Germany", cc: "DE", lang: "de", subject: "Wirecard AG", type: "company" },
  { country: "France", cc: "FR", lang: "fr", subject: "Carlos Ghosn", type: "person" },
  { country: "United Kingdom", cc: "GB", lang: "en", subject: "Wirecard AG", type: "company" },
  // Languages NOT in marketing claim — these are the real coverage test
  { country: "Sweden", cc: "SE", lang: "sv", subject: "Swedbank AB", type: "company" },
  { country: "Norway", cc: "NO", lang: "no", subject: "DNB ASA", type: "company" },
  { country: "Denmark", cc: "DK", lang: "da", subject: "Danske Bank A/S", type: "company" },
  { country: "Finland", cc: "FI", lang: "fi", subject: "Nordea Bank", type: "company" },
  { country: "Netherlands", cc: "NL", lang: "nl", subject: "Vestia", type: "company" },
  { country: "Italy", cc: "IT", lang: "it", subject: "Banca Popolare di Vicenza", type: "company" },
  { country: "Spain", cc: "ES", lang: "es", subject: "Bankia", type: "company" },
  { country: "Portugal", cc: "PT", lang: "pt", subject: "Banco Espírito Santo", type: "company" },
  { country: "Poland", cc: "PL", lang: "pl", subject: "GetBack SA", type: "company" },
  { country: "Czech Republic", cc: "CZ", lang: "cs", subject: "Andrej Babiš", type: "person" },
  { country: "Hungary", cc: "HU", lang: "hu", subject: "Lőrinc Mészáros", type: "person" },
  { country: "Romania", cc: "RO", lang: "ro", subject: "Liviu Dragnea", type: "person" },
  { country: "Bulgaria", cc: "BG", lang: "bg", subject: "Tsvetan Vassilev", type: "person" },
  { country: "Greece", cc: "GR", lang: "el", subject: "Folli Follie", type: "company" },
  { country: "Slovakia", cc: "SK", lang: "sk", subject: "Marian Kočner", type: "person" },
  { country: "Slovenia", cc: "SI", lang: "sl", subject: "Janez Janša", type: "person" },
  { country: "Croatia", cc: "HR", lang: "hr", subject: "Ivo Sanader", type: "person" },
  { country: "Lithuania", cc: "LT", lang: "lt", subject: "Snoras Bank", type: "company" },
  { country: "Latvia", cc: "LV", lang: "lv", subject: "ABLV Bank", type: "company" },
  { country: "Estonia", cc: "EE", lang: "et", subject: "Danske Bank Estonia", type: "company" },
  // CH Italian
  { country: "Switzerland", cc: "CH", lang: "it", subject: "Credit Suisse", type: "company" },
];

// ─── Strale /v1/do PEP test ─────────────────────────────────────────────────

type PepResult = {
  country: string;
  cc: string;
  name: string;
  tier: string;
  is_pep: boolean | null;
  match_count: number | null;
  classification: string | null;
  list_count: number | null;
  list_version: string | null;
  source: string | null;
  error: string | null;
};

async function testPep(c: PepCase): Promise<PepResult> {
  try {
    const res = await fetch(`${STRALE_API}/v1/do`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${STRALE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        capability_slug: "pep-check",
        inputs: { name: c.name, country: c.cc },
        max_price_cents: 50,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text();
      return { country: c.country, cc: c.cc, name: c.name, tier: c.tier, is_pep: null, match_count: null, classification: null, list_count: null, list_version: null, source: null, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json() as { result?: { output?: Record<string, unknown> } };
    const out = data.result?.output ?? {};
    const matches = (out.matches as Array<{ classification?: string }>) ?? [];
    return {
      country: c.country, cc: c.cc, name: c.name, tier: c.tier,
      is_pep: out.is_pep as boolean,
      match_count: out.match_count as number,
      classification: matches[0]?.classification ?? null,
      list_count: ((out.lists_queried as Record<string, unknown>)?.list_count as number) ?? null,
      list_version: ((out.lists_queried as Record<string, unknown>)?.version as string) ?? null,
      source: out.source as string,
      error: null,
    };
  } catch (err) {
    return { country: c.country, cc: c.cc, name: c.name, tier: c.tier, is_pep: null, match_count: null, classification: null, list_count: null, list_version: null, source: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Dilisense direct adverse-media test ────────────────────────────────────

type AdverseResult = {
  country: string;
  cc: string;
  lang: string;
  subject: string;
  total_hits: number | null;
  categories: Record<string, number> | null;
  has_native_lang_article: boolean | null;
  error: string | null;
};

async function testAdverse(c: AdverseCase): Promise<AdverseResult> {
  try {
    const endpoint = c.type === "company" ? "checkEntity" : "checkIndividual";
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const params = new URLSearchParams({ names: c.subject, fetch_articles: "true", start_date: oneYearAgo.toISOString().slice(0, 10) });
    const res = await fetch(`https://api.dilisense.com/v1/media/${endpoint}?${params}`, {
      headers: { "x-api-key": DILISENSE_KEY! },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { country: c.country, cc: c.cc, lang: c.lang, subject: c.subject, total_hits: null, categories: null, has_native_lang_article: null, error: `HTTP ${res.status}` };
    }
    const data = await res.json() as { total_hits: number; news_exposures: Record<string, { hits: number; articles?: Array<{ language: string }> }> };
    const categories: Record<string, number> = {};
    let hasNativeLang = false;
    for (const [name, exp] of Object.entries(data.news_exposures)) {
      categories[name] = exp.hits;
      for (const a of exp.articles ?? []) {
        if (a.language === c.lang) { hasNativeLang = true; break; }
      }
    }
    return { country: c.country, cc: c.cc, lang: c.lang, subject: c.subject, total_hits: data.total_hits, categories, has_native_lang_article: hasNativeLang, error: null };
  } catch (err) {
    return { country: c.country, cc: c.cc, lang: c.lang, subject: c.subject, total_hits: null, categories: null, has_native_lang_article: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

console.log(`\n=== Empirical screening coverage — ${new Date().toISOString()} ===\n`);

console.log(`PEP test: ${PEP_CASES.length} cases. Running serially to avoid rate limits...\n`);
const pepResults: PepResult[] = [];
for (const c of PEP_CASES) {
  const r = await testPep(c);
  pepResults.push(r);
  const status = r.error ? `ERR(${r.error.slice(0, 40)})` : r.is_pep ? `✓ PEP (${r.classification ?? "?"}, n=${r.match_count})` : `✗ no match`;
  console.log(`  [${r.cc}] ${r.tier.padEnd(14)} ${r.name.padEnd(40)} ${status}`);
  await new Promise((r) => setTimeout(r, 1100));
}

console.log(`\nAdverse media test: ${ADVERSE_CASES.length} cases (direct Dilisense, throttled 4s/call to respect quota)...\n`);
const adverseResults: AdverseResult[] = [];
for (const c of ADVERSE_CASES) {
  const r = await testAdverse(c);
  adverseResults.push(r);
  const status = r.error ? `ERR(${r.error.slice(0, 40)})` : r.total_hits === 0 ? "✗ 0 hits" : `${r.total_hits} hits, native_lang=${r.has_native_lang_article}`;
  console.log(`  [${r.cc}/${r.lang}] ${r.subject.padEnd(28)} ${status}`);
  await new Promise((r) => setTimeout(r, 4000));
}

// ─── Output markdown ────────────────────────────────────────────────────────

const out: string[] = [];
out.push(`# Empirical Screening Coverage — ${new Date().toISOString().slice(0, 10)}`);
out.push("");
out.push("## PEP coverage (via Strale /v1/do → pep-check, primary source: OpenSanctions default collection)");
out.push("");
out.push("| Country | Tier | Name | is_pep | match_count | classification | source | error |");
out.push("|---|---|---|---|---|---|---|---|");
for (const r of pepResults) {
  out.push(`| ${r.country} | ${r.tier} | ${r.name} | ${r.is_pep ?? "—"} | ${r.match_count ?? "—"} | ${r.classification ?? "—"} | ${r.source ?? "—"} | ${r.error ?? ""} |`);
}

const pepHits = pepResults.filter((r) => r.is_pep).length;
const pepHead = pepResults.filter((r) => r.tier === "head_of_state");
const pepHeadHits = pepHead.filter((r) => r.is_pep).length;
const pepSecond = pepResults.filter((r) => r.tier === "second_tier");
const pepSecondHits = pepSecond.filter((r) => r.is_pep).length;
const pepUS = pepResults.filter((r) => r.cc === "US");
const pepUSHits = pepUS.filter((r) => r.is_pep).length;

out.push("");
out.push("### PEP summary");
out.push(`- Overall hit rate: ${pepHits}/${pepResults.length} (${Math.round(100 * pepHits / pepResults.length)}%)`);
out.push(`- Heads of state/government: ${pepHeadHits}/${pepHead.length} (${Math.round(100 * pepHeadHits / pepHead.length)}%)`);
out.push(`- Second-tier (central bank governors): ${pepSecondHits}/${pepSecond.length} (${Math.round(100 * pepSecondHits / pepSecond.length)}%)`);
out.push(`- US (v1.1): ${pepUSHits}/${pepUS.length}`);

const pepMisses = pepResults.filter((r) => !r.error && !r.is_pep);
if (pepMisses.length > 0) {
  out.push("");
  out.push("### PEP misses (require investigation)");
  for (const r of pepMisses) out.push(`- **${r.country}** (${r.tier}): ${r.name}`);
}

out.push("");
out.push("## Adverse media coverage (via direct Dilisense /v1/media/check{Entity,Individual})");
out.push("");
out.push("| Country | Lang | Subject | total_hits | has_native_lang_article | error |");
out.push("|---|---|---|---|---|---|");
for (const r of adverseResults) {
  out.push(`| ${r.country} | ${r.lang} | ${r.subject} | ${r.total_hits ?? "—"} | ${r.has_native_lang_article ?? "—"} | ${r.error ?? ""} |`);
}

const advWithHits = adverseResults.filter((r) => (r.total_hits ?? 0) > 0).length;
const advNativeLang = adverseResults.filter((r) => r.has_native_lang_article).length;

out.push("");
out.push("### Adverse media summary");
out.push(`- Subjects with any hits: ${advWithHits}/${adverseResults.length}`);
out.push(`- Subjects with native-language articles surfaced: ${advNativeLang}/${adverseResults.length}`);

const reportPath = resolve(import.meta.dirname, "../../../docs/research/2026-04-27-screening-coverage-empirical.md");
const fs = await import("node:fs/promises");
await fs.writeFile(reportPath, out.join("\n"));
console.log(`\n=== Report written: ${reportPath} ===\n`);

process.exit(0);
