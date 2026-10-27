Intent: Replace japanese-company-data's browser/LLM extraction with the official NTA Corporate Number Web-API v4; leave credential provisioning, production backfill and live verification to the orchestrator.

Built on feat/japan-official-corporate-api from main at 10f71df8. Prepared for a local commit, but staging failed because the worktree Git administrative directory is mounted read-only; no commit was created. No push, PR, merge, package publication, production database write or settings change. Round 2 has no application ID and makes no authenticated upstream call. Invoice T-number verification remains out of scope and needs the separate invoice-system ID.

Terms were fetched before implementation on 2026-10-27:

- API terms: https://www.houjin-bangou.nta.go.jp/webapi/riyokiyaku.html . Article 7 incorporates https://www.houjin-bangou.nta.go.jp/riyokiyaku/ , which adopts Public Data License 1.0 at https://www.digital.go.jp/resources/open_data/public_data_license_v1.0 . Its permission includes 「複製、公衆送信、翻訳・変形等の翻案等、自由に利用できます」 and 「商用利用も可能です。」 Commercial reuse and redistribution are permitted with source attribution and disclosure of processing. Third-party rights and logos are excluded.
- The API overview https://www.houjin-bangou.nta.go.jp/webapi/ contains the requested exact credit: 「このサービスは、国税庁法人番号システムのWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない」.
- Article 6's actual wording differs slightly: 「このサービスは、国税庁法人番号システムWeb-API 機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない」. The Article 6 variant, source URL and licence/Strale processing credit are included in output attribution and provenance; the overview variant is not emitted.
- Article 9 prohibits 「短時間における大量アクセスその他本機能の運用に支障を与えること」; Article 8 permits restricting concentrated traffic. No numeric request-per-time quota was found. The published request limits are ten corporate numbers, a 50-day difference window, and response splitting above 2,000 records. This implementation performs one per-entity/search request, stops on restrictions, and does not auto-page, retry or bulk crawl. The ID must not be disclosed or lent.

The executor uses /4/num (history=0) and /4/name (change=0, close=1), XML type=12, a 15-second fetch/body timeout, a 1 MiB body limit and a 50-record pre-DOM limit, honest Strale user agent and no redirects. It has no Browserless or LLM fallback. Missing NTA_HOUJIN_APP_ID returns the structured unavailable error; mandatory-credential gates return 503 capability_unavailable before /v1/do execution/transactions and before x402 payment. Scheduler credential checks skip this capability while the ID is unset. The static unauthenticated provider-root probe fetches no company data and consumes no lookup quota. Browserless and Anthropic dependency lists no longer include this slug. Shared body-reader cancellation logs are sanitised so an exception cannot print a credential-bearing URL.

Contract:

- corporate_number still accepts a number or literal company name; company_name and task aliases remain. Input is NFKC-normalised; T-prefixed numbers, full-width digits and one distinct 13-digit run in text resolve as number lookups. More than one distinct number is refused before a request. Empty/sub-two-character input and invalid corporate-number check digits fail before a request. Literal names are sent directly; natural-language company-name resolution is removed. Names resolve only to a unique exact, current, active match in a complete result set, including the single-result case. Other name matches return an Ambiguous refusal with candidates; more than 50 results require a corporate number. Japanese and registered English name targets are supported.
- Existing output keys remain: company_name, registration_number, business_type, address, registration_date, status, industry, directors. Names/addresses come directly from the register; business_type is the Japanese legal-form label. registration_date, industry and directors are null because the API does not establish incorporation dates, industries or officers. NTA's assignmentDate is separately exposed as assignment_date.
- Added assignment_date, last_updated, english_name, furigana, postal_code, process_code/description, close_date, close_reason_code/reason, successor_corporate_number, nullable search_excluded and attribution. Number-withdrawal records can omit names; English names and other optional fields remain nullable. Unknown legal-form/process codes are not guessed.
- Process 21 closes the record; reasons 01/11/31 map to dissolved, registrar/unspecified closure to closed. Closure fields take precedence over later corrections. Process 22 restores active even with stale closure fields (resource definition field 9, printed p.2; closure invalidated and register restored); 71 denotes the absorbing survivor and stays active. Process 81/99 maps inactive. Unknown process is unknown. The narrative consumer recognises closed, and the company-status normaliser preserves these distinctions.
- JP remains excluded from company-status-check pending live credential/status verification. Its exclusion reason now names that dependency. No country or solution is activated in this build. Direct references, website-to-company, narrative consumers and routing were inspected; historical migrations/repair planners and the generated package catalogue were not rewritten. Regenerate catalogue projections after production backfill; packages/strale-capabilities/capabilities.json still carries the old generated input/description projection.

