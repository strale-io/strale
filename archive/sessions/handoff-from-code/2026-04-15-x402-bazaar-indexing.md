# 2026-04-15 — x402 Bazaar indexing end-to-end

**Intent:** Make Strale's x402 capabilities appear in Coinbase's Bazaar discovery catalog.

## Outcome

- **268 / 269** paid x402 capabilities indexed on CDP Bazaar (`/platform/v2/x402/discovery/merchant?payTo=0x66D7…83bC`).
- Missing: `paid-api-preflight` (responded HTTP 402 during seed — likely rejects our $0.01 payment amount or has recursive payment logic; not investigated).
- Notion to-do moved to Archive > Completed To-dos.

## Diagnostic timeline

1. Deployed migration to `@x402/extensions/bazaar` SDK (`declareDiscoveryExtension` for v2 top-level `extensions.bazaar` + v1 `outputSchema`). Commit [95b785e](https://github.com/strale-io/strale/commit/95b785e). Payments kept working; still 404 on merchant discovery.
2. Posted on [issue #1982](https://github.com/x402-foundation/x402/issues/1982) assuming upstream CDP v2-extension-drop bug.
3. Research finding in [CDP Quickstart docs](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers): the Bazaar crawler sends empty requests and requires HTTP 402 back. Non-402 (including 400) skips indexing.
4. Confirmed our handler returned **400 "missing required fields"** for empty requests because input validation ran before the payment check. Fix [837d6ab](https://github.com/strale-io/strale/commit/837d6ab) moves payment check to top of both wildcard handlers (`/x402/:slug` and `/x402/solutions/:slug`) and defers input validation to post-payment.
5. Secondary hedge [45f3cb6](https://github.com/strale-io/strale/commit/45f3cb6): `outputSchema` now emits descriptor-shape (`bodyFields`/`queryParams` with `{type, description, required}` per field), matching live-indexed entries in the CDP catalog.
6. Fresh payment (tx `0xdbc5f2c0…52758`, 11:44 UTC) → `vat-validate` indexed 54 min later at 12:38 UTC.
7. Bulk-seed pipeline: `apps/api/scripts/bazaar-bulk-seed.ts` (backup → discount all prices to $0.01 → restore) + `c:/tmp/x402-test/bulk-seed.mjs` (iterates catalog, pays one capability at a time, concurrency 4). Spent $2.68 across 268 caps. Indexing propagated within ~30 min.
8. Follow-up on [#1982](https://github.com/x402-foundation/x402/issues/1982#issuecomment-4252163881) retracting the v2-drop claim and documenting the empty-body-400 failure mode for the community.

## Key code touch-points

- [apps/api/src/lib/x402-gateway.ts](apps/api/src/lib/x402-gateway.ts) — `verifyX402Payment` gained a `requirementOverrides` param so settle calls carry the canonical `resource` + `outputSchema` (required for v1 Bazaar indexing).
- [apps/api/src/routes/x402-gateway-v2.ts](apps/api/src/routes/x402-gateway-v2.ts) — `buildBazaarDiscovery()` produces v2 extension (SDK) + v1 outputSchema (descriptor-shape). Payment check moved to top of both handlers.
- [apps/api/scripts/bazaar-bulk-seed.ts](apps/api/scripts/bazaar-bulk-seed.ts) — one-off CLI (`backup` / `discount` / `restore`). Run via `railway ssh --service strale "cd /app/apps/api && npx tsx scripts/bazaar-bulk-seed.ts <cmd>"`.
- [c:/tmp/x402-test/bulk-seed.mjs](file:///C:/tmp/x402-test/bulk-seed.mjs) — batch payment runner. Requires `$env:PRIVATE_KEY` set to the funded Base wallet key.

## Non-obvious learnings

- The CDP facilitator **silently skips indexing** if the first crawl gets anything other than 402 — no error, just a stuck 404 on `/discovery/merchant`.
- v1 indexing works on Base mainnet. **v2 extension indexing is broken** (#1982 still open). Our current shape sends both paths, so we're indexed via v1 and resilient if v2 starts working.
- Post-payment 4xx responses don't carry `X-PAYMENT-RESPONSE` out of our handler, so the bulk-seed client logged `tx=n/a` even though settlements succeeded. Verified via wallet-balance delta ($9.45 → $6.77).
- Bazaar's merchant discovery endpoint paginates at max `limit=100`.

## Open

- `paid-api-preflight` not indexed. If we want 100% coverage, investigate why that capability returned 402 to the seed attempt (possibly its executor itself makes an x402 preflight call, conflicting with the gateway's own 402).
- Our server not returning `X-PAYMENT-RESPONSE` on post-payment 4xx is cosmetic but worth patching — clients can't get a tx hash for failed executions they still paid for.
- #1982 (v2 extensions dropped by CDP on Base mainnet) still open upstream. Relevant if we ever want Strale's metadata to surface via the v2 path or for richer schema shape.

## Cost

- 3 single-capability test payments (`vat-validate` × 3) at $0.01 each
- 1 recovery payment at $0.03 (pre-fix, against old shape)
- 268 bulk-seed payments at $0.01 each
- Total ≈ $2.71
- Wallet `0x538dbDd…6FE41B` balance: 6.77 USDC remaining.
