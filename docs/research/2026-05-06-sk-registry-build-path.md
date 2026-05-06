# Slovakia Registry — Direct Build Path Design Memo

**Date:** 2026-05-06
**Country:** SK (Slovakia)
**Status:** Research only. No code, no manifest, no routing changes in scope.
**Predecessor:** [2026-04-30 gap-8 audit](2026-04-30-gap8-free-registry-apis.md) (probe-level baseline — supersedes for SK; see "Correction to prior audit" below)

## Summary

Slovakia is **substantially more buildable than the 2026-04-30 baseline indicated**. The Slovak Statistical Office's RPO (Register právnických osôb) provides a free, anonymous, public REST API at `https://api.statistics.sk/rpo/v1/` returning CC-BY 4.0 JSON. RPO is the umbrella register that aggregates the Obchodný register (commercial register), Živnostenský register (trade license register), and 70+ other source registers. The 2026-04-30 baseline used the wrong hostname (`rpo.statistics.sk` instead of `api.statistics.sk`) and concluded "no public REST"; live verification on 2026-05-06 confirms the API is up.

**Recommendation:** **Build now via direct REST API** (Tier-1 first-party). Mirror the EE / IE / LV / LT / PL / CZ direct-API pattern.

**Effort:** **S** (≤3 days). One free, documented, JSON REST endpoint. No certificate, no registration, no bulk parser. Single capability in the IE/LV mould.

**Top open questions:** (1) Does RPO carry **director / statutory body / UBO** data? Verified search response for ICO 35743565 (MAGNA ENERGIA a.s.) returned ID, names history, registration history, addresses, and source-register pointers — but no directors, no statutory body, no UBO, no current status flag. KYB Essentials may need a second source, or may have to ship without those fields for SK. (2) Real-world rate limit and SLA — official page promises "open REST API to the general public" without a documented limit.

## Registry identification

- **Authority:** Štatistický úrad Slovenskej republiky (ŠÚ SR — Slovak Statistical Office). RPO is the **single public register** mandated by law since 2015-11-01 to consolidate data from 70+ source registers, including the Obchodný register (Commercial Register, operated by the courts) and Živnostenský register (Trade License Register, operated by the Ministry of Interior).
- **Public URL (data):** `https://rpo.statistics.sk/new/` (HTML search UI)
- **Public URL (API):** `https://api.statistics.sk/rpo/v1/`
- **Documentation portal:** `https://susrrpo.docs.apiary.io/` (Apiary)
- **Government page:** `https://slovak.statistics.sk/wps/portal/ext/Databases/RPO%20-%20Register%20pr%C3%A1vnick%C3%BDch%20os%C3%B4b/REST%20API%20pre%20RPO/`
- **Legal basis:** Slovak Single Public Register Act (RPO became authoritative source for legal persons / entrepreneurs / public-authority bodies on 2015-11-01; full coverage of source registers reached in 2017-11).

## Data access surface

### Path 1 — RPO REST API (FREE, RECOMMENDED)

- **Production base URL:** `https://api.statistics.sk/rpo/v1/`
- **Mock base URL:** `https://private-anon-0a809ca763-susrrpo.apiary-mock.com/rpo/v1/`
- **Authentication:** **None.** Anonymous public access. Verified on 2026-05-06 by fetching `https://api.statistics.sk/rpo/v1/search?identifier=35743565` with no headers — returned valid JSON.
- **Cost:** Free.
- **Rate limits:** Not documented on the official page. The 2026-04-30 audit's "1 req/min" caution applies to the legacy `orsr.sk` server, not RPO. Treat as undocumented; engineer with conservative throughput on first deploy.
- **Format:** JSON (default).
- **Endpoints (confirmed via Apiary doc + live probe):**
  - `GET /rpo/v1/search?identifier=<ICO>` — returns full structured record for the legal entity.
  - `GET /rpo/v1/search?fullName=<...>` — name search (parameter combinations: `birthNumber`, `fullName`, `identifier`, `onlyActive=true`).
  - Other documented controllers exist on Apiary; budget did not permit an exhaustive enumeration here.
