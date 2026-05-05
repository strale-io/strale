# Batch 3: Non-EU Company Data — Alternative Source Mapping

**Date:** 2026-04-18
**Scope:** 8 non-EU intents (US, CA, AU, IN, SG, HK, BR, JP)
**Depends on:** Batches 1-2 for template, legend, compliance context.

---

## ⚠️ Scope-expanding finding (pattern continues)

More manifest-vs-code / compliance-risk findings during Batch 3:

| Country | Manifest says | Code actually uses | Compliance risk |
|---|---|---|---|
| SG | ACRA | **OpenCorporates UI scrape** | **critical** — OC explicitly sells API access to same data |
| HK | HK Companies Registry | **OpenCorporates UI scrape** | **critical** — same as SG |
| IN | MCA | Tofler.in scrape | high — commercial aggregator |
| BR | Receita Federal | ReceitaWS (third-party aggregator) | medium — similar to cvrapi.dk pattern |
| JP | NTA Corporate Number | Browserless scrape (not NTA API) | medium — NTA API is free, just needs Application ID |
| AU (`australian-company-data`) | ASIC | ASIC web scrape | high — ASIC sells document access |

**Scraping OpenCorporates is particularly bad:** OpenCorporates runs a paid API that they license explicitly for commercial use — we're circumventing that license by scraping their UI. More legally exposed than the northdata / Allabolag pattern.

---

## US — US Company Data

**Current primary:** SEC EDGAR API (free, US government)

### 🟢 This one's clean

| # | Source | Type | Coverage | Financials? | License | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | SEC EDGAR | api | public SEC filers only (~7,500 entities) | ✅ (10-K, 10-Q XBRL) | **permitted** (US Public Domain) | — |
| 2 | State SoS registries (50 states) | varies (some API, mostly web) | all registered entities per state | rarely | permitted (state public records) | **high** — would massively expand coverage beyond SEC filers |
| 3 | OpenCorporates paid | api | broad, aggregated | ❌ | permitted (paid) | medium |
| 4 | Dun & Bradstreet | api (commercial) | ~200M US | ✅ | permitted (commercial) | high (€€€) |
| 5 | Creditsafe USA | api (commercial) | ~30M US | ✅ | permitted (commercial) | high |
| 6 | GLEIF | api | LEI-holders | ❌ | permitted (CC0) | low |

**Recommendation:** EDGAR is clean and works. Meaningful expansion = state-level SoS (Delaware, California, New York — the big incorporation states). 50 state sources is a big project; most developers need the SEC-filer subset anyway.

---

## CA — Canadian Company Data

**Current primary:** ised-isde.canada.ca scrape (government portal, federal only)

| # | Source | Type | Coverage | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Corporations Canada web scrape | scrape | federal incorporation only | unclear (scraping government site — probably permitted, but ToS check needed) | blocked | — |
| 2 | Corporations Canada open data / bulk | bulk | federal | permitted (OGL-Canada) | not-probed | medium (not live API) |
| 3 | Provincial registries (Ontario, BC, Quebec, Alberta) | varies | provincial | permitted | not-probed | high — covers ~80% of Canadian companies not in federal registry |
| 4 | OpenCorporates paid | api | broad | permitted (paid) | key-required-paused | medium |
| 5 | Dun & Bradstreet Canada | api (commercial) | broad | permitted (commercial) | key-required-paused | high |
| 6 | GLEIF | api | LEI-holders | permitted (CC0) | confirmed-working | low |

**Recommendation:** audit ised-isde.canada.ca ToS; if permitted, keep + add provincial sources progressively. CA has no equivalent of UK Companies House — coverage is inherently federated.

---

## AU — Australian Company Data

**Current primaries:** `au-company-data` (ABR API ✅) and `australian-company-data` (ASIC scrape ⚠️)

