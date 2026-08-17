/**
 * Diagnostic for the 3 zero-hit adverse-media entities from the 2026-04-27
 * empirical coverage test (IT/BPVi, GR/Folli Follie, EE/Danske Bank Estonia).
 *
 * Tests whether the zero-hit was caused by entity-name variants vs. genuine
 * Dilisense coverage gap. Runs each variant directly against the Dilisense
 * media API.
 *
 * Cost: up to 9 Dilisense calls. If Starter quota is exhausted, calls return 429
 * and the script reports the variants as "untestable until quota reset / Basic upgrade".
 *
 * Usage: cd apps/api && npx tsx scripts/diag-adverse-media-variants.ts
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

const DILISENSE_KEY = process.env.DILISENSE_API_KEY;
if (!DILISENSE_KEY) {
  console.error("DILISENSE_API_KEY not set in .env");
  process.exit(1);
}

type Variant = { country: string; lang: string; baseline: string; variant: string; type: "company" | "person"; rationale: string };

const VARIANTS: Variant[] = [
  // IT — Banca Popolare di Vicenza (major 2017 bank failure)
  { country: "IT", lang: "it", baseline: "Banca Popolare di Vicenza", variant: "BPVi", type: "company", rationale: "Common Italian-press abbreviation" },
  { country: "IT", lang: "it", baseline: "Banca Popolare di Vicenza", variant: "Banca Popolare di Vicenza Scpa", type: "company", rationale: "Full legal form (Società Cooperativa per Azioni)" },
  { country: "IT", lang: "it", baseline: "Banca Popolare di Vicenza", variant: "Popolare di Vicenza", type: "company", rationale: "Drop 'Banca' prefix" },

  // GR — Folli Follie (major 2018 fraud scandal)
  { country: "GR", lang: "el", baseline: "Folli Follie", variant: "Folli Follie SA", type: "company", rationale: "With legal form suffix" },
  { country: "GR", lang: "el", baseline: "Folli Follie", variant: "FF Group", type: "company", rationale: "Group brand name actually used in Greek press" },
  { country: "GR", lang: "el", baseline: "Folli Follie", variant: "Folli Follie Group", type: "company", rationale: "Holding company name" },

  // EE — Danske Bank Estonia (major laundering scandal)
  { country: "EE", lang: "et", baseline: "Danske Bank Estonia", variant: "Danske Bank", type: "company", rationale: "Without 'Estonia' suffix — Danske is the parent name" },
  { country: "EE", lang: "et", baseline: "Danske Bank Estonia", variant: "Danske Bank Eesti", type: "company", rationale: "Estonian-language form" },
  { country: "EE", lang: "et", baseline: "Danske Bank Estonia", variant: "Danske Bank A/S Eesti filiaal", type: "company", rationale: "Official Estonian branch name" },
];

type Result = {
  country: string;
  lang: string;
  baseline: string;
  variant: string;
  status: "hits" | "zero" | "quota_exhausted" | "error";
  total_hits: number | null;
  has_native_lang_article: boolean | null;
  category_counts: Record<string, number> | null;
  error: string | null;
};

async function testVariant(v: Variant): Promise<Result> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const params = new URLSearchParams({
    names: v.variant,
    fetch_articles: "true",
    start_date: oneYearAgo.toISOString().slice(0, 10),
  });
  const url = `https://api.dilisense.com/v1/media/checkEntity?${params}`;
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": DILISENSE_KEY! },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      return {
        country: v.country, lang: v.lang, baseline: v.baseline, variant: v.variant,
        status: "quota_exhausted", total_hits: null, has_native_lang_article: null, category_counts: null, error: null,
      };
    }
    if (!res.ok) {
      const body = await res.text();
      return {
        country: v.country, lang: v.lang, baseline: v.baseline, variant: v.variant,
        status: "error", total_hits: null, has_native_lang_article: null, category_counts: null,
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = await res.json() as {
      total_hits: number;
      news_exposures: Record<string, { hits: number; articles?: Array<{ language: string }> }>;
    };
    const counts: Record<string, number> = {};
    let nativeLang = false;
    for (const [name, exp] of Object.entries(data.news_exposures)) {
      counts[name] = exp.hits;
      for (const a of exp.articles ?? []) {
        if (a.language === v.lang) { nativeLang = true; break; }
      }
    }
    return {
      country: v.country, lang: v.lang, baseline: v.baseline, variant: v.variant,
      status: data.total_hits > 0 ? "hits" : "zero",
      total_hits: data.total_hits, has_native_lang_article: nativeLang, category_counts: counts, error: null,
    };
  } catch (err) {
    return {
      country: v.country, lang: v.lang, baseline: v.baseline, variant: v.variant,
      status: "error", total_hits: null, has_native_lang_article: null, category_counts: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

console.log(`\n=== Adverse-media variant diagnostic — ${new Date().toISOString()} ===\n`);

const results: Result[] = [];
for (const v of VARIANTS) {
  process.stdout.write(`  [${v.country}/${v.lang}] "${v.variant}" ... `);
  const r = await testVariant(v);
  results.push(r);
  if (r.status === "hits") {
    console.log(`✓ ${r.total_hits} hits, native_lang=${r.has_native_lang_article}`);
  } else if (r.status === "zero") {
    console.log("✗ 0 hits");
  } else if (r.status === "quota_exhausted") {
    console.log("⚠ quota exhausted (HTTP 429)");
  } else {
    console.log(`ERR: ${r.error}`);
  }
  await new Promise((r) => setTimeout(r, 4000));
}

console.log(`\n=== Per-baseline summary ===\n`);
const baselines = [...new Set(VARIANTS.map((v) => v.baseline))];
for (const b of baselines) {
  const variantsForB = results.filter((r) => r.baseline === b);
  const hits = variantsForB.filter((r) => r.status === "hits");
  const country = variantsForB[0]?.country ?? "?";
  console.log(`  [${country}] ${b}`);
  if (hits.length > 0) {
    console.log(`    → RECOVERED via variants:`);
    for (const h of hits) console.log(`        "${h.variant}" → ${h.total_hits} hits (native_lang=${h.has_native_lang_article})`);
  } else {
    const blocked = variantsForB.filter((r) => r.status === "quota_exhausted");
    if (blocked.length === variantsForB.length) {
      console.log(`    → UNTESTABLE: all ${variantsForB.length} variants 429 (quota exhausted; defer to Basic upgrade or May 1 quota reset)`);
    } else {
      console.log(`    → CONFIRMED ZERO: tested variants returned 0 hits — likely real Dilisense coverage gap`);
    }
  }
}

process.exit(0);
