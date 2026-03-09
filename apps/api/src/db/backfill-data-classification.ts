import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { capabilities } from "./schema.js";
import { eq } from "drizzle-orm";

// Data classification taxonomy:
// public_company_data — government business registries
// public_tax_data — tax authority databases (VIES, etc.)
// public_regulatory_data — sanctions lists, regulatory databases, enforcement records
// public_financial_data — banking standards, exchange rates, credit data
// public_infrastructure_data — DNS, SSL, HTTP headers, WHOIS
// public_domain_data — domain registration data
// public_security_data — threat intelligence, reputation scores
// public_web_content — publicly accessible web pages and their content
// public_government_data — government databases (courts, procurement, IP offices)
// user_provided_document — documents uploaded/provided by the user
// user_provided_data — data provided by the user for processing
// processed_content — derived from other data (e.g., PII redaction output)

const DATA_MAP: Record<string, { dataSource: string; dataClassification: string }> = {
  // ── Company data ──────────────────────────────────────────────────────────
  "swedish-company-data": {
    dataSource: "Bolagsverket (Swedish Companies Registration Office)",
    dataClassification: "public_company_data",
  },
  "norwegian-company-data": {
    dataSource: "Brønnøysund Register Centre (Norway)",
    dataClassification: "public_company_data",
  },
  "danish-company-data": {
    dataSource: "CVR / Danish Business Authority (Erhvervsstyrelsen)",
    dataClassification: "public_company_data",
  },
  "finnish-company-data": {
    dataSource: "PRH / Finnish Patent and Registration Office",
    dataClassification: "public_company_data",
  },
  "us-company-data": {
    dataSource: "SEC EDGAR (US Securities and Exchange Commission)",
    dataClassification: "public_company_data",
  },
  "uk-company-data": {
    dataSource: "Companies House (UK Government)",
    dataClassification: "public_company_data",
  },
  "dutch-company-data": {
    dataSource: "KVK / Kamer van Koophandel (Netherlands Chamber of Commerce)",
    dataClassification: "public_company_data",
  },
  "german-company-data": {
    dataSource: "Handelsregister (German Commercial Register)",
    dataClassification: "public_company_data",
  },
  "french-company-data": {
    dataSource: "INSEE / Registre du Commerce (France)",
    dataClassification: "public_company_data",
  },
  "belgian-company-data": {
    dataSource: "Kruispuntbank van Ondernemingen (Belgian Crossroads Bank for Enterprises)",
    dataClassification: "public_company_data",
  },
  "austrian-company-data": {
    dataSource: "Firmenbuch (Austrian Commercial Register)",
    dataClassification: "public_company_data",
  },
  "irish-company-data": {
    dataSource: "CRO / Companies Registration Office (Ireland)",
    dataClassification: "public_company_data",
  },
  "polish-company-data": {
    dataSource: "KRS / Krajowy Rejestr Sądowy (Polish National Court Register)",
    dataClassification: "public_company_data",
  },
  "estonian-company-data": {
    dataSource: "Äriregister / Estonian Business Register",
    dataClassification: "public_company_data",
  },
  "latvian-company-data": {
    dataSource: "Uzņēmumu reģistrs (Latvian Register of Enterprises)",
    dataClassification: "public_company_data",
  },
  "lithuanian-company-data": {
    dataSource: "Registrų centras (Lithuanian Centre of Registers)",
    dataClassification: "public_company_data",
  },
  "swiss-company-data": {
    dataSource: "Zefix / Swiss Commercial Register",
    dataClassification: "public_company_data",
  },
  "spanish-company-data": {
    dataSource: "Registro Mercantil Central (Spanish Commercial Register)",
    dataClassification: "public_company_data",
  },
  "italian-company-data": {
    dataSource: "Registro Imprese / Italian Business Register (InfoCamere)",
    dataClassification: "public_company_data",
  },
  "portuguese-company-data": {
    dataSource: "Registo Comercial (Portuguese Commercial Register)",
    dataClassification: "public_company_data",
  },
  "canadian-company-data": {
    dataSource: "Corporations Canada / Provincial registries",
    dataClassification: "public_company_data",
  },
  "australian-company-data": {
    dataSource: "ASIC / Australian Securities and Investments Commission",
    dataClassification: "public_company_data",
  },
  "indian-company-data": {
    dataSource: "MCA / Ministry of Corporate Affairs (India)",
    dataClassification: "public_company_data",
  },
  "singapore-company-data": {
    dataSource: "ACRA / Accounting and Corporate Regulatory Authority (Singapore)",
    dataClassification: "public_company_data",
  },
  "hong-kong-company-data": {
    dataSource: "Companies Registry (Hong Kong SAR)",
    dataClassification: "public_company_data",
  },
  "brazilian-company-data": {
    dataSource: "Receita Federal / CNPJ Registry (Brazil)",
    dataClassification: "public_company_data",
  },
  "japanese-company-data": {
    dataSource: "National Tax Agency Corporate Number System (Japan)",
    dataClassification: "public_company_data",
  },
  "company-enrich": {
    dataSource: "HTTP fetch + Claude API (company website analysis)",
    dataClassification: "public_web_content",
  },
  "company-tech-stack": {
    dataSource: "HTTP fetch + Claude API (technology stack analysis)",
    dataClassification: "public_web_content",
  },
  "credit-report-summary": {
    dataSource: "Allabolag.se (Swedish credit data aggregator)",
    dataClassification: "public_company_data",
  },

  // ── Validation & verification ─────────────────────────────────────────────
  "vat-validate": {
    dataSource: "VIES (EU VAT Information Exchange System, European Commission)",
    dataClassification: "public_tax_data",
  },
  "vat-format-validate": {
    dataSource: "Algorithmic validation (EU VAT number format rules per country)",
    dataClassification: "public_tax_data",
  },
  "sanctions-check": {
    dataSource: "OFAC SDN List (US Treasury), EU Consolidated Sanctions List, UN Security Council Sanctions",
    dataClassification: "public_regulatory_data",
  },
  "iban-validate": {
    dataSource: "Algorithmic validation (ISO 13616 IBAN standard + bank registry)",
    dataClassification: "public_financial_data",
  },
  "swift-validate": {
    dataSource: "Algorithmic validation (ISO 9362 SWIFT/BIC format rules)",
    dataClassification: "public_financial_data",
  },
  "email-validate": {
    dataSource: "Algorithmic (syntax) + DNS protocol (MX record verification)",
    dataClassification: "public_infrastructure_data",
  },
  "isbn-validate": {
    dataSource: "Algorithmic validation (ISBN-10/ISBN-13 check digit calculation)",
    dataClassification: "user_provided_data",
  },
  "company-id-detect": {
    dataSource: "Algorithmic (pattern matching for org number formats across 20+ countries)",
    dataClassification: "user_provided_data",
  },
  "eori-validate": {
    dataSource: "EU EORI Validation System (European Commission DG TAXUD)",
    dataClassification: "public_tax_data",
  },
  "lei-lookup": {
    dataSource: "GLEIF (Global Legal Entity Identifier Foundation)",
    dataClassification: "public_financial_data",
  },

  // ── Domain & infrastructure ───────────────────────────────────────────────
  "dns-lookup": {
    dataSource: "DNS protocol (authoritative nameservers via system resolver)",
    dataClassification: "public_infrastructure_data",
  },
  "ssl-check": {
    dataSource: "TLS handshake (X.509 certificate from target server)",
    dataClassification: "public_infrastructure_data",
  },
  "ssl-certificate-chain": {
    dataSource: "TLS handshake (full X.509 certificate chain from target server)",
    dataClassification: "public_infrastructure_data",
  },
  "whois-lookup": {
    dataSource: "WHOIS protocol (ICANN-accredited registrar databases)",
    dataClassification: "public_domain_data",
  },
  "domain-reputation": {
    dataSource: "Aggregated threat intelligence feeds (multi-source scoring)",
    dataClassification: "public_security_data",
  },
  "header-security-check": {
    dataSource: "HTTP response headers from target server (CSP, HSTS, X-Frame-Options)",
    dataClassification: "public_infrastructure_data",
  },
  "tech-stack-detect": {
    dataSource: "HTTP response analysis (headers, JavaScript libraries, meta tags)",
    dataClassification: "public_infrastructure_data",
  },
  "mx-lookup": {
    dataSource: "DNS protocol (MX record query via system resolver)",
    dataClassification: "public_infrastructure_data",
  },
  "port-check": {
    dataSource: "TCP connection probe (Node.js net.Socket)",
    dataClassification: "public_infrastructure_data",
  },
  "redirect-trace": {
    dataSource: "HTTP fetch (manual redirect following, full chain capture)",
    dataClassification: "public_infrastructure_data",
  },
  "url-health-check": {
    dataSource: "HTTP fetch (status code, response time, header analysis)",
    dataClassification: "public_infrastructure_data",
  },
  "uptime-check": {
    dataSource: "HTTP fetch (availability and response time measurement)",
    dataClassification: "public_infrastructure_data",
  },
  "api-health-check": {
    dataSource: "HTTP fetch (API endpoint status, response time, schema validation)",
    dataClassification: "public_infrastructure_data",
  },

  // ── Web content & analysis ────────────────────────────────────────────────
  "url-to-markdown": {
    dataSource: "HTTP fetch + HTML-to-markdown conversion",
    dataClassification: "public_web_content",
  },
  "url-to-text": {
    dataSource: "HTTP fetch + HTML-to-plaintext conversion",
    dataClassification: "public_web_content",
  },
  "web-extract": {
    dataSource: "Headless browser rendering via Browserless.io (JavaScript-rendered content)",
    dataClassification: "public_web_content",
  },
  "structured-scrape": {
    dataSource: "Headless browser + Claude API (structured data extraction)",
    dataClassification: "public_web_content",
  },
  "screenshot-url": {
    dataSource: "Headless browser rendering via Browserless.io (page screenshot)",
    dataClassification: "public_web_content",
  },
  "link-extract": {
    dataSource: "HTTP fetch + HTML parsing (hyperlink extraction)",
    dataClassification: "public_web_content",
  },
  "meta-extract": {
    dataSource: "HTTP fetch + HTML parsing (meta tag extraction)",
    dataClassification: "public_web_content",
  },
  "robots-txt-parse": {
    dataSource: "HTTP fetch (robots.txt file from target domain)",
    dataClassification: "public_web_content",
  },
  "sitemap-parse": {
    dataSource: "HTTP fetch (sitemap.xml from target domain)",
    dataClassification: "public_web_content",
  },
  "seo-audit": {
    dataSource: "HTTP response analysis (meta tags, heading structure, performance metrics)",
    dataClassification: "public_infrastructure_data",
  },
  "page-speed-test": {
    dataSource: "Google PageSpeed Insights API (Lighthouse performance analysis)",
    dataClassification: "public_infrastructure_data",
  },
  "landing-page-roast": {
    dataSource: "HTTP fetch + Claude API (conversion analysis)",
    dataClassification: "public_web_content",
  },
  "social-profile-check": {
    dataSource: "HTTP fetch (public social media profile pages)",
    dataClassification: "public_web_content",
  },
  "backlink-check": {
    dataSource: "CommonCrawl index (public backlink database)",
    dataClassification: "public_web_content",
  },
  "og-image-check": {
    dataSource: "HTTP fetch (Open Graph meta tag extraction)",
    dataClassification: "public_web_content",
  },
  "website-carbon-estimate": {
    dataSource: "HTTP fetch + algorithmic estimation (page weight analysis)",
    dataClassification: "public_web_content",
  },
  "google-search": {
    dataSource: "Serper.dev API (Google Search results)",
    dataClassification: "public_web_content",
  },
  "brand-mention-search": {
    dataSource: "Serper.dev API (Google Search results, brand monitoring)",
    dataClassification: "public_web_content",
  },
  "accessibility-audit": {
    dataSource: "HTTP fetch + WCAG rule engine (automated accessibility testing)",
    dataClassification: "public_web_content",
  },
  "email-deliverability-check": {
    dataSource: "DNS protocol (SPF, DKIM, DMARC record verification) + blacklist check",
    dataClassification: "public_infrastructure_data",
  },

  // ── Data processing ───────────────────────────────────────────────────────
  "pii-redact": {
    dataSource: "Algorithmic (regex pattern matching + NLP entity recognition)",
    dataClassification: "processed_content",
  },
  "json-repair": {
    dataSource: "Algorithmic (syntax correction, no external data)",
    dataClassification: "user_provided_data",
  },
  "json-schema-validate": {
    dataSource: "Algorithmic (JSON Schema Draft-07 validation, no external data)",
    dataClassification: "user_provided_data",
  },
  "summarize": {
    dataSource: "Claude API (text summarization)",
    dataClassification: "user_provided_data",
  },
  "translate": {
    dataSource: "Claude API (translation)",
    dataClassification: "user_provided_data",
  },
  "sentiment-analyze": {
    dataSource: "Claude API (sentiment analysis)",
    dataClassification: "user_provided_data",
  },
  "classify-text": {
    dataSource: "Claude API (text classification)",
    dataClassification: "user_provided_data",
  },
  "json-to-csv": {
    dataSource: "Algorithmic (format conversion, no external data)",
    dataClassification: "user_provided_data",
  },
  "csv-to-json": {
    dataSource: "Algorithmic (format conversion, no external data)",
    dataClassification: "user_provided_data",
  },
  "xml-to-json": {
    dataSource: "Algorithmic (format conversion, no external data)",
    dataClassification: "user_provided_data",
  },
  "flatten-json": {
    dataSource: "Algorithmic (JSON flattening, no external data)",
    dataClassification: "user_provided_data",
  },
  "schema-infer": {
    dataSource: "Algorithmic (schema inference from sample data, no external data)",
    dataClassification: "user_provided_data",
  },
  "data-quality-check": {
    dataSource: "Algorithmic (data profiling and quality analysis, no external data)",
    dataClassification: "user_provided_data",
  },
  "csv-clean": {
    dataSource: "Algorithmic (CSV normalization, no external data)",
    dataClassification: "user_provided_data",
  },
  "deduplicate": {
    dataSource: "Algorithmic (deduplication, no external data)",
    dataClassification: "user_provided_data",
  },
  "currency-convert": {
    dataSource: "European Central Bank daily reference rates",
    dataClassification: "public_financial_data",
  },
  "address-parse": {
    dataSource: "Algorithmic (address component extraction, no external data)",
    dataClassification: "user_provided_data",
  },
  "name-parse": {
    dataSource: "Algorithmic (name component extraction, no external data)",
    dataClassification: "user_provided_data",
  },
  "phone-normalize": {
    dataSource: "Algorithmic (E.164 phone number normalization, no external data)",
    dataClassification: "user_provided_data",
  },
  "date-parse": {
    dataSource: "Algorithmic (date/time format normalization, no external data)",
    dataClassification: "user_provided_data",
  },
  "unit-convert": {
    dataSource: "Algorithmic (measurement unit conversion, no external data)",
    dataClassification: "user_provided_data",
  },
  "markdown-to-html": {
    dataSource: "Algorithmic (Markdown rendering, no external data)",
    dataClassification: "user_provided_data",
  },
  "html-to-pdf": {
    dataSource: "Headless browser rendering via Browserless.io (HTML to PDF conversion)",
    dataClassification: "user_provided_data",
  },
  "base64-encode-url": {
    dataSource: "HTTP fetch + Base64 encoding (no external API)",
    dataClassification: "public_web_content",
  },
  "image-resize": {
    dataSource: "Algorithmic (image processing, no external data)",
    dataClassification: "user_provided_data",
  },
  "image-to-text": {
    dataSource: "Claude API (OCR / image analysis)",
    dataClassification: "user_provided_data",
  },
  "diff-json": {
    dataSource: "Algorithmic (JSON diff comparison, no external data)",
    dataClassification: "user_provided_data",
  },

  // ── Document analysis ─────────────────────────────────────────────────────
  "invoice-extract": {
    dataSource: "Claude API (document analysis and data extraction)",
    dataClassification: "user_provided_document",
  },
  "contract-extract": {
    dataSource: "Claude API (document analysis and clause extraction)",
    dataClassification: "user_provided_document",
  },
  "annual-report-extract": {
    dataSource: "Claude API (financial document analysis)",
    dataClassification: "user_provided_document",
  },
  "pdf-extract": {
    dataSource: "Claude API (PDF document analysis and data extraction)",
    dataClassification: "user_provided_document",
  },
  "privacy-policy-analyze": {
    dataSource: "HTTP fetch + Claude API (privacy policy analysis)",
    dataClassification: "public_web_content",
  },
  "terms-of-service-extract": {
    dataSource: "HTTP fetch + Claude API (ToS clause extraction)",
    dataClassification: "public_web_content",
  },
  "resume-parse": {
    dataSource: "Claude API (resume/CV data extraction)",
    dataClassification: "user_provided_document",
  },
  "receipt-categorize": {
    dataSource: "Claude API (receipt categorization and data extraction)",
    dataClassification: "user_provided_document",
  },
  "meeting-notes-extract": {
    dataSource: "Claude API (meeting notes extraction and action items)",
    dataClassification: "user_provided_document",
  },

  // ── Financial ─────────────────────────────────────────────────────────────
  "exchange-rate": {
    dataSource: "European Central Bank daily reference rates",
    dataClassification: "public_financial_data",
  },
  "stock-quote": {
    dataSource: "Yahoo Finance API (real-time market data)",
    dataClassification: "public_financial_data",
  },
  "bank-bic-lookup": {
    dataSource: "SWIFT/BIC directory (bank identification)",
    dataClassification: "public_financial_data",
  },
  "ecb-interest-rates": {
    dataSource: "ECB Statistical Data Warehouse (European Central Bank)",
    dataClassification: "public_financial_data",
  },
  "country-tax-rates": {
    dataSource: "Static database (corporate tax rates by country, updated quarterly)",
    dataClassification: "public_financial_data",
  },
  "invoice-validate": {
    dataSource: "Algorithmic (invoice field validation, cross-check calculations)",
    dataClassification: "user_provided_data",
  },
  "payment-reference-generate": {
    dataSource: "Algorithmic (OCR/reference number generation per country standard)",
    dataClassification: "user_provided_data",
  },
  "swift-message-parse": {
    dataSource: "Algorithmic (SWIFT MT message parsing, ISO 15022)",
    dataClassification: "user_provided_data",
  },
  "financial-year-dates": {
    dataSource: "Algorithmic (fiscal year calculation by jurisdiction)",
    dataClassification: "user_provided_data",
  },
  "sepa-xml-validate": {
    dataSource: "Algorithmic (SEPA XML schema validation, ISO 20022)",
    dataClassification: "user_provided_data",
  },
  "ticker-lookup": {
    dataSource: "Yahoo Finance autocomplete API (ticker symbol search)",
    dataClassification: "public_financial_data",
  },
  "forex-history": {
    dataSource: "Frankfurter.app API (ECB historical exchange rates)",
    dataClassification: "public_financial_data",
  },
  "crypto-price": {
    dataSource: "CoinGecko API (cryptocurrency market data)",
    dataClassification: "public_financial_data",
  },

  // ── Compliance & regulatory ───────────────────────────────────────────────
  "eu-ai-act-classify": {
    dataSource: "Algorithmic (rule-based classification against EU AI Act Annex III, Articles 5/6/50)",
    dataClassification: "public_regulatory_data",
  },
  "data-protection-authority-lookup": {
    dataSource: "Static database (EU/EEA Data Protection Authority registry)",
    dataClassification: "public_regulatory_data",
  },
  "gdpr-fine-lookup": {
    dataSource: "GDPR Enforcement Tracker (public enforcement database)",
    dataClassification: "public_regulatory_data",
  },
  "gdpr-website-check": {
    dataSource: "HTTP fetch + automated compliance pattern scanning",
    dataClassification: "public_web_content",
  },
  "cookie-scan": {
    dataSource: "Headless browser (cookie detection, script analysis, consent banner check)",
    dataClassification: "public_web_content",
  },
  "eu-regulation-search": {
    dataSource: "EUR-Lex (Official Journal of the European Union)",
    dataClassification: "public_regulatory_data",
  },
  "eu-court-case-search": {
    dataSource: "CURIA (Court of Justice of the European Union)",
    dataClassification: "public_government_data",
  },
  "business-license-check-se": {
    dataSource: "Headless browser + Swedish authority registries",
    dataClassification: "public_regulatory_data",
  },
  "ted-procurement": {
    dataSource: "TED (Tenders Electronic Daily, European Commission)",
    dataClassification: "public_government_data",
  },

  // ── Logistics & supply chain ──────────────────────────────────────────────
  "hs-code-lookup": {
    dataSource: "Harmonized System nomenclature database (WCO)",
    dataClassification: "public_regulatory_data",
  },
  "customs-duty-lookup": {
    dataSource: "TARIC (EU Customs Tariff Database, European Commission)",
    dataClassification: "public_regulatory_data",
  },
  "incoterms-explain": {
    dataSource: "Algorithmic (ICC Incoterms 2020 rule database)",
    dataClassification: "public_regulatory_data",
  },
  "container-track": {
    dataSource: "Headless browser (shipping line tracking portals)",
    dataClassification: "public_web_content",
  },
  "port-lookup": {
    dataSource: "Static database (UN/LOCODE port registry)",
    dataClassification: "public_infrastructure_data",
  },
  "country-trade-data": {
    dataSource: "Static database (bilateral trade statistics, updated annually)",
    dataClassification: "public_financial_data",
  },
  "iso-country-lookup": {
    dataSource: "Algorithmic (ISO 3166-1 country code database)",
    dataClassification: "user_provided_data",
  },
  "dangerous-goods-classify": {
    dataSource: "Algorithmic (UN dangerous goods classification, ADR/IMDG/IATA rules)",
    dataClassification: "public_regulatory_data",
  },
  "shipping-track": {
    dataSource: "HTTP fetch (carrier tracking APIs and portals)",
    dataClassification: "public_web_content",
  },
  "shipping-cost-estimate": {
    dataSource: "Algorithmic (dimensional weight + zone-based rate estimation)",
    dataClassification: "user_provided_data",
  },

  // ── Recruiting & HR ───────────────────────────────────────────────────────
  "salary-benchmark": {
    dataSource: "Headless browser (salary comparison aggregators)",
    dataClassification: "public_web_content",
  },
  "job-board-search": {
    dataSource: "Arbetsförmedlingen API (Swedish Employment Agency) + Adzuna API",
    dataClassification: "public_government_data",
  },
  "skill-extract": {
    dataSource: "Algorithmic (skill taxonomy matching from text, no external data)",
    dataClassification: "user_provided_data",
  },
  "skill-gap-analyze": {
    dataSource: "Algorithmic (skill comparison analysis, no external data)",
    dataClassification: "user_provided_data",
  },
  "linkedin-url-validate": {
    dataSource: "Algorithmic (LinkedIn URL format validation, no external data)",
    dataClassification: "user_provided_data",
  },
  "work-permit-requirements": {
    dataSource: "Static database (work permit rules by country pair)",
    dataClassification: "public_regulatory_data",
  },
  "employer-review-summary": {
    dataSource: "Headless browser + Claude API (employer review site analysis)",
    dataClassification: "public_web_content",
  },
  "public-holiday-lookup": {
    dataSource: "Nager.Date API (public holiday database)",
    dataClassification: "public_government_data",
  },
  "employment-cost-estimate": {
    dataSource: "Algorithmic (employment cost calculation by country, tax rules)",
    dataClassification: "user_provided_data",
  },
  "job-posting-analyze": {
    dataSource: "Claude API (job posting analysis and extraction)",
    dataClassification: "user_provided_data",
  },

  // ── E-commerce & retail ───────────────────────────────────────────────────
  "product-search": {
    dataSource: "Headless browser (e-commerce product search)",
    dataClassification: "public_web_content",
  },
  "price-compare": {
    dataSource: "Headless browser (multi-retailer price comparison)",
    dataClassification: "public_web_content",
  },
  "product-reviews-extract": {
    dataSource: "Headless browser + Claude API (product review extraction)",
    dataClassification: "public_web_content",
  },
  "trustpilot-score": {
    dataSource: "Headless browser (Trustpilot public company pages)",
    dataClassification: "public_web_content",
  },
  "vat-rate-lookup": {
    dataSource: "Static database (VAT/GST rates by country, updated quarterly)",
    dataClassification: "public_tax_data",
  },
  "marketplace-fee-calculate": {
    dataSource: "Algorithmic (marketplace fee structures: Amazon, eBay, Etsy, Shopify)",
    dataClassification: "user_provided_data",
  },
  "return-policy-extract": {
    dataSource: "Headless browser + Claude API (return policy extraction from retailer sites)",
    dataClassification: "public_web_content",
  },
  "barcode-lookup": {
    dataSource: "Open Food Facts API (barcode product database)",
    dataClassification: "public_web_content",
  },
  "amazon-price": {
    dataSource: "Headless browser (Amazon product page scraping)",
    dataClassification: "public_web_content",
  },

  // ── Marketing & SEO ───────────────────────────────────────────────────────
  "keyword-suggest": {
    dataSource: "Google Autocomplete API (keyword suggestions)",
    dataClassification: "public_web_content",
  },
  "serp-analyze": {
    dataSource: "Serper.dev API (SERP analysis and feature extraction)",
    dataClassification: "public_web_content",
  },

  // ── IP & legal ────────────────────────────────────────────────────────────
  "eu-trademark-search": {
    dataSource: "EUIPO (European Union Intellectual Property Office)",
    dataClassification: "public_government_data",
  },
  "patent-search": {
    dataSource: "Headless browser (Google Patents search)",
    dataClassification: "public_government_data",
  },
  "uk-companies-house-officers": {
    dataSource: "Companies House API (UK Government, officer records)",
    dataClassification: "public_company_data",
  },
  "charity-lookup-uk": {
    dataSource: "Charity Commission for England and Wales API",
    dataClassification: "public_government_data",
  },
  "food-safety-rating-uk": {
    dataSource: "Food Standards Agency (FSA) Ratings API (UK Government)",
    dataClassification: "public_government_data",
  },

  // ── External data APIs ────────────────────────────────────────────────────
  "weather-lookup": {
    dataSource: "Open-Meteo API (open-source weather forecast data)",
    dataClassification: "public_infrastructure_data",
  },
  "ip-geolocation": {
    dataSource: "ip-api.com (IP geolocation database)",
    dataClassification: "public_infrastructure_data",
  },
  "flight-status": {
    dataSource: "AviationStack API (flight tracking data)",
    dataClassification: "public_infrastructure_data",
  },
  "cve-lookup": {
    dataSource: "OSV API (Open Source Vulnerability database, Google)",
    dataClassification: "public_security_data",
  },

  // ── Developer tools: package registries ───────────────────────────────────
  "github-user-profile": {
    dataSource: "GitHub REST API (public user profiles)",
    dataClassification: "public_web_content",
  },
  "github-repo-compare": {
    dataSource: "GitHub REST API (public repository comparison)",
    dataClassification: "public_web_content",
  },
  "github-repo-analyze": {
    dataSource: "GitHub REST API (repository analysis and metrics)",
    dataClassification: "public_web_content",
  },
  "npm-package-info": {
    dataSource: "npm Registry API (package metadata)",
    dataClassification: "public_web_content",
  },
  "pypi-package-info": {
    dataSource: "PyPI JSON API (Python package metadata)",
    dataClassification: "public_web_content",
  },
  "docker-hub-info": {
    dataSource: "Docker Hub API (container image metadata)",
    dataClassification: "public_web_content",
  },
  "dependency-audit": {
    dataSource: "Algorithmic (dependency tree analysis, no external data)",
    dataClassification: "user_provided_data",
  },

  // ── Developer tools: code generation ──────────────────────────────────────
  "regex-generate": {
    dataSource: "Claude API (regex pattern generation)",
    dataClassification: "user_provided_data",
  },
  "cron-explain": {
    dataSource: "Algorithmic (cron expression parsing, no external data)",
    dataClassification: "user_provided_data",
  },
  "sql-generate": {
    dataSource: "Claude API (SQL query generation)",
    dataClassification: "user_provided_data",
  },
  "sql-explain": {
    dataSource: "Claude API (SQL query explanation)",
    dataClassification: "user_provided_data",
  },
  "sql-optimize": {
    dataSource: "Claude API (SQL query optimization)",
    dataClassification: "user_provided_data",
  },
  "schema-migration-generate": {
    dataSource: "Claude API (database schema migration generation)",
    dataClassification: "user_provided_data",
  },
  "openapi-validate": {
    dataSource: "Algorithmic (OpenAPI 3.x specification validation)",
    dataClassification: "user_provided_data",
  },
  "openapi-generate": {
    dataSource: "Claude API (OpenAPI specification generation)",
    dataClassification: "user_provided_data",
  },
  "http-to-curl": {
    dataSource: "Algorithmic (HTTP request to cURL conversion, no external data)",
    dataClassification: "user_provided_data",
  },
  "curl-to-code": {
    dataSource: "Claude API (cURL to code conversion)",
    dataClassification: "user_provided_data",
  },
  "jwt-decode": {
    dataSource: "Algorithmic (JWT token decoding, no external data)",
    dataClassification: "user_provided_data",
  },
  "webhook-test-payload": {
    dataSource: "Claude API (webhook payload generation)",
    dataClassification: "user_provided_data",
  },
  "json-to-typescript": {
    dataSource: "Algorithmic (JSON to TypeScript type generation, no external data)",
    dataClassification: "user_provided_data",
  },
  "json-to-zod": {
    dataSource: "Algorithmic (JSON to Zod schema generation, no external data)",
    dataClassification: "user_provided_data",
  },
  "json-to-pydantic": {
    dataSource: "Algorithmic (JSON to Pydantic model generation, no external data)",
    dataClassification: "user_provided_data",
  },
  "regex-explain": {
    dataSource: "Claude API (regex pattern explanation)",
    dataClassification: "user_provided_data",
  },
  "code-convert": {
    dataSource: "Claude API (programming language conversion)",
    dataClassification: "user_provided_data",
  },
  "code-review": {
    dataSource: "Claude API (code analysis and review)",
    dataClassification: "user_provided_data",
  },
  "commit-message-generate": {
    dataSource: "Claude API (git commit message generation)",
    dataClassification: "user_provided_data",
  },
  "pr-description-generate": {
    dataSource: "Claude API (pull request description generation)",
    dataClassification: "user_provided_data",
  },
  "release-notes-generate": {
    dataSource: "Claude API (release notes generation)",
    dataClassification: "user_provided_data",
  },
  "readme-generate": {
    dataSource: "Claude API (README generation)",
    dataClassification: "user_provided_data",
  },
  "jsdoc-generate": {
    dataSource: "Claude API (JSDoc documentation generation)",
    dataClassification: "user_provided_data",
  },
  "docstring-generate": {
    dataSource: "Claude API (Python docstring generation)",
    dataClassification: "user_provided_data",
  },
  "log-parse": {
    dataSource: "Algorithmic (log file parsing and structuring, no external data)",
    dataClassification: "user_provided_data",
  },
  "error-explain": {
    dataSource: "Claude API (error message explanation)",
    dataClassification: "user_provided_data",
  },
  "crontab-generate": {
    dataSource: "Claude API (crontab expression generation)",
    dataClassification: "user_provided_data",
  },
  "dockerfile-generate": {
    dataSource: "Claude API (Dockerfile generation)",
    dataClassification: "user_provided_data",
  },
  "gitignore-generate": {
    dataSource: "Algorithmic (gitignore template generation by project type)",
    dataClassification: "user_provided_data",
  },
  "env-template-generate": {
    dataSource: "Claude API (environment template generation)",
    dataClassification: "user_provided_data",
  },
  "nginx-config-generate": {
    dataSource: "Claude API (Nginx configuration generation)",
    dataClassification: "user_provided_data",
  },
  "github-actions-generate": {
    dataSource: "Claude API (GitHub Actions workflow generation)",
    dataClassification: "user_provided_data",
  },
  "changelog-generate": {
    dataSource: "Claude API (changelog generation)",
    dataClassification: "user_provided_data",
  },
  "api-docs-generate": {
    dataSource: "Claude API (API documentation generation)",
    dataClassification: "user_provided_data",
  },
  "fake-data-generate": {
    dataSource: "Algorithmic (synthetic data generation, no external data)",
    dataClassification: "user_provided_data",
  },
  "api-mock-response": {
    dataSource: "Claude API (mock API response generation)",
    dataClassification: "user_provided_data",
  },
  "test-case-generate": {
    dataSource: "Claude API (test case generation)",
    dataClassification: "user_provided_data",
  },

  // ── Developer tools: security ─────────────────────────────────────────────
  "secret-scan": {
    dataSource: "Algorithmic (regex pattern matching for secrets/credentials)",
    dataClassification: "user_provided_data",
  },
  "password-strength": {
    dataSource: "Algorithmic (password entropy calculation, no external data)",
    dataClassification: "user_provided_data",
  },

  // ── Developer tools: AI/LLM ───────────────────────────────────────────────
  "llm-output-validate": {
    dataSource: "Algorithmic (LLM output schema validation, no external data)",
    dataClassification: "user_provided_data",
  },
  "prompt-optimize": {
    dataSource: "Claude API (prompt engineering optimization)",
    dataClassification: "user_provided_data",
  },
  "agent-trace-analyze": {
    dataSource: "Claude API (agent trace analysis and optimization)",
    dataClassification: "user_provided_data",
  },
  "token-count": {
    dataSource: "Algorithmic (tokenizer estimation, no external data)",
    dataClassification: "user_provided_data",
  },
  "tool-call-validate": {
    dataSource: "Algorithmic (tool call schema validation, no external data)",
    dataClassification: "user_provided_data",
  },
  "llm-cost-calculate": {
    dataSource: "Algorithmic (LLM pricing calculation, static rate table)",
    dataClassification: "user_provided_data",
  },
  "prompt-compress": {
    dataSource: "Claude API (prompt compression and optimization)",
    dataClassification: "user_provided_data",
  },
  "context-window-optimize": {
    dataSource: "Claude API (context window optimization)",
    dataClassification: "user_provided_data",
  },

  // ── Content generation ────────────────────────────────────────────────────
  "blog-post-outline": {
    dataSource: "Claude API (content outline generation)",
    dataClassification: "user_provided_data",
  },
  "email-draft": {
    dataSource: "Claude API (email draft generation)",
    dataClassification: "user_provided_data",
  },
  "social-post-generate": {
    dataSource: "Claude API (social media post generation)",
    dataClassification: "user_provided_data",
  },
  "youtube-summarize": {
    dataSource: "HTTP fetch (YouTube transcript) + Claude API (summarization)",
    dataClassification: "public_web_content",
  },

  // ── Misc: competitive intelligence ────────────────────────────────────────
  "competitor-compare": {
    dataSource: "HTTP fetch + Claude API (competitive analysis)",
    dataClassification: "public_web_content",
  },
  "pricing-page-extract": {
    dataSource: "Headless browser + Claude API (pricing page data extraction)",
    dataClassification: "public_web_content",
  },
  "startup-domain-check": {
    dataSource: "DNS protocol + WHOIS + HTTP fetch (domain availability analysis)",
    dataClassification: "public_domain_data",
  },
  "timezone-meeting-find": {
    dataSource: "Algorithmic (timezone intersection calculation, IANA tz database)",
    dataClassification: "user_provided_data",
  },
};

async function backfill() {
  const db = getDb();

  // Get all capability slugs from DB first
  const allCaps = await db
    .select({ slug: capabilities.slug })
    .from(capabilities);
  const dbSlugs = new Set(allCaps.map((c) => c.slug));

  let updated = 0;
  let skipped = 0;

  for (const [slug, data] of Object.entries(DATA_MAP)) {
    if (!dbSlugs.has(slug)) {
      skipped++;
      console.warn(`  SKIP ${slug} (not found in DB)`);
      continue;
    }

    await db
      .update(capabilities)
      .set({
        dataSource: data.dataSource,
        dataClassification: data.dataClassification,
        updatedAt: new Date(),
      })
      .where(eq(capabilities.slug, slug));

    updated++;
  }

  // Check for capabilities missing from the map
  const mapped = new Set(Object.keys(DATA_MAP));
  const unmapped = allCaps.filter((c) => !mapped.has(c.slug));
  if (unmapped.length > 0) {
    console.warn(`\n  WARNING: ${unmapped.length} capabilities not in DATA_MAP:`);
    for (const c of unmapped) {
      console.warn(`    - ${c.slug}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped.`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
