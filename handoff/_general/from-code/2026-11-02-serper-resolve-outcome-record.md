Intent: make Serper `/resolve` leave a trace on real traffic, so the link-resolution path can be proved working or broken from production data.

# Serper `/resolve` outcome record (2026-11-02)

**Problem.** `/resolve` is free and metered at 0 units. `recordVendorCost`
returns on 0 units and `recordVendorUsage` ignores units ≤ 0, so a resolution
left no row anywhere. A working resolver and a broken one looked the same. The
only signal was a `serper-links-unresolved` warning log, and Railway drops logs
above 500 lines a second.

**Change.**
- `call-cost.ts` gains `recordLinkResolution` and an optional `link_resolution`
  block on the call's cost context. `snapshotCallCost` already spreads that
  context into `transactions.cost_breakdown`, so it persists with no new column
  and no migration.
- `resolveSerperLinks` records one attempt per call that had wrapped links. It
  records `links`, `resolved`, `unresolved`, `failed_requests` (HTTP error,
  shape mismatch, exception), `budget_exhausted` and `no_key`. Counts only: no
  URL, error text or other content. A test asserts that.
- Nothing is recorded when no link was wrapped (Google wraps positions 4 and up).

**Evidence.** `serper-links.test.ts` has a new block of five tests. Three fail
against the previous `serper-links.ts` (success, failed request, no key) and
pass against this one. Two are guards (nothing recorded when unwrapped, no
content). Root typecheck is clean, and the full `apps/api` suite passes.

**Production check (PC, `strale_ro`; cloud cannot reach Postgres).** After real
Serper traffic:

```sql
SELECT capability_slug, cost_breakdown->'link_resolution'
FROM transactions
WHERE cost_breakdown ? 'link_resolution'
ORDER BY created_at DESC LIMIT 20;
```

Expect rows for google-search, keyword-rank-check and the other Serper tools,
with `resolved` mostly equal to `links`. A steady `failed_requests` > 0 means
`/resolve` is broken.

**Not done.** `transactions_meta` (the `strale_verify` view) has no
`cost_breakdown`, so the narrow credential cannot read this either. It is the
same gap the 11-01 checkpoint recorded for H5.
