# Slovenia Registry — Direct Build Path Design Memo

**Date:** 2026-05-06
**Country:** SI (Slovenia)
**Status:** Research only. No code, no manifest, no routing changes in scope.
**Predecessor:** [2026-04-30 gap-8 audit](2026-04-30-gap8-free-registry-apis.md) (probe-level baseline)

## Summary

Slovenia is the **strongest** of the four Gap-8 countries assessed today. AJPES publishes the full Slovenian Business Register (PRS) as free CC-BY-4.0 bulk data on `podatki.gov.si` (the national CKAN portal), and additionally operates an official **paid** per-entity REST API (`restPrsInfo`) that replaced the legacy SOAP API in February 2026. Both surfaces are Tier-1 compliant under DEC-20260428-A.

**Recommendation:** **Build via bulk-ingest** — schedule a periodic CKAN download of the AJPES PRS dump into Postgres, query per-entity from the Strale-hosted mirror. Mirror BE KBO Open Data ingest pattern.

**Effort:** **M** (3–10 days). Smaller dataset than KBO (one ~126 MB CSV vs. 7-table KBO ZIP), single attribute file, single language column. The work concentrates on parser + scheduled refresh + per-entity query layer.

**Top open questions:** (1) Actual refresh cadence — dataset claims "twice monthly" but the resource last_modified visible on the CKAN package is 2025-12-18, suggesting >4-month staleness; need a one-shot live re-fetch to confirm. (2) Whether the bulk CSV exposes director / UBO / status-history fields or only the minimal name + reg-no + address tuple — affects whether bulk alone meets KYB Essentials needs or whether the paid restPrsInfo REST must layer on top later.

## Registry identification

- **Authority:** Agencija Republike Slovenije za javnopravne evidence in storitve (AJPES) — public agency.
- **Public URL:** `https://www.ajpes.si/`
- **OpenData portal:** `https://podatki.gov.si/dataset/poslovni-register-slovenije` (Slovenian CKAN, government-operated)
- **Legal basis:** Slovenian Business Register Act; data published as open data under the Slovenian implementation of the EU Open Data Directive (Directive (EU) 2019/1024). PRS is the central public database of Slovenian business entities since 2005-07-01.

## Data access surface

### Path 1 — CKAN bulk download (FREE)

- **URL (CSV):** `https://podatki.gov.si/dataset/9ee1a9aa-c224-4995-b2ad-3760d7af0748/resource/beb70929-3d0d-41c6-9af2-25d525d906d3/download/opsiprs.csv`
- **URL (ZIP bundle):** `https://podatki.gov.si/dataset/9ee1a9aa-c224-4995-b2ad-3760d7af0748/resource/3ac0b7fc-eaf3-4bd6-81c0-5ade530dc9a6/download/tmpposlovniregisterslovenijeicl4te.zip`
- **URL (attribute schema XML):** `https://podatki.gov.si/dataset/9ee1a9aa-c224-4995-b2ad-3760d7af0748/resource/f6b5fb2a-bbba-43f9-b8b2-9997600dc1e3/download/atributimr20.xml`
- **Authentication:** None.
- **Cost:** Free.
- **Rate limits:** Undocumented; standard CKAN download endpoint, no throttling observed in 2026-04-30 probe.
- **Format:** CSV (126.5 MB), XML (37 KB), ZIP (19.3 MB).
- **Last modified visible on portal at audit time:** 2025-12-18.
- **Stated cadence:** "Dva krat mesečno" (twice monthly) per dataset description. **Discrepancy with last_modified flagged as Open Question 1.**

### Path 2 — restPrsInfo official REST API (PAID, requires registration)

- **URL (production):** `https://www.ajpes.si/restPrsInfo`
- **URL (test):** `https://wwwa.ajpes.si/restPrsInfo`
- **Swagger:** `/swagger/index.html` at both URLs (live; renders, but the JSON spec was not directly retrievable within fetch budget — see Open Question 2).
- **Authentication:** Digital certificate (X.509) registered with AJPES; protected (personal) data scope retrieves caller identity from the certificate.
- **Cost:** **Paid.** Sold in packages tied to one of six schema codes, varying by data depth (minimal / narrow / extended) and billing type. Specific package prices not publicly listed; require contacting AJPES. Replaced legacy SOAP `wsPrsInfo` in February 2026.
- **Rate limits:** Undocumented in public docs; package-tier-dependent.
- **Format:** JSON (default) or XML, controlled by `Content-Type` header.
- **Methods:** 2 GET (connectivity test + PRS code lists), 5 POST (1 user-resource check + 4 data retrieval). Controllers include `PrsDataFind` (search), `PrsDataMod` (modifications/changes since timestamp), and per-entity `PrsInfo` lookups.
- **Test environment:** AJPES provides a single shared test user (`wsPrsInfoTest`) and password by email to registered developers.

