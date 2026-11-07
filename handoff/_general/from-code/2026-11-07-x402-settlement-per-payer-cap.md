Intent: redesign the x402 settlement-drop baseline after review round 3 found the total-day spike cap could lower the bar during a real drop (PR #950).

Supersedes the design described in `2026-11-06-x402-settlement-spike-cap.md`; that file stays as history.

## What changed in `apps/api/src/jobs/x402-settlement-watch.ts`

- **The cap is per payer now, not per day of totals.**
  - A payer's usual day is the median of its non-zero days over the 7 baseline days plus 7 older context days. The context days only inform the usual day; they never enter the mean.
  - A day is capped at `max(3 x usual, 10)`. The floor of 10 means a small payer is never touched and nobody is capped to 0.
  - A day is capped only when the same payer had a usual baseline day both before and after it. The last 24h is never "after" evidence, because it is what is being judged.
- **Other payers are never touched.** The total baseline is the sum of the per-payer baselines, so "everyone else" is their own plain mean.
- **Unattributed rows (payer null) are never capped.**
- **The query reads 15 buckets** (last 24h, 7 baseline, 7 context).
- **A missing `day_ago` or `n` column is refused** (`bucketsFromQueryRows`), instead of being read as 0. A negative count is refused too.
- **`distinctPayers7d` uses the same basis as the baseline.** The log key is now `capped_payer_days`.

## Accepted costs

- A single payer that surges and then returns to its usual level for a full baseline day is treated as a one-off job, even if it was a short-lived ramp.
- A burst in the newest baseline day is capped only once a usual baseline day has followed it.
- A one-day buyer that never returns keeps the plain mean, so it can produce a concentrated **warning** (not a CRITICAL).

## Evidence

Both runs were against a throwaway local Postgres 16, with the schema from `drizzle-kit push` and the startup migrations applied.

- `archive/receipts/2026-11-07-test-run-x402-per-payer-cap-fail-before.json`: 18 of 36 fail on the round-2 code. Among them, the Postgres scenario in which steady payers drop while one buyer bursts reads as concentrated instead of broad.
- `archive/receipts/2026-11-07-test-run-x402-per-payer-cap-after.json`: 40 of 40 pass. This run includes the e2e alert-delivery test.

Review round 4 ran as an independent read-only agent in a separate context. Its verdict is recorded in the PR #950 body.

There is no new deploy dependency: `registerJobSync` is unchanged. After deploy, the `x402-settlement-watch` log line carries `capped_payer_days`.
