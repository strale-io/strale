# Litigation & Bankruptcy Data Sources for Payee Assurance v1.1

**Date:** 2026-04-28
**Author:** Research session (Code)
**Scope:** Build a litigation / bankruptcy / regulatory-action leg for the Payee Assurance bundle covering US, UK, EU27, Norway, Switzerland.
**Constraints:** No fixed monthly minimums >$5k/yr. Prefer PAYG. Skip enterprise-only vendors. Must be Tier-2 compliant under DEC-20260428-A (public-records sourcing, redistribution license, primary-source provenance).

---

## 1. Vendor / source table

| # | Vendor / source | Coverage | Sourcing | Per-call rate | Monthly min | Setup | Tier-2 compliant? | Verdict (v1.1) |
|---|---|---|---|---|---|---|---|---|
| 1 | **PACER** (uscourts.gov) | US federal civil + bankruptcy + appellate | gov-direct | $0.10/page, $3 cap/doc | $0 (≤$30/qtr waived) | $0 | Yes (gov-direct) | **YES** — bankruptcy lookups |
| 2 | **CourtListener / RECAP** (Free Law Project) | US federal (PACER mirror), opinions, judges | Tier-2 licensed-public; CC-BY-style | Free | $0 | $0 | Yes (FLP redistributes by mission) | **YES** — primary lookup engine |
| 3 | **CourtListener Fetch API** | On-demand PACER pull | gov-direct (uses your PACER creds) | PACER pass-through ($0.10/pg) | $0 | $0 | Yes | **YES** — fallback for not-yet-indexed |
| 4 | **PacerMonitor** | US federal + bankruptcy | Licensed-public (PACER reseller) | quote-gated, public pricing not published | unknown | unknown | Likely yes | maybe — quote first |
| 5 | **Docket Alarm** (Fastcase/vLex) | US federal + state | Licensed-public | $1/federal search, $3/docket update, $4/doc; or $99/mo flat | $39.99 (PAYG base) or $99 flat | $0 | Yes | **YES (fallback)** — only US PAYG with stated rates |
| 6 | **UniCourt** | US federal + ~state coverage | Licensed-public + scrape-derived | quote-gated (Enterprise only for API); self-serve $49–$299/mo capped at 200 searches | enterprise quote | enterprise | Mixed — sourcing not transparent | NO for v1.1 — gated + opaque |
| 7 | **Trellis Law** | 45 US states, 3,335 courts, federal+bankruptcy via API v2 | Licensed-public + scrape-derived | API quote-gated; subscription from $69.95/mo (browse only) | enterprise quote for API | enterprise | Unclear sourcing disclosure | maybe — only state aggregator at scale |
| 8 | **Inforuptcy** | US bankruptcy creditor lists, asset listings | Licensed-public (PACER reseller) | day/month/annual; pricing not on public page (gated portal) | unknown | $0 | Yes | maybe — niche use case (creditor matching) |
| 9 | **sec-api.io** | SEC enforcement + litigation releases + admin proceedings (1995–) | Licensed-public (SEC press feed) | $49/mo Personal, $199/mo Business; free 100 calls | $49 | $0 | Yes (SEC primary source) | **YES** — cheapest structured SEC enforcement |
| 10 | **SEC.gov / EDGAR data.sec.gov** | EDGAR filings, press releases, litigation release HTML | gov-direct | Free (no auth) | $0 | $0 | Yes | YES — but enforcement is unstructured HTML; ingest cost = M |
| 11 | **DOJ press releases (RSS)** | DOJ Main + 94 USAOs + Antitrust | gov-direct | Free | $0 | $0 | Yes | YES — RSS ingest, NER-extract entities |
| 12 | **CFTC enforcement RSS + OpenSanctions us_cftc_enforcement_actions** | CFTC enforcement actions | gov-direct + OS-curated | Free (gov RSS) / OS commercial license | $0 | $0 | Yes | YES — already have OS license |
| 13 | **OpenSanctions worldbank_debarred + IADB + ADB + 165k regulatory watchlists** | Multilateral debarment, regulatory enforcement | Licensed-public (we already pay) | bundled with our existing OS license | already paid | $0 | Yes | **YES** — zero marginal cost |
| 14 | **UK Companies House — /insolvency endpoint** | UK LTDs, insolvency events on company filings | gov-direct | Free, 600 req/5min | $0 | $0 | Yes | **YES** — already integrated |
| 15 | **UK Insolvency Service Individual Insolvency Register** | UK individual bankruptcy / DRO / IVA | gov-direct | Free; **no public REST API** (search-form only); Breathing Space API exists for different purpose | $0 | $0 (S–M scrape effort = Tier-1, BLOCKED) | Tier-1 issue — no scraping | NO direct — punt to UBO leg covering directors |
| 16 | **UK Find Case Law (National Archives)** | UK High Court, Upper Tribunal, EWCA, UKSC judgments | gov-direct | Free, 1000 req / 5 min per IP | $0 | $0 | Yes (Open Justice Licence) | YES — but **bulk computational analysis requires separate (free) application** |
| 17 | **UK FCA Final Notices via Financial Services Register API** | FCA enforcement (firms + individuals), ~37 Final Notices/yr | gov-direct | Free, 50 req/10s | $0 | extract subscription handbook gives full disciplinary history | Yes | **YES** |
| 18 | **DE Insolvenzbekanntmachungen.de** | All German insolvency court notices | gov-direct | **No native API** (search-form only); third-party APIs exist | $0 (Tier-1 if we built it) | n/a | Direct = Tier-1 blocked | NO direct |
| 19 | **DE Insolvenz-Radar** | German insolvency notices, REST API + push | Licensed-public (scrapes Insolvenzbekanntmachungen, public-records statutory) | Free / Standard / Business / Expert tiers; rate is per-account daily window — quote for high volume | unknown but tiered | $0 self-serve | Yes if license terms allow redistribution — must verify | **YES (probable)** — verify license |
| 20 | **DE North Data API** | DE + 23 EU countries, insolvency events included | Licensed-public + own ingestion | €500–€1,500/mo, 12-month minimum, 5,000 included calls + €0.05–0.10 overage | €500 (=€6k/yr **violates <$5k cap**) | 12-mo lock | Yes but contractually no resale | NO — fails monthly-min + no-resale clauses |
| 21 | **FR BODACC API** | All French BODACC notices (insolvency, sales, creations) | gov-direct | Free, JSON REST, opendatasoft-hosted | $0 | $0 | Yes (etalab-2.0 license = redistribution OK) | **YES** |
| 22 | **NL Centraal Insolventieregister (rechtspraak.nl)** | NL insolvency + suspension of payment | gov-direct | Free; search-form, **no documented JSON API** | $0 | scrape effort (Tier-1 blocked) | Direct = Tier-1 blocked | NO direct |
| 23 | **AT Ediktsdatei (justiz.gv.at IWG API)** | Austrian insolvency + auctions, JSON paginated | gov-direct | Free, JSON REST, requires IWG license application (free) | $0 | application | Yes (IWG = info-reuse statute) | **YES** |
| 24 | **ES Registro Público Concursal (publicidadconcursal.es)** | Spanish insolvency, 4 sections | gov-direct | Free; CSV consultations; opendata.registradores.org has datasets — **no documented REST API** | $0 | scrape risk if no API | Direct = depends on data path | maybe — bulk dataset ingest |
| 25 | **SE Bolagsverket valuable-datasets API (HVD)** | Swedish bankruptcy + liquidation + reconstruction events | gov-direct | Free, OAuth2/JSON REST, EU HVD directive | $0 | $0 | Yes | **YES** — already integrated |
| 26 | **NO Brønnøysund Konkursregister** | Norwegian bankruptcy + compulsory liquidation/dissolution | gov-direct | Free JSON API + daily XML subscription | $0 | $0 | Yes | **YES** |
| 27 | **CH Zefix REST API + SHAB feed** | Swiss commercial register + daily SHAB notices (incl. insolvency) | gov-direct | Free REST | $0 | $0 | Yes | **YES** |
| 28 | **IT InfoCamere / accessoallebanchedati** | Italian Registro Imprese, insolvency requires separate query | gov-direct (paid per certificate) | per-certificate fees, not PAYG-friendly for bulk | depends | account opening | Yes | maybe — investigate for v1.2 |

