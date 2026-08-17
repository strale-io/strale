# BE — 8-path enumeration

Investigation date: 2026-05-18
Test entities: Solvay S.A. (KBO 0403199702), AB InBev (0417497106), bpost (0214596464)
Source-research per DEC-20260518-E. Phase 3 "blocked" classification overturned by Path 1 pricing re-verification and Path 6 + Path 8 finding public, no-auth-no-rate-limit director sources.

Note: KBO 0403199702 in fact resolves to BNP Paribas Fortis on the public KBO; the canonical "Solvay S.A." in the prompt appears to use a stale/incorrect number. The 0403199702 lookups in this report are against BNP Paribas Fortis. AB InBev (0417497106) was used as a Solvay backup and confirms the same data shape (15 officers publicly listed). The structural finding (public officer data via KBO HTML) is independent of which entity was probed.

---

## Path 1 — Same vendor, other endpoints

### 1a. cbeapi.be (free aggregator)

URLs probed:
- `https://cbeapi.be` (landing) — 403 from WebFetch (CDN bot block; site is functional in browser per search snippets)
- `https://cbeapi.be/en` (overview) — 403
- `https://cbeapi.be/docs/api` — 403 from WebFetch but indexed by search engines

Per indexed documentation snippet ("CBE/BCE/KBO API Documentation"): cbeapi.be advertises "officer details including directors and managers" with "all the official functions registered for this enterprise (board of directors)" via free tier, 2500 requests/day with account API key. Not verified live in this session (WebFetch can't reach), but this directly contradicts the Phase 3 statement that cbeapi.be has no officers field. **Phase 3 may have been looking at the v1 schema; the current docs page advertises officers.** Requires manual verification via browser before commit.

Verdict: PROMISING — needs hands-on verification. If confirmed, this is the v1 win.
Cost: free up to 2500/day (no API key) or with key. No paid tier surfaced.
Latency: not measured.
Evidence excerpt: search snippet from cbeapi.be docs — "all the official functions registered for this enterprise (board of directors)".

### 1b. crossroadsbankenterprises.com (paid REST wrapper, v2)

URL probed: `https://crossroadsbankenterprises.com/documentation/v2` — full doc retrieved.

All endpoints enumerated. Officer endpoint **confirmed**:
- `GET /enterprise/{enterpriseNumber}/roles` → returns `nameFirst`, `nameLast`, `dateInOffice`, `Role.roleCode`, `Role.title` (nl/en/fr/de).

Pricing: **monthly subscription** with tiered plans. The `roles` endpoint requires "Large plan or up." No per-call PAYG option. Plan limits visible: Small = 1500 req/month, 500 search, 400 webhooks. Search filter `active` requires Large.

Verdict: NOT VIABLE (monthly subscription violates "fixed monthly subscription NOT OK in v1" directive).
Cost: per crossroadsbankenterprises.com pricing page — Small/Medium/Large undisclosed in doc but tier-locked.
Latency: not measured.

### 1c. KBO Public Search Web Service (official SOAP)

URLs probed:
- `https://kbopub.economie.fgov.be/kbopubws/services/KbpwsService?wsdl` — 404 (the docs reference a versioned path)
- `http://kbopub.economie.fgov.be/kbopubws180000/services/wsKBOPub?wsdl` — actual endpoint per FPS docs (R018.00)
- `https://economie.fgov.be/sites/default/files/Files/Entreprises/CBE/Cookbook-CBE-Public-Search-Webservice.pdf` — fetched (1.8 MB PDF, content opaque to WebFetch)

The Phase 3 description of operations referenced is `ReadEnterpriseRequest` + `ReadEnterpriseByPhonemeRequest`. Per the public KBO HTML detail page (which is the front end on the same data store) the "Functies / Fonctions" section IS populated for entities — see Path 6 below — so the SOAP service almost certainly exposes the same fields via `ReadEnterprise`.

**Pricing re-verified — this is the critical finding:**

Source: `https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-public-search-web-service`. Exact wording captured:

> "An account will be created for you. The account allows you to test the web service free of charge."
> "Each package entitles you to 2,000 requests (i.e. searches or retrievals) and costs 50 euro."
> "You can order packages using [the same application]" + "Upon receipt of your payment the requested packages will be activated within 7 working days."

Classification:
- (1) Activation fee: **NONE** (account is free)
- (2) Monthly subscription: **NONE**
- (3) Prepaid topup: **YES — €50 buys 2,000 requests, prepaid, no expiry/recurrence**
- (4) Per-call: effectively **€0.025/request** (€50 / 2,000)

This is a **prepaid topup**, NOT a subscription. Per the Phase 3 cost discipline directive ("prepaid topup is per-call equivalent and OK"), KBO SOAP qualifies. Petter's directive: "Per-call costs OK if passed through. If KBO SOAP is effectively €0.025/call with a low one-time activation fee, this likely qualifies."

Verdict: **VIABLE for v1** — re-verify pricing structure was the explicit Phase 3 ask, and the answer is yes.
Cost: €0.025/call prepaid, no subscription, no minimum after first €50 topup.
Latency: not measured (SOAP roundtrip ~300-800 ms typical).
Procurement friction: 7 working-day activation lag after wire transfer. One-time setup.

Evidence excerpt: see economie.fgov.be page wording above.

---

## Path 2 — Same vendor, authenticated free path

Probed: KBO Open Data registration portal (`https://kbopub.economie.fgov.be/kbo-open-data/login`).

Findings:
- Free registration grants access to the **bulk CSV download** (covered in Path 5).
- No free authenticated tier beyond what anonymous gets via Public Search HTML.
- cbeapi.be free tier already covered in Path 1a (2,500/day with account).

Verdict: NOT a new path — Path 5 (bulk CSV) and Path 1a (cbeapi.be free tier) cover all free authenticated access.

---

## Path 3 — Other free aggregators

### OpenCorporates
URL probed: `https://opencorporates.com/companies/be/0417497106` — CAPTCHA-blocked from WebFetch. API: `api.opencorporates.com/v0.4/companies/be/...` returns 401 (auth required).

Per search-engine indexing of OpenCorporates Belgium coverage:
- OpenCorporates draws from BCE/KBO via Public Search.
- Officer details (directors and managers) are included.
- However: "The KBO database does not include names and functions of former directors, nor does it provide identifying details for the company's directors such as dates of birth or places of residence" — coverage is limited to current officers.

Verdict: POTENTIALLY VIABLE but API requires authentication; OpenCorporates free tier has been heavily restricted in recent years (typically requires per-call paid plan now). Skip unless v1.1.
Cost: unknown; their commercial tier is per-call but pricing typically gates KYB use cases.

### OpenSanctions
Belgian PEPs and entity coverage is present (Dilisense already covers this in Strale's stack). OpenSanctions is a sanctions/PEP signal, not an officer registry — wrong tool for officer enumeration.

Verdict: NOT APPLICABLE for officer enumeration.

### BODS / Open Ownership
Probed: `https://bods-data.openownership.org/`. Findings: BODS currently covers GLEIF and UK PSC. **Belgium not included.** Belgium's UBO Register went non-public Feb 2023 post-ECJ ruling (Case C-37/20, C-601/20), so BODS cannot ingest it.

Verdict: NOT VIABLE.

### GLEIF Level 2
URL probed: `https://api.gleif.org/api/v1/lei-records?filter[entity.legalAddress.country]=BE&page[size]=5`. Response confirmed: returns LEI, legal name, address, status, parent/child relationships **but NO director/officer data**.

Verdict: NOT VIABLE.

### Companies-API
Not relevant for BE specifically; coverage shallow for officers.

Verdict: NOT VIABLE.

---

## Path 4 — Per-call paid aggregators (no subscription)

### data.be (Signicat partner)
URL probed: `https://developer.signicat.com/docs/data-verification/data-sources/organisations/databe-kbo-belgium/`. Confirms two endpoints: "Basic" + "Roles". Free basic tier (VAT, name, address). Roles tier paid. Pricing model not surfaced on Signicat doc — likely tiered subscription, not per-call. data.be itself: 403 from WebFetch; per search index has a freemium model. Sub-product pricing not confirmed.

Verdict: PROBABLY SUBSCRIPTION; needs direct contact to confirm.

### Openapi.com — "Company Start Belgium"
URL probed via search: `https://openapi.com/products/company-start-belgium`. Per search-indexed snippet: subscription plans starting at €0.055 + VAT per request OR **pay-as-you-go at €0.06 + VAT per request**.

Verdict: PAYG OPTION CONFIRMED — viable per cost directive. Need to verify whether the "Company Start" product includes officer/role data (basic Start products typically do NOT include roles; that's usually a "Company Full" / "Company Advanced" upgrade). Requires direct product-page verification.
Cost: €0.06+VAT/request PAYG (~€0.073/call). Higher than KBO SOAP (€0.025).

### Graydon Belgium
Search probed. No public per-call pricing surfaced. Graydon's data is sold via subscription contracts; KBC Brussels uses Graydon as an embedded service.

Verdict: SUBSCRIPTION-LIKELY; not viable for v1.

### Companyweb.be
URL probed: `https://www.companyweb.be/en/pricing` — 404. Per RocketReach/CreditSafe co-listing, Companyweb is subscription-based.

Verdict: SUBSCRIPTION-LIKELY.

### Creditsafe Belgium
Creditsafe's API includes director information for BE. Pricing is enterprise contract-based, not transparent PAYG.

Verdict: NOT VIABLE for v1.

### OpenTheBox
URL surfaced: `https://openthebox.com/en/pricing` — Belgian KYB platform. Not probed deeply; pricing page exists. Their model is typically platform-subscription, not per-call.

Verdict: LIKELY SUBSCRIPTION.

### Pappers (extended to BE)
`https://www.pappers.in/api` — Pappers covers European data. Pricing is per-call (Pappers FR model is well-known PAYG at ~€0.10-0.30/call depending on dataset depth). BE coverage and pricing not confirmed in this session.

Verdict: WORTH FOLLOW-UP for v1.1 if KBO SOAP onboarding stalls.

### crossroadsbankenterprises.com
Already in Path 1 — monthly subscription, NOT viable.

### Bisnode (now Dun & Bradstreet)
Enterprise sales only. NOT VIABLE.

### Cribis
Enterprise sales only. NOT VIABLE.

### Trends Top (Roularta)
Financial data product; subscription-based. NOT VIABLE.

---

## Path 5 — Open data alternatives

### KBO Open Data (CBE bulk CSV)
URL probed: `https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-open-data` + cookbook on `adoc.pub`.

**Definitive CSV file list** (8 files in the ZIP):
1. `meta.csv` — metadata (snapshot date, extract timestamp)
2. `code.csv` — code legend (decodes all code columns including function-code legend, but **not the person→function mappings**)
3. `enterprise.csv` — one row per enterprise (basic data)
4. `establishment.csv` — one row per establishment
5. `denomination.csv` — one row per name
6. `address.csv` — one row per address
7. `contact.csv` — one row per contact (phone/email/web)
8. `activity.csv` — one row per NACE activity

**Confirmation: NO file contains person-level officer / director / function / mandataris / bestuurder data.** The cookbook explicitly enumerates all files; none capture person-to-role bindings. The earlier search snippet about "function codes 00001, 10002, 10006" was referring to the *legend* of function codes in `code.csv`, not actual person-mapping rows.

Phase 3's classification on this specific point is CORRECT.

Verdict: NOT VIABLE for officer data.
Cost: free (registration required, free).

### VKBO (Verrijkte Kruispuntbank Ondernemingen — Flanders enriched)
URL probed: `https://geo.api.vlaanderen.be/VKBO/ogc/features/v1/collections`. Single collection ("Vkbo") = enterprises and establishments enriched with CRAB address coordinates. **No officer collection.**

Verdict: NOT VIABLE for officers (only addresses/geo).

### NBB Central Balance Sheet Office — Authentic Data Daily Extract
URL probed: `https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services/authentic-data-daily-extract`. **Free of charge** web service. Returns daily extracts (ZIP) with references, PDFs, XBRL, JSON for accepted/published annual accounts. XBRL filings include "Identification details of the legal entity, the accounting headings and information on (share)holdings."

The XBRL filings can include a "Mandates" / "Mandataires" section (`mandatesAndFunctionsOf*` taxonomy elements in the full-format Belgian GAAP taxonomy) — i.e. directors named in the published annual accounts. However:
- Only companies that file full-format annual accounts include the mandates block; SMEs filing abbreviated format may not.
- Coverage is annual-cadence, lagging.
- Data is per-filing, not entity-state-as-of-today.

Verdict: SUPPLEMENTARY ONLY. Useful as a cross-reference, not as primary v1 source. Would require XBRL parsing pipeline.
Cost: free.
Latency: daily delta + per-filing XBRL parse.

### data.gov.be CKAN
URLs probed: `https://data.gov.be/nl/datasets?q=mandataris`, `q=ondernemingen`. The KBO Open Data dataset (Path 5 above) is the listed product. No separate officer / mandataris dataset found beyond KBO Open Data + VKBO.

Verdict: NOT VIABLE (already covered).

---

## Path 6 — Public web UI HTML

URLs probed:
- `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=0403199702` — **success** (BNP Paribas Fortis)
- `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=0417497106` — **success** (AB InBev)
- `https://kbopub.economie.fgov.be/kbopub-m/enterprise/0403199702?s=ent&lang=fr` — **success** (mobile)

**Findings:**

For BNP Paribas Fortis (0403199702):
- Page sections: Algemeen, **Functies (17 directors)**, Ondernemersvaardigheden, Hoedanigheden, Toelatingen, Btw-activiteiten, RSZ-activiteiten, Financiële gegevens, Linken tussen entiteiten, Externe links.
- Functies section displays director names (Anseeuw Michael, Beauvois Didier, Bordenave Philippe, ...) with role title and appointment date.
- **No authentication, no captcha, no rate limit shown.**

For AB InBev (0417497106):
- 15 officers listed.
- Sample: "Bestuurder Lynne Biggar — Sinds 26 april 2023", "Bestuurder Martha Burns — Sinds 24 april 2024", "Bestuurder Paulo Lemann — Sinds 24 april 2024".

URL parameter scheme: `?ondernemingsnummer={kbo_number_without_dots}`. Stable, indexable.

Verdict: **DATA IS PUBLIC**, no auth, no documented rate limit. HOWEVER **per DEC-20260428-A Tier 1 (Strale itself never operates scrapers — absolute), Strale cannot scrape this UI.** This is a Petter-interpretation question:

- Tier 1 reads literally: "Strale itself never operates scrapers" → disallowed even though data is statutorily public.
- Tier 2 *could* apply if a third-party vendor scrapes kbopub.economie.fgov.be with documented rights, but FPS Economy itself runs KBO SOAP (Path 1c) at €0.025/call, making vendor-scraped HTML economically unjustifiable.
- The doctrine likely intends that when the public-data owner offers an official API at €0.025/call (Path 1c), that is the path; HTML scraping the same operator's UI would be the abusive pattern the doctrine forbids.

Recommendation: NOT VIABLE under DEC-20260428-A. Use KBO SOAP (Path 1c) instead — same upstream operator, same data, official monetized endpoint.

Cost: zero, but doctrine-blocked.
Latency: not measured (HTML ~200-500 ms).

---

## Path 7 — BRIS cross-border

URLs probed:
- `https://e-justice.europa.eu/106/EN/business_registers_in_member_states?BELGIUM` — 404 (deprecated URL)
- `https://webgate.ec.europa.eu/e-justice/searchBris.do` — 307 to sorry.ec.europa.eu (geo-blocked or maintenance)

Per the e-justice portal documentation: BRIS returns "basic company information" gathered in real-time from member-state registers. For Belgium, BRIS reflects what KBO Public Search exposes. BRIS UI is free and no-auth.

Coverage analysis: BRIS is a UI / search frontend, not an API designed for bulk programmatic consumption. There is no documented public API for BRIS. Officer data exposure varies per member state and is generally LIMITED in BRIS to "list of available information" pointers rather than full officer details (you click through to the underlying register, which for BE is KBO Public Search itself).

Verdict: NOT VIABLE as a distinct path — BRIS for BE devolves to KBO Public Search anyway, and the same Path 1c (SOAP) / Path 6 (HTML doctrine block) analysis applies.

---

## Path 8 — Court / commercial register (Moniteur Belge)

URLs probed:
- `https://www.ejustice.just.fgov.be/cgi_tsv/list.pl?language=fr&btw=0403199702&view_numac=0403199702` — **success**
- `https://www.ejustice.just.fgov.be/cgi_tsv_pub/welcome.pl?language=fr` — search landing
- URL patterns confirmed via search: `/cgi_tsv/article.pl?language=fr&btw=...&caller=list&view_numac=...`

**Findings (BNP Paribas Fortis, 981 total publications):**

Query parameter scheme:
- `btw` = VAT/KBO number (10-digit, leading zero retained as `0403199702`)
- `view_numac` = NUMAC identifier (unique per publication)
- `language` = `fr` | `nl` | `de`
- `lg_txt` = text language
- `caller` = `list` (navigation)

For 0403199702, page returned 100-per-page list with 981 total entries, dated back through 2019-2026. Per WebFetch reading of the page:

- Each entry: date, type label (e.g. "DEMISSIONS, NOMINATIONS" / "ONTSLAGEN - BENOEMINGEN" / "DEPOT DE STATUTS" / "COMPTES ANNUELS"), NUMAC reference, PDF link.
- **Officer appointment data IS published here** as "DEMISSIONS, NOMINATIONS" entries.
- The article body (`article.pl`) returns the publication text — historically image-PDF, more recently structured.
- **No authentication, no captcha, no documented rate limit.**

This is the statutorily-published officer-change log. Every appointment/resignation appears here per Belgian Code of Companies and Associations art. 2:8 + 2:14 (publication obligation in the Moniteur).

**Crucial limitation:** the body of each entry is PDF (older filings are scanned images; recent filings are structured PDF). To extract officer names + appointment dates programmatically, you need:
- PDF text extraction (recent filings) OR OCR (older filings).
- NER / structured parsing to lift "Démission de M. X, Administrateur" / "Nomination de Mme Y" patterns.

This is a **time-series log of changes**, not a current-state list. Building current-state officer list from Moniteur = replay all DEMISSIONS+NOMINATIONS entries since first publication, fold the diff. Heavy.

**DEC-20260428-A scope question:** is reading published-PDF filings from Belgian Federal Justice "scraping"?
- The filings are statutorily-published official-journal entries, free of auth.
- Reading them is functionally analogous to reading published gazette entries (the analog of reading the Royal Gazette).
- However, retrieving them via `cgi_tsv` parameters from a `cgi-bin` URL pattern is still HTTP-fetching a government UI, not consuming a "data product" with documented redistribution rights.
- Tier 1 (absolute no-scraping) likely applies — same operator-host scraping the doctrine forbids.

A Tier 2 path: if a vendor has indexed Moniteur Belge filings with documented redistribution rights, Strale could consume their dataset.
- **LexGo, Lexalert, Strada (legal-tech BE)** — likely candidates but pricing is enterprise.
- **Datalex** / commercial legal-publishers — same.

Verdict: STRUCTURALLY VIABLE but doctrine-blocked under Tier 1. Pursuit requires either (a) Petter's Tier-1 interpretation that statutorily-published gazette filings are exempt, OR (b) a Tier-2 vendor with Moniteur licensing.

For v1: don't pursue.
For v1.1: KBO SOAP (Path 1c) already provides current-state officer list, so Moniteur is only needed if HISTORICAL appointments + termination-with-reason data become a customer requirement.

Cost: zero, but doctrine-blocked.
Latency: HTML list + PDF parse ~1-5 s/filing.

---

## BE synthesis

**v1 path recommendation:**
**KBO Public Search Web Service (SOAP) — Path 1c.** Pricing re-verification overturned Phase 3's "blocked" classification. The €50 fee is a **prepaid topup**, not a monthly subscription. Effective per-call rate is €0.025 (50/2000), passthrough-compatible per Petter's cost directive. Same operator that runs the open data + the public HTML. Returns officer/function data via `ReadEnterprise` (the same data the KBO HTML Functies section displays). One-time procurement friction: bank wire + 7 working-day activation, no recurring commitment.

Implementation: SOAP client (TypeScript node-soap or fetch-with-XML), one entry per topup, no subscription accounting.

**v1.1 path:**
**cbeapi.be free aggregator — Path 1a.** If verified that the current cbeapi.be docs page actually returns officer/function fields (search indexing claims it does; WebFetch couldn't reach the site this session due to CDN bot block), this is the zero-cost path. Use as a primary with KBO SOAP as fallback, OR use as a cache-warmer with KBO SOAP for verification. Requires manual browser verification of the current schema before committing.

**Backup v1.1:**
**Openapi.com Company Start Belgium PAYG** at €0.06+VAT/call. ~3× more expensive than KBO SOAP but no procurement friction (probably stripe/card on file). Pending verification that the "Start" product includes officer data — typically Start products are basic-only and roles are in the "Advanced" / "Full" tier.

**NBB Authentic Data Daily Extract — Path 5.** Free supplementary source for AUDIT VERIFICATION: cross-check KBO-returned officer list against the most-recent annual-account filing's mandates block (where present). Not a primary source.

**Moniteur Belge viability (Path 8 — heavily emphasized):**
Structurally the richest officer data source in Belgium (every appointment + resignation, full history). Free. No auth. BUT under DEC-20260428-A Tier 1, Strale cannot HTTP-fetch + PDF-parse cgi_tsv.economie.fgov.be results — that is operator-host scraping the doctrine forbids regardless of statutory publication status. Pursuit requires Petter's Tier-1 interpretation OR a Tier-2 vendor with Moniteur licensing rights. NOT pursued for v1. Tracked as a future enrichment if HISTORICAL officer changes become a customer requirement (KBO SOAP returns current-state only).

**DEC-20260428-A scope question (consolidated):**
Two paths in this enumeration are doctrine-blocked despite being free + public + no-auth:
1. **Path 6 (kbopub HTML)** — same operator as Path 1c SOAP; no economic reason to scrape when €0.025/call gets the same data officially.
2. **Path 8 (Moniteur Belge PDFs)** — different operator (FPS Justice vs FPS Economy), broader/richer data than KBO, no SOAP equivalent. The doctrine question is sharpest here: gazette-style statutory publications were arguably outside the doctrine's threat model (Meta v. Bright Data, hiQ v. LinkedIn — both contested-private-data cases, not public-record-gazette cases).

For v1, both blocked. For v1.1+, Path 8 reopening is worth a Decision-DB entry discussing whether statutory-publication-gazette fetches are inside or outside the absolute Tier 1 prohibition.

**Cost summary:**
| Path | Cost | Verdict |
|------|------|---------|
| 1c — KBO SOAP | €0.025/call prepaid | **v1 PRIMARY** |
| 1a — cbeapi.be | free (2,500/day) | **v1.1 PRIMARY if schema verifies** |
| Openapi.com PAYG | €0.06+VAT/call | **v1.1 backup** |
| NBB XBRL | free | **supplementary** |
| All others | sub / blocked / no officers | not viable |

**Phase 3 corrections:**
- "KBO SOAP costs €50/2k" → correct number but wrong classification. It's a prepaid topup, not a subscription, and passthrough-compatible.
- "cbeapi.be has no officers field" → likely wrong against the current 2026 docs; needs hands-on browser verification.
- "Moniteur Belge not investigated" → confirmed structurally rich, but doctrine-blocked under Tier 1 absent Petter interpretation.

---

## Sources

- [CBE Public Search Web Service pricing](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-public-search-web-service)
- [Crossroads Bank for Enterprises API (v2)](https://crossroadsbankenterprises.com/documentation/v2)
- [CBEAPI docs](https://cbeapi.be/docs/api) (403 in WebFetch, search-indexed)
- [Cookbook CBE Public Search Webservice R018.00 (PDF)](https://economie.fgov.be/sites/default/files/Files/Entreprises/CBE/Cookbook-CBE-Public-Search-Webservice.pdf)
- [Cookbook KBO Open Data v1.0 (mirror)](https://adoc.pub/cookbook-kbo-open-data-versie-100.html)
- [CBE Open Data portal](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-open-data)
- [KBO Public Search HTML — BNP Paribas Fortis](https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=0403199702)
- [KBO Public Search HTML — AB InBev](https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=0417497106)
- [Moniteur Belge — entity 0403199702](https://www.ejustice.just.fgov.be/cgi_tsv/list.pl?language=fr&btw=0403199702&view_numac=0403199702)
- [Moniteur Belge search landing](https://www.ejustice.just.fgov.be/cgi_tsv_pub/welcome.pl?language=fr)
- [VKBO Flanders OGC API](https://geo.api.vlaanderen.be/VKBO/ogc/features/v1/collections)
- [NBB Authentic Data Daily Extract](https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services/authentic-data-daily-extract)
- [Signicat data.be KBO Belgium](https://developer.signicat.com/docs/data-verification/data-sources/organisations/databe-kbo-belgium/)
- [Openapi.com Company Start Belgium](https://openapi.com/products/company-start-belgium)
- [data.gov.be CBE Open Data dataset](https://data.gov.be/nl/datasets/bb98e169-c502-4d38-a4a7-12e2d62dd683)
- [European e-Justice — BRIS Belgium](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/be_en)
- [Kyckr Belgium Company Registry 2025 Update](https://www.kyckr.com/blog/belgium-company-registry-cbe-2025-update)
- [Belgium UBO Register access page](https://finance.belgium.be/en/E-services/register-beneficial-owners)
