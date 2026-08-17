# Bolagsverket API Migration Audit
**Date:** 2026-04-09 (Stockholm time)
**Author:** Claude Code (Opus)
**Status:** Audit only — no code changes

## Section 1 — Current State Inventory

### 1.1 swedish-company-data

- **File:** `apps/api/src/capabilities/swedish-company-data.ts`
- **Price:** 80 cents (€0.80)
- **Data source (DB):** "Bolagsverket (Swedish Companies Registration Office)" — note: misleading, actual source is Allabolag.se
- **Data flow:**
  1. Input: `org_number` (Swedish 10-digit, with or without hyphen) or natural language
  2. If no org number: Claude Haiku extracts company name → Allabolag.se search (`/what/{name}`) → regex extracts org number from results
  3. Browserless renders `allabolag.se/{org_number_digits}`
  4. Regex parser (`parseHtml`) extracts: company_name (from `<title>`), revenue, profit, employees, fiscal_year from "Bokslut och nyckeltal" section
  5. If regex fails: Claude Haiku LLM fallback parses the page text
- **Output schema:**

| Field | Type | Source |
|-------|------|--------|
| company_name | string | `<title>` tag regex |
| org_number | string | Input passthrough |
| revenue_sek | number/null | "Omsättning" line, ×1000 if "Belopp i 1000" |
| employees | number/null | "Antal anställda" line |
| profit_sek | number/null | "Resultat efter finansnetto" line, ×1000 |
| fiscal_year | string/null | "2024-12" pattern after "Bokslut" |
| vat_number | string/null | Added by VAT enrichment module (not from Allabolag) |
| jurisdiction | string/null | Added by enrichment module |

- **Test suites:** known_answer:5, schema_check:1, negative:1, edge_case:1, dependency_health:1, known_bad:1, piggyback:1
- **Limitations:** Allabolag.se sometimes blocks Browserless (bot detection). Financial data is "Belopp i 1000" (thousands) requiring multiplication. No board members, no registered address, no SNI codes, no company type, no F-skatt status.

### 1.2 annual-report-extract

- **File:** `apps/api/src/capabilities/annual-report-extract.ts` (283 lines)
- **Price:** 100 cents (€1.00)
- **Data source (DB):** "Claude API (financial document analysis)"
- **Data flow:**
  1. Input: `org_number` + optional `year`
  2. Browserless navigates to Allabolag.se annual report PDF download page
  3. Downloads PDF via Browserless screenshot/fetch
  4. Sends PDF (base64) or page text to Claude Haiku for structured extraction
  5. Claude extracts financial data per the extraction prompt
- **Output schema:**

| Field | Type | Source |
|-------|------|--------|
| company_name | string | LLM extraction from PDF |
| org_number | string | Input passthrough |
| fiscal_year | string | LLM extraction |
| revenue_sek | number/null | LLM: "Nettoomsättning" |
| profit_sek | number/null | LLM: "Årets resultat" |
| operating_profit_sek | number/null | LLM: "Rörelseresultat" |
| total_assets_sek | number/null | LLM: "Summa tillgångar" |
| equity_sek | number/null | LLM: "Eget kapital" |
| number_of_employees | number/null | LLM: "Medelantal anställda" |
| board_members | string[] | LLM: "Styrelse" section |
| auditor | string/null | LLM extraction |
| dividend_sek | number/null | LLM: "Utdelning" |
| key_ratios | object | LLM-derived (soliditet, ROE, margin) |

- **Test suites:** known_answer:1, schema_check:1, negative:1, edge_case:1, dependency_health:1, known_bad:1
- **Limitations:** Depends on Browserless + Claude. PDF download may fail. Pre-digital companies have no electronic filings. LLM extraction is non-deterministic.

### 1.3 credit-report-summary

- **File:** `apps/api/src/capabilities/credit-report-summary.ts`
- **Price:** 100 cents (€1.00)
- **Data source (DB):** "Allabolag.se (Swedish credit data aggregator)"
- **Data flow:**
  1. Input: `org_number` or `company_name`
  2. If name: Claude Haiku extracts company name → Allabolag.se search → org number
  3. Browserless renders `allabolag.se/{org_number}`
  4. Claude Haiku extracts structured credit data from page text
- **Output schema:**