| # | Source | Type | Coverage | Financials? | License | Router value |
|---|---|---|---|---|---|---|
| 1a (current `au-company-data`) | Australian Business Register | api | 12M+ ABNs | ❌ | **permitted** (Australian government, requires ABN Lookup GUID — free registration) | — |
| 1b (current `australian-company-data`) | ASIC Connect scrape | scrape | companies registered with ASIC | partial | likely prohibited (ASIC sells paid document access) | — |
| 2 | ASIC Connect Data API | api (paid subscription) | authoritative | partial | permitted (commercial subscription) | **high** — legally-clean swap for `australian-company-data` |
| 3 | OpenCorporates paid | api | broad | ❌ | permitted (paid) | low (ABR already covers) |
| 4 | Dun & Bradstreet AU | api (commercial) | broad | ✅ | permitted (commercial) | high for financials |
| 5 | GLEIF | api | LEI-holders | ❌ | permitted (CC0) | low |

**Recommendation:** Resolve the duplication between `au-company-data` and `australian-company-data` — they describe the same intent. Keep ABR as free primary; swap `australian-company-data` to either deactivation or paid ASIC API if demand justifies.

---

## IN — Indian Company Data

**Current primary:** Tofler.in scrape (commercial aggregator)

| # | Source | Type | Coverage | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Tofler.in scrape | scrape | ~all IN cos | likely prohibited (Tofler is a commercial aggregator) | blocked | — |
| 2 | MCA21 official portal | web (paid per-query) | authoritative | permitted (government, ~₹50-200/query) | not-probed | medium (authoritative, but not free) |
| 3 | Zauba Corp | api (commercial) | broad | permitted (commercial) | key-required-paused | high |
| 4 | ClearTax / TofflerIndia commercial tiers | api (commercial) | broad | permitted (commercial) | key-required-paused | high |
| 5 | data.gov.in | bulk | limited (static snapshots) | permitted (India OGDL) | not-probed | low |
| 6 | OpenCorporates paid | api | broad | permitted (paid) | key-required-paused | medium |
| 7 | GLEIF | api | LEI-holders | permitted (CC0) | confirmed-working | low |

**Recommendation:** compliance-risky status quo. No clean free API. Options: pay MCA21 per-query, pay Zauba, or deactivate. Large market — demand likely justifies cost.

---

## SG — Singapore Company Data

**Current primary:** **OpenCorporates UI scrape** (manifest says ACRA)

### ⚠️ Most exposed compliance risk of the audit

Scraping OpenCorporates while they explicitly sell paid API access to the same data is a clear ToS violation with a direct commercial alternative.

| # | Source | Type | Coverage | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | OpenCorporates UI scrape | scrape | broad | **clearly prohibited** (OC API ToS) | blocked | — |
| 2 | ACRA BizFile+ | web / api (paid per-query) | authoritative | permitted (government, S$5+/query) | not-probed | high |
| 3 | OpenCorporates paid API | api | broad | permitted (paid tier removes share-alike) | key-required-paused | **high** — legally-clean version of what we're already using |
| 4 | Dun & Bradstreet SG | api (commercial) | broad | permitted (commercial) | key-required-paused | high |
| 5 | GLEIF | api | LEI-holders | permitted (CC0) | confirmed-working | low |

**Recommendation:** immediate priority. Cheapest path: upgrade to OpenCorporates paid tier (already integrated logically, just need the API key). Alternative: ACRA BizFile+ per-query. Cannot continue to scrape OC in production.

---

## HK — Hong Kong Company Data

**Current primary:** **OpenCorporates UI scrape** (manifest says HK Companies Registry)

Same situation as SG — same recommendation (OpenCorporates paid API or ICRIS/CR Cyber Search paid per-query).

---

## BR — Brazilian Company Data

**Current primary:** ReceitaWS (third-party aggregator, free tier)

### 🟢 Good alternative exists

