# Manifest / DB drift inventory

**Date:** 2026-04-20
**HEAD:** `b26addcaa94b170d466863da744a7fbe466337f3` (`main`)
**Scope:** read-only audit of every manifest in `manifests/*.yaml` vs every row in `capabilities` DB. No code modified. No commits.
**Purpose:** determine full scope of manifest/DB drift; inform SA.2b.c (260-manifest PII backfill) and future remediation work.

---

## Section 1 — Summary

### Counts

| Metric | Value |
|---|---|
| Manifest files (`manifests/*.yaml`) | 275 |
| Parsed manifests (YAML valid) | 275 |
| DB rows (`capabilities` table) | 307 |
| Manifests without DB row | 0 |
| DB rows without manifest (orphans) | 32 |

### Drift classes

| Class | Description | Count | % of manifests |
|---|---|---|---|
| 1 | YAML missing field, DB has value | **242** | 88% |
| 2 | Fixture `known_answer.input` doesn't satisfy schema `required` | **2** | <1% |
| 3 | Description/schema disagreement (heuristic candidates) | **55** | 20% |
| 4 | YAML/DB conflict (both populated, values differ) | **238** | 87% |
| 5 | Gate inconsistency (global, see Section 6) | **2** structural | n/a |

### PII backfill scope (SA.2b.c)

- DB rows with `processes_personal_data IS NULL`: **292** of 307 (95%)
- DB rows with `processes_personal_data = true`: **11** (SA.2b.b top-15 backfill — 11 classified true)
- DB rows with `processes_personal_data = false`: **4** (SA.2b.b top-15 backfill — 4 classified false)

### Top-line interpretation

**Class 4 is the dominant risk** — 238 conflicts across 5 fields means running the onboarding pipeline naively would overwrite DB values with stale YAML values for ~87% of capabilities. Sample inspection (Section 5) indicates **DB is canonical for at least 4 of the 5 conflict types** — the YAML files were authored early and haven't been kept in sync with subsequent admin-UI edits, repricing, or code-level taxonomy changes.

**Class 1 is dominant but mechanical** — all 242 Class 1 cases are the same field (`maintenance_class`). Mechanical backfill script (one value per capability, read from DB) resolves it in minutes.

**Class 2 is small** — only 2 remaining cases (estonian-company-data, spanish-company-data) after SA.2b.b fixed dutch-company-data.

**Class 3 is noisy** — 55 heuristic candidates including false positives ("or bugs" in code-review description). Manual triage needed, most are likely legitimate prose, but a subset match the dutch-company-data pattern (description promises `company_name` input, schema only accepts registry code).

---

## Section 2 — Class 1 inventory (YAML missing, DB has value)

**All 242 Class 1 instances are the same field:** `maintenance_class`.

SA.2b.b backfilled 15 of these. Remaining: **242**. Each manifest's correct `maintenance_class` value is in the DB (set via admin or seed.ts). A single remediation script reads the DB value and writes it to the YAML.

### Distribution by DB value

| `maintenance_class` value | Count |
|---|---|
| pure-computation | 67 |
| free-stable-api | 65 |
| commercial-stable-api | 61 |
| scraping-fragile-target | 29 |
| scraping-stable-target | 19 |
| requires-domain-expertise | 1 |

### Full slug list (242)

<details><summary>Expand</summary>

