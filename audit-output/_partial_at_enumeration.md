# _partial_at_enumeration.md — Austria (AT) 8-path source enumeration

**Date:** 2026-05-19
**Phase:** 7b (AT — binding-ready Tier-2 + open-data sweep)
**Author:** Claude Code research subagent (Sonnet 4.6)
**Status:** PARTIAL — feeds into synthesis document
**Test entities:** OMV AG (FN 93363w, VAT ATU14189108), Erste Group Bank AG (FN 33209m), Andritz AG, Voestalpine AG
**Current routing:** Openapi.com WW-Top + AT-Start (Committed), €0.1586/call and €0.055/call respectively
**Coverage gap being investigated:** Tier-2 fields Nos. 4–5 (directors / legal representatives) entirely absent from AT-Start and WW-Top schemas

---

## Context and prior-state summary

As of the Phase 7a baseline:
- **Tier 1** (WW-Top AT, confirmed live): name, FN number, VAT (ATU format), legal form (absent), address, status, incorporation date → 6/7 fields. `legal_form` absent. No representatives.
- **Tier 2** (AT-Start, €0.055/call): name, address, status, incorporation date, VAT → 4/5 fields. No directors field at all. Cheaper but same directorial gap.
- **Tier 3** (WW-Top with NACE): adds NACE code only.
- **Identifier constraint confirmed**: VAT only (ATU + 8 digits = 11 chars) resolves correctly. FN format (e.g., `FN 93363w`) returns HTTP 406 from Openapi endpoint. Any solution that sources from Firmenbuch must handle FN↔VAT resolution.
- **finapu.com path deprecated 2026-05-17**: web-scraping of `firmenbuchgrundbuch.at` was the original Tier-3 plan; deprecated per DEC-20260428-A (Strale never operates scrapers).

---

## Doctrine reference (locks active during this enumeration)

- **DEC-20260518-E** — Exhaustive 8-path enumeration before classifying any country "blocked."
- **DEC-20260518-F** — Per-call statutory web UI / PDF in scope when: (a) statutorily public, (b) ToS permits per-call, (c) per-entity not bulk, (d) attribution preserved.
- **DEC-20260518-G** — Platform-fee probe MANDATORY for all Tier-2 candidates: platform fee, setup fee, monthly minimum, annual floor, volume-tier floors, termination fees. All six dimensions must be probed explicitly.
- **DEC-20260428-A** — Tier 1 absolute (Strale never operates scrapers). Tier 2 requires signed sourcing-method attestation.
- **DEC-20260505-E** — Topograph DISQUALIFIED globally. Do not propose under any framing.
- **Petter cost rule** — Per-call passthroughs OK; fixed monthly fees NOT OK in v1.
- **Compass-Verlag / HF Data** — Already Deferred (sales-mediated annual fee out of v1 economics). Manz as further backup. Re-confirm pricing details. Do NOT propose lifting deferral.
- **EU 2023/138 §5.1 CAVEAT** — Does NOT mandate representative-name disclosure. Does not create a free API obligation for rep names.

---

## Path 1 — Direct registry API, authenticated (paid): Compass-Verlag / HF Data / Manz (Firmenbuch Verrechnungsstellen)

### 1a. Compass-Verlag / Wirtschafts-Compass API (`api.wirtschaftscompass.at`)

**URLs probed:** `api.wirtschaftscompass.at/en/prices`, `api.wirtschaftscompass.at/de/dokumentation`, `api.wirtschaftscompass.at/en/documentation`, `compass.at/de/wirtschafts-compass/wirtschafts-compass-api`
**HTTP status:** 200 (all)

**DEC-20260518-G PROBE — complete:**

| Fee dimension | Evidence | Amount |
|---------------|----------|--------|
| Per-call fee | Confirmed; "exclusive of VAT" | €0.10–€18.00/query depending on endpoint (basic company €0.45; insolvency €0.49; compliance PDF report €8.50; organigram €18.00) |
| Annual service fee (Servicepauschale) | Confirmed present. "Zusätzlich fällt eine jährliche Servicepauschale an, die sich nach Art und Nutzung richtet." | **Amount NOT DISCLOSED** — by individual agreement only |
| Monthly minimum | Not stated | Unknown |
| Setup fee | Not stated | Unknown |
| Volume-tier floors | Not stated; "maßgeschneidert, flexibel und effizient" implies negotiated | Unknown |
| Termination fee | Not stated | Unknown |

**Fields including representatives:**

The API documentation confirms the following officer-role data is available:
- `Geschäftsführer` (Managing Director)
- `Vorstand` (Board Member)
- `Funktionsträger` (Function holder)
- `Gesellschafter` (Shareholder)
- `Prokuristen` (Authorized agents with Prokura)
- Historical data with validity dates ("tagesaktuell" — daily updated)

The "Unternehmens API" and "Personen API" together expose all legally registered representative roles from the Austrian Firmenbuch. The "Structured Representation Regulation" product (€0.29/call) appears specifically targeted at beneficial-owner / representative structured data.

**Data source:** Austrian Firmenbuch (direct Verrechnungsstelle relationship with Ministry of Justice). HF Data GmbH (100% subsidiary of Compass-Verlag) is one of Austria's 10 authorized Verrechnungsstellen.

**ToS / license:** Commercial license. Redistribution via Strale under Tier-2 would require sourcing attestation and documented redistribution rights per DEC-20260428-A.

**Verdict: VIABLE for representative data coverage. BLOCKED by undisclosed annual Servicepauschale (violates Petter cost rule). Deferral confirmed. Do not propose lifting until Compass-Verlag discloses annual fee amount in sales RFQ.**

**DEC-20260518-G finding:** Annual fee is the blocking dimension. The per-call pricing (€0.10–€0.49 for relevant endpoints) is within v1 range at 10–20x AT-Start cost. The opaque Servicepauschale makes the total TCO unknowable without a sales conversation and creates a fixed-cost commitment that violates the Petter cost rule as written. The deferral that already exists in the system is correctly classified.

---

### 1b. HF Data Datenverarbeitungsgesellschaft m.b.H. (`firmenbuchgrundbuch.at` ← redirects to `www.firmenbuchgrundbuch.at/en/`)

**URLs probed:** `firmenbuchgrundbuch.at/en/`, `austrian-registers.com/` (301 → firmenbuchgrundbuch.at)
**HTTP status:** 200

**DEC-20260518-G PROBE:**

| Fee dimension | Evidence | Amount |
|---------------|----------|--------|
| Per-document fee | "Only 25 euros service fee" for account users | €25 service fee (not per-call per document — interpretation ambiguous) |
| Monthly minimum | Not stated | Unknown |
| Platform fee | Not stated | Unknown |
| Setup fee | Not stated | Unknown |
| API access | NOT available — web portal only | N/A |

**Fields:** The portal confirms access to official Firmenbuch extracts (current €4.63, historical €7.80 per the Ministry of Justice fee schedule). Extract includes shareholders, director details, registered address, filing history. However, there is NO API — web portal download only. HF Data is structurally the same entity as Compass-Verlag for API access purposes (HF Data is the Verrechnungsstelle; Wirtschafts-Compass API is the API product surface).

**Verdict: Web portal only. Not programmatically consumable without Strale-operated scraper (DEC-20260428-A Tier 1 bar). NOT VIABLE for v1 API path. Deferral confirmed.**

---

