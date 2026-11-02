Intent: Finish H1 production monitoring on `feat/production-watch`, retaining the interrupted implementation, testing it, and leaving all changes uncommitted for orchestrator review and shipping.

[BACKFILL] Session record for the orchestrator; no Notion write was made. No push, PR, merge, package publish, production database write, or production setting change was performed.

## Delivered

- `.github/workflows/deploy-verify.yml`: main-push check with a shared docs-only classifier extracted from CI; CI still runs every gate on main. Polling is in the unit-tested `scripts/production-watch/watch.mjs`. `/health.commit` is exactly 12 lowercase hexadecimal characters. Exact expected commits and verified descendants on current main pass. Workflow-level concurrency cancels older push checks, including classification, so an old slow classifier cannot cancel a newer verifier. The latest docs-only push still takes the explicit skip path; its cancelled predecessor is superseded, not reported as a timeout. The surviving code-push run checks the latest push. A still-running older check can accept the expected or a verified newer deployed ancestor of main, including intermediate deployments. No string ordering of SHAs.
- The deploy check polls every 30 seconds for 20 minutes, bounds every health/GitHub read to ten seconds or the remaining budget, and fails with one reusable `deploy-not-live` issue. Its diagnostics include `Strale - strale` state/description on the pushed SHA and the Railway email/deployment/status instructions. Recovery closes the issue. Permissions are only contents read, issues write and statuses read, with the default token.
- `GET /health/jobs`: an explicit four-field public allowlist, no errors, payloads, volumes, identities or money; no-store. Empty reads and database exceptions yield HTTP 503 with an empty inventory, which the outside probe rejects. Missing success evidence remains `ok: false` with null age. Freshness uses three times the declared interval. The shared JSON inventory makes missing/duplicate/malformed jobs fail externally.
- `.github/workflows/production-watch.yml`: two checks every 30 minutes, each with a ten-second HTTP deadline. Stable issues are keyed by signal/job id; the issue body stores a counter and run id. A first failure uses `production-watch-pending`; the second distinct failing run uses `production-watch` and fails the workflow. Re-running the same run never increments the counter. A successful observation resets it and closes the issue. Inaccessible inventories count as failure for every expected job, so earlier individual alarms do not silently retain an ambiguous state.
- `.github/workflows/package-contract.yml`: daily published-registry `npx -y strale-mcp@latest`, isolated from the workspace. It initializes MCP, lists tools and makes the free `strale_search` call, validates nonempty search results, checks all four startup counts against the public catalog, rejects other package diagnostics, and opens/reuses/closes `package-contract` on failure/recovery. Uses the release smoke procedure in `docs/release/npm-publishing.md`; no paid capability executes.
- `.github/workflows/scheduled-retry.yml`: trusted main checkout, same repository and main only, attempt one only. Preparation failures and startup/runner failures qualify only if no body ran in any job. A successful deploy-classification step is harmless but the deploy probe is a body. Scheduled/manual runs are supported; the existing coverage validation and new deploy verification also support their actual main-push trigger. PR runs, body failures, and second failures remain red. Only failed jobs are rerun.
- `docs/company/DAILY-RUN.md` now reads the three confirmed issue labels instead of comparing SHAs manually, retaining the existing brief format.

## Deploy budget evidence

The architecture review §2.1 records a local emitted-server boot at approximately 3.1 seconds, including migrations at 268 ms. It does **not** measure a typical full Railway checkout/install/build/deploy time. At about 13:30 Swedish time production still served `7935b242a0ac`, after `db27bef` was committed at 13:14. At 14:11 the later `28d11b2aeb0d` was live. Those observations bound the unnoticed incident; they are not a successful-deploy duration sample. The review proposes a 15-minute alarm. H1's requested 20-minute budget adds five minutes for build, queue and transient health/GitHub delay and still detects well inside the roughly 40-minute unnoticed interval. Treat 20 minutes as a chosen conservative budget, not a measured typical deploy. The workflow allows 23 minutes for setup and issue reporting around the strict 20-minute poll.

## Job inventory and evidence

Before H1, coordinated jobs recorded their latest finish/outcome in `job_schedule`, which could overwrite a prior success with a failure; auxiliary due slots recorded attempts, not success; the scheduler had durable heartbeat events; the digest already saved snapshots; short reconcilers and the hash worker had logs but no dedicated freshness clock. H1 keeps separate success-only heartbeat rows in the **existing** `job_schedule` table for coordinator jobs and auxiliary tasks. These rows are never registered or claimed as runnable jobs. No schema change or migration is required. Ordinary `job_schedule.last_outcome = ok` is deliberately not a reader fallback because caught failures can otherwise appear healthy.

