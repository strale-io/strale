# SA.2b.c — PII classification proposal (Phase 1, revised — awaiting chat review)

**Date:** 2026-04-20
**HEAD:** `f1c647277f0c0a0b5b9e454db3c65538827abffe` (`main`)
**Scope:** propose `processes_personal_data` + `personal_data_categories` for the 292 capabilities with NULL values. No SQL executed. No manifests edited.

**Revision note:** chat directive flipped 22 "arbitrary-text processor" slugs (csv-clean, pdf-extract, summarize, translate, prompt-optimize, log-parse, jwt-decode, and 15 similar) from TRUE to FALSE. Rationale: the capability's inherent behavior is structural (format conversion, summarization, etc.), not PII-processing. Input-content provenance is not the capability's concern. Retained as TRUE: `pii-redact` (definitional), `password-strength` (password IS the sensitive data), `secret-scan` (definitional), and slugs with other anchoring PII categories (aml-risk-score, credit-report-summary, etc.).

## Summary

| Metric | Count |
|---|---|
| Total slugs needing classification | **292** |
| Proposed `processes_personal_data = true` | **89** |
| Proposed `processes_personal_data = false` | **203** |
| High-confidence | 265 |
| Medium/low-confidence (flag for chat review) | **27** |
| Orphan DB rows (no manifest) | 32 of 32 |

### `personal_data_categories` distribution

| Category | Count |
|---|---|
| `name` | 52 |
| `address` | 44 |
| `professional` | 38 |
| `financial` | 16 |
| `sensitive_special` | 9 |
| `behavioral` | 8 |
| `email` | 7 |
| `phone` | 4 |
| `government_id` | 4 |
| `date_of_birth` | 2 |

**Note on `sensitive_special` drop from 31 → 9:** the 22 flipped arbitrary-text processors accounted for 22 of the 31. Remaining 9 `sensitive_special` slugs are definitional: pii-redact, password-strength, secret-scan, plus 6 compliance-specific (aml-risk-score, beneficial-ownership-lookup, insolvency-check, eu-court-case-search, gdpr-fine-lookup, credit-report-summary) where `sensitive_special` is paired with another anchoring category.

---

## Medium/Low-confidence classifications (CHAT REVIEW)

**27 slugs** flagged. CC's classifications below are based on slug name + description; chat should review each for approval or override.

| slug | Proposed | Categories | Rationale |
|---|---|---|---|
| `company-news` | false | — | News about a company — no PII input |
| `sec-filing-events` | false | — | SEC filings — company-level |
| `uk-filing-events` | false | — | UK Companies House filings — company-level |
| `website-to-company` | false | — | Website URL → company identification |
| `email-draft` | **true** | email, name | Drafts emails — inputs + outputs contain recipients/senders |
| `employer-review-summary` | false | — | Aggregate employer reviews — anonymized |
| `gdpr-fine-lookup` | **true** | name, sensitive_special | May name individuals or companies |
| `job-board-search` | false | — | Job postings — company listings |
| `postal-code-lookup` | **true** | address | Postal code → area info; postal code is address-adjacent |
| `product-reviews-extract` | false | — | Aggregates reviews — typically public |
| `salary-benchmark` | false | — | Aggregate salary by role/location |
| `skill-extract` | **true** | professional | Extracts skills from CV/profile — professional data |
| `skill-gap-analyze` | **true** | professional | Compares skills — professional profiling |
| `uk-flood-risk` (orphan) | **true** | address | Flood risk by postcode/address |
| `job-posting-analyze` | false | — | Analyzes job post text |
| `cz-datova-schranka-id-validate` | **true** | government_id | Data box ID may be personal |
| `id-number-validate` | **true** | government_id | Generic ID validation |
| `tax-id-validate` | **true** | government_id | Tax ID may be individual TIN |
| `approval-security-check` (orphan) | false | — | Checks smart contract approvals |
| `ens-resolve` (orphan) | **true** | behavioral | ENS → address — user-linked handle |
| `ens-reverse-lookup` (orphan) | **true** | behavioral | Address → ENS — user-linked |
| `vasp-non-compliant-check` (orphan) | false | — | VASP compliance — business |
| `vasp-verify` (orphan) | false | — | VASP verification — business |
| `wallet-age-check` (orphan) | **true** | behavioral, financial | Wallet — pseudonymous financial identifier |
| `wallet-balance-lookup` (orphan) | **true** | behavioral, financial | Wallet balance |
| `wallet-risk-score` (orphan) | **true** | behavioral, financial | Wallet risk profile |
| `wallet-transactions-lookup` (orphan) | **true** | behavioral, financial | Wallet tx history |