### Path 3 — ePRS HTML web search (NOT COMPLIANT)

The `https://www.ajpes.si/prs/` ePRS search form returns HTML only. Scraping would be required to extract per-entity data this way; **forbidden under DEC-20260428-A Tier-1 doctrine**. Not recommended.

## Coverage

- **Entity types covered:** Companies (gospodarske družbe), sole proprietors (samostojni podjetniki / s.p.), non-profit organisations, political parties, trade unions, landlords, "natural persons with registered activity" — i.e., the full PRS scope since 2005-07-01.
- **Fields available (bulk CSV, confirmed via portal description):** matična številka (registration number), full name, business address, legal organisational form, registration authority. **Director, UBO, financial, and status-history fields are not confirmed present in the bulk CSV** — the portal description lists only the minimal tuple. Confirmation requires fetching and inspecting the CSV header (deferred — out of read-only research scope).
- **Fields available (restPrsInfo REST):** "All entity data, such as name, address, tax number, registration number, and status" per third-party (Kyckr) summary; full schema in `prs_info_v1_9.xsd` and `prs_elements_v1_6.xsd` schemas referenced in API docs. Three depth tiers: minimal / narrow / extended. Protected (personal) data is gated by certificate identity.
- **Update cadence:** Bulk: "twice monthly" claimed, ~5-month stale at audit (Open Question 1). REST: real-time against the live PRS database.
- **Historical depth:** Since 2005-07-01.
- **Known data quality issues:** Slovenian-language fields with diacritics; address structure follows Slovenian postal conventions (street + number + city + postcode, often combined). Single language only — no English translations in the bulk dump.

## Licensing and ToS

- **Bulk CKAN dataset:**
  - **License:** CC-BY 4.0 (Attribution).
  - **Required attribution string:** *"Poslovni register Slovenije, AGENCIJA REPUBLIKE SLOVENIJE ZA JAVNOPRAVNE EVIDENCE IN STORITVE"*.
  - **Commercial use:** Permitted under CC-BY 4.0.
  - **Redistribution / derivative works:** Permitted under CC-BY 4.0 with attribution and license-notice propagation.
- **restPrsInfo REST:** Terms of use bundled with the package contract at registration time; not publicly available.
- **CJEU Nov 2022 UBO ruling impact:** UBO data is held in a separate AJPES register (RDR — Register dejanskih lastnikov), not in the PRS bulk. Out of scope for this build path. If Strale needs UBO later, RDR access is its own track.
- **GDPR posture:** PRS is a public register; corporate-actor data is not protected personal data. Personal data of natural-person sole proprietors (s.p.) IS in scope and is published lawfully under Slovenian PRS Act; CC-BY 4.0 licensing implies reuse is also lawful, but downstream consumers must propagate the same legal basis. Standard Tier-1 KYB posture applies.

## Tier-1 doctrine compliance

- **Compliant with DEC-20260428-A** (no Strale-operated scraping): **Yes** for both Path 1 (bulk) and Path 2 (paid REST).
- Path 3 (HTML scraping of ePRS) would NOT be compliant. Not recommended; included only for completeness.

## Recommended build approach

**Approach:** **Bulk-download-and-index** (mirror BE KBO Open Data ingest pattern).

1. **Scheduled fetch:** Daily (or per `last_modified` polling) GET of the CKAN resource URLs above. Compare ETag / last_modified against the cached snapshot timestamp; only ingest on change.
2. **Parse:** Stream-parse the 126 MB CSV into Postgres staging table; apply field mapping derived from the `atributimr20.xml` schema.
3. **Promote:** Atomic-swap the staging table into the production lookup table (or upsert if delta-feed becomes available).
4. **Per-entity query:** New capability `slovenian-company-data` reads the Postgres mirror by registration number / tax number / fuzzy name.
5. **Provenance:** Each response carries `acquisition_method: licensed_bulk`, `data_source: AJPES PRS`, `fetched_at: <CKAN-resource-last-modified>`, `attribution: "Poslovni register Slovenije, AJPES"`.

**Effort estimate:** **M** (3–10 days):
- Day 1–2: Capability scaffold + CSV parser + schema mapping (single CSV, fewer cross-table joins than KBO).
- Day 3–4: Scheduled refresh job (cron/Railway) + ingest atomic-swap + retention.
- Day 5: Capability handler + manifest + onboarding pipeline (`onboard.ts --discover`).
- Day 6–7: Tests, smoke verification, and provenance plumbing.
- Day 8+ contingency: handling missing-director / missing-UBO escalation if KYB Essentials needs require those fields and the CSV doesn't carry them (would necessitate adding restPrsInfo REST as a layered second source).

**Pattern reference:** [`docs/research/2026-04-29-be-kbo-open-data-ingest-spec.md`](2026-04-29-be-kbo-open-data-ingest-spec.md) (KBO Open Data ingest). Slovenia is structurally simpler (one CSV vs. seven), so the spec is a superset.

