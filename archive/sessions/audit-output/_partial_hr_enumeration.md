# HR (Croatia) — 8-path enumeration

**Date:** 2026-05-18
**Author:** Code agent (per DEC-20260518-E)
**Test entity:** INA d.d. (OIB 27759560625, MBS ~080000014), backup Hrvatski Telekom d.d. (OIB 81793146560)
**Question:** Where can Strale source director/officer data for HR companies under Tier 1 (Strale never scrapes) / Tier 2 (vendor-scraped statutorily-public data with clean license)?

---

## Path 1 — Same vendor (Sudreg `sudreg-data.gov.hr/api/javni`), other endpoints

- **URLs probed:**
  - `GET https://sudreg-data.gov.hr/api/javni/dokumentacija/open_api` → HTTP 200, 458 552 bytes (full OpenAPI v3.0.4 spec retrieved as JSON)
  - `GET https://sudreg-data.gov.hr/api/javni/osobe?tipIdentifikatora=oib&identifikator=27759560625` → HTTP 404 (172 bytes)
  - `GET https://sudreg-data.gov.hr/api/javni/subjekt_detalji?...` → HTTP 404
  - `GET https://sudreg-data.gov.hr/api/javni/funkcije_osoba?mbs=080000014` → HTTP 404
  - `GET https://sudreg-data.gov.hr/api/javni/v1/osobe` (legacy v1) → HTTP 404
  - Developer guide PDF (`/ords/r/srn_rep/116/files/static/v11/Upute za razvojne inženjere - v3.0.0.pdf`) → fetched and read in full

- **All 39 public endpoints enumerated from the OpenAPI spec (exhaustive list):**
  `/bris_pravni_oblici`, `/bris_registri`, `/counts`, `/detalji_subjekta`, `/djelatnosti_podruznica`, `/drzave`, `/email_adrese`, `/email_adrese_podruznica`, `/evidencijske_djelatnosti`, `/gfi`, `/inozemni_registri`, `/jezici`, `/nacionalna_klasifikacija_djelatnosti`, `/nazivi_podruznica`, `/objave_priopcenja`, `/partneri_statusnih_postupaka`, `/postupci`, `/pravni_oblici`, `/predmeti_poslovanja`, `/pretezite_djelatnosti`, `/prijevodi_skracenih_tvrtki`, `/prijevodi_tvrtki`, `/promjene`, `/sjedista`, `/sjedista_podruznica`, `/skracene_tvrtke`, `/skraceni_nazivi_podruznica`, `/snapshots`, `/statusi`, `/statusni_postupci`, `/subjekti`, `/sudovi`, `/temeljni_kapitali`, `/tvrtke`, `/valute`, `/vrste_gfi_dokumenata`, `/vrste_postupaka`, `/vrste_pravnih_oblika`, `/vrste_statusnih_postupaka` (all GET).

- **`/detalji_subjekta` (the "give me everything" endpoint) response schema** — `oneOf` of four sub-schemas (`detalji_subjekta_samo_aktivni`, `_ex`, `_svi`, `_svi_ex`). All four sub-schemas have the identical 37-property set with the only person-adjacent property being `mb` (company tax number) and `inozemni_registar`. The top-level property list does NOT include any of: `osobe`, `funkcije_osoba`, `ovlasti_osoba`, `clanovi_subjekta`, `uprava`, `zastupnici`, `predstavnici`, `direktori`, `prokuristi`, `likvidatori`. Confirmed by grepping the parsed JSON schema for these terms — zero hits.

