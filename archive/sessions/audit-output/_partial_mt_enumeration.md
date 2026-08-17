# MT — 8-path source enumeration (DEC-20260518-E)

**Investigation date:** 2026-05-18
**Author:** Claude Code (Sonnet 4.6 research agent)
**Test entities:** GO plc (MT company number unknown; MT-prefix VAT MT12826209), Bank of Valletta plc, HSBC Malta p.l.c. Also used Sovereign Directors (Malta) Limited (C 58495) for OpenCorporates probe.
**Current production state:** Routed via Openapi WW-Top at Committed tier, €0.16/call; Tier 1 identity (6/7 fields, no `legal_form`); zero `legalRepresentatives`; single accepted regex `^MT\d{8}$` (MT-prefix VAT); C-prefix MFSA format rejected with 406; some entities return 204 (thin data).
**Question under investigation:** Is there a free or per-call-passthrough path that exposes directors / legal representatives for MT?
**Doctrine applied:** DEC-20260518-E (exhaustive 8-path), DEC-20260518-F (per-call statutory web-UI parse), DEC-20260518-G (full platform-fee probe), DEC-20260428-A (no Strale-operated scrapers).

---

## Executive summary (pre-paths)

**Two credible v1 paths surface.** The current Openapi routing delivers basic identity but deliberately excludes officer/representative data — WW-top does not expose `legalRepresentatives` for MT. However:

1. **Topograph has a live Malta endpoint** (Path 4 / Path 1) with `legalRepresentatives`, `directors`, and `secretaries` extracted from BAROS (Malta Business Registry Online System). Per-call pricing, no subscription floor explicitly disclosed in docs (pricing page gated behind magic-link). Full DEC-518-G probe required at RFQ stage; existing Topograph HR/BE precedent shows no platform fee.
2. **MBR public portal** (`register.mbr.mt`) surfaces directors, shareholders, legal representatives, and secretaries **free of charge** to any natural person, per the EU e-Justice portal (fetched HTTP 200). The portal is a JavaScript SPA — HTTP 403 for direct curl/WebFetch — making this a DEC-20260518-F candidate. However DEC-20260428-A blocks Strale-operated fetches. Assess as v1.1 if Topograph RFQ fails.
3. **MBR's own API packages** (launched March 2026) include a "Full Company Details API" with `involvement` data (interpreted as directors) plus share capital. Explicitly subscription-priced — violates Petter's fixed-monthly-fee prohibition unless per-call supplementary pricing exists. Requires direct RFQ to confirm.
4. **No official bulk CSV/JSON dump** with officer data exists from MBR or Malta's data portal. The EE-pattern (free daily dump) is not replicable for MT.

**Preliminary verdict:** `viable-v1 (pending Topograph RFQ)` — same confidence class as HR. If Topograph platform-fee probe confirms no fixed floor, ship immediately.

---

## Path 1 — Same vendor (Openapi WW-Top), other endpoints

### URLs probed
- `https://openapi.com/products` — full product list fetched, HTTP 200
- `https://console.openapi.com/apis/company/documentation` — documentation index fetched, HTTP 200

### Findings

The Openapi product catalogue lists these worldwide (WW) company endpoints:
- **Company Start — Worldwide** (`WW-start`): `GET /WW-start/{country}/{vatCode_or_companyNumber}` — returns name, VAT, status, registered office, GPS, establishment date. Pricing: €0.055 + VAT per request (PAYG) or €0.055 on subscription with 5,000/month minimum. No directors/representatives field mentioned.
- **Company Advanced — Worldwide** (`WW-advanced`): 40+ data points, financial + operational. No directors field explicitly listed.
- **Company TOP — Worldwide** (`WW-top`): "company profile information, international classifications, financial data." Starting €0.07/request. This is the current MT routing — **no directors/representatives exposed for MT**.

No Malta-specific (MT-*) endpoint exists in the Openapi catalogue. The only country with a dedicated `stakeholders` product is Italy (`IT-stakeholders`, €0.095+, covering executives, shareholders, legal representatives, employees).

The documentation page for WW endpoints does not list `legalRepresentatives` or `directors` as returned fields for MT. Separately confirmed: the current production Strale integration returns 6/7 identity fields and zero representative rows.

**Has Openapi added directors/representatives for MT since 2026-05-11?** No evidence of new MT-specific product. WW-top field schema has not changed for MT based on available documentation.

**Verdict: NOT VIABLE for representatives.** Openapi's WW-top is the correct current slot for MT identity, but the vendor does not expose officer/representative data for Malta under any WW product. An MT-specific stakeholders product does not exist in the catalogue.

**Cost class:** paid_passthrough (€0.07+/call for WW-top identity; zero officer fields regardless of price)
**Representatives in scope:** NO

---

## Path 2 — Direct registry API (MBR — Malta Business Registry)

### URLs probed
- `https://mbr.mt` — fetched HTTP 200; general information, contact: `info.mbr@mbr.mt`
- `https://mbr.mt/2024/11/21/malta-business-registry-to-offer-apis-to-subject-persons/` — fetched HTTP 200; November 2024 API announcement
- `https://thebusinesspicture.com/2026/03/04/malta-business-registry-launches-application-programming-interface-packages/` — fetched HTTP 200; March 2026 launch article
- `https://maltabusinessweekly.com/malta-business-registry-to-offer-apis-to-subject-persons/27705/` — fetched HTTP 200; parallel coverage
- `https://mbr.mt/wp-content/uploads/2026/03/API-Onboarding.pdf` — HTTP 200, 2.2 MB PDF; binary-encoded (no extractable text layer via WebFetch)
- `https://whoswho.mt/en/workshop-with-the-malta-business-registry-let-s-discuss-apis` — fetched HTTP 200; February 2024 CSP workshop notice