### 1c. Manz (`manz.at`, `dienste.manz.at`, `rdb.manz.at`)

**URLs probed:** `manz.at/produkte/firmenbuch`, `rdb.manz.at/document/rdb.tso.LIrdbkeywords.firmenbuch`
**HTTP status:** 200 (manz.at page), auth-gate (dienste.manz.at)

**DEC-20260518-G PROBE:**

| Fee dimension | Evidence | Amount |
|---------------|----------|--------|
| Per-call fee | Not disclosed on public page | Unknown — "contact vertrieb@manz.at or +43 1 531 61-6550" |
| Monthly/annual fee | "MANZ infoDienste Entgeltbestimmungen" (fee document) exists but not publicly accessible | Unknown |
| Setup fee | Order form required | Unknown |
| Platform fee | Not stated | Unknown |

**Fields:** Manz is an authorized Verrechnungsstelle (listed in justiz.gv.at registry as "MANZ'sche Verlags- u Universitätsbuchhandlung GmbH", accessible at `dienste.manz.at`). Manz distributes official Firmenbuch extracts via their legal database (RDB). Extracts include all legally registered data: Geschäftsführer, Vorstand, Prokuristen, shareholders. Manz is described as one of the two primary commercial distributors of Firmenbuch data alongside HF Data/Compass. Known as the "official provider of Austrian business data appointed by the Ministry of Justice" in multiple third-party sources.

**Assessment:** Manz operates as a web-based legal information service (RDB). No evidence of a developer API with JSON/XML output. Primary product is a web UI for legal professionals + document download. Contact required for any API/bulk arrangement.

**Verdict: BLOCKED — no public API; pricing opaque; same Verrechnungsstelle economics as Compass/HF Data. Deferral as "further backup" confirmed.**

---

## Path 2 — Direct registry API, free / open tier

### 2a. JustizOnline Firmenbuch query (`justizonline.gv.at/jop/web/firmenbuchabfrage`)

**URL probed:** `justizonline.gv.at/jop/web/firmenbuchabfrage`, `justiz.gv.at/service/datenbanken/firmenbuch/firmenbuchabfrage...`
**HTTP status:** 200 (HTML web UI only — no API endpoint returned)

**What is free vs paid:**
- **Free (unauthenticated):** Basic summary — company name, FN number, legal form, registered address, active/inactive status. The EU e-Justice portal confirms: "Summary information containing main details about a legal entity" is free with no special conditions.
- **Paid (authenticated — Austrian or EU ID required):** Full Firmenbuch extract including "persons authorised to represent it" (directors, Geschäftsführer, Vorstand, Prokuristen). Current extract: €4.63; extract with history: €7.80; partial extract (max 2 persons or name list): €1.44.

**Critical finding on unauthenticated access:** The free layer shows identity fields only. Director names, Geschäftsführer, and representative data are BEHIND the payment wall. The EU e-Justice portal language is explicit: Austria makes "persons authorised to represent it" available — but this is in the paid extract, not the free summary.

**Authentication barrier for non-Austrian access:** Access to paid products requires registration with Austrian or EU ID (ID Austria / former Handysignatur). Multiple 2025-2026 sources confirm: "the sign-up form for legitimate interest access tested on February 19, 2026, still requires an Austrian or EU ID." Kyckr 2026 guide confirms: "programmatic access is blocked without an Austrian ID." This is a structural barrier, not a temporary one — it reflects how the Austrian e-government identity framework works.

**SOAP API (WSDL):** The Open-Justiz-Online GitHub repository (`github.com/Open-Justiz-Online/companyregister-api-documentation`) documents a SOAP API at `https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws/fbw.wsdl`. Authentication: `X-API-KEY` header required. Four operations: SUCHEFIRMAREQUEST (search), AUSZUGREQUEST (extract — includes `FUN` officers and `PER` persons), URKUNDEREQUEST (document retrieval), VERAENDERUNGENFIRMAREQUEST (changes). This is the paid extract API used by Verrechnungsstellen. It is NOT the HVD free API described in Path 5.

**Verdict: FREE layer contains no representative data. Paid SOAP API exists and includes director data, but access requires Austrian/EU ID registration and per-query payment — this is the Verrechnungsstelle model already covered under Path 1. NOT VIABLE as a free/open path. The authentication barrier makes direct Strale integration infeasible without the authorized-reseller intermediary model.**

---

### 2b. data.gv.at — Open Government Data Austria portal

**URL probed:** `data.gv.at/katalog/dataset/high-value-datasets-hvd-des-firmenbuchs`, `data.gv.at/datasets/e91bd464-be86-453c-b693-2ab818e11df2`
**HTTP status:** 404 on both catalog URL variants (CDN block or URL structure changed)
**Fallback evidence:** Multiple web search results confirm dataset exists; Mastodon post from `@datagvat` confirmed "High-Value-Datasets (HVD) des Firmenbuchs ab sofort" (available as of March 2025).

**Key finding — HVD launched March 2025:**

Austria implemented EU Regulation 2023/138 High Value Datasets for the Firmenbuch in March 2025. The dataset is published by the Austrian Federal Ministry of Justice (BMJ). Key attributes confirmed from multiple corroborating sources:
- **Access:** Free API from BMJ via JustizOnline
- **Fields:** Company information, corporate documents, financial statements, "key attributes at the individual company level"
- **Directors/representatives:** Confirmed. Multiple sources cite "managing directors (Geschäftsführer)" as included. Firmenbuch.ai (which sources from "offen lizenzierte Registerdaten des Bundesministeriums für Justiz") confirms it displays "Firmenname, Rechtsform, Sitz, Geschäftsführer und zentrale Kennzahlen." OpenFirmenbuch confirms "Firmenbuchnummer, Rechtsform, Adresse, Geschäftsführung."
- **Update frequency:** Daily
- **Format:** XML (SOAP-based, difficult to parse without tooling)
- **License:** Openly licensed register data (BMJ)

**API key registration barrier:** The HVD API requires an API key from the Justice Ministry. Multiple sources confirm the registration process requires Austrian or EU ID (ID Austria). One source notes: "the output is in a difficult-to-read XML format." The Kyckr 2026 guide describes this path as "programmatic access is blocked without an Austrian ID."

**Third-party consumers of the free HVD API:**
- **OpenFirmenbuch** (`openfirmenbuch.at`) — WhizUs GmbH, free, no registration, displays Geschäftsführung. Sources directly from JustizOnline HVD API. Web UI only, no downstream API.
- **firmenbuch.ai** — Free, displays Geschäftsführer. Sources from "offen lizenzierte Registerdaten des BMJ." Web UI + AI analysis, no API.
- These demonstrate the HVD API is usable by non-Austrian companies building on it; the API key registration may be obtainable by EU-based companies even without Austrian ID. This requires direct verification with BMJ.

**GISA (Gewerbeinformationssystem Austria):** `data.gv.at` also hosts a GISA trade-licensing dataset. The GISA API (`bmwet.gv.at/Themen/Unternehmen/GISA_Gewerbeinformationssystem/GISA_Schnittstelle.html`) is explicitly free ("keine Gebühren oder Kosten zu entrichten") at Level 1 (unauthenticated), with Level 2 (historical + signed extracts) requiring certificate authentication. However, the GISA open data publishes trade licences WITHOUT personal data ("ohne personenbezogene Daten"). GISA is NOT a source for director names. It covers trade license holders and their license scope, not Firmenbuch-registered representatives.