Round-1 verification evidence: archive/receipts/2026-10-27-test-run-japan-official-api.json. Full command-by-command results and changed-file inventory: archive/sessions/2026-10-27-japan-official-api-verification.md.

Round 1, as recorded by the immutable receipt: 5,858 passed, 321 skipped, zero failed; 337 files passed, 31 skipped. The Japan executor suite recorded 55 passed tests. The receipt does not attest an aggregate count for the other focused suites. API typecheck and env:check, vendors:check, claims:check, docs:check, receipts:check, migrations:check and design:check are recorded as passed. Earlier unconfigured-env failures in the historical command log do not replace that final receipt. An earlier full run exposed an unchanged fixture-lifecycle timing race; it passed individually and in the final full run. Earlier implementation failures were fixed and rerun.

The official v4 revision 1.2 (October 2021) and April 2022 published XML sample archive define the fixtures. Exact published number and name files are retained; derived single-name/closure/empty-result fixtures are labelled as derived, with spec sections in their README. Toyota 1180301018771 and トヨタ自動車株式会社 were confirmed on NTA's official public record on 2026-10-27. The immutable round-1 receipt records a successful number lookup for 1180301018771 (active), an exact-name lookup to the same number, and an invalid check digit refused before a call. Round 2 made no authenticated API call and did not independently repeat or verify those recorded smoke outcomes. Actual English-name search behavior, optional-field population, real closure/status results, no-match header shape, latency and the new round-2 behavior remain for live confirmation. The smoke prints observed field names and raw-to-normalised status mappings, never the ID.

Production steps left:

1. Petter sets NTA_HOUJIN_APP_ID in Railway. After actual configuration is verified, the orchestrator updates config/env-manifest.yaml set_in to the observed location and regenerates examples. Rerun env:check and env:test after provisioning; the round-2 env:check passes the current register contract and does not prove runtime credential availability.
2. With the ID in its environment, the orchestrator runs `cd apps/api && npx tsx scripts/smoke-japan-corporate.ts` for one Toyota number lookup and one name search. Current unconfigured smoke output is exactly `{"error_code":"capability_unavailable","message":"Set NTA_HOUJIN_APP_ID before running the smoke check."}` and exit 1.
3. Under the existing production authority mechanism, run `cd apps/api && npx tsx scripts/onboard.ts --manifest ../../manifests/japanese-company-data.yaml --backfill --discover --fix --strict`. Review discovered field reliability and actual latency; retain nullable fields honestly. Do not override founder-owned fields or skip gates.
4. Run `cd apps/api && npx tsx scripts/validate-capability.ts --slug japanese-company-data` and `cd apps/api && npx tsx scripts/smoke-test.ts --slug japanese-company-data`; require ready:true with zero issues from `GET /v1/internal/onboarding/readiness?slug=japanese-company-data` using the normal authorised operator access. Verify the deployed capability's source/method/lane/attribution and closure mapping via the customer route; query GET /health/version for the deployed commit.
5. Run the disposable PostgreSQL integration CI job and regenerate any catalogue projections after backfill. Consider JP routing activation only after live verification; it is intentionally not included here. Qualified-invoice-issuer checks require the separate invoice-system ID.

Database validation and platform smoke could not run here: DATABASE_URL is absent. Even onboard --dry-run requested the production write authority before validating; no credential was sought and no write occurred. Offline validateManifest passed with zero errors. The disposable-DB guard refused because DATABASE_URL_TEST is unset; no schema push or migrations were attempted. Readiness is not claimed.