| Stable job id | Expected interval (seconds) | Freshness source |
|---|---:|---|
| `quality-floor` | 86400 | Successful completed coordinator handler → `job_schedule.heartbeat:quality-floor` row, `last_finished_at` |
| `capability-promotion` | 86400 | Successful completed coordinator handler → `job_schedule.heartbeat:capability-promotion` row, `last_finished_at` |
| `db-retention` | 86400 | Successful completed coordinator handler → `job_schedule.heartbeat:db-retention` row, `last_finished_at` |
| `activation-drip` | 21600 | Successful completed coordinator handler → `job_schedule.heartbeat:activation-drip` row, `last_finished_at` |
| `invariant-checker` | 7200 | Successful completed coordinator handler → `job_schedule.heartbeat:invariant-checker` row, `last_finished_at` |
| `ingest-cy-directors` | 604800 | Successful completed coordinator handler → `job_schedule.heartbeat:ingest-cy-directors` row, `last_finished_at` |
| `ingest-ee-directors` | 86400 | Successful completed coordinator handler → `job_schedule.heartbeat:ingest-ee-directors` row, `last_finished_at` |
| `reindex-transactions` | 86400 | Successful completed coordinator handler → `job_schedule.heartbeat:reindex-transactions` row, `last_finished_at` |
| `x402-settlement-watch` | 3600 | Successful completed coordinator handler → `job_schedule.heartbeat:x402-settlement-watch` row, `last_finished_at` |
| `revenue-heartbeat` | 3600 | Successful completed coordinator handler → `job_schedule.heartbeat:revenue-heartbeat` row, `last_finished_at` |
| `vendor-control-tower` | 3600 | Successful completed coordinator handler → `job_schedule.heartbeat:vendor-control-tower` row, `last_finished_at` |
| `onboarding-retry` | 3600 | Successful completed coordinator handler → `job_schedule.heartbeat:onboarding-retry` row, `last_finished_at` |
| `chromium-probe` | 1800 | Completed scheduler auxiliary task → `job_schedule.heartbeat:chromium-probe` row, `last_finished_at` |
| `health-check` | 21600 | Completed scheduler auxiliary task → `job_schedule.heartbeat:health-check` row, `last_finished_at` |
| `meta-hourly` | 3600 | Completed scheduler auxiliary task → `job_schedule.heartbeat:meta-hourly` row, `last_finished_at` |
| `meta-daily` | 86400 | Completed scheduler auxiliary task → `job_schedule.heartbeat:meta-daily` row, `last_finished_at` |
| `diagnostics` | 86400 | Completed scheduler auxiliary task → `job_schedule.heartbeat:diagnostics` row, `last_finished_at` |
| `weekly-sweep` | 604800 | Completed scheduler auxiliary task → `job_schedule.heartbeat:weekly-sweep` row, `last_finished_at` |
| `retention` | 86400 | Completed scheduler auxiliary task → `job_schedule.heartbeat:retention` row, `last_finished_at` |
| `external-outage-digest` | 86400 | Completed scheduler auxiliary task → `job_schedule.heartbeat:external-outage-digest` row, `last_finished_at` |
| `job-coordinator` | 60 | In-memory loop progress and full-cycle completion |
| `test-scheduler` | 60 | In-memory successful tick/suite progress; durable `health_monitor_events` / `scheduler_heartbeat` |
| `reservation-reconciler` | 60 | In-memory completed acquired batch with `failed = 0`; includes an empty batch |
| `settlement-reconciler` | 60 | In-memory completed acquired batch with `failed = 0`; includes an empty batch |
| `integrity-hash-retry` | 30 | In-memory committed acquired batch with no row failures |
| `daily-digest` | 86400 | Existing `digest_snapshots.created_at`, written after send and snapshot success |

The coordinator observes handler outcomes and caught-failure context without changing leases, scheduling cadence, business logic or retry policy. Lock-skipped reconciler/hash ticks never refresh success. Empty acquired reconciliation batches do count as successfully completed work. Successful checks that find unhealthy dependencies or stale capabilities prove the checking job ran; caught execution errors do not. Meta-monitoring's `Check error:` and `Check failed:` results and empty check lists cannot refresh freshness. The scheduler's ordinary suite failures are findings, not a dead scheduler.