| slug | maintenance_class (from DB) |
|---|---|
| `accessibility-audit` | scraping-fragile-target |
| `address-geocode` | free-stable-api |
| `address-parse` | commercial-stable-api |
| `address-validate` | free-stable-api |
| `age-verify` | pure-computation |
| `agent-trace-analyze` | commercial-stable-api |
| `aml-risk-score` | pure-computation |
| `annual-report-extract` | scraping-fragile-target |
| `api-docs-generate` | commercial-stable-api |
| `api-health-check` | free-stable-api |
| `api-mock-response` | commercial-stable-api |
| `au-company-data` | free-stable-api |
| `australian-company-data` | scraping-stable-target |
| `austrian-company-data` | scraping-stable-target |
| `backlink-check` | commercial-stable-api |
| `bank-bic-lookup` | pure-computation |
| `barcode-lookup` | free-stable-api |
| `base64-encode-url` | free-stable-api |
| `belgian-company-data` | free-stable-api |
| `beneficial-ownership-lookup` | commercial-stable-api |
| `blog-post-outline` | commercial-stable-api |
| `brand-mention-search` | commercial-stable-api |
| `brazilian-company-data` | free-stable-api |
| `business-day-check` | pure-computation |
| `business-license-check-se` | scraping-stable-target |
| `canadian-company-data` | scraping-stable-target |
| `changelog-generate` | commercial-stable-api |
| `charity-lookup-uk` | free-stable-api |
| `classify-text` | commercial-stable-api |
| `code-convert` | commercial-stable-api |
| `code-review` | commercial-stable-api |
| `commit-message-generate` | commercial-stable-api |
| `company-enrich` | scraping-fragile-target |
| `company-id-detect` | pure-computation |
| `company-industry-classify` | commercial-stable-api |
| `company-name-match` | pure-computation |
| `company-tech-stack` | scraping-fragile-target |
| `competitor-compare` | scraping-fragile-target |
| `container-track` | scraping-fragile-target |
| `context-window-optimize` | pure-computation |
| `contract-extract` | commercial-stable-api |
| `cookie-scan` | scraping-fragile-target |
| `country-tax-rates` | pure-computation |
| `country-trade-data` | free-stable-api |
| `credit-report-summary` | scraping-fragile-target |
| `credit-score-band` | pure-computation |
| `cron-explain` | pure-computation |
| `crontab-generate` | commercial-stable-api |
| `crypto-price` | free-stable-api |
| `csv-clean` | pure-computation |
| `csv-to-json` | pure-computation |
| `curl-to-code` | commercial-stable-api |
| `currency-convert` | free-stable-api |
| `customs-duty-lookup` | scraping-stable-target |
| `cve-lookup` | free-stable-api |
| `dangerous-goods-classify` | pure-computation |
| `danish-company-data` | free-stable-api |
| `data-protection-authority-lookup` | pure-computation |
| `data-quality-check` | pure-computation |
| `date-parse` | pure-computation |
| `deduplicate` | pure-computation |
| `dependency-audit` | free-stable-api |
| `diff-json` | pure-computation |
| `docker-hub-info` | free-stable-api |
| `dockerfile-generate` | commercial-stable-api |
| `docstring-generate` | commercial-stable-api |
| `domain-age-check` | free-stable-api |
| `domain-reputation` | free-stable-api |
| `email-deliverability-check` | free-stable-api |
| `email-draft` | commercial-stable-api |
| `email-reputation-score` | free-stable-api |
| `employer-review-summary` | scraping-fragile-target |
| `employment-cost-estimate` | pure-computation |
| `env-template-generate` | commercial-stable-api |
| `eori-validate` | free-stable-api |
| `error-explain` | commercial-stable-api |
| `estonian-company-data` | scraping-stable-target |
| `eu-ai-act-classify` | pure-computation |
| `eu-court-case-search` | scraping-stable-target |
| `eu-regulation-search` | scraping-stable-target |
| `eu-trademark-search` | scraping-stable-target |
| `exchange-rate` | free-stable-api |
| `fake-data-generate` | commercial-stable-api |
| `financial-year-dates` | pure-computation |
| `finnish-company-data` | free-stable-api |
| `flatten-json` | pure-computation |
| `flight-status` | commercial-stable-api |
| `food-safety-rating-uk` | free-stable-api |
| `forex-history` | free-stable-api |
| `french-company-data` | free-stable-api |
| `gdpr-fine-lookup` | scraping-stable-target |
| `gdpr-website-check` | free-stable-api |
| `github-actions-generate` | commercial-stable-api |
| `github-repo-analyze` | commercial-stable-api |
| `github-repo-compare` | free-stable-api |
| `github-user-profile` | free-stable-api |
| `gitignore-generate` | pure-computation |
| `google-search` | commercial-stable-api |
| `header-security-check` | free-stable-api |
| `holiday-calendar` | free-stable-api |
| `hs-code-lookup` | requires-domain-expertise |
| `html-to-pdf` | scraping-fragile-target |
| `http-to-curl` | pure-computation |
| `iban-to-bank` | free-stable-api |
| `id-number-validate` | pure-computation |
| `image-resize` | pure-computation |
| `image-to-text` | commercial-stable-api |
| `incoterms-explain` | pure-computation |
| `insolvency-check` | commercial-stable-api |
| `invoice-extract` | commercial-stable-api |
| `invoice-validate` | pure-computation |
| `ip-geolocation` | free-stable-api |
| `ip-risk-score` | free-stable-api |
| `irish-company-data` | scraping-stable-target |
| `isbn-validate` | pure-computation |
| `italian-company-data` | scraping-stable-target |
| `japanese-company-data` | scraping-stable-target |
| `job-board-search` | commercial-stable-api |
| `job-posting-analyze` | commercial-stable-api |
| `jsdoc-generate` | commercial-stable-api |
| `json-schema-validate` | pure-computation |
| `json-to-csv` | pure-computation |
| `json-to-pydantic` | pure-computation |
| `json-to-typescript` | pure-computation |
| `json-to-zod` | pure-computation |
| `jwt-decode` | pure-computation |
| `keyword-suggest` | free-stable-api |
| `landing-page-roast` | scraping-fragile-target |
| `language-detect` | pure-computation |
| `latvian-company-data` | scraping-stable-target |
| `lei-lookup` | free-stable-api |
| `license-compatibility-check` | pure-computation |
| `link-extract` | scraping-fragile-target |
| `linkedin-url-validate` | free-stable-api |
| `lithuanian-company-data` | scraping-stable-target |
| `llm-cost-calculate` | pure-computation |
| `llm-output-validate` | pure-computation |
| `log-parse` | pure-computation |
| `markdown-to-html` | pure-computation |
| `marketplace-fee-calculate` | pure-computation |
| `meeting-notes-extract` | commercial-stable-api |
| `meta-extract` | scraping-fragile-target |
| `mx-lookup` | free-stable-api |
| `name-parse` | pure-computation |
| `nginx-config-generate` | commercial-stable-api |
| `npm-package-info` | free-stable-api |
| `og-image-check` | free-stable-api |
| `openapi-generate` | commercial-stable-api |
| `openapi-validate` | pure-computation |
| `package-security-audit` | free-stable-api |
| `page-speed-test` | free-stable-api |
| `paid-api-preflight` | free-stable-api |
| `password-strength` | pure-computation |
| `patent-search` | scraping-fragile-target |
| `payment-reference-generate` | pure-computation |
| `pdf-extract` | commercial-stable-api |
| `phone-normalize` | pure-computation |
| `phone-type-detect` | pure-computation |
| `phone-validate` | pure-computation |
| `pii-redact` | commercial-stable-api |
| `polish-company-data` | scraping-stable-target |
| `port-check` | free-stable-api |
| `port-lookup` | pure-computation |
| `portuguese-company-data` | scraping-stable-target |
| `postal-code-lookup` | free-stable-api |
| `pr-description-generate` | commercial-stable-api |
| `price-compare` | scraping-fragile-target |
| `pricing-page-extract` | scraping-fragile-target |
| `privacy-policy-analyze` | scraping-fragile-target |
| `product-reviews-extract` | scraping-fragile-target |
| `product-search` | scraping-fragile-target |
| `prompt-compress` | commercial-stable-api |
| `prompt-optimize` | commercial-stable-api |
| `public-holiday-lookup` | free-stable-api |
| `pypi-package-info` | free-stable-api |
| `readme-generate` | commercial-stable-api |
| `receipt-categorize` | commercial-stable-api |
| `redirect-trace` | free-stable-api |
| `regex-explain` | commercial-stable-api |
| `regex-generate` | commercial-stable-api |
| `release-notes-generate` | commercial-stable-api |
| `resume-parse` | commercial-stable-api |
| `return-policy-extract` | scraping-fragile-target |
| `robots-txt-parse` | free-stable-api |
| `salary-benchmark` | scraping-fragile-target |
| `schema-infer` | pure-computation |
| `schema-migration-generate` | commercial-stable-api |
| `screenshot-url` | scraping-fragile-target |
| `secret-scan` | pure-computation |
| `sentiment-analyze` | commercial-stable-api |
| `seo-audit` | scraping-fragile-target |
| `sepa-xml-validate` | pure-computation |
| `serp-analyze` | commercial-stable-api |
| `shipping-cost-estimate` | pure-computation |
| `shipping-track` | free-stable-api |
| `sitemap-parse` | free-stable-api |
| `skill-extract` | commercial-stable-api |
| `skill-gap-analyze` | pure-computation |
| `social-post-generate` | commercial-stable-api |
| `social-profile-check` | free-stable-api |
| `spanish-company-data` | scraping-stable-target |
| `sql-explain` | commercial-stable-api |
| `sql-generate` | commercial-stable-api |
| `sql-optimize` | commercial-stable-api |
| `ssl-certificate-chain` | free-stable-api |
| `startup-domain-check` | free-stable-api |
| `stock-quote` | free-stable-api |
| `structured-scrape` | scraping-fragile-target |
| `summarize` | commercial-stable-api |
| `swift-message-parse` | pure-computation |
| `swift-validate` | pure-computation |
| `swiss-company-data` | scraping-stable-target |
| `tax-id-validate` | pure-computation |
| `tech-stack-detect` | scraping-fragile-target |
| `ted-procurement` | free-stable-api |
| `terms-of-service-extract` | scraping-fragile-target |
| `test-case-generate` | commercial-stable-api |
| `ticker-lookup` | free-stable-api |
| `timezone-lookup` | pure-computation |
| `timezone-meeting-find` | pure-computation |
| `token-count` | pure-computation |
| `tool-call-validate` | pure-computation |
| `translate` | commercial-stable-api |
| `trustpilot-score` | scraping-fragile-target |
| `uk-companies-house-officers` | commercial-stable-api |
| `unit-convert` | pure-computation |
| `uptime-check` | free-stable-api |
| `url-health-check` | free-stable-api |
| `url-to-markdown` | scraping-fragile-target |
| `url-to-text` | free-stable-api |
| `us-company-data` | free-stable-api |
| `vat-format-validate` | pure-computation |
| `vat-rate-lookup` | pure-computation |
| `vat-validate` | free-stable-api |
| `weather-lookup` | free-stable-api |
| `web-extract` | scraping-fragile-target |
| `webhook-test-payload` | commercial-stable-api |
| `website-carbon-estimate` | free-stable-api |
| `website-to-company` | commercial-stable-api |
| `whois-lookup` | free-stable-api |
| `work-permit-requirements` | pure-computation |
| `xml-to-json` | pure-computation |

