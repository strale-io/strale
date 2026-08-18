# Cyprus Registry — Build Path Verification Memo

**Date:** 2026-05-07
**Country:** CY (Cyprus)
**Status:** Research only. No code, no manifest, no routing changes in scope.
**Predecessor:** [2026-05-06 live registry coverage audit](2026-05-06-live-registry-coverage-audit.md), DEC-20260507-A (gap-7).

## 1. Headline classification

**Tier 1 — VIABLE.** The Department of Registrar of Companies and Intellectual Property publishes open data on `data.gov.cy` (Cyprus National Open Data Portal). Coverage spans organisations, registered offices, and officers across five entity types: companies, foreign companies, commercial names, cooperatives, old cooperatives.

**Recommendation: BUILD via data.gov.cy bulk-ingest path.** A free wrapper API (Apitalks) exists on top of the same data and could be used as a fast-path proof-of-concept, but for v1 production Strale should ingest the official open-data publication directly to avoid third-party dependency.

**Effort:** **M (3–10 days)**.

## 2. API + data surface findings

### Path A — `data.gov.cy` open data (FREE, RECOMMENDED for v1)

- **Authority:** Department of Registrar of Companies and Intellectual Property, under the Ministry of Energy, Commerce and Industry of the Republic of Cyprus.
- **Open data portal:** `https://www.data.gov.cy/en/group/30` — landing page for DRCOR datasets.
- **Confirmation of dataset existence:** Apitalks (the Apple Cyprus wrapper API operator) explicitly states their data "originates from the Office of the Registrar of Companies and Intellectual Property in Cyprus, catalogued on the National Open Data Portal Cyprus." Coverage:
  - Organisation lists
  - Registered office directories
  - Officer information
