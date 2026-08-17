# Exhaustive source enumeration — HR + EE + BE (DEC-20260518-E)

**Date:** 2026-05-18
**Author:** Claude Code (Sonnet research subagents, synthesized by Opus 4.7)
**Doctrine:** DEC-20260518-E (Exhaustive Source Enumeration); DEC-20260428-A (no Strale-operated scrapers); cost discipline (per-call OK if passed through, fixed/subscription not OK in v1)
**Test entities:** HR — INA d.d. (OIB 27759560625) + Hrvatski Telekom (81793146560); EE — Bolt Technology OÜ (12417834); BE — BNP Paribas Fortis (KBO 0403199702) + AB InBev (0417497106)
**Source partials:** [_partial_hr_enumeration.md](_partial_hr_enumeration.md), [_partial_ee_enumeration.md](_partial_ee_enumeration.md), [_partial_be_enumeration.md](_partial_be_enumeration.md)

---

## Executive summary

**All three countries previously classified "blocked" are viable.** Phase 2 + Phase 3 halted at first-failure on the originally-researched path. Exhaustive 8-path enumeration per DEC-20260518-E surfaces a v1 path for each country.

| Country | Phase 2/3 verdict | Revised verdict | v1 path | Cost | Friction |
|---------|-------------------|-----------------|---------|------|----------|
| **HR** | Blocked (no public officers in Sudreg API) | **Viable-v1 pending RFQ** | Topograph per-call API | RFQ (per-call, no subscription floor) | Signup + vendor attestation under DEC-20260428-A |
| **EE** | Blocked (RIK contract required, 5-day lead) | **Viable-v1 today** | RIK Open Data bulk JSON (`kaardile_kantud_isikud`) | **FREE** (CC BY 4.0) | Daily ingest job; PIDs redacted since Nov 2024 |
| **BE** | Blocked (cbeapi.be no officers, KBO SOAP €50/2k) | **Viable-v1 today** | KBO Public Search SOAP (prepaid topup, not subscription) | **€0.025/call** prepaid | One-time €50 wire + 7-day activation |

**Headline correction:** Phase 3's BE "blocked" was based on misreading the €50/2,000 KBO SOAP fee as a monthly subscription. FPS Economy's own wording confirms it is a **prepaid topup** — "Each package entitles you to 2,000 requests and costs 50 euro" — fully passthrough-compatible per Petter's cost directive.

**Headline finding for EE:** A 45 MB daily-refreshed CC BY 4.0 JSON dump of "Persons on Registry Card" (`ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip`) — live HEAD-probed today, HTTP 200, `Last-Modified` 2026-05-18 10:37 UTC — contains board members + roles + entry dates. No contract, no auth, no lead time. The 5-day RIK contract becomes a v1.1 upgrade (real-time + non-redacted PIDs) rather than v1 prerequisite.

**Headline finding for HR:** Topograph confirmed in their public HR docs that `legalRepresentatives` is a per-call SKU returning name + role + OIB + address, sourced from Sudreg + RGFI/FINA, with no subscription floor or minimum commit. HR per-call price is gated behind magic-link signup (RFQ-required), but the model fits cost discipline.

**Revised realistic launch coverage:** All three jurisdictions move from "deferred / blocked" to "v1-shippable". Combined with the previously-viable EU/UK set from the Phase 1/Phase 2 source report, this closes the v1 launch coverage gap on three of the highest-priority blockers.

**DEC-20260428-A scope question for Petter (cross-country):** Three countries surfaced statutorily-public director data on public web UIs (HR Izvadak PDF, EE RIK profile pages, BE KBO HTML) that would technically be "free" but require Strale-operated browser fetches. All three are blocked under Tier 1 (absolute no-Strale-scraping) — and that is the right answer for HR (Topograph available) and EE (open data dump + free contract) and BE (€0.025/call KBO SOAP). The doctrine question becomes sharper for **BE's Moniteur Belge** (Path 8): gazette-style statutorily-published officer-change PDFs, no commercial alternative for HISTORICAL data, different operator from KBO. Worth a DEC-DB entry when historical-officer coverage becomes a customer requirement.

---

## HR — 8-path enumeration

Test entity: INA d.d. (OIB 27759560625, MBS ~080000014). Full partial: [_partial_hr_enumeration.md](_partial_hr_enumeration.md).

### Path 1 — Same vendor (Sudreg `sudreg-data.gov.hr/api/javni`), other endpoints

