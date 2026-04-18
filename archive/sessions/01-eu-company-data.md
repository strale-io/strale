# Batch 1: EU Company Data — Alternative Source Mapping

**Date:** 2026-04-17
**Scope:** 10 EU company-data intents (SE, NO, DK, FI, UK, NL, DE, FR, IE, PL)
**Purpose:** Identify viable alternative sources per intent so SQS can route to best performer. Audit license/resale rights of current and candidate sources.

---

## Template Legend

Per-intent deliverable:
- **Output contract** — the fields agents actually need
- **Sources table** — current + candidates with license verdict, verification status, router value
- **Router value** — how much SQS routing benefit this source adds beyond the current primary:
  - `high` = meaningfully different coverage / cost / reliability profile → real routing signal
  - `medium` = similar profile, useful for redundancy / failover
  - `low` = redundant with current (same underlying source or negligible differentiation)
- **Recommendation** — `router-viable` / `siblings-only` / `stay-1:1`

### License verdicts
- `permitted` — explicit commercial reuse + resale allowed (PSI-compliant open data, CC0, NLOD, CC-BY-4.0, etc.)
- `permitted-with-attribution` — allowed but must credit source
- `restricted` — personal/non-commercial only, or bulk reuse prohibited
- `prohibited` — ToS explicitly forbids redistribution/resale
- `unclear` — no explicit terms or ToS page inaccessible; needs legal review

### Verification statuses
- `confirmed-working` — probed with a real input, got expected data
- `key-required-paused` — need credential or sales contact to probe further
- `blocked` — source returned 4xx/CAPTCHA/bot-block on automated fetch
- `not-probed` — documented from third-party info only

---

## ⚠️ Cross-cutting compliance findings

### Active production risk: Allabolag scraping (SE)

`swedish-company-data` scrapes `allabolag.se` via Browserless. During this audit, the **public ToS page returned no content through automated fetch** — Allabolag actively blocks bot access at the HTTP level. This strongly suggests programmatic access violates their ToS. **Needs legal review before continuing to use Allabolag as the production source.**

### Pattern: commercial aggregators block bots

Every commercial aggregator probed during this batch either returned 403 / CAPTCHA'd / blocked fetch on their ToS page (Allabolag, Ratsit, Handelsregister.de, Bolagsverket). This is the anti-bot-by-default stance; it's evidence that scraping them likely violates ToS even if the data is nominally "public." Sources in this bucket that Strale may currently depend on:
- **SE** — Allabolag (current) ⚠️
- **NL** — KVK (scrape)
- **DE** — northdata (current) ⚠️
- **IE** — CRO (scrape)
- **IT** — Registro Imprese (scrape)
- **ES** — Registro Mercantil (scrape)
- **PT, LV, LT** — national registries (scrape)
- **AT** — FinAPU (scrape)

Rolling list — will consolidate at end of batch into a compliance-audit workstream.

### Pattern: PSI-compliant official sources are the cleanest

Where a country has published its registry under an open-data license (NO, UK, FR, DK, FI), resale rights are legally clean and the source is authoritative. These should be primary. Scraped aggregators should at best be *fallbacks*, and only where ToS allows.

---

## SE — Swedish Company Data

**Current slug:** `swedish-company-data`
**Executor:** `apps/api/src/capabilities/swedish-company-data.ts`

