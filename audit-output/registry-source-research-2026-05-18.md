# Registry source research — what each EU30 + UK + CH + SG + US-Cobalt source claims to expose for directors/officers/legal representatives

**Date:** 2026-05-18
**Author:** Claude Code (strale-research worktree, model: Sonnet, delegated to general-purpose research agents)
**Counterpart:** handler-side directors verification (`handoff/_general/from-code/handler-directors-verification-2026-05-18.md` — separate prompt)
**Scope:** 30 EU national business registries + UK + CH + SG + US (Cobalt aggregator) + EU BRIS cross-border layer = **34 sources**

## What this report is

A read-only research artifact that answers a single question per source: **"Does the upstream registry claim to expose director / officer / legal-representative data, and at what tier?"** Combined with the parallel handler-side audit, this enables the four-way diagnostic classification:

| Source claims directors | Handler returns directors | Diagnosis |
|---|---|---|
| Yes | Yes (under non-canonical name) | **Class A** — audit was wrong, labeling fix |
| Yes | No | **Class B** — real extraction gap, can ship in v1.1 |
| No | No | **Class C** — honest gap, no path forward without alternate source |
| Restricted (AML-obliged only) | No | **Class D** — gap closeable if Strale's customer profile shifts |
| No | Yes | Anomaly — should not occur; investigate |

This report supplies the **source-claim** column. The handler-side report supplies the **handler-returns** column. Final Class A/B/C/D classification per country requires both — Class C (no source path) and Class D (AML-gated) can be determined here in isolation; Class A vs B requires the handler audit to land.

---

## Summary — one-liner per source

| # | Country | Source | Directors exposed publicly? | Free structured API? |
|---|---------|--------|----------------------------|----------------------|
| 1 | SE | Bolagsverket | **Yes** (HVD + Företagsinfo, free with OAuth2 client reg) | Yes |
| 2 | NO | Brønnøysund (Brreg) | **Yes** (anonymous, name+DOB; fnr requires Maskinporten) | Yes |
| 3 | DK | CVR / Erhvervsstyrelsen | **Yes** (free after ~3-week registration) | Yes |
| 4 | FI | PRH | **No on free v3 API**; paid Virre per-extract for directors | No (free) — paid Virre |
| 5 | UK | Companies House | **Yes** (free with API key) | Yes |
| 6 | IE | CRO | Partial — free open data unclear on directors; paid CORE for documents | Partial |
| 7 | FR | INPI RNE / Annuaire | **Yes** (free with INPI auth; respect `diffusibilité` flag) | Yes |
| 8 | DE | Handelsregister | **Yes** (free since DiRUG Aug 2022, PDF-only — no JSON API) | No (PDF only) |
| 9 | NL | KVK | **Paid** (KVK Basisprofiel API subscription, or €2.85 Uittreksel) | No (paid only) |
| 10 | BE | CBE / KBO | **Yes** (free; current functions only, no DOB, no history) | Yes |
| 11 | CH | Zefix + cantonal HR | **Yes** (free, fully open; full signatory authority published) | Yes (limited via REST; cantonal PDF for full detail) |
| 12 | LU | LBR / RCS | **Yes** (free PDF Extrait; no structured API) | No |
| 13 | ES | Registradores / RM | **Paid** (€0.60–€3.30/lookup; no public API) | No |
| 14 | PT | IRN / Certidão Permanente | **Paid** (€25–€100/yr subscription); free event-level publicações | No |
| 15 | IT | Registro Imprese / InfoCamere | **Paid** (Telemaco / InfoCamere API; €3–€8 per Visura) | No (paid) |
| 16 | GR | GEMI / GEMH | **Yes** (free by statute; HTML web UI only) | No |
| 17 | MT | MBR | **Yes** (free basic search; €5 per detailed document) | No |
| 18 | CY | DRCOR | **Yes** (free for current officers; €10 for history) | No |
| 19 | PL | KRS | **Yes** (free public REST API; JSON names anonymized, PDF non-anonymized) | Yes |
| 20 | CZ | ARES (v3) | **Yes** (free public REST API; unified post-2023) | Yes |
| 21 | SK | RPO (statistics.sk) | **Yes** (free public REST API; weekly SQL dumps) | Yes |
| 22 | AT | Firmenbuch | **Paid** (~€3–€10 per Auszug; auszug.at / Compass) | No (paid resellers) |
| 23 | HU | e-cégjegyzék | **Yes** (free web UI only; cégkivonat paid; no public API) | No |
| 24 | EE | Ariregister | **Yes** (free open-data bulk + signed API agreement) | Yes |
| 25 | LV | Uznemumu reģistrs | **Yes** (free daily CSV bulk via CKAN) | Yes (bulk) |
| 26 | LT | Registru centras (JAR/JADIS) | **Yes** for governing-body members (Spinta API); **paid** for single vadovas via full JAR extract | Partial |
| 27 | HR | Sudreg | **Yes** (free REST API after free registration) | Yes |
| 28 | SI | AJPES PRS | Free web UI; **contract-gated** extended REST for representatives | Partial |
| 29 | BG | BRRA | Free web UI; **paid SOAP** for structured data | No (paid SOAP) |
| 30 | RO | ONRC | **Paid** (~8 RON per extract; RECOM subscription; no free REST) | No |
| 31 | SG | ACRA | **Free open data omits officers** (count only); paid BizFile EIQ for names | Partial — name-blind on free tier |
| 32 | US | Cobalt Intelligence (aggregator) | **Paid**; officers covered in ~28/50 states (CA/NY/DE redacted) | Yes (paid; 49 states for registered agent) |
| 33 | XB | EU BRIS | **Per-MS variable** — free baseline excludes legal reps | No structured API |

**Headline numbers:**
- Source-side **Yes (free + structured API)** for directors: **11** of 33 (SE, NO, DK, UK, FR, BE, CH, PL, CZ, SK, EE, LV, HR — 13 actually, but LV is bulk-only, BE is current-only/thin; the clean free-API-with-current-roster bucket is ~10)
- Source-side **Yes but not via free API** (paid, PDF-only, web-only): **11** (DE PDF, NL paid, LU PDF, ES paid, PT paid, IT paid, GR HTML, MT HTML, CY HTML, AT paid, HU HTML)
- Source-side **structured access requires contract/subscription**: **5** (FI Virre, SI extended PRS, BG SOAP, RO RECOM, LT JAR full extract for vadovas)
- Source-side **No (free open data omits the field)**: **1** (SG free open data — officers stripped under Companies Act s.12(2A))
- Source-side **Per-MS variable, not in cross-border baseline**: **1** (EU BRIS)
- Source-side **AML-obliged-only restricted (Class D)**: **0** for directors — all true Class D cases are UBO/beneficial-owner registries (LU RBE, AT WiEReG, RCBE, etc.), not director registries. Director registers in the EU remain broadly accessible by statute, though paid or PDF-only in many cases.

---

## Per-country detail

### 1. SE — Swedish Bolagsverket
- **Source URL:** https://bolagsverket.se / https://foretagsinfo.bolagsverket.se / https://api.bolagsverket.se
- **Directors exposed publicly:** Yes (free with OAuth2 client registration)
- **Access tier:** Free REST/JSON API (OAuth 2.0), 60 req/min. Launched as HVD ("Värdefulla datamängder") on 3 Feb 2025 under EU Open Data Directive. Detailed person-level data (funktionärer with birth dates, personnummer) via the older Näringslivsregistret API.
- **Canonical field name:** **"Funktionärer"** — collective term for representatives. Sub-roles: `Styrelseledamot`, `Verkställande direktör`, Bolagsverket-utsedda likvidatorer, konkursförvaltare.
- **API endpoint:** `https://api.bolagsverket.se/` (HVD), Företagsinformation API for full person detail. Free downloadable HVD files also available.
- **Citation URLs:**
  - https://bolagsverket.se/apierochoppnadata/vardefulladatamangder/apiforvardefulladatamangder.5513.html
  - https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/apiforatthamtaforetagsinformation.3988.html
  - https://www.dataportal.se/datasets/612_5428
- **Notes:** HVD launch (3 Feb 2025) made underlying data fee-free; client registration + OAuth2 still required. Full natural-person funktionärer detail is on the Näringslivsregistret/Företagsinformation API, not the slim HVD bundle.