- **URLs probed:** full OpenAPI spec (458 552 bytes, HTTP 200) at `https://sudreg-data.gov.hr/api/javni/dokumentacija/open_api`; `/osobe`, `/subjekt_detalji`, `/funkcije_osoba`, `/v1/osobe` all HTTP 404; developer-guide PDF read in full.
- **All 39 endpoints enumerated:** `/bris_pravni_oblici`, `/bris_registri`, `/counts`, `/detalji_subjekta`, `/djelatnosti_podruznica`, `/drzave`, `/email_adrese`, `/email_adrese_podruznica`, `/evidencijske_djelatnosti`, `/gfi`, `/inozemni_registri`, `/jezici`, `/nacionalna_klasifikacija_djelatnosti`, `/nazivi_podruznica`, `/objave_priopcenja`, `/partneri_statusnih_postupaka`, `/postupci`, `/pravni_oblici`, `/predmeti_poslovanja`, `/pretezite_djelatnosti`, `/prijevodi_skracenih_tvrtki`, `/prijevodi_tvrtki`, `/promjene`, `/sjedista`, `/sjedista_podruznica`, `/skracene_tvrtke`, `/skraceni_nazivi_podruznica`, `/snapshots`, `/statusi`, `/statusni_postupci`, `/subjekti`, `/sudovi`, `/temeljni_kapitali`, `/tvrtke`, `/valute`, `/vrste_gfi_dokumenata`, `/vrste_postupaka`, `/vrste_pravnih_oblika`, `/vrste_statusnih_postupaka`.
- **`/detalji_subjekta` schema (all 4 sub-schemas identical):** 37 properties, none of `osobe / funkcije_osoba / ovlasti_osoba / clanovi_subjekta / uprava / zastupnici / predstavnici / direktori / prokuristi / likvidatori`.
- **Why dev-guide references to OSOBE/FUNKCIJE_OSOBA mislead:** those tables exist but only on the **state-bodies (`državno tijelo`) tier**, walled off behind manual eligibility review limited to Croatian government agencies. Strale cannot register as a state body.
- **Verdict: NOT VIABLE.** Phase 2 was correct that the public Sudreg API lacks officers; what Phase 2 missed was that this is by design (tier separation), not a temporary gap.
- **Cost:** free (for what it returns).

### Path 2 — Same vendor, authenticated free tier

- **Registration:** free at `https://sudreg-data.gov.hr/`; OAuth2 Client Credentials Flow against `/api/oauth/token`.
- **Tier selection is binding:** Javni korisnik vs Državno tijelo. State-bodies tier (officers) structurally unavailable to Strale.
- **Public-tier auth unlocks:** same 39 endpoints + higher rate limits (e.g. `detalji_subjekta` 6 req/min). No additional fields.
- **Verdict: NOT VIABLE** for officers.

### Path 3 — Other free aggregators

| Source | Verdict | Reason |
|---|---|---|
| OpenCorporates HR | NOT VIABLE | API requires subscription (£2,250+/yr); web view CAPTCHA-walled |
| OpenSanctions hr_companies | NOT VIABLE | Dataset doesn't exist (404); OS is screening-list primitive, not roster |
| Open Ownership / BODS | NOT VIABLE | FINA RSV (HR UBO) not published as BODS; no API |
| GLEIF Level 1+2 | NOT VIABLE | LEI records have no officer fields; Level 2 = entity-to-entity, not natural persons |
| data.europa.eu / org-id.guide | NOT VIABLE | All defer to Sudreg upstream (Path 1 already exhausted) |

### Path 4 — Per-call paid aggregators (no subscription)

- **Topograph HR — `https://docs.topograph.co/essentials/croatia.md`** (full doc fetched):
  - HR data sources: Sudreg + RGFI/FINA (explicit).
  - `legalRepresentatives` SKU returns: name, role (with AI-enriched English translations), OIB (when available), residence address. Supervisory board members classified as "other key persons".
  - Identifiers supported: MBS (required for retrieve), OIB / MB / EUID / VAT (search).
  - **Pricing model: pay-per-request, no bulk contracts, no minimum commitments.** Modes: `fixed` (declared up front) or `variable` (determined at request time).
  - HR per-call price: NOT publicly disclosed (magic-link gated). **RFQ required.**
  - **Verdict: VIABLE-V1 (pending RFQ + DEC-20260428-A vendor attestation).**
- **TransactionLink** — integrates Sudreg, exposes "directors and shareholders"; pricing fully RFQ-gated (Book-a-call wall). **Verdict: VIABLE-V1.1.**
- **Bisnode / D&B Croatia** — no public per-call API for HR; subscription-heavy historically. **NOT VIABLE-V1.**
- **Kyckr / Creditinfo / Cribis** — per-call broker pattern, historic ~£3–10/lookup; RFQ for HR. **VIABLE-V1.2 fallback.**
- **Schmidt & Schmidt / System Day** — document-broker (£138–180/report), not API, wrong price band. **NOT VIABLE.**