### Findings

MBR launched four API packages in March 2026 following a consultation process with Subject Persons (primarily Corporate Service Providers):

| Package | Fields included | Officers/reps? |
|---|---|---|
| **Company Search API** | Company name, registration number, registration date, state | NO |
| **Basic Company Details API** | All of above + registered address, state | NO |
| **Full Company Details API** | All of Basic + "involvement data," share capital, document filing list (title, type, date only) | PROBABLE — "involvement" is the MBR term for officers/directors |
| **Bundle API** | All three APIs in one application | YES (via Full) |

**What "involvement" means for MBR:** Corroborated by two independent sources. (1) The EU e-Justice Portal for Malta states: "Identity of company officials (directors, shareholders, legal representatives, secretaries, auditors)" is available free. (2) The Kyckr 2025 review confirms "officer details including directors and secretaries" are in the MBR system. (3) The IFSP notice title is "MBR Notice: Accessing Involvements with the Malta Business Registry" (page returned 403 from WebFetch but title indexed). The "involvement" field in the Full Company Details API almost certainly maps to directors + representatives.

**DEC-518-G full fee probe — MBR API:**

| Fee dimension | Finding | Source |
|---|---|---|
| Platform fee | NOT DISCLOSED (PDF binary-opaque; contact required) | API-Onboarding.pdf — unreadable |
| Setup fee | NOT DISCLOSED | Same |
| Monthly minimum | NOT DISCLOSED | Same |
| Annual floor | NOT DISCLOSED | Same |
| Subscription fee | **CONFIRMED PRESENT** — "Subscription fee is to be paid for each API for which access is granted" | Malta Business Weekly article |
| Per-call passthrough | NOT DISCLOSED — could be usage-based within a subscription | Same |
| Termination fee | NOT DISCLOSED | Same |
| Volume tiers | NOT DISCLOSED | Same |

**Critical finding:** The MBR API is confirmed to use a **subscription model** per package. The specific amounts are not publicly disclosed (pricing page behind magic-link / PDF). This is **structurally risky** under Petter's cost rule (fixed monthly subscriptions NOT OK in v1) unless the subscription is a nominal activation fee with per-call billing beneath it. Cannot determine without direct RFQ to `ictsupport.mbr@mbr.mt`.

**Eligibility constraint:** APIs targeted at "Subject Persons" — specifically Corporate Service Providers, AML/CFT-obligated entities. Whether a data API platform (Strale) qualifies as a Subject Person for MBR API purposes is ambiguous. MBR's eligibility language refers to entities needing to "integrate their internal systems directly with MBR services through machine-to-machine communication." Strale's use case (real-time per-customer KYB queries) is plausible but not certain.

**Application process:** Email `ictsupport.mbr@mbr.mt` to express interest → onboarding process → subscription agreement. No self-serve signup.

**Verdict: BLOCKED (pending RFQ) — subscription pricing confirmed, amount unknown, eligibility uncertain.** Cannot qualify as v1 without (a) RFQ confirming per-call billing beneath subscription, (b) confirmation Strale qualifies as eligible Subject Person, and (c) DEC-20260518-G compliance on all fee dimensions. Lower priority than Topograph because of eligibility uncertainty on top of fee uncertainty.

**Cost class:** paid_subscription (amount unknown)
**Representatives in scope:** PROBABLE (via "involvement" in Full API)

---

## Path 3 — Direct registry API, free / open tier (data.gov.mt)

### URLs probed
- `https://open.data.gov.mt/registers.html` — HTTP 403 (CDN block on WebFetch)
- `https://open.data.gov.mt/datasets.html?view=Distinct` — HTTP 403
- `https://portal.data.gov.mt/organization/malta-business-registry` — HTTP 403
- `https://portal.data.gov.mt/en_GB/organization/about/malta-business-registry` — HTTP 403
- `https://portal.data.gov.mt/dataset/` — HTTP 403
- Web search: "portal.data.gov.mt malta business registry dataset companies directors CSV download 2025 2026"

### Findings

Malta's Open Data Portal (`portal.data.gov.mt` / `open.data.gov.mt`) is described as a "shared platform for management and support of metadata about Registers and Datasets." Per the Malta Technology Authority (MITA), the portal is the national open data repository.

The portal **blocks automated fetches** (HTTP 403 on all WebFetch attempts). No structured dataset from MBR is directly accessible via WebFetch. Based on web-search evidence:

- The portal lists the MBR as a publisher (`portal.data.gov.mt/organization/malta-business-registry`) but the organization page is 403.
- The Open Company Data Index (OpenCorporates methodology) scores Malta **0/30 for open license** and **0/20 for full-dataset download or open API** — confirming no free open-licensed bulk download of company data exists from official sources.
- Directors score partial (5/10 on OpenCorporates index) — data exists in the registry but is not freely downloadable.
- The data portal contents are described in MITA materials as "works in progress and not to be considered as providing official records."
- No independently-confirmed MBR bulk CSV/JSON dataset with directors has been identified in any web-search result pointing to an actual downloadable file URL.

**No equivalent to Estonia's CC BY 4.0 daily dump (`kaardile_kantud_isikud.json.zip`) exists for Malta.**

