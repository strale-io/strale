# Public limitations copy pass — 26 October 2026

Reviewed all 750 limitation entries in 354 manifests. Changed **558 entries in 307 manifests**; unchanged entries remain as written. Counts include title-only and workaround-only edits, counting each entry once.

Only existing `limitations` title, text and workaround values changed. Parsed comparisons confirm unchanged entry order, keys, categories, severities and every field outside limitations. YAML scalar edits preserve comments, key ordering and existing quotation/block styles where practical. All populated titles are at most 60 characters.

Scope interpretation: the requested archive report is included alongside manifest edits and the requested handoff, despite the gate sentence naming only manifests and handoff. No executor, schema, pricing, data-access declaration, description or production setting changed.

Production reads limitations from the database. **These edits reach the live site and API only after the orchestrator backfills the manifests.** Local files and passing tests do not establish that production copy has changed.

## Twenty-five before/after samples

### 1. `swedish-company-data` — entry 1

**Before**

- Title: Registry data only — no financials
- Text: HVD is the EU Open Data Directive subset of Bolagsverket's data. It covers registry identity (name, legal form, status, address, SNI, registration date, insolvency flags) but NOT annual-report financials (revenue, profit, employees, equity). Financial fields were available in earlier Allabolag-backed versions of this capability but have been dropped; they require Bolagsverket's paid Årsredovisningsinformation API or a licensed aggregator.
- Workaround: Use a licensed credit-bureau capability (roadmap) or order an annual-report extract manually.

**After**

- Title: Registry data only; no financial statements
- Text: Bolagsverket’s open company data covers names, legal forms, status, addresses, SNI codes, registration dates and insolvency flags. Annual-report figures such as revenue, profit, employee counts and equity are not included.
- Workaround: Order an annual report or financial statement extract from Bolagsverket.

### 2. `swedish-company-data` — entry 2

**Before**

- Title: Lookup requires organisationsnummer (no name search)
- Text: The HVD API accepts only `identitetsbeteckning` (organisationsnummer/personnummer). Name-based resolution is not offered — earlier LLM-based name-to-orgnr resolution was removed because it relied on scraping Allabolag.se, which is prohibited by DEC-20260420-H.
- Workaround: Resolve the company name to an orgnr via an upstream name-resolver or via the VIES VAT validator, then pass the orgnr.

**After**

- Title: Organisation number required; no name search
- Text: Looks up companies by organisation number only; it does not search by name. Sole-trader lookups can also accept a personal identity number.
- Workaround: Find the organisation number on an official company document or in the registry, then pass it as `org_number`.

### 3. `austrian-company-data` — entry 5

**Before**

- Title: VAT numbers are not accepted
- Text: The Firmenbuch is keyed by Firmenbuchnummer, not UID (VAT). The previous vendor path accepted only ATU-format VAT input; that contract is retired. UID-to-FN resolution is not offered by the registry API.
- Workaround: Look up the company by name, or find the FN on any official company document or at firmen.wko.at.

**After**

- Title: VAT numbers are not accepted
- Text: Lookup accepts a Firmenbuchnummer or company name, not an Austrian UID or ATU-format VAT number. The tool does not resolve VAT numbers to Firmenbuchnummer identifiers.
- Workaround: Look up the company by name, or find its Firmenbuchnummer on an official company document.

### 4. `beneficial-ownership-lookup` — entry 1

**Before**

- Title: UK only — non-GB inputs return a coverage notice
- Text: This capability calls Companies House Persons of Significant Control. Non-GB jurisdictions return a structured coverage notice rather than a result. Adding non-UK coverage requires a separate real UBO source (OpenOwnership integration or aggregator wrap per DEC-20260428-A, now DEC-20261023-A).

**After**

- Title: UK only — non-GB inputs return a coverage notice
- Text: Covers UK Companies House Persons of Significant Control records only. Non-GB inputs return a structured coverage notice instead of ownership data.

### 5. `domain-contact-extract` — entry 1

**Before**

- Title: Organisation-level contacts only — personnel discovery is out of scope
- Text: This capability extracts contact channels a company publishes about itself (info@, sales@, support@, phone, address, social links). It does not accept a person's name as input, does not generate or guess candidate personal email addresses, and does not enumerate employees. Personal-looking addresses (firstname.lastname@) are never returned, even when the company published them: only their count, in `personal_addresses_withheld`. Strale's data-access rule (DEC-20261023-A) rules out reselling contact details about identifiable people. See email-pattern-discover (currently suspended) for the boundary this capability stays inside of.

**After**

- Title: Company contact channels only
- Text: Returns published company contact channels such as role email addresses, phone numbers, postal addresses and social links; it does not accept a person’s name, enumerate employees or guess personal email addresses. Personal-looking addresses are withheld even when published, with only their count returned in `personal_addresses_withheld`.

### 6. `domain-contact-extract` — entry 4

**Before**

- Title: Phone numbers come only from explicit markup — plain-text numbers are not extracted
- Text: A phone number is returned only when the site declares it as one: a tel: link, or a schema.org telephone value in JSON-LD or microdata. A number that appears only as visible text is NOT extracted, so phones can be empty on a page a human would say clearly shows a phone number. This is deliberate. An earlier version inferred numbers from digit shape and returned fabricated values in production (digit sequences that appeared nowhere on the page), because sites serve different markup to bots and the response is truncated at 300KB mid-document. An empty result you can act on is worth more than a plausible wrong number you cannot detect.

**After**

- Title: Phone numbers require explicit phone markup
- Text: Phone numbers are returned only from tel: links or schema.org telephone values in JSON-LD or microdata. Plain-text numbers are not extracted, so `phones` can be empty even when a number is visible on the page.

### 7. `cypriot-company-data` — entry 1

**Before**

- Title: Gated behind OPENAPI_ENABLED flag pending resale addendum countersignature
- Text: Strale's resale of Openapi.com data requires the addendum issued via Openapi case 151296 (2026-05-08) to be countersigned. Until then, OPENAPI_ENABLED stays false in production and this capability returns capability-unavailable.

**After**

- Title: Tool is unavailable
- Text: This tool is unavailable and returns a capability-unavailable error.

### 8. `cypriot-company-data` — entry 4

**Before**

