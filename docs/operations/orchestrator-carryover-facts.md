# Strale orchestrator facts carried over from the PC-local memory store

**What this is.** A single-file carry-over of the operational facts that live only in Petter's PC-local Claude memory
(`C:\Users\pette\.claude\projects\C--Users-pette-Projects-strale\memory\`, 132 files: `MEMORY.md` plus 131 one-fact files). A cloud session cannot read that folder. Facts the
repository already states are not repeated; section 13 says where they live instead.

**What it is not.** It is a snapshot carried over on 2026-10-31, not a live mirror. Each source entry was written on its own date (dates are kept inline) and the repository
has moved since. Section 12 lists entries I found stale or contradicted by the repository at `f9e2496c`; read it before trusting any entry that quotes a count, a status or a
table name. Memory is evidence, not doctrine: where this file and a register in `docs/` or `config/` disagree, the register wins.

Conventions: `DB` means the production Postgres on Railway. "The harness" is the internal test scheduler. "Trunk" is `C:\Users\pette\Projects\strale`. Slugs and column names
are exact.

---

## 1. Production and deploy

**Railway does not cut over when a deploy fails, so `/health` lagging `main` is ambiguous.** Confirmed 2026-08-18 (three consecutive deploys `FAILED` for ~40 minutes while
`/health` served the old SHA and the site was fine). After merging, if `GET /health` has not moved in ~5 minutes, run `railway deployment list` (`--json` gives
`commitHash`/`commitMessage`) before assuming it is still building. A `FAILED` deployment left on the tip makes the next shipper's change look like the one that does not cut
over.

**A good build can fail the readiness probe; `railway redeploy -y` on the same commit then goes green.** Seen 2026-08-23: image built and pushed, then `Path: /health/deep ·
Retry window: 20s · 1/1 replicas never became healthy!`. `/health/deep` answered 200 in 14 ms minutes later. Boot runs startup migrations and wires every scheduled job before
it can answer, against a 20 s window, so it can recur; the window is the thing to change, not the boot. Logs: `railway logs --deployment <id>` for runtime, `railway logs
--build <id>` for build and healthcheck (`--build` takes the id positionally and cannot be combined with `--deployment`). A failed boot also sends an `alerting-sent` "API
failed to start" email.

**Railway drops application logs above 500 lines/sec per replica, so a missing log line is not evidence the code did not run.** Seen 2026-10-30: an onboarding run that
returned 200 left no `onboarding-run-start`/`request-complete` lines. The boot path is the main offender (`startup-migrations-complete` emits one line with ~83 block outcomes;
the test scheduler logs two lines per suite). Reproduce the event while tailing (`railway logs --service strale`) rather than searching back; the CLI only serves a short
recent buffer and a redeploy resets it. For anything that must be provable afterwards use a DB row, a receipt, or the Better Stack sink (needs `BETTERSTACK_SOURCE_TOKEN` and
`BETTERSTACK_INGEST_HOST` set in Railway, DEC-20261029-A).

**Railway edge emits one-off ~130 ms 502s ("Application failed to respond") on random requests.** Retry once before believing them (2026-08-12 sweep).

**A boot-blocking gate fails asymmetrically: under-detecting is a weak net, over-detecting is a prod crash-loop.** Anything in `index.ts` startup that throws
(`validateSchema`, `runStartupMigrations`, cost-class invariants) takes production down on every deploy if it demands something correctly absent. Found 2026-08-18 reviewing PR
#332: a `DROP COLUMN` with nothing subtracting it, a multi-column `ALTER TABLE ... ADD COLUMN a, ADD COLUMN b` parsed by a single-match regex (silent under-detection), and a
collapsed parse deriving zero artifacts then certifying "all clear". Design such checks to fail toward under-detection, add a floor guard so "found nothing" throws, and run
the derived expectation against production read-only before merge (that is the merge gate). If the code reads its own files at runtime, build to a temp `outDir` and check
compiled output behaves like source.

**Production error text is sanitised: vendor names and URLs in `details.error` become `[service]`.** Observed 2026-08-20 (`...not covered by the [service] holiday data source.
Covered countries: [service]`). Do not put actionable URLs or vendor names in executor error strings; put pointers in manifest `limitations` or catalogue surfaces, which are
not sanitised.

**A 401 on a path under an auth-walled prefix may mean the route no longer exists.** `adminOnly` is mounted on all of `/v1/internal/*` and runs before routing, so deleted
routes answered 401 instead of
404. That is how `strale-mcp` shipped `0 cap trust, 0 sol trust` for ~3.5 months (closed 2026-08-23, PR #369, `strale-mcp@0.2.8`). Public ops paths are admitted by
     `PUBLIC_OPS_ALLOWLIST` in `app.ts`, which is the real access boundary for `/v1/public/ops/*`, not the mount. Check that the route exists before assuming a permissions
     problem.

**`/v1/do` sync path dies at 15 s with an opaque `internal_error` and no transaction row.** `ASYNC_THRESHOLD_MS = 10_000`; `isAsync = (capability.avgLatencyMs ?? 0) > 10_000`.
The sync path runs the executor inside the wallet transaction under `SET LOCAL idle_in_transaction_session_timeout = '15s'`, so a capability whose p95 exceeds 15 s but whose
declared `avg_latency_ms` is <= 10000 fails exactly its heavy inputs. Signature: constant ~15.3 s duration + `internal_error` (or `execution_timeout`, "The request was not
charged") + no `transactions` row. Examples: `web-extract` (declared 5000 ms, p95 37 s, fixed 2026-08-17 by setting 12000), `page-speed-test` (avg 8000, p50 7,967 / p95 19,029
/ max 49,910 ms, 2026-08-29). `avg_latency_ms` is a routing knob, is a DB column, and is not carried by `sync-manifest-canonical-to-db.ts`. The same inputs succeed via x402
(no wallet-tx ceiling). Compute it from successful `transactions` p95 (`lib/latency-estimate.ts`: p95, >= 20 samples, refuses otherwise); completed-only means have
survivorship bias.

**`POST /v1/do` body is `inputs` (plural) and `max_price_cents` is mandatory.** Sending `input` yields `{"error_code":"invalid_request","message":"Missing required input
fields: query"}` naming the field you did send, because the whole object was ignored. Success is `{"result":{"output":{...}}}`; failure is
`{"error_code","message","details":{"error":"<real message>"}}` with no top-level `error`. Send `inputs: {}` first to get a 400 listing `expected_fields`; names are not
guessable (`iso-country-lookup` wants `query`, `company-id-detect` `id`, `name-parse` `full_name`, `beneficial-ownership-lookup` `company_name`). Execution failure is HTTP 500
`error_code:"execution_failed"`; breaker open is 503 "temporarily suspended"; a missing executor is 503 "registered but has no executor"; rate limit is 429 with "Try again in
N seconds".

**Browserless: local `.env` points at v2 SaaS, production runs a pinned v1 container.** Local `BROWSERLESS_URL=https://production-sfo.browserless.io` (v2, ajv: `must NOT have
additional properties`); production `http://chromium.railway.internal:8080` (self-hosted `browserless/chrome:1.61.1`, Joi: `"<key>" is not allowed`). Wait params differ (v1
one overloaded `waitFor`, number = ms or object `{selector,timeout}`; v2 discrete `waitForTimeout`/`waitForSelector`). A change verified locally proves nothing about prod: PR
#148 fixed `screenshot-url` against v2 and left prod 400-failing for a month, #150 fixed it. Never send a selector as a bare-string `waitFor`: v1 runs it through
`page.evaluate()`, which is remote code execution inside the chromium container. The `strale` service's `BROWSERLESS_API_KEY` must stay a Railway reference
`${{chromium.TOKEN}}`; on 2026-08-25 it was overwritten with a browserless.io account key and every direct call was refused until the reference was restored (DQ-31,
2026-09-11, PR #647 limits the balance monitor to `*.browserless.io` hosts). Never replace it with a literal.

**Fetch-and-parse capabilities must be verified by a real production call.** Origins serve different bytes by region and User-Agent; a Sweden-based local run and Railway US
East parse different documents. 2026-08-09 `domain-contact-extract` shipped fabricated phone numbers (`72-9098-2766` for stripe.com) and `role_emails:
["u003esales@stripe.com"]` (JSON-escaped `>` in the US-served page) past 19/19 validation and 11/11 smoke tests; `readCapped` also truncates at 300 KB mid-document. Read the
output values, not the status; trust markup only where the site declares the type (`tel:`, schema.org); an empty field beats a plausible wrong one.

**Production is Railway US East (Virginia), 1 replica; for any regulator-facing statement the honest answer is "servers are in the United States".** Verified from the
dashboard 2026-04-27; transfers rest on SCCs, UK IDTA and sub-processor DPF certifications. The Railway project was renamed `desirable-serenity` to `Strale` (id
`16920e2f-8258-47db-86c0-60ec9d7edc13`, verified `railway status --json` 2026-07-02); services are `strale` (api.strale.io), `chromium`, `Postgres`. Prod base URL
`https://strale-production.up.railway.app` is the same service as api.strale.io; `GET /health` shows the deployed commit.

**Umami analytics for strale.dev** (public share, EU cloud, free tier 10k events/month, installed 2026-04-03):
`https://cloud.umami.is/analytics/eu/share/kvYHfnCNMCmivwOj/strale.dev`, website ID `9f534d25-6ff4-43e0-aa20-780c2e087db4`. Cookieless, no consent banner.

---

## 2. Database and schema

**Production DB reads: `DATABASE_URL` in the root `.env` is now the real read-only role `strale_ro` (since PR #613, 2026-09-06).** Do not read about it as a superuser: until
2026-09-06 it was `postgres` with `rolsuper = true` on the primary, which made "read-only" a discipline. Now writes are refused by privilege (`ALTER ROLE ...
default_transaction_read_only`, SELECT only). Audit 2026-10-31: even with `SET default_transaction_read_only = off` an UPDATE/INSERT/CREATE is refused. It can still SELECT all
public tables including `transactions` (customer inputs/outputs for 90 days), so it must not be shared to cloud sessions; the narrower `strale_verify` role is the cloud-safe
credential: provisioned on 2026-10-31 by `scripts/provision-verify-role.mjs`, it reads 17 tables and 8 metadata views, withholds 30, and was proven independently from
Bitwarden the same day (TLS 1.3, every withheld table refused with SQLSTATE 42501, all writes and CREATE refused). Its URL is `STRALE_RAILWAY_DB_VERIFY_URL` in Bitwarden
project `strale`, readable with the fleet token. Handoff `2026-10-31-verify-role-and-serper-aftermath.md`. Doc:
`docs/security/2026-09-06-read-only-database-credential.md`.

**Connection recipe that actually works (every wrong turn gives a misleading error).** (1) Point dotenv at the repo root: `apps/api/` has no `.env`, `import "dotenv/config"`
loads nothing and postgres falls back to the OS user, giving `password authentication failed for user "pette"`. (2) The host is the Railway public proxy
`metro.proxy.rlwy.net`; `postgres.railway.internal` only resolves inside Railway. (3) The URL must carry `?sslmode=disable` (the proxy does not terminate TLS). `ssl:
"require"` gives `ECONNRESET`; `apps/api/src/lib/operator-db.ts` (`assertSslIntentIsExplicit`) refuses a non-loopback URL with no `?sslmode=`, so missing it killed 25+
operator scripts after the 2026-09-02 `.env` rebuild. Use `openOperatorDb()` (sets `default_transaction_read_only` server-side). Run scripts from inside `apps/api` (copy to
`scripts/_tmp-*.ts`, delete after); a file outside the package gets a CJS transform and rejects top-level `await`. Plain-Node alternative: import
`file:///.../node_modules/postgres/src/index.js` by absolute URL (it is hoisted to the repo-root `node_modules`, not `apps/api/node_modules`) and parse `.env` by hand; a
relative import resolves against the script's directory, giving a misleading ENOENT.

**Writes need `DATABASE_URL_WRITE` plus an `Authority` object; there is no write grant for autonomous sessions.** `openOperatorWriteDb(authority)` in `operator-db.ts` refuses
with no `Authority` or no `DATABASE_URL_WRITE`. The superuser URL is parked in root `.env` as a commented line `# DATABASE_URL_WRITE=<url>` (with `?sslmode=disable`);
uncomment only for an operator write the founder or charter authorises, then re-comment, and scope the script with `WHERE ... IS NULL` so it cannot overwrite recorded state.
Hand the step to Petter otherwise; do not describe the session as unable when it is choosing not to. `onboard.ts` mixes gates (suite writes via the operator connection,
`persistCapability` via `getDb()`): point both URLs at the write role for one invocation. Every `onboard.ts` run, including `--dry-run`, needs the grant. Production-authority
terms: `apps/api/src/lib/production-authority.ts`.

**postgres-js, not node-postgres: `db.execute()` reports affected rows as `.count`, never `.rowCount`.** `(result as any).rowCount ?? 0` type-checks, runs, and is always 0, so
`if (count < BATCH_SIZE) break` exits after one iteration and every summary logs 0. It hid a retention sweep 60x larger than predicted (2026-08-16). `data-retention.ts`
centralises it in `affected()`.

**Never bind a JS array into `ANY()` through drizzle's `sql` tag.** `= ANY(${jsArray})` renders `ANY(($1, $2, ...))`, a row-value tuple: `op ANY/ALL (array) requires array on
right side`. Use `sql.join(items.map((i) => sql\`${i}\`), sql\`, \`)` inside `IN (...)`. Shipped four times (commit `4bf58d0` crashed `loadCatalog` on every `/v1/suggest`;
`auto-register.ts`; `test-scheduler.ts`; block 0092 on 2026-08-18). Worst inside `startup-migrations.ts`, where it crash-loops every boot. `jobs/quality-floor.ts` uses `LIKE
ANY(${array})` safely only through the `postgres` package's own tag. Treat an unexpected test result as the bug talking (I once weakened the assertion that found no bound
array parameter).

**drizzle-orm >= 0.44 wraps every driver error in `DrizzleQueryError`.** Message `Failed query: ...`, no `code`, the Postgres error only at `.cause`. The 0.38.4 -> 0.45.2
upgrade (PR #510, 2026-09-04) passed tsc and the unit suite and then broke `isUniqueViolation` in `account-service.ts` (duplicate signup became a 500), `classifyError` in
`app.ts`, and integration tests. Read codes/messages only through `apps/api/src/lib/db-error.ts` (`unwrapDbError`, `pgErrorCode`, `dbErrorMessage`). A sweep for `err.code`
missed two money-path readers written as casts (`(err as { code?: string }).code` in `routes/do.ts`, 25P03/55P03 -> 503; `settlement-reconciler.ts`, 23505): grep the cast
forms, SQLSTATE literals, `.cause` and `.message.includes(` too. For any major ORM/driver upgrade the review brief must attack the thrown-error shape; CI's ephemeral-Postgres
lane is the gate, not the local suite.

**`scripts/` and `**/*.test.ts` are outside `tsc -p tsconfig.json`.** include is `["src/**/*"]` with `rootDir: ./src`. Operator scripts were never type-checked until
`tsconfig.scripts.json` (narrow include, ~127 pre-existing errors elsewhere). A signature change to a shared helper compile-fails every prod call site but no test file: tests
with the old shape fail at runtime (#426, 7 failures in `image-resize.limits.test.ts`). Run the consuming suites, not just tsc.

**Metadata writes must not land in a column something reads as "content changed".** Two startup blocks (0066, 0069) both derived `test_suites.scheduled_testing_eligible` and
both stamped `updated_at = NOW()`; the fixture-staleness guard reads `updated_at` as "suite edited". 381 suites flipped twice per boot and 12 fixture baselines were
invalidated on every deploy (fixed 2026-08-21, PR #346); `eu-regulation-search`'s 51%/60.4% had no real failure behind it. Two code paths deriving one column is a bug even if
each is correct. Verify a migration with `EXPLAIN` against prod read-only first, then query prod for the effect. CLAUDE.md also records that `scheduled_testing_eligible` is
rewritten from `external_cost_cents` every boot.

**Retention clearing sets `redacted_at`, not `deleted_at`.** `purgeCustomerContent` (`apps/api/src/lib/data-retention.ts`, `CUSTOMER_CONTENT_CLEAR_SQL`) clears `transactions`
content at 90 days: sets `redacted_at`, writes `'{}'::jsonb` (or NULL). `deleted_at` + `deletion_reason='retention_purge'` belong to the 3-year sweep. On 2026-10-25 counting
`deleted_at IS NULL` gave 732,114 and a false alarm. Verify with `redacted_at IS NULL AND legal_hold = false` older than 90 days, or content `<> '{}'`.

**`transactions.input` is written verbatim on every execution path and kept 90 days; no write-time redaction exists.** `do.ts` writes `input: executionInput` at four insert
sites (sync, async, x402); only the audit trail is redacted. So no capability may accept a secret or personal identifier: `breach-exposure-check` (2026-09-05) refuses
`email`/`password`/`account` and covers only the HIBP domain endpoint; `password-strength` falsely said "Password is NOT stored" for its whole life (narrowed 2026-09-05).
`pii-redact` has the same exposure and was not reviewed. A write-time redaction flag is a proposal only (`docs/security/2026-09-06-input-redaction-at-write-proposal.md`).

**Schema name gotchas.** `transactions` has no `capability_slug` (join `capabilities` on `capability_id`), its error column is `error`, not `error_message`; bundle sales are
`transactions.solution_slug`, not `capability_slug` (a revenue query grouping only on `capability_slug` drops every bundle sale). The on-chain x402 hash is
`transactions.x402_settlement_id`; `x402_payment_hash` is an internal 32-hex digest and matching an explorer against it reports every settlement missing.
`capability_limitations` columns: `capability_slug, title, limitation_text, category, severity, workaround, active, sort_order` (not `display_order`).
`capabilities.updated_at` moves whenever a test touches the row: it is not a visibility timestamp. `capability_health` was renamed `source_health` (block 0134, 2026-10-29) and
keyed on `capability_slug`; the compat view is dropped by block 0141.

**`failed_requests` mixes demand with fumbles.** `failure_type = 'no_match'` is unmet demand; `missing_fields`, `input_misplaced`, `input_confusion`, `input_group_unsatisfied`
mean matching worked and the caller broke the envelope (a "validate this IBAN DE89..." row with empty inputs was misread as "we refused a free capability" on 2026-08-15).
Filter `failure_type = 'no_match'`, exclude probes like `zzz-no-such-cap`, and remember the table omits x402 entirely. About 98% of `/v1/do` traffic is the harness: filter
`transactions` on `email <> 'system@strale.internal'`.

**Manifest-to-DB drift is silent and customer-visible.** Agents see the DB row's schema, not the manifest. `tech-stack-detect`, `image-to-text`, `us-company-data` had `anyOf`
contracts in manifests that never reached prod (fixed 2026-08-15 via `sync-manifest-canonical-to-db.ts`). `sweep-manifest-drift.ts --strict` exists now (2026-10-31: 350
examined, 0 sync-writable differences, 8 manifests with no DB row).

---

## 3. Capabilities, harness and quality

**The harness does not measure customers, in both directions; call production before believing any verdict.** 2026-08-16, 7-day harness pass rate vs 30-day real paid
completion: `url-to-text` 425/425 vs 39% (18 calls), `brazilian-company-data` 455/455 vs 59% (29), `screenshot-url` 518/518 vs 55% (47) (real bug: `HTTP 400: "waitForSelector"
is not allowed`). The other way, 2026-08-17: ten algorithmic capabilities fired `ALGORITHMIC CORRECTNESS VIOLATION — correctness 0%` ~400 times/day though all ten answered
correctly in prod (invariant counted environmental failures as defects, PR #305; and fixtures asserted a flattened shape against nested output: `iso-country-lookup`'s six
"null" fields all live under `match`). `transparency_tag` says how an answer is derived, not whether it makes a network call.

**`test_mode='fixture'` replays a stored baseline; check the suite ran before editing it.** `runFixtureTest` validates `baseline_output` and records it as `actual_output`.
Before PR #308 (2026-08-17) a wrong baseline was permanent: six capabilities failed continuously since 2026-03-20 on baselines captured from a different suite's input
(`iso-country-lookup` stored `{"query":"Sweden"}`, all 81 runs echoed `"land"`). `isBaselineStale` (baseline older than the suite's `updated_at`) now forces live re-execution;
81 fixture suites were stale. Diagnostic: compare each suite's stored `input` with the input its results echoed. `fixture_recapture_exhausted` locks on
screenshot-url/html-to-pdf tests (2026-08-18 to 21) are a test-runner fault across 12 capabilities, not the key outage. Placeholder inputs (`test_value`) exercise a
capability's empty branch and fail it for complying.

**`test_results` mixes executing and non-executing suites; use `transactions` for execution evidence.** Medians by `test_type` (2026-08-29): `schema_check` 3 ms, `negative` 6,
`edge_case` 9, `dependency_health` 7,879, `known_answer` 14,430, `known_bad` 17,723 (it does execute), `piggyback` 11,489. `page-speed-test` medians 6 ms over 1,592 results
but 11,208 ms over the 617 that ran. Neither the label nor a duration floor separates the populations. Harness rows count in `transactions` (the runner calls executors
directly).

**Output contracts are judged against the declaration, and `lib/capability-output-contracts.ts` is the single source.** Gate 2 (`calculateNullFieldRatio`) walks
`output_schema.properties`, skips `common`/`rare`, does not apply below 3 checked fields, fails above 50% null (empty array/string count as null; `0`/`false` do not). Gate 3
(`checkGuaranteedFieldsPresent`) fails on any `guaranteed` key missing at the top level (presence only; a present `null` passes). Reshaping an executor without the declaration
makes a healthy capability look broken forever (seven capabilities, PR #309). Startup block 0090 writes the module to the DB with `jsonb_set` on `properties` only; manifests
are generated from it. Compare DB JSONB key-order-insensitively. Downgrading a conditional field to `common` can silently disable Gate 2 below the 3-field floor
(`iso-country-lookup`, `beneficial-ownership-lookup` deliberately). New 2026-10-31 finding: 16 tools returned responses missing a field their manifest declares guaranteed
(only 2 are in `manifest-consistency-allowlist.txt`); cause per tool undiagnosed.

**Quality floor is armed in production and delists real capabilities.** `QUALITY_FLOOR_ENFORCE=true` on Railway (seen from `health_monitor_events` rows with
`details->>'mode'='enforce'`, 2026-08-16); it quarantined six capabilities 2026-08-12/13. Quarantine is `visible=false, x402_enabled=false` with `is_active` and
`lifecycle_state` untouched, so a quarantined capability still serves `/v1/do` by explicit slug and is byte-identical to an unpromoted dark launch; tell them apart through
`health_monitor_events`. **Restoring flags alone is a trap:** the promotion-grace clamp reads the latest `event_type = 'capability_promotion'`, `action_taken LIKE
'promoted%'`, `details->>'mode'='enforce'` row; restore `visible`/`x402_enabled` and INSERT that event in one transaction or the next daily tick re-quarantines on the stale
30-day window (done 2026-08-17 for `web-extract`, event `a3756a37`; its own truncation bug had failed 6 paid calls in 5 minutes).

**The failure taxonomy misses refusals, and a refusal is judged by THREE consumers.** A correct refusal (ambiguous company name, SSRF guard, unresolvable input) must not count
as ill health. Consumers: `circuit-breaker.ts` (`isUserInputError(message: string)`, 3 consecutive failures open it for 5-30 min and every caller gets
`capability_unavailable`; incident 2026-08-14, three correct refusals opened `french-company-data`'s breaker with 25 prior successes), `jobs/quality-floor.ts` via
`transaction-failure-taxonomy.ts` (`caller_input` and `unclassified` exempt), and `quality-capture.ts` -> `quality-aggregation.ts` (`categorizeError` checks
`isCapabilityRefusal(err)` on the object). Verified 2026-08-16: the taxonomy counted `Invalid URL format.`, `This URL targets a restricted address.`, `No US company found
matching "Braize" in SEC EDGAR.`, `ReceitaWS returned HTTP 404` as faults while a sibling string was caught (`us-company-data` delisted at "64% on 11 calls"). Fix at the error
class: `readonly isCapabilityRefusal = true` plus a distinctive tail in `REFUSAL_MESSAGE_PATTERNS` (`lib/capability-refusal.ts`); every consumer calls `isRefusalMessage`, and
an AST test fails if a fourth importer appears (#436). Platform-initiated refusals (ALLOW_MATRIX declining to spend vendor credits from a test context) are a third category,
not caller input. Test both directions with a negative control and messages produced by the real primitives (a guard pattern `"distinct .* entities match"` never matched the
real "entities are exact matches"). A shared pattern array matched by different rules per consumer is the recurring defect: export a predicate, not the data.

**Company-registry name searches never rank; score candidates and refuse.** Confirmed 2026-08-10: Finland PRH matches every historical name ("Nokia"/"Telenor" returned Fysios
Mehilainen Oy), Norway Brreg is alphabetical (NITO TELENOR), SEC EDGAR is full-text over filings ("Norsk Hydro" returned NORSK HYDROGENBILFORENING). Fetch a page of
candidates, score with `classifyNameMatch` in `src/lib/company-name-match.ts`, accept only `exact`/`high`, else refuse naming the closest candidates. Strip local legal forms
before comparing (bare `as` deliberately not in the suffix list); never add a `CORP_SUFFIX_RE` token that collapses distinct entities (`kg` made "Muster GmbH" and "Muster GmbH
& Co. KG" a false exact match; bare `ev` broke "EV Metals Group"); German register-number lookups need court verification (HRB per Amtsgericht); a tie between distinct
`company_id`s at equal confidence refuses. The route validates the DB `input_schema` `required` array before the executor, so an input alias in code does nothing until the
schema lists it and drops it from `required`.

**Declare input contracts with `anyOf`; never infer them from schema shape.** `properties` with empty `required` is ambiguous: either-or capabilities (`tech-stack-detect`
url|domain) and all-optional ones (`fear-greed-index`, `ecb-interest-rates`, `gas-price-check`, `nl-housing-price-index`: `{}` is the canonical paid call). A "reject empty
input" heuristic 400s paid traffic after payment verification (PR #171, 2026-08-12). Enforce only flat `required` and `anyOf`/`oneOf` groups; `required: []` is truthy;
error-response examples are agent instructions (a generated `true` for default-less booleans handed every 400 recipient `allow_low_confidence: true`). ~45 either-or manifests
still need `anyOf`.

**Auto-promotion cadence: "a green week" is only true for `free_unlimited`.** `lib/capability-promotion.ts` needs >= 40 results over >= 5 distinct days at >= 95%,
`known_answer` green and most recent a pass, trailing 24h >= 95%, max 3 promotions per run. `jobs/test-scheduler.ts` takes `GREATEST(tier interval, cost_class floor, status
floor, canary floor)`: `free_unlimited` (or NULL) is 1 h (~2 days, 5 distinct days binds); `free_quota` adds a 24 h floor (tier C 72 h, ~4.3 results/day, ~9-10 days);
`paid_with_free_tier` 72 h. Trap: `onboard.ts` generated `dependency_health` rules `{"checks":[{"field":"status","operator":"not_null"}]}` for outputs with no `status` field,
so 4/5 suites pass = 80% forever (auto-remediation fixes it only on the second consecutive failure; 2 failures at 40 results is exactly 95.0%). Do not blanket-strip it:
`cve-details` genuinely has `status`. Check `cost_class` before quoting a date. New suites carry `scheduled_testing_eligible=false` until the next boot, so the clock starts at
the first deploy after onboarding.

**`onboard.ts` write surface is narrower than its banner.** `--backfill` syncs limitations only on a drift-clean capability (an `AuthorityViolationError` gate hard-fails on
any pre-existing manifest-vs-DB drift); on a drifted one use targeted SQL into `capability_limitations`. For an unlaunched capability the reliable resync is DELETE its rows
(`test_suites` by `capability_slug`, `capability_limitations`, `capabilities`) and re-onboard. `--strict` can never pass for a NEW capability (fixture verification reads
`cost_class` from the DB row that does not exist yet) and aborted on every `type: array` assertion until PR #522; non-strict is the working path. `--discover` writes volatile
equals-assertions (e.g. a literal `source_as_of` timestamp) and marks rare fields guaranteed: hand-review. The sanctioned flow for a drifted manifest is
`sync-manifest-canonical-to-db.ts` then `onboard.ts --backfill --force`. `sync-manifest-canonical-to-db.ts --dry-run` is a lower bound, not a diff (on 2026-08-14 it reported
one field; the write also set `data_source` and `maintenance_class`; NULL-in-DB fields are the blind spot). PR #417 (2026-08-27) closed the `cost_class` gap; all 16
FIELD_CATEGORIES fields sync. `cost_class = free_unlimited` is right for no-quota free sources; `free_quota` demands a quota window and the guarded executor throws
`window=null`.

**`smoke-test.ts` Step 2 fails on `paid_prepaid` capabilities by design.** ALLOW_MATRIX refuses `internal_test` context (`circuit-breaker.ts`, PR #403): "refuses invocation
from context kind 'internal_test'". Record "smoke pass except Step 2 = cost-governance refusal" and move on; verify the message matches before excusing anything else.

**Switching a capability off needs the `DEACTIVATED` map, not just the DB flags.** `getDirectExecutor` (`apps/api/src/capabilities/index.ts`, used by web3-assurance
evaluators) never reads `is_active` (found 2026-09-10, PR #633; `gas-price-check`/`contract-verify-check` stayed callable after the 2026-09-06 DB switch-off). To drop a
capability for terms reasons do all of: DB flags + reason, `DEACTIVATED` entry in `capabilities/auto-register.ts`, add the host to `PROHIBITED_UPSTREAM_HOSTS`
(`lib/vendor-terms.ts`, guarded by `vendor-terms.test.ts`), and check bundles (`solution_steps`, no active solution with a dead step). Enumerate by upstream host, not
capability name (the audit by name missed three Etherscan wallet lookups and `ip-risk-score`). Shared clients called directly need their own gate
(`ETHERSCAN_COMMERCIAL_PLAN`). `config/vendors.yaml` is the register that should drive this.

**`x402_not_on_rail` failed-request slugs are usually deliberately deactivated.** Checked 2026-08-20 for 8 slugs (`product-search`, `salary-benchmark`,
`employer-review-summary`, `australian-company-data`, `dutch-company-data`, `business-license-check-se`, `annual-report-extract`, `trustpilot-score`): all `is_active: false`;
check `is_active` and the `DEACTIVATED` map before recommending enablement. `dutch-company-data` is gated behind `OPENAPI_ENABLED` (resale addendum, case 151296, unset on
`.env` and Railway); `australian-company-data` is a deactivated duplicate of the live `au-company-data`.

**A queue entry claiming a state change is intent, not outcome.** DQ-4 (2026-08-15) said the US court-records lookup was "switched off"; only `x402_enabled` was cleared and
`us-court-search` stayed `is_active`, `visible`, listed at EUR 0.15 and returning HTTP 500 to every caller for two days (verified 2026-08-17). Verify against the capability
row, the served catalogue and a live call; prefer shipping the change as a startup-migration block so it cannot be half-applied.

**Every public surface must filter `visible`; guard the response, not the query.** `visible=false` is the withdrawal mechanism. Five review rounds (PR #494, 2026-09-03) found
~12 surfaces ignoring it (agent card, `GET /v1/capabilities/:slug`, `llms-full.txt`, `.well-known/mcp.json`, x402 catalogue and both eligibility predicates, `GET
/v1/solutions` list/detail/`extends_with`, `POST /v1/suggest`, `related-items.ts`, `public-trust.ts`). `/v1/public/ops/*` now runs `lib/public-ops-visibility.ts` at the
boundary. Traps found by fetching: slugs appear as object KEYS (`/v1/public/ops/trust/capabilities/batch` answers `{"<slug>": {...}}`); `slug` is a shared key name (solutions
use it for their own namespace); rewriting a `Response` in middleware must drop `content-length`. Test the predicate rendered with drizzle's `PgDialect`, not a stub. When
claiming "nothing can reach X", enumerate mechanically and `curl` production; every miss came from the surface nobody listed.

**`GET /x402/catalog` has two arrays.** `{x402, network, facilitator, wallet, capabilities: [...], solutions: [...], total}`; bundles are only in `solutions`. Checking
`capabilities` alone made `lead-email-verify` and the growth bundles (`competitor-read`, `page-seo-check`, `prospect-brief`, `keyword-scout`) look delisted on 2026-08-21.

**Sweeps trip circuit breakers and serialise on one wallet.** `CONSECUTIVE_FAILURE_THRESHOLD=3` (`lib/circuit-breaker.ts`) suspends a capability for all customers 5-30 min
(exponential backoff): keep verification below 3 attempts per failing slug per window (`apps/api/scripts/sweep-prod-catalog.ts` caps transient attempts at 2 and never re-calls
deterministic failures on `--resume`). Concurrent paid `/v1/do` calls on one wallet contend on the `SELECT FOR UPDATE` row lock: 503 "Wallet was contended"; sweep concurrency
must be 1 (also a real limit for agent customers). Test wallet `test2@strale.io` tops up to EUR 50 with `apps/api/scripts/topup-test.ts`; a full catalog pass cycles ~EUR 45
internal money, real vendor cost < EUR 1 with the denylist. EUR 25 external-cost cap per sweep (DEC-20260812-A).

**Executor tips.** Grep side-effect imports (`import "../capabilities/<slug>.js"`) before deleting a capability file; TypeScript NodeNext does not verify side-effect targets
and `tsc` passed while `audit-capabilities.ts`/`audit-tests.ts` broke with `ERR_MODULE_NOT_FOUND` (2026-05-03, PR #37). `resource-limits.ts` is the only module allowed to read
a response body (`readPageHtml` 16 MiB refuse, `readRobotsTxt` 500 KiB truncate, `readSitemapXml` 50 MB refuse, `readJsonWithLimit` 4 MiB, `readTextTruncated`,
`readBodyWithLimit`, `countBodyBytes`, `readErrorTextTruncated`; `discardBody` from `lib/safe-fetch.ts`); `unbounded-body-reads.test.ts` is the AST guard with classes
A/B/B2/C, and class A membership includes files containing `assertTargetAllowed(`. Add a named wrapper rather than a new body read (#432, 2026-08-29; open: `page-speed-test`,
#434).

---

## 4. Vendors, sources and upstream gotchas

**Per-fact upstream quirks not obvious from code.** Finland PRH is `avoindata.prh.fi/opendata-ytj-api/v3/companies` (old `/bis/v1` is gone). TED is `POST
api.ted.europa.eu/v3/notices/search` with expert syntax (`field ~ "term"`). Estonian ariregister 403s name search from some IPs, works with an exact registry code. ECB SDW is
geo-restricted and does not work from Railway US East. PatentsView is discontinued (HTTP 410). Corporations Canada name search is a **POST** form (the `V_SEARCH.*` GET params
are inert); a plain POST works and result rows carry `corpId` which feeds the official JSON API (fixed 2026-08-14). Slovenia (AJPES via data.gov.si CKAN, resource
`beb70929-3d0d-41c6-9af2-25d525d906d3`) refreshes twice monthly and has no status, NACE, directors or VAT; the paid AJPES `restPrsInfo` path is barred (ToU section 7).
Slovakia RPO is a two-call pattern (`/search?identifier={ico}` then `/entity/{id}`), 60 rpm/IP unauth. HK `data.cr.gov.hk` only holds "C"-prefix BRNs (guarantee
companies/NPOs), so regular companies return "No result found" (deferred). India data.gov.in MCA is split into ~30 per-state RoC datasets keyed by CIN chars 6-7 and needs a
free `DATA_GOV_IN_API_KEY` (deferred). South Africa: a compliant path exists (CIPC APIVerse at `developer.cipc.co.za`, docs `guide.cipc.co.za`, OAuth 2.0, read-only Companies
API; pricing and entity requirements unpublished); Apify-style CIPC scrapers are out of bounds; deferred on demand (one search in 2,183 on 2026-08-05).

**Austria Firmenbuch HVD is live via an IWG token (2026-08-27).** SOAP 1.2 at `https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws`, header `X-API-KEY`, `Content-Type
application/soap+xml`; token is in the email thread "Antrag auf Informationsweiterverwendung – HVD Firmenbuch API" and in Railway as `JUSTIZONLINE_API_KEY` (never in files).
Licence CC BY 4.0, Petter committed to attribution in every response. Spring-WS validates strictly: `SUCHEFIRMAREQUEST` requires ALL of `FIRMENWORTLAUT, EXAKTESUCHE,
SUCHBEREICH, GERICHT, RECHTSFORM, RECHTSEIGENSCHAFT, ORTNR` in order (empty allowed, missing = 400). Officers are a `FUN`->`PER` join on the whitespace-padded `PNR` attribute
(trim); repeated DKZ blocks, take `AUFRECHT="true"`; status is not a field (dissolution arrives as `RECHTSTATSACHE`/`RTS_DKZ50`: 0930 Konkurs eroeffnet, 0938 aufgeloest);
unknown FNR is a SOAP Fault HTTP 500 with German text; zero hits is 200 with no `ERGEBNIS`. Test entities: OMV FN 93363 z (active), NIKI Luftfahrt FN 230533 w
(dissolved-but-registered), Red Bull (genuine ambiguous pair FN 056247t / FN 033158m). Activated 2026-08-27 under DQ-20; `cost_class=free_unlimited`, price 5c,
`avg_latency_ms` 1500. WSDL itself needs auth. Env `JUSTIZONLINE_API_KEY` set on Railway with `--skip-deploys`.

**Vendor cost and quota facts (audit 2026-08-18; Section 12 flags what moved).** Serper: 50,000 credits bought 2026-05-08 (USD 62.50 via Paddle), login `petter@strale.io`,
**credits expire ~2026-11-08** (expiry, not exhaustion, is the constraint; renewal is a purchase and Petter's). CDP x402: ~2,000 settlements/30d, past the 1,000 free tier.
`sec-api.io` and EINsearch: no subscription exists, zero calls, scaffolded stubs. Dilisense: ~20 calls/30d against the 100/mo free tier. Never self-host sanctions lists to
save money (DEC-20260428-B bar applies the moment raw OFAC/EU/UN feeds are touched). Voyage: inside the free 200M-token allowance. Vendors with no self-serve balance API
(Dilisense, Serper, Browserless, Voyage, Anthropic needs an admin key): do not promise a programmatic balance check. 2026-08-30 refusal mining found four upstreams down with
no alert: OpenRegister gives 500 free credits per rolling 30 days (`german-company-data.ts` error string) and answers HTTP 402 when exhausted (127 refusals to the one paying
wallet, the real cause of that capability's 19.6% success); `danish-company-data` calls the third-party wrapper `cvrapi.dk`, not the official registry (`datacvr.virk.dk` is
the free official path, registration required, not wired up); `us-court-search` breaker open since 08-17 because CourtListener rejects `COURTLISTENER_API_TOKEN` with 401 (free
API, regenerate the token). Vendor-credential health is a monitoring blind spot.

**Alchemy serves only networks enabled on its app; only Ethereum mainnet was enabled (2026-09-11, still true 2026-10-30).** After #659 shipped multi-chain wallet/gas
capabilities every Base/Arbitrum/OP/Polygon/BNB call returned HTTP 403. Enabling networks is an account step (Petter). The 14 non-Ethereum `known_answer` suites were paused
(`active=false`). Verify a new network with a real `known_answer`, run via `POST /v1/internal/tests/run?slug=` (Bearer `ADMIN_SECRET`), not a unit test. It also blocks a full
on-chain recount: the public Base RPC refuses `eth_getLogs` outright.

**Web3 Assurance must not send hex addresses to Dilisense.** The `sanctions` evaluator in `apps/api/src/web3-assurance/evaluators/existing-cap.ts` is restricted to
`targetType` `protocol`|`domain` since 2026-05-01: Dilisense screens names, a `0x...` returns zero matches and burns a quota unit (this exhausted the Starter quota by
2026-05-01). The proper primitive is OFAC SDN crypto-address data (`sdnlist-crypto.csv` or `digitalCurrencyAddress` nodes). Review any new evaluator for the same
category-error lookup.

**Dilisense classifies embedding in bundles as reselling.** Mirko Heinbuch (Client Success, dilisense GmbH, Zurich), email 2026-04-27: reseller plans start at Basic (EUR
300/mo, 10k calls, EUR 0.03 overage), and Basic+ is needed for the Reseller Service Agreement and a DPA; Strale got a verbal, non-binding grace on Starter. Without a DPA EU
customers' subject names cannot lawfully be forwarded to a Swiss processor. Upgrade before any signed counterparty-assurance pilot; list dilisense GmbH (adequacy applies) as a
sub-processor. Posture is reactive: do not open the conversation without a trigger (see section 10).

**US payment-assurance gap is regulatory-structural.** EU/UK have scheme-level account-name match because PSD3 VOP (binding Oct 2025) and UK CoP (2024) forced it; the US has
Nacha 2021 (policy, no protocol). Microdeposit tools (Plaid Auth, Stripe Financial Connections, Trustly) are the wrong shape; EWS Verify, GIACT, Socure, SentiLink are
enterprise-only. Triggers to revisit: FedNow name disclosure, FDX 6.x critical mass, EWS/GIACT opening PAYG resale. Tell US AP prospects a regulatory story, not a
vendor-selection one. (Counterparty Assurance as primary product is retired under DEC-20260812-A; background only.)

**Registry coverage snapshot from 2026-05-07 is stale; treat it as history.** Then: direct-API live for SE, NO, DK, FI, FR, EE, PL, UK, CZ, IE (CRO CKAN resource
`3fef41bc-b8f4-4b10-8434-ce51c29b1bba`), LV (`25e80bf3-f107-4ab4-89ef-251b5b9374e9`), LT (Spinta RQL `eq(field,value)`), SG (ACRA `d_3f960c10fed6145404ca7b821f263b87`, 4
calls/10 s), SK, SI, DE (OpenRegister, 50 req/mo then); BE via CBEAPI.be (`vendor_aggregation`); queued BE KBO Open Data SFTP (registration email sent 2026-04-29 to
kbo-bce-webservice@economie.fgov.be; spec `docs/research/2026-04-29-be-kbo-open-data-ingest-spec.md`); AT/IT/NL/PT/ES deactivated as scraping-dependent awaiting a licensed
aggregator (Topograph replied 2026-04-29 confirming reseller rights, pricing gated on a call); HU/BG/RO/LU/MT/CY no path. Current truth: `manifests/*.yaml`,
`apps/api/src/capabilities/auto-register.ts` (`DEACTIVATED`), `config/vendors.yaml`, `apps/api/coverage-matrix/`. Notion Provider-Coverage matrix:
`https://app.notion.com/p/396c619280ef4397adcbcdc067ead321`; Vendor Roster `https://app.notion.com/p/af5a164bdea948379835210ae69b4283`.

---

## 5. Money and x402

**x402 order is verify -> execute -> settle (DEC-14 alignment, PR #7, 2026-04-17).** Triggered by a 2026-04-15 empty-input probe across 20 capabilities that settled USDC on
every call and then failed validation. `verifyX402PaymentOnly(...)` returns an opaque `X402VerifiedPayment` handle; `settleX402Payment(handle)` broadcasts; the combined
`verifyX402Payment` is legacy. For solutions settle only if at least one step produced an object without `error`/`skipped` keys (all-steps-failed is 502). Settle failure after
success: mark transaction failed, return 402. `/v1/do` with `X-Payment` records `payment_method='x402'` and `x402_settlement_id`.

**Coinbase CDP gives 1,000 free settlements/month, then $0.001 each, and refuses settlement without a card.** Error `payment-method-required`, HTTP 402 from the facilitator;
challenge, verify and execution all succeed so nothing looks broken and revenue just stops (21-hour outage 2026-08-14 from settlement #1,009). Production key `strale-x402` (ID
starts `79b3a0`, `CDP_API_KEY_ID`) belongs to CDP entity `28dcd11b-8752-5835-a764-42f94af91614`, not the entity the portal opens by default; a Visa is on that entity
(re-confirmed 2026-08-18). Billing page `portal.cdp.coinbase.com/entity_28dcd11b-8752-5835-a764-42f94af91614/billing`. If settlement fails again, first verify the card is on
THIS entity. `reportSettlementFailure` in `apps/api/src/lib/x402-gateway.ts` pages with the remedy.

**When x402 revenue stops, resolve the payer from the last settlement and read its USDC balance on Base before suspecting Strale.** 2026-09-04: the dominant payer (hash
`e9e672ef719ee934`, UA `Deno/2.7.4`, ~150-300 paid calls/day, $6-17/day) simply ran dry (wallet `0x9d3d9410be95fa1d230734b961997427fc61d837`, funded with ~$245 around
2026-08-23, drained to $0.001 on 2026-09-03 21:59 UTC). Recipe: `transactions.x402_settlement_id` is a Base tx hash -> `eth_getTransactionReceipt` -> USDC Transfer log (USDC
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), `topics[1]` is the payer -> `eth_call balanceOf`. Use `https://mainnet.base.org` for single calls; `eth_getLogs` is
capped/refused (see section 12). Customer vs Strale-fault: a bare 402 challenge is <= 10 ms, a facilitator verify attempt > 200 ms in `request-complete` `duration_ms`. The
`revenue-heartbeat` alarm worked (fired at 6.1 h). Normal-looking noise: 429 bursts on `/x402/*` from scanners exhausting their own 60/min bucket, ~120 `x402_not_on_rail`
rows/day from crawlers, harness ~47% "failed" (negative tests), `x402_bad_input` rows from `vet402-observatory` (it pays then sends empty input on purpose). Charter forbids
outreach derived from this; profile: a retail-funded individual developer (Robinhood-funded wallet, 387 distinct sellers paid, 83% of kadec0's revenue) running a multi-tenant
agent. Do not try harder to identify them.

**Reconciliation shape, 2026-10-30:** 731 x402 transactions in 24 h vs 743 on x402scan, 0 orphan settlements, intents terminal state is `recorded` (no row holds
`settled`/`completed`/`captured`, so a filter on those returns a vacuous 0). Receipt: `archive/receipts/2026-10-30-audit-x402-settlement-reconciliation.json`.

**Money-path code checks.** Wallet debits serialise per account (SELECT FOR UPDATE), idempotency keys, spend cap and the 15 s wall are in `routes/do.ts` (see sections 1 and
3). The A-7 bug (a `Date` reaching a `sql` template; PR #43, 2026-05-04) silently 500'd paid `/v1/do` calls for capped users for 4 days; assert bind-parameter shape in tests
(CLAUDE.md DEC-20260504-A states the rule; the incident detail is only here).

---

## 6. Git, worktrees and the gates

**The primary checkout's `.git` is the single object store for every worktree; GitHub is the only real backup.** 2026-09-02 the primary was deleted by a hygiene script whose
keep-list used `/c/Users/...` paths while `git worktree list` prints `C:/Users/...`, so nothing matched and `rm -rf` fell through (LESSONS F12, incident 5). Lost for good:
root `.env`, `apps/api/.env`, `.claude/settings.json` local hooks, reflogs, stashes. Recovery trick that is reusable: GitHub serves deleted commits by SHA (`gh api
repos/strale-io/strale/commits/<sha>`) and `gh api repos/strale-io/strale/git/refs -f ref=refs/heads/<name> -f sha=<sha>` re-pins them (28 tips pinned as
`rescue/2026-09-02/*`). Capture `git worktree list` early in a session. A branch that exists only locally has no backup. The GitHub events feed (`gh api repos/<o>/<r>/events`)
silently drops events (no `DeleteEvent` for branches deleted after 20:08Z); use `git ls-remote` plus `gh api .../branches` to establish presence, say `unverified:` otherwise.

**The one-batch handoff gate is unsatisfiable while other sessions are live; never delete or baseline their worktrees to silence it.** `npm run handoff:check` counts
clone-wide. Three recorded recurrences (2026-09-04, 09-05, 10-30). Establish liveness with evidence: `find <wt> -not -path "*/node_modules/*" -not -path "*/.git/*" -type f
-newermt '-5 minutes' | wc -l` plus `git -C <wt> status --porcelain`; a ticking `lastActivityAt` is not proof of life and a stale-looking session is not proof of death (the
10-30 morning session showed `isRunning: true` while its tokens were reportedly out, and was in fact writing 61 files in 30 minutes). Identify the owner via
`mcp__ccd_session_mgmt__list_sessions` (by `cwd`, `isRunning`) and `send_message`, then ask. Baselining writes transient paths into a register meaning "founder decision, never
deleted by a session". Stop-hook ceiling is six blocks. Stale merged *branch refs* are a separate, safe case: delete with `git branch -d` only if `git merge-base --is-ancestor
<b> origin/main`, it is checked out in no worktree, and absent from `git ls-remote --heads origin <b>`. Structural gap still open: a review checkout at the head of an open PR
counts against the budget.

**Agents launched with `isolation: "worktree"` can still run in the trunk.** 2026-09-11 a re-reviewer ran `git checkout --detach origin/<branch>` and `npm ci` in
`C:\Users\pette\Projects\strale`. Every worker/ reviewer brief starts: "Run `pwd`; it must be under `.claude/worktrees/agent-`. Never `cd` to, or pass `-C` for, the trunk; if
`pwd` is the trunk, stop and report." After a worker finishes, check `git worktree list`.

**A worker's "waiting" notice is not done.** A task-notification fires whenever a subagent stops with no live background children. 2026-09-11 the PR #638 worker notified with
"I'll stop checking manually and wait for the notification" and edits staged; it later committed and pushed. Do not edit its worktree, push its branch or edit its PR until the
final report or a confirmed stop.

**Dispose of worktrees in the right order.** `git worktree remove` fails with `Directory not empty` after an in-worktree `npm install` (node_modules untracked) yet still
deregisters it and reports exit 0; a second `--force` then says "not a working tree". Delete `node_modules` (root and `apps/api`) first, then `git worktree remove --force`,
`git worktree prune`, `git worktree list`. Read where junctions POINT (`cmd //c "dir /AL /S"`) before any `rm -rf`. Moving `node_modules` between worktrees breaks workspace
links (they are absolute; `npm install` in the destination relinks in ~a minute; `npm --workspace=packages/ mcp-server run build` does not fix it).

**Never chain destructive steps with `;`, and never put anything after a heredoc in a `&&` chain.** 2026-09-02 `python edit.py && cd worktree && git add ... ; git push ...`
pushed from the trunk when the first step failed; a `git commit -F - <<'EOF'` heredoc ended the `&&` chain so a following `git push`/`gh pr create` ran after `programs:check`
failed. One chain, `&&` only; a heredoc can only be last; use `-F path` for multi-line messages or a `set -euo pipefail` script file.

**Never type `--no-verify` (or `-n`) in any git command, even labelled "not used".** 2026-09-10 (PR #629) a status command containing `git commit ... --no-verify`, echoed as
"(not used)", ran and committed past the handoff gate; undone with `git reset --soft` before any push. When a hook refuses, read the finding and fix the cause (usually merge
`origin/main`).

**Gate cleanup only on `MERGED`.** 2026-09-04 a "merge if green then clean up" chain deleted the remote branch of OPEN PR #499: `gh pr checks` returned empty output, `! grep
-qE "pending|fail"` read empty as green, and `gh pr merge` failed (branch behind main) but cleanup ran anyway. Require a non-empty all-`pass` check list and `mergeable ==
MERGEABLE` before merging; gate every cleanup step on `gh pr view <n> --json state --jq .state` = `MERGED`. Recovery if a branch is deleted: `git cat-file -e <sha>`, recreate
from the sha, push. `gh pr merge` refuses "head branch is not up to date" -> `gh pr update-branch <n>`, wait for CI.

**Repo auto-merge is enabled (2026-09-04), `delete_branch_on_merge` is true.** After the independent review PASSes and findings are pushed: `gh pr merge <n> --auto --squash`.
A failed flaky job blocks auto-merge silently; when a PR sits BLOCKED longer than one CI cycle run `gh pr checks` and `gh run rerun --failed` (known flake
`codex-backlog.test.mjs` ENOTEMPTY teardown race). Verified 2026-10-31: `gh api repos/strale-io/strale --jq .allow_auto_merge` returns true.

**Verify against `origin/main`, then against open PRs.** 2026-05-13 a "did #89 ship" report was produced from a worktree on a stale feature branch and labelled "partially
executed" when the deletion had fully shipped. Compare `git rev-parse HEAD` and `origin/main`; `git log --oneline HEAD..origin/main -- <path>`. Also `gh pr list --state open
--json number,headRefName` and `gh pr diff <n> --name-only | grep <file>`: a change absent from tree and main can sit in an open sibling PR (2026-08-12, #171). The shared
checkout parks on stale branches repeatedly (recurred 2026-08-30, 75 commits behind main, with uncommitted work): read authority docs with `git show main:<path>`, run scripts
from a worktree at `origin/main`, never `git checkout` in the primary tree. GitHub squash-merges, so merged branches report "N ahead" forever; compare file contents against
`origin/main`, not commit counts; and when triaging branch dates use `%ct` epoch (local `+02:00` strings vs `gh` `Z` strings mis-compared seven merged branches).

**Never use `git checkout --`/`git restore` on files with uncommitted pre-session changes.** 2026-04-17 it destroyed a graceful-degradation wrapper in `do.ts`. Unstage with
`git restore --staged`. Mutation-testing loops that restore with `git checkout HEAD --` also destroy uncommitted work in the same files (2026-08-29, #428): commit first, or
invert the specific mutation. (Covered by LESSONS F11; kept for the commands.)

**Commit gate: run `context:generate` twice after `archive:index`, and merge main first.** 2026-09-04 (PR #518, ~40 min lost). Recipe: `npm run archive:index` ->
`context:generate` -> `context:generate` -> `node scripts/check-project-context.mjs --json` shows `findings: []` -> `git add -A` -> commit. `DECISION_ROW_REMOVED
docs/project/m2-closure-register.yaml` in pre-commit means main moved, not that you removed a row (the gate compares against `origin/main`): merge `origin/main` first; with
uncommitted work `git merge` refuses on overlapping generated files, so save a patch excluding `archive/README.md`, `handoff/README.md`,
`docs/project/legacy-authority-inventory.json`, `git reset --hard`, merge, `git apply --3way`, regenerate. Related: editing any inventory target (AGENTS.md, CLAUDE.md,
`.claude/*`, `docs/company`, `docs/strategy`, `docs/remediation`, `handoff/`) needs `context:generate` in the same commit (the generator refuses the shared primary worktree
via `assertIsolatedWorktree`); adding any file under `archive/` or `handoff/` needs `npm run archive:index`; both register validators (`programs:check`, `context:generate`)
read the **git index**, so `git add -A` first (new resume/handoff files fail as `UNTRACKED` otherwise); a new track needs an entry (with reason) in `TRACKS_OUTSIDE_M2_GATE` in
`scripts/m2-closure-register-lib.mjs`; a new decision record needs a closure-register row and the Notion Decisions DB entry first.

**Tests that compare against the merge-base pass on the branch and fail on `main` after merge.** 2026-09-10 PR #627 added the first `closing_review` block; three fixture tests
that read the live base (`context.base` in `scripts/m2-closure-register.test.mjs`) failed on `main` and broke CI for every PR. When a PR is the first to add a register block a
validator compares to the base, run the suite against a simulated post-merge base, and run the suite on `main` straight after merging.

**A policy change must reach the code that enforces it.** DEC-20260910-A retired the Codex backlog row but `scripts/m2-closure-register-lib.mjs` still required a Codex row
behind a Claude closing review (`CLOSING_REVIEW_ROUTE_MISMATCH`). Grep the finding code, field name and a phrase from the old rule across `scripts/`, tests and the docs
describing the mechanism before editing data.

**M2 closure-register traps (M2 closed 2026-09-10; scripts still run in `context:test`).** `PLAN_STATEMENT_PATTERNS` treats `- Next:`, `- Next M2 batches:`, `- The next
milestone is` and a bold `Next bounded task:` line in `docs/strategy/2026-08-31-repo-native-operating-model-migration.md` as forward work statements; a new such line raises
`PLAN_STATEMENT_UNRECONCILED` and reconciling it makes `CLOSING_REVIEW_STALE`. Point checkpoints at the track's `next_action` instead; rewording to dodge the scan was ruled
evasion (PR #632). `digests.public_rows.scope_date_digest` binds the public rows' (page_id, scope, date) triples and moves with every private-to-public batch; only
`scripts/m2-closure-verify-private-rows.mjs` (operator, needs the export) checks it. `scripts/m2-quote-fidelity.mjs` accepts `CLAUDE.md`/`AGENTS.md` as a source for every span
and skips quotes under 25 characters unless `--min-chars 12`. The raw Notion export is JSON-in-JSON: parse it (never regex-slice), select by `PAGE:<32-hex id>`. Quotes in
records must be verified byte-for-byte by script; sampling reviews do not converge on a large corpus: declare the comparison convention, run one exhaustive sweep, withdraw
confirmed findings in one amending record, then run the closing round. Reviewers re-report statements an amending record already withdrew: list the withdrawn items with line
numbers in the prompt and rerun the partition with a fresh reviewer rather than overriding the verdict.

**Read-only CI-step gotchas for fact registers.** After merging main into a register PR, re-derive the facts from what landed: #634 (`config/vendors.yaml`) said four vendors
`active` after #633 switched them off, and `vendors:check` stayed green because it compared names and `retired` flags only; an extractor must fail on an unrecognised shape,
never skip it; a surface's label is not evidence of use (`openownership` marked `active` from a coverage-matrix label its executor never calls); check the host the executor
calls.

---

## 7. CI and checks

**Run the whole CI `check` job locally in one non-aborting pass.** It is ~47 steps under `bash -e` and stops at the first failure, hiding the rest (2026-09-05: three pushes,
each fixing the one gate CI surfaced: `lint:no-unguarded-user-fetch`, `check-cost-class-coherence`, `generate-archive-index --check`). Extract the commands with `awk '/^
check:/{f=1} f && /^  [a-z-]+:/ && !/^  check:/{f=0} f' .github/workflows/ci.yml | grep -E "^\s+(- )?run: " | sed 's/^\s*- run: //;s/^\s*run: //'`. Derive the list every time
(a hand-kept runner fell behind twice; main adds `vendors:*`, `scheduled:*`, `distribution:*`, `candidates:test`) and merge `origin/main` first. Local-vs-CI disagreements:
`npm run typecheck` fails on a phantom missing module until `packages/mcp-server` and `packages/sdk-typescript` are built (CI builds them as steps 1-2); generated files need
`context:generate` and `archive:index` re-run after adding receipts, handoffs or manifests. Also in CI: `guard-production-write- access.mjs` refuses any textual reference to
the production write credential's variable name outside an argued allowlist, markdown included (`handoff/` exempt, `docs/company/LESSONS.md` not): name it in prose.

**Ask for `npm run typecheck` at the repository root, never "typecheck in apps/api".** `apps/api` has two TypeScript projects (`typecheck` over `src`, `typecheck:scripts` via
`tsconfig.scripts.json` over `apps/api/scripts` and `apps/api/test`); the root chain runs both plus packages. 2026-09-13 M4 batch 6 failed CI on `typecheck:scripts` after two
agents ran `npx tsc --noEmit` in `apps/api` (`check-vendor-roster-drift.ts` was the first checked TS file importing a root `scripts/*.mjs`). Fix an untyped `.mjs` import with
a narrow hand-authored `.d.mts` beside it, proved by planting a wrong signature.

**Local `npm test` is flaky on this PC; CI is the gate.** 2026-09-03 at `fadc8052` (CI green) the worktree failed 16 files/24 tests and the primary 15 files/22 tests,
overlapping but not equal, mostly `Test timed out in 5000ms` (vitest import 729 s against 194 s wall). Discriminator: run the same suite in a second checkout; a real
regression fails the same files, starvation shifts. `npx vitest run --root .` is not what CI runs (`npm test` = `npm run test --workspace=apps/api`); `tsc --noEmit -p
apps/api` shows four phantom `routes/mcp.ts` errors until `npm --workspace=packages/mcp-server run build` has run.

**`gh run watch --exit-status` can exit 0 on a failed inner step.** 2026-05-13 the watcher returned 0 while deploy-health `verify-deploy` exited 2. Re-verify with `gh run view
<id> --json conclusion,status` or `gh pr checks`; for deploy-health `curl` the prod URL and grep for the SHA marker.

**A monitor whose loop pipes through bare `jq` is silently hollow where `jq` is absent** (it is not on this PC; `gh --jq` embeds its own). Zero events and exit 0 read as
"still running" (two 25-minute waits, 2026-09-05, PR #564). Extract JSON with `gh ... --jq` or `node -e`, prove a watch can speak by running one iteration in the foreground,
and never treat silence as state.

**Gates can be hollow; plant the failure before trusting a checker.** (LESSONS F5 holds the families; the concrete cases:) the AuditRecord shape check 404'd on its
private-repo checkout every run and `continue-on-error` swallowed it; the dispatcher-bypass lint matched only static imports in `.ts`; `test_mode='canary'` was dispatched
identically to `live`; 2026-09-02 the design hex lint skipped colours followed by `;`, the promotion gate accepted a value change when an unrelated surface's decision id
changed, the claims matcher treated `/pattern/` rows as literal text. A positive smoke test is not evidence.

**Prose scanners must match paragraph-joined text.** A fact split across a soft wrap is invisible to a per-line regex: reviewers failed PRs on 2026-09-11 for bare counts ("20
pass", "(104 tests)") the author's line scan reported as zero, and `scanMutableFacts` in `scripts/entrypoint-parity-lib.mjs` missed `DEC-...:` followed by its summary on the
next line (2026-09-13). Join paragraphs (keep fenced code and table rows unjoined) before matching a number followed by test/pass/fail/file(s) scanned/violation(s)/rows.

**Comments are not evidence of behaviour; grep the callers.** 2026-09-04 a 2026-05 test-header comment said the frontend's `isSQSUnqualified` hides Unverified capabilities;
the function had zero callers and strale.dev listed them dimmed with an "Awaiting traffic" badge. It passed a worker, a reviewer and a founder decision. Reviewer briefs say
"confirm callers, not existence".

**Enumerate every reader, not the trail you followed** (see section 3, visibility) and **a fact register needs the record keeper's join** (section 6).

**CF Pages picks the build tool by lockfile; bun outranks npm.** If several lockfiles are committed (`package-lock.json`, `bun.lockb`, `bun.lock`, `yarn.lock`,
`pnpm-lock.yaml`) CF Pages ran `bun install --frozen-lockfile` against a stale `bun.lockb` and failed instantly (strale-frontend PR #9, 2026-05-13; prod stayed on the old
bundle ~16 min until the deploy-health monitor caught it; fixed PR #10 by deleting the bun lockfiles). Delete unused-tool lockfiles rather than keeping them in sync. Relevant
to `apps/web` on CF Pages (DEC-20260902-A).

---

## 8. Distribution and publishing

**npm publishes via trusted publishing (OIDC); no long-lived npm token exists anywhere (accepted 2026-08-22).** Release = bump version in a PR, merge, push tag
`<package-name>@<version>`, which triggers `.github/workflows/release-npm.yml` and pauses for a required reviewer in the `npm-release` GitHub environment. Load-bearing
details: no `registry-url:` on `actions/setup-node` (it writes an empty `_authToken`, the OIDC exchange never happens, `ENEEDAUTH`); Node 22 (npm needs >= 11.5.1 and Node >=
22.14.0; npm 11 installs on Node 20 and fails only at publish); workflow filename/path are part of the npm-side trust config. npm 2FA is `auth-and-writes`: every `npm
trust`/`npm token` operation needs a fresh OTP and redacts the auth URL off a TTY, so Claude cannot run them; Petter pastes results. Verify by artifact: `_npmUser` reads
`GitHub Actions`, provenance names repo/workflow/tag/commit. (Procedure also in `docs/release/npm-publishing.md`; the standing D1 blocker is npmjs.com trusted-publisher
entries, Petter's.)

**Distribution packages and constraints.** Published: `strale-mcp`, `straleio` (npm TS SDK, also PyPI `straleio` Python SDK), `straleio-langchain`, `strale-semantic-kernel`,
`strale-capabilities`, `langchain-strale` (PyPI), `crewai-strale` (PyPI), more since 2026-10 (see `packages/`). `@strale` npm scope does not exist (use unscoped names); the
npm name `strale` was rejected as too close to `stable`; CrewAI needs Python <= 3.13 (no numpy wheels for 3.14). MCP HTTP is `POST /mcp`, stateless (fresh `McpServer` per
POST), GET/DELETE return 400, 60 req/min per IP, catalogue cached 10 min; A2A card `GET /.well-known/agent-card.json` (dynamic, 1 h cache), `POST /a2a` JSON-RPC
`message/send`/`tasks/get`, 60/min per IP, query-length-capped (PR #228). `strale_search` needs no auth on MCP HTTP. Shared tool registration is
`packages/mcp-server/src/tools.ts`. `STRALE_CLIENT_ID` was a hand-maintained literal (`strale-mcp/0.2.6` while 0.2.7 was live, mislabelling attribution); now derived from
`package.json`.

**Two GitHub accounts.** `gh` CLI = `petterlindstrom79` (id 254885705, the `strale-io` org member; every session PR/comment runs as it); browser = `petterlindstrom` (id
43839893, created 2018). 2026-08-14 the Glama MCP claim silently failed because `glama.json` listed only the CLI account; both usernames now listed (PR #207). For any
third-party service verifying GitHub identity through Petter's browser, list/authorise both.

**Fine-grained GitHub PATs may need regenerate-and-rotate after a permission edit.** 2026-05-11 the `strale-digest` PAT (`github_pat_...`) kept returning 403 "Resource not
accessible by personal access token" after Issues: Read+write was added in the UI; regenerating (new suffix) and re-pasting into Railway fixed it (~30 min lost). Classic
`ghp_` PATs edit in place.

**Post-publish production smoke test is non-negotiable and record observed values.** Procedure in CLAUDE.md step 6 and `docs/release/npm-publishing.md`; the case study is the
MCP trust incident in section 1.

---

## 9. Access, accounts and credentials

**`STRALE_API_KEY` in the root `.env` is dead.** 2026-08-25: prefix `sk_live_babb73df`; `SELECT COUNT(*) FROM users WHERE key_prefix = 'sk_live_babb73df'` = 0; a live call
returns `{"error_code":"unauthorized", "message":"Invalid API key."}`. The test account `test2@strale.io` (user id `2e3d9f92-2301-48f8-96cf-cab285451c70`) has `key_prefix`
`sk_live_0d56f39c`; plaintext keys are not recoverable (hash only, `hashApiKey` = plain `sha256(key)` hex in `apps/api/src/lib/auth.ts`). Anything reading
`process.env.STRALE_API_KEY` fails on auth, not on what it tests; fixing it is a production write (key-recovery flow in `apps/api/src/routes/auth.ts`). Still dead on
2026-10-31 (the 10-31 handoff says the smoke key is x402-only). Check a suspected-leaked key by hashing locally and comparing to `users.api_key_hash`; never authenticate with
it.

**Six live `sk_live_` keys sat in public git history for 176 days; revoked 2026-08-22, history not retractable.** A Claude Code permission allowlist committed 2026-02-28
embedded credentials in pre-approved command strings; untracking `.claude` removed the tip, not history. Seven `sk_live_` keys plus an npm token were exposed; six still
authenticating were rotated (internal test/demo accounts, ~EUR 257 of wallet exposure). `apps/api/scripts/check-no-committed-secrets.mjs` (PR #363) now fails CI. Do not be
alarmed to find the dead values.

**What exists only on Petter's PC (Railway, mail, Notion, `.env`).** `railway` CLI is installed and authenticated as petter@strale.io (project Strale, env production, service
strale); it is an npm shim: call from bash and pipe JSON to a file (Node `execFileSync` cannot spawn the `.cmd`). Root `.env` and `apps/api/.env` hold 50 names; both were
rebuilt 2026-09-02 from `railway variables --json` (strale service) plus the Postgres service's `DATABASE_PUBLIC_URL`; Stripe live keys deliberately not copied. A cloud
session has none of it: the full list with what a cloud session can get from Bitwarden is `handoff/_general/from-code/2026-10-31-h3-verification-and-pc-only-inventory.md` (the
one hard blocker for production verification is the read-only DB credential in Bitwarden; `strale_verify` is the intended narrower credential).

**Legal entity: Moonlighter AB, Swedish org number 5593957979** (confirmed 2026-08-13 on the JustizOnline IWG application). Use for vendor applications and registry credential
requests; official correspondence from `petter@strale.io`. **Mail domain is `strale.io`, never `strale.dev`** (the website is `strale.dev`); past output wrote
`hello@stripe.io` and `petter@strale.dev` by mistake; default demo email `hello@strale.io`.

**Memory backup.** The PC-local memory folder and `C:\Users\pette\.claude\CLAUDE.md` are backed up only to the private repo `strale-io/strale-context-archive`, folder
`claude-memory/` (first snapshot 2026-10-26; the local clone `C:\Users\pette\Projects\strale-context-archive` had an unpushed commit and was 24 behind, so clone fresh into a
scratchpad and run its `scripts/scan-archive-secrets.mjs` before pushing). Refresh before a planned account switch. Anything every agent needs belongs in the public repo.

**Handoff on `.codex` and Codex tooling.** `~/.codex/config.toml` `notify` chains Strale's `scripts/handoff/codex-notify.mjs` -> Tilja's `tools/handoff/codex-notify.mjs` ->
the original notifier; Codex 0.147 (installed 2026-09-02) has a Claude-compatible hooks engine (`.codex/hooks.json`, feature flag `[features] codex_hooks = true`); its notify
payload carries `cwd` and `thread-id`. Reported as "configured, unverified" until a first Codex turn writes `.claude/state/handoff/last-codex.json` and a dirty-tree Stop
blocks (track T3). The binary-scanning method used to verify this is PC-specific (section 14).

---

## 10. Working agreements with the founder

**Marketing copy is confident, not hedged (Petter, 2026-10-25).** "i do not want language that is overly conservative or language that doesnt belong on a marketing page."
After a review flagged overclaims I loaded the homepage with defensive caveats; he rejected it. Choose claims that are true and strong; put precision (limits, methodology,
test modes, units) on tool pages, docs and the security page; if a sentence only protects against a misreading, rewrite the claim. `docs/company/claims.yaml` still applies.

**No fixed costs before recurring revenue (Petter, 2026-10-23).** "i'm generally not fond of signing up for services that cost money on a running basis (e.g. upfront costs or
monthly fixed costs) before we have grown our own recurring revenue." Prefer free official APIs and pure per-call pricing; subscriptions, minimums and fixed monthly fees are
non-starters even inside the weekly envelope (KVK EUR 6.40/month and the Cobalt subscription deferred on this ground, 2026-10-23 portfolio plan).

**But do not drop a paid vendor that backs a critical-path product.** 2026-05-08 I built a full Serper-to-Brave swap (web-search lib, 5 capability edits, STATIC_FACTS, drift
sweep, migration block, test, full vendor-switch checklist) for a USD 50/month top-up before Petter noticed `adverse-media-check` is load-bearing; all reverted. Before any
swap-to-free work, ask which capabilities sit on a critical path and whether the vendor is the only fallback in a compliance or payments path; Petter wants pushback, not
agreement-by-default. Counterparty-assurance-era note: Brave's narrower index plus keyword classification did not meet DEC-20260428-B.

**Reactive vendor management at solo-founder stage.** 2026-04-29 I recommended proactively approaching Dilisense for a Basic tier and DPA; Petter declined (verbal grace
already granted, <100 calls/mo gives no leverage, outreach puts Strale on the upgrade radar, DPA gap theoretical until a customer asks). Outreach only on a real trigger
(monthly bill over a defined threshold, a regulated customer asks for a DPA, vendor initiates, quality incident, or an explicitly time-bounded grace). Save vendor agreements
and correspondence so we know what we are signing when a trigger fires.

**Cross-reference Decisions before canonicalising vendors.** 2026-04-30 DEC-20260430-A copied the Vendor Roster row for OpenSanctions ("Self-built, planned migration target")
although DEC-20260429-A had deferred it a day earlier on a CC-BY-NonCommercial licensing finding; Petter caught it. Before any canonicalising DEC, read the last ~7 days of
decisions and anything naming a vendor in it; decisions beat the roster, which beats consumer pages. (The roster is now `config/vendors.yaml`; the Notion Decisions DB is still
authoritative until the M4 cutover.)

**Routing: I am architect, orchestrator and reviewer; cheaper models do implementation (Petter 2026-09-02 and 09-03: "You are the orchestrator. Please use cheaper models
wherever it is possible, and then you verify").** Always pass `model` explicitly on Agent launches (the enforcing hook is gone). Implementation agents get `isolation:
"worktree"`; the independent read-only review is another agent; agents never touch `docs/programs/*/tracks.yaml` or PROGRAM.md (the orchestrator updates the register at
merge); anything that writes to a private repo, production or a founder surface stays with the orchestrator; verify counts by planting failures rather than trusting an agent's
numbers (three of my own were wrong in one day). Note the 2026-10-30 orchestrator checkpoint describes Codex CLI as the builder and a separate read-only Claude reviewer; see
section 12.

**Merge own PRs after independent review plus green CI; pause only on findings.** Petter, 2026-05-03. Does not apply to PRs touching shared external surfaces without Petter
approval (distribution PRs, vendor decisions, catalogue edits with policy implications), draft PRs, or PRs failing review beyond nits. Never force-push, never bypass branch
protection, never skip hooks. (DEC-20260815-A in CLAUDE.md since widened this.)

**M4 cutover merge was delegated 2026-09-11** ("merge the pr when you think the code is in a solid state"), conditional on every batch in
`archive/sessions/2026-09-11-m4-cutover-inventory.md` section 7 having merged into `m4/cutover` after independent review, green CI and a fresh whole-PR review returning PASS;
squash as one revertible unit and tell him in plain English; Notion-key removal from Railway and the GitHub Notion secret and freezing the workspace stay his. Superseded in
part: see section 12.

**Notion to-dos are archived without asking (Petter, 2026-05-03).** Mark Done and move to Archive > Completed To-dos (page `34067c87-082c-814e-a45c-fa8d851c8f12`) in one pass;
archive moves are not deletions. Handoff file and Notion Journal entry are written by me at every session end (Petter, 2026-04-27); Decisions DB entries still need his
approval.

**CTO authority on critical infra (2026-04-29):** decide and communicate, do not return question lists (superseded and widened by DEC-20260815-A in CLAUDE.md; global
supersessions still need confirmation).

---

## 11. Other projects (idea-lab) — one line each

**Idea-lab founder decisions 2026-08-09 (do not re-propose).** Out of scope: verticals shaped as physical-world operations, community/event operations or white-glove agency
delivery (immersion skips them as scope-skips, never kills). Declined: false-negative tracking, the graveyard appeals court, and the demand-probe rung R3 (ladder stays R0-R2
desk evidence only; no-outreach and no-waitlist rules stand). **Reddit OAuth is a permanent dead end (2026-08-09):** no consumer reads
`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, and Reddit closed self-service app registration (2-4 week manual review, free tier non-commercial only, commercial reportedly ~USD
12k/yr). Reachable complaint venues: HN Algolia, Discourse, GitHub issues. Records: idea-lab `docs/RESEARCH-ACCESS.md`, `studio/GENERATION-METHODS.md` section G8,
`digests/2026-08-09.md`. **`model-os` was discarded and removed 2026-08-16** from strale plus 11 other checkouts (no `calibre:` lines, step-0 declarations, `dispatch.mjs`);
`C:\Users\pette\Projects\wow-core` stays (Petter, 2026-08-18; never propose deleting it; if model-os hooks reappear they were re-synced from wow-core, remove the sync).

---

## 12. Known stale or contradicted in the source memory (read before trusting)

Checked against the repository at `f9e2496c` on 2026-10-31.

1. **Free-tier limit.** `MEMORY.md` says "10/day per IP". `STATIC_FACTS.free_tier_monthly_limit` in `apps/api/src/lib/platform-facts.ts` is 300 and CLAUDE.md says per IP per
   calendar month (UTC). Use the repo.
2. **`capability_health`.** Entries (prod DB access, prod sweep) use the old name. Renamed `source_health` (block 0134, 2026-10-29); the compat view was dropped by block 0141.
   `sqs_daily_snapshot` and the SQS columns are also gone (block 0132).
3. **Browserless "free plan, ~1,000 units/month, 403 since 08-26" (vendor_cost_facts, 2026-08-30).** Contradicted by DQ-31 (resolved 2026-09-11): production uses a self-hosted
   v1 container and the 403s were the `BROWSERLESS_API_KEY` overwrite from 2026-08-25, not SaaS quota. The "$25/mo upgrade" discussion is moot.
4. **Serper burn and balance.** Memory says ~470/mo. `DECISION-QUEUE.md` says 46,890 of 50,000 left on 2026-10-28 and the 10-31 handoff says ~3,100 left after the goto-link
   incident; expiry 2026-11-08 is consistent. Use the repo figure; the goto-link breakage (positions 4+ are `google.com/goto?url=` links) is a live defect across eight
   Serper-backed capabilities.
5. **`eth_getLogs` on Base.** Memory says capped at 10,000 blocks/request; the 2026-10-30 checkpoint says the public Base RPC refuses it outright. Use x402scan or
   Alchemy-on-Base (not enabled).
6. **`strale_ro` size.** Memory says SELECT on 41 tables; audit 2026-10-31 found 48 public tables readable.
7. **CLAUDE.md "project: desirable-serenity"** is stale (project is `Strale`, id above). CLAUDE.md's hosting line now says US East, so the older "CLAUDE.md says EU region"
   complaint is resolved.
8. **M4 cutover merge delegation.** Memory says delegated to Claude (2026-09-11). `docs/programs/cto-readiness/ tracks.yaml` T7 `next_action` still says "the cutover merge
   itself stays his yes or no", and its comment says DEC-20261024-A re-scoped T7 and "Petter to confirm the change to his 2026-09-11 merge delegation". Treat the delegation as
   unconfirmed until Petter says so.
9. **Registry coverage snapshot (2026-05-07)** predates AT (now direct Firmenbuch API), DE (OpenRegister credits exhausted), the DEC-20261023-A data-access rule (supersedes
   the Tier-1/Tier-2 scraping doctrine the source `feedback_no_tos_violating_scraping` still describes), and the many deactivations since.
10. **Review routing.** Memory says Sonnet agents implement and a read-only reviewer verifies, and records the Codex stdin quirk. CLAUDE.md now says same-provider independent
    review is sufficient (2026-09-07), Codex backlog waived (DEC-20260910-A), and the orchestrator checkpoint describes Codex builds with a Claude reviewer. Routing is
    whatever the current founder instruction says.
11. **`project_pricing_selects_icp`** (EUR 3.50 counterparty assurance) is superseded by DEC-20260812-A; only the mechanism (price implicitly selects the ICP) survives. Not
    carried over.
12. **Dilisense "reseller" facts and the OpenSanctions-self-host framing** are 2026-04 positions; check `config/vendors.yaml` and the current DECs before quoting.
13. **`WORKTREES.md`** describes `strale-wt-<track>` siblings of the trunk; current sessions run under `.claude/worktrees/<name>` and the 10-31 `strale-wt-checkin-1031`
    remnant ("Filename too long") shows dated paths are the working convention.

---

## 13. Dropped as already covered (where it lives instead)

- Shared checkout, `git stash`, `rm -rf` on worktree-list output: CLAUDE.md "Shared-Checkout Rule" and "Worktree node_modules Hazard", `WORKTREES.md`,
  `docs/company/LESSONS.md` F11/F12.
- Post-publish smoke test and Distribution PR Integrity: CLAUDE.md protocols, `docs/release/npm-publishing.md`.
- Hollow tests/gates families, planting failures: `LESSONS.md` F5, `REVIEW.md` "Tests discriminate".
- CTO authority and escalation: `docs/company/CHARTER.md`, DEC-20260815-A. Platform scope: DEC-20261023-B.
- Swedish local times: top of CLAUDE.md. Code-review gate before `/end-session`: CLAUDE.md checklists and the `/go` skill. Accounts, Bitwarden and email procedure:
  `docs/operations/accounts-and-email.md`.
- Stripe/x402 architecture detail present in code comments and `docs/operations/x402-facilitator-switch.md`.

---

## 14. Does not travel (PC-only; not written up)

- Windows Git Bash behaviours: long quoted heredocs collapse backslashes and choke on apostrophes (write scripts with a file tool); `/tmp` is Git Bash's temp, not `C:\tmp`;
  leading-slash arguments need `MSYS_NO_PATHCONV=1`; `git worktree remove` can fail with "Filename too long" and leave a remnant (dated paths; never `rm -rf` unattended);
  scratchpad analysis scripts need `.mts`, absolute `file://` imports and a hand-parsed `.env`; `Measurement.status` is `"observed"`; postgres-js timestamps are strings.
- `codex exec` in background Bash blocks forever on open stdin (append `< /dev/null`); scanning the Codex `.exe` for strings; `~/.codex/config.toml` layout.
- Memory-store housekeeping, `consolidate-memory`-style notes, and the memory-backup clone's local state.