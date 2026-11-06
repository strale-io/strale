Intent: Codex builder brief: a `nordic-statistics` capability that reads curated tables from the Swedish, Norwegian and Finnish national statistics offices.

# Brief: nordic-statistics (portfolio item 2.10, national statistics offices)

**Requester:** the Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw), on Petter's go of 2026-11-06 ("please start on all your suggested actions").
**Branch:** push only `codex/nordic-statistics`. Never push `main`, label, approve, merge or comment.
**Data rule:** DEC-20261023-A, preferred lane (`acquisition_method: direct_api`): each office's own open statistics API, one request per call, nothing stored, no key, no account, no login, no scraping. This brief and the repository are all you get: there are no secrets and no production or customer data in it, and none are needed. Every test runs offline.

## Why

`docs/strategy/2026-10-23-portfolio-plan.md` Phase 2 item 2.10 names "Eurostat and national statistics offices" as a gap in the library. `eurostat-data` covers Eurostat only. Statistics Sweden (SCB), Statistics Norway (SSB) and Statistics Finland publish the same kind of data through PxWeb, one open API protocol, with finer national detail (municipalities, industries, prices) than Eurostat carries. One executor can serve all three. This is a data lookup, not a compliance product.

Use `apps/api/src/capabilities/eurostat-data.ts`, its manifest `manifests/eurostat-data.yaml`, its test file and its fixtures folder as the pattern. Copy its structure: a curated table allowlist, strict input validation, a cell cap, flattening of the response, typed errors that are not billed, and a licence note in every output.

## What to change, file by file

Edit or add exactly these files:

