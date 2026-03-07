import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function backfill() {
  // Nordic company registries
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Bolagsverket (Swedish Companies Registration Office)' WHERE slug = 'swedish-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Bolagsverket (Swedish Companies Registration Office)' WHERE slug = 'annual-report-extract'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Brønnøysund Register Centre (Norway)' WHERE slug = 'norwegian-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'CVR - Central Business Register (Denmark)' WHERE slug = 'danish-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'PRH - Patent and Registration Office (Finland)' WHERE slug = 'finnish-company-data'`);

  // Other country registries
  await sql.unsafe(`UPDATE capabilities SET data_source = 'SEC EDGAR (United States)' WHERE slug = 'us-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Companies House (United Kingdom)' WHERE slug = 'uk-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'KvK - Chamber of Commerce (Netherlands)' WHERE slug = 'dutch-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Handelsregister (Germany)' WHERE slug = 'german-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'INSEE / Infogreffe (France)' WHERE slug = 'french-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Crossroads Bank for Enterprises (Belgium)' WHERE slug = 'belgian-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Firmenbuch (Austria)' WHERE slug = 'austrian-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'CRO - Companies Registration Office (Ireland)' WHERE slug = 'irish-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'KRS / CEIDG (Poland)' WHERE slug = 'polish-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'e-Business Register (Estonia)' WHERE slug = 'estonian-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Enterprise Register (Latvia)' WHERE slug = 'latvian-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Centre of Registers (Lithuania)' WHERE slug = 'lithuanian-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Zefix - Central Business Name Index (Switzerland)' WHERE slug = 'swiss-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'ACRA (Singapore)' WHERE slug = 'singapore-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Corporations Canada' WHERE slug = 'canadian-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Registro Mercantil (Spain)' WHERE slug = 'spanish-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Registro delle Imprese (Italy)' WHERE slug = 'italian-company-data'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Registo Comercial (Portugal)' WHERE slug = 'portuguese-company-data'`);
  console.log("  Registries done");

  // Validation services
  await sql.unsafe(`UPDATE capabilities SET data_source = 'EU VIES Database (VAT Information Exchange System)' WHERE slug = 'vat-validate'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'OFAC, EU & UN Sanctions Lists' WHERE slug = 'sanctions-check'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'SWIFT / BIC Directory' WHERE slug = 'bank-bic-lookup'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'EU Customs EORI Database' WHERE slug = 'eori-validate'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'GLEIF (Global Legal Entity Identifier Foundation)' WHERE slug = 'lei-lookup'`);
  console.log("  Validation services done");

  // External APIs
  await sql.unsafe(`UPDATE capabilities SET data_source = 'TED (Tenders Electronic Daily) v3 API' WHERE slug = 'ted-procurement'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'OSV (Open Source Vulnerabilities) API' WHERE slug = 'cve-lookup'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Open-Meteo API' WHERE slug = 'weather-lookup'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'ip-api.com' WHERE slug = 'ip-geolocation'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'CoinGecko API' WHERE slug = 'crypto-price'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'npm Registry API' WHERE slug = 'npm-package-info'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'PyPI API' WHERE slug = 'pypi-package-info'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Docker Hub API' WHERE slug = 'docker-hub-info'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'GitHub API' WHERE slug IN ('github-user-profile', 'github-repo-compare')`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Open Food Facts API' WHERE slug = 'barcode-lookup'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Charity Commission (United Kingdom)' WHERE slug = 'charity-lookup-uk'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Food Standards Agency (United Kingdom)' WHERE slug = 'food-safety-rating-uk'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'AviationStack API' WHERE slug = 'flight-status'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Serper.dev (Google Search API)' WHERE slug IN ('google-search', 'brand-mention-search')`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'ECB Statistical Data Warehouse' WHERE slug = 'ecb-interest-rates'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Yahoo Finance API' WHERE slug = 'ticker-lookup'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Frankfurter.app (ECB exchange rates)' WHERE slug IN ('exchange-rate', 'forex-history')`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Nager.Date API' WHERE slug = 'public-holiday-lookup'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Google PageSpeed Insights API' WHERE slug = 'page-speed-test'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Google Autocomplete API' WHERE slug = 'keyword-suggest'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'CommonCrawl Index API' WHERE slug = 'backlink-check'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Arbetsförmedlingen API' WHERE slug = 'job-board-search'`);
  console.log("  External APIs done");

  // Web scraping
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Live web scraping via headless browser' WHERE slug IN ('web-extract', 'url-to-markdown', 'url-to-text', 'structured-scrape', 'screenshot-url', 'meta-extract', 'link-extract', 'og-image-check')`);

  // Browserless + AI extraction
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Live web scraping + AI extraction' WHERE slug IN ('company-enrich', 'cookie-scan', 'terms-of-service-extract', 'privacy-policy-analyze', 'trustpilot-score', 'product-search', 'price-compare', 'product-reviews-extract', 'return-policy-extract', 'employer-review-summary', 'salary-benchmark', 'landing-page-roast', 'seo-audit', 'tech-stack-detect', 'pricing-page-extract')`);

  // Specific sources
  await sql.unsafe(`UPDATE capabilities SET data_source = 'Allabolag.se (Sweden)' WHERE slug = 'credit-report-summary'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'CURIA (Court of Justice of the EU)' WHERE slug = 'eu-court-case-search'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'GDPR Enforcement Tracker' WHERE slug = 'gdpr-fine-lookup'`);
  await sql.unsafe(`UPDATE capabilities SET data_source = 'TARIC (EU Customs Tariff Database)' WHERE slug = 'customs-duty-lookup'`);
  console.log("  Specific sources done");

  // Count
  const result = await sql`SELECT COUNT(*) as total, COUNT(data_source) as with_source FROM capabilities`;
  console.log(`\nTotal capabilities: ${result[0].total} | With data_source: ${result[0].with_source}`);

  await sql.end();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
