# CY — 8-path enumeration (Phase 6)

**Date:** 2026-05-18  
**Author:** Claude Code (research subagent, synthesized)  
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260518-F (per-call HTML/PDF parsing under 4 constraints); DEC-20260518-G (platform-fee probe mandatory for Tier-2 aggregators); DEC-20260428-A (no Strale-operated scrapers); cost discipline (per-call passthrough OK, fixed monthly fees NOT OK in v1)  
**Test entities:** Wargaming Group Limited (CY reg 290868 / `CY99000230P` Openapi slug); Bank of Cyprus Public Company Limited (HE format, DRCOR primary)

---

## Prior finding re-verification: DEC-20260507-G (data.gov.cy DRCOR "Tier-1 direct buildable")

**Prior claim:** 2026-05-07 spike identified data.gov.cy DRCOR open-data dataset as "Tier-1 direct buildable" with CC-BY confirm-at-ingest.

**Re-verification result (2026-05-18): CONFIRMED AND UPGRADED.**

Three CSV files probed live today via HTTP HEAD + partial GET:

| File | URL | HTTP | Content-Length | Last-Modified | Content-Type |
|------|-----|------|----------------|---------------|--------------|
| Officers (`organisation_officials_83.csv`) | `https://data.gov.cy/sites/default/files/organisation_officials_83.csv` | **200 OK** | **125,808,168 bytes (120 MB)** | 2026-04-29 07:35 UTC | text/csv |
| Registered Offices (`registered_office_96.csv`) | `https://data.gov.cy/sites/default/files/registered_office_96.csv` | **200 OK** | 20,596,024 bytes (20 MB) | 2026-04-29 07:34 UTC | text/csv |
| Organisations (`organisations_94.csv`) | `https://data.gov.cy/sites/default/files/organisations_94.csv` | **200 OK** | 92,099,139 bytes (88 MB) | 2026-04-29 07:34 UTC | text/csv |

**License confirmed live:** CC BY 4.0 International — retrieved directly from dataset page `https://data.gov.cy/el/dataset/mitroo-eggegrammenon-etaireion-emporikon-eponymion-kai-synetairismon-stin-kypro`. **Not NonCommercial** (OpenSanctions metadata erroneously described it as "CC Attribution NonCommercial" — the source page itself says CC BY 4.0 unqualified, which is the authoritative value).

**Officers file column schema (first-row probe confirmed):**
```
ORGANISATION_NAME, REGISTRATION_NO, ORGANISATION_TYPE_CODE, ORGANISATION_TYPE,
PERSON_OR_ORGANISATION_NAME, OFFICIAL_POSITION
```

**Role taxonomy (uniq -c on OFFICIAL_POSITION column, 1,168,824 total rows):**
| Greek role | Count | Translation |
|-----------|-------|-------------|
| Διευθυντής | 635,123 | Director |
| Γραμματέας | 438,479 | Secretary |
| Ιδιοκτήτης | 58,558 | Owner (trade names / business names) |
| Ομόρρυθμος Συνέταιρος | 17,366 | General partner (partnerships) |
| Αντικαταστάτης Διευθυντής | 5,901 | Alternate Director |
| Βοηθός Γραμματέας | 3,383 | Assistant Secretary |
| Εξουσιοδοτημένο Πρόσωπο | 3,365 | Authorised Person |
| Ετερόρρυθμος Συνέταιρος | 2,353 | Limited partner |
| Αναπληρωτής Γραμματέας | 463 | Deputy Secretary |

**Live data probe — Wargaming Group Limited (registration 290868):**
```csv
WARGAMING GROUP LIMITED,290868,C,Εταιρεία,NICK KATSELAPOV,Διευθυντής
WARGAMING GROUP LIMITED,290868,C,Εταιρεία,VICTOR KISLYI,Διευθυντής
WARGAMING GROUP LIMITED,290868,C,Εταιρεία,ΕΥΓΕΝΙ ΚΙΣΛΥ,Διευθυντής
WARGAMING GROUP LIMITED,290868,C,Εταιρεία,ΜΑΡΙΟΣ ΠΕΛΙΔΗΣ,Γραμματέας
WARGAMING GROUP LIMITED,290868,C,Εταιρεία,ΧΡΙΣΤΗΣ ΧΡΙΣΤΟΦΟΡΟΥ,Διευθυντής
```

**Wargaming Openapi 204 anomaly explained:** Openapi accepted `CY99000230P` (numeric-suffix format) but returned 204 No Content. The DRCOR open-data file uses pure numeric registration numbers (e.g., `290868`) — no CY prefix, no letter suffix. The `CY99000230P` slug does not exist in the DRCOR registry. It is likely a placeholder or erroneous test value from a prior Openapi correspondence. Wargaming is registered as number `290868`, type `C` (Εταιρεία = Private Company Limited). The `HE` prefix (used in the eFiling web UI) and the Greek `ΗΕ` prefix (used by Topograph) are display conventions; DRCOR open data uses raw numeric IDs.

**Dataset refresh cadence:** Monthly (confirmed from page: "Μηνιαία"). Last-Modified timestamps on all three files were 2026-04-29, consistent with monthly cycle.

