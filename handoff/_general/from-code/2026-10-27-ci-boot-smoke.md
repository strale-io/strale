Intent: Make a schema-bootstrapped fresh database bootable, exercise the production image and entry point in CI, and reject empty gate inputs. Implementation and local checks are complete; real Postgres/image boot still requires GitHub Actions because the local sandbox cannot switch to the postgres user and has no Docker daemon. Leave this branch uncommitted for the orchestrator.

## Fresh database: cause, repair and verification limit

`drizzle-kit push` creates `transactions.integrity_hash` from schema.ts but not `transactions_integrity_hash_idx`. Block 0030 checks the column, then skips its whole body when that column exists, including index creation. The migration-derived schema validator then refuses boot. This is the root cause recorded by the architecture review and reproduced by the new executor-stub regression: block 0030 skips, while the new block issues index DDL independently.

New block `runMigration0127_integrityHashIndex` runs `CREATE INDEX IF NOT EXISTS` without the column guard. It is registered at the end of BLOCKS and appended as ledger entry M070. All prior block hashes still pass. A schema.ts-only fix would repair later pushes, but would leave an already materialised/restored database without its index until another push. The startup block repairs both cases without requiring production to run Drizzle push.

A real local fresh-DB reproduction was attempted before the fix, but could not run: the UID namespace maps only root; `sudo -u postgres` and `runuser -u postgres` fail, and `chown` fails. No database was initialised. Docker has no daemon socket. These are explicit verification gaps, not passing DB evidence.

The MCP and API dist builds succeeded. Running `node apps/api/dist/index.js` with only fake deploy identity, production mode, a loopback disposable database URL and a short retry budget registered 327 executors and accepted the identity. It then failed with ECONNREFUSED at the first database operation. No listen, DB-backed health, fresh-DB boot time or migration execution is claimed from that run.

## CI smoke and deploy reachability (DEC-20260504-C)

`image-boot-smoke` uses the existing classify output to skip docs-only PRs. It builds the real root Dockerfile with Docker buildx through docker/build-push-action, loads it into Actions' Docker daemon, and caches layers with the gha backend. The build has a six-minute timeout; cold-build duration is not measured locally. `.dockerignore` excludes dependencies, emitted output, credentials and local scratch from the context.

Bootstrap is test-only `drizzle-kit push --force`, followed by the actual image CMD, never the migration helper CLI. Historical production started with the base Drizzle schema: WP11 records the wallet index surviving only from the original push (`docs/remediation/packages/WP11.yaml`). Startup blocks alter those existing tables; they are not a complete CREATE-everything migration chain. `apps/api/drizzle.config.ts` and DEC-20260511-C explicitly reserve push for disposable test bootstrap today. Production deploys run only the startup blocks through `Dockerfile CMD` -> emitted `index.js` -> `runStartupMigrations()` -> `validateSchema()` before listen.

The disposable-target guard runs before push. `seed-boot-smoke.mjs` then inserts offline catalogue fixtures from existing manifests, only into an empty loopback database named strale_boot_test. It does not onboard a capability, invoke an executor or create runnable test suites. Fixture visibility/cost flags are CI-only data, not production publication decisions.

The API container receives DATABASE_URL, NODE_ENV=production and a commit SHA, with no real secrets. Its Docker network is internal and shared only with Postgres; it has no internet route. The probe runs with docker exec and loopback HTTP, so no published API port or host-network fallback is needed. Static boot inspection found facilitator construction lazy, suggest warming DB-only, and jobs delayed; vendor-control-tower requires absent credentials. Delayed jobs are still contained by network isolation. No external host is required or allowed by this smoke; no paid vendor invocation is part of fixture setup or endpoint assertions. Runtime confirmation of complete boot awaits Actions.

The probe requires HTTP 200 and the 12-character commit on /health, HTTP 200 plus status/write_path=ok on /health/deep (a local transaction insert/delete), and at least the source-derived executor minimum of catalogue entries on /v1/capabilities. The normal startup gate independently requires registered executors and its success log is checked, so database fixtures cannot substitute for executor imports. Deep health is called once after listen, avoiding its rate limit.

The deadline is **20 seconds**, from Docker State.StartedAt to the first successful health response, following index.ts's Railway-window comment and review §2.1 D. This is a conservative upper bound on listen time, including inspect/exec latency. The measured boot_ms is printed as JSON; a late listen or a fatal startup log fails CI. Real image build, real fresh-DB migration/validation, endpoint assertions and boot measurement remain Actions-only verification.

