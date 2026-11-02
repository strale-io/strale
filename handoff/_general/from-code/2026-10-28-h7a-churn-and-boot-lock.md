Intent: Build H7a's conflict-free generated navigation, bounded startup migration lock, and small mechanical SQS/dead-export cleanup; leave all work uncommitted for orchestrator review and shipping.

Branch: `chore/h7a-merge-churn-and-boot-lock`, based on `origin/main` at `2fa97a9e`. No commit, push, PR, deploy, package publication, production database access or settings change was performed.

Evidence: [test receipt](../../../archive/receipts/2026-10-28-test-run-h7a-churn-and-boot-lock.json). Verification results below are completed before this handoff is finalized.

## Generated files

All three files remain tracked because repository readers and the context/closure gates consume them. Removing counts alone or sorting rows cannot guarantee conflict-free additions at the same insertion point. GitHub cannot use a custom merge driver.

The tracked archive/handoff indexes now contain stable directory navigation. Browsing those directories always exposes the current tree; `npm run archive:index -- --detail` prints the full counts/newest-file summary and reverse-chronological intent table to stdout without rewriting tracked files. The archive's authored prose is preserved. The existing CI warning for missing or stale navigation remains; generator tests plant corruption and prove detection and repair. Context CI remains strict through `context:test`.

The authority inventory keeps its `handoff` namespace identity, which the M2 closure register requires, but hashes only its stable README entrypoint. Historical `handoff/` and `archive/` files are excluded from detected-reference discovery as well as from handoff content hashing: adding evidence must not rewrite every authority's reference list. Governance targets retain their existing full hashes. This inventory is a pre-cutover authority inventory, not a content-integrity ledger for historical evidence; receipts retain their separate immutable-blob gate.

The throwaway-repository regression creates a base and branches A/B, each adding a distinct handoff and receipt, invokes real staged regeneration on each branch, commits inside the fixture, and merges without custom drivers. All generated files remain identical to regeneration after merging. Against generators loaded with `git show origin/main:<path>` into an in-checkout scratch folder, the same test reports conflicts in all three generated files. Scratch copies are removed. Real hook tests also retain pathspec-commit refusal, CRLF repair and pre-merge pause/finish coverage for genuinely malformed navigation.

## Startup lock and deploy verification (DEC-20260504-C)

The whole runner takes a session-level advisory lock using `pg_try_advisory_lock`, polling every 250 ms for about 60 seconds. Key `91621622369349` is the reserved bigint key for this runner (ASCII STRALE), bound as a string with an explicit bigint cast. The dedicated postgres-js client has one reserved session, a five-second connection timeout and five-second statement timeout. It never consumes the main pool: blocks 0125, 0127 and 0130 can independently reserve main-pool sessions for CONCURRENTLY, outside a transaction. The finally path unlocks, releases and closes the dedicated session on success or failure; closing also drops the session lock if unlock fails.

Timeout emits `startup-migrations-lock-timeout`, skips every migration and continues boot. An explicit skipped BlockResult makes this visible to the emergency admin caller, which otherwise would return an empty apparent success. Schema validation still runs after the runner; skipping does not bypass it.

Reach verified by reading Dockerfile CMD (`node apps/api/dist/index.js`), its API build step, and `apps/api/src/index.ts:173` (runner import) / `:175` (awaited invocation through `withStartupDbRetry`, before validation/listen). Look for `startup-migrations-lock-acquired`, then `startup-migrations-begin` and `startup-migrations-complete`. During a contended boot, the second process must either acquire after the first releases, or emit `startup-migrations-lock-timeout` and produce no per-block log lines for that invocation.

Post-deploy read-only checks remain for the orchestrator. During an intentionally overlapping boot, inspect `pg_locks` joined to `pg_stat_activity` for this key; at most one granted owner is allowed. After both runners finish, the same query must return no rows (no leaked lock):

```sql
SELECT l.pid, l.granted, a.application_name, a.state
FROM pg_locks l LEFT JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.locktype = 'advisory'
  AND l.classid::bigint = (91621622369349::bigint >> 32)
  AND l.objid::bigint = (91621622369349::bigint & 4294967295::bigint)
  AND l.objsubid = 1;
```