1. **`apps/api/src/capabilities/nordic-statistics.ts`** (new)
   - Register with `registerCapability("nordic-statistics", ...)`. The handler returns `{ output, provenance: { source, fetched_at } }`.
   - Input: `office` (`"SCB" | "SSB" | "STATFIN"`), `table` (a curated table id), `filters` (object: PxWeb variable code to one value or an array; at most 50 values in total), optional `since_period` and `until_period`. Reject anything else with a structured error.
   - **Curated allowlists, one per office.** Pick 8 to 12 tables per office of national macro statistics: population, GDP, CPI or inflation, unemployment, wages, housing prices, foreign trade in goods only if the terms allow (leave it out if unsure). No tables with personal-level or small-cell data. Record how you chose them in the fixtures README. Other tables return `table_not_supported` with the supported list. Note that PxWeb table ids and variable codes differ per office, and SCB's and SSB's APIs have versions (v1 and v2); choose the version the office documents as current and pin its base URL in a constant. Do not guess ids: take them from the office's own table catalogue and say in the README where you got each one. If you cannot reach the network from your environment, build the allowlist and fixtures from what you can read in the repository and mark every unverified id in the report; the orchestrator will check them.
   - Request: PxWeb metadata is a GET on the table URL; data is a POST of `{"query":[{"code":<var>,"selection":{"filter":"item","values":[...]}}],"response":{"format":"json-stat2"}}` to the same URL. Use `AbortSignal.timeout()` on every call, a descriptive user agent like the one in `eurostat-data.ts`, and honour any rate-limit header or 429 by returning a structured retryable error. Never retry in a loop. Never send a request that selects more than 5,000 cells; compute the product of the selected value counts before sending.
   - Parse the response as JSON-stat 2.0 (the same format `flattenEurostat` reads). Reuse that flattening if it can be imported cleanly; otherwise write a small local one. Preserve missing cells as `null`, and keep zero values.
   - Output fields: `office`, `table`, `label`, `updated` (ISO 8601 or null), `unit` (when exactly one), `dimensions`, `observations` (one row per cell with `period`, numeric or null `value`), `observation_count`, `source` (the office's full English name), `licence_note`, `source_url`, `accessed_at` (ISO date), `as_of`. Wire shape: money and numbers stay machine-readable, never formatted strings.
   - `licence_note` per office states the licence and the attribution it requires. The licences are believed to be CC0 for SCB, NLOD 2.0 for SSB and CC BY 4.0 for Statistics Finland. **Treat these as unverified**: put the exact wording the office publishes in the vendor-terms record (item 4) with the URL you read it from, and if you cannot read it, set `resale` to `"unverified"` in the record and say so in the report instead of asserting a licence.
   - Errors never leak raw HTML, stack traces or upstream bodies. Input validation (empty, non-string, unknown office or table) happens before any fetch.
2. **`manifests/nordic-statistics.yaml`** (new), following the CLAUDE.md template and `manifests/eurostat-data.yaml`:
   - `slug`, `name`, `description` (50 to 160 characters, and it must say only what the executor does: three named offices, curated tables), `category: finance` (as `eurostat-data`), `price_cents: 3`, `data_source_type: api`, `transparency_tag: algorithmic`, `freshness_category: live-fetch`, `geography: europe`, `maintenance_class: free-stable-api`, `gdpr_art_22_classification: data_lookup`, `processes_personal_data: false`, `cost_class: free_unlimited`, `external_cost_cents: 0`.
   - `data_access: { lane: preferred, acquisition_method: direct_api, upstream_vendor: "Statistics Sweden, Statistics Norway, Statistics Finland" }`.
   - `input_schema` and `output_schema`, `test_fixtures.known_answer` (a stable, real table and filters from your allowlist) and `test_fixtures.health_check_input`, `output_field_reliability` for every output field, and honest `limitations` (at least: curated tables only; revisions to published figures; the cell cap; each office's licence and attribution; English labels may be missing for some variables).
   - Do **not** write `expected_fields` by running `--discover`; you cannot reach a database. Hand-write the `known_answer` expected fields for the guaranteed fields only.
   - No claim beyond the executor: do not call the data "real-time", "complete" or "all of the Nordics". Denmark and Iceland are not covered, and the manifest says so in a limitation.
3. **`apps/api/src/capabilities/nordic-statistics.test.ts`** (new). Offline: mock `globalThis.fetch` with recorded responses. Cover:
   - flattening of dense and sparse values, with a null cell and a zero kept;
   - the cell cap refuses an oversized selection before any fetch (assert `fetch` was not called);
   - unknown office, unknown table and an empty filter value each return a structured error before any fetch;
   - a 429 and a 5xx return a structured retryable error and are not retried in a loop;
   - an upstream HTML error body is not echoed;
   - every output carries `licence_note`, `source_url` and `accessed_at`.
   Each test must fail if the code under test returned a constant.
4. **`apps/api/src/lib/vendor-terms.data.json`**: add one record per office in the shape of the existing `Eurostat` record (`vendor`, `hosts`, `url_prefixes`, `capabilities: ["nordic-statistics"]`, `resale`, `terms_url`, `accessed`, `how_read`, `findings`, `decision_ref: "DEC-20261023-A; portfolio plan item 2.10"`, `basis`). `vendor-terms.test.ts` ties `capabilities` to the hosts the source tree calls; keep it green. State in `how_read` exactly how you obtained the terms text.
5. **`apps/api/src/capabilities/__fixtures__/nordic-statistics/`**: a `README.md` giving, for each fixture file, the office, the exact request and the date it was recorded (or "hand-authored in the documented JSON-stat 2.0 shape, not recorded" where you could not reach the network), plus one JSON file per recorded response: at least one success per office, one 4xx, one 429.

## Out of scope

- No database access, no migration, no `onboard.ts` run, no edit to any table or to production.
- Do not touch `eurostat-data`, `platform-facts.ts`, `llms.txt`, the website, `claims.yaml`, `auto-register.ts` or any package. Executors are auto-registered, so no import is needed.
- No Statistics Denmark, Iceland, or non-Nordic offices; no free-form table search; no arbitrary table ids.
- No personal-level or small-cell tables.
- Edit no file outside the five named above, apart from the report below.

## Done when

- `npm --workspace=apps/api exec vitest run src/capabilities/nordic-statistics.test.ts src/lib/vendor-terms.test.ts` passes;
- `npm run typecheck` passes;
- `npm run claims:check` passes;
- you have written `docs/lanes/codex/nordic-statistics-report.md`, giving the files changed, the test names, every table id or licence statement you could not verify, and anything you could not do.

## Steps the orchestrator runs afterwards (Codex cannot reach a database or production)

1. Review the vendor-terms records against each office's current published terms.
2. `cd apps/api && npx tsx scripts/onboard.ts --discover --manifest ../../manifests/nordic-statistics.yaml`, then review the generated `expected_fields` and reliability.
3. `npx tsx scripts/validate-capability.ts --slug nordic-statistics`, the readiness check (`checkReadiness("nordic-statistics")` returns `ready: true`), and `npx tsx scripts/smoke-test.ts --slug nordic-statistics`.
4. An independent review in a separate context, then the usual PR path and DEC-20260504-C deploy verification (the capability appears in `GET /v1/capabilities` after deploy).