After the orchestrator deploys, the artifact query is: `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'transactions' AND indexname = 'transactions_integrity_hash_idx';`. Startup validation independently checks the migration-derived artifact. No production query or write was made in this session.

## Gate inventory: source and record checks

Every listed check was run; the command/result inventory and test counts are in the [receipt](../../../archive/receipts/2026-10-27-test-run-ci-boot-smoke.json). “Required” means EMPTY_INPUT (or an existing explicit structural error) on an empty effective input. Zero findings and empty allowlists remain valid.

| Script | Effective inputs and outcome |
| --- | --- |
| apps/api/scripts/check-mjs-syntax.mjs | Required selected API .mjs files, including self in a normal checkout; pass. |
| apps/api/scripts/check-no-bare-catch.mjs | Required selected source files, including custom source-root argument; pass. |
| apps/api/scripts/check-no-unguarded-user-fetch.mjs | Required runtime capability source files after excluding tests/directories; pass. |
| apps/api/scripts/check-ssrf-inventory.mjs | Required selected capability sources; pass. |
| apps/api/scripts/check-no-new-console.mjs | Required source files, distinct from nonempty violations; pass. |
| apps/api/scripts/check-no-external-column-access.mjs | Required selected source files; pass. |
| apps/api/scripts/check-framework-packages.mjs | Required matching framework package directories; pass. Deprecated packages are legitimately exempt, documented in the script; active packages already require real source imports. |
| apps/api/scripts/check-ceo-brief.ts | Required selected briefs; pass via node --import tsx. The local npx tsx wrapper hit its Unix IPC pathname limit with checkout-local TMPDIR; CI's command is unchanged. |
| apps/api/scripts/check-no-committed-secrets.mjs | Required tracked git candidates; pass. Empty secret matches/allowlist are valid. |
| apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs | Required selected script sources, including self normally; pass. |
| apps/api/scripts/check-fetch-timeout-coverage.mjs | Required selected runtime sources; pass in strict mode. No fetch callsites/violations is legitimately clean. |
| apps/api/scripts/check-manifest-guaranteed-consistency.mjs | Required manifest files and parsed manifest records; pass in strict mode. No guaranteed fields is legitimate when only common/rare reliability is declared, documented in script. |
| apps/api/scripts/check-pii.mjs | Required manifest files and each tracked identifier-scan root; pass in strict mode. Ignored audit-output may legitimately be absent/empty, now documented and regression-tested. |
| apps/api/scripts/check-tier-coverage.mjs | Required manifests and manifest-matched captured fixtures; missing fixture directory now fails; pass in strict mode. Existing allowlisted findings remain visible. |
| apps/api/scripts/check-identity-fixture-shape.mjs | Required manifest glob and matched identity manifests after filtering; pass in strict mode. |
| apps/api/scripts/check-shape-contracts.mjs | Required contract definitions/parsed fields when frontend exists; pass. Separate legacy frontend absent is an intentional documented skip; the present-but-empty frontend regression fails. |
| apps/api/scripts/check-cost-class-coherence.mjs | Required manifest files and classified records with executor source; pass. |
| scripts/guard-production-write-access.mjs | Required tracked candidate files; zero forbidden grep matches remains valid; pass. |
| scripts/check-program-tracks.mjs | Required program register results; individual tracks already have schema minItems; pass. |
| scripts/check-research.mjs | Required research records; pass. Empty supersession edges/ideas are legitimate. |
| scripts/check-design.mjs | Required token count and existing lint consumers; pass. Candidate-only/future apps/web scope may be absent; active tokens remain mandatory. |
| scripts/check-env.mjs | Required manifest rows and discovered usage names; pass. Individual required_in/retired lists follow their existing schema. |
| scripts/check-vendors.mjs | Required vendor count (also schema minItems); pass. |
| scripts/check-distribution.mjs | Required surface count; pass. |
| scripts/check-protocol-extraction.mjs | Required mirror-file count; pass. |
| scripts/check-protocol-coverage.mjs | Required protocol rows; pass with existing report-only coverage warnings. |
| scripts/check-scheduled-reachability.mjs | Required workflow glob and mechanism count; pass. |
| scripts/check-scheduled-outcomes.mjs | Required scheduled workflows or discovery failures before history lookup; offline empty-workflow regression passes. Live history command was not run (not a PR CI step and requires GitHub history); its unit suite passed. |
| apps/api/scripts/check-model-literals.mjs | Required scanned-file count; registry already reports REGISTRY_EMPTY for zero roles; pass. Pure checker retains its findings API. |
| scripts/check-claims.mjs | Required claim rows and each root README/package/source/manifest/platform-facts scan group; pass. Separate sibling frontend optional, documented in library. |
| scripts/check-docs-index.mjs | Required docs subtree collection; pass. |
| scripts/generate-archive-index.mjs --check | Required archive subtrees and handoff entries; individual categories can legitimately be empty, documented in script. Generated index freshness remains warning-only in CI; no existing check weakened. |
| scripts/check-receipts.mjs | Required receipt-record count; pass. No evidence references or bare-count warnings is legitimately valid. |
| apps/api/scripts/check-migration-ledger.mjs | Empty source or ledger block list explicitly fails; pass. Append-only hashes and overlap policy retained. |
| apps/api/scripts/validate-coverage-matrix.mjs | Required selected YAML files; existing schema rejects invalid rows; pass. |
| apps/api/scripts/regenerate-coverage-matrix-summary.mjs --check | Required parsed matrix rows; pass. |
| scripts/check-project-context.mjs | Pass under existing warning-only M1/M2 contract. Empty candidate inventories are explicitly documented as report-only until M4; changing this policy would exceed scope. |
| scripts/assert-disposable-test-db.mjs (apps/api working directory) | Explicitly accepts absent tables/empty rows because that is the fresh-DB safety condition; missing URL already fails. DB lane not run locally. |
| scripts/apply-startup-migrations.ts (apps/api working directory) | Existing integration lane preserved; BLOCKS ledger now rejects empty source/block collections. Actual DB execution unavailable locally. |
| scripts/handoff/handoff-check.mjs | Ran and failed as expected under orchestrator constraints: uncommitted branch, no feature upstream, clone topology and pre-existing merged branches. No commit, push, branch switch or deletion performed. |