### 2. NO — Norwegian Brønnøysund (Brreg)
- **Source URL:** https://www.brreg.no / https://data.brreg.no
- **Directors exposed publicly:** Yes (free, no auth for name + birth date; auth required for fødselsnummer)
- **Access tier:** Open REST API, no key required. Maskinporten-secured variant for full personal identifiers.
- **Canonical field name:** **"Roller"** / **"Rolleinnehaver"**. Role group `STYRE` covers `styreleder`, `nestleder`, `styremedlem`, `varamedlem`, `observatør`. Also `daglig leder`, `kontaktperson`, `prokura`, `signatur`.
- **API endpoint:**
  - Public: `https://data.brreg.no/enhetsregisteret/api/enheter/{orgnr}/roller`
  - Maskinporten-authenticated (with scope `brreg:data:enhetsregisteret:roller:person:oppslag:fnr`): `https://data.brreg.no/enhetsregisteret/autorisert-api/enheter/{orgnr}/roller`
- **Citation URLs:**
  - https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html
  - https://www.brreg.no/en/use-of-data-from-the-bronnoysund-register-centre/datasets-and-api/roles-in-the-organisation/
- **Notes:** Gold-standard reference for free director data exposure in the Nordics. Name + birth date is genuinely no-auth.

### 3. DK — Danish CVR / Erhvervsstyrelsen
- **Source URL:** https://datacvr.virk.dk / http://distribution.virk.dk/cvr-permanent
- **Directors exposed publicly:** Yes (free, but requires registration with Erhvervsstyrelsen — ~3-week processing time)
- **Access tier:** Free Elasticsearch-style API after credentialing. Application via email `cvrselvbetjening@erst.dk`. Web UI fully public/free.
- **Canonical field name:** **"Deltagere"** (participants; ~1.7M individuals). Sub-roles: `Administrerende direktør`, `Bestyrelsesformand`, `Bestyrelsesmedlem`. Reelle ejere (beneficial owners) carved out post-CJEU WM Luxembourg. Personroller is the role-on-participant nomenclature.
- **API endpoint:** `POST http://distribution.virk.dk/cvr-permanent/deltager/_search` (Basic Auth). Company-side: `cvr-permanent/virksomhed/_search` (returns nested personroller).
- **Citation URLs:**
  - https://datacvr.virk.dk/artikel/system-til-system-adgang-til-cvr-data
  - https://datacvr.virk.dk/data/cvr-help
  - https://brokk-sindre.github.io/cvr-documentation/api-reference/overview/
- **Notes:** "Free" but credentialed. Third-party wrapper `cvrapi.dk` is a separate commercial product, not the official feed.