- Title: Directors via DRCOR open data — C-prefix lookup only
- Text: Openapi WW-Top does not return directors / legal representatives for CY. The gap is closed for C-prefix inputs via data.gov.cy DRCOR open data (CC BY 4.0, monthly refresh) — see jobs/ingest-cy-directors.ts and DEC-20260518-E Phase 6 enumeration. VAT-format inputs (CY-prefix or bare) cannot be resolved against the DRCOR cache because DRCOR indexes by numeric REGISTRATION_NO only, not by VAT.

**After**

- Title: Director lookup requires a C-prefix company number
- Text: Directors are available only for C-prefix company-number inputs through DRCOR open data. CY-prefix and bare VAT inputs cannot resolve directors because the dataset uses registration numbers rather than VAT identifiers.

### 9. `italian-company-data` — entry 2

**Before**

- Title: Directors / legal representatives not available at IT-Advanced tier
- Text: IT-Advanced does NOT return directors / managers / officers. The IT-Full product surfaces managers[] but has 12s+ latency requiring async execution — deferred to v1.1 quality upgrade per Phase 2c scope decision. Customers needing Italian directors data should integrate the v1.1 IT-Full async path or use a separate directors-specific Strale capability when shipped.

**After**

- Title: Directors and legal representatives are not included
- Text: Director, manager, officer and legal representative details are not included.

### 10. `italian-company-data` — entry 3

**Before**

- Title: Shareholders empty for widely-held entities
- Text: shareHolders[] is structurally present in every IT-Advanced response, but ONLY entities with at least one ≥10% shareholder return a non-empty array. Widely-held listed companies (Eni, Enel, etc.) return []. output_field_reliability declares shareholders as "common" not "guaranteed" — applies for closely-held / family-owned / subsidiary entities. UBO data is NOT included in shareHolders[] — that's a separate Openapi product (UBO-Italy, v1.1+).

**After**

- Title: Shareholder lists can be empty
- Text: `shareholders` is populated only when the source lists at least one shareholder with a holding of 10% or more; widely held companies can return an empty array. Beneficial owners are not included in this list.

### 11. `portuguese-company-data` — entry 4

**Before**

- Title: Share capital not returned at PT-Advanced tier
- Text: Despite the Matrix's "share capital via balanceSheets" claim, the PT-Advanced response contains employees / netWorth / operatingRevenue / equity / totalAssets per year, but NOT a dedicated shareCapital field. Tier 3 coverage is 2/6 (NACE + last_filing_date), not 3/6. Matrix needs reconciliation; documented for chat to address separately. Only IT-Advanced surfaces shareCapital.

**After**

- Title: Share capital is not included
- Text: A dedicated share-capital figure is not returned. Employee counts, net worth, operating revenue, equity, total assets, NACE codes and last filing date can be available, but do not establish share capital.

### 12. `romanian-company-data` — entry 2

**Before**

- Title: PARTIAL coverage — 7-digit CUI entities structurally unreachable
- Text: Openapi WW-Top regex is ^RO\d{8}$ | ^\d{13}$ | ^\d{8}$. Entities with 7-digit CUI (Banca Transilvania RO5022670, OMV Petrom RO1590082) are structurally rejected with 406 across all 4 probe attempts. Anomaly logged on Openapi support case 151296. 8-digit-CUI entities (Hidroelectrica RO13267213) work fine.

**After**

- Title: Seven-digit CUI identifiers are not supported
- Text: Accepts RO followed by exactly 8 digits, bare 8-digit identifiers or bare 13-digit identifiers. Seven-digit CUI identifiers are rejected with HTTP 406 even when they identify a registered company.

### 13. `host-exposure-lookup` — entry 1

**Before**

- Title: Deactivated 2026-09-06 — Shodan InternetDB is licensed for non-commercial use only
- Text: Shodan states the InternetDB API may not be used to build commercial products that you charge money for, and this is a paid capability. Deactivated one day after launch, before it had served any paying call — it was still dark from the dark-launch path, and production confirms zero paying calls. Reactivating requires a Shodan enterprise licence, or a rebuild on a source whose terms permit resale. Audit: docs/security/2026-09-06-vendor-terms-audit.md.

**After**

- Title: Tool is unavailable
- Text: This tool is unavailable and does not return host-exposure data.

### 14. `price-compare` — entry 1

**Before**

- Title: Nordic countries only — the former Google Shopping fallback is retired
- Text: Coverage is Sweden, Norway, Denmark and Finland via PriceRunner. The former Google Shopping fallback for other countries was removed 2026-08-12: Google Search is on the ToS blocklist (DEC-20260427-H-4), and serving it would violate the per-source policy the platform enforces at the fetch layer. Non-Nordic requests return a clear unsupported-country error and are not billed. Other countries return when a licensed price source is added.

**After**

- Title: Only Nordic countries are supported
- Text: Covers Sweden, Norway, Denmark and Finland through PriceRunner. Other countries return an unsupported-country error and are not billed.

### 15. `product-reviews-extract` — entry 1

**Before**

- Title: Trustpilot, Glassdoor and LinkedIn are not supported — their Terms of Service forbid automated access
- Text: Review sites whose Terms of Service prohibit automated access are rejected before any fetch is attempted, and return a policy error rather than review data. This currently covers Trustpilot, Glassdoor, LinkedIn, Google Search and the major social platforms. Retrying will not succeed. Strale will add a source back only under a licensed API agreement.
- Workaround: Use a first-party product page, or a review platform that permits automated access such as Reviews.io, Feefo or Yotpo.

**After**

- Title: Some review sources are unsupported
- Text: Unsupported review-site URLs return a policy error before the page is read. Repeating the same request does not return review data.
- Workaround: Supply a first-party product page with publicly visible reviews.

### 16. `tech-stack-detect` — entry 1

**Before**

- Title: Sources whose Terms of Service forbid automated access are rejected
- Text: URLs on sites whose Terms of Service prohibit automated access (Trustpilot, Glassdoor, LinkedIn, Google Search and the major social platforms) are rejected before any fetch is attempted, returning a policy error with compliant alternatives where they exist. Retrying will not succeed. Strale adds a source back only under a licensed API agreement.

**After**

- Title: Some website sources are unsupported
- Text: Unsupported website URLs return a policy error before the page is read. Repeating the same request does not return content.

### 17. `social-profile-check` — entry 2

**Before**

