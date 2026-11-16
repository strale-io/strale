Intent: Codex builder brief: an admin route that grants a small, ledgered goodwill credit to an account, so an operator can honour a request like "add €1.15 so we can re-run your tools" without writing to the database by hand.

# Brief: POST /v1/admin/wallets/credit, a capped, ledgered goodwill credit

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-16.
  - Source: the 2026-11-15 and 2026-11-16 operating records in `handoff/_general/from-code/`, item "credit the benchmark account". A benchmark site asked for a small credit to re-test us. No path exists to grant it: money reaches a wallet only by Stripe top-up (`routes/webhook.ts`), the signup trial credit (`wallet-service.openWallet`) or a refund.
- **Branch:** push only `codex/admin-wallet-credit`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. No secrets, no production data, no real email addresses: test fixtures use `@customer.test` addresses, as `admin-close-account.test.ts` does.
- **Trigger surface:** this route moves money. It gets an independent Claude review before its label, and the Audit-Follow-up Test Coverage Protocol (DEC-20260504-A, `CLAUDE.md`) applies in full.
- **Read first:**
  - `apps/api/src/routes/admin.ts`, the whole `POST /accounts/close` section (comment block, `looksPersonal`, the handler) and the `adminOnly` wall at the top;
  - `apps/api/src/routes/admin-close-account.test.ts` (the no-database test pattern to copy);
  - `apps/api/src/lib/wallet-service.ts`: `LedgerEntryType`, `lockWalletForUser`, `readBalance`, `credit`, `applyDelta`;
  - `apps/api/src/lib/internal-accounts.ts` (`isInternalAccountEmail`);
  - `apps/api/src/openapi-internal-routes.ts` (where `POST /v1/admin/accounts/close` is registered);
  - `apps/api/src/routes/account-lifecycle.integration.test.ts`, only to see how the real-database tests are gated and set up.

## What to build

### 1. A new ledger type, `operator_credit`

In `wallet-service.ts`:
- Add `"operator_credit"` to `LedgerEntryType`.
- Widen the `type` parameter of `credit()` to accept it.
- Update the comment on `walletTransactions.type` in `apps/api/src/db/schema.ts` to list it. The column is `varchar(20)` with no check constraint, so **no migration** is needed or allowed.
- Search the whole of `apps/api/src` for code that branches on ledger type strings (`'top_up'`, `'trial_credit'`, `'refund'`, `'purchase'`, `'closure_forfeit'`), in TypeScript and in SQL strings. Where any of them would treat an unknown type wrongly (a ledger reconciliation, an invariant check, a display mapping), handle `operator_credit` as a non-Stripe credit, like `trial_credit`. List every place you checked, changed or left alone, with the reason, in your report.

### 2. The route, `POST /v1/admin/wallets/credit`

Add it to `adminRoute` in `admin.ts`, behind the existing admin wall. Put it after the closure route, with a comment block in the same style explaining what it is for and each guard.

**Body:** `{ email, confirm_email, amount_cents, reason }`.

**Guards, checked in this order:**
1. `email` and `confirm_email` are both strings, and agree after `trim().toLowerCase()` → otherwise 400 `invalid_request`. Same as the closure route.
2. `amount_cents` is an integer from 1 to `MAX_OPERATOR_CREDIT_CENTS = 2000` (€20) inclusive. A float, a string, 0, a negative or anything over 2000 → 400.
3. `reason` is a non-empty string, trimmed and sliced to 500 characters, that is a reference and not personal data → otherwise 400. Reuse `looksPersonal` exactly; do not copy it. If you have to export or move it, keep the closure route using the same function.
4. Look the account up by email, exactly as the closure route does. Unknown → 404 `not_found`. Closed (`deletedAt` set) → 409. Internal account (`isInternalAccountEmail`) → 400.
5. Inside one database transaction:
   - lock the account's wallet with `lockWalletForUser` (no wallet → 404);
   - **duplicate guard:** if this wallet already has an `operator_credit` entry whose description equals the one this request would write, return 409 and write nothing. This stops a pasted command from crediting twice;
   - **weekly cap:** if the sum of `operator_credit` amounts across **all** wallets in the last 7 days, plus this amount, would exceed `MAX_OPERATOR_CREDIT_CENTS_PER_WEEK = 2000`, return 409 and write nothing. The window is computed in SQL (`now() - interval '7 days'`), never from a JavaScript `Date`;
   - call `credit(tx, { walletId, amountCents, type: "operator_credit", description: \`operator: ${reason}\` })`;
   - read the new balance with `readBalance`.

**Response 200:** `{ status: "credited", user_id, amount_cents, balance_cents, ledger_type: "operator_credit" }`. Money is integer cents only, never a formatted string (the wire-shape rule in `CLAUDE.md`).

**Logging:** one `log.info` with `label: "admin-wallet-credited"`, `user_id` and `amount_cents`. Never the email or the reason.

Register the route in `openapi-internal-routes.ts` next to the closure route.

### 3. Leave the rest alone

No change to the closure route's behaviour, to Stripe, to `/v1/do`, to revenue metrics, or to any other route. No migration and no new environment variable.

Known and out of scope: when a credited account spends the credit, the commercial metrics count that spend as revenue, exactly as they already do for the trial credit. Say so in your report; do not change it.

## Tests

### Unit tests, no database: `apps/api/src/routes/admin-wallet-credit.test.ts`

Copy the pattern of `admin-close-account.test.ts` (mocked `getDb`, mocked wallet functions). Cover:
- **Admin wall:** no auth or a wrong secret → 401, and the database is never reached.
- **Each guard:** email mismatch; missing email; `amount_cents` of 0, -5, 2001, 1.5 and `"100"`; empty reason; a reason containing an email address; a reason containing a phone number; unknown account → 404; closed account → 409; internal account → 400. For each, assert that `credit` was never called.
- **Duplicate:** an existing `operator_credit` with the same description → 409, `credit` not called.
- **Weekly cap:** 1900 already granted this week plus a request for 200 → 409, `credit` not called. 1800 plus 200 → 200.
- **Happy path:** `credit` called exactly once, with `type: "operator_credit"`, the exact amount and description `operator: <reason>`, and the response has the documented shape with integer cents.
- **Bind-parameter shape (DEC-20260504-A item 3):** walk every `tx.execute(sql\`...\`)` / `db.execute(sql\`...\`)` the handler issues and assert that no bound parameter is a `Date` or a `Buffer`.

### Integration test, real database

Add one case to the gated real-database suite (`account-lifecycle.integration.test.ts`, or a new file gated the same way): credit an account, then assert:
- exactly one `wallet_transactions` row of type `operator_credit` with the right amount;
- the balance rose by exactly that amount;
- a second identical request returns 409 and leaves both unchanged.

### Fail-before

Each new test must fail without your change. In your report, name at least two that you saw fail before the change and pass after it.

## Done means

- `npm run typecheck` and `npm test` pass.
- Report at `docs/lanes/codex/admin-wallet-credit-report.md`, covering:
  - the files changed;
  - every ledger-type consumer you checked;
  - the fail-before evidence;
  - the revenue-metric note;
  - anything you could not do.

`Next authorised action: Claude review of codex/admin-wallet-credit | Owner: Strale master | Blocker: none`