---

## Section A — Proposed `processes_personal_data = true` (89 slugs)

### Group: `[address,name,professional]` — 28 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `au-company-data` | high | ABR — company with officers |
| `cz-company-data` | high | Czech justice registry |
| `australian-company-data` | high | ABR — officers + address |
| `austrian-company-data` | high | Firmenbuch |
| `belgian-company-data` | high | KBO/BCE |
| `brazilian-company-data` | high | CNPJ |
| `business-license-check-se` | high | Swedish business license + owner info |
| `canadian-company-data` | high | Corporations Canada |
| `charity-lookup-uk` | high | Charity Commission — trustees are individuals |
| `company-enrich` | high | Enriches company data incl. officers |
| `danish-company-data` | high | CVR |
| `estonian-company-data` | high | Ariregister |
| `finnish-company-data` | high | PRH |
| `french-company-data` | high | INSEE/SIRENE |
| `hong-kong-company-data` (orphan) | high | Companies Registry HK |
| `indian-company-data` (orphan) | high | MCA |
| `irish-company-data` | high | CRO |
| `italian-company-data` | high | Registro Imprese |
| `japanese-company-data` | high | hojin |
| `latvian-company-data` | high | Latvian registry |
| `lithuanian-company-data` | high | Registrų centras |
| `polish-company-data` | high | KRS |
| `portuguese-company-data` | high | Portuguese registry |
| `singapore-company-data` (orphan) | high | ACRA |
| `spanish-company-data` | high | Registro Mercantil |
| `swiss-company-data` | high | Zefix |
| `uk-companies-house-officers` | high | Explicit officer lookup |
| `us-company-data` | high | SEC EDGAR |

### Group: `[address]` — 10 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `address-geocode` | high | Address input |
| `nl-bag-address` | high | Dutch address lookup |
| `nl-energy-label` | high | By property address |
| `nl-woz-value` | high | Property valuation by address |
| `postal-code-lookup` | medium | Postal code → area info; postal code is address-adjacent |
| `uk-epc-rating` (orphan) | high | EPC by property address |
| `uk-flood-risk` (orphan) | medium | Flood risk by postcode/address |
| `address-parse` | high | Address parsing |
| `council-tax-lookup` (orphan) | high | By property address |
| `address-validate` | high | Address input |

### Group: `[name,professional]` — 4 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `officer-search` (orphan) | high | Explicit person-name search |
| `patent-search` | high | Patents name inventors/assignees |
| `social-profile-check` | high | Social profile lookup |
| `linkedin-url-validate` | high | LinkedIn URL = person identifier |

### Group: `[name,sensitive_special]` — 4 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `aml-risk-score` | high | AML scoring — personal risk profiling |
| `insolvency-check` | high | Personal/company insolvency status |
| `eu-court-case-search` | high | Court cases name parties |
| `gdpr-fine-lookup` | medium | May name individuals or companies |

### Group: `[behavioral]` — 4 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `ip-geolocation` | high | IP → location |
| `ip-risk-score` | high | IP → risk |
| `ens-resolve` (orphan) | medium | ENS → address — user-linked handle |
| `ens-reverse-lookup` (orphan) | medium | Address → ENS — user-linked |

### Group: `[behavioral,financial]` — 4 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `wallet-age-check` (orphan) | medium | Wallet — pseudonymous financial identifier |
| `wallet-balance-lookup` (orphan) | medium | Wallet balance |
| `wallet-risk-score` (orphan) | medium | Wallet risk profile |
| `wallet-transactions-lookup` (orphan) | medium | Wallet tx history |

