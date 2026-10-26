Intent: Build a one-click capability onboarding/backfill runner inside the deployed API, verify it without production credentials, and commit locally for the orchestrator.

Built the shared injected-database pipeline, dedicated-secret asynchronous API
runner, sequential workflow client, environment registration and Petter's
[click-by-click guide](../../../docs/operations/run-onboarding.md).
No capability, manifest or production database was changed by this session.

Built by a Codex build agent in an isolated clone; the orchestrator committed it. Nothing is published, merged or configured in production by the build itself.

Behavior preserved: creation is invisible, `lifecycle_state=validating`, with
x402 off by the existing schema default. Backfill preserves listing/payment
settings and existing suites. The hook's visibility check only warns. The
workflow click acknowledges the CLI backfill banner (`force: true`), without
exposing authority overrides or skipped gates. Non-strict known-answer behavior
is preserved and reported explicitly; lack of live verification is not silently
called a verified answer. The run fails on pipeline/hook/readiness failure.

The API returns 202 and a run id, with status/result available under the same
dedicated authentication. It enforces a five-minute budget, retains its lock
until active execution/queries drain, and blocks subsequent queries/calls after
abort. Status is process-local, bounded to 100 runs. This design assumes one API
replica; restart/redeploy loses status. Inspect logs/readiness before retrying
an uncertain or timed-out run. Backfill can partially commit, as the existing
CLI did; structured results report completed changes. Discovery/fix returns
YAML without rewriting the deployed image. The CLI writes that YAML locally.

Verification evidence: [check receipt](../../../archive/receipts/2026-10-26-check-onboarding-run-endpoint.json).
The receipt records every root CI check, focused and full API suites, package
builds, typecheck, standalone production-authority guard, dry-run and live
responses. Final results and limitations are recorded there rather than claimed
from an earlier run. The generated source inventory was refreshed with
`npm run context:generate`; the extracted pipeline is reviewed in the lifecycle
source guard as a creation/reporting surface, not a serving eligibility rule.

Independent review: `go` technical and product passes in separate read-only
contexts, two rounds, final GO from both, no remaining high/medium findings.
Findings fixed: auth middleware affecting legacy endpoints; CLI batch preflight;
polling recovery artifacts; sanitized failure diagnostics; backfill hook failure;
timeout executor draining; actual affected-row accounting. The `simplify` skill
was unavailable in the skill catalog/files; a manual simplification pass removed
dead branches, stale extracted comments and duplicate validation. No shipping
steps of `go` are performed because the current user assigns them to the
orchestrator.

Deploy dependencies proved by source:
- `apps/api/src/index.ts:202` dynamically imports `app.ts`, served at line 320.
- `apps/api/src/app.ts:641` mounts the dedicated runner before the admin wall
  at line 642; legacy onboarding stays behind that wall at line 650.
- `Dockerfile:34` copies `manifests/`; line 38 builds the API and line 44 starts
  `apps/api/dist/index.js`.
- `apps/api/src/db/schema.ts:271` defaults capability x402 off. The normalizer
  and hook retain their existing visibility behavior.

Live check before deploy (harmless empty POST, no valid secret): both no header
and `Bearer intentionally-wrong` returned HTTP 401 with
`{"error_code":"unauthorized","message":"Admin authentication required."}`.
This is the currently deployed admin wall, not evidence for the new route.

Production steps left for the orchestrator/Petter:
1. Review/import the local commit, push the branch, open/merge the PR and wait
   for Railway to deploy it. This build session does none of those actions.
2. Before setting the new secret, run:
   `curl --silent --show-error --max-time 20 --include -X POST https://api.strale.io/v1/internal/onboarding/run -H 'Content-Type: application/json' -d '{}'`.
   Expect 503 and `not_configured`.
3. Petter generates a long secret in a password manager, sets it in Railway API
   Variables and GitHub environment `production-onboarding`, restricts that
   environment to main, and waits for the API redeployment. No database URL is
   added to GitHub. Update the env register's pending `set_in: [none]` afterward.
4. Repeat the same empty POST with no Authorization and then with
   `-H 'Authorization: Bearer intentionally-wrong'`. Expect 401 `unauthorized`
   from the onboarding-specific auth. These calls cannot execute onboarding.
5. Actions → Onboard capability → main →
   `eurostat-data,entity-resolve,company-status-check,invoice-counterparty-check`
   → mode onboard → discover true → fix false → Run workflow.
6. For revised limitations: the affected manifest slugs (at most 50), mode
   backfill, discover false, fix false. Review summaries and JSON; review and
   commit any generated YAML. Confirm readiness per slug from returned results.

Unverified: actual production onboarding/readiness/vendor execution, deployment
of this branch, secret/environment setup, and live 503→401 behavior after deploy.
No live onboarding was requested or attempted. The separate DB-integration CI
job requires a disposable PostgreSQL service; none is available here (Docker's
managed socket/daemon is absent), so DB-dependent suites remain skipped in the
ordinary full API run. The CLI's real `--dry-run` refuses because its existing
operator write credential is absent; the network-free library dry-run is covered
by tests. No credentials were sought or configured.

The session handoff gate must still report an unpushed branch: pushing is
explicitly forbidden by the current build-agent instructions. This is recorded
as a limitation, not treated as a passed gate. The orchestrator owns pushing.

Final check ledger (all counts supported by the receipt linked above):

| Command | Result |
|---|---|
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
| `npm run env:check` | PASS |
| `npm run env:test` | PASS |
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
| `node scripts/generate-archive-index.mjs --check (CI warning wrapper)` | PASS |
| `npm run archive:index:test` | PASS |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS |
| `npm run handoff:test` | PASS |
| `npm run context:check` | PASS |
| `npm run context:test` | PASS |
| `npm ci` | PASS |
| `npm --workspace=packages/mcp-server run build` | PASS |
| `npm --workspace=packages/sdk-typescript run build` | PASS |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | PASS |
| `npm run env:example` | PASS |
| `npm run context:generate` | PASS |
| `node --check .github/scripts/onboard-capability.mjs` | PASS |
| `git diff --check` | PASS |
| `npx tsx apps/api/scripts/onboard.ts --manifest manifests/eurostat-data.yaml --dry-run` | REFUSED: missing operator credential |
| `npx vitest run src/capabilities/domain-contact-extract.test.ts` | PASS |
| Full API: `npx vitest run --maxWorkers=2` | PASS; database-dependent suites skipped |
| Focused onboarding and changed tests | PASS |
| Independent technical and product reviews | GO, two rounds |
| Separate PostgreSQL CI integration job | NOT RUN: no disposable PostgreSQL / Docker daemon |
| `npm run handoff:check` | Unpushed branch remains by explicit instruction |

The first default-parallel final `npm test` attempt failed one unchanged domain-contact-extract timing ratio assertion under concurrent load. Its isolated rerun and the full suite with two workers passed. No threshold or unrelated executor/test was changed.

Additional discrimination proof: [mutation receipt](../../../archive/receipts/2026-10-26-test-run-onboarding-run-mutations.json).
The repository mutation harness caught removal of the secret length floor,
busy lock, abort signal, and status authentication, each with a green baseline,
red mutation, and green restoration from the recorded commit. The final route
suite also passed after strengthening its admin-token rejection fixture to use
the actual configured admin token captured at import. Production implementation
files are unchanged from implementation commit `b063dd60`.