</details>

---

## Section 3 — Class 2 inventory (fixture/schema mismatch)

**2 cases** remaining (dutch-company-data already fixed in SA.2b.b B5). All match the pattern "fixture uses `company_name`, schema requires registry code".

| slug | Missing required field | Fixture has | Schema requires |
|---|---|---|---|
| `estonian-company-data` | registry_code | company_name | registry_code |
| `spanish-company-data` | cif | company_name | cif |

**Pattern:** company-data capabilities whose description says "accepts registry number OR company name" but `input_schema.required` only lists the registry code. Fixtures were authored when only the company name was needed; schema tightened later.

**Remediation class:** per-manifest manual review. Each needs a real valid registry code (like dutch-company-data got `69599084` / ASML Holding). ~5 minutes each.

---

## Section 4 — Class 3 inventory (description/schema heuristic candidates)

**55 heuristic candidates**. The heuristic looks for "or X" phrases in descriptions where X doesn't match any `input_schema.properties` key. Signal quality is mixed — manual triage required.

### Sample (15 of 55)

| slug | Description excerpt (suspicious phrase) | Schema properties |
|---|---|---|
| `adverse-media-check` | or individual | entity_name,country |
| `aml-risk-score` | or company | entity_name,entity_type,country_code,sanctions_match,pep_match,adverse_media_mat |
| `api-docs-generate` | or natural language | openapi_spec,endpoint_description |
| `australian-company-data` | or fuzzy company | abn |
| `austrian-company-data` | or fuzzy company | fn_number |
| `belgian-company-data` | or fuzzy company | enterprise_number |
| `beneficial-ownership-lookup` | or control the | company_name,jurisdiction,company_number |
| `code-review` | or bugs | code,focus,language |
| `commit-message-generate` | or change descriptions | diff,style |
| `company-enrich` | or company name | domain |
| `company-industry-classify` | or website url | company_name,description |
| `credit-report-summary` | or company name | org_number |
| `crontab-generate` | or explain an | description |
| `curl-to-code` | or php | curl_command,target_language |
| `cz-company-data` | or fuzzy company | ico |

### Full list

<details><summary>Expand all 55</summary>