- Title: Data access: preferred lane (official registry APIs)
- Text: DEC-20261023-A lane: preferred. Each registry is read through its own documented public API — the npm registry (registry.npmjs.org), PyPI's JSON API (pypi.org/pypi/<name>/json) and the GitHub REST API (api.github.com/orgs) — one request per registry per call, with an honest StraleBot user agent, reading only the HTTP status. No page is scraped and no personal account is looked up. Terms of each API (docs.npmjs.com/policies/open-source-terms, pypi.org/policy/terms-of-use, docs.github.com/site-policy/github-terms) were not re-read in the 2026-10-24 session, whose network policy blocked them; re-verify before any change of use.

**After**

- Title: Checks registry HTTP status only
- Text: Each call checks only HTTP status through the npm, PyPI and GitHub organisation APIs, with one request per registry. It does not inspect page content or look up personal accounts.

### 18. `password-strength` — entry 2

**Before**

- Title: The submitted password is recorded on the transaction for 90 days
- Text: Scoring happens in-process and the password reaches no third party, but capability inputs are written to the transaction record like every other capability's, and are redacted on the standard 90-day schedule. Do not submit a live credential you are not willing to have retained for that period. An earlier version of this description claimed the password was not stored; that was inaccurate and was corrected on 2026-09-05.
- Workaround: Score a representative sample or a candidate password rather than a credential already in use.

**After**

- Title: Submitted passwords are retained for 90 days
- Text: Passwords are processed without sending them to a third party, but the submitted input is stored in the transaction record for 90 days before redaction. Do not submit a live password unless you accept that retention.
- Workaround: Score a representative sample or a candidate password rather than a credential already in use.

### 19. `pii-redact` — entry 3

**Before**

- Title: The text you submit is recorded on the transaction for 90 days
- Text: Redaction happens in-process and the text reaches no third party, but capability inputs are written to the transaction record like every other capability's, and are cleared on the standard 90-day schedule. This capability is submitted text that is known to contain personal data — that is its purpose — so the retention applies to exactly the material you are asking to have removed, including the special-category identifiers named above. The output is redacted; the stored input is not.
- Workaround: Submit the smallest span that needs redacting rather than a whole document, or run redaction in your own environment where the input is never transmitted.

**After**

- Title: Submitted text is retained for 90 days
- Text: Submitted text, including any sensitive identifiers it contains, is stored unredacted in the transaction record for 90 days before clearing. Processing sends the text to no third party, and the returned output is redacted; the stored input remains unchanged during retention.
- Workaround: Submit the smallest span that needs redacting rather than a whole document, or run redaction in your own environment where the input is never transmitted.

### 20. `c2pa-inspect` — entry 3

**Before**

- Title: URL input only — no direct upload in v1
- Text: v1 accepts only an HTTP(S) URL. Direct upload of base64-encoded media bytes is planned for v2 to support agents that already hold the media in memory. URL must be publicly fetchable.
- Workaround: Host the media on a publicly accessible URL (e.g. S3 public object, CDN) before calling.

**After**

- Title: Public HTTP or HTTPS URL required
- Text: Accepts only publicly accessible HTTP or HTTPS URLs. Direct uploads and base64-encoded media are not supported.
- Workaround: Host the media on a publicly accessible URL (e.g. S3 public object, CDN) before calling.

### 21. `c2pa-inspect` — entry 4

**Before**

**After**

### 22. `gleif-l2-children-lookup` — entry 3

**Before**

- Title: Pagination not yet exposed in output
- Text: First page of children is returned with total_children indicating the full count. When total_children > children.length, the `paginated: true` flag signals more results available upstream but the executor returns only the first page. To retrieve subsequent pages a new capability call would be needed (next-page support is a future enhancement).

**After**

- Title: Only the first page of children is returned
- Text: `total_children` gives the full count, but only the first page is returned. If the count exceeds the returned list length, `paginated` is true; subsequent pages cannot be retrieved through this tool.

### 23. `german-company-data` — entry 1

**Before**

- Title: Free plan has a hard credit allowance
- Text: OpenRegister's Free plan includes 500 credits per rolling 30 days. A name lookup normally costs 11 credits (1 for autocomplete and 10 for company details), while a canonical company-id lookup costs 10. HTTP 402 means the allowance is exhausted; HTTP 429 is a separate short-term rate limit. The Vendor Control Tower reads the zero-cost credits endpoint, takes this capability off every serving rail when the account cannot pay, and restores the saved state only after the vendor reports usable credits again.
- Workaround: Prefer canonical company_id inputs when available and use the cached result within the product's permitted refresh window to avoid repeating an 11-credit lookup.

**After**

- Title: Provider credits and rate limits affect availability
- Text: OpenRegister allows 500 credits per rolling 30 days on the configured plan; a name lookup normally uses 11 credits and a `company_id` lookup 10. HTTP 402 indicates exhausted credits and HTTP 429 a short-term rate limit; the tool can be paused until usable credits are restored.
- Workaround: Use `company_id` when known and reuse results within the permitted refresh window to avoid repeated lookups.

### 24. `eurostat-data` — entry 5

**Before**

- Title: Metadata may not expose every dataset-specific restriction
- Text: The curated list excludes international trade; as defence in depth, such datasets are refused by case-insensitive code prefixes ext_, ds-, comext, itgs_, trade_, tet, teiet, tipsex, cult_trd_, sprt_trd_, enpe_ext_, bop_its, for_trop and ei_etea; by the words trade, import/imports or export/exports (case-insensitive, word boundaries) in returned dataset titles or theme/category labels, except domestic retail trade, wholesale trade, distributive trade and trade sector phrases (international/foreign/extra-EU/intra-EU trade remains refused); by a stk_flow dimension (this conservatively also refuses nrg_stk_gas); and by DISSEMINATION_SOURCE_DATASET annotation titles starting with ext_, ds- or comext (case-insensitive). This covers Swiss/Liechtenstein post-1995 commodity and Austrian CN8 restrictions. The executor checks source/rights anchors including SOURCE_INSTITUTIONS in returned JSON-stat source, extension and annotations, never dimension ids or category codes (owner is a valid dimension). Separately linked ESMS documents and catalogue notices are not inspected; absent source declarations are reported in metadata_limitations. No blanket rights clearance of every catalogue dataset is implied.

**After**