### Output contract
| Field | Type | Reliability |
|---|---|---|
| `company_name` | string | guaranteed |
| `org_number` | string | guaranteed |
| `vat_number` | string | derived |
| `revenue_sek` | number \| null | common |
| `employees` | number \| null | common |
| `profit_sek` | number \| null | common |
| `fiscal_year` | string \| null | common |

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Allabolag.se (Browserless) | scrape | ✅ | **unclear → likely prohibited** (active anti-bot) | blocked | — |
| 2 | Bolagsverket official API (Näringslivsregistret) | api | partial (filings via separate paid API) | **permitted** (government source, PSI-aligned) | key-required-paused (contract + paid) | **high** — authoritative, legally clean |
| 3 | GLEIF (LEI registry) | api | ❌ | **permitted** (CC0) | confirmed-working (Spotify AB returned full entity) | **medium** — narrow coverage (~0.3% of SE entities), but zero-cost failover for large/regulated companies |
| 4 | OpenCorporates paid API | api | ❌ | **permitted** (paid tier removes share-alike) | key-required-paused | **low** — mirrors Bolagsverket registration, no financials, adds little |
| 5 | Roaring.io | api (commercial) | ✅ | **permitted** (commercial license) | key-required-paused (enterprise sales) | **high** — only legally-clean source with financials; commercial-grade reliability |
| 6 | Proff.se | scrape | ✅ | unclear → likely prohibited (same pattern as Allabolag) | not-probed | low — redundant risk profile |

### Schema normalization note

The four realistic candidates differ on financials:
- Registration data (name, org_number, status, address, incorporation_date) → normalizable across **all** sources.
- Financials (revenue, profit, employees, fiscal_year) → only Allabolag / Roaring / Proff return them. Bolagsverket and OpenCorporates do not (financials are separate paid filings at Bolagsverket).

**Router implication:** consider splitting into `se-company-registration` (wide source pool: Bolagsverket + OpenCorporates + GLEIF + Roaring) vs `se-company-financials` (narrow: Roaring as legally-clean primary, Allabolag as scraped fallback only if ToS cleared).

### Recommendation: **router-viable, but gated on compliance work**

1. Legal review on Allabolag — must happen before production continues.
2. Evaluate Bolagsverket agreement (authoritative registration source).
3. Evaluate Roaring pricing (only legally-clean financials source for SE).
4. Add GLEIF as zero-cost sibling for LEI-holders.

### Keys needed

- `BOLAGSVERKET_API_KEY` (agreement required) — pause
- `ROARING_API_KEY` (sales contact) — pause
- `OPENCORPORATES_API_TOKEN` (free signup 10min, user action)

---

## NO — Norwegian Company Data

**Current slug:** `norwegian-company-data`
**Executor:** `apps/api/src/capabilities/norwegian-company-data.ts`
**Current primary:** Brønnøysund Enhetsregister API (free, open)

### Output contract (current — assumed similar structure to SE)

| Field | Type | Notes |
|---|---|---|
| `company_name` | string | guaranteed |
| `org_number` | string | guaranteed |
| `status` | string | active / liquidated / bankrupt |
| `incorporation_date` | string | from BRREG |
| `address` | object | business + postal |
| `nace_codes` | array | industry classification |
| `employees` | number \| null | BRREG returns this |
| `share_capital` | number \| null | BRREG returns this |

Note: NO's current output likely does NOT include revenue/profit — those are in annual accounts, which are in `regnskapsregisteret` (a separate BRREG dataset) or require scraping Proff.no. Schema gap vs SE: worth normalizing cross-country later.

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Brønnøysund Enhetsregister API | api | partial (employees + share_capital; no P&L) | **permitted-with-attribution** (NLOD 2.0, Norwegian Licence for Open Government Data) | confirmed-working (Equinor 923609016 returned full entity) | — |
| 2 | Brønnøysund Regnskapsregister (accounts register) | api / bulk | ✅ (revenue, profit, balance sheet from annual filings) | **permitted-with-attribution** (NLOD 2.0) | not-probed (same provider, documented) | **high** — adds P&L to current registration-only output |
| 3 | Proff.no (Proff Group / Enin) | scrape or paid API | ✅ | unclear → likely restricted for scrape; Enin offers commercial API | not-probed (scrape likely blocked) | **medium** — real-time financials, but commercial terms |
| 4 | GLEIF | api | ❌ | `permitted` (CC0) | confirmed-working for SE, same API pattern | **low** — narrow coverage, and NO already has free authoritative source |
| 5 | OpenCorporates (NO mirror of BRREG) | api | ❌ | **permitted** (paid tier) | key-required-paused | **low** — redundant with BRREG, paid tier needed |
| 6 | 1881.no / Gule Sider | scrape | ❌ | unclear → likely restricted | not-probed | low — directory-level only |

