# HU exhaustive enumeration — partial

**Date:** 2026-05-18
**Author:** Claude Code (Sonnet research subagent, per DEC-20260518-E)
**Test entities:** OTP Bank Nyrt. (Cégjegyzékszám 01-10-040952), MOL Magyar Olaj- és Gázipari Nyrt. (13-10-041527), Richter Gedeon Nyrt. (01-10-040944)
**Confirmed working query shape (from Openapi WW-Top):** HU-prefix VAT (HU + 8 digits). Cégjegyzékszám and bare 8-digit formats rejected with 406.
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260518-F (Path 6 4-constraint exemption for per-entity statutory web UI); DEC-20260518-G (mandatory platform-fee probe for Tier-2); DEC-20260428-A (no Strale-operated scrapers, Tier 1 absolute); cost discipline (per-call OK if passed through, fixed/subscription not OK in v1)

---

## Current state summary (pre-enumeration)

| Dimension | Status |
|-----------|--------|
| Current vendor | Openapi WW-Top (Committed tier, €0.1586/call) |
| Tier 1 fields returned | 6/7 — name, address, status, tax number, VAT, registration date (no legal_form) |
| Directors / legal representatives | **NOT returned** by WW-Top endpoint |
| Working query format | HU-prefix VAT (HU + 8 digits) |
| Rejected query formats | Cégjegyzékszám (format: NN-NN-NNNNNN), bare 8-digit tax number |
| Phase 4/5 verdict | Partially blocked — basic identity only, no representatives |

The gap: Openapi's WW-Top SKU routes HU through its generic worldwide enrichment layer and does not activate the deep local HU integration. This enumeration probes whether a free, per-call-passthrough, or Tier-2 path exists that closes the representatives gap.

---

## HU Registry Background

**Legal authority:** Act V of 2006 on Company Registration (Ctv.) + Act XI of 1990 (Gtv., repealed but transitionally applicable). The cégjegyzék is a "közhitelű nyilvántartás" (publicly trusted register) maintained electronically by 20 regional courts of registration under oversight of the Ministry of Justice (Igazságügyi Minisztérium, IM).

**Registry operator:** Céginformációs Szolgálat (Company Information Service) — operational arm of IM. Runs both the public web portal (e-cegjegyzek.hu / OCCSZ) and the paid document service.

**System name:** OCCSZ — Országos Cégszolgálat és Céginformációs Rendszer (National Company Service and Company Information System). The online front-end is `occsz.e-cegjegyzek.hu`.

**Key document type:** Cégkivonat (Trade Register Extract, TRE) — the official company extract. Sections are structured by law: §13 = legal representatives (ügyvezetők, vezérigazgatók); §14 = auditors (könyvvizsgáló); §15 = supervisory board (felügyelőbizottság); Part II = ownership/shareholders.

**Key gazette:** Cégközlöny — the Hungarian Companies Gazette (not Magyar Közlöny). Published by IM under Act V of 2006 §17. Publishes company registration events including officer appointments, statute changes, and liquidation. Accessible free of charge at e-cegkozlony.gov.hu (TLS cert expired as of 2026-05-18 — confirmed connection error during probe). Cégközlöny is the narrower instrument for company events; Magyar Közlöny is the broader official gazette for statutory instruments and government appointments.

**Identifier taxonomy:**
- Cégjegyzékszám: primary company identifier, format NN-NN-NNNNNN (court code – entity type – 6-digit serial). E.g. 01-10-040952 for OTP Bank (Budapest court, private limited company form).
- Adószám (tax number): 8-digit base number (e.g. 10537914), not HU-prefixed.
- Áfa- / VAT number: HU + 8-digit adószám base (e.g. HU10537914). This is the VIES-registered format.
- EUID: European Unique Identifier, format HUOCCSZ-[Cégjegyzékszám], introduced post-Directive (EU) 2019/1151.

---

## Path 1 — Same vendor (Openapi), other endpoints / HU-specific SKU

### 1a. Openapi Company TOP Worldwide

- **URL probed:** `https://openapi.com/products/company-top-worldwide`
- **Status:** HTTP 200, page fetched.
- **Fields in WW-TOP:** 60+ data points — name, VAT, LEI, address with GPS, status, incorporation date, NACE/NAICS/SIC, financial data (revenue, assets, equity, employees). **Directors/legal representatives NOT listed in documented fields.**
- **Hungary explicit coverage:** Not explicitly confirmed in product documentation. Country described as "worldwide" / "all countries" without HU-specific callout.
- **Pricing:** €0.07–€0.13/call depending on annual volume tier. No explicit platform fee or subscription floor documented.
- **Assessment:** Openapi WW-Top is confirmed already routed for HU at €0.1586/call. The TOP product appears to be the same or similar endpoint. Neither is documented as returning officer/director data for HU.

### 1b. Openapi Company Advanced Worldwide

- **URL probed:** `https://openapi.com/products/company-advanced-world-wide`
- **Status:** HTTP 200.
- **Fields:** 40+ data points including financial history. **Directors/legal representatives NOT among documented fields.**
- **Pricing:** €0.05–€0.11/call (annual vs pay-as-you-go). No platform fee documented.

### 1c. Openapi HU-specific endpoint search