| slug | Description excerpt | Schema properties |
|---|---|---|
| `adverse-media-check` | or individual | entity_name,country |
| `aml-risk-score` | or company | entity_name,entity_type,country_code,sanctions_match,pep_match,adverse_media_mat |
| `api-docs-generate` | or natural language | openapi_spec,endpoint_description |
| `australian-company-data` | or fuzzy company | abn |
| `austrian-company-data` | or fuzzy company | fn_number |
| `belgian-company-data` | or fuzzy company | enterprise_number |
| `beneficial-ownership-lookup` | or control the | company_name,jurisdiction,company_number |
| `code-review` | or bugs | code,focus,language |
| `commit-message-generate` | or change descriptions | diff,style |
| `company-enrich` | or company name | domain |
| `company-industry-classify` | or website url | company_name,description |
| `credit-report-summary` | or company name | org_number |
| `crontab-generate` | or explain an | description |
| `curl-to-code` | or php | curl_command,target_language |
| `cz-company-data` | or fuzzy company | ico |
| `danish-company-data` | or fuzzy company | cvr_number |
| `data-quality-check` | or auto | data,rules |
| `dependency-audit` | or python dependencies | package_json,requirements_txt |
| `dutch-company-data` | or fuzzy company | kvk_number |
| `error-explain` | or stack trace | error,context,language |
| `estonian-company-data` | or fuzzy company | registry_code |
| `eu-court-case-search` | or hudoc | court,query |
| `finnish-company-data` | or fuzzy company | business_id |
| `french-company-data` | or fuzzy company | siren |
| `german-company-data` | or a fuzzy | hrb_number,court,company_name |
| `holiday-calendar` | or variable | country_code,year |
| `insolvency-check` | or winding | company_name,country_code,company_number |
| `invoice-extract` | or receipt image | url,base64 |
| `irish-company-data` | or fuzzy company | cro_number |
| `italian-company-data` | or fuzzy company | partita_iva |
| `japanese-company-data` | or fuzzy company | corporate_number |
| `latvian-company-data` | or fuzzy company | reg_number |
| `lithuanian-company-data` | or fuzzy company | company_code |
| `norwegian-company-data` | or fuzzy company | org_number |
| `paid-api-preflight` | or fraudulent endpoints | url |
| `patent-search` | or patent number | query,max_results |
| `phone-type-detect` | or premium rate | phone_number,country_code |
| `phone-validate` | or voip | phone_number,country_code |
| `polish-company-data` | or fuzzy company | krs_number |
| `portuguese-company-data` | or fuzzy company | nipc |
| `pr-description-generate` | or commit logs | diff,title |
| `product-reviews-extract` | or any review | url |
| `release-notes-generate` | or changelog | commits,version |
| `sanctions-check` | or entity is | name,country |
| `schema-infer` | or csv | data |
| `screenshot-url` | or viewport screenshot | url,wait_for,full_page,viewport_width,viewport_height |
| `skill-extract` | or cvs | text |
| `spanish-company-data` | or fuzzy company | cif |
| `summarize` | or one | text,style,max_length |
| `swiss-company-data` | or fuzzy company | uid |
| `test-case-generate` | or signature | language,include_edge_cases,function_description |
| `timezone-lookup` | or coordinates | query |
| `uk-company-data` | or fuzzy company | company_number |
| `uptime-check` | or down | url,method,timeout_ms |
| `weather-lookup` | or coordinates | city,latitude,longitude |

</details>

**Known false positives (sampled):** "or bugs" in code-review description, "or change descriptions" in commit-message-generate. Pure prose, not schema contracts.

**Known true positives (sampled):** all `*-company-data` capabilities whose description says "accepts fuzzy company name" but schema requires registry code. These should be flagged to Class 2 (fixture fix) once triaged.

**Remediation class:** manual triage per candidate. ~30 seconds for obvious false positives, ~5 minutes for real description/schema contract-fixes.

---

## Section 5 — Class 4 inventory (YAML/DB conflict, CRITICAL)

**238 conflicts** across 5 distinct fields. This is the most dangerous class: running the onboarding pipeline naively overwrites DB with stale YAML.

### Distribution by field

| Field | Count | CC's read of canonical side |
|---|---|---|
| `data_source_type→capability_type` | 77 | **Mapping incomplete.** YAML `data_source_type` has 4 values; DB `capability_type` has at least 5 (includes `ai_assisted` not in the onboard.ts mapping). Not drift — schema-evolution artifact. |
| `freshness_category` | 72 | **DB canonical.** DB values (`computed`, `reference-data`) are more accurate for algorithmic/computation capabilities than YAML's boilerplate `live-fetch` default. |
| `price_cents` | 61 | **DB canonical.** Values in DB are systematically lower than YAML (e.g. YAML=80, DB=5). Pattern matches admin repricing via `POST /v1/admin/reprice`. YAML values are stale authoring-time prices. |
| `data_source` | 23 | **Mixed / per-slug.** Some YAML values are specific vendor names ("OpenStreetMap Nominatim"); some DB values are generic descriptions ("Algorithmic (address parsing)"). Likely YAML reflects code reality; DB is outdated text. Inverted from other fields. |
| `transparency_tag` | 5 | **DB canonical.** YAML has `external_api` value which isn't even in the valid enum. DB has corrected it to `algorithmic`. YAML is broken; would fail `validateCapabilityStructure` gate. |

### Full list, grouped by field

#### data_source_type→capability_type (77)

<details><summary>Expand</summary>