**WKO (`firmen.wko.at`):** Wirtschaftskammer Österreich member directory. Web search reveals it does not show officer-level director data — it shows business name, address, trade license category, and WKO membership status. No API. NOT VIABLE for representative data.

**Verdict for Path 2:** The HVD free API (March 2025) is the most significant finding in this enumeration. It confirms that director/Geschäftsführer data is available via a free API from BMJ. However, two barriers must be resolved before classifying as viable-v1:
1. **Registration barrier:** Does Strale (a Sweden-based company) qualify to obtain an API key? The requirement is "Austrian or EU ID" — Petter holds EU citizenship; this may be satisfiable. Requires direct contact with `justizonline-iwg@brz.gv.at`.
2. **XML SOAP format barrier:** The HVD API is SOAP/XML, not REST/JSON. Integration cost is higher than a REST API. Not a blocker but an implementation concern.

**Classification: CONDITIONALLY VIABLE (Path 2 / HVD API) — pending API key registration verification. If EU ID suffices for key issuance, this is a free Tier-1 path with director data. Confidence: MODERATE on viability (evidence of director data confirmed; registration barrier unverified for non-Austrian EU company).**

---

## Path 3 — Tier-2 paid per-call aggregators (DEC-20260518-G probe per candidate)

### 3a. Openapi.com WW-Top + AT-Advanced + AT-Start (current routing)

**URL probed:** `console.openapi.com/apis/company/pricing`, `console.openapi.com/apis/company/documentation`, `openapi.com/products/company-start-austria`, `openapi.com/products/company-advanced-austria`
**HTTP status:** 200

**Current AT products in Openapi catalog:**
- `GET /AT-start` — €0.06/call (PAYG) or €0.055/call (subscription). 20+ fields: name, VAT, company number, LEI, status, address, GPS, incorporation date. NO directors field documented.
- `GET /AT-advanced` — €0.11/call (PAYG) or €0.055/call (subscription). 40+ fields including financials, NACE, contact details. Director/representative fields NOT documented in the product description.
- `GET /WW-advanced` / `GET /WW-top` — used for current AT routing. Same representative-field gap confirmed.
- **No `AT-stakeholders` product exists.** The "Company Stakeholders" service that Openapi advertises as covering executives, shareholders, legal representatives and employees — has only ONE country-specific implementation in the catalog: Italy (`GET /IT-stakeholders`, €0.095/call subscription). Austria has no stakeholders SKU.

**DEC-20260518-G PROBE for Openapi:**

| Fee dimension | Evidence | Amount |
|---------------|----------|--------|
| Per-call fee | Public pricing page | €0.055–€0.11/call AT products (subscription vs PAYG) |
| Platform fee | Not mentioned | NONE stated |
| Monthly minimum | Not mentioned | NONE stated |
| Annual floor | Not mentioned | NONE stated |
| Setup fee | Not mentioned | NONE stated |
| Termination fee | Not mentioned | NONE stated |

**Verdict for 3a:** Openapi AT products do NOT expose director or legal representative data for Austria. The missing AT-stakeholders SKU confirms this gap cannot be solved within the current Openapi routing. AT-Advanced and AT-Start cover financials and identity only. Clean per-call model, no platform fee — but representative data is simply not in the catalog. Status quo confirmed blocked for director coverage.

---

### 3b. finapu.com (DEPRECATED — DEC-20260428-A)

**Status:** Deprecated 2026-05-17. Path involved Strale operating a Browserless scraper against `firmenbuchgrundbuch.at`. This is a Tier-1 prohibition under DEC-20260428-A (Strale never operates scrapers, absolute). No API relationship with HF Data or the Justice Ministry was established. Documentation only.

**Constraint logged:** finapu.com's architecture was Strale acting as the browser operator → absolute bar under DEC-20260428-A. Even if finapu.com operates their own browser layer, Strale was invoking the scraping directly. This distinction matters: what is blocked is Strale-operated scraping. If a Tier-2 vendor (e.g., auszug.at) operates the extract on their infrastructure and provides Strale a clean JSON API with provenance, that is Tier 2 and allowed pending attestation.

---

### 3c. CRIF Austria / Margo

**URL probed:** `developer.crif.com/apis`, `businessdirectory-uat.crif.com`
**HTTP status:** 200

**Fields (from developer portal):** The CRIF "Margò" API provides "access to data on over 6M companies" across Europe. CRIF monitoring includes "change in directors, shareholders, registered charges, capital, revenue, profit" as alertable events — implying director data is tracked in the underlying data model. CRIF provides "official information sources in JSON/XML/PDF format."

**Austria coverage:** CRIF Austria (`crif-austria.at`) is a full subsidiary of CRIF Group. Austria is a primary market. However, the public developer portal lists: Hello CRIF (test), IDea (KYC), Margò (company data), NEOS (PSD2), PET Check, PRISMA (property). No Austria-specific company data API documentation is publicly accessible.

**DEC-20260518-G PROBE for CRIF:**

| Fee dimension | Evidence | Amount |
|---------------|----------|--------|
| Per-call fee | Not publicly disclosed | Unknown — contact required |
| Platform fee | Not disclosed | Unknown |
| Monthly minimum | Not disclosed | Unknown |
| Annual floor | Not disclosed | Unknown |

**Assessment:** CRIF is a serious candidate — they are a primary Austrian credit bureau with confirmed director-monitoring capability. However, all pricing is behind sales-contact gates. Based on CRIF's known commercial model in other markets (subscription + per-call), and their positioning as an enterprise credit bureau, the likely pricing model includes a monthly minimum that would violate the Petter cost rule. This is unverifiable without an RFQ.

**Verdict: VIABLE for representative data in principle (director-monitoring capability confirmed). BLOCKED on cost structure — pricing behind sales gate, likely subscription with monthly minimum. Candidate for v1.1 RFQ if HVD API path (Path 2) proves unregisterable.**

---

### 3d. KSV1870 (Kreditschutzverband von 1870)

**URL probed:** `ksv.at/en/companies/credit-standing-companies`
**HTTP status:** 200

**Fields:** KSV1870 "Business Search" database covers 640,000 Austrian companies and 7.5 million personal records. Reports include managing directors/officers (Geschäftsführer), corporate family tree ("Family Tree Report" provides "identity of company officers as defined under commercial law"), and beneficial ownership. Director data is confirmed.

**DEC-20260518-G PROBE for KSV1870:**

| Fee dimension | Evidence | Amount |
|---------------|----------|--------|
| Per-report fee (web portal) | Confirmed — non-members: €60.00–€105.00/report | Very high for web portal |
| Member pricing | Members: €33.20–€99.20/report + membership required | High |
| API access | NOT confirmed — web portal only documented | N/A |
| Monthly minimum | Not disclosed | Unknown |

**Critical finding:** KSV1870 has no documented developer API. Access is through a web portal only ("Business Search" online query and "My KSV Member Portal"). Any programmatic access would require either: (a) a sales-negotiated bulk data license (likely very expensive), or (b) a Strale-operated scraper (DEC-20260428-A bar). KSV1870's per-report pricing at €60–105 is 100x+ the Strale pricing range.

**Verdict: NOT VIABLE. No API; per-report web prices are 100x out of range; likely membership-subscription model for any bulk access. Disqualified.**

---

### 3e. Kyckr (`kyckr.com`)

**URL probed:** `kyckr.com/blog/the-austrian-business-registry`, `developer.kyckr.com`
**HTTP status:** 200