- **Response shape (live probe, ICO 35743565 = MAGNA ENERGIA a.s.):**
  - `id` (RPO internal ID)
  - `dbModificationDate` (e.g. "2025-07-07")
  - `identifiers[]` — array of historical ICO entries with date ranges
  - `fullNames[]` — array of historical legal-name entries (tracking name changes; in this case, "MAGNA E. A. s.r.o." → "MAGNA ENERGIA a.s." in 2014)
  - `establishment` (e.g. "1998-03-06")
  - `addresses[]` — array of historical addresses with date ranges (six entries, 1998–2024)
  - `sourceRegister` — text label ("Obchodný register" in this case)
  - `registrationOffices[]` — array of court/ministry registration office records
  - `registrationNumbers[]` — array of court file numbers (e.g. "Sro/16570/T", "Sa/10626/T") with type/date metadata
- **Fields NOT present in the verified response:** directors, statutory body, share capital, ownership, UBO, current-status flag, legal form (the "a.s." vs "s.r.o." distinction is implied by registration-number prefix, not a separate structured field).

### Path 2 — Bulk dump on data.gov.sk (FREE, fallback)

- **Portal URL:** `https://data.gov.sk/dataset` — redirects to `data.slovensko.sk/datasety` (Slovak national catalogue, post-2024 migration).
- **Cost:** Free.
- **Format:** Various (CSV / XML) per dataset.
- **Status at audit time:** The catalogue confirmed datasets exist for "Obchodný vestník" (Commercial Bulletin — change events for legal persons including bankruptcies, liquidations, restructuring) and a "Register of Legal Persons V2" pulling from the official RPO REST API. **The bulk option is materially weaker than Path 1**: the CKAN catalogue requires JavaScript to render and lists piecemeal change-feed datasets rather than a single full-snapshot dump.
- **Recommendation:** Path 2 is not the build path. Use it only as a backup if Path 1 has a sustained outage.

### Path 3 — orsr.sk HTML scraping (NOT COMPLIANT)

- The `orsr.sk` Commercial Register web search returns HTML only. **Forbidden under DEC-20260428-A Tier-1 doctrine.** Excluded.
- Third-party parsers exist on GitHub (`eway-crm/ORSR`, `lubosdz/parser-orsr`, `byrokrat-sk/register-parser`) and operate by HTML-scraping `orsr.sk`. None are usable from Strale-operated infra; included here only as reference for what `orsr.sk` exposes that RPO does not (mostly: directors and statutory bodies).

## Coverage

- **Entity types covered (RPO):** Legal entities (commercial companies of all forms — s.r.o., a.s., k.s., v.o.s., etc.), entrepreneurs (živnostníci), public-authority bodies, civic associations, non-profit organisations, foundations, tax advisors, experts, plus 70+ other source-register entity types since 2017-11.
- **Fields confirmed available (RPO REST):** ICO history, legal-name history, registration-number history, registration-office history, address history, establishment date, source-register label, RPO internal ID, last-modification date.
- **Fields confirmed NOT available (RPO REST):** directors, statutory bodies, share capital, share ownership, UBO, dissolution/liquidation flags, financial data. **This is the critical gap.** If KYB Essentials' SK implementation must include directors, RPO REST alone is insufficient and a build would need either (a) Tier-2 vendor for directors (Bisnode / Creditsafe Slovakia / Finstat licensed feed), or (b) another Slovak open-data source. Open Question 1 frames this.
- **Update cadence:** Real-time against the live RPO database (RPO is the legal authoritative source since 2015-11-01).
- **Historical depth:** Full historical change tracking visible in the live response (1998-onward in the probed example).
- **Known data quality issues:** Slovak diacritics in names and addresses; "Obchodný register" entries reference the originating district court, which may matter for downstream provenance display.

## Licensing and ToS

- **License:** **CC-BY 4.0** (confirmed in the live API response license block: "sprístupnené údajov z RPO prostredníctvom webového sídla" under Creative Commons Attribution 4.0).
- **Required attribution:** Per CC-BY 4.0 — attribute "Štatistický úrad Slovenskej republiky" / "Register právnických osôb" with the standard CC-BY notice.
- **Commercial use:** Permitted under CC-BY 4.0.
- **Redistribution / derivative works:** Permitted under CC-BY 4.0 with attribution and license-notice propagation.
- **CJEU Nov 2022 UBO ruling impact:** RPO does not currently expose UBO via this REST API (UBO data is held in a separate Slovak Register of Public Sector Partners — RPVS — and the General Beneficial Owner Register — RKUV). Not in scope for this build path.
- **GDPR posture:** RPO is a public legal register with statutory basis. Personal data of natural-person entrepreneurs (živnostníci) IS in scope and is published lawfully under Slovak public-register law; CC-BY 4.0 license confirms reuse is permitted, but downstream consumers must propagate the legal-basis chain. Standard Tier-1 KYB posture applies.