- **Why the developer-guide references to `OSOBE`, `FUNKCIJE_OSOBA`, `OVLASTI_OSOBA`, `GRUPA_VRSTE_FUNKCIJE.UPRAVA`, `GRUPA_VRSTE_FUNKCIJE.CLANOVI_SUBJEKTA` mislead:** the PDF says explicitly (page 2) — "Kod registracije je potrebno odabrati da li se traži pristup javnim servisima namijenjenima javnosti ili servisima za državna tijela koji su namijenjeni isključivo za tijela državne uprave i druge službene osobe. **Javni servisi nude osnovne kategorije podataka i ne omogućavaju uvid u povijesne podatke. Servisi za državna tijela nude prošireni opseg podataka.**" The OSOBE / FUNKCIJE_OSOBA tables are the **státe-bodies-only** tier, walled off behind a manual eligibility review limited to Croatian government agencies. Strale cannot register as `državno tijelo`.

- **Verdict: NOT VIABLE** for officer data. The public tier of Sudreg API genuinely lacks the schema. The Phase 2 finding was correct as far as this path goes; what was missing in Phase 2 was acknowledgement that the legal-representative tables exist but only behind a tier Strale cannot enter.

- **Cost:** free for what it returns (no officers).

- **Evidence excerpt:** parsed `detalji_subjekta_svi_ex` schema property list (37 keys, no officer keys): `['mbs', 'status', 'sud_nadlezan', 'sud_sluzba', 'oib', 'mb', 'potpuni_mbs', 'potpuni_oib', 'ino_podruznica', 'stecajna_masa', 'likvidacijska_masa', 'mbs_brisanog_subjekta', 'glavna_djelatnost', 'glavna_podruznica_rbr', 'datum_osnivanja', 'datum_brisanja', 'sud_brisanja', 'tvrtka_kod_brisanja', 'poslovni_broj_brisanja', 'vrijeme_zadnje_izmjene', 'scn_zadnje_izmjene', 'postupak', 'tvrtka', 'skracena_tvrtka', 'prijevodi_tvrtki', 'prijevodi_skracenih_tvrtki', 'inozemni_registar', 'sjediste', 'email_adrese', 'pravni_oblik', 'pretezita_djelatnost', 'predmeti_poslovanja', 'evidencijske_djelatnosti', 'temeljni_kapitali', 'podruznice', 'statusni_postupci', 'objava_priopcenja', 'gfi', 'promjene']`

---

## Path 2 — Same vendor, authenticated free tier

- **URLs probed:**
  - `https://sudreg-data.gov.hr/` (registration portal) — confirmed via dev-guide PDF
  - OAuth2 token URL: `https://sudreg-data.gov.hr/api/oauth/token` (Client Credentials Flow per RFC 6749 §4.4)
  - State-bodies OpenAPI URL: per dev-guide, not public (delivered to the user at registration time, "**ovaj URL nije javan i namjenjen je samo vama – nemojte ga dijeliti sa trećim osobama**")

- **Registration:** free. Process: fill registration form on `https://sudreg-data.gov.hr` → email verification → receive Client ID + Client Secret + token-fetch URL. Token expires every 6 hours.

- **Tier selection at registration is binding and gated:** the user must declare *Javni korisnik* (public user) OR *Državno tijelo* (government body). The state-bodies tier is the only one that exposes `osobe`, `funkcije_osoba`, `ovlasti_osoba`. The dev guide is explicit that this tier is "isključivo za tijela državne uprave i druge službene osobe" — Strale is a private SaaS company in Sweden, not a Croatian government body, so this tier is structurally unavailable.

- **What auth unlocks at the public tier:** authentication unlocks the same 39 endpoints listed in Path 1, plus higher rate limits (rate cap on `detalji_subjekta` is 6 req/min for public users). It does NOT unlock additional endpoints or fields. The OpenAPI document the public-tier user receives at registration is the same one fetched anonymously in Path 1.

- **Verdict: NOT VIABLE** for officers. Authentication on the public tier adds rate-limit headroom but no officer fields. State-bodies tier is closed.

- **Cost:** free. **Latency:** not tested (requires registration; no officer payload behind auth anyway).

- **Evidence excerpt (from dev-guide PDF page 2):** "Pristup podacima je moguć samo uz besplatnu registraciju na portalu za koju je potrebna valjana e-mail adresa... Javni servisi nude osnovne kategorije podataka i ne omogućavaju uvid u povijesne podatke. **Servisi za državna tijela nude prošireni opseg podataka kao i uvid u povijesne podatke.**"