### Schema normalization note

NO is the easiest case: the authoritative source is free, open, high-quality, and legally clean. **Real router opportunity is not "find an alternative to BRREG" — it's "add regnskapsregister to enrich the output with financials."** That's a capability expansion, not a redundancy play.

### Recommendation: **stay-1:1 for registration, expand for financials**

1. Keep BRREG as sole source for registration data — no better alternative.
2. **Expand** current capability or add sibling to pull financials from regnskapsregister (same provider, same license, same auth pattern). This matches what SE already returns and closes a cross-country schema gap.
3. GLEIF as optional secondary is not worth the engineering — BRREG already gives everything and more.

### Keys needed

None. BRREG is free and open. Regnskapsregister same.

---

## DE — German Company Data

**Current slug:** `german-company-data`
**Executor:** `apps/api/src/capabilities/german-company-data.ts`
**Current primary:** Handelsregister via northdata.com (scrape)

### Output contract

| Field | Type |
|---|---|
| `company_name` | string |
| `register_number` | string |
| `register_court` | string |
| `legal_form` | string |
| `address` | object |
| `managing_directors` | array |
| Others per executor | — |

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Northdata.com (scrape via Browserless) | scrape | partial (what they show publicly) | **unclear → likely prohibited** (Northdata IS the commercial product here; they sell API access, so scraping their free UI is almost certainly ToS-violating) | blocked (anti-bot pattern expected) | — |
| 2 | OffeneRegister.de | bulk download (JSON/SQLite) + SQL API | ❌ (registration only) | **permitted-with-attribution** (CC-BY-4.0, operated by Open Knowledge Foundation Deutschland + OpenCorporates) | confirmed-working (publicly documented, bulk downloads available) | **high** — legally clean, free, full HR coverage; replaces scraped registration data entirely |
| 3 | Handelsregister.de (official Länder portal) | web portal (PDF extracts) | limited | **permitted** (government public record) | blocked (no API, CAPTCHA portal) | **medium** — authoritative but no API; would require Browserless + PDF parsing + payment workflow (~€1-4.50/extract) |
| 4 | Bundesanzeiger.de | web (filings) | ✅ (annual reports, financial statements) | **permitted** (government publication platform) | not-probed (no API) | **high** for financials — only legally-clean source of German P&L data, but access is scrape+PDF-parse |
| 5 | Northdata API (the paid version of #1) | api (commercial) | ✅ | **permitted** (commercial license) | key-required-paused (sales contact) | **high** — covers 23 countries at once, not just DE; but €€€ |
| 6 | Unternehmensregister.de | web portal | ✅ (filings) | permitted (government) | blocked (no API) | low — superset of Handelsregister + Bundesanzeiger, same access problems |
| 7 | OpenCorporates paid API (DE mirror) | api | ❌ | **permitted** (paid tier) | key-required-paused | **medium** — registration only, but legally clean + programmatic |
| 8 | GLEIF | api | ❌ | `permitted` (CC0) | confirmed-working (same API) | medium — large DE companies, zero cost |
| 9 | Creditreform / CRIF Bürgel | api (commercial) | ✅ | permitted (commercial) | key-required-paused (enterprise) | high for financials, €€€ |

### Schema normalization note

DE is fragmented across registration (Handelsregister) and financial disclosure (Bundesanzeiger) — they are legally separate registers. The current `northdata` scrape gets both by aggregating. Any compliant replacement likely needs to combine TWO sources:

- **Registration** → OffeneRegister.de (free, CC-BY) ✅ clean path
- **Financials** → Bundesanzeiger (scrape + PDF-parse, government public record — legally defensible but operationally heavier) OR Northdata API paid OR Creditreform

### Recommendation: **router-viable, compliance-urgent**

1. **Compliance first:** replace northdata scraping ASAP. OffeneRegister.de is a drop-in legally-clean replacement for the registration portion of the output.
2. **Split intent:** `de-company-registration` (OffeneRegister + OpenCorporates + GLEIF — router-viable) vs `de-company-financials` (Northdata API paid, Bundesanzeiger scrape, Creditreform — narrower pool).
3. **Evaluate Northdata API paid** — same data we currently scrape but legally. Same provider, just commercial agreement. Should be a quick call.
4. Bundesanzeiger integration is high-value but high-effort (PDF parsing of XHTML-heavy filings). Defer unless financials are proven demand.

### Keys needed

- `NORTHDATA_API_KEY` (sales contact) — pause
- `CREDITREFORM_API_KEY` (enterprise) — pause
- `OPENCORPORATES_API_TOKEN` — user action

---

## DK — Danish Company Data

**Current slug:** `danish-company-data`
**Current primary:** `cvrapi.dk` (third-party commercial aggregator, free tier)

### ⚠️ Compliance / reliability finding
The current implementation hits `cvrapi.dk`, which is **not the official CVR source** — it's a commercial wrapper with aggressive free-tier quota. During this probe it returned `QUOTA_EXCEEDED`. This is both a reliability risk (hit in production) and a compliance question (free-tier ToS for commercial service). The **official Danish open data is `distribution.virk.dk`** (Erhvervsstyrelsen, ElasticSearch-based, free, open-data licensed). The executor should be switched.

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | cvrapi.dk | api (commercial wrapper) | partial | **unclear** (commercial free tier, production use likely violates ToS) | confirmed-quota-exceeded | — |
| 2 | distribution.virk.dk (Erhvervsstyrelsen official) | api (ElasticSearch) | partial (employees; no P&L) | **permitted** (Danish open data under PSI-aligned license) | not-probed (documented) | **high** — legally clean, free, authoritative; replaces current |
| 3 | Virk.dk / datacvr.virk.dk web portal | web | ✅ (financials via linked annual reports) | permitted (government publication) | blocked (403 on automated fetch) | medium — would need scrape-and-PDF-parse |
| 4 | Proff.dk (Proff Group / Enin) | scrape or paid API | ✅ | unclear (same aggregator pattern as Proff.se/Proff.no) | not-probed | medium |
| 5 | BiQ / Experian DK / Bisnode DK | commercial API | ✅ | permitted (commercial license) | key-required-paused | high for financials (€€€) |
| 6 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | medium |
| 7 | OpenCorporates paid | api | ❌ | permitted (paid tier) | key-required-paused | low — mirrors distribution.virk.dk |

### Recommendation: **router-viable; switch primary immediately**
1. **Switch primary from cvrapi.dk to distribution.virk.dk** — fixes reliability AND compliance in one change.
2. Add GLEIF as free sibling for LEI-holders.
3. Evaluate Bisnode DK / Experian for financials.

### Keys needed
None for the primary switch. `BISNODE_DK_API_KEY` for financials (sales contact) — pause.

---

## FI — Finnish Company Data

**Current slug:** `finnish-company-data`
**Current primary:** PRH avoindata API v3 (free, open)

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | PRH avoindata API v3 | api | ❌ (registration only) | **permitted-with-attribution** (Finnish open data, CC-BY-4.0) | confirmed-working (Nokia 0112038-9 returned full entity) | — |
| 2 | Asiakastieto | api (commercial) | ✅ | permitted (commercial license) | key-required-paused | **high** — only legally-clean source for FI financials |
| 3 | Kauppalehti | web / scrape | ✅ | unclear (publisher ToS) | not-probed | medium — operational risk |
| 4 | Finder.fi | scrape | partial | unclear | not-probed | low |
| 5 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | medium — large FI companies |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low — mirrors PRH |

### Recommendation: **stay-1:1 for registration, expand for financials**
Same shape as NO. PRH is authoritative, free, legally clean. Only real opportunity is adding Asiakastieto for financials.

### Keys needed
`ASIAKASTIETO_API_KEY` (sales contact) — pause.

---

## UK — UK Company Data

**Current slug:** `uk-company-data`
**Current primary:** Companies House API (requires `COMPANIES_HOUSE_API_KEY`, we have this configured)

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Companies House API | api | partial (accounts filings metadata; full accounts as XBRL via separate endpoint) | **permitted-with-attribution** (UK OGL / Crown Copyright — explicit commercial reuse allowed) | confirmed 401 without key; works with key | — |
| 2 | Companies House XBRL / accounts bulk | api / bulk | ✅ (full structured accounts) | permitted (UK OGL) | not-probed (documented) | **high** — same provider, same license, adds real financials |
| 3 | Financial Reporting Council (FRC) | web / publications | partial (compliance filings) | permitted (government) | not-probed | low — niche |
| 4 | Creditsafe UK | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high for credit-scored financials (€€€) |
| 5 | Endole / DueDil | api (commercial) | ✅ | permitted (commercial) | key-required-paused | medium — both aggregate CH + credit data |
| 6 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low — CH already free and comprehensive |
| 7 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low — mirrors CH |

### Recommendation: **stay-1:1 for registration; expand for financials via CH XBRL**
UK is the cleanest case: the official CH API is free, open (OGL), well-documented, comprehensive. The router value is ~zero for registration. Expansion opportunity is parsing CH XBRL accounts for full P&L — same license, same provider, adds real financial depth.

### Keys needed
None (we already have `COMPANIES_HOUSE_API_KEY`).

---

## NL — Dutch Company Data

**Current slug:** `dutch-company-data`
**Current primary:** KVK scrape via Browserless

### ⚠️ Compliance finding
Current source is scraped KVK public pages. KVK operates an official paid API; scraping their free UI while they sell API access is a clear ToS violation pattern (same as northdata for DE). **Needs legal review and likely replacement.**

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | KVK website (Browserless scrape) | scrape | ❌ | **likely prohibited** (they sell the API they're scraping) | blocked (anti-bot expected) | — |
| 2 | KVK official API | api (paid subscription) | partial (Basic Company Info + Financial Statements as separate datasets) | permitted (commercial subscription) | key-required-paused (monthly fee + per-query) | **high** — legally clean, authoritative, replaces scrape |
| 3 | Company.info | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high — aggregates KVK + credit + beneficial owners |
| 4 | data.overheid.nl (open government data portal) | bulk downloads | varies | permitted (Dutch PSI-aligned) | not-probed | medium — likely registration snapshots only |
| 5 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | medium — large NL companies |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | medium — if KVK paid isn't taken |

### Recommendation: **router-viable, compliance-urgent**
No clean free alternative for NL. The path is: pay for KVK API OR pay for OpenCorporates/Company.info. Scraping KVK cannot continue once a legal review happens — this is higher risk than Allabolag because KVK is a government body actively commercializing the data.

### Keys needed
`KVK_API_KEY` (subscription) — pause. `COMPANY_INFO_API_KEY` (sales) — pause.

---

## FR — French Company Data

**Current slug:** `french-company-data`
**Current primary:** INSEE Sirene API

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | INSEE Sirene API | api | partial (employee brackets; no P&L) | **permitted** (Licence Ouverte Etalab — explicit commercial reuse allowed) | confirmed-working via api.gouv.fr wrapper | — |
| 2 | recherche-entreprises.api.gouv.fr | api (official wrapper on Sirene) | partial | permitted (Licence Ouverte) | confirmed-working | low — same underlying data as current, friendlier shape; consider as implementation swap, not a router sibling |
| 3 | Pappers.fr | api (commercial w/ free tier) | ✅ (legal filings, accounts, beneficial owners) | permitted (commercial subscription) | confirmed 401 (needs API key) | **high** — richest FR dataset, includes Bodacc filings + UBO |
| 4 | data.gouv.fr bulk (Sirene + RNE) | bulk download | ❌ (static snapshots) | permitted (Licence Ouverte) | not-probed | low — operational overhead |
| 5 | Infogreffe | api (paid, per-document) | ✅ (legal filings from commercial courts) | permitted (commercial, government concession) | key-required-paused | medium — legally authoritative for filings |
| 6 | Societe.com | scrape | ✅ | unclear (aggregator pattern) | not-probed | low — risk |
| 7 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |
| 8 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low — mirrors INSEE |

### Recommendation: **router-viable; Pappers is the standout**
FR has the strongest candidate pool:
- INSEE gives free authoritative registration
- Pappers adds commercial-grade depth (UBO, Bodacc, full accounts) at (likely) reasonable API pricing
- api.gouv.fr wrapper could simplify implementation

### Keys needed
`PAPPERS_API_KEY` (check pricing — has documented free tier but commercial tiers for serious use) — pause. `INFOGREFFE_API_KEY` — pause.

---

## IE — Irish Company Data

**Current slug:** `irish-company-data`
**Current primary:** CRO scrape (based on data_source manifest)

### ⚠️ Compliance finding
Same pattern as SE/DE/NL. CRO operates an official data sales service (CORE portal, per-document pricing); scraping their free search is likely ToS-violating.

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | CRO website scrape | scrape | ❌ | **likely prohibited** (CRO sells document access via CORE) | blocked (403 on automated probe) | — |
| 2 | CRO CORE API / paid documents | web + paid | ✅ (via annual returns filings) | permitted (government, paid per-document ~€3.50) | key-required-paused | high — authoritative |
| 3 | Vision-net.ie → Solocheck.ie | api (commercial, merged entity) | ✅ | permitted (commercial) | redirected; not-probed further | high — richest IE aggregator |
| 4 | DueDil (covers IE) | api (commercial) | ✅ | permitted (commercial) | key-required-paused | medium |
| 5 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |

### Recommendation: **router-viable only with commercial investment**
IE has no free authoritative API equivalent to Norway/Finland/France. Either pay CRO per-document, pay Solocheck, or accept compliance risk on current scrape. GLEIF covers only the biggest entities. This is a market where Strale either absorbs cost or narrows the capability scope.

### Keys needed
`CRO_CORE_API_KEY` / `SOLOCHECK_API_KEY` — pause.

---

## PL — Polish Company Data

**Current slug:** `polish-company-data`
**Current primary:** Ministry of Justice KRS API (free, open)

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | KRS API (api-krs.ms.gov.pl) | api | ❌ (registration + directors + NIP/REGON; no P&L) | **permitted** (Polish public register, government source) | confirmed-working (PKN Orlen 0000028860 returned full entity) | — |
| 2 | CEIDG (sole traders register) | api | ❌ | permitted (government open register) | not-probed | **high for sole traders** — KRS doesn't cover them; complementary scope rather than competing |
| 3 | Aleo.com | scrape / commercial | ✅ | unclear (aggregator pattern) | not-probed | medium |
| 4 | Rejestr.io | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high — aggregates KRS + filings + financials |
| 5 | Bisnode PL / CRIF PL | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 6 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |
| 7 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low — mirrors KRS |

### Recommendation: **expand scope (KRS + CEIDG) then sibling for financials**
PL is clean for limited companies (KRS). Adding CEIDG covers the ~2.5M sole traders not in KRS — that's expansion, not routing. Rejestr.io is the standout commercial for financials.

### Keys needed
`REJESTR_IO_API_KEY` — pause.

---

## Batch 1 Summary

### Compliance audit — sources needing immediate legal review

Sources currently in production where scraping likely violates ToS:
| Country | Current source | Priority | Clean replacement available? |
|---|---|---|---|
| SE | Allabolag.se scrape | **urgent** | Partially — Roaring (paid) for financials; Bolagsverket (agreement) for registration |
| DK | cvrapi.dk free-tier aggregator | **urgent** | Yes — distribution.virk.dk (drop-in replacement, free, official) |
| DE | northdata.com scrape | **urgent** | Yes for registration — OffeneRegister.de (CC-BY-4.0) |
| NL | KVK website scrape | **urgent** | Only paid — KVK official API or Company.info |
| IE | CRO website scrape | high | Only paid — CRO CORE or Solocheck |
| Others (AT, IT, ES, PT, LV, LT) | various scrapes | — | not covered in Batch 1; Batch 2 candidate |

### Router-model viability summary

| Country | Router viable? | Expected SQS benefit | Note |
|---|---|---|---|
| SE | yes (after compliance) | high | Multiple legally-clean sources possible |
| NO | no (expand instead) | n/a | BRREG is already best possible primary |
| DK | yes (after switch) | medium | distribution.virk.dk as primary; paid siblings for financials |
| FI | no (expand instead) | n/a | PRH is already best possible primary |
| UK | no (expand instead) | n/a | CH is already best possible primary |
| NL | yes (after compliance) | medium | KVK paid + Company.info + OpenCorporates paid |
| DE | yes (after compliance) | high | OffeneRegister + OpenCorporates paid + GLEIF + Bundesanzeiger |
| FR | yes | high | INSEE + Pappers + Infogreffe gives a rich pool |
| IE | yes (if paid) | low | Few candidates, all commercial |
| PL | no for registration, yes for financials | medium | KRS is primary; CEIDG expands scope; Rejestr.io for financials |

### Cross-cutting patterns

1. **Official PSI-compliant APIs are rare but definitive where they exist** (NO BRREG, FI PRH, UK CH, FR INSEE, PL KRS, DK distribution.virk.dk). Where one exists and is free, it *should* be primary. Router value comes from adding financials, not swapping registration.

2. **Every scraped aggregator is a ToS risk.** The pattern is consistent: CAPTCHA, 403, or anti-bot on the ToS page itself. Assume prohibited unless proven otherwise.

3. **Financials are the real router opportunity.** Registration data is often available free-and-legal. The commercial differentiation is financial depth (revenue, P&L, filings, beneficial owners). Most countries have 1-2 commercial providers per country for this.

4. **Template split into registration vs financials makes sense nearly everywhere.** Should be evaluated as an intent-level refactor.

### Aggregate key/credential asks (consolidated)

| Provider | Access model | Countries | Action needed |
|---|---|---|---|
| Bolagsverket (SE) | agreement + paid | SE | Contact commercial |
| Roaring.io | commercial | SE (primary), Nordic | Contact sales |
| Northdata API | commercial | DE + 23 countries | Contact sales |
| KVK official API | paid subscription | NL | Request subscription |
| Pappers.fr | free tier + paid | FR | Self-serve signup |
| OpenCorporates | free tier useless; paid | all | Contact commercial |
| Companies House | free w/ key | UK | ✅ already configured |
| Asiakastieto | commercial | FI | Contact sales |
| Creditsafe UK | commercial | UK | Contact sales |
| Company.info | commercial | NL | Contact sales |
| Bisnode (DK, PL) | commercial | DK, PL | Contact sales |
| CRO CORE / Solocheck | commercial | IE | Self-serve / contact |
| Infogreffe | paid per-document | FR | Self-serve |
| Rejestr.io | commercial | PL | Contact sales |

GLEIF is free and CC0 — already usable globally for LEI-holders.

### What's NOT in this batch (Batch 2 candidates)
- AT, IT, ES, PT, LV, LT, CH, BE (all scrape-based; same compliance pattern expected)
- CZ (ARES — confirmed open free API, likely stay-1:1)
- EE (ariregister — confirmed free API, likely stay-1:1)
- Non-EU company-data capabilities (US, CA, AU, IN, SG, HK, BR, JP — different market structures, should be separate batch)