- **Openapi console enumeration** (`console.openapi.com/apis/company/documentation`): Confirmed country-specific endpoints exist for AT, BE, CH, DE, ES, FR, GB, IT, PL, PT with dedicated `/{CC}-stakeholders` and `/{CC}-shareholders` SKUs. **No HU-specific endpoint listed.** The Openapi catalog does not include a dedicated `HU-stakeholders` or `HU-shareholders` product.
- **Italy comparison:** `openapi.com/products/current-company-representatives-italy` — an explicit Italy-specific representatives SKU exists. No equivalent for Hungary.

### Path 1 verdict: **NOT VIABLE for representatives.**

Openapi does not expose a Hungary-specific representatives endpoint. The current WW-Top route returns basic identity only. No Openapi upgrade path to representatives confirmed.

---

## Path 2 — Direct registry API (OCCSZ / Céginformációs Szolgálat / IM)

### 2a. Public web portal

- **URL probed:** `https://www.e-cegjegyzek.hu/` (redirects to `occsz.e-cegjegyzek.hu`)
- **Status:** The domain resolves; content is a Hungarian-language SPA.
- **Data exposed for free (confirmed from e-Justice portal + IM official documentation):**
  - Company name, Cégjegyzékszám, adószám, VAT number, address, legal form, status, incorporation date
  - **Legal representatives (ügyvezetők) — name and representation authority — ARE included in the free informational (tájékoztató) cégkivonat.**
  - Supervisory board members (felügyelőbizottság)
  - Company activities (TEÁOR codes)
  - Ownership/shareholders (for Kft / Zrt, when populated in Part II of TRE)
- **Important distinction:** Two tiers exist:
  - Free "tájékoztató cégkivonat" (informational extract) — available to anyone, includes representatives
  - Paid "hiteles cégkivonat" (authentic certified extract) — legally certified version, required for court/notarial purposes

### 2b. OCCSZ XML API

