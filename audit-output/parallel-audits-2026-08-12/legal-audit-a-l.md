# Legal / provenance audit — capabilities a–l

Readiness program WS1c, per DEC-20260812-A. Audit date 2026-08-12. Scope: all 179
manifests in `manifests/` whose slug begins a–l (of 326 total). Read-only pass over
`manifests/*.yaml` + `apps/api/src/capabilities/*.ts` + shared libs.

## Method

For each slug: read the manifest's `data_source` / `data_source_type` /
`transparency_tag` / `processes_personal_data` / `personal_data_categories`, then read
the executor to establish the *actual* mechanism (raw `fetch`, `safeFetch`,
`fetchRenderedHtml`/Browserless, Anthropic SDK, pure computation) and the *actual*
`provenance` block. Assessed against:

- **DEC-20260428-A** three-tier scraping doctrine (Tier 1 no Strale-operated scraping of
  ToS-prohibited sources; Tier 2 vendor data needs `upstream_vendor` /
  `acquisition_method` / `primary_source_reference`; Tier 3 prefer licensed/official bulk).
- **Manifest truthfulness** — declared type vs. observed mechanism.
- **PII** — declared PD flags vs. what the executor actually returns.
- **Attribution / licensing** — CC-BY, ODbL, OGL, Licence Ouverte, ODC-BY, vendor terms.
- **ToS-sensitive hosts** not already covered by `src/lib/tos-blocklist.ts`.

### Two structural facts that shape the findings

1. **The fetch-path gate is real but incomplete.** `assertTargetAllowed` is enforced
   inside `lib/safe-fetch.ts` (line 150 + redirect re-check at 227/230) and inside
   `capabilities/lib/web-provider.ts` `fetchPage` (line 196), which backs
   `fetchRenderedHtml`. Any capability routing through `safeFetch` or `fetchRenderedHtml`
   is gated. Capabilities that call bare `fetch()` with only
   `lib/url-validator.ts` `validateUrl` (an SSRF guard — it contains no ToS logic) are
   **not** gated. Six a–l capabilities are in that ungated set and take a caller-supplied
   URL: `html-to-pdf`, `company-enrich`, `base64-encode-url`, `gdpr-website-check`,
   `landing-page-roast` (screenshot leg), `header-security-check`.
   `capabilities/lib/tos-blocklist.ts` is only a re-export shim of the real module — not a
   second, drifting copy. Good.

2. **The DEC-20260518-F registry pattern is excellent and unevenly applied.** FI, EE, IE,
   LV, LT, CY, CZ, DK, BE, BR all carry `license` / `license_url` / `attribution` /
   `primary_source_reference` in provenance. HR, GR, FR, DE and the whole Openapi.com
   cluster do not. The template exists; it just has not been backfilled.

## Per-capability table