- Title: Some dataset restrictions may be missing from metadata
- Text: International trade datasets are excluded, including Swiss and Liechtenstein commodity data and Austrian CN8 data; domestic retail, wholesale, distributive trade and trade-sector statistics are exempt, while stock-flow datasets can also be refused. Source and rights checks use returned metadata without inspecting separately linked ESMS documents or catalogue notices, and missing source declarations appear in `metadata_limitations`, so the checks do not establish rights clearance for every dataset; reuse must preserve the dataset DOI, access date, source attribution and notices describing modifications and Eurostat’s non-responsibility for the rendering.

### 25. `invoice-counterparty-check` — entry 7

**Before**

- Title: Existing upstream access conditions
- Text: This composite adds no upstream or fetch path. It preserves the weakest underlying data-access lane and all source provenance. Official registries and VIES are reused through existing executors. Dilisense's existing allowed-with-checks lane remains pending because the reseller agreement is not signed; this build makes no stronger rights claim. Health probes retain the underlying unauthenticated zero-cost connectivity checks; the known-answer fixture is a paid functional test.

**After**

- Title: Depends on registry, tax and screening availability
- Text: This check depends on the availability and coverage of its underlying registry, VIES and sanctions sources. Source provenance is included in the response.

## Description review — proposals only

Every manifest description was scanned. The table includes internal terminology, vendor/competitor references, model names, unsupported scope implications, relevant omissions and descriptions exceeding the repository’s 160-character guidance. Proposals are copy suggestions, not implementation changes; the orchestrator should check them against the public schema and active status before a separate description batch. Names of actual output measures (for example a review platform’s score or source-code verification) are not treated as Strale certification claims.

