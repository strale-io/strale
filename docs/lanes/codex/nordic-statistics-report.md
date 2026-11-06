# Nordic statistics builder report

Date: 2026-11-06

## Delivered files

* `apps/api/src/capabilities/nordic-statistics.ts` — curated SCB, SSB and Statistics Finland PxWeb executor, strict input validation, pre-POST Cartesian cell cap, metadata and data requests with timeouts, JSON-stat 2.0 flattening, structured retryable errors, provenance, source links and licence notes.
* `apps/api/src/capabilities/nordic-statistics.test.ts` — offline fetch mocks and validation/flattening/error/output coverage.
* `manifests/nordic-statistics.yaml` — schemas, data-access declaration, known answer, health input, field reliability and limitations.
* `apps/api/src/lib/vendor-terms.data.json` — one terms record for each office.
* `apps/api/src/capabilities/__fixtures__/nordic-statistics/README.md` and five JSON files — hand-authored success/error response shapes and allowlist provenance.
* This report.

## Tests and checks

The focused Vitest run passed 125 tests. The new test names are:

* `flattens dense values and preserves zero and null cells`
* `flattens sparse values without converting zero to missing`
* five parameter cases under `rejects invalid input before fetch` (unknown office, unknown table, empty filter value, more than 50 filter values, and a Cartesian selection over 5,000 cells)
* `refuses an oversized upstream Cartesian selection`
* `builds a non-constant request and emits attribution fields`
* three parameter cases under `carries licence, source URL and access date` (SCB, SSB and Statistics Finland)
* two parameter cases under `returns a retryable error without retrying` (HTTP 429 and 503)
* `honours an exhausted rate-limit header before posting data`
* `does not echo an upstream HTML error`

`npm run typecheck` passed after building the local TypeScript SDK dependency. `npm run claims:check` passed. The vendor-terms suite passed with the focused run.

## Network and verification status

Direct requests to `api.scb.se`, `data.ssb.no` and `pxweb2.stat.fi` failed at the build environment's CONNECT proxy with HTTP 403. The fixtures are hand-authored in the documented JSON-stat 2.0 shape, not recorded upstream responses.

Accordingly, every allowlisted table id/path is unverified:

* SCB aliases/paths: `BE0101N1`, `BE0101N2`, `NR0103N1`, `PR0101N1`, `AM0401N1`, `AM0110N1`, `BO0501N1`, `HA0101N1`.
* SSB: `07459`, `05110`, `09189`, `11721`, `08804`, `13760`, `11418`, `07221`.
* Statistics Finland aliases/paths: `vaerak_12af`, `synt_12dx`, `kan_12sv`, `khi_11xe`, `tyti_13al`, `palk_13rb`, `ashi_13mu`, `ktutk_13a6`.

The known-answer filter codes and values (`SSB` table `07459`, `Region=0`, `ContentsCode=Population`, `Tid=2024`) are also unverified against a live response.

SCB's official Open data via API page was readable through the web search reader and confirms CC0, no required attribution, recommended wording “Source: Statistics Sweden”, and separate attribution for another agency's statistics. Statistics Finland's official Open data and interfaces page confirms CC BY 4.0 and source attribution. Statistics Norway's official Public APIs page says its APIs use CC BY 4.0; this differs from the brief's believed NLOD 2.0, so the implementation records the currently published official CC BY statement rather than asserting NLOD. No licence statement remains unverified, but the orchestrator should recheck all three records as requested by the brief.

SCB and SSB now document PxWebApi v2 as current, while this implementation pins their older metadata-GET/data-POST endpoints because that is the wire protocol explicitly required by the brief. The live endpoint/version and migration should be reviewed before activation. Statistics Finland remains pinned to its documented PxWeb API v1 endpoint.

## Not performed