| Field | Type | Source |
|-------|------|--------|
| company_name | string | LLM extraction |
| org_number | string | Input/search |
| credit_rating | string/null | LLM: "AAA/AA/A/B/C" from Allabolag |
| credit_limit_sek | number/null | LLM extraction |
| risk_indicator | string/null | LLM: "low/medium/high" |
| revenue_sek | number/null | LLM extraction |
| profit_sek | number/null | LLM extraction |
| employees | number/null | LLM extraction |
| registered_address | string/null | LLM extraction |
| industry | string/null | LLM extraction |
| fiscal_year | string/null | LLM extraction |
| board_members | string[] | LLM extraction |
| total_assets_sek | number/null | LLM extraction |
| equity_sek | number/null | LLM extraction |

- **Test suites:** known_answer:1, schema_check:1, negative:1, edge_case:1, dependency_health:1, known_bad:1
- **Limitations:** Credit rating is Allabolag's proprietary metric, not from Bolagsverket. Entirely LLM-dependent extraction.

### 1.4 business-license-check-se

- **File:** `apps/api/src/capabilities/business-license-check-se.ts`
- **Price:** 15 cents (€0.15)
- **Data source (DB):** "Headless browser + Swedish authority registries"
- **Data flow:**
  1. Input: `org_number` or company name
  2. If name: Claude Haiku → Allabolag search → org number
  3. Browserless renders `allabolag.se/{org_number}`
  4. Claude Haiku extracts registration/license data
- **Output schema:**

| Field | Type | Source |
|-------|------|--------|
| company_name | string | LLM extraction |
| org_number | string | Input |
| registration_status | string | LLM: "active/dissolved/..." |
| company_type | string | LLM: "AB/HB/KB/EF/..." |
| registered_date | string/null | LLM extraction |
| sni_codes | array | LLM: SNI code + description pairs |
| f_skatt | boolean/null | LLM: "F-skattsedel Ja/Nej" |
| moms_registered | boolean/null | LLM: "Momsregistrerad Ja/Nej" |
| employer_registered | boolean/null | LLM: "Arbetsgivare Ja/Nej" |
| registered_address | string/null | LLM extraction |
| board_members | string[] | LLM: "Styrelse" section |

- **Test suites:** known_answer:1, schema_check:1, negative:1, edge_case:1, dependency_health:1, known_bad:1
- **Limitations:** F-skatt, moms, employer status are from Allabolag (which mirrors Skatteverket data). Board members from Allabolag (which mirrors Bolagsverket).

---

## Section 2 — Bolagsverket API Coverage Research

### 2.1 API overview