### 4. FI — Finnish PRH
- **Source URL:** https://www.prh.fi / https://avoindata.prh.fi
- **Directors exposed publicly:** **No on the free v3 open-data API**; paid via Virre per-extract.
- **Access tier:** Free YTJ-API v3 covers company-level fields only. Officer/board data via paid Virre service or Trade Register extract (~€10–€30). Beneficial-owner data explicitly carved out from public access.
- **Canonical field name:** **"Vastuuhenkilöt"** (responsible persons) — `hallituksen jäsen`, `toimitusjohtaja`, `prokuristi`, `nimenkirjoitusoikeus`.
- **API endpoint:**
  - Open (no persons): `https://avoindata.prh.fi/opendata-ytj-api/v3/companies`
  - Schema confirms no person nodes: `https://avoindata.prh.fi/opendata-ytj-api/v3/schema?lang=en`
  - For directors: paid Virre service (https://virre.prh.fi/)
- **Citation URLs:**
  - https://www.prh.fi/en/companiesandorganisations/rekisterointipalvelut/rekisterin_tietosisalto.html
  - https://www.prh.fi/en/companiesandorganisations/tietopalvelut.html
  - https://avoindata.prh.fi/opendata-ytj-api/v3/schema?lang=en
- **Notes:** The awkward gap in the Nordic set. v3 schema (verified May 2026) has no nested person objects. Strale's `finnish-company-data` cannot return vastuuhenkilöt from the free API; if it does, it is either via Virre (paid) or scraping.

### 5. UK — UK Companies House
- **Source URL:** https://find-and-update.company-information.service.gov.uk
- **Directors exposed publicly:** Yes (free with free API key)
- **Access tier:** Free REST API; key at developer.company-information.service.gov.uk. Rate-limited 600 req/5min. Web UI fully public.
- **Canonical field name:** **"Officers"** (`officerList` resource). Roles: `director`, `secretary`, `llp-member`, `llp-designated-member`, `nominee-director`, `corporate-director`. PSC ("Persons with Significant Control") is separate but adjacent.
- **API endpoint:** `GET https://api.company-information.service.gov.uk/company/{company_number}/officers`. Per-officer: `/company/{company_number}/appointments/{appointment_id}`. PSC: `/company/{company_number}/persons-with-significant-control`.
- **Citation URLs:**
  - https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/officers/list
  - https://developer.company-information.service.gov.uk/
  - https://www.api.gov.uk/ch/companies-house/
- **Notes:** Cleanest free-with-key feed. Returns name, role, appointed/resigned, nationality, occupation, partial DOB (month/year only — full DOB redacted since Small Business Act 2015).

### 6. IE — Irish CRO (Companies Registration Office)
- **Source URL:** https://opendata.cro.ie / https://search.cro.ie
- **Directors exposed publicly:** Partial — basic company records via open data portal; full director history via paid CORE per-document.
- **Access tier:** CKAN-based portal launched Apr 2025, DCAT-AP HVD-compliant, free bulk download + REST API for company records and financial statements. Document retrieval (B10 director-change forms) remains pay-per-call on CORE.
- **Canonical field name:** **"Directors"** / **"Officers"** (also `Secretary`). CRO uses English-language terms.
- **API endpoint:**
  - Open Data Portal: `https://opendata.cro.ie/dataset/companies` (Company Records bulk + CKAN datastore API)
  - CRO Open Services: `https://services.cro.ie/cws/companies` (REST search)
  - Paid CORE: https://core.cro.ie/
- **Citation URLs:**
  - https://opendata.cro.ie/dataset/companies
  - https://cro.ie/services-and-help/access-to-cro-data/
  - https://cro.ie/the-companies-registration-office-cro-announces-the-launch-of-new-open-data-portal/
- **Notes:** Could not verify whether the bulk Company Records dataset includes structured director person-rows or only company-level data. CRO Open Services REST API documentation enumerates only "company names, addresses, Eircodes, registration dates and statuses" — no directors field documented. **Likely state: directors filed publicly (B10) but the structured bulk feed surfaces company-level fields; person-level enumeration requires CORE document purchase or scraping search.cro.ie HTML.** Follow-up: direct fetch of the dataset schema CSV header.

### 7. FR — French INPI RNE / Annuaire des Entreprises
- **Source URL:** https://data.inpi.fr ; https://annuaire-entreprises.data.gouv.fr ; https://entreprise.api.gouv.fr
- **Directors exposed publicly:** Yes (free with INPI registration; unauthenticated public UI). Subject to `diffusibilité` rules.
- **Access tier:** Free INPI RNE API (account + EULA); free unauthenticated UI on annuaire-entreprises; free JSON/PDF via INPI SFTP bulk. Privileged `API Entreprise` is admin-only.
- **Canonical field name:** **"Représentants"** / **"Représentants légaux"** (INPI RNE schema + Annuaire UI); also **"Dirigeants"** in the Annuaire UI heading.
- **API endpoint:**
  - INPI RNE: `https://registre-national-entreprises.inpi.fr/api/companies/{siren}` (auth required)
  - Open aggregator: `https://recherche-entreprises.api.gouv.fr/search` — returns `dirigeants[]` array (no auth)
- **Citation URLs:**
  - https://data.inpi.fr/content/editorial/Acces_API_Entreprises
  - https://www.inpi.fr/ressources/formalites-dentreprises/acces-lapi-formalite-rne
  - https://annuaire-entreprises.data.gouv.fr/donnees/api-entreprises
  - https://entreprise.api.gouv.fr/catalogue/inpi/rne/beneficiaires_effectifs
- **Notes:** INSEE Sirene Open Data explicitly EXCLUDES représentants légaux per Art. R 123-232 Code de commerce — director data flows only via the INPI RNE channel (post-2023 unification, replacing RCS). Natural persons can opt out of diffusion (`diffusibleCommercialement` flag) — non-diffusible records must not be redistributed. UBOs require privileged API Entreprise. The free `recherche-entreprises.api.gouv.fr` aggregator does return `dirigeants` for diffusible records.

### 8. DE — German Handelsregister / Unternehmensregister
- **Source URL:** https://www.handelsregister.de ; https://www.unternehmensregister.de ; https://offeneregister.de
- **Directors exposed publicly:** Yes (free, unauthenticated since 1 August 2022 — DiRUG reform transposing EU Digitalisation Directive 2019/1151)
- **Access tier:** Free web UI + free PDF document download (Aktueller Ausdruck / Chronologischer Ausdruck / Historischer Ausdruck / shareholder lists). No official structured JSON API. Third-party scraping APIs (handelsregister.ai, OpenRegister, Apify) fill the gap.
- **Canonical field name:** **"Vertretungsberechtigte"** (catch-all). Specific roles: **"Geschäftsführer"** (GmbH), **"Vorstand"** (AG), **"Prokurist"** (registered procurator). Cover-sheet field typically "Vertretung" / "Vertretungsregelung".
- **API endpoint:** No first-party REST. Search: `https://www.handelsregister.de/rp_web/normalesuche.xhtml` returning AD PDFs per entity.
- **Citation URLs:**
  - https://www.handelsregister.de/
  - https://www.bmjv.de/DE/themen/wirtschaft_finanzen/handels_gesellschaftsrecht/handelsregister/handelsregister_node.html
  - https://docs.openregister.de/sources/handelsregister
- **Notes:** 2022 reform eliminated the €4.50/document fee and opened director data publicly. The legal reform happened; the API did not. Every consumer must parse the AD-PDF. Geburtsdatum (DOB) and Wohnort (residence) of natural-person directors are included.

### 9. NL — Dutch KVK / Handelsregister
- **Source URL:** https://www.kvk.nl ; https://developers.kvk.nl
- **Directors exposed publicly:** Restricted — **not** in the free KVK API tier; available only via paid Uittreksel Handelsregister (~€2.85 online) or paid Basisprofiel API subscription.
- **Access tier:** Paid web UI (Uittreksel) ; paid KVK API subscription (monthly + per-query, requires Dutch registered entity to subscribe). Free tier strips PII (directors, shareholders, UBOs, personal addresses).
- **Canonical field name:** **"Functionarissen"** (officers) / **"Bestuurders"** (board members). Used in KVK developer-portal release notes and Basisprofiel data block.
- **API endpoint:** `https://api.kvk.nl/api/v1/basisprofielen/{kvkNummer}` (subscription required). `functionarissen` data block exists in the Basisprofiel notification schema.
- **Citation URLs:**
  - https://developers.kvk.nl/documentation
  - https://developers.kvk.nl/documentation/basisprofiel-api
  - https://www.kvk.nl/en/ordering-products/kvk-api/
- **Notes:** Dutch policy: natural persons not retrievable for free. KVK monetizes the Uittreksel. Foreign institutions without an NL presence cannot subscribe to production API directly — must use reseller, Dutch entity, or paid web flow.

### 10. BE — Belgian CBE / KBO (Crossroads Bank for Enterprises)
- **Source URL:** https://kbopub.economie.fgov.be ; https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises
- **Directors exposed publicly:** Yes (free) — but narrow. Current functions only; no former directors, no DOB, no residence.
- **Access tier:** Free Public Search web UI; free Public Search Web Service (SOAP); free CBE Open Data downloads (CSV monthly).
- **Canonical field name:** French **"Fonctions"** / Dutch **"Functies"** / sometimes "Mandataires". Open Data CSV file literally named `function.csv`.
- **API endpoint:**
  - SOAP: described at https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-public-search-web-service
  - Open Data: https://kbopub.economie.fgov.be/kbo-open-data/
  - Strale consumes via third-party cbeapi.be wrapper
- **Citation URLs:**
  - https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/consultation-and-research-data/cbe-public-search
  - https://kbopub.economie.fgov.be/kbo-open-data/login
- **Notes:** Returns function (e.g. "Administrateur délégué") with full natural-person name and national-ID-derived identifier, but **NO** DOB, residence, nationality, or historic-director records. Reverse-lookup (director → company) blocked. For KYB this means BE-via-KBO confirms current officers exist + names but supplies less PII than DE's Aktueller Ausdruck.

### 11. CH — Swiss Zefix / Cantonal Commercial Registers
- **Source URL:** https://www.zefix.ch ; https://www.zefix.admin.ch
- **Directors exposed publicly:** Yes (free, unauthenticated; fully open by constitutional design)
- **Access tier:** Free web UI ; free public REST API ; free LINDAS SPARQL endpoint ; free download of certified PDF extracts from cantonal portals.
- **Canonical field name:** DE **"Verwaltungsrat"** (board), **"Personen"** / **"Eingetragene Personen"**, **"Zeichnungsberechtigte"** (signatories). FR **"Conseil d'administration"** / **"Personnes inscrites"**. With role + signing authority qualifier (Einzelunterschrift / Kollektivunterschrift zu zweien).
- **API endpoint:** `https://www.zefix.admin.ch/ZefixPublicREST/api/v1/company/uid/{uid}` — returns company core. Full board/signatory detail often requires fetching the cantonal-register HR-extract PDF (Zefix REST v1 has limited person fields).
- **Citation URLs:**
  - https://www.zefix.admin.ch/ZefixPublicREST/swagger-ui/index.html
  - https://opendata.swiss/en/dataset/zefix-zentraler-firmenindex
- **Notes:** Most open in Western Europe. Full director name, function, citizenship/place-of-origin, signature authority publicly inspectable for free. Watch out: Zefix REST is a federal index; authoritative person records live in 26 cantonal registers and are sometimes only available as PDF.

### 12. LU — Luxembourg Business Registers / RCS
- **Source URL:** https://www.lbr.lu
- **Directors exposed publicly:** Yes (free for read access, no account required for unrestricted PDF viewing; certified extracts paid)
- **Access tier:** Free web UI search; free PDF document download (company file, articles, management appointments). Paid certified Extrait (~€7-10). No public REST API of record — third-party (Topograph) wraps web flow.
- **Canonical field name:** **"Dirigeants"** (managers/directors). Sub-categories: **"gérant"** (SARL), **"administrateur"** (SA), **"président du conseil d'administration"**, **"délégué à la gestion journalière"**.
- **API endpoint:** No first-party REST. Web search at `https://www.lbr.lu/mjrcs-rcsl/jsp/secured/IndexActionNotSecured.action`.
- **Citation URLs:**
  - https://www.lbr.lu/
  - https://lbrcontent.public.lu/fr/help/help-order.html
  - https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en
- **Notes:** Unusually open for Benelux. Directors' full names, addresses (often professional), and roles in public Extrait, downloadable PDF for free. RBE (UBO register) partially closed after CJEU C-37/20, reopened Feb 2024 to legitimate-interest parties — UBO data is now AML-gated, director data via RCS remains fully public. No JSON API means structured consumers scrape or buy from Topograph.

### 13. ES — Spanish Registradores / Registro Mercantil
- **Source URL:** https://sede.registradores.org ; https://opendata.registradores.org ; https://www.rmc.es
- **Directors exposed publicly:** Yes (paid)
- **Access tier:** Paywalled web UI / per-document fees. Inscription consultation listing administrator/officer appointments: €0.601012. "Nota Informativa Mercantil" (resume + administrators + legal reps + accounts): €3.304566. Open Data portal publishes quarterly aggregates (no director fields). BORME publishes appointment/cessation notices in PDF.
- **Canonical field name:** **"Administradores"** and **"Cargos"** (verbatim). Spanish Civil/Commercial Code uses "administradores" for directors; the registry index titled "Inscripción de actos y documentos relacionados con administradores y cargos".
- **API endpoint:** None public. Commercial aggregators (Informa D&B, Axesor, eInforma) resell via private APIs.
- **Citation URLs:**
  - https://sede.registradores.org/site/mercantil?lang=en_EN
  - https://www.rmc.es/infgeneral.aspx?lang=en
  - https://www.registram.es/inscripcion-de-actos-y-documentos-relacionados-con-administradores-y-cargos-en-el-registro-mercantil
- **Notes:** Textbook "paid, no API" case. Directors reachable but only via €0.60–€3.30 paid lookups. EU BRIS exposes only minimum BRIS fields — not full director list.

### 14. PT — Portuguese IRN / Registo Comercial
- **Source URL:** https://registo.justica.gov.pt ; https://publicacoes.mj.pt
- **Directors exposed publicly:** Yes (paid for current roster; free for event-level publications)
- **Access tier:** **Certidão Permanente** is canonical directors document — includes "órgãos de administração". Subscription "código de acesso": **€25 (1 yr) / €40 (2 yr) / €70 (3 yr) / €100 (4 yr)**. The IRN **publicações** site (`publicacoes.mj.pt`) is free, publishing appointment/cessation acts as searchable notices — director names appear but as event publications, not queryable current-officers list.
- **Canonical field name:** **"Membros dos órgãos sociais"** (umbrella); role-specific **"Gerentes"** (Lda) and **"Administradores"** (SA). Publicações labels by act type (designação / cessação de funções).
- **API endpoint:** No public REST. Certidão Permanente HTML/PDF behind access code.
- **Citation URLs:**
  - https://registo.justica.gov.pt/Empresas/Consultar-Certidao-Permanente
  - https://www2.gov.pt/espaco-empresa/empresa-online/consultar-a-certidao-permanente
- **Notes:** RCBE (Registo Central do Beneficiário Efetivo) is separate UBO register, not publicly searchable for natural-person UBO names without legitimate interest. Director data lives strictly in Certidão Permanente or publicações.

### 15. IT — Italian Registro Imprese / InfoCamere
- **Source URL:** https://www.registroimprese.it ; https://accessoallebanchedati.registroimprese.it/abdo/en/api
- **Directors exposed publicly:** Yes (paid)
- **Access tier:** Paid via **Telemaco** subscription (consumer) or **InfoCamere API** (B2B). Directors live in **Visura Ordinaria** (~€8) and dedicated **Visura Amministratori** (~€3–4). Free queries return only name, REA, status, address.
- **Canonical field name:** **"Cariche"** (current and historical positions) and **"Amministratori"**. Official page titled "Cariche attuali e storiche". Per-position "cariche sociali" / "esponenti" with roles (Amministratore Unico, Presidente del CdA, Consigliere Delegato).
- **API endpoint:** InfoCamere Accesso alle Banche Dati: https://accessoallebanchedati.registroimprese.it/abdo/en/api (`getElencoSoci`, `getVisuraOrdinaria`). Paid, contract-based. italian-business-register.openapi.com is a third-party reseller, not canonical.
- **Citation URLs:**
  - https://www.registroimprese.it/cariche-attuali-e-storiche
  - https://accessoallebanchedati.registroimprese.it/abdo/en/api?lang=en
- **Notes:** UBO register (Registro dei Titolari Effettivi) operational with Consiglio di Stato ruling 2024–2026 — separate from director data.

### 16. GR — Greek GEMI / GEMH
- **Source URL:** https://www.businessportal.gr ; https://publicity.businessportal.gr
- **Directors exposed publicly:** Yes (free by statute)
- **Access tier:** Free public web UI at `publicity.businessportal.gr`. Greek law (amended GEMI law) explicitly: any party may access, download, store and reproduce free of charge any document/information published. Free search supports role-based queries — filter natural persons by role. Certified extracts (πιστοποιητικά) require login + fee.
- **Canonical field name:** **"Διοίκηση"** (administration) umbrella; **"Διοικητικό Συμβούλιο"** (Board of Directors, AE); **"Διαχειριστές"** (managers, EPE/IKE); **"Εκπρόσωποι"** (legal representatives). Publicity search advertises filter on "ρόλος φυσικού προσώπου" (role of natural person).
- **API endpoint:** No documented free public REST. `services.businessportal.gr` hosts authenticated services for registrants. companycheck.biz and Kyckr resell official extracts.
- **Citation URLs:**
  - https://publicity.businessportal.gr/
  - https://www.businessportal.gr/en/publicity/
  - https://www.gov.gr/en/upourgeia/upourgeio-anaptuxes/anaptuxes/stoikheia-demosiotetas-emporikon-epikheireseon-eggegrammenon-sto-geme
- **Notes:** Best free-by-statute regime in Southern Europe. Lack of API means scraping/HTML extraction is the implementation path — Strale's Tier-1 doctrine forbids; Tier-2 vendor consumption viable per DEC-20260428-A given statutorily public data.

### 17. MT — Malta Business Registry
- **Source URL:** https://mbr.mt ; https://registry.mbr.mt
- **Directors exposed publicly:** Yes (free basic; paid for full documents)
- **Access tier:** Free basic search without account at `register.mbr.mt/app/query/search_for_company` — returns name, registration date/number, status, **officers (directors and secretaries)**, registered address, shareholder names with share type. Annual accounts, BO extracts, full documents at per-document fees (~€5).
- **Canonical field name:** **"Directors"** and **"Company Secretary"** (English-medium). MBR "DIRECTORS AND COMPANY SECRETARY" promo/help page uses these terms verbatim.
- **API endpoint:** No documented public REST. Web UI at register.mbr.mt. Kyckr and OpenCorporates resell.
- **Citation URLs:**
  - https://mbr.mt/promo/company-search/
  - https://mbr.mt/promo/directors-and-company-secretary/
  - https://register.mbr.mt/
- **Notes:** Malta UBO register operates separate Legitimate Interest Access model at €5/request — applies to UBO data, not directors. Director access meaningfully free.

### 18. CY — Cyprus DRCOR
- **Source URL:** https://www.companies.gov.cy ; https://efiling.drcor.mcit.gov.cy
- **Directors exposed publicly:** Yes (free for current officer names; paid for full filings/history)
- **Access tier:** Free public search at `efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx` returns officers (names of directors and secretary), registered address, incorporation date/number, legal status — no registration. Detailed search (€10/company) unlocks current + resigned officers history, shareholders, mortgage/charge, document images.
- **Canonical field name:** **"Officers"** (umbrella covering Directors and Secretary); **"Directors"** / **"Secretary"** individually. Cyprus operates EN/EL; e-search UI uses English terms.
- **API endpoint:** No public REST. Web UI only. Know Your Customer Ltd, Kyckr maintain private integrations.
- **Citation URLs:**
  - https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx?sc=0&cultureInfo=en-AU
  - https://www.companies.gov.cy/en/21-eservices/esearch-in-business-entity-s-registry
- **Notes:** Second-best free tier in Southern Europe after GR. Current officers visible without payment; history needs €10 detailed search.

### 19. PL — Polish KRS
- **Source URL:** https://prs.ms.gov.pl/krs/openApi ; https://api-krs.ms.gov.pl
- **Directors exposed publicly:** Yes (free) — but personal names anonymized in JSON
- **Access tier:** Free public REST API (no key). JSON returns structured `reprezentacja` block with board members. Free PDF "Odpis Aktualny" returns full non-anonymized names.
- **Canonical field name:** **"Sposób reprezentacji"** + **"Reprezentacja"**; board members under section 6 of KRS as "Organ uprawniony do reprezentacji podmiotu" / "Skład organu".
- **API endpoint:** `GET https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/{krs}?rejestr=P&format=json`
- **Citation URLs:**
  - https://prs.ms.gov.pl/krs/openApi
  - https://dane.gov.pl/en/dataset/27606,api-krajowego-rejestru-sadowego-api-krs
  - https://www.gov.pl/web/sprawiedliwosc/uruchomienie-otwartego-api-krajowego-rejestru-sadowego
- **Notes:** JSON anonymizes names ("nazwisko": "L\*\*\*\*\*\*", PESEL first digit only) per GDPR carve-out; PDF (also free via same API) contains full names. For KYB use, parse PDF or pair with name-bearing dataset.

### 20. CZ — Czech ARES (v3, post-2023 unified)
- **Source URL:** https://ares.gov.cz ; https://or.justice.cz
- **Directors exposed publicly:** Yes (free)
- **Access tier:** Free public REST API v3 (ARES); free web UI at or.justice.cz. Open data dumps via data.mf.gov.cz.
- **Canonical field name:** **"Statutární orgán"** (statutory body); members **"Členové statutárního orgánu"**; s.r.o. role **"Jednatel"**; representation rule **"Způsob jednání"**.
- **API endpoint:** `GET https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`. "VR" view returns statutory body members. Swagger: https://ares.gov.cz/swagger-ui/
- **Citation URLs:**
  - https://ares.gov.cz/stranky/vyvojar-info
  - https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/v3/api-docs
  - https://data.mf.gov.cz/topics/ares
- **Notes:** Post-2023 reform unified ARES as entry point. Federates Commercial Register data including each statutory body member's name, address, role, dates, representation rule.

### 21. SK — Slovak RPO (statistics.sk)
- **Source URL:** https://rpo.statistics.sk ; https://www.orsr.sk
- **Directors exposed publicly:** Yes (free)
- **Access tier:** Free public REST API v2 (RPO at api.statistics.sk); weekly SQL dumps. orsr.sk remains free web-only UI on Commercial Register.
- **Canonical field name:** **"Štatutárny orgán"** (statutory body), with **"Konajúce osoby"** / **"Štatutári"** as member listing; representation rule **"Spôsob konania"**.
- **API endpoint:** `GET https://api.statistics.sk/rpo/v1/search` and `GET https://api.statistics.sk/rpo/v1/legal-entities/{id}`. Docs: https://susrrpo.docs.apiary.io/
- **Citation URLs:**
  - https://susrrpo.docs.apiary.io/
  - https://data.slovensko.sk/datasety/b2325a3a-e702-47d0-8fa1-13739f3d2370
- **Notes:** RPO is canonical aggregator across 70+ source registers. orsr.sk web UI shows same data but HTML-only.

### 22. AT — Austrian Firmenbuch
- **Source URL:** https://justizonline.gv.at ; https://www.firmenbuch.justiz.gv.at
- **Directors exposed publicly:** Yes (paid for full Auszug; free name-only basic search)
- **Access tier:** Paywalled — full company extract ("Firmenbuchauszug") at statutory fee (~€3–10) via JustizOnline or authorized clearinghouses (auszug.at, Compass). No free open-data feed for officers.
- **Canonical field name:** **"Vertretungsbefugte"** (authorized representatives); **"Geschäftsführer"** (GmbH); **"Vorstand"** (AG); representation rule **"Art der Vertretungsbefugnis"**.
- **API endpoint:** No free public API. Commercial: https://api.auszug.at/, https://api.wirtschaftscompass.at/de/dokumentation (state-authorized resellers).
- **Citation URLs:**
  - https://justizonline.gv.at/jop/web/firmenbuchabfrage
  - https://www.justiz.gv.at/service/datenbanken/firmenbuch.36f.de.html
  - https://api.auszug.at/
- **Notes:** WiEReG (UBO register) access tightened Oct 2025 (AML-obliged + qualifying parties only); Firmenbuch directors remain accessible to anyone willing to pay. No EU BRIS path bypasses the fee.

### 23. HU — Hungarian e-cégjegyzék
- **Source URL:** https://e-cegjegyzek.hu ; https://www.e-cegkozlony.gov.hu
- **Directors exposed publicly:** Yes (free, web UI only)
- **Access tier:** Free public web search at e-cegjegyzek.hu returns Article-2 Directive 2009/101/EC fields. Detailed extracts ("cégkivonat") with full historic officer data are paid. No documented public REST API.
- **Canonical field name:** **"Vezető tisztségviselő"** (executive officer); **"Képviselő"** (representative) / **"Képviseletre jogosult"**.
- **API endpoint:** None public. e-cegkozlony.gov.hu publishes Companies Gazette (changes including officer appointments) as searchable PDFs.
- **Citation URLs:**
  - https://www.e-cegjegyzek.hu/
  - https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/hu_en
- **Notes:** Hungary tightened data access since 2020. Free HTML UI shows "vezető tisztségviselő" line on the free company info page. Bulk/API access requires service contract with Igazságügyi Minisztérium.

### 24. EE — Estonian Ariregister
- **Source URL:** https://ariregister.rik.ee ; https://avaandmed.ariregister.rik.ee
- **Directors exposed publicly:** Yes (free)
- **Access tier:** Free open-data downloads (daily, JSON/XML/CSV) — 8 datasets, plus free public web search. Programmatic API requires free signed agreement with RIK (except autocomplete + e-invoice recipients).
- **Canonical field name:** **"Juhatuse liikmed"** (board members); representation rule **"Esindusõigus"** / **"Esindusõiguse erisus"**.
- **API endpoint:**
  - Open data: https://avaandmed.ariregister.rik.ee/en/downloading-open-data (dataset `ettevotja_rekvisiidid_*.json.zip` + dedicated officers dataset)
  - XML/REST: https://ariregister.rik.ee/eng/xml_queries
- **Citation URLs:**
  - https://avaandmed.ariregister.rik.ee/en/open-data-api/introduction-api-services
  - https://www.rik.ee/en/e-business-register/company-registration-api
- **Notes:** Best-in-class transparency. Bulk downloads include board members with full names, Estonian personal codes, addresses, roles, start dates.

### 25. LV — Latvian Uznemumu reģistrs
- **Source URL:** https://www.ur.gov.lv ; https://data.gov.lv ; https://dati.ur.gov.lv
- **Directors exposed publicly:** Yes (free)
- **Access tier:** Free open-data downloads (CSV/XLSX, daily) via dati.ur.gov.lv and data.gov.lv CKAN. Officers dataset published as separate file alongside entities master.
- **Canonical field name:** **"Amatpersonas"** (officers); board member **"Valdes loceklis"**; representation rights typically column **"paraksttiesibas"**.
- **API endpoint:** CKAN dataset listing at https://data.gov.lv/dati/lv/dataset/uz (incl. `amatpersonas` CSV). Direct downloads from dati.ur.gov.lv.
- **Citation URLs:**
  - https://www.ur.gov.lv/en/specialized-information/open-data/
  - https://data.gov.lv/dati/lv/dataset/uz
- **Notes:** Strongest open-data posture in the Baltics. Full officer names, personal codes (last 4 digits redacted post-2022), roles, representation rights published daily under open license.

### 26. LT — Lithuanian Registru centras (JAR / JADIS)
- **Source URL:** https://www.registrucentras.lt/jar/p ; https://data.gov.lt
- **Directors exposed publicly:** Partial — free for participants/governing-body members via JADIS open data; **paid** for single vadovas via full JAR extract.
- **Access tier:** Free open dataset on data.gov.lt (Spinta API) — `juridiniu-asmenu-dalyviu-duomenys-is-jadis` covers JADIS participants/governing-body members for 8 entity types. Full JAR commercial extract with director ("vadovas") detail is paid.
- **Canonical field name:** **"Vadovas"** (single executive head); **"Valdymo organas"** / **"Kolegialaus valdymo organo narys"** (governing body member); representation rule **"Atstovavimas"**.
- **API endpoint:** Spinta API: https://data.gov.lt/datasets/gov/rc/jadis/... (CKAN discovery at https://data.gov.lt/public/api/1/). Web search at https://www.registrucentras.lt/jar/p_en/
- **Citation URLs:**
  - https://data.gov.lt/dataset/juridiniu-asmenu-dalyviu-duomenys-is-jadis?lang=en
  - https://www.registrucentras.lt/p/1108
- **Notes:** JADIS covers governing-body members + shareholders. JANGIS adds UBOs. Single executive "vadovas" most reliably via paid JAR extract; free Spinta feed favours governing-body members over the single-director slot.

### 27. HR — Croatian Sudreg
- **Source URL:** https://sudreg.pravosudje.hr ; https://sudreg-podaci.pravosudje.hr
- **Directors exposed publicly:** Yes (free)
- **Access tier:** Free public REST API ("Sudreg API") via Open Data Portal — free registration for non-government use; full open API for state bodies. Free web UI for individual lookups.
- **Canonical field name:** **"Osobe ovlaštene za zastupanje"** (persons authorized for representation); rule **"Način zastupanja"**.
- **API endpoint:** `GET https://sudreg-api.pravosudje.hr/javni/subjekt_detalji?tip_identifikatora=oib&identifikator={oib}` — returns `osobe_ovlastene_za_zastupanje` array (name, OIB, residence, role, manner of representation). Docs: https://sudreg-podaci.pravosudje.hr/docs/services
- **Citation URLs:**
  - https://sudreg-podaci.pravosudje.hr/docs/services
  - https://sudreg-data.gov.hr/ords/r/srn_rep/116/files/static/v10/Upute%20za%20razvojne%20in%C5%BEenjere%20-%20v3.0.0.pdf
- **Notes:** Excellent structured exposure — name, surname, OIB, residence, role, start/end dates all returned. Open license via data.gov.hr.

### 28. SI — Slovenian AJPES (PRS)
- **Source URL:** https://www.ajpes.si/prs ; https://podatki.gov.si
- **Directors exposed publicly:** Yes (free for basic web; **contract-gated** for extended REST tier with representatives)
- **Access tier:** Free OPSI open-data CSV/XML — basic PRS dataset (no representatives in public dump). REST API `restPrsInfo` has minimal/narrow/extended/protected tiers — extended/protected (with zastopniki) requires AJPES contract. Free per-company web search at ajpes.si/prs shows zastopniki names.
- **Canonical field name:** **"Zastopniki"** (representatives); **"Člani uprave"** (board, d.d.); **"Direktor"** / **"Poslovodja"** (d.o.o.); rule **"Način zastopanja"**.
- **API endpoint:** Basic: https://www.ajpes.si/prs and https://wwwa.ajpes.si/restPrsInfo/find (extended tier auth-gated). OPSI open dataset: https://podatki.gov.si/dataset/poslovni-register-slovenije
- **Citation URLs:**
  - https://www.ajpes.si/Doc/AJPES/Za_razvijalce/restPrsInfo_Documentation_for_DevOps.pdf
  - https://podatki.gov.si/dataset/poslovni-register-slovenije
- **Notes:** Free web UI shows zastopniki; programmatic access via API requires contracting extended tier from AJPES — not paid per call, but contract-gated.

### 29. BG — Bulgarian Trade Register (BRRA)
- **Source URL:** https://portal.registryagency.bg ; https://public.brra.bg
- **Directors exposed publicly:** Yes (free, web UI); structured data via **paid** SOAP web service
- **Access tier:** Free web search at portal.registryagency.bg shows full statutory body. SOAP/XML "TRRegistrationAgency" web service exists for authorized integrators (paid subscription). No officially published daily open-data dumps in structured form for officers.
- **Canonical field name:** **"Управители"** (managers, OOD); **"Представители"** (representatives); **"Съвет на директорите"** (board, AD); **"Начин на представляване"** (manner of representation).
- **API endpoint:** SOAP service (paid subscription). No free REST/JSON. Free per-company via portal.registryagency.bg/en/home-cr.
- **Citation URLs:**
  - https://portal.registryagency.bg/en/home-cr
  - https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/bg_en
  - https://e-gov.bg/wps/portal/agency-en/digital-government-infrastructure/information-systems-applications/regix
- **Notes:** Web UI is canonical free path. RegiX (state interoperability gateway) brokers structured access to government bodies. For commercial KYB, licensed BRRA SOAP or reseller required.

### 30. RO — Romanian ONRC
- **Source URL:** https://www.onrc.ro ; https://portal.onrc.ro ; https://data.gov.ro/organization/onrc
- **Directors exposed publicly:** Yes (paid for full extract; free basic name only)
- **Access tier:** Paywalled — full "Furnizare informaţii" / "InfoCert" extract listing administratori costs ~8 RON via portal.onrc.ro (electronic signature required). Free basic search returns name + CUI + status only. ONRC publishes 66 datasets on data.gov.ro — aggregated lists, NOT per-company officer rosters.
- **Canonical field name:** **"Administratori"** (administrators); **"Reprezentanți legali"** (legal representatives); SA also **"Consiliu de administrație"** (board); rule **"Modul de reprezentare"**.
- **API endpoint:** No free public REST. Paid B2B feed via ONRC RECOM service (subscription). Third-party (alertacui.ro) wraps ONRC.
- **Citation URLs:**
  - https://portal.onrc.ro/
  - https://data.gov.ro/organization/onrc
  - https://www.alertacui.ro/verificare-monitorizare-firme/en/api/
- **Notes:** Among the most restrictive in EU for programmatic director access. Free for journalists/public authorities on request; commercial users pay per-extract or via RECOM subscription.

### 31. SG — Singapore ACRA
- **Source URL:** https://www.acra.gov.sg ; https://data.gov.sg (ACRA collection); https://www.bizfile.gov.sg/apimarketplace
- **Directors exposed publicly:** **Partial — bifurcated**. Free open data on data.gov.sg has officer **names stripped** under Companies Act s.12(2A); columns reduced to `no_of_officers` (count). Director/officer names live behind **paid BizFile Business Profile / EIQ APIs**.
- **Access tier:**
  - Free open data via data.gov.sg — company identity only (UEN, entity name, status, address, SSIC codes, audit firms, officer count, former names). Open Data Licence, monthly refresh.
  - Paid Business Profile (S$5.50/report) and EIQ API on BizFile API Marketplace (subscription required) for full officer/position-holder details.
- **Canonical field name:** Free dataset: `no_of_officers` (count only). Paid Business Profile / EIQ surface: **"Position Holders"** (and "Business Owners" / "Partners"). Business Profile API launched 2025-11-18 under EIQ.
- **API endpoint:** Free: data.gov.sg CSVs + datasets API. Paid: BizFile API Marketplace — `Entity Basic Information` and new `Business Profile` endpoints under EIQ.
- **Citation URLs:**
  - https://www.acra.gov.sg/about-bizfile/updates-and-announcements/acra-s-open-data-initiative
  - https://data.gov.sg/datasets/d_8575e84912df3c28995b8e6e0e05205a/view
  - https://www.bizfile.gov.sg/apimarketplace/data-api/eiq/entity-basic-information
  - https://www.acra.gov.sg/news-events/news-announcements/905/
- **Notes:** A free direct-API `sg-company-data` capability **cannot return director names** without moving to paid BizFile EIQ. The current implementation backed by data.gov.sg is structurally officer-name-blind.

### 32. US — Cobalt Intelligence (vendor; aggregates 50 state SoS registries)
- **Vendor URL:** https://www.cobaltintelligence.com
- **Directors exposed (in Cobalt's response):** **Yes, but state-variable**. Officer/director details documented as returned in ~**28 of 50 states**. California explicitly excluded (matches underlying CA SoS restriction). Registered agent broader coverage — **49 states**.
- **Access tier:** Paid commercial API. Monthly subscription with credit/lookup pool; **20 free lookups** for trial.
- **Canonical field name:** Cobalt's blog references an **`officers` array** in JSON response (alongside entity, status, registered agent, filings, screenshots). Stoplight docs require API key login. Multi-state live lookups: 3 credits.
- **API endpoint / docs URL:** https://documentation.cobaltintelligence.com/ ; https://cobaltintelligence.stoplight.io/docs/cobalt-intelligence/0f51bcacc3743-secretary-of-state-api
- **Citation URLs:**
  - https://blog.cobaltintelligence.com/post/does-cobalt-intelligence-api-provide-access-to-secretary-of-state-officer-information
  - https://help.cobaltintelligence.com/article/api-services-and-coverage
  - https://cobaltintelligence.com/blog/post/what-is-cobalt-intelligences-pricing-structure
- **Notes:** Pricing $0.50–$2.00/lookup, e.g. $750 / 1,000 lookups = $0.75/call. Volume-tiered. Field shape reflects state-level reality — Cobalt aggregates SoS websites but cannot synthesise fields the underlying state never publishes (DE, NY, CA restrict; NV/WY open). For Strale-side modelling, treat `officers` as `reliability: rare` (state-conditional) and `registered_agent` as `reliability: common`.

### 33. EU BRIS (cross-border interconnection)
- **Source URL:** https://e-justice.europa.eu/489/EN/business_registers__search_for_a_company_in_the_eu ; https://webgate.ec.europa.eu/e-justice/searchBris.do
- **Directors exposed in cross-border query:** **Per-MS variable, not in free baseline**. Free BRIS baseline restricted to company name, legal form, registered seat, registration number, EUID. Legal representatives, articles of association, annual accounts, capital subscribed listed as "available information filed by the company" — **fetchable only to the extent the originating national register provides them free of charge**. Explicit on e-Justice general-information page: "At the moment you can only request information that the national registers provide free of charge."
- **Access tier:** Free public web portal (no auth). **No public REST API** — federated SOAP-style integration between Member State registers + central platform; end-user access is the e-Justice search page only.
- **Canonical field name:** BRIS/CDM term **"legal representatives"** (mirroring Directive (EU) 2017/1132 art. 14). Directors-disqualification exchange uses separate end-to-end-encrypted MS-to-MS channel, not user-exposed.
- **API endpoint:** Web portal (`searchBris.do`) only. No documented public REST/JSON. Programmatic access: integrate directly with each Member State register or via aggregators.
- **Citation URLs:**
  - https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu/general-information-find-company_en
  - https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/blog/2017/09/19/533365899/Business+Register+Interconnection+System+BRIS
  - https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32020R2244
- **Notes:** BRIS is **not a useful director-data source**. It standardises identity only. Director coverage across EU MS still requires per-country integration where the national register exposes legal reps free. Digitalisation Directive II expands cross-border dataset but director harmonisation across all 27 MS not yet live. Useful as `EUID` cross-referencing.

---

## Openapi.com product matrix (cross-cutting layer for AT/BG/CY/HU/IT/LU/MT/NL/PT/RO/ES)

Strale routes 11 countries through Openapi.com as the upstream vendor. Per the public product catalog:

| Product | Coverage | Directors exposed? | Field name | Price |
|---------|----------|--------------------|------------|-------|
| WW-Top (Worldwide) | "All countries" (no enumerated list) | **No** | — | €0.07–€0.13 + VAT |
| WW-Advanced (Worldwide) | Same global footprint, fewer points | **No** | — | €0.05–€0.11 + VAT |
| IT-Advanced (Italy) | Italy | **No** (no `amministratori` / `cariche`) | — | €0.028–€0.10 + VAT |
| ES-Advanced (Spain) | Spain | **No** | — | €0.05–€0.11 + VAT |
| PT-Advanced (Portugal) | Portugal | **No** | — | €0.05–€0.11 + VAT |
| **IT-Stakeholders** (Italy) | Italy only | **Yes** | `name`, `surname`, `role` (codes `AUN`, `PP`), `taxCode`, DOB, place of birth | €0.095–€0.20 + VAT |
| **Current Company Representatives Report — Italy** (DocuEngine) | Italy only | **Yes** (report-style, not real-time JSON) | name, tax code, birth details, residence, "positions held" | €2.30 + VAT |

**Per-country exposure via Openapi (Strale's 11 mediated countries):**

| Country | Strale's likely Openapi product | Directors in that product? | Field name |
|---------|-------------------------------|---------------------------|------------|
| AT | WW-Top | **No** | — |
| BG | WW-Top | **No** | — |
| CY | WW-Top | **No** | — |
| HU | WW-Top | **No** | — |
| IT | IT-Stakeholders **or** Current Representatives Report | **Yes** | `role` (`AUN`, `PP`), `name`, `surname`, `taxCode` |
| LU | WW-Top | **No** | — |
| MT | WW-Top | **No** | — |
| NL | WW-Top | **No** | — |
| PT | PT-Advanced or WW-Top | **No** | — |
| RO | WW-Top | **No** | — |
| ES | ES-Advanced or WW-Top | **No** | — |

**Key findings on Openapi:**
1. **Director exposure on Openapi is essentially Italy-only.** Only `IT-stakeholders` and the `Current Company Representatives Report — Italy` (DocuEngine) publish director schemas.
2. **No non-Italian Stakeholders or Representatives SKU is published** on the public catalog. No `ES-Stakeholders`, `PT-Stakeholders`, `NL-Stakeholders`, `WW-Stakeholders`.
3. **WW-Top and `*-Advanced` schemas don't surface officers.** ~40 data points across WW-Top, WW-Advanced, IT-Advanced, ES-Advanced, PT-Advanced — never names a director/officer field. Shareholders appear only in IT-Advanced (≥10% holders if statements filed).
4. **Implication for Strale:** For the 10 non-Italian countries routed through Openapi (AT, BG, CY, HU, LU, MT, NL, PT, RO, ES), **Openapi's public catalog does not expose a product Strale could subscribe to that returns director data**. KYB capabilities promising directors for those countries via Openapi cannot be met by Openapi alone — they need a different upstream (national registry direct, Topograph-class aggregator, or per-country specialist like Informa D&B / Cribis / Iberinform / eInforma).
5. **Could not verify** (paywalled developer console): whether WW-Top JSON carries an undocumented `officers` / `representatives` array for some countries via upstream sources. Openapi puts the full OpenAPI spec (`company.openapi.json`) behind console login; the public marketing pages enumerate data points but not every field. A logged-in fetch would resolve this. **Sources:** [Openapi product index](https://openapi.com/products), [Italian Stakeholders product page](https://openapi.com/products/italian-stakeholders).

---

## Cross-reference matrix

| # | Country | Source-side claim (directors exposed?) | Access tier | Canonical field name | Documented endpoint / product | Source URL |
|---|---------|---------------------------------------|-------------|----------------------|-------------------------------|------------|
| 1 | SE | **Yes (free + structured)** | Free OAuth2 client reg (HVD) | Funktionärer | https://api.bolagsverket.se/ | https://bolagsverket.se/apierochoppnadata/ |
| 2 | NO | **Yes (free, anonymous)** | Free, no auth (Maskinporten for fnr) | Roller / Rolleinnehaver | data.brreg.no `/enheter/{orgnr}/roller` | https://www.brreg.no/ |
| 3 | DK | **Yes (free, credentialed)** | Free after ~3-week ERST registration | Deltagere / Personroller | distribution.virk.dk/cvr-permanent | https://datacvr.virk.dk/ |
| 4 | FI | **No on free API; paid Virre** | Paid Virre per-extract | Vastuuhenkilöt | virre.prh.fi (paid) | https://www.prh.fi/ |
| 5 | UK | **Yes (free with API key)** | Free w/ API key | Officers | api.company-information.service.gov.uk `/officers` | https://developer.company-information.service.gov.uk/ |
| 6 | IE | **Partial (unclear via open data; paid CORE for docs)** | Mixed | Directors / Officers | opendata.cro.ie (open) / core.cro.ie (paid) | https://www.cro.ie/ |
| 7 | FR | **Yes (free with INPI auth; respect diffusibilité)** | Free INPI auth + free aggregator | Représentants légaux / Dirigeants | registre-national-entreprises.inpi.fr / recherche-entreprises.api.gouv.fr | https://data.inpi.fr/ |
| 8 | DE | **Yes (free PDF since Aug 2022; no JSON API)** | Free, PDF-only | Vertretungsberechtigte / Geschäftsführer / Vorstand | handelsregister.de search (PDF) | https://www.handelsregister.de/ |
| 9 | NL | **Restricted (paid)** | Paid Basisprofiel API or €2.85 Uittreksel | Functionarissen / Bestuurders | api.kvk.nl/api/v1/basisprofielen | https://developers.kvk.nl/ |
| 10 | BE | **Yes (free, current-only, thin)** | Free SOAP + CSV | Fonctions / Functies | KBO Public Search Web Service + Open Data | https://kbopub.economie.fgov.be/ |
| 11 | CH | **Yes (free, fully open)** | Free REST + cantonal PDF | Verwaltungsrat / Personen / Zeichnungsberechtigte | zefix.admin.ch/ZefixPublicREST | https://www.zefix.ch/ |
| 12 | LU | **Yes (free PDF; no JSON API)** | Free PDF Extrait; paid certified | Dirigeants / gérant / administrateur | LBR web search (PDF) | https://www.lbr.lu/ |
| 13 | ES | **Yes (paid)** | €0.60–€3.30 per lookup | Administradores / Cargos | sede.registradores.org (paid web) | https://sede.registradores.org/ |
| 14 | PT | **Yes (paid subscription); free event-level publicações** | €25–€100/yr Certidão access code | Membros dos órgãos sociais / Gerentes / Administradores | registo.justica.gov.pt (paid) | https://registo.justica.gov.pt/ |
| 15 | IT | **Yes (paid)** | Paid Telemaco / InfoCamere API | Cariche / Amministratori | accessoallebanchedati.registroimprese.it/abdo | https://www.registroimprese.it/ |
| 16 | GR | **Yes (free by statute, HTML-only)** | Free web UI | Διοίκηση / Διοικητικό Συμβούλιο / Διαχειριστές / Εκπρόσωποι | publicity.businessportal.gr (HTML) | https://publicity.businessportal.gr/ |
| 17 | MT | **Yes (free basic search; €5 per doc)** | Free web UI | Directors / Company Secretary | register.mbr.mt (HTML) | https://mbr.mt/ |
| 18 | CY | **Yes (free current; €10 history)** | Free web UI | Officers / Directors / Secretary | efiling.drcor.mcit.gov.cy (HTML) | https://www.companies.gov.cy/ |
| 19 | PL | **Yes (free REST; JSON anonymized, PDF non-anonymized)** | Free public REST API | Reprezentacja / Sposób reprezentacji / Skład organu | api-krs.ms.gov.pl/api/krs/OdpisAktualny | https://prs.ms.gov.pl/krs/openApi |
| 20 | CZ | **Yes (free)** | Free REST API v3 | Statutární orgán / Jednatel / Způsob jednání | ares.gov.cz/ekonomicke-subjekty-v-be | https://ares.gov.cz/ |
| 21 | SK | **Yes (free)** | Free REST API v1 | Štatutárny orgán / Konajúce osoby / Spôsob konania | api.statistics.sk/rpo/v1 | https://rpo.statistics.sk/ |
| 22 | AT | **Yes (paid)** | Paid Auszug ~€3–10 | Vertretungsbefugte / Geschäftsführer / Vorstand | api.auszug.at / api.wirtschaftscompass.at | https://justizonline.gv.at/ |
| 23 | HU | **Yes (free web UI only; paid cégkivonat)** | Free web UI; no API | Vezető tisztségviselő / Képviselő | e-cegjegyzek.hu (HTML) | https://www.e-cegjegyzek.hu/ |
| 24 | EE | **Yes (free bulk + agreement-gated REST)** | Free open data + free signed API agreement | Juhatuse liikmed / Esindusõigus | avaandmed.ariregister.rik.ee | https://ariregister.rik.ee/ |
| 25 | LV | **Yes (free CKAN bulk)** | Free daily CSV | Amatpersonas / Valdes loceklis | data.gov.lv/dati/lv/dataset/uz | https://www.ur.gov.lv/ |
| 26 | LT | **Partial (free for body members via Spinta; paid for vadovas via JAR)** | Free Spinta + paid JAR | Vadovas / Valdymo organas / Atstovavimas | data.gov.lt JADIS dataset (free); registrucentras.lt (paid) | https://www.registrucentras.lt/ |
| 27 | HR | **Yes (free REST after free registration)** | Free Sudreg API | Osobe ovlaštene za zastupanje / Način zastupanja | sudreg-api.pravosudje.hr/javni/subjekt_detalji | https://sudreg.pravosudje.hr/ |
| 28 | SI | **Yes (free web; contract-gated extended REST)** | Free web UI; contract-gated REST | Zastopniki / Člani uprave / Direktor / Poslovodja | wwwa.ajpes.si/restPrsInfo/find (extended tier) | https://www.ajpes.si/ |
| 29 | BG | **Yes (free web; paid SOAP)** | Free web UI; paid SOAP | Управители / Представители / Съвет на директорите | portal.registryagency.bg (web); paid SOAP | https://portal.registryagency.bg/ |
| 30 | RO | **Yes (paid)** | Paid ~8 RON per extract | Administratori / Reprezentanți legali | portal.onrc.ro (paid); RECOM (paid B2B) | https://www.onrc.ro/ |
| 31 | SG | **Partial (free name-blind; paid for names)** | Free open data (officer count only); paid BizFile EIQ | Free: `no_of_officers`. Paid: Position Holders / Directors / Secretary | data.gov.sg (free, name-blind); bizfile.gov.sg/apimarketplace (paid) | https://www.acra.gov.sg/ |
| 32 | US (Cobalt) | **Partial (paid; ~28/50 states for officers; CA/NY/DE redacted)** | Paid Cobalt subscription | `officers` array | documentation.cobaltintelligence.com | https://www.cobaltintelligence.com/ |
| 33 | EU BRIS | **Per-MS variable; not in free baseline** | Free web portal only | "legal representatives" (CDM) | searchBris.do (web only) | https://e-justice.europa.eu/ |

---

## Diagnostic classification per country

Final Class A vs Class B determination requires the parallel handler-side report. This report supplies the source-side basis for the four-way matrix. **Class C (honest gap — no path) and Class D (AML-gated) can be settled here without the handler report.**

### Class C candidates (source does not expose directors → no code fix possible without alternate source)
- **None.** Every source surveyed claims to expose directors in some form — even Singapore's paid BizFile EIQ provides position-holder names. There are no true Class C cases in this set; the question is always *which tier* exposes them.
- **FI** comes closest to Class C: the free YTJ-API v3 does not expose vastuuhenkilöt, the only route is paid Virre. If Strale's business model rules out the paid Virre tier, FI behaves like Class C for the free-API-only KYB capability. But the data does exist at the source.

### Class D candidates (AML-obliged-only restricted)
- **None for directors.** All Class D cases discovered in this research are **UBO/beneficial-owner registries**, not director registries:
  - LU RBE (UBO): legitimate-interest gated since Feb 2024 post-CJEU C-37/20
  - AT WiEReG (UBO): AML-obliged-only since Oct 2025 tightening
  - PT RCBE (UBO): legitimate-interest gated
  - IT Registro dei Titolari Effettivi (UBO): operational with Consiglio di Stato ruling 2024–2026
  - FI beneficial-owner data: explicitly carved out
- Director registers in the EU remain broadly accessible by statute, though paid or PDF-only in many cases.

### Classes A and B — pending handler-side cross-reference
Once the handler-side report is available, the cross-reference will settle each country. **Source-side baselines for each:**

- **Source claims YES + handler returns YES**: SE, NO, DK, UK, FR, BE, CH, PL, CZ, SK, EE, LV, HR — if handlers return any director-shaped field, this is Class A (audit was wrong, labeling fix). If handlers don't, it's Class B (real extraction gap).
- **Source claims YES (PDF/HTML/paid) + handler returns nothing**: DE, LU, ES, PT, IT, GR, MT, CY, AT, HU, BG, RO, NL, FI — **Class B if Strale wants to bridge**, else Class C-equivalent for the free-tier-only product posture.
- **Source claims partial/paid + handler returns**: SG (free is name-blind), US-Cobalt (state-variable), LT (vadovas paid, body members free) — Class A or B depending on handler behavior.

---

## Recommended path per country for closing T2 binding-ready coverage

**Tier 1 — Free + structured + ship-ready today (handler audit will confirm what's already wired):**
SE, NO, DK, UK, FR, BE, CH, PL, CZ, SK, EE, LV, HR — 13 countries

**Tier 2 — Free or low-cost but needs implementation work:**
- **DE** — parse the AD-PDF (DiRUG free since Aug 2022); OpenRegister.de is a wrapper to consider
- **LU** — parse the free PDF Extrait; or pay Topograph for structured wrapping
- **GR** — Tier-2 vendor consumption per DEC-20260428-A (data statutorily public)
- **MT** — Tier-2 vendor / authorized integrator
- **CY** — Tier-2 vendor / authorized integrator (officers free; €10 for history)
- **HU** — Tier-2 vendor / authorized integrator
- **IE** — verify whether open data CKAN feed includes directors structured; otherwise Tier-2 vendor or paid CORE
- **LT** — combine free JADIS Spinta API (body members) with paid JAR extract for single vadovas

**Tier 3 — Paid only; budget required:**
- **FI** — Virre per-extract (€10–€30 per query)
- **NL** — KVK Basisprofiel API subscription (requires NL registered entity or reseller) or €2.85 Uittreksel
- **ES** — registradores.org per-lookup (€0.60–€3.30) or Informa D&B / Axesor / eInforma
- **PT** — Certidão Permanente subscription (€25–€100/yr)
- **IT** — Openapi IT-Stakeholders (€0.20/call) or InfoCamere API / Telemaco
- **AT** — auszug.at API / Compass
- **BG** — paid SOAP via BRRA or reseller
- **RO** — RECOM subscription or per-extract via portal.onrc.ro

**For the 11 Openapi-mediated countries, Strale must change upstream for directors:**
- **IT** — switch to / add Openapi IT-Stakeholders SKU
- **AT, BG, CY, HU, LU, MT, NL, PT, RO, ES** — Openapi's public catalog has no directors-bearing product; need direct national registry integration or different aggregator (Informa, Cribis, Iberinform, eInforma, Topograph, etc.)

**SG and US specifics:**
- **SG** — free data.gov.sg path is structurally name-blind; must pay BizFile EIQ for directors
- **US (Cobalt)** — already paid; officers as `reliability: rare` (state-conditional), registered_agent as `reliability: common`; CA/NY/DE explicit disclosure of gap

---

## Citation rigor / verification notes

- Every per-country section above cites the official source documentation URL(s). Where multiple URLs are listed, the first is the canonical entry point and subsequent ones substantiate specific claims (data product, API endpoint, regulation).
- **Could not verify:**
  - IE — whether the bulk Company Records dataset includes structured director person-rows. The CRO Open Services REST API documentation enumerates only "company names, addresses, Eircodes, registration dates and statuses" — no directors field. Recommend a direct fetch of the CSV header / dataset schema.
  - Openapi — full JSON response schema for WW-Top behind console login; possibly includes undocumented director fields for some countries. Recommend a logged-in fetch of `company.openapi.json` OAS.
- **No source synthesis.** Where a claim couldn't be substantiated against a public URL, the section says "could not verify" rather than asserting a plausible-sounding answer.
- This report does not access paywalled or login-required upstream content directly. For paywalled sources (FI Virre, NL paid KVK Basisprofiel, IT Telemaco, AT auszug.at API behind paid account, etc.), the citations describe the public-facing product page rather than asserting on internal response schemas.

---

## Cross-reference with handler-side audit

When `handler-directors-verification-2026-05-18.md` (Prompt 1) lands, the final Class A/B determination per country is mechanical from the matrix above. Suggested workflow:

1. For each country, look up the source-side claim in the per-country detail.
2. Look up what the handler returns from the handler-side report.
3. Apply the four-way matrix:
   - **Source YES + handler YES** → Class A (relabel the field to match the source's canonical term — `Funktionärer`, `Officers`, `Vertretungsberechtigte`, `Cariche`, `Administradores`, etc., consistent with what the upstream actually emits)
   - **Source YES + handler NO** → Class B (real extraction gap; v1.1 work)
   - **Source NO/restricted + handler NO** → Class C/D (honest; reflect in launch DEC)
   - **Source NO/restricted + handler YES** → Anomaly; investigate (likely a vendor data leak or scraping shortcut that violates DEC-20260428-A)

The handler-side report can append its findings to this matrix's columns 7–8 to produce the final classification.
