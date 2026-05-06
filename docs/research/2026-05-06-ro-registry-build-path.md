# Romania Registry — Direct Build Path Design Memo

**Date:** 2026-05-06
**Country:** RO (Romania)
**Status:** Research only. No code, no manifest, no routing changes in scope.
**Predecessor:** [2026-04-30 gap-8 audit](2026-04-30-gap8-free-registry-apis.md) (probe-level baseline)

## Summary

Romania publishes the full ONRC (Oficiul Național al Registrului Comerțului) company register as **monthly CC-BY-4.0 bulk CSV dumps on `data.gov.ro` (the Romanian CKAN portal)**. The dataset is large (~655 MB OD_FIRME core file) but well-structured with documented columns. ONRC's own RECOM portal at `recom.onrc.ro` / `portal.onrc.ro` remains **geo-blocked / firewalled to anonymous probes from Railway US East** and operates as a paid, electronic-signature-gated extract service (RON 20 current / RON 100 historical / RON 30 InfoCert per extract); no free per-entity REST API exists.

**Recommendation:** **Build via bulk-ingest path** (mirror SI build + BE KBO pattern). RO's bulk dump is fresher than SI's (monthly snapshots vs. SI's possibly-stale "twice monthly") and covers the corporate-identity tuple (name, CUI tax-id, EUID, registration number, legal form, full address, status). **Defer directors/UBO** — bulk dump does not include them, and the only Tier-1 paths for those facts (ONRC RECOM paid extract or Romanian UBO register) are paid, geo-restricted, or electronic-signature-gated.

**Effort:** **M** (3–10 days). One bulk-download-and-index capability; pattern reference is BE KBO and SI memos. Dataset size is larger than SI but smaller than KBO's seven-file feed.

**Top open questions:** (1) ONRC publishes new dataset *packages* monthly under separate dataset slugs (each snapshot is a new CKAN dataset, not a versioned resource on a single dataset) — pinning to "the latest" requires either a CKAN organization-search-by-date or hard-coded version-bumping. (2) The geo-restriction on `recom.onrc.ro` / `portal.onrc.ro` was observed from US East; whether the same restriction applies to ingest from EU-based Railway region is unverified — but immaterial because the bulk ingest path uses `data.gov.ro` (which is reachable).

## Registry identification

- **Authority:** Oficiul Național al Registrului Comerțului (ONRC) — National Trade Register Office, under the Ministry of Justice.
- **Public URL (institution):** `https://www.onrc.ro/`
- **Public URL (paid portal):** `https://portal.onrc.ro/` and `https://recom.onrc.ro/` (RECOM online — paid + electronic-signature gated, geo-restricted to anonymous probes).
- **OpenData portal:** `https://data.gov.ro/organization/onrc` — Romanian national CKAN.
- **Legal basis:** Romanian Companies Law + Law on the Trade Register; data publication under EU Open Data Directive (2019/1024) and Romanian transposition.

## Data access surface

### Path 1 — data.gov.ro CKAN bulk dump (FREE, RECOMMENDED)

- **Portal:** `https://data.gov.ro/organization/onrc` — 70 ONRC-published datasets, including monthly company-register snapshots and reference nomenclatures (status codes, CAEN classification versions).
- **Latest snapshot pattern:** "Firme înregistrate la Registrul Comerțului până la data de DD.MM.YYYY" — a fresh dataset slug per monthly snapshot. Most recent snapshot identified during research: `firme-08-12-2025` (8 December 2025) and `firme-02-06-2025` etc., with monthly cadence visible across 2025.
- **Authentication:** None.
- **Cost:** Free.
- **Rate limits:** Undocumented; standard CKAN download endpoint.
- **Format:** CSV.
- **Files (per monthly snapshot):**
  - `OD_FIRME.CSV` (~655 MB) — core company table (one row per company).
  - `OD_STARE_FIRMA.CSV` (~87 MB) — company status records.
  - `OD_CAEN_AUTORIZAT.CSV` (~384 MB) — authorized activities (CAEN codes per company).
- **License:** **CC-BY 4.0** (newer snapshots) — older snapshots used `OGL-ROU-1.0` (Romanian open government licence). Both permit commercial reuse with attribution.

### Path 2 — ONRC RECOM portal (PAID, electronic-signature gated, geo-restricted)

- **URL:** `https://portal.onrc.ro/` and `https://recom.onrc.ro/`
- **Status from anonymous probes (per 2026-04-30 audit):** Connect timeout (000) — geo/firewall restriction observed from Railway US East.
- **Cost:** Per-extract paid:
  - **RON 20** for current extract (`recom@onrc.ro` + electronic signature).
  - **RON 100** for historical extract.
  - **RON 30** via InfoCert for trade-register extracts.
  - **Free** for "basic company information" via RECOM online — but the RECOM service requires Romanian electronic-signature (CertSIGN, AlfaTrust, DigiSign or other Romanian eIDAS-compliant cert), which is a heavy onboarding lift for a non-Romanian commercial party.
- **Format:** PDF / HTML (per portal screenshots in third-party guides) — not JSON; not a structured-data API.
- **Authentication:** Romanian electronic signature.
- **Doctrine compliance:** The portal itself is government-operated and Tier-1 compliant. But (a) it has no JSON API surface, (b) the geo-restriction is concerning, and (c) the electronic-signature requirement is a non-trivial blocker for a non-Romanian commercial party.

### Path 3 — UBO sub-register (PAID, request-gated)

- **URL:** `https://www.onrc.ro/index.php/en/information-rbo`
- **Access:** Paid request (RON 20 current / RON 100 historical) + electronic signature; or **free for "reporting entities" applying KYC measures** (i.e. obliged entities under EU AMLD).
- **Future change:** Romanian draft legislation per the post-CJEU November 2022 ruling may restrict access to "legitimate interest" only.
- **Doctrine compliance:** Tier-1 compliant if Strale ever became an obliged entity. Currently Strale is not an obliged entity, so the paid-request route is the only path. Out of scope for this build path.

### Path 4 — `onrc.ro` HTML scraping (NOT COMPLIANT)

- The ONRC home and search pages return HTML. **Forbidden under DEC-20260428-A Tier-1 doctrine.** Excluded.

### Path 5 — Tier-2 commercial vendor (PAID, FALLBACK)

- **Candidates:**
  - **termene.ro** (Romanian-native — claims "data sourced directly from ONRC and ANAF, not scraped"). API integration via `solutii.termene.ro/integrare-api`.
  - **alertacui.ro** (Romanian-native — also offers API).
  - **InfobelPRO** (claims 2.0M Romanian businesses via REST/CSV/CRM integration).
  - International: Bisnode/D&B, Creditsafe, Moody's BvD/Orbis (typical EU coverage tier).
- **Doctrine compliance:** DEC-20260428-A Tier 2 — vendor must have documented redistribution rights from ONRC + indemnification + per-fact primary-source provenance. Romanian-native vendors are more likely to have direct ONRC agreements; international vendors typically aggregate without primary-source-per-fact granularity.
- **Use case:** Only if directors/UBO are required AND Strale is not willing/able to navigate the Romanian electronic-signature paid-extract route.

## Coverage

- **Entity types covered (data.gov.ro bulk):** All companies registered in the Romanian Trade Register — SRL (Ltd), SA (a.s.), SCS (limited partnership), SNC (general partnership), SCA (joint partnership), PFA / II (sole proprietors with personal liability), associations, foundations, branches of foreign companies. The bulk dump is comprehensive against the full register.
- **Fields confirmed available (OD_FIRME.CSV):**
  - DENUMIRE — legal name
  - CUI — unique tax registration code
  - COD_INMATRICULARE — Trade Register registration number (e.g. "J40/123/2010")
  - DATA_INMATRICULARE — registration date
  - EUID — European unique identifier (per EU BRIS)
  - FORMA_JURIDICA — legal form
  - ADR_TARA / ADR_JUDET / ADR_LOCALITATE / ADR_DEN_STRADA / ADR_DEN_NR_STRADA / ADR_BLOC / ADR_SCARA / ADR_ETAJ / ADR_APARTAMENT / ADR_COD_POSTAL / ADR_SECTOR / ADR_COMPLETARE — full Romanian address granularity.
- **Fields available across companion files:**
  - **OD_STARE_FIRMA.CSV:** company status (active / dissolved / liquidated / radiated / suspended) — joinable on CUI to OD_FIRME.
  - **OD_CAEN_AUTORIZAT.CSV:** authorized economic activities per CAEN code (Romanian classification of economic activities, mapped to NACE).
- **Fields confirmed NOT available in any data.gov.ro file:** directors, statutory body, share capital, ownership, UBO, financial data. These exist in ONRC's database but are NOT published to data.gov.ro — they sit behind the paid RECOM extract route.
- **Update cadence:** Approximately **monthly** — multiple 2025 snapshots visible (May, June, July, August, December). Each snapshot is published as a new CKAN dataset (with date in slug) rather than as a versioned resource on a single persistent dataset.
- **Historical depth:** Goes back to 2014 (oldest visible: `2014-02-03` snapshot); 2017 had a structurally different file split (7 files: separate "neradiate fara sediu" / "radiate fara sediu" / "neradiate cu sediu" / "radiate cu sediu" + nomenclators). Current 3-file structure is consistent across 2025.
- **Known data quality issues:** Romanian diacritics; address structure follows Romanian postal conventions (sector indicator for Bucharest, judet indicator otherwise). Very large file size (~655 MB OD_FIRME) requires streaming parser.

## Licensing and ToS

- **Bulk CKAN datasets:**
  - **License:** CC-BY 4.0 (current snapshots) or OGL-ROU-1.0 (older snapshots). Both permit commercial reuse with attribution.
  - **Required attribution string:** Per CC-BY 4.0 — attribute "Oficiul Național al Registrului Comerțului (ONRC)" with the standard CC-BY notice. For OGL-ROU-1.0 snapshots, the Romanian Open Government Licence attribution applies.
  - **Commercial use:** Permitted.
  - **Redistribution / derivative works:** Permitted with attribution and license-notice propagation.
- **RECOM portal extracts:** Per-extract terms; not relevant if Path 1 is the build path.
- **CJEU Nov 2022 UBO ruling impact:** Romania has adjusted post-CJEU; UBO sub-register access may shift to "legitimate interest" only. Out of scope for this build path.
- **GDPR posture:** Public Trade Register basis applies for non-UBO fields. Personal data of natural-person sole proprietors (PFA / II) IS in scope of OD_FIRME and is published lawfully under Romanian Trade Register law; CC-BY 4.0 license confirms reuse is permitted, but downstream consumers must propagate the legal-basis chain. Standard Tier-1 KYB posture applies.

## Tier-1 doctrine compliance

- **Compliant with DEC-20260428-A** (no Strale-operated scraping):
  - Path 1 (data.gov.ro bulk): **Yes**.
  - Path 2 (RECOM portal with electronic signature): **Yes** if Strale subscribes — but practical bar is high for a non-Romanian commercial party.
  - Path 3 (UBO sub-register paid request): **Yes** but request-gated; not a feasible build path.
  - Path 4 (HTML scraping): **No**. Excluded.
  - Path 5 (Tier-2 vendor): **Yes if vendor has documented ONRC redistribution rights and per-fact provenance** — explicit Tier-2 path under DEC-20260428-A.

## Recommended build approach

**Approach:** **Bulk-download-and-index** (mirror BE KBO Open Data ingest pattern + SI memo).

1. **Snapshot discovery:** Daily polling of `https://data.gov.ro/api/3/action/package_search?q=firme&organization=onrc&sort=metadata_modified+desc&rows=5` to find the latest "Firme înregistrate" dataset slug. Cache `metadata_modified` and only re-ingest on change. (This pattern works around RO's "new dataset per snapshot" anti-pattern — we don't pin to a specific dataset, we discover the latest from the org listing.)
2. **Fetch:** Stream-download the latest snapshot's three CSV files (~1.1 GB total per snapshot).
3. **Parse:** Stream-parse OD_FIRME / OD_STARE_FIRMA / OD_CAEN_AUTORIZAT into Postgres staging tables; apply field mapping derived from documented column names (above).
4. **Promote:** Atomic-swap the staging tables into production lookup tables. Index on CUI (primary), COD_INMATRICULARE (secondary), and DENUMIRE trigram (for fuzzy name lookup).
5. **Per-entity query:** New capability `romanian-company-data` reads the Postgres mirror by CUI, COD_INMATRICULARE, or fuzzy name. Returns: corporate identity tuple + status + authorized activities + provenance (snapshot date + ONRC attribution).
6. **Provenance:** Each response carries `acquisition_method: licensed_bulk`, `data_source: ONRC via data.gov.ro`, `fetched_at: <CKAN-snapshot-date>`, `attribution: "Oficiul Național al Registrului Comerțului"`, and explicit `limitation` declaration that directors / UBO / share capital / financials are NOT in this response (they require RECOM paid extract or Tier-2 vendor).

**Effort estimate:** **M (3–10 days)**:
- Day 1–2: Capability scaffold + CSV streaming parser + per-file schema mapping (three files vs. SI's one — adds an integration day vs. SI).
- Day 3–4: CKAN snapshot-discovery polling + ingest atomic-swap + retention.
- Day 5: Capability handler + manifest + onboarding pipeline (`onboard.ts --discover`).
- Day 6: Tests, smoke verification, provenance plumbing.
- Day 7+ contingency: handling 1.1 GB-per-month disk and ingest churn (Railway has finite ephemeral disk; may need to pre-stage the streaming on S3 if Railway's disk pressure becomes a concern — see DEC-20260504-B Bulk-Operation Deploy Protocol for accumulated-workload audit).

**Pattern reference:** [`docs/research/2026-04-29-be-kbo-open-data-ingest-spec.md`](2026-04-29-be-kbo-open-data-ingest-spec.md) (KBO Open Data ingest) and the parallel [SI memo](2026-05-06-si-registry-build-path.md). RO is more demanding than SI on disk (655 MB vs 126 MB) and snapshot-discovery (new-dataset-per-month vs. versioned-resource), but the engineering shape is identical.

**Refresh cadence:** Monthly polling of the data.gov.ro CKAN organisation listing; ingest on detection of a new snapshot dataset.

## Effort estimate

**M** — see breakdown above. Risks concentrate on: (a) the new-dataset-per-month CKAN pattern requiring discovery polling rather than versioned-resource polling; (b) Railway disk pressure under monthly 1.1 GB ingest churn (per DEC-20260504-B, audit before deploy); (c) the directors/UBO gap — accept the limitation explicitly or pair with a Tier-2 vendor in a separate work-stream.

## Open questions

1. **CKAN snapshot discovery vs. pinning.** ONRC publishes a new dataset slug per snapshot rather than versioning resources on a single dataset. **Resolution path:** implement CKAN organisation-search-by-date polling as described in step 1 above; cache the newest dataset slug and snapshot date; ingest only on change. Alternative: subscribe to data.gov.ro's RSS / change feed if one exists (not verified within fetch budget).

2. **Disk churn under monthly ingest.** 1.1 GB per snapshot × atomic-swap = peak disk usage of ~2.2 GB during the swap window plus query indexes. Railway's filesystem is ephemeral and limited. **Resolution path:** during implementation spike, audit Railway disk capacity for the project; if marginal, stage parsed rows directly into Postgres without intermediate CSV materialisation, or pre-stage the download on Cloudflare R2 / S3 and stream from there. Apply DEC-20260504-B accumulated-workload audit before first production deploy.

3. **RECOM geo-restriction extent.** The 2026-04-30 audit observed `recom.onrc.ro` and `portal.onrc.ro` time out from Railway US East. Whether this is geo-blocking specifically against North-American IPs or general anonymous-probe firewalling is unverified. **Resolution path:** test from an EU-based Railway region or an EU-based VPS during any future investigation of the RECOM portal; for the recommended bulk path this is immaterial because data.gov.ro is reachable from any region.

4. **Directors / UBO gap.** Bulk dump does not include directors, share capital, or UBO. **Resolution path:** ship `romanian-company-data` with the explicit limitation declared in the manifest's `limitations` array, and surface the gap in any KYB Essentials Romania composition. If the gap blocks customer use cases, evaluate Tier-2 vendor options (termene.ro is the most plausible candidate due to Romanian-native ONRC integration).

5. **Snapshot freshness vs. RECOM real-time gap.** A monthly snapshot can be up to ~30 days behind real-time; a newly registered company on day 1 of the month is invisible until the next snapshot. **Resolution path:** declare the staleness in the response's `freshness_category: reference-data` (vs. `live-fetch`) and surface `snapshot_date` in the response so customers can decide whether to fall back to RECOM for very recent registrations.

## Recommendation

**Build now via bulk-ingest path (Path 1).** RO's bulk publication is mature, fresh (monthly), and licensed CC-BY 4.0. Effort is M (3–10 days), doctrine is clean, and the directors/UBO gap is tolerable if explicitly declared. This builds parity with IE / LV / LT / EE / SI at the corporate-identity-tuple level. Pair with a Tier-2 vendor for directors/UBO only if customer demand justifies the additional vendor onboarding effort.

## Sources

- [data.gov.ro ONRC organisation page](https://data.gov.ro/organization/onrc) — Lists 70 ONRC-published datasets including monthly company-register snapshots and reference nomenclatures.
- [ONRC dataset for snapshot 07.08.2025 (representative)](https://data.gov.ro/dataset/firme-inregistrate-la-registrul-comertului-pana-la-data-de-07-08-2025) — Confirms CC-BY 4.0 license, three-file CSV structure (OD_STARE_FIRMA ~87 MB, OD_CAEN_AUTORIZAT ~384 MB, OD_FIRME ~655 MB).
- [data.gov.ro CKAN package_search](https://data.gov.ro/api/3/action/package_search?q=onrc&rows=30) — Confirms 70 datasets, monthly snapshot cadence, license shift from OGL-ROU-1.0 to CC-BY 4.0 around 2025.
- [OD_FIRME column documentation (search-result extract)](https://data.gov.ro/dataset/firme-08-12-2025/resource/488a8d00-90df-4f37-b5f4-6c9111e6f1e7) — Documents column structure: DENUMIRE, CUI, COD_INMATRICULARE, DATA_INMATRICULARE, EUID, FORMA_JURIDICA, ADR_*.
- [ONRC institutional page](https://www.onrc.ro/) — Confirms registry-of-record status; lists RECOM and other portal services.
- [Topograph guide — Trade register in Romania](https://www.topograph.co/guides/trade-register-in-romania) — Confirms RECOM extract pricing (RON 20 / RON 100 / RON 30) and electronic-signature requirement.
- [ONRC Beneficial Owners page](https://www.onrc.ro/index.php/en/information-rbo) — Confirms UBO sub-register exists, paid-extract access, post-CJEU draft legislation may restrict to "legitimate interest" only.
- [ONRC Portal (paid)](https://myportal.onrc.ro/) — Romanian-electronic-signature-gated paid extract portal; not a free per-entity API.
- [termene.ro API integration page](https://solutii.termene.ro/integrare-api) — Tier-2 vendor candidate; claims direct ONRC + ANAF integration.
- [European e-Justice Portal — Romania business register page](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/ro_en) — EU BRIS portal entry for Romania (HTML only).
- [2026-04-30 gap-8 free-registry-APIs audit](2026-04-30-gap8-free-registry-apis.md) — Predecessor audit; classified RO as "partial (bulk only)" — confirmed and deepened by this memo.

**Fetches consumed for RO: ~7** (within 30-fetch budget).