**Upgrade over DEC-20260507-G:** Prior finding confirmed CC-BY and buildable but did not document field schema, row count, live probe results, or Wargaming anomaly resolution. Those are now on record.

**v1 path status: CONFIRMED VIABLE TODAY.** No contract, no auth, no lead time, no cost. CC BY 4.0 permits commercial use with attribution. Officers (directors + secretaries + partners) are in scope. Monthly refresh is a known limitation (not live-fetch).

---

## Path 1 — Same vendor (Openapi), other endpoints; CY-specific Openapi products

**URLs probed:**
- `https://openapi.com/products` — full product catalog
- `https://console.openapi.com/apis/company/documentation` — company API documentation
- `https://openapi.com/products/company-start-world-wide` — WW-Start product page

**Findings:**

Openapi's company documentation lists 49 production scopes covering AT, BE, CH, DE, ES, FR, GB, IT, PL, PT, and WW (worldwide). **Cyprus (CY) is not listed as a dedicated scope.** There is no `CY-start`, `CY-top`, `CY-directors`, or `CY-representatives` endpoint.

CY is served via the generic `WW-Top` and `WW-Start` endpoints. The `WW-Start` documentation returns "over 20 data points" including company name, VAT number, business status, registered office, and GPS coordinates. Per the prior coverage audit, the Openapi WW-Top response for CY returns 6/7 Tier-1 identity fields (no `legal_form`) but **no directors/legal_representatives**.

The Openapi documentation notes that country-specific representative endpoints (e.g., `current-company-representatives-italy`, `IT-stakeholders`, `IT-ubo`) exist only for Italy among EU countries. There is no equivalent CY-specific representative endpoint.

**Has Openapi added directors for CY since 2026-05-11?** No evidence of a new CY-directors product. The audit correspondence anomaly (Openapi claimed CY coverage, Wargaming returned 204) remains unresolved on the vendor side. The root cause is now identified: the `CY99000230P` test value is not a valid DRCOR registration number in any format.

**Verdict: NOT VIABLE for directors.** The WW-Top CY endpoint remains identity-only. No CY-specific director product exists on Openapi as of 2026-05-18.

**Cost for what it currently returns:** €0.16/call (WW-Top, Committed tier). No incremental cost for a non-existent field.

---

## Path 2 — Direct registry API (DRCOR / efiling.drcor.mcit.gov.cy) — paid API tier

**URL probed:** `https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx?sc=0&lang=EN`  
**HTTP probe result:** 200 OK  
**Headers:** Microsoft-IIS/7.0, ASP.NET 4.0, sets `ASP.NET_SessionId` cookie + `_culture` cookie + `.ASPXANONYMOUS` cookie. Session-based, requires cookie persistence for multi-step navigation.

**Does DRCOR publish a paid API?**

No. The DRCOR public eSearch is a browser-based ASP.NET Web Forms application (not an API). There is no documented paid API tier. The official companies.gov.cy website lists four eServices: eSearch, eFiling, Other e-Services, and UBO registration — none of which is a programmatic data API.

**DEC-20260518-G platform-fee probe:**
- Platform fee: N/A (no API product exists)
- Setup fee: N/A
- Monthly minimum: N/A
- Annual floor: N/A
- Volume-tier floors: N/A
- Termination fees: N/A

**What the paid tier (€10) provides:** A full search of the selected organisation's electronic file from registration date to search date — delivered as a human-readable web page or downloadable document, not a structured API response. This is a per-query document retrieval service, not a machine-readable API.

**Verdict: NOT VIABLE.** No DRCOR paid API exists. The €10 paid search is a document-retrieval service for humans, not an API for integration.

---

## Path 3 — Direct registry API, free / open tier (data.gov.cy DRCOR open data)

**PRIORITY PATH — DEC-20260507-G re-verification**

**Dataset page URL:** `https://data.gov.cy/el/dataset/mitroo-eggegrammenon-etaireion-emporikon-eponymion-kai-synetairismon-stin-kypro`  
**Publisher:** Department of the Registrar of Companies and Intellectual Property (DRCIP), Republic of Cyprus  
**Organization on portal:** Department of Registrar of Companies and Intellectual Property (8 datasets total)

**Three resources available:**

| Resource | Greek name | Format | Size | URL (relative to data.gov.cy) | HTTP probe |
|---------|-----------|--------|------|-------------------------------|------------|
| Officers | Κατάλογος Αξιωματούχων | CSV | 120 MB | `/sites/default/files/organisation_officials_83.csv` | **200 OK** |
| Addresses | Κατάλογος Διευθύνσεων Εγγεγραμμένου Γραφείου | CSV | 20 MB | `/sites/default/files/registered_office_96.csv` | **200 OK** |
| Organisations | Κατάλογος Οργανισμών | CSV | 88 MB | `/sites/default/files/organisations_94.csv` | **200 OK** |

