Intent: Implement H4 on `feat/money-path` from `e871a2ad`: release database connections during sync paid execution, enforce the caller deadline, and atomically claim gateway x402 payments before execution. Leave the changes uncommitted for orchestrator review. No production access, deployment, paid calls, commit, push, PR or merge was performed.

## Design and behavior

- Sync wallet calls use the existing durable reservation state machine. New `mode='hold'` reservations earmark funds without debiting them. The existing `mode='debit'` remains the default for async and solutions. Migration `0130_syncWalletHolds` adds `mode` and nullable `api_key_id`, with 3-second branch-local lock limits, no backfill, and ledger entry M073.
- Reserve takes the wallet `FOR UPDATE` lock, then reads open holds in a separate statement after acquiring the lock. This avoids a stale statement snapshot after waiting for another reservation. The short transaction checks spendable balance, account hourly cap and additional-key hourly/total caps, inserts the executing transaction and hold, and commits. Executing transaction prices already count toward the account cap; open holds now count in both additional-key caps. Captured holds leave that sum as their purchase enters it, without double counting.
- Execution keeps `executeWithTransientRetry` but holds neither transaction nor connection. Success writes final output, audit and completed status together with hold capture and a wallet-service purchase ledger entry in a short transaction. The returned `wallet_balance_cents` is the ledger balance after capture. H5 cost persistence and receipt settlement remain after commit. Failure releases the hold without a purchase or refund ledger row.
- Wallet-service affordability now excludes all open holds, including competing legacy debits. The solutions route uses the shared locked spendable balance lookup so insufficient available funds retain HTTP 402 instead of leaking an internal error. Its response/refund balance remains the ledger balance. Wallet closure forfeits actual ledger balance, not ledger balance minus holds.
- The locked idempotency recheck prevents two same-key sync calls from executing. Matching eligible rows replay using the existing response builder; fingerprint mismatches return the existing 409. The unique index is account-wide. A conflicting solution or soft-deleted row, including a legacy null-fingerprint row, returns 409 rather than replaying unrelated output or reaching a unique-index failure. Preflight replay scope is unchanged.
- `timeout_seconds` must be a positive finite number; default 30 seconds, capped at 60. Its execution budget begins immediately before the first attempt and includes retries. One absolute deadline drives the watchdog and `setCostDeadline` for SDK calls. At or beyond it, both a late success and a late rejection produce existing `timeout_exceeded` HTTP 503 with `details.fix` and `retryable`. The reservation is released. Late work cannot capture or mutate another transaction row; costs may be unknown. Caller-budget expiry does not affect capability health or trigger paid verification, and late retry outcome facts are suppressed.
- Executors accept only their input object, with no `AbortSignal` slot. No executor interface refactor was made. The watchdog stops awaiting, not JavaScript or a running upstream call. H5 SDK timeouts and existing `safeFetch` bounds limit that work. A blocked event loop delays the watchdog; once control returns, the elapsed-time checks reject the result. Free-tier, dry-run and async execution retain their existing execution behavior. API quickstart and OpenAPI describe the sync paid contract; no ErrorCode enum addition was needed.
- Gateway x402 capability and solution handlers atomically insert an executing transaction into the existing unique payment-hash slot after verification and before validation/execution. Concurrent losers get the same existing duplicate/replay response (502 for an incomplete/failed prior request, 200 for a completed cached result). Final recording updates that owned row. Unsettled validation/execution failures clear the hash on the failed attempt, allowing a retry. Confirmed settlement declines can reopen a failed durable intent. Ambiguous settlement failures retain both the claim and intent and do not authorize another settlement. Settled-but-unrecorded recovery finalizes the existing claim in place; orphan capture remains intact.
- The reservation reconciler already sweeps `reserved` and `executing` rows after their deadline. Sync holds retain its 15-minute TTL, safely beyond the 60-second maximum sync execution budget. Crash recovery releases an undebited hold without refunding it and makes the failed transaction hashable. The job starts after 45 seconds, then runs each minute in bounded batches of 25; no new job or schedule is introduced.

## Verification and fail-before evidence

Evidence receipt: [money-path test run](../../../archive/receipts/2026-10-27-test-run-money-path.json). It contains every local CI check command and its result, API suite results, source hashes, skipped integration coverage, and per-test fail-before/pass-after outcomes. Counts are evidence in that receipt, not a claim of production verification.

