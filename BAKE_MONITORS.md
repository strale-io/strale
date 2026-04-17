# Bake-window monitors — Phase C

Bake clock: **2026-04-17T18:55:00Z → 2026-04-19T18:55:00Z** (48h).

Better Stack is **not** configured on the Railway `strale` service, so
these monitors are script-based rather than a saved dashboard. Each one is
a query plus a decision rule. Run manually at checkpoints (T+1h, T+6h,
T+24h, T+48h) or wrap in a cron task — either produces the same paper
trail.

The six monitors below are the minimum coverage called for by the Phase C
close-out brief. Results are appended to
`PHASE_C_DEPLOY_OBSERVATIONS.md` under "Bake timeline" at each checkpoint.

---

## How to run these

**Against prod Postgres**:

```bash
cd apps/api
node scripts/verify-locks.mjs          # M1 + M2 + cross-check M3
node scripts/verify-phase-c-state.mjs  # M2 + cross-check that the other-workflow column is unchanged
```

Both scripts read `DATABASE_URL` from the repo-root `.env` and hit prod
read-only.

**Against Railway logs** (M4, M5, M6 require the log stream):

```bash
# The Railway CLI streams recent logs; pipe through grep to count:
railway logs --service strale 2>&1 | grep -cE 'integrity-hash-retry-lock-busy'
railway logs --service strale 2>&1 | grep -cE 'ssrf-blocked-resolution'
railway logs --service strale 2>&1 | grep -cE 'free-tier-counter-read-failed'
railway logs --service strale 2>&1 | grep -cE '"audit.*202'
```

These counts are cumulative over the CLI's tail window. For a per-hour
signal, run at the checkpoint and compare against the previous run.

---

## M1 — Advisory-lock health

**Query**:
```sql
SELECT objid, pid, granted,
       (SELECT state FROM pg_stat_activity WHERE pid = pl.pid) AS backend_state,
       (SELECT now() - state_change FROM pg_stat_activity WHERE pid = pl.pid) AS idle_for
FROM pg_locks pl
WHERE locktype = 'advisory'
  AND objid IN (20260417, 20260402, 20260415, 314159);
```

**Expected**: 0 rows at rest. Rows may briefly appear while a job is
actively running, but their `backend_state` should be `active` (not `idle`)
and `idle_for` should be near zero.

**Alert rule**: any row where `backend_state = 'idle'` and `idle_for > 2
minutes`. That's the pool-reuse bug re-emerging. Stop the bake clock,
gather evidence, do not hotfix.

**Why 2 minutes**: the longest-running job tick is a test-scheduler poll at
5–10 minutes, but it uses a dedicated connection so the lock PID
should never be idle. For the other three jobs, ticks are well under 2
minutes.

---

## M2 — Pending-row drain

**Query**:
```sql
SELECT COUNT(*) AS stuck_pending
FROM transactions
WHERE compliance_hash_state = 'pending'
  AND created_at < NOW() - INTERVAL '2 minutes';
```

**Expected**: 0.

**Alert rule**: any row pending > 2 minutes. The retry worker runs every
30s and processes up to 50 rows per tick; a row should drain within one or
two ticks. Accumulation means the worker is stalled (→ M1) or failing per-row
(→ M6 + new log label `integrity-hash-retry-row-failed`).

Supplementary query — how old is the oldest pending row right now:
```sql
SELECT id, created_at, NOW() - created_at AS age
FROM transactions
WHERE compliance_hash_state = 'pending'
ORDER BY created_at ASC LIMIT 5;
```

---

## M3 — `compliance_hash_state = 'failed'` rows appearing

**Query**:
```sql
SELECT COUNT(*) AS failed_rows
FROM transactions
WHERE compliance_hash_state = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours';
```

**Expected**: 0 during the bake.

**Alert rule**: any non-zero count. A `failed` flip means the retry worker
tried `MAX_HASH_ATTEMPTS = 3` times and the row's hashable payload is
permanently broken — likely a capability-executor bug that wrote something
the hash function can't serialize. Investigate per-row via the
`integrity-hash-retry-row-failed` log with `transactionId` matching.

---

## M4 — `<job>-lock-busy` volume

**Where**: Railway logs.

**Signals** (count per hour per label):
- `integrity-hash-retry-lock-busy`
- `activation-drip-lock-busy`
- `db-retention-lock-busy`
- `test-scheduler-lock-busy`

**Expected**: a handful per hour at most, specifically around
deploy/restart boundaries where the old container's lock takes a
moment to release.

**Alert rule**: a sustained run (> 10/hour for > 2 consecutive hours on
the same label) means two instances of the same job are fighting for the
lock. With Phase A Q2's single-replica deploy that shouldn't happen; if
it does, check Railway for an orphaned container.

