# Japan official corporate API verification — 2026-10-27

Evidence: `archive/receipts/2026-10-27-test-run-japan-official-api.json`.

Round 1, as recorded in the immutable receipt: 337 files passed, 31 skipped;
5,858 tests passed, 321 skipped, zero failures. The focused Japan executor suite
recorded 55 passed tests. The receipt does not establish an aggregate count for
the other focused suites.
An earlier full run hit the existing `test-runner.fixture-lifecycle.test.ts` race:
its separate `new Date()` values can make updatedAt later than baselineCapturedAt.
It passed alone and on the final full run. No unrelated test or production code was changed to hide it.
Earlier implementation failures (unbounded read, pinned catalogue description, provider-agnostic mock)
were corrected and rerun; the final full suite is green.

## Round 1 CI check job — historical command record

`npm ci` was already completed by environment setup, as supplied by the orchestrator;
it was not rerun. `npm test` is represented by the full `apps/api` vitest invocation above.
The archive-index row below is the workflow's warning-only wrapper.

| Command | Final result |
|---|---|
| `npm --workspace=packages/mcp-server run build` | PASS |
| `npm --workspace=packages/sdk-typescript run build` | PASS |
| `npm run typecheck` | PASS |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-new-console` | PASS |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | PASS |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npm run programs:check` | PASS |
| `npm run programs:test` | PASS |
| `npm run research:check` | PASS |
| `npm run research:test` | PASS |
| `npm run design:check` | PASS |
| `npm run design:test` | PASS |
| `npm run env:check` | PASS — recorded in the final immutable receipt |
| `npm run env:test` | Earlier run failed for the unconfigured NTA env state; not attested by the final receipt |
| `npm run vendors:check` | PASS |
| `npm run vendors:test` | PASS |
| `npm run distribution:check` | PASS |
| `npm run distribution:test` | PASS |
| `npm run digest:shadow:test` | PASS |
| `npm run candidates:test` | PASS |
| `npm run protocols:check` | PASS |
| `npm run protocols:test` | PASS |
| `npm run protocols:coverage` | PASS |
| `npm run protocols:coverage:test` | PASS |
| `npm run scheduled:check` | PASS |
| `npm run scheduled:test` | PASS |
| `npm run scheduled:outcomes:test` | PASS |
| `npm run models:check` | PASS |
| `npm run models:test` | PASS |
| `npm run claims:check` | PASS |
| `npm run claims:test` | PASS |
| `npm run docs:check` | PASS |
| `npm run docs:test` | PASS |
| `archive/handoff index wrapper: node scripts/generate-archive-index.mjs --check` | PASS |
| `npm run archive:index:test` | PASS |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS |
| `npm run handoff:test` | PASS |
| `npm run context:check` | PASS |
| `npm run context:test` | PASS |

## Additional commands and checks

- `npm run handoff:orient`: passed; existing isolated feature worktree retained.
- `npm run env:example`, `npm run vendors:view`, `npm run context:generate`: passed.
- `cd apps/api && npx tsc --noEmit`: passed, after MCP-server build.
- `cd apps/api && npx vitest run` with default/JSON reporters: final full result above.
- Focused vitest invocations of every changed test and relevant consumers: final result above.
- `validateManifest()` from `src/lib/onboarding-gates.ts` against the YAML, offline: passed, zero errors.
- `cd apps/api && npx tsx scripts/validate-capability.ts --slug japanese-company-data`: blocked, `DATABASE_URL is required for a read-only operator handle`.
- `cd apps/api && npx tsx scripts/onboard.ts --manifest ../../manifests/japanese-company-data.yaml --dry-run`: blocked before validation; requests the production write authority/credential even for dry-run. No writes performed.
- `cd apps/api && npx tsx scripts/smoke-test.ts --slug japanese-company-data`: blocked by missing read-only `DATABASE_URL`.
- `cd apps/api && node scripts/assert-disposable-test-db.mjs`: exit 1, `DATABASE_URL_TEST is not set; nothing to verify`. No disposable PostgreSQL was supplied; integration-db job's schema push/startup migrations/database tests were not run.
- `cd apps/api && npx tsx scripts/smoke-japan-corporate.ts`: expected exit 1 and `capability_unavailable`; no upstream calls and no ID output.
- `git diff --check`: passed.
- Reviewed `Dockerfile` CMD, `src/index.ts` auto-registration and manifest import graph: executor is reachable; Railway env provisioning is the outstanding deploy dependency.
- Downloaded the official v4 revision 1.2, overview, common instructions, resource definition and April 2022 sample archive; actual official terms pages fetched before executor edits.
- Official Toyota public record fetched read-only: corporate number 1180301018771 and トヨタ自動車株式会社 confirmed. The immutable round-1 receipt separately records a successful number lookup for 1180301018771 (active), an exact-name lookup to the same number, and an invalid check digit refused before a call. This round did not independently repeat or verify those historical smoke outcomes.

