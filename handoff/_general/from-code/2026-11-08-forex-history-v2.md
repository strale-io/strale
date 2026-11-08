Intent: move `forex-history` off Frankfurter v1 onto the v2 blended central-bank time series, through the shared `lib/fx` module.

In the 7 days to 2026-11-07, 19 paid calls failed. The causes were v1 522s and currency pairs v1 does not carry. Besides fixing those, this:

- removes the bare `fetch` and the raw body read;
- moves the manifest from `checks: pending` to `checks: recorded`.

[BACKFILL] Cloud session; no Notion write was made.

## How it was built

**Codex:**

| Run | Commit | Review | Findings |
|---|---|---|---|
| `forex-history-v2` | a4dbd84e | FAIL | **HIGH:** v2 starts a series at the last publication before `from` when none falls on it (live: GBP→NGN 2025-03-01 → 2025-02-28), and the strict range check rejected those as upstream. **MEDIUM:** `2026-02-30` passed date validation. |
| `forex-history-v2-2` | f971b400 | PASS-WITH-NITS | Both fixed. Live GBP→NGN, USD→VES and USD→ARS go through the executor. |

**Claude:**

- **302b39a7:** re-recorded the replay fixture live.
- **This commit:**
  - accepts at most one leading point before `from`;
  - makes `fx-unsupported-currency.test.ts` stub global `fetch` to throw, so the old executor can no longer pass by reaching v1;
  - adds a leap-day test.

**Tests:**

- The full `apps/api` vitest passes: 471 files, 0 failed (packages built first).
- Typecheck, `refdata:check` and `vendor-terms:check` pass.

## Still open

- **On the PC:** run `validate-capability` and `smoke-test` for `forex-history`. Both need the database.
- **After deploy:**
  - `GET /v1/capabilities/forex-history` shows the new `data_source`;
  - `who-called --slug forex-history --days 2 --errors` shows no `Frankfurter API returned HTTP 522`.
