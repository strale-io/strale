Intent: Implement H3 deploy-time manifest text sync, actionable drift checks, real-traffic guaranteed-field monitoring and route/spec parity.

Built on `feat/manifest-text-sync` from `origin/main` at `0e7c0b2b`. Full session.
Changes are deliberately uncommitted for the orchestrator. No production DB,
settings, credentials, package publishing, push, PR or merge was used.

Evidence: [H3 receipt](../../../archive/receipts/2026-10-27-test-run-manifest-text-sync.json).
The receipt records a dirty working tree against the base commit, not a claim
that the implementation was already committed or deployed.

## Implementation and authority

- Docker's existing `CMD` runs `apps/api/dist/index.js`. Its `main()` runs the
  append-only migrations and schema validation, then `serve()`. The listen
  callback dynamically imports and fires `applyManifestText()` without awaiting
  it. Import/run failures produce a warning summary and leave the API serving.
- Migration 0128 adds only nullable `capabilities.manifest_text_hash text`,
  without a default, after an information-schema existence guard. It is
  ledgered. The column is internal sync bookkeeping, exempt from authoring
  authority and execution-declaration digests with explicit reasons.
- Capability columns written: `name`, `description`, `category`, `data_source`,
  `input_schema`, `output_schema`, `output_field_reliability`, plus the internal
  `manifest_text_hash`. Limitations use the existing `capability_limitations`
  diff: `title`, `limitation_text`, `category`, `severity`, `workaround`, order
  and normal persistence bookkeeping. No `onboarding_manifest` rewrite.
- Reuses canonical-sync `buildAssignments`, text-only limitations validation,
  `manifestLimitationsToRows`, `sanitizeLimitationTitle` and
  `diffAndUpdateLimitations`. No executor, vendor, test-suite generation or
  onboarding hook runs. Missing capability rows are never created.
- Uses the existing `catalogue_metadata_sync` authority, with DEC-20261027-B.
  Price, free tier, active, visible, x402, lifecycle and transparency remain
  unchanged; tests assert the complete allowed capability patch and preservation.
- Compliance/methodology is a conservative union of manifest and current DB
  category (`compliance`, `methodology`, KYB/KYC) or GDPR classification
  `screening_signal` / `risk_synthesis`. Such rows report differing field names
  and write nothing, including no hash checkpoint. The DB classification is
  checked again under the row lock, so a stale manifest cannot remove the guard.

Manifest-derived report-only list (the DB may add more):

`adverse-media-check`, `aml-risk-score`, `beneficial-ownership-lookup`, `breach-exposure-check`, `company-status-check`, `cz-unreliable-vat-payer`, `domain-reputation`, `eu-regulation-search`, `fr-bodacc-lookup`, `french-insolvency-check`, `gdpr-website-check`, `gleif-l2-children-lookup`, `gleif-l2-ubo-lookup`, `insolvency-check`, `invoice-counterparty-check`, `no-bankruptcy-check`, `pep-check`, `risk-narrative-generate`, `sanctions-check`, `uk-cop-check`, `uk-disqualified-director-check`, `us-court-search`, `us-ein-match`, `us-sec-filings-extended`.

## Bounded first run (DEC-20260504-B)

The cap is **400 candidate rows per boot**, including report-only transactions,
not 400 successes. Pending hashes are selected before unchanged rows, so later
boots reach deferred updates. Each candidate gets its own transaction; one
connection/transaction is outstanding at a time, with a 1-second lock timeout
and 5-second statement timeout. A rollback is logged and the next row proceeds.
No external API calls, traffic replay or paid probes occur.

The review measured about 260 live limitation mismatches. That is an upper
estimate of limitation rewrites, not a new production measurement. Compliance
rows remain report-only. First boot also checkpoints text-clean eligible rows,
so `updated` counts successful sync/checkpoint transactions, not only visible
copy changes. Today's 356 manifests imply at most 332 manifest-eligible writes
before the current DB's additional compliance guards/missing rows are applied;
400 covers that bounded catalogue and leaves explicit `deferred` counts as it grows.

Measured local authoring corpus: 990,339 bytes of text payload, 771 limitations,
32,902 bytes for the largest payload. At the corpus average, 260 changed tools
means about 563 new limitation rows and a comparable number of old rows removed,
plus capability/checkpoint updates. Payload is about 0.95 MiB for the entire
corpus; WAL/TOAST/index overhead is not measured here (budget single-digit to
low tens of MiB, rather than assuming payload bytes equal WAL). There is no
production volume, replication-lag or first-run timing evidence in this session.
The bound replaces an unbounded bulk transaction and prevents pool saturation.

