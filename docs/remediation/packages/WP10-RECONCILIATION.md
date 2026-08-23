# WP10 — post-deploy reconciliation

**Status:** MERGED_DEPLOYED_UNDER_OBSERVATION
**Merged:** PR #376, squash commit `ce5e63f091863f56764829b498525211cd2ab234`
**Deployed:** `GET /health` → `{"status":"ok","commit":"ce5e63f09186"}` — the served
artifact, not a deploy log line (DEC-20260504-C).
**Reconciled:** 2026-08-23 09:10–09:29 UTC, read-only against production.
**Acceptance:** NOT YET. The seven-day cadence measurement is the gate.

Everything below was read from production. Nothing was mutated, and no job run
was manufactured to produce evidence.

---

## 1. Migration artifacts, verified by database object

Not by deploy logs — a clean log line proves a line was emitted, nothing more.

| artifact | check | result |
|---|---|---|
| `job_schedule` table | `to_regclass('public.job_schedule')` | `job_schedule` |
| `next_run_at` NOT NULL | `information_schema.columns.is_nullable` | `NO` |
| due index | `pg_indexes` where `indexname='job_schedule_due_idx'` | present |
| `capabilities.onboarding_hook_failures` | `information_schema.columns` | present |
| its default | `column_default` | `0` |

Block 0104's own verification refuses to report success unless `next_run_at` is
NOT NULL, because a nullable column would let a row exist that `claimJob`'s
`next_run_at <= now()` predicate can never match — a job that looks registered
and never runs. Production confirms `NO`.

## 2. Registration — exactly the 11 migrated jobs

First read after boot returned **11 rows**, matching `MIGRATED_JOBS` exactly.
Seven further rows appeared later as the test scheduler's auxiliary slots first
fired (`chromium-probe`, `diagnostics`, `health-check`, `meta-daily`,
`meta-hourly`, `retention`, `weekly-sweep`), for 18 total. Those are
`consumeDueSlot` rows and are expected.

## 3. Declared intervals match the code authority

Cross-checked programmatically against `apps/api/src/jobs/migrated-jobs.ts`
rather than by eye. **11 of 11 match, no row in production undeclared in code.**

| job | interval_ms | period |
|---|---|---|
| activation-drip | 21,600,000 | 6h |
| capability-promotion | 86,400,000 | 24h |
| db-retention | 86,400,000 | 24h |
| ingest-cy-directors | 604,800,000 | 7d |
| ingest-ee-directors | 86,400,000 | 24h |
| invariant-checker | 7,200,000 | 2h |
| onboarding-retry | 3,600,000 | 1h |
| quality-floor | 86,400,000 | 24h |
| reindex-transactions | 86,400,000 | 24h |
| revenue-heartbeat | 3,600,000 | 1h |
| x402-settlement-watch | 3,600,000 | 1h |

## 4. No row is permanently unclaimable

`count(*) WHERE next_run_at IS NULL` = **0**.

## 5. No lease survives beyond its declared expiry

`count(*) WHERE lease_owner IS NOT NULL AND lease_expires_at < now()` = **0**.
Active leases at every observation = **0**.

`last_started_at IS NOT NULL AND last_finished_at IS NULL` = 7, and all seven
are auxiliary slots, which by design record only a start: `consumeDueSlot`
consumes the slot before the task body runs and deliberately writes no outcome
it cannot know. **Migrated jobs in that state: 0.** No crash-recovery claim, no
watchdog expiry, no stranded lease.

## 6. First runs advance from the RUN, not from boot

The decisive check for the defect this package closes. For every completed run:

```
next_run_at - (last_finished_at + interval_ms) = 0.000 seconds
```

| job | finished (UTC) | next run | drift |
|---|---|---|---|
| revenue-heartbeat | 08-23 09:09:50 | 08-23 10:09:50 | 0.000s |
| invariant-checker | 08-23 09:10:51 | 08-23 11:10:51 | 0.000s |
| activation-drip | 08-23 09:11:49 | 08-23 15:11:49 | 0.000s |
| db-retention | 08-23 09:14:50 | 08-24 09:14:50 | 0.000s |
| x402-settlement-watch | 08-23 09:14:50 | 08-23 10:14:50 | 0.000s |
| onboarding-retry | 08-23 09:17:49 | 08-23 10:17:49 | 0.000s |
| ingest-ee-directors | 08-23 09:19:50 | 08-24 09:19:50 | 0.000s |
| ingest-cy-directors | 08-23 09:19:50 | **08-30** 09:19:50 | 0.000s |
| quality-floor | 08-23 09:25:34 | 08-24 09:25:34 | 0.000s |
| reindex-transactions | 08-23 09:25:34 | 08-24 09:25:34 | 0.000s |

Two rows are worth reading twice, because they are the defect inverted:

- **`weekly-sweep` is next due 2026-08-30.** It ran 141 times in 17.6 days
  before this — 56x its declared cadence — because its throttle was an
  in-process map that reset on every restart. It is now scheduled once, a week
  out, in a row that survives restarts.
- **`quality-floor` is next due 2026-08-24 09:25.** It ran 51 times in seven
  days before this against a declared 24h period. The armed enforcement job now
  has the enforcement window its code always claimed.

Zero failures across all 11 jobs: `consecutive_failures = 0` everywhere,
`last_outcome = 'error'` on nothing.

## 7. What is NOT yet proven

The first-boot rows were created at `now() + startupDelayMs`, which is correct
for a first-ever registration and is *not* the same as proving a restart cannot
move them. The reconciliation above shows cadence advancing from the run; it
does not yet show cadence **surviving a deploy**, because no restart has
occurred since the merge.

That is the seven-day measurement's job, and it must not be manufactured by
forcing a restart.

---

## Seven-day acceptance gate — due 2026-08-30

Rerun the exact production measurement that demonstrated the defect:

- `quality_floor` `tick_complete` events: expect **≈7 per week**, not ≈50.
- `capability_promotion` `tick_complete`: expect convergence to daily.
- `upstream_escalation` clustering (the weekly health sweep): expect ≈1 run per
  week, and — the real test — **no correlation with process starts**. Before
  WP10, 45 of 47 promotion ticks sat 4.8 minutes after a quality-floor tick,
  exactly the difference between their boot delays. That correlation
  disappearing is the defect closing.

Also inspect for:

- overlapping runs of the same job;
- crash-recovery claims (`job-coordinator-recovered`);
- watchdog expiries (`job-coordinator-job-timed-out`);
- jobs accumulating `consecutive_failures`;
- jobs whose observed cadence materially differs from `interval_ms`.

If that measurement closes the defect and the above stay clean, WP10 moves to
ACCEPTED through the normal acceptance record.
