# API-key spend limits — Round 2

Intent: Fix the account-management boundary and all Round 2 review findings on `feat/api-key-spend-limits`, starting at `4767bab7` (draft PR #761). Leave changes uncommitted for the orchestrator. No production access, publishing or Git mutations.

## Changes

1. Shared `requirePrimaryKey` rejects authenticated additional keys with HTTP 403 `primary_key_required` and "Use the account's primary key for this action". Authorization precedes validation, management side effects and route rate limits. Primary key behavior remains covered by the same route tests. Audit-token reissue and authenticated dispute submission are management, because they issue a sharing credential and start account-holder review respectively. Anonymous signed-audit-token dispute submission remains available. No self endpoint was added.
2. Create counts non-revoked keys while holding the existing wallet management lock. The 26th create returns HTTP 409 `active_key_limit_exceeded`, with "Revoke an unused key first". List is bounded at 25 active keys, excludes revoked keys, and computes usage only for active keys. Revocation frees a slot. No pagination.
3. A failed throttled `last_used_at` UPDATE logs `api-key-last-used-update-failed` with the key ID and still authenticates. Tests assert the structured error log, successful HTTP authentication and absence of plaintext secrets.
4. Migration 0124 uses guarded column/constraint DDL, a `NOT VALID` foreign key, separate guarded validation, concurrent ledger indexes and repair of indexes left invalid by interrupted concurrent builds. Only unmerged M067's hash changed; no merged block or other ledger row changed. The append-only updater was run first and reported no new blocks; M067's hash was then recomputed with `computeCurrentBlocks` from the repository ledger tooling.
5. Recovery continues rotating only the primary key. Additional keys survive and may spend up to their caps. The recovery response, quickstart, OpenAPI and SDK docs tell the owner to review and revoke them with the new primary key. Automatic blanket revocation was deliberately avoided to preserve running agents during primary-key recovery; the primary-only design gives the recovered owner exclusive management authority.
6. The revoked-key test now retains a matching revoked row instead of an empty result. Authentication also defensively excludes revoked/deleted candidates after the SQL filter. The integration IDOR test creates a real second account and key, tries PATCH and DELETE as account A, and verifies the foreign row is unchanged before cleanup.
7. Key cap refusals remain HTTP 429. `errors.ts` has no top-level retry convention; `details.retryable: false` uses its existing structured-details envelope and survives SDK error mapping. Errors direct callers to the owner/primary key.
8. Labels are trimmed, reject Unicode control characters before trimming, and allow 1–64 characters after trimming. POST and PATCH cover LF, tab, CR, NUL, DEL, C1 controls and overlong labels. Public docs/spec/SDK comments reflect these rules and remove the old management-authority wording.

## Route classification

Inventory: every route using required/optional `authMiddleware`, including manual dispute invocations, plus the A2A shared-auth reader. Internal admin routes use separate admin authentication and grant no account-key management authority.

| Route | Classification | Additional key |
|---|---|---|
| `POST /v1/api-keys` | Management: create key | 403 |
| `GET /v1/api-keys` | Management: list active keys | 403 |
| `PATCH /v1/api-keys/{id}` | Management: label/caps | 403 |
| `DELETE /v1/api-keys/{id}` | Management: revoke | 403 |
| `POST /v1/auth/api-key` | Management: rotate primary | 403 |
| `DELETE /v1/auth/me` | Management: account closure/erasure | 403 |
| `POST /v1/wallet/topup` | Management: Stripe Checkout | 403 |
| `DELETE /v1/transactions/{id}` | Management: content erasure | 403 |
| `POST /v1/transactions/{id}/audit-token` | Management: share credential | 403 |
| `POST /v1/transactions/{id}/dispute` | Management: account-holder submission | 403; anonymous signed-token path remains available |
| `POST /v1/do` | Spend/execution (optional auth) | Allowed, both caps enforced |
| `POST /v1/solutions/{slug}/execute` | Spend/execution | Allowed, both caps enforced |
| `GET /v1/wallet/balance` | Read | Allowed |
| `GET /v1/wallet/transactions` | Read | Allowed |
| `GET /v1/transactions` | Read | Allowed |
| `GET /v1/transactions/{id}` | Read (optional auth) | Allowed |
| `GET /v1/transactions/{id}/verify` | Read (optional auth) | Allowed |
| `GET /v1/transactions/{id}/dispute` | Read (manual auth or signed token) | Allowed |
| `GET /v1/capabilities/health` | Read | Allowed |
| `POST /a2a`: `message/send` | Execution forwarded to the spend path | Allowed, underlying caps enforced |
| `POST /a2a`: `tasks/get` | Read through shared key authenticator | Allowed |

Registration/recovery use email proof without account-key authentication; signup creates an account. Public catalog, audit-token readers, web3 and webhook routes use their existing public/token/provider authentication. They do not gain account management through an additional key.

## Migration locks and deploy plan

`runStartupMigrations` calls each block with the database directly, without a transaction. Existing earlier blocks mostly use plain indexes; there was no existing concurrent-index pattern to copy. The new block reserves a postgres-js connection so `SET lock_timeout = '3s'` applies to every statement on that same session, then resets it and releases the connection in `finally`. SET on the pooled executor alone would not guarantee that. Both `wallet_transactions` indexes use `CREATE INDEX CONCURRENTLY IF NOT EXISTS`; invalid remnants are dropped concurrently before retrying. The normal database statement timeout remains in force.

The `information_schema.columns` check skips the ADD COLUMN entirely after the first successful boot, avoiding its ACCESS EXCLUSIVE lock. Foreign-key creation is guarded separately, so partial boots recover. `NOT VALID` avoids scanning while adding the constraint; guarded `VALIDATE CONSTRAINT` scans under SHARE UPDATE EXCLUSIVE, permitting ordinary reads/writes. A lock wait exceeding three seconds aborts startup; a later boot retries. Healthy subsequent boots perform neither wallet-table ALTER nor validation. No historical ledger attribution is backfilled.

Reachability was read in `Dockerfile` (API build and CMD), `apps/api/src/index.ts` (awaits startup migrations before serving), and the runner's `BLOCKS` registration. Production schema proof remains the orchestrator's task, not inferred from logs.

Production row estimate is **unknown: production was not queried**. Before deploying, the orchestrator should run:

```sql
SELECT c.reltuples::bigint AS estimated_rows,
       pg_relation_size(c.oid) AS heap_bytes,
       pg_total_relation_size(c.oid) AS total_bytes,
       s.last_analyze, s.last_autoanalyze
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public' AND c.relname = 'wallet_transactions';
```

Plan by outcome:

- Fresh estimate below 100,000 rows and modest size: run the bounded startup migration, observe duration and index validity, and stop/reassess if it exceeds the normal statement budget. No exclusive lock wait can exceed three seconds.
- At least 100,000 rows or a large relation: pre-apply this same migration under the orchestrator's production-write authority before deploying the dependent API. Run the validation/index builds under supervision in a planned low-traffic window with an explicit statement budget sized from staging measurements; monitor `pg_stat_progress_create_index` and resources. Startup then only checks the completed objects.
- Missing/negative/stale estimate: treat as the large-table case until an operator obtains current statistics or an approved read-only count. Do not interpret an unknown estimate as zero or let repeated failed boots substitute for a preflight.
- Any timeout or invalid index: stop rollout, check lock holders/progress, and retry under supervision; the block repairs invalid named indexes. Record estimated/actual rows, duration and peak resource usage in the deployment evidence.

After deploy, in addition to the existing handoff's column/index queries:

```sql
SELECT conname, convalidated
FROM pg_constraint
WHERE conrelid = 'public.wallet_transactions'::regclass
  AND conname = 'wallet_transactions_api_key_id_fkey';
SELECT c.relname, i.indisvalid, i.indisready
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid = 'public.wallet_transactions'::regclass
  AND c.relname IN ('wallet_transactions_api_key_created_idx', 'wallet_transactions_reference_idx');
```

Expected: validated foreign key and both indexes valid/ready. The orchestrator must also run the disposable-Postgres integration lane and record its real results before treating DB concurrency/recovery/locking proof as complete.

## Verification and fail-before evidence

- Full API suite: `npm --workspace=apps/api test -- --maxWorkers=2` — exit 0, 340 passing files / 32 skipped files; 5,844 passed / 345 skipped tests. See `2026-10-27-api-key-spend-limits-round-2-api-tests.json`. This is the full root `npm test` target with worker concurrency bounded to avoid the resource contention already recorded in Round 1.
- All 57 CI check-job commands after dependency setup and before the full API suite — exit 0 each, including workspace typecheck, migration ledger, production-write guard, every lint/scanner guard and every root register/test command. Each exact command and result is in `2026-10-27-api-key-spend-limits-round-2-ci.json`. `npm ci` had already been run by the orchestrator; it was not rerun because its prepare hook changes read-only Git configuration.
- Non-failing register warnings: archive index is stale and will regenerate in the orchestrator's pre-commit hook; receipts validation reports 19 pre-existing historical handoffs without receipt links. No unrelated historical files were edited.
- Direct API `npx tsc --noEmit` (through workspace exec) — exit 0, after the final test edits. MCP build — exit 0. SDK build — exit 0; SDK tests — 4 passed. `git diff --check` — exit 0. Migration ledger recheck — exit 0, 67 blocks.
- Final focused regression run — 48 passed across three files; application registration's four tests also pass in the full suite. Exact-base proof: candidate 48 pass → exact `4767bab7` source 26 fail / 22 pass → restored candidate 48 pass. See `2026-10-27-api-key-spend-limits-round-2-fail-before.json` for every failing name. Source bytes were restored from in-memory backups in `finally`, without Git writes, commits, clones or worktrees. The standard mutation runner requires a clean committed tree, which this task forbids.
- Those 26 failures cover all ten management-route cases separately, wallet saturation ordering, sequential 25/26-key ceiling, concurrent creates at 24, seven invalid-label cases, last-used swallow visibility, a matching revoked row, actionable/non-retryable cap refusal, both migration-lock/retry tests, and recovery guidance. Compatibility tests for primary keys, allowed reads, anonymous dispute submission and valid labels intentionally remain green.
- The DB test file is authored with real second-account IDOR, concurrent key creation, primary-only management and recovery-survival coverage. `STRALE_REQUIRE_INTEGRATION_DB=1 npm --workspace=apps/api exec -- vitest run src/routes/api-keys.integration.test.ts` — exit 1 before any tests, explicitly refusing unset `DATABASE_URL_TEST`. Local PostgreSQL service-user execution is unavailable (`runuser`: cannot set groups). No real-Postgres claims are made: these cases, including their exact-base directions, remain unexecuted here.
- `npm run handoff:orient` — exit 0. `npm run handoff:check` — exit 1 with seven findings: required dirty work, supplied checkout on the feature branch, three inherited local merged branches and two inherited remote merged branches; fetch was unavailable. Its fixes require forbidden Git actions and were not applied. The orchestrator owns commit/push/cleanup/shipping.
- Read-only live checks: `GET https://api.strale.io/health` — HTTP 200, `{"status":"ok","commit":"388b35b39ef1"}`; `/health/version` — HTTP 404 (curl exit 22). This establishes current service reachability only. No authenticated production requests, production SQL or production writes were attempted.
- Intermediate failures were corrected before the final runs: a malformed inserted OpenAPI object caused an initial typecheck failure; a new recovery-response test initially received 429 because its synthetic request lacked the IP required by the existing abuse limiter. The fixed harness now supplies a documentation-range client IP and a rate-counter result. An earlier exact-base run caught 22 regressions; the final run above expands it to separate route cases and recovery guidance.

Independent technical and product/API reviews returned GO after bounded confirmation reads of the dispute and limiter fixes. No open HIGH/MEDIUM findings. The simplify skill is unavailable in this session; a manual simplification review was completed. No PR, push, merge, package publication or production operation was performed. Frontend `llms.txt` auth/endpoint documentation remains a cross-repo follow-up for the orchestrator.

## Changed files

- API auth/policy: `apps/api/src/lib/api-keys.ts`, `errors.ts`, `middleware.ts`.
- Migration: `apps/api/src/lib/startup-migrations.ts`, `startup-migrations.ledger.json` (only unmerged M067 hash).
- Routes: `apps/api/src/routes/api-keys.ts`, `auth.ts`, `wallet.ts`, `transactions.ts`, `dispute.ts`.
- Tests: `apps/api/src/lib/api-keys.test.ts`, `apps/api/src/routes/api-keys.test.ts`, `api-keys.integration.test.ts`, new `primary-key-boundary.test.ts`.
- Contract/docs: `apps/api/src/openapi.ts`, `docs/api-quickstart.md`, `packages/sdk-typescript/README.md`, `src/client.ts`, `src/types.ts`, `test/api-keys.test.mjs`.
- Handoff: `handoff/_general/from-code/2026-10-27-feat-api-key-spend-limits.md` (Round 2 section and removal of obsolete authority wording).
- Evidence: this report, adjacent `round-2-ci.json`, `round-2-fail-before.json`, `round-2-api-tests.json`, and `archive/receipts/2026-10-27-test-run-api-key-spend-limits-round-2.json`.

## Remaining disposable-database commands

With a fresh loopback `strale_test` PostgreSQL and the placeholder secrets from the CI `integration-db` job, run from `apps/api`:

```sh
export DATABASE_URL_TEST='postgresql://postgres:test@localhost:5432/strale_test'
node scripts/assert-disposable-test-db.mjs
npx drizzle-kit push --force
DATABASE_URL="$DATABASE_URL_TEST" npx tsx scripts/apply-startup-migrations.ts
STRALE_REQUIRE_INTEGRATION_DB=1 npx vitest run --no-file-parallelism integration.test.ts
```

These commands are for a disposable test database only. Production steps left are the row-count/size preflight, supervised migration plan chosen from its outcome, and the post-deploy read-only schema queries above; production write authorization belongs to the orchestrator.