**Informational, not critical**: the lock-busy path is the *correct*
behavior when contention happens. A single hit is fine.

---

## M5 — Free-tier 503 rate (`free-tier-counter-read-failed`)

**Where**: Railway logs.

**Query**:
```bash
railway logs --service strale 2>&1 | grep -cE 'free-tier-counter-read-failed'
```

**Expected**: 0 or essentially zero.

**Alert rule**: any non-trivial rate (> 2 per hour sustained). The
free-tier DB counter is failing; users calling no-auth capabilities are
getting 503s. This is a hard user-facing break and Phase B / F-0-002's
DB-backed counter path has a regression.

---

## M6 — `/v1/audit/:id` 202 rate

**Where**: Railway logs.

**Signal**: ratio of 202 responses to total `/v1/audit/:id` responses over
a 10-minute window.

**Approximation command**:
```bash
# Count 202s and 200s on the audit route in the tail window.
railway logs --service strale 2>&1 | grep -cE 'GET /v1/audit/.*202'
railway logs --service strale 2>&1 | grep -cE 'GET /v1/audit/.*200'
```

**Expected**: `202 / (200 + 202)` well below 1% sustained. 202 is the
*fresh-transaction* response — any user hitting the audit endpoint within
~10s of the POST will get one. In aggregate it should be rare because
callers either wait or poll with backoff.

**Alert rule**: sustained > 1% over 10 minutes means the retry worker is
not keeping up — either it's stalled (→ M1) or the batch isn't draining
fast enough. Check `integrity-hash-batch-done` log — `stale` field should
stay at 0; if `completed` < `batch_size` consistently, throughput is the
issue and BATCH_SIZE may need bumping.

---

## Additional cross-checks (not alerts, but run at each checkpoint)

### Cross-check 1 — the other workflow's column is unchanged

```sql
SELECT integrity_hash_status, COUNT(*)
FROM transactions
GROUP BY 1
ORDER BY 2 DESC;
```

**Baseline at T+0h**:
```
complete  39,510
pending      287
customer     150
test          55
```

At each subsequent checkpoint, `customer` and `test` counts should be
**stable or increasing** (the untracked analytics workflow may continue to
tag). `complete` grows naturally with traffic. Any *decrease* in
`customer` or `test` means Phase C's code is writing to the wrong column
— a serious regression that contradicts the rename.

### Cross-check 2 — `rate_limit_counters` occupancy

```sql
SELECT bucket_key, count, window_start
FROM rate_limit_counters
WHERE window_start > NOW() - INTERVAL '24 hours'
ORDER BY count DESC
LIMIT 20;
```

**Expected**: table has rows for `signup:*`, `auth:register:*`,
`auth:recover:*` buckets as organic traffic arrives. An empty result
means nothing is hitting those endpoints (plausible at low baseline
traffic) or the rate-limit write path is broken (check for
`db-rate-limit-failed` in logs).

### Cross-check 3 — `/health` reachable

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://strale-production.up.railway.app/health
```

**Expected**: 200.

---

## Checkpoint procedure

At each checkpoint (T+1h, T+6h, T+24h, T+48h):

1. Run `node apps/api/scripts/verify-locks.mjs`. Capture the output.
2. Run `node apps/api/scripts/verify-phase-c-state.mjs`. Capture the output.
3. Tail recent Railway logs and note any `*-stale-rows`, `*-row-failed`,
   `*-rate-limit-failed`, or `free-tier-counter-read-failed` occurrences.
4. Check `/health`.
5. Append a dated entry to `PHASE_C_DEPLOY_OBSERVATIONS.md` "Bake timeline":

```
### T+<h>h (<timestamp UTC>) — <clean | anomaly>

M1 advisory locks: <count>, backend_state: <any idle?>
M2 stuck pending: <count>
M3 failed rows: <count>
M4 lock-busy: <count by label, per hour>
M5 free-tier 503s: <count>
M6 audit 202 rate: <approx ratio>
Cross-check 1 (integrity_hash_status): unchanged | <delta>
Cross-check 2 (rate_limit_counters): <row count>
Cross-check 3 (/health): 200 | <status>
```

If any alert rule fires, stop the bake clock and record evidence. Do not
hotfix without explicit authorization.

---

## When the bake clock expires

At **T+48h (2026-04-19T18:55:00Z)**:

- If all four checkpoints were clean: write "Bake complete — Phase D
  cleared" section in `PHASE_C_DEPLOY_OBSERVATIONS.md`, commit, push,
  stop. Do not auto-start Phase D; wait for explicit authorization.
- If any checkpoint showed an anomaly that was investigated and cleared:
  note it in the bake timeline and proceed to the "cleared" section with
  a footnote.
- If an anomaly is open: do not declare bake-clean. Keep the clock
  stopped. Surface the evidence and wait.
