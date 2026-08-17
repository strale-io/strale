# EE — 8-path enumeration

Test entity: **Bolt Technology OÜ (registry code 12417834)**. Investigation date: 2026-05-18.

---

## Path 1 — Same vendor, other endpoints (RIK / Ariregister Open Data API)

**URLs probed:**
- https://avaandmed.ariregister.rik.ee/en/open-data-api/introduction-api-services
- https://avaandmed.ariregister.rik.ee/en/open-data-api/rights-representation-all-persons-related-company
- https://avaandmed.ariregister.rik.ee/en/open-data-api/detailed-company-data-query
- https://avaandmed.ariregister.rik.ee/en/open-data-api/company-annual-reports-list-query
- https://ariregister.rik.ee/eng/xml_queries

**Endpoints enumerated (15 services, all SOAP/XML against `https://ariregxmlv6.rik.ee/` — prod, WSDL at `?wsdl`):**

| # | Service | Slug | Officer data? | Free? | Contract required? |
|---|---------|------|---------------|-------|---------------------|
| 1 | Autocomplete | `/api/autocomplete` (REST) | NO (identity only) | YES | NO |
| 2 | e-invoice recipients | — | NO | YES | NO |
| 3 | Enterprise Simple Data (status) | `lihtandmed_v2` | NO | YES (contract) | YES |
| 4 | **Detailed Company Data** | `detailandmed_v2` | **YES — "kaardile_kantud_isikud" (persons on registry card) with role classifications (ASES, KOAS, etc.), name, personal ID, country, address, representation rights** | YES (contract) | YES |
| 5 | List of documents | `dokumendid` | NO | YES (contract) | YES |
| 6 | Annual Reports List | `aastaaruannete_nimekiri` | NO (metadata only) | YES (contract) | YES |
| 7 | Annual Report (single) | `aastaaruanne` | indirect (report contents include board composition narrative; not structured) | YES (contract) | YES |
| 8 | **Rights of Representation** | `esindus_v1` | **YES — name, personal ID code, country, DOB, role designation, exclusive representation flag, exceptions, legal form** | YES (contract) | YES |
| 9 | Company Data Change List | `andmete_muutused` | indirect (lists changes incl. officer entries) | YES (contract) | YES |
| 10 | Company Requisite Info | `rekvisiidid` | NO | YES (contract) | YES |
| 11 | Company Requisite File | `rekvisiidid_fail` | NO | YES (contract) | YES |
| 12 | Entries and Rulings | `kanded_maarused` | indirect | YES (contract) | YES |
| 13 | Persons Data Changes (BO) | `isikuandmete_muudatused` | UBO changes only | YES (contract) | YES |
| 14 | Beneficial Owners | `kasusaajad` | UBO not directors | YES (contract) | YES |
| 15 | Trusts | `usaldushaldajad` | trustees | YES (contract) | YES |
| 16 | EMTAK revenue breakdown | `emtak_myygitulu` | NO | YES (contract) | YES |

**Officer-bearing endpoints found:** YES — `esindus_v1` (Rights of Representation) is the canonical officer endpoint. `detailandmed_v2` also includes officers under `kaardile_kantud_isikud`. Both are SOAP/XML, JSON output supported via param.

**Sample response for Bolt Technology (autocomplete only — the no-contract endpoint):**
```json
{"status": "OK", "data": [{"company_id": 9000088952, "reg_code": 12417834,
  "name": "Bolt Technology OÜ", "historical_names": ["Taxify OÜ", "MTAKSO OÜ"],
  "status": "R", "legal_address": "Harju maakond, Tallinn, Kesklinna linnaosa, Vana-Lõuna tn 15",
  "zip_code": "10134", "legal_form": "5",
  "url": "https://ariregister.rik.ee/est/company/12417834/Bolt-Technology-OÜ"}]}
```
Confirmed via direct curl 2026-05-18. No officers returned.

**Verdict: viable-v1.1 (contract is FREE but has 5-day lead time)**

**Cost:** FREE — "When concluding the contract only for the use of the e-Business Register API services, the use of the services is free of charge."
**Rate limits (per contracted partner):** 50,000 queries/day, 1 simultaneous query, 20 doc-downloads/min.
**Latency:** not tested (no contract).