Per the brief, I did not run onboarding discovery, database writes, production validation, readiness, or a smoke test. The orchestrator must verify allowlist paths against live catalogues, record real fixtures, run `onboard.ts --discover`, review generated expected fields and reliability, run capability validation/readiness/smoke tests, and complete independent review and deploy verification.

## Live verification (Claude lane)

Date: 2026-11-06. All three APIs were reachable; every allowlisted table was checked with a metadata GET and a small json-stat2 POST using the executor's request shapes (24 of 24 return HTTP 200 with data). The executor was also run live end to end against SSB, SCB (monthly period bounds) and Statistics Finland (yearly bounds).

Changes made:

* **SCB** (8/8 verified). Fixed: `NR0103N1` path to `NR0103E/NR0103ENS2010T01NA`; `PR0101N1` to `KPI2020M` (`KPItotM` is frozen after 2025M12); `AM0401N1` to `AKURLBefAr`; `AM0110N1` to `LonYrkeRegion4AN`; `BE0101N2` to `BE0101G/BefUtvKon1749` (population and population changes); `HA0101N1` to `NR0103E/NR0103ENS2010T03NAN`. Kept: `BE0101N1`, `BO0501N1`. Labels corrected.
* **SSB** (8/8 verified). Fixed: `09189` and `11721` were mislabelled (national accounts, not CPI/quarterly). Dropped `08804` (external trade, which the allowlist excludes) and `11721` (monthly GDP); added `14700` (CPI, current to 2026M09; `03013` stops at 2025M12) and `05803` (population and population changes). Kept `07459`, `05110`, `13760`, `11418`, `07221`. The known-answer ContentsCode is `Personer1`, not `Population`.
* **Statistics Finland** (8/8 verified). Base host changed to the official `pxdata.stat.fi`; the table path form is `folder/NN.px`, not `statfin_<folder>_pxt_NN.px` (that form returns 400). Mapping: `vaerak_11ra`, `synt_12dx`, `ntp_15a9` (annual GDP), `khi_11xt`, `tyti_13al`, `ktps_14n2` (wage and salary index; the guessed `palk` folder does not exist), `ashi_13mw` (regional, replaces the postcode-level `13mu`), `ntp_15ag` (household consumption; `ktutk` is a stale 2012-2022 survey). Aliases were renamed to match.
* Executor: user agent now `https://strale.io`; `since_period` / `until_period` now match the offices' period codes (`2024K1`, `2024M01`) against the documented `YYYY-Qn` / `YYYY-MM` forms (before, quarterly and monthly bounds never matched).
* Fixtures are real recorded responses (see the fixtures README); tests replay them.
* Limitation worth knowing: variables that are not eliminable (for example SCB `ContentsCode`, SSB `ContentsCode`) must be supplied in `filters`, otherwise the office returns 400 and the capability reports `upstream_unavailable`. Eliminable variables left out are aggregated by the office.
* SCB and SSB list PxWebApi v2 as current; the v1/v0 endpoints used here still work as of today. Migration is a later decision.

Known-answer query (verified live): `{office: "SSB", table: "07459", filters: {Region: "0", ContentsCode: "Personer1", Tid: "2024"}}` returns one observation, 5,550,203 persons.

Licences (read from the official pages on 2026-11-06): SCB CC0, no attribution required, https://www.scb.se/en/services/open-data-api/ ; SSB CC BY 4.0 ("Like the rest of ssb.no, the APIs use the license CC BY 4.0"), https://www.ssb.no/en/api ; Statistics Finland CC BY 4.0, source must be mentioned, https://stat.fi/en/services/statistical-data-services/open-data-and-interfaces . All three vendor-terms records are correct; the Statistics Finland record's host moved to `pxdata.stat.fi`.

Egress lint: `lint:no-unguarded-user-fetch` and the SSRF inventory pass without annotation (hosts are fixed; no caller URL reaches fetch).

Still needing a database: `onboard.ts --discover`, `validate-capability`, `checkReadiness`, smoke test, and the independent review.