| slug | yaml_value | db_value |
|---|---|---|
| `address-parse` | api (expects stable_api) | ai_assisted |
| `age-verify` | computed (expects deterministic) | stable_api |
| `agent-trace-analyze` | api (expects stable_api) | ai_assisted |
| `aml-risk-score` | computed (expects deterministic) | stable_api |
| `annual-report-extract` | api (expects stable_api) | ai_assisted |
| `api-docs-generate` | api (expects stable_api) | ai_assisted |
| `api-mock-response` | api (expects stable_api) | ai_assisted |
| `blog-post-outline` | api (expects stable_api) | ai_assisted |
| `brand-mention-search` | api (expects stable_api) | ai_assisted |
| `brazilian-company-data` | api (expects stable_api) | ai_assisted |
| `business-day-check` | computed (expects deterministic) | stable_api |
| `changelog-generate` | api (expects stable_api) | ai_assisted |
| `classify-text` | api (expects stable_api) | ai_assisted |
| `code-convert` | api (expects stable_api) | ai_assisted |
| `code-review` | api (expects stable_api) | ai_assisted |
| `commit-message-generate` | api (expects stable_api) | ai_assisted |
| `company-enrich` | api (expects stable_api) | ai_assisted |
| `context-window-optimize` | api (expects stable_api) | ai_assisted |
| `contract-extract` | api (expects stable_api) | ai_assisted |
| `crontab-generate` | api (expects stable_api) | ai_assisted |
| `curl-to-code` | api (expects stable_api) | ai_assisted |
| `danish-company-data` | api (expects stable_api) | ai_assisted |
| `dockerfile-generate` | api (expects stable_api) | ai_assisted |
| `docstring-generate` | api (expects stable_api) | ai_assisted |
| `email-draft` | api (expects stable_api) | ai_assisted |
| `env-template-generate` | api (expects stable_api) | ai_assisted |
| `error-explain` | api (expects stable_api) | ai_assisted |
| `estonian-company-data` | api (expects stable_api) | ai_assisted |
| `fake-data-generate` | api (expects stable_api) | ai_assisted |
| `finnish-company-data` | api (expects stable_api) | ai_assisted |
| `french-company-data` | api (expects stable_api) | ai_assisted |
| `github-actions-generate` | api (expects stable_api) | ai_assisted |
| `github-repo-analyze` | api (expects stable_api) | ai_assisted |
| `hs-code-lookup` | api (expects stable_api) | ai_assisted |
| `image-to-text` | api (expects stable_api) | ai_assisted |
| `invoice-extract` | api (expects stable_api) | ai_assisted |
| `job-posting-analyze` | api (expects stable_api) | ai_assisted |
| `jsdoc-generate` | api (expects stable_api) | ai_assisted |
| `language-detect` | computed (expects deterministic) | stable_api |
| `meeting-notes-extract` | api (expects stable_api) | ai_assisted |
| `nginx-config-generate` | api (expects stable_api) | ai_assisted |
| `norwegian-company-data` | api (expects stable_api) | ai_assisted |
| `openapi-generate` | api (expects stable_api) | ai_assisted |
| `pdf-extract` | api (expects stable_api) | ai_assisted |
| `phone-type-detect` | computed (expects deterministic) | stable_api |
| `phone-validate` | computed (expects deterministic) | stable_api |
| `pii-redact` | api (expects stable_api) | ai_assisted |
| `polish-company-data` | api (expects stable_api) | ai_assisted |
| `pr-description-generate` | api (expects stable_api) | ai_assisted |
| `prompt-compress` | api (expects stable_api) | ai_assisted |
| `prompt-optimize` | api (expects stable_api) | ai_assisted |
| `readme-generate` | api (expects stable_api) | ai_assisted |
| `receipt-categorize` | api (expects stable_api) | ai_assisted |
| `regex-explain` | api (expects stable_api) | ai_assisted |
| `regex-generate` | api (expects stable_api) | ai_assisted |
| `release-notes-generate` | api (expects stable_api) | ai_assisted |
| `resume-parse` | api (expects stable_api) | ai_assisted |
| `sanctions-check` | api (expects stable_api) | ai_assisted |
| `schema-migration-generate` | api (expects stable_api) | ai_assisted |
| `secret-scan` | api (expects stable_api) | ai_assisted |
| `sentiment-analyze` | api (expects stable_api) | ai_assisted |
| `social-post-generate` | api (expects stable_api) | ai_assisted |
| `sql-explain` | api (expects stable_api) | ai_assisted |
| `sql-generate` | api (expects stable_api) | ai_assisted |
| `sql-optimize` | api (expects stable_api) | ai_assisted |
| `summarize` | api (expects stable_api) | ai_assisted |
| `swiss-company-data` | api (expects stable_api) | scraping |
| `test-case-generate` | api (expects stable_api) | ai_assisted |
| `timezone-lookup` | computed (expects deterministic) | stable_api |
| `token-count` | api (expects stable_api) | ai_assisted |
| `translate` | api (expects stable_api) | ai_assisted |
| `uk-company-data` | api (expects stable_api) | ai_assisted |
| `us-company-data` | api (expects stable_api) | ai_assisted |
| `web-extract` | api (expects stable_api) | ai_assisted |
| `webhook-test-payload` | api (expects stable_api) | ai_assisted |
| `website-to-company` | computed (expects deterministic) | stable_api |
| `youtube-summarize` | scrape (expects scraping) | ai_assisted |

</details>

#### freshness_category (72)

<details><summary>Expand</summary>

| slug | yaml_value | db_value |
|---|---|---|
| `agent-trace-analyze` | live-fetch | computed |
| `api-docs-generate` | live-fetch | computed |
| `api-mock-response` | live-fetch | computed |
| `bank-bic-lookup` | computed | reference-data |
| `base64-encode-url` | live-fetch | computed |
| `blog-post-outline` | live-fetch | computed |
| `changelog-generate` | live-fetch | computed |
| `classify-text` | live-fetch | computed |
| `code-convert` | live-fetch | computed |
| `code-review` | live-fetch | computed |
| `commit-message-generate` | live-fetch | computed |
| `company-id-detect` | computed | reference-data |
| `context-window-optimize` | live-fetch | computed |
| `country-tax-rates` | computed | reference-data |
| `country-trade-data` | live-fetch | reference-data |
| `crontab-generate` | live-fetch | computed |
| `curl-to-code` | live-fetch | computed |
| `dangerous-goods-classify` | computed | reference-data |
| `data-protection-authority-lookup` | computed | live-fetch |
| `dependency-audit` | computed | live-fetch |
| `dockerfile-generate` | live-fetch | computed |
| `docstring-generate` | live-fetch | computed |
| `email-draft` | live-fetch | computed |
| `employment-cost-estimate` | computed | reference-data |
| `env-template-generate` | live-fetch | computed |
| `error-explain` | live-fetch | computed |
| `exchange-rate` | reference-data | live-fetch |
| `financial-year-dates` | computed | reference-data |
| `food-safety-rating-uk` | reference-data | live-fetch |
| `github-actions-generate` | live-fetch | computed |
| `hs-code-lookup` | live-fetch | reference-data |
| `html-to-pdf` | live-fetch | computed |
| `iban-validate` | computed | reference-data |
| `incoterms-explain` | computed | reference-data |
| `isbn-validate` | computed | reference-data |
| `iso-country-lookup` | computed | reference-data |
| `jsdoc-generate` | live-fetch | computed |
| `linkedin-url-validate` | computed | live-fetch |
| `llm-cost-calculate` | computed | reference-data |
| `marketplace-fee-calculate` | computed | reference-data |
| `nginx-config-generate` | live-fetch | computed |
| `openapi-generate` | reference-data | computed |
| `password-strength` | computed | reference-data |
| `pii-redact` | computed | live-fetch |
| `port-check` | computed | live-fetch |
| `port-lookup` | live-fetch | reference-data |
| `pr-description-generate` | live-fetch | computed |
| `prompt-compress` | live-fetch | computed |
| `prompt-optimize` | live-fetch | computed |
| `readme-generate` | live-fetch | computed |
| `regex-explain` | live-fetch | computed |
| `regex-generate` | live-fetch | computed |
| `release-notes-generate` | live-fetch | computed |
| `schema-migration-generate` | live-fetch | computed |
| `sentiment-analyze` | live-fetch | computed |
| `sepa-xml-validate` | computed | reference-data |
| `shipping-cost-estimate` | computed | live-fetch |
| `shipping-track` | computed | live-fetch |
| `social-post-generate` | live-fetch | computed |
| `sql-explain` | live-fetch | computed |
| `sql-generate` | live-fetch | computed |
| `sql-optimize` | live-fetch | computed |
| `summarize` | live-fetch | computed |
| `swift-message-parse` | computed | reference-data |
| `swift-validate` | computed | reference-data |
| `test-case-generate` | live-fetch | computed |
| `timezone-meeting-find` | computed | reference-data |
| `translate` | live-fetch | computed |
| `vat-format-validate` | computed | reference-data |
| `vat-rate-lookup` | computed | reference-data |
| `website-carbon-estimate` | computed | live-fetch |
| `work-permit-requirements` | computed | reference-data |

