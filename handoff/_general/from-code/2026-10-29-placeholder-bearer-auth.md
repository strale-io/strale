Intent: Treat an unexpanded placeholder Authorization header (`Bearer ${STRALE_API_KEY}`, `Bearer <your-key>`, `Bearer YOUR_API_KEY`) as no key, so directory and integration configs can ship the header by default (PR #831's recommendation).

[BACKFILL] Lane session for strale-planning; no Notion write was made.

## Delivered

- `apps/api/src/lib/bearer-placeholder.ts`: `isPlaceholderBearer` (whole-value template shapes `${NAME}`, `$NAME`, `{{NAME}}`, `%NAME%`, `<...>`, plus a fixed set of literal stand-ins such as `YOUR_API_KEY`, `undefined`; a value starting `sk_live_` or `sto_at_` never matches) and `readBearer(header, route)`, which returns the token or null.
- Every API-key bearer reader now goes through `readBearer`: `authMiddleware`, `optionalAuthMiddleware`, `optionalAuthIpLimitedUnlessKeyed` (POST /v1/do), MCP `extractApiKey` (/mcp, /mcp/<entry>, /mcp/connector) and A2A (message/send forwarding, tasks/get). The /x402 gateway reads no Authorization header and needed no change. Admin and internal bearer checks are untouched (they compare a shared secret, not an API key).
- A placeholder behaves exactly like a missing header: free-tier runs anonymously, paid calls get the same 402 (x402 on) or 401 (x402 off), and the connector returns the no-token challenge rather than `invalid_token`. A malformed non-placeholder key (`not-a-key`, `sk_test_...`) is still refused, as before.
- Counter: log line `auth-placeholder-bearer` with `route` and a per-process `count`; the header value is never logged. Count it in Better Stack once that sink is live.

## Evidence

- Tests: `archive/receipts/2026-10-29-test-run-placeholder-bearer-auth.json` (the four touched files). Full API suite and root typecheck were green before push.
- Fail-before: `apps/api/scripts/mutation-test.mjs` with `readBearer` mutated to skip the detector. MUTATION CAUGHT, green to red (22 failing) to green.

## Next

- After deploy: confirm the `/health` commit, then run one free-tier call with a placeholder header in production (done in this lane if the PR merged; see the PR comment).
