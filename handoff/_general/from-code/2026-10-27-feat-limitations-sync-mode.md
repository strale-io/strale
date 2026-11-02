Intent: Add a text-only limitations sync through the onboarding runner so reviewed manifest text reaches existing capability rows without tool execution or paid calls.

Built on `feat/limitations-sync-mode` from `d193c464`. Local build-agent scope:
build, test and commit only. The orchestrator reviews, pushes, opens the PR and
merges. No production writes, settings changes or package publication occurred.

## What changed

1. `runOnboarding` returns immediately to a small limitations-only module. It
   reuses the Manifest-to-row mapping extracted from backfill and calls the
   existing diff helper with the injected transaction handle. It never enters
   discovery, verification, suite generation, hooks, readiness or capability
   persistence. Both discover and fix are deliberately ignored, including the
   workflow's default checked discover box.
2. Only existing capability rows qualify. Unknown rows report not_found without
   writes. Deactivated rows qualify without changing any capability column,
   including activity, visibility, x402 or lifecycle flags.
3. Each slug reports unchanged, updated, not_found or failed with a reason and
   observer counts for created, updated and deleted limitation rows. Counts are
   published only after commit. A changed text can be a delete plus an insert;
   an updated count can mean a display-order move.
4. The workflow script expands the literal all from the main checkout's manifest
   filenames, sorts them and submits one slug at a time. This keeps the API's
   existing single-run lock and five-minute budget intact and avoids a second
   server batch mechanism. Explicit comma-separated slugs still work. The cap
   is 1000 for limitations and remains 50 for onboard/backfill. Wait for the API
   deployment containing the manifests before running.
5. Authentication and mounting are unchanged: ONBOARDING_RUN_SECRET only;
   unset/unusable or equal to ADMIN_SECRET returns 503, wrong credentials 401.
   The runner stays before the admin wall. Workflow dispatch remains main-only,
   in production-onboarding, with both actions pinned.
6. Each slug's existence check and real limitations diff run in one transaction.
   Failure or abort rolls back that slug; the workflow continues to later slugs
   after ordinary failures. It stops on authentication/configuration failure,
   busy or timeout. Abort is fenced before queries and before transaction return.
7. The runbook explains Actions → Onboard capability → limitations → all,
   ignored checkboxes, outcomes, unchanged settings and zero paid-call cost.

## Review and deploy reachability

The go skill's verification, simplification and independent-review portions ran.
Two separate read-only review contexts returned GO (technical) and GO with nits
(product). Both nits were fixed: Completed wording and a discriminating auth
acceptance test. Reviewer-side test attempts lacked dependencies during an
installation; author-side results are recorded separately. No review backlog
rows were changed. Push/PR/merge are reserved for the orchestrator by the task.

The workflow invokes `.github/scripts/onboard-capability.mjs`, which submits to
`POST /v1/internal/onboarding/run` and polls the returned run ID. In
`apps/api/src/app.ts`, the runner is mounted immediately before adminOnly.
`apps/api/src/index.ts` imports app.ts; Dockerfile copies manifests, builds the
MCP server and API, and starts `apps/api/dist/index.js`. No new deployment env
variable, migration or schedule is introduced.

## What remains

After the orchestrator's review and merge, wait for the API deployment. Petter
runs the workflow once: Actions → Onboard capability → Run workflow, branch
main, mode limitations, slugs all. Existing production-onboarding secret setup
must already be correct; no credential is needed by this build agent.

Then the orchestrator verifies via `GET /v1/capabilities` that the catalogue is
unchanged. That response (and its slug detail) does not expose limitation text;
verify the text itself through
`GET /v1/public/ops/limitations/capabilities/<slug>` against the manifest and
inspect the workflow artifacts for all per-slug outcomes, including deactivated
rows hidden from the public catalogue. These are read-only checks. If a slug
failed, investigate its reason and rerun only that slug in limitations mode.

Read-only pre-merge observations: GET /v1/capabilities returned HTTP 200 with
298 catalogue rows. The public limitations endpoint for page-speed-test returned
HTTP 200 and two older text entries, confirming this is the served text surface.
These observations precede deployment and do not prove the sync has run.

No database was available to this agent. Real PostgreSQL commit/rollback and
production sync remain unexecuted here; tests exercise the real diff helper
with an injected transaction harness. No executor, new capability, manifest,
pricing, vendor, decision or public catalogue contract was changed.

## Verification

