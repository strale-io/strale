# Batch 1: EU Company Data — Alternative Source Mapping

**Date:** 2026-04-17 (mapping) / 2026-04-18 (correction note added)
**Scope:** 10 EU company-data intents (SE, NO, DK, FI, UK, NL, DE, FR, IE, PL)
**Purpose:** Identify viable alternative sources per intent so SQS can route to best performer. Audit license/resale rights of current and candidate sources.

---

## ⚠️ Correction (2026-04-18, discovered during Batch 2)

Two current-source entries in this document are stale — the real implementation was discovered by inspecting `lib/northdata.ts` during Batch 2:

| Country | This doc says | Actual code | See |
|---|---|---|---|
| NL | KVK website (Browserless scrape) | **northdata.com scrape** (shared `lib/northdata.ts`) | Batch 2 doc, top section |
| PL | KRS API (api-krs.ms.gov.pl) | **northdata.com scrape** (KRS `OdpisAktualny` endpoint is unused) | Batch 2 doc, top section |

The good news for PL: live probe against `api-krs.ms.gov.pl/api/krs/OdpisAktualny/{krs}` **works** — it's the lowest-friction compliance fix in the full audit. The Batch 2 "Scope-expanding finding" section covers the full northdata divergence (7 capabilities, 5 of them with manifest-vs-code mismatch).

Tables below are left as-originally-mapped for diff clarity; treat the Batch 2 correction as authoritative where they conflict.

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

`swedish-company-data` scrapes `allabolag.se` via Browserless. During this audit, the **public ToS page returned no content through automated fetch** — Allabolag actively blocks bot access at the HTTP level. This strongly suggests programmatic access violates their ToS. Already addressed by DEC-20260405-A course-correction.

### Pattern: commercial aggregators block bots

Every commercial aggregator probed during this batch either returned 403 / CAPTCHA'd / blocked fetch on their ToS page (Allabolag, Ratsit, Handelsregister.de, Bolagsverket). This is the anti-bot-by-default stance; it's evidence that scraping them likely violates ToS even if the data is nominally "public."

### Pattern: PSI-compliant official sources are the cleanest

Where a country has published its registry under an open-data license (NO, UK, FR, DK, FI), resale rights are legally clean and the source is authoritative. These should be primary. Scraped aggregators should at best be *fallbacks*, and only where ToS allows.

---

## SE — Swedish Company Data

**Current slug:** `swedish-company-data` · **Primary:** Allabolag.se (Browserless scrape)

### Output contract
| Field | Type |
|---|---|
| `company_name` | string |
| `org_number` | string |
| `vat_number` | string (derived) |
| `revenue_sek` | number \| null |
| `employees` | number \| null |
| `profit_sek` | number \| null |
| `fiscal_year` | string \| null |

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Allabolag.se (Browserless) | scrape | ✅ | **unclear → likely prohibited** (active anti-bot) | blocked | — |
| 2 | Bolagsverket official API (Näringslivsregistret) | api | partial | **permitted** (government, PSI-aligned) | key-required-paused (contract + paid) | **high** — authoritative, legally clean |
| 3 | GLEIF (LEI registry) | api | ❌ | **permitted** (CC0) | confirmed-working (Spotify AB) | **medium** — narrow coverage (~0.3% of SE entities) |
| 4 | OpenCorporates paid API | api | ❌ | **permitted** (paid tier) | key-required-paused | **low** |
| 5 | Roaring.io | api (commercial) | ✅ | **permitted** | key-required-paused (enterprise) | **high** — only legally-clean source with financials |
| 6 | Proff.se | scrape | ✅ | unclear → likely prohibited | not-probed | low |

### Recommendation: **router-viable, gated on compliance (DEC-20260405-A)**

---

## NO — Norwegian Company Data

**Current slug:** `norwegian-company-data` · **Primary:** Brønnøysund Enhetsregister API (free, open)

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Brønnøysund Enhetsregister API | api | partial (employees + share_capital) | **permitted-with-attribution** (NLOD 2.0) | confirmed-working (Equinor 923609016) | — |
| 2 | Brønnøysund Regnskapsregister (accounts) | api / bulk | ✅ | **permitted-with-attribution** (NLOD 2.0) | not-probed (same provider) | **high** — adds P&L |
| 3 | Proff.no | scrape or paid API | ✅ | unclear → likely restricted for scrape | not-probed | medium |
| 4 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |
| 5 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |

### Recommendation: **stay-1:1 for registration, expand for financials (Regnskapsregister)**

---

## DK — Danish Company Data

**Current slug:** `danish-company-data` · **Primary:** cvrapi.dk (third-party commercial aggregator, free tier)