</details>

#### price_cents (61)

<details><summary>Expand</summary>

| slug | yaml_value | db_value |
|---|---|---|
| `aml-risk-score` | 10 | 2 |
| `australian-company-data` | 80 | 5 |
| `brazilian-company-data` | 80 | 5 |
| `changelog-generate` | 15 | 3 |
| `code-convert` | 15 | 5 |
| `container-track` | 25 | 5 |
| `context-window-optimize` | 10 | 3 |
| `country-tax-rates` | 10 | 2 |
| `csv-clean` | 10 | 2 |
| `cve-lookup` | 10 | 5 |
| `dangerous-goods-classify` | 10 | 2 |
| `danish-company-data` | 80 | 5 |
| `data-quality-check` | 10 | 2 |
| `deduplicate` | 10 | 2 |
| `dependency-audit` | 20 | 5 |
| `dockerfile-generate` | 10 | 5 |
| `docstring-generate` | 10 | 5 |
| `email-deliverability-check` | 10 | 5 |
| `email-draft` | 10 | 5 |
| `employment-cost-estimate` | 15 | 3 |
| `eori-validate` | 10 | 5 |
| `estonian-company-data` | 80 | 5 |
| `finnish-company-data` | 80 | 5 |
| `flight-status` | 10 | 5 |
| `french-company-data` | 80 | 5 |
| `github-repo-analyze` | 50 | 5 |
| `hs-code-lookup` | 10 | 3 |
| `image-to-text` | 10 | 5 |
| `insolvency-check` | 10 | 2 |
| `invoice-validate` | 15 | 2 |
| `jsdoc-generate` | 10 | 5 |
| `keyword-suggest` | 10 | 3 |
| `lei-lookup` | 10 | 5 |
| `nginx-config-generate` | 10 | 5 |
| `norwegian-company-data` | 80 | 5 |
| `package-security-audit` | 15 | 5 |
| `page-speed-test` | 10 | 5 |
| `pep-check` | 15 | 5 |
| `pii-redact` | 15 | 3 |
| `polish-company-data` | 80 | 5 |
| `pr-description-generate` | 10 | 5 |
| `prompt-compress` | 10 | 3 |
| `readme-generate` | 10 | 5 |
| `receipt-categorize` | 10 | 5 |
| `release-notes-generate` | 10 | 3 |
| `schema-migration-generate` | 10 | 5 |
| `secret-scan` | 5 | 2 |
| `sepa-xml-validate` | 10 | 2 |
| `skill-extract` | 10 | 3 |
| `social-profile-check` | 10 | 5 |
| `sql-generate` | 10 | 5 |
| `sql-optimize` | 10 | 5 |
| `startup-domain-check` | 15 | 5 |
| `swift-message-parse` | 15 | 2 |
| `tech-stack-detect` | 20 | 3 |
| `uk-companies-house-officers` | 10 | 5 |
| `uk-company-data` | 80 | 5 |
| `us-company-data` | 80 | 5 |
| `vat-validate` | 10 | 2 |
| `whois-lookup` | 10 | 5 |
| `work-permit-requirements` | 10 | 2 |

</details>

#### data_source (23)

<details><summary>Expand</summary>