| Tool | Current description | Proposed rewrite |
|---|---|---|
| `adverse-media-check` | Screen a person or company for adverse news across 235,000+ sources. Returns a risk level with its thresholds, FATF-aligned category counts, and the top headlines with source links and dates. | Search adverse news about a person or company. Returns a risk level, category counts and linked headlines for review. |
| `approval-security-check` | Check a wallet's token approvals for security risks. Identifies unlimited or risky approvals that could allow funds to be drained. Covers Ethereum, BSC, Base, and other EVM chains via GoPlus Security. | Check a wallet’s token approvals for potential security risks, including unlimited spending allowances, through GoPlus Security. |
| `belgian-company-data` | Look up a Belgian company in the Crossroads Bank for Enterprises (KBO/BCE) by enterprise number, VAT number or name. Returns name, status, legal form, address, registration date, establishments and VAT number. | Look up a Belgian company by enterprise number, VAT number or name. Returns identity, status, address and registration details. |
| `beneficial-ownership-lookup` | Find the people with significant control of a UK company, from Companies House: who ultimately owns or controls it, their share, and the ownership chain. UK companies only. | Look up a UK company’s reported persons of significant control in Companies House, including ownership and control details. |
| `breach-exposure-check` | Find known data breaches of a company's own domain: when, how many accounts, which kinds of data leaked, and whether passwords were among them. Takes a domain only. | Find reported breaches of a company’s own domain, with dates, affected-account counts and exposed data categories. |
| `bulgarian-company-data` | Look up Bulgarian company data via Openapi.com WW-Top (Tier-3 vendor aggregator). Accepts UIC/EIK (9 digits, optionally BG-prefixed). Returns name, registration number, status, registered address, registration date, LEI, primary NACE code, and last-update timestamp. Directors are not returned at the WW-Top tier. | Look up Bulgarian company identity and registration details by UIC or EIK. Director details are not included. |
| `cert-transparency-search` | Search public Certificate Transparency logs for a domain: every certificate issued, the issuing CA, validity window, and the full set of hostnames those certificates cover. | Search public Certificate Transparency logs for certificates and hostnames associated with a domain. |
| `charity-lookup-uk` | Look up a charity in England and Wales or Scotland by registration number, or search by name, from Find that Charity. A number lookup returns status, registration dates, income, spending and description. | Look up charity registration records by number or name, including status, registration dates and reported income and spending. |
| `company-fundamentals` | Latest annual financials for a US-listed company from its own SEC filings: revenue, operating and net income, assets, liabilities, equity, cash, diluted EPS and share count, each with the filing it came from. | Read the latest annual financial figures from a US domestic company’s SEC 10-K filings, with source concepts and filing references. |
| `company-id-detect` | Work out the type and country of a company registration number: Swedish organisation numbers, Finnish business IDs, German HRB numbers, LEIs, DUNS and 20+ other formats. | Identify possible countries and types for a company registration number, covering more than 20 identifier formats. |
| `contract-verify-check` | Check whether a smart contract's source code is verified on Sourcify, the open verification repository. Returns contract name, compiler version, optimizer and EVM settings, and proxy status. Works across EVM chains by chain id. | Check whether a smart contract’s code is recorded in Sourcify, with compiler settings and proxy status where available. |
| `credit-report-summary` | Get a credit report summary for a Swedish company from Allabolag. Returns credit rating, financial summary, risk indicators, board members. Accepts org number or company name. | Summarise indicative credit information for a Swedish company, including financial figures and risk indicators. |
| `cve-details` | Look up one CVE in the NIST National Vulnerability Database: description, CVSS score and vector, CWE ids, whether CISA lists it as exploited, affected products and references. | Look up a CVE in NIST’s vulnerability database, including severity, affected products and references where available. |
| `cypriot-company-data` | Look up Cypriot company data. Tier-1 identity via Openapi.com WW-Top (Tier-3 vendor aggregator). Tier-2 legal_representatives[] sourced from data.gov.cy DRCOR open data (CC BY 4.0, monthly refresh) for C-prefix inputs (e.g. C165). Accepts CY-prefix VAT, bare VAT (8 digits + letter), or C-prefix CRO company number. Returns name, registration number, status, registered address, directors + secretaries, and source provenance. | Look up a Cypriot company by VAT or company number. Director details from DRCOR are available only for C-prefix company numbers. |
| `cz-unreliable-vat-payer` | Check whether a Czech VAT number (DIČ) is flagged as an unreliable VAT payer, and get the bank accounts the payer has published. Protects against joint VAT liability. | Check a Czech VAT number’s unreliable-payer flag and published bank accounts in the Ministry of Finance records. |
| `diff-review` | Review a git diff for bugs, security issues, missing error handling, test gaps and code quality. Returns findings with severity and file, and whether to approve. | Review a git diff for potential bugs, security issues, error handling and test gaps. Returns findings with severity and file references. |
| `domain-contact-extract` | Find a company's public contact details on its own website: role email addresses such as info@ and sales@, phone numbers, postal address, contact page and social links. Company contacts only, never a named person's. | Read published company contact channels from a website: role email addresses, phone numbers, postal address and social links. |
| `dutch-company-data` | Look up Dutch company data via Openapi.com WW-Top (Tier-3 vendor aggregator). Accepts Dutch VAT/BTW number (NL + 9 digits + B + 2 digits). Returns name, registration number, status, registered address, registration date, LEI, primary NACE code, and last-update timestamp. KvK 8-digit registration numbers are NOT accepted by the upstream API. | Look up Dutch company identity and registration details by NL-format VAT number. KvK registration numbers are not accepted. |
| `ecb-interest-rates` | Fetch current ECB key interest rates (main refinancing, deposit facility, marginal lending). Sourced from FRED (Federal Reserve Economic Data), which mirrors the ECB Statistical Data Warehouse. | Read ECB refinancing, deposit facility and marginal lending rates through FRED’s mirror of ECB publications. |
| `email-draft` | Draft a professional email for a purpose and tone you give, such as a cold introduction, follow-up or apology. Returns subject options, the body and key phrases. | Draft an email for a purpose, tone and context you supply, with subject options, body text and key phrases. |
| `email-pattern-discover` | Detect likely corporate email format for a domain. Checks MX records, identifies email provider (Google Workspace, Microsoft 365, etc.), and suggests common patterns. | Suggest likely company email formats from domain-level mail settings and published address patterns. Does not confirm individual mailboxes. |
| `email-validate` | Check an email address: syntax, mail servers, disposable and role addresses, free providers and likely typos such as gmial.com. Returns a deliverability verdict with each check. No email is sent. | Check email syntax, mail-server records, disposable domains, role addresses and likely typos. Sends no email and does not confirm a mailbox exists. |
| `fda-safety-search` | Search FDA enforcement (recall) reports for drugs, medical devices and food: recall class, reason, recalling firm, status, distribution and dates. Filter by product domain and recall classification. | Search FDA recall reports for drugs, medical devices and food, with classification, recall reason, firm, distribution and dates. |
| `fr-bodacc-lookup` | Get a French company's announcements in BODACC, the official commercial gazette, by SIREN: insolvency proceedings, changes, sales, strike-offs and incorporations. | Read a French company’s BODACC announcements by SIREN, including insolvency proceedings, sales and registration changes. |
| `french-insolvency-check` | Check a French company for insolvency proceedings (redressement or liquidation judiciaire) in BODACC, the official legal gazette, by SIREN or name. Returns judgment dates, court and type. | Search BODACC for a French company’s collective insolvency proceedings by SIREN or name, with court, date and proceeding type. |
| `german-company-data` | Look up a company in the German commercial register (Handelsregister). Returns name, register number, court, legal form, status, address, directors, capital, LEI, and incorporation and closure dates. | Look up German company identity and registration details, including court, legal form, status, address and directors where available. |
| `gleif-l2-ubo-lookup` | Find the direct and ultimate parent companies of any entity with an LEI, from GLEIF ownership data, with the stated reason when a parent is not reported. Fills ownership gaps that national registers leave. | Find reported direct and ultimate parent companies for an LEI in GLEIF, including reporting exceptions where a parent is not named. |
| `google-news-search` | Search Google News via a licensed SERP API. Returns ranked news results with source, relative publish time, snippet and image, with optional country/language scoping and time-range filters. | Search Google News results by query, country, language and time range. Returns headlines, sources, snippets and relative publication times. |
| `greek-company-data` | Look up a Greek company in GEMI, the General Commercial Registry, by GEMI number or 9-digit tax ID (AFM). Returns name, legal form, address, status, main activity, directors and VAT number. | Look up a Greek company in GEMI by registry number or tax ID, including identity, status, address and directors where available. |
| `host-exposure-lookup` | What an internet-facing host exposes: open ports, detected software, known CVEs and hostnames, from Shodan's scan data. Accepts an IPv4 address or a hostname to resolve. Sends no traffic to the target. | Look up recorded open ports, software, vulnerabilities and hostnames for an IPv4 address or resolved hostname. Does not contact the target. |
| `hungarian-company-data` | Look up Hungarian company data via Openapi.com WW-Top (Tier-3 vendor aggregator). Accepts Hungarian VAT (HU + 8 digits). Returns name, registration number, status, registered address, registration date, LEI, primary NACE code, and last-update timestamp. Cégjegyzékszám (hyphenated 10-digit) is NOT accepted by the upstream API. | Look up Hungarian company identity and registration details by HU-format VAT number. Hyphenated company numbers are not accepted. |
| `id-number-validate` | Check the format and checksum of national ID numbers: Swedish personnummer, Finnish henkilötunnus, Norwegian fødselsnummer, Danish CPR, UK National Insurance, US SSN and German Steuer-ID. Does not verify identity. | Check national ID number formats and checksums for seven supported countries. Does not confirm identity or that a number is assigned. |
| `image-to-text` | Read the text in any image with AI vision: screenshots, photos of documents and handwriting. Returns the text with a confidence level. | Read text from an image, including screenshots and document photos, with a confidence estimate. Handwriting and complex layouts can reduce accuracy. |
| `irish-company-data` | Look up an Irish company at the Companies Registration Office by CRO number or name. Returns name, status, type, address, registration date, annual return dates, NACE code and Eircode. | Look up an Irish company at the CRO by number or name, with status, address, registration dates and filing details where available. |
| `italian-company-data` | Look up Italian company data via Openapi.com IT-Advanced (Tier-3 vendor aggregator; richest Openapi product Strale ships in v1). Accepts Italian codice fiscale / P.IVA (11 digits). Returns name, legal form (detailedLegalForm — unique to IT among Openapi-routed countries), registration number, status, registered address, registration date, LEI, primary NACE/ATECO code, share capital, last filing date, and shareholders array (≥10% threshold; empty for widely-held entities like Eni). | Look up Italian company details by tax or VAT number, including financial and shareholder information where available. Directors are not included. |
| `keyword-rank-check` | Find where a domain ranks on Google for a keyword: position, page, the matching result, and the competitors ranking above it. Scans the top 10 results by default (up to 100), so a domain not found may still rank lower. | Find a domain in the top Google results for a keyword, scanning 10 results by default and up to 100. Lower-ranked domains can be missed. |
| `latvian-company-data` | Look up a Latvian company in the Enterprise Register by its 11-digit registration number or name. Returns name, status, type, address, registration date, SEPA creditor ID and administrative code. | Look up a Latvian company by registration number or name, including status, address, registration date and current officers where available. |
| `link-extract` | List every link on a page with its anchor text and rel attributes, internal or external. | List links found in a page’s initial HTML, with anchor text and rel attributes. Links added by JavaScript can be missed. |
| `lithuanian-company-data` | Look up Lithuanian company data from the Centre of Registers (Registrų centras / JAR) via the data.gov.lt open-data Spinta API. Accepts company code (7-9 digits) or fuzzy company name. Returns name, code, legal form, status, and registration dates. | Look up Lithuanian company identity, legal form, status and registration dates from the Centre of Registers open dataset. |
| `llm-output-validate` | Check an LLM's output against a schema and repair common mistakes, without calling another model. | Check AI output against a schema and repair common structural mistakes without calling another model. |
| `luxembourgish-company-data` | Look up Luxembourgish company data via Openapi.com WW-Top (Tier-3 vendor aggregator). Accepts LU VAT (LU + 8 digits). Returns name, registration number, status, registered address, registration date, LEI, primary NACE code, and last-update timestamp. RCS B-prefix company numbers are NOT accepted by the upstream API. | Look up Luxembourgish company identity and registration details by LU-format VAT number. RCS company numbers are not accepted. |
| `maltese-company-data` | Look up Maltese company data via Openapi.com WW-Top (Tier-3 vendor aggregator). Accepts MT VAT (MT + 8 digits). Returns name, registration number, status, registered address, registration date, LEI, primary NACE code, and last-update timestamp. PARTIAL coverage — some major MT entities (Bank of Valletta, HSBC Malta) returned 204 in 2026-05-15 v3 probes. MFSA C-prefix company numbers are NOT accepted. | Look up Maltese company details by MT-format VAT number. Some registered companies are missing; C-prefix company numbers are not accepted. |
| `no-bankruptcy-check` | Check a Norwegian company for bankruptcy and dissolution in the Brønnøysund registers: any bankruptcy filing and its date, voluntary or forced dissolution, and the register's notes. | Read Norwegian registry bankruptcy and dissolution flags, available dates and registry annotations for a company. |
| `officer-search` | Find company directors and officers from official public registries. Covers UK (Companies House) and US (SEC EDGAR). Returns officer names, roles, appointment dates. | Find company officer information in UK Companies House and US SEC filings, with names, roles and dates where available. |
| `page-exists` | Check whether a URL still exists. Catches hard 404s, soft 404 pages, dead links and removed listings that still answer with HTTP 200. | Assess whether a URL returns page content, including common missing-page signals. JavaScript applications and blocked pages can limit the result. |
| `paid-api-preflight` | Check a paid API before your agent spends money on it: reachability, SSL, response time and the payment handshake (L402, x402, MPP). Returns proceed, caution or avoid, with the payment details. | Check an API’s reachability, TLS and HTTP 402 payment response for L402, x402 or MPP. Returns payment details and a proceed, caution or avoid result. |
| `password-strength` | Analyze password strength: entropy, crack time estimate, character class diversity, common password check, keyboard pattern detection. Computed in-process — the password is never sent to a third party. Algorithmic. | Estimate password strength from entropy and common patterns. Input stays within Strale and is retained for 90 days before redaction. |
| `pep-check` | Screen a person against politically exposed persons in 230+ territories, aligned with the EU PEP function list and including relatives and close associates. Returns matches with positions held, jurisdictions and sources. | Screen a person against reported politically exposed person records, including relatives and close associates, with positions and sources. |
| `phishing-site-check` | Check if a URL is a known phishing site targeting Web3 users. Detects cloned dApp frontends, fake token claim pages, and wallet drainer sites. Uses GoPlus Security's phishing database. | Check a URL against GoPlus Security’s Web3 phishing records, including reported fake applications and token-claim pages. |
| `pii-redact` | Find and remove personal data in text: names, email addresses, phone numbers, national ID numbers such as Swedish personnummer, addresses and more. | Redact personal details from supplied text. Submitted text is retained unredacted for 90 days before clearing, even though the returned output is redacted. |
| `portuguese-company-data` | Look up Portuguese company data via Openapi.com PT-Advanced (Tier-3 vendor aggregator). Accepts Portuguese NIPC (9 digits). Returns name, registration number, status, registered address, registration date, LEI, primary NACE code, last filing date (from balance-sheet data), and last-update timestamp. Directors are not returned at the *-Advanced tier (Italian product line only). | Look up Portuguese company identity and financial details by NIPC. Director, officer and shareholder information is not included. |
| `product-reviews-extract` | Read the reviews on a product or review page: rating distribution, pros and cons, and sentiment. Trustpilot is not supported, as its terms forbid automated access. | Read visible reviews from a supported public product or review page, including ratings, themes and sentiment. |
| `romanian-company-data` | Look up Romanian company data via Openapi.com WW-Top (Tier-3 vendor aggregator). Accepts Romanian VAT (RO + 8 digits), 13-digit CUI, or 8-digit CUI. Returns name, registration number, status, registered address, registration date, LEI, primary NACE code, and last-update timestamp. PARTIAL coverage — 7-digit CUI entities (legacy banks, older corporations) are structurally rejected by the upstream catalog. | Look up Romanian company details using supported VAT or CUI formats. Seven-digit CUI identifiers are not accepted. |
| `sanctions-check` | Check a person or company against sanctions lists: EU, US OFAC, UN, UK, Swiss SECO, BIS, World Bank, EBRD, ADB and 125 national lists. Returns each match with the list and country it comes from. | Screen a person or company against published sanctions lists, returning potential name matches with their source lists and countries. |
| `slovak-company-data` | Look up a Slovak company in RPO, the Statistical Office's register of legal persons. Returns name, address, legal form, registration details and statutory representatives. | Look up a Slovak company in RPO, including name, address, legal form, registration details and representatives where available. |
| `spanish-company-data` | Look up a Spanish company by CIF/NIF or name in the BORME-based register. Returns identity, status, legal form, current officers and BORME history, across 2.8M+ companies. | Look up a Spanish company by CIF, NIF or name in BORME-derived records, including identity, status, officers and publication history. |
| `swedish-company-data` | Look up a Swedish company at Bolagsverket: name, legal form, status, registered address, SNI industry codes, registration date and any insolvency or liquidation proceedings. | Look up a Swedish company at Bolagsverket by organisation number, including identity, status, address and recorded proceedings. |
| `token-count` | Estimate the token count and cost of a text for GPT-4o, Claude, Gemini, Mistral and Llama models, without calling any model. | Estimate text token counts and costs for supported AI models using character-based rules, without calling a model. |
| `token-security-check` | Analyze a token contract for security risks: honeypot detection, sell tax, hidden ownership, mint functions, proxy status, and holder distribution. Uses GoPlus Security covering 30+ blockchains and 10M+ tokens. | Check a token contract through GoPlus Security for potential trading and ownership risks, including reported honeypot behaviour and mint functions. |
| `tool-call-validate` | Check an LLM's tool call against its JSON Schema and fix type mismatches, such as the string '42' where a number belongs. | Check a tool call against its JSON Schema and repair common type mismatches, such as a number supplied as a string. |
| `trustpilot-score` | Get Trustpilot score and reviews for a domain. Returns trust score, rating distribution, recent reviews. | Read a company’s published review score, rating distribution and recent reviews for a supplied domain. |
| `uk-cop-check` | Check that a UK sort code and account number belong to the name you expect, through the Pay.UK Confirmation of Payee scheme. Returns the match result, the bank, and the registered name when it is a close match. | Compare a UK bank account’s recorded name with the name supplied through Confirmation of Payee. Returns the match result and available bank details. |
| `uk-gazette-notice-search` | Search official UK Gazette insolvency notices by name — corporate winding-up, liquidator appointments, and personal bankruptcy. Returns notice text, dates, and links to the statutory public record. | Search official UK Gazette insolvency notices by name, returning notice text, dates and links to the published record. |
| `us-company-data-cobalt` | US company registry lookup via Cobalt Intelligence — 50-state Secretary of State live SoS data. Covers ~33M+ US private LLCs/corporations. Two input modes: SoS-issued company ID + state, or company name + state. Returns canonical entity info, status, entity type, formed date, address, registered agent, officers, and filings history. Distinct from the SEC-EDGAR-only us-company-data capability. | Look up a US company in one state’s Secretary of State records by company ID or name, with registration, officer and filing details where available. |
| `us-court-search` | Search US federal court records (RECAP dockets) by party name. Returns matching cases with court, date filed, docket number, and absolute URL. Elevates bankruptcy filings as top-level signals (has_bankruptcy_filing, bankruptcy_count, most_recent_bankruptcy) for risk decisioning. Federal district + appellate courts; no state-court coverage. | Search US federal RECAP court dockets by party name, with court, filing date and case links. State court records are not included. |
| `us-ein-match` | US Employer Identification Number (EIN) lookup and name search via Liberty Data EINsearch (~24M EIN database, bureau-derived). Two modes: EIN exact lookup, or business name search (optionally constrained by state). Returns business name, status, formed state, address, and match score for name searches. | Look up a US business by EIN or search by name in EINsearch records, with address, formation state and a match score where available. |
| `us-sec-filings-extended` | Extended SEC EDGAR filings search via sec-api.io. Full-text search across the EDGAR corpus (10-K, 10-Q, 8-K, S-1, proxy, insider Form 4, etc.) by CIK or company name, optionally filtered by form type and date. Supplements the free SEC EDGAR API used by us-company-data with full-text search, cross-form aggregation, and filing-event monitoring. | Search SEC filings by CIK or company name, with optional filing type and date filters. Returns matching filing records and source links. |
| `vat-format-validate` | Check a European VAT number's format against each country's rules, for the 27 EU countries plus the UK, Switzerland and Norway. Format only: use EU VAT Validation to check it in VIES. | Check European VAT number formats and check digits. Use vat-validate for registration checks where supported. |
| `vat-validate` | Check a European VAT number in VIES and get the registered company name, address and validity. Repeat lookups within 48 hours come from cache, and cached data is served while VIES is down. | Check supported VAT numbers against registry services, returning validity and available company details. Cached results can be used during outages. |
| `wallet-risk-score` | Check if a wallet address is associated with malicious activity: phishing, money laundering, darknet, blackmail, or other fraud. Uses GoPlus Security's malicious address database covering 30+ blockchains. | Check a wallet address against GoPlus Security records for potential links to reported malicious activity. |
| `website-to-company` | Identify the company behind a website. Extracts company name from website metadata, detects country from TLD, and looks up the company in the appropriate national registry. Returns registry data for 24 supported countries. | Infer a company name from website metadata and look it up in a supported national registry. Country detection uses country-specific domain endings. |
| `workflow-security-audit` | Audit a GitHub Actions workflow for supply-chain risks: unpinned actions, broad permissions, exposed secrets, trusted publishing and risky triggers such as pull_request_target. | Check a GitHub Actions workflow for supply-chain risks, including unpinned actions, broad permissions, exposed secrets and unsafe triggers. |