---

## 2. Direct-ingest analysis (free government / court APIs)

Group by region, with engineering effort (S = <1 day, M = 1–5 days, L = >1 week) and rough share of typical Payee Assurance traffic. Assumption: customer mix skews EU/Nordic heavy near-term (Strale's wedge is EU/Nordic KYB), with growing US share — call it 60% EU/Nordic, 35% US, 5% rest-of-world for v1.1 planning.

### United States (~35% of traffic)
- **CourtListener REST API + RECAP** (S, ~70% of US litigation/bankruptcy traffic answerable for free). 5,000 req/hr authenticated. Best engineering ROI in the entire memo. Bankruptcy court IDs explicitly supported.
- **CourtListener Fetch API** (S, gap-filler for non-indexed cases at PACER pass-through pricing). Use only when CL miss confirmed.
- **SEC EDGAR data.sec.gov** (M, structured filings — but Litigation Releases / AAERs are HTML press pages, need parser). For structured SEC enforcement, sec-api.io's $49/mo Personal tier is cheaper than building.
- **DOJ press release RSS** (M, includes NER pipeline to extract defendant entities; ~10–20 releases/day). Good signal for high-severity flags.
- **CFTC enforcement RSS** (S, low volume, high signal).

US estimated free-coverage: **~80–85% of typical Payee Assurance lookups** if combined CourtListener + SEC + DOJ/CFTC + sec-api.io for SEC structured enforcement.

### UK (~10% of EU traffic)
- **Companies House `/company/{n}/insolvency`** (S, already integrated). Covers LTD insolvency events.
- **Find Case Law National Archives** (M, free, 1000 req/5min — but Open Justice Licence prohibits "computational analysis" without a separate (free) application; we must apply before launch).
- **FCA Final Notices via FS Register API** (M, 50 req/10s, JSON enforcement history including final notice text).
- Individual Insolvency Register: **gap** — only search-form, scraping it is Tier-1 prohibited. Punt or pay for a Tier-2 vendor.

UK free-coverage: **~75%** (gap = individual insolvency).

### EU27 + Norway / Switzerland (~50% of EU traffic)
- **France BODACC** (S, free JSON REST, etalab license, comprehensive). Single best EU insolvency source.
- **Sweden Bolagsverket HVD** (S, already in scope — free OAuth2/JSON, EU High-Value-Dataset compliant).
- **Norway Brønnøysund Konkursregister** (S, free JSON + XML subscription).
- **Switzerland Zefix + SHAB** (S, free REST, Swagger-documented).
- **Austria Ediktsdatei IWG API** (M, requires written IWG license application — bureaucratic but free).
- **Germany Insolvenzbekanntmachungen** — gap (no gov API). Use Insolvenz-Radar (Tier-2 vendor, must verify redistribution clause); North Data fails monthly-min cap.
- **Netherlands rechtspraak.nl Centraal Insolventieregister** — gap (no API). No clean Tier-2 vendor identified at v1.1 budget.
- **Spain RPC** — partial (open-data dataset bulk download possible, no REST API).
- **Italy** — gap-ish (per-certificate model, not PAYG-friendly).
- **Other EU27 (PL, BE, IE, FI, DK, etc.)** — sample-check during v1.1 build; many publish via BRIS / e-Justice but coverage of insolvency varies sharply.

EU free-coverage: **~60%** weighted by typical traffic (FR, SE, NO, CH, AT, UK plus Companies House insolvency = high; DE/NL = gap).

---

## 3. Recommended architecture

**Tiered fan-out per lookup, written as a normalized "litigation_check" capability:**

1. **Free direct-ingest first** (always tried, no marginal cost):
   - US: CourtListener REST API (federal + bankruptcy + opinions) + DOJ RSS NER + CFTC RSS NER.
   - UK: Companies House `/insolvency` + FCA FS Register API + Find Case Law.
   - FR: BODACC API.
   - SE: Bolagsverket HVD.
   - NO: Brønnøysund Konkursregister.
   - CH: Zefix + SHAB.
   - AT: Ediktsdatei IWG (after license application).
   - All regions: OpenSanctions debarment + regulatory-watchlist datasets (we already license these).

2. **Vendor PAYG fill-in for gaps:**
   - US SEC enforcement structured: **sec-api.io Personal tier ($49/mo)**. Cheaper than parsing SEC HTML and far cheaper than UniCourt/Trellis.
   - US state courts (where CourtListener doesn't reach): **Docket Alarm PAYG** ($1/federal search, $3/docket, $4/doc) is the only US vendor with published per-call PAYG that fits the constraint. Trellis and UniCourt API are quote-gated; do not pursue at v1.1.
   - DE insolvency: **Insolvenz-Radar** at lowest tier — verify redistribution clause before integration; otherwise punt.

3. **Honest disclosure of gaps in v1.1:**
   - **Netherlands** individual + corporate insolvency: punt to v1.2.
   - **UK individual insolvency**: punt to v1.2 (corporate covered via Companies House).
   - **Germany insolvency**: contingent on Insolvenz-Radar license check.
   - **Italy / Spain / Eastern EU**: surface-level only via OpenSanctions watchlists; full insolvency coverage = v1.2.
   - UCC liens (US) already covered by Cobalt Intelligence (per prompt).

The output schema must include `coverage_status: "checked" | "not_covered_jurisdiction" | "data_unavailable"` per leg, so customers see honest gaps rather than a misleading clean bill.

---

## 4. Honest assessment

**Litigation/bankruptcy IS shippable as a v1.1 leg if scoped honestly.** The free-data surface for US (via CourtListener/RECAP), UK (Companies House + FCA + Find Case Law), France (BODACC), Nordics, Switzerland, and Austria genuinely covers most realistic Payee Assurance use cases at zero marginal cost. The combined engineering effort is **~15–20 dev-days** for the in-scope free integrations plus ~5 days for the sec-api.io paid integration plus ~3 days for Docket Alarm PAYG fallback.

**Estimated cost-per-call at 1,000 calls/month (mixed 35% US / 60% EU/Nordic / 5% RoW):**
- Free-tier hits: ~700 calls fully free.
- sec-api.io fixed $49/mo amortised across ~150 US-relevant calls = ~$0.33/call (but these are only triggered for entities with US footprint).
- Docket Alarm PAYG: ~50 calls × $1/search × ~2 docket fetches = ~$100/mo.
- PACER pass-through via CourtListener Fetch (rare gap-fills): ~$30/mo.
- **Total: ~$180/mo for 1,000 calls = ~$0.18/call blended cost.** Well under the €0.20–0.30 surcharge we'd add to a Payee Assurance bundle.

**Recommendation: ship v1.1 with explicit "covered jurisdictions" list (US-fed, US-bk, UK-corp, FR, SE, NO, DK, CH, AT) and "v1.2 roadmap" disclosure for DE-direct, NL, UK-individual, IT, ES.** The most surprising finding — that the EU's central insolvency data layer is so fragmented that Germany and Netherlands have no first-party JSON API in 2026 — is itself a salesworthy story. Strale being honest about that gap, while competitors paper it over with low-quality scrape vendors, is on-brand for the platform's positioning.

The two non-negotiables before merging this leg:
1. Apply for the UK National Archives Open Justice "computational analysis" addendum (free, ~1 week SLA per their docs).
2. Verify Insolvenz-Radar's redistribution clause in writing before integrating; if it fails Tier-2, drop DE from v1.1 explicitly rather than substitute a scrape-only vendor.

---

## Sources

- PACER pricing: https://pacer.uscourts.gov/pacer-pricing-how-fees-work
- CourtListener REST: https://www.courtlistener.com/help/api/rest/
- CourtListener RECAP / Fetch: https://www.courtlistener.com/help/api/rest/recap/
- UniCourt pricing: https://unicourt.com/pricing/
- Trellis Law plans: https://trellis.law/plans, https://trellis.law/legal-data-api
- Docket Alarm: https://www.docketalarm.com/api/
- Inforuptcy pricing: https://www.inforuptcy.com/pricing
- sec-api.io pricing: https://sec-api.io/pricing
- SEC enforcement docs: https://sec-api.io/docs/sec-enforcement-actions-database-api, https://www.sec.gov/enforcement-litigation/litigation-releases
- DOJ news / RSS: https://www.justice.gov/news/press-releases, https://www.justice.gov/atr/news-feeds
- CFTC enforcement: https://www.cftc.gov/LawRegulation/EnforcementActions/index.htm
- OpenSanctions WB debarment: https://www.opensanctions.org/datasets/worldbank_debarred/
- OpenSanctions CFTC: https://www.opensanctions.org/datasets/us_cftc_enforcement_actions/
- OpenSanctions datasets index: https://www.opensanctions.org/datasets/
- UK Insolvency Service API catalogue: https://www.api.gov.uk/is/
- UK Companies House insolvency: https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/insolvency
- UK Find Case Law public API: https://nationalarchives.github.io/ds-find-caselaw-docs/public
- UK FCA Final Notices / FS Register: https://www.fca.org.uk/about/how-we-regulate/enforcement, https://www.fca.org.uk/publication/documents/register-extract-handbook.pdf
- DE Insolvenzbekanntmachungen: https://neu.insolvenzbekanntmachungen.de/ap/
- DE Insolvenz-Radar API: https://insolvenz-radar.de/api/
- DE North Data API pricing: https://www.northdata.com/_data
- FR BODACC API: https://www.bodacc.fr/pages/api-bodacc/, https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/api/
- NL Centraal Insolventieregister: https://insolventies.rechtspraak.nl/
- AT Ediktsdatei IWG: https://www.bmj.gv.at/dam/jcr:9b19d2a0-6dc7-4df6-b267-c35d89128b5c/schnittstellenbeschreibung-ediktsdatei
- ES RPC: https://www.publicidadconcursal.es/, https://opendata.registradores.org
- SE Bolagsverket HVD: https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/vardefulladatamangder/apiforvardefulladatamangder.5513.html
- NO Brønnøysund Konkursregister: https://www.brreg.no/en/searching-our-registers/announcements/about-announcements/announcements-from-the-register-of-bankruptcies/, https://brreg.github.io/docs/apidokumentasjon/
- CH Zefix REST: https://www.zefix.admin.ch/ZefixPublicREST/swagger-ui/index.html
- IT InfoCamere: https://accessoallebanchedati.registroimprese.it/abdo/?lang=en
- BaFin databases: https://www.bafin.de/EN/PublikationenDaten/Datenbanken/Datenbanken_node_en.html