### Path 5 — Open data alternatives (data.gov.hr CKAN, FINA, SKDD)

- `data.gov.hr` CKAN `package_search?q=sudski+registar` → 3 results, all metadata-pointer to Path 1 API or narrow Zagreb/Sisak sports scope. No general HR officer CSV.
- **FINA RGFI** (financial statements) — no officers.
- **FINA RSV** (UBO register) — CJEU C-37/20 restricted to legitimate-interest; authentication via Croatian NIAS e-ID only. **Foreign API consumers structurally blocked.**
- **SKDD** — listed-company governance only (~30 entities); too narrow.
- **Verdict: NOT VIABLE.**

### Path 6 — Public web UI HTML / PDF (`sudreg.pravosudje.hr/registar`)

- Oracle APEX SPA at `https://sudreg.pravosudje.hr/ords/r/esudreg/public/1?clear=APP`. Free public Izvadak (extract) PDF generated by UI includes "Osobe ovlaštene za zastupanje" (directors, board, procurators with appointment/resignation dates) per statute (Zakon o sudskom registru — court register is "javna knjiga").
- **DEC-20260428-A scope question:** Statutorily public, no auth, but APEX SPA structure not optimized for automated retrieval and ToS reading is ambiguous. Per Tier 1 (absolute), Strale itself cannot operate a scraper here regardless of statutory basis. **Tier-2 vendors (Topograph) likely access via this UI — vendor attestation required.**
- **Verdict (pending Petter):** document-only; pursue via Tier-2 vendor (Path 4a Topograph) with explicit redistribution-rights attestation.

### Path 7 — BRIS cross-border

- `https://webgate.ec.europa.eu/e-justice/searchBris.do` → HTTP 307 redirect to sorry.ec.europa.eu (US-East egress blocked; portal accessible from EU). Assessment from e-Justice portal docs.
- BRIS returns lowest-common-denominator HR slice (name, legal form, reg number, address, status). **Directors NOT propagated through BRIS** — HR restricts that field at the gateway.
- No public REST API for third parties.
- **Verdict: NOT VIABLE.**

### Path 8 — Court / commercial register separate (Narodne Novine, HJK, court-side)

- **Narodne Novine (Croatian Official Gazette):** publishes "Upisi u sudski registar" notices including officer appointment/resignation, statutorily public, public-domain (Constitution). PDFs only; ELI-style URLs make per-issue ingest feasible. No structured API. Bulk parsing requires OCR + entity-resolution (narrative → MBS → canonical entity).
- **Croatian Notary Chamber (HJK):** no searchable index; per-notary records.
- **Court-side (5 commercial courts):** counter-only paper Izvadak.
- **Verdict: VIABLE-V1.5/V2 (Strale-built derivative dataset on PD content under DEC-20260428-B engineering bar).** Not v1 — engineering investment unjustified at current volume.

### HR synthesis

- **v1 path: Topograph (Path 4a)** — per-call, no subscription floor, officer coverage confirmed in docs, data-source disclosure clean (Sudreg + RGFI/FINA). **Required before v1 ship:** sign up; query `GET /v2/pricing?countryCode=HR` with auth to confirm HR per-call ≤ €0.20/call target.
- **v1.1 backup: TransactionLink (Path 4b)** — same upstream, RFQ-only pricing.
- **v1.5/v2: Narodne Novine ELI feed (Path 8a)** — Strale-built; appropriate when HR volume justifies engineering investment.
- **Truly blocked? NO.** Phase 2's "blocked" was premature.
- **DEC-20260428-A vendor attestation (must accompany Topograph onboarding):** Topograph must attest in writing whether their HR officer ingestion is via (a) Sudreg state-bodies API tier under a contract with the MoJ, or (b) automated retrieval against the public web UI under Court Register Act / ToS permission, and provide redistribution rights + indemnification per Tier 2.

---

## EE — 8-path enumeration

Test entity: Bolt Technology OÜ (registry code 12417834). Full partial: [_partial_ee_enumeration.md](_partial_ee_enumeration.md).

### Path 1 — Same vendor (RIK / Ariregister Open Data API), other endpoints

- **15 SOAP/XML services enumerated** at `https://ariregxmlv6.rik.ee/` (WSDL at `?wsdl`). Officer-bearing:
  - **`esindus_v1` (Rights of Representation)** — canonical officer endpoint. Returns name, personal ID code, country, DOB, role designation, exclusive representation flag, exceptions, legal form. Contract-gated, free.
  - **`detailandmed_v2` (Detailed Company Data)** — `kaardile_kantud_isikud` (Persons on Registry Card) with role classifications (ASES, KOAS, etc.), name, personal ID, country, address, representation rights. Contract-gated, free.
