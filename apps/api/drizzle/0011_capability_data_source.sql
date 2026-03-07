-- Add data_source column to capabilities
ALTER TABLE capabilities ADD COLUMN data_source TEXT;

-- Nordic company registries
UPDATE capabilities SET data_source = 'Bolagsverket (Swedish Companies Registration Office)' WHERE slug = 'swedish-company-data';
UPDATE capabilities SET data_source = 'Bolagsverket (Swedish Companies Registration Office)' WHERE slug = 'annual-report-extract';
UPDATE capabilities SET data_source = 'Brønnøysund Register Centre (Norway)' WHERE slug = 'norwegian-company-data';
UPDATE capabilities SET data_source = 'CVR - Central Business Register (Denmark)' WHERE slug = 'danish-company-data';
UPDATE capabilities SET data_source = 'PRH - Patent and Registration Office (Finland)' WHERE slug = 'finnish-company-data';

-- Other country registries
UPDATE capabilities SET data_source = 'SEC EDGAR (United States)' WHERE slug = 'us-company-data';
UPDATE capabilities SET data_source = 'Companies House (United Kingdom)' WHERE slug = 'uk-company-data';
UPDATE capabilities SET data_source = 'KvK - Chamber of Commerce (Netherlands)' WHERE slug = 'dutch-company-data';
UPDATE capabilities SET data_source = 'Handelsregister (Germany)' WHERE slug = 'german-company-data';
UPDATE capabilities SET data_source = 'INSEE / Infogreffe (France)' WHERE slug = 'french-company-data';
UPDATE capabilities SET data_source = 'Crossroads Bank for Enterprises (Belgium)' WHERE slug = 'belgian-company-data';
UPDATE capabilities SET data_source = 'Firmenbuch (Austria)' WHERE slug = 'austrian-company-data';
UPDATE capabilities SET data_source = 'CRO - Companies Registration Office (Ireland)' WHERE slug = 'irish-company-data';
UPDATE capabilities SET data_source = 'KRS / CEIDG (Poland)' WHERE slug = 'polish-company-data';
UPDATE capabilities SET data_source = 'e-Business Register (Estonia)' WHERE slug = 'estonian-company-data';
UPDATE capabilities SET data_source = 'Enterprise Register (Latvia)' WHERE slug = 'latvian-company-data';
UPDATE capabilities SET data_source = 'Centre of Registers (Lithuania)' WHERE slug = 'lithuanian-company-data';
UPDATE capabilities SET data_source = 'Zefix - Central Business Name Index (Switzerland)' WHERE slug = 'swiss-company-data';
UPDATE capabilities SET data_source = 'ACRA - Accounting and Corporate Regulatory Authority (Singapore)' WHERE slug = 'singapore-company-data';
UPDATE capabilities SET data_source = 'Corporations Canada' WHERE slug = 'canadian-company-data';
UPDATE capabilities SET data_source = 'Registro Mercantil (Spain)' WHERE slug = 'spanish-company-data';
UPDATE capabilities SET data_source = 'Registro delle Imprese (Italy)' WHERE slug = 'italian-company-data';
UPDATE capabilities SET data_source = 'Registo Comercial (Portugal)' WHERE slug = 'portuguese-company-data';

-- Validation services
UPDATE capabilities SET data_source = 'EU VIES Database (VAT Information Exchange System)' WHERE slug = 'vat-validate';
UPDATE capabilities SET data_source = 'OFAC, EU & UN Sanctions Lists' WHERE slug = 'sanctions-check';
UPDATE capabilities SET data_source = 'SWIFT / BIC Directory' WHERE slug = 'bank-bic-lookup';
UPDATE capabilities SET data_source = 'EU Customs EORI Database' WHERE slug = 'eori-validate';
UPDATE capabilities SET data_source = 'GLEIF (Global Legal Entity Identifier Foundation)' WHERE slug = 'lei-lookup';

