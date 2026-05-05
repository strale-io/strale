# Section 2 — Registry Source Diligence: EU-27 Coverage Gaps

**Scope.** Ten EU-27 countries where Strale currently has no direct company-registry coverage: **BG, CY, GR, HR, HU, LU, MT, RO, SI, SK**. Research evaluates source options for Payee Assurance v1 (Q2 2026) against Strale's locked doctrine (DEC-20260420-H): direct data connections only, no scraping, full ToS compliance. Government-operated open-data APIs are ideal; licensed commercial aggregators with clean ToS are acceptable; scraping a commercial site is the failure mode.

**Research date.** 2026-04-20. Some registry details (exact per-field availability, undocumented rate limits, contract wording) can only be confirmed by direct contact with the operator and should be verified before implementation.

**Cross-cutting findings (apply to every country below).**

- **BRIS (Business Registers Interconnection System, via European e-Justice Portal).** BRIS is a federated *search UI* at `e-justice.europa.eu` / `webgate.ec.europa.eu/e-justice/searchBris.do`, not a public REST API for third-party integrators. The free harmonised dataset per company is narrow: name, EUID, legal form, registered seat, registration number, plus links to the national register. Directors, officers, capital history, beneficial ownership, and filings are *not* uniformly exposed via BRIS. No published REST endpoint, no API key model; the interconnection operates between *registers*, not between registers and commercial consumers. **Conclusion: BRIS is not a viable primary integration path and is not a fallback that satisfies Payee Assurance v1 (which needs directors/officers/status). It can be referenced for existence verification only, and even that requires UI scraping that doctrine forbids.**
- **OpenCorporates.** Database licensed under ODbL (copyleft share-alike). Content is CC-BY-SA. The self-serve/free API tier is restricted to "personal use, not for the benefit of a corporation." Any commercial integration by Strale requires an **Enterprise API contract** (pricing behind "contact sales"). ODbL's share-alike clause is a redistribution concern: building Payee Assurance on OC data without clean Enterprise terms creates an obligation to publish derivative data under ODbL, which conflicts with Strale's commercial posture. **Conclusion: OC is acceptable as a Tier B fallback *only with an Enterprise contract and explicit redistribution clause in writing*. Do not ship against the free/self-serve tier.**
- **UBO / beneficial ownership access.** Post-CJEU C-37/20 & C-601/20 (22 Nov 2022), public UBO access has been curtailed across the EU. Luxembourg (RBE), Slovenia (Aug 2025), Malta (Jul 2025), and others now require "legitimate interest" or "obliged entity" status. For Payee Assurance v1, UBO should be assumed **out of scope** unless Strale registers as an obliged entity under AMLD in each jurisdiction — that is a compliance project in itself and not in the Q2 2026 window.
- **2024–2025 Open Data Directive high-value dataset rollout.** The EU HVD regulation (Reg. 2023/138) designates business-register data as high-value and mandates free, open-format, API-accessible provision. Enforcement is uneven; some member states are complying (HR, SK, SI), others are pushing back (LU). Expect the coverage landscape to continue improving through 2026, but do not assume any specific country has rolled out an API that was not available at research date.

---

## BG — Bulgaria

- **Official registry.** Търговски регистър и Регистър на юридическите лица с нестопанска цел (Commercial Register and Register of Non-Profit Legal Entities), operated by the **Registry Agency** (Агенция по вписванията) under the Ministry of Justice.
- **Citizen portal.** `https://portal.registryagency.bg/en/home-cr` (unified portal, also covers Property Register).
- **Access paths (ranked).**
  1. **Bulgarian open-data portal (data.egov.bg / MEU).** The Registry Agency publishes daily machine-readable extracts of the commercial register under **CC-BY**. Free, redistributable with attribution — this satisfies doctrine cleanly. Integration pattern is batch ingest of daily dumps (not per-query live lookup), so Strale would host a local index and refresh daily. No rate limits, no contract. Gotcha: the dump is in Bulgarian/Cyrillic XML; schema is documented but in Bulgarian only.
  2. **portal.registryagency.bg direct lookup.** Web portal for interactive search. No documented public REST API for third parties; attempting to query via the web forms at scale would constitute scraping under doctrine. **Rejected.**
  3. **OpenCorporates BG dataset** (Enterprise licence). Fallback if daily-dump ingest is too heavy.