The original build notes record that the go review workflow ran with two independent same-provider contexts and two rounds: product GO; technical GO with a cancellation-log nit, subsequently fixed with log-visibility and no-secret regression coverage. No separate simplify skill exists in this checkout; an author simplification pass was performed. The orchestrator owns final review, push, PR and merge.

[BACKFILL] Journal/session filing and production verification belong to the orchestrator closeout. Session-end handoff:check is run against the uncommitted work; Git staging cannot create index.lock on the read-only administrative mount. Dirty/upstream/worktree findings cannot be resolved in this session: the mount denies Git writes, and the explicit build-agent instructions prohibit pushing or altering other worktrees. The original clean-tree mutation tool could not run. Round 2 instead compares the current tests with the two implementation files from f0172178 loaded through an in-memory Vite transform; no files or Git state are temporarily replaced. The observed comparison is recorded below.

Original build handoff:check exited 1: dirty (prepared changes cannot be committed on the read-only Git mount), ahead (feature branch still tracks origin/main), and merged-branch (an unrelated existing remote branch remains). Its fetch warning means remote findings may be stale. No push or remote deletion was attempted. The orchestrator must create the local commit after restoring Git write access; suggested message: `feat(japan): replace browser lookup with official NTA API`.

Orchestrator follow-up (2026-10-27): the live smoke ran against the official API with the real ID. A number lookup and an exact-name lookup both resolved Toyota (1180301018771, active), and an invalid check digit was refused before any call. Two changes came out of it. An exact name that only one open, current record carries now resolves; any other match is refused, with up to five candidates. The attribution now carries the Article 6 text verbatim, once, plus the content-licence credit. `NTA_HOUJIN_APP_ID` is optional in the env manifest: until it is set, the tool returns capability_unavailable before execution or settlement.


## Round 2

S1–S6 are implemented: counted source blocks, 60-second process cool-down,
four-request cap, exact/active/current/complete name selection, restored number
forms, pre-DOM 50-record/1 MiB bounds, actionable NTA CSV errors, process-22
restoration, and corrected attribution/evidence notes. Limits are per process;
they do not coordinate multiple deployed replicas.

Evidence: `archive/receipts/2026-10-27-test-run-japan-official-api-round-2.json`.
Focused tests: 84 passed. Against f0172178, 25 new tests plus two strengthened
body-limit tests fail, while 57 pass; no baseline timeouts. See the round-2
section of `archive/sessions/2026-10-27-japan-official-api-verification.md` for
per-item fixes, failure groups and every command/result.

No authenticated live call ran. An explicitly empty-ID smoke exited 1 before
fetching with capability_unavailable. Prior live results are only those recorded
in the immutable first receipt and the orchestrator follow-up above. The source
terms and PDF specifications were read without an application ID.

MCP-server build, API typecheck, offline manifest validation and all 18 CI lint
guards pass. Database validation and platform smoke still lack DATABASE_URL;
onboard --dry-run still requests unavailable production write authority.
Readiness is not claimed. The supplied independent GO covers f0172178; final
review and commit/push/merge of these uncommitted fixes belong to the orchestrator.
No new independent review or Journal write is claimed in this round.


Round-2 final full API vitest: 5,887 passed, 321 skipped, zero failures;
337 files passed, 31 skipped. The round-2 receipt above records these counts.
API typecheck and env:check, vendors:check, claims:check, docs:check,
receipts:check, migrations:check, models:check and programs:check pass.
All 18 CI lint commands pass, with the documented sibling-frontend comparison
skip and existing allowlist/warning results. No disposable-DB integration ran.


Round-2 `npm run handoff:check -- --json`: exit 1 with `dirty` (the eight paths
left uncommitted as instructed) and `merged-branch` (unrelated existing remote
branch; fetch failed, so the remote finding may be stale). No Git write was
attempted. The orchestrator owns commit and remote cleanup. Final docs:check,
receipts:check and git diff --check pass.
