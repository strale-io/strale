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
  [
    "ecb-interest-rates",
    // ECB SDW API is geo-restricted: Railway US East egress IPs receive
    // empty responses while EU-based servers get real data. The cap was
    // running but its correctness suite always failed, and a regression in
    // the test-runner (around 2026-04-20) stopped advancing
    // capabilities.last_tested_at when an infra_limited correctness test
    // failed. ECB stayed at the front of the scheduler queue with
    // last_tested_at frozen at 2026-03-23, consuming ~89% of test_results
    // bandwidth (12,132 of 13,650 inserts in the 7 days before deactivation)
    // and starving 155 other caps to unverified status.
    // Reactivation trigger: Railway EU-based runtime, OR migration to a
    // sanctioned ECB data feed that allows non-EU egress.
    "ECB SDW geo-restricted from Railway US East; was starving scheduler queue (see 2026-04-27 staleness investigation)",
  ],
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
    "dutch-company-data",
    // DEC-20260427-I-1: Runtime fetched northdata.com (Bavarian commercial KYB aggregator)
    // and extracted JSON-LD profile data for Dutch (KVK) company lookups. Manifest claimed
    // KVK / Kamer van Koophandel as the data source — full divergence. northdata.com's
    // ToS forbids automated access; using it undermines Strale's compliance positioning.
    // Reactivation trigger: licensed contract with KVK directly (their Handelsregister API
    // requires Dutch business registration), or with a licensed multi-country aggregator
    // (Creditsafe, Bisnode/Dun & Bradstreet, Experian).
    "northdata.com scraping prohibited by ToS; pending licensed KVK or aggregator contract (see DEC-20260427-I)",
  ],
  [
    "portuguese-company-data",
    // DEC-20260427-I-2: Same as dutch-company-data — runtime fetched northdata.com,
    // manifest claimed Registo Comercial. Full divergence.
    // Reactivation trigger: licensed contract with the Portuguese Registo Comercial
    // (via IRN/Justiça Portuguesa) or a multi-country licensed aggregator.
    "northdata.com scraping prohibited by ToS; pending licensed PT registry or aggregator contract (see DEC-20260427-I)",
  ],
  [
    "lithuanian-company-data",
    // DEC-20260427-I-3: Same pattern — runtime fetched northdata.com, manifest claimed
    // Registrų centras (Lithuanian Centre of Registers). Full divergence.
    // Reactivation trigger: licensed contract with Registrų centras or a multi-country
    // licensed aggregator.
    "northdata.com scraping prohibited by ToS; pending licensed LT registry or aggregator contract (see DEC-20260427-I)",
  ],
  [
    "spanish-company-data",
    // DEC-20260427-I-4: Runtime fetched empresia.es and infocif.es (commercial Spanish
    // KYB aggregators), manifest claimed Registro Mercantil Central. Full divergence.
    // Reactivation trigger: licensed contract with the Spanish Registro Mercantil
    // (via Colegio de Registradores) or a multi-country licensed aggregator.
    "empresia.es / infocif.es scraping prohibited by ToS; pending licensed ES registry or aggregator contract (see DEC-20260427-I)",
  ],
  [
    "german-company-data",
    // DEC-20260427-I-5: Runtime fetched northdata.com. Manifest acknowledged "via
    // northdata.com" (transport-divergence — at least honest), but the underlying
    // ToS-prohibited scrape remains.
    // Reactivation trigger: licensed contract with Handelsregister Bundesanzeiger
    // (via Bundesanzeiger Verlag) or a multi-country licensed aggregator.
    "northdata.com scraping prohibited by ToS; pending licensed Handelsregister or aggregator contract (see DEC-20260427-I)",
  ],
  [
    "austrian-company-data",
    // DEC-20260427-I-6: Primary runtime fetched firmenbuch.finapu.com (commercial
    // third-party AT register wrapper); fallback scraped firmen.wko.at via Browserless
    // + Claude. Both paths are ToS-prohibited scrapes of commercial / semi-official
    // sources. Manifest claimed FinAPU Firmenbuch API (transport-divergence).
    // Reactivation trigger: licensed contract with the Austrian Justizministerium for
    // direct Firmenbuch API access, or a multi-country licensed aggregator.
    "finapu.com / wko.at scraping prohibited by ToS; pending licensed Firmenbuch or aggregator contract (see DEC-20260427-I)",
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
  // ─── Government public-UI scrapers, deactivated 2026-04-28 ────────────────
  // The 2026-04-21 platform-wide audit (Journal 34967c87082c8194bd85c5d618cd3585)
  // categorised these as "transport divergence": manifest names a government
  // authority as data_source, but runtime calls Strale's own scraper against
  // the government's public web UI rather than an API. DEC-20260427-I deactivated
  // the worse "full divergence" cases (third-party aggregators); transport-
  // divergence was left for migration. Today we tightened the posture and pulled
  // these too — Strale's Tier 1 doctrine (DEC-20260428-A) is "Strale itself never
  // operates scrapers" without exceptions, and a self-operated scraper against a
  // government UI is still a self-operated scraper. No third-party ToS violation
  // identified, but the doctrine is absolute.
  //
  // Reactivation per cap: licensed registry/source contract with the named
  // authority. The IE/IT-style transport-divergence pattern in irish-company-data
  // and latvian-company-data is the same shape and should be revisited as a
  // workstream, not a pre-emptive deactivation.
  [
    "italian-company-data",
    // Runtime scrapes registroimprese.it/ricerca-libera (Italian Registro Imprese
    // public UI) via Browserless + Claude. Manifest claimed InfoCamere /
    // Registro Imprese as data source — transport-divergence per the audit.
    // Reactivation: InfoCamere accessoallebanchedati per-certificate API
    // (paid, not PAYG-friendly for bulk) or licensed multi-country aggregator.
    "registroimprese.it scraping violates Strale Tier 1 (DEC-20260428-A); pending licensed InfoCamere or aggregator contract",
  ],
  [
    "eu-court-case-search",
    // Runtime scrapes curia.europa.eu/juris (CJEU) and hudoc.echr.coe.int (ECHR).
    // Both are EU public court records and access is generally permitted, so
    // there is no clear third-party ToS violation. But Strale's Tier 1 doctrine
    // (DEC-20260428-A) prohibits Strale-operated scrapers categorically.
    // Reactivation: licensed CJEU / ECHR data feed, or migrate to bulk dataset
    // download where the source publishes one.
    "CURIA / HUDOC scraping violates Strale Tier 1 (DEC-20260428-A); pending licensed feed or bulk-dataset migration",
  ],
  // irish-company-data REACTIVATED 2026-04-29: migrated from Browserless +
  // Claude scrape of core.cro.ie to direct CRO Open Data Portal CKAN API
  // (opendata.cro.ie/api/3/action/datastore_search). Free, real-time JSON,
  // no signup, CC-BY 4.0 (commercial redistribution permitted with
  // attribution). acquisition_method: direct_api per DEC-20260428-A Tier 2.
  //
  // latvian-company-data REACTIVATED 2026-04-29: migrated from Browserless +
  // Claude scrape of info.ur.gov.lv to direct Latvian Open Data Portal CKAN
  // API (data.gov.lv/dati/api/3/action/datastore_search) against the
  // Uzņēmumu reģistra atvērtie dati resource. Free, real-time JSON, no
  // signup, CC0 1.0 (public domain — unrestricted commercial use).
  // acquisition_method: direct_api per DEC-20260428-A Tier 2.
  // ─── UK property vertical, parked 2026-04-28 ─────────────────────────────
  // Built on 2026-04-11 in a fast push to claim ground after a Reddit
  // competitor post (Journal 33f67c87...d9049b). Audit on 2026-04-21
  // (Journal 34967c87...c5d618cd3585) flagged them as the "10 pre-manifest
  // UK-property capabilities with no data_source at all". A to-do was
  // raised the same week — "Decide UK-property suspended capabilities:
  // permanent park or temporary?" (page 34967c87...df56a10c2bb3) — but
  // the page was never written and the question was never answered.
  // They've sat in lifecycle_state=suspended since the 7d auto-suspend
  // hit. Today (2026-04-28), confirmed parked: out of scope for the
  // Payee Assurance v1 wedge, and revival requires real onboarding (all
  // 9 currently have last_tested_at=NULL and matrix_sqs=NULL — they were
  // never validated end-to-end). Reactivation when the property vertical
  // is the active focus, not before.
  ["uk-epc-rating",        "UK property vertical parked — never validated, out of v1 wedge scope (see Journal 2026-04-28-partial-failure-cap-triage)"],
  ["uk-flood-risk",        "UK property vertical parked — never validated, out of v1 wedge scope"],
  ["uk-sold-prices",       "UK property vertical parked — never validated, out of v1 wedge scope"],
  ["uk-rental-yield",      "UK property vertical parked — never validated, out of v1 wedge scope"],
  ["uk-crime-stats",       "UK property vertical parked — never validated, out of v1 wedge scope"],
  ["uk-deprivation-index", "UK property vertical parked — never validated, out of v1 wedge scope"],
  ["uk-transport-access",  "UK property vertical parked — never validated, out of v1 wedge scope"],
  ["council-tax-lookup",   "UK property vertical parked — never validated, out of v1 wedge scope"],
  ["stamp-duty-calculate", "UK property vertical parked — never validated, out of v1 wedge scope"],
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

  // Phase 3: sync DEACTIVATED list to DB catalog state. Deactivation here
  // means "no executor" — but if the cap's row stayed is_active=true /
  // visible=true / x402_enabled=true, it would still appear in the public
  // catalog as a paid capability that returns "no executor registered" on
  // call. That's a worse failure mode than just hiding it. This pass keeps
  // the runtime DEACTIVATED map and the DB catalog in lockstep on every
  // boot, so adding a cap to the map auto-hides it from /v1/capabilities,
  // /x402/catalog, and the website without manual SQL.
  if (DEACTIVATED.size > 0) {
    try {
      const { getDb } = await import("../db/index.js");
      const { sql } = await import("drizzle-orm");
      const slugs = [...DEACTIVATED.keys()];
      const result = await getDb().execute(sql`
        UPDATE capabilities
        SET is_active = false,
            visible = false,
            x402_enabled = false,
            updated_at = NOW()
        WHERE slug = ANY(${slugs})
          AND (is_active = true OR visible = true OR x402_enabled = true)
        RETURNING slug
      `);
      const rows = Array.isArray(result) ? result : (result as { rows?: { slug: string }[] }).rows ?? [];
      if (rows.length > 0) {
        log.info(
          { label: "auto-register-deactivated-synced", synced_count: rows.length, slugs: rows.map((r) => r.slug) },
          "auto-register-deactivated-synced",
        );
      }
    } catch (err) {
      // Non-fatal — caps just remain visible until next boot. Better than
      // crashing startup over a catalog drift fix.
      logError("auto-register-deactivated-sync-failed", err, { count: DEACTIVATED.size });
    }
  }
}