## Fixed-input design builders

These are check-mode consumers with mandatory registry/token/template/output paths, not optional file globs. Their existing validation and required file reads reject absent inputs; generated-output comparison rejects a hollow regenerated document against checked-in output. All passed unchanged:

- `design/brand-kit/quiet-material/build.mjs --check`: pass.
- `design/brand-kit/quiet-material/foundations/build.mjs --check`: pass.
- `design/brand-kit/quiet-material/controls/build.mjs --check`: pass.
- `design/brand-kit/quiet-material/patterns/build.mjs --check`: pass.
- `design/brand-kit/quiet-material/illustrations/build.mjs --check`: pass.
- `design/brand-kit/quiet-material/homepage/build.mjs --check`: pass.
- `design/brand-kit/quiet-material/hero-comparison/build.mjs --check`: pass.
- `design/brand-kit/quiet-material/opening/build.mjs --check`: pass.
- `design/brand-kit/open-flow/build.mjs --check`: pass.

## Every root check/test command and result

Named test-file lists fail when a file is missing; Vitest fails when its selector matches nothing. The new table-driven suite exercises real CLIs against emptied disposable repository snapshots, including subgroup filters, absent PII scratch, and the optional-frontend boundary. No checkout source mutation or stash is used. `handoff/regenerate-indexes.test.mjs` now copies the shared helper when installing the real generator in its hook fixture.