Startup does not fabricate freshness. Existing daily/weekly schedules may not produce their first new success-only row until their next real execution, so first scheduled runs can correctly report unknown jobs. Retain and investigate these alarms. The coordinator can exceed its three-minute freshness allowance during a legitimate handler bounded by its 15-minute watchdog; progress between handlers and two observations 30 minutes apart limit this to transient pending alarms in normal operation. Short-loop heartbeats are process-local and reset on restart; existing scheduler events and digest snapshots remain durable across restarts.

## DEC-20260504-C verification

Pre-merge reachability was read directly: `Dockerfile` copies `apps/api`, builds MCP then API with tsc, and runs `node apps/api/dist/index.js`. The new JSON contract is imported by TypeScript and emitted with the API. `index.ts` starts the job coordinator, test scheduler, integrity worker and both reconcilers; their imported modules now write heartbeats. `app.ts` imports and mounts the health-jobs router. The digest remains the existing separate Railway cron executable. Each new GitHub workflow checks out main and imports the named repository script through `actions/github-script`. Script tests parse all workflow YAML and verify the new schedule/import/call and permission wiring; `scheduled:check` also passed for its registered shell-invoked mechanisms.

After merge, the orchestrator must:

1. Observe the deploy-verification workflow pass for the merge SHA or a verified newer main SHA, and confirm recovery closes any existing deploy issue.
2. GET `https://api.strale.io/health/jobs`: HTTP 200, exactly the documented safe fields, all 26 expected ids present; inspect age/freshness rather than assuming a green startup.
3. Verify the first automatic Production watch and Published MCP contract scheduled runs occur and turn green after real success evidence exists. Investigate initial unknown daily/weekly rows; do not seed fake successes or close unresolved alarms. A daily/manual workflow run is not proof its cron fired.
4. Verify issue lifecycle and default-token status diagnostics in real Actions. No issue was created or workflow dispatched during this build session; those writes belong to the orchestrator's rollout.
5. On the first eligible preparation failure, verify `run_attempt = 2` and no third attempt. Real body failures must remain red. GitHub scheduled execution timing and failure email delivery cannot be proven locally.

No production SQL or credential setup command is required. Runtime heartbeat inserts occur only through the deployed jobs. No migration/ledger edit, new secret, Railway token or service was added.

## Verification

Evidence: `archive/receipts/2026-10-27-test-run-production-watch.json` (written via stdin after the checks).

Final API suite: 6,431 passed, 346 skipped; 348 files passed and 33 skipped (381 total). Final focused endpoint/heartbeat suite: 13 passed across two files. Monitoring script suite: 21 passed. TypeScript no-emit and all 57 root CI command results below passed. The skips include database-backed coverage unavailable without a test database; no live database credential was used.