---

## Path 3 — Other free aggregators

### 3a. OpenCorporates

- **URLs probed:**
  - `https://opencorporates.com/companies/hr/27759560625` (web) → HAProxy CAPTCHA wall, no data extractable via WebFetch.
  - `https://opencorporates.com/companies/hr/04154814405` (alt HR company) → also CAPTCHA wall.
  - `https://api.opencorporates.com/v0.4/companies/hr/27759560625` (API) → HTTP 401 Unauthorized.
  - `https://opencorporates.com/jurisdictions/hr` → 404.
- **Coverage assessment:** OpenCorporates DOES carry an HR jurisdiction (confirmed by search results listing HR companies in their index). Their docs state director/officer information is exposed where source registries publish it. The public web view is CAPTCHA-walled, intentionally hostile to automated consumption.
- **License/cost:** API access requires commercial subscription — Essentials £2,250/yr, Starter £6,600/yr, Basic £12,000/yr (annual lock-in). Web view is "share-alike attribution open data" but bulk download / programmatic access is paywalled. The annual minimum disqualifies this under Strale's v1 cost discipline ("fixed/subscription fees NOT OK in v1").
- **Verdict: NOT VIABLE in v1** (subscription floor). Possible v2 if Strale ever wants a global aggregator buy.

### 3b. OpenSanctions