Look for one `manifest-text-sync-summary` line with `updated`, `unchanged`,
`report_only`, `failed`, `deferred`, `limit` and the authority. Zero updates
with any failures logs at **warn** level. Row failures are separately visible.

## Drift and deploy verification (DEC-20260504-C)

The read-only sweep derives every manifest-owned scalar/JSON column from
`FIELD_CATEGORIES` and also compares active ordered relational limitations.
DB/hybrid differences, including transparency, are printed for human review
and do not fail strict mode. `--strict` returns 1 for manifest-owned differences,
2 for an incomplete/failed sweep, and 0 when clean. Missing DB rows are counted,
not implicitly onboarded. An empty existing-row scan fails closed. `--apply`
is refused; the old mutation escape hatch cannot publish compliance text.

Weekly drift now passes `--strict` using its existing `secrets.DATABASE_URL`.
The connection itself requests `default_transaction_read_only`, even if the
existing credential has broader permissions. No secret was inspected here.
The post-deploy workflow does not bind a read-only DB credential: a verified
read-only `DATABASE_URL` secret/binding is the exact missing input. The command
is callable there once its holder supplies that binding; this change keeps DB
execution in the existing weekly workflow.

After the orchestrator deploys:

1. Confirm the served commit and the `manifest-text-sync-summary` log, with
   no failed/deferred rows. Investigate `manifest-text-report-only` differences;
   Petter publishes any compliance/methodology claim changes.
2. Read `GET /v1/public/ops/limitations/capabilities/iban-validate`; its first
   title must be `IBAN checks do not confirm an active account`.
3. With a read-only DB credential, run from `apps/api`:
   `npx tsx scripts/sweep-manifest-drift.ts --strict`.
   Expected `manifest_owned_differences: 0`. Any report-only or other canonical
   metadata differences still fail this verifier and need the appropriate
   owner; they are not waived because the automatic writer is narrower.
4. Record first-success duration, actual rows, WAL/space and replication impact
   before calling the bulk/deploy verification complete. This session did not deploy.

## Guaranteed fields on real traffic

Piggyback reads `output_field_reliability` for each real call and reuses the
existing `checkGuaranteedFieldsPresent` sentinel. The sentinel now resolves
paths through the single shared `getNestedValue`, also used by the runner,
onboarding assertion verifier, audit tests, remediation and both fixture sweep
scripts. The active strict-presence semantics stay intact: null, empty strings,
false, zero and empty collections count as present; absent/undefined dotted
values do not. All missing fields are persisted in the existing piggyback
result's failure reason. No customer values enter alerts.

Alert threshold: **strictly above 10% missing for a field after at least 20 calls
for its tool in one hour**. Two misses in 20 calls do not alert; three do. This
avoids paging on isolated misses while detecting repeated broken guarantees.
Counters use process-local tumbling windows; replicas/restarts have independent
sample floors. Persistent per-result field evidence survives restarts, but this
is not a cross-replica/global rate estimator. One extra indexed capability read
per monitored call gets the current reliability metadata.

The existing alert path receives field counts and call denominator. Successful
alerts are suppressed for the window; unsuccessful delivery permits at most
three attempts, spaced by at least one minute, driven by subsequent traffic.
No reliability or public claim is changed. Compliance/methodology alerts reserve
publication for Petter; other tools receive an investigation/narrowing proposal.

## Numeric claims and OpenAPI

Confirmed #771 already scans root/package READMEs, package.json descriptions,
server.json/listing configs and source discovery surfaces. Its forbidden numeric
claim rule rejects fixed tool/country/solution counts. `claims:check` and its
plant tests ran. The separate platform-facts drift guard is retained: it also
checks stale vendor aliases, retention wording and optional sibling-frontend
consumers using its TypeScript facts module. Folding that behavior into the
register checker is a larger semantic migration than the numeric rule, so this
batch does not remove or weaken its existing weekly step.

Added 27 REST paths, plus GET on the existing dispute path (28 operations):
platform facts, capability health, transaction verification/audit/dispute reads,
agent signup, demand signals/categories, solution execution, four Web3 methodology
reads and 15 public-ops reads (test histories/runs/examples, dependency health,
situations, trust batches, limitations, events and readiness). Required signup,
solution and trust-batch inputs/auth are documented. Response bodies remain open
where no canonical response schema exists.