**DEC-518-G probe:** Not applicable — no API to probe. The data portal is a metadata catalogue, not a data API.

**Verdict: NOT VIABLE.** No free open-tier API or downloadable dataset with officer/director fields confirmed for Malta. The portal itself is accessible only via browser (JS-rendered); content is works-in-progress; official open data score for MT is near-zero for company data.

**Cost class:** blocked (no free tier identified)
**Representatives in scope:** NO (no open dataset confirmed)

---

## Path 4 — Tier-2 paid per-call aggregators

### 4a. Topograph

**URL probed:** `https://docs.topograph.co/essentials/malta` — fetched HTTP 200, full content retrieved.

**Data fields confirmed:**

| Field | Available | Notes |
|---|---|---|
| `legalRepresentatives` | YES | Array; `type` (individual/company), `role.localName`, `role.standardized`, `individual.name`, `individual.firstName`, `individual.lastName` |
| `directors` | YES | Extracted from BAROS directors array |
| `secretaries` | YES | Separate array |
| `involved_parties` | YES | Includes SUBSCRIBERS type (initial shareholders) |
| `legal_form` | YES | Fills the gap in current Openapi routing |
| `share_capital` | YES | |
| Legal address | YES | |
| NACE/ISIC codes | YES (AI-inferred) | |
| Current shareholders | PARTIAL | "Initial subscribers at incorporation only"; current ownership requires document retrieval |

**Identifier accepted:** Company Number in `C + space + digits` format (e.g., `C 2833`). The space is part of the official format. MT-VAT not confirmed as direct search input.

**Data source:** BAROS (Malta Business Registry Online System) — official registry, single source.

**Example response structure (from docs):**
```json
{
  "legalRepresentatives": [
    {
      "type": "individual",
      "role": { "localName": "Director", "standardized": "Director" },
      "individual": { "name": "...", "firstName": "...", "lastName": "..." }
    }
  ]
}
```

**DEC-518-G full fee probe — Topograph:**

| Fee dimension | Finding | Source |
|---|---|---|
| Platform fee | NOT DISCLOSED on public docs; pricing page (`topograph.co/pricing/mt`) returns blank content (gated) | Pricing page — no content rendered |
| Setup fee | NOT DISCLOSED | Same |
| Monthly minimum | NOT DISCLOSED — docs state "pay-per-request, no bulk contracts, no minimum commitments" generically | docs.topograph.co/introduction |
| Annual floor | NOT DISCLOSED | Same |
| Per-call rate | NOT DISCLOSED for MT specifically; docs say "Malta documents are paid (see pricing)" | docs.topograph.co/essentials/malta |
| Subscription | NOT DISCLOSED | Same |
| Termination fee | NOT DISCLOSED | Same |
| Volume tiers | NOT DISCLOSED | Same |

**Key precedent from HR enumeration (same vendor):** The HR docs page stated "pay-per-request, no bulk contracts, no minimum commitments" — confirmed at RFQ stage to have no platform floor for HR. This language appears in the Topograph introduction docs without country-specific carve-outs. The same doctrine-check that reversed the HR "blocked" verdict applies here: Topograph's stated model is per-call, and there is no evidence of a Malta-specific platform fee. However, the HR audit found a magic-link pricing gate — MT pricing requires the same RFQ to confirm.

**Document costs:** Topograph explicitly states "Malta documents are paid" with a 99-year deduplication TTL. This means document retrieval (e.g., annual returns, incorporation certificates) carries a separate per-document fee beyond the data query. Officer data appears to be in the base company data response, not in documents.

**Topograph DEC-20260428-A compliance:** Topograph sources from BAROS (official registry). The data is statutory public record (Companies Act Cap. 386). Vendor attestation required per DEC-20260428-A workflow, same as HR. Topograph has precedent (HR accepted) suggesting attestation can be obtained.

**Verdict: VIABLE-V1 (pending RFQ + DEC-20260428-A vendor attestation).** All officer/representative fields are live and confirmed in the docs. Per-call model stated. Pricing amount requires RFQ to `app.topograph.co` (magic-link signup). Confidence: HIGH that the cost model fits; LOW on actual per-call price until RFQ.

**Cost class:** paid_passthrough (per-call, no subscription floor expected — unconfirmed)
**Representatives in scope:** YES — confirmed

---

### 4b. Kyckr

**URL probed:** `https://www.kyckr.com/blog/malta-business-registry-search-2025` — fetched HTTP 200. `https://developer.kyckr.com/guides/company-v2/getting-started/api-workflow/` — fetched HTTP 200.

**Findings:** Kyckr offers API access to Malta company data including directors and secretaries. Enhanced Profile endpoint (`GET /companies/{kyckrId}/enhanced`) returns "Company officials." Workflow: search → retrieve Lite or Enhanced Profile → order documents. Pricing: **not published**; "contact Kyckr" required. Datarade profile: "Kyckr has not published pricing information." TrustRadius page: "Kyckr Pricing 2026" — no figures disclosed.

Historical market context: Kyckr has been positioned in the £3–10/lookup range for European registries per HR audit research. The Kyckr blog page confirms Malta coverage and explicitly mentions the €5 per-request fee for the Registry of Beneficial Owners (NOT the same as company officers).

**DEC-518-G probe:** All dimensions undisclosed. RFQ required. Probable subscription or enterprise model (no self-serve pricing visible anywhere).