Descriptions are unchanged in this commit. In particular, removing a competitor name from a deactivated tool’s description would not authorise restoring that tool. The charity description and its limitation disagree about Scottish coverage; confirm the executor before adopting the proposed narrower general wording.

## Uncertainties and editorial decisions

- `credit-score-band`, entry 2: real `system` values include fico, vantagescore, experian and equifax. Retained the exact lowercase accepted values because integrators need them; these are input values rather than added vendor recommendations. This is the narrow overlap between the no-competitor rule and the exact-input rule.
- `danish-company-data`, entry 2; `norwegian-company-data`, entry 3; `finnish-company-data`, entry 3: retained the original approximate coverage proportions (15%, 15%, 10%). Their provenance and the Finnish percentage’s denominator are not documented in these entries, so they remain unverified estimates rather than newly validated facts.
- `swedish-company-data`, entries 2–3: preserved personal-identity-number handling for sole traders as well as organisation-number-only company lookup. This is not a new name-resolution feature; the workaround asks for an official identifier.
- `italian-company-data`, entry 3: the original says a non-empty shareholder array requires at least one holding of 10% or more; it does not prove that every smaller holder is filtered out. The final title says lists can be empty and the text preserves the original conditional threshold.
- `eurostat-data`, entries 4–5, and `invoice-counterparty-check`, entries 3–5: technical scope is unusually dense. Retained the material country, identifier, truncation, provenance, freshness and downstream reuse constraints in two sentences per entry rather than discarding limits to achieve a shorter paragraph. Removed internal constant names, audit mechanics and vendor negotiations. Eurostat reuse still requires DOI, access date, attribution and modification/non-responsibility notices.
- `company-status-check`, entry 3: explicitly lists supported and excluded countries, as required by its routing test. Removed internal reasons for each exclusion without expanding coverage.
- `cz-company-data`, entry 4; `address-parse`, entry 1: original limitation wording named AI while other manifest metadata describes algorithmic processing. Kept the customer-visible ambiguity/error constraint without asserting the disputed implementation method.
- `trustpilot-score`, `host-exposure-lookup` and other deactivated manifests: copy remains a description of their existing limits; it does not imply activation. No active-status flag or DEACTIVATED entry changed.
- Existing real slug `structured-scrape` is retained as a practical workaround for selector-based extraction, consistent with the explicit tool-reference rule. Ordinary prose does not describe data collection as scraping.
- Commercial source names remain only where already disclosed in `data_source` or where an exact public input/output value is required. New third-party product recommendations were replaced with plain actions.