- **Entity types covered:** companies, foreign companies, commercial names, cooperatives, old cooperatives.
- **Format:** CSV (consistent with data.gov.cy's standard publication format; rendered HTML inspection of the portal group page was inconclusive — confirm at ingest time).
- **License:** data.gov.cy operates under EU Open Data Directive 2019/1024 transposition; default published license is Creative Commons Attribution (CC-BY) for Cypriot government open data. **Confirm the specific dataset license at ingest time** — CY hasn't unambiguously surfaced this for the registrar group during research.
- **Authentication:** None.
- **Cost:** Free.
- **Tier classification:** **Tier 1** — direct govt-published open data, doctrine-clean.

### Path B — Apitalks wrapper API (free, third-party)

- **URL:** `https://api.store/cyprus-api/republic-of-cyprus-ministry-of-finance-api/register-of-registered-companies-commercial-names-and-cooperatives-in-cyprus-api`
- **What it is:** REST wrapper over the same `data.gov.cy` DRCOR open-data publication. "Operation and development of APIs are currently fully funded by company Apitalks and its usage is for free." Status: "early access."
- **Use case:** Fast prototyping or supplementary live-lookup. Not recommended for production — third-party dependency on a "fully funded by company Apitalks" pricing model that could change without notice.
- **Tier classification:** Effectively Tier 1 (data is govt open data) wrapped by a third-party — but the dependency on Apitalks's continued free operation makes it less predictable than direct ingest.

### Path C — DRCOR `efiling.drcor.mcit.gov.cy` portal

- **URL:** `https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx?sc=0&cultureInfo=en-AU`
- **Free public search:** Returns name, registration number, company type, subtype, name status, registration date, organisation status, status date.
- **Document downloads:** €10 per "bulk filing package" — financial audits, annual returns, share allotments, officer changes, capital increases. Available for 24h on the user's account before deletion.
- **Tier classification:** HTML portal — scraping forbidden under DEC-20260428-A. Excluded.

### Path D — UBO register

- **URL:** Operated by DRCOR.
- **Pricing:** €3.50 per entity, restricted to authorised entities (per Kyckr 2025 guide).
- **Status:** Out of scope for v1 identity-only build; defer.

### Path E — Tier 2 commercial vendors (Kyckr, BvD/Orbis, Creditsafe)

- Standard EU coverage; redistribution-clean if vendor contract carries primary-source provenance per DEC-20260428-A.
- Use case: fallback if direct ingest hits unforeseen data-quality issues.

## 3. Per-field depth (data.gov.cy publication via Apitalks-confirmed schema)

| Field | Available |
|---|---|
| Organisation name | ✓ |
| Registration number | ✓ |
| Organisation type | ✓ (company, foreign company, commercial name, cooperative, old cooperative) |
| Status | ✓ |
| Registration date | ✓ |
| Registered office address | ✓ |
| Officers (name + position) | ✓ |
| Subtype | ✓ (per portal output) |
| Status date | ✓ (per portal output) |
| Financials | ✗ — paid filing packages only (€10/batch) |
| UBO | ✗ — paid (€3.50/entity, restricted access) |

Identity-tuple coverage is complete for v1. Financials and UBO are deferred.

## 4. Pricing

- **Free** — data.gov.cy bulk publication.
- Paid (out of scope for v1): €10/filing-package downloads from DRCOR portal; €3.50/entity UBO lookups.

## 5. Redistribution

- data.gov.cy default license: CC-BY (per EU Open Data Directive 2019/1024 transposition standard for Cypriot government open data). **Confirm the specific dataset's license string at ingest time** — research did not surface unambiguous CC0 vs CC-BY for the DRCOR group.
- If CC-BY: attribute "Department of Registrar of Companies, Cyprus" alongside other Tier-1 attributions in the audit body's `provenance` block. Operationally identical to existing IE/SK/RO patterns.

## 6. Freshness

- Update cadence not surfaced in research. Other Cypriot government open data datasets typically follow monthly snapshots. **Confirm at ingest time.**

## 7. Build effort estimate

**M (3–10 days)** — bulk-ingest pattern (BE KBO / RO ONRC reuse).

Components:
1. Locate and download the DRCOR datasets from `data.gov.cy` (organisations + registered-office + officers files).
2. Confirm format (CSV expected) and license string.
3. Parse → DB rows; index by name, number, status.
4. Build `cy-company-data` capability — accept registration number, return identity tuple from local DB.

Smaller dataset than RO/BG (Cyprus has ~250k–300k registered entities total vs. BG's ~1M and RO's ~5M), so storage/ingest is trivial.

## 8. Recommendation

**Build CY via data.gov.cy bulk-ingest (Tier 1).** Doctrine-clean, free, identity-tuple complete. Confirm dataset format + license at ingest start.

If urgency demands a same-day proof-of-concept, the **Apitalks wrapper** is a reasonable bridge — but production should not depend on a single third-party's "fully funded by us, free" sustainability commitment.

## Sources

- [Apitalks — Cyprus Companies API page](https://api.store/cyprus-api/republic-of-cyprus-ministry-of-finance-api/register-of-registered-companies-commercial-names-and-cooperatives-in-cyprus-api) — confirms data.gov.cy as source, lists field coverage, confirms five entity types, confirms officer-level data.
- [data.gov.cy — Department of Registrar of Companies group](https://www.data.gov.cy/en/group/30) — landing page (datasets listing not extracted in this spike's web fetches).
- [Kyckr — Cyprus Company Registry guide 2025](https://www.kyckr.com/blog/cyprus-company-registry-search) — pricing for portal access (free search, €10 filings, €3.50 UBO), field-level coverage.
- [DRCOR e-filing portal](https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx?sc=0&cultureInfo=en-AU) — verified portal exists; out of scope (HTML scraping forbidden).
- [European e-Justice Portal — CY business registers](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/cy_en) — official statement on Cyprus business register.
- [OpenCorporates — Cyprus DRCOR jurisdiction](https://opencorporates.com/registers/58) — third-party aggregator confirms the registry data is loadable.