**Refresh cadence:** Resolve Open Question 1 first. If the source is genuinely twice-monthly, schedule a polling fetch every 24h (cheap CKAN HEAD request) and ingest only on change.

## Effort estimate

**M** — see breakdown above. No expected day-on-day blockers; the bulk dataset is well-formed, single-language, and schema-published. Risk concentrates on (a) field-coverage discovery and (b) staleness of the CKAN resource, both of which are research-not-engineering risks.

## Open questions

1. **Bulk dataset staleness.** Resource `last_modified` on the CKAN package shows 2025-12-18 (per audit fetch on 2026-05-06), but the dataset description claims "twice monthly" refresh. **Resolution path:** one-shot live HEAD request on the CSV resource URL during the implementation spike; if last_modified is still 2025-12-18, escalate to AJPES via `info@ajpes.si` to clarify the actual refresh cadence before committing to a build.

2. **Field coverage in the bulk CSV.** Portal description lists only `matična številka, name, address, legal form, status, authority` — the minimal tuple. KYB Essentials wants directors and UBO. **Resolution path:** download the CSV header during implementation spike; if directors are absent, decide whether (a) bulk alone is sufficient for the SI capability (matching IE/LV/LT minimal-reg level), (b) layer paid restPrsInfo on top for premium queries, or (c) defer the build until UBO clarity.

3. **restPrsInfo paid pricing.** Package costs are not publicly listed. **Resolution path:** only relevant if Open Question 2 forces us toward a hybrid bulk+paid model. At that point: contact AJPES (`info@ajpes.si` or developer support per `https://www.ajpes.si/za_razvijalce_programske_opreme`) for the package matrix and per-call rate limit. Per DEC-20260506-G, fixed monthly minimums are disqualifying; PAYG-only is acceptable.

4. **Personal data of sole proprietors.** Bulk CSV likely includes natural-person s.p. names tied to home addresses. **Resolution path:** confirm legal basis for downstream re-publication via AJPES open-data ToS (CC-BY 4.0 is permissive but doesn't override GDPR). Likely follow the same posture as the BE KBO build — propagate the open-data attribution downstream and document the lawful basis.

## Recommendation

**Build now via bulk-ingest path (Path 1)**, with a Day-0 spike to resolve Open Questions 1–2 before committing the full M-week effort. If the bulk is freshly maintained (cadence confirmed) and contains the minimum KYB fields needed, this is the cleanest of the four Gap-8 countries assessed and the closest analogue to BE KBO. If staleness or field-coverage gaps emerge, fall back to a paid-restPrsInfo PAYG build path conditional on AJPES disclosing PAYG pricing.

## Sources

- [AJPES PRS dataset on podatki.gov.si](https://podatki.gov.si/dataset/poslovni-register-slovenije) — License, file formats, attribution string.
- [CKAN package_show metadata for AJPES PRS](https://podatki.gov.si/api/3/action/package_show?id=poslovni-register-slovenije) — Resource URLs, last_modified timestamps, per-resource size.
- [AJPES ePRS web search](https://www.ajpes.si/prs/) — Confirms HTML-only public surface; no public REST querystring.
- [AJPES "For software developers" page](https://www.ajpes.si/za_razvijalce_programske_opreme) — Lists restPrsInfo, restEDP, wsRzppInfo, wsRtrIzmenjava, wsRTRInfo, wsProFi-Po, wsETurizemPorocanje as published API services.
- [AJPES restPrsInfo Slovenian docs (PDF)](https://www.ajpes.si/Doc/AJPES/Za_razvijalce/restPrsInfo_Opis_servisa_za_razvijalce.pdf) — Endpoint structure (PrsDataFind, PrsDataMod), three data scope tiers (narrow/extended/protected), digital-certificate auth, Swagger paths at `/swagger/index.html` on both prod and test.
- [AJPES restPrsInfo English docs (PDF)](https://www.ajpes.si/Doc/AJPES/Za_razvijalce/restPrsInfo_Documentation_for_DevOps.pdf) — Same content as Slovenian; XSD schemas (`prs_info_v1_9.xsd`, `prs_elements_v1_6.xsd`, `PrsDataFind_v1_1.xsd`, `PrsDataMod_v1_0.xsd`).
- [Kyckr's Slovenian Business Registry guide (third-party)](https://www.kyckr.com/blog/slovenian-business-registry) — Confirms restPrsInfo replaced legacy SOAP in February 2026, sold in packages by schema code, requires registration AND package purchase (i.e., paid).
- [2026-04-30 gap-8 free-registry-APIs audit](2026-04-30-gap8-free-registry-apis.md) — Prior probe-level finding that podatki.gov.si CKAN returns count: 18 matching datasets and was viable as bulk-ingest source.

**Fetches consumed for SI: 8** (within 30-fetch budget).