The requested `git checkout origin/main -- <paths>` was attempted and rejected because this environment exposes `.git` read-only (`index.lock` creation failed). The equivalent source reset used exact bytes from `git show origin/main:<path>`. Modified sources were first copied to a scratch directory inside this checkout, restored in a `finally` block, and the backup directory deleted. No stash, branch switch, index write or commit was used. Tests stayed on the working implementation while sources ran at the base. The timeout assertion fails on failure to settle at the deadline; executor transaction ownership, concurrent reservation/cap admission, release, late completion, same-key serialization, x402 claim/retry/orphan recovery and the new migration all fail against the base and pass after restoration. Scalar-bind assertions execute the real SQL builders and reject `Date`/`Buffer` raw-query parameters. ORM timestamp values remain supported.

Independent tier-2 technical and contract reviews ran for two rounds, with the allowed confirmation read after the final high-severity deadline fix. Replay scope, cross-rail affordability and caller-timeout health findings were fixed. The remaining x402 pre-intent crash gap below is retained explicitly. Technical verdict: GO. Contract verdict: GO with retained MEDIUM. Both are at `e871a2ad` plus the working diff, rounds: 2, with a confirmation read. Reviewers inspected source; the parent ran tests. This is a working-tree review at `e871a2ad`, not a review of a committed shipping SHA.

A disposable PostgreSQL server could not be started locally: the container denied ownership/group changes needed to run PostgreSQL as its non-root service user. No existing or production credentials were sought. Database integration suites therefore skip; mocked concurrency proves control flow, not PostgreSQL lock/index behavior. The new real-DB cases cover hold capture/release, additional-key hourly/total limits and a concurrent sync hold versus solution affordability. Existing sync integration teardown now removes its reservations before deleting wallets.

The context warning-clean test initially found generated inventory drift caused by the updated T4 handoff pointer. The standard generator mistakes this assigned isolated clone for a shared primary checkout because its git/common directories match. Under the user's explicit isolated-clone instruction, the generator's exported `writeGeneratedFiles` API regenerated the inventory in this checkout. The guard itself was not edited. The same test passed with base documents during the fail-before audit; this was introduced drift, not a pre-existing failure.

`handoff:check` is expected to report the intentionally uncommitted/unpushed state under the user's no-commit instruction. Its actual result is in the receipt. Journal/external filing is left to the orchestrator; no external message was sent.

## Remaining work and limitations

1. Orchestrator: review the full diff and retained MEDIUM, commit, run the required disposable-Postgres `integration-db` and image boot lanes, then handle PR/deployment. Do not interpret skipped DB tests as a passing money-path integration gate. Exact existing integration sequence, against a fresh loopback test database only, is `node scripts/assert-disposable-test-db.mjs`, `npx drizzle-kit push --force`, `npx tsx scripts/apply-startup-migrations.ts`, then `STRALE_REQUIRE_INTEGRATION_DB=1 npx vitest run --no-file-parallelism integration.test.ts` from `apps/api`. Set the test variables exactly as `.github/workflows/ci.yml` specifies; these commands are not production commands.
2. Gateway crash after claim but before durable settlement intent: the hash remains occupied and retries get 502. The intent reconciler cannot discover this population. An automatic stale release needs ownership fencing coordinated with intent creation so a still-running owner cannot settle after a replacement claims the hash. This patch conservatively keeps the claim; inspect the read-only query below, investigate facilitator/chain evidence and authorization expiry, and handle recovery separately. Do not blindly clear ambiguous claims.
3. Anonymous x402 through `/v1/do` is a separate existing path. It still lacks the gateway pre-execution claim and does not consume the new `settlementUnknown` distinction when marking its intent failed. This patch does not claim global x402 replay protection. T4 retains this follow-up explicitly.
4. No actual migration, paid execution, production reconciler run, image boot, real DB row-lock race, or on-chain settlement was verified here. There is no live-check output to report.

## DEC-20260504-C deployment mechanism and post-deploy plan

The checked-in Dockerfile builds the API and starts `node apps/api/dist/index.js`. `index.ts` calls `runStartupMigrations` before serving, and starts the existing reservation reconciler from the same process. Block 0130 is registered in `BLOCKS`, uses current-schema column checks, and is ledgered. The unit test validates the DDL and lock settings; a real migrated boot remains required in CI and production verification.