Also confirm the deployed health commit equals the orchestrator's eventual merge SHA. No production check was run here. Unit tests model Postgres session ownership; real PostgreSQL overlap has not been exercised in this environment. Existing startup healthcheck/retry budgets are unchanged.

The migration ledger is byte-identical to origin/main. No migration block was edited, split or moved, no data payload was moved, and no column was dropped. The concurrency regression fails against the original unlocked runner (second invocation enters while the first is paused); exception-release and bounded-timeout tests pass with the lock. Shape probes inspect raw SQL chunks and encoded binds, including lock query bindings, for Date/Buffer values. Per-block behavioral coverage remains in the existing migration suite.

## Every removal and retained backlog

Knip was run pinned to `5.66.0`. Its initial invocation hit the read-only default npm cache; the second needed DATABASE_URL_TEST merely to load drizzle.config.ts. The successful scan used an in-checkout npm cache and a dummy localhost test URL, without connecting to any database. Knip returned findings, not a clean report. Repository-wide reference searches checked tests, scripts and packages before removal; for example `getMarkup` and `getAffectedCapabilityDetails` were retained despite knip reporting them because callers exist.

Removed exports:

- `trust-labels.ts`: `sqsLabel`, `gradeFromScore`, `computeSolutionScore`, `computeSolutionTrend`, `sqlRows`.
- `trust-grade.ts`: `gradeLatency`, `buildPerformanceInfo`, `computeTrustGrade`; their unused types `LatencyGrade`, `PerformanceInfo`, `TrustGrade`, `TrustGradeInfo`.
- `digest-compiler.ts`: obsolete `SqsDistribution` type.
- `email-templates.ts`: `sqsGradeBadge`.

Removed private helpers/data and obsolete fields/displays:

- `trust-grade.ts`: `sqsToGrade`, `latencyToTrustGrade`, `GRADE_ORDER` and the deleted trust-score documentation. Live freshness grading and its types remain.
- `digest-compiler.ts` / `digest-formatter.ts`: zero-filled `buildSqsDistribution`, `sectionSqsDistribution`, `sqsDist`, null `currentSqs`, old `upstreamExclusions` tally and their displays. Historical event-type filtering remains so old records do not surface as new generic alerts.
- `daily-digest/`: always-empty `sqsChanges`, its initializer/return/type, analysis prompt line and email row/renderer.
- `email-templates.ts`: unused `SQS_GRADE_COLORS` palette and the placeholder SQS column in the internal capability table; matching `sqs_score`/`sqs_grade` placeholders were removed from compiler data.
- `interrupt-sender.ts`: stale score metric and frozen-SQS claim. `situation-assessment.ts`: nonexistent score-decay claim. `meta-monitoring.ts` and `capability-field-authority.ts`: stale score comments.

All database columns, retired-field exclusions and immutable migration-block comments remain for the separate ledgered column-drop PR. The remaining scan is saved in [knip findings](../../../archive/sessions/2026-10-28-h7a-knip-remaining.json): 469 file findings and 380 export findings. These include test/script imports, runtime entrypoints and potential false positives, so no broad automatic deletion was attempted. Further SQS-era operational code outside this mechanical slice remains review work.

## Verification and review