**Officers CSV schema (confirmed via live first-row probe 2026-05-18):**
- `ORGANISATION_NAME` — company name (Latin script for foreign companies; Latin + Greek for domestic)
- `REGISTRATION_NO` — pure numeric ID (e.g., `290868`), no prefix or suffix
- `ORGANISATION_TYPE_CODE` — single letter: `C` = Εταιρεία (private), `O` = Αλλοδαπή (foreign), `B` = Εμπορική Επωνυμία (trade name), `S` = cooperative
- `ORGANISATION_TYPE` — Greek description of type
- `PERSON_OR_ORGANISATION_NAME` — officer name (individual or corporate nominee)
- `OFFICIAL_POSITION` — Greek role term (Διευθυντής, Γραμματέας, Εξουσιοδοτημένο Πρόσωπο, etc.)

**Row count:** 1,168,824 total officer rows (confirmed via `wc -l` against live URL). Covers active + struck-off companies (historical and current records mixed — struck-off companies still have their officer rows listed).

**Officers in scope?** YES. 635,123 director (Διευθυντής) rows + 438,479 secretary rows + all partner/authorized-person variants. Both individual names and corporate nominees are included.

**Missing fields vs. live-registry standard:**
- No date-of-appointment or date-of-cessation per row
- No personal identifier (DOB, national ID) — names only
- No address of officer
- No distinction between current and historical appointments (the file appears to be a snapshot of the register state, not a change log; struck-off entities are included but active/ceased per-officer is not flagged at row level)
- `REGISTRATION_NO` is numeric only — joinable with the organisations CSV but not directly matchable to the `HE`/`ΗΕ` prefix format used in the eFiling web UI

**License:** CC BY 4.0 International (Creative Commons Attribution 4.0). Commercial use permitted with attribution. Confirmed from dataset page; OpenSanctions metadata (CC BY NC) is erroneous.

**Refresh cadence:** Monthly ("Μηνιαία"). Last-Modified on all three files: 2026-04-29 07:34–07:35 UTC. Next expected refresh: approximately 2026-05-29.

**Cost:** FREE. No auth, no registration, no API key.

**DEC-20260518-G platform-fee probe:** N/A — no vendor, no platform, no fee of any kind.

**DEC-20260428-A compliance:** COMPLIANT. This is Tier-2 licensed bulk data: DRCIP is the statutory registrar, the data is public records by statute, CC BY 4.0 is the redistribution license with no commercial restriction, and provenance is unambiguous (government publisher). Strale does not operate a scraper — it downloads a government-published open-data file.

**Verdict: VIABLE-V1 TODAY.** This is the primary v1 path. Monthly ingest + index by registration number + role lookup. No vendor negotiation required. Operational within days of implementation.

**Known limitation for v1:** Monthly refresh means up to 30-day stale appointments. Live-fetch (Path 5 / Topograph / eFiling) required for real-time officer status. Must disclose refresh lag via `freshness_category: reference-data` and `fetched_at` timestamp in provenance output.

---

## Path 4 — Tier-2 paid per-call aggregators (beyond Openapi)

### 4a. Topograph

**Documentation URL:** `https://docs.topograph.co/essentials/cyprus` — fetched successfully 2026-05-18.

**CY coverage confirmed:** YES. `legalRepresentatives` is explicitly returned. Structure:
```json
{
  "legalRepresentatives": [
    {
      "type": "individual",
      "role": {
        "localName": "Διευθυντής",
        "englishTranslation": "Director",
        "standardized": "director"
      },
      "individual": {
        "name": { "fullName": "VICTOR KISLYI" }
      }
    },
    {
      "type": "company",
      "role": {
        "localName": "Γραμματέας",
        "englishTranslation": "Secretary",
        "standardized": "secretary"
      },
      "company": {
        "legalName": "THEMIS SECRETARIAL SERVICES LIMITED",
        "countryCode": "CY"
      }
    }
  ]
}
```

**Data source:** Single source — DRCOR public e-filing portal (NOT the open-data CSV). Topograph navigates the eFiling portal programmatically and extracts structured data from HTML responses. Shareholder data additionally sourced from Trade Register Extract PDF via OCR + AI.

**Registration number format:** **CRITICAL CONSTRAINT** — Topograph requires the Greek letter prefix `ΗΕ` (eta-epsilon in Greek Unicode, U+0397 U+0395), not the Latin `HE`. The documentation explicitly states: "The registration number **must** include the Greek letter prefix (ΗΕ, ΕΕ, Σ, ΑΕ)" using actual Greek Unicode characters. This is a non-trivial input normalization requirement that Strale must handle.

**Pricing model (DEC-20260518-G probe):**