Before rollout, drain legacy serving processes and in-flight wallet work before admitting traffic on hold-aware processes. Mixed old/new replicas are unsafe: an old debit does not subtract new holds. Apply the normal reviewed deployment procedure; this session performed no deploy. A rollback to old code also requires draining and resolving open holds first. Do not drop the new columns or rewrite old migration blocks.

After deploy, observe natural customer traffic without generating paid probes. Run the following exact read-only queries in a read-only session. Capture query output and deployed commit in a new immutable receipt. A quiet window with no rows is inconclusive; wait for natural traffic rather than spending money to manufacture evidence.

```sql
BEGIN READ ONLY;

-- New schema is actually present on the serving database.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'wallet_reservations'
  AND column_name IN ('mode', 'api_key_id')
ORDER BY column_name;

-- Natural sync calls are creating and completing holds.
SELECT mode, state, count(*) AS reservations,
       min(created_at) AS first_created, max(created_at) AS last_created
FROM wallet_reservations
WHERE created_at >= now() - interval '24 hours'
GROUP BY mode, state ORDER BY mode, state;

-- Inspect recent examples: a capture has one purchase, with the right amount.
SELECT r.id, r.transaction_id, r.state, r.amount_cents,
       t.status, t.price_cents, r.created_at, r.updated_at,
       count(wt.id) AS purchase_rows,
       COALESCE(sum(-wt.amount_cents), 0) AS debited_cents
FROM wallet_reservations r
LEFT JOIN transactions t ON t.id = r.transaction_id
LEFT JOIN wallet_transactions wt ON wt.reference_id = r.transaction_id
  AND wt.wallet_id = r.wallet_id AND wt.type = 'purchase'
WHERE r.mode = 'hold' AND r.created_at >= now() - interval '24 hours'
GROUP BY r.id, t.status, t.price_cents
ORDER BY r.created_at DESC LIMIT 50;

-- Must return zero rows: captured holds need exactly one matching purchase;
-- released/open holds must have none.
SELECT r.id, r.state, r.amount_cents, count(wt.id) AS purchases,
       COALESCE(sum(-wt.amount_cents), 0) AS debited_cents
FROM wallet_reservations r
LEFT JOIN wallet_transactions wt ON wt.reference_id = r.transaction_id
  AND wt.wallet_id = r.wallet_id AND wt.type = 'purchase'
WHERE r.mode = 'hold' AND r.created_at >= now() - interval '24 hours'
GROUP BY r.id
HAVING (r.state = 'captured' AND
        (count(wt.id) <> 1 OR COALESCE(sum(-wt.amount_cents), 0) <> r.amount_cents))
    OR (r.state <> 'captured' AND count(wt.id) <> 0);

-- A released hold never creates a refund: it was never debited.
SELECT r.id, wt.id AS unexpected_refund_id
FROM wallet_reservations r
JOIN wallet_transactions wt ON wt.reference_id = r.transaction_id
  AND wt.wallet_id = r.wallet_id AND wt.type = 'refund'
WHERE r.mode = 'hold' AND r.created_at >= now() - interval '24 hours';

-- Repeat after two sweep ticks, then after the 15-minute reservation TTL,
-- then at 30 minutes and the next day. Any growing/unchanged expired backlog
-- needs investigation; the bounded job can process at most 25 per tick.
SELECT count(*) AS expired_open_sync_holds,
       min(deadline_at) AS oldest_deadline,
       max(now() - deadline_at) AS longest_overdue
FROM wallet_reservations
WHERE mode = 'hold' AND state IN ('reserved', 'executing')
  AND deadline_at < now();

SELECT id, transaction_id, amount_cents, state, created_at, deadline_at
FROM wallet_reservations
WHERE mode = 'hold' AND state IN ('reserved', 'executing')
  AND deadline_at < now() - interval '2 minutes'
ORDER BY deadline_at LIMIT 25;

-- Must return zero rows: concurrent holds never exceed the ledger balance.
SELECT r.wallet_id, w.balance_cents, sum(r.amount_cents) AS open_hold_cents
FROM wallet_reservations r JOIN wallets w ON w.id = r.wallet_id
WHERE r.mode = 'hold' AND r.state IN ('reserved', 'executing')
GROUP BY r.wallet_id, w.balance_cents
HAVING sum(r.amount_cents) > w.balance_cents;

-- Retained x402 pre-intent crash population: investigation only, no auto-delete.
SELECT t.id, t.x402_payment_hash, t.created_at, t.status,
       i.state AS intent_state, i.settlement_id
FROM transactions t
LEFT JOIN x402_settlement_intents i ON i.payment_hash = t.x402_payment_hash
WHERE t.payment_method = 'x402' AND t.status = 'executing'
  AND t.x402_payment_hash IS NOT NULL AND t.x402_settlement_id IS NULL
  AND t.created_at < now() - interval '15 minutes'
ORDER BY t.created_at LIMIT 25;

COMMIT;
```