### ⚠️ Compliance/reliability finding
Current hits cvrapi.dk free tier (50 req/day/IP) → `QUOTA_EXCEEDED` on Railway single-IP. Not the official Danish source. Official source is `distribution.virk.dk` (ElasticSearch, free, open-data licensed).

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | cvrapi.dk | api (commercial wrapper) | partial | **unclear** | confirmed-quota-exceeded | — |
| 2 | distribution.virk.dk (Erhvervsstyrelsen) | api (ElasticSearch) | partial | **permitted** (Danish PSI-aligned) | not-probed (docs); blocked on ERST credentials (~3wk after they reply) | **high** — legally clean replacement |
| 3 | Virk.dk web portal | web | ✅ | permitted | blocked | medium |
| 4 | Proff.dk | scrape/paid | ✅ | unclear | not-probed | medium |
| 5 | Bisnode DK / Experian | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 6 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | medium |

### Recommendation: **router-viable; switch primary as soon as ERST creds arrive**

---

## FI — Finnish Company Data

**Current slug:** `finnish-company-data` · **Primary:** PRH avoindata API v3 (free, open)

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | PRH avoindata API v3 | api | ❌ | **permitted-with-attribution** (CC-BY-4.0) | confirmed-working (Nokia 0112038-9) | — |
| 2 | Asiakastieto | api (commercial) | ✅ | permitted (commercial) | key-required-paused | **high** — only legally-clean FI financials |
| 3 | Kauppalehti | web / scrape | ✅ | unclear | not-probed | medium |
| 4 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | medium |
| 5 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |

### Recommendation: **stay-1:1 for registration, expand for financials**

---

## UK — UK Company Data

**Current slug:** `uk-company-data` · **Primary:** Companies House API (key configured)

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Companies House API | api | partial (filings metadata; XBRL separate) | **permitted-with-attribution** (UK OGL / Crown Copyright) | confirmed 401 without key; works with key | — |
| 2 | Companies House XBRL / accounts bulk | api / bulk | ✅ | permitted (UK OGL) | not-probed | **high** — adds real financials |
| 3 | Creditsafe UK | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 4 | Endole / DueDil | api (commercial) | ✅ | permitted (commercial) | key-required-paused | medium |
| 5 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |

### Recommendation: **stay-1:1 for registration; expand via CH XBRL for financials**

---

## NL — Dutch Company Data

**Current slug:** `dutch-company-data` · **Primary:** ⚠️ northdata.com scrape (see Batch 2 correction — original entry below is stale)

### ⚠️ Compliance finding
Per-manifest, current source appeared to be scraped KVK pages; actual code hits northdata.com (shared `lib/northdata.ts`). Both are ToS-risky. Needs legal review and replacement.

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (actual code) | northdata.com scrape | scrape | partial | **likely prohibited** (northdata sells API) | blocked | — |
| 2 | KVK official API | api (paid subscription) | partial | permitted (commercial subscription) | key-required-paused | **high** — legally clean replacement |
| 3 | Company.info | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high |
| 4 | data.overheid.nl | bulk downloads | varies | permitted (Dutch PSI) | not-probed | medium |
| 5 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | medium |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | medium |

### Recommendation: **router-viable, compliance-urgent** — no clean free alternative; pay KVK or Company.info

---

## DE — German Company Data

**Current slug:** `german-company-data` · **Primary:** northdata.com scrape

### ⚠️ Compliance finding
northdata IS a commercial product selling API access to the same data. Scraping their free UI is almost certainly ToS-violating — arguably worse than Allabolag because northdata has a direct paid alternative.

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Northdata.com (scrape) | scrape | partial | **unclear → likely prohibited** | blocked | — |
| 2 | OffeneRegister.de | bulk + SQL API | ❌ (registration only) | **permitted-with-attribution** (CC-BY-4.0, OKF + OpenCorporates) | confirmed-working (documented) | **high** — legally clean drop-in for registration |
| 3 | Handelsregister.de (Länder portal) | web (PDF extracts) | limited | permitted (government) | blocked | medium |
| 4 | Bundesanzeiger.de | web (filings) | ✅ (annual reports) | permitted (government) | not-probed (no API) | **high** for financials (scrape+PDF-parse) |
| 5 | Northdata API (paid) | api (commercial) | ✅ | permitted (commercial) | key-required-paused | **high** — legal version of same data |
| 6 | Unternehmensregister.de | web portal | ✅ (filings) | permitted | blocked (no API) | low |
| 7 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | medium |
| 8 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | medium |
| 9 | Creditreform / CRIF Bürgel | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |

### Recommendation: **router-viable, compliance-urgent** — replace registration with OffeneRegister; split financials decision separately

---

## FR — French Company Data

**Current slug:** `french-company-data` · **Primary:** INSEE Sirene API

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | INSEE Sirene API | api | partial (employee brackets) | **permitted** (Licence Ouverte Etalab) | confirmed-working | — |
| 2 | recherche-entreprises.api.gouv.fr | api (wrapper on Sirene) | partial | permitted (Licence Ouverte) | confirmed-working | low — same data |
| 3 | Pappers.fr | api (commercial w/ free tier) | ✅ (Bodacc + UBO + accounts) | permitted (commercial subscription) | confirmed 401 (needs key) | **high** — richest FR dataset |
| 4 | data.gouv.fr bulk | bulk | ❌ | permitted (Licence Ouverte) | not-probed | low |
| 5 | Infogreffe | api (paid, per-document) | ✅ | permitted (commercial) | key-required-paused | medium |
| 6 | Societe.com | scrape | ✅ | unclear | not-probed | low |
| 7 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |
| 8 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |

