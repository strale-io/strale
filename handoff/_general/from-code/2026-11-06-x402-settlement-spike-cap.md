Intent: stop the x402 settlement-drop alert from firing after a one-off burst (the false page of 2026-11-03).

## The problem

- The baseline was the 7-day mean.
- One large job on 2026-10-30 lifted that mean for a week.
- On 2026-11-03 an ordinary day therefore read as a drop below half of it, hours after the buyer was back.

## What changed in `jobs/x402-settlement-watch.ts`

- **Buckets:** one per (payer, 24h periods back from now). Epoch arithmetic means a DST change cannot stretch a bucket, and the bucket count follows `BASELINE_DAYS`.
- **Baseline:** still the daily mean, after **capping isolated spikes**. A baseline day is capped at 3x the larger of the average of the newer days and the average of the older days. The day next to it is left out of each side when that side has others, so a job that straddles a bucket boundary is capped on both days.
- **Days never capped:** the newest and oldest baseline days. A burst yesterday looks the same as a ramp yesterday, so it is capped only once a normal day has followed it.
- **Payer scaling:** the cap scales every payer's count that day by the same factor, so baselines and shares stay additive.
- **Reporting:** the log and the alert say how many days were capped.

## Rejected designs (review rounds 1 and 2)

**The median of the daily totals**, for three reasons:
- a quiet weekend would page;
- a degraded level becomes the baseline after four days;
- a buyer active on three or fewer days vanishes from it.

**Leaving out any day above 3x the rest.** It dropped the last healthy days of a deep outage and the first days of a ramp.

Round 2 found the same class of bug as round 1: the baseline being lowered exactly when a real drop happens. So the design changed to "spike = high against both sides", and tests pin every reviewed shape to the mean's behaviour.

## Evidence

Fail-before and pass-after test runs, against a throwaway local Postgres 16:
- `archive/receipts/2026-11-06-test-run-x402-spike-cap-fail-before.json`
- `archive/receipts/2026-11-06-test-run-x402-spike-cap-after.json`

No new deploy dependency: the job registration (`registerJobSync`) is unchanged.