**Verdict: VIABLE-V1.1 fallback.** Officers confirmed, pricing requires RFQ. Lower priority than Topograph because Topograph has explicit `legalRepresentatives` field documented.

**Cost class:** paid_subscription or paid_passthrough (unknown)
**Representatives in scope:** YES (officers confirmed, but field schema less explicit than Topograph)

---

### 4c. Creditinfo Malta

**URL probed:** `https://creditinfo.com.mt/products-services/company-credit-reports/` (redirect from mt.creditinfo.com) — fetched HTTP 200.

**Findings:** Creditinfo Malta provides company credit reports containing "directors and shareholders with their respective percentage shareholding, the Company Secretary, and the Legal and Judicial Representation." Data sourced from "official sources." Pricing: "by subscription" (wording from site) — no amounts disclosed. No per-call or API tier mentioned; appears to be a premium subscription-based credit bureau product, not a lightweight per-call data API.

**DEC-518-G probe:** Subscription confirmed. All other dimensions undisclosed.

**Verdict: NOT VIABLE-V1.** Subscription model, credit bureau positioning, no per-call API visible.

**Cost class:** paid_subscription
**Representatives in scope:** YES (but via subscription product)

---

### 4d. OpenCorporates

**URL probed:** `https://opencorporates.com/pricing/` — fetched HTTP 200. `https://api.opencorporates.com/v0.4/companies/mt/C58495` — HTTP 401 (token required). `https://api.opencorporates.com/v0.4/companies/search?q=GO+plc&jurisdiction_code=mt` — HTTP 401 (curl probe; error: "Invalid Api Token").

**Findings:** OpenCorporates has Malta coverage (register 152, sourced from MBR). Officers/directors are in scope (partial score on Open Data Index). Pricing:
- **Essentials:** £2,250/year (£225/month) — 500 calls/month
- **Starter:** £6,600/year
- **Basic:** £12,000/year
- No PAYG / per-call tier

Annual subscription starting at £2,250/year is a fixed recurring cost — **violates Petter's cost rule**.

**Verdict: NOT VIABLE-V1.** Subscription-only, no per-call tier.

**Cost class:** paid_subscription (£2,250+/year)
**Representatives in scope:** YES (partial coverage)

---

### 4e. TransactionLink

**URL probed:** `https://docs.transactionlink.io/docs/v1/integrations/malta-business-registry.md` — fetched HTTP 200 (overview only). `https://docs.transactionlink.io/docs/integrations/malta-business-registry/company-profile/get-company` — HTTP 404 (moved/renamed).

**Findings:** TransactionLink has a Malta Business Registry integration under `v1/integrations/malta-business-registry.md` with three endpoints: Company Profile, List Companies, Get Company. The overview does not enumerate fields. The detailed Get Company endpoint (the one that would show schema) returned 404 — likely reorganized into docs that require account login. TransactionLink's pricing model (from other-country research) is subscription-based. No per-call PAYG evidence.

**Verdict: NOT VIABLE-V1 (probable subscription model; pricing unconfirmed for MT).** May be viable as v1.2 fallback if Topograph and Kyckr both fail RFQ.

**Cost class:** paid_subscription (probable)
**Representatives in scope:** UNKNOWN (field schema not accessible)

---

### 4f. Schmidt & Schmidt

**URL probed:** `https://schmidt-export.com/extracts-foreign-commercial-registers-and-accounting-statements/extracts-commercial-register-malta` — fetched HTTP 200.

**Findings:** Schmidt & Schmidt provides per-document Malta registry extracts:
- Company Search Report (includes directors, shareholders, legal/judicial representatives, ID numbers, addresses, nationalities): **£138 per document** (~€160)
- Certificate of Good Standing: £300
- Expedite fee: £75 additional
- No subscription, no minimum — purely per-document.

£138/document for a company extract is far outside the acceptable per-call price band for a platform that prices individual calls at €0.16. Not operationalizable as an API-backed capability at any reasonable margin.

**Verdict: NOT VIABLE-V1.** Price band wrong (£138/document vs. €0.16 current call price).

**Cost class:** paid_passthrough (per-document, £138+)
**Representatives in scope:** YES (in Company Search Report)

---

## Path 5 — Statutorily-public web UI (DEC-20260518-F assessment)

### URL probed
- `https://register.mbr.mt/app/home` — HTTP 302 → `https://register.mbr.mt/app/home` (redirect loop; final page HTTP 403 from WebFetch)
- `https://register.mbr.mt/app/query/search_for_company` — HTTP 403 (JavaScript SPA, requires browser rendering)
- `https://register.mbr.mt/app/query/search_for_company?name=GO+plc` — HTTP 403

### Findings from authoritative secondary source

The EU e-Justice Portal (fetched HTTP 200 from `https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/mt_en`) explicitly states:

> "Public information at no cost includes: Company names and registration numbers, Registered address, Date of incorporation, Share capital, **Identity of company officials (directors, shareholders, legal representatives, secretaries, auditors)**"

> "Access to other company documentation is provided for a minimal charge" (notifications, annual accounts, beneficial owner details)

The MBR promo page (`https://mbr.mt/promo/company-search/`) confirms: "users may now search company information and purchase company documents **without the need to subscribe for an account** on the MBR Online System."

The portal is a JavaScript SPA (Angular or similar) hosted at `register.mbr.mt`. It returns HTTP 403 or renders empty on direct HTTP probes — consistent with all other JS-SPA registries encountered in Phase 2/3 (EE ariregister, IE CRO, etc.).