No other entries remained editorially uncertain after the independent review. Coverage and implementation accuracy were not re-established through paid or live capability calls.

## Review

## Validation

| Command | Result |
|---|---|
| `npm run claims:check` | PASS |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS — existing allowlisted findings only |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `npm run claims:test` | PASS |
| `npm run models:check` | PASS |
| `npm run env:check` | PASS |
| `npm run docs:check` | PASS |
| `npm run programs:check` | PASS |
| `npm run receipts:check` | PASS — existing bare-test-count warnings only |
| `npm run context:check` | PASS |
| `npm run vendors:check` | PASS |
| `npm run design:check` | FAIL / unavailable — pre-existing stale design/brand-kit/quiet-material/opening/manifest.json; no design files differ from HEAD |
| `npm --workspace=packages/mcp-server run build` | PASS |
| `cd apps/api && npx vitest run $(rg -l 'manifests/' src -g '*.test.ts')` | PASS — final rerun passes after restoring excluded-country names and stopping edits during reads |
| `cd apps/api && npx tsx scripts/onboard.ts --batch --manifest-dir ../../manifests --backfill --dry-run` | FAIL / unavailable — ProductionAuthorityError: no production write credential; DB-backed readiness not established |
| `cd apps/api && npx tsc --noEmit` | PASS |
| Parsed full-document comparison and copy/workaround scan | PASS: only allowed scalars changed; no references to 41 deactivated slugs in workarounds |
| `git diff --check` | PASS |
| `git diff --exit-code HEAD -- design` | PASS: confirms design failure is outside this diff |
| `npm run handoff:orient` | PASS |