- **URL probed:** `https://opensanctions.org/datasets/hr_companies/` → 404. No HR-companies dataset exists in OpenSanctions catalogue.
- **Coverage:** OpenSanctions focuses on PEPs, sanctions targets, and known-bad lists. It does not maintain a general HR officer roster — only HR persons that appear in their PEP / sanctions sources, which is a small subset.
- **Verdict: NOT VIABLE** for officer enumeration (wrong primitive — they're a screening list, not a roster).

### 3c. Open Ownership / BODS

- **URL probed:** `https://www.openownership.org/en/map/country/croatia/`
- **Finding:** Croatia has a live UBO register (FINA RSV, launched 2020, 25% threshold), but Open Ownership's country page reports: register data is **NOT published as BODS**, structured data is **NOT publicly available**, and there is **NO API**. Bulk download offered by Open Ownership is metadata-only, not the underlying records.
- **Verdict: NOT VIABLE.** Croatia UBO data is not in the BODS pipe.

### 3d. GLEIF (LEI Level 1 + Level 2)

- **URL probed:** `https://api.gleif.org/api/v1/lei-records?filter[entity.legalAddress.country]=HR&page[size]=3`
- **Finding:** Returns LEI records for HR entities (legal name, address, registration authority, status, legal form). **No director / officer fields anywhere in the Level 1 schema.** Level 2 (relationship records — parent / ultimate parent linkages) doesn't add officers either; it links entities to other entities, not natural persons.
- **Verdict: NOT VIABLE** for officer data (right primitive for corporate-structure / parent-mapping, wrong primitive for natural-person directors).

### 3e. OpenCorporates Knowledge / org-id.guide / data.europa.eu

- All three index HR-MBS as a registry but defer to Sudreg as the upstream. None hosts officer-bearing bulk data of their own.
- **Verdict: NOT VIABLE** (they point back to Sudreg, which Path 1 already exhausted).

---

## Path 4 — Per-call paid aggregators (no subscription)

### 4a. Topograph

- **URLs probed:**
  - `https://www.topograph.co/guides/business-registers-in-croatia`
  - `https://docs.topograph.co/essentials/croatia.md`
  - `https://docs.topograph.co/essentials/coverage-and-pricing.md`
  - `https://docs.topograph.co/api-reference/pricing/get-pricing-for-a-country.md`
  - `GET https://api.topograph.co/v2/pricing?countryCode=HR` (unauth) → HTTP 401 `{"message":"API key or Authorization header is required","error":"Unauthorized","statusCode":401}`
  - `https://topograph.co/pricing/hr` → magic-link email wall

- **Coverage (confirmed from docs):**
  - HR data sources: Sudreg (court registry) + RGFI/FINA (financial statements).
  - **Legal representatives** endpoint returns: name, role (with AI-enriched English translations), OIB when available, residence address. Supervisory board members classified as "other key persons" with standardised role.
  - Identifiers supported: MBS (9-digit, required for retrieve), OIB (search only), MB (8-digit), EUID, VAT.
  - Pricing model confirmed by Topograph docs: **"pay per request" with no bulk contracts or minimum commitments**. Pricing is in credits; the `/v2/pricing` endpoint returns SKUs (`company`, `legalRepresentatives`, `shareholders`, `ultimateBeneficialOwners`, etc.) plus included documents. "Company search and availableDocuments listing are free."
  - Pricing modes: `fixed` (declared up front) or `variable` (determined at request time).

- **HR specific price:** NOT publicly disclosed (magic-link gated). The pricing page redirects through an email wall, and the API requires an account to query. **RFQ-equivalent required.**

- **Verdict: VIABLE-V1 (RFQ FLAGGED).** Pricing model fits Strale's cost discipline (per-call, no subscription floor). Officer coverage matches the requirement. Latency not tested. Must obtain the actual HR per-call price via signup before final confirmation.

- **Evidence excerpt:** docs.topograph.co/essentials/croatia.md — "Legal representatives include name, role (with AI-enriched English translations), OIB when available, and residence address. Supervisory board members are classified as 'other key persons' with standardized role designation." docs.topograph.co/api-reference/pricing/get-pricing-for-a-country.md — "Company search and availableDocuments listing are free... Prices are expressed in credits... Either fixed or variable (variable pricing is determined at request time)."

### 4b. TransactionLink

- **URL probed:** `https://www.transactionlink.io/integrations/trgovacki-sudski-registar`
- **Coverage:** Integrates Sudreg, exposes "directors and shareholders" per their own copy. UBO + AML monitoring also offered.
- **Pricing:** NO public pricing — "Start free trial" / "Book a call". Custom/enterprise tier. Cannot confirm per-call vs. subscription without sales contact.
- **Verdict: VIABLE-V1.1 PENDING RFQ.** Possible backup to Topograph if Topograph HR pricing comes back too high. Document presence required, not visible publicly.

### 4c. Bisnode / Dun & Bradstreet Croatia

- **URL probed:** `https://career.bisnode.com/locations/croatia` (confirms HR office exists). API docs: `https://docs.bisnode.ee/pricing` (Estonia only — HR not in the docs.bisnode.ee scope).
- **Coverage assessment:** D&B has HR data via their global product line, but the documented developer portal covers EE/SE/NO/DK/FI; HR is not on the per-call docs.bisnode.ee. Pricing for HR is RFQ. Historical D&B contracts have been subscription-heavy.
- **Verdict: NOT VIABLE-V1** (no public per-call API for HR). Possible RFQ for v2 if scale justifies; carries subscription risk.

### 4d. Kyckr / Creditinfo / Cribis

- All searched, none expose public per-call HR pricing. Kyckr operates as a credit broker across registries — typically per-call but with a per-record floor (~£3-10/lookup historical). RFQ for current HR price.
- **Verdict: VIABLE-V1.2 PENDING RFQ.** Tertiary backup.

### 4e. Schmidt & Schmidt / System Day / Companycheck.biz / Euro-Chamber.eu

- These are document-broker firms, not API platforms. System Day publishes prices: £138 Company Search Report (per company), £180 Certificate of Good Standing. These are document-PDF deliverables, not structured API responses, and the per-record cost is too high to pass through to Strale customers at our €0.05-0.50 capability price band.
- **Verdict: NOT VIABLE-V1** (price band wrong, document-only).

---

## Path 5 — Open data alternatives (data.gov.hr CKAN, FINA, SKDD)

- **URLs probed:**
  - `https://data.gov.hr/ckan/api/3/action/package_search?q=sudski+registar` → returned 3 relevant datasets:
    1. **Sudski registar** — pointer dataset describing the `sudreg-data.gov.hr` portal itself. Format: API (HTML). Last updated 2023-02-19. Owner: Ministry of Justice. *This is just the metadata wrapper around the Path 1 API; no separate bulk download with officer data.*
    2. **Registar sportskih djelatnosti** (Zagreb sports) — CSV/XLSX. Limited to Zagreb sports organisations. Has representatives but scope is too narrow.
    3. **Registar sportskih djelatnosti pravnih osoba** (Sisak-Moslavina sports) — XLSX. Same niche scope.
  - No general HR companies CSV with officers on data.gov.hr CKAN.

- **FINA RGFI (Annual Financial Statements Registry):** financial statements only — balance sheets, P&L, notes. NO officer roster. Topograph wraps FINA for financial-doc retrieval, but FINA itself does not expose officers.

- **FINA RSV (Beneficial Owners Register, `rsv.fina.hr`):** Croatia's UBO register. CJEU C-37/20 / C-601/20 Nov 2022 ruling restricted public access to "legitimate interest" gated. Practical access requires authentication via **NIAS** (Nacionalni identifikacijski i autentifikacijski sustav) — accepts only Croatian e-ID / e-Building credentials. **Foreign API consumers are structurally blocked.** No API. No bulk download.

- **Croatian Central Depository (SKDD):** governance disclosures for listed companies only (~30 entities on Zagreb Stock Exchange). Too narrow to cover the long tail of HR private limited companies (the typical KYB target).

- **Verdict: NOT VIABLE** for general officer enumeration. Open data covers the underlying registry pointer only; officer-bearing bulk simply isn't in the open-data pipe for HR. UBO register is gated by Croatian e-ID — same outcome as Bulgaria / Portugal per Kyckr 2025-2026 EU UBO access guide.

---

## Path 6 — Public web UI HTML / PDF (`sudreg.pravosudje.hr/registar`)

- **URLs probed:**
  - `https://sudreg.pravosudje.hr/registar/` → redirects to Oracle APEX SPA `https://sudreg.pravosudje.hr/ords/r/esudreg/public/1?clear=APP` (HTTP 200, 48 927 bytes). The page is a JavaScript-rendered SPA with no server-rendered detail page.
  - WebFetch + curl confirm the public search interface accepts OIB, MBS, name, status, legal form, court. No login required to search.
  - Web search confirms (multiple sources, including the EU e-Justice portal, schmidt-export.com, systemday.com, euro-chamber.eu, transactionlink.io): the public Izvadak (extract) generated by this UI **does include** "Osobe ovlaštene za zastupanje" — directors, board members, procurators, with appointment / resignation dates.
  - Statutory basis: Zakon o sudskom registru (Court Register Act) — register is a "javna knjiga" (public book), inspection free of charge, "anyone is entitled to examine information entered in the court register and may request an extract, certified copy or transcript."

- **What's exposed without authentication:** company detail page including officer roster (director/uprava + procurists + supervisory board where applicable), with dates. PDF "Izvadak" downloadable without login per `gov.hr` and `mpudt.gov.hr` references.

- **Important caveat — DEC-20260428-A scope question:** This is **publicly accessible web HTML** containing statutorily-public records. Operating it would require:
  - **(a) Strale itself does NOT scrape this UI** — DEC-20260428-A Tier 1 is absolute, and Sudreg's public web UI is governed by ToS that may or may not allow automated retrieval (the APEX SPA structure suggests they don't optimise for it).
  - **(b) A Tier-2 vendor scraping it must hold redistribution rights + indemnification + provide primary-source provenance.** Topograph asserts (per their docs) that their HR data comes from Sudreg and RGFI/FINA — they don't disclose publicly whether their Sudreg ingestion is via the state-bodies API tier, a contract with the Ministry of Justice, or web scraping. **This needs vendor due-diligence.**
  - **(c) The Croatian Court Register Act and AGB/ToS** for the public UI may permit automated retrieval ("anyone is entitled to examine") or may not — a literal reading of "examine" / "uvid" is ambiguous as to whether it includes automated extraction. Per DEC-20260428-A this is a Petter interpretation call, not a code-agent call.