## Review

Repository `go` workflow applied within the explicit local-build boundary. Two independent same-provider review contexts read REVIEW.md and applied technical/safety and product/API lenses. Round 1 found unavailable-code propagation and outer retry behavior; both corrected with route and retry-wrapper regressions. Round 2: product GO; technical GO with a cancellation-log nit. The nit was fixed by sanitising two shared reader cancellation logs while retaining their diagnostic event/limits; tests force both cancellation failures and assert sanitised logs. No raw reader exception/cause is retained. No separate simplify skill exists in this checkout; an author simplification pass was performed.

## Files changed

- `.env.example`
- `apps/api/.env.example`
- `apps/api/scripts/smoke-japan-corporate.ts`
- `apps/api/src/capabilities/__fixtures__/nta-corporate/README.md`
- `apps/api/src/capabilities/__fixtures__/nta-corporate/closed.xml`
- `apps/api/src/capabilities/__fixtures__/nta-corporate/name-single.xml`
- `apps/api/src/capabilities/__fixtures__/nta-corporate/name_ver4_x4.xml`
- `apps/api/src/capabilities/__fixtures__/nta-corporate/not-found.xml`
- `apps/api/src/capabilities/__fixtures__/nta-corporate/num_0_ver4_x4.xml`
- `apps/api/src/capabilities/japanese-company-data.test.ts`
- `apps/api/src/capabilities/japanese-company-data.ts`
- `apps/api/src/capabilities/risk-narrative-generate.registry-status.test.ts`
- `apps/api/src/capabilities/risk-narrative-generate.ts`
- `apps/api/src/data/error-codes.ts`
- `apps/api/src/lib/company-status/normalise.ts`
- `apps/api/src/lib/company-status/routing.ts`
- `apps/api/src/lib/credential-health.test.ts`
- `apps/api/src/lib/credential-health.ts`
- `apps/api/src/lib/dependency-manifest.ts`
- `apps/api/src/lib/nta-corporate.ts`
- `apps/api/src/lib/resource-limits.ts`
- `apps/api/src/lib/vendor-terms.ts`
- `apps/api/src/routes/do.core.test.ts`
- `apps/api/src/routes/do.ts`
- `apps/api/src/routes/x402-gateway-v2.catalog.test.ts`
- `apps/api/src/routes/x402-gateway-v2.ts`
- `archive/README.md`
- `archive/receipts/2026-10-27-test-run-japan-official-api.json`
- `archive/sessions/2026-10-27-japan-official-api-verification.md`
- `config/env-manifest.yaml`
- `config/vendors.yaml`
- `docs/project/VENDORS.md`
- `handoff/README.md`
- `handoff/_general/from-code/2026-10-27-feat-japan-official-corporate-api.md`
- `manifests/japanese-company-data.yaml`

The single round-1 receipt is immutable. Its counts and smoke statements are reported as recorded; no earlier aggregate test count supersedes it.

## Local commit and closeout blocker