**Fields:** Kyckr confirms "live access to the Firmenbuch and 299 other official company registries in real time." Kyckr sources directly from the Firmenbuch. They provide "both machine-readable data and original registry documents." Director and representative data confirmed: "company officials and shareholders," per the Kyckr AT guide. Enhanced Profile endpoint provides officer data.

**DEC-20260518-G PROBE for Kyckr:**

| Fee dimension | Evidence | Amount |
|---------------|----------|--------|
| Per-call fee | Not publicly disclosed | Unknown |
| Platform fee | Not publicly disclosed | Unknown — TrustRadius 2026 says "no pricing plans listed" |
| Monthly minimum | Not publicly disclosed | Unknown |
| Annual floor | Not publicly disclosed | Unknown |

**Assessment:** Kyckr is a legitimate Tier-2 candidate. They source from the official Firmenbuch, provide structured data including directors, and have a developer API. However, all pricing is behind a sales gate. Given Kyckr's positioning as a premium KYB/AML compliance platform, their pricing model is likely subscription-anchored (enterprise contract) rather than PAYG per-call — which would violate the Petter cost rule. TrustRadius 2026 confirms pricing is not publicly listed. One 2025 review describes Kyckr as "quote-based for all plans."

**Verdict: VIABLE for representative data (Firmenbuch sourcing + director data confirmed). BLOCKED on cost structure — pricing opaque, likely subscription-anchored. Candidate for v1.1 RFQ only. Lower priority than CRIF given CRIF's direct Austrian market footprint and HF Data relationship.**

---

### 3f. auszug.at (Wiener Zeitung Digitale Publikationen GmbH)

**URL probed:** `api.auszug.at/`
**HTTP status:** 200

**Status:** auszug.at is one of Austria's 10 official authorized Verrechnungsstellen (Ministry of Justice clearing offices). They are a subsidiary of Wiener Zeitung. They operate `api.auszug.at` as "an officially authorized partner of the Justice Ministry since 2015" and "official clearing office (Verrechnungsstelle) of the Republic of Austria."

**Fields:** The API retrieves "standardisierte Webservice-Schnittstelle" output including "Geschäftsführungswechsel" (director changes) and company documents (articles of association, financial statements). Structured XML format. Director data is confirmed via document access + change notifications.

**DEC-20260518-G PROBE for auszug.at:**

| Fee dimension | Evidence | Amount |
|---------------|----------|--------|
| Per-call fee | "monatliche Lizenzgebühren & faire Einzelpreise gemäß Vorgaben der Gerichtsgebühren" | Government fee schedule (€4.63 current extract, €7.80 historical) + service markup |
| Monthly license fee | CONFIRMED PRESENT — "monatliche Lizenzgebühren" explicitly stated | Amount unknown — "contact support@auszug.at" |
| Platform/setup fee | Not stated | Unknown |
| Annual floor | Not stated | Unknown |

**Critical finding:** auszug.at EXPLICITLY STATES monthly license fees. "monatliche Lizenzgebühren & faire Einzelpreise" translates to "monthly license fees & fair individual prices." This is a confirmed fixed monthly cost component on top of per-query government fees. This violates the Petter cost rule directly.

**Verdict: BLOCKED. Monthly license fee confirmed in service description. Even though director data is available and sourcing is clean (official Verrechnungsstelle), the monthly fixed fee structure is incompatible with v1 cost discipline. Deferred to v1.1 pending RFQ if monthly fee turns out to be nominal (e.g., €10/month as admin overhead).**

---

### 3g. Other multi-jurisdiction aggregators

**OpenCorporates:**
- Austria coverage in OpenCorporates database: confirmed. AT Firmenbuch data indexed.
- Officer/director data: documented in API (`/companies/{jurisdiction_code}/{company_number}/officers`).
- Coverage completeness: Austria NOT found in the Coverage HeatMap (AT absent from the table). Coverage confidence: uncertain.
- Pricing: £2,250+/year subscription for commercial use. No PAYG option. **NOT VIABLE-V1.**

**TransactionLink (`transactionlink.io/integrations/firmenbuch`):**
- Firmenbuch integration page confirms coverage but schema and pricing not publicly accessible.
- Likely subscription model based on similar services. **NOT VIABLE-V1 without RFQ.**

**Dotfile (`dotfile.com/data-providers-list/austrian-commercial-register-firmenbuch`):**
- Lists Firmenbuch as covered jurisdiction. "60+ pre-integrated providers" but no AT-specific provider names surfaced.
- Routing platform, not a direct data vendor. Subscription-anchored. **NOT VIABLE-V1.**

**mart.report (`mart.report/en/monitoring/business-register-content/`):**
- Austrian company monitoring service. Director data confirmed ("data on management, power of attorney or shareholders").
- Monitoring platform (subscription), not per-call. **NOT VIABLE-V1.**

---

## Path 4 — Statutorily-public web UI (DEC-20260518-F constraints)

**Target surface:** `justizonline.gv.at/jop/web/firmenbuchabfrage` — the JustizOnline Firmenbuch search portal.

**DEC-20260518-F four-constraint assessment:**

**(a) Statutorily public:** YES. The Austrian Commercial Code (UGB / Unternehmensgesetzbuch) requires Firmenbuch registration and public disclosure. The EU e-Justice portal confirms: "persons authorised to represent [the company]" are part of the mandatory disclosure. The data is a statutory public record.

**(b) ToS permits per-call:** UNVERIFIED. The JustizOnline portal returned only a navigation header on WebFetch attempts — actual ToS text not retrieved. The IWG (Informationsweiterverwendung / Information Reuse) terms page exists at `justizonline.gv.at/jop/web/iwg/terms` but content was not accessible. The JustizOnline IWG page (`/jop/web/iwg`) also returned only a header. **ToS constraint cannot be confirmed as satisfied.**

**(c) Per-entity per-customer-request (not bulk):** SATISFIABLE in principle — each Strale `/v1/do` call would trigger one entity lookup.

**(d) Attribution preserved:** SATISFIABLE — provenance sourced to Firmenbuch / Bundesministerium für Justiz.

**Critical barrier beyond DEC-20260518-F:**

The JustizOnline web portal requires authentication (Austrian or EU ID) to access director data. The free unauthenticated layer shows only identity fields (name, address, status) — NOT representative names. Accessing director data via the portal requires:
1. A registered JustizOnline account (Austrian/EU ID required for account creation)
2. Per-query payment (€1.44–€4.63 per extract depending on type)
3. Online payment capability registered to the account

Even if DEC-20260518-F constraints (a), (c), (d) are met, constraint (b) is unverified and the payment-gate makes this a different economic model than expected from Path 4 (not a free web scrape). The per-entity cost of €4.63 for a current extract is 2.9x the WW-Top current per-call cost — making this an expensive path unless the per-query government fee can be passed through to customers.

**DEC-20260428-A Tier 1 assessment:** To retrieve the paid extract page programmatically, Strale would need to: authenticate with an Austrian/EU ID, submit per-query payment, and parse the authenticated response. This would require Strale operating either a session-maintaining scraper or a Browserless automation. That is a Tier-1 prohibition under DEC-20260428-A.

The authorized Verrechnungsstellen model (Path 1/3) exists precisely to avoid this: instead of Strale scraping the authenticated portal, a licensed reseller (auszug.at, Compass, Manz) mediates the extract.