An explicit exact-operation internal list explains admin/internal endpoints,
404-blocked public-ops aliases, probes, signed webhooks, redirects, discovery and
protocol transports including MCP/x402. The parity test walks real Hono
registrations, normalizes path parameter names, checks methods both ways and
rejects stale exclusions. Counted middleware registrations keep `.all()` handlers
visible, including extra registrations at an existing middleware path. Planted
GET, ALL, same-path ALL and nonexistent-spec operations demonstrate failure.

## Verification and limitations

Final full API suite: **6,500 passed, 347 skipped, 0 failed** across 356 passing
and 34 skipped files (390 total), linked to the receipt above. The new disposable
DB test is one of the skips. Final focused path/sentinel/onboarding/piggyback
checks also passed. Full workspace `npm run typecheck` and explicit API
`npx tsc --noEmit` passed. Earlier runs caught the migration inventories,
integration-lane safety pattern and declaration disposition; these were fixed.
A new dotted-onboarding assertion initially exposed the old top-level sentinel;
reusing that sentinel with the shared path lookup fixed it without altering the
adopted null-presence semantics.

Every one-line command in CI's root `check` job ran, plus the multiline archive
index check and explicit requested checks. Results below are the latest run;
initial failures and corrected reruns are retained in the receipt's raw data.

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
| `node apps/api/scripts/check-pii.mjs --strict` | Pre-existing ignored-snapshot failure (see below) |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npm run programs:check` | PASS |
| `node --test scripts/production-watch/*.test.mjs` | PASS |
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
| `npm run archive:index:test` | PASS |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS |
| `npm run gates:test` | PASS |
| `npm run handoff:test` | PASS |
| `npm run context:check` | PASS |
| `npm run context:test` | PASS |
| `npm test` | PASS |
| `npm run handoff:check` | Expected failure; orchestrator-owned Git state (see below) |
| `node scripts/generate-archive-index.mjs --check` | PASS |
| `cd apps/api && npx tsc --noEmit` | PASS |


- Local real-DB attempt: `runuser -u postgres -- psql --version` failed with
  `runuser: cannot set groups: Operation not permitted`. Postgres 16 binaries
  exist, but `pg_isready` reports no server and Docker has no daemon/socket.
  No real local apply run was possible; this is not recorded as a pass.
- Added `manifest-text-sync.integration.test.ts` using the existing loopback
  test-DB guard, deferred DB import and sanctioned skip pattern. CI's existing
  `vitest run --no-file-parallelism integration.test.ts` selects it after schema
  push and startup migrations. It seeds a test-only row, verifies JSONB/limitations,
  preserves serving fields and verifies the second run skips. Disposable CI
  execution remains to be observed by the orchestrator.
- `check-pii --strict` fails on the pre-existing ignored snapshot
  `audit-output/empty-gates-5tqZyP` (created before this session); its copied files
  no longer match their normal path-based allowlist. No unrelated snapshot or
  allowlist was changed to hide that finding.
- `handoff:check` is expected to fail under the orchestrator contract: dirty
  uncommitted branch, clone treated as trunk, upstream points to origin/main,
  and pre-existing merged branches. No push/branch switch/deletion/commit was
  performed to satisfy it. The fresh handoff supplies the resume surface.
- Required `go` review applied without shipping. Two fresh read-only contexts
  reviewed technical and product lenses, two rounds. No high findings. Medium
  findings fixed: report throttle, alert delivery retries, required endpoint
  inputs and ALL-handler coverage (including same-path additions). The final
  same-path fix was author-verified after product round 2. The final sentinel
  reuse keeps the adopted null/presence contract. No unavailable `simplify`
  skill was invoked; author simplification reused the existing sentinel and
  compacted repetitive route inventory data.

[BACKFILL] Journal: H3 implementation is ready for orchestrator review subject
to the recorded PII/local-DB/deploy verification limits. No Notion write made.

## Round 2

This section supersedes Round 1's strict-sweep and piggyback descriptions above.
Changes remain uncommitted on the same feature branch for the orchestrator.
No production database or settings were accessed or changed.

- `manifest-publication-policy.ts` now exports the exact `TEXT_COLUMNS` list
  used by both the writer and drift classifier, alongside their shared
  `isReportOnly` guard. The sweep prints four sections: sync-writable drift;
  report-only tools **awaiting Petter's publication**; manifest columns the
  sync does not write; DB/hybrid-owned columns. Only the first contributes to
  strict drift failure (exit 1). Incomplete/failed sweeps still exit 2.
  After a complete sync, report-only and non-synced drift can remain while
  strict mode exits 0. Post-deploy expectation is now
  `sync_writable_differences: 0`.
- Guaranteed-field misses are measure-and-alert only. `schemaValid` and
  `test_results.passed` retain their original schema-validation meaning,
  preserving promotion and public pass-rate attribution. `failureReason`
  records missing field paths even on a passing row, and preserves the schema
  failure reason when both apply. The alert window alone consumes the misses.
  Reliability metadata is cached per slug for five minutes, with concurrent
  reads coalesced and failed reads evicted, instead of a capability SELECT on
  every call. There are no reliability/claim writes.
- The row lock is `FOR NO KEY UPDATE`, allowing transaction FK `KEY SHARE`
  locks while still serializing catalogue writers. A reserved postgres-js
  session owns `pg_try_advisory_lock(728103, 1)` for the entire run; lock-busy
  boots skip at info. Row transactions retain the original API pool (max 30),
  and the reserved session is unlocked and released in `finally`. The lock
  consumes one pool slot alongside one row-transaction slot. A raw reserved
  postgres-js handle is deliberately not passed to Drizzle: it lacks the
  runtime client methods Drizzle needs.
- `textPayload` independently validates a nonempty limitations list, including
  injected sources which bypass file parsing. Empty/missing lists refuse the
  row and preserve stored limitations. Failure logs reuse `describeFailure`
  for error names, SQLSTATE (including a Drizzle-wrapped cause), and Zod paths
  and issue codes. Error messages, query text, bind values and stacks are not
  logged by this path.
- The hash-only skip is intentional: an out-of-band DB edit with an unchanged
  manifest hash is caught by the weekly sweep, not repaired on the next boot.
- Block 0128 now sets a three-second transaction-local `lock_timeout` with
  `set_config` inside the same guarded `DO` statement as the ALTER. This works
  without a reserved runner connection and cannot leak to the next pool user.
  It adds a nullable text column without a default or table rewrite. Only this
  branch's uncommitted new block and its new ledger hash changed; no historical
  migration block was rewritten. Block 0126 in this checkout does not actually
  set a timeout; 0128's single-statement scope supplies the requested protection.

H3 follow-up proposal (not implemented): the one-hour process-local window
and 20-call minimum mean most tools rarely alert, especially across replicas
or restarts. Add a weekly SQL check over persisted piggyback misses and the
per-tool/field denominator across all replicas. It should include passing rows
with a guaranteed-miss marker, preserve schema-only pass-rate/promotion logic,
and remain measure-and-alert only. The process-local alert is supplemental
coverage, not a catalogue-wide weekly guarantee.

The post-Round-2 confirmation read found an unsupported reserved-client Drizzle
adapter; it was removed, including the mock that hid it. The reviewer then
confirmed the dedicated-lock-session/original-row-pool fix with no remaining
blocker. The author simplification pass reused the existing failure formatter
and publication policy. No third broad review round or shipping action ran.

Round 2 adds regressions for strict success after a complete sync with
report-only/non-synced drift, strict failure after writable text drift,
NO KEY UPDATE, lock-busy skipping/release, empty and missing limitations,
SQLSTATE/Zod log details without values, schema-only pass attribution and
cache expiry. The disposable-Postgres suite also exercises actual advisory-lock
contention and empty-list preservation when a test DB is available.

The first full suite caught this session's type-only top-level DB import in
the integration test. The lane safety test treats that import like any other
DB import. It was removed in favour of the existing deferred-import type;
the lane test, focused regressions and API typecheck passed on the correction.
This failure is retained in the Round 2 receipt rather than hidden.

Remaining verification for the orchestrator:

- On a disposable loopback PostgreSQL database whose name contains `test`,
  after schema push/startup migrations, run from `apps/api`:
  `STRALE_REQUIRE_INTEGRATION_DB=1 npx vitest run --no-file-parallelism src/lib/manifest-text-sync.integration.test.ts`
  with `DATABASE_URL_TEST` set to that disposable database. This session has
  no configured local test DB, so these tests skip; Round 1's independent real
  Postgres results supplied in the prompt are not relabelled as Round 2 proof.
- After deployment, retain the earlier served-SHA, stored limitation title,
  duration/resource-impact and read-only strict-sweep checks above. Confirm
  `manifest_text_hash` exists and writable rows have a checkpoint with a
  read-only query, for example:
  `SELECT slug, manifest_text_hash FROM capabilities WHERE slug = 'iban-validate';`
  Only sync-writable drift should fail strict mode. Report-only publication
  remains with Petter. No production command was run in Round 2.

[BACKFILL] Journal: Round 2 repairs strict scope, pass attribution and sync
locking/guards; H3 weekly persisted-miss coverage remains a proposed follow-up.
No Notion write was made.

### Round 2 verification results

Evidence: [Round 2 receipt](../../../archive/receipts/2026-10-27-test-run-manifest-text-sync-round-2.json), written fresh via stdin.

Final full API suite: **6,509 passed, 349 skipped, no failures**; final focused
repair/lane/limitations tests: **252 passed, three skipped**. The earlier broader
touched-tests selection passed with **281 passed, three skipped**. Full workspace
typecheck and explicit API typecheck passed. All root CI check-job commands
ran, including npm ci, builds and the archive-index check. Hosted image-boot
and real-Postgres jobs were not executed locally. The PII snapshot failure
and orchestrator-owned Git-state failure remain as described above.

Commands below are in execution order, preserving the initial full-suite
failure and corrective reruns. `handoff:orient` and `git diff --check` also passed.

| Command | Actual result |
|---|---|
| `npm ci` | PASS |
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
| `node apps/api/scripts/check-pii.mjs --strict` | FAIL (exit 1) |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npm run programs:check` | PASS |
| `node --test scripts/production-watch/*.test.mjs` | PASS |
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
| `npm run archive:index:test` | PASS |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS |
| `npm run gates:test` | PASS |
| `npm run handoff:test` | PASS |
| `npm run context:check` | PASS |
| `npm run context:test` | PASS |
| `npm test` | FAIL (exit 1) |
| `node scripts/generate-archive-index.mjs --check` | PASS |
| `cd apps/api && npx tsc --noEmit` | PASS |
| `cd apps/api && npx vitest run src/lib/manifest-text-sync.test.ts src/lib/manifest-text-sync.integration.test.ts src/lib/manifest-drift.test.ts src/lib/piggyback-monitor.test.ts src/lib/startup-migrations.test.ts src/lib/onboarding-pipeline.test.ts src/lib/guaranteed-fields-sentinel.test.ts src/lib/nested-value.test.ts src/lib/capability-field-authority.test.ts src/openapi-routes.test.ts` | PASS |
| `npm run handoff:check` | FAIL (exit 1) |
| `cd apps/api && npx vitest run src/lib/manifest-text-sync.test.ts src/lib/manifest-text-sync.integration.test.ts src/lib/manifest-drift.test.ts src/lib/piggyback-monitor.test.ts src/lib/startup-migrations.test.ts src/lib/limitations-sync.test.ts src/test-support/integration-lane.test.ts` | PASS |
| `cd apps/api && npx tsc --noEmit` | PASS |
| `npm test` | PASS |

Round 2 files changed: `apps/api/scripts/sweep-manifest-drift.ts`;
`apps/api/src/lib/manifest-drift.ts` and its test;
`manifest-publication-policy.ts`; `manifest-text-sync.ts` and its unit/integration
tests; `piggyback-monitor.ts` and its test; `limitations-sync.ts`;
`startup-migrations.ts`, its test and the new 0128 ledger hash; this handoff,
the fresh receipt and generated archive index. Other dirty branch files
were retained from Round 1. No commit, push, branch switch, PR, merge or
package publication was performed.

After writing the fresh receipt and regenerating indexes:

| Command | Actual result |
|---|---|
| `npm run receipt -- --kind test-run --topic manifest-text-sync-round-2 --from -` | PASS; new receipt written from stdin |
| `npm run archive:index` | PASS |
| `npm run receipts:check` | PASS; historical bare-count warnings only |
| `npm run docs:check` | PASS |
| `node scripts/generate-archive-index.mjs --check` | PASS |
| `git diff --check` | PASS |
| `npm run handoff:check` | Expected exit 1: dirty branch, no own upstream, clone/trunk classification and existing merged branches; no remote fetch available |
