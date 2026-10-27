Intent: Add several API keys per account with hourly/lifetime spending limits, preserving the primary key and x402; build and commit locally for the orchestrator to review and ship.

Branch: `feat/api-key-spend-limits`, based on `10f71df8`.

## Implementation

- Additive `api_keys` storage, nullable `wallet_transactions.api_key_id`, prefix/user/ledger/reference indexes. No primary-key migration or rewrite.
- Mandatory/optional auth and A2A ownership lookups share prefix lookup plus constant-time SHA-256 comparison. Closed accounts and revoked keys cannot authenticate. Unknown/revoked errors are identical.
- Last-use updates skip fresh rows and use a SQL conditional update, permitting at most one actual write per minute per key across replicas. No plaintext persistence or logging; creation alone returns the generated value, with `Cache-Control: no-store`.
- Sync calls check limits after the wallet `FOR UPDATE` lock, then execute, then debit on success. Existing async/solution reserve/capture/release ordering remains; reservations count immediately. The debit service writes the nullable key ID in its ledger insert; reservations forward the same ID. Primary debits retain null.
- Key spending comes from purchases less refunds matched by wallet and original reference. Rolling-hour usage follows purchase time, so late refunds cannot offset unrelated new spending. The existing account hourly policy also applies to additional keys. Caps are read again under the wallet lock, including revocation. x402 has no new key policy.
- Authenticated `POST/GET /v1/api-keys`, `PATCH/DELETE /v1/api-keys/{id}`. Ownership-scoped queries; non-negative integer cents, zero blocks paid calls, null removes caps. Shared 5 requests/second/account management limit. Mutations recheck account closure after acquiring the wallet lock.
- The primary key revokes additional keys; it remains available/recoverable. Cap changes and revocation serialize with debits; a call already holding the lock can finish first.
- Account closure anonymizes additional-key labels, hashes, prefixes and last-use metadata, revokes keys, and retains IDs/account links for ledger attribution.
- OpenAPI, API quickstart, SDK methods/types and SDK tests added. No package publication or frontend change. Platform facts unchanged because no fact there changed.

## Validation checkpoint

Focused key tests: 22 pass, plus 4 application route-registration/auth tests; SDK build and 2 tests pass. Workspace typecheck and direct API typecheck pass. All 57 CI check-job commands ran, including migration ledger, production-write access, all lint/scanner guards and register tests. The early OpenAPI type error was corrected and the full workspace typecheck rerun successfully. Final full suite: 5,818 passed, 334 skipped (339 passing files, 32 DB-gated skipped files), using `npm --workspace=apps/api test -- --maxWorkers=2`. Evidence: `archive/receipts/2026-10-27-test-run-api-key-spend-limits.json`. Every CI command and its result is listed in `archive/sessions/2026-10-27-api-key-spend-limits-checks.md`.

The initial full API run after implementing the feature passed 5,813 tests with 334 skips. Overlapping subsequent reruns hit unchanged search-performance thresholds and one verify-route timeout. No test threshold or unrelated code was changed; the final full-suite run limits workers to two to remove that resource contention.

Fail-before checks use the repository mutation runner, with green baseline, expected failure, restore and green confirmation. Restoring exact main versions of auth middleware, SDK client and app wiring produces failures in the corresponding new tests. Removing caps, adding a Date bind, exposing a stored hash, dropping debit attribution and removing migration registration are also caught. These are distinct from real-DB concurrency proof, which remains pending.

The CI DB command was attempted with `STRALE_REQUIRE_INTEGRATION_DB=1`: it fails closed before tests because `DATABASE_URL_TEST` is unset. PostgreSQL 16 binaries exist, but this container maps only UID 0; PostgreSQL refuses root and the sandbox rejects switching to another UID. Real concurrency/migration-idempotency integration tests are authored in `api-keys.integration.test.ts`; execution requires the disposable CI Postgres lane. No production DB was accessed.

## Deploy mechanism (DEC-20260504-C)

`Dockerfile` builds `apps/api`, then CMD runs `apps/api/dist/index.js`. `apps/api/src/index.ts` imports and awaits `runStartupMigrations()` before listening. Its `BLOCKS` list includes `runMigration0124_apiKeys`, the ledgered additive DDL block creating this table and attribution column/indexes. The block uses guarded idempotent DDL; Round 2 adds separate validation and concurrent index creation. No manual production migration is needed or authorized in this build session.

After the orchestrator deploys, execute these read-only production checks and record their results:

```sql
SELECT to_regclass('public.api_keys') AS api_keys;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'api_keys'
       OR (table_name = 'wallet_transactions' AND column_name = 'api_key_id'))
ORDER BY table_name, ordinal_position;
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname IN (
  'api_keys_prefix_idx', 'api_keys_user_idx',
  'wallet_transactions_api_key_created_idx', 'wallet_transactions_reference_idx'
) ORDER BY indexname;
```

Expected: `api_keys`, ten key columns, nullable UUID debit attribution, and all four named indexes. Post-deploy query results are pending, since deployment and production operations belong to the orchestrator.

## Fail-before mapping