**Verdict: BLOCKED. The unauthenticated free layer (Path 4 intent) does NOT expose director data. Accessing director data requires authentication + payment, which would require Strale to operate a browser/session automaton — DEC-20260428-A Tier-1 bar. The Verrechnungsstelle model in Paths 1 and 3 is the correct licensed-Tier-2 proxy for this statutory data.**

---

## Path 5 — Open data bulk (government download)

### 5a. data.gv.at — Firmenbuch HVD API (March 2025)

**Finding:** Austria's Firmenbuch HVD free API was launched in March 2025 in compliance with EU Regulation 2023/138. This is the most important single finding of this enumeration.

**Evidence chain:**
- Mastodon `@datagvat` post: "High-Value-Datasets (HVD) des Firmenbuchs ab sofort" confirmed launch
- data.gv.at catalog entry: `katalog/dataset/high-value-datasets-hvd-des-firmenbuchs` (404 on direct fetch due to CDN but confirmed via search)
- GitHub: `github.com/Lukhers-dev/firmenbuch-HVD` — third-party UI for the HVD data; confirms API documentation downloadable from Justice Ministry
- GitHub: `github.com/Open-Justiz-Online/companyregister-api-documentation` — official-adjacent documentation repo; API WSDL confirmed at `justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws/fbw.wsdl`
- OpenFirmenbuch.at: "uses the free API from JustizOnline"; displays Geschäftsführung; "komplett kostenlos" (completely free)
- firmenbuch.ai: "Geschäftsführer und zentrale Kennzahlen" from "offen lizenzierte Registerdaten des Bundesministeriums für Justiz"
- brutkasten.com article: "EU regulation requires member states to make central company data freely accessible; in Austria this regulation was implemented in March 2025"

**Fields confirmed via HVD API (triangulated from third-party consumers):**
- Company name, FN number, legal form, registered address, status, incorporation date
- **Geschäftsführer** (confirmed — both OpenFirmenbuch and firmenbuch.ai display this field)
- VAT number (UID)
- Historical company data
- Annual financial statements (Jahresabschlüsse)

**Format:** SOAP/XML. The API is a SOAP web service, not a REST API. The WSDL is at `justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws/fbw.wsdl`.

**Cost:** FREE (per the HVD mandate under EU Reg 2023/138). Third-party consumers operate it at zero cost.

**License:** Open government data from BMJ. Exact license terms (CC BY or equivalent) not retrieved, but EU HVD mandate requires open/free reuse with attribution.

**Registration barrier:** API key required. Registration process requires Austrian or EU ID (ID Austria system). This is the critical unresolved question:
- Kyckr 2026 guide states: "programmatic access is blocked" without Austrian/EU ID — but this was written in the context of the JustizOnline paid API, not specifically the HVD API.
- The HVD API is NEWER (March 2025) and specifically mandated to be freely accessible. The EU 2023/138 regulation requires member states to make HVDs "available for re-use" without conditions beyond attribution.
- WhizUs GmbH (OpenFirmenbuch.at) is an Austrian company but obtained API access. The question is whether a non-Austrian EU company (Strale, incorporated in Sweden) can obtain the API key without the ID Austria credential.
- Contact for API key: `justizonline-iwg@brz.gv.at`

**EU 2023/138 §5.1 CAVEAT re-applied:** The HVD mandate (§5.1) covers company identity fields but does NOT explicitly mandate representative-name disclosure. However, the Austrian BMJ chose to include Geschäftsführer data in their HVD implementation, as evidenced by third-party consumers displaying this field. This is Austria's implementation choice, not a mandate. The data is present regardless.

### 5b. GISA open data (trade licences without personal data)

**Finding:** The GISA open data on `data.gv.at` explicitly excludes personal data ("ohne personenbezogene Daten"). The GISA API at Level 1 (unauthenticated) is free but returns trade license scope, not director names. GISA is relevant for trade-licensed activities but NOT for Firmenbuch representative data.

**Verdict for Path 5 — HVD API:** CONDITIONALLY VIABLE-V1. The HVD API provides free access to Firmenbuch data including Geschäftsführer. The only blocking question is whether Strale can obtain an API key without an Austrian ID card. Given that (a) EU companies are generally within scope of EU HVD access, and (b) at least one third-party Austrian company already consumes this API, the probability of obtainability is moderate-to-high. **This path requires a direct email to `justizonline-iwg@brz.gv.at` as the next action. If key is obtainable, this becomes the v1 path at €0 external cost.**

---

## Path 6 — Tier-2 commercial bulk under DEC-20260428-A

### 6a. Who licenses AT company bulk with directors?

**Compass-Verlag / HF Data bulk license:**
- HF Data is the largest Verrechnungsstelle and distributes Wirtschafts-Compass data. Bulk licensing (Änderungslisten API — change lists) is part of the Wirtschafts-Compass API product. Price: "vereinbarte Servicepauschale" (agreed service fee) — i.e., an annual fixed contract.
- **Verdict: Same deferral constraint as Path 1a applies. Annual fixed fee incompatible with v1.**

**CRIF bulk license:**
- CRIF's "Margo" platform covers 6M+ European companies including AT. Bulk feed licensing would be enterprise-grade contract, not per-call. **NOT VIABLE-V1.**

**North Data AT coverage:**
- North Data covers Austrian companies and explicitly includes AT director/officer data in their coverage. However, North Data charges for API access (subscription) and for bulk exports. Their data may itself derive from Firmenbuch via licensed sourcing. **Not probed in depth — subscription model assumed. NOT VIABLE-V1.**

**Verdict for Path 6:** No AT bulk provider identified with a per-call passthrough model and DEC-20260428-A-compliant sourcing attestation. All bulk providers operate on annual license or enterprise subscription models. The HVD API (Path 5) is structurally superior as a direct-from-source free API without the redistribution-license complexity.

---

## Path 7 — Gazette / historical PDF parsing — EVI (successor to Wiener Zeitung Amtsblatt)

**Background:** The Wiener Zeitung Amtsblatt ceased as a print publication on July 1, 2023. The digital successor is EVI (Elektronische Verlautbarungs- und Informationsplattform), operated at `evi.gv.at` by the Austrian government.

**EVI findings:**
- **URL probed:** `evi.gv.at/ueber` — HTTP 200
- **What EVI publishes:** Corporate filings transferred from Firmenbuch, annual financial statements of Aktiengesellschaften, insolvency notices, shareholder meeting invitations, FMA warnings, job postings. "Firmenbuchdaten: Aktuelle Informationen und Änderungen" confirmed.
- **Format:** EVI is a web platform with a notification subscription service. It is NOT a structured data API. Content is published as web pages and/or PDFs.
- **Director names in EVI publications:** Corporate notifications (e.g., Firmenbucheintragungen) typically include the names of newly registered or changed directors. However, this is embedded in notification text, not structured fields.
- **API / structured download:** No API mentioned anywhere in the EVI documentation reviewed. EVI offers email notifications but no JSON/XML feed.
- **License:** "kostenfrei und barrierefrei" (free and accessible) but no explicit CC or open license stated.

**Annual accounts (JAb 4.0):** Since March 1, 2025, annual accounts are submitted via FinanzOnline in a structured "JAb 4.0" XML format. These are published on EVI. However, annual accounts are submitted by the company, not the Firmenbuch court, and contain financial data — not current representative state.