`git add -- <explicit file list>` failed before staging: the worktree administrative
mount is read-only and Git cannot create index.lock. No commit was created, and
no push/PR/merge was attempted. Work remains in the isolated feature worktree.
The clean-tree mutation tool could not run in round 1. Round 2 uses an in-memory
implementation substitution against f0172178, described below, without altering
Git state or temporarily replacing files.

Final `npm run handoff:check -- --json`: exit 1 with dirty/ahead/merged-branch.
Git write access blocks committing; push and remote-branch deletion are forbidden
by the orchestrator instructions. The remote merged-branch finding predates this
work and may be stale because the gate could not fetch. `docs:check`,
`receipts:check`, and `git diff --check` passed after writing the handoff.


## Round 2 — independent review should-fixes

Evidence: `archive/receipts/2026-10-27-test-run-japan-official-api-round-2.json`.
Changes remain uncommitted at f0172178 for the orchestrator. No push, PR, merge,
production write, branch switch, clone, worktree, bundle or temporary file was made.

- S1: a shared-ID 403/429 raises a counted SourceBlockedError, without the
  caller-neutral site-block marker. Subsequent calls return capability_unavailable
  for 60 seconds without fetching NTA. At most four requests are in flight per
  process, including body reads; slots are released on success or failure.
- S2: every name result, including a singleton, requires one exact, active,
  latest=1 match in a complete response. Partial/incomplete/closed/historical/
  unknown-status results refuse with the registered Ambiguous prefix and up to
  five candidates. A closed namesake does not disqualify the unique open match.
- S3: NFKC normalisation precedes number/name routing. T-prefixed numbers,
  full-width digits and a single distinct 13-digit run in text take the number
  route. Repeating the same number is allowed; distinct numbers refuse locally.
- S4: raw bodies are bounded at 1 MiB. A cheap count/record scan refuses more
  than 50 records before JSDOM allocation; 50 is allowed. NTA 400 CSV errors are
  actionable invalid_request refusals, including 103 (legal form only) and
  180 (too many results), without exposing the upstream body.
