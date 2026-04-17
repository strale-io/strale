# 2026-04-17 — Scraping error fixes + x402 settle-on-success

Intent: investigate today's /activity snapshot, follow the thread into two real bugs surfaced by live transactions, fix and ship both.

## What shipped

### PR #6 — scraping error messages (merged in this session)
- Root cause: `web-provider.ts` returned *"could not be loaded (HTTP X). Please try again later."* for every 4xx from Browserless — affects all ~47 capabilities using `fetchRenderedHtml`. 404/403/410/401 are permanent, not transient; "try again later" is misleading.
- Fix: extracted `humanizeBrowserlessStatus()` with honest status-specific messages. Applied to plain-fetch and Browserless paths.
- Also fixed: `url-to-markdown.ts` substring-matching bug that was swallowing helpful 4xx errors (replaced with `DefinitiveFetchError` class); `danish-company-data.ts` and `uk-filing-events.ts` had the same "try again later" antipattern — differentiated auth/rate-limit/5xx.
- Surfaced while investigating a real failed call: `url-to-markdown` on `https://www.synthesia.cz/en/` which 302-redirects to a 404 page on synthesia.eu.

### PR #7 — x402 verify → execute → settle (merged in this session)
- Root cause: `/x402/:slug` and `/v1/do` both verified + settled USDC *before* input validation or capability execution. Validation errors and executor throws still charged the caller.
- Surfaced by: a real probe burst 2026-04-15 13:52:03→13:53:33 UTC. 20 capabilities hit with `{}`, every call settled, every call failed at capability-level input validation. Caller paid real USDC for 20 errors.
- Fix: split `verifyX402Payment` in the lib into `verifyX402PaymentOnly` + `settleX402Payment`. Both x402 gateways (`/x402/:slug`, `/x402/solutions/:slug`, and `/v1/do`) now verify → validate → execute → settle. Execution failures return 4xx; the signed authorization expires unused.
- Bonus: fixed a latent bug in `do.ts` where x402-paid calls were miscategorized as `is_free_tier=true` with no `payment_method` or `x402_settlement_id` on the transaction row.

### Small reporting fix (shipped to main directly)
- `apps/api/scripts/today-overview.ts` — excluded internal emails (matching `daily-ext.ts`) and made `wallet`/`free_tier` buckets mutually exclusive. Before: reported "80 wallet txns" (actually 156 internal + 33 free-tier miscategorized as wallet). After: honest real-external-traffic counts.

## What's NOT shipped — open loops

- **`do.ts` graceful-degradation wrapper around `executeFreeTier`'s transaction insert**: I accidentally discarded this with `git checkout -- do.ts` while cleaning up a staged diff. Check VS Code Timeline on `do.ts` to restore — if gone, re-implement (~10 lines: try/catch the `db.insert(transactions)...returning({ id })` call, log on failure, continue execution). The intent comment was: *"This ensures the free-tier showcase (strale.dev homepage) stays up even during DB issues."*
- **Pre-session uncommitted mods** on `app.ts`, `db-retention.ts` — still in the working copy, your call whether to commit/stash/discard.

## Observations worth remembering

- **04-15 x402 probe signature**: 20 caps in 90s with `{}`, alphabetical, one per cap. Same client had made a real working `vat-validate` call 6h earlier. Read: developer smoke-testing x402 coverage, not a bot. Qualified lead signal — might be worth identifying the caller address for follow-up.
- **Free-tier inputs today**: 33 calls over ~40 min, Czech/KYB-shaped workflow (Czech IBANs + Goldman Sachs + Synthesia + econsulting.eu domain + Singapore stats URLs). Also a qualified signal — the kind of free-tier usage that should convert.
- **Architecture takeaway**: the x402 flow now aligns with DEC-14 ("don't charge before execution succeeds") which was already policy for the wallet model. The two payment rails are now consistent.