- **Portal:** [bolagsverket.se/apierochoppnadata](https://bolagsverket.se/apierochoppnadata.2531.html)
- **Developer portal:** WSO2-based (login required after agreement)
- **Authentication:** OAuth 2.0 — client_id + client_secret received after signing agreement
- **Transport:** REST over HTTPS, JSON responses
- **Rate limit:** 20 requests/second
- **Average response time:** <200ms
- **Current version:** 4.6 (released 2026, adds new information fields)
- **Pricing:** UNKNOWN — requires agreement with Bolagsverket. Likely free for public data per EU Open Data Directive (SE transposition). The "valuable datasets" API is explicitly free under the HVD regulation.
- **Test environment:** Available after agreement, with test companies and test persons

### 2.2 Available endpoints

| Endpoint | Description | Data returned |
|----------|-------------|---------------|
| **Företagsinformation API** | Company information retrieval | Name, status, address, registration date, legal form, SNI codes, business description |
| **Värdefulla datamängder API** (HVD) | High-value datasets (EU Open Data) | Company register data for all legal entities — free, open access |
| **Årsredovisningsinformation API** | Annual report information and status | Filing status, availability of annual reports, iXBRL documents |
| **SSBTGO API** | Basic organizational data for public activities | Public sector organization data |

### 2.3 Company information fields (from search results + Signicat docs)

| Category | Fields available |
|----------|-----------------|
| **Basic** | Company name, org number, legal form, status, registration date |
| **Address** | Registered address (street, postal code, city) |
| **Industry** | SNI codes with descriptions |
| **Ownership** | Ownership structure (via separate endpoint) |
| **UBO** | Ultimate Beneficial Owners |
| **Roles** | Board members, CEO, auditor, deputies |
| **Signatory** | Authorization and signatory rights |

### 2.4 Annual report (iXBRL) data

Bolagsverket accepts and stores annual reports in iXBRL format. The taxonomy is published at [taxonomier.se](https://taxonomier.se/). Key K2/K3 tags:

| Financial item | Swedish term | XBRL namespace | Notes |
|---------------|-------------|----------------|-------|
| Net revenue | Nettoomsättning | se-gen-base | K2 + K3 |
| Operating profit | Rörelseresultat | se-gen-base | K2 + K3 |
| Net income | Årets resultat | se-gen-base | K2 + K3 |
| Total assets | Summa tillgångar | se-gen-base | K2 + K3 |
| Equity | Eget kapital | se-gen-base | K2 + K3 |
| Avg employees | Medelantal anställda | se-gen-base | K2 + K3 |
| Fiscal period | Period start/end | xbrli:context | Standard XBRL |

**Note:** Exact element IDs require access to the taxonomy package from taxonomier.se. The HTML documentation was behind a CAPTCHA and could not be fetched programmatically during this audit.

### 2.5 Coverage gaps

| Data point | Bolagsverket | Notes |
|-----------|-------------|-------|
| Credit rating | **NO** | Proprietary to Allabolag/UC/Bisnode |
| Credit limit | **NO** | Proprietary |
| Risk indicator | **NO** | Proprietary |
| F-skatt status | **NO** | Skatteverket data, not Bolagsverket |
| Moms registered | **NO** | Skatteverket data |
| Employer registered | **NO** | Skatteverket data |
| Key ratios (ROE, margin) | **NO** | Derived from financials — we compute |
| Dividend per share | **UNKNOWN** | May be in iXBRL if filed |

### 2.6 Access requirements

1. Sign agreement with Bolagsverket (digital form on their website)
2. Receive client_id + client_secret for test environment
3. Integrate and test against test environment
4. Request production access after successful integration testing
5. **Timeline:** UNKNOWN — typical Swedish government API onboarding is 1-4 weeks

---

## Section 3 — Field-Level Migration Table

### 3.1 swedish-company-data

| Current field | Current source | Bolagsverket source | Transform needed | Risk |
|--------------|---------------|-------------------|-----------------|------|
| company_name | Allabolag `<title>` regex | Företagsinformation API → name | None | Low |
| org_number | Input passthrough | Input passthrough | None | Low |
| revenue_sek | Allabolag "Omsättning" ×1000 | iXBRL tag: Nettoomsättning | Parse from iXBRL, unit handling | Medium — requires annual report API access |
| employees | Allabolag "Antal anställda" | iXBRL tag: Medelantal anställda | Parse from iXBRL | Medium — requires annual report API |
| profit_sek | Allabolag "Resultat" ×1000 | iXBRL tag: Årets resultat | Parse from iXBRL | Medium — requires annual report API |
| fiscal_year | Allabolag "2024-12" pattern | iXBRL context period | Parse from iXBRL context | Medium |
| vat_number | VAT enrichment module | VAT enrichment (unchanged) | None | Low |
| jurisdiction | Enrichment module | Enrichment (unchanged) | None | Low |

### 3.2 annual-report-extract

| Current field | Current source | Bolagsverket source | Transform needed | Risk |
|--------------|---------------|-------------------|-----------------|------|
| company_name | LLM from PDF | Företagsinformation API | Direct | Low |
| org_number | Input | Input | None | Low |
| fiscal_year | LLM from PDF | iXBRL context period | Parse | Low |
| revenue_sek | LLM: "Nettoomsättning" | iXBRL tag | Direct | Low |
| profit_sek | LLM: "Årets resultat" | iXBRL tag | Direct | Low |
| operating_profit_sek | LLM: "Rörelseresultat" | iXBRL tag | Direct | Low |
| total_assets_sek | LLM: "Summa tillgångar" | iXBRL tag | Direct | Low |
| equity_sek | LLM: "Eget kapital" | iXBRL tag | Direct | Low |
| number_of_employees | LLM: "Medelantal anställda" | iXBRL tag | Direct | Low |
| board_members | LLM from PDF | Företagsinformation API → roles | Direct | Low |
| auditor | LLM from PDF | Företagsinformation API → roles | Direct | Low |
| dividend_sek | LLM from PDF | iXBRL tag (if filed) | UNKNOWN | Medium — may not be in all filings |
| key_ratios | LLM-derived | DERIVED from other fields | Compute in code | Low |

### 3.3 credit-report-summary

| Current field | Current source | Bolagsverket source | Transform needed | Risk |
|--------------|---------------|-------------------|-----------------|------|
| company_name | LLM extraction | Företagsinformation API | Direct | Low |
| org_number | Input | Input | None | Low |
| credit_rating | LLM from Allabolag | **UNAVAILABLE** | N/A | High — proprietary |
| credit_limit_sek | LLM from Allabolag | **UNAVAILABLE** | N/A | High — proprietary |
| risk_indicator | LLM from Allabolag | **UNAVAILABLE** | N/A | High — proprietary |
| revenue_sek | LLM extraction | iXBRL tag | Direct | Low |
| profit_sek | LLM extraction | iXBRL tag | Direct | Low |
| employees | LLM extraction | iXBRL tag | Direct | Medium |
| registered_address | LLM extraction | Företagsinformation API → address | Direct | Low |
| industry | LLM extraction | Företagsinformation API → SNI codes | Map SNI to description | Low |
| fiscal_year | LLM extraction | iXBRL context | Parse | Low |
| board_members | LLM extraction | Företagsinformation API → roles | Direct | Low |
| total_assets_sek | LLM extraction | iXBRL tag | Direct | Low |
| equity_sek | LLM extraction | iXBRL tag | Direct | Low |

### 3.4 business-license-check-se

| Current field | Current source | Bolagsverket source | Transform needed | Risk |
|--------------|---------------|-------------------|-----------------|------|
| company_name | LLM extraction | Företagsinformation API → name | Direct | Low |
| org_number | Input | Input | None | Low |
| registration_status | LLM from Allabolag | Företagsinformation API → status | Map status codes | Low |
| company_type | LLM from Allabolag | Företagsinformation API → legal form | Map legal form codes | Low |
| registered_date | LLM from Allabolag | Företagsinformation API → registration date | Direct | Low |
| sni_codes | LLM from Allabolag | Företagsinformation API → SNI codes | Direct | Low |
| f_skatt | LLM from Allabolag | **UNAVAILABLE** — Skatteverket data | N/A | High |
| moms_registered | LLM from Allabolag | **UNAVAILABLE** — Skatteverket data | N/A | High |
| employer_registered | LLM from Allabolag | **UNAVAILABLE** — Skatteverket data | N/A | High |
| registered_address | LLM from Allabolag | Företagsinformation API → address | Direct | Low |
| board_members | LLM from Allabolag | Företagsinformation API → roles | Direct | Low |

---

## Section 4 — Unavailable Fields and Recommendations

### 4.1 credit_rating, credit_limit_sek, risk_indicator (credit-report-summary)

**Why unavailable:** Credit ratings are proprietary products from credit agencies (UC, Bisnode/D&B, Allabolag). Bolagsverket is a registry, not a credit bureau.

**Options:**
- (a) **Drop** — remove credit rating fields, rename capability to "financial-summary-se"
- (b) **Derive** — compute a basic risk score from financial ratios (equity ratio, profit margin). Not a credit rating but provides similar directional signal
- (c) **Source elsewhere** — UC API (paid, commercial), Bisnode/D&B API (paid, commercial), or keep Allabolag for credit fields only (hybrid approach)

**Recommendation:** Option (b) for v1 — derive basic risk indicators from Bolagsverket financial data. Rename the capability to avoid implying we provide credit bureau data. Consider (c) as a v2 enhancement if customers need official credit ratings.

### 4.2 f_skatt, moms_registered, employer_registered (business-license-check-se)

**Why unavailable:** These are Skatteverket (Swedish Tax Agency) registrations, not Bolagsverket data. Allabolag aggregates both sources.

**Options:**
- (a) **Drop** — remove tax registration fields
- (b) **Derive** — not possible (tax registration is binary, not derivable)
- (c) **Source elsewhere** — Skatteverket has no public API. Two alternatives:
  - Keep Allabolag as a secondary source for these 3 fields only (hybrid: Bolagsverket for registry + Allabolag for tax status)
  - Use Ratsit.se or similar aggregator that provides the same data

**Recommendation:** Option (c) hybrid — use Bolagsverket for all registry data, keep a lightweight Allabolag/Ratsit check for the 3 tax registration fields only. This eliminates the Browserless dependency for the main data but keeps accuracy for tax status.

### 4.3 dividend_sek (annual-report-extract)

**Why uncertain:** Dividends may or may not be tagged in iXBRL filings. Depends on whether the company's accountant tagged it.

**Options:**
- (a) **Drop** — mark as optional/rare in field reliability
- (b) **Derive** — not derivable from other fields
- (c) **Source elsewhere** — Allabolag or the actual PDF as fallback

**Recommendation:** Option (a) — mark as `rare` in field reliability. Available when the iXBRL filing includes it, null otherwise.

---

## Section 5 — Test Suite Implications

### 5.1 swedish-company-data

- **known_answer tests (5):** Will need new expected values — Bolagsverket returns different field names/formats than Allabolag scraping
- **dependency_health test (1):** Must change from Allabolag.se to Bolagsverket API endpoint
- **schema_check (1):** Output schema unchanged if we keep the same field names
- **New edge cases needed:**
  - Company with no annual report filed (new startup)
  - Dissolved company (Bolagsverket may return different status codes)
  - Enskild firma (sole proprietorship) vs Aktiebolag
  - Ideell förening (non-profit association)

### 5.2 annual-report-extract

- **known_answer (1):** Must change to verify iXBRL parsing instead of LLM extraction
- **New edge cases:**
  - Company that files on paper only (pre-digital, ~2018 cutoff for mandatory electronic filing)
  - K2 vs K3 accounting standard (different taxonomy tags)
  - Company with financial year not ending Dec 31 (brutet räkenskapsår)
  - Missing iXBRL fields (company filed but accountant didn't tag everything)

### 5.3 credit-report-summary

- **All suites need rewriting** if credit fields are dropped/derived
- **New edge cases:**
  - Company with negative equity (common in early-stage companies)
  - Company with zero revenue (holding companies)

### 5.4 business-license-check-se

- **known_answer (1):** Must change expected shape
- **dependency_health (1):** Two endpoints if hybrid (Bolagsverket + Skatteverket source)
- **New edge cases:**
  - Company with no SNI codes (newly registered)
  - Company in liquidation (special status in Bolagsverket)
  - Foreign branch registered in Sweden (filial)

---

## Section 6 — Open Questions and Unknowns

1. **Bolagsverket agreement timeline:** How long from application to production API keys? Blocks all Phase 2 work.
2. **Pricing:** Is the Företagsinformation API free under HVD regulation, or paid? The "valuable datasets" API is explicitly free, but unclear if it covers the same data.
3. **Annual report retrieval:** Can we download iXBRL files via the Årsredovisningsinformation API, or does it only provide filing status? The endpoint name suggests information *about* annual reports, not the reports themselves.
4. **iXBRL availability cutoff:** From which filing year are annual reports available in iXBRL? Likely 2018-2019 for mandatory electronic filing, but historical coverage is unknown.
5. **Exact XBRL element IDs:** The taxonomy documentation at taxonomier.se was behind a CAPTCHA. Need manual access to download the taxonomy package and extract exact tag names for each financial field.
6. **Board member data format:** Does the Företagsinformation API return board members in a structured format (name, role, appointment date) or just names? The Signicat docs mention "Roles" as a category but don't specify the schema.
7. **Rate limit per-account or per-IP?** 20 req/sec is stated but unclear if this is per client_id or global.
8. **UBO data quality:** Bolagsverket's UBO register is relatively new. How complete is the coverage for companies that were required to file UBO declarations?
9. **Skatteverket tax registration data:** Is there ANY API or structured data source for F-skatt/moms/employer status other than scraping Allabolag? Skatteverket's own services seem to be manual-lookup only.
10. **Test company org numbers:** Bolagsverket provides test companies in the test environment. We need their org numbers before integration testing.
11. **Concurrent iXBRL + company data queries:** Can we query company data and annual report data in parallel (separate endpoints), or is there a dependency/ordering requirement?
12. **Historical annual reports:** Can we retrieve annual reports from previous years, or only the most recent filing?

---

## Sources

- [Bolagsverket APIs and Open Data](https://bolagsverket.se/apierochoppnadata.2531.html)
- [API for company information](https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/apiforatthamtaforetagsinformation.3988.html)
- [API for valuable datasets (HVD)](https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/vardefulladatamangder/apiforvardefulladatamangder.5513.html)
- [API v4.6 release notes](https://bolagsverket.se/apierochoppnadata/driftochsupport/nyheterochreleaserforvaraapier/2026/nyinformationiapiforatthamtaforetagsinformationversion46.5888.html)
- [Annual report information API](https://media.bolagsverket.se/diar/services/1.1/hamtaArsredovisningsinformation-1.1-en.html)
- [iXBRL implementation guidelines v1.8](https://bolagsverket.se/download/18.2733cf65187efcf5c7e5b974/1700048522993/implementation-guidelines-annual-reports-ixbrl-1-8.pdf)
- [K2 taxonomy (2021)](https://taxonomier.se/taxonomier-k2-2021.html)
- [K3 taxonomy (2021)](https://taxonomier.se/taxonomier-k3-2021.html)
- [XBRL Sweden taxonomies](https://xbrl.se/taxonomier/)
- [Signicat Bolagsverket integration docs](https://developer.signicat.com/docs/data-verification/data-sources/organisations/bolagsverket-sweden/)