Also inspect startup completion and `reservation-reconcile` job logs for the deployed commit. A rising `failed` or `released_but_not_marked` count is not a clean run. A recovered sync row must be failed/hashable with a released hold and no purchase/refund. Read-only queries alone do not prove a crash test occurred; the disposable-DB crash suite is the pre-deploy proof. If schema verification or the money invariants fail, stop the rollout and investigate; do not repair balances with ad hoc SQL.


## Round 2

This section supersedes the first-round timeout, executing-replay, x402 retry and
stale-claim descriptions above. All work remains uncommitted on `feat/money-path`.
The orchestrator owns the final review, commit, CI, push, PR, merge and deployment.

- `findAbandoned` selects reservation `mode`. Debit recovery retains the exact
  original “Execution did not complete — the charge was refunded automatically.”
  Hold recovery says reserved funds were released. Tests cover both financial
  effects and messages; the original crash-test refund assertion remains intact.
- Effective synchronous deadlines clamp positive finite input to 5–60 seconds,
  including 0.01 → 5. OpenAPI retains integer type, and the description and
  quickstart explain legacy fractional input clamping. The default remains 30.
- An executing same-key replay returns HTTP 409 `request_in_progress`, with
  `details.retryable: true`, `retry_after_seconds: 2` and same-key recovery advice.
  Completed replay remains HTTP 200; fingerprint mismatch remains HTTP 409
  `idempotency_key_reused`. The error union, recovery contract and OpenAPI enum/
  409 responses include the new code.
- Pre-executor x402 rejection deletes its claim, including validation, missing
  executor, method rejection, guarded-allow refusal, execution-admission failure
  and an empty solution. Executed failures remain audit records.
- One nullable JSONB column, `transactions.x402_execution_attempts`, stores the
  payment hash and invocation count. Claim admission and each capability executor
  invocation check the durable two-execution budget while owning the unique hash
  slot. Automatic transient retries count too. The third attempt receives the
  existing HTTP 502 replay response. Solution execution is counted per solution
  invocation. Failed execution releases the unique hash without erasing its count.
  The duplicate wording is “A request with this payment is already in progress or
  has failed”. No signed header is persisted in this metadata.
- Block 0130 adds the nullable column with no backfill and builds a partial
  expression index concurrently, repairing an invalid prior build. It uses the
  existing block-0125 connection/timeout pattern. Only the uncommitted M073 ledger
  row was removed and re-appended with `check-migration-ledger.mjs --update`.
- The existing settlement reconciler releases at most 25 claims per minute that
  are older than 10 minutes, unsettled and have no intent. It preserves every
  intent state, including failed intents. Empty claims are deleted; attempted
  claims become failed while keeping their budget history. Intent creation and
  cleanup lock the claim before checking ownership/intents; a swept owner cannot
  settle. The second intent check uses a fresh statement snapshot after the lock.
  The job reports `staleClaimsReleased` and retains its existing startup wiring.
- The real-DB key-cap cases now assert an unchanged wallet balance and zero
  purchases before checking caps. Origin's immediate debit cannot satisfy them.
  The existing primitive-bind/hold-query unit discriminator also runs against
  origin library bytes. This is distinct from proving the real-DB cases locally.

Verification and evidence: the new immutable receipt is
[Round 2 test run](../../../archive/receipts/2026-10-27-test-run-money-path-round2.json).
The fail-before runner used saved round-1 bytes for items 2–6 and exact
`git show origin/main:apps/api/src/lib/api-keys.ts` bytes for the key-cap unit
check. It required green → red → green, restored in `finally`, and verified
candidate SHA-256 hashes. No stash, branch switch, index reset or commit occurred.
The real-DB key-cap fail-before proof must still run on the orchestrator's DB;
a skipped test is not evidence.