- Exact main `lib/middleware.ts`: additional-key authentication through required/optional middleware fails (401 instead of 200).
- Exact main `app.ts`: all four endpoint registration/auth tests fail (404 instead of 401).
- Exact main SDK client: the new key-management-method test fails because methods are absent.
- Feature-removal mutations: hourly/total cap refusal tests, primitive-bind tests, secret-free metadata tests, sync/async debit-attribution test, and boot-registration test each fail for the matching mutation. Each mutation was bracketed by green baseline and restored green runs.
- Compatibility assertions for primary keys intentionally remain green. The DB concurrency, real auth/revocation, refund, async/solution, closure and idempotent-DDL tests are in CI's DB harness, but their fail-on-main/pass-on-feature direction could not be executed locally. Do not claim that proof is complete.

## Follow-up and limitations

- Orchestrator owns push, PR, merge, deployment, disposable-Postgres integration run and post-deploy proof. This build session must not perform those actions.
- Dashboard UI and `strale-frontend/public/llms.txt` endpoint/auth documentation are follow-up; frontend excluded by request.
- Round 2 adopts the orchestrator decision: additional keys spend and read; only the primary key manages the account.
- Original checkout Git metadata is read-only, so local commits were made in a separate writable isolated worktree and exported as `strale-api-key-spend-limits.bundle`. The supplied workspace contains the source changes. No push or remote branch modification occurred.
- `handoff:check` was run and remains red: the feature branch has no pushed upstream, and inherited merged branches remain. Pushing belongs to the orchestrator; inherited branches were left untouched. The writable worktree's pre-commit handoff gate passed.
- Independent review: product/API GO in round 1; correctness GO after round 2 confirmed revocation checks precede balance responses. See `archive/sessions/2026-10-27-api-key-spend-limits-review.md`. The unavailable simplify skill was replaced with a manual simplification review.
- [BACKFILL] Journal: built additional-key storage/auth/ledger caps/management/SDK; orchestrator shipping, real-DB verification and production schema proof remain outside this build session. Independent code reviews completed without open findings.

## Round 2

- Implements the orchestrator's primary-only management decision with shared `requirePrimaryKey`: additional keys get 403 `primary_key_required` on key create/list/update/revoke, primary rotation, account closure, transaction erasure, audit-link reissue, wallet top-up and authenticated dispute submission. Signed-token data-subject disputes remain available. Wallet authorization precedes rate limiting, including when the key has exhausted its read quota.
- Maximum 25 non-revoked additional keys, checked inside `withManagementLock`; overflow is 409 `active_key_limit_exceeded` with "Revoke an unused key first". List is bounded at 25 active keys and excludes revoked keys. Labels are trimmed, reject control characters before trimming and cap at 64 characters.
- Timestamp-update failure logs `api-key-last-used-update-failed` and does not fail authentication. Key cap refusals remain 429 with `details.retryable: false`. Revoked-row and second-account IDOR tests are strengthened.
- Email recovery rotates only the primary key. Additional keys survive and can still spend up to their caps; response/docs instruct the owner to review and revoke them. Preserving running agents is the reason blanket revocation was not added.
- Migration runner is outside transactions. M068 now reserves one session for a three-second lock timeout, guards wallet ALTERs via catalog checks, adds the FK `NOT VALID`, validates separately, builds ledger indexes concurrently and repairs invalid interrupted builds. Only this unmerged ledger row's hash changed using repository hash tooling; updater found no new rows. Healthy later boots skip wallet ALTER/validation.
- Production row estimate is unknown. The exact `pg_class.reltuples`/size query, small/large/unknown-result plans, deploy reachability and post-deploy constraint/index queries are in [the Round 2 report](../../../archive/sessions/2026-10-27-api-key-spend-limits-round-2.md), alongside the complete route classification.
- Independent technical and API/product reviews are GO after confirmation of the dispute and limiter fixes. The unavailable simplify skill was replaced by a manual simplification pass. No open HIGH/MEDIUM findings.
- No production database access or writes. Read-only live check: `GET /health` returned 200 with `{"status":"ok","commit":"388b35b39ef1"}`; `GET /health/version` returned 404. Neither proves this uncommitted code is deployed. Git is read-only; changes remain uncommitted and nothing was pushed, merged or published. No clone, bundle or worktree was created.
- `handoff:check` remains red: required uncommitted work, feature branch in the supplied checkout, and five inherited merged branch entries. Its suggested Git mutations conflict with this task; the orchestrator owns them. `npm ci` was supplied as already completed and was not rerun, since its prepare hook changes Git configuration.
- [BACKFILL] Journal: Round 2 fixes complete locally; the orchestrator owns shipping, disposable-Postgres execution and production evidence. Validation: full API 5,844 passed / 345 skipped; focused regression 48 passed, 26 failed against exact `4767bab7`, restored 48 passed; SDK 4 passed; all 57 CI check-job commands and direct API typecheck passed. Evidence: `archive/receipts/2026-10-27-test-run-api-key-spend-limits-round-2.json`. Detailed per-command results and unexecuted DB cases are in the Round 2 report.