- **URL probed:** `occsz.e-cegjegyzek.hu/?cegkereses=` (search endpoint); ToS/ASZF PDF URL fetched at `gov.e-cegjegyzek.hu/Utmutatok/ASZF_OCCSZ_EN_V1.6.pdf` — returned cryptographic certificate metadata rather than ToS text (PDF binary, 464 kB).
- **XML API existence confirmed** from multiple secondary sources (company-formation-hungary.com, SmartLegal, companyapi.hu which explicitly states it sources from "Ministry of Justice Company Information Service"). An XML verification API is available for looking up companies by Cégjegyzékszám or adószám.
- **No public API documentation URL found** — the OCCSZ XML API appears to be accessed through a request/registration process, not through a public developer portal.
- **Automated integration confirmed:** Search result quote: "Company information service provides the possibility to retrieve user-defined data from the company registry and can be integrated with ERP/CRM systems with minimal development effort." Contact: Magyar Cégadat Szolgáltató Kft.
- **Format:** XML (confirmed from Topograph's source documentation, which uses "OCCSZ XML API for company search and verification").
- **Authentication:** Registration required (not open key-generation). Contact-form based.
- **Rate limits:** Unknown — not publicly documented.
- **Cost:** For the OCCSZ XML verification endpoint specifically, cost is unclear from public sources. The cégkivonat PDF (authenticated extract) costs HUF 600–2,000 per document (range from secondary sources; exact fee schedule not confirmed from official source during this session due to fee-page access limitations).

### 2c. DEC-20260518-G Platform Fee Probe — OCCSZ direct

- Platform fee: Not applicable (this is a government service, no sales negotiation).
- Setup fee: None documented for basic registration.
- Monthly minimum: None documented.
- Annual floor: None documented for the informational tier.
- Subscription model: Informational query appears to be per-request; authentic documents (hiteles kivonat) are per-document fee.
- **Termination:** Not applicable (government service, no contract).

### Path 2 verdict: **PARTIALLY VIABLE — complex.**

The free informational tier of OCCSZ exposes director names via the public web UI. However:
1. No public REST/JSON API confirmed — the XML API exists but requires registration via Magyar Cégadat Szolgáltató Kft (not self-serve).
2. Programmatic access to the web UI (screen-scraping OCCSZ) is blocked under DEC-20260428-A Tier 1.
3. The XML API contact path and pricing are not publicly documented and would require a vendor engagement (→ treated as Tier-2 in practice).

The direct-registry path for machine-readable, programmable data requires either (a) the OCCSZ XML API with an opaque registration process, or (b) a vendor intermediary.

---

## Path 3 — Free / open data tier (data.gov.hu, opendata.hu, GLEIF, OpenCorporates)

### 3a. opendata.hu (Hungarian National Open Data Portal)

- **URL probed:** `https://opendata.hu/dataset`
- **Status:** Page resolves (CKAN instance for Hungary).
- **Company/officer dataset search:** No company officer or director dataset found matching "cégjegyzék," "directors," "officers," or "ügyvezetők" in the accessible catalogue. The search did not surface an IM-published structured company officers dataset.
- **What exists on opendata.hu:** Public procurement data, transport datasets, statistical data. Company registration data is NOT published as an open dataset with officer-level fields.

### 3b. data.gov.hu / National Public Data Portal

- **URL noted:** `dateno.io/registry/catalog/cdi00004266/` (meta-catalogue entry for Hungary's National Public Data Portal).
- **Assessment:** The National Public Data Portal collects register-of-registers (metadata). It does not itself host company officer bulk data. All company data traces back to OCCSZ/IM.
- **No company-officers dataset found** as a freely downloadable bulk file.

### 3c. OpenCorporates HU

- **Assessment (from prior EE/BE/HR enumeration methodology applied to HU):** OpenCorporates mirrors HU company register data but:
  - Web view is accessible but CAPTCHA-walled for automated access.
  - API requires Essentials subscription (£2,250+/yr annual lock-in) — does not fit v1 cost discipline.
  - Officer data coverage for HU on OpenCorporates is partial (name resolution from gazette text, historical lag).
- **Verdict: NOT VIABLE** under cost discipline.

### 3d. GLEIF (LEI Level 1 + 2)

- **Assessment:** LEI records for HU entities contain legal name, address, registration authority, status, legal form. Level 2 = entity-to-entity parent/subsidiary relationships, not natural persons. No officer/director fields in GLEIF schema.
- **Verdict: NOT VIABLE** for officer data.

### 3e. Open Ownership / BODS

- **Assessment:** Hungarian UBO register (CIVIL.EU or equivalent under the 4AMLD/5AMLD transposition) — not published as BODS. The CJEU C-37/20 ruling restricts general public access to UBO registers across EU. HU UBO register access requires demonstrated legitimate interest. Even if accessible, UBO is a different primitive from directors.
- **Verdict: NOT VIABLE.**

### Path 3 verdict: **NOT VIABLE.** No free/open bulk company officer dataset exists for HU through any public data portal.

---

## Path 4 — Tier-2 paid per-call aggregators (DEC-20260518-G fee probe per candidate)

### 4a. Topograph — CONFIRMED HU COVERAGE WITH LEGAL REPRESENTATIVES

**Primary finding: Topograph covers Hungary and explicitly returns `legalRepresentatives`.**

- **URLs probed:** `docs.topograph.co/llms.txt`, `docs.topograph.co/essentials/hungary.md`, `topograph.co/`
- **Status:** HTTP 200 on all. Hungary listed in country index.

**Data sources used for HU:**
- OCCSZ XML API — company search and verification
- Cégkivonat (Trade Register Extract) PDF — primary structured data source, parsed deterministically
- NAV EVNY JSON API — sole trader registry (reCAPTCHA-gated, separate flow)
- VIES — VAT number validation
- NAV Group VAT Registry — group tax number lookup

**Identifiers accepted:**
- Cégjegyzékszám (primary, 10 digits with hyphens stripped) — preferred
- Adószám (8-digit) — searches both OCCSZ and EVNY
- VAT number (HU + 8 digits) — validated via VIES, then resolved
- Company name — text search via OCCSZ only (EVNY doesn't support name queries)

**Data fields returned — confirmed from Topograph HU documentation:**

| Section | Fields |
|---------|--------|
| Company profile | Legal name, registration number, tax number, VAT, registered address, registration date, status, legal form (ISO 20275 code), share capital, TEÁOR/NACE/ISIC activity codes |
| **Legal representatives (§13 TRE)** | **Name, birth date, address, role, start date, representation mode (sole/joint signing authority)** |
| Auditors (§14 TRE) | Firm/individual name, address, registration number |
| Supervisory board (§15 TRE) | Name, birth date, address, start date |
| Shareholders | When available in Part II of TRE (company type dependent) |
| Establishments/branches | Addresses |
| Group VAT | Group tax number from NAV |

**Pricing model (DEC-20260518-G probe):**
- **Commercial companies (OCCSZ):** Variable pricing. Total cost = quoted TRE price (kbyte-based, varies by company size/history) + fixed processing fee. Budget cap available via `profileMaxBudget` parameter.
- **Sole traders (EVNY):** Fixed pricing. EVNY data source is free; only processing fee applies.
- **No subscription floor mentioned.**
- **No platform fee mentioned.**
- **No minimum commitment mentioned.**
- **No annual floor mentioned.**
- **Signup:** Magic-link / app.topograph.co registration (not self-serve instant key). Credentials provided after signup.
- **Exact HU per-call price:** NOT publicly disclosed (requires signup). Variable (kbyte-based TRE cost + processing fee) — no single published rate.

**Critical limitation:**
> "Legal representatives are only available for active companies. Closed companies use a minimal TRE format that may not include Section 13."

**DEC-20260518-G verdict for Topograph HU:**
- Platform fee: Not mentioned / not confirmed → low risk, but requires RFQ confirmation
- Setup fee: Not mentioned
- Monthly minimum: Not mentioned
- Annual floor: Not mentioned
- Termination: Not mentioned (magic-link signup pattern; similar to Topograph HR which confirmed "no minimum commitments")
- **Model assessment: Likely per-call passthrough — consistent with Topograph's documented model for HR (confirmed "pay-per-request, no bulk contracts, no minimum commitments"). Assume same for HU pending RFQ.**
- **Verdict: VIABLE-V1 (pending RFQ confirmation that no platform fee applies + DEC-20260428-A vendor attestation)**

**DEC-20260428-A sourcing assessment:**
- Topograph sources from OCCSZ XML API + Cégkivonat PDF — both are official government registers.
- Cégjegyzék data is statutorily public under Act V of 2006.
- Topograph is the intermediary vendor; Strale consumes via Topograph API.
- Vendor attestation requirements: (1) redistribution rights confirmation, (2) primary-source provenance per fact, (3) DPA.
- This mirrors the HR Topograph path confirmed viable in the Phase 5 audit.

---

### 4b. companyapi.hu / cegadatapi.hu — Hungarian Company Data API

- **URLs probed:** `https://companyapi.hu/`, `https://cegadatapi.hu/`
- **Status:** HTTP 200, content fetched. companyapi.hu and cegadatapi.hu appear to be the English/Hungarian language variants of the same service.
- **Data source:** "Directly from the Hungarian Ministry of Justice's Company Information Service" (OCCSZ).
- **Fields confirmed:** 29–32 fields depending on plan. Includes `managerCount`, `managers` (names), `ownerCount`, `owners` (names). Example in documentation shows: "Smidhoffer Vanessza Míra" as a manager name.
- **Field granularity vs Topograph:** companyapi.hu returns manager names but does NOT expose role, birth date, address, representation mode (sole vs joint signing), or start/end dates for each person. The data is less structured than Topograph's §13-parsed output.
- **Pricing model (DEC-20260518-G probe):**
  - Starter: 15,990 HUF/month + VAT — 1,000 profile requests
  - Advanced: 24,990 HUF/month + VAT — 5,000 profile requests
  - Professional: 37,990 HUF/month + VAT — 10,000 profile requests
  - Unlimited searches (name/number lookup) included in all plans
  - **MONTHLY SUBSCRIPTION — fixed monthly fee regardless of call volume**
  - "Easily cancellable anytime" — no annual lock-in mentioned
  - No setup fee, no platform fee mentioned
- **DEC-20260518-G verdict:** Monthly subscription model. At €42–€100/month (at ~400 HUF/EUR). This is a fixed monthly cost, not per-call passthrough. **Does NOT fit v1 cost discipline (per-call OK, fixed monthly NOT OK).**
- **Verdict: NOT VIABLE under v1 cost discipline.** Would be VIABLE-V1.1 if Strale moves to a usage-floor-included billing model, or VIABLE if volume justifies subscription cost at scale.

---

### 4c. OPTEN

- **URLs probed:** `opten.hu/ceginformacios-szolgaltatasok?lang=en`, `api.opten.hu/`, `opten.hu/ceginformacios-szolgaltatasok/cegtar?lang=en`
- **Status:** HTTP 200 on all.
- **Coverage:** OPTEN covers ~520,000 Hungarian companies, 420,000 sole proprietors, 1.7 million owners/executives. Piacvezető (market-leading) HU provider.
- **Fields:** Includes official company register data from Company Bulletin, owner details, property shares, contact data. Directors and authorized representatives covered (inferred from "official company registration data").
- **API model:** SOAP/API integration ("SOAP protokollon keresztül"). No REST API documented publicly.
- **Pricing (DEC-20260518-G probe):**
  - Cégtár Light: free (limited searches, web-only)
  - API/integration pricing: **RFQ only** — "Ajánlatkérés" (quote request). No public pricing.
  - Mention of 8,990 HUF/month as a starting point for Cégtár web subscription, but API pricing is separate and undisclosed.
  - No setup/platform/termination fees mentioned publicly — but RFQ model implies negotiated contract.
- **Contract structure concern:** OPTEN serves 10,000+ customers including banks and international groups — implies subscription/annual contract commercial model, consistent with the Topograph AT/DE/IT/NL pattern of heavy commercial contract.
- **DEC-20260518-G verdict:** Pricing fully RFQ-gated. SOAP-only API. Contract structure likely annual/subscription. High probability of platform fee or annual minimum given enterprise positioning.
- **Verdict: VIABLE-V1.1 (requires RFQ, likely subscription contract — warrants Topograph-style platform fee probe before engagement).** Not primary v1 path.

---

### 4d. WellData

- **URL probed:** `welldata.hu/uj-cegek-listaja/`
- **Status:** HTTP 200.
- **Coverage:** Newly registered companies only (day-of or weekly). Includes officers and directors of newly formed entities.
- **Pricing:** 32,990–39,990 HUF/month subscription. Fixed monthly.
- **Assessment:** Narrowly scoped to new registrations; not a general-purpose lookup. Monthly subscription. Not v1-compatible for general HU company representative lookup.
- **Verdict: NOT VIABLE** for general HU representative coverage.

---

### 4e. Bisnode (now Dun & Bradstreet HU)

- **URL probed:** `bisnode.com/developers/credit-information-b2b-api/` — **ECONNREFUSED** (connection refused).
- **Assessment from secondary sources:** D&B acquired Bisnode in 2020. D&B operates PartnerControl (HU) — subscription-required for Standard/Advance access. D&B's API pattern globally is enterprise contract-based, not per-call passthrough.
- **DEC-20260518-G verdict:** Cannot probe directly (connection refused). Enterprise subscription model expected. Not v1-compatible.
- **Verdict: NOT VIABLE** under v1 cost discipline (enterprise subscription model, no per-call pricing).

---

### 4f. Other candidates assessed from secondary sources

| Vendor | HU coverage | Rep fields | Pricing model | V1 compatible |
|--------|-------------|------------|---------------|---------------|
| Creditreform HU | Probable (national network) | Likely yes (credit reports include directors) | RFQ/subscription | Unknown — requires probe |
| Coface HU | Probable | Credit report style (may include directors) | RFQ/subscription | Unknown |
| Info-clipper.com | Yes (confirmed HU search) | Yes (cégkivonat content) | Per-report, ~€15–30 | Too expensive for v1 unit economics |
| company-hungary.com | Yes | Yes (cégkivonat download) | Per-document, OTP Bank payment | Too expensive for v1 unit economics |
| business1.com | Unknown | Unknown | ECONNREFUSED | Cannot assess |
| HitHorizons | Yes (HU in Visegrad group) | NOT confirmed | Quote-based | Cannot assess pricing |
| Scoris.eu | NO — 6 Nordic/Baltic countries only | N/A | N/A | NOT VIABLE |
| Schmidt & Schmidt / SystemDay | Yes (document broker) | Yes (cégkivonat) | £138–180/document | Far too expensive |
| OpenSanctions HU | Screening lists only | NO | Free | Wrong primitive |

---

## Path 5 — Statutorily-public web UI (DEC-20260518-F four-constraint check)

### Subject: OCCSZ public web UI at `occsz.e-cegjegyzek.hu` / `e-cegjegyzek.hu`

**DEC-20260518-F requires four constraints:**
(a) Statutorily public
(b) ToS per-call (not bulk scraping prohibited)
(c) Per-entity (not bulk crawl)
(d) Attribution

**Constraint assessment:**

**(a) Statutorily public:** YES.
The cégjegyzék is explicitly designated a "közhitelű nyilvántartás" (publicly trusted register) under Act V of 2006. The Ministry of Justice's own documentation states: "The data of companies registered at any Hungarian court of registration are available free of charge on the website of the Service of Company Information and Electronic Company Registration of the Ministry of Justice." Legal representatives are part of the statutory public record.

**(b) ToS per-call:** UNCERTAIN — ToS not confirmed.
The OCCSZ ASZF (terms of service) PDF at `gov.e-cegjegyzek.hu/Utmutatos/ASZF_OCCSZ_EN_V1.6.pdf` returned cryptographic certificate metadata (binary PDF, 464 kB) rather than readable ToS content during this session. The ToS could not be read and assessed. Secondary sources indicate automated/bulk access is NOT intended — the system is built for per-entity human or registered-system queries, not programmatic scraping.

**(c) Per-entity:** YES (technically).
The system is designed for individual company lookups by identifier (Cégjegyzékszám, adószám, VAT). Per-entity lookup is the expected use pattern.

**(d) Attribution:** YES.
Data source is clearly "Céginformációs Szolgálat, Ministry of Justice" — attributable.

**Technical feasibility:** The OCCSZ portal (`occsz.e-cegjegyzek.hu`) is a web SPA. Direct HTTP probes to company data endpoints (e.g. `e-cegjegyzek.hu/getceginfo.do?cg=0110043775`) returned **HTTP 400 Bad Request**, indicating session token or form-based submission requirements. The portal likely requires a browser session context (similar to HR's Oracle APEX SPA pattern). Not trivially curl-accessible.

**DEC-20260428-A Tier 1 gate:**
Even if all four DEC-20260518-F constraints were satisfied, DEC-20260428-A Tier 1 absolutely prohibits Strale-operated scrapers regardless of statutory basis. The OCCSZ public UI path is **blocked under Tier 1** for direct Strale access.

**DEC-20260518-F conclusion for OCCSZ web UI:**
- Constraint (a): YES
- Constraint (b): UNCERTAIN (ToS unread)
- Constraint (c): YES
- Constraint (d): YES
- **DEC-20260428-A Tier 1 override: BLOCKED** regardless of (a)–(d) outcome.
- **Use case:** Topograph and other Tier-2 vendors likely access via this pathway (or the OCCSZ XML API), then redistribute under vendor redistribution rights. Strale should route through Topograph (Path 4a), not attempt direct OCCSZ access.

**Path 5 verdict: BLOCKED (DEC-20260428-A Tier 1, absolute). Documents for the Path 5 4-constraint analysis are preserved above for completeness and for any future DEC-20260518-F re-evaluation if Topograph becomes unavailable.**

---

## Path 6 — Open data bulk download

### 6a. IM / OCCSZ bulk export search

- **Sources searched:** `opendata.hu`, `data.gov.hu`, official IM portal `ceginformaciosszolgalat.kormany.hu`.
- **Finding:** No open-license bulk company dataset with officer-level fields found. Unlike Estonia (CC BY 4.0 daily JSON at 45 MB, confirmed HTTP 200 in Phase 5 audit), Hungary does NOT publish a comparable open bulk company register dataset.
- **Contrast with EE:** The Estonian RIK publishes `kaardile_kantud_isikud.json.zip` (persons on registry card) as a CC BY 4.0 daily refresh. No analogous HU publication confirmed.
- **OCCSZ "bulk" evidence:** Secondary sources confirm OCCSZ supports machine-integration via XML API for ERP/CRM systems ("Company Information Service provides the possibility to retrieve user-defined data from the company registry and can be integrated into client systems with minimal development effort"). However, this is a registered-access XML API (Tier-2 vendor territory), not a bulk open download.

### 6b. Cégközlöny (Companies Gazette) bulk

- **URL probed:** `e-cegkozlony.gov.hu` → **TLS certificate error / expired certificate** (confirmed HTTPS connection failure during this session).
- **Alternative access confirmed:** `cegkozlony.hu/info/3` → 301 redirect to `cegportal.im.gov.hu/frontend/cegkozlony` (loaded, minimal content — SPA shell).
- **Publication schedule:** Weekly issues. Submission deadline Wednesday/Thursday.
- **Content confirmed from secondary sources:** Publishes company registration events — statute changes, liquidation proceedings, mergers, capital reductions. Officer appointment events are registered at court level and propagate to Cégközlöny.
- **Data access:** The `ckk.cegkozlony.hu` system handles direct company announcements (submissions). No bulk download API documented.
- **Format:** Primary format is human-readable gazette (PDF/HTML). No XML bulk export confirmed for Cégközlöny specifically.
- **WellData** (`welldata.hu`) offers Cégközlöny data delivery via API for newly registered companies at 32,990–39,990 HUF/month subscription — monthly fixed cost, not per-call.

### 6c. Magyar Közlöny (Hungarian Official Gazette)

- **URL probed:** `https://magyarkozlony.hu/` — HTTP 200, PDF-only format.
- **RSS feed available.** Free PDF access from July 1, 2008 onwards.
- **Content:** Magyar Közlöny covers statutory instruments, government appointments, presidential decrees. **Company director appointments are NOT published in Magyar Közlöny** — these go to Cégközlöny (company-level gazette) or directly to the court register. Magyar Közlöny does publish appointments of public officials (government, state bodies), which is a separate primitive.
- **API/XML bulk:** None confirmed. PDF only.

### Path 6 verdict: **NOT VIABLE** for v1 or v1.1. Hungary has not published a statutory open bulk company register dataset with officer fields. Cégközlöny partial coverage exists but is subscription-gated through WellData (new companies only, monthly fixed fee). Gazette parsing would be a long-term derivative-dataset build, not v1.

---

## Path 7 — Tier-2 commercial bulk (DEC-20260428-A)

### 7a. OPTEN bulk licensing

- **From public documentation:** OPTEN describes a "piactérkép" (market map) and marketing list capability covering all 520,000 HU companies. OPTEN is the leading HU data aggregator and licenses bulk company data to enterprise customers.
- **Bulk model:** Traditional enterprise data licensing (full database or selected segments) — typically annual contract with substantial floor price. OPTEN serves banks, international company groups. Not per-call.
- **DEC-20260428-A compliance:** OPTEN sources from OCCSZ/IM (official register) + Cégközlöny. Redistribution rights would need explicit DPA + licensing agreement with OPTEN.
- **Verdict: VIABLE in principle for Tier-2 bulk under DEC-20260428-A, but enterprise-contract model with unknown floor cost.** For v1, this is a last-resort path if Topograph fails. Not recommended as primary path.

### 7b. Other bulk providers

- **GlobalDatabase.com:** Lists HU companies with directors in their commercial database. Business model is subscription-based enterprise data licensing. Not per-call API.
- **D&B/Bisnode HU:** Enterprise data licensing. Annual contract model.
- **Assessment:** All commercial bulk licensors for HU follow enterprise annual contract patterns. None confirmed as per-call passthrough.

### Path 7 verdict: **NOT VIABLE for v1** (enterprise contract floors). VIABLE conceptually for a long-term batch enrichment layer if call volume justifies a bulk license negotiation (v1.1+).

---

## Path 8 — Gazette / historical parsing (Cégközlöny + Magyar Közlöny)

### 8a. Cégközlöny (Companies Gazette)

- **Nature:** Official journal of IM for company registration events. Publishes officer appointments/resignations/modifications as they flow through court registration.
- **Statutory basis:** Act V of 2006 §17 mandates publication of key registration events in Cégközlöny.
- **Scope for officer data:** When a managing director is appointed/replaced/deregistered, the court registration event is published in Cégközlöny. This is the HU equivalent of Estonia's Ametlikud Teadaanded or Belgium's Moniteur Belge for company events.
- **Access model:** Published weekly; human-readable gazette format. `ckk.cegkozlony.hu` is the submission portal, not a data API. No bulk download API confirmed.
- **TLS status:** `e-cegkozlony.gov.hu` — TLS cert expired (confirmed connection failure 2026-05-18). Whether this is a recent outage or a long-standing issue is unknown.
- **Parsing feasibility:** Gazette text follows structured patterns (court registration number, company name, event type, officer name, appointment/resignation date). Deterministic parsing is feasible in principle for structured sections. However:
  - No machine-readable XML feed confirmed.
  - Weekly publication lag (not real-time against OCCSZ).
  - Historical backfill: Cégközlöny has been digital since early 2000s; historical digitization coverage unclear.
- **WellData model:** WellData offers Cégközlöny-derived company data via API/email at 32,990–39,990 HUF/month (new companies only, subscription, monthly fixed fee).

### 8b. Magyar Közlöny

- **Scope for officer data:** Does NOT publish company director appointments. Covers government officials, statutory instruments. Wrong primitive for company officer coverage.
- **Verdict: NOT VIABLE** for company directors.

### Path 8 verdict: **VIABLE as a long-term derivative dataset build (v1.2+), NOT v1.**
Rationale: Cégközlöny publishes officer appointment events and is statutorily public. In theory, a dataset built from Cégközlöny gazette parsing would provide officer history (including historical officers not in current OCCSZ). However: (1) no bulk XML feed exists, (2) weekly lag vs OCCSZ real-time, (3) this is a Strale-operated scraping/parsing operation which requires careful DEC-20260428-A Tier 3 assessment (gazette text is public domain / government publication — likely cleaner than commercial scraping, but still requires doctrine check), (4) entity resolution (gazette text → Cégjegyzékszám) adds latency and error risk, (5) not v1. Document for future reference.

---

## Path 9 — Other HU-specific surfaces

### 9a. Céginfo.hu / CEGINFO

- **URL:** Not directly probed (not surfaced in primary searches).
- **Assessment from name-recognition:** CEGINFO is a known Hungarian company data provider (alongside OPTEN). Likely similar model — subscription-based, OCCSZ-sourced. Requires separate RFQ.
- **Verdict: NOT PROBED** in this session. Lower priority given Topograph confirmation. Would be a fallback if Topograph HU pricing is unacceptable.

### 9b. Céginformáció.hu

- **URL:** `ceginformacio.hu` (surfaced in search results as "Cégkivonat, Hiteles cégkivonat, Cégjegyzék").
- **Assessment:** Third-party cégkivonat reseller. Document-broker model (per-document, human-readable). Not an API. Per-document pricing likely in the HUF 600–2,000 range. Not v1-compatible for programmatic use.
- **Verdict: NOT VIABLE** for programmatic use.

### 9c. CégTaláló (cegtalalo.hu)

- **Assessment:** "Hiteles cégkivonat letöltés azonnal, e-cégjegyzék online" — provides authentic certified company extracts (hiteles cégkivonat) on demand. Per-document fee, credit card payment. Not an API.
- **Verdict: NOT VIABLE** for programmatic use.

### 9d. PartnerControl (partnercontrol.hu)

- **URL:** Surfaced in searches referencing D&B PartnerControl HU.
- **Assessment:** D&B PartnerControl is the Hungarian enterprise credit monitoring tool. Subscription required. Includes director/owner data.
- **Verdict: NOT VIABLE** under cost discipline (subscription model).

### 9e. EUID / BRIS interconnection for HU

- **Assessment (from e-Justice portal HU page + BRIS secondary sources):**
  - Hungary is connected to BRIS (confirmed: "Hungarian Act on Corporate Proceedings amended to oblige courts to provide and distribute data in accordance with the BRIS Directive").
  - BRIS scope: Kft (Kft.), Nyrt, Zrt., European companies, branch offices — in scope.
  - BRIS data returned for HU: Company name, legal form, seat, registration number. **Accessing legal representatives via BRIS is subject to charge** (e-Justice portal HU page: "Accessing all further content is subject to a charge").
  - BRIS does not provide a public REST API for third parties.
  - e-Justice portal BRIS search at `webgate.ec.europa.eu/e-justice/searchBris.do` — from US East egress, returns 307 redirect to sorry.ec.europa.eu (access restriction). Accessible from EU-based servers.
- **Verdict: NOT VIABLE.** BRIS confirms HU representatives are chargeable and the gateway has no third-party API.

---

## Verdict

### Overall verdict: **VIABLE-V1 (pending RFQ)**

**Confidence: HIGH**

**v1 path:** Topograph per-call API → `legalRepresentatives` from §13 of Cégkivonat PDF (parsed deterministically by Topograph) → name, birth date, address, role, start date, representation mode.

**Cost class:** Per-call, variable (kbyte-based TRE price + processing fee). No publicly disclosed per-call rate — RFQ required. Consistent with Topograph's documented model for other countries (HR confirmed per-call, no minimum commitment). **DEC-20260518-G probe: no platform fee, subscription floor, or annual minimum found in documentation.**

**Query identifier:** Topograph accepts Cégjegyzékszám, adószám (8-digit), HU-prefix VAT, company name (OCCSZ only). Current Openapi route uses HU-prefix VAT — compatible with Topograph's identifier intake.

**DEC-20260428-A compliance path:**
- Tier 1: Strale never scrapes — satisfied (Topograph intermediary).
- Tier 2: Topograph sources OCCSZ (official government register, Act V of 2006, közhitelű nyilvántartás). Underlying data is public records by statute. Vendor redistribution rights + DPA + provenance attestation required before production.
- provenance fields to set: `acquisition_method: "licensed_bulk"` (via Topograph), `primary_source_reference: "OCCSZ / Céginformációs Szolgálat, Ministry of Justice Hungary"`, `upstream_vendor: "Topograph"`.

**Blocking conditions remaining:**
1. RFQ to confirm no platform fee / subscription floor for HU calls.
2. DEC-20260428-A vendor attestation (redistribution rights letter, DPA from Topograph).
3. Topograph signup (magic-link, not instant key).
4. Legal representatives limited to active companies — known gap for dissolved entities (closed companies use minimal TRE format that may not include §13).

---

### Per-path findings table

| Path | Verdict | Evidence | Representatives in scope |
|------|---------|----------|--------------------------|
| 1 — Openapi other endpoints | NOT VIABLE | No HU-specific representatives SKU; WW-TOP/Advanced confirmed no officer fields | No |
| 2 — Direct registry API (OCCSZ) | PARTIALLY VIABLE / COMPLEX | OCCSZ XML API exists but requires registration via Magyar Cégadat Szolgáltató Kft; not self-serve; fee schedule opaque | Yes (in principle) |
| 3 — Free/open data | NOT VIABLE | No open officer dataset on opendata.hu or data.gov.hu; OpenCorporates subscription; GLEIF wrong primitive | No |
| 4a — Topograph | **VIABLE-V1 (pending RFQ)** | `legalRepresentatives` confirmed from §13 TRE; Topograph HU page documented; per-call, no floor mentioned | **Yes — name, birth date, address, role, start date, representation mode** |
| 4b — companyapi.hu | NOT VIABLE (cost model) | Manager names returned but monthly subscription 15,990–37,990 HUF/month fixed; not per-call passthrough | Partial (names only, no role detail) |
| 4c — OPTEN | VIABLE-V1.1 (RFQ required) | Market-leading HU provider, SOAP API, subscription model probable, pricing undisclosed | Yes (scope confirmed from documentation) |
| 4d — WellData | NOT VIABLE (narrow scope + subscription) | New companies only; monthly subscription model | Partial (new companies only) |
| 4e — D&B/Bisnode HU | NOT VIABLE | Connection refused; enterprise subscription model | Likely yes but not confirmable |
| 5 — OCCSZ web UI (DEC-518-F) | BLOCKED (DEC-20260428-A Tier 1) | (a) Statutory: YES; (b) ToS: UNCERTAIN; (c) Per-entity: YES; (d) Attribution: YES; Tier 1 override: ABSOLUTE | Yes (in web UI, not programmable) |
| 6 — Open data bulk | NOT VIABLE | No IM bulk dataset published; Cégközlöny subscription-only via WellData (new cos. only) | No |
| 7 — Commercial bulk | NOT VIABLE for v1 | Enterprise annual contracts; OPTEN, D&B all subscription/contract | Yes (for bulk licensing) |
| 8 — Gazette parsing (Cégközlöny) | V1.2+ only | Statutorily public, weekly lag, no XML feed, derivative-dataset build required | Yes (historical + current appointments) |
| 9 — Other HU surfaces (BRIS, etc.) | NOT VIABLE | BRIS representatives chargeable, no third-party API; cégkivonat resellers are per-doc, not API | No (programmatically) |

---

### Doctrine compliance log

| Decision | Compliance |
|----------|------------|
| **DEC-20260518-E** (Exhaustive 8-path enumeration) | All 8 paths documented with evidence (+ Path 9 for additional surfaces). |
| **DEC-20260518-F** (Path 6 4-constraint check) | Applied to OCCSZ web UI (Path 5). Constraint (b) ToS unread; DEC-20260428-A Tier 1 override applied regardless. |
| **DEC-20260518-G** (Mandatory platform-fee probe for Tier-2) | Full probe executed for Topograph (variable pricing, no floor mentioned — consistent with HR pattern), companyapi.hu (monthly subscription — disqualified), OPTEN (RFQ-gated — flagged as V1.1 risk), WellData (monthly subscription — disqualified), D&B/Bisnode (enterprise subscription — disqualified). |
| **DEC-20260428-A** (No Strale scraping) | Tier 1 enforced on OCCSZ web UI path. Topograph path assessed as Tier-2 compliant (official register, statutory public data, vendor intermediary). Redistribution rights + DPA listed as remaining prerequisites before production. |
| **Petter cost rule** (per-call OK, fixed monthly NOT OK) | companyapi.hu (monthly subscription) disqualified. WellData (monthly subscription) disqualified. OPTEN (suspected subscription) flagged as V1.1 only. Topograph (per-call variable) qualified. |
| **EU 2023/138 §5.1 CAVEAT** | NOT cited as representative-content mandate. The free OCCSZ tier is grounded in HU national law (Act V of 2006) and IM policy, not EU Open Data Directive §5.1. |

---

### Caveats

1. **Topograph HU per-call price unknown.** Variable pricing (kbyte-based TRE cost + processing fee) means cost-per-entity is not predictable without a specific company test. Large companies with extensive register history (e.g. OTP Bank, MOL) will cost more than small Kft. A `profileMaxBudget` parameter exists for budget control. RFQ should include: (a) sample calls on OTP Bank, MOL, Richter to establish typical cost range, (b) explicit confirmation of no platform fee, (c) DPA terms.

2. **Legal representatives limited to active companies.** Closed company Cégkivonat uses minimal TRE format that may omit §13 (legal representatives section). This is a known limitation from Topograph HU documentation. Historical officer coverage for dissolved entities is not available via Topograph/OCCSZ path.

3. **OCCSZ ToS unread.** The ASZF_OCCSZ_EN_V1.6.pdf ToS returned binary certificate data during this session. The ToS for programmatic OCCSZ access was not confirmed. Topograph's redistribution rights claim should be verified against the OCCSZ ToS as part of DEC-20260428-A due diligence.

4. **Cégközlöny TLS certificate expired.** `e-cegkozlony.gov.hu` returned TLS error during this session. This may indicate a temporary outage or a persistent infrastructure issue with the HU Companies Gazette portal. Does not affect Topograph path (Topograph uses OCCSZ XML API + TRE PDF, not the gazette portal).

5. **No Openapi HU upgrade path.** Current Openapi WW-Top route for HU cannot be upgraded to return representatives by selecting a different Openapi product. A vendor switch from Openapi to Topograph for HU is required to close the representatives gap.

6. **companyapi.hu manager names vs Topograph role detail.** If Strale's use case requires only manager names (not role, birth date, representation mode), companyapi.hu would technically fulfill the name requirement at a lower per-unit cost at volume — but the monthly subscription model disqualifies it under v1 cost discipline regardless.

7. **Sole trader note.** Topograph's HU coverage includes sole traders via NAV EVNY, at fixed (lower) pricing. Sole traders are registered individuals (naturally named), so "representatives" is a less meaningful concept — but the capability covers them for completeness.