| Root/CI command | Result |
| --- | --- |
| `npm run coverage-matrix:check` | Pass |
| `npm run context:check` | Pass; warning-only contract retained |
| `npm run context:test` | Pass; 180 tests |
| `npm run programs:check` | Pass |
| `npm run programs:test` | Pass; 30 tests |
| `npm run research:check` | Pass |
| `npm run research:test` | Pass; 31 tests |
| `npm run design:check` | Pass |
| `npm run design:test` | Pass; 84 tests |
| `npm run env:check` | Pass |
| `npm run env:test` | Pass; 24 tests |
| `npm run vendors:check` | Pass |
| `npm run vendors:test` | Pass; 78 tests |
| `npm run digest:shadow:test` | Pass; 20 tests |
| `npm run candidates:test` | Pass; 3 tests |
| `npm run protocols:check` | Pass |
| `npm run protocols:test` | Pass; 12 tests |
| `npm run protocols:coverage:test` | Pass; 16 tests |
| `npm run scheduled:check` | Pass |
| `npm run scheduled:test` | Pass; 43 tests |
| `npm run scheduled:outcomes:test` | Pass; 24 tests |
| `npm run distribution:check` | Pass |
| `npm run distribution:test` | Pass; 15 tests |
| `npm run models:check` | Pass |
| `npm run models:test` | Pass; 14 tests |
| `npm run claims:check` | Pass |
| `npm run claims:test` | Pass; 33 tests |
| `npm run docs:check` | Pass |
| `npm run docs:test` | Pass; 6 tests |
| `npm run archive:index:test` | Pass; 12 tests |
| `npm run receipts:check` | Pass |
| `npm run receipts:test` | Pass; 25 tests |
| `npm run migrations:check` | Pass |
| `npm run migrations:test` | Pass; 24 tests |
| `npm run handoff:test` | Pass; 46 tests |
| `npm run protocols:coverage` | Pass |
| `node apps/api/scripts/check-mjs-syntax.mjs` | Pass |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | Pass |
| `node apps/api/scripts/check-no-external-column-access.mjs` | Pass |
| `node apps/api/scripts/check-framework-packages.mjs` | Pass |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | Pass |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | Pass |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | Pass |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | Pass |
| `node apps/api/scripts/check-pii.mjs --strict` | Pass |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | Pass |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | Pass |
| `node apps/api/scripts/check-shape-contracts.mjs` | Pass; optional legacy frontend absent, announced skip |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | Pass |
| `npm --workspace=apps/api run lint:no-bare-catch` | Pass |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | Pass |
| `npm --workspace=apps/api run lint:no-new-console` | Pass |
| `node scripts/guard-production-write-access.mjs` | Pass |
| `node scripts/generate-archive-index.mjs --check` | Pass |
| `node --import tsx apps/api/scripts/check-ceo-brief.ts` | Pass |
| `npm run gates:test` | Pass; 54 tests |

Additional builds/checks: MCP build pass; SDK build pass; API dist build pass; root npm run typecheck pass (API, API scripts and all listed package typechecks); final apps/api `npx tsc --noEmit` equivalent via workspace exec pass; actionlint 1.7.7 pass; git diff --check pass. npm ci was already provided by the orchestrator and was not rerun locally. No production credentials were sought.

## Evidence and review

The final full API run (`vitest run --maxWorkers=2`) passed **6,456**, skipped **346**, failed **0**, across **349 passing / 33 skipped files**. Root Node suites passed **774 tests**, including **54 new gate/probe cases**. All counts cite the [stdin-written receipt](../../../archive/receipts/2026-10-27-test-run-ci-boot-smoke.json). Initial failures and their fixes are retained in that receipt: migration-list expectations updated; search timing passed on repeat without changing its threshold; pure model-checker API retained; hook fixture copied new helper; Git discovery ceiling kept temporary no-git fixtures from inheriting this checkout. A checkout-local TMPDIR was used for verification fixtures; no external scratch location was intentionally created.

Independent technical review: GO on the uncommitted diff based at b4505794, two rounds; operational review: GO with the explicit local DB/image evidence limitation. Both read REVIEW.md. Manual simplify pass kept the change to one small shared helper, direct input assertions, and an isolated smoke job; no optional simplify skill is installed. See the [review record](../../../archive/sessions/2026-10-27-ci-boot-smoke-review.md).

## Remaining orchestrator work

Review the uncommitted diff, commit/push through the normal orchestrator route, and require image-boot-smoke green before merge. Observe the real image build duration, boot_ms, commit, deep-health and catalogue output. The integration-db lane must also pass against its Postgres service. This session cannot certify real fresh-DB boot or Docker execution. Do not infer either from the executor-stub regression or partial local boot.

The repository close gate conflicts with the explicit request to leave work uncommitted and not push/switch branches; its findings are reported rather than “fixed” by violating those instructions. No Notion write or external message was made; this handoff is the session record.

## Round 2

The following supersedes the original implementation descriptions above; the original Round 1 evidence remains historical.

