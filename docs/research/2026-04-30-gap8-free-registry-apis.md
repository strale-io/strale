# Gap-8 EU Registry APIs — Free Per-Entity Lookup Audit

**Date:** 2026-04-30 (probes verified live)
**Scope:** HU, SI, BG, RO, LU, SK, MT, CY — official national company/business registries
**Acceptance:** government-operated, free, no/free-tier auth, machine-readable (JSON/XML), per-entity lookup, returns at minimum {name, reg-number, status, address}

## Summary table

| CC | Status | Source URL | Auth | Format | Note |
|----|--------|------------|------|--------|------|
| HU | **no public API** | https://www.e-cegjegyzek.hu/ | login + paid (cégkivonat fees) | HTML | e-cegjegyzek is a paid e-filing portal. NAV `queryTaxpayer` (onlineszamla.nav.gov.hu/api/v3) is free SOAP for invoicing partners but registers tax-only fields (name + tax number + address); not the company registry. No JSON registry endpoint. |
| SI | **partial (bulk only)** | https://podatki.gov.si/dataset/poslovni-register-slovenije | none | CSV / XML | AJPES ePRS (`ajpes.si/prs/`) is HTML-only with no per-entity REST. Bulk PRS dataset on podatki.gov.si CKAN is free + machine-readable (CKAN API returns `count: 18` matching datasets, license CC-BY 4.0). Per-entity needs ingest of the bulk file. |
| BG | **partial (bulk only)** | https://data.egov.bg / portal.registryagency.bg | none for bulk; portal returns HTML | CSV / XML / HTML | BRRA (Trade Register) portal at `public.brra.bg` and `portal.registryagency.bg` is HTML, no documented REST. data.egov.bg blocks default UA (403) but is a CKAN portal that publishes BRRA bulk dumps. Per-entity = scrape (Tier-1 forbidden) or ingest bulk. |
| RO | **partial (bulk only)** | https://data.gov.ro/api/3/action/package_search?q=onrc | none | CKAN + CSV | ONRC `recom.onrc.ro` and `portal.onrc.ro` time out (000) from probes — known geo/firewalled, paid subscription product. data.gov.ro CKAN exposes 70 ONRC datasets (including `firme_neradiate_fara_sediu` 2024-12-19 publishes), all CSV bulk. No free per-entity REST. |
| LU | **partial (bulk only)** | https://data.public.lu/api/2/datasets/?q=rcs | none | udata API + bulk dump | LBR (`lbr.lu`) per-entity search is HTML/captcha and paid for extracts. data.public.lu udata API resolves; RCS publishes a free bulk dump (CSV/JSON). Per-entity = ingest bulk. No documented REST per-call lookup. |
| SK | **partial (bulk only)** | https://data.gov.sk/dataset?q=obchodný+register | none | bulk + HTML | `orsr.sk` is HTML only (commercial register search). `rpo.statistics.sk/rpo/` (Register právnických osôb) is a server-rendered web app — every JSON endpoint we probed (`/v1/`, `/api/`, `/v1/cin/{ico}`, swagger) returns 404. data.gov.sk catalog (SPA) lists ORSR/RPO bulk extracts. No public REST. |
| MT | **no public API** | https://mbr.mt/ | paid | HTML / paid web service | MBR website lists a "Rest" web service in marketing copy but `registry.mbr.mt/api/`, `api.mbr.mt`, `services.mbr.mt`, and the public ROC portal all return 403/504/000 to anonymous probes. The MBR REST is contracted (paid + agreement). No bulk publication on data.gov.mt either (404 on search). |
| CY | **no public API** | https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx | none for HTML; paid for extracts | HTML | DRCOR e-filing public search is ASPX/HTML-only. New `companies.gov.cy` portal exposes a `/en/companies-data` page (HTML) but no REST endpoint (`/api/` returns 404). data.gov.cy returns 404 for `registrar`/`companies` queries. |

## Headline finding

**Zero of the 8 countries publish a free, no-auth, machine-readable per-entity REST.** Four (SI, BG, RO, LU) publish free bulk dumps via CKAN/udata — viable for self-hosted ingest but not direct per-call. Four (HU, SK, MT, CY) lack even free bulk: registry data is paid-only or HTML-only.

## Implications for Strale gap-8 strategy

- **Direct-API path is closed for all 8.** None meets the IE/LV/LT/SG/PL/CZ/EE bar.
- **Bulk-ingest path is open for SI, BG, RO, LU.** Requires scheduled CKAN/udata pull → Postgres → per-entity query against our copy. Mid-effort: build once per country, refresh weekly. Provenance is fully government primary-source.
- **Vendor path is the only realistic option for HU, SK, MT, CY.** Per the DEC-20260428-A Tier-2 doctrine, this needs a vendor with documented redistribution rights + indemnification + per-fact primary-source provenance. Likely candidates: Bisnode/Dun&Bradstreet for HU/SK/MT/CY; KYC-Chain or Creditsafe for MT/CY; Topograph if/when it ships gap-8.
- **Do NOT ship Browserless flows for the gap-8.** Tier-1 doctrine prohibits Strale-operated scraping. The pre-existing `kyc-cyprus`/`kyc-malta` deactivated entries should remain deactivated until a Tier-2 path exists.

## Probe artifacts

All probes run 2026-04-30 from Railway-equivalent US East. Key non-200 results:
- `recom.onrc.ro` / `portal.onrc.ro` → connect timeout (geo / firewall)
- `data.egov.bg` → 403 to default UA; needs Mozilla UA but still returns 403 on `/api/3/action/`
- `rpo.statistics.sk/rpo/v1/*` → 404 with WebSphere `SRVE0190E` (no REST surface deployed)
- `registry.mbr.mt` → 403 on every path (auth wall)
- `efiling.drcor.mcit.gov.cy/api/` → connect failure (no API host)

## Recommended next action

Open a Notion to-do under "Gap-8 KYB coverage" with two parallel tracks:
1. **Bulk-ingest builds** (SI / LU first — smaller datasets, cleanest licenses): one capability per country reading from a refreshed Postgres mirror of the CKAN/udata dump.
2. **Vendor-path scoping** for HU / SK / MT / CY: Bisnode quote, Topograph roadmap check, Creditsafe Cyprus + Malta coverage. Defer build until vendor signed.