The initial manifest test run failed on the omitted excluded-country names and on one manifest read while the edit script was writing it. Both causes were addressed; the final rerun after edits stopped passes. No test or allowlist was weakened. Typecheck and MCP build passed. No new tests were needed for this copy-only change.

Trimmed final test output:

```text
Test Files  12 passed (12)
Tests  687 passed (687)
Duration  4.36s (transform 2.55s, setup 200ms, import 8.76s, tests 1.28s, environment 1ms)
```

Trimmed blocked dry-run output:

Live-check outputs: no live capability or production-database calls were made. Database readiness, smoke tests and the live API/site copy are unverified. No credentials were sought.

## Orchestrator continuation

Review and push the local commit, open/merge the PR under the normal review route, then backfill only the changed manifests using the operator-authorised environment. From the repository root, with COPY_COMMIT set to the reviewed commit:

```bash
git diff-tree --no-commit-id --name-only -r "$COPY_COMMIT" -- 'manifests/*.yaml' |
while IFS= read -r manifest; do
  (cd apps/api && npx tsx scripts/onboard.ts --manifest "../../$manifest" --backfill) || exit 1
done
```

Do not use `--discover`, `--fix`, `--skip-gates` or `--force-override-authority` for this copy-only backfill. Then compare `GET /v1/capabilities` limitation values with the committed YAML and inspect representative website tool pages, including Swedish Company Data. Database-backed validation/readiness and smoke checks for active changed tools remain the orchestrator’s production step; deactivated tools stay deactivated.

The local commit hook normally regenerates archive/handoff indexes and the context inventory. The user restricted this batch to manifests plus this report and handoff, so index generation is left to the orchestrator’s integration step; no generated files are included here. The local commit uses a one-command hook override solely to preserve that explicit scope, with structural checks invoked separately. The session handoff gate cannot be green without a push, which the user expressly reserves for the orchestrator.

## Local commit storage and session-gate limitations

The original `npm run handoff:check` failed on uncommitted files, clone-as-trunk branch layout, no branch upstream, and existing merged branches. Fetch also failed. No branch switching, branch deletion or push was attempted: those are outside this agent’s explicit scope. These are reported limitations, not a passed session gate.

The orchestrator can import the local commit without applying a patch:

The separately invoked pre-commit structural gate also fails on `GENERATED_FILE_DRIFT` and `INVENTORY_HASH_DRIFT` for `docs/project/legacy-authority-inventory.json`, because the requested handoff is an inventory target. This is an integration task deliberately left outside the user’s strict file scope, not a passing gate or a pre-existing manifest failure. Regenerate the archive/handoff indexes and context inventory in the integration batch before normal PR checks.

## Review follow-up (2026-10-27)

An independent review of the rewrite found one blocker and three items worth fixing, all applied:

- `patent-search` entry 0 still named the internal headless-browser vendor; it now states only the US, EP and WO coverage.
- `url-to-markdown`, `web-extract`, `tech-stack-detect` and `product-reviews-extract` again name the sites that return a policy error, so an agent can tell in advance whether its URL is affected. The list matches the refused hosts in `apps/api/src/capabilities/lib/tos-blocklist.ts`; the terms-of-service reasoning stays out.
- The ten gated or deactivated tools now say "currently unavailable", so the text does not read as permanent.
- `swedish-company-data` entry 1 no longer leads with personal identity numbers; entry 2 still states the sole-trader behaviour.