- **Free + no-contract endpoints:** `/api/autocomplete` (identity only, no officers — confirmed via direct curl, Bolt Technology returns reg_code/name/historical_names/legal_address only) + `/api/e-invoice-recipients`.
- **Verdict: VIABLE-V1.1 once contract signed (Path 2).**
- **Cost:** FREE.
- **Rate limits (post-contract):** 50,000 queries/day, 1 simultaneous query, 20 doc-downloads/min.

### Path 2 — Same vendor, authenticated free path (RIK contract)

- **Application URL:** https://ariregister.rik.ee/eng/contract/step1
- **Cost:** FREE — "When concluding the contract only for the use of the e-Business Register API services, the use of the services is free of charge."
- **Lead time:** 5 working days.
- **Process:** sign in via Estonian eID / Smart-ID / Mobile-ID (possibly eIDAS for foreign legal entities — not explicitly documented).
- **Endpoints unlocked:** all 14 contract-gated services including `esindus_v1` + `detailandmed_v2`.
- **Open question (must email `[email protected]`):** foreign-entity eligibility. Empirical evidence (third-party integrators in Ruby/Python, Latvian Lursoft IT reselling EE data) suggests foreign-friendly, but not explicit. Fallback: sign under Petter's e-Residency.
- **Verdict: VIABLE-V1.1.** Apply now in parallel with v1 shipping via Path 5.

### Path 3 — Other free aggregators

| Source | Verdict | Reason |
|---|---|---|
| OpenCorporates EE | NOT VIABLE | Subscription floor (£225/mo min); no per-call tier |
| OpenSanctions `ee_ariregister` | VIABLE-V1.1 (RFQ) | 2.4M+ entities, sourced from RIK, weekly refresh, FollowTheMoney JSON; commercial license RFQ-required |
| BODS / Open Ownership | NOT VIABLE | UBO ≠ directors; wrong primitive |
| GLEIF Level 2 | NOT VIABLE | 28,624 EE LEI records but no officer fields |
| Companies-API | NOT VIABLE | Resells OC/OS or scrapes; not primary |

### Path 4 — Per-call paid aggregators (no subscription)

- **Inforegister.ee** — Estonian commercial KYB aggregator. Public profile for Bolt confirms board (Markus Villig, Ahto Kink) + Council (Martin Villig chair + 7 others) without login. REST API documented with "board members" data. **Pricing: NOT public (RFQ via info@ir.ee / +372 744 6644).** **Verdict: VIABLE-V1.1 (RFQ).**
- **Creditinfo Estonia (Krediidiinfo)** — Baltic specialist; RFQ. **Verdict: VIABLE-V1.1 (RFQ).**
- **Bisnode Estonia** — subscription-only historically. **NOT VIABLE.**
- **Krediidiraport.ee** — credit-report broker; API not investigated; RFQ.
- **Lursoft Estonia** (Latvian aggregator with EE coverage) — subscription.

### Path 5 — Open data alternatives (downloadable files)

- **Endpoint catalog:** `https://avaandmed.ariregister.rik.ee/en/downloading-open-data` — 11 files enumerated, all CC BY 4.0, refreshed daily.
- **Officer-bearing file:** `ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip` (JSON ZIP) — board members, directors, representation roles.
- **Live verification (2026-05-18 15:32 UTC):** HEAD probe HTTP 200, `Content-Length: 45219974` (45 MB), `Last-Modified: Mon, 18 May 2026 10:37:59 GMT` — refreshed today.
- **Caveat:** since 2024-11-01, personal identification codes are **redacted** from open-data files (data-protection). Names + roles + entry dates remain.
- **Verdict: VIABLE-V1 — STRONG.** Daily-refreshed, CC BY 4.0, no auth, no rate limits, includes board composition.

**Trade-offs Path 5 vs Path 2:**

| | Path 5 (bulk file) | Path 2 (API contract) |
|---|---|---|
| Auth | None | API credentials |
| Lead time | Zero | 5 working days |
| Freshness | Daily (≤24h stale) | Real-time |
| Per-call latency | DB lookup ~10ms | SOAP ~500–2000ms |
| Personal ID code | Redacted (post-Nov 2024) | Available |
| Operational complexity | Daily ingest job + storage + dedupe | Per-request SOAP client |
| Volume cost | Linear in EE corpus (~2.4M entities) | Metered (50k/day cap) |

### Path 6 — Public web UI HTML / PDF

- `https://ariregister.rik.ee/eng/company/12417834/Bolt-Technology` — HTTP 200, 733,621 bytes; confirmed contains "Markus Villig", "Ahto Kink", "Martin Villig", management/supervisory board roles without authentication.
- Statutory basis: Estonian Commercial Code §§ 22, 145.
- **DEC-20260428-A:** the official registry's own public web UI, but Tier 1 is absolute — Strale cannot operate a scraper here even against a government UI. Path 5 + Path 2 accomplish the same access without scraping.
- **Verdict: data-availability evidence; NOT pursued under Tier 1.**