- MCP server build and API typecheck: passed.
- Final full API vitest run: 372 files passed, 35 skipped; 7,557 tests passed, 358 skipped. No failed files or unhandled errors. No pre-existing flaky files needed rerunning.
- Initial full API run: failed only in the new lock test (four failures and three unhandled rejections) because I changed the key while workers were running, mixing cached old code with new assertions. This was my verification error, not a flake. The isolated migration files then passed (217 tests), followed by the clean full run above.
- `migrations:check` / `migrations:test`: passed; 73 blocks checked, ledger byte-identical to origin/main. No cert-audit-finding-numbered commit was made.
- `claims:check`, `models:check`, `env:check`, `receipts:check`, `programs:check`, `docs:check`, `archive:index:test`, `handoff:test`: passed. Receipts checking retains its existing historical bare-test-count warnings; this handoff cites its receipt. Hook/index counts and final receipt validation are captured in the receipt.
- `archive:index --check`: fresh. `archive:index --detail`: full listing produced without changing tracked files.
- `context:check`: no warnings after inventory-only regeneration. The full context generator refuses this clone because its guard treats a primary clone as shared; the user explicitly provided an isolated clone, so only the hook's inventory builder was invoked directly. The real Git index/object store is read-only in this environment. Inventory hashes therefore describe the current staged snapshot; orchestrator must stage changes and let the existing pre-commit hook refresh its README hash before committing.
- Experimental context checks using an alternate index/object store were invalid: child fixture repositories inherited that index, causing missing-evidence errors. No real Git index or decision content changed. These attempts are not passing evidence.
- `handoff:check`: expected failure for dirty/unpushed state, primary-clone feature branch and pre-existing merged branches; fetch was unavailable to the gate. No branch was switched or deleted and no push was attempted to satisfy it, per the build-agent instructions.
- Independent technical review: GO, round 1. Product/safety review: GO, rounds 2; inventory namespace identity, explicit timeout skip result and real hook regression coverage were fixed and confirmed. No open high/medium findings. The go skill's verify/review path was applied; user instructions override its commit/push/PR steps. No separate simplify skill was available; the author performed the small simplification pass.

`context:test` also passed normally without an alternate index: 180 tests, zero failures. A focused inventory/current-context run passed separately. The experimental alternate-index runs failed as described above and are not counted as passing evidence.

## Resume

T7 next_action now points to the remaining H7b (do.ts split and one x402 settle), H7c (contract tests), migrations file split with unchanged ledger, and separate ledgered SQS column drop. T7 remains open. Orchestrator owns review, commit, push, PR, merge, deploy and live verification.

[BACKFILL] No external Journal entry was written; this build-agent session records its work here. No global decision or external claim was created or superseded.

## Changed files

- `.githooks/pre-commit`
- `.github/workflows/ci.yml`
- `apps/api/src/lib/capability-field-authority.ts`
- `apps/api/src/lib/daily-digest/analyze.ts`
- `apps/api/src/lib/daily-digest/fetch-platform.ts`
- `apps/api/src/lib/daily-digest/index.ts`
- `apps/api/src/lib/daily-digest/render-email.ts`
- `apps/api/src/lib/daily-digest/types.ts`
- `apps/api/src/lib/digest-compiler.ts`
- `apps/api/src/lib/digest-formatter.ts`
- `apps/api/src/lib/email-templates.ts`
- `apps/api/src/lib/interrupt-sender.ts`
- `apps/api/src/lib/meta-monitoring.ts`
- `apps/api/src/lib/situation-assessment.ts`
- `apps/api/src/lib/startup-migrations-lock.test.ts`
- `apps/api/src/lib/startup-migrations.test.ts`
- `apps/api/src/lib/startup-migrations.ts`
- `apps/api/src/lib/trust-grade.ts`
- `apps/api/src/lib/trust-labels.ts`
- `archive/README.md`
- `archive/receipts/2026-10-28-test-run-h7a-churn-and-boot-lock.json`
- `archive/sessions/2026-10-28-h7a-knip-remaining.json`
- `docs/programs/platform-hardening/tracks.yaml`
- `docs/project/legacy-authority-inventory.json`
- `handoff/README.md`
- `handoff/_general/from-code/2026-10-28-h7a-churn-and-boot-lock.md`
- `scripts/check-project-context.test.mjs`
- `scripts/generate-archive-index.mjs`
- `scripts/generate-archive-index.test.mjs`
- `scripts/handoff/regenerate-indexes.mjs`
- `scripts/handoff/regenerate-indexes.test.mjs`
- `scripts/project-context-lib.mjs`

## Orchestrator follow-ups after review

Independent review (real Postgres 16) returned NO-GO on one item, now fixed: `design/lint-allowlist.json` still listed the six hex colours of the removed digest-formatter SQS section, which made `design:check` fail; the entries are removed and `design:check` passes. Also: the advisory unlock is wrapped so a dead lock session logs `startup-migrations-unlock-failed` instead of failing a completed boot, and the archive and handoff index text no longer claims a pre-commit regeneration it no longer does.