**Evidence excerpt:**
- Fetched introduction page: "Contract Required: Yes, except Autocomplete and e-invoice recipient queries... it is necessary to sign an agreement with the Registers and Information Systems Center."
- `esindus_v1` XSD: http://www2.rik.ee/schemas/xtee6/arireg/live/xroad6_esindus_v1.xsd
- `detailandmed_v2` XSD: http://www2.rik.ee/schemas/xtee6/arireg/live/xroad6_detailandmed_v2.xsd

---

## Path 2 — Same vendor, authenticated free path (the RIK contract)

**URL:** https://ariregister.rik.ee/eng/contract/step1

**Process:**
1. Sign in via the e-Business Register portal (Estonian eID, Smart-ID, Mobile-ID, or potentially EU eIDAS — not explicitly documented for foreign legal entities).
2. Choose application type: on behalf of a legal entity OR private individual.
3. Step 2 = select services; Step 3 = review general conditions; Step 4 = submit.
4. RIK reviews within **5 working days**, then sends administrator credentials.

**Lead time:** 5 working days.
**Cost:** FREE.
**Rate limit (post-contract):** 50,000 queries/day, 1 simultaneous query.
**Endpoints unlocked:** all 14 contract-gated services above, including the two officer endpoints (`esindus_v1`, `detailandmed_v2`).

**Open question (must contact `[email protected]` to confirm):**
- Is the contract available to non-Estonian entities? Not explicitly disclosed. Empirically third-party integrators (e.g. `github.com/internetee/company_register`, Ruby wrapper) exist and Lursoft IT (Latvian) and Inforegister (Estonian) resell to international customers, suggesting it is foreign-friendly. Authentication for foreign signatories may require eIDAS or notarised power of attorney.
- Does Strale AB (Swedish entity) qualify directly, or must we use an Estonian agent / e-Residency identity? Petter holds e-Residency — worst case, sign the contract under e-Residency identity, then Strale executes calls server-side using assigned API credentials.

**Recommendation:** Initiate the application **in parallel** with v1 shipping. If approved within 5 days, swap the v1 path to Path 2. If foreign-applicant issues arise, fall back to e-Residency.

---

## Path 3 — Other free aggregators