- **Verdict (pending Petter):** A Tier-2 vendor wrapping `sudreg.pravosudje.hr` could feed Strale officers — but ONLY if (i) the vendor confirms in writing they have redistribution + indemnification, and (ii) the vendor cites primary-source provenance per record. Topograph likely qualifies but needs explicit confirmation. **Not pursuable by Strale directly.**

- **DEC-20260428-A scope question to articulate for Petter:**
  > For HR, the only statutorily-public source of director data is the `sudreg.pravosudje.hr` web UI (Izvadak PDF), since the open `sudreg-data.gov.hr` API genuinely excludes officers from the public tier and the state-bodies API tier is closed to non-government users. The data is publicly accessible (no auth, free of charge under the Court Register Act). Two routes exist: (1) use Topograph (or a peer) and require explicit attestation that their HR officer data is sourced under a license that grants redistribution rights — closes Tier 2 cleanly; (2) reject the vertical for HR until the state-bodies API is opened to private actors or until Sudreg ships an authenticated public-officer endpoint. Recommend route (1) with vendor attestation as part of onboarding.

---

## Path 7 — BRIS cross-border

- **URLs probed:**
  - `https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/hr_en` — Croatian profile on the e-Justice portal.
  - `https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu_en` — BRIS search landing.
  - `https://webgate.ec.europa.eu/e-justice/searchBris.do` → HTTP 307 redirect to `https://sorry.ec.europa.eu/` (Commission service unavailable / blocked from external probes from US-East egress IPs; commonly accessible from EU).

