# Bulgaria Registry — Build Path Verification Memo

**Date:** 2026-05-07
**Country:** BG (Bulgaria)
**Status:** Research only. No code, no manifest, no routing changes in scope.
**Predecessor:** [2026-05-06 live registry coverage audit](2026-05-06-live-registry-coverage-audit.md), DEC-20260507-A (gap-7).

## 1. Headline classification

**Tier 1 — VIABLE.** Bulgaria publishes the entire Commercial Register (Търговски регистър, BRRA) as **CC-0 licensed XML open data** on `data.egov.bg`. Date-based incremental files contain new + updated companies. Government maintains an official anonymisation/export script at `github.com/governmentbg/brra-opendata`.

**Recommendation: BUILD via bulk-ingest path.** Pattern matches BE KBO Open Data ingest and RO ONRC bulk dump (already established in repo). Effort estimate **M (3–10 days)**.

## 2. API + data surface findings

### Path A — `data.egov.bg` open data XML (FREE, RECOMMENDED)

- **Authority:** Агенция по вписванията (Registry Agency, BRRA) — under the Ministry of Justice.
- **Open data portal:** `https://data.egov.bg/`
- **Structure:** Date-based files containing records of new and updated companies (per OpenCorporates 2018 sourcing notes; OpenCorporates loaded ~970,000 BG companies from this source). Government export tool [governmentbg/brra-opendata](https://github.com/governmentbg/brra-opendata) processes the raw BRRA XML into open-data-ready (anonymised) form.
- **Format:** XML.
- **Anonymisation:** EGN/LNCh (Bulgarian national identifier numbers) are replaced with a hash+salt string before publication. This is the legal compliance step — the rest of the company-identity tuple is preserved.
- **Authentication:** None.
- **Cost:** Free.
- **License:** **CC-0 (public domain)** — no attribution requirement, full commercial reuse permitted.
- **Tier classification:** **Tier 1** — direct govt source, doctrine-clean, free, redistribution-clean.

### Path B — `api.brra.bg` (Registry Agency direct API, paid)

- The Registry Agency operates a direct API at `http://api.brra.bg` supporting both JSON (`Accept: application/json`) and XML (`Accept: text/xml`) responses. This is separate from the open data publication.
- **Access model:** "Service API" — referenced in the egov-requirements GitHub repo as an integration point. Free for local government bodies; commercial pricing not surfaced in this spike.
- **Tier classification:** Tier 1 (govt source) but not needed if the open-data XML covers identity needs.
- **Use case:** Live single-entity lookup, if real-time freshness is required vs. periodic bulk-ingest cadence.

### Path C — `portal.registryagency.bg` web portal (HTML)

- **URL:** `https://portal.registryagency.bg/en/`
- Free public access, English-language option, full document downloads (acts of establishment, beneficial-owner declarations, historic filings).
- HTML only — scraping forbidden under DEC-20260428-A. Excluded.

### Path D — Tier 3 scraping

- Forbidden. Excluded.

## 3. Per-field depth (data.egov.bg XML)

| Field | Available |
|---|---|
| Company number | ✓ |
| Legal name + previous names | ✓ |
| Legal status | ✓ |
| Incorporation date | ✓ |
| Dissolution date | ✓ |
| Legal form / business type | ✓ |
| Industry codes (NACE/CAEN equivalent) | ✓ (free-text — only ~4% map cleanly to standard schemes per OpenCorporates) |
| Registered address | ✓ |
| Officers (managers, directors) | ✓ |
| Shareholders | ✓ |
| Filings | ✓ |
| Branches | ✓ |
| UBO (beneficial owners) | ✓ available via portal; XML feed coverage: needs verification at ingest time (likely included; CJEU Nov 2022 access restrictions may apply post-publication) |

**Caveat:** Industry-code free-text entry is a known data-quality issue. Strale would either (a) surface raw text as-is, (b) pass through a normalization step (LLM or rule-based mapping). For an identity-only v1 the raw text is fine; the consumer can normalise on read.

## 4. Pricing

- **Free** — `data.egov.bg` is open data, CC-0 license, no auth, no rate limit fee.
- Hosting / bandwidth costs at our end (download the XML, store in our DB) — minor for a country dump of ~1M companies.

## 5. Redistribution

- **CC-0 public domain** is the most permissive open-data license available. No attribution required, no share-alike, full commercial redistribution, no restrictions on derivative works.
- **DEC-20260428-A Tier-1 doctrine compliance:** Direct govt source, machine-readable structured data, no scraping. Fully compliant.

## 6. Freshness

- Date-based files containing new + updated records — the cadence is daily / near-daily based on OpenCorporates' ingestion pattern.
- Bulk-ingest model: Strale snapshots daily (or weekly), serves from local DB. Same pattern as BE KBO + RO ONRC builds.

## 7. Build effort estimate

**M (3–10 days)** — direct copy of BE KBO Open Data ingest pattern.

Components:
1. Download daily XML files from `data.egov.bg` BRRA dataset.
2. Parse XML → DB rows (use `governmentbg/brra-opendata` as reference for schema).
3. Implement diff/upsert against existing local mirror.
4. Build `bg-company-data` capability — accept BG company number, return identity tuple from local DB.
5. Index by name, number, status.

Risks:
- Industry-code free-text quality (low — surface as-is).
- XML schema evolution (low — government schema typically stable; mitigate by versioning on ingest).
- Daily volume (low — ~1M companies total, daily delta likely <1k rows).

## 8. Recommendation

**Build BG via bulk-ingest path (Tier 1).** Single-country self-build, doctrine-clean, free, reuses BE KBO ingest pattern. Schedule alongside other gap-recovery builds; LU does not block this work.

Open question for build session: confirm UBO field coverage in the published XML (vs the auth-gated portal). If UBO is portal-only, identity-tuple coverage is still complete and v1-acceptable; UBO can come later via a separate capability if needed.

## Sources

- [OpenCorporates Bulgaria announcement (2018)](https://blog.opencorporates.com/2018/04/04/new-jurisdiction-bulgaria-970000-companies/) — confirms CC-0 XML publication, date-based incremental files, ~970k companies, full field set.
- [governmentbg/brra-opendata GitHub](https://github.com/governmentbg/brra-opendata) — official Bulgarian government open-data export script. Reference for XML schema.
- [data.egov.bg open data portal](https://data.egov.bg/) — host for the BRRA dataset.
- [Министерство на електронното управление — Open Data](https://e-gov.bg/wps/portal/agency-en/home/data/open-data) — Ministry of e-Government statement on Bulgaria's open data publication regime.
- [European e-Justice Portal — BG business registers](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/bg_en) — official statement on business register access.
- [api.brra.bg integration reference (governmentbg/egov-requirements)](https://github.com/governmentbg/egov-requirements/blob/master/integration.md) — confirms JSON+XML API at `api.brra.bg`.
- [EPZEU portal](https://portal.registryagency.bg/en/) — verified public web portal exists; out of scope (HTML scraping forbidden).