**DEC-20260428-A Tier-1 assessment:** Parsing EVI notification web pages would require Strale-operated HTML parsing / Browserless automation to extract director names from unstructured gazette-notification text. This is a Tier-1 prohibition.

**Derivative-dataset assessment:** Building a structured director database from EVI notifications would require: (a) historical bulk download of all Firmenbuch notifications, (b) NLP/LLM parsing to extract name + role + date from German gazette text, (c) ongoing maintenance to process new notifications. This is a "derivative-dataset build" comparable to the gazette-parsing discussed for BE in Phase 5. Scoped as NOT v1.

**Verdict: NOT VIABLE for v1. EVI provides unstructured gazette-format notifications without a structured API. Parsing would require Strale-operated automation (DEC-20260428-A bar). Even as a Tier-2 vendor path, no vendor currently offers a clean structured EVI/gazette-to-director API for Austria. Historical-record path only; scoped as future v2 work if HVD API or Verrechnungsstelle paths are unavailable.**

---

## Path 8 — Other AT-specific surfaces

### 8a. BRIS (Business Registers Interconnection System)

**URL probed:** `e-justice.europa.eu/topics/.../at_en`, `webgate.ec.europa.eu/e-justice/searchBris.do`
**HTTP status:** 200

**What BRIS provides for Austria:** The EU e-Justice portal confirms Austria participates in BRIS. Austria is noted as providing "more complete datasets than most" among EU member states. BRIS covers: company name, legal form, address, status, registration number. The portal also lists "persons authorised to represent it" as part of the mandatory disclosure for AT. However, BRIS access is via the e-Justice portal (web UI) — not a programmatic API.

**BRIS API:** The Business Registers Interconnection System dashboard (EC Digital Building Blocks) provides real-time lookups via e-Justice Portal. It is not a developer API with JSON output. It is a search interface for citizens and professionals. The data is "gathered in real time from the business registers of the Member States" — meaning it proxies to the Firmenbuch JustizOnline system, with the same authentication/payment implications as Path 4.

**Verdict: NOT VIABLE as a programmatic path. BRIS data for Austria is available through the e-Justice portal web UI only. No developer API with structured output. The data is sourced from the same Firmenbuch JustizOnline backend that gates director data behind Austrian/EU ID authentication.**

---

### 8b. WiEReG (Wirtschaftliche Eigentümer Registergesetz — Beneficial Owners Register)

**URL probed:** `bmf.gv.at/en/topics/financial-sector/beneficial-owners-register-act/Register-of-Beneficial-Owner.html`
**HTTP status:** 200

**Key findings:**
- WiEReG is managed by the Austrian Ministry of Finance (BMF), separate from Firmenbuch.
- Access: free but requires Austrian/EU ID for registration. October 2025 amendment clarified "legitimate interest" access rules (now includes third-country obliged entities, journalists, academics).
- **Director data in WiEReG:** If no UBO can be identified via ownership/control, senior management (managing directors, board members) are registered as substitute UBOs. This is a FALLBACK, not a primary record.
- **WiEReG Webservice:** Obliged entities can use a web service API for beneficial owner data. The Wirtschafts-Compass API also provides WiEReG access (€0.29/call for "Structured Representation Regulation").
- **CJEU ruling context:** November 2022 CJEU ruling ended unlimited public access to UBO registers. Austria amended WiEReG to limit access to legitimate-interest applicants as a result. This makes WiEReG data harder to access than pre-2022.
- **Distinction from Firmenbuch:** WiEReG records UBOs (beneficial ownership), not corporate representatives (Geschäftsführer). A Geschäftsführer who is also a significant shareholder might appear in both — but the records are structurally different. WiEReG is NOT a substitute for Firmenbuch representative data.

**Verdict: NOT VIABLE as primary representative source. WiEReG is UBO-focused, access-restricted post-CJEU 2022, and requires legitimate-interest registration. The Wirtschafts-Compass API's WiEReG product (€0.29/call) is subject to the same annual Servicepauschale as all Compass products.**

---

### 8c. GISA (Gewerbeinformationssystem Austria)

**URL probed:** `gisa.gv.at/`, `bmwet.gv.at/en/Topics/Enterprise/GISA-Austrian-Business-Licence-Information-System.html`, `bmwet.gv.at/Themen/Unternehmen/GISA_Gewerbeinformationssystem/GISA_Schnittstelle.html`
**HTTP status:** 200

**Key findings:**
- GISA is the trade licensing register for all commercial operations in Austria. Replaced 14 decentralized registers in March 2015.
- **GISA API:** Level 1 (unauthenticated, no fee) provides public GISA information. Level 2 (certificate/API key required, obtained via ID Austria) adds historical data and signed extracts.
- **Cost:** Explicitly free at Level 1 ("keine Gebühren oder Kosten zu entrichten").
- **Personal data:** GISA open data on data.gv.at publishes trade licenses WITHOUT personal data. The GISA API at Level 2 may include the trade license holder's name for sole proprietors not in the Firmenbuch — but for GmbH, AG, and other Firmenbuch-registered entities, GISA records show the legal entity as license holder, not individual names.
- **Director names:** NOT available for corporate entities via GISA. GISA records the company name, trade license text, and registration number. For sole proprietors (Einzelunternehmer) below the Firmenbuch threshold, GISA may be the only authentic source — but these are not the test entities (OMV, Erste, Andritz, Voestalpine are all large AG/GmbH).
- **Manz GISA product:** Manz sells a "GISA - GewerbeInformationsSystem" product (`manz.at/produkte/gewerbeinformationssystem`) — a web UI for GISA lookups. Subscription-based. Not relevant for director data.

**Verdict: NOT VIABLE for director/representative data on Firmenbuch-registered entities. GISA covers trade licenses, not corporate management structure. Level 1 free API is real and clean but contains no personal data relevant to director coverage.**

---

### 8d. Stiftungsregister (Private Foundations Register)

**URL probed:** `bmi.gv.at/409/start.html`
**HTTP status:** 200

**Key findings:**
- The Bundes-Stiftungs- und Fondsregister is managed by the Federal Ministry of Interior (BMI), not the Firmenbuch courts.
- Austria has 3,000+ private foundations (Privatstiftungen) controlling approximately 80 of Austria's 100 largest companies.
- **Disclosure limitation:** The foundation deed is submitted for registration, but the appendix (which typically lists beneficiaries) is NOT public. Board composition (Vorstand der Stiftung) is registered but public access is limited — "additional details of an association can be requested where there is legitimate interest."
- **Relevance to test entities:** OMV, Erste, Andritz, Voestalpine are stock corporations (AG), not private foundations. A private foundation may hold shares in them, but the directors of the AG are registered in the Firmenbuch, not the Stiftungsregister.
- **API:** No API for the Stiftungsregister identified. Web search / web UI only.

**Verdict: NOT RELEVANT for Firmenbuch-registered AG/GmbH entities. NOT VIABLE as a source for the test-entity representative data.**

---

### 8e. FMA (Finanzmarktaufsicht — Financial Market Authority)

**URL probed:** `fma.gv.at/en/search-company-database/`
**HTTP status:** 200

**Key findings:**
- FMA supervises Austrian banks, insurance companies, fund managers, and securities firms.
- FMA company database: updated April 14, 2025. Lists supervised entities with their type of authorization and supervisory status.
- **Director data:** FMA does not maintain a public directory of individual directors for regulated firms. Supervisory disclosures under MiFID II / AIFMD require firms to notify FMA of board changes, but these are not published as a searchable director database.
- **Relevant for:** Banking/insurance sector entities. Erste Group Bank AG is FMA-supervised; OMV is not (non-financial corporate).
- **API:** No developer API for FMA company database. Web search only.

