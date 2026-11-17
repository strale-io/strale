# Admin wallet credit report

## Outcome

Implemented `POST /v1/admin/wallets/credit` behind the existing admin wall. The route validates a twice-entered account email, integer-cent amount and non-personal reference; rejects unknown, closed, internal and wallet-less accounts; and grants a ledgered `operator_credit` inside one database transaction. A transaction-scoped advisory lock closes the cross-wallet race in the platform-wide rolling seven-day cap.

## Files changed

- `apps/api/src/routes/admin.ts` — route, ordered guards, duplicate and weekly-cap queries, transactional credit, safe log and response.
- `apps/api/src/lib/wallet-service.ts` — `operator_credit` ledger type and credit support.
- `apps/api/src/db/schema.ts` — ledger-type comment only; the existing `varchar(20)` column is unchanged and no migration was added.
- `apps/api/src/openapi-internal-routes.ts` — registered the route as admin-authenticated and excluded from the public contract.
- `apps/api/src/routes/admin-wallet-credit.test.ts` — no-database guard, cap, idempotency, happy-path and bind-shape coverage.
- `apps/api/src/routes/account-lifecycle.integration.test.ts` — gated real-database proof of one row, exact balance delta and unchanged duplicate retry.
  It also deterministically queues credit behind closure and proves a stale pre-transaction account read cannot restore a closed wallet's balance.

## Ledger-type consumer sweep

Searched all TypeScript and embedded SQL under `apps/api/src` for `top_up`, `trial_credit`, `refund`, `purchase` and `closure_forfeit` branches.

- **Changed:** `lib/wallet-service.ts` owns the ledger union and credit writer, so both now admit `operator_credit`. `db/schema.ts` documents all current values.
- **Checked, left alone:** `routes/wallet.ts` returns the stored type without branching, so `operator_credit` is already display-safe.
- **Checked, left alone:** `lib/api-keys.ts` deliberately calculates spending from purchase debits minus linked refunds. An operator credit is neither and must not change that calculation.
- **Checked, left alone:** `lib/ops-read.ts` contains purchase/refund reconciliation and anomaly queries. Those queries intentionally select charge/refund pairs rather than all credits, so including goodwill credit would make them wrong.
- **Checked, left alone:** `lib/account-service.ts` writes signup grants as `trial_credit`; the new operator grant has separate semantics.
- **Checked, left alone:** `routes/webhook.ts` writes Stripe receipts as `top_up`; `operator_credit` is explicitly non-Stripe.
- **Checked, left alone:** `startup-migrations/blocks/0102-account-lifecycle-tables.ts` is an append-only historical backfill that finds prior trial grants only. It must not be edited and operator credits do not establish trial entitlement.
- **Checked, left alone:** `startup-migrations/blocks/0111-vendor-control-tower.ts` uses the unrelated vendor-funding value `top_up`, not wallet ledger classification.
- **Checked, left alone:** `capabilities/return-policy-extract.ts` uses “refund” and “purchase” as retail-policy vocabulary, not ledger types.
- **Checked, left alone:** the route-specific and integration test consumers select exact types to prove their own purchase, refund or closure invariants; an additional credit kind does not alter those assertions.

## Audit-follow-up protocol evidence

The new money path has both unit and gated integration coverage. Before the route was implemented, `admin-wallet-credit.test.ts` ran with **17 failures**. In particular, “allows a credit that exactly reaches the rolling weekly cap” and “writes one operator credit and returns integer cents” both returned 404 before the change and pass after it. The bind-shape test walks every handler `tx.execute(sql\`...\`)` argument and rejects any nested `Date` or `Buffer`; the rolling window is the SQL expression `now() - interval '7 days'`.

No cert-audit-finding-numbered commit was created in this session, and no money-critical code landed without a regression test.

## Revenue metrics

Known and intentionally unchanged: when an account spends an operator credit, existing commercial metrics count the resulting paid execution as revenue, just as they already do for trial credit. This task does not alter commercial metrics.

## Limitations and follow-up

- The real-database test is gated by `DATABASE_URL_TEST`; it is present but skipped when that environment variable is unavailable.
- `npm test` reached two unrelated one-second performance assertions in `structured-metadata.test.ts` that also fail when run alone on this host (about 1.8–2.1 seconds). All route tests pass; this is recorded as an environment timing limitation rather than changing an unrelated performance threshold.
- No production data, secrets or real email addresses were used. The new integration fixture uses `@customer.test`.
- No migration and no environment variable were added.
- No production credit was issued; this branch only adds the operator path.
- Journal/Notion filing was unavailable in this execution environment; the repository handoff records the work for backfill.

## Independent review

The required independent review found a closure race in round one: a stale pre-transaction account read could allow credit after closure. The final implementation rechecks `deleted_at` under a user-row lock after taking the wallet lock, matching closure's lock order, and returns 409 if closure won. Round two accepted the production fix and requested deterministic rather than sleep-based integration choreography; the test now observes the actual PostgreSQL blocking graph with `pg_blocking_pids` and always closes its dedicated connection in `finally`. No HIGH finding remains; the final MEDIUM test-reliability finding was fixed after the two-round review cap.

`Next authorised action: Claude review of codex/admin-wallet-credit | Owner: Strale master | Blocker: none`
