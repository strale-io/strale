# API-key spend limits: verification commands

Every CI check-job command below ran. The initial OpenAPI type error was corrected; the subsequent complete workspace typecheck exited 0. No production database or settings were changed.

| Command | Final result | Tests passed |
|---|---|---:|
| `npm --workspace=packages/mcp-server run build` | PASS | — |
| `npm --workspace=packages/sdk-typescript run build` | PASS | — |
| `npm run typecheck` | PASS after OpenAPI fix | — |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS | — |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS | — |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS | — |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS | — |
| `npm --workspace=apps/api run lint:no-new-console` | PASS | — |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS | — |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS | — |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | PASS | — |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS | — |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS | — |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS | — |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS | — |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS | — |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS | — |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS | — |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS | — |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS | — |
| `node scripts/guard-production-write-access.mjs` | PASS | — |
| `npm run programs:check` | PASS | — |
| `npm run programs:test` | PASS | 30 |
| `npm run research:check` | PASS | — |
| `npm run research:test` | PASS | 31 |
| `npm run design:check` | PASS | — |
| `npm run design:test` | PASS | 84 |
| `npm run env:check` | PASS | — |
| `npm run env:test` | PASS | 24 |
| `npm run vendors:check` | PASS | — |
| `npm run vendors:test` | PASS | 78 |
| `npm run distribution:check` | PASS | — |
| `npm run distribution:test` | PASS | 15 |
| `npm run digest:shadow:test` | PASS | 20 |
| `npm run candidates:test` | PASS | 3 |
| `npm run protocols:check` | PASS | — |
| `npm run protocols:test` | PASS | 12 |
| `npm run protocols:coverage` | PASS | — |
| `npm run protocols:coverage:test` | PASS | 16 |
| `npm run scheduled:check` | PASS | — |
| `npm run scheduled:test` | PASS | 43 |
| `npm run scheduled:outcomes:test` | PASS | 24 |
| `npm run models:check` | PASS | — |
| `npm run models:test` | PASS | 14 |
| `npm run claims:check` | PASS | — |
| `npm run claims:test` | PASS | 18 |
| `npm run docs:check` | PASS | — |
| `npm run docs:test` | PASS | 6 |
| `CI archive/handoff-index warning block` | PASS | — |
| `npm run archive:index:test` | PASS | 12 |
| `npm run receipts:check` | PASS | — |
| `npm run receipts:test` | PASS | 25 |
| `npm run migrations:check` | PASS | — |
| `npm run migrations:test` | PASS | 23 |
| `npm run handoff:test` | PASS | 46 |
| `npm run context:check` | PASS | — |
| `npm run context:test` | PASS | 180 |

Additional required commands: `npm ci` in the fresh writable worktree (PASS), direct API `npx tsc --noEmit` (PASS), SDK build and tests (PASS, 2 tests), full API vitest and the fail-closed integration command. The handoff and immutable receipt record final suite counts and the DB limitation.

Observed failures retained in the record: the first candidate full suite caught missing account-closure/migration-test registration and the integration-lane naming guard; these were fixed. Two overlapping later full reruns hit unchanged search performance thresholds, and one also hit a verify-route test timeout. The final full run limits workers to two without changing any tests or thresholds.

`STRALE_REQUIRE_INTEGRATION_DB=1 npx vitest run --no-file-parallelism integration.test.ts`: FAILS CLOSED, 32 suite imports refused because the test DB is unset, zero tests executed. PostgreSQL cannot be initialized here because only root is mapped and switching UID is prohibited. Real-DB assertions, including 13 new integration tests, remain for CI.

`handoff:check`: FAIL, both in the supplied checkout and writable copy. The writable copy is clean after commits, but there is no pushed feature upstream and three inherited merged branches remain. No branches were deleted; pushing is expressly reserved for the orchestrator. Pre-commit handoff gates passed.

Read-only live checks: `GET /health/version` returned 404; `GET /health` returned 200 with `{"status":"ok","commit":"10f71df81716"}`. This proves reachability and the deployed baseline only; new-schema proof is pending deployment.

Baseline comparisons use the requested `10f71df8`. The inherited local `main` pointer is older; its auth middleware and SDK client are byte-identical to the requested base, and the route-wiring fail-before check was repeated using `10f71df8` explicitly.

## Files changed

- `apps/api/src/app.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/lib/account-closure.ts`
- `apps/api/src/lib/api-keys.test.ts`
- `apps/api/src/lib/api-keys.ts`
- `apps/api/src/lib/errors.ts`
- `apps/api/src/lib/middleware.ts`
- `apps/api/src/lib/rate-limit.ts`
- `apps/api/src/lib/startup-migrations.ledger.json`
- `apps/api/src/lib/startup-migrations.test.ts`
- `apps/api/src/lib/startup-migrations.ts`
- `apps/api/src/lib/wallet-reservations.ts`
- `apps/api/src/lib/wallet-service.ts`
- `apps/api/src/openapi.ts`
- `apps/api/src/routes/a2a.ts`
- `apps/api/src/routes/api-keys.integration.test.ts`
- `apps/api/src/routes/api-keys.registration.test.ts`
- `apps/api/src/routes/api-keys.test.ts`
- `apps/api/src/routes/api-keys.ts`
- `apps/api/src/routes/do.ts`
- `apps/api/src/routes/solution-execute.ts`
- `apps/api/src/types.ts`
- `archive/README.md`
- `archive/receipts/2026-10-27-test-run-api-key-spend-limits.json`
- `archive/sessions/2026-10-27-api-key-spend-limits-checks.md`
- `archive/sessions/2026-10-27-api-key-spend-limits-review.md`
- `docs/api-quickstart.md`
- `docs/project/legacy-authority-inventory.json`
- `handoff/README.md`
- `handoff/_general/from-code/2026-10-27-feat-api-key-spend-limits.md`
- `packages/sdk-typescript/README.md`
- `packages/sdk-typescript/package.json`
- `packages/sdk-typescript/src/client.ts`
- `packages/sdk-typescript/src/index.ts`
- `packages/sdk-typescript/src/types.ts`
- `packages/sdk-typescript/test/api-keys.test.mjs`
