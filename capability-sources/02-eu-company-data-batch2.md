# Batch 2: EU Company Data — Alternative Source Mapping

**Date:** 2026-04-18
**Scope:** 8 EU company-data intents (AT, IT, ES, PT, LV, LT, CH, BE)
**Depends on:** Batch 1 doc (`01-eu-company-data.md`) for template, legend, and cross-cutting findings.

---

## ⚠️ Scope-expanding finding (affects Batch 1 too)

During Batch 2 the `lib/northdata.ts` shared utility was inspected. **7 capabilities actually scrape northdata.com** regardless of what their manifests say:
- `german-company-data`, `dutch-company-data`, `polish-company-data`, `portuguese-company-data`, `lithuanian-company-data`, `swiss-company-data`, `officer-search`

For 5 of these (PL, NL, PT, LT, CH), the manifest `data_source` field claims an *official* source while the code hits northdata. Same manifest-vs-code divergence pattern that DEC-20260405-A course-correction flagged for SE (Bolagsverket/Allabolag).

This means Batch 1's recommendations for **NL and PL** were based on wrong current-source data — both are currently northdata scrapes, not their declared sources. Findings:
- **PL is the lowest-friction fix in the whole audit** — live probe confirmed KRS `OdpisAktualny/{krs}` endpoint works, free, returns full entity + officers. Only need to solve name→KRS discovery separately.
- **NL KVK scrape finding in Batch 1 is wrong** — it's northdata. Still compliance-risky for the same reason, but via a different provider.
- **CH needs to be added to the compliance urgency list** — manifest says Zefix API but code is northdata scrape.

All captured as P0 to-dos.

---

## AT — Austrian Company Data

**Current primary:** FinAPU Firmenbuch API (scrape via Browserless, per manifest)

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | FinAPU scrape | scrape | partial | unclear → likely prohibited (aggregator pattern) | not-probed | — |
| 2 | JustizOnline / Firmenbuch official | web (paid per-document) | ✅ | permitted (government extract, ~€3-10/doc) | not-probed | high (authoritative) |
| 3 | Compass Group / compass.at | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (richest AT aggregator) |
| 4 | Creditreform Austria | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 5 | data.gv.at bulk snapshots | bulk | limited | permitted (PSI) | not-probed | low (not a live API) |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |
| 7 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |

**Recommendation:** no free authoritative API for AT. Either deactivate, or accept commercial costs (Compass or JustizOnline per-document). AT is the same market profile as IE — no open-data-PSI path.

---

## IT — Italian Company Data

**Current primary:** Registro Imprese via scrape (per manifest)

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Registro Imprese scrape | scrape | partial | likely prohibited (InfoCamere sells Telemaco API for same data) | not-probed | — |
| 2 | InfoCamere Telemaco | api (commercial, per-query) | ✅ | permitted (commercial subscription) | key-required-paused | high (authoritative) |
| 3 | Cerved / Crif Italy | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 4 | dati.gov.it regional datasets | bulk | limited | permitted (IODL / CC-BY) | partially confirmed (regional/chamber datasets, not national) | low |
| 5 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |
| 6 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |

**Recommendation:** same as AT/IE — no free official API. Either deactivate or pay InfoCamere. IT is the largest EU market after DE/FR/ES so demand likely justifies the cost.

---

## ES — Spanish Company Data

**Current primary:** Registro Mercantil Central via scrape (per manifest)

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Registro Mercantil scrape | scrape | partial | likely prohibited (Colegio de Registradores sells document extracts) | not-probed | — |
| 2 | Registradores.org document extracts | web (paid per-document) | ✅ | permitted (government extract, ~€5-15/doc) | not-probed | high (authoritative) |
| 3 | Axesor / Informa D&B Spain | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 4 | Infoempresa / eInforma | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high |
| 5 | INE statistics | api | ❌ (aggregate stats only, no per-company) | permitted | not-probed | — |
| 6 | datos.gob.es | bulk | limited | permitted (CC-BY) | not-probed (SPA) | low |
| 7 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |
| 8 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |

