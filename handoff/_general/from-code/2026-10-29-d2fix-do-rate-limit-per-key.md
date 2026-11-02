Intent: Finding 3 from the D9/D3 lane (#814): `/v1/do` per-IP limit applied before auth throttled keyed integration traffic from shared IPs.

[BACKFILL] Cloud session `strale-d2fix`; no Notion writes. Branch `fix/do-rate-limit-per-key`.

## Done

- `optionalAuthIpLimitedUnlessKeyed` (`apps/api/src/lib/middleware.ts`) replaces `rateLimitByIp(60, 60_000)` + `optionalAuthMiddleware` on `POST /v1/do`. A valid key skips the IP bucket and is limited per key (DEC-21: 10/s, plus the hourly spend cap in the handler). No key (free tier, x402) and invalid keys stay at 60/min per IP; an invalid key gets 429 once the IP bucket is full.
- `rateLimitByIp` now runs through the exported `consumeIpRate` (same behaviour).
- Clay README updated. Evidence: [receipt](../../../archive/receipts/2026-10-29-test-run-do-rate-limit-per-key.json).

## Follow-up (not done)

- Keyed free-tier calls debit nothing, so the spend cap never backstops them; one account with 26 keys can now reach about 260 req/s from one IP (before: 60/min per IP). This fits the DEC-21 per-key design. An account-scope limit on `/v1/do` (`rateLimitByKey(..., "account")`) is the candidate fix if abuse shows up.