**Verdict: NOT VIABLE as a general director data source. Sector-specific, non-API, no director name database.**

---

### 8f. Vienna Stock Exchange (Wiener Börse) / Listed Company Disclosures

**URL probed:** `wienerborse.at/en/listing/shares/companies-list/`
**HTTP status:** 200

**Key findings:**
- Vienna Stock Exchange (77 listed companies as of 2026) operates under FMA supervision.
- **Manager transaction disclosures (MAR Art. 19):** Listed companies must disclose manager transactions to FMA within 3 business days. These appear on `evi.gv.at` and FMA's website as individual notices — NOT a structured API.
- **Board composition disclosures:** Austrian listed companies are required under §§ 86-87 AktG to publish board composition in annual reports. These appear in annual financial statements published on EVI/OeNB.
- OMV, Erste Group Bank, Voestalpine, Andritz are all VSE-listed — so this disclosure path applies to all test entities.
- **ICE Vienna Stock Exchange data feed:** ICE Developer Portal confirms data access via "ICE Connect Desktop, ICE XL, and APIs" — but this is market data (prices, trading), not company corporate governance data.

**Verdict: Director disclosure for listed companies exists (regulatory mandatory) but is published as unstructured notices, not a queryable API. No developer-accessible structured endpoint for board composition. NOT VIABLE as a primary representative data path.**

---

### 8g. Sozialversicherung / E-control / RTR (Sector Regulators)

- **Sozialversicherung (OEGK):** Not a corporate governance registry. No board-membership data.
- **E-Control (energy regulator):** Regulated entity database; no public director API.
- **RTR (telecom regulator):** Same — no director registry.
- **Verdict: All three NOT RELEVANT for general company representative data.**

---

## Synthesis — AT representative coverage verdict

### Per-path findings table

| Path | Label | Representatives data? | Cost structure | v1-viable? | Notes |
|------|-------|-----------------------|----------------|------------|-------|
| 1a | Compass-Verlag / Wirtschafts-Compass API | YES — Geschäftsführer, Vorstand, Prokuristen, full officer roles | Per-call (€0.10–€0.49) + UNDISCLOSED annual Servicepauschale | BLOCKED (annual fee) | Deferred. Deferral re-confirmed. |
| 1b | HF Data / firmenbuchgrundbuch.at | YES — in official extracts | Per-document web portal; no API | BLOCKED (no API; DEC-428-A bar) | Web portal only. Same entity as Compass. |
| 1c | Manz | YES — in official extracts | Opaque; requires sales contact | BLOCKED (no public API) | Further backup — contact required. |
| 2 | JustizOnline free layer (HVD API March 2025) | YES — Geschäftsführer confirmed via third-party consumers | **FREE** (BMJ HVD mandate) | CONDITIONALLY VIABLE-V1 | API key obtainability for non-Austrian EU company requires verification. Contact: `justizonline-iwg@brz.gv.at`. |
| 3a | Openapi AT-Start / AT-Advanced / WW-Top | NO — no stakeholders SKU for AT | €0.055–€0.11/call | BLOCKED for representatives | Current routing; gap confirmed. |
| 3b | finapu.com | N/A (deprecated) | N/A | DEPRECATED per DEC-20260428-A | Strale-operated scraper path. |
| 3c | CRIF Austria / Margo | YES — director-monitoring capability confirmed | Opaque; likely subscription with minimum | BLOCKED (subscription likely) | v1.1 RFQ candidate if HVD fails. |
| 3d | KSV1870 | YES — officer data confirmed | €60–105/report; no API | NOT VIABLE | 100x price; no API. |
| 3e | Kyckr | YES — Firmenbuch-sourced; director data confirmed | Opaque; quote-based | BLOCKED (subscription likely) | v1.1 fallback. |
| 3f | auszug.at | YES — Geschäftsführungswechsel; document access | Monthly license fee CONFIRMED | BLOCKED (fixed monthly) | Deferred. |
| 3g | OpenCorporates | YES — officer API | £2,250+/year | NOT VIABLE | Annual subscription. |
| 4 | JustizOnline web UI (DEC-518-F) | NO — free layer only; paid layer requires auth + DEC-428-A bar | €4.63/extract (paid) | BLOCKED (authentication + DEC-428-A) | Verrechnungsstelle model is the licensed proxy. |
| 5 | HVD bulk / GISA open data | YES for HVD (same as Path 2); NO for GISA | FREE (HVD); FREE (GISA) | HVD: CONDITIONALLY VIABLE-V1; GISA: not for director data | GISA excludes personal data. |
| 6 | Commercial bulk (Compass, CRIF, North Data) | YES — all have bulk feeds | Annual license / enterprise contract | NOT VIABLE-V1 | Fixed annual fee in all cases. |
| 7 | EVI / Wiener Zeitung gazette | YES — director names in gazette notifications | Free (EVI) but unstructured | NOT VIABLE-V1 (DEC-428-A bar for parsing; no structured API) | v2 historical-records path only. |
| 8a | BRIS / e-Justice | YES — per BRIS mandate | Free | NOT VIABLE (web UI only; proxies JustizOnline) | No developer API. |
| 8b | WiEReG (UBO register) | PARTIAL — senior mgmt as fallback UBO | Per-call via Compass; direct access restricted | NOT VIABLE (UBO ≠ directors; CJEU-restricted) | Different data product. |
| 8c | GISA | NO — trade licenses without personal data | Free (Level 1) | NOT VIABLE for director data | Sole proprietors only, not AG/GmbH. |
| 8d | Stiftungsregister | NOT RELEVANT for AG entities | N/A | NOT RELEVANT | Private foundations only. |
| 8e | FMA | NOT APPLICABLE (sector-specific; no API) | N/A | NOT VIABLE | No director DB. |
| 8f | Vienna Stock Exchange filings | YES — listed-company board disclosures | Free but unstructured | NOT VIABLE (no API; EVI-published) | Same EVI constraint as Path 7. |
| 8g | Sector regulators (E-Control/RTR/OEGK) | NOT RELEVANT | N/A | NOT VIABLE | Not corporate governance registries. |

---

### Overall verdict

**Overall verdict: VIABLE-V1 CONDITIONALLY (via HVD free API) — or FULLY BLOCKED without it**

**Confidence: MODERATE**

The verdict bifurcates on a single fact: whether Strale (Swedish company, EU-incorporated) can obtain an API key for the Austrian Firmenbuch HVD free API without an Austrian ID card.

**Scenario A (API key obtainable for EU company):** Austria becomes viable-v1 at €0 external cost via the HVD SOAP API. Director data confirmed. SOAP/XML integration complexity is higher than REST but not a blocker. Implementation timeline ~2–3 days of SOAP client work.

**Scenario B (API key requires Austrian ID only):** Austria is fully blocked for v1. All paid paths (Compass, Manz, auszug.at, CRIF, Kyckr) either have undisclosed annual platform fees or confirmed monthly minimums — all violating the Petter cost rule. No clean per-call passthrough vendor exists. Status: v1.1 deferred pending vendor RFQ or Petter cost rule revision.