### Path 7 — BRIS cross-border

- `https://webgate.ec.europa.eu/e-justice/searchBris.do` → redirected to sorry.ec.europa.eu during US-East probe.
- Per portal docs: returns name, legal form, registered office, registration number, EUID, status — **no officers**.
- No public REST API. (Open BRIS at `https://openbris.eu/api/v1` is a third-party reimplementation covering SK/CZ/FR/EE/PL/AT but for autocomplete + IBAN, not officer enumeration.)
- **Verdict: NOT VIABLE.**

### Path 8 — Court / commercial register separate (annual reports, Ametlikud Teadaanded, notary)

- **Annual reports (Commercial Code § 145, statutorily public):** accessible via Path 1 contract-gated `aastaaruannete_nimekiri` + `aastaaruanne`, and via Path 6 public web. Reports include board composition narrative but unstructured. Not a clean officer-enumeration path.
- **Ametlikud Teadaanded** (`https://www.ametlikudteadaanded.ee/`) — official gazette; division/dissolution/officer-change announcements. Free public, URI-based search, HTML/XML/XML-RDF. Event stream, not authoritative officer list. Useful as future delta-stream signal.
- **Notary records:** notarised but not public bulk.
- **Verdict: NOT VIABLE for v1.**

### EE synthesis

- **v1 path: Path 5 (open data bulk JSON)** — `ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip`, 45 MB daily, CC BY 4.0, no auth.
  - Architecture: nightly ingest job → Postgres table → `ee-directors` capability at ~10ms lookup.
  - DEC-20260428-A clean (direct first-party government open data, no Strale-operated scraping).
  - DEC-20260428-B passes (versioned snapshots, replayable, dispute endpoint already exists).
- **v1.1 path: Path 2 (RIK API contract)** — initiate today in parallel; 5-day clock. Once approved, swap to real-time SOAP against `esindus_v1` / `detailandmed_v2`. Resolves personal-ID-code redaction if needed.
- **v1.2 backup: Inforegister.ee RFQ** — commercial fallback if hosted alternative wanted.
- **Truly blocked? NO.** Phase 3's "5-day contract required" classification missed the no-contract no-lead-time open-data path entirely.
- **DEC-20260428-A scope question:** None — clean Tier 1.

---

## BE — 8-path enumeration

Test entities: BNP Paribas Fortis (KBO 0403199702) and AB InBev (0417497106). Full partial: [_partial_be_enumeration.md](_partial_be_enumeration.md).

> Note on test entity: the prompt cited "Solvay S.A. (KBO 0403199702)" but 0403199702 in fact resolves to BNP Paribas Fortis. AB InBev (0417497106) was used as a backup and confirms identical data shape (15 officers publicly listed). The structural finding is entity-independent.

### Path 1 — Same vendor, other endpoints

#### 1a. cbeapi.be (free aggregator)
- `https://cbeapi.be` family — 403 from WebFetch (CDN bot block; site functional in browser per search snippets).
- Per indexed docs ("CBE/BCE/KBO API Documentation"): advertises **"officer details including directors and managers"** with **"all the official functions registered for this enterprise (board of directors)"** via free tier (2,500 req/day with account API key).
- **This directly contradicts Phase 3's "cbeapi.be has no officers field"** — Phase 3 may have been looking at the v1 schema; current 2026 docs claim officer support.
- **Verdict: PROMISING — needs hands-on browser verification.** If confirmed, this is the v1 win at zero cost.

#### 1b. crossroadsbankenterprises.com (paid REST wrapper, v2)
- Full v2 doc fetched at `https://crossroadsbankenterprises.com/documentation/v2`.
- **Officer endpoint confirmed:** `GET /enterprise/{enterpriseNumber}/roles` → returns `nameFirst`, `nameLast`, `dateInOffice`, `Role.roleCode`, `Role.title` (nl/en/fr/de).
- **Pricing: monthly subscription** with tiered plans. `roles` endpoint requires "Large plan or up." No per-call PAYG option.
- **Verdict: NOT VIABLE** (subscription violates v1 cost discipline).

