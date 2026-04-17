# Phase C deploy observations

**Status**: GREEN-LIGHT (2026-04-17T18:55Z). Bake clock ends 2026-04-19T18:55Z.

This file records the Phase C deploy (F-0-002 rate-limit infra + F-0-009 Stage 2
integrity-hash retry worker), the post-deploy hotfix that unstuck four silently
broken background jobs, and the 48h bake that follows. Written once the deploy
is live — all `PENDING — Petter` rows from the original scaffold have been
filled in with the real verification results.

---

## Deploy metadata

| Field | Value |
|---|---|
| Branch | `claude/infallible-murdock-8d0bc1` (merged and closed) |
| Original HEAD on first deploy | `2f5e28d` — `docs(phase-c): summary of P1 fixes + close the SSRF migration TODO` |
| Hotfix commit on re-deploy | `5f0b6c1` — `Merge pull request #10 from strale-io/claude/infallible-murdock-8d0bc1` (lock-bug hotfix) |
| Phase C PR | #8 — merged 2026-04-17T14:09Z |
| Hotfix PR | #10 — merged 2026-04-17T18:54Z |
| Deploy time (hotfix live) | **2026-04-17T18:55:00Z** |
| Deploy host | Railway project `desirable-serenity` / service `strale` / deployment `f47f2f44-6a29-4c5f-b36d-e23a246af695` |
| Bake clock ends | 2026-04-19T18:55:00Z |

---

## Pre-flight static checks (local, `claude/infallible-murdock-8d0bc1` @ hotfix HEAD)