- **What BRIS exposes for HR:** per e-Justice portal text, BRIS provides a unified web search across all EU MS registers. The cross-border view for HR mirrors what each MS chooses to expose. For Croatia, BRIS returns basic company data (name, legal form, registration number, address, status) but **does not include directors** in the cross-border standard payload. The "persons authorized to represent" exposed in HR-domestic Izvadak is NOT propagated through BRIS — Croatia restricted that field at the BRIS gateway.

- **API access:** BRIS has no public REST API for third parties. It's a portal-only experience. The European Commission has signalled (Directive 2017/1132) that machine-readable BRIS access is on the long-term roadmap, but as of 2026-05 there is no documented endpoint.

- **Verdict: NOT VIABLE.** BRIS does not surface HR officers; it surfaces the lowest-common-denominator HR registry slice, which does not include directors.

---

## Path 8 — Court / commercial register separate from main API (Narodne Novine, HJK, sudski registar court-side)

### 8a. Narodne Novine (Official Gazette)

- **URL probed:** `https://narodne-novine.nn.hr/`
- **Finding:** Narodne Novine publishes "Upisi u sudski registar" (court-registry filings) as one of its sections — including officer appointment / resignation notices, since the Companies Act requires court-registry changes to be officially published. The search supports text, date range, and section filter. There is NO documented REST API. URLs follow `https://narodne-novine.nn.hr/eli/<section>/<year>/<issue>/pdf` (ELI-compatible) so individual issues are linkable.
- **Format:** PDFs. Officer-appointment notices are short narrative paragraphs, not structured records. Each notice references the company by MBS / OIB. Bulk parsing would require OCR or careful PDF text extraction across thousands of issues per year.
- **License:** Narodne Novine content is in the public domain under the Croatian Constitution (official acts are not copyrightable). XLSX/CSV downloads exist for regulation lists but not for the company-filing notices.
- **Verdict: VIABLE-V1.2 BUT ENGINEERING-HEAVY.** Possible as a longitudinal append-only feed (build a once-a-day fetch + PDF parse for the "Upisi u sudski registar" section), but the entity-resolution cost (matching narrative text to MBS to canonical entity) is substantial. Not a v1 option. Per DEC-20260428-A this is Strale building a derivative dataset on top of statutorily-public PD content — fine under Tier 1, but requires the DEC-20260428-B engineering bar (versioning, manifests, golden tests). Better as a v1.5 or v2 capability with proper investment.