| # | Source | Type | Coverage | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | ReceitaWS | api (third-party free + paid tiers) | broad | unclear (aggregator ToS; free tier has rate limits, similar to cvrapi.dk) | not-probed | — |
| 2 | **BrasilAPI** | api (open source mirror of Brazilian public data) | ~all CNPJs | **permitted** (Apache 2.0, community-run, mirrors Receita Federal public data) | confirmed-working (Google Brasil CNPJ probe returned full entity) | **high** — legally cleaner + community-maintained |
| 3 | Receita Federal direct | web (CAPTCHA-protected) | authoritative | permitted (government) | blocked | low (CAPTCHA blocks automation) |
| 4 | CNPJ.ws | api (third-party) | broad | unclear (similar aggregator) | not-probed | low — redundant with ReceitaWS |
| 5 | Serasa Experian BR | api (commercial) | broad | permitted (commercial) | key-required-paused | high for financials (€€€) |
| 6 | GLEIF | api | LEI-holders | permitted (CC0) | confirmed-working | low |

**Recommendation:** swap to BrasilAPI — verified working, Apache 2.0, community-run, better compliance profile. Same pattern as switching DK cvrapi.dk → distribution.virk.dk but without the 3-week wait.

---

## JP — Japanese Company Data

**Current primary:** Browserless scrape (manifest says NTA Corporate Number)

### 🟢 Official free API exists — same manifest-vs-code pattern

| # | Source | Type | Coverage | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current code) | Web scrape | scrape | broad | unclear | blocked | — |
| 2 (manifest-claim = real fix) | **NTA Corporate Number Web API** | api | 5M+ corporate numbers | **permitted** (free, Application ID required, explicit attribution required) | confirmed (docs) | **high** — drop-in legally-clean replacement |
| 3 | Teikoku Databank (TDB) | api (commercial) | ~1.5M JP | ✅ | permitted (commercial) | high for financials (€€€) |
| 4 | Tokyo Shoko Research | api (commercial) | ~1M JP | ✅ | permitted (commercial) | high |
| 5 | OpenCorporates paid | api | broad | permitted (paid) | key-required-paused | medium |
| 6 | GLEIF | api | LEI-holders | permitted (CC0) | confirmed-working | low |

**Recommendation:** register for NTA Application ID (free), swap code. Same pattern as CH (swap to the API the manifest already claims). No financials in NTA — financials are commercial-only (TDB, TSR).

---

## Batch 3 Summary

### New compliance-urgent findings

| Country | Issue | Fix path | Priority |
|---|---|---|---|
| SG | Scraping OpenCorporates UI | Pay OC API or pay ACRA BizFile+ | **P0** |
| HK | Scraping OpenCorporates UI | Pay OC API or pay ICRIS | **P0** |
| JP | Browserless scrape; free official API exists | Register NTA Application ID + swap | P1 |
| AU (`australian-company-data`) | Scraping ASIC | Pay ASIC or deactivate (ABR duplicate exists) | P1 |
| IN | Scraping Tofler | Pay MCA21 / Zauba or deactivate | P2 |
| BR | Third-party aggregator | Swap to BrasilAPI (Apache 2.0) | P1 |

### Cross-cutting insight: 3 intents currently scrape OpenCorporates

SG, HK, plus the paid-tier OpenCorporates came up as "low/medium router-value alternative" for many Batch 1/2 countries. Consolidated OpenCorporates paid subscription could serve: SG, HK primary; SE, DE, NL, PL, FR, IE registration siblings. If it's one subscription across all those jurisdictions, it becomes a much more compelling purchase than per-country.

### Duplication to clean up

`au-company-data` (ABR, free, clean) and `australian-company-data` (ASIC scrape, dirty) describe the same intent. Solutions and docs should be unified around one. Probably deactivate `australian-company-data` and enrich `au-company-data` if ABR coverage gaps matter.

### What's next

After mapping Batches 1-3:
- **Compliance-urgent swap plan** (P0s): PL KRS, CH Zefix, LV data.gov.lv, BR BrasilAPI, DK distribution.virk.dk (waiting), SG/HK OpenCorporates paid.
- **Arch decision**: registration-vs-financials split.
- **Commercial procurement**: consider a single multi-country subscription (OpenCorporates paid, Creditsafe, or D&B) to cover 8+ intents at once vs per-country sales cycles.
- **Batches beyond company-data**: compliance (sanctions, PEP, adverse media), finance (IBAN, VAT, LEI), developer-tools, data-processing — same exercise, same template.
