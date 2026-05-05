# Section 3 — Scraping Migration & Direct-Integration Alternatives

**Context:** Payee Assurance v1, shipping Q2 2026. Evaluates every country where Strale currently uses Browserless+LLM scraping or a scraping-based aggregator for company-registry data. Tests whether the doctrine **DEC-20260420-H** ("direct data connections only. No scraping. Full ToS compliance.") is operable as-written, or whether it must be softened with a principled carve-out.

**Scope (11 countries):** BE, ES, IE, IT, LT, LV, NL, PT, SE (scraping-based); DE, AT (aggregator-based).

**Evidence baseline:** Strale repo state as of 2026-04-20 (`apps/api/src/capabilities/*-company-data.ts`), plus primary-source research below. Primary sources cited in-line.

**Terminology used in this section:**
- **govt-api** — documented, authenticated API published by the official registry operator (KVK, Bolagsverket, CRO, etc.)
- **govt-scraping** — HTML fetching from a government-hosted portal (kbopub, core.cro.ie, etc.)
- **commercial-aggregator-scraping** — HTML/JSON-LD scraping of a private aggregator (northdata, empresia, racius, allabolag)
- **licensed-commercial-aggregator** — paid, contractually-clean aggregator (Creditsafe, Moody's Orbis, BvD, Informa, Cerved, Lursoft…)

---

## 3.1 Per-country sub-sections

### 3.1.1 Netherlands (NL)

**Current state.** `apps/api/src/capabilities/dutch-company-data.ts` calls `searchNorthdata(...)` via `./lib/northdata.js`. The executor comment explicitly states: "Replaces the previous Browserless+LLM scraper that was failing to extract data from kvk.nl." So **Strale scrapes northdata.com JSON-LD, not KVK directly**. This is commercial-aggregator-scraping.

**Direct alternative: KVK Developer Portal (official govt-api).**
- Zoeken (search) API — free per call; €6.40/month connection fee per API key.
- Basisprofiel API — €0.02 per query; €6.40/month connection.
- Open Dataset (bulk) — free.
- Auth: API key. Docs: developers.kvk.nl/documentation.
- Pricing source: KVK Developer Portal pricing & FAQ pages (2026).

**Data parity.** KVK Basisprofiel returns: legal name, KVK number, RSIN, legal form, trade names, activity codes (SBI), status, main location, locations list, owner. Matches or exceeds northdata extraction. KVK does **not** expose financial turnover without the Jaarrekeningen-API path (separate product). northdata JSON-LD also did not provide reliable financials.

**Migration effort.** ~1 engineering day. Straightforward REST/JSON. Auto-register pattern already used for other direct-API executors (brreg, cvrapi, KRS). Fixture regeneration trivial.

**Downside.** Cost delta: €0.02/call on Basisprofiel (vs. ~€0.003 Browserless/Claude token on current northdata path — but northdata ToS concerns make cost irrelevant). Latency: likely ~300ms govt-api vs. ~3–8s Browserless. **Latency improves.** No coverage loss for KYB essentials.

**Classification: MIGRATE NOW.**

Sources: [KVK Pricing](https://developers.kvk.nl/pricing), [KVK Basisprofiel API docs](https://developers.kvk.nl/documentation/basisprofiel-api), [KVK Zoeken API docs](https://developers.kvk.nl/documentation/zoeken-api), [KVK billing FAQ](https://developers.kvk.nl/support/faq/billing).

---

### 3.1.2 Sweden (SE)

**Current state.** `swedish-company-data.ts` fetches `https://www.allabolag.se/what/{name}` and `https://www.allabolag.se/{orgnr}` via Browserless + htmlToText extraction. allabolag.se is a **commercial aggregator**, not a government registry. This is commercial-aggregator-scraping.

**Direct alternative: Bolagsverket "API för att hämta företagsinformation" (official govt-api, v4.6 released 2026).**
- Auth: contract + API credentials. Requires signed avtal (agreement) before access.
- Pricing: one-time connection fee + monthly subscription per transaction tier. Specific kronor-amounts not published publicly (contract-dependent). The separate "API för värdefulla datamängder" (High-Value Datasets API under EU Open Data Directive) is free and does not count against transaction quotas, but has narrower coverage.
- Additionally: the **HVD API is free** and covers the Open Data Directive minimum dataset (basic identity + status).
- Third-party commercial wrappers: Roaring.io, Apiverket.se — licensed Bolagsverket resellers with clean ToS and pay-per-call pricing.

**Data parity.** Bolagsverket direct covers: orgnr, legal name, legal form, status, registered address, SNI codes, board, signatories, fiscal year, auditor. Allabolag scrape also exposes revenue/EBIT/employee-count from filed annual reports — those fields come from årsredovisningar and are a **separate Bolagsverket product** (Årsredovisning API) or third-party (Roaring).

**Migration effort.** ~3-5 days for the basic company-data API (contract + onboarding adds calendar time, not engineering time). Fixture regeneration + test-suite update standard. An additional 2-3 days if financial fields are in scope.

**Downside.**
- Admin friction: signed contract, not instant signup.
- Financial fields (revenue, EBIT) require a second API (extra cost).
- Cost: per-transaction pricing is higher than the Browserless+LLM marginal cost, but still low (expected single-digit öre per call for basic lookup).
- **Coverage loss:** historical financials are omitted unless Årsredovisning API is added.

**Classification: MIGRATE NOW** for basic identity. **MIGRATE SOON** for financial fields (second phase).

Sources: [Bolagsverket API för att hämta företagsinformation](https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/apiforatthamtaforetagsinformation.3988.html), [Avtal för API](https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/apiforatthamtaforetagsinformation/avtalforapiforatthamtaforetagsinformation.3990.html), [API för värdefulla datamängder (HVD)](https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/vardefulladatamangder/apiforvardefulladatamangder.5513.html), [Roaring.io Bolagsverket API](https://www.roaring.io/services/bolagsverket-api).

---

### 3.1.3 Belgium (BE)

**Current state.** `belgian-company-data.ts` uses a cascade: first `cbeapi.be` (third-party, "free API for accessing the CBE database"), then `kbopub.economie.fgov.be` (official FPS Economy KBO Public Search), both via Browserless extraction. Mixed govt-scraping + third-party-API.

**Direct alternative: CBE/KBO Open Data (official govt-api / bulk).**
- Bulk CSVs: free, monthly. Register + accept ToS via the [CBE open data portal](https://kbopub.economie.fgov.be/kbo-open-data/login) → SFTP/manual download. New files first Sunday of each month.
- Real-time govt-hosted REST API: **does not exist**. The FPS Economy offers only Public Search (HTML) and monthly bulk CSV. This is the documented legal gap.
- cbeapi.be is a **third-party wrapper** (unofficial, free). Reliability and ToS authority is unclear; it is not a Belgian-government endpoint.

**ToS classification of current scraping target (kbopub.economie.fgov.be).**
KBO Public Search explicitly restricts automated use. Per FPS Economy guidance summarised by multiple legal commentaries (Kyckr, ScrapingBee references): "Only targeted queries per entity are allowed, not systematic and continuous downloading of KBO data. Any misuse is punishable with fines ranging from 26 to 50,000 euros." **Scraping kbopub.economie.fgov.be is explicitly forbidden for systematic/automated access.** Strale's current cascade violates this if it exceeds per-entity lookups or is invoked in bulk.

The cbeapi.be route may be "free" but Strale has no license grant from cbeapi — using a third-party free mirror under a doctrine that requires ToS compliance is risky.

**Data parity.**
- Bulk CSV gives: enterprise number, legal name, status, legal form, start date, address, activities (NACE-BEL), establishments. No ownership/UBO.
- Real-time lookups for "is company X active today?" require a local ingest of the monthly bulk with daily freshness degradation up to 30 days.
- Licensed aggregators (Creditsafe BE, Kompass BE, or Bureau van Dijk's Belgian First) add UBO + financials.

**Migration effort.**
- Bulk-ingest architecture (download monthly CSV → Postgres → lookup query): ~4-5 days (first build), ~1 day/month ongoing ops.
- Licensed aggregator integration: ~3-5 days engineering, contract negotiation 2-8 weeks calendar time.
- Simply removing BE from v1: zero engineering.

**Downside.**
- Bulk path: 0-30 day freshness degradation. Status "active vs dissolved" may be stale. For Payee Assurance this matters.
- Licensed path: recurring cost (Creditsafe starter tier ~€200-600/month for small volumes per vendor research).

**Classification: MIGRATE SOON** (via bulk CSV ingest) OR **DROP FROM v1** (if freshness and UBO matter). Current scraping approach is **ToS-forbidden** and must be disabled regardless.

Sources: [CBE Open Data](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-open-data), [CBE Public Search](https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/consultation-and-research-data/cbe-public-search), [CBEAPI third-party wrapper](https://cbeapi.be/en), [Kyckr Belgium guide 2025](https://www.kyckr.com/blog/belgium-company-registry-cbe-2025-update).

---

### 3.1.4 Ireland (IE)

**Current state.** `irish-company-data.ts` scrapes `https://core.cro.ie/company/{num}` and `https://core.cro.ie/search?q=...` via Browserless. core.cro.ie is the **official** CRO (Companies Registration Office) portal. This is govt-scraping.

**Direct alternative: CRO Open Services API + CRO Open Data Portal (official govt-api).**
- The [CRO Open Data Portal](https://opendata.cro.ie/dataset/companies) launched as DCAT-AP-HVD compliant under the EU Open Data Directive HVD regime. **Bulk + API access, CC-BY-4.0 licence, basic company and submission data free.**
- Real-time API (Open Services API at services.cro.ie): requires signup + signed T&Cs + API key (emailed). Basic lookups free; document retrieval pay-per-call.
- Auth: Basic auth (email + API key, base64).

**Data parity.** CRO Open Services returns: company name, number, status, type, registered office, date of registration, last annual return. Matches and exceeds core.cro.ie public-search HTML. Financial statements / filings via pay-per-call document fetch.

**Migration effort.** ~1 day. Simple REST + Basic auth. Fixture regeneration trivial.

**Downside.** Essentially none. Signup calendar delay (days, not weeks). Basic data remains free of charge.

**Classification: MIGRATE NOW.**

Sources: [CRO Open Data Portal](https://opendata.cro.ie/dataset/companies), [CRO Open Data announcement](https://cro.ie/the-companies-registration-office-cro-announces-the-launch-of-new-open-data-portal/), [CRO Open Services API](https://services.cro.ie/overview.aspx), [CRO Access to Data](https://cro.ie/services-and-help/access-to-cro-data/).

---

### 3.1.5 Italy (IT)

**Current state.** `italian-company-data.ts` fetches `https://www.registroimprese.it/ricerca-libera?query=...` via Browserless. registroimprese.it is the **official** InfoCamere portal for the Italian Business Register. This is govt-scraping of a site that is primarily a fee-gated portal (free preview, paid "visure").

**Direct alternative: InfoCamere Telemaco API (official govt-api, pay-per-document).**
- Telemaco: registration is free; per-document billed against a prepaid account. An "English Company Registration Report" (Visura Camerale Inglese) is listed at €6.50 per call via Visengine/similar resellers.
- A **certificato di iscrizione** (formal registration certificate) runs €13.70.
- No free tier for real-time identity lookup comparable to CRO/Bolagsverket HVD.
- The official [Accesso alle Banche Dati Online (ABDO) API](https://accessoallebanchedati.registroimprese.it/abdo/en/api?lang=en) is the formal access layer.

**Licensed commercial aggregators covering Italy:** Cerved (dominant domestic bureau), CRIF, Bureau van Dijk Aida product, Kompass IT, Informa (ES, secondary IT coverage). All paid; Cerved and BvD contract-sales.

**ToS of current scrape target (registroimprese.it).** The site is InfoCamere-operated. Its reuse policy is tied to paid Visure — the free preview page is not licensed for systematic extraction. No explicit scraping permission, and per Italian copyright on database rights (d.lgs. 169/1999) commercial extraction is restricted. **ToS ambiguous-to-forbidden.**

**Data parity.** The free HTML preview gives little beyond denomination, REA, partita IVA, status. The paid Visura gives full officers, capital, articles, filings. Aggregator scraping loses most of what the Visura contains.

**Migration effort.**
- Telemaco direct: ~4-6 days (Italian-language onboarding, prepaid account setup, XML parsing).
- Commercial aggregator (Cerved/Kompass): ~3-5 days engineering, multi-week contract.

**Downside.** Per-call cost is material (€6.50+ for English Visura). Latency acceptable (1-3s). If Strale wants free-tier coverage for Italian identity, there is no clean path.

**Classification: MIGRATE SOON** (Telemaco for production use, accepting €6.50/call). **Current free-tier positioning cannot be sustained in Italy.**

Sources: [Telemaco Dati](https://www.registroimprese.it/telemaco-dati), [ABDO API](https://accessoallebanchedati.registroimprese.it/abdo/en/api?lang=en), [Italian Business Register info (InfoCamere)](https://italianbusinessregister.it/en/), [OpenAPI Italy company report (third-party)](https://openapi.com/products/co-registration-report-italy), [Kyckr Italy guide 2025](https://www.kyckr.com/blog/the-italian-business-register-2025-update).

---

### 3.1.6 Spain (ES)

**Current state.** `spanish-company-data.ts` fetches `empresia.es` (primary) and `infocif.es` (fallback) via Browserless. Both are **commercial aggregators**, not government portals. This is commercial-aggregator-scraping.

**Direct alternative: Registro Mercantil / Registradores OpenData.**
- [opendata.registradores.org](https://opendata.registradores.org/en/) is the College of Registrars' OpenData portal — real-time, interactive, but primarily a human-facing tool; programmatic access is not the documented affordance.
- [sede.registradores.org](https://sede.registradores.org/site/mercantil?lang=en_EN) offers paid search (basic searches "under €5 via credit card"). No bulk free API.
- Law 11/2023 amendments + 26 May 2025 accounts-model rules expand open-data coverage incrementally, but there is **no documented free REST API for Spanish company basic data** as of April 2026.
- **Licensed alternative: Informa D&B (Spanish affiliate of D&B).** Commercial, contract, high-quality, covers all RM data including financials. Dominant Spanish bureau.

**ToS of current scrape targets.**
- empresia.es: private platform, commercial terms typically restrict bulk extraction. No explicit scraping permission. **ToS: ambiguous-to-forbidden.**
- infocif.es (Gedesco): commercial platform. Same classification. **ToS: ambiguous-to-forbidden.**

**Data parity.** Scraping empresia gets identity, NIF, status, address, partial officers. A licensed Informa feed gives full RM data + financials. opendata.registradores gives basic identity but workflow is browser-form-only.

**Migration effort.**
- Informa integration: ~5 days engineering, multi-week contract.
- Attempting to automate sede.registradores per-search (€<5/call, browser form): indistinguishable from scraping; not doctrine-compliant.

**Classification: MIGRATE SOON** via Informa (commercial contract required) OR **DROP FROM v1** if no budget exists for Informa. The current empresia/infocif scraping is not doctrine-compliant.

Sources: [OpenData Registradores](https://opendata.registradores.org/en/), [Sede Registradores](https://sede.registradores.org/site/mercantil?lang=en_EN), [Informa D&B](https://www.informa.es/en/business-information/database), [Kyckr Spain guide 2026](https://www.kyckr.com/blog/spain-business-registry-search), [e-Justice business registers ES](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/es_en).

---

### 3.1.7 Latvia (LV)

**Current state.** `latvian-company-data.ts` fetches `https://info.ur.gov.lv/#/company-search?...` via Browserless. info.ur.gov.lv is the **official** Latvian Enterprise Register (Uzņēmumu reģistrs) information website. This is govt-scraping — but of a site that publishes a formal reuse rules page.

**Direct alternative: UR API web services + UR Open Data (official govt-api).**
- [ur.gov.lv/en/get-information/free-of-charge-services/api-web-services/](https://www.ur.gov.lv/en/get-information/free-of-charge-services/api-web-services/) — API via the National Information Systems integrator (managed by SDDA, the State Digital Development Agency).
- [ur.gov.lv/en/get-information/free-of-charge-services/open-data/](https://www.ur.gov.lv/en/get-information/free-of-charge-services/open-data/) — CSV/XLSX open data, **no restrictions on redistribution**, commercial OR non-commercial.
- Basic business data (current + historical) free; premium services (authenticated documents) paid.
- Licensed commercial aggregator: Lursoft (dominant Baltic bureau).

**ToS of current scrape target.** The [Rules for use of the information website](https://www.ur.gov.lv/en/rules-use-information-website-enterprise-register-republic-latvia) exist. The site distinguishes identified vs unidentified access. Given that a formal API is published, using HTML scraping instead of the API when it exists is a poor compliance posture. **Govt-scraping where a govt-api exists = ToS-ambiguous.**

**Data parity.** API + open data covers: reg. number, legal name, legal form, status, address, officers, type. Matches current scrape.

**Migration effort.** ~2-3 days — needs engagement with the SDDA API manager for credentials.

**Downside.** Onboarding friction (SDDA coordination). Otherwise effectively zero cost (free-of-charge service).

**Classification: MIGRATE NOW.**

Sources: [UR API web services](https://www.ur.gov.lv/en/get-information/free-of-charge-services/api-web-services/), [UR Open Data](https://www.ur.gov.lv/en/get-information/free-of-charge-services/open-data/), [UR rules of use](https://www.ur.gov.lv/en/rules-use-information-website-enterprise-register-republic-latvia), [Lursoft databases](https://www.lursoft.lv/en/data-bases-of-companies).

---

### 3.1.8 Lithuania (LT)

**Current state.** `lithuanian-company-data.ts` calls `searchNorthdata(...)` with country="Lithuania". Previous commented note says the Browserless scraper targeted rekvizitai.vz.lt. Current path is commercial-aggregator-scraping via northdata.

**Direct alternative: Registrų centras JAR + JADIS (official govt-api).**
- Registrų centras (Centre of Registers) operates JAR (legal entities register) and JADIS (public-search data platform).
- [jars.lt](https://jars.lt/en) is a **free third-party** front-end aggregating Lithuanian + Estonian registers with built-in API-key authentication; covers 227k LT companies + 366k EE.
- Official Registrų centras data exchange is through contract-based API (registrucentras.lt/p/1110 "How to get data from JADIS"). Open data exists but with less clear freshness.
- Commercial wrapper: Lursoft covers Lithuania as well.

**ToS of current path (northdata).** northdata Terms of Service explicitly reserve rights. Data+Widget API is **€500/month for 1,000 requests** — commercial license with redistribution caveats. **Scraping JSON-LD from northdata pages bypasses this license; it is ToS-forbidden.**

**Data parity.** northdata scrape ≈ basic identity + officers. Registrų centras direct delivers the same + Lithuanian-specific fields (VMI status, unique ID). jars.lt provides comparable data.

**Migration effort.**
- Via Registrų centras: ~4-6 days (contract-based access, Lithuanian-language onboarding).
- Via jars.lt third-party API: ~1-2 days but inherits third-party dependency (not doctrine-ideal).
- Via Lursoft: ~3-5 days + contract.

**Downside.** Registrų centras contract onboarding is the slowest path. jars.lt is fast but is a third-party dependency (same risk profile as northdata, better ToS). Lursoft is the cleanest commercial path.

**Classification: MIGRATE NOW** (stop using northdata for LT). Implementation route is **MIGRATE SOON** — needs a business decision between jars.lt (quick, third-party) and Registrų centras or Lursoft (slower, clean).

Sources: [Registrų centras](https://www.registrucentras.lt/jar/index_en.php), [JADIS access docs](https://www.registrucentras.lt/p/1110), [jars.lt](https://jars.lt/en), [Lursoft Lithuanian companies](https://www.lursoft.lv/lietuvas-uznemumi?l=en), [northdata Widget API pricing](https://help.northdata.com/en/center/where-can-i-find-documentation-for-the-api).

---

### 3.1.9 Portugal (PT)

**Current state.** `portuguese-company-data.ts` calls `searchNorthdata(...)` with country="Portugal". Prior code scraped racius.com per code comments. Current path is commercial-aggregator-scraping via northdata (identical to LT above).

**Direct alternative.**
- [publicacoes.mj.pt](https://publicacoes.mj.pt/) — Portuguese Ministry of Justice official publications portal. Web-form search, **no documented machine-readable API**, significant navigation friction.
- [eportugal.gov.pt / Empresa Online 2.0](https://www2.gov.pt/en/espaco-empresa/empresa-online) — registration/filing platform (write), not a lookup API (read).
- No free official real-time PT API for company identity comparable to CRO or KVK.
- **Racius.com** is a private commercial aggregator (like empresia.es). **Licensed** commercial options: Informa D&B Portugal, Bureau van Dijk Sabi/Iberian coverage.

**ToS classification.** northdata scraping: **forbidden per above**. racius.com: private commercial terms, no scraping permission published. publicacoes.mj.pt scraping: ambiguous — government-hosted but not a designated machine-readable endpoint.

**Data parity.** Full company registry extracts in Portugal are fee-paying (certidão permanente ~€25 for 6 months). Free channels cover limited fields. northdata approximates basic identity only.

**Migration effort.**
- Informa Portugal: ~3-5 days engineering, contract time.
- Certidão permanente aggregation: paid per certificate, not API-native — not viable.
- publicacoes.mj.pt programmatic use: not ToS-authorized and data is unstructured.

**Classification: DROP FROM v1** (recommended) OR **MIGRATE SOON** via Informa (if budget). Continuing northdata scraping is not doctrine-compliant.

Sources: [IRN Empresa Online 2.0](https://www2.gov.pt/en/noticias/irn-lanca-nova-plataforma-empresa-online-2.0), [publicacoes.mj.pt](https://publicacoes.mj.pt/), [e-Justice PT business registers](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/pt_en), [Schmidt & Schmidt PT extract guide](https://schmidt-export.com/extracts-foreign-commercial-registers-and-accounting-statements/extracts-commercial-register-portugal).

---

### 3.1.10 Germany (DE)

**Current state.** `german-company-data.ts` imports `searchNorthdata` from `./lib/northdata.js`. Executor comment: "German Company Data — northdata.com JSON-LD extraction." Explicit aggregator scraping.

**Direct alternative: Handelsregister (since 2022) + Unternehmensregister (official govt-api-adjacent).**
- **DiRUG law, effective 2022-08-01:** Access to all German commercial/cooperative/association/partnership register content is **free of charge, no registration or login required**. [handelsregister.de](https://www.handelsregister.de/) is the Common Register Portal.
- **However:** handelsregister.de does not expose a formal public REST API. It is a search portal. Third-party tools like `bundesAPI/handelsregister` (open source) and `handelsregister.ai` (commercial API wrapper) scrape/wrap it. OffeneRegister.de publishes downloadable open datasets.
- **Unternehmensregister** ([unternehmensregister.de](https://www.unternehmensregister.de/en)) is the central platform; also portal-based.
- **Bundesanzeiger** (Federal Gazette) publishes financial statements; some free, some €1-€5 per document.

**Licensed commercial alternatives:** Creditreform (dominant DE bureau), Schufa (business arm), Bureau van Dijk Amadeus, and yes, North Data's own paid API tier (€500/month for 1,000 req Data+Widget). Creditreform is the clean commercial option.

**ToS of current path (northdata).** northdata explicitly offers a licensed API at €500/month. Scraping JSON-LD from their pages outside that contract is a **clear ToS breach**. This is the single starkest doctrine violation in the current stack.

**Data parity.** northdata scrape ≈ identity, officers, filings summary, relationships graph (unique northdata differentiator). Creditreform adds credit score + financials. handelsregister.de direct (via bundesAPI-style wrapper) gives identity + filings but not the relationship graph. OffeneRegister.de bulk gives structured base data.

**Migration effort.**
- Switch to `bundesAPI/handelsregister` open-source wrapper over handelsregister.de: ~2-3 days. **But this is scraping the portal** — it's moved the problem but not solved it. The portal is free and login-free, which is closer to ToS-permitted than northdata; however it is not a formal API.
- OffeneRegister bulk ingest: ~3-5 days + ops.
- Creditreform commercial API: ~5-7 days engineering, multi-week contract.
- Pay for northdata's licensed €500/month tier: ~1 day + contract.

**Downside.** Scraping handelsregister.de (via bundesAPI) still relies on HTML and may technically violate Common Register Portal automated-access norms even if content is "free." The cleanest-compliance path is Creditreform contract or northdata licensed tier.

**Classification: MIGRATE NOW** (stop scraping northdata — this is the single highest-doctrine-risk integration). Implementation is **MIGRATE SOON** via Creditreform contract. Interim option: pay for northdata's licensed API tier — **same source, now with a license**, ~1 day switch.

Sources: [Registerportal handelsregister.de](https://www.handelsregister.de/), [Unternehmensregister](https://www.unternehmensregister.de/en), [DiRUG free-access explainer](https://se-legal.de/company-law-advice-germany/the-german-handelsregister/), [bundesAPI/handelsregister GitHub](https://github.com/bundesAPI/handelsregister), [OffeneRegister.de](https://offeneregister.de/), [North Data API docs](https://northdata.github.io/doc/api/), [North Data Premium Services](https://www.northdata.com/_premium).

---

### 3.1.11 Austria (AT)

**Current state.** `austrian-company-data.ts` uses a cascade: first `https://firmenbuch.finapu.com/fb-svc/firmen-service` (FinAPU, a free third-party Firmenbuch mirror), then `https://firmen.wko.at/SearchSimple.aspx?...` (WKO business directory) via Browserless. Mixed third-party-API + govt-adjacent scraping.

**Direct alternative: JustizOnline Firmenbuchabfrage + auszug.at (licensed reseller).**
- Official Firmenbuch via [justizonline.gv.at](https://justizonline.gv.at/jop/web/firmenbuchabfrage/443956b_1): current extract €4.63, historical €7.80, court extract €15.00. Requires **ID Austria or EU Login authentication**.
- [api.auszug.at](https://api.auszug.at/) — state-authorized partner of the Austrian Justice Ministry since 2015. Paid, per-document. This is a **licensed-commercial-aggregator** (clean ToS).
- [OpenFirmenbuch](https://openfirmenbuch.at/about-us/) — uses the free JustizOnline API; published via data.gv.at.
- [FinAPU](https://www.finapu.com/en/blog/finapu-firmenbuch-free-company-data-available) — the "free, no-registration, no-quota" mirror Strale is currently using. Published on data.gv.at (Open Government Data Austria). Based on structured processing of public Firmenbuch data.
- Licensed commercial aggregators: KSV1870, Compass Verlag.

**ToS classification of current paths.**
- **FinAPU**: marketed as free, no-registration, no-usage-limits. Listed on data.gv.at as an OGD application. Acceptable as a direct third-party dependency, but **it is a third-party service, not a government API**. No formal SLA. The current code doesn't sign a contract with FinAPU — it simply hits the service endpoint.
- **firmen.wko.at**: WKO (Austrian Economic Chamber) directory. Scraping public chamber pages is tolerated but not license-granted. **ToS: ambiguous.**

**Data parity.** FinAPU returns structured Firmenbuch data: FN, legal name, legal form, address, officers, purpose. Matches what a paid extract delivers, minus official document status. auszug.at / KSV1870 adds certified extracts + credit data.

**Migration effort.**
- Switch to auszug.at licensed API: ~3 days + contract (partner since 2015, documented API).
- Maintain FinAPU as primary + document as dependency under carve-out: 0 days engineering, but requires explicit acceptance by doctrine.
- KSV1870: ~5-7 days + multi-week contract.

**Downside of migrating away from FinAPU.** auszug.at per-document cost (likely €3-€8/call based on JustizOnline pricing). FinAPU's "free" model may itself not be sustainable long-term — a doctrine-clean path is still valuable.

**Classification: MIGRATE SOON** (to auszug.at or KSV1870). FinAPU is usable as a named dependency under a soften-doctrine carve-out ("free, open, government-adjacent, published on data.gv.at"), but doctrine purity requires a licensed path.

Sources: [JustizOnline Firmenbuch](https://www.justiz.gv.at/service/datenbanken/firmenbuch/firmenbuchabfrage.2c9484852308c2a601240b693e1c0860.de.html), [auszug.at](https://api.auszug.at/), [FinAPU Firmenbuch announcement](https://www.finapu.com/en/blog/finapu-firmenbuch-free-access-company-register), [FinAPU on data.gv.at OGD](https://www.data.gv.at/katalog/application/5dda5646-5755-4af2-b465-79d71f1f834d), [OpenFirmenbuch](https://openfirmenbuch.at/about-us/), [Kyckr Austria guide 2026](https://www.kyckr.com/blog/the-austrian-business-registry).

---

### 3.1.12 BRIS as cross-cutting alternative

[BRIS](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu_en) federates all EU business registers via the European e-Justice portal. Pulls in real time from member-state registers, no fees.

**Why BRIS does not replace per-country integrations for Payee Assurance v1:**
1. BRIS provides only basic harmonised fields: EUID, name, registered office, legal form, status, date of registration. **No officers, no financials, no UBO, no establishments.** Payee Assurance needs at least directors and beneficial ownership.
2. No documented public machine-readable API. The search is via the e-Justice web form; programmatic access is undocumented for third parties.
3. BORIS (beneficial ownership interconnection) explicitly does not offer an API, bulk download, or machine-readable output.

**BRIS is a useful cross-check for "does this company exist in some EU register" but not a production data source.** Do not bake it into v1.

Sources: [BRIS dashboard](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/210798097/Business+Registers+Interconnection+System+dashboard), [e-Justice search-company-EU guide](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu_en), [BORIS explainer](https://e-justice.europa.eu/topics/registers-business-insolvency-land/beneficial-ownership-registers-interconnection-system-boris_en).

---

## 3.2 Classification table

| Country | Current state | Best direct alternative | Data parity | Migration days (eng) | Cost delta | Classification |
|---|---|---|---|---|---|---|
| NL | Scrapes northdata.com (aggregator) | KVK Basisprofiel API (govt-api) | Full | ~1 | +€0.02/call, +€6.40/mo | **MIGRATE NOW** |
| SE | Scrapes allabolag.se (aggregator) | Bolagsverket API (govt-api, contract) | Full identity; financials separate | ~3-5 | low per-call + contract | **MIGRATE NOW** (identity); **MIGRATE SOON** (financials) |
| IE | Scrapes core.cro.ie (govt portal) | CRO Open Services API (govt-api) | Full | ~1 | free basic data | **MIGRATE NOW** |
| LV | Scrapes info.ur.gov.lv (govt portal) | UR API web services (govt-api) | Full | ~2-3 | free | **MIGRATE NOW** |
| DE | Scrapes northdata.com (aggregator) | Creditreform (licensed) OR handelsregister.de (free portal, no formal API) OR northdata licensed tier (€500/mo) | Identity full; credit extra | ~1-7 depending on path | +€500/mo (northdata licensed) or contract | **MIGRATE NOW** (stop illicit scrape); **MIGRATE SOON** (licensed path) |
| LT | Scrapes northdata.com (aggregator) | Registrų centras (contract) OR Lursoft (licensed) OR jars.lt (third-party) | Full | ~2-6 | low / contract | **MIGRATE NOW** (stop illicit scrape); **MIGRATE SOON** (clean path) |
| AT | Uses FinAPU (third-party mirror) + firmen.wko.at scrape | auszug.at (licensed) OR KSV1870 | Full | ~3-7 | +per-call €3-8 | **MIGRATE SOON** |
| BE | Scrapes kbopub.economie.fgov.be (govt portal, ToS-forbidden) + cbeapi.be (third-party) | CBE Open Data bulk (monthly CSV) OR Creditsafe BE (licensed) | Bulk has freshness gap; licensed full | ~4-7 | bulk free; Creditsafe €200-600/mo | **MIGRATE SOON** (stop scrape now) |
| IT | Scrapes registroimprese.it (ambiguous ToS) | Telemaco / ABDO (govt-api, paid per-call) OR Cerved (licensed) | Full via paid channel | ~4-6 | €6.50+/call | **MIGRATE SOON**; free-tier not viable |
| ES | Scrapes empresia.es + infocif.es (aggregators) | Informa D&B (licensed) | Full via licensed | ~5 + contract | contract | **MIGRATE SOON** or **DROP v1** |
| PT | Scrapes northdata.com (aggregator) | Informa Portugal (licensed) — no free official real-time PT API | Full via licensed | ~3-5 + contract | contract | **MIGRATE SOON** or **DROP v1** |

---

## 3.3 Recommended migration sequence

**Wave 1 — "ship inside v1" (estimated 6-10 engineering days total):**
1. **NL → KVK Basisprofiel** (~1 day). Highest-reward doctrine fix: replaces aggregator-scraping with textbook govt-api.
2. **IE → CRO Open Services** (~1 day). Textbook govt-api, free tier.
3. **LV → UR API web services** (~2-3 days). Govt-api, free. Cleans up a "govt-scraping while govt-api exists" optics problem.
4. **DE → switch off northdata scraping** (~1 day engineering). Either pay for northdata licensed tier (fast) OR stand up bundesAPI/handelsregister wrapper over handelsregister.de (legal but still HTML-based — flag as interim). **This is the highest-risk violation in the current stack and must be resolved first on doctrine grounds even if technically later in sequence.**
5. **SE → Bolagsverket API (identity)** (~3-5 days). Calendar time dominated by contract/avtal, not engineering.

**Wave 2 — "post-v1, before public launch" (estimated 15-20 engineering days + contracts):**
6. **LT → Lursoft OR Registrų centras contract** (~2-6 days).
7. **AT → auszug.at licensed** (~3 days + contract).
8. **BE → CBE Open Data bulk ingest + monthly refresh pipeline** (~4-5 days).
9. **IT → Telemaco integration** (~4-6 days), accept per-call cost.

**Wave 3 — "decision required before touching":**
10. **ES → Informa D&B contract** (~5 days engineering + multi-week contract) OR **drop ES from v1**.
11. **PT → Informa Portugal contract** (~3-5 days engineering + contract) OR **drop PT from v1**.

---

## 3.4 Doctrine recommendation

### The evidence, summarised

- **Clean govt-api available, fast migration**: NL, IE, LV, SE (identity). **4 countries.**
- **Clean govt-api available, slow migration (cost or contract friction)**: IT, AT, LT, DE. **4 countries.**
- **No free real-time govt-api; licensed-commercial-aggregator is the only clean path**: ES, PT. **2 countries.**
- **Govt-API is bulk-only, not real-time; govt-scraping is ToS-forbidden**: BE. **1 country.**

Currently Strale scrapes commercial aggregators (northdata, empresia, infocif, allabolag) in **6 countries** (DE, LT, NL, PT, SE, ES) and scrapes government-hosted portals in **4 countries** (BE, IE, IT, LV). FinAPU (AT) occupies a middle category as a free, government-adjacent third-party published on data.gv.at.

### Tighten (strict doctrine, drop countries)

If the doctrine is read literally — "direct data connections only. No scraping." — and if "licensed-commercial-aggregator" is allowed but "commercial-aggregator-scraping" and "govt-scraping" are not, **v1 loses every country except the ones with working govt-apis reachable within the v1 timeline.**

Under strict doctrine, v1 **keeps**: NL, IE, LV, SE (Wave 1). That's 4 of 11.

Under strict doctrine, v1 **loses immediately until Wave 2 completes**: DE (unless we pay northdata's license, which IS licensed-commercial-aggregator), LT, AT, BE, IT. 5 countries deferred.

Under strict doctrine, v1 **may never ship**: ES, PT unless Informa contracts are signed. 2 countries permanently at risk.

**Strict doctrine = v1 ships with 4 countries, not 11.** That's a major scope cut.

### Soften with carve-out

A principled carve-out distinguishes:
- **Govt-hosted open-data portals where ToS explicitly permits reuse** (CC-BY, Open Data Directive HVD, CSV downloads with redistribution grant) → **acceptable**.
- **Commercial aggregators scraped without license** → **never acceptable**.
- **Government portals with no API and restrictive or ambiguous ToS** → **not acceptable** (e.g. kbopub.economie.fgov.be, because FPS Economy explicitly restricts automated use).
- **Licensed commercial aggregators under contract** → **acceptable**.

Under this soften-with-carve-out:
- Strale may use the CRO Open Data Portal, LV UR Open Data, CBE Open Data bulk, OffeneRegister.de bulk, FinAPU (published on data.gv.at OGD catalogue) — all pass the carve-out.
- Strale must stop scraping: northdata (DE, LT, NL, PT), empresia (ES), infocif (ES), allabolag (SE), registroimprese.it (IT), kbopub paid-form endpoints (BE), firmen.wko.at (AT). Even under the soften-carve-out these fail.

**v1 under carve-out**: NL, IE, LV, SE via govt-api + BE via CBE bulk + DE via OffeneRegister bulk + AT via FinAPU (flagged dependency) = **7 countries in v1**, with LT/IT/ES/PT in Wave 2 or dropped.

### Split by data-source-type

A slightly more granular version of the carve-out introduces a declared `data_source_type` tier on every capability:
- `govt-api` — strongest
- `govt-open-data` — bulk under Open Data Directive, CC-BY or similar
- `licensed-commercial-aggregator` — contract + clean ToS
- `govt-portal-scraping` — forbidden
- `commercial-aggregator-scraping` — forbidden

This maps cleanly to Strale's existing `data_source_type` column on capabilities. Every capability declares its tier; doctrine enforces at the tier level; audit surfaces the tier in the transparency panel.

### Recommendation

**Adopt the split-by-data-source-type version, which is the soften-with-carve-out doctrine expressed as structured metadata.** Specifically:

1. **Allowed in v1**: `govt-api`, `govt-open-data` (with ToS-checked redistribution), `licensed-commercial-aggregator`.
2. **Forbidden in v1**: `govt-portal-scraping`, `commercial-aggregator-scraping`. These must be replaced before launch.
3. **Grey-zone named dependencies**: services like FinAPU that are published as Open Government Data applications but delivered by a third party. Permit on a named-dependency basis, declared in the transparency panel, with a documented migration plan.

**Rationale:**
- Strict doctrine (tighten) cuts v1 to 4 countries and probably kills the KYB Essentials 20-country product line. Not viable for Q2 ship.
- Carve-out keeps the "no scraping, full ToS compliance" brand posture genuine — it's not weakening compliance; it's tightening the definition so that government open-data portals, which **explicitly grant** redistribution, aren't lumped in with aggregator scraping.
- Split-by-data-source-type is the compliance expression that maps to Strale's existing capability schema and transparency panel. It is machine-checkable at onboarding and visible to end users.

**The thing this doctrine should never, ever permit, and that the current codebase violates today**: scraping a commercial aggregator (northdata, empresia, infocif, allabolag, racius) without a license. That breach is the one most likely to produce a cease-and-desist or legal action, and it is the first thing Wave 1 must fix — in DE, LT, NL, PT, SE, ES — before anything else.

---

## 3.5 Open questions for Petter

1. **Budget for licensed aggregators.** Creditsafe (€200-600/mo), Informa (ES + PT contracts), northdata (€500/mo for DE licensed tier), Cerved (IT) — is there a pre-launch budget line for any of these, or does every country need a free path? This decides ES/PT (drop vs. contract) and the DE interim strategy.
2. **Bolagsverket contract timeline.** SE is the home-country anchor. The Bolagsverket avtal process is documented but not instant. Can the founder initiate it this week to keep SE on Wave 1?
3. **FinAPU carve-out for AT.** FinAPU is a free third-party service whose entire value proposition is structured Firmenbuch data with no limits. It's listed on data.gv.at. Is a "named third-party dependency, migration-plan-required" category acceptable as an interim v1 posture, or must AT go straight to auszug.at/KSV1870?
4. **BE freshness tolerance.** CBE bulk CSV refreshes monthly. For Payee Assurance this means up to 30-day lag on "is company X dissolved?" Is that acceptable, or does BE require licensed real-time (Creditsafe) before launch?
5. **Italian free tier.** Every real-time IT path has a per-call cost (Telemaco €6.50+). Does v1 accept "Italy is a paid-only capability" as a public posture, or does IT come out of KYB Essentials v1?
6. **northdata interim license.** The fastest path to doctrine compliance on DE/LT/NL/PT (north data-based countries) is to sign northdata's €500/mo licensed tier and run the same code under a contract. This converts commercial-aggregator-scraping into licensed-commercial-aggregator overnight. Is that acceptable as Wave 1, pending Wave 2 migration to per-country govt-apis?
7. **"Drop country from v1" vs. "ship with degraded coverage."** Both are reasonable doctrine-aligned answers. Which does the brand prefer — fewer countries, all clean; or more countries, some behind paywalls/contracts with explicit transparency markers?