**OpenCorporates** (`https://opencorporates.com/companies/ee/12417834`)
- WebFetch blocked by Cloudflare CAPTCHA on direct request, but published reporting confirms EE coverage including officers (sourced from RIK).
- Public web profile shows officers without login (per OpenCorporates' standard model).
- API: `https://api.opencorporates.com/companies/ee/12417834` returns HTTP 401 without key.
- **Pricing**: subscription tiers: Essentials £2,250/yr (500 calls/mo), Starter £6,600/yr (2,500/mo), Basic £12,000/yr (5,000/mo). NO per-call tier.
- **Verdict: not-viable (subscription violates v1 cost discipline; minimum £225/mo fixed).**

**OpenSanctions — `ee_ariregister` dataset** (`https://www.opensanctions.org/datasets/ee_ariregister/`)
- "All companies registered in Estonia, including directors and beneficial owners" — 2.4M+ entities.
- Source: avaandmed.ariregister.rik.ee, refreshed weekly (processed daily).
- Format: FollowTheMoney JSON.
- **Pricing**: free for non-commercial; **commercial license required** (RFQ via OpenSanctions sales — no public price). Already on Strale's existing OpenSanctions/Dilisense contract conversations? No — DEC-20260429-A dropped OpenSanctions in favour of Dilisense for sanctions/PEP. Adding OS back for KYB reference data is a separate contract.
- **Verdict: viable-v1.1 if OS commercial license is acceptable (RFQ required, likely subscription)**. Not viable for v1 under "no fixed fee" constraint.

**BODS / Open Ownership** (`https://www.openownership.org/en/map/country/estonia/`)
- Estonia has statutory UBO disclosure since 2018. Open Ownership ingests EE data.
- **Beneficial owners ≠ directors.** Out of scope for officer enumeration.
- **Verdict: not-viable for officers** (correct primitive for UBO capability, not directors).

**GLEIF Level 2** (`https://api.gleif.org/api/v1/lei-records?filter[entity.legalAddress.country]=EE`)
- Probed live 2026-05-18: 28,624 EE legal entities. Returns LEI, name, jurisdiction, addresses, legal form, registration date, direct/ultimate parent (Level 2 = entity-to-entity relationships).
- **No officer/director fields.** Level 2 covers corporate parents, not natural-person directors.
- **Verdict: not-viable for officers**.

**Companies-API / Companies.io** — not investigated separately; either resells OC/OS data or uses scraping. Not a primary source.

---

## Path 4 — Per-call paid aggregators (no subscription)

**Inforegister.ee** (`https://apidocs.inforegister.ee/en`)
- Estonian commercial KYB aggregator. Public profile page for Bolt Technology (https://www.inforegister.ee/en/12417834-BOLT-TECHNOLOGY-OU/) shows full board (Markus Villig, Ahto Kink) + Council (Martin Villig chair + 7 others) **without login**.
- REST API documented, includes "board members" data.
- **Pricing: NOT public** — info@ir.ee / +372 744 6644 for quote. No public per-call tier visible.
- **Verdict: viable-v1.1 (RFQ required)** — if Inforegister offers per-call pricing without subscription, this is the cleanest commercial fallback because they already aggregate the same RIK data + add screen-scrape value, and their data is statutorily-public (Tier 2 under DEC-20260428-A *if* license includes redistribution).

**Creditinfo Estonia** (formerly Krediidiinfo, part of Creditinfo Group Iceland)
- Baltic KYB specialist; per-call API existed historically. Pricing not public — RFQ.
- **Verdict: viable-v1.1 (RFQ required)**.

**Bisnode Estonia / Dun & Bradstreet** — historically subscription-only, large minimum commit. Almost certainly subscription. Not v1.

**Krediidiraport.ee** — credit report broker; per-report pricing in EE retail market. Officer data in basic report (yes, per Estonian standard). API: not investigated. RFQ.

**Lursoft Estonia** (`https://eecompanies.lursoft.lv/en/company/bolt-technology-ou/12417834`) — Latvian aggregator with EE coverage. Subscription model.

**Verdict on Path 4 overall: viable-v1.1 (RFQ required from Inforegister and Creditinfo Estonia in parallel).**

---

## Path 5 — Open data alternatives (downloadable files)

**Endpoint:** `https://avaandmed.ariregister.rik.ee/en/downloading-open-data`
**Files enumerated** (all CC BY 4.0, refreshed daily — confirmed via HTML page extract):

| File | URL | Format | Officer relevance |
|------|-----|--------|-------------------|
| **Persons on Registry Card** | `https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip` | JSON ZIP | **YES — board members, directors, representation roles** |
| Persons on Registry Card | `…kaardile_kantud_isikud.xml.zip` | XML ZIP | YES (same) |
| Persons NOT on Registry Card | `…kandevalised_isikud.json.zip` | JSON ZIP | partial (off-card persons) |
| Shareholders | `…osanikud.json.zip` | JSON ZIP | NO (ownership) |
| Beneficial Owners | `…kasusaajad.json.zip` | JSON ZIP | NO (UBO ≠ directors) |
| General Data | `…yldandmed.json.zip` | JSON ZIP | partial |
| Registry Cards | `…registrikaardid.json.zip` | JSON ZIP | NO (card metadata) |
| Simple Data | `…lihtandmed.csv.zip` | CSV ZIP | NO |
| Annual Reports yearly elements (2019-2025) | `/sites/default/files/4.{year}_aruannete_elemendid_kuni_30042026_0.zip` | ZIP | NO (financial elements, not officers) |
| Commercial Pledge | `…kommertspandid.json.zip` | JSON ZIP | NO |
| Rulings | `…maarused.json.zip` | JSON ZIP | NO |

**Live verification of "Persons on Registry Card" JSON file:**
- HEAD probe 2026-05-18 15:32 UTC: HTTP 200, `Content-Length: 45219974` (45 MB), `Last-Modified: Mon, 18 May 2026 10:37:59 GMT` (refreshed today).
- License: CC BY 4.0.
- Note: from 2024-11-01 personal identification numbers are **redacted** from open-data files per data-protection reasons. Names + roles + entry dates remain.

**Verdict: viable-v1 — STRONG.** Daily-refreshed, CC BY 4.0, no auth, no rate limits, includes board composition. This is the path of least resistance for v1.

**Trade-offs vs Path 2 (API contract):**
| | Path 5 (bulk file) | Path 2 (API contract) |
|---|---|---|
| Auth | None | API credentials |
| Lead time | Zero | 5 working days |
| Freshness | Daily (≤24h stale) | Real-time |
| Per-call latency | Local DB lookup (~10ms) | SOAP call (~500–2000ms) |
| Personal ID code | redacted (post-Nov 2024) | available |
| Operational complexity | daily ingest job + storage + dedupe | per-request SOAP client |
| Volume cost | linear in EE corpus (~2.4M entities) | metered (50k/day cap) |

**Recommended architecture:** Path 5 as v1 with a daily ingest job; promote to Path 2 (API contract) once approved as v1.1 for cases where personal-ID-code or real-time freshness matters.

---

## Path 6 — Public web UI HTML / PDF

**URL:** `https://ariregister.rik.ee/eng/company/12417834/Bolt-Technology`

**Live verification (curl 2026-05-18):**
- HTTP 200, response size 733,621 bytes.
- Verified via regex: page contains "Markus Villig", "Ahto Kink", "Martin Villig", "management board", "board member" — **without authentication**.
- Per WebFetch confirmation: Management Board (Markus Villig 39312170011 since 07.02.2013; Ahto Kink 37502126022 since 06.08.2021), Supervisory Board (Martin Villig chairman + 7 members), capital, address, shareholders, beneficial owners, annual reports list, articles of association — all public.

**URL structure:** `https://ariregister.rik.ee/eng/company/{reg_code}/{name-slug}` — `eng` for English, `est` for Estonian.

**Statutory basis:** Estonian Commercial Code §§ 22, 145 make commercial register data public. The official RIK web portal is the canonical public surface — this is **not third-party scraping**. It is the official government registry's own free public web UI.

**DEC-20260428-A scope question:**
This is **the official registry's own public web UI**, not a third-party scraper site. Strale operating its own browser against `ariregister.rik.ee` would still violate Tier 1 ("Strale itself never operates scrapers (absolute)"). The doctrine is absolute about Strale-operated scrapers regardless of statutory basis. So Path 6 is **document-but-do-not-pursue** for v1 — the file dump (Path 5) and the API contract (Path 2) accomplish the same access without Strale operating a scraper.

**Verdict: viable as data-availability evidence; not-pursued as v1 path under DEC-20260428-A Tier 1.**

---

## Path 7 — BRIS cross-border

**URLs:**
- https://webgate.ec.europa.eu/e-justice/searchBris.do (web UI; redirected to sorry.ec.europa.eu during probe — temporary issue)
- https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu_en

**BRIS exposure for EE:**
- Web UI search returns: company name, legal form, registered office, registration number, EUID, status, links to national-register filings.
- **No officer data.** BRIS is an entity-discovery surface, not an officer-disclosure surface.
- **No public API.** Confirmed via search: "BRIS is accessible only through the e-Justice Portal web interface and there is no public API for programmatic access."
- Open BRIS (`https://openbris.eu/api/v1`) is a third-party reimplementation covering SK/CZ/FR/EE/PL/AT — but for autocomplete + IBAN cross-check, not officer enumeration.

**Verdict: not-viable for officers.**

---

## Path 8 — Court / commercial register separate from main register

**Annual reports submitted to RIK** (Commercial Code § 145, statutorily public):
- Accessible via Path 1 endpoints (`aastaaruannete_nimekiri` + `aastaaruanne`, contract-gated) and via Path 6 (public web — visible on each company's profile, downloadable PDFs).
- Reports include board composition narrative but unstructured — not a clean officer-enumeration path. PDF/XBRL parse required.
- **Verdict: not-viable as primary path** (would require PDF/XBRL extraction); useful as cross-check or for historical board state at FY-end.

**Riigi Teataja / Ametlikud Teadaanded** (`https://www.ametlikudteadaanded.ee/`)
- Official gazette for company announcements (division, dissolution, certain officer changes, summons).
- Free public access. URI-based search; HTML, XML, XML-RDF formats.
- **Event stream, not authoritative officer list.** Useful for delta-tracking changes — would help piggyback "officer-change since date X" queries — but not a v1 enumeration path.
- **Verdict: not-viable for v1 enumeration; useful as future delta-stream signal for officer-change capability**.

**Notary records** — Estonian officer appointments are notarised but not exposed as a public bulk API. Out of scope.

**Verdict on Path 8 overall: not-viable for v1.**

---

## EE synthesis

**v1 path recommendation: Path 5 (open data bulk download)**
- URL: `https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip`
- 45 MB JSON ZIP, daily refresh, CC BY 4.0.
- Officers + roles + entry dates included; personal ID codes redacted since Nov 2024.
- Architecture: nightly ingest job → Postgres table → `ee-directors` capability lookup at €0.02 (covers ingest amortised + margin).
- Latency: ~10–50ms (DB lookup).
- DEC-20260428-A: fully compliant (no Strale-operated scraping; direct ingest of statutorily-public government open data under explicit CC BY 4.0).
- DEC-20260428-B: passes the engineering bar (versioned dataset = daily-snapshot table + ingest timestamp; manifest URL public; replay = re-import any prior dump if RIK archives them; circuit-breaker on ingest failure; dispute endpoint Strale already has).

**v1.1 path: Path 2 (RIK API contract)**
- 5-day lead time, free. Apply now in parallel.
- Once approved, swap to real-time SOAP calls against `esindus_v1` / `detailandmed_v2`.
- Resolves the personal-ID-code redaction in Path 5 if Strale ever needs the full personal code for KYB.

**v1.2 contingency: Inforegister.ee** (RFQ, per-call commercial license, Tier-2 under DEC-20260428-A only if redistribution explicitly licensed). Initiate RFQ in parallel with the contract application.

**RIK contract status:** **Initiate in parallel** with v1 shipping. Application URL: https://ariregister.rik.ee/eng/contract/step1. Foreign-applicant question must be clarified with `[email protected]`; fallback is to sign under Petter's e-Residency identity.

**DEC-20260428-A scope question:** No new doctrine interpretation needed. Path 5 = direct first-party open data ingest (clean Tier 1-compatible). Path 6 is documented but not pursued (avoids Strale-operated scraper question entirely).

**OpenSanctions `ee_ariregister`:** secondary fallback if v1 needs a hosted alternative to running the daily ingest job. Commercial license required, but the dataset's authority chain (RIK → OS) is clean.

---

## Summary table

| Path | Viable? | Cost | Lead time | Notes |
|------|---------|------|-----------|-------|
| 1 — RIK API endpoints | v1.1 | free (with contract) | 5 days | 16 endpoints; 2 officer-bearing |
| 2 — RIK API contract | v1.1 | free | 5 days | apply in parallel |
| 3 — OpenCorporates | not-viable | £2,250+/yr fixed | — | subscription |
| 3 — OpenSanctions ee_ariregister | v1.1 | RFQ commercial | — | clean source chain |
| 3 — BODS / Open Ownership | not-viable | free | — | UBO not directors |
| 3 — GLEIF Level 2 | not-viable | free | — | no officer fields |
| 4 — Inforegister.ee | v1.1 (RFQ) | RFQ | — | EE-domestic aggregator, board data confirmed |
| 4 — Creditinfo Estonia | v1.1 (RFQ) | RFQ | — | Baltic specialist |
| 5 — Open data bulk JSON | **v1 RECOMMENDED** | free | zero | 45 MB daily, CC BY 4.0, includes board |
| 6 — Public web HTML | document-only | free | — | DEC-20260428-A Tier 1 blocks Strale-operated scraping |
| 7 — BRIS | not-viable | free | — | no officers, no API |
| 8 — Annual reports / Riigi Teataja | not-viable for v1 | free | — | unstructured PDFs / event stream |