| slug | yaml_value | db_value |
|---|---|---|
| `address-geocode` | OpenStreetMap Nominatim | Algorithmic (address parsing and geocoding heuristics) |
| `address-validate` | OpenStreetMap Nominatim | Algorithmic (address format validation) |
| `adverse-media-check` | Google (Serper.dev) + Claude Haiku classification | Dilisense Adverse Media API (235,000+ news sources) |
| `age-verify` | Strale age calculator (pure date math) | Algorithmic (date-of-birth calculation) |
| `aml-risk-score` | Strale AML scoring engine (FATF grey/black lists, EU high-ri | Algorithmic (risk scoring model, no external API) |
| `belgian-company-data` | Kruispuntbank van Ondernemingen (Belgian Crossroads Bank for | CBEAPI.be (Crossroads Bank for Enterprises) |
| `beneficial-ownership-lookup` | OpenOwnership Register + Companies House (UK) | Companies House PSC Register (UK Government) |
| `business-day-check` | Strale calendar engine + Nager.Date API | Algorithmic (business day calendar rules) |
| `dependency-audit` | Algorithmic (dependency tree analysis, no external data) | npm Registry + PyPI (free public APIs) |
| `ecb-interest-rates` | FRED (fred.stlouisfed.org), mirroring ECB Statistical Data W | European Central Bank Statistical Data Warehouse (ECB SDW) |
| `german-company-data` | Handelsregister (German Commercial Register) via northdata.c | Handelsregister (German Commercial Register) |
| `holiday-calendar` | Nager.Date API (date.nager.at) | Nager.Date API (public holiday data) |
| `insolvency-check` | Companies House (UK) | Companies House (UK Government) |
| `language-detect` | franc (trigram language detection) | Algorithmic (character frequency analysis) |
| `license-compatibility-check` | SPDX License List | SPDX License Reference Data (computed) |
| `package-security-audit` | OSV.dev + deps.dev + npm Registry + PyPI | OSV.dev (Google Open Source Vulnerabilities Database) |
| `paid-api-preflight` | HTTP fetch (endpoint reachability + payment protocol header  | Algorithmic (HTTP header and protocol inspection) |
| `pep-check` | OpenSanctions API (opensanctions.org) | Dilisense PEP Database (politically exposed persons screenin |
| `phone-type-detect` | libphonenumber-js (Google libphonenumber port) | Algorithmic (libphonenumber metadata) |
| `phone-validate` | libphonenumber-js (Google libphonenumber port) | Algorithmic (libphonenumber validation) |
| `sanctions-check` | OFAC SDN List (US Treasury), EU Consolidated Sanctions List, | Dilisense AML Database (OFAC, EU, UN, UK OFSI + 120 sources) |
| `secret-scan` | Algorithmic (regex pattern matching for secrets/credentials) | Algorithmic (regex pattern matching) |
| `timezone-lookup` | IANA timezone database + Intl API | Algorithmic (IANA timezone database) |

</details>

#### transparency_tag (5)

<details><summary>Expand</summary>

| slug | yaml_value | db_value |
|---|---|---|
| `address-geocode` | external_api | algorithmic |
| `address-validate` | external_api | algorithmic |
| `beneficial-ownership-lookup` | external_api | algorithmic |
| `holiday-calendar` | external_api | algorithmic |
| `insolvency-check` | external_api | algorithmic |

</details>

**Remediation class per field:**

| Field | Fix direction | Remediation type |
|---|---|---|
| `price_cents` | Accept DB as canonical; rewrite YAML to match DB | Mechanical script |
| `freshness_category` | Accept DB as canonical; rewrite YAML to match DB | Mechanical script |
| `data_source_type→capability_type` | Extend `DST_TO_CAP_TYPE` mapping in onboard.ts to include `ai_assisted`; relax the cross-check | Code fix |
| `data_source` | Per-slug manual review (YAML may or may not be canonical) | Manual triage |
| `transparency_tag` | Accept DB as canonical; fix invalid YAML values (`external_api` → proper enum) | Per-slug fix, 5 slugs |

---

## Section 6 — Class 5 structural findings (gate inconsistencies)

### Finding 5.1 — `transparency_tag` checked at DB but not at manifest validation

- `validateCapabilityStructure()` in `onboarding-gates.ts` checks `transparencyTag` against the enum `['algorithmic', 'ai_generated', 'mixed', null]`.
- `validateManifest()` in `scripts/onboard.ts` does NOT check `transparency_tag` at all.
- Result: a manifest with `transparency_tag: "external_api"` passes `validateManifest()`, gets inserted with that invalid value, then fails `validateCapabilityStructure()` post-insert.
- 5 manifests currently carry `transparency_tag: "external_api"` (per Class 4 Section 5). The onboarding-gates check has never fired on these (they were probably inserted via seed.ts before the gate existed, or via an admin override).

### Finding 5.2 — `data_source_type` required in manifest but has no DB validation

- `validateManifest()` requires `data_source_type` and transforms it via `dataSourceTypeToCapType()` before insert.
- `validateCapabilityStructure()` does NOT check `capabilityType` at all.
- The transform's 4→at-least-5 mapping (`api | scrape | computed | reference` → `stable_api | scraping | deterministic | ai_assisted | ...`) means the DB can hold `capability_type` values that can never be round-tripped back to a valid YAML `data_source_type`. All 77 `ai_assisted` DB rows are un-round-trippable.

### Finding 5.3 — `is_free_tier` validated at DB-row but not at manifest

- `validateCapabilityStructure()` checks `isFreeTier` to validate `priceCents` (free-tier allows 0, non-free-tier requires >0).
- `validateManifest()` doesn't check `is_free_tier` at all — just defaults it to false at insert.

### Pattern

**Two validators, drifting in coverage.** `validateManifest()` (pre-insert, file-level) and `validateCapabilityStructure()` (post-insert, DB-row-level) check different field sets. Fields checked only in the post-insert validator mean bad manifests get inserted, then fail on the next onboard run after code change picks up the mismatch. **Recommendation: unify into a single validator** that runs both at file-parse time and at post-insert re-validation.

---

## Section 7 — Remediation scoping

### Priority order

1. **Class 5 — Code fix first** (unblocks everything else). Extend `DST_TO_CAP_TYPE` mapping OR remove the check entirely (DB is canonical). Add `transparency_tag` check to `validateManifest()`. ~20 lines of code.

2. **Class 4 — freshness_category + price_cents + transparency_tag — Mechanical DB-to-YAML backfill** (133 slugs). A script reads each affected slug's DB value and rewrites the YAML. Takes minutes once Class 5 is fixed.

3. **Class 1 — maintenance_class backfill** (242 slugs). Mechanical: DB has the value, YAML needs it. Takes minutes.

4. **Class 2 — Fixture fixes** (2 slugs). Manual. Pick a real registry code per slug. ~10 minutes total.

5. **Class 3 — Description triage** (55 candidates, mostly false positives). Per-candidate manual review. ~1 hour total.

6. **Class 4 — data_source manual triage** (23 slugs). Case-by-case decision between vendor name (YAML) vs. generic description (DB). ~30 minutes.

7. **Orphans** (32 DB rows without manifests). Decide per-slug: delete deactivated orphans, author manifests for still-active orphans.

### Not proposed (in this report)

- Actual remediation scripts or code. This report is inventory only.

---

## Section 8 — Implications for SA.2b.c (PII backfill)

### Scope

**292 of 307 DB rows** have `processes_personal_data IS NULL` and need backfill. After the top-15 in SA.2b.b, **292 remain** (the count matches because none of the top-15 are in the null set anymore — they're in the 11 true / 4 false buckets).

### Blocker: running the onboarding pipeline overwrites DB with stale YAML

The `onboard.ts --backfill` path (used successfully in SA.2b.b for the top-15) writes from YAML to DB. For the remaining 260 slugs, this would:
- **Revert price_cents** on 61 slugs to stale YAML values (DB has correct prices from admin repricing).
- **Revert freshness_category** on 72 slugs (DB has correct values; YAML defaults).
- **Break transparency_tag** on 5 slugs (YAML has invalid enum; DB has correct values).
- **Fail validateManifest()** on 242 slugs due to missing `maintenance_class`.
- **Fail validateManifest()** on 2 slugs (Class 2 fixture mismatch).

**Naive SA.2b.c execution would cause data loss on ~133 slugs and outright fail on ~244 slugs.**

### Three paths forward for SA.2b.c

#### Path A — Fix Class 1 + Class 4, then run pipeline (clean but slow)

1. Extend validator (Class 5 fix) — ~20 lines.
2. Write DB→YAML backfill script for `maintenance_class`, `price_cents`, `freshness_category`, `transparency_tag` — reads DB, rewrites YAML.
3. Commit the regenerated manifests.
4. Run `onboard.ts --backfill` on the 260 remaining slugs to write PII columns.

**Pros:** preserves Rule 3 (DEC-20260320-B — pipeline authority). Produces clean aligned manifest+DB state.
**Cons:** ~300 YAML files changed in one commit; requires careful PR review.

#### Path B — Direct SQL PII backfill, skip pipeline (fast, bypass Rule 3)

Same pattern as SA.2b.b's Option B (rejected there, used successfully for SA.2a migrations):

```sql
-- For each of the 260 slugs, classify and set:
UPDATE capabilities SET processes_personal_data = <bool>, personal_data_categories = <text[]> WHERE slug = '<slug>';
```

**Pros:** fast, no manifest churn, no risk of Class 4 data loss.
**Cons:** violates Rule 3. Leaves 275 manifests still drifted.

#### Path C — Hybrid: Path A for high-value slugs, Path B for long tail (RECOMMENDED)

1. Fix Class 5 (validator code — ~20 lines).
2. Regenerate YAMLs for Class 1 + Class 4 mechanical fields (maintenance_class, price_cents, freshness_category, transparency_tag).
3. Run `onboard.ts --backfill` on slugs with regenerated YAMLs (gets them to full alignment + PII backfill in one call).
4. Direct SQL backfill PII for remaining slugs where manifest isn't worth cleaning now (e.g. orphans, one-off utility capabilities).
5. Track Class 2/Class 3 manual triage separately.

### Recommendation

**Path C.** It respects Rule 3 where manifests are high-signal (customer-facing compliance capabilities) and pragmatically bypasses it where the manifest/DB round-trip doesn't justify the cleanup effort (orphans, pure-utility capabilities).

**Blocker to resolve before SA.2b.c starts:** Class 5 Finding 5.2 (the `DST_TO_CAP_TYPE` mapping). Without fixing it, any `ai_assisted` capability fails the mapping check and the pipeline can't proceed. This is the highest-priority single fix.

---

## Appendix A — Orphan DB rows (no manifest)

**32 DB rows** have no corresponding `manifests/*.yaml`. These were likely inserted via `seed.ts` before the manifest pattern was adopted, or are deactivated but not cleaned.

<details><summary>Expand</summary>

| slug |
|---|
| `amazon-price` |
| `approval-security-check` |
| `contract-verify-check` |
| `council-tax-lookup` |
| `email-pattern-discover` |
| `ens-resolve` |
| `ens-reverse-lookup` |
| `fear-greed-index` |
| `gas-price-check` |
| `hong-kong-company-data` |
| `indian-company-data` |
| `officer-search` |
| `phishing-site-check` |
| `protocol-fees-lookup` |
| `protocol-tvl-lookup` |
| `singapore-company-data` |
| `stablecoin-flow-check` |
| `stamp-duty-calculate` |
| `token-security-check` |
| `uk-crime-stats` |
| `uk-deprivation-index` |
| `uk-epc-rating` |
| `uk-flood-risk` |
| `uk-rental-yield` |
| `uk-sold-prices` |
| `uk-transport-access` |
| `vasp-non-compliant-check` |
| `vasp-verify` |
| `wallet-age-check` |
| `wallet-balance-lookup` |
| `wallet-risk-score` |
| `wallet-transactions-lookup` |

</details>

**Observation:** the orphan list includes several deactivated Web3 capabilities (`ens-*`, `wallet-*`, `protocol-*`, `gas-price-check`, `fear-greed-index`) and UK-dataset capabilities (`uk-*`, `council-tax-lookup`, `stamp-duty-calculate`). Most are probably deactivated or deprecated; a cleanup pass (DELETE from capabilities, archive slug list) would reduce noise.

**Recommendation:** not in SA.2b.c scope. Separate ticket for "capability-deactivation cleanup."

---

## Appendix B — Methodology

Generated by `apps/api/scripts/drift-audit.mjs` (session-scoped, not committed). Cross-references:

- `manifests/*.yaml` → parsed via `js-yaml`
- `capabilities` DB rows → fetched live via `postgres` client
- Required manifest fields → extracted from `validateManifest()` in `scripts/onboard.ts:115-204`
- Transparency tag enum → extracted from `onboarding-gates.ts:VALID_TRANSPARENCY_TAGS`

Class 3 (description/schema heuristic) uses a regex-based "or X" phrase detector. Includes known false positives. Confidence: low for individual flags, medium as a candidate set.

Class 5 (gate inconsistencies) identified by manual comparison of `validateManifest()` (pre-insert) vs `validateCapabilityStructure()` (post-insert).

---

*End of manifest drift inventory. Next: SA.2b.c path chosen, Class 5 fix committed, then backfill executed per chosen path.*