#### 1c. KBO Public Search Web Service (official SOAP)
- WSDL endpoint (per FPS docs R018.00): `http://kbopub.economie.fgov.be/kbopubws180000/services/wsKBOPub?wsdl`
- Operations include `ReadEnterpriseRequest` + `ReadEnterpriseByPhonemeRequest`. Same backend as the public KBO HTML — the "Functies / Fonctions" section of the HTML (Path 6) IS populated, so SOAP exposes the same fields via `ReadEnterprise`.
- **Pricing re-verified (the decisive correction):** FPS Economy's exact wording on `https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-public-search-web-service`:
  > "An account will be created for you. The account allows you to test the web service free of charge."
  > "Each package entitles you to 2,000 requests (i.e. searches or retrievals) and costs 50 euro."
  > "You can order packages [...]. Upon receipt of your payment the requested packages will be activated within 7 working days."
- **Classification:** activation fee NONE; monthly subscription NONE; **prepaid topup YES — €50 buys 2,000 requests, prepaid, no expiry/recurrence**; effective rate **€0.025/call**.
- **This is a prepaid topup, NOT a subscription.** Petter's cost directive: "Per-call costs OK if passed through. If KBO SOAP is effectively €0.025/call with a low one-time activation fee, this likely qualifies." It qualifies.
- **Verdict: VIABLE-V1 PRIMARY.**
- **Procurement friction:** 7 working-day activation after wire transfer; one-time setup.

### Path 2 — Same vendor, authenticated free path

- KBO Open Data registration (`https://kbopub.economie.fgov.be/kbo-open-data/login`) grants the bulk CSV (Path 5). No new authenticated tier exposing officers beyond Path 1a / Path 5.
- **Verdict: NOT a new path.**

### Path 3 — Other free aggregators

| Source | Verdict | Reason |
|---|---|---|
| OpenCorporates BE | NOT VIABLE-V1 | CAPTCHA / 401 API; commercial tier typically subscription |
| OpenSanctions | NOT APPLICABLE | Sanctions/PEP primitive, not officer registry |
| BODS / Open Ownership | NOT VIABLE | Belgium not in BODS; BE UBO Register non-public since Feb 2023 post-ECJ C-37/20 |
| GLEIF Level 2 | NOT VIABLE | No officer fields |
| Companies-API | NOT VIABLE | Shallow BE officer coverage |

### Path 4 — Per-call paid aggregators (no subscription)

| Source | Pricing | Verdict |
|---|---|---|
| **Openapi.com Company Start Belgium** | **€0.06+VAT/call PAYG** (also subscription option) | **VIABLE-V1.1 backup** — pending verification that "Start" tier includes roles (typically Start = basic only; roles usually in "Advanced"/"Full") |
| data.be (Signicat partner) | Tiered, likely subscription | Probably not viable; direct contact needed |
| Graydon Belgium | Enterprise subscription | NOT VIABLE |
| Companyweb.be | Subscription | NOT VIABLE |
| Creditsafe Belgium | Enterprise contract | NOT VIABLE |
| OpenTheBox | Likely subscription | NOT VIABLE |
| Pappers (extended to BE) | PAYG ~€0.10–0.30/call (FR model) | WORTH FOLLOW-UP for v1.1 |
| Bisnode / Cribis / Trends Top | Enterprise | NOT VIABLE |

### Path 5 — Open data alternatives

- **KBO Open Data CSV (definitive 8-file list):** `meta.csv`, `code.csv` (function-code legend only — NOT person mappings), `enterprise.csv`, `establishment.csv`, `denomination.csv`, `address.csv`, `contact.csv`, `activity.csv`. **No file contains person-level officer/director/function/mandataris/bestuurder data.** Phase 3's classification CORRECT on this specific point.
- **VKBO (Flanders enriched)** — only address/geo collection, no officers.
- **NBB Authentic Data Daily Extract** — free; XBRL filings for full-format filers include `mandatesAndFunctions*` taxonomy elements (directors named in annual accounts). Only full-format filers; annual cadence; per-filing not entity-state. **Verdict: SUPPLEMENTARY** — useful cross-check for KBO-returned data, not primary.
- **data.gov.be CKAN** — no separate officer dataset beyond KBO Open Data + VKBO.

### Path 6 — Public web UI HTML

- `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer={kbo}` — confirmed live for 0403199702 (17 directors) and 0417497106 (15 directors).
- Sample for AB InBev: "Bestuurder Lynne Biggar — Sinds 26 april 2023", "Bestuurder Martha Burns — Sinds 24 april 2024", "Bestuurder Paulo Lemann — Sinds 24 april 2024".
- **No authentication, no captcha, no documented rate limit.** URL parameter scheme is stable + indexable.
- **DEC-20260428-A:** Tier 1 blocks Strale-operated scraping regardless of statutory public-record status. Same operator (FPS Economy) sells KBO SOAP at €0.025/call (Path 1c); scraping their HTML when their own API exists at €0.025 is the abusive pattern the doctrine forbids.
- **Verdict: NOT VIABLE under DEC-20260428-A.** Use Path 1c.

### Path 7 — BRIS cross-border