### DEC-20260518-F constraint check (per-call statutory parse)

| Constraint | Status | Evidence |
|---|---|---|
| (a) Statutorily public | SATISFIED | Companies Act Cap. 386; EU e-Justice confirms free public access |
| (b) ToS permits per-call | NOT VERIFIED — MBR terms not found in public HTML; portal returns 403 | ToS page not accessible via WebFetch |
| (c) Per-entity per-customer-request not bulk | SATISFIABLE — design pattern is one call per customer request | Architectural constraint only |
| (d) Attribution preserved | SATISFIABLE — MBR as source, `register.mbr.mt` as URL | Standard provenance field |

**Constraint (b) is the blocker:** MBR's terms of service for the public portal are not accessible via WebFetch (portal is 403 on all paths). Must be manually verified in a browser session. If the ToS permits automated per-call retrieval (some EU registries do, some prohibit systematic access), this path becomes viable under DEC-20260518-F.

**DEC-20260428-A overlay:** Even if all four DEC-518-F constraints are satisfied, the portal requires a Browserless-rendered session (JavaScript SPA). This means **Strale would operate the browser fetcher** — triggering the Tier 1 absolute prohibition under DEC-20260428-A. The only escape is if a vendor (e.g., Topograph) operates the fetch and licenses the result to Strale.

**Session-token / CAPTCHA assessment:** The portal is described in multiple sources as an "online system" requiring authentication for some operations (2FA + ID verification for account-based operations per Kyckr blog). However, the public search for basic company data + officers is explicitly stated as no-account-required. Whether the public search is CAPTCHA-protected is unknown — not testable via WebFetch.

**Document pricing:** Per the fee announcement (`mbr.mt/2025/05/02/malta-business-registry-fees/`), document retrieval costs are €0.50 per sheet. The free public officer view (directors, representatives) does NOT require document purchase — it is in the free entity detail view, per e-Justice portal. This is important: director data is in the FREE layer, not behind the paid document layer.

**Verdict: BLOCKED under DEC-20260428-A (Strale-operated browser fetch prohibited).** Would be viable under DEC-518-F if operated via a licensed vendor. Topograph (Path 4a) IS the licensed-vendor equivalent of this path — it fetches from BAROS on Strale's behalf with proper attribution. Path 5 directly resolves into Path 4a for v1 purposes.

**Cost class:** free_unlimited (no charge for officer view in free public layer)
**Representatives in scope:** YES — confirmed by EU e-Justice portal

---

## Path 6 — Open data bulk download

### URLs probed / searches conducted

- Web search: "Malta Business Registry open data bulk download companies CSV JSON directors officers license"
- Web search: "Malta open data 'companies' OR 'business registry' bulk download CSV JSON officers directors license CC BY OR open 2024 2025"
- Web search: "portal.data.gov.mt 'malta business registry' dataset companies directors CSV download 2025 2026"
- `https://github.com/eic-network/malta-files` — fetched HTTP 200
- `https://portal.data.gov.mt/dataset/` — HTTP 403

### Findings

**No official MBR bulk download with officer data identified.**

The Malta Open Data Portal (`portal.data.gov.mt`) blocks automated access (HTTP 403 consistently). Web search results for the portal confirm no publicly-indexed bulk download of MBR company data with directors/officers exists at a file URL.

The Open Company Data Index (OpenCorporates scoring) gives Malta:
- **0/30 for open license** — no CC-licensed company dataset
- **0/20 for full-dataset download or open API** — no bulk download available
- **5/10 for director data** — data exists in registry but not freely downloadable

**The EE-pattern (CC BY 4.0 daily dump containing all officers) is NOT available for Malta.**