## Tier-1 doctrine compliance

- **Compliant with DEC-20260428-A** (no Strale-operated scraping): **Yes** for Path 1 (REST API) and Path 2 (bulk).
- Path 3 (HTML scraping of `orsr.sk`) would NOT be compliant. Excluded.

## Recommended build approach

**Approach:** **Direct REST API** (mirror the IE / LV / LT / EE / PL / CZ pattern in `apps/api/src/capabilities/`).

1. **New capability:** `slovak-company-data` at `apps/api/src/capabilities/slovak-company-data.ts`. Handler: `GET https://api.statistics.sk/rpo/v1/search?identifier=<ICO>` with `AbortSignal.timeout(...)`, parse JSON, return mapped fields with provenance.
2. **Provenance:** `acquisition_method: official_api`, `data_source: ŠÚ SR RPO`, `primary_source_reference: api.statistics.sk/rpo/v1`, attribution string in response, `fetched_at` from response or wall clock.
3. **Field mapping:** Pick the most-recent entry per `identifiers[]` / `fullNames[]` / `addresses[]` / `registrationNumbers[]` for the canonical "current state" view; surface the full history array as a sub-field so downstream consumers (e.g. KYB Essentials) can display change history.
4. **Manifest:** `manifests/slovak-company-data.yaml` per the standard onboarding pipeline. `category: company-data`, `transparency_tag: algorithmic`, `freshness_category: live-fetch`, `gdpr_art_22_classification: data_lookup`.
5. **Onboarding:** Run `npx tsx scripts/onboard.ts --discover --manifest ../../manifests/slovak-company-data.yaml`. Health-check fixture: ICO 35743565 (MAGNA ENERGIA a.s. — confirmed live during this research).
6. **Limitation declaration:** **Critical** — declare in manifest that the response does not currently include directors / statutory body / UBO / financials. This shapes downstream KYB Essentials expectations and should not be glossed.

**Effort estimate:** **S (≤3 days)**:
- Day 1: Capability handler + manifest + onboarding pipeline run.
- Day 2: Provenance plumbing, history-array unrolling, error-shape mapping.
- Day 3: Tests, smoke verification, and explicit documentation of the directors/UBO gap in the capability description and limitations.

**Pattern reference:** `apps/api/src/capabilities/` — Estonian, Irish, Polish, Czech direct-API handlers. All four are direct-API one-fetch handlers; SK fits the same shape.

**Refresh cadence:** N/A — real-time API.

## Effort estimate

**S** — see breakdown above. Risk concentrates on: (a) confirming rate-limit headroom under sustained load; (b) deciding whether to ship without directors/UBO or pair with a Tier-2 source on Day 1.

## Open questions

1. **Directors / statutory body / UBO data.** RPO REST returns ICO history, name history, registration history, addresses — but no directors, no statutory body, no UBO, no current-status flag in the verified response. **Resolution path:** (a) read the full Apiary documentation to confirm these fields aren't simply suppressed in the search-result projection (some APIs return full detail only on a separate `/detail/<id>` endpoint — budget did not allow exhaustive endpoint enumeration); (b) if confirmed absent, decide whether to ship SK at parity with EE/LV/LT (minimal-reg level — no directors), or pair with Finstat / Creditsafe / Bisnode for directors+UBO under DEC-20260428-A Tier 2; (c) document the gap explicitly in `slovak-company-data` limitations and in the KYB Essentials SK solution composition.

2. **Rate limits and SLA.** Official page promises "open REST API to the general public" but documents no rate limit. **Resolution path:** start at conservative throughput (e.g. 1 req/sec per Strale-side process) on first deploy; instrument for 429s and 5xxs; raise the cap gradually. If sustained 429s emerge, contact `info@statistics.sk` for SLA discussion.