- E-justice URLs probed; web-only, no public API.
- For BE, BRIS reflects what KBO Public Search exposes — devolves to Path 1c.
- **Verdict: NOT VIABLE as distinct path.**

### Path 8 — Court / commercial register (Moniteur Belge)

- `https://www.ejustice.just.fgov.be/cgi_tsv/list.pl?language=fr&btw={kbo}` — **probed successfully** for 0403199702, **981 publications** dating back through 2019–2026.
- Query parameters: `btw` (10-digit KBO with leading zero), `view_numac` (unique-per-publication NUMAC), `language`, `lg_txt`, `caller`.
- **DEMISSIONS/NOMINATIONS** entries contain all officer changes since 2003, statutorily published per **Belgian Code of Companies and Associations art. 2:8 + 2:14** (publication obligation in the Moniteur).
- **No authentication, no captcha, no documented rate limit.**
- **Structural property:** time-series log of changes (not current-state). Building current-state list = replay all DEMISSIONS+NOMINATIONS since first publication, fold the diff. Body is PDF (older = scanned images needing OCR; newer = structured PDF needing text-extract + NER).
- **DEC-20260428-A scope question — sharpest in this enumeration:** gazette-style statutory publications. Different operator from KBO (FPS Justice vs FPS Economy); no SOAP equivalent. The doctrine's case-law anchors (Meta v. Bright Data, hiQ v. LinkedIn) addressed contested-private-data, **not public-record gazettes**. Worth a DEC-DB entry deciding whether Tier 1 covers gazette-style publications when no commercial alternative for HISTORICAL data exists.
- **Verdict: STRUCTURALLY VIABLE but doctrine-blocked under Tier 1 absent Petter interpretation.** Tier-2 vendors with Moniteur licensing exist (LexGo, Lexalert, Strada legal-tech BE) — pricing enterprise.

### BE synthesis

- **v1 path: KBO Public Search SOAP (Path 1c)** at €0.025/call prepaid. Same upstream that runs the open data + the public HTML; returns same Functies data the KBO HTML displays. One-time procurement: €50 wire + 7 working-day activation, no recurring commitment.
- **v1.1 path: cbeapi.be (Path 1a)** if 2026 docs verify against actual API response (browser verification needed). Zero cost.
- **v1.1 backup: Openapi.com Company Start Belgium PAYG** at €0.06+VAT/call, pending verification "Start" tier includes roles.
- **Supplementary: NBB XBRL** for officer cross-validation against annual accounts.
- **Phase 3 corrections:**
  - "KBO SOAP costs €50/2k → blocked" — number right, classification wrong; prepaid topup is per-call equivalent, passthrough-compatible.
  - "cbeapi.be has no officers" — likely wrong against current 2026 docs; needs browser verification.
  - "Moniteur Belge not investigated" — confirmed structurally rich, doctrine-blocked under Tier 1 absent Petter interpretation.

---

## Cross-country observations

### BRIS coverage findings

BRIS is not a useful officer-data source for any of the three jurisdictions. Confirmed via partial probes (sorry.ec.europa.eu from US-East egress) + e-Justice portal documentation:
- HR — directors NOT propagated; only basic identity at the BRIS gateway.
- EE — entity-discovery only (name / legal form / EUID / address); no officers.
- BE — devolves to KBO Public Search backend.
- No public REST API for any. BRIS is a web UI portal.

**Implication:** BRIS can be deprioritized as a v1 path for any jurisdiction. Useful for `EUID` cross-referencing at most.

### OpenCorporates / OpenSanctions / BODS coverage

- **OpenCorporates:** has HR/EE/BE coverage but API is subscription-only (£2,250+/yr min) — disqualified under v1 cost discipline for all three. Would be a v2 consideration if Strale ever buys a global aggregator.
- **OpenSanctions:** screening-list primitive, not officer-roster. Only the `ee_ariregister` dataset (2.4M EE entities, sourced from RIK, FollowTheMoney JSON) is a proper roster product — viable v1.1 fallback for EE under RFQ commercial license.
- **BODS / Open Ownership:** UBO primitive, not directors. BE not in BODS (UBO non-public post-ECJ); HR UBO not published as BODS; EE UBO published but ≠ officers.
- **GLEIF Level 1+2:** zero officer coverage across all three. Right primitive for corporate-parent mapping, wrong for natural-person directors.

### DEC-20260428-A scope question summary

Three doctrine-blocked Path 6 / Path 8 options surfaced. For Petter's interpretation:

