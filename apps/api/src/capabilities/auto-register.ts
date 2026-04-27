/**
 * Auto-discovers and imports all capability executor files.
 * Replaces the manual import list that was previously in app.ts.
 *
 * Deactivated capabilities are tracked in DEACTIVATED with a reason,
 * so they are explicitly skipped (not silently ignored).
 */

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { log, logError } from "../lib/log.js";

const DEACTIVATED = new Map<string, string>([
  ["amazon-price", "Amazon CAPTCHA blocks datacenter IPs"],
  ["hong-kong-company-data", "No viable data source identified"],
  ["indian-company-data", "No viable data source identified"],
  ["singapore-company-data", "No viable data source identified"],
  [
    "annual-report-extract",
    // DEC-20260421-SE-B: Previous runtime fetched allabolag.se/{orgnr}/arsredovisning and
    // extracted financial fields from linked PDFs via Claude Haiku — banned by
    // DEC-20260420-H (Payee Assurance v1 forbids scraping). Bolagsverket's HVD API
    // exposes annual-report filing events but PDF content sits behind the paid
    // årsredovisning-ordering service (~50–200 SEK/report), breaking the €1.00 price point.
    // Only consumer was KYB Complete SE's step 4b (SE-only bonus, output fed
    // risk-narrative-generate via $all_results, no named field reads). Solution degrades
    // gracefully — credit-report-summary remains in group 4.
    // Reactivation trigger: licensed commercial aggregator contract that includes Swedish
    // annual reports, OR Bolagsverket extends free HVD access to PDF content.
    "No compliant free source for Swedish annual-report PDFs (see DEC-20260421-SE-B)",
  ],
  [
    "business-license-check-se",
    // DEC-20260421-SE-C: F-skatt/moms/employer flags have no free machine-readable source in 2026.
    // Skatteverket's F-skatt API is "under investigation" (no public API); Bolagsverket does not
    // expose tax-registration status. Previous runtime scraped allabolag.se, which surfaced
    // Skatteverket data via a KYB-competitor-owned aggregator — banned by DEC-20260420-H.
    // Reactivation trigger: Skatteverket ships a public F-skatt/moms/arbetsgivare lookup API,
    // OR a licensed commercial aggregator contract covers these fields.
    "No compliant source for F-skatt/moms/employer flags (see DEC-20260421-SE-C)",
  ],
  [
    "credit-report-summary",
    // DEC-20260405-B / DEC-20260422-SE-D: Swedish credit ratings, credit limits, and risk indicators
    // are proprietary products of commercial bureaus (UC/Enento, Bisnode/D&B, Allabolag). No free
    // government source exists — Bolagsverket is a registry, not a credit bureau. Previous runtime
    // scraped allabolag.se for rating + financial summary, which is banned by DEC-20260420-H.
    // The HVD API unlocked 2026-04-22 does not cover credit data (registry data only).
    // Reactivation trigger: licensed credit-bureau contract (UC, Bisnode, Creditsafe), or a Strale
    // solution that synthesises a risk score from Bolagsverket HVD + annual-report iXBRL financials
    // once Årsredovisningsinformation API access is in place (not a 1:1 replacement — a different
    // product, and must be named differently to avoid implying bureau-grade credit data).
    "No compliant source for Swedish credit ratings (see DEC-20260405-B / DEC-20260422-SE-D)",
  ],
  [
    "patent-search",
    // DEC-20260427-H-1: Runtime fetched patents.google.com via Browserless + Claude extraction.
    // Google's ToS forbids automated access to its services, and Google Patents is no exception.
    // PatentsView (USPTO) is HTTP 410. Free machine-readable alternatives exist but require
    // migration: EPO OPS (free with registration), USPTO PEDS (free), Lens.org (commercial tiers).
    // Reactivation trigger: migrate to EPO OPS / USPTO PEDS / Lens.org.
    "Google Patents scraping prohibited by Google ToS (see DEC-20260420-H)",
  ],
  [
    "trustpilot-score",
    // DEC-20260427-H-2: Runtime fetched trustpilot.com/review/{domain} via Browserless + Claude.
    // Trustpilot's ToS forbids automated access to public review pages; Trustpilot Business
    // exposes a paid Reviews API for licensed access.
    // Reactivation trigger: Trustpilot Business API contract, OR migrate to a licensed
    // alternative (Reviews.io, Feefo, Yotpo).
    "Trustpilot scraping prohibited by ToS (see DEC-20260420-H)",
  ],
  [
    "salary-benchmark",
    // DEC-20260427-H-3: Runtime fetched glassdoor.com/Salaries/know/* via Browserless + Claude.
    // Glassdoor's ToS forbids automated access. No free licensed alternative covers global
    // salary benchmarks at the €0.05–0.20 price point.
    // Reactivation trigger: Glassdoor Partner Program API, OR migrate to a hybrid of Adzuna
    // (multi-country aggregate salaries), US BLS (US occupations), Eurostat (EU averages).
    "Glassdoor scraping prohibited by ToS (see DEC-20260420-H)",
  ],
  [
    "employer-review-summary",
    // DEC-20260427-H-4: Primary runtime fetched glassdoor.com/Reviews/* via Browserless + Claude;
    // fallback hit google.com/search. Both are ToS-prohibited (Glassdoor automation ban + Google
    // Search ToS forbids scraping). No compliant fallback exists.
    // Reactivation trigger: Glassdoor Partner Program API, OR licensed reviews aggregator
    // (Comparably, Indeed Reviews via partner channel).
    "Glassdoor + Google scraping prohibited by ToS (see DEC-20260420-H)",
  ],
  [
    "linkedin-url-validate",
    // DEC-20260427-H-5: Runtime sent HEAD/GET probes to linkedin.com to verify URL accessibility.
    // LinkedIn's User Agreement forbids any automated access, including status probes — the
    // hiQ Labs v. LinkedIn injunction does not bind Strale, and LinkedIn has continued sending
    // cease-and-desist letters to non-party scrapers.
    // Reactivation trigger: LinkedIn Marketing Developer Program / Sales Navigator API contract.
    "LinkedIn forbids all automated access incl. accessibility probes (see DEC-20260420-H)",
  ],
]);

