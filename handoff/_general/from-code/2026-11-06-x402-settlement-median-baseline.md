Intent: stop the x402 settlement-drop alert from firing after a one-off burst (the false page of 2026-11-03).

- The baseline was the 7-day mean, so one large job on 2026-10-30 lifted it for a week, and on 2026-11-03 an ordinary day read as a drop below half, hours after the buyer was back.
- `jobs/x402-settlement-watch.ts` now reads one bucket per (payer, whole 24h periods back). The bucket boundaries use epoch arithmetic, so a DST change cannot shift them, and the bucket count follows `BASELINE_DAYS`.
- The baseline is still the daily mean. It first leaves out up to two burst days, a burst day being the busiest day when it exceeds three times the average of the others. The same days are dropped for every payer, so per-payer baselines and shares still add up.
- The median was tried first. The review rejected it because a quiet weekend would page, it hid slow degradation after four days, and buyers active on three or fewer days vanished from it. Tests now pin all three cases to the mean's behaviour.
- Accepted cost: a buyer whose whole history is one or two days reads as a burst until its third day.
- Tests:
  - A unit replay of the shape: it fires under the old mean, is healthy now, and still pages on a real stop.
  - A Postgres integration scenario that seeds the burst. It fails against the old code and passes against the new, run locally against a throwaway Postgres 16.
- No new deploy dependency: the job registration (`registerJobSync`) is unchanged.