| slug | data_source (declared) | declared type | actual mechanism | assessment | note |
|---|---|---|---|---|---|
| `accessibility-audit` | HTTP fetch + WCAG rule engine (automated accessibility testing) | scrape | Browserless render | **clean** | Renders a caller-supplied URL via fetchRenderedHtml, which enforces assertTargetAllowed. Honestly declared type=scrape. |
| `address-geocode` | OpenStreetMap Nominatim | api | HTTP API fetch | **attribution-gap** | Nominatim/ODbL requires "© OpenStreetMap contributors" attribution + share-alike notice; provenance carries only source="openstreetmap-nominatim". UA is set (good) but OSMF policy bars resale-scale use of the public instance. |
| `address-parse` | Algorithmic (address component extraction, no external data) | api | Claude API | **misdeclared** | data_source says "Algorithmic (…no external data)" and type=api, but the executor sends the address to Anthropic Claude Haiku. Postal addresses (declared PD) leave the platform to a US sub-processor with no disclosure on the machine surface. |
| `address-validate` | OpenStreetMap Nominatim | api | HTTP API fetch | **attribution-gap** | Same as address-geocode: ODbL attribution absent from provenance; public Nominatim instance used for a paid capability. |
| `adverse-media-check` | Dilisense Adverse Media (235k+ news sources, FATF-categorized) primary | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `age-verify` | Strale age calculator (pure date math) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `agent-trace-analyze` | Claude API (agent trace analysis and optimization) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `aml-risk-score` | Strale AML scoring engine (FATF grey/black lists, EU high-risk list) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `annual-report-extract` *(deactivated)* | Claude API (financial document analysis) | api | Browserless render + Claude API + HTTP API fetch | **tos-risk** | DEACTIVATED. Declared type=api / "Claude API", but executor Browserless-scrapes allabolag.se — a commercial Swedish credit-data site whose ToS forbid automated access. Both misdeclared and Tier-1. Keep deactivated. |
| `api-docs-generate` | Claude API (API documentation generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `api-health-check` | HTTP fetch (API endpoint status, response time, schema validation) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `api-mock-response` | Claude API (mock API response generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `approval-security-check` | GoPlus Labs (Token Approval Security API) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `au-company-data` | Australian Business Register (ABR) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `australian-company-data` *(deactivated)* | ASIC / Australian Securities and Investments Commission | scrape | Browserless render + HTTP API fetch | **tos-risk** | DEACTIVATED, correctly — Browserless scrape of abr.business.gov.au web UI; manifest also names ASIC while the executor hits ABR. Superseded by au-company-data (official SOAP API). |
| `austrian-company-data` | Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries) | api | local computation | **tier-2-provenance-gap** | Openapi.com WW-Top vendor aggregation. provenance has upstream_vendor + acquisition_method + authoritative:false, but no primary_source_reference to the Firmenbuch record (source_url points at the vendor request URL). |
| `backlink-check` | CommonCrawl index (public backlink database) | api | HTTP API fetch | **attribution-gap** | CommonCrawl Terms of Use ask for attribution; UA is "Strale/1.0" with no contact URL (CC crawler etiquette). Serper fallback is licensed and clean. |
| `bank-bic-lookup` | SWIFT/BIC directory (bank identification) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `barcode-lookup` | Open Food Facts API (barcode product database) | api | HTTP API fetch | **tos-risk** | Open Food Facts data is ODbL (attribution + share-alike) — no license/attribution in provenance. Worse: the fallback hits api.upcitemdb.com/prod/**trial**/lookup, an evaluation-only endpoint being used in a paid production path. |
| `base64-encode-url` | HTTP fetch + Base64 encoding (no external API) | api | local computation | **tos-risk** | Fetches and returns the full byte content of an arbitrary caller-supplied URL behind validateUrl only. No assertTargetAllowed, so it is a general-purpose retrieval path around the blocklist. |
| `belgian-company-data` | CBEAPI.be (vendor wrapper of KBO/BCE Crossroads Bank for Enterprises) | api | HTTP API fetch | **clean** | Exemplary Tier-2: upstream_vendor=cbeapi.be, acquisition_method=vendor_aggregation, primary_source_reference to KBO/BCE public page. |
| `beneficial-ownership-lookup` | Companies House Persons of Significant Control (UK) | api | HTTP API fetch | **needs-human-review** | Companies House PSC data: real personal data (name, partial DOB, correspondence address, nationality). Manifest tags personal_data_categories incl. sensitive_special — PSC data is ordinary Art.6 personal data, not Art.9 special category, so the tag over-claims. Also no OGL/CH attribution in provenance. |
| `bitcoin-address-validate` | Algorithmic validation (Base58Check + BIP173/BIP350 bech32/bech32m) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `blog-post-outline` | Claude API (content outline generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `brand-mention-search` | Serper.dev API (Google Search results, brand monitoring) | api | Claude API + HTTP API fetch | **clean** | Claude API + HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `brazilian-company-data` | ReceitaWS (vendor wrapper of Brazilian Receita Federal CNPJ register) | api | HTTP API fetch | **clean** | Full Tier-2 provenance chain to Receita Federal CNPJ. |
| `bulgarian-company-data` | Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries) | api | local computation | **tier-2-provenance-gap** | Openapi.com aggregation; primary_source_reference missing (see austrian-company-data). |
| `business-day-check` | Strale calendar engine + Nager.Date API | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `business-license-check-se` *(deactivated)* | Headless browser + Swedish authority registries | scrape | Browserless render + Claude API + HTTP API fetch | **tos-risk** | DEACTIVATED. Browserless scrape of allabolag.se (commercial site, automated access prohibited). Keep deactivated; note manifest still advertises it as a Swedish-authority source. |
| `c2pa-inspect` | c2pa-rs (Adobe Content Authenticity Initiative reference implementatio | computed | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `canadian-company-data` | Corporations Canada / Provincial registries | scrape | Browserless render + HTTP API fetch | **needs-human-review** | Browserless scrape of ised-isde.canada.ca web UI. Corporations Canada publishes an open dataset + API; scraping the UI when a licensed/official bulk channel exists is a Tier-3 preference violation. Government source so ToS risk is low, but returns director PII. |
| `changelog-generate` | Claude API (changelog generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `charity-lookup-uk` | Charity Commission for England and Wales API | api | HTTP API fetch | **misdeclared** | data_source claims "Charity Commission for England and Wales API"; the executor exclusively calls findthatcharity.uk, a third-party aggregator. Undeclared Tier-2 vendor: no upstream_vendor, no primary_source_reference, no OGL/CC-BY attribution. |
| `classify-text` | Claude API (text classification) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `code-convert` | Claude API (programming language conversion) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `code-review` | Claude API (code analysis and review) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `commit-message-generate` | Claude API (git commit message generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `company-enrich` | HTTP fetch + Claude API (company website analysis) | api | Browserless render + Claude API | **tos-risk** | Declared type=api; actually forwards an arbitrary user-supplied URL to Browserless /content. Uses validateUrl (SSRF) only — does NOT call assertTargetAllowed, so it renders linkedin.com / trustpilot.com / glassdoor.com, the exact side door tos-blocklist.ts was written to close. |
| `company-id-detect` | Algorithmic (pattern matching for org number formats across 20+ countr | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `company-industry-classify` | Claude Haiku (AI classification against SIC/NAICS/NACE standards) | computed | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `company-name-match` | Strale name matcher (algorithmic fuzzy matching) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `company-news` | GDELT Project | api | HTTP API fetch | **needs-human-review** | GDELT Project. GDELT publishes much of its data under CC BY-NC-SA-flavoured terms; commercial resale is not clearly granted. Provenance names the source but no license. Needs a licence determination before it stays in paid solutions. |
| `company-tech-stack` | HTTP fetch + Claude API (technology stack analysis) | scrape | Browserless render + Claude API | **clean** | fetchRenderedHtml gated; a parallel raw HEAD request to the same host bypasses the gate but retrieves headers only. |
| `competitor-compare` | HTTP fetch + Claude API (competitive analysis) | scrape | Browserless render + Claude API | **clean** | fetchRenderedHtml on both URLs, so blocklist-gated; typed scrape. |
| `container-track` | Shipping line tracking portals (web scraping with rendering fallback) | scrape | Browserless render + Claude API + HTTP API fetch | **tos-risk** | Browserless scrape of Maersk / MSC / CMA-CGM tracking portals. Carrier portal ToS uniformly prohibit automated access and these hosts are not on tos-blocklist.ts, so the fetch-path gate passes them. |
| `context-window-optimize` | Claude API (context window optimization) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `contract-extract` | Claude API (document analysis and clause extraction) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `contract-verify-check` | Etherscan (Smart Contract Verification API) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `cookie-scan` | Web page rendering (cookie detection, script analysis, consent banner  | scrape | Browserless render + Claude API | **clean** | Explicit assertTargetAllowed before rendering; correctly typed as scrape. |
| `country-tax-rates` | Static database (corporate tax rates by country, updated quarterly) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `country-trade-data` | Static database (bilateral trade statistics, updated annually) | api | HTTP API fetch | **misdeclared** | data_source says "Static database (…updated annually)"; executor makes live calls to api.worldbank.org. World Bank data is CC BY 4.0 and requires attribution — none present. |
| `credit-report-summary` *(deactivated)* | Allabolag.se (Swedish credit data aggregator) | scrape | local computation | **needs-human-review** | DEACTIVATED and has NO executor file at all, yet manifests/credit-report-summary.yaml still declares an allabolag.se scrape returning financial + sensitive_special personal data. A live-looking manifest for a capability that cannot run; delete or mark withdrawn. |
| `credit-score-band` | Strale credit reference (published scoring guidelines) | reference | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `croatian-company-data` | Sudski registar REST API — Ministarstvo pravosuđa i uprave (Croatian C | api | HTTP API fetch | **attribution-gap** | sudreg-data.gov.hr (Ministarstvo pravosuđa) OAuth API. No license / attribution / primary_source_reference in provenance, unlike its DEC-20260518-F peers (FI/EE/IE/LV/LT). Returns director PII. |
| `cron-explain` | Algorithmic (cron expression parsing, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `crontab-generate` | Claude API (crontab expression generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `crypto-price` | CoinGecko API (cryptocurrency market data) | api | HTTP API fetch | **attribution-gap** | CoinGecko public API called with no key. Free/Demo tier requires "Data provided by CoinGecko" attribution and restricts commercial use without a Demo/Pro plan. No license or attribution in provenance. |
| `csv-clean` | Algorithmic (CSV normalization, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `csv-to-json` | Algorithmic (format conversion, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `curl-to-code` | Claude API (cURL to code conversion) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `currency-convert` | European Central Bank daily reference rates | api | HTTP API fetch | **attribution-gap** | ECB data-api reuse requires acknowledgement of the ECB as source; provenance omits it. Low severity, government source. |
| `customs-duty-lookup` | TARIC (EU Customs Tariff Database, European Commission) | scrape | Browserless render + Claude API + HTTP API fetch | **needs-human-review** | Browserless scrape of TARIC + Access2Markets (ec.europa.eu). Commission reuse policy is permissive, but TARIC exposes a bulk/consultation service that Tier-3 would prefer over rendering the JSP UI. |
| `cve-lookup` | OSV API (Open Source Vulnerability database, Google) | api | HTTP API fetch | **attribution-gap** | OSV aggregates feeds with mixed licences (CVE List CC0, GHSA CC BY 4.0). No per-advisory licence/attribution passthrough. |
| `cypriot-company-data` | Openapi.com WW-Top (Tier-3) + data.gov.cy DRCOR open-data CSV (Tier-2  | api | HTTP API fetch | **clean** | Openapi Tier-3 base plus data.gov.cy DRCOR CSV with tier_2_license/tier_2_attribution (CC BY 4.0) added per DEC-20260518-F. Good pattern. |
| `cz-bank-account-validate` | Algorithmic (Czech National Bank specification) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `cz-birth-number-validate` | Algorithmic (Czech Ministry of Interior specification) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `cz-company-data` | ARES (Czech Ministry of Finance) | api | Claude API + HTTP API fetch | **clean** | ARES direct API, attribution present, licence ambiguity honestly disclosed in the provenance note rather than papered over. |
| `cz-datova-schranka-id-validate` | Algorithmic (Czech Data Box specification) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `cz-ico-validate` | Algorithmic (Czech Statistical Office specification) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `cz-unreliable-vat-payer` | MF ČR — rozhraniCRPDPH SOAP web service | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `dangerous-goods-classify` | Algorithmic (UN dangerous goods classification, ADR/IMDG/IATA rules) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `danish-company-data` | CVR / Danish Business Authority (Erhvervsstyrelsen) | api | Claude API + HTTP API fetch | **clean** | cvrapi.dk declared as vendor_aggregation with upstream_vendor + primary_source_reference + attribution. |
| `data-protection-authority-lookup` | Static database (EU/EEA Data Protection Authority registry) | computed | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `data-quality-check` | Algorithmic (data profiling and quality analysis, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `date-parse` | Algorithmic (date/time format normalization, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `deduplicate` | Algorithmic (deduplication, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `dependency-audit` | Algorithmic (dependency tree analysis, no external data) | api | HTTP API fetch | **misdeclared** | data_source says "Algorithmic (…no external data)"; executor calls api.osv.dev, registry.npmjs.org and pypi.org. Machine surface understates third-party dependency and licence exposure. |
| `diff-json` | Algorithmic (JSON diff comparison, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `diff-review` | Claude Haiku (diff analysis) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `dns-lookup` | DNS protocol (authoritative nameservers) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `docker-hub-info` | Docker Hub API (container image metadata) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `dockerfile-generate` | Claude API (Dockerfile generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `docstring-generate` | Claude API (Python docstring generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `dogecoin-address-validate` | Algorithmic validation (Base58Check + Dogecoin version bytes 0x1E/0x16 | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `domain-age-check` | WHOIS protocol (direct queries to TLD registrars) | api | local computation | **needs-human-review** | Raw WHOIS queries to TLD registrars. Registry WHOIS ToS commonly forbid use of the data for commercial purposes / bulk access. Executor returns only created/expires/registrar (no registrant PII), so pd=false is defensible, but the commercial-use restriction is unresolved. |
| `domain-contact-extract` | Company's own public website (direct HTTP fetch, no vendor) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `domain-reputation` | Threat intelligence feeds (multi-source scoring) | api | local computation | **misdeclared** | data_source claims "Threat intelligence feeds (multi-source scoring)". The executor does DNS lookups plus its own HTTP heuristics — provenance.source is literally "dns-and-http-analysis". No threat-intel feed is consulted. Overstated on a machine-readable surface used for risk decisions. |
| `dutch-company-data` | Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries) | api | local computation | **tier-2-provenance-gap** | Openapi.com aggregation; primary_source_reference missing. |
| `ecb-interest-rates` *(deactivated)* | FRED (fred.stlouisfed.org), mirroring ECB Statistical Data Warehouse | api | HTTP API fetch | **misdeclared** | DEACTIVATED. Manifest names FRED (fred.stlouisfed.org) while the slug, description and category all say ECB; FRED redistribution terms differ from ECB reuse terms. Resolve before any reactivation. |
| `email-deliverability-check` | DNS protocol (SPF, DKIM, DMARC record verification) + blacklist check | api | local computation | **tos-risk** | Queries zen.spamhaus.org, bl.spamcop.net and b.barracudacentral.org over the free public DNS mirrors. All three explicitly prohibit use by commercial/paid services and require a paid DQS/registered feed. This is a billed capability. |
| `email-draft` | Claude API (email draft generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `email-finder` *(deactivated)* | DNS MX records + company's own public homepage/contact page (direct HT | api | HTTP API fetch | **clean** | DEACTIVATED with an explicit GDPR Art.5(1)(b) rationale and a CNIL/Kaspr citation in auto-register.ts. Correctly handled. |
| `email-pattern-discover` | DNS protocol + public website HTML | api | HTTP API fetch | **needs-human-review** | ACTIVE. Fetches a company homepage and returns public_emails_found — real work-email personal data — while the manifest declares processes_personal_data: false. This is the same address-harvesting class that got email-finder shelved (Kaspr precedent cited in auto-register.ts), but without the guardrail. |
| `email-reputation-score` | Strale email reputation engine (MX lookup + disposable domain list + p | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `email-validate` | Algorithmic (syntax) + DNS protocol (MX record verification) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `email-validate-bulk` | Algorithmic (syntax) + DNS protocol (MX record verification) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `employer-review-summary` *(deactivated)* | Employer review aggregators (web scraping) + Claude API analysis | scrape | Browserless render + Claude API + HTTP API fetch | **tos-risk** | DEACTIVATED. Targets glassdoor.com and google.com/search, both on tos-blocklist.ts. Keep deactivated; manifest should reflect the ruling. |
| `employment-cost-estimate` | Algorithmic (employment cost calculation by country, tax rules) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `ens-resolve` | Public Ethereum RPC (publicnode.com, llamarpc.com) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `ens-reverse-lookup` | Public Ethereum RPC (publicnode.com, llamarpc.com) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `env-template-generate` | Claude API (environment template generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `eori-validate` | EU EORI Validation System (European Commission DG TAXUD) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `error-explain` | Claude API (error message explanation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `estonian-company-data` | Äriregister / Estonian Business Register | api | Browserless render + Claude API + HTTP API fetch | **misdeclared** | Declared data_source_type: api. Primary path is the ariregister API (with CC BY 4.0 attribution — good), but the executor also carries a Browserless /content fallback against ariregister.rik.ee. A rendering fallback belongs in the declared type (mixed/scrape) and in limitations. |
| `eth-address-validate` | Algorithmic validation (EIP-55, viem) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `eu-ai-act-classify` | Algorithmic (rule-based classification against EU AI Act Annex III, Ar | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `eu-court-case-search` *(deactivated)* | CURIA (Court of Justice of the European Union) | scrape | Browserless render + Claude API + HTTP API fetch | **needs-human-review** | DEACTIVATED. CURIA + HUDOC scraping; would return named-party judicial data (Art.10 GDPR criminal-offence adjacent). Correctly off; do not reactivate without an official CURIA/HUDOC data channel. |
| `eu-regulation-search` | EUR-Lex (Official Journal of the European Union) | scrape | Browserless render + Claude API + HTTP API fetch | **needs-human-review** | Browserless scrape of EUR-Lex search UI. EU Commission reuse (Decision 2011/833/EU) is permissive on content, but EUR-Lex legal notice discourages automated bulk querying and an official webservice/SPARQL endpoint exists — Tier-3 prefers the official channel. |
| `eu-trademark-search` | EUIPO (European Union Intellectual Property Office) | scrape | Browserless render + Claude API + HTTP API fetch | **needs-human-review** | Browserless scrape of the EUIPO eSearch web UI. EUIPO publishes an official eSearch/TMview API; scraping the UI is a Tier-3 violation. Trademark owners can be natural persons, yet processes_personal_data: false. |
| `exchange-rate` | European Central Bank daily reference rates | api | HTTP API fetch | **attribution-gap** | Same ECB acknowledgement gap as currency-convert. |
| `fake-data-generate` | Algorithmic (synthetic data generation, no external data) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `fear-greed-index` | Alternative.me (Crypto Fear & Greed Index) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `financial-year-dates` | Algorithmic (fiscal year calculation by jurisdiction) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `finnish-company-data` | PRH / Finnish Patent and Registration Office | api | Claude API + HTTP API fetch | **clean** | Claude API + HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `flatten-json` | Algorithmic (JSON flattening, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `flight-status` | AviationStack API (flight tracking data) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `food-safety-rating-uk` | Food Standards Agency (FSA) Ratings API (UK Government) | api | HTTP API fetch | **attribution-gap** | FSA Ratings API is OGL v3 and the FSA additionally requires source attribution and display of the rating date. No attribution/licence in provenance. |
| `forex-history` | Frankfurter.app API (ECB historical exchange rates) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `fr-bodacc-lookup` | BODACC (Bulletin Officiel des Annonces Civiles et Commerciales) | api | HTTP API fetch | **attribution-gap** | BODACC via opendatasoft under Licence Ouverte 2.0 — attribution to DILA required, absent from provenance. |
| `french-company-data` | INSEE / Registre du Commerce (France) | api | Claude API + HTTP API fetch | **attribution-gap** | recherche-entreprises.api.gouv.fr data derives from INSEE/INPI under Licence Ouverte; no attribution or licence field in provenance, unlike the DEC-20260518-F peer registries. Returns director PII. |
| `gas-price-check` | Etherscan (Gas Oracle API) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `gdpr-fine-lookup` | GDPR Enforcement Tracker (public enforcement database) | scrape | Browserless render + Claude API + HTTP API fetch | **tos-risk** | Browserless scrape of enforcementtracker.com — a commercial CMS Law product, not an open dataset; its terms reserve rights and forbid systematic extraction. Not on tos-blocklist.ts. Ironic exposure for a GDPR-branded capability. |
| `gdpr-website-check` | HTTP fetch + automated compliance pattern scanning | api | local computation | **tos-risk** | Fetches an arbitrary caller-supplied page with validateUrl only, no assertTargetAllowed. |
| `german-company-data` | OpenRegister (api.openregister.de) | api | HTTP API fetch | **tier-2-provenance-gap** | OpenRegister (api.openregister.de) is a commercial aggregator of Handelsregister/Bundesanzeiger, yet acquisition_method is set to "direct_api" with no upstream_vendor and no primary_source_reference. The attribution string does name the chain, so this is a labelling fix, not a disclosure vacuum. |
| `github-actions-generate` | Claude API (GitHub Actions workflow generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `github-repo-analyze` | GitHub REST API (repository analysis and metrics) | api | Claude API + HTTP API fetch | **clean** | Claude API + HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `github-repo-compare` | GitHub REST API (public repository comparison) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `github-user-profile` | GitHub REST API (public user profiles) | api | HTTP API fetch | **needs-human-review** | Returns public GitHub profile data including email. GitHub API ToS restrict using user information for unsolicited outreach/recruiting; Strale resells the lookup without passing that restriction to the caller. pd=true is correct; a purpose-limitation limitation entry is missing. |
| `gitignore-generate` | Algorithmic (gitignore template generation by project type) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `gleif-l2-children-lookup` | GLEIF Level 2 (Who Owns Whom) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `gleif-l2-ubo-lookup` | GLEIF Level 2 (Who Owns Whom) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `google-search` | Serper.dev API (Google Search results) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `greek-company-data` | GEMI Open Data API — Γενικό Εμπορικό Μητρώο (Greek Business Registry) | api | HTTP API fetch | **attribution-gap** | Source comment states ODC-BY-1.0 ("commercial use permitted with attribution") but no attribution or licence field reaches provenance — ODC-BY makes the notice mandatory. |
| `header-security-check` | HTTP response headers from target server (CSP, HSTS, X-Frame-Options) | api | local computation | **needs-human-review** | Arbitrary URL fetch without assertTargetAllowed; retrieves response headers only, so the exposure is materially smaller than base64-encode-url. Route through safeFetch for consistency. |
| `holiday-calendar` | Nager.Date API (date.nager.at) | api | HTTP API fetch | **clean** | Nager.Date, MIT-licensed public API. |
| `hs-code-lookup` | Harmonized System nomenclature database (WCO) | api | Claude API | **misdeclared** | data_source claims "Harmonized System nomenclature database (WCO)" with type=api. The executor consults no database — it asks Claude to produce an HS code from model recall. Customs classification is a regulated determination; advertising a WCO database it never queries is the most consequential truthfulness gap in this half. |
| `html-to-pdf` | Headless browser rendering via Browserless.io (HTML to PDF conversion) | scrape | Browserless render | **tos-risk** | Forwards an arbitrary user-supplied URL to Browserless /pdf behind validateUrl (SSRF) only, with no assertTargetAllowed. Renders blocklisted hosts (LinkedIn, Trustpilot, Glassdoor, google.com/search) to PDF — the precise bypass tos-blocklist.ts documents in its own header. |
| `http-to-curl` | Algorithmic (HTTP request to cURL conversion, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `hungarian-company-data` | Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries) | api | local computation | **tier-2-provenance-gap** | Openapi.com aggregation; primary_source_reference missing. |
| `iban-to-bank` | Strale IBAN bank registry (major EU banks) | reference | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `iban-validate` | Algorithmic validation (ISO 13616 IBAN standard + bank registry) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `id-number-validate` | Strale ID validator (algorithmic checksum verification) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `image-resize` | Algorithmic (image processing, no external data) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `image-to-text` | Claude API (OCR / image analysis) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `incoterms-explain` | Algorithmic (ICC Incoterms 2020 rule database) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `insolvency-check` | Companies House (UK) | api | HTTP API fetch | **attribution-gap** | Companies House API; no OGL/CH attribution in provenance. Manifest tags sensitive_special for insolvency status — financial distress is not an Art.9 special category, so the tag over-claims. |
| `invoice-extract` | Claude API (document analysis and data extraction) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `invoice-validate` | Algorithmic (invoice field validation, cross-check calculations) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `ip-geolocation` | ip-api.com (IP geolocation database) | api | HTTP API fetch | **tos-risk** | Calls http://ip-api.com/json/ — the free endpoint, which ip-api.com licenses for NON-COMMERCIAL use only; commercial use requires the paid pro plan. Strale bills for this call. Also plain HTTP (no TLS) for a request carrying an end-user IP. |
| `ip-risk-score` | ip-api.com + Strale risk engine (ASN lists, datacenter detection) | computed | HTTP API fetch | **tos-risk** | Same ip-api.com free-tier commercial-use violation as ip-geolocation, plus a misdeclaration: data_source_type is "computed" although the executor makes a live external call. |
| `irish-company-data` | CRO Open Data Portal (opendata.cro.ie) — CKAN datastore_search API | api | HTTP API fetch | **clean** | CRO Open Data CKAN with CC-BY 4.0 licence, licence_url, attribution and primary_source_reference. |
| `isbn-validate` | Algorithmic validation (ISBN-10/ISBN-13 check digit calculation) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `iso-country-lookup` | Algorithmic (ISO 3166-1 country code database) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `italian-company-data` | Openapi.com IT-Advanced (Tier-3 vendor aggregator; Italian company-dat | api | local computation | **tier-2-provenance-gap** | Openapi.com IT-Advanced aggregation; primary_source_reference missing. |
| `japanese-company-data` | National Tax Agency Corporate Number System (Japan) | scrape | Browserless render + HTTP API fetch | **needs-human-review** | Browserless scrape of houjin-bangou.nta.go.jp web UI. Japan NTA publishes an official Corporate Number Web-API (free, application-ID based); scraping the UI instead is a Tier-3 preference violation. |
| `job-board-search` | Arbetsförmedlingen API (Swedish Employment Agency) + Adzuna API | api | HTTP API fetch | **attribution-gap** | Arbetsförmedlingen JobTech is CC0 (clean), but the Adzuna path requires attribution and a link back to Adzuna under its API terms — absent from provenance. |
| `job-posting-analyze` | Claude API (job posting analysis and extraction) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `jsdoc-generate` | Claude API (JSDoc documentation generation) | api | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `json-repair` | Algorithmic (syntax correction, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `json-schema-validate` | Algorithmic (JSON Schema Draft-07 validation, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `json-to-csv` | Algorithmic (format conversion, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `json-to-pydantic` | Algorithmic (JSON to Pydantic model generation, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `json-to-typescript` | Algorithmic (JSON to TypeScript type generation, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `json-to-zod` | Algorithmic (JSON to Zod schema generation, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `jwt-decode` | Algorithmic (JWT token decoding, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `keyword-rank-check` | Serper.dev API (Google SERP, organic results) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `keyword-suggest` | Google Autocomplete API (keyword suggestions) | api | HTTP API fetch | **tos-risk** | Calls suggestqueries.google.com/complete/search, an undocumented private Google endpoint. Google ToS forbid automated access outside published APIs — materially the same ruling as DEC-20260427-H-4, which blocklisted google.com/search. Different host, so tos-blocklist.ts does not catch it. |
| `landing-page-roast` | HTTP fetch + Claude API (conversion analysis) | scrape | Browserless render + Claude API | **tos-risk** | fetchRenderedHtml is gated, but a raw fetch to the Browserless /screenshot endpoint fires first with the caller-supplied URL and no assertTargetAllowed — a blocklisted host is screenshotted before the gate is ever reached. |
| `language-detect` | franc (trigram language detection) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `latvian-company-data` | Latvian Open Data Portal (data.gov.lv) — Uzņēmumu reģistra atvērtie da | api | HTTP API fetch | **clean** | data.gov.lv CKAN, CC0 1.0 with attribution and primary_source_reference. |
| `lei-lookup` | GLEIF (Global Legal Entity Identifier Foundation) | api | HTTP API fetch | **clean** | HTTP API fetch; declared type matches executor, no third-party licence or PII gap identified. |
| `license-compatibility-check` | SPDX License List | reference | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `link-extract` | HTTP fetch + HTML parsing (hyperlink extraction) | api | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `linkedin-url-validate` *(deactivated)* | Algorithmic (LinkedIn URL format validation, no external data) | api | HTTP API fetch | **clean** | DEACTIVATED. Pure format validation, no network call — the linkedin.com strings are format examples only. |
| `lithuanian-company-data` | Lithuanian Open Data Portal (data.gov.lt) — Registrų centras / JAR Spi | api | HTTP API fetch | **clean** | data.gov.lt Spinta, CC-BY 4.0 with full licence/attribution/primary_source_reference. |
| `llm-cost-calculate` | Algorithmic (LLM pricing calculation, static rate table) | computed | Claude API | **clean** | Claude API; declared type matches executor, no third-party licence or PII gap identified. |
| `llm-output-validate` | Algorithmic (LLM output schema validation, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `log-parse` | Algorithmic (log file parsing and structuring, no external data) | computed | local computation | **clean** | local computation; declared type matches executor, no third-party licence or PII gap identified. |
| `luxembourgish-company-data` | Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries) | api | local computation | **tier-2-provenance-gap** | Openapi.com aggregation; primary_source_reference missing. |

## Findings (non-clean only), with remediation

Ordered by severity. "Live" = not in the `DEACTIVATED` map in
`apps/api/src/capabilities/auto-register.ts`.

### P0 — licensing violations on live, billed capabilities

**F-1 `ip-geolocation`, `ip-risk-score` — free-tier API used commercially.**
Both call `http://ip-api.com/json/...` (`ip-geolocation.ts:14`, `ip-risk-score.ts:66`).
ip-api.com licenses the free endpoint for non-commercial use only; commercial use
requires the paid pro plan. Strale bills for both calls. Secondary defect: plain HTTP,
so an end-user IP address (declared `behavioral` personal data) crosses the wire
unencrypted. `ip-risk-score` additionally declares `data_source_type: computed` while
making a live external call.
*Remediation:* buy the ip-api pro plan (keyed HTTPS endpoint) or switch to MaxMind
GeoLite2 / IPinfo with a commercial licence; force HTTPS; correct `ip-risk-score` to
`data_source_type: api`.

**F-2 `email-deliverability-check` — Spamhaus / SpamCop / Barracuda public mirrors.**
`email-deliverability-check.ts:20-24` queries `zen.spamhaus.org`, `bl.spamcop.net`,
`b.barracudacentral.org` over the free public DNS mirrors. All three prohibit use by
commercial or paid services and require a registered/paid feed (Spamhaus DQS,
Barracuda IP registration). This is a billed capability.
*Remediation:* subscribe to Spamhaus DQS (the cheapest path to compliance for all three
classes of signal), or drop the DNSBL section and re-scope the capability to
SPF/DKIM/DMARC only — which is what the manifest's `data_source` already emphasises.

**F-3 `barcode-lookup` — evaluation endpoint in production + ODbL notice missing.**
`barcode-lookup.ts:57` calls `api.upcitemdb.com/prod/**trial**/lookup`, an
evaluation-only endpoint, on the paid path. Separately, Open Food Facts data is ODbL
(attribution + share-alike) and provenance carries only `source: "world.openfoodfacts.org"`.
*Remediation:* move to a paid UPCitemdb key or remove the fallback; add
`license: "ODbL 1.0"`, `license_url`, `attribution: "Open Food Facts contributors"` to
provenance.

### P0 — Tier-1 blocklist bypass (side-door retrieval paths)

**F-4 `html-to-pdf` — arbitrary URL rendered without the ToS gate.**
`html-to-pdf.ts:33-36` calls `validateUrl(fullUrl)` then posts the URL to Browserless
`/pdf`. `validateUrl` is an SSRF guard with no ToS logic, so LinkedIn, Trustpilot,
Glassdoor and `google.com/search` are rendered to PDF on demand. This is verbatim the
bypass that `lib/tos-blocklist.ts`'s own header documents as the reason the gate was
moved to the fetch path.
*Remediation:* add `assertTargetAllowed(fullUrl)` immediately before `validateUrl`.

**F-5 `company-enrich` — same bypass, plus misdeclared type.**
`company-enrich.ts:30-43` validates then forwards a caller-supplied URL to Browserless
`/content` with no `assertTargetAllowed`. Also declared `data_source_type: api` while it
renders third-party sites.
*Remediation:* add `assertTargetAllowed`; better, migrate to `fetchRenderedHtml` from
`capabilities/lib/web-provider.ts`, which gates for free. Change declared type to `scrape`.

**F-6 `base64-encode-url`, `gdpr-website-check`, `landing-page-roast`, `header-security-check`
— ungated arbitrary-URL fetches.** `base64-encode-url` returns the full byte content of any
URL; `gdpr-website-check` returns page HTML analysis; `landing-page-roast` screenshots the
URL via a raw Browserless `/screenshot` fetch at line 14 *before* reaching the gated
`fetchRenderedHtml` at line 30; `header-security-check` retrieves headers only (smallest
exposure).
*Remediation:* route all four through `safeFetch`, which already enforces the gate on both
the initial request and every redirect hop. One-line change each.

### P1 — Tier-1 risk: scraping commercial / ToS-prohibited hosts

**F-7 `gdpr-fine-lookup` — scrapes enforcementtracker.com.** `gdpr-fine-lookup.ts:29`
renders `enforcementtracker.com`, a commercial CMS Law product (not an open dataset)
whose terms reserve rights and forbid systematic extraction. Host is not on the
blocklist, so `fetchRenderedHtml`'s gate passes it.
*Remediation:* add `enforcementtracker.com` to `PROHIBITED_TARGETS` with a DEC entry and
deactivate, or rebuild on national DPA decision registers / EDPB's own published
register. A GDPR-branded capability carrying this exposure is a reputational multiplier.

**F-8 `container-track` — scrapes carrier tracking portals.** `container-track.ts:270`
renders Maersk / MSC / CMA-CGM tracking pages. All three prohibit automated access; none
are blocklisted.
*Remediation:* migrate to carrier APIs (Maersk and CMA-CGM both publish developer
portals) or a licensed aggregator; blocklist the portal hosts in the meantime.

**F-9 `keyword-suggest` — undocumented private Google endpoint.**
`keyword-suggest.ts:18` calls `suggestqueries.google.com/complete/search`. Google's ToS
forbid automated access outside published APIs — materially the same ruling as
DEC-20260427-H-4, which blocklisted `google.com/search`. Different host, so the gate
misses it.
*Remediation:* extend the existing DEC to cover `suggestqueries.google.com`, blocklist
it, and re-source from the already-licensed Serper account (which exposes autocomplete).

**F-10 Deactivated-but-still-advertised scrapers.** `annual-report-extract` (allabolag.se,
and declared `type: api` / "Claude API" while Browserless-scraping),
`business-license-check-se` (allabolag.se), `employer-review-summary` (glassdoor.com +
google.com/search), `australian-company-data` (abr.business.gov.au web UI),
`eu-court-case-search` (CURIA/HUDOC, named-party judicial data). All correctly in
`DEACTIVATED`, but their manifests still describe live-looking sources.
*Remediation:* add an explicit `withdrawn: true` / status marker to deactivated manifests
so the manifest surface cannot be mistaken for an offer.

**F-11 `credit-report-summary` — manifest with no executor.** No
`apps/api/src/capabilities/credit-report-summary.ts` exists, yet the manifest declares an
allabolag.se scrape returning `financial` + `sensitive_special` personal data.
*Remediation:* delete the manifest or mark it withdrawn.

### P1 — misdeclared data_source (machine-surface untruths)

**F-12 `hs-code-lookup` — claims a WCO database it never queries.** Manifest declares
`data_source: "Harmonized System nomenclature database (WCO)"`, `data_source_type: api`.
The executor (`hs-code-lookup.ts:13-14`) asks Claude to produce an HS code from model
recall. No nomenclature database is consulted. Customs classification is a regulated
determination and a wrong code is a customer's liability.
*Remediation:* highest-priority truthfulness fix in this half. Either integrate a real HS
dataset (WCO licence, or EU TARIC/CN which is freely reusable), or restate
`data_source` as "Claude model inference (no nomenclature database)",
`data_source_type: computed`, and add a prominent limitation. `transparency_tag` is
already `ai_generated`, which is the one honest field.

**F-13 `domain-reputation` — claims threat-intel feeds it does not have.** Manifest says
"Threat intelligence feeds (multi-source scoring)"; provenance emits
`source: "dns-and-http-analysis"` (`domain-reputation.ts:112`) and the executor does DNS
lookups plus its own heuristics. Overstated on a surface used for risk decisions.
*Remediation:* restate `data_source` honestly, or integrate a real feed.

**F-14 `charity-lookup-uk` — names the Charity Commission, calls a third party.**
Declared "Charity Commission for England and Wales API"; the executor exclusively calls
`findthatcharity.uk` (lines 23, 31, 52). Undeclared Tier-2 vendor with no
`upstream_vendor`, no `primary_source_reference`, no OGL/CC-BY attribution.
*Remediation:* either call the official Charity Commission register API, or declare
findthatcharity.uk as the vendor with the full Tier-2 provenance triple.

**F-15 `address-parse` — "no external data" while calling Anthropic.** Declared
`data_source: "Algorithmic (address component extraction, no external data)"`,
`data_source_type: api`; the executor sends the address to Claude Haiku
(`address-parse.ts:2,50`). The manifest declares the address as personal data, so
personal data leaves the platform to a US sub-processor with the machine surface actively
denying any external dependency.
*Remediation:* restate `data_source` as "Claude Haiku"; confirm the Anthropic
sub-processor disclosure covers it.

**F-16 `country-trade-data`, `dependency-audit` — "static" / "no external data" while
fetching.** `country-trade-data` calls `api.worldbank.org` (CC BY 4.0, attribution
required); `dependency-audit` calls `api.osv.dev`, `registry.npmjs.org`, `pypi.org`.
*Remediation:* correct both `data_source` strings; add World Bank attribution.

**F-17 `estonian-company-data` — undeclared Browserless fallback.** Declared
`data_source_type: api`; carries a Browserless `/content` fallback against
`ariregister.rik.ee` (`estonian-company-data.ts:4,125-126`). The primary API path is
exemplary (CC BY 4.0 licence + attribution present).
*Remediation:* declare `mixed`, or drop the fallback. Add a limitation naming it.

**F-18 `ecb-interest-rates` — slug/manifest source mismatch.** Deactivated. Manifest names
FRED while the slug, category and description say ECB; FRED redistribution terms differ
from ECB reuse terms.
*Remediation:* resolve before any reactivation.

### P2 — Tier-2 provenance gaps

**F-19 Openapi.com cluster — `primary_source_reference` missing.** `austrian-`, `bulgarian-`,
`dutch-`, `hungarian-`, `italian-`, `luxembourgish-company-data` all resolve through
`capabilities/lib/openapi-resolver.ts:662-670`, which sets `upstream_vendor: "openapi.com"`,
`acquisition_method: "vendor_aggregation"` and `authoritative: false` (all good) but emits
`source_url` = the *vendor request URL*, never a `primary_source_reference` pointing at the
national registry record. DEC-20260428-A Tier 2 requires primary-source provenance per fact.
*Remediation:* one change in `openapi-resolver.ts` — add a per-country
`primarySourceTemplate` and populate `primary_source_reference`, matching what
`belgian-company-data.ts:194` and `brazilian-company-data.ts:95` already do.

**F-20 `german-company-data` — vendor mislabelled as direct API.**
`german-company-data.ts:421` sets `acquisition_method: "direct_api"`, but OpenRegister
(`api.openregister.de`) is a commercial aggregator of Handelsregister/Bundesanzeiger. No
`upstream_vendor`, no `primary_source_reference`. Mitigating: the `attribution` string
does name the chain, so this is mislabelling rather than concealment.
*Remediation:* set `acquisition_method: "vendor_aggregation"`,
`upstream_vendor: "openregister.de"`, add `primary_source_reference` to the
Handelsregister record.

### P2 — attribution gaps (licence permits the use; the notice is missing)

Fourteen capabilities use openly-licensed data whose licence makes attribution
*mandatory*, without emitting it in provenance. The DEC-20260518-F pattern
(`license` / `license_url` / `attribution` / `primary_source_reference`) already exists in
FI/EE/IE/LV/LT/CY — this is backfill, not design.

| capability | source | licence requiring attribution |
|---|---|---|
| `address-geocode`, `address-validate` | OpenStreetMap Nominatim | ODbL — "© OpenStreetMap contributors" + share-alike. Also: OSMF policy bars resale-scale use of the *public* instance; consider self-hosting or a commercial geocoder. |
| `croatian-company-data` | sudreg-data.gov.hr | open-data terms; no licence field at all |
| `greek-company-data` | GEMI Open Data | ODC-BY-1.0 — code comment names it, provenance omits it |
| `french-company-data` | recherche-entreprises.api.gouv.fr | Licence Ouverte 2.0 (INSEE/INPI) |
| `fr-bodacc-lookup` | BODACC via opendatasoft | Licence Ouverte 2.0 (DILA) |
| `food-safety-rating-uk` | FSA Ratings API | OGL v3 + FSA requires rating-date display |
| `insolvency-check` | Companies House | OGL / CH API terms |
| `beneficial-ownership-lookup` | Companies House PSC | OGL / CH API terms |
| `crypto-price` | CoinGecko (unkeyed) | Demo-tier attribution; commercial use needs Demo/Pro key |
| `job-board-search` | Adzuna leg | Adzuna API terms require attribution + link-back (JobTech leg is CC0, clean) |
| `country-trade-data` | World Bank | CC BY 4.0 |
| `cve-lookup` | OSV | mixed — CVE List CC0, GHSA CC BY 4.0; no per-advisory passthrough |
| `currency-convert`, `exchange-rate` | ECB data-api | ECB reuse requires source acknowledgement |
| `backlink-check` | CommonCrawl | ToU attribution; UA lacks a contact URL |

*Remediation:* single sweep adding `license` / `license_url` / `attribution` to each
provenance block, reusing the `finnish-company-data.ts:225-229` shape.

### P2 — PII / GDPR

**F-21 `email-pattern-discover` — undeclared personal-data harvesting, LIVE.**
`email-pattern-discover.ts:123-127,164` fetches a company homepage and returns
`public_emails_found` — work email addresses of identifiable individuals — while the
manifest declares `processes_personal_data: false`. This is the same address-harvesting
class for which `email-finder` was shelved, with the CNIL/Kaspr €240k precedent written
into `auto-register.ts:46-50`. That reasoning applies here and the guardrail was not.
*Remediation:* set `processes_personal_data: true` with
`personal_data_categories: [email, name]` at minimum; then make the deactivate-or-justify
call, since the shelving rationale for `email-finder` reads across almost unchanged.

**F-22 Over-claimed `sensitive_special` tags.** `beneficial-ownership-lookup` tags PSC data
and `insolvency-check` tags insolvency status as `sensitive_special`. Neither is an
Art. 9 special category — PSC data is ordinary Art. 6 personal data, insolvency is
company status. Over-tagging looks conservative but corrupts the PD inventory that
WS1c is meant to produce and will trigger DPIA obligations that do not apply.
*Remediation:* retag both as ordinary personal data. Conversely `eu-trademark-search`
declares `processes_personal_data: false` though trademark owners can be natural persons —
retag true.

**F-23 `github-user-profile` — purpose-limitation restriction not passed through.**
Returns public profile data including email. GitHub's API terms restrict using user
information for unsolicited outreach/recruiting; Strale resells the lookup without
carrying that restriction to the caller. `processes_personal_data: true` is correct.
*Remediation:* add a `limitations` entry stating the no-outreach restriction; consider
surfacing it in the response.

### P3 — Tier-3 (official channel exists; UI scraped instead)

`eu-regulation-search` (EUR-Lex has a webservice + SPARQL endpoint),
`eu-trademark-search` (EUIPO publishes eSearch/TMview APIs),
`japanese-company-data` (NTA Corporate Number Web-API, free, application-ID based),
`canadian-company-data` (Corporations Canada open dataset + API),
`customs-duty-lookup` (TARIC consultation/bulk service). All are government sources so
ToS exposure is low, but DEC-20260428-A Tier 3 prefers the licensed/official channel, and
each of these is also more reliable than rendering a JSP UI.
*Remediation:* queue migrations in source-quality order; none is urgent on legal grounds.

Also here: `domain-age-check` — raw WHOIS to TLD registrars, whose terms commonly forbid
commercial use and bulk access. The executor returns only created/expires/registrar and no
registrant PII, so `processes_personal_data: false` is defensible; the commercial-use
question is unresolved. *Remediation:* confirm per-TLD terms or move to a licensed WHOIS/RDAP
provider.

Also here: `company-news` — GDELT. Much of GDELT is published under
CC BY-NC-SA-flavoured terms and commercial resale is not clearly granted; it is currently
sold inside paid solutions. *Remediation:* obtain a written licence determination before
the next paid-solution review.

## Counts

| assessment | count |
|---|---|
| clean | 121 |
| tos-risk | 16 |
| attribution-gap | 14 |
| needs-human-review | 13 |
| misdeclared | 8 |
| tier-2-provenance-gap | 7 |
| **total** | **179** |

58 of 179 (32%) carry at least one gap. Weighted by effort, the distribution is
favourable: the 14 attribution gaps and 7 Tier-2 gaps are template backfills against a
pattern that already exists in the codebase (~1 day total). The 16 tos-risk items split
into 6 one-line `assertTargetAllowed` insertions, 3 vendor-licence purchases
(ip-api pro, Spamhaus DQS, UPCitemdb), 3 blocklist additions with DEC entries, and 4
already-deactivated capabilities needing only a manifest status marker. The 8
misdeclarations are manifest edits, of which only `hs-code-lookup` requires a product
decision rather than a copy fix.