-- External API capabilities
UPDATE capabilities SET data_source = 'TED (Tenders Electronic Daily) v3 API' WHERE slug = 'ted-procurement';
UPDATE capabilities SET data_source = 'OSV (Open Source Vulnerabilities) API' WHERE slug = 'cve-lookup';
UPDATE capabilities SET data_source = 'Open-Meteo API' WHERE slug = 'weather-lookup';
UPDATE capabilities SET data_source = 'ip-api.com' WHERE slug = 'ip-geolocation';
UPDATE capabilities SET data_source = 'CoinGecko API' WHERE slug = 'crypto-price';
UPDATE capabilities SET data_source = 'npm Registry API' WHERE slug = 'npm-package-info';
UPDATE capabilities SET data_source = 'PyPI API' WHERE slug = 'pypi-package-info';
UPDATE capabilities SET data_source = 'Docker Hub API' WHERE slug = 'docker-hub-info';
UPDATE capabilities SET data_source = 'GitHub API' WHERE slug IN ('github-user-profile', 'github-repo-compare');
UPDATE capabilities SET data_source = 'Open Food Facts API' WHERE slug = 'barcode-lookup';
UPDATE capabilities SET data_source = 'Charity Commission (United Kingdom)' WHERE slug = 'charity-lookup-uk';
UPDATE capabilities SET data_source = 'Food Standards Agency (United Kingdom)' WHERE slug = 'food-safety-rating-uk';
UPDATE capabilities SET data_source = 'AviationStack API' WHERE slug = 'flight-status';
UPDATE capabilities SET data_source = 'Serper.dev (Google Search API)' WHERE slug IN ('google-search', 'brand-mention-search');
UPDATE capabilities SET data_source = 'ECB Statistical Data Warehouse' WHERE slug = 'ecb-interest-rates';
UPDATE capabilities SET data_source = 'Yahoo Finance API' WHERE slug = 'ticker-lookup';
UPDATE capabilities SET data_source = 'Frankfurter.app (ECB exchange rates)' WHERE slug IN ('exchange-rate', 'forex-history');
UPDATE capabilities SET data_source = 'Nager.Date API' WHERE slug = 'public-holiday-lookup';
UPDATE capabilities SET data_source = 'Arbetsförmedlingen API' WHERE slug = 'job-board-search';
UPDATE capabilities SET data_source = 'Google PageSpeed Insights API' WHERE slug = 'page-speed-test';
UPDATE capabilities SET data_source = 'Google Autocomplete API' WHERE slug = 'keyword-suggest';
UPDATE capabilities SET data_source = 'CommonCrawl Index API' WHERE slug = 'backlink-check';

-- Web scraping capabilities
UPDATE capabilities SET data_source = 'Live web scraping via headless browser' WHERE slug IN (
  'web-extract', 'url-to-markdown', 'url-to-text', 'structured-scrape',
  'screenshot-url', 'meta-extract', 'link-extract', 'og-image-check'
);

-- Browserless + AI extraction
UPDATE capabilities SET data_source = 'Live web scraping + AI extraction' WHERE slug IN (
  'company-enrich', 'cookie-scan', 'terms-of-service-extract',
  'privacy-policy-analyze', 'trustpilot-score', 'product-search',
  'price-compare', 'product-reviews-extract', 'return-policy-extract',
  'employer-review-summary', 'salary-benchmark', 'landing-page-roast',
  'seo-audit', 'tech-stack-detect', 'pricing-page-extract'
);

-- Credit report
UPDATE capabilities SET data_source = 'Allabolag.se (Sweden)' WHERE slug = 'credit-report-summary';

-- CURIA / enforcement tracker
UPDATE capabilities SET data_source = 'CURIA (Court of Justice of the EU)' WHERE slug = 'eu-court-case-search';
UPDATE capabilities SET data_source = 'GDPR Enforcement Tracker' WHERE slug = 'gdpr-fine-lookup';
UPDATE capabilities SET data_source = 'TARIC (EU Customs Tariff Database)' WHERE slug = 'customs-duty-lookup';

-- Pure algorithmic capabilities intentionally get NULL data_source
-- (iban-validate, vat-format-validate, isbn-validate, email-validate, etc.)