Final results are recorded in
`archive/receipts/2026-10-27-test-run-limitations-sync-mode.json`. The receipt
records the base commit plus candidate file hashes because Git metadata is
read-only and the implementation cannot be committed in this environment. An initial broad verification attempt overlapped an accidental
dependency reinstall and is superseded by clean reruns; its environment failures
are not counted as product failures. No source was lost.


- Focused five-file run: 92 passed, zero failed.
- Full apps/api Vitest, with four workers: 5768 passed, 321 skipped, zero failed;
  365 test files loaded. Database-dependent integration tests were skipped
  without a disposable database; production was not used.
- Fail-before run: copied the three new/changed test files into an isolated
  archive of d193c464 with its own dependencies, without switching branches or
  stashing. Of 73 tests, 21 failed and 52 passed. This is 20 new tests plus the
  strengthened existing workflow-pin test. Two new defensive tests (already
  aborted input and malformed data) also pass on main, as expected.
- Independent reviews: technical GO; product GO with two nits, both fixed.
- API typecheck and full root typecheck: passed.
- Production-write guard: passed.
- Every executable root CI check step was exercised. The 56-command check list
  below passed, plus the MCP build, the full API suite and dependency setup.
  The supplied environment had already run npm ci; the reinstall here used
  npm ci --ignore-scripts. Initial typecheck and CEO-brief runs overlapped the
  reinstall and were rerun successfully. CEO briefs retain 15 existing length
  warnings and no errors; no unrelated briefs were edited.
- git diff --check: passed.

### Root CI check commands

| Command | Final result |
| --- | --- |
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

Additional commands: `npm --workspace=packages/mcp-server run build` passed;
`npx tsc --noEmit` in apps/api passed; focused Vitest and full Vitest passed as
above; main-baseline Vitest exited 1 with the expected regression failures;
`npm ci --ignore-scripts` succeeded for both dependency installations;
`npm run handoff:orient` passed; both read-only curl GETs returned HTTP 200.
`node --check .github/scripts/onboard-capability.mjs` passed, and an automated
handoff structure check confirmed Intent: first and no local absolute paths.
`npm run archive:index` regenerated the archive/handoff indexes; its --check
passed. Docs, receipts and context checks were rerun after evidence creation
and passed (receipts retains 19 historical bare-count warnings).

### Tests proven to fail on main

`src/lib/limitations-sync.test.ts`:

- never calls the executor, guarded executor, persistence, hooks, gates or readiness even with discover/fix
- writes only capability_limitations, preserves every capability column and reports observer counts
- reports unchanged with no writes when text and order match
- reports not_found with a reason and no writes for an unknown capability row
- syncs a deactivated row while preserving all its flags
- rolls back on insert failure, reports failed with no committed counts, and allows a later slug
- rolls back on commit failure, reports failed with no committed counts, and allows a later slug
- rolls back if aborted during the diff
- dry-run performs no diff writes even with discovery requested

`src/lib/onboarding-workflow.test.ts`:

- expands all to every real manifest slug only in limitations mode
- accepts up to 1000 explicit slugs only in limitations mode
- runs all sequentially, continues after a slug failure, and reports text outcomes without readiness
- stops limitations batches on 401 / 'unauthorized' at submit or poll
- stops limitations batches on 503 / 'not_configured' at submit or poll
- stops limitations batches on 200 / 'not_configured' at submit or poll
- pins workflow actions to commit SHAs

`src/routes/internal-onboarding-run.test.ts`:

- accepts limitations mode for a deactivated slug and reports updated without readiness
- accepts limitations mode for a deactivated slug and reports unchanged without readiness
- retains limitations not_found with its reason
- retains limitations failed with its reason
- requires the same dedicated secret for limitations mode

### Commit and session-gate limitation

The requested local commit was attempted with
`feat(onboarding): sync limitation text without executing tools`, but Git could
not create index.lock: the environment mounts .git read-only. No commit was
created. All changes remain in the supplied feature-branch clone for the
orchestrator to commit. The receipt captures their content hashes.

`npm run handoff:check` exited 1: uncommitted paths, feature branch in the supplied
clone's trunk position, no feature upstream, and existing landed local/remote
branches. Its remote fetch also failed, so remote findings may be stale. These
cannot be resolved here: .git is read-only, and the task explicitly forbids
pushing or switching branches. Existing branches were not deleted. The
orchestrator handles commit, push, PR and merge under the supplied task scope.

[BACKFILL] Journal: Built and reviewed limitations-only sync; verified with the
receipt above. No global decision or capability was created. External journal
writes were outside the local build-agent scope. Remaining actions are the
orchestrator's commit/review/merge, Petter's one workflow run after deployment,
and the orchestrator's read-only catalogue and served-text verification.
