Intent: stop the x402 settlement-drop alert from firing after a one-off burst (the false page of 2026-11-03).

- The baseline was the 7-day mean, so one large job on 2026-10-30 lifted it for a week and an ordinary day on 2026-11-03 read as a drop below half, hours after the buyer was back.
- `jobs/x402-settlement-watch.ts` now reads seven 24h buckets per payer (fixed-hour intervals, so no DST drift) and uses the median of the daily totals. Per-payer baselines are medians of the payer's own days; "everyone else" is the median of their combined daily totals; top buyers are ranked by their typical day, so a one-burst payer cannot outrank the steady buyer.
- Tests: unit replay of the shape (fires under the old mean, healthy now, still pages on a real stop), and a Postgres integration scenario that seeds the burst; that scenario fails against the old code and passes against the new (run locally against a throwaway Postgres 16).
- No deploy-pipeline dependency beyond the existing job registration (`registerJobSync`, unchanged).