The first unrestricted API run failed under parallel resource pressure: seven failing files (timeouts in auto-register-data-access, ssrf-bucket-c, image-resize, vendor-terms, admin-apply-migrations and no-sqs-keys; search-quality's two-second performance assertion). A complete two-worker rerun passed with 6,429 passed / 346 skipped before the final two meta-error assertions were added. No unrelated tests or thresholds were changed. The final two-worker suite result is the authoritative count in the receipt.

`actionlint` is unavailable; YAML parsing and GitHub-script JavaScript parsing ran in the monitoring test suite. The root install was supplied by the orchestrator (`npm ci` was already run), so it was not repeated. The MCP workspace build ran once, before typechecking. Every root CI command except reinstalling and the duplicate API wrapper was executed; the full suite ran through the API workspace instead.

The two independent read-only reviews ran for two rounds. No high finding remains. Fixed findings: lock-skipped success, unbounded deploy reads/status diagnostics, missing real MCP search, main-push retry scope, successful deploy classification blocking preparation retry. Coordinator freshness and honest first-success rollout behavior are documented above. No simplify skill exists in this checkout; a manual simplification pass extracted shared classification and caught-check handling and kept scheduling behavior unchanged.

The fail-before mutation helper requires a clean committed tree and restores from a commit, so it was not used on this explicitly uncommitted task. Discriminating tests cover stale/missing/duplicate inventories, field leak prevention, caught failures, lock skips, timeout/status issue contents, two-run state/recovery, startup degradation and retry-body refusal.

### Root CI command results

- `npm --workspace=packages/sdk-typescript run build`: PASS.
- `npm run typecheck`: PASS.
- `node apps/api/scripts/check-mjs-syntax.mjs`: PASS.
- `npm --workspace=apps/api run lint:no-bare-catch`: PASS.
- `npm --workspace=apps/api run lint:no-unguarded-user-fetch`: PASS.
- `node apps/api/scripts/check-ssrf-inventory.mjs`: PASS.
- `npm --workspace=apps/api run lint:no-new-console`: PASS.
- `node apps/api/scripts/check-no-external-column-access.mjs`: PASS.
- `node apps/api/scripts/check-framework-packages.mjs`: PASS.
- `npx tsx apps/api/scripts/check-ceo-brief.ts`: PASS.
- `node apps/api/scripts/check-no-committed-secrets.mjs`: PASS.
- `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs`: PASS.
- `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict`: PASS.
- `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict`: PASS.
- `node apps/api/scripts/check-pii.mjs --strict`: PASS.
- `node apps/api/scripts/check-tier-coverage.mjs --strict`: PASS.
- `node apps/api/scripts/check-identity-fixture-shape.mjs --strict`: PASS.
- `node apps/api/scripts/check-shape-contracts.mjs`: PASS.
- `node apps/api/scripts/check-cost-class-coherence.mjs`: PASS.
- `node scripts/guard-production-write-access.mjs`: PASS.
- `npm run programs:check`: PASS.
- `node --test scripts/production-watch/*.test.mjs`: PASS.
- `npm run programs:test`: PASS.
- `npm run research:check`: PASS.
- `npm run research:test`: PASS.
- `npm run design:check`: PASS.
- `npm run design:test`: PASS.
- `npm run env:check`: PASS.
- `npm run env:test`: PASS.
- `npm run vendors:check`: PASS.
- `npm run vendors:test`: PASS.
- `npm run distribution:check`: PASS.
- `npm run distribution:test`: PASS.
- `npm run digest:shadow:test`: PASS.
- `npm run candidates:test`: PASS.
- `npm run protocols:check`: PASS.
- `npm run protocols:test`: PASS.
- `npm run protocols:coverage`: PASS.
- `npm run protocols:coverage:test`: PASS.
- `npm run scheduled:check`: PASS.
- `npm run scheduled:test`: PASS.
- `npm run scheduled:outcomes:test`: PASS.
- `npm run models:check`: PASS.
- `npm run models:test`: PASS.
- `npm run claims:check`: PASS.
- `npm run claims:test`: PASS.
- `npm run docs:check`: PASS.
- `npm run docs:test`: PASS.
- `Archive/handoff index warning-only CI wrapper`: PASS.
- `npm run archive:index:test`: PASS.
- `npm run receipts:check`: PASS.
- `npm run receipts:test`: PASS.
- `npm run migrations:check`: PASS.
- `npm run migrations:test`: PASS.
- `npm run handoff:test`: PASS.
- `npm run context:check`: PASS.
- `npm run context:test`: PASS.

Additional commands: MCP build; API emitted build (including all 26 JSON job ids); final API `tsc --noEmit`; repeated changed-source lint guards and `env:check`; `coverage-matrix:check`; monitoring unit tests; focused route/heartbeat tests; `git diff --check` — results are in the receipt.

Live read-only observations: `/health` returned HTTP 200 and `{"status":"ok","commit":"b45057945565"}`; `/health/jobs` returned HTTP 404 before merge. `strale-mcp@latest` (registry version 0.2.8) reported 298 capabilities, 95 solutions, 298 capability trust and 95 solution trust, exposed 9 tools and completed public search. The unmodified local MCP transport first failed certificate verification in this managed environment. Repeating the same probe with this environment's already-configured CA/proxy variables passed; this local harness adjustment is not committed and adds no GitHub secret.

### Orchestrator-only closeout

Changes intentionally remain uncommitted, per the task-specific brief (which takes precedence over the generic build-agent commit instruction). Nothing was pushed, opened as a PR or merged. `handoff:check` was run and did not pass: this isolated build clone is on a feature branch, dirty and has no feature upstream; it also reports inherited merged branches. Do not switch branches, delete inherited branches or push to satisfy that gate inside this build task. The orchestrator owns those actions and the after-merge checks above. The gate reports `dirty`, `branch`, `ahead` and inherited `merged-branch` findings; origin fetch is unavailable, so its remote-branch findings may be stale. These are reported rather than changing the orchestrator’s clone or publishing anything.

## Round 2

This section supersedes Round 1's first-deploy alarm guidance and its statement that ordinary schedule rows never act as fallback. Changes remain uncommitted for the orchestrator. No branch switch, push, PR, merge, package publication or production database write was performed.

1. **Rollout freshness:** `readJobFreshness` uses successful ordinary `job_schedule.last_finished_at` only for coordinator ids without any `heartbeat:<id>` row. SQL excludes heartbeat names and uses an anti-existence check; the reader also enforces durable precedence. A stale, null or invalid durable row cannot be rescued by a legacy success. Auxiliary due slots never supply success evidence; their existing success-only writes remain after completed runs, with caught failures excluded.

   Grace uses one write-once `heartbeat-feature-start` metadata row in the existing `job_schedule` table. Both coordinator and scheduler poll loops initialize it before work, and the reader retains a repair fallback. `ON CONFLICT DO NOTHING` preserves the original timestamp through deploys and restarts. Auxiliary jobs with no durable row are healthy until their interval plus five minutes has elapsed from that epoch. Once any durable heartbeat exists, grace is unavailable. The marker is never registered or claimed as runnable work. No migration, new env var, fake successful run or production backfill is needed.

2. **Deploy verification:** `deploy-verify.yml` now has `cancel-in-progress: false`, so a docs-only successor cannot cancel verification of an earlier code push. The workflow regression asserts the safe setting. GitHub ancestry comparisons resolve each served 12-character SHA through `getCommit` first.

3. **Boot freshness:** only `job-coordinator`, `test-scheduler`, `reservation-reconciler`, `settlement-reconciler` and `integrity-hash-retry` receive process-uptime grace, bounded by three intervals plus their actual first-tick delay. A recorded success ends startup grace; stale evidence stays stale. Public fields are unchanged, including a null success age during grace. The external inventory validator accepts that representation.

4. **Public endpoint:** a per-process 30-second result cache coalesces concurrent reads and caches error/empty responses too. IP limiting matches `/health/deep` at six requests per minute. The schema has no supporting `(event_type, created_at)` index for the former `health_monitor_events` maximum query. That query is removed because scheduler freshness is explicitly process-local in this revision. No index was added. **H2/H7 follow-up:** assess other callers of this events-table query; measure production cardinality and EXPLAIN before deciding on a separate index change. No production database was available here, so live table size and query plans remain unverified.

5. **MCP contract:** `probe()` retries exactly once after an install/connect failure, with a fresh isolated install and cleaned transports. Contract failures are never retried. Capability trust must still equal catalogue capability count exactly; mismatch messages name both observed trust and catalogue counts (and the solution counts).

6. **Watch loop:** removed-entry checks consider open issues only. An unreachable or invalid `/health/jobs` produces only the `job-inventory` signal, without converting every job into a failure. Existing per-job state is left alone until the inventory is observable again.

7. **Issue lifecycle:** first failures live in one rolling `[watch-state] production-watch` issue containing counters keyed by signal and last run id. Repeating a run does not increment twice. Only a second failing run opens/reopens the per-signal issue. Recovery clears its counter and closes an open incident; subsequent green runs do not rewrite a closed incident. The existing workflow concurrency serializes state writers. No issue was created during this build.

Round 2 implementation files: `.github/workflows/deploy-verify.yml`; `apps/api/src/lib/job-heartbeats.ts`; `apps/api/src/lib/job-coordinator.ts`; `apps/api/src/jobs/test-scheduler.ts`; `apps/api/src/routes/health-jobs.ts`; `apps/api/src/routes/health-jobs.test.ts`; `scripts/production-watch/watch.mjs`; `scripts/production-watch/package-probe.mjs`; `scripts/production-watch/watch.test.mjs`. The handoff, fresh receipt and generated archive index record the evidence.

The `go` skill's verification and independent-review stages were applied under the task-specific no-commit/no-push/no-PR instruction. No simplify skill is installed; a manual simplification pass retained the single existing schedule table, extracted the shared grace initializer, and removed the unnecessary events scan. Separate technical and product reviews returned GO with no open findings after fixing the technical review's delayed-epoch concern. Technical review reran the focused tests and monitoring scripts. No historical review backlog was changed.

Live read-only Round 2 observations: `/health` returned HTTP 200 with commit `d004d774d498`; `/health/jobs` returned HTTP 404 before deployment. `strale-mcp@latest` returned 298 capabilities, 95 solutions, 298 cap trust, 95 sol trust, 9 tools and successful public search. Exact capability-trust equality therefore remains enforced. Initial local attempts failed install/connect because the managed filesystem makes npm's default cache read-only. The successful probe used an npm cache inside the checkout and inherited this managed environment's existing proxy/CA settings; no credential or committed workflow change was needed.

Rollout remains the orchestrator's responsibility: deploy the branch; observe the deploy verification workflow for the merge SHA; check HTTP 200 and all 26 safe job entries on `/health/jobs`; observe real scheduled executions, heartbeat ages and the issue confirmation/recovery lifecycle. No production SQL command or new secret is needed. The isolated PostgreSQL integration CI job was not run here because no disposable test database is available; its commands remain CI-owned, including the safety assertion, schema push, startup migration application and integration Vitest invocation. Do not point those commands at production. No running-production query plan, scheduled GitHub execution, GitHub issue write or after-deploy result is claimed.

### Round 2 verification

Evidence: `archive/receipts/2026-10-27-test-run-production-watch-round2.json` (fresh receipt written via stdin; Round 1 receipt remains unchanged).

- Monitoring scripts (`node --test scripts/production-watch/*.test.mjs`): **25 passed**, zero failures.
- Final focused API tests (`cd apps/api && npx vitest run src/routes/health-jobs.test.ts src/jobs/reconciler-heartbeats.test.ts`): **18 passed across 2 files**.
- Final full API Vitest: **6,436 passed, 346 skipped**; **348 files passed, 33 skipped**, zero failures. Both complete Round 2 full runs passed; the earlier run had 6,435 passed before the epoch-callsite regression was added. The root `npm test -- --maxWorkers=2` wrapper consumes the worker flag as npm configuration rather than forwarding it, so these actual full runs used Vitest's default worker setting. No test threshold or unrelated source was changed.
- **All 57 root CI commands listed in the earlier root-results table were rerun and passed**, including the monitoring scripts, all lint guards, claims/models/env/docs/programs/receipts checks, and context tests. Supplied `npm ci` was not repeated. The MCP workspace build ran once and passed. Root full-workspace typechecking and additional API `npx tsc --noEmit`/typecheck reruns passed.
- Additional final changed-source guards (`lint:no-bare-catch`, `lint:no-unguarded-user-fetch`, `lint:no-new-console`, `env:check`), `coverage-matrix:check`, and `git diff --check`: passed. Workflow YAML and inline scripts parsed in the monitoring tests. `actionlint` remains unavailable.
- The first version of the new epoch regression failed because it inspected mock calls left by another test. Resetting the mock at that test's start fixed the test isolation; the final focused and full runs pass. The earlier focused Round 2 version had 17 passing tests before adding that regression.
- Independent technical and product review: GO, zero open findings. No external service was written by either review.
- `handoff:check`: expected failure on `dirty`, `branch`, `ahead`, and inherited `merged-branch` findings, with an origin-fetch warning. Task authorization explicitly requires leaving the work uncommitted and forbids push/branch switching/deleting inherited branches; no such cleanup was attempted. No Notion connector is available; this handoff is the local session record for orchestrator closeout.

## Round 3

Legacy coordinator successes are accepted only within `max(interval * 3, interval + 300)` seconds of the persistent feature epoch; durable rows retain precedence. Grace initialization now runs once in the database-ready boot sequence with startup retry, and remains idempotent across restarts. The scheduler marks its heartbeat immediately after acquiring its lock, before auxiliary work. The production watch reads and updates its rolling state once per run, preserving counters for all signals in the batch.

Production runs one replica, as required by `docs/operations/run-onboarding.md` for its in-process onboarding runner; this makes the current memory-only heartbeat ids acceptable. If replicas are added, those ids must receive durable heartbeats so every replica reports the same state.

The orchestrator owns independent review and deployment. No independent review was dispatched in this round; the explicit orchestrator workflow reserves review to the orchestrator. No production database or settings were touched.

Round 3 verification evidence: `archive/receipts/2026-10-27-test-run-production-watch-round3.json`. The monitoring script tests, focused API tests, API typecheck, workspace builds and typecheck, all root CI checks, and the final full API suite passed. Two earlier full-suite runs overlapped: one failed the unrelated `domain-contact-extract` timing assertion and the other timed out in the `no-sqs-keys` smoke test; the subsequent full suite passed without a concurrent suite. The supplied `npm ci` was not repeated. The disposable PostgreSQL integration job was not run because no disposable database is available. `handoff:check` reports the intentionally dirty feature branch, missing feature upstream and inherited merged branches; the orchestrator owns closeout. Live read-only `/health` returned HTTP 200 and commit `d004d774d498`; `/health/jobs` returned HTTP 404 before deployment. After deployment, verify the endpoint and real heartbeat and issue lifecycle as described above.