3. **Status / liquidation / dissolution flags.** No active-status flag in the verified response. The endpoint accepts `onlyActive=true` as a search filter — implying the server has the concept — but the field is not surfaced in the response we observed. **Resolution path:** test whether `onlyActive=true` vs `onlyActive=false` returns the same record but with a status indicator, OR whether dissolved entities are filtered out entirely. This determines whether Strale can answer "is this company still active?" via SK alone.

4. **Living-source-register correctness.** RPO aggregates 70+ source registers. For Obchodný register entries the data is authoritative. For Živnostenský register entries (trade-license individuals) the field shape may differ. **Resolution path:** probe an ICO known to be a živnostník during the implementation spike.

## Recommendation

**Build now via direct REST API (Path 1).** SK is the highest-leverage of the four Gap-8 countries assessed today: a free, documented, anonymous, JSON, CC-BY-4.0 official REST. Effort is S, doctrine is clean, the only judgment call is whether to ship without directors/UBO on day 1 or wait for a Tier-2 layer. Recommend ship-without and explicitly mark the limitation; layer Tier-2 in a separate work-stream if KYB Essentials demand it. The 2026-04-30 baseline's "no public REST" finding for SK was a hostname-probe error and should be corrected.

## Correction to prior audit

The 2026-04-30 gap-8 audit reported `rpo.statistics.sk/rpo/v1/*` returning 404 (WebSphere `SRVE0190E`) and concluded "no public REST." The correct hostname is **`api.statistics.sk`**, not `rpo.statistics.sk`. `rpo.statistics.sk` is the HTML search portal; the REST API is on `api.statistics.sk`. Live probe on 2026-05-06 confirms the API works, returns CC-BY-4.0 JSON, requires no auth, and is documented at `https://susrrpo.docs.apiary.io/`. The gap-8 audit summary should be updated to reclassify SK from "no public API" to "free direct REST."

## Sources

- [Slovak Statistical Office RPO portal](https://rpo.statistics.sk/new/) — Confirms public RPO front-end exists.
- [Slovak Statistical Office "REST API for RPO" page (gov)](https://slovak.statistics.sk/wps/portal/ext/Databases/RPO%20-%20Register%20pr%C3%A1vnick%C3%BDch%20os%C3%B4b/REST%20API%20pre%20RPO/) — Confirms the API is offered to the general public, points to Apiary.
- [Apiary documentation for RPO API](https://susrrpo.docs.apiary.io/) — Documents production endpoint `https://api.statistics.sk/rpo/v1/`, mock and proxy URLs, request/response patterns.
- Live API probe — `GET https://api.statistics.sk/rpo/v1/search?identifier=35743565` — Verified 2026-05-06: returns valid CC-BY-4.0 JSON for MAGNA ENERGIA a.s., confirming the API is live, anonymous, and JSON.
- [RPO scope documentation (Slovak Statistical Office)](https://slovak.statistics.sk/wps/portal/ext/Databases/RPO%20-%20Register%20pr%C3%A1vnick%C3%BDch%20os%C3%B4b/) — Confirms RPO is the legal source from 2015-11-01, covers 70+ source registers since 2017-11, includes Obchodný + Živnostenský registers + many others.
- [Podnikajte.sk RPO explainer](https://www.podnikajte.sk/obchodne-pravo/register-pravnickych-osob) — Independent confirmation of RPO scope.
- [data.slovensko.sk catalogue](https://data.slovensko.sk/datasety) — National open-data catalogue (post-2024 migration); inferior to RPO REST for full-snapshot needs.
- [GitHub eway-crm/ORSR](https://github.com/eway-crm/ORSR), [lubosdz/parser-orsr](https://github.com/lubosdz/parser-orsr), [byrokrat-sk/register-parser](https://github.com/byrokrat-sk/register-parser) — Third-party HTML-scraping parsers (NOT used; provided only as reference for what `orsr.sk` exposes that RPO does not).
- [2026-04-30 gap-8 free-registry-APIs audit](2026-04-30-gap8-free-registry-apis.md) — Predecessor audit; SK conclusion now superseded by this memo (hostname-probe error).

**Fetches consumed for SK: ~9** (within 30-fetch budget).