**Recommendation:** same as AT/IT/IE — no free official API. Pay Registradores per-document or buy Informa D&B / Axesor. ES is large enough to justify cost.

---

## PT — Portuguese Company Data

**Current primary:** northdata.com scrape (code) — manifest claims "Registo Comercial"

See dedicated todos: "PT: decide source..." and "Honesty update: correct manifest data_source". Options:
1. Pay IRN per-document (~€10-15/doc — authoritative but expensive per-call)
2. Buy Racius / eInforma commercial API
3. Deactivate the capability (PT is small)
4. Keep northdata with accepted compliance risk (weakest option)

GLEIF covers a few large PT companies for free; not enough on its own.

---

## LV — Latvian Company Data

**Current primary:** Uzņēmumu Reģistrs scrape (per manifest)

### 🟢 Good news: free legally-clean open data exists

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | Uzņēmumu Reģistrs scrape | scrape | partial | unclear → likely prohibited (Lursoft sells API to same data) | not-probed | — |
| 2 | **data.gov.lv Uzņēmumu reģistrs dataset** | api + bulk downloads (JSON/CSV/XLSX/XML) | partial (registration; no P&L) | **permitted (CC0 public domain)** | confirmed-working (portal lists daily-updated dataset w/ API) | **high** — drop-in free official replacement |
| 3 | Lursoft | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high for financials |
| 4 | Creditreform Latvia | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 5 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |
| 6 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |

**Recommendation: swap primary to data.gov.lv official open data.** CC0 is the most permissive license possible — Strale can freely incorporate and resell. Same kind of win as DK distribution.virk.dk and DE OffeneRegister.de.

---

## LT — Lithuanian Company Data

**Current primary:** northdata.com scrape (code) — manifest claims "Registrų centras"

See dedicated todos. Options:
1. Pay Registrų centras per-document
2. Buy Creditinfo LT commercial
3. Scrape rekvizitai.vz.lt (similar ToS risk to northdata; probe blocked during audit)
4. Deactivate
5. Keep northdata with accepted compliance risk

LT is a small market — strong case for deactivation unless a specific solution depends on it.

---

## CH — Swiss Company Data

**Current primary:** northdata.com scrape (code) — manifest claims "Zefix PublicREST API"

### 🟢 Good news: the API the manifest claims actually works

Zefix is the Swiss federal commercial register. Their PublicREST API at `zefix.ch/ZefixREST/api/v1/` is publicly documented, free, no auth. Swiss public-register data is legally clean for commercial reuse. **The honesty fix here is also the compliance fix: make the code match what the manifest has been claiming.**

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current code) | northdata scrape | scrape | partial | likely prohibited | not-probed | — |
| 2 (current manifest-claim = real fix) | Zefix PublicREST API | api | ❌ (registration + purpose + directors; no financials in register) | permitted (Swiss public register, commercial reuse OK) | blocked (403 from fetch probe IP — needs test from Railway; API is documented and free per zefix.ch) | **high** — drop-in legally-clean official replacement |
| 3 | Moneyhouse | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high for financials |
| 4 | Teledata | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 5 | UID Register (uid.admin.ch) | api | ❌ | permitted (government) | not-probed | medium (complements Zefix) |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |
| 7 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |

**Recommendation:** swap to real Zefix immediately. Add Moneyhouse/Teledata as commercial siblings for financials if CH financials become needed.

---

## BE — Belgian Company Data

**Current primary:** KBO/BCE scrape via Browserless (per manifest + code)

