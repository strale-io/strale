Intent: record three founder decisions of 2026-11-16 (Petter, in session) and the Swiss register permission.

**1. Swiss register permission accepted (DQ-40 closed).** Petter: "yes accept the permission".
- `apps/api/src/lib/vendor-terms.data.json` gains two `written_permission` records, `accepted_by: petter`, `accepted_on: 2026-11-16`:
  - Swiss UID register (`vat-validate`'s Swiss path), reply of 2026-11-13 archived at `docs/operations/vendor-permissions/2026-11-13-swiss-uid-register.md`;
  - Zefix (`swiss-company-data`), terms of 2026-03-20 archived at `docs/operations/vendor-permissions/2026-03-20-zefix.md`. The credentials email is deliberately not archived.
- `apps/api/src/lib/vendor-terms.test.ts`: a provider chain (`registerChain({ capabilitySlug })`) now counts as a caller for the slug it declares. Its own vendor calls must be listed under that slug, and an unlisted chain is still an orphan. Without this, the Zefix client in `capabilities/providers/swiss-company-data.ts` failed "no shared client outside an executor calls it unrecorded". A new regression test covers both directions.
- Portfolio 1.12 (Swiss company-ID and VAT check) is unblocked.

**2. A-7 orphan quality rows: keep all 103,416, no deletion.** Petter: "Keep the 103,416 orphan quality rows; no deletion."
- The money side of A-7 is settled at €0 owed: measured for the no-reference debits, and inferred for the 65 dangling-reference cents (`2026-11-16-transaction-quality-fk-result.md`).
- With deletion ruled out, the incident-dating check proposed in that handoff is only for understanding the cause. It does not gate anything. It is dropped from the queue unless an integrity check needs the cause.
- Close A-7 on this basis.

**3. Close the customer account that exposed its key; no refund.** Petter: "close the account. he didnt ask fo a reund so no need for that now".
- **Not executed.**
  - The only closure path is `DELETE /v1/auth/me` (`apps/api/src/routes/auth.ts`), authenticated by the customer's own key. Using the pasted key is forbidden (wow-core#348).
  - No admin closure route exists.
  - This session holds no `ADMIN_SECRET` and no Railway write access.
- Recommended: add `POST /v1/admin/accounts/:userId/close`, which reuses `applyClosurePlan` from `apps/api/src/lib/account-closure.ts`, with tests and independent review. Then one call from whoever holds `ADMIN_SECRET`.
- Telling the customer the account is closed is writing to a customer, which stays Petter's.

Next authorised action: build the admin-only account-closure route (tier 2, independent review) so the exposed key can be revoked with one ADMIN_SECRET call | Owner: Strale master | Blocker: none for the build; the call needs the ADMIN_SECRET holder