### Group: `[financial]` — 3 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `iban-to-bank` | high | IBAN → bank — financial PII input |
| `credit-score-band` | high | Credit score → band |
| `cz-bank-account-validate` | high | Bank account number input |

### Group: `[address,financial,name]` — 3 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `invoice-extract` | high | Invoices contain payer/payee + amounts |
| `contract-extract` | high | Contracts contain parties + terms |
| `invoice-validate` | high | Invoices contain payer/payee |

### Group: `[financial,name]` — 3 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `swift-message-parse` | high | SWIFT messages contain account + name |
| `receipt-categorize` | high | Receipts identify buyer + amount |
| `sepa-xml-validate` | high | SEPA XML has IBAN + name |

### Group: `[phone]` — 3 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `phone-normalize` | high | Normalizes phone numbers |
| `phone-type-detect` | high | Phone number input |
| `phone-validate` | high | Phone number input |

### Group: `[sensitive_special]` — 3 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `pii-redact` | high | Redacts PII — operates on PII by definition |
| `password-strength` | high | Password input — the password IS the sensitive data |
| `secret-scan` | high | Scans text for secrets by definition |

### Group: `[government_id]` — 3 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `cz-datova-schranka-id-validate` | medium | Data box ID may be personal |
| `id-number-validate` | medium | Generic ID validation |
| `tax-id-validate` | medium | Tax ID may be individual TIN |

### Group: `[email,name]` — 2 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `email-pattern-discover` (orphan) | high | Discovers email patterns; inputs + outputs contain emails |
| `email-draft` | medium | Drafts emails — inputs + outputs contain recipients/senders |

### Group: `[financial,name,professional]` — 2 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `cz-unreliable-vat-payer` | high | VAT payer check |
| `annual-report-extract` | high | Annual reports include officer names |

### Group: `[professional]` — 2 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `skill-extract` | medium | Extracts skills from CV/profile — professional data |
| `skill-gap-analyze` | medium | Compares skills — professional profiling |

### Group: `[name]` — 2 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `name-parse` | high | Parses personal names |
| `meeting-notes-extract` | high | Meeting notes name attendees |

### Group: `[email]` — 2 slugs

| slug | Confidence | Rationale |
|---|---|---|
| `email-deliverability-check` | high | Email input |
| `email-reputation-score` | high | Email input |

### Group: `[address,name,sensitive_special]` — 1 slug

| slug | Confidence | Rationale |
|---|---|---|
| `beneficial-ownership-lookup` | high | UBO lookup — personal names + control |

### Group: `[email,name,professional]` — 1 slug

| slug | Confidence | Rationale |
|---|---|---|
| `github-user-profile` | high | Public but contains username/email/bio |

### Group: `[address,email,name,phone,professional]` — 1 slug

| slug | Confidence | Rationale |
|---|---|---|
| `resume-parse` | high | CVs — rich PII by design |

### Group: `[financial,sensitive_special]` — 1 slug

| slug | Confidence | Rationale |
|---|---|---|
| `credit-report-summary` | high | Credit report — sensitive financial |

### Group: `[date_of_birth]` — 1 slug

| slug | Confidence | Rationale |
|---|---|---|
| `age-verify` | high | DOB input |

### Group: `[date_of_birth,government_id]` — 1 slug

| slug | Confidence | Rationale |
|---|---|---|
| `cz-birth-number-validate` | high | Czech birth number = national ID + DOB |

### Group: `[address,email,name]` — 1 slug

| slug | Confidence | Rationale |
|---|---|---|
| `whois-lookup` | high | Whois may return registrant PII |

---

## Section B — Proposed `processes_personal_data = false` (203 slugs)

All receive `personal_data_categories = []`. Expanded post-flip: includes all arbitrary-text processors (csv-clean, pdf-extract, summarize, translate, prompt-optimize, log-parse, jwt-decode, agent-trace-analyze, context-window-optimize, prompt-compress, structured-scrape, google-search, web-extract, html-to-pdf, image-to-text, csv-to-json, data-quality-check, deduplicate, json-to-csv, xml-to-json, classify-text, sentiment-analyze). Rationale: capability's design is structural/format; input content provenance is not the capability's concern.