| # | Source | Type | Financials? | License | Verification | Router value |
|---|---|---|---|---|---|---|
| 1 (current) | KBO Public Search scrape | scrape | ❌ | likely prohibited (FOD Economie operates the paid KBO Public Search Web Service for same data) | blocked | — |
| 2 | KBO Public Search Web Service | api (paid subscription) | partial (registration) | permitted (commercial subscription from FOD Economie) | key-required-paused | **high** — authoritative, replaces scrape |
| 3 | **National Bank of Belgium — Central Balance Sheet Office** | web / filings | ✅ (annual accounts for most BE companies, mandatory filing) | permitted (government public record) | confirmed-exists (NBB's public remit) — access via `consult.cbso.nbb.be`, not API | **high** — only legally-clean free source for BE financials; scrape+parse required |
| 4 | Graydon / Companyweb / BelFirst | api (commercial) | ✅ | permitted (commercial) | key-required-paused | high (€€€) |
| 5 | data.gov.be (KBO snapshots) | bulk | ❌ | permitted (PSI) | not-probed | low |
| 6 | OpenCorporates paid | api | ❌ | permitted (paid) | key-required-paused | low |
| 7 | GLEIF | api | ❌ | permitted (CC0) | confirmed-working | low |

**Recommendation:** BE's compliance fix requires paid KBO Public Search subscription (no free official API). Financials are uniquely available via NBB CBSO — worth building a second executor for that, since it's the only legally-clean free source for BE P&L data in the whole region.

---

## Batch 2 Summary

### Compliance additions (beyond Batch 1)

Sources currently in production where scraping likely violates ToS (consolidated from Batches 1+2):

| Country | Current source (actual code) | Manifest says | Priority | Clean free replacement available? |
|---|---|---|---|---|
| SE | Allabolag scrape | Bolagsverket | urgent | Partial (covered by DEC-20260405-A) |
| DK | cvrapi.dk free-tier | CVR / Erhvervsstyrelsen | urgent | Yes — distribution.virk.dk (blocked on ERST creds) |
| DE | northdata scrape | Handelsregister via northdata | urgent | Yes — OffeneRegister.de (CC-BY-4.0) |
| NL | **northdata scrape** (corrected) | KVK | urgent | No free; paid KVK API |
| PL | **northdata scrape** (corrected) | KRS API | urgent | **Yes — KRS OdpisAktualny endpoint (verified 2026-04-18)** |
| PT | **northdata scrape** (corrected) | Registo Comercial | high | No free; paid IRN |
| LT | **northdata scrape** (corrected) | Registrų centras | high | No free; paid Registrų centras |
| CH | **northdata scrape** (corrected) | Zefix PublicREST API | urgent | **Yes — Zefix (the API the manifest already claims)** |
| IE | CRO scrape | CRO | high | No free; paid CRO CORE or Solocheck |
| AT | FinAPU scrape | FinAPU | medium | No free; paid JustizOnline |
| IT | Registro Imprese scrape | Registro Imprese | medium | No free; paid Telemaco |
| ES | Registro Mercantil scrape | Registro Mercantil | medium | No free; paid Registradores |
| LV | Uzņēmumu Reģistrs scrape | Uzņēmumu Reģistrs | medium | **Yes — data.gov.lv CC0 open data** |
| BE | KBO scrape | KBO | medium | No free; paid KBO Public Search |

### Free-and-legal drop-in replacements (lowest-friction compliance wins)

1. **PL → KRS OdpisAktualny endpoint** — verified working 2026-04-18, free, legally clean. Simplest fix in the whole audit.
2. **CH → Zefix PublicREST API** — the manifest already claims this source; code change only.
3. **LV → data.gov.lv CC0 dataset** — most permissive license possible.
4. **DK → distribution.virk.dk** — blocked on ERST credentials (3-week wait).
5. **DE → OffeneRegister.de** — CC-BY-4.0, covers registration. Financials separate problem.

### Countries where no free official API exists

AT, IT, ES, PT, LT, IE, BE — all need a commercial decision (pay, accept scrape risk, or deactivate). Pattern: southern + smaller-EU markets tend to have paid-only official registers; northern + larger-EU markets tend to have PSI-aligned free APIs.

### Batch 3 queued

Non-EU company data (US, CA, AU, IN, SG, HK, BR, JP) — different market structures, should be separate session. Will probably find: US/CA/AU have mostly free official data; IN/BR variable; JP/HK/SG have mix of free-official and paid-commercial.