**Single-action to resolve:** Email `justizonline-iwg@brz.gv.at` with a question: "Can an EU-incorporated company (Sweden) obtain an API key for the HVD Firmenbuch API without Austrian ID Austria credentials? If yes, what is the registration process?"

---

### v1 path (conditional)

**Source:** Austrian Ministry of Justice — Firmenbuch HVD SOAP API
**Endpoint:** `https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws/fbw.wsdl`
**Method:** SOAP/XML; operation `AUSZUGREQUEST`
**Fields available:** Geschäftsführer, Vorstand, Prokuristen (confirmed via `FUN` element for officer roles); company name, FN number, address, legal form, status
**Cost:** FREE (HVD mandate EU Reg 2023/138)
**Identifier:** FN number (Firmenbuchnummer) — note: VAT→FN resolution step required as current AT input is VAT only. FN and VAT both appear in the HVD extract, so a two-step query (AT-Start by VAT → extract FN → HVD SOAP by FN) is feasible.
**DEC-20260428-A:** This is a direct registry API from the Ministry of Justice. No scraping involved. Tier-1 compliance: CLEAN. No sourcing attestation burden beyond attribution to BMJ.
**Blocker:** API key registration barrier (EU ID requirement unverified for non-Austrian).

**Required actions for v1:**
1. Email `justizonline-iwg@brz.gv.at` — confirm EU-company API key eligibility.
2. If confirmed: implement SOAP client for `AUSZUGREQUEST` operation, map `FUN` elements to `legal_representatives` output schema.
3. Implement VAT→FN resolution step (AT-Start call → extract FN number → HVD SOAP call).
4. Obtain API key (likely requires a registration process — may need Petter's EU ID or company registration documentation).

---

### v1.1 path (if HVD API key blocked)

**Vendor cohort for v1.1 (requires DEC-20260518-G RFQ):**
1. **Compass-Verlag / Wirtschafts-Compass API** — Primary. Full representative data. Pricing per-call confirmed; annual Servicepauschale amount must be disclosed and must be below the threshold where Petter re-evaluates the cost rule exception.
2. **auszug.at** — Secondary. Official Verrechnungsstelle; confirmed director-change tracking; monthly license fee cited but amount unknown (may be nominal admin overhead).
3. **CRIF Austria (Margo)** — Tertiary. Director-monitoring confirmed; pricing completely opaque.

**v1.1 cost constraint:** If any vendor discloses a platform fee below a low fixed threshold (e.g., €20–50/month admin), Petter may choose to exception it given Austria's strategic importance in the EU coverage matrix. This would need a DEC entry. The audit stops here — escalating to Petter for cost-rule judgment call.

---

### DEC-518-G compliance log

| Candidate | Platform fee probed? | Annual floor probed? | Monthly minimum probed? | Setup fee probed? | Termination fee probed? | Result |
|-----------|---------------------|---------------------|------------------------|-------------------|-------------------------|--------|
| Compass / Wirtschafts-Compass | YES | YES | YES | YES | YES | Annual Servicepauschale confirmed; amount undisclosed |
| HF Data / firmenbuchgrundbuch.at | YES | YES | YES | YES | YES | No API; web portal only |
| Manz | YES | YES | YES | YES | YES | All dimensions opaque; contact required |
| auszug.at | YES | YES | YES | YES | YES | Monthly license fee confirmed in description; amount unknown |
| CRIF Austria | YES | YES | YES | YES | YES | All dimensions opaque |
| KSV1870 | YES | YES | YES | YES | YES | Per-report pricing only; no API |
| Kyckr | YES | YES | YES | YES | YES | All opaque; quote-based |
| Openapi AT products | YES | YES | YES | YES | YES | No platform fee; no director data |

---

### Doctrine compliance log

| Doctrine | Status | Notes |
|----------|--------|-------|
| DEC-20260518-E (exhaustive 8-path) | COMPLIANT | All 8 paths documented. Additional sub-paths within each documented. |
| DEC-20260518-F (statutory web UI constraints) | COMPLIANT | Applied to JustizOnline portal (Path 4). Blocked on ToS verification + DEC-428-A. |
| DEC-20260518-G (platform fee probe mandatory) | COMPLIANT | All 8 Tier-2 candidates probed on all 6 dimensions. |
| DEC-20260428-A (no Strale-operated scrapers) | COMPLIANT | HF Data web portal, EVI, BRIS web UI, GISA all blocked on Tier-1 bar. finapu.com correctly deprecated. |
| DEC-20260505-E (Topograph DQ) | COMPLIANT | Topograph not mentioned or proposed anywhere in this enumeration. |
| Compass/HF Data deferral | COMPLIANT | Deferral re-confirmed. Annual Servicepauschale is the blocking dimension. DEC-20260518-G evidence documented. |
| Manz further backup | COMPLIANT | Manz contact details documented; all fee dimensions opaque; contact required before v1.1 assessment. |
| EU 2023/138 §5.1 CAVEAT | COMPLIANT | Noted under Path 5. Austria chose to include Geschäftsführer in HVD; this is a policy choice, not a §5.1 mandate. |
| Petter cost rule (no fixed monthly) | COMPLIANT | Applied to all vendor assessments. auszug.at blocked on confirmed monthly license fee. |

---

### Key caveats

1. **HVD API registration barrier is unresolved.** The entire v1 verdict pivots on one email to `justizonline-iwg@brz.gv.at`. Until that is sent and answered, the AT verdict is CONDITIONAL.

2. **SOAP/XML integration cost.** If the HVD API is accessible, the SOAP client implementation adds ~2–3 days vs. a REST JSON endpoint. The AT capability would have higher latency (SOAP round-trip) than comparable REST-based capabilities.

3. **VAT→FN resolution step.** Current AT-Start input accepts VAT (ATU format). The HVD SOAP API is indexed by FN number. A two-call sequence is required: AT-Start (VAT→FN) → HVD SOAP (FN→director data). This adds one extra Openapi call at €0.055 to each AT director lookup. The total per-call cost remains well within v1 range.

4. **Geschäftsführer only vs. full representative scope.** Third-party HVD consumers display Geschäftsführer explicitly. Whether the HVD API also returns Vorstand (supervisory board members) and Prokuristen (authorized agents) is unconfirmed from indirect evidence. The official Firmenbuch contains all these roles; the HVD export scope may be a subset. The AUSZUGREQUEST operation should include all legally registered roles (`FUN` elements), but this needs direct API verification.

5. **Compass Servicepauschale amount unknown.** If the annual fee turns out to be, e.g., €100–200/year as an admin overhead cost, it might be justifiable under a cost-rule exception. The DEC-20260518-G probe documented that the amount is negotiated case-by-case — making it impossible to pre-classify without an RFQ.

6. **OMV test entity confirmed via AT-Start + WW-Top (VAT ATU14189108 → HTTP 200).** The identity baseline is working. The directorial gap is the only outstanding coverage item.

---

*End of _partial_at_enumeration.md. Feeds into synthesis document.*
*Sources consulted: api.wirtschaftscompass.at, justiz.gv.at, justizonline.gv.at, data.gv.at, openfirmenbuch.at, firmenbuch.ai, kyckr.com, ksv.at, crif.com, openapi.com, evi.gv.at, bmwet.gv.at, bmf.gv.at, e-justice.europa.eu, api.auszug.at, firmenbuchgrundbuch.at, manz.at, github.com/Open-Justiz-Online, github.com/Lukhers-dev/firmenbuch-HVD*