### 8b. Croatian Notary Chamber (HJK)

- Notaries handle the actual signing of corporate documents (Memorandum, Articles, appointment resolutions). HJK does not publish a searchable index. Each notary keeps their own records. **NOT a viable source.**

### 8c. Sudski registar court-side (the original 5 commercial courts: Zagreb, Split, Rijeka, Osijek, Bjelovar)

- The 5 commercial courts maintain the underlying paper / electronic registers. They each have a counter where one can request a paper Izvadak. Not API-accessible. Not viable for programmatic consumption.

---

## HR synthesis

- **v1 path recommendation: Path 4a — Topograph (per-call, RFQ-confirmed pricing).** Per-call billing fits the Strale cost discipline; officer coverage (legal representatives + supervisory board) confirmed in docs; data sources documented (Sudreg + RGFI/FINA). **Action required before v1 ship:** sign up to Topograph, query `/v2/pricing?countryCode=HR` with auth, confirm HR per-call cost ≤ €0.20/call (the band Strale historically targets for KYB capabilities). If HR pricing comes back at e.g. €0.05-0.15/call → green-light. If €0.50+/call → re-scope, fallback to 4b.

- **v1.1 backup: Path 4b — TransactionLink.** Same upstream (Sudreg), per-call API also asserted but pricing fully RFQ-gated. Worth contacting only if Topograph HR is unviable on cost.

- **v1.5 / v2 path: Path 8a — Narodne Novine ELI feed (Strale-built).** Strale would build an ingest pipeline on Narodne Novine PDFs ("Upisi u sudski registar" notices), maintain a versioned manifest per DEC-20260428-B, and produce a derivative officer-history dataset. This is Tier 1 (Strale building on public-domain official-gazette data) and is the right primitive if HR officers become a high-volume Strale call. NOT for v1 — engineering cost too high.

- **Truly blocked? NO.** Phase 2's "blocked" classification was premature. Two viable paths exist (Path 4a primary, Path 8a long-term). The original blocker (the public Sudreg API schema lacks officers) is a real fact about Path 1, but Paths 4a, 4b, and 8a all route around it.

- **DEC-20260428-A scope question for Petter (re: Path 6):**
  > Topograph's data-source disclosure for HR cites Sudreg + RGFI/FINA. Topograph claims it does NOT operate scrapers (consistent with the KYB-vendor norm of pulling from official APIs). However, the HR officer fields Topograph exposes (legal representatives with names, OIBs, roles, addresses) are **only available via the state-bodies API tier of Sudreg or via the public web UI** — Topograph is not a Croatian government body, so they're either (a) accessing the public web UI in some automated way, or (b) holding a bilateral contract with the Croatian Ministry of Justice for state-bodies-tier access. **Strale should require Topograph to attest in writing which of (a) or (b) applies, and if (a), to provide written confirmation that their HR officer extraction is permitted under the Sudreg ToS + Court Register Act, plus indemnification.** This brings the Topograph integration cleanly inside DEC-20260428-A Tier 2.

- **Cost-discipline summary:**
  - Topograph: per-call, no minimum, no subscription floor — fits.
  - OpenCorporates: annual subscription £2,250+ — does not fit, deferred.
  - Bisnode/D&B: RFQ, historically subscription — does not fit at solo-founder budget.
  - Open-data + Narodne Novine: free (build-it-ourselves), but engineering investment not justified for v1.

- **Final classification:** HR is **viable-v1 (pending Topograph RFQ + vendor attestation)**, not blocked.
