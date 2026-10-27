# Japan official corporate API verification — 2026-10-27

Evidence: `archive/receipts/2026-10-27-test-run-japan-official-api.json`.

Final full API vitest: 337 files passed, 31 skipped; 5,857 tests passed, 321 skipped.
Focused touched/consumer/body-guard suites: 9 files, 523 passed, including 54 Japan executor cases.
An earlier full run hit the existing `test-runner.fixture-lifecycle.test.ts` race:
its separate `new Date()` values can make updatedAt later than baselineCapturedAt.
It passed alone and on the final full run. No unrelated test or production code was changed to hide it.
Earlier implementation failures (unbounded read, pinned catalogue description, provider-agnostic mock)
were corrected and rerun; the final full suite is green.

## CI check job — every command run

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
| `npm run env:check` | FAIL — requested unconfigured NTA env state |
| `npm run env:test` | FAIL — requested unconfigured NTA env state |
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
- Official Toyota public record fetched read-only: corporate number 1180301018771 and トヨタ自動車株式会社 confirmed. Authenticated API response remains unverified live.

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

The final test receipt corrects the initial receipts' passed_files field: Vitest JSON labels entirely skipped suites passed; the actual file summary is 337 passed plus 31 skipped. Initial receipt files remain immutable.

## Local commit and closeout blocker

`git add -- <explicit file list>` failed before staging: the worktree administrative
mount is read-only and Git cannot create index.lock. No commit was created, and
no push/PR/merge was attempted. Work remains in the isolated feature worktree.
The clean-tree mutation tool could not run; fail-before execution against the
old browser module is not claimed. This is an environment limitation, not a
waiver of the regression-proof requirement. The orchestrator must restore Git
write access, commit and run that proof before shipping.

Final `npm run handoff:check -- --json`: exit 1 with dirty/ahead/merged-branch.
Git write access blocks committing; push and remote-branch deletion are forbidden
by the orchestrator instructions. The remote merged-branch finding predates this
work and may be stale because the gate could not fetch. `docs:check`,
`receipts:check`, and `git diff --check` passed after writing the handoff.