export function getDeactivatedCapabilities(): ReadonlyMap<string, string> {
  return DEACTIVATED;
}

export async function autoRegisterCapabilities(): Promise<void> {
  const dir = import.meta.dirname;

  // Phase 1: capability executors (top-level .ts/.js files excluding index, this file, and .d.ts declarations)
  const executorFiles = readdirSync(dir)
    .filter((f) => {
      if (!f.endsWith(".ts") && !f.endsWith(".js")) return false;
      if (f === "index.ts" || f === "index.js") return false;
      if (f === "auto-register.ts" || f === "auto-register.js") return false;
      // Exclude TypeScript declaration files (.d.ts in source, .d.js in compiled output)
      const nameWithoutExt = f.replace(/\.(ts|js)$/, "");
      if (nameWithoutExt.endsWith(".d")) return false;
      return true;
    })
    .sort();

  let registered = 0;
  let skipped = 0;
  let errors = 0;

  // Deduplicate: in compiled output both .js and .d.ts exist; locally only .ts
  const seen = new Set<string>();
  for (const file of executorFiles) {
    const slug = file.replace(/\.(ts|js)$/, "");
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (DEACTIVATED.has(slug)) {
      log.info(
        { label: "auto-register-skip-deactivated", capability_slug: slug, reason: DEACTIVATED.get(slug) },
        "auto-register-skip-deactivated",
      );
      skipped++;
      continue;
    }
    try {
      await import(`./${slug}.js`);
      registered++;
    } catch (err) {
      logError("auto-register-import-failed", err, { capability_slug: slug });
      errors++;
    }
  }

  // Phase 2: DataProvider fallback chains (providers/ subdirectory)
  const providersDir = resolve(dir, "providers");
  let providerCount = 0;
  try {
    const providerFiles = readdirSync(providersDir)
      .filter((f) => {
        if (!f.endsWith(".ts") && !f.endsWith(".js")) return false;
        const nameWithoutExt = f.replace(/\.(ts|js)$/, "");
        if (nameWithoutExt.endsWith(".d")) return false;
        return true;
      })
      .sort();

    const seenProviders = new Set<string>();
    for (const file of providerFiles) {
      const name = file.replace(/\.(ts|js)$/, "");
      if (seenProviders.has(name)) continue;
      seenProviders.add(name);
      try {
        await import(`./providers/${name}.js`);
        providerCount++;
      } catch (err) {
        logError("auto-register-provider-import-failed", err, { provider: name });
        errors++;
      }
    }
  } catch {
    // providers/ directory doesn't exist — that's fine
  }

  log.info(
    {
      label: "auto-register-done",
      executors_registered: registered,
      providers_registered: providerCount,
      skipped_deactivated: skipped,
      errors,
    },
    "auto-register-done",
  );
}