The CI `integration-db` guard was attempted against its exact loopback test URL
and failed with `ECONNREFUSED 127.0.0.1:5432`. Docker has no daemon socket, and
`runuser -u postgres -- id` fails with “cannot set groups: Operation not permitted”.
No database credentials were sought. Schema push and startup migrations were not
run after the guard failed. Run the existing CI lane, including the new
`x402-payment-claims.integration.test.ts`, on disposable Postgres 16 before shipping.
The image-boot dependency also remains unverified here.

Independent read-only correctness and contract confirmation found two additional
pre-executor record paths, which were fixed and tested, plus missing 409 response
and retry-limit documentation, which were corrected. The performance finding on
count lookup was resolved by the expression index, confirmed in a bounded read.
Real PostgreSQL execution/index plans remain outside those source-review verdicts.

Preservation discrepancy: this supplied checkout and the saved round-1 block 0130
contain no reservation `mode` CHECK. None was removed or invented in round 2.
The existing partial unique payment-hash index is unchanged. Capture-time failure
remains failed and uncharged, and the rolling-deploy/drain note above is unchanged.
The anonymous `/v1/do` x402 path still has no pre-execution claim; it was not fixed
here and remains explicit follow-up in T4 `next_action`.

Additional post-deploy evidence (read-only; not run by this build agent):

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema() AND table_name = 'transactions'
  AND column_name = 'x402_execution_attempts';

SELECT c.relname, i.indisvalid
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid = 'transactions'::regclass
  AND c.relname = 'transactions_x402_execution_attempt_hash_idx';

SELECT x402_execution_attempts->>'paymentHash' AS payment_hash,
       sum((x402_execution_attempts->>'count')::integer) AS executions
FROM transactions WHERE x402_execution_attempts IS NOT NULL
GROUP BY x402_execution_attempts->>'paymentHash'
HAVING sum((x402_execution_attempts->>'count')::integer) > 2;

-- Observe over successive minute ticks; claims with any intent are excluded.
SELECT count(*) AS stale_pre_intent_claims, min(t.created_at) AS oldest
FROM transactions t
WHERE t.payment_method = 'x402' AND t.status = 'executing'
  AND t.x402_payment_hash IS NOT NULL AND t.x402_settlement_id IS NULL
  AND t.created_at < now() - interval '10 minutes'
  AND NOT EXISTS (SELECT 1 FROM x402_settlement_intents i
                  WHERE i.payment_hash = t.x402_payment_hash);
```

No production write, paid call, live check, deployment, external filing, commit,
push, PR, merge or package publication occurred. Journal filing remains with the
orchestrator. Local verification results and expected session-gate limitations
are recorded in the receipt.

Final local result: the full API suite passed (6,592 passed; 358 skipped), and
API typecheck, root typecheck and the additional typecheck of both changed
Postgres test files passed. All root `check`-job commands were exercised,
including `npm ci`, builds, `migrations:check` and `receipts:check`. The image-boot
prerequisite command cannot pass without its missing Docker/Postgres dependency;
it was exercised with an unsuccessful smoke result, never forced green. The PII
scanner initially found checksum-valid examples copied into unused backup files;
those two copies were deleted and the scanner passed without changing a scanner,
allowlist or original example. The first full API run found harness mismatches,
which were fixed; its failed run and the final passing run are both in the receipt.
The admission helper's narrow receipt-lint exemption records the existing gateway
finalization and crash-receipt-sweeper ownership, rather than adding an execution
rail or disabling receipt coverage.

`handoff:check` reports the intentionally dirty/unpushed branch, this assigned
clone's trunk-layout classification, and inherited merged branches. These remain
under the orchestrator's no-commit/no-push/no-switch instructions. No unrelated
branch or sibling checkout was changed. No standalone simplify skill was available;
the verification pass included a manual simplification review and the independent
confirmation reads described above.

## Round 3 (orchestrator)

Independent review of round 2 returned GO after a real Postgres 16 run of the full integration-db lane (35 files, 354 tests) plus scratch concurrency tests through the real routes. Two small follow-ups applied by the orchestrator: the in-flight `request_in_progress` 409 now carries `transaction_id`, so an async client retrying with the same key can still poll; block 0130 checks the catalogue and skips all index DDL when the index is already valid, as block 0127 does (M073 re-appended with `--update`). Full API suite after: 6,593 passed, 358 skipped.