All run from the repo root on 2026-04-17.

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` | ✅ clean | `tsc --noEmit` returns 0, no output. |
| `npm test` | ✅ 15 files, 192 pass / 4 skip (F-0-004 FIXMEs from Phase B) | 6.1s; `audit-token.test.ts` passes in CI (workflow-level `AUDIT_HMAC_SECRET`). |
| `npm --workspace=apps/api run lint:no-bare-catch` | ✅ `no bare '.catch(() => {})' found.` | From apps/api cwd. |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | ✅ green | Run from repo root. |
| `npm --workspace=apps/api run lint:ssrf-inventory` | ⚠ CI-workflow bug — fixed by commit `314cbca`, CI now calls the script directly. See "Resolved pre-deploy" below. |

### Migrations present in the branch

| Migration | Purpose | Verified in branch |
|---|---|---|
| `0046_rate_limit_counters.sql` | F-0-002 — DB-backed counters for `/v1/signup`, `/v1/auth/register`, `/v1/auth/recover` | ✅ file present, schema-validator requires `rate_limit_counters.bucket_key` (boot fails if missing) |
| `0047_compliance_hash_state.sql` | F-0-009 Stage 2 — new column (no collision with the prod-only `integrity_hash_status` owned by an untracked workflow — see PHASE_C_COLUMN_INVESTIGATION.md) | ✅ file present, schema-validator requires `transactions.compliance_hash_state` (boot fails if missing) |

Backfill in 0047: every existing row older than 1 hour was set to `'complete'`
so the retry worker doesn't churn on historical rows.

### Retry worker knobs (`apps/api/src/jobs/integrity-hash-retry.ts`)

| Knob | Value | Meaning |
|---|---|---|
| `INTERVAL_MS` | 30_000 | Wake every 30s |
| `STARTUP_DELAY_MS` | 10_000 | Don't fire immediately on boot |
| `GRACE_MS` | 10_000 | Don't race the inserting tx's commit |
| `STALE_WARN_MS` | 5 * 60_000 | Warn when a row pending > 5 min |
| `BATCH_SIZE` | 50 | Max rows processed per wake |
| `MAX_HASH_ATTEMPTS` | 3 | After `STALE_WARN_MS * MAX_HASH_ATTEMPTS`, flip a row to `'failed'` |
| `ADVISORY_LOCK_ID` | 20260417 | Unique id used with `pg_try_advisory_xact_lock` (post-hotfix) |

### `/v1/audit/:id` status handling (`apps/api/src/routes/audit.ts`)

- `pending` → **202 + `Retry-After: 30`** + JSON `{ status, message, transaction_id }`
- `failed`  → **503** + `apiError("capability_unavailable", ...)` — surface to compliance@strale.io
- `complete` → **200** + full audit payload

### Log labels the retry worker emits (search Railway logs / Better Stack)

- `integrity-hash-retry: started` (info, fires once at boot)
- `integrity-hash-retry-lock-busy` (warn — expected during deploy handoff; sustained means two instances racing)
- `integrity-hash-batch-done` (info per batch, contains `completed`, `failed`, `stale`, `batch_size`)
- `integrity-hash-stale-rows` (warn — **any occurrence is an alert**)
- `integrity-hash-retry-row-failed` (error — per-row compute failure)
- `integrity-hash-mark-failed-failed` (error — could not even mark a row `failed`; serious)
- `integrity-hash-retry-batch-failed` (error — the whole tick threw)
- `integrity-hash-retry-startup-run-failed` / `integrity-hash-retry-run-failed` (error — the `runOnce` promise rejected)

---

## Verify the deploy

### 1. Migrations applied in production Postgres — ✅ VERIFIED

Snapshot taken 2026-04-17T19:04Z via `apps/api/scripts/verify-0047-state.mjs`
(read-only, consistent REPEATABLE READ snapshot) plus `verify-phase-c-state.mjs`:

| Check | Result |
|---|---|
| `rate_limit_counters.bucket_key` present | **YES** |
| `transactions.compliance_hash_state` present | **YES** |
| Phase C historical-row distribution | 40,002 rows all `'complete'`, 0 `pending`, 0 `failed` (backfill + retry worker fully caught up) |
| `integrity_hash_status` (other workflow's column) unchanged | **YES** — `{ complete: 39,510, pending: 287, customer: 150, test: 55 }`, identical to the pre-deploy investigation baseline |

### 2. API booted cleanly — ✅ VERIFIED

```
curl -s -o /dev/null -w "%{http_code}\n" https://strale-production.up.railway.app/health
→ 200
```

Railway deploy `f47f2f44` for commit `5f0b6c1` completed with status `SUCCESS`.
Boot logs show the full expected sequence, including:

- `[auto-register] Registered <N> executors + <M> providers, skipped 4 deactivated, <E> errors`
- `[startup] Schema validation passed` (confirms 0046 + 0047 applied)
- `integrity-hash-retry: started (30000ms interval, 10000ms initial delay)` at 18:55:46Z
- `[test-scheduler] DB-driven scheduler started (90s startup delay, 5min poll interval, batch size 20)`
- `[activation-drip] Started (6h interval, 90s initial delay)`
- `[db-retention] Started (24h interval, 5min initial delay)`

### 3. Pino → Railway logs (Better Stack NOT configured) — ✅ STDOUT CONFIRMED

Railway env check: `BETTER_STACK_SOURCE_TOKEN` is **not** set on the `strale`
service. Per `apps/api/src/lib/log.ts`, Pino writes structured JSON to stdout
in that case; Railway captures stdout into its own log stream. Functionally
equivalent for bake-window observability, but no fan-out to Better Stack's
EU source and no alerting UI. See BAKE_MONITORS.md for the query-based
monitoring plan that does not require Better Stack.

| Aspect | Result |
|---|---|
| Better Stack token set in Railway? | **NO** — Pino → stdout → Railway logs |
| Log shape correct (`label`/`level`/`msg`/`env`) | **YES** — verified in Railway log viewer, e.g. `[INFO] integrity-hash-batch-done time=... env="production" completed=5 failed=0 stale=0 batch_size=5` |
| Region | Railway region (US East), not EU — accepted for now |

### 4. Frontend not broken — ✅ VERIFIED (API side)

`/v1/public/ops/*` is the new canonical path for dashboards. During the
transition, both `/v1/internal/*` (admin-required) and `/v1/public/ops/*`
(public, allowlist-filtered) point at the same underlying routers.

| Endpoint | Expected | Actual |
|---|---|---|
| `GET /v1/public/ops/tests/capabilities/email-validate` | 200 | **200** |
| `GET /v1/public/ops/trust/capabilities/email-validate` | 200 | **200** |
| `GET /v1/internal/tests/capabilities/email-validate` (no auth) | 401 | **401** |

Frontend-side rendering of `strale.dev/capabilities/<slug>` and
`strale.dev/solutions/<slug>` is out of scope for this API deploy — if the
frontend still points at `/v1/internal/*` without auth, those pages would
404/401. Frontend migration is decoupled from Phase C.

### 5. `/v1/internal/*` admin-only — ✅ VERIFIED

| Call | Expected | Actual |
|---|---|---|
| `GET /v1/internal/tests/run` (no auth) | 401 | **401** |
| `GET /v1/internal/tests/capabilities/email-validate` (no auth) | 401 | **401** |

Admin wall is up; the `/v1/public/ops/*` allowlist carries the anonymous
traffic.

---

## Spot-check behaviours

### A. Integrity hash Path B end-to-end — ✅ PASS

Transaction `a2360b09-3978-49f7-afe8-160148ebcad4` created at **T = 19:02:12Z**:

| Step | Result |
|---|---|
| `POST /v1/do` (email-validate) → completed | **T+0 / 11ms latency** |
| `GET /v1/audit/:id?token=...` immediately after | **202 + `Retry-After: 30`** (pending, as designed) |
| `GET /v1/audit/:id?token=...` at T+37s | **200** with full audit record including `integrity_hash` populated, `transaction_status: "completed"` |
| `integrity-hash-batch-done` log line with `completed >= 1` visible | **YES** — `completed=4,6,5` across three consecutive ticks in the 18:56–18:58Z window; the txn's own row serviced on the tick at ~19:02:36Z |

### B. SSRF refusal layers — ✅ PASS

| Probe | Expected | Actual |
|---|---|---|
| `url-to-markdown` with `http://169.254.169.254/latest/meta-data/` (AWS metadata) | refused, no charge | **refused** — `"This URL targets a restricted address."`, wallet unchanged (1255¢) |
| `url-to-markdown` with `http://10.0.0.1/admin` (RFC1918) | refused, no charge | **refused** — same message, wallet unchanged |

`ssrf-blocked-resolution` log line — not yet observed in the Railway tail
window (low baseline expected; the two probes above registered as
execution_failed, which is the correct front-line behavior).

### C. DB-backed signup rate limit — ⏸ INTENTIONALLY SKIPPED

This probe would burn the verifying IP's 1/day signup quota on live prod.
Coverage exists at the unit level via `apps/api/src/lib/rate-limit.test.ts`
and via integration in `apps/api/src/routes/internal-auth.test.ts`. The
bake-window observability (see BAKE_MONITORS.md, monitor M5) will pick up
any live regression.

Not tested live on 2026-04-17. If needed during the bake, run from a
disposable IP.

---

## Post-deploy hotfix — xact-scoped advisory locks

### 2026-04-17 ~18:10 UTC — Phase C NO-GO: integrity-hash retry worker silent

**What happened**: After the Phase C deploy of commit `2f5e28d` landed, the
`integrity-hash-retry` worker emitted zero `integrity-hash-batch-done` lines
for 15 consecutive minutes. `compliance_hash_state = 'pending'` rows older
than GRACE_MS accumulated; `/v1/audit/:id` on any new transaction returned
202 + Retry-After:30 indefinitely. Spot-check A exceeded the 120s threshold
→ **NO-GO** call on the original deploy.

**Diagnosis**: `pg_locks` snapshot showed an advisory lock with `objid =
20260417` (the retry worker's `LOCK_ID`) held by an **idle** backend PID.
Adjacent lock IDs `20260402` (activation-drip), `20260415` (db-retention),
and `314159` (test-scheduler) were each held by different idle PIDs —
meaning **all four long-running background jobs had the same bug**, silently,
for an unknown duration. The retry worker's 30s cadence made it the first
one visibly broken; the others run every 6h / 24h / 5min and the symptom —
"the worker just isn't processing right now" — was indistinguishable from
"nothing to do."

**Root cause**: every job held a **session-scoped** `pg_try_advisory_lock`
through Drizzle's `getDb()`, which is a `postgres.js` pool. Pooled
connections are borrowed per statement. The lock sat on connection A;
subsequent queries (including the `pg_advisory_unlock`) borrowed
connections B, C, D. Postgres duly emitted
`WARNING: you don't own a lock of type ExclusiveLock` on every phantom
unlock — the warning was in logs but nothing was listening for it. Lock
stayed held forever until the original connection's session ended.

Session 0's baseline sweep had not flagged the pattern. See SCF-1 in
`SESSION_5_CARRY_FORWARD.md`.

### 2026-04-17 ~18:50 UTC — Hotfix shipped (PR #10 → commit `5f0b6c14`)

All four jobs migrated off session-scoped locks in one commit
(`fix(jobs): switch advisory locks to xact-scoped to fix pool-reuse stuck lock`).

**Three jobs** → `pg_try_advisory_xact_lock` **inside** `db.transaction(async (tx) => ...)`.
The xact-lock pins to the callback's connection and auto-releases at
commit/rollback — pool reuse cannot separate lock from work:

- `src/jobs/integrity-hash-retry.ts`  (30s, batch 50)
- `src/jobs/activation-drip.ts`        (6h)
- `src/jobs/db-retention.ts`           (24h)

**`src/jobs/test-scheduler.ts` diverged** — a poll cycle iterates up to 20
capabilities with ~2s gaps and live external HTTP calls (Browserless, paid
APIs); a literal transaction wrap would (a) hold one pooled connection for
5–10 min, starving `/v1/do`, and (b) rollback every `test_result` write on
any single failure, poisoning the SQS window. It now uses a dedicated
`postgres(DATABASE_URL, { max: 1 })` client scoped to the lock alone; all
test work still flows through the regular pool and commits independently.
Pool reuse is impossible because the lock's client is not shared. See
SCF-4 in `SESSION_5_CARRY_FORWARD.md` for the "when to use which pattern"
guidance.

All four jobs now emit structured `<job>-lock-busy` `logWarn` on skip
(Railway-visible) instead of plain `console.log`.

Supporting lint fix (commit `89234a2`): bare `.catch(() => {})` in the
dedicated-connection helper's cleanup path was caught by the F-0-009
no-bare-catch guard; replaced with
`.catch((err) => logError("test-scheduler-lock-{release,client-end}-failed", err, { lockId }))`.

### 2026-04-17 18:54 UTC — PR #10 merged, deploy triggered

CI green (typecheck, no-bare-catch, SSRF inventory, 192 tests pass).
PR #10 merged to main as commit `5f0b6c14`. Railway auto-deploy picked up
the change at 18:54Z.

### 2026-04-17 18:55–19:04 UTC — Hotfix verified in prod → GO

**Deploy**: Railway build+deploy for `5f0b6c14` completed `SUCCESS` at 18:55Z.

**Job boot logs** (strale service):
```
18:55:46  integrity-hash-retry: started (30000ms interval, 10000ms initial delay)
18:55:56  [INFO] another holder; skipping tick   label=integrity-hash-retry-lock-busy
18:56:46  [INFO] integrity-hash-batch-done       completed=4 failed=0 stale=0 batch_size=4
18:57:20  [INFO] integrity-hash-batch-done       completed=6 failed=0 stale=0 batch_size=6
18:58:46  [INFO] integrity-hash-batch-done       completed=5 failed=0 stale=0 batch_size=5
```

The single `integrity-hash-retry-lock-busy` at 18:55:56Z was the **expected**
handoff race — the pre-deploy container's idle connection still held the old
session-scoped lock until PG released it on session teardown. The next tick
acquired cleanly and started draining.

**The "you don't own a lock of type ExclusiveLock" warning stream that
flooded logs pre-hotfix is gone.** `test-scheduler` ran a full poll cycle
(6 capabilities tested, 6/6 passed) with no orphan-release warnings.

**Final DB state** (verify-locks.mjs + verify-phase-c-state.mjs, 19:04Z):

```
advisory locks on {20260417, 20260402, 20260415, 314159}: 0 rows
compliance_hash_state:  complete = 40,002   pending = 0   failed = 0
oldest pending row: none
integrity_hash_status (other workflow): complete 39,510, pending 287,
                                         customer 150, test 55 — UNCHANGED
```

### Deferred

Deep lock-busy unit tests across all four jobs require a Phase D
Testcontainers harness (real Postgres). Mocking `pg_try_advisory_xact_lock`
inside a drizzle transaction is a fragile proxy for the actual pool-reuse
bug; the right coverage is integration tests that hold an outside lock
and assert the job's `lock-busy` path fires. Follow-up task filed.

---

## Green-light decision

**Call: GO.** Timestamp: **2026-04-17T18:55:00Z** (hotfix deploy finalization).

**Bake clock**: 48 hours — ends **2026-04-19T18:55:00Z**.

Conditions for promotion from GREEN-LIGHT to BAKE-CLEAN at T+48h (see
"Bake timeline" below):

1. No `integrity-hash-stale-rows` log at any checkpoint.
2. No rows in `transactions.compliance_hash_state = 'pending'` older than 2 minutes at any checkpoint.
3. No rows in `transactions.compliance_hash_state = 'failed'` appearing during the bake.
4. `pg_locks` snapshot clean at each checkpoint (no advisory lock on 20260417/20260402/20260415/314159 held by an idle PID for more than 2 minutes).
5. `integrity_hash_status` distribution unchanged at all checkpoints (the untracked workflow's column — Phase C must not be writing to it).
6. `/health` returns 200 throughout.
7. `/v1/audit/:id` 202 rate < 1% of audit responses (sustained) — proxy for retry worker keeping up.

Any violation → stop the bake clock, gather evidence, do NOT hotfix
without explicit authorization. Record the observation in the "Bake
timeline" section and wait.

---

## Resolved pre-deploy

### P1 — `lint:ssrf-inventory` workspace-script cwd bug

**Status**: fixed on `claude/infallible-murdock-8d0bc1` by commit `314cbca`
(`fix(ci): invoke SSRF inventory guard from repo root to match script cwd
expectation`). CI now runs the script directly with a comment explaining
the quirk. Green on every run since.

### Migration renumber + rename (done post-merge-conflict, pre-main-merge)

- **Renumber**: main grew a `0045_baseline_invalidation_trigger.sql`
  between Phase C's fork point and PR readiness, so Phase C's migrations
  were bumped `0045→0046` (rate_limit_counters) and `0046→0047`.
- **Rename**: Phase C's 0047 was originally `integrity_hash_status` —
  that name collided with an untracked prod-only column owned by a
  separate workflow (see PHASE_C_COLUMN_INVESTIGATION.md). Renamed
  end-to-end to `compliance_hash_state`: migration file, TypeScript
  field, schema-validator string, retry worker column reference. The
  prod `integrity_hash_status` column is left alone; Phase C's code
  never reads or writes it.

See SCF-3 in `SESSION_5_CARRY_FORWARD.md` — "untracked workflow modifies
production schema" is an architectural finding for Session 5.

---

## First-hour observation (T+1h)

### 2026-04-17T~19:55Z — PENDING — will be appended inline

Query batch run ~60 minutes after deploy. Expected shape:

```
compliance_hash_state:  complete = 40,xxx   pending = 0 (or <= 2 rows < 2min old)
integrity_hash_status:  unchanged distribution
advisory locks on {20260417, 20260402, 20260415, 314159}: 0 rows
oldest pending: < 2 min old or absent
```

_(To be filled in at the checkpoint.)_

---

## Bake timeline

Checkpoint queries are in `BAKE_MONITORS.md`. Results appended here at each
checkpoint.

### T+0h (2026-04-17T18:55Z) — deploy finalization

See "Hotfix verified in prod → GO" above. Clean.

### T+1h (2026-04-17T~19:55Z) — PENDING

### T+6h (2026-04-18T00:55Z) — PENDING

### T+24h (2026-04-18T18:55Z) — PENDING

### T+48h (2026-04-19T18:55Z) — PENDING — final green-light check

---

## Anything surprising during the bake (append below)

(Empty so far; entries will land here as they happen. Format:)

```
### <timestamp UTC> — <short description>

What happened:
What was done:
What it means:
```
