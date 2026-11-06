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
