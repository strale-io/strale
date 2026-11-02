Intent: Settle the two canadian-company-data test suites the paid-call guard parked, without losing the live name-path coverage Gate 5 requires (Petter, 2026-11-02: "do the canadian test cleanup now").

[BACKFILL] Cloud session; no Notion write was made.

## Why not just retire both

- The parked "Shopify" `known_answer` suite is the only live name-path test for `canadian-company-data`.
- Gate 5 (DEC-20260411-B) requires one, because a broken name path once went unnoticed for weeks (the Polish case).
- A stubbed unit test cannot catch Corporations Canada changing its search page.
- The suite was paid only because the executor called Claude to extract a name from text that already was a name.

## Delivered

- **Executor** (`apps/api/src/capabilities/canadian-company-data.ts`, `resolveByName`):
  - A structured `company_name` goes straight to the free Corporations Canada site search.
  - Only an **exact** match is accepted there. A fuzzy (`high`) match on raw caller text could name a different corporation once a city or descriptor is added, so it takes the old path: Claude extracts the name, then the same search and pick as before.
  - Free text (`task`) always takes the old path, and so do refusals and empty results. When Claude returns the text unchanged, the direct candidates are reused rather than searched again.
  - Customers who send a plain registered name now skip the Claude call, which is cheaper and faster.
- **Startup block 0142** (`startup-migrations/blocks/0142-canadian-paid-call-suites.ts`, ledger M085; policy `once`):
  - un-parks the Shopify suite `c3743322-…` (test_status `normal`, reason cleared);
  - sets the `known_bad` suite `f4bba1a4-…` inactive, because refusing free text is Claude's job, so that test can only work by paying;
  - matches by id, slug, type and current state; never touches `updated_at`.
  - The ledger `known_overlaps` entries for `test_suites.active`, `test_status` and `quarantine_reason` record why the writes are disjoint from blocks 0111, 0113 and 0114.
- **Manifest:** the Shopify fixture is kept, with a comment on why it is now free.
- **Tests:**
  - `capabilities/canadian-company-data.name-path.test.ts` (8):
    - an exact plain name makes no Claude call;
    - `task` does;
    - no candidates, a fuzzy match, and a refused match each fall back to Claude;
    - an unchanged extraction reuses the direct candidates;
    - a non-numeric `corporation_number` is not a structured name;
    - a number reaches neither the search nor Claude.
    - The exact-only rule is pinned: the fuzzy-match test fails against the round-1 executor.
  - `lib/startup-migration-0142.test.ts` (4): exact rows, no `updated_at`, no Date parameters, idempotent.
  - The `paid-call-guard.test.ts` regression now uses `task` input, which still reaches Claude.
  - The Shopify search-results sample moved to `capabilities/__fixtures__/canadian-shopify-search-results.ts`.
- Full API unit suite, root typecheck, migrations:check, migrations:test, env/models checks and lints are green.

## Deploy dependency (DEC-20260504-C)

- Block 0142 runs at boot through `runStartupMigrations()` (registered in `BLOCKS` in `lib/startup-migrations.ts`).
- Post-deploy check through `GET /v1/ops-read/parked-suites`: the Shopify suite is gone from the list, and the `known_bad` suite shows `active: false`. That proves 0142 ran.
- What ops-read cannot prove: that the Shopify suite then runs free. Its checks list parked suites only, and public trust aggregates per capability.
  - What it can show: if the suite ever reaches Claude again, the guard re-parks it and it reappears in `parked-suites` within its next hourly run. So re-checking `parked-suites` after an hour or more proves no spend.
  - Proving coverage (a fresh `test_results` row for that suite) needs a per-suite ops-read check or the PC route. Not added here.
- Deploy race (review finding 4): during Railway's container overlap, the old process may run the un-parked suite with the Claude-first executor. It would then be parked again; no money is spent.
  - Because 0142 is `once`, recovering would need a new block. The post-deploy `parked-suites` check shows whether this happened.
- Coverage trade-off: the Claude extraction path (`task` and the fallback) now has stubbed tests only, with no live scheduled coverage, by design under the paid-call rule.

## Next

- Next authorised action: after deploy, run `parked-suites` straight away and again an hour or more later, and record both results on the PR | Owner: this session | Blocker: none.