- S5: branch tests cover NFKC, enName, historical/latest flags, closed namesakes,
  incomplete counts and restoration. Resource definition field 9, printed p.2
  ([source](https://www.houjin-bangou.nta.go.jp/pc/download/images/k-resource-dl.pdf#page=6)),
  says process 22 restores registration after closure is invalidated. It now
  overrides stale closeDate/closeCause; raw fields remain visible. Name selection,
  normalised status and narrative use the restored active status.
- S6: the terms record describes the Article 6 text plus licence credit actually
  emitted. Round-1 counts and smoke statements now follow its immutable receipt;
  the repeated citation is removed. The new receipt is separate and path-free
  in its stdin evidence. The original receipt is unchanged.

Focused verification: 84 tests passed. API `npx tsc --noEmit` and the MCP-server
build passed. Offline validateManifest returned zero errors. All 18 CI lint
commands passed (the shape-contract command skips comparison because the sibling
frontend is absent); vendor and receipt checks retain existing warnings.

Fail-before comparison at f0172178: 57 pass, 27 fail. Of those failures, 25 are
new cases and two are strengthened existing cancellation/body-limit cases:

| Behaviour failing at f0172178 | Cases |
|---|---:|
| Counted shared-ID blocks (403/429) | 2 |
| 60-second cool-down (403/429) | 2 |
| Four-request concurrency cap | 1 |
| Partial singleton, historical/missing-latest/closed/deleted/unknown singleton, incomplete count | 7 |
| T form, number in text, full-width digits, repeated same number, distinct-number refusal | 5 |
| Pre-DOM count/record cap and declared/streamed 1 MiB body cap | 4 |
| NTA 400 error codes 103/180/102 | 3 |
| Process 22 overriding stale closure fields | 1 |
| Strengthened existing cancellation/body-limit guards | 2 |

These tests used the current test file with only nta-corporate.ts and
japanese-company-data.ts loaded from the baseline commit in memory. The final
current-code rerun passes; the baseline run has no timeout failures. NFKC,
enName, closed-namesake selection, the 50-record boundary and failure-slot release
also have coverage; their already-correct baseline behavior is not claimed as a
new regression failure.

No authenticated smoke ran in this round. The smoke script was invoked with an
explicitly empty ID and exited 1 before fetching:
`{"error_code":"capability_unavailable","message":"Set NTA_HOUJIN_APP_ID before running the smoke check."}`.
The first receipt's live outcomes remain prior orchestrator evidence, not a new
claim of live execution here.

Onboarding --dry-run, validate-capability and platform smoke each exited 1:
respectively missing production write authority, missing read-only DATABASE_URL,
and missing read-only DATABASE_URL. Readiness is not established. Production
commands remain listed above; no credentials were sought and no database was written.
The go skill's verification and author simplification were applied within the
local-build boundary. The supplied independent GO is for f0172178; final review,
commit, push and merge belong to the orchestrator. No additional independent
review is claimed for this uncommitted round.


### Round-2 final gate results

Full API vitest: 337 files passed, 31 skipped; 5,887 tests passed, 321 skipped,
zero failures. Focused Japan tests: 84 passed. Evidence is the round-2 receipt
above. A preliminary full run failed one English-name test because its synthetic
fixture edit used the wrong self-closing-tag spelling. The fixture was corrected;
focused and full final runs pass. No production code was changed to excuse it.

| Command | Round-2 result |
|---|---|
| `npm --workspace=packages/mcp-server run build` | PASS |
| `cd apps/api && npx vitest run src/capabilities/japanese-company-data.test.ts` | PASS — 84 |
| `cd apps/api && npx vitest run --reporter=dot --silent` | PASS — full counts above |
| `cd apps/api && npx tsc --noEmit` | PASS |
| `npm run env:check` | PASS |
| `npm run vendors:check` | PASS — existing warnings |
| `npm run claims:check` | PASS |
| `npm run docs:check` | PASS |
| `npm run receipts:check` | PASS — existing bare-count warnings |
| `npm run migrations:check` | PASS |
| `npm run models:check` | PASS |
| `npm run programs:check` | PASS |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-new-console` | PASS |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS — deprecated packages skipped |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | PASS — existing warnings |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS — existing allowlist |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS — existing allowlist |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS — existing allowlist |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | EXIT 0 — comparison skipped, sibling frontend absent |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npm run handoff:orient` | PASS |
| `validateManifest(..., false)` against the existing YAML | PASS — zero errors |
| `cd apps/api && npx tsx scripts/onboard.ts --manifest ../../manifests/japanese-company-data.yaml --dry-run` | EXIT 1 — write authority unavailable; no writes |
| `cd apps/api && npx tsx scripts/validate-capability.ts --slug japanese-company-data` | EXIT 1 — read-only DATABASE_URL unavailable |
| `cd apps/api && npx tsx scripts/smoke-test.ts --slug japanese-company-data` | EXIT 1 — read-only DATABASE_URL unavailable |
| `NTA_HOUJIN_APP_ID= npx tsx apps/api/scripts/smoke-japan-corporate.ts` | EXPECTED EXIT 1 — capability_unavailable, no fetch |
| In-memory f0172178 comparison using Vitest's startVitest API | EXPECTED EXIT 1 — 27 failures, 57 passes, no timeouts |
| `git diff --check` | PASS |

Round-2 files changed: the Japan executor and its test; nta-corporate transport/
mapper; vendor-terms record; fixture README; this report; the existing Japan
handoff; and the new round-2 receipt. The original receipt is unchanged.
No separate DB integration lane ran because no disposable PostgreSQL was supplied.
Per-process concurrency/cool-down does not impose a shared limit across replicas.


Final `npm run handoff:check -- --json`: exit 1, findings `dirty` (the eight
round-2 paths deliberately remain uncommitted) and `merged-branch` (an unrelated
existing remote branch). Fetch failed, so the remote finding may be stale.
Neither finding was changed: the orchestrator explicitly requires uncommitted
work and prohibits pushes and branch/worktree operations. No staging or commit
was attempted in round 2. Final docs/receipt checks and diff whitespace check pass.