**eic-network/malta-files (GitHub):**
- Repository: `https://github.com/eic-network/malta-files`
- Content: Scraped version of public Malta Registry, organized in CSV + JSON by nationality
- Fields: "All details in the companies list, plus extra information from lookup — entities (people and companies) declared as involved parties (shareholders)"
- License: Not stated (no LICENSE file visible in README)
- Last updated: Not stated; linked to an investigative journalism project (EIC network)
- **Usability assessment:** Unofficial scraped data (Strale's Tier 1 absolute prohibition applies — consuming data derived from Strale-equivalent scraping is the same Tier 1 risk). No license = no reuse rights. Not a Tier-2 viable source. Informational reference only.

**Commercial bulk data vendors (not open data):**
- InfobelPRO: 74.6k Malta companies via API + bulk flat file (custom pricing, not open)
- CompanyData: bulk CSV/Excel, 74k+ entities (pricing on request)
- HitHorizons: CSV filter/download (subscription)
- None of these qualify as free/open-licensed; all are proprietary resellers.

**Verdict: NOT VIABLE.** No official free bulk download with officer data exists for Malta. The EE path is not replicable. Commercially available bulk datasets are proprietary and subscription-priced.

**Cost class:** blocked (no open bulk dataset)
**Representatives in scope:** NO (in open format)

---

## Path 7 — Tier-2 commercial bulk under DEC-20260428-A

### Searches conducted

- Web search: "Malta Business Registry API 'subscription' fee 'per month' OR 'annual' OR 'monthly' 2026"
- Research on InfobelPRO, CompanyData, HitHorizons, DatoCapital

### Findings

**DatoCapital (`datocapital.mt`):**
- Coverage: 258,529 companies; 207,999 directors in Malta
- Includes: company appointments, related companies, cross-border director information
- Pricing: Not disclosed on main page; separate pricing link exists but content not returned
- Access: "Sign Up Free" to explore — suggests freemium model
- API: Not mentioned; appears to be a web portal / downloadable reports
- DEC-20260428-A assessment: DatoCapital describes itself as a company/director search product, not a bulk licensed data vendor. Sourcing from MBR (statutory public) is presumed but not attested.

**MBR as bulk licensor directly:** Not identified. MBR's commercial offering is the subscription API (Path 2), not a bulk data license.

**No Tier-2 vendor offering a bulk Malta dataset with officers under a documented redistribution right + DEC-20260428-A-compatible attestation has been identified.** Topograph (Path 4a) is the closest — it accesses BAROS per-call (not bulk) but satisfies the redistribution/provenance requirements of DEC-20260428-A.

**Verdict: NOT VIABLE as standalone path.** No dedicated commercial bulk Malta dataset with officers under a DEC-20260428-A-compliant license identified. The Topograph per-call path (Path 4a) is superior in every dimension.

**Cost class:** blocked (no qualifying bulk vendor found)
**Representatives in scope:** NO (no qualifying vendor)

---

## Path 8 — Gazette / historical PDF parsing

### URLs probed
- `https://www.gov.mt/en/Government/DOI/Government%20Gazette/Pages/Government-Gazzette-Repository.aspx` — HTTP 403
- `https://www.gov.mt/en/Government/DOI/Government%20Gazette/Pages/default.aspx` — HTTP 403
- `https://govcms.gov.mt/en/Government/DOI/Government%20Gazette/Documents/2026/02/Government%20Gazette%20-%2017th%20February%202026.pdf` — ECONNREFUSED (network block)
- Web search: "Malta Gazette 'Gazzetta tal-Gvern' directors appointment company commercial 2025 machine-readable structured data"

### Findings

The Malta Government Gazette (Gazzetta tal-Gvern ta' Malta), published by the Department of Information:
- **Format:** PDF-only since 2015 (digital-only; 25 physical copies per edition retained)
- **Archive:** Available at `gov.mt` — portal is 403 on WebFetch but PDFs are at predictable URLs (pattern: `govcms.gov.mt/en/Government/DOI/Government%20Gazette/Documents/{year}/{month}/Government%20Gazette%20-%20{day}th%20{Month}.pdf`)
- **Content:** Acts of legislation, government notices, tenders, court decrees, planning permits. Specifically: "officer appointments, directors, and company formation notices" per web search result (Scribd documents confirm commercial notice sections)
- **Cost:** Fee announced 2025-06-01 — publication of notices in daily newspaper: €100 for partner appointments/cessations, €100–€200 for mergers. This is the fee paid by the filer, not by data consumers. The Gazette PDFs themselves are free to access.
- **Machine-readable:** NO structured XML/JSON format. PDF-only, no API for gazette content.

**Assessment against DEC-20260518-F and DEC-20260428-A:**
- Gazette is publicly published statutory document — satisfies (a)
- Government publications in Malta do not carry restrictive ToS per standard practice — likely satisfies (b)
- But: Gazette is PDF; extracting directors from gazette PDFs requires Claude LLM parsing — this is a Strale-operated browser/parser operation → Tier 1 DEC-20260428-A prohibition
- More importantly: Gazette records company formation notices at incorporation time. It does NOT reliably record ongoing director changes unless filed as a notice. The primary source for current directors is BAROS (Path 5 / Path 4a), not the Gazette. The Gazette is a **historical / appointment-event** source, not a current-state source.
- Gazette-derived director data is necessarily incomplete (only incorporations + formal notices filed), stale for entities that changed directors without gazette filing, and requires significant PDF parsing infrastructure.

**Verdict: NOT VIABLE for v1 — derivative dataset requiring Strale-operated PDF parsing (DEC-20260428-A Tier 1 absolute prohibition), plus inherent coverage gaps (incomplete for director changes post-incorporation).** Noted as v2 consideration if historical appointment events become a customer requirement.

**Cost class:** free_unlimited (gazette PDFs are publicly free; construction cost is engineering)
**Representatives in scope:** PARTIAL (only at incorporation / formal notice events; not current state)

---

## Path 9 — Other MT-specific surfaces

### 9a. Malta PSC / Beneficial Ownership Register

**Research:** Web search "Malta beneficial owners registry PSC persons with significant control register public 2025 2026" + `https://www.openownership.org/en/map/country/malta/` (HTTP 200).

**Findings:**
- Malta has a Register of Beneficial Owners (RBO) operated by MBR, established under Companies Act (Register of Beneficial Owners) Regulations
- **Access:** Restricted to persons demonstrating "legitimate interest in the prevention and combating money laundering" — per Legal Notice 127 of 2025 implementing 6AMLD. Following CJEU Nov 2022 ruling, Malta's BO register is **no longer publicly accessible**. Cost: **€5 per request** (confirmed by Kyckr blog) for those with legitimate interest; general public cannot access.
- **Open Ownership assessment:** "Structured data not publicly available; not published in BODS format"
- Malta has no Companies-House-style PSC register with free public access. The UK PSC regime (post-Brexit) has no Malta equivalent.

**Verdict: NOT VIABLE.** RBO is gated behind legitimate-interest verification + €5/request. Not comparable to UK PSC. Cannot use for representative coverage.

---

### 9b. MFSA (Malta Financial Services Authority) company search

**Research:** Web search for MFSA company data; initial probe of `mfsa.mt`.

**Findings:** The MFSA previously operated the Registry of Companies before MBR was established as a separate entity (Subsidiary Legislation 497.27). The registry domain `registry.mbr.mt` is the successor to what was historically accessible via MFSA. Today MFSA handles financial services authorization (investment firms, fund managers, etc.) — not the general commercial register. OpenCorporates still labels register 152 as "Malta Financial Services Authority" for historical reasons, but the actual data source is now MBR/BAROS.

No separate MFSA API exists for commercial company director data. MFSA data surfaces duplicate to BAROS.

**Verdict: NOT APPLICABLE.** MFSA is the historical predecessor registry — today all company data flows through MBR/BAROS.

---

### 9c. EU Business Register Interconnection System (BRIS)

**Research:** EU e-Justice Portal cross-link; European Business Register interconnect.

**Findings:** Malta participates in BRIS (the EU Business Register Interconnection System) per the Companies Law Directive 2017/1132 transposition. The EU e-Justice Portal confirms BRIS access for basic company data. However, BRIS/e-Justice delivers only the basic identity layer (name, registration number, status, address) — NOT officer/representative data, which is not mandated by HVD Implementing Regulation 2023/138 (§5.1 mandate covers only identity fields, not representative names per doctrine caveat). The BRIS interface for Malta resolves to `register.mbr.mt` for detailed queries.

**Verdict: NOT VIABLE for representatives.** BRIS identity fields only; no officer extension.

---

### 9d. Identifier format gap — C-prefix vs MT-prefix

**Finding confirmed:** The current Strale production regex for MT is `^MT\d{8}$` (MT-prefix VAT). Topograph's Malta endpoint uses `^C\s+\d+$` (C-prefix MFSA/MBR format, e.g., `C 2833`). These are different identifier spaces. To use Topograph for MT representative coverage:

1. Strale must accept C-prefix identifiers (currently rejected with 406)
2. OR implement a MT-VAT → C-number resolution step (MBR search by VAT → get company number)
3. OR route MT-VAT directly through Topograph's name/VAT search

The Topograph docs confirm: "No VAT search available through BAROS." This means MT-VAT-keyed requests cannot be directly resolved by Topograph — a search step is required. This is an implementation consideration for the capability design, not a blocker.

---

## Per-Path findings table

| Path | Source | Representatives in scope | Cost class | Status | Key evidence |
|---|---|---|---|---|---|
| 1 | Openapi WW-Top (current vendor) | NO | paid_passthrough | NOT VIABLE | WW-top has no officers for MT; no MT-specific stakeholders product exists |
| 2 | MBR direct API (subscription) | PROBABLE | paid_subscription | BLOCKED (RFQ) | "Subscription fee paid per API" confirmed; "involvement" = officers; pricing + eligibility unverified |
| 3 | data.gov.mt open data portal | NO | blocked | NOT VIABLE | 0/30 open license score; no bulk download with officers; portal 403 on WebFetch |
| 4a | Topograph (per-call) | YES | paid_passthrough | VIABLE-V1 (pending RFQ) | `legalRepresentatives` + `directors` + `secretaries` documented; per-call model stated; price RFQ required |
| 4b | Kyckr (per-call) | YES (officers) | paid_passthrough or subscription | VIABLE-V1.1 | Officers confirmed; field schema less explicit; pricing fully RFQ-gated |
| 4c | Creditinfo Malta | YES | paid_subscription | NOT VIABLE | Subscription model; credit bureau product, not API |
| 4d | OpenCorporates | YES (partial) | paid_subscription | NOT VIABLE | £2,250+/year subscription only; no PAYG |
| 4e | TransactionLink | UNKNOWN | paid_subscription (probable) | NOT VIABLE | Field schema inaccessible; probable subscription |
| 4f | Schmidt & Schmidt | YES | paid_passthrough | NOT VIABLE | £138/document — price band incompatible |
| 5 | MBR public portal (web UI) | YES (confirmed FREE) | free_unlimited | BLOCKED (DEC-20260428-A) | JS SPA requires browser; Strale cannot operate fetcher; ToS unverified; resolves to Topograph as proxy |
| 6 | Open data bulk download | NO | blocked | NOT VIABLE | No official MBR bulk dump with officers; 0/20 OC score; EE-pattern not available |
| 7 | Tier-2 commercial bulk | NO | blocked | NOT VIABLE | No DEC-20260428-A-compliant bulk licensor identified |
| 8 | Government Gazette PDF | PARTIAL | free_unlimited | NOT VIABLE (DEC-20260428-A + coverage gaps) | PDF-only, Strale-operated parse prohibited, incomplete for director changes |
| 9a | Malta RBO (beneficial owners) | NO (legitimate-interest gate) | paid_passthrough | NOT VIABLE | €5/request + eligibility gate; not PSC-equivalent |
| 9b | MFSA | NO | — | NOT APPLICABLE | Historical predecessor; today = MBR/BAROS |
| 9c | BRIS/EU e-Justice | NO | free | NOT VIABLE | Identity only; no officer extension via HVD 2023/138 |

---

## Verdict

**Overall verdict:** `viable-v1 (pending Topograph RFQ)`
**Confidence:** HIGH (on path existence); MODERATE (on cost fit pending RFQ)

### v1 path

**Path 4a — Topograph**
- Data source: BAROS (MBR official registry), via Topograph per-call API
- Fields gained: `legalRepresentatives` (directors), `secretaries`, `involved_parties`, `legal_form` (also fills existing gap)
- Cost class: paid_passthrough (per-call); amount requires RFQ
- DEC-20260428-A compliance: Topograph operates fetcher → Strale is Tier-2 consumer of vendor-fetched statutory public data. Vendor attestation required.
- Implementation note: C-prefix identifier format (`C + space + digits`) required; MT-VAT → C-number resolution step needed if VAT is the input. Topograph does not support direct VAT-keyed lookup for Malta.
- Blocker to clear: (1) Topograph RFQ for MT per-call price; (2) Confirm no platform fee / monthly minimum; (3) DEC-20260428-A vendor attestation from Topograph.

### v1.1 path (fallback)

**Path 4b — Kyckr** (if Topograph RFQ fails on price)
- Data source: MBR via Kyckr Enhanced Profile
- Fields: "Company officials" (directors, secretaries) confirmed; exact field schema requires API trial
- DEC-20260428-A compliance: Same Tier-2 pattern; attestation required
- Blocker: Pricing RFQ; subscription risk higher than Topograph

### v1.2 path (if all aggregators fail)

**Path 2 — MBR direct API** (if subscription is acceptable or per-call beneath subscription confirmed)
- Requires: (1) Eligibility confirmation as Subject Person; (2) Fee structure RFQ; (3) "Involvement" field confirmed = directors; (4) Subscription amount acceptable or per-call billing confirmed

---

## Doctrine compliance log

**DEC-20260518-E (Exhaustive 8-path enumeration):** SATISFIED. All 9 paths (including extended Path 9) documented with live URL probes, HTTP status evidence, and field-level findings. No path halted early.

**DEC-20260518-F (Per-call statutory web UI parse — Path 5):** ASSESSED. Four constraints evaluated individually. Constraint (b) ToS not verified (portal 403). Constraint blocking: DEC-20260428-A (Strale-operated browser fetch). Path 5 resolves into Path 4a (Topograph as the licensed vendor operating the fetch).

**DEC-20260518-G (Platform-fee probe — Paths 2 and 4a):**
- MBR API (Path 2): Subscription fee CONFIRMED; all other dimensions (platform fee, setup, annual floor, termination) NOT DISCLOSED → RFQ required.
- Topograph (Path 4a): "Pay-per-request, no minimum commitments" stated in docs; pricing page gated (blank on WebFetch). No evidence of platform fee; prior HR audit confirmed no platform floor for that country. MT-specific RFQ still required per DEC-518-G.
- DEC-518-G is satisfied for scope; final confirmation requires RFQ on both paths.

**DEC-20260428-A (No Strale-operated scrapers):**
- Path 5 (MBR SPA): BLOCKED — Strale cannot operate browser fetcher
- Path 8 (Gazette PDF): BLOCKED — Strale cannot operate PDF parser
- Path 6 (eic-network GitHub scrape): BLOCKED — consuming scraped data without clean vendor license
- Paths 4a/4b/4c (Topograph, Kyckr, Creditinfo): ALLOWED under Tier-2 — vendor operates fetcher, statutory public data, vendor attestation path exists
- MBR API (Path 2): ALLOWED under Tier-2 — MBR is the registry itself, no scraping

**EU 2023/138 CAVEAT (applied):** Not cited as a mandate for representative-content exposure. Malta participates in BRIS but BRIS carries only identity fields per §5.1. The Companies Act Cap. 386 governs representative disclosure and makes it publicly accessible — but this is a national law right, not an HVD chain mandate.

---

## All caveats logged

1. **Topograph pricing is opaque.** The pricing page renders blank on WebFetch. The RFQ is mandatory before committing. The absence of a disclosed platform fee is promising (consistent with HR precedent) but not confirmed. If MT carries a per-country platform fee (e.g., document access minimum), it would violate v1 cost discipline.

2. **C-prefix identifier format.** Current Strale MT regex (`^MT\d{8}$`) accepts only VAT numbers. Topograph requires C-prefix (`C + space + digits`). An identifier-resolution step (name search or VAT → company number lookup) is needed to bridge the input format. This is solvable but adds one RTT of latency.

3. **MBR API "involvement" field interpretation.** The term "involvement" is the MBR's label for what the EU e-Justice portal calls "company officials." This is corroborated by the Topograph docs (which source from BAROS and return `legalRepresentatives`) and by the IFSP notice title. However, the exact fields returned by MBR's own Full Company Details API have not been directly probed — the API-Onboarding.pdf is binary-opaque.

4. **MBR Subject Person eligibility.** The MBR API is targeted at Subject Persons for AML/CFT compliance. Strale's positioning as a data platform may or may not qualify. This is a deal-specific negotiation risk, not a technical one.

5. **Portal 204 (thin data) for some MT entities.** The current Openapi WW-Top routing returns 204 for some MT entities. This may be a Openapi-side data gap, not an MBR gap. Topograph sourcing from BAROS directly should have broader coverage, but thin-data 204s may still occur for dissolved or struck-off entities.

6. **No open bulk download.** The EE pattern (free CC BY 4.0 daily dump with all officers) cannot be replicated for Malta. Malta scores near-zero on open data indices for company data. Any v1 path requires a paid vendor relationship.

7. **Beneficial Ownership Register not public.** Following CJEU Nov 2022 ruling, Malta's RBO requires legitimate-interest demonstration + €5/request. Not relevant for representative/director coverage (directors are public; UBO is not).