<details><summary>Expand full list</summary>

| slug | Category | Confidence | Rationale |
|---|---|---|---|
| `code-review` | agent-tooling | high | Reviews code diffs |
| `llm-output-validate` | agent-tooling | high | Validates LLM output structure |
| `prompt-optimize` | agent-tooling | high | Optimizes prompts — structural |
| `company-news` | company-data | medium | News about a company — no PII input |
| `sec-filing-events` | company-data | medium | SEC filings — company-level |
| `uk-filing-events` | company-data | medium | UK Companies House filings — company-level |
| `website-to-company` | company-data | medium | Website URL → company identification |
| `brand-mention-search` | competitive-intelligence | high | Brand mentions — company, not personal |
| `company-tech-stack` | competitive-intelligence | high | Website tech inventory |
| `competitor-compare` | competitive-intelligence | high | Competitive comparison |
| `landing-page-roast` | competitive-intelligence | high | Page analysis |
| `pricing-page-extract` | competitive-intelligence | high | Extracts pricing tables |
| `seo-audit` | competitive-intelligence | high | SEO audit of a domain |
| `domain-reputation` | compliance | high | Domain-level, not personal |
| `eu-regulation-search` | compliance | high | Regulation corpus search |
| `gdpr-website-check` | compliance | high | Scans website for GDPR signals |
| `blog-post-outline` | content-writing | high | User generates blog outlines — capability's job is structure, not PII |
| `social-post-generate` | content-writing | high | Social post generation from prompt |
| `amazon-price` (orphan) | data-extraction | high | Amazon product price |
| `backlink-check` | data-extraction | high | Domain backlinks |
| `barcode-lookup` | data-extraction | high | Product barcode |
| `container-track` | data-extraction | high | Shipping container |
| `cookie-scan` | data-extraction | high | Website cookie scan |
| `country-tax-rates` | data-extraction | high | Reference data by country |
| `country-trade-data` | data-extraction | high | Macro trade statistics |
| `crypto-price` | data-extraction | high | Crypto market data |
| `customs-duty-lookup` | data-extraction | high | HS code duty rates |
| `dangerous-goods-classify` | data-extraction | high | UN dangerous goods classification |
| `data-protection-authority-lookup` | data-extraction | high | Directory of DPAs |
| `docker-hub-info` | data-extraction | high | Docker image metadata |
| `domain-age-check` | data-extraction | high | Domain registration age |
| `employer-review-summary` | data-extraction | medium | Aggregate employer reviews — anonymized |
| `employment-cost-estimate` | data-extraction | high | Salary/tax math |
| `eu-trademark-search` | data-extraction | high | Trademark — company-level |
| `financial-year-dates` | data-extraction | high | Fiscal calendar math |
| `flight-status` | data-extraction | high | Flight number status |
| `food-safety-rating-uk` | data-extraction | high | Food establishment rating — business |
| `forex-history` | data-extraction | high | Currency rate history |
| `github-repo-compare` | data-extraction | high | Repo stats |
| `holiday-calendar` | data-extraction | high | Public holiday lookup |
| `incoterms-explain` | data-extraction | high | Trade terms reference |
| `job-board-search` | data-extraction | medium | Job postings — company listings |
| `keyword-suggest` | data-extraction | high | Keyword research |
| `nl-housing-price-index` | data-extraction | high | Regional aggregate |
| `nl-housing-stats` | data-extraction | high | Regional aggregate |
| `npm-package-info` | data-extraction | high | Package registry metadata |
| `page-speed-test` | data-extraction | high | Page performance |
| `pdf-extract` | data-extraction | high | Capability extracts structured data from PDFs — user-provided file content is not PII-processing by the capability's design |
| `port-lookup` | data-extraction | high | Port number reference |
| `price-compare` | data-extraction | high | Product prices |
| `privacy-policy-analyze` | data-extraction | high | Analyzes policy text structure |
| `product-reviews-extract` | data-extraction | medium | Aggregates reviews — typically public |
| `product-search` | data-extraction | high | Product search |
| `public-holiday-lookup` | data-extraction | high | Holiday reference |
| `pypi-package-info` | data-extraction | high | PyPI metadata |
| `return-policy-extract` | data-extraction | high | Extracts return policy text |
| `salary-benchmark` | data-extraction | medium | Aggregate salary by role/location |
| `serp-analyze` | data-extraction | high | SERP analysis |
| `shipping-cost-estimate` | data-extraction | high | Cost estimate math |
| `shipping-track` | data-extraction | high | Shipment tracking |
| `ted-procurement` | data-extraction | high | EU procurement tenders — company-level |
| `terms-of-service-extract` | data-extraction | high | Extracts ToS text |
| `ticker-lookup` | data-extraction | high | Stock ticker lookup |
| `timezone-lookup` | data-extraction | high | Timezone by location |
| `trustpilot-score` | data-extraction | high | Company review aggregate |
| `uk-crime-stats` (orphan) | data-extraction | high | Aggregate crime stats by area |
| `uk-deprivation-index` (orphan) | data-extraction | high | Aggregate deprivation index by area |
| `uk-transport-access` (orphan) | data-extraction | high | Aggregate transport access by area |
| `vat-rate-lookup` | data-extraction | high | VAT rate by country reference |
| `weather-lookup` | data-extraction | high | Weather by location |
| `web-extract` | data-extraction | high | Capability extracts structured data from URLs — page content is not the capability's PII-processing scope |
| `website-carbon-estimate` | data-extraction | high | Carbon score by domain |
| `work-permit-requirements` | data-extraction | high | Immigration reference data |
| `youtube-summarize` | data-extraction | high | Summarizes videos — public content |
| `company-industry-classify` | data-processing | high | Classifies by NAICS/SIC |
| `company-name-match` | data-processing | high | Fuzzy match between company names |
| `csv-clean` | data-processing | high | Structural CSV cleanup — capability's job is format, not content |
| `csv-to-json` | data-processing | high | Format conversion |
| `data-quality-check` | data-processing | high | Validates user data schema — structural |
| `date-parse` | data-processing | high | Parses date strings |
| `deduplicate` | data-processing | high | Structural dedupe — format-level |
| `flatten-json` | data-processing | high | Flattens nested JSON |
| `json-to-csv` | data-processing | high | Format conversion |
| `language-detect` | data-processing | high | Detects language of text |
| `schema-infer` | data-processing | high | Infers JSON schema from data |
| `unit-convert` | data-processing | high | Unit conversion |
| `xml-to-json` | data-processing | high | Format conversion |
| `agent-trace-analyze` | developer-tools | high | Analyzes agent traces — capability's job is structural, not PII-processing |
| `api-docs-generate` | developer-tools | high | Generates API docs from schema |
| `api-mock-response` | developer-tools | high | Generates mock JSON from schema |
| `changelog-generate` | developer-tools | high | Generates changelog from commits |
| `code-convert` | developer-tools | high | Code language conversion |
| `commit-message-generate` | developer-tools | high | Commit message from diff |
| `context-window-optimize` | developer-tools | high | Optimizes token usage — structural, not PII |
| `crontab-generate` | developer-tools | high | Generates cron expressions |
| `curl-to-code` | developer-tools | high | Converts curl command to code |
| `dependency-audit` | developer-tools | high | npm/pip deps audit |
| `diff-review` | developer-tools | high | Reviews code diffs |
| `dockerfile-generate` | developer-tools | high | Generates Dockerfiles |
| `docstring-generate` | developer-tools | high | Generates docstrings |
| `env-template-generate` | developer-tools | high | Generates .env templates |
| `error-explain` | developer-tools | high | Explains error messages |
| `fake-data-generate` | developer-tools | high | Generates synthetic fake data |
| `github-actions-generate` | developer-tools | high | Generates GitHub Actions YAML |
| `github-repo-analyze` | developer-tools | high | Analyzes repo structure |
| `gitignore-generate` | developer-tools | high | Generates .gitignore |
| `http-to-curl` | developer-tools | high | Converts HTTP request to curl |
| `job-posting-analyze` | developer-tools | medium | Analyzes job post text |
| `jsdoc-generate` | developer-tools | high | Generates JSDoc |
| `json-to-pydantic` | developer-tools | high | Schema conversion |
| `json-to-typescript` | developer-tools | high | Schema conversion |
| `json-to-zod` | developer-tools | high | Schema conversion |
| `jwt-decode` | developer-tools | high | Decodes JWT structure — capability's job is format parsing, not PII |
| `llm-cost-calculate` | developer-tools | high | Token cost math |
| `log-parse` | developer-tools | high | Parses log structure — capability's job is format, not content-PII |
| `nginx-config-generate` | developer-tools | high | Generates nginx config |
| `openapi-generate` | developer-tools | high | Generates OpenAPI spec |
| `openapi-validate` | developer-tools | high | Validates OpenAPI spec |
| `pr-description-generate` | developer-tools | high | Generates PR description from diff |
| `prompt-compress` | developer-tools | high | Compresses prompts — structural transform |
| `readme-generate` | developer-tools | high | Generates README |
| `regex-explain` | developer-tools | high | Explains regex |
| `release-notes-generate` | developer-tools | high | Generates release notes from commits |
| `schema-migration-generate` | developer-tools | high | Generates SQL migration |
| `sql-explain` | developer-tools | high | Explains SQL |
| `sql-generate` | developer-tools | high | Generates SQL from description |
| `sql-optimize` | developer-tools | high | Optimizes SQL |
| `test-case-generate` | developer-tools | high | Generates test cases |
| `token-count` | developer-tools | high | Counts LLM tokens |
| `tool-call-validate` | developer-tools | high | Validates tool-call JSON |
| `webhook-test-payload` | developer-tools | high | Generates webhook test payloads |
| `base64-encode-url` | file-conversion | high | Base64 encode/decode |
| `html-to-pdf` | file-conversion | high | Format conversion |
| `image-resize` | file-conversion | high | Image manipulation |
| `image-to-text` | file-conversion | high | OCR — format conversion; PII-content is input-provenance, not capability design |
| `markdown-to-html` | file-conversion | high | Markdown rendering |
| `ecb-interest-rates` | finance | high | ECB reference rates |
| `stamp-duty-calculate` (orphan) | finance | high | Tax calc from price |
| `uk-rental-yield` (orphan) | finance | high | Aggregate regional data |
| `uk-sold-prices` (orphan) | finance | high | Aggregate sold-price history |
| `currency-convert` | financial | high | Currency math |
| `exchange-rate` | financial | high | FX rate lookup |
| `stock-quote` | financial | high | Stock price |
| `mx-lookup` | monitoring | high | DNS MX record lookup |
| `port-check` | monitoring | high | TCP port check |
| `redirect-trace` | monitoring | high | HTTP redirect chain |
| `robots-txt-parse` | monitoring | high | Parses robots.txt |
| `sitemap-parse` | monitoring | high | Parses sitemap |
| `ssl-certificate-chain` | monitoring | high | TLS cert chain |
| `uptime-check` | monitoring | high | Website uptime probe |
| `cve-lookup` | security | high | CVE vulnerability lookup |
| `header-security-check` | security | high | HTTP security headers |
| `license-compatibility-check` | security | high | Open-source license compat |
| `package-security-audit` | security | high | Package vulnerability scan |
| `workflow-security-audit` | security | high | Audits CI workflow files |
| `classify-text` | text-processing | high | Structural classification — capability's job |
| `sentiment-analyze` | text-processing | high | Sentiment analysis — structural |
| `summarize` | text-processing | high | Summarization — structural transform |
| `translate` | text-processing | high | Translation — structural transform |
| `hs-code-lookup` | trade | high | HS code reference lookup |
| `marketplace-fee-calculate` | utility | high | Fee calculation math |
| `payment-reference-generate` | utility | high | Generates reference numbers |
| `startup-domain-check` | utility | high | Domain availability |
| `timezone-meeting-find` | utility | high | Timezone math |
| `accessibility-audit` | validation | high | Accessibility audit of a URL |
| `api-health-check` | validation | high | Health probe |
| `bank-bic-lookup` | validation | high | BIC is bank-level |
| `business-day-check` | validation | high | Date math |
| `company-id-detect` | validation | high | Detects type of company ID string |
| `cron-explain` | validation | high | Explains cron expression |
| `cz-ico-validate` | validation | high | Czech company identifier |
| `diff-json` | validation | high | Diffs JSON documents |
| `eori-validate` | validation | high | Company EORI number |
| `eu-ai-act-classify` | validation | high | Classifies AI systems, not users |
| `isbn-validate` | validation | high | Book ISBN |
| `json-schema-validate` | validation | high | Validates JSON schema |
| `lei-lookup` | validation | high | LEI — company identifier |
| `og-image-check` | validation | high | OpenGraph image validation |
| `paid-api-preflight` | validation | high | API auth preflight |
| `regex-generate` | validation | high | Generates regex from examples |
| `swift-validate` | validation | high | Validates SWIFT code format (bank) |
| `url-health-check` | validation | high | URL uptime check |
| `vat-format-validate` | validation | high | VAT format (company) |
| `vat-validate` | validation | high | VAT validation (company via VIES) |
| `approval-security-check` (orphan) | web3 | medium | Checks smart contract approvals |
| `contract-verify-check` (orphan) | web3 | high | Smart contract verification status |
| `fear-greed-index` (orphan) | web3 | high | Market sentiment aggregate |
| `gas-price-check` (orphan) | web3 | high | Network gas price |
| `phishing-site-check` (orphan) | web3 | high | Checks if site is phishing |
| `protocol-fees-lookup` (orphan) | web3 | high | DeFi protocol fees |
| `protocol-tvl-lookup` (orphan) | web3 | high | Protocol TVL |
| `stablecoin-flow-check` (orphan) | web3 | high | Aggregate flow analysis |
| `token-security-check` (orphan) | web3 | high | Token smart contract analysis |
| `vasp-non-compliant-check` (orphan) | web3 | medium | VASP compliance — business |
| `vasp-verify` (orphan) | web3 | medium | VASP verification — business |
| `tech-stack-detect` | web-intelligence | high | Detects website tech stack |
| `google-search` | web-scraping | high | Search query routing — capability is query, not content |
| `link-extract` | web-scraping | high | Extracts links from HTML |
| `meta-extract` | web-scraping | high | Extracts HTML meta tags |
| `screenshot-url` | web-scraping | high | Takes URL screenshot |
| `structured-scrape` | web-scraping | high | Scraping capability — capability's job is structure, not content-PII |
| `url-to-markdown` | web-scraping | high | HTML to markdown — public URL |
| `url-to-text` | web-scraping | high | HTML to text — public URL |

