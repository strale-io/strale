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
  - The Claude extraction step runs only for free text (`task`), or when the direct search has no confident match. In those cases it behaves exactly as before.
  - Customers who send a plain name now skip that call: cheaper and faster.
- **Startup block 0142** (`startup-migrations/blocks/0142-canadian-paid-call-suites.ts`, ledger M085; policy `once`):
  - un-parks the Shopify suite `c3743322-…` (test_status `normal`, reason cleared);
  - sets the `known_bad` suite `f4bba1a4-…` inactive, because refusing free text is Claude's job, so that test can only work by paying;
  - matches by id, slug, type and current state; never touches `updated_at`.
  - The ledger `known_overlaps` entries for `test_suites.active`, `test_status` and `quarantine_reason` record why the writes are disjoint from blocks 0111, 0113 and 0114.
- **Manifest:** the Shopify fixture is kept, with a comment on why it is now free.
- **Tests:**
  - `capabilities/canadian-company-data.name-path.test.ts` (4): the plain name makes no Claude call; `task` does; an unmatched name falls back to Claude; a number reaches neither. 2 of them fail against the old executor.
  - `lib/startup-migration-0142.test.ts` (4): exact rows, no `updated_at`, no Date parameters, idempotent.
  - The `paid-call-guard.test.ts` regression now uses `task` input, which still reaches Claude.
  - The Shopify search-results sample moved to `capabilities/__fixtures__/canadian-shopify-search-results.ts`.
- Full API unit suite, root typecheck, migrations:check, migrations:test, env/models checks and lints are green.

## Deploy dependency (DEC-20260504-C)

- Block 0142 runs at boot through `runStartupMigrations()` (registered in `BLOCKS` in `lib/startup-migrations.ts`).
- Post-deploy check through `GET /v1/ops-read/parked-suites`: the Shopify suite is gone from the list, and the `known_bad` suite shows `active: false`.
- Then, after the next hour, the Shopify suite's `last_result_at` advances through `parked-suites`/`test-call-cost` without it being parked again.

## Next

- Next authorised action: after deploy, run the two ops-read checks above and record the result on the PR | Owner: this session | Blocker: none.
