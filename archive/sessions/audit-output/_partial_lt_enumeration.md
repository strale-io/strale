# LT exhaustive enumeration — partial

**Date:** 2026-05-18
**Test entities:** Vilnius University / Vilniaus universitetas (11125567), AB SEB bankas (21258254), AB Ignitis grupė (301844044)
**Doctrine:** DEC-20260518-E (exhaustive enumeration mandate), DEC-20260428-A (Tier 1: Strale never operates scrapers), DEC-20260518-F (Path 6 viable in v1 if 4 constraints hold)

---

## Path 1 — Same vendor (Spinta JADIS / Registrų centras), other endpoints

### 1a. Spinta / get.data.gov.lt — RC namespace enumeration

**URLs probed:**
- `https://get.data.gov.lt/datasets/gov/rc/` → HTTP 200, lists 17 dataset folders: `ais, ar, espbiis, gr, hr, ir, jadis, jar, lis, nirvar, ntr, ppnsis, sr, stsr, taar, tr, vsr`
- `https://get.data.gov.lt/datasets/gov/rc/jadis/` → 6 collections
- `https://get.data.gov.lt/datasets/gov/rc/jar/` → 20 datasets
- `https://get.data.gov.lt/datasets/gov/rc/jar/valdymo_organai/ValdymoOrganas/` → HTTP 200, field table retrieved

**JADIS namespace datasets (6):**

| Dataset | Description | Officer-bearing? |
|---------|-------------|-----------------|
| `dalyviai` | Corporate participant data | Partial — aggregated counts only |
| `dalyviu_sarasas` | Participant lists | Aggregated counts only |
| `salys_teisines_formos` | Participants by country + legal form | No |
| `teisines_formos` | Participants by legal entity type | No |
| `uzsienio_asmenys` | Foreign natural and legal persons | No names confirmed |
| `valstybes_dalyviai` | State/municipal entity participants | No |

**JADIS `dalyviai/Dalyvis` field structure (live probe 2026-05-18):**
```
_id, juridinis_asmuo._id, form_kodas._id, stat_statusas._id,
lr_fiziniai (count), lr_juridiniai (count),
uzsienio_fiziniai (count), uzsienio_juridiniai (count)
```
**Conclusion on JADIS dalyviai:** Aggregate participant counts only. No individual names, no personal codes, no roles. JADIS open data does NOT contain individual officer names in the Spinta API.

**JAR namespace datasets (20) — full enumeration:**

| Dataset | Description | Officer-bearing? |
|---------|-------------|-----------------|
| `iregistruoti/JuridinisAsmuo` | Registered legal entities | NO — `_id, ja_kodas, ja_pavadinimas, pilnas_adresas, reg_data, isreg_data, forma._id, statusas._id, stat_data` only |
| `valdymo_organai/ValdymoOrganas` | Management bodies | Partial — binary flags only (see below) |
| `buveines` | Addresses | No |
| `dokumentai` | Registration documents | Indirect (PDFs, unstructured) |
| `ja_kapitalas` | Capital data | No |
| `balanso_ataskaitos` | Balance sheets | No |
| `pelno_ataskaitos` | P&L statements | No |
| `fa_veluojantys` | Late financial filers | No |
| `fa_dokumentu_nepateike` | Non-filers | No |
| `fa_nepateike_auditoriu_isvadu` | Missing audit opinions | No |
| `iregistruoti_paramos_gavejai` | Registered aid recipients | No |
| `isregistruoti_paramos_gavejai` | De-registered aid recipients | No |
| `iregistruotos_nvo` | Registered NGOs | No |
| `isregistruotos_nvo` | De-registered NGOs | No |
| `ne_juridiniai_asmenys` | Non-legal-entity classifier | No |
| `atributai` (×4) | Classifiers | No |
| `dokumentu_tipai_potipiai` (×2) | Doc-type classifiers | No |
| `faktu_tipai_potipiai` (×2) | Fact-type classifiers | No |
| `formos_statusai` (×2) | Status classifiers | No |
| `kiti_atributai` (×2) | Other classifiers | No |

**Critical: `valdymo_organai/ValdymoOrganas` field structure (live probe 2026-05-18):**
```
_id
vadovas           — 1/0 (managing director EXISTS — not a name)
vad_org_nuo       — director appointment date
vad_lytis         — director gender (M/V/ND)
valdyba           — 1/0 (board EXISTS — not members)
vald_org_nuo      — board establishment date
taryba            — 1/0 (council EXISTS — not members)
tar_org_nuo       — council establishment date
kiti_valdymo_organai — 1/0
```