</details>

---

## Section C — Class 2 fixture fixes (bundled)

Two manifests have `test_fixtures.known_answer.input` that doesn't satisfy their own `input_schema.required` — same pattern fixed in SA.2b.b B5 for `dutch-company-data`.

### `manifests/estonian-company-data.yaml`

**Current:** `input: { company_name: Pipedrive }` → **Proposed:** `input: { registry_code: "17449106" }` (Bolt App Services AS — from the manifest's own output_schema.example).

### `manifests/spanish-company-data.yaml`

**Current:** `input: { company_name: Inditex }` → **Proposed:** `input: { cif: "A15075062" }` (Inditex S.A.'s real CIF).

---

## Phase 2 execution plan (pending chat approval)

### Grouped UPDATE statements

CC will run these one at a time, reporting rowcount after each.

### Expected final DB state

| `processes_personal_data` | Before | After (proposed) |
|---|---|---|
| true | 11 | 100 |
| false | 4 | 207 |
| NULL | 292 | 0 |
| **Total** | **307** | **307** |

### What Phase 2 does NOT do

- No manifest updates (except the 2 Class 2 fixture fixes in Section C).
- No `NOT NULL` flip — that's SA.2b.d, after chat confirms SA.2b.c is green.
- No heuristic fallback deletion — same SA.2b.d deferral.

---

## Waiting for chat decision

**Phase 1 complete.** Awaiting chat review before Phase 2.