1. **Required boot environment.** The image boot command now supplies generated `AUDIT_HMAC_SECRET` using `openssl rand -hex 32` and `FRONTEND_URL=http://localhost:3000`. A source grep and startup-path review found the other unconditional production boot requirements are `DATABASE_URL` and a full `RAILWAY_GIT_COMMIT_SHA`, both already supplied. Optional provider/alerting keys only warn or are read when handling requests; x402 settings have defaults unless explicitly selecting a credentialed mode. No additional secrets were added or sought.
2. **Index repair without an every-boot SHARE lock.** Block 0127 first reads `pg_index` joined to `pg_class`, scoped to `transactions` and the index name. A valid index returns immediately with no DDL, SET or reserved connection. A missing/invalid index uses block 0125's reserved-session pattern: 3-second lock timeout, unlimited statement timeout, concurrent drop for invalid indexes, then concurrent create. Both timeouts reset and the connection releases even if creation fails. Block 0125 has no helper to reuse; no old migration was edited. Only the new, unmerged 0127 ledger row was rehashed. Regression coverage checks executed SQL for all three states and cleanup after a failed build.
3. **Limits and timing output.** The smoke job has a 15-minute timeout. The probe hard-fails after 30 seconds; successful probe JSON includes `boot_ms`, which the workflow writes to the job summary. Values above 12 seconds emit an Actions warning.
4. **Log check.** Container logs are captured once to a file; registration and fatal-startup checks grep that file, avoiding pipeline SIGPIPE false negatives.
5. **Isolation and merge gate.** The internal Docker network remains database-only, and a container-side fetch to example.com must fail. `check` now needs `image-boot-smoke` and always runs, with a mandatory first shell step failing unless classification succeeds and smoke succeeds, or a docs-only PR intentionally skips smoke. Skipping the required check itself would not reliably block merges, so the guard deliberately fails a running check. Eleven scenarios execute this actual YAML shell guard: docs-only skips pass; code skips, smoke failures/cancellations and failed classifications fail.

### Local boot attempt and remaining evidence

Postgres 16 binaries are installed. The required local attempt used an ignored directory inside the checkout, but `runuser -u postgres` failed with `cannot set groups: Operation not permitted`; ownership changes and a direct identity switch were also denied. The sandbox's UID/GID maps contain only root. No database was initialized or started. The disposable-database guard failed with connection refused; the attempted Drizzle push did not complete against a live server, so seed, dist boot and the real probe could not follow. The empty database/socket directories were removed. The production dist build passed, but is not boot evidence.

The explicit local Docker socket check also failed: no daemon/socket is available. Real image boot and the egress assertion remain unexecuted locally. **No local boot_ms, live health result or catalogue count is available.** The independent reviewer's approximately 4.6-second boot and 326 entries are supplied review evidence, not reproduced observations from this session. The orchestrator must obtain the real Postgres/dist probe and image/egress evidence before accepting this round.

Branch protection was not read and its required-check list cannot be verified here. If it already requires `check`, no required-check-list change is needed: the running check now fails when smoke fails. If it requires a different job or does not require `check`, Petter needs to require `check` (or explicitly require `image-boot-smoke`) in the active branch rule/ruleset. Workflow gate correctness was checked locally; GitHub scheduling/branch-rule behavior still requires CI observation.

Deployment reachability was read directly: Dockerfile CMD runs the built `apps/api/dist/index.js`; `src/index.ts` calls the startup migration runner before validation and listen; BLOCKS includes 0127. No production write or deploy occurred. The later deployment proof is the index catalogue query checking `indisvalid` for `transactions_integrity_hash_idx`, plus the image smoke's commit, health, deep-health and catalogue outputs.

### Verification results

Evidence and final counts follow in the fresh Round 2 stdin-written receipt. Initial test-command issues are retained: the first full API invocation used localhost FRONTEND_URL, which conflicts with the existing audit-token URL fixture; the full suite was rerun with CI's test FRONTEND_URL. The CEO-brief CLI initially exceeded the Unix socket path-length limit under an absolute temporary directory; the exact CLI passed with a checkout-relative temporary directory, and direct `node --import tsx` also passed. Neither issue caused a source/test change.

Independent review found and rechecked the merge-gate correction described above, then returned code GO with the explicit real-boot limitation. See the Round 2 section of the review record. All changes remain uncommitted and unpushed as requested; handoff gate findings about that state or clone topology are reported, not repaired by violating the task instructions.

