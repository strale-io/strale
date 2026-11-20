Intent: give the operator an admin-only way to close a customer's account on their written request, so the closure Petter authorised on 2026-11-16 can run without the customer's pasted key.

## What changed

- `POST /v1/admin/accounts/close` (behind the admin wall). The body is `{ email, confirm_email, reason }`.
  - The two addresses must match.
  - `reason` must be a reference (a ticket id or a date), never personal data.
  - An unknown address answers 404, an account that is already closed 409, and an internal account is refused.
- The closure now lives in one function, `apps/api/src/lib/close-account.ts`, which both this route and `DELETE /v1/auth/me` call. The self-service response is unchanged.
- Inside the closure transaction, the wallet lock comes first, then the account is checked to still be open. A second closure stops with 409 and changes nothing.
  - Review round 2 caught the opposite order, which deadlocked against a paid call in flight.
  - The integration test "a closure overlapping a paid call does not deadlock" fails with 40P01 under the old order and passes under the new one.

## Review

An independent same-provider review ran in a separate context: round 1 GO with nits, round 2 NO-GO (lock order), round 3 GO. Its nits were applied.

## Follow-ups (not in this change, existing behaviour)

- OAuth code exchange (`oauth.ts` ~245) and key recovery (`key-recovery.ts` ~178–201) take their row lock before the wallet or users lock, so a concurrent closure can deadlock with them. Postgres aborts one side, and nothing is corrupted. Fix: take the wallet lock first, as the management lock does.
- `POST /v1/auth/api-key` updates `users` without an `isNull(users.deletedAt)` guard. If it races a closure, it writes a live key hash onto the anonymised row. That key cannot authenticate, because `api-keys.ts:27` rejects closed accounts.

## After merge

Verify on production that the route answers 401 without auth. Then give Petter the exact command for the authorised closure. The customer's pasted key is never used.

Next authorised action: after merge and deploy, check that the route answers 401 without auth, then hand Petter the closure command | Owner: Strale master | Blocker: merge-gate **Closed 2026-11-20:** done on 2026-11-16 at 23:47 Swedish time, and Petter told the customer at 23:51; evidence in `handoff/_general/from-code/2026-11-20-account-closure-verified.md`.