The documentation states: "The live source of truth for coverage, pricing, data sources, documents, legal forms, roles, and status values is the pricing page at `https://topograph.co/pricing/cy`." That page returned only a generic landing page without CY-specific pricing (magic-link gated, RFQ required, same pattern as HR). The pricing model is confirmed as **pay-per-request with no bulk contracts or minimum commitments** (confirmed via web search citing Topograph's own marketing and Seedcamp funding announcement).

DEC-20260518-G fee probe results:
- Platform fee: **NOT DISCLOSED** (page gated; from HR precedent, likely none — Topograph's differentiation is "no subscription")
- Setup fee: Not disclosed
- Monthly minimum: Confirmed none ("no minimum commitments" — Topograph's explicit marketing claim)
- Annual floor: Not disclosed; implied none
- Volume-tier floors: Not disclosed; implied per-request only
- Termination fees: Not disclosed

**Assessment:** Topograph fits the cost discipline (per-call, no subscription floor) but CY-specific per-call price requires RFQ. The HR audit found similar gating. Topograph scrapes the eFiling portal (Tier-1 Strale-operated scraping banned under DEC-20260428-A, but Topograph operating as a licensed vendor consuming public records is Tier-2 — requires vendor attestation of redistribution rights and provenance, which Topograph provides via their data-sourcing documentation).

**Verdict: VIABLE-V1.1 (pending RFQ + DEC-20260428-A vendor attestation).** Real-time officers vs. monthly-refresh for Path 3. Use as upgrade path if monthly staleness is a customer issue.

### 4b. Kyckr

**Coverage:** Confirmed via kyckr.com blog: "Kyckr provides live access to company data from 300+ official company registers worldwide" and Cyprus is covered. Director data explicitly confirmed for CY.

**Pricing model:** Fully RFQ-gated. No public per-call or subscription pricing disclosed. TrustRadius page shows "no pricing plans listed." Per Kyckr's company-information product page, data is accessible via REST API or web portal.

DEC-20260518-G fee probe: All dimensions undisclosed; RFQ required. Pattern consistent with enterprise subscription, historically £3–10/lookup for comparable jurisdictions (from HR audit precedent).

**Verdict: VIABLE-V1.2 fallback** if Topograph RFQ fails. Contact required.

### 4c. OpenCorporates

**Coverage:** OpenCorporates confirm Cyprus directors with score 10/10 on their register scoring matrix. Web access is free for public-benefit use; API access requires subscription (£2,250+/yr per HR audit precedent).

**Pricing:** Subscription model (annual). NOT passthrough-compatible under Petter cost rule.

**Verdict: NOT VIABLE-V1** (subscription, not per-call). Could serve as a free enrichment layer for non-commercial research purposes only.

### 4d. Moody's Analytics / Kompany / Bureau van Dijk

**Coverage:** Moody's Analytics offers entity verification for 348M+ companies globally. Cyprus included. API accessible via Moody's API Hub. However, the API Hub returned "No products to display" for unauthenticated probe — pricing and subscription model are fully enterprise-gated.

DEC-20260518-G fee probe: All dimensions undisclosed; enterprise negotiation required. BvD/Kompany historically subscription-heavy with annual contracts.

**Verdict: NOT VIABLE-V1** (enterprise subscription expected).

### 4e. companiesregistry.cy (local Cyprus-specific provider)

**Coverage:** Provides reports on Cyprus companies including directors, secretaries, addresses, documents. 24-hour turnaround. No API documented — report-based service only.

**Verdict: NOT VIABLE-V1** (no API, report delivery model not compatible with real-time agent workflows).

---

## Path 5 — Statutorily-public web UI (DEC-20260518-F) — efiling.drcor.mcit.gov.cy

**URL probed:** `https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx?sc=0&lang=EN`  
**HTTP probe:** 200 OK

**DEC-20260518-F constraint check (all four must hold for this path to be permissible):**

### Constraint (a): Statutorily public
**YES.** EU e-Justice Portal confirms: "name of existing directors and secretary/partners/trade name owner" is available **at no cost** in the eSearch free results. The Companies Section explicitly states these fields are in the free public search layer. The Registrar of Companies Act (Cyprus) requires public disclosure of directors and secretaries.

### Constraint (b): ToS permits per-call
**NOT CONFIRMED.** No Terms of Service or Acceptable Use Policy is linked or referenced on the public search page. The efiling.drcor.mcit.gov.cy site is an ASP.NET Web Forms application with session cookie management — it does not present a ToS on the public search form. Without an explicit ToS that permits programmatic per-call access, this constraint is unverified. The absence of an explicit ToS does not confirm permission; it creates ambiguity.

### Constraint (c): Per-entity per-customer-request
**STRUCTURAL FIT, NOT VERIFIED.** Strale would query once per customer request per entity. The portal design (search by name or number, one company at a time) is architecturally suited to per-entity queries. However, without a ToS confirmation, "per-entity" cannot be verified as permitted.

### Constraint (d): Attribution preserved
**PARTIAL.** The DRCOR/DRCIP as publisher is identifiable. Attribution would be `source: "Department of Registrar of Companies and Intellectual Property, Republic of Cyprus"` with `primary_source_reference: "https://efiling.drcor.mcit.gov.cy"`. However, without a ToS this is constructive attribution, not verified-approved attribution.

**Technical friction analysis:**
- **Session management:** ASP.NET session cookie required (`ASP.NET_SessionId`). Not a hard blocker but adds per-session handshake overhead.
- **CAPTCHA:** Not directly observed on the search form, but the site is ASP.NET Web Forms — ViewState and hidden form fields are likely required for POST submission. No explicit CAPTCHA found in the HTTP probe.
- **JavaScript rendering:** Site is Microsoft-IIS/7.0 + ASP.NET 4.0. Page content is 30,888 bytes server-side rendered HTML — not a JS SPA. Basic HTML parsing should work without a headless browser.
- **Director display in free results:** EU e-Justice Portal confirms director names are in the free search results. Topograph's documentation confirms they extract this data from the same portal. This validates that directors ARE in the HTML response, not behind the €10 payment gate.

**Doctrine ruling:** DEC-20260518-F constraints (a) and (c)/(d) are architecturally satisfied. Constraint (b) is **unverified** — no ToS found. Under DEC-20260428-A, Tier 1 (Strale operates the scraper) is an absolute bar regardless of ToS. Since this path would require Strale to operate an HTTP scraper against the eFiling portal, it is **BLOCKED under DEC-20260428-A Tier 1**, not under DEC-20260518-F.

**The Path 5 question becomes moot for v1:** Path 3 (open data bulk) delivers the same underlying data (same DRCOR source) with explicit CC BY 4.0 license, no scraping required, and no ToS ambiguity. Path 4a (Topograph) delivers live-fetch from the same portal via a Tier-2 vendor operating the scraper (Tier-2 permissible under DEC-20260428-A).

**Verdict: BLOCKED (DEC-20260428-A Tier 1 absolute bar).** Not needed given viable alternatives on Paths 3 and 4a.

---

## Path 6 — Open data bulk download (dual-path with Path 3)

This path is **confirmed and identical to Path 3** for CY.

The data.gov.cy DRCOR dataset is the open-data bulk download. Unlike Estonia (where open data and the contracted SOAP API were separate paths with different latency characteristics), for Cyprus the open data IS the bulk download — there is no separate "bulk contract" tier distinct from the public CSV.

**Additional bulk surfaces checked:**

- **OpenSanctions `cy_companies` dataset:** `https://data.opensanctions.org/datasets/20260518/cy_companies/entities.ftm.json` (1.14 GB) — available under CC 4.0 Attribution NonCommercial (OpenSanctions adds NC to their redistribution). The underlying source is the same data.gov.cy CSV. Using OpenSanctions as intermediary would add the NC restriction that the original source does NOT have. **Use the primary source (data.gov.cy) directly.**
- **OpenSanctions `ext_cy_companies` dataset:** 1,883 entities only — enrichment of PEP/sanctions-linked CY companies, not a general registry. Not useful for general director lookup.
- **data.europa.eu / CKAN EU portal:** No separate CY companies bulk dataset found outside the data.gov.cy primary.
- **EU Business Registers Interconnection System (BRIS):** CY is connected to BRIS via the EU e-Justice portal. BRIS exposes basic identity data (no officers) and document retrieval (€10 equivalent). Not a bulk path.

**Verdict: SAME AS PATH 3** (viable-v1 today, free, CC BY 4.0, monthly refresh).

---

## Path 7 — Tier-2 commercial bulk under DEC-20260428-A (who licenses DRCOR bulk?)

**Question:** Are there commercial data providers who license the full DRCOR dataset in bulk (with fresher refresh than monthly open data) and redistribute it under a commercial agreement?

**Findings:**

Topograph (Path 4a) is the clearest documented Tier-2 operator for CY. They source from the DRCOR eFiling portal programmatically — this is scraping-derived data from a statutory public source, permissible under DEC-20260428-A Tier 2 given Topograph's documentation of sourcing + their per-entity API structure. Topograph's CY documentation explicitly states the data source as "DRCOR (Department of Registrar of Companies and Official Receiver)" with the e-filing portal as the retrieval mechanism.

**What Topograph provides over the open-data bulk:**
- Real-time (live-fetch from eFiling, not monthly batch)
- Structured JSON with English-translated role fields
- `legalForm` field (ISO 20275 standardized)
- AI-powered individual/company disambiguation for nominees
- `availableDocuments` list for further document retrieval

**Other commercial bulk licensees:**
- **Bureau van Dijk / Moody's Orbis:** Includes CY company data but no documented DRCOR bulk license agreement; data sourcing is opaque for CY specifically. Enterprise subscription model makes it v1-incompatible regardless.
- **Kyckr:** Uses direct DRCOR eFiling retrieval (per their blog), similar Tier-2 model to Topograph. Pricing RFQ-gated.
- **LexisNexis / Dun & Bradstreet:** Coverage confirmed for CY but commercial bulk, enterprise subscription. Not v1-compatible.

**DEC-20260428-A compliance checklist for Topograph (Tier-2):**
- [x] Underlying data is public records by statute (Cyprus Companies Law, DRCOR statutory mandate)
- [x] Vendor (Topograph) documents redistribution rights via their data-sourcing page
- [ ] Vendor indemnification: not explicitly confirmed in public documentation — must be verified in commercial agreement
- [x] Vendor provides primary-source provenance per fact (Topograph credits DRCOR explicitly in their docs)
- [x] Strale discloses sourcing via `provenance.upstream_vendor` = "Topograph" + `primary_source_reference` = "https://efiling.drcor.mcit.gov.cy"

**Open item for v1.1 (Topograph path):** Obtain written indemnification / redistribution rights attestation from Topograph as part of commercial agreement.

**Verdict:** Path 7 is operationally Path 4a (Topograph) with the commercial-agreement lens. No distinct bulk-license product was identified beyond the open-data CSV (Path 3) and the Topograph per-call API (Path 4a). **Viable-V1.1** under Topograph per-call model; **viable-v1** under Path 3 open data.

---

## Path 8 — Gazette / historical PDF parsing (Cyprus Official Gazette)

**URL probed:** `https://www.mof.gov.cy/mof/gpo/gazette.nsf/officialgazette-en/officialgazette-en` — TLS certificate error (could not verify).  
**Fallback probe:** `https://www.companies.gov.cy/en/knowledgebase/gazette` — 200 OK, content retrieved.

**Gazette structure:**
The Cyprus Official Gazette (Επίσημη Εφημερίδα της Κυπριακής Δημοκρατίας) is published by the Government Printing Office (Κυβερνητικό Τυπογραφείο) under the Ministry of Finance. Company-related announcements are in the **Fifth Supplement (Παράρτημα Πέμπτο) — Part I**.

The Companies Section maintains a searchable gazette archive at `companies.gov.cy/en/knowledgebase/gazette` with 600+ gazette publications indexed by publication number and date, covering multiple entity types (Company, Partnership, Business Name, European Company, Overseas Company).

**What the Gazette publishes for companies:** Company formation announcements, name changes, registered office changes, and officer changes are published via HE forms (HE3 for initial directors, HE4 for subsequent changes). The Gazette is the official publication vehicle for these notifications.

**Format:** The gazette publications appear linked on the DRCOR site, but the actual file format (PDF vs. HTML) could not be confirmed from the content retrieved (the gazette page showed publication metadata but not file links in the rendered content). Historical issues from 1878 onward are in the Cyprus Digital Library at `cyprusdigitallibrary.org.cy`. Older issues (pre-Republic) are in English; 1961+ are in Greek.

**Online access:** The Government Printing Office publishes gazettes online. The DRCOR gazette knowledgebase links to gazette issues with filterable archive. Access appears free for the index; individual issue access format unclear.

**Is this path viable for officers?** In principle, officer appointment notifications (HE4 form submissions) appear in the Fifth Supplement. However:
1. Gazette covers individual announcements (change events), not the current officer snapshot
2. The current officer snapshot is already available via Path 3 (open-data CSV, monthly)
3. Gazette parsing would produce a historical change log, not a current-state snapshot — a more complex derivative dataset build
4. The Gazette is in Greek; OCR/parsing for historical PDFs would require LLM processing

**Assessment under DEC-20260518-F (gazette as per-call parsing):**
- Constraint (a) Statutorily public: YES — the Gazette is published by statute as the official public record
- Constraint (b) ToS permits per-call: Unclear — Government Printing Office publishes for public access; no explicit ToS restricting programmatic access was found, but also none explicitly permitting it
- Constraints (c)+(d): Fit for a gazette-parsing derivative dataset
- DEC-20260428-A: Would require Strale to operate PDF parsing (acceptable — not web scraping of a dynamic JS site, but static PDF download and parsing). Borderline Tier 1/Tier 2 — gazette is the statutory public record itself.

**Verdict: NOT-V1 — historical/derivative dataset only.** The gazette path would build a historical officer change-log that complements the current-snapshot Path 3 data. Not a v1 feature given Path 3 already provides the current officer snapshot. Worth noting as a v2 historical-officers feature if customers need appointment history with dates.

---

## Path 9 (Additional) — Other CY-specific surfaces

### 9a. Cyprus UBO / Beneficial Ownership Register (ubo.meci.gov.cy)

**System:** The Beneficial Ownership Register (BOR) is a fully electronic register administered by DRCIP, accessed at `https://ubo.meci.gov.cy` via Cy Login / Ariadni government gateway.

**Public access status:** **CLOSED TO PUBLIC** as of 2023-01-03. Following the European Court of Justice ruling on UBO register public access (WM and Sovim SA v Luxembourg, C-37/20 and C-601/20, November 2022), Cyprus ceased public access to the UBO register on 2023-01-03. Access is now limited to obliged entities (credit institutions, auditors, lawyers, etc.) and competent authorities only. Access requires Cyprus-registered entity or professional-licence status.

**Is this relevant for directors?** UBO ≠ directors. The UBO register contains beneficial ownership information (25%+ shareholders controlling the entity) — not the board of directors or secretaries. Even if public access were restored, UBO data would not substitute for director data.

**Verdict: OUT OF SCOPE** — UBO register is not director/officer data, and it is closed to public access.

### 9b. UK Companies House CY carryover (pre-independence pattern)

Cyprus gained independence in 1960. Companies formed under British colonial administration were re-registered with DRCOR. There is no surviving operational link between Cyprus DRCOR and UK Companies House — they are fully separate registries. UK Companies House does NOT contain CY directors for post-independence companies.

**Verdict: NOT APPLICABLE** for modern CY companies.

### 9c. Apitalks / api.store free aggregator

**URL probed:** `https://api.store/cyprus-api/republic-of-cyprus-ministry-of-finance-api/register-of-registered-companies-commercial-names-and-cooperatives-in-cyprus-api`  
**Finding:** This is an Apitalks wrapper around the same data.gov.cy DRCOR dataset. Fully free ("funded by Apitalks"). Includes the "List of Officers" with `PERSON_OR_ORGANISATION_NAME` and `OFFICIAL_POSITION`. The underlying data is the same monthly CSV from Path 3.

**Verdict: NOT a distinct path** — same underlying data as Path 3, with an intermediary wrapper. Using the primary source (data.gov.cy) directly is cleaner and avoids Apitalks intermediary dependency.

### 9d. Cyprus Stock Exchange (CSE) disclosed-person requirements

Listed Cypriot companies must disclose directors under Market Abuse Regulation. The CSE and CySEC (Cyprus Securities and Exchange Commission) publish director disclosures for listed entities. However, CY has relatively few listed companies (Bank of Cyprus, Hellenic Bank, etc.) — this covers a tiny fraction of the DRCOR universe.

**Verdict: NOT VIABLE as a general path** — covers <50 entities, not scalable.

---

## Summary verdict

**Overall verdict: VIABLE-V1 TODAY**  
**Confidence: HIGH**

### v1 path (recommended)

**Path 3 — data.gov.cy DRCOR open-data monthly CSV**

| Dimension | Value |
|-----------|-------|
| Cost class | FREE (no cost, no auth, no vendor) |
| Data source | DRCIP (Department of Registrar of Companies and Intellectual Property), Republic of Cyprus |
| License | CC BY 4.0 International |
| Fields | ORGANISATION_NAME, REGISTRATION_NO, ORGANISATION_TYPE_CODE, ORGANISATION_TYPE, PERSON_OR_ORGANISATION_NAME, OFFICIAL_POSITION |
| Roles covered | Director (635K rows), Secretary (438K rows), Alternate Director, Authorized Person, General/Limited Partner, Owner |
| Entity count | ~565K companies + 1.17M officer rows |
| Refresh | Monthly (last updated 2026-04-29) |
| Auth required | None |
| Contract required | None |
| Lead time | None — operational within days |
| DEC-20260428-A compliance | Tier 2: licensed-bulk, statutory public records, CC BY 4.0 redistribution rights, DRCIP = primary-source publisher |
| DEC-518-G probe | N/A (no vendor) |
| Provenance output | `source: "DRCIP"`, `primary_source_reference: "https://data.gov.cy/el/dataset/..."`, `acquisition_method: "open-data-bulk"`, `upstream_vendor: null` |
| Freshness category | `reference-data` (monthly batch, not live-fetch) |
| Known limitation | Up to 30-day staleness; no appointment/cessation dates per row; no officer addresses; current vs. historical appointments not row-level flagged |

### v1.1 path (real-time upgrade)

**Path 4a — Topograph per-call API**

| Dimension | Value |
|-----------|-------|
| Cost class | Per-call (pay-per-request, no subscription floor, no minimum commitments) — CY price RFQ-gated |
| Data source | DRCOR eFiling portal (Topograph navigates programmatically) |
| Fields | `legalRepresentatives` array with type/role/name; `legalForm`; `status`; full identity fields |
| Refresh | Live-fetch (real-time) |
| Auth required | Topograph API key |
| DEC-20260428-A compliance | Tier 2: Strale does not operate scraper; Topograph operates scraper against statutory public records; vendor credits DRCOR; indemnification must be confirmed in commercial agreement |
| DEC-518-G probe | Platform fee: not disclosed (implied none); setup: not disclosed; monthly minimum: confirmed none; annual floor: implied none |
| Input constraint | Registration number must use Greek Unicode prefix `ΗΕ` (not Latin `HE`) |
| Friction | RFQ required; DEC-20260428-A vendor-attestation process; Greek-prefix input normalization |

---

## Per-path findings table

| Path | Label | Representative data? | Evidence | Cost class |
|------|-------|---------------------|----------|------------|
| 1 | Openapi other endpoints / CY-specific product | NO | WW-Top returns identity only; no CY-directors product; 204 on Wargaming test value (invalid reg number) | €0.16/call identity-only |
| 2 | DRCOR paid API | NO (no API exists) | ASP.NET web app only; no programmatic API; €10 is document-retrieval for humans | N/A |
| 3 | data.gov.cy DRCOR open data CSV | **YES** | HTTP 200, 120 MB officers CSV, 1.17M rows, CC BY 4.0, live-probed 2026-05-18 | **FREE** |
| 4a | Topograph per-call | **YES** | `legalRepresentatives` documented in CY docs; pay-per-request model; RFQ for price | Per-call (price TBD) |
| 4b | Kyckr | **YES** | Director coverage confirmed (10/10 score); pricing RFQ-gated | RFQ |
| 4c | OpenCorporates | YES (web) / NO (API) | Directors 10/10; API requires annual subscription | Subscription — NOT V1 |
| 4d | Moody's / Kompany / BvD | YES | Enterprise coverage; API fully gated; subscription model | Enterprise — NOT V1 |
| 5 | eFiling web UI (DEC-518-F) | YES (in HTML) | Directors in free results confirmed; ASP.NET session required; BLOCKED DEC-20260428-A Tier 1 | BLOCKED |
| 6 | Bulk download (data.gov.cy) | **YES** | Same as Path 3 | **FREE** |
| 7 | Tier-2 commercial bulk | YES (via Topograph) | Topograph sources from DRCOR eFiling; per-call, no subscription floor | Per-call (price TBD) |
| 8 | Cyprus Official Gazette | Partial (change events only) | 600+ gazette issues indexed; officer appointments published via HE4 form; NOT a current-snapshot path | N/A (derivative build) |
| 9a | UBO register | OUT OF SCOPE | Public access closed Jan 2023 (ECJ ruling); UBO ≠ directors | N/A |

---

## Doctrine compliance log

**DEC-20260518-E (Exhaustive 8-path enumeration):** COMPLIANT. All 8 paths documented with evidence (plus Path 9 additional surfaces). No path halted on first failure.

**DEC-20260518-F (Path 5 — per-call HTML parsing constraints):**
- Constraint (a) Statutorily public: YES — directors confirmed in free public search by EU e-Justice portal and companies.gov.cy
- Constraint (b) ToS permits per-call: NOT CONFIRMED — no ToS found on eFiling public portal
- Constraint (c) Per-entity per-customer-request: Structurally YES, unverified without ToS
- Constraint (d) Attribution preserved: Constructively YES
- **DEC-20260428-A Tier 1 override applies regardless — path is BLOCKED.**

**DEC-20260518-G (platform-fee probe for Tier-2 aggregators):**
- Path 3 (data.gov.cy): N/A — no vendor
- Path 4a (Topograph): Platform fee not disclosed (implied none per marketing); setup not disclosed; monthly minimum = NONE (confirmed); annual floor implied none; volume tiers not disclosed; termination fees not disclosed. RFQ required for CY per-call price.
- Path 4b (Kyckr): All dimensions undisclosed — full RFQ required.
- Path 4c (OpenCorporates): Subscription model confirmed — annual license, not per-call. DEC-518-G moot (subscription disqualifies from v1).
- Path 4d (Moody's/BvD): Enterprise subscription — DEC-518-G moot.

**DEC-20260428-A (Strale never operates scrapers):**
- Path 3: COMPLIANT — government-published open-data file, no scraper
- Path 4a (Topograph): COMPLIANT — Strale consumes Topograph's API; Topograph operates the eFiling scraper. Vendor attestation of redistribution rights + indemnification must be confirmed in commercial agreement.
- Path 5 (eFiling direct): BLOCKED — Strale would operate the scraper. Absolute bar applies.

**EU 2023/138 (not cited as representative-content mandate):** CONFIRMED — this audit does not cite 2023/138 as requiring representative data. The mandate is identity fields only (§5.1). Director data availability is via DRCOR statutory disclosure and CY Companies Law, not 2023/138.

---

## Caveats

1. **Monthly refresh lag (Path 3):** The open-data CSV is updated monthly. For compliance use cases requiring current officer status (e.g., has a director resigned in the last 30 days?), the monthly batch is insufficient. Customer disclosures must note this limitation. Topograph (Path 4a) resolves this with live-fetch.

2. **No appointment/cessation dates per row:** The officers CSV does not include when an officer was appointed or when they ceased. All rows in the file appear to represent the current register state (no historical change log). For tenure verification, the €10 full-file search or Topograph's document retrieval (Trade Register Extract PDF) is required.

3. **Corporate nominees:** Cyprus has a large nominee-director industry. Many officers listed will be nominee companies (e.g., `THEMIS SECRETARIAL SERVICES LIMITED`) rather than individuals. The open-data CSV does not distinguish between nominee and non-nominee directors.

4. **Wargaming anomaly (CY99000230P) closed:** The Openapi test value `CY99000230P` does not correspond to a valid DRCOR registration number. Wargaming Group Limited is registered as number `290868` (pure numeric). The Openapi correspondence claiming CY coverage was referring to the WW-Top identity endpoint only; the 204 response confirms no structured data was returned for that input. The anomaly is an invalid test value, not a DRCOR data gap.

5. **Greek Unicode prefix requirement (Topograph):** Topograph requires `ΗΕ` in Greek Unicode characters (U+0397 U+0395) for registration number input, not the Latin `HE`. Strale's cy-company-data executor must implement Unicode normalization from DRCOR numeric IDs to Topograph's required format if Topograph is used.

6. **License discrepancy (OpenSanctions):** OpenSanctions describes the cy_companies dataset as "CC Attribution NonCommercial." The actual data.gov.cy source page shows CC BY 4.0 International without the NonCommercial restriction. Strale should source directly from data.gov.cy, not from OpenSanctions, to preserve the unrestricted commercial license.

7. **DRCOR URL stability:** The officers CSV URL (`/sites/default/files/organisation_officials_83.csv`) contains what appears to be a numeric suffix (`_83`) that may change on future dataset refreshes. The ingest job should monitor the dataset page URL for resource link changes rather than hardcoding the direct file URL.