### Recommendation: **router-viable; Pappers.fr is the standout sibling**

---

## IE — Irish Company Data

**Current slug:** `irish-company-data` · **Primary:** CRO scrape

### ⚠️ Compliance finding
CRO operates CORE document sales; scraping their free search is likely ToS-violating.

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | CRO website scrape | scrape | ❌ | **likely prohibited** | blocked (403) | — |
| 2 | CRO CORE API / paid documents | web + paid | ✅ | permitted (government, ~€3.50/doc) | key-required-paused | high |
| 3 | Vision-net.ie → Solocheck.ie | api (commercial) | ✅ | permitted (commercial) | redirect only; not-probed | high |
| 4 | DueDil | api (commercial) | ✅ | permitted (commercial) | key-required-paused | medium |
| 5 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |

### Recommendation: **router-viable only with commercial investment**

---

## PL — Polish Company Data

**Current slug:** `polish-company-data` · **Primary:** ⚠️ northdata.com scrape (see Batch 2 correction — original entry below is stale)

### Sources

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (actual code) | northdata.com scrape | scrape | partial | **likely prohibited** | blocked | — |
| 2 | **KRS API (OdpisAktualny endpoint)** | api | ❌ (registration + directors + supervisory; no P&L) | **permitted** (Polish public register, government) | **confirmed-working** (PKN Orlen 0000028860, verified 2026-04-18) | **high** — lowest-friction fix in full audit |
| 3 | CEIDG (sole traders) | api | ❌ | permitted (government) | not-probed | **high for sole traders** — KRS doesn't cover them |
| 4 | Aleo.com | scrape / commercial | ✅ | unclear | not-probed | medium |
| 5 | Rejestr.io | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high |
| 6 | Bisnode PL / CRIF PL | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 7 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |
| 8 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |

### Recommendation: **immediate swap to KRS OdpisAktualny; expand scope with CEIDG; sibling for financials**

---

## Batch 1 Summary

### Compliance audit — sources needing immediate legal review (Batch 1 scope)

| Country | Current source (actual) | Priority | Clean replacement available? |
|---|---|---|---|
| SE | Allabolag.se scrape | urgent | Partial — covered by DEC-20260405-A |
| DK | cvrapi.dk free-tier | urgent | Yes — distribution.virk.dk (blocked on ERST creds) |
| DE | northdata.com scrape | urgent | Yes for registration — OffeneRegister.de (CC-BY-4.0) |
| NL | **northdata scrape** (corrected) | urgent | Only paid — KVK API or Company.info |
| PL | **northdata scrape** (corrected) | urgent | **Yes — KRS OdpisAktualny endpoint (verified)** |
| IE | CRO website scrape | high | Only paid — CRO CORE or Solocheck |

### Router-model viability summary (Batch 1)

| Country | Router viable? | Expected SQS benefit | Note |
|---|---|---|---|
| SE | yes (post-compliance) | high | Multiple legally-clean sources possible |
| NO | no (expand instead) | n/a | BRREG already best possible primary |
| DK | yes (after switch) | medium | distribution.virk.dk as primary; paid siblings for financials |
| FI | no (expand instead) | n/a | PRH already best possible primary |
| UK | no (expand instead) | n/a | CH already best possible primary |
| NL | yes (post-compliance) | medium | KVK paid + Company.info + OC paid |
| DE | yes (post-compliance) | high | OffeneRegister + OC paid + GLEIF + Bundesanzeiger |
| FR | yes | high | INSEE + Pappers + Infogreffe |
| IE | yes (if paid) | low | Few candidates, all commercial |
| PL | yes (post-swap) | medium | KRS primary; CEIDG expands scope; Rejestr.io for financials |

### Cross-cutting patterns

1. **Official PSI-compliant APIs are rare but definitive where they exist** (NO BRREG, FI PRH, UK CH, FR INSEE, PL KRS, DK distribution.virk.dk).
2. **Every scraped aggregator is a ToS risk.** Assume prohibited unless proven otherwise.
3. **Financials are the real router opportunity.** Registration data is often free-and-legal; commercial differentiation is financial depth.
4. **Intent split (registration vs financials) makes sense nearly everywhere** — should be evaluated as platform-level refactor.

### See also
- `02-eu-company-data-batch2.md` — AT, IT, ES, PT, LV, LT, CH, BE + the northdata-scope finding that corrects NL/PL entries here
- `03-non-eu-company-data.md` — US, CA, AU, IN, SG, HK, BR, JP + OpenCorporates-scrape crisis