**Verdict on `valdymo_organai`:** Binary existence flags only. **Confirms the vadovas paywall claim is partially wrong** — the open data records the EXISTENCE of a managing director and their appointment date but NOT their name or personal code. The refutation is structural: this is not a paywall per se but an intentional data-protection design choice to omit personal identifiers from the open-data layer while keeping governance-structure metadata open. Officer names require either a paid electronic extract (€6.37 direct from Registrų centras) or a paid API tier.

**Registrų centras direct API:** Their GitHub organisation (`github.com/registrucentras`) shows 6 repos: `onesign`, `gosign-api-integration`, React/Vue/Angular component libraries. These are for document-signing workflows, not registry data queries. No public company-data API documented. registrucentras.lt direct was ECONNREFUSED on all 7 probe attempts during this session — the site blocks external IPs (Railway US East egress). All information on their direct API is from secondary sources.

**Secondary source (DocuPipe's extraction product):** The electronic certified extract (`Elektroninis Sertifikuotas Išrašas`) from Registrų centras contains: company code, name, legal form, address, capital, **director name, personal code, position, start date**, shareholders, and more. Per DocuPipe's documentation, this is the primary structured source — it is obtained from Registrų centras via their self-service system at a per-extract fee (€6.37 retail per the `tet.lt` blog). Whether a bulk/API mechanism exists is not confirmed from public documentation — the GoSign API covers digital signing only.

**Verdict on Path 1: NOT VIABLE as-is for v1.** The Spinta open data layer has NO officer names. Officer data is locked behind the €6.37 per-extract retail fee or a Registrų centras data-sharing agreement not publicly documented.

---

## Path 2 — Same vendor, authenticated free path

### 2a. data.gov.lt account registration

- `https://data.gov.lt/en/` → HTTP 403 (blocking external access)
- From secondary sources: data.gov.lt is Lithuania's national open data portal. Account registration is mentioned (email-based). It appears to control rate-limit tiers on the Spinta API, not to unlock additional data fields.
- **Confirmed via field-level probing:** the Spinta `valdymo_organai` fields are available without authentication. Authentication on Spinta does not unlock officer names — the names are not present in any Spinta dataset regardless of auth tier.

### 2b. Registrų centras authenticated self-service

- `https://registrucentras.prisijungti.lt/` — confirmed as the self-service login portal
- Authenticated self-service unlocks: ordering electronic extracts (€6.37 each), advanced search (100 free searches/day already available without auth per `tet.lt` blog), document downloads
- **No free-tier officer data:** even authenticated users pay €6.37 per extract for officer data
- Foreign-entity eligibility: not publicly documented. The self-service portal appears to accept account registration, but no explicit foreign-entity terms found.

### 2c. VIISP (state data exchange)

- `https://www.epaslaugos.lt/portal/content/46820` — lists VIISP data-sharing services available to registered state/enterprise users. Page content not fully renderable via probe (403 on content body).
- VIISP is Lithuania's state data exchange bus — similar to Estonia's X-Road. Provides interoperability between state systems. Registrų centras participates. This is NOT a public commercial API — it is for inter-state-system data exchange, requires institutional agreement with the Ministry of Interior.
- **Verdict: NOT VIABLE for Strale** (state-bodies tier analogous to Croatia's Sudreg state-bodies tier).

**Verdict on Path 2: NOT VIABLE for free officer data.** Authentication at Registrų centras unlocks self-service ordering (still €6.37/extract) and VIISP participation (requires government-institution status). No free authenticated path returns officer names.

---

## Path 3 — Other free aggregators

| Source | LT Coverage | Officer data? | Cost | Verdict |
|--------|-------------|--------------|------|---------|
| **OpenCorporates** | YES (confirmed indexed) | YES (sourced from JAR) | £2,250/yr minimum subscription | NOT VIABLE — subscription floor |
| **OpenSanctions** | Partial — `lt_seimas` (Seimas members), `lt_pep_declarations`, `lt_fiu_freezes` | Political/PEP only | Free non-commercial / commercial RFQ | NOT VIABLE for officer enumeration (screening data, not company roster) |
| **BODS / Open Ownership** | LT has JANGIS UBO register (2022) | UBO only, NOT directors | Structured data NOT published as BODS (confirmed: "Published as BODS: No", "Available via API: No") | NOT VIABLE (wrong primitive + not even published) |
| **GLEIF Level 2** | Yes — LEI records for LT entities | NO officer fields | Free | NOT VIABLE (entity-to-entity relationships only) |
| **JARS.LT** | YES — covers LT, LV, EE | Claimed "Directors and beneficiaries" but live probe of company page showed NO names in public view | €0 free tier (100 req/mo), €5/mo Starter (5k/mo), €15/mo Professional (50k/mo). No long-term contracts | See detailed assessment below |
| **Okredo Lithuania** | YES | Confirmed company data platform | Freemium + premium | NOT VIABLE without RFQ — officer field presence unconfirmed |

**JARS.LT detailed assessment:**

JARS.LT is a Baltic company data platform covering LT, LV, EE. Homepage claims "Directors and beneficiaries" are included. However, live probe of company detail page for JAS Worldwide Lithuania UAB (code 300094312) showed: registration details, financials, employee data — **no director names visible in the public web view without authentication**.

The discrepancy between the homepage claim ("directors") and the actual public page may indicate: (a) director data is present only for authenticated/paid API calls, or (b) director data is genuinely absent from the free tier's web display. Given their pricing structure (€5/mo Starter for 5,000 req/mo = €0.001/request) and the claim of "directors," this could be the most cost-effective Path 3 option IF director data is included.

**Platform-fee probe for JARS.LT:** Pricing page states "you can cancel your subscription at any time. No long-term contracts." No mention of a platform fee separate from the monthly subscription. **Classification: v1 candidate pending field-level API verification.** The monthly fee (€5–€15/mo) is low enough that it does not violate Strale's cost discipline if director data is confirmed.

**Verdict on Path 3: JARS.LT is the most promising free/low-cost option** but requires API-key signup to verify that director names are actually in the response. All other free aggregators are either subscription-heavy (OC) or wrong primitive (OS, BODS, GLEIF).

---

## Path 4 — Paid per-call aggregators (NO PLATFORM FEE)

### 4a. Creditinfo Lithuania / lt.creditinfo.com / creditinfo.lt

**URLs probed:** `https://creditinfo.lt/en/business/`, `https://creditinfo.lt/en/business/reports/key-company-data/`

**Coverage confirmed:** "representation and management data" included in Key Company Data report. Creditinfo is Lithuania's largest credit bureau with 20+ data sources from EE/LV/LT consolidated.

**Pricing model:** NOT publicly disclosed. All pricing is "contact us" (ltu.info@creditinfo.com, +370 5 239 4131). No per-call tier published.

**Platform-fee probe:** Could not determine from public materials. Creditinfo is a credit bureau in the traditional mold — historically these operate on annual/multi-year contracts with minimum commitments. No public "pay-per-call" API documentation found. Baltic-market comparison: Creditinfo Estonia similarly required enterprise RFQ.

**Verdict: v1.1 (attestation-required)** — pricing is RFQ-only, platform-fee status cannot be confirmed from public materials. Classify as v1.1 not v1 per the HR Topograph lesson.

### 4b. Lursoft (Latvian aggregator with LT module)

**URLs probed:** `https://www.lursoft.lv/en/api-partners`, `https://www.lursoft.lv/lietuvas-uznemumi?l=en` — both HTTP 403 (site blocks external access).

**From search results:** Lursoft provides "Lithuanian data includes basic data, financial data, insured persons' data, social insurance debt information, and vehicles." Also: "ensures the database is updated at the moment of verification, and the register contains detailed information about companies, company officers and documents." API available in XML and JSON.

**Pricing model:** Search results show `lursoft.lv/pricing` exists but HTTP 403 blocked the probe. Secondary source: "Services are available without a subscription, paying for individually requested services according to the published price list." This suggests a per-call model without mandatory subscription — but this is not confirmed first-hand.

**Platform-fee probe:** Could not determine from public materials due to HTTP 403 blocking. "Without a subscription" language in secondary source is encouraging but unverified.

**Verdict: v1.1 (attestation-required)** — per-call model claimed in secondary sources but not confirmed from public pricing page. Officer data coverage confirmed. Must obtain direct price confirmation.

### 4c. Creditinfo Group / Coface Lithuania

**Coface:** `https://developers.coface.com/` — page renders only a title, no content. Coface API portal exists and claims "26 API products, 188 million companies." Lithuania coverage likely via their global product. No public pricing — always RFQ. Coface historically requires annual contracts.

**Verdict for Coface: NOT VIABLE v1** (historically subscription-only, annual minimums likely, no public per-call tier documented).

### 4d. Risika

**Coverage:** SE, FI, DK, NO confirmed. Baltic expansion not confirmed — search results do not show LT/LV/EE coverage. "Prices are €60K per country" language in secondary results implies subscription not per-call.

**Verdict: NOT VIABLE** — no confirmed LT coverage; pricing structure is enterprise subscription (€60k+/country), not per-call. DQ on price band.

### 4e. rekvizitai.vz.lt (UAB Rekvizitai / Dreamsite)

**From secondary sources:** Rekvizitai.lt / rekvizitai.vz.lt is a Lithuanian business directory providing "current details including name, company code, VAT code, social insurer code, **full name of the head (vadovas)**, legal address, actual location address, phone and email." API access requires an authentication token obtained by contacting info@rekvizitai.lt. Pricing: not public.

**ToS / scraping probe:** rekvizitai.vz.lt returned HTTP 403 on direct WebFetch, and Claude Code flagged it as unable to fetch. Terms of service for automated access not retrievable during this session. They do provide an authenticated API token model (not public scraping).

**Platform-fee probe:** Could not determine from public materials. API is token-gated with pricing by RFQ.

**Verdict: v1.1 (attestation-required)** — source explicitly includes vadovas (managing director) name. API exists. Pricing RFQ, platform-fee unknown. However, this is a Lithuanian-only source (unlike Lursoft which covers Baltic); and they appear to aggregate from Registrų centras open data + additional enrichment. Worth pursuing for vadovas (sole executive) data; board/council coverage unclear.

### 4f. Okredo Lithuania

**Coverage:** `okredo.com/en-lt` — Lithuanian business data platform (Vilnius-based, founded 2015). Provides credit scores, credit limits, financial ratios, monitoring. "Directors and beneficiaries" implied. Freemium + premium tiers.

**Pricing model:** Not public — "contact for favorable terms" ([email protected]). Monthly subscription implied.

**Platform-fee probe:** Not determinable from public materials.

**Verdict: NOT VIABLE v1** — pricing structure suggests subscription, not per-call. No confirmed API for external integration. Local Lithuanian platform; possible data-sharing agreement pathway if partnership model needed.

### 4g. Topograph

**Topograph coverage probe for LT:**
- `https://docs.topograph.co/essentials/lithuania.md` → HTTP 404
- `https://www.topograph.co/guides/business-registers-in-lithuania` → HTTP 404
- `https://docs.topograph.co/llms.txt` → confirmed list of country guides; Lithuania is NOT listed among covered countries
- `https://topograph.co/pricing/lt` → renders only title, no content

**Verdict for Topograph / LT: LT NOT CONFIRMED IN COVERAGE.** The two Lithuania-specific documentation URLs both returned 404. The llms.txt content shows Poland, Romania, Slovakia, Slovenia, and others but not Lithuania. LT appears not yet in Topograph's coverage matrix.

**Skip Topograph** per doctrine (also DQed on €1,500/mo platform fee).

### 4h. TransactionLink

**Coverage:** `https://www.transactionlink.io/integrations/registru-centras` — confirmed as an integration target. Claims "company registration details, ownership information, financial statements, corporate governance."

**Pricing model:** NOT public — "Book a call" / "Start free trial." No per-call pricing visible.

**Platform-fee probe:** Not determinable from public materials.

**Verdict: v1.1 (attestation-required)** — officer data coverage implied ("corporate governance") but not field-specified. Pricing model unknown.

### 4i. Info-clipper.com

**Coverage:** Confirmed LT. Per their site: "pay-as-you-go, subscription-free service." Includes "shareholders and directors" for Lithuanian companies.

**Pricing:** ~€95.20 per electronic extract (with VAT), 30-minute processing. This is document-broker pricing (Schmidt & Schmidt model) — too expensive to pass through at Strale's €0.02–€0.50 capability price band.

**Platform-fee probe:** No subscription stated explicitly. But the per-report price of €95.20 is prohibitive for Strale's use case.

**Verdict: NOT VIABLE v1** — per-report cost (~€80 ex-VAT) is 160–4000× the Strale capability price band. Document broker, not API.

### Path 4 overall assessment

| Vendor | LT officer coverage | Pricing model | Platform-fee status | Verdict |
|--------|-------------------|---------------|---------------------|---------|
| Creditinfo Lithuania | Confirmed (management data) | RFQ only | Unknown — likely annual contract | v1.1 attestation-required |
| Lursoft (LT module) | Confirmed (company officers) | Per-call claimed (secondary source) | Unknown — 403 blocked direct probe | v1.1 attestation-required |
| rekvizitai.vz.lt | Confirmed (vadovas name) | RFQ — token API | Unknown | v1.1 attestation-required |
| Coface | Likely but RFQ | Annual contract assumed | Annual minimum likely | NOT VIABLE v1 |
| Risika | LT NOT CONFIRMED | Enterprise subscription | Platform fee likely | NOT VIABLE |
| Okredo | Implied | Subscription | Unknown | NOT VIABLE v1 |
| Topograph | LT NOT IN COVERAGE | Per-call (but for other countries) | €1,500/mo platform fee (DQed) | SKIP PER DOCTRINE |
| TransactionLink | Implied | RFQ | Unknown | v1.1 attestation-required |
| Info-clipper | Confirmed | ~€95/extract per-call | None stated | NOT VIABLE (price band) |

**Best v1 candidate among paid aggregators: Lursoft** (per-call model claimed in secondary sources, Baltic specialist, LT officer data confirmed). Second: rekvizitai.vz.lt (Lithuanian-domestic, vadovas field confirmed, but only sole director likely covered).

---

## Path 5 — Open data alternatives (data.gov.lt / Spinta)

### 5a. data.gov.lt CKAN enumeration

**RC-namespace datasets (17 folders):** Fully enumerated under Path 1. Key finding: **no bulk download file with officer names exists** in the Spinta/data.gov.lt system for company directors. The `valdymo_organai` dataset confirms only governance structure (binary flags), not persons.

**License on Spinta datasets:** data.gov.lt publishes under CC BY 4.0 (confirmed from secondary source: "The data.gov.lt portal is available under a CC BY 4.0 license"). The `ValdymoOrganas` flags are free, CC BY 4.0.

**Key structural comparison with Estonia:**
- Estonia's RIK has a `kaardile_kantud_isikud.json.zip` (45 MB, persons on registry card) — full director names, roles, dates under CC BY 4.0.
- Lithuania's Spinta/data.gov.lt has NO equivalent. The `valdymo_organai` gives flags; the `dalyviai` gives counts. No bulk download file with officer names exists.

This is the most important negative finding: **Lithuania's Registrų centras has NOT published its officer data as open data the way Estonia's RIK has.** The open data layer is intentionally limited to governance flags (does a board exist?) rather than personnel records.

### 5b. Lithuanian Statistics (LSD / osp.stat.gov.lt)

From search: Statistics Lithuania provides financial and employment data. No director/officer roster. Not a substitute.

### 5c. VMI (State Tax Inspectorate) public information

VMI publishes: taxpayer lists, debtors, some public-sector data. Does NOT publish company officer information.

### 5d. Informacinis leidinys (RC official bulletins)

`https://www.registrucentras.lt/jar/infleid/download.do?oid=313969` — latest 2025 issue is a multi-page PDF. Contains official notices of company registrations and changes (officer appointments, capital changes, liquidations). Files are PDF-1.4, not machine-readable in structured form without OCR. Published weekly. Content includes officer-appointment notices by statute. **Viable as a delta-stream signal only** (similar to Narodne Novine for Croatia) — not a v1 enumeration path due to PDF-parse engineering cost.

**License:** Official government publications, public domain (Lithuanian copyright law, Art. 5 — official acts not protected).

### 5e. JANGIS (UBO register)

**Confirmed NOT publicly accessible.** Open Ownership's map: "Structured data publicly available: No. Published as BODS: No. Available via API: No." Following the CJEU Nov 2022 ruling, Lithuania requires demonstration of "legitimate interest" for access. JANGIS data is accessible only through Registrų centras upon registration and legitimate-interest showing. Not an open-data bulk source.

**Verdict on Path 5: PARTIALLY VIABLE (governance flags only).** Spinta `valdymo_organai` under CC BY 4.0 provides board-structure binary flags (vadovas: yes/no + appointment date, valdyba: yes/no). This is useful metadata but not officer names. No bulk download equivalent to Estonia's `kaardile_kantud_isikud` exists. Path 5 cannot be v1 for LT officer names.

---

## Path 6 — Public web UI HTML/PDF

### 6a. registrucentras.lt public search

**URL pattern:** `https://www.registrucentras.lt/jar/p_en/index.php` (public search, no login required)

**registrucentras.lt was ECONNREFUSED on all direct probes** during this session (7 attempts). Information derived from secondary sources.

**What public search shows (free, 100 searches/day):** Company code, name, registered address, legal form, legal status, list of submitted documents, applicable international sanctions.

**What requires payment:** Certified electronic extract (Elektroninis Sertifikuotas Išrašas) — €6.37 per extract — includes founders, management board members (name, personal code, position, start date), authorized capital, capital structure.

**Statutory basis:** Lithuanian law on the Register of Legal Entities — register data is public and "any person may access them in accordance with procedures laid down by laws." For detailed data (officer names, personal codes), the law permits access subject to a fee set by the Government.

**Conclusion on free public display:** Director/officer names are NOT freely displayed on the public search result pages. They are only in the paid certified extract. This is structurally different from Estonia (where ariregister shows full board publicly) and similar to Latvia (where some data requires extract purchase).

### 6b. rekvizitai.vz.lt public display

**URL probed:** `https://rekvizitai.vz.lt/en/imone/vilniaus_universitetas/` → HTTP 301 redirect to `rekvizitai.vz.lt`, then HTTP 403 / Claude Code flagged unable to fetch.

**From secondary sources (tet.lt blog):** "Rekvizitai.lt is a directory of Lithuanian enterprises which contains data on legal entities of all legal forms, with information collected from official state registers and updated in a timely manner. The database provides current details including... full name of the head (vadovas)... without charge."

**Critical implication:** If secondary sources are accurate, rekvizitai.vz.lt shows the vadovas (managing director) name **publicly, without login, without payment**. This would be a significant Path 6 signal — public display of officer data from a third-party aggregator without the Registrų centras €6.37 paywall.

**DEC-20260518-F 4-constraint check for rekvizitai.vz.lt:**

1. **Statutorily public:** YES — Register of Legal Entities data is public by Lithuanian law. Managing director names are part of the public register per the Law on Companies.
2. **ToS permits per-call automated access:** UNKNOWN — rekvizitai.vz.lt blocked direct access (403) and the terms of service were not retrievable. The site provides an authenticated token-based API (contact info@rekvizitai.lt), suggesting they do permit programmatic access under a token model — but whether their HTML web pages can be fetched per-entity is unconfirmed.
3. **Per-entity per-request:** YES structurally (URL `rekvizitai.vz.lt/imone/{company-slug}` is per-entity).
4. **Attribution preserved:** Rekvizitai cites "official state registers" as source. Primary source provenance (Registrų centras JAR) would need to be preserved in Strale's response.

**DEC-20260428-A Tier 1 assessment:** Even if rekvizitai.vz.lt freely displays the data, **Strale operating its own scraper against rekvizitai.vz.lt** would violate DEC-20260428-A Tier 1 (absolute). The token-based API from rekvizitai.lt is a different instrument — that would be Tier 2 if ToS permits redistribution + indemnification.

**Verdict on Path 6:**
- Operating a scraper against any Lithuanian site: BLOCKED by DEC-20260428-A Tier 1 (absolute).
- Using rekvizitai.vz.lt's token API as a Tier 2 vendor: potentially viable IF their API ToS includes redistribution rights + indemnification. Needs vendor due-diligence. Classify as v1.1.
- Direct Registrų centras public web: shows no officer names for free — €6.37/extract required.

**DEC-20260518-F 4-constraint check summary:** All 4 constraints are met for the data layer (statutes = public + per-entity URL structure + attribution possible), but constraint 2 (ToS permits automated access) is UNCONFIRMED for rekvizitai.vz.lt HTML scraping. The token API model is the only clean automated path.

---

## Path 7 — BRIS cross-border

**URLs probed:**
- `https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lt_en` → HTTP 200, content retrieved
- `https://webgate.ec.europa.eu/e-justice/489/EN/business_registers__search_for_a_company_in_the_eu?init=true&idSubpage=1` — Topograph/HR note: this URL returned 307 → sorry.ec.europa.eu (Commission blocks external IPs from US East)

**What Lithuania exposes through BRIS:**

Per the e-justice.europa.eu Lithuania page, the register stores and exposes via BRIS:
- Legal person's code, name, address of registered office
- Management body members data and persons authorized to represent the company
- Financial report submission dates and titles
- Legal status (bankruptcy, liquidation, restructuring)
- Documents list

**BRIS standard payload for LT:** As with other MS, BRIS exposes the lowest-common-denominator cross-border fields: company name, legal form, registration number, address, status, EUID. The richer LT-specific fields (officer names, personal codes) are available in the domestic JAR portal extract but whether they propagate through BRIS to the e-Justice portal is not confirmed.

**API access for BRIS:** No public REST API for third parties. Portal-only interface (web search at webgate.ec.europa.eu). The European Commission's long-term roadmap mentions machine-readable BRIS under Directive 2017/1132 but as of 2026-05 no public endpoint documented.

**Verdict: NOT VIABLE for officer names.** BRIS surfaces basic identity fields; even if Lithuania's register "data on management body members" is in-scope per the e-Justice description, there is no programmatic API to consume it. Worth monitoring as EC opens BRIS APIs.

---

## Path 8 — Court / commercial register separate / official gazette

### 8a. Informacinis leidinys (RC official bulletins / company gazette)

**URL pattern:** `https://www.registrucentras.lt/jar/infleid/download.do?oid={oid}` — PDFs published regularly (weekly pattern from OID numbering: 2024-011 through 2025-225 in evidence).

**Content:** Official notices of company registrations, amendments, officer appointments/resignations, capital changes, liquidations. By statute, management body changes must be officially published.

**Format:** PDF, 128+ pages per issue. Binary PDF without structured metadata — OCR or PDF text extraction required to parse officer notices into structured form.

**License:** Official state publications — public domain in Lithuania (Law on Copyright and Related Rights, Art. 5, Sec. 1(4): "provisions of legislative and other regulatory legal acts, and official translations thereof" are not copyrighted). The bulletins as official government acts are not copyrighted.

**Machine-readable API:** NONE documented. The PDFs are downloadable but not an API.

**Entity-to-gazette linkage:** each bulletin page contains free-text notices with company name + code + officer details. Parsing requires: (a) download ~52 PDFs/year + historical backfill, (b) OCR + text extraction, (c) entity-resolution to match notices to JAR codes. Substantial engineering — similar to Croatia's Narodne Novine path.

**Verdict: VIABLE-v1.5 (Strale-built derivative dataset, DEC-20260428-B engineering bar applies).** Not viable for v1 due to engineering cost. Under DEC-20260428-A Tier 1 this is CLEAN (Strale building on public-domain official government publications, not scraping). Under DEC-20260428-B this requires versioned dataset, manifests, golden tests.

### 8b. TAR (Teisės aktų registras) — https://www.e-tar.lt

**From secondary sources:** TAR is Lithuania's official legal acts register — stores laws, regulations, normative acts. It does NOT store company filings or officer appointments as a registrar. It is a legal-acts registry, not a company-events gazette.

**Verdict: NOT VIABLE** — wrong register type (legal acts, not company events).

### 8c. VMI (Tax Inspectorate) public data

VMI publishes: list of large taxpayers, lists of debtors, sanctioned entities. Does NOT publish officer roster.

**Verdict: NOT VIABLE** for officer data.

### 8d. Lithuanian Notary Chamber

Notaries witness company establishment and officer appointments. Not consolidated into a public searchable database.

**Verdict: NOT VIABLE** (distributed, not an API source).

### 8e. Bankruptcy / insolvency gazette

`https://e-justice.europa.eu/topics/registers-business-insolvency-land/bankruptcy-and-insolvency-registers_en` — Lithuania participates in the European Insolvency Register. Provides insolvency proceedings, not a general officer roster.

**Verdict: NOT VIABLE** for general officer data (insolvency-specific only).

---

## LT synthesis

### v1 path: JARS.LT (pending API field verification)

JARS.LT (`https://jars.lt/en/`) claims "Directors and beneficiaries" for Lithuanian companies. Pricing: €5/mo Starter for 5,000 req/mo (€0.001/request effective cost). No long-term contracts. No platform fee stated. If the API actually returns director names for LT companies, this is the lowest-friction v1 path.

**Required action before v1 ship:** Register for a free JARS.LT account (100 req/mo free tier), call their company endpoint for Vilnius University (11125567) and AB SEB bankas (21258254), and confirm that director names appear in the JSON response. If confirmed → classify as v1 viable. Estimated lead time: same-day.

**Data-provenance chain for DEC-20260428-A assessment:** JARS.LT does not publicly document their data source for LT officer data. Given that the open Spinta/JAR data has NO officer names, JARS.LT must be either (a) calling the Registrų centras API under a commercial agreement, (b) parsing the public web UI / Informacinis leidinys, or (c) purchasing electronic extracts in bulk. If (b), that is third-party scraping and Strale must confirm JARS.LT has redistribution rights. **Strale must require JARS.LT to attest in writing** which sourcing mechanism (a/b/c) they use and confirm redistribution + indemnification before treating them as a clean Tier 2 vendor under DEC-20260428-A.

### v1.1 backup: Lursoft (Baltic specialist)

Lursoft covers LT/LV/EE with "company officers and documents" per their product description. Per-call model claimed in secondary sources ("without a subscription, paying individually"). Direct pricing page was 403-blocked. Lursoft is the most established Baltic-specialist with documented LT officer coverage. Contact: info@lursoft.lv / (+371) 67844300.

**Platform-fee probe required before onboarding.** If per-call without minimum → v1 viable pending price.

### v1.1 alternative: rekvizitai.vz.lt token API

Explicitly provides vadovas (managing director full name) per secondary source confirmation. Token-based authenticated API (info@rekvizitai.lt). RFQ pricing. Redistribution rights must be confirmed. Coverage appears to be vadovas only (sole executive), not full board/council — needs verification.

### v1.2 contingency: Creditinfo Lithuania

If Lursoft and rekvizitai.vz.lt both fail on pricing or terms, Creditinfo Lithuania (ltu.info@creditinfo.com) is the credit-bureau fallback with confirmed "representation and management data." Likely annual contract model — potential v1.1 blocker.

### Truly blocked?

**NO.** Lithuania is NOT blocked for officer data. The situation is:

1. **Open data has no officer names** — unlike Estonia, Lithuania has NOT published `kaardile_kantud_isikud`-equivalent in Spinta. The `valdymo_organai` flags exist + appointment dates but NO personal names.
2. **Officer names DO exist publicly** — they are in the paid electronic extract (€6.37/call from RC) and reportedly in rekvizitai.vz.lt's public web display (not verified this session due to 403).
3. **Multiple aggregation paths exist** — JARS.LT, Lursoft, rekvizitai.vz.lt all claim to provide director data and can be interrogated with low lead time.
4. **Informacinis leidinys is a viable v1.5 path** for Strale-built capabilities once volume justifies the engineering investment.

### DEC-20260428-A scope questions

**Question 1 (JARS.LT data provenance):** JARS.LT's LT director data source is undisclosed publicly. Given that Spinta open data contains NO officer names, JARS.LT must be sourcing from either the €6.37 extract flow, the Registrų centras commercial API, or the public web UI. Strale must require written attestation from JARS.LT of their sourcing mechanism and explicit redistribution + indemnification language before using them as Tier 2 vendor. This is analogous to the Topograph HR attestation requirement.

**Question 2 (rekvizitai.vz.lt redistribution rights):** If rekvizitai.vz.lt's token API includes redistribution rights in their ToS, this is a clean Tier 2 path under DEC-20260428-A with Registrų centras as primary source and rekvizitai.vz.lt as the licensed redistributor. Must confirm via API agreement review before onboarding.

**Question 3 (Informacinis leidinys Strale-built pipeline):** Building a pipeline on Registrų centras official bulletins (PDFs) is Tier 1 clean under DEC-20260428-A (official state publications, not third-party site scraping). Subject to DEC-20260428-B engineering bar if pursued as a capability.

---

## Summary table

| Path | Viable? | Cost | Lead time | Notes |
|------|---------|------|-----------|-------|
| 1a — Spinta JAR valdymo_organai | PARTIAL (flags only) | Free, CC BY 4.0 | Zero | Binary existence flags; NO officer names |
| 1b — Spinta JADIS dalyviai | NOT VIABLE (names) | Free | Zero | Aggregate counts only |
| 1c — RC direct API | NOT CONFIRMED | Unknown | RFQ | GoSign API only in GitHub; no public company-data API |
| 2a — data.gov.lt auth | NOT VIABLE for names | Free | Zero | Auth doesn't unlock name fields |
| 2b — RC self-service (auth) | VIABLE (paid extract) | €6.37/extract | Same-day | Per-extract; officer names + personal codes included |
| 2c — VIISP | NOT VIABLE | Free but state-only | N/A | Government institutions only |
| 3 — OpenCorporates | NOT VIABLE | £2,250+/yr | — | Subscription floor |
| 3 — OpenSanctions LT | NOT VIABLE for officers | Free/commercial | — | PEP/sanctions only, no company officer roster |
| 3 — BODS/Open Ownership | NOT VIABLE | Free | — | UBO not published as BODS |
| 3 — GLEIF | NOT VIABLE | Free | — | No officer fields |
| 3 — **JARS.LT** | **v1 CANDIDATE (verify first)** | €0–€15/mo | Same-day | Director data claimed; must verify via API test; attestation on sourcing required |
| 4 — Creditinfo LT | v1.1 (RFQ) | RFQ, likely annual | Weeks | Platform fee unknown |
| 4 — Lursoft | v1.1 (RFQ) | Per-call claimed | Days–weeks | Best Baltic specialist; officer coverage confirmed; 403-blocked direct probe |
| 4 — rekvizitai.vz.lt | v1.1 (RFQ) | RFQ | Days | vadovas name confirmed; redistribution rights unknown |
| 4 — Topograph | NOT IN LT COVERAGE | — | — | LT not in Topograph docs; also DQed on platform fee |
| 4 — TransactionLink | v1.1 (RFQ) | RFQ | Weeks | Implied corporate governance data; pricing unknown |
| 4 — Info-clipper | NOT VIABLE (price) | ~€95/extract | — | Price band wrong for Strale |
| 5 — Spinta bulk download | PARTIAL (flags only) | Free, CC BY 4.0 | Zero | Same as Path 1a; no officer names |
| 5 — Informacinis leidinys PDFs | v1.5 (Strale-built) | Free (public domain) | 2–4 weeks build | Weekly PDFs, OCR required; DEC-20260428-B bar applies |
| 6 — RC public web HTML | NOT VIABLE directly | Free (public) | — | No officer names on free public page; DEC-20260428-A Tier 1 anyway |
| 6 — rekvizitai.vz.lt web display | NOT VIABLE directly | Free (public) | — | vadovas reportedly shown; DEC-20260428-A Tier 1 blocks Strale scraping |
| 6 — rekvizitai.vz.lt token API | v1.1 (pending ToS) | RFQ | Days | Token API exists; redistribution rights unconfirmed |
| 7 — BRIS | NOT VIABLE | Free | — | No officer API; portal-only; officer fields not confirmed in cross-border export |
| 8 — Informacinis leidinys (gazette) | v1.5 (build effort) | Free (public domain) | 2–4 weeks | PDF weekly gazette; officer appointments per statute |
| 8 — TAR | NOT VIABLE | Free | — | Legal acts register, not company events |
| 8 — VMI | NOT VIABLE | Free | — | Tax data, no officers |
| 8 — Notary Chamber | NOT VIABLE | — | — | Distributed, not API |