Final Round 2 evidence: [fresh stdin-written receipt](../../../archive/receipts/2026-10-27-test-run-ci-boot-smoke-round-2.json). Full API: **6,459 passed, 346 skipped, 0 failed**, across 349 passing and 33 skipped files, in **284.78 seconds**. Root Node suites: **785 passed**. Touched migration tests: **213 passed**; probe/workflow tests: **17 passed** (included in root totals). MCP, SDK and API dist builds, root typecheck, explicit API `npx tsc --noEmit`, actionlint 1.7.7 and `git diff --check` passed. The initial full API run had 6,458 passed, 346 skipped and one environment-fixture failure in 297.76 seconds; it was replaced by the full passing run, not counted as green. A redundant context-test repeat was cancelled after the original completed with 180 passed.

| Round 2 root/CI command | Actual result |
| --- | --- |
| `npm --workspace=packages/mcp-server run build` | Pass |
| `npm --workspace=packages/sdk-typescript run build` | Pass |
| `npm run typecheck` | Pass |
| `node apps/api/scripts/check-mjs-syntax.mjs` | Pass |
| `npm --workspace=apps/api run lint:no-bare-catch` | Pass |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | Pass |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | Pass |
| `npm --workspace=apps/api run lint:no-new-console` | Pass |
| `node apps/api/scripts/check-no-external-column-access.mjs` | Pass |
| `node apps/api/scripts/check-framework-packages.mjs` | Pass |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | Initial IPC-path failure; exact CLI retry passed with relative TMPDIR |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | Pass |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | Pass |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | Pass |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | Pass |
| `node apps/api/scripts/check-pii.mjs --strict` | Pass |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | Pass |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | Pass |
| `node apps/api/scripts/check-shape-contracts.mjs` | Pass |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | Pass |
| `node scripts/guard-production-write-access.mjs` | Pass |
| `npm run programs:check` | Pass |
| `npm run programs:test` | Pass; 30 tests |
| `npm run research:check` | Pass |
| `npm run research:test` | Pass; 31 tests |
| `npm run design:check` | Pass |
| `npm run design:test` | Pass; 84 tests |
| `npm run env:check` | Pass |
| `npm run env:test` | Pass; 24 tests |
| `npm run vendors:check` | Pass |
| `npm run vendors:test` | Pass; 78 tests |
| `npm run distribution:check` | Pass |
| `npm run distribution:test` | Pass; 15 tests |
| `npm run digest:shadow:test` | Pass; 20 tests |
| `npm run candidates:test` | Pass; 3 tests |
| `npm run protocols:check` | Pass |
| `npm run protocols:test` | Pass; 12 tests |
| `npm run protocols:coverage` | Pass |
| `npm run protocols:coverage:test` | Pass; 16 tests |
| `npm run scheduled:check` | Pass |
| `npm run scheduled:test` | Pass; 43 tests |
| `npm run scheduled:outcomes:test` | Pass; 24 tests |
| `npm run models:check` | Pass |
| `npm run models:test` | Pass; 14 tests |
| `npm run claims:check` | Pass |
| `npm run claims:test` | Pass; 33 tests |
| `npm run docs:check` | Pass |
| `npm run docs:test` | Pass; 6 tests |
| `npm run archive:index:test` | Pass; 12 tests |
| `npm run receipts:check` | Pass |
| `npm run receipts:test` | Pass; 25 tests |
| `npm run migrations:check` | Pass |
| `npm run migrations:test` | Pass; 24 tests |
| `npm run gates:test` | Pass; 65 tests |
| `npm run handoff:test` | Pass; 46 tests |
| `npm run context:check` | Pass |
| `npm run context:test` | Pass; 180 tests |
| `npm run handoff:check` | Expected failure: uncommitted/unpushed state, clone topology, existing merged branches; fetch unavailable |
| `audit-output/ci-boot-smoke/actionlint .github/workflows/ci.yml` | Pass |
| `git diff --check` | Pass |

Additional archive-index check passed. The CI archive-index step retains its warning-only stale-index policy. `npm ci` was supplied by the orchestrator and was not rerun. The full API command was `cd apps/api && npx vitest run --maxWorkers=2`, covering the same suite as root `npm test` with bounded workers. No production commands remain for this code-only CI correction; real disposable-DB/image validation remains required before merge, and the eventual deployment index query remains unexecuted.