| Country | Doctrine-blocked path | Why blocked | Alternative available? |
|---|---|---|---|
| HR | Path 6 (Sudreg public web UI) | Tier 1 absolute; statutorily public but APEX SPA + ambiguous ToS | YES — Topograph (Tier 2 with attestation) |
| EE | Path 6 (RIK web profile) | Tier 1 absolute; official government UI | YES — Path 5 bulk dump (clean Tier 1) + Path 2 contract |
| BE | Path 6 (kbopub HTML) | Tier 1 absolute; same operator runs SOAP at €0.025/call | YES — Path 1c KBO SOAP |
| **BE** | **Path 8 (Moniteur Belge)** | **Tier 1 absolute; gazette-style statutory publications, NO commercial alternative for HISTORICAL data, different operator from KBO** | **NO — sharpest scope question** |

**Recommendation:** No Tier 1 interpretation change needed for HR / EE / BE v1 — all three have viable alternatives. **BE Moniteur Belge is the only true scope question** and only matters when HISTORICAL officer-change data becomes a customer requirement. Defer the doctrine question to its own DEC-DB entry at that time.

---

## Recommendations for chat-side action

| Country | v1 decision | Immediate action | Parallel actions |
|---|---|---|---|
| **HR** | Build against Topograph (per-call API) | Sign up to Topograph; query `/v2/pricing?countryCode=HR` to confirm HR per-call price ≤ €0.20 target; request DEC-20260428-A vendor attestation (sourcing route + redistribution rights + indemnification) | RFQ TransactionLink as v1.1 backup; defer Narodne Novine ELI feed to v1.5/v2 |
| **EE** | Build against RIK Open Data bulk JSON (`kaardile_kantud_isikud.json.zip`) | Implement nightly ingest job → Postgres → `ee-directors` capability at €0.02 (covers ingest amortised + margin); document PIDs-redacted-since-Nov-2024 caveat in capability output | Apply for RIK API contract at `https://ariregister.rik.ee/eng/contract/step1` today (5-day clock; free; v1.1 upgrade for non-redacted PIDs + real-time); email `[email protected]` re foreign-applicant eligibility |
| **BE** | Build against KBO SOAP at €0.025/call prepaid | Initiate KBO SOAP procurement: account creation + €50 wire (7-day activation); plan SOAP client implementation | Browser-verify cbeapi.be 2026 schema for officers (if confirmed = zero-cost v1.1 PRIMARY); contact Openapi.com to verify "Start" tier includes roles |

**DEC-20260428-A clarification request to Petter:** No urgent doctrine question for v1. The one to schedule for when historical-officer coverage matters: **Are gazette-style statutorily-published officer-change PDFs (e.g. Belgian Moniteur Belge `cgi_tsv` entries) inside or outside Tier 1's absolute "Strale never scrapes" prohibition, given the doctrine's case-law anchors addressed contested-private-data rather than public-record gazettes?** Worth its own DEC entry separate from this enumeration.

**Phase 3 to-do updates:**
- HR Class C `36467c87-082c-8172-a15f-db57c045bb0a` — close; replace with "Topograph HR onboarding + DEC-20260428-A vendor attestation"
- EE RIK contract `36467c87-082c-812c-b60d-dceca91f645f` — keep open (v1.1 upgrade); add v1 task "EE Open Data nightly ingest job"
- BE paid-vendor-onboarding `36467c87-082c-8116-8a67-e03462235a24` — close; replace with "KBO SOAP procurement (€50 prepaid topup, 7-day activation)"

**Memory entry 25 update:** Realistic v1 launch coverage now includes HR + EE + BE alongside the previously-viable EU/UK set. Phase 2/3 "blocked" classifications were premature; DEC-20260518-E is now the applied doctrine for any future "blocked" decision.

---

## Stop-condition compliance

- ✅ All 24 path investigations (3 countries × 8 paths) documented with evidence per path.
- ✅ No path skipped without explicit evidence-based reasoning.
- ✅ Final recommendation per country with cost / latency / risk.
- ✅ DEC-20260428-A scope question articulated for Petter (BE Moniteur Belge as the live one; HR/EE/BE Path 6 resolved by alternatives).

## Caveats logged

- HR Topograph per-call price not directly observable (magic-link email wall + 401 unauthenticated). Treated as "RFQ-required, viable pending price confirmation."
- BRIS probes returned 307→sorry.ec.europa.eu from US-East egress; assessment grounded in e-Justice portal documentation rather than direct probe.
- cbeapi.be (BE Path 1a) WebFetch-blocked by CDN; finding rests on search-indexed docs snippet — needs hands-on browser verification before v1.1 commit.
- KBO SOAP WSDL not retrievable from this session (versioned R018.00 path; eventual endpoint via cookbook). SOAP operation `ReadEnterprise` officer fields inferred from KBO HTML parity rather than direct WSDL inspection.
- EE foreign-applicant eligibility for RIK API contract not explicitly documented; fallback identified (Petter e-Residency).