- **Data fields.** Name (Cyrillic + transliteration), UIC (9-digit identifier), legal form (ООД, АД, ЕООД, ЕАД, СД, КД), status (active/in-liquidation/dissolved), registered address, directors/managers (управители), capital, incorporation date. Beneficial ownership field exists but access is restricted.
- **Cost.** €0 for the open-data dump.
- **Integration effort.** **5–7 days.** Build daily ZIP/XML ingester, Cyrillic-safe schema mapper, UIC lookup index, cron refresh. Not a simple REST call — data-engineering shape.
- **Gotchas.** Cyrillic character encoding (UTF-8 in dumps, but downstream Latin transliteration required for cross-border matching). Bulgarian legal-form suffixes (ООД ≈ Ltd, АД ≈ JSC). Daily freshness only — not real-time. Dump schema documented only in Bulgarian. No user-facing rate limits but the file size grows over time (plan for multi-GB).
- **Tier.** **B** — doctrine-clean via open data, but the ingest pattern is heavier than a REST call, so it's not trivially Tier A.

**Sources.**
- [Commercial register portal (EPZEU)](https://portal.registryagency.bg/en/home-cr)
- [Business registers in EU countries – Bulgaria (e-Justice)](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/bg_en)
- [CompanyBook.BG – documents CC-BY data.egov.bg source](https://companybook.bg/?lang=en)

---

## CY — Cyprus

- **Official registry.** Department of Registrar of Companies and Intellectual Property (DRCIP) — "Τμήμα Εφόρου Εταιρειών και Διανοητικής Ιδιοκτησίας", under the Ministry of Energy, Commerce and Industry.
- **Citizen portal.** `https://www.companies.gov.cy/en/` and search at `https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx`.
- **Access paths (ranked).**
  1. **Cyprus National Open Data Portal (data.gov.cy).** DRCIP is a publisher on `data.gov.cy/en/group/30`. Basic datasets (company list, officers in a structured download) are published there. License is open (data.gov.cy default is CC-BY). Coverage and freshness should be verified — multiple Kyckr/i-Cyprus writeups describe the public portal's *live* interface as the authoritative source and suggest open-data dumps may be stale or partial. **Flag: unknown data freshness of the open-data publication; needs direct verification with DRCIP.**
  2. **No documented REST API from DRCIP.** Basic fields (officers, address, incorporation date, number) are free on the web portal; full file / filings cost €10 per company per 24 h download window. This is a per-document fee, not an API pricing model.
  3. **OpenCorporates CY** (Enterprise). Fallback.
  4. **Commercial aggregators:** Kyckr, i-Cyprus, Creditsafe — all available, all behind enterprise contracts.
- **Data fields (per open-data + web lookup).** Name (Greek + Latin), registration number (HE-prefix for Cyprus Ltd), status (active / struck-off / dissolved / in liquidation), registered address, officers (directors + secretary), incorporation date, legal form (Ltd / Public / Overseas). Beneficial ownership: UBO register (CBO) exists but access is restricted to obliged entities post-ECJ.
- **Cost.** €0 for open-data bulk. €10 per full-file download via portal.
- **Integration effort.** **4–6 days** if open-data bulk is sufficient (ingest + index + Greek/Latin name handling). **+3 days** if the open dataset is missing officers and we must fall back to a commercial aggregator contract.
- **Gotchas.** Greek script for company names; Latin transliteration not always authoritative. The August-2025 change that BAROS searches require login does *not* affect open-data bulk access but does affect any automation pointed at the web portal (would be scraping regardless). Coverage of "officers" field in bulk download is the primary unknown.
- **Tier.** **B** (pending verification of what exactly is in the open-data dump — could escalate to **A** if officers are included).

**Sources.**
- [Companies Section – DRCIP](https://www.companies.gov.cy/en/)
- [DRCIP publisher page on data.gov.cy](https://data.gov.cy/en/group/30)
- [Cyprus Company Registry 2025 Update (Kyckr)](https://www.kyckr.com/blog/cyprus-company-registry-search)
- [e-Justice portal – Cyprus business register](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/cy_en)

---

## GR — Greece

- **Official registry.** Γενικό Εμπορικό Μητρώο (ΓΕΜΗ / GEMI — General Commercial Registry), operated by the Central Union of Chambers of Commerce (ΚΕΕ) under the Ministry of Development.
- **Citizen portal.** `https://publicity.businessportal.gr/` (publicity lookup) and `https://www.businessportal.gr/en/` (informational).
- **Access paths (ranked).**
  1. **GEMI Open Data REST API.** `https://opendata-api.businessportal.gr/opendata/docs/` (Swagger / OpenAPI 2.0, JSON). Registration at `https://opendata.businessportal.gr/register/` issues an API key. Terms at `https://opendata.businessportal.gr/license/`. **This is a Tier-A candidate.** Lookup by GEMI number, AFM (tax number), or name. Verify current license wording — some third-party writeups suggest the "full" GEMI API is gated to public bodies / financial institutions, while the Open Data subset is broader; which tier covers directors is the key question.
  2. **Direct GEMI API (non-open-data).** Restricted to Greek public bodies and financial institutions per GEMI's stated policy — not realistically obtainable for a foreign solo founder.
  3. **OpenCorporates GR** (Enterprise) or specialist vendor (Dotfile, Global Database).
- **Data fields (Open Data API).** GEMI number, AFM, company name (Greek + Latin), legal form, registered seat, status, incorporation date. **Whether directors/officers are in the Open Data subset or only the restricted API is the critical unknown** — documented API descriptions are inconsistent.
- **Cost.** Open Data API: €0 (with registration). Restricted API: N/A for Strale.
- **Integration effort.** **2–4 days** if Open Data API covers the Payee Assurance field set. **+5 days** if officers require a commercial fallback.
- **Gotchas.** Greek script (UTF-8 throughout), Greek legal-form suffixes (ΑΕ, ΕΠΕ, ΟΕ, ΕΕ, ΙΚΕ). API key may have undocumented rate limits. Documentation is Greek-only on some technical pages. TaxisNet linkage rolled out 2024–2025 — AFM is now a strong secondary key.
- **Tier.** **A** if directors are in the open dataset; **B** if not. **Flag for Petter to verify via the register endpoint before committing.**

**Sources.**
- [GEMI Publicity portal](https://publicity.businessportal.gr/)
- [GEMI Open Data portal + registration](https://opendata.businessportal.gr/)
- [GEMI Open Data Swagger docs](https://opendata-api.businessportal.gr/opendata/docs/)
- [Greece Company Registry Guide 2026 (Kyckr)](https://www.kyckr.com/blog/greece-company-registry-guide)

---

## HR — Croatia

- **Official registry.** Sudski registar (Court Register), operated by the Ministry of Justice and Public Administration (Ministarstvo pravosuđa i uprave), fed by the 15 commercial courts.
- **Citizen portal.** `https://sudreg.pravosudje.hr/` (interactive search).
- **Access paths (ranked).**
  1. **Sudski registar Open Data REST API.** `https://sudreg-data.gov.hr/` (production) and `https://sudreg-data-test.gov.hr/` (sandbox). Full OpenAPI documentation, JSON + XML output, OAuth2 client-credentials flow (Client ID + Client Secret issued on registration, token endpoint provides bearer). Technical contact: `sudski.registar@pravosudje.hr`. Dataset metadata on `data.gov.hr` and `data.europa.eu` under open licenses (Croatia defaults to Open Licence v2 / equivalent to CC-BY). **This is the cleanest Tier-A candidate among the ten countries.**
  2. Commercial aggregators (Creditsafe, Bisnode/Dun & Bradstreet) — unnecessary given the quality of the government API.
- **Data fields.** Subject (name in Croatian + transliteration), OIB (11-digit national identifier, works as primary key), MBS (court registration number), legal form (d.o.o., j.d.o.o., d.d., j.t.d., k.d., obrt), registered address, members / partners, directors (persons authorised to represent), status (active / in bankruptcy / in liquidation / deleted), incorporation date, share capital, activity (NKD codes). Comprehensive.
- **Cost.** €0. Rate limit unspecified in public docs but standard OAuth2 bearer — verify with `sudski.registar@pravosudje.hr`.
- **Integration effort.** **2–3 days.** REST JSON + OAuth2 is a known pattern; OIB is a clean primary key; Strale's existing Drizzle/Hono stack will absorb this easily.
- **Gotchas.** Croatian diacritics (č, ć, š, ž, đ) in names — preserve UTF-8 end-to-end. Legal-form suffix "d.o.o." (limited liability) is by far the most common and is the analogue of GmbH / Ltd. OAuth2 token lifetime is not documented in public summary — plan for token refresh. Test vs. production host switch.
- **Tier.** **A**.

**Sources.**
- [Sudski registar open-data portal](https://sudreg-data.gov.hr/)
- [API docs – services overview](https://sudreg-podaci.pravosudje.hr/docs/services)
- [Sudski registar dataset on data.gov.hr](https://data.gov.hr/ckan/en/dataset/sudski-registar)
- [e-Justice Croatia business register page](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/hr_en)

---

## HU — Hungary

- **Official registry.** Cégjegyzék (Company Register), operated by the **Company Information Service of the Ministry of Justice** (Céginformációs és az Elektronikus Cégeljárásban Közreműködő Szolgálat). Aggregated free access at `e-cegjegyzek.hu` (alias `ceginformaciosszolgalat.kormany.hu`); paid commercial portal `cegkozlony.hu` / `cegportal.im.gov.hu`.
- **Citizen portal.** `https://www.e-cegjegyzek.hu/?ceginformacio` (free basic lookup).
- **Access paths (ranked).**
  1. **No documented government REST API.** The free portal is HTML, interactive, and per-company. Programmatic access requires either scraping (doctrine violation) or entering into a contract with the Ministry of Justice's Company Information Service for their electronic cégeljárás data feed. The feed exists (financial institutions and legal registries use it) but is not advertised publicly and pricing/contract terms are not published — must be requested.
  2. **Commercial aggregators with Hungarian coverage.** Opten, Bisnode Hungary, Creditsafe, and `companyapi.hu` (third-party commercial wrapper on the official feed). Some publish their data source as the Ministry electronic feed; terms vary. CompanyAPI.hu advertises REST but is a reseller — Strale would need to review their ToS for redistribution rights.
  3. **OpenCorporates HU** (Enterprise). OC's Hungarian dataset is sourced from e-cegjegyzek and should be assumed contested unless OC's Enterprise licence explicitly covers it.
  4. **BRIS search UI.** Existence + basic fields only, no directors — insufficient.
- **Data fields (via any path).** Cégjegyzékszám (court-of-registration + 10-digit number), company name, legal form (Kft., Zrt., Nyrt., Bt., Kkt.), registered seat, status, directors / authorized representatives, tax number (adószám), VAT number, share capital, incorporation date.
- **Cost.** Unknown for the official feed — contact required. Commercial aggregators: typical credit-bureau pricing (low four figures EUR/year entry band, verify).
- **Integration effort.** **5–8 days** if a commercial aggregator is chosen (typically REST + auth + entity-resolution layer). **Unknown** for the official Ministry feed until pricing and delivery format are obtained.
- **Gotchas.** Hungarian diacritics in names. Legal-form suffixes. Court-of-registration prefix in Cégjegyzékszám matters for uniqueness (01-09-XXXXXXX for Budapest). The e-cegjegyzek web portal has anti-automation friction (captchas reported historically) — even if scraping were permitted, it would be fragile. No known free REST path.
- **Tier.** **B** — a commercial aggregator with a clean Enterprise contract is the realistic path. Flag as non-trivial contract work.

**Sources.**
- [Company Information Service (Ministry of Justice)](https://ceginformaciosszolgalat.kormany.hu/ingyenes-ceginformacio)
- [e-cegjegyzek free lookup](https://www.e-cegjegyzek.hu/)
- [Cégközlöny official portal](https://cegportal.im.gov.hu/frontend/cegkozlony)
- [e-Justice Hungary business register page](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/hu_en)

---

## LU — Luxembourg

- **Official registry.** Registre de Commerce et des Sociétés (RCS), operated by **Luxembourg Business Registers (LBR)** — an economic-interest grouping of the State, Chamber of Commerce, and Chamber of Trades. New LBR portal launched 25 Aug 2025.
- **Citizen portal.** `https://www.lbr.lu/` (new) / `https://www.rcsl.lu/` (legacy).
- **Access paths (ranked).**
  1. **data.public.lu RCSL open dataset.** `https://data.public.lu/en/datasets/extrait-du-registre-de-commerce-et-des-societes-luxembourg-rcsl/`. Published by the University of Luxembourg Competence Centre (ULCC). Fields include company name, number, legal form, registered address, incorporation date, status, directors, and partner information. Published under an open licence via data.public.lu defaults (verify the specific dataset licence — typically Etalab Open Licence 2.0 / equivalent to CC-BY). Refresh cadence should be confirmed; historically this dataset has had gaps in officer data. **This is the doctrine-clean path if coverage is complete.**
  2. **LBR production API.** Formally exists (launched 2022). **Access refused for general commercial integrators** — LBR has publicly stated the API is reserved for companies and banks processing very high volumes, and the refusal has drawn EU-law criticism (HVD regulation non-compliance). Strale should not assume access.
  3. **OpenCorporates LU** (Enterprise). Sourced from RCSL + LBR.
  4. **Commercial aggregator** (Creditsafe, BvD, Moody's) — clean licence, high cost.
  5. **RBE (UBO register).** Access restricted post-ECJ — not available.
- **Data fields.** RCS number (B-prefix for companies: `B12345`), company name, legal form (S.A., S.à r.l., S.A.S., S.C.A., S.C., S.e.c.s., S.e.n.c., A.s.b.l., Fondation), registered address, incorporation date, status, directors, managers, authorized signatories, share capital, statutory documents.
- **Cost.** Open dataset: €0. LBR API: currently inaccessible. Commercial aggregators: enterprise pricing.
- **Integration effort.** **3–5 days** for the open dataset (daily/periodic file ingest). **+3 days** for a commercial fallback if the open dataset proves incomplete for officers.
- **Gotchas.** The LBR data-access dispute is live — HVD Regulation 2023/138 arguably requires LBR to open the API, but LBR has resisted. If EU enforcement forces a policy change in late 2026, Strale should plan to re-evaluate. French is the primary filing language; address formats are French-conventional. RCS number format is stable and clean. National-identification-number backfill deadline (31 May 2025) means pre-backfill records may have gaps.
- **Tier.** **B** (open dataset works but contested data access environment warrants a commercial-aggregator fallback in the design).

**Sources.**
- [LBR portal](https://www.lbr.lu/)
- [data.public.lu RCSL dataset](https://data.public.lu/en/datasets/extrait-du-registre-de-commerce-et-des-societes-luxembourg-rcsl/)
- [Mode Operandi analysis of LBR API refusal (2024)](https://modoperandi.substack.com/p/open-data-luxembourg)
- [CdM news on Feb 2025 RCS/RBE changes](https://www.cdm.lu/news/nouveautes-concernant-le-registre-de-commerce-et-des-societes-et-le-registre-des-beneficiaires-effectifs-a-partir-du-1er-fevrier-2025)
- [e-Justice Luxembourg business register page](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en)

---

## MT — Malta

- **Official registry.** Malta Business Registry (MBR) — successor to the MFSA Registry of Companies, operating since 2019.
- **Citizen portal.** `https://mbr.mt/` and search at `https://registry.mbr.mt/`.
- **Access paths (ranked).**
  1. **MBR API packages.** Launched Mar 2026. Package 1 (Company Search API) returns company name, registration number, registration date, and state — *only*. Designed for and **marketed to "Subject Persons"** (AML-obliged entities under Maltese law). Contract required; signup via `mbr.mt` (documented fee structure TBD). **For Strale: this is access-gated — qualifying as a Subject Person means registering as an AML-obliged entity in Malta, which is a heavy compliance lift.**
  2. **Login-required company search (BAROS portal).** Since 1 Aug 2025, all company searches require login. Free of charge but rate-limited and interactive. Programmatic use would require credentials under the portal ToS — likely classed as automated access and not permitted.
  3. **Malta Open Data Portal.** `https://open.data.gov.mt/registers.html` — check for MBR-published datasets; content and freshness should be verified. Historically thin.
  4. **OpenCorporates MT** (Enterprise) or commercial aggregator.
  5. **UBO register.** Legitimate-interest access since Jul 2025 — not broadly available.
- **Data fields (via any path).** Company name (Maltese/English), MBR number (C-prefix), legal form (Ltd, Plc, Partnership, SE), registered address, status, incorporation date, directors, company secretary, shareholders. The MBR Company Search API Package 1 does **not** include directors — that is in a different (unspecified) package.
- **Cost.** MBR API: pricing not published; "contact sales" equivalent. Web search: free but login-gated.
- **Integration effort.** **6–10 days** if the MBR API is obtainable (includes the AML-registration prerequisite assessment). **5–7 days** via a commercial aggregator.
- **Gotchas.** The "Subject Person" gating is the deal-breaker. Maltese and English are both official languages but company filings are usually English. The C-prefix MBR number is stable. Directors are almost certainly in a higher-tier (more expensive) API package than Package 1.
- **Tier.** **B** — doctrine-clean via commercial aggregator Enterprise contract or via MBR API if Strale has/can obtain Subject Person status. Flag the access-gating as a material barrier.

**Sources.**
- [Malta Business Registry](https://mbr.mt/)
- [MBR API launch announcement (2026)](https://thebusinesspicture.com/2026/03/04/malta-business-registry-launches-application-programming-interface-packages/)
- [MBR – Subject Persons API (Nov 2024)](https://mbr.mt/2024/11/21/malta-business-registry-to-offer-apis-to-subject-persons/)
- [Malta Open Data Portal registers page](https://open.data.gov.mt/registers.html?type=footer)
- [Malta Business Registry 2025 Update (Kyckr)](https://www.kyckr.com/blog/malta-business-registry-search-2025)

---

## RO — Romania

- **Official registry.** Oficiul Național al Registrului Comerțului (ONRC) — National Trade Register Office, under the Ministry of Justice.
- **Citizen portal.** `https://www.onrc.ro/` (informational) and `https://myportal.onrc.ro/` (services portal).
- **Access paths (ranked).**
  1. **data.gov.ro ONRC open datasets.** `https://data.gov.ro/organization/onrc`. ONRC publishes multiple datasets including the RECOM extract (company list with CUI, name, address, status, CAEN activity) under the national Open Licence. Directors/officers coverage in the open-data publication should be verified — historically partial. Update cadence is regular but not daily for all fields.
  2. **InfoCert (ONRC portal's paid electronic certificate service).** ~RON 30 (≈ €6) per company for a trade-register extract, electronically signed, delivered via the portal. This is per-document, not API — unsuitable for programmatic Payee Assurance at scale.
  3. **RECOM Online.** ONRC's free web portal for basic lookups — browser UI, not an API.
  4. **Commercial Romanian APIs.** `listafirme.eu` (officially sourced from ANAF + ONRC + BPI, REST API available), `alertacui.ro` API, `risco.ro` API. These are commercial resellers; ToS must be reviewed per-vendor. Some license their data as derived-from-official and permit redistribution; others do not.
  5. **OpenCorporates RO** (Enterprise).
- **Data fields.** CUI (fiscal code, primary key), J-prefixed trade-register number, name, legal form (SRL, SA, SCA, SCS, PFA), status (active / in insolvency / dissolved / struck-off), registered office, directors / administrators, shareholders, share capital, CAEN codes, incorporation date. Romanian registry is one of the richer EU datasets.
- **Cost.** data.gov.ro: €0. InfoCert: per-document. Commercial APIs: typical SaaS pricing.
- **Integration effort.** **4–7 days** via data.gov.ro bulk ingest + local index. **3–5 days** via a commercial API if its ToS is clean. **+2 days** entity resolution for Romanian diacritics and company-form normalisation.
- **Gotchas.** Romanian diacritics (ă, â, î, ș, ț). Legal-form variants and sole-trader (PFA/II/IF) vs. company (SRL/SA) distinction matters for Payee Assurance scope. Multiple valid identifiers (CUI vs. J-number) — CUI is cleaner. Bucharest vs. regional trade-register court affects J-number format. Freshness of data.gov.ro publication should be verified.
- **Tier.** **A** if data.gov.ro covers directors + status with acceptable freshness; **B** otherwise via a commercial Romanian API with clean ToS.

**Sources.**
- [ONRC official site](https://www.onrc.ro/index.php/en/)
- [ONRC datasets on data.gov.ro](https://data.gov.ro/organization/onrc)
- [InfoCert service](https://myportal.onrc.ro/ONRCPortalWeb/appmanager/myONRC/wicket?p=rc.certificateConstatatoare)
- [e-Justice Romania business register page](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/ro_en)

---

## SI — Slovenia

- **Official registry.** Poslovni register Slovenije (PRS / ePRS), operated by **AJPES** — Agency of the Republic of Slovenia for Public Legal Records and Related Services.
- **Citizen portal.** `https://www.ajpes.si/prs/default.asp?language=english` (ePRS free search).
- **Access paths (ranked).**
  1. **AJPES RESTful API `restPrsInfo`.** Launched Feb 2026, replacing the legacy SOAP API. JSON + XML output. Registration required (free). **This is a Tier-A candidate.** Verify exact field coverage and rate limits via AJPES documentation / support.
  2. **AJPES quarterly open-data XML dumps.** Every 3 months, AJPES publishes basic PRS data (registration number, name, business address, legal form, registration authority) as XML on data.europa.eu under open licence. Useful as a batch reference but stale between publications.
  3. **OpenCorporates SI** (Enterprise).
  4. **UBO register (eRDL).** Since Aug 2025, unrestricted public access has been removed — legitimate interest required. Not available to Strale.
- **Data fields.** Matična številka (10-digit registration number), name (Slovenian + transliteration), legal form (d.o.o., d.d., s.p., k.d., d.n.o.), registered address, directors / representatives, status, incorporation date, activity (SKD codes), share capital. The REST API (restPrsInfo) is expected to cover all of the above; the quarterly dump covers a narrower subset.
- **Cost.** €0 (with free registration for the REST API).
- **Integration effort.** **2–4 days** for the REST API (assuming standard auth and OpenAPI-like docs). **+1 day** for Slovenian legal-form and diacritic handling.
- **Gotchas.** Slovenian diacritics (š, č, ž). Sole proprietor (s.p.) vs. company (d.o.o.) distinction. Rate limits not publicly documented — confirm with AJPES. API is new (Feb 2026) — expect some launch-period instability.
- **Tier.** **A**.

**Sources.**
- [AJPES Slovenian Business Register](https://www.ajpes.si/Registers/Slovenian_Business_Register)
- [AJPES ePRS application](https://www.ajpes.si/prs/default.asp?language=english)
- [PRS dataset on data.europa.eu](https://data.europa.eu/data/datasets/poslovni-register-slovenije?locale=en)
- [Slovenian Business Registry Guide (Kyckr)](https://www.kyckr.com/blog/slovenian-business-registry)
- [Slovenia UBO access restrictions Aug 2025](https://sibiz.eu/slovenia-restricts-public-access-to-beneficial-owner-register-following-european-court-of-justice-ruling/)

---

## SK — Slovakia

- **Official registry.** Obchodný register SR (Commercial Register) at the district courts, with **Register právnických osôb, podnikateľov a orgánov verejnej moci (RPO)** — the Register of Legal Persons, Entrepreneurs and Public Authorities — operated by the **Statistical Office of the Slovak Republic (ŠÚ SR)** as the single authoritative source (since 1 Nov 2015).
- **Citizen portal.** `https://www.orsr.sk/` (commercial register web search) and `https://rpo.statistics.sk/rpo/` (RPO single public register).
- **Access paths (ranked).**
  1. **RPO REST API.** `https://api.statistics.sk/rpo/v1/`. Documentation at `https://susrrpo.docs.apiary.io/`. Data licensed **CC-BY 4.0** (Statistical Office, under Act 272/2015). Unauthenticated access limited to 60 req/min/IP. Authenticated access available. **This is the cleanest Tier-A candidate alongside Croatia.**
  2. **Ekosystém.Slovensko.Digital RPO v2 wrapper.** Community/third-party aggregation layer over the same official API, with SQL-API extensions. Useful for ad-hoc analysis; redistribution terms defer to the underlying CC-BY.
  3. **Open data via data.gov.sk** — dataset references `https-rpo-statistics-sk-rpo`.
  4. **FinStat.** Commercial Slovak+Czech aggregator. Redundant given the clean RPO API, but useful as a secondary enrichment source for financials (out of Payee Assurance scope).
- **Data fields.** IČO (8-digit identifier, primary key), name (Slovak + Latin), legal form (s.r.o., a.s., v.o.s., k.s., SE, družstvo), registered address, statutory body (directors / konateľ), partners / shareholders (for s.r.o.), status (active / in liquidation / deleted), incorporation date, SK NACE activity codes.
- **Cost.** €0 (CC-BY 4.0, free commercial use with attribution).
- **Integration effort.** **2–3 days.** REST JSON, documented OpenAPI, stable identifier, clean licence — this is the easiest of the ten.
- **Gotchas.** Slovak diacritics. Legal-form suffixes. Unauthenticated 60 rpm cap is modest — request authenticated access if sustained throughput is needed. Older API (pre-v2) is deprecated; use v2 endpoints.
- **Tier.** **A**.

**Sources.**
- [RPO REST API documentation](https://susrrpo.docs.apiary.io/)
- [RPO registry page (Statistical Office)](https://slovak.statistics.sk/wps/portal/ext/Databases/RPO%20-%20Register%20pr%C3%A1vnick%C3%BDch%20os%C3%B4b/)
- [Ekosystém Slovensko.Digital open APIs](https://ekosystem.slovensko.digital/otvorene-api)
- [data.gov.sk RPO dataset](https://data.gov.sk/en/dataset/https-rpo-statistics-sk-rpo/resource/6440f5db-e2d1-49e5-b1ba-57443da2bfe4)
- [Obchodný register SR web search](https://www.orsr.sk/)

---

## Comparison table

| Country | Direct gov API available? | BRIS sufficient? | Commercial fallback available? | Tier | Est. integration days | Critical gotcha |
|---|---|---|---|---|---|---|
| BG | No REST — but CC-BY daily dumps | No (fields too thin) | Yes (OC Enterprise) | B | 5–7 | Cyrillic; batch-only ingest |
| CY | No documented REST; open-data portal | No | Yes | B (→ A?) | 4–6 (+3) | Officers coverage in open data unclear |
| GR | Yes — GEMI Open Data REST | No | Yes | A (→ B?) | 2–4 (+5) | Directors may be in restricted tier |
| HR | Yes — sudreg-data.gov.hr REST + OAuth2 | No | Yes | A | 2–3 | OIB-as-key; OAuth2 token refresh |
| HU | No | No | Yes (commercial only) | B | 5–8 | No clean free path; contract required |
| LU | Contested (LBR API refused) | No | Yes (data.public.lu + OC) | B | 3–5 (+3) | HVD non-compliance dispute |
| MT | Yes (MBR API, Subject-Person-gated) | No | Yes | B | 6–10 | AML-obliged-entity registration required |
| RO | Yes — data.gov.ro bulk + commercial APIs | No | Yes | A (→ B?) | 4–7 | Freshness of open-data publication |
| SI | Yes — restPrsInfo REST (Feb 2026) | No | Yes | A | 2–4 | New API; launch-period stability |
| SK | Yes — RPO REST (CC-BY 4.0) | No | Yes | A | 2–3 | 60 rpm unauth rate limit |

---

## Three-tier classification

**Tier A — Direct government API, clean ToS, implement first.**
- **SK** (RPO REST, CC-BY 4.0)
- **HR** (sudreg-data.gov.hr, OAuth2)
- **SI** (AJPES restPrsInfo, Feb 2026)
- **GR** (GEMI Open Data REST) — conditional on verifying directors field is in the open tier
- **RO** (data.gov.ro bulk) — conditional on verifying directors + freshness

**Tier B — BRIS-insufficient; either open-data batch ingest or licensed commercial aggregator required.**
- **BG** (data.egov.bg CC-BY daily dumps)
- **LU** (data.public.lu open dataset + commercial fallback)
- **CY** (open-data portal + commercial fallback)
- **HU** (commercial aggregator only — no free clean path)
- **MT** (MBR API with Subject-Person gating, or commercial aggregator)

**Tier C — No clean path / explicit v1 gap.**
- **None.** All 10 countries have at least a Tier-B path that satisfies doctrine. Malta is the closest to a Tier-C risk: if Strale cannot qualify as a Subject Person and no commercial aggregator delivers acceptable ToS at acceptable price, MT falls out of v1.

---

## Recommended implementation order

**Wave 1 — fastest integration, clearest doctrine compliance (start here):**
1. **SK** — RPO REST, CC-BY 4.0, 2–3 days. Lowest risk, highest confidence.
2. **HR** — sudreg-data.gov.hr OAuth2 REST, 2–3 days. Comparable quality to SK.
3. **SI** — restPrsInfo REST, 2–4 days. New API but well-documented.

**Wave 2 — verify-then-build (government REST exists, field coverage needs confirmation):**
4. **GR** — GEMI Open Data API, 2–4 days after registering and confirming directors field coverage.
5. **RO** — data.gov.ro bulk, 4–7 days; needs freshness + directors verification.

**Wave 3 — heavier ingest or commercial contract:**
6. **BG** — CC-BY daily dump ingest pipeline, 5–7 days.
7. **LU** — data.public.lu dataset, 3–5 days; design for commercial fallback.
8. **CY** — open-data dump + commercial fallback; 4–6 days.

**Wave 4 — hardest, commercial-contract dependent (finish last):**
9. **HU** — commercial aggregator negotiation + integration, 5–8 days + contracting lead time.
10. **MT** — either AML-obliged-entity registration prerequisite or commercial aggregator; 6–10 days + contracting lead time.

---

## Total engineering effort estimate

Summing best-case integration days across all 10 countries (not counting contracting lead time for HU/MT, and not counting a commercial-fallback buildout where one is flagged as conditional):

- **Wave 1 (A, certain):** SK 3 + HR 3 + SI 4 = **10 days**
- **Wave 2 (A, with verification):** GR 4 + RO 7 = **11 days**
- **Wave 3 (B, doctrine-clean):** BG 7 + LU 5 + CY 6 = **18 days**
- **Wave 4 (B, contract-gated):** HU 8 + MT 10 = **18 days**

**Total: ~55–60 engineering days for full coverage**, of which ~20 days close Wave 1+2 (the five Tier-A countries, representing the bulk of commercial relevance). Wave 4 is the tail and adds significant calendar time due to contracting.

For Payee Assurance v1 (Q2 2026), a realistic target is **Waves 1 + 2 shipped (5 countries, ~20 dev days)**, with Wave 3 as a stretch and Wave 4 deferred to v1.1 pending contract work.

---

## Open questions for Petter

1. **GR — GEMI directors field.** Is the directors/officers list exposed in the Open Data API (free tier) or only in the restricted API (public-bodies / financial institutions)? Register at `opendata.businessportal.gr/register/`, get an API key, and call the endpoint against a known Greek company before committing to GR as Tier A.
2. **RO — data.gov.ro freshness + officer coverage.** Are the published ONRC datasets fresh enough (daily? weekly?) and do they include administrators? If not, is one of the commercial Romanian APIs (listafirme.eu, risco.ro) acceptable under their published ToS for redistribution via Payee Assurance?
3. **CY — open-data dump completeness.** Does `data.gov.cy/en/group/30` publish officers and address data or only a company list? If officers are missing, pick the commercial fallback provider now rather than later.
4. **LU — HVD enforcement timeline.** LBR's API refusal is arguably non-compliant with HVD Regulation 2023/138. Is Petter willing to wait for enforcement (uncertain 2026 timeline) or commit to the commercial-aggregator fallback for LU?
5. **HU — commercial aggregator selection.** Opten, Bisnode, Creditsafe, or the unofficial companyapi.hu? Each has different pricing, redistribution terms, and officer-field coverage. This is contract work that Petter must drive directly.
6. **MT — Subject Person path.** Does Strale want to pursue AML-obliged-entity registration in Malta (heavy, but opens the MBR API)? Or accept commercial-aggregator cost and ToS terms? This is a strategic decision, not purely technical.
7. **OpenCorporates Enterprise contract.** Multiple Tier-B countries (HU, MT, CY, LU fallback) point back to OpenCorporates. Is there appetite to enter into one OC Enterprise contract to cover several gaps at once, trading commercial cost for doctrine-clean multi-country coverage?
8. **BRIS formal position.** BRIS cannot serve as a primary integration path for Payee Assurance v1 because it is a UI, not an API, and because its field set is too thin. Should the v1 product documentation explicitly name BRIS as "not a supported source" so downstream users don't ask why Strale isn't using it?

---

*End of Section 2.*
