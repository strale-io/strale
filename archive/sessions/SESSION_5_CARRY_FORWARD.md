# Session 5 carry-forward

Findings that surfaced during Phase B+C execution and belong in Session 5
synthesis, not in the existing phase reports. These are observations about
*the system* and *the process* that are broader than any single fix already
shipped — Session 5 should treat them as architectural themes, not as
line-item work.

Written at Phase C green-light (2026-04-17T18:55Z) immediately after the
advisory-lock hotfix. Authored by the agent that ran Phase B+C.

---

## SCF-1 — Advisory-lock + `postgres.js` pool pattern missed in Session 0

**Shape**: the same anti-pattern existed in four background jobs; three of
them had been silently stuck in production for an unknown duration before
Phase C's deploy surfaced the fourth.

**What the pattern is**: `pg_try_advisory_lock(id)` (session-scoped) called
through Drizzle's pooled `getDb()`, followed by work, followed by
`pg_advisory_unlock(id)`. Because `postgres.js` hands out a different
connection per statement, the lock sat on connection A while subsequent
statements — including the unlock — borrowed connections B, C, D. Postgres
emitted `WARNING: you don't own a lock of type ExclusiveLock` on every
phantom unlock, but nothing was listening for it. The lock stayed held
until the original backend's session ended, which for idle pool connections
could be hours.

**Where it lived**:
- `apps/api/src/jobs/integrity-hash-retry.ts` (lock id 20260417)
- `apps/api/src/jobs/activation-drip.ts`       (lock id 20260402)
- `apps/api/src/jobs/db-retention.ts`          (lock id 20260415)
- `apps/api/src/jobs/test-scheduler.ts`        (lock id 314159)

The retry worker's 30s cadence made its stall visible first. The other
three — every 6h / 24h / 5min — silently stopped processing. Activation
emails may not have gone out for some window; retention cleanup may have
skipped some ticks; test-scheduler ran, but without the deduplication the
lock was meant to provide.

**Why Session 0 missed it**: the review looked for "is a lock held" and
"is unlock called," both of which were true in code. The hazard is the
*interaction* between `pg_try_advisory_lock` (session-scoped) and a
connection pool that borrows connections per statement. That's an
integration-level bug, not a grep-level bug.

**Relationship to Pattern P1 (fire-and-forget silent swallowing)**:
identical in shape — work that *looks* like it's happening but isn't, with
the failure mode hidden from normal observability. F-0-009 targeted
fire-and-forget error loss in async work; the advisory-lock bug is the same
failure mode for a different mechanism (Postgres WARNING in logs, but no
metric or alert ever looks at it).

**Session 5 action**: treat this as one architectural theme, not four
separate fixes already made. Sweep the codebase for any other place where
a stateful PG session-scoped resource is acquired through a pooled
connection. Candidates: `LISTEN`/`NOTIFY`, `SET LOCAL` outside a
transaction, prepared-statement cursors, temporary tables. For each hit,
either (a) switch to a transaction-scoped or connection-dedicated pattern,
or (b) add an integration test that exercises the bug (real Postgres,
assert the lock is released).

---

## SCF-2 — No job-liveness check in the runner/scheduler layer

**The gap**: three jobs stopped processing but no alert fired. Their work
was idempotent and their cadences were slow enough that *"this job hasn't
logged anything in 24h"* wasn't noticed. The retry worker's stall was
noticed only because Spot-check A's audit-endpoint polling timed out during
the Phase C deploy verification.

**What's missing**: a "liveness heartbeat" per scheduled job —
`<job>-heartbeat-stale` log line (or metric) if no `<job>-batch-done` /
completion line has been emitted within N × INTERVAL_MS. `test-scheduler`
actually has a heartbeat (`scheduler_heartbeat` health event) — the model
is there, it just hasn't been applied to the other three.

**Scope**: Session 3 (test execution pipeline) owns the scheduler/runner
layer and should pick this up. The implementation is cheap (watchdog tick
in-process + one metric); the design question is where to raise the alarm
— stdout log that Better Stack rules catch, or a real metric in a sink that
has an alerting UI.

**Concrete proposal for Session 3 to evaluate**:
1. Each long-lived job exports `lastBatchDoneAt` (timestamp).
2. A 60s watchdog in the scheduler reads each job's timestamp; if any is
   older than `3 × INTERVAL_MS`, emit `<job>-heartbeat-stale` warn.
3. Better Stack rule on `label:*-heartbeat-stale` → page.

Not a hotfix priority — the advisory-lock fix eliminates the proximate
cause — but necessary infrastructure before we trust any other slow-cadence
job to keep running.

---

## SCF-3 — Untracked workflow modifies production schema

**What was discovered**: during Phase C pre-deploy, the migration
`0047_integrity_hash_status` was blocked because the `integrity_hash_status`
column already existed in production with 205 rows tagged `'customer'` and
`'test'`. Investigation (`PHASE_C_COLUMN_INVESTIGATION.md`) revealed that
the column was added by a prior Phase C migration attempt *and then
populated by an external workflow* — likely a Retool automation or manual
psql session — that writes `'customer'` / `'test'` tags for analytics
classification. The workflow is not in the main codebase, not in any
sibling repo under `strale-io/`, and is not documented anywhere in Notion.

**Why it's a problem beyond "we had to rename the column"**:

1. The collision was caught only because the agent ran a pre-migration
   audit. A blind `drizzle-kit push` would have either succeeded (and
   silently joined the two workflows on one column) or failed (and
   confused the deploy pipeline).
2. Anyone looking at the main codebase has no way to know this column
   is co-owned. The next developer who touches it could corrupt the
   analytics dataset or have theirs corrupted.
3. We don't know what *other* schema modifications the same workflow
   (or other untracked workflows) have made. There may be other columns,
   indexes, triggers, functions, or views in prod that live outside
   version control.

**Proposed resolution for Session 5**:

- **Inventory**: run a one-time audit that compares production schema
  against the current migration chain's expected schema. Any column,
  index, constraint, trigger, function, or view that exists in prod but
  is not produced by migrations is an untracked modification. Script
  lives in `apps/api/scripts/audit-schema-drift.mjs` (to be written).
- **Document**: for each untracked modification, create a Notion page
  under Internals > Tech stack that records what it is, who owns it,
  what it does, and whether it's safe. If no owner is found, either
  absorb the modification into a migration or remove it.
- **Gate**: CI step that refuses to merge a migration if it would
  conflict with any known untracked modification, using the inventory
  above as a lookup.
- **Rule**: going forward, no one (human or AI) writes to prod schema
  outside the migration chain. If Retool automations or ops scripts
  need to add columns, they go through a migration PR like any other
  code change.

**Not a hotfix priority** — the column rename dodged the immediate
collision — but this is the most under-controlled part of the production
environment and it will bite again.

---

## SCF-4 — Two valid patterns for long-running job locks

The advisory-lock hotfix shipped two different patterns, one per category
of job. Both are correct for their category; Session 5 should document
when each applies so future jobs don't reach for the wrong one.

### Pattern A — xact-scoped lock inside a transaction

**When**: job's work is short (< 1s wall-clock), idempotent-inside-tx, and
a rollback-on-error is acceptable (or desirable).

**Shape**:
```ts
await db.transaction(async (tx) => {
  const [lock] = await tx.execute(
    sql`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`,
  );
  if (!(lock as { acquired?: boolean })?.acquired) {
    logWarn("<job>-lock-busy", "another holder; skipping tick");
    return;
  }
  // all work here — lock auto-releases at commit/rollback on the same
  // connection that took it. Pool reuse cannot separate lock from work.
});
```

**Jobs that use it**: `integrity-hash-retry`, `activation-drip`,
`db-retention`.

**Why it's right**: the xact lock is guaranteed to sit on the same
connection as every statement inside the callback, and it auto-releases
the moment the transaction ends. No `pg_advisory_unlock` call, no
pool-reuse gap, no orphan warnings.

**Caveat**: all work is in one transaction. On any exception, *everything*
rolls back. For the three jobs that use this pattern, that's the right
behavior — each tick is one logical unit of work.

### Pattern B — dedicated connection + session-scoped lock

**When**: job's work is long (seconds to minutes), makes external HTTP
calls, or writes many independent records that should commit individually
regardless of later failures.

**Shape**:
```ts
async function withAdvisoryLock<T>(id: number, fn: () => Promise<T>) {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [row] = await client`SELECT pg_try_advisory_lock(${id}) AS acquired`;
    if (!row?.acquired) return { acquired: false as const };
    try {
      return { acquired: true as const, value: await fn() };
    } finally {
      await client`SELECT pg_advisory_unlock(${id})`.catch((err) =>
        logError("<job>-lock-release-failed", err, { lockId: id }),
      );
    }
  } finally {
    await client.end({ timeout: 5 }).catch((err) =>
      logError("<job>-lock-client-end-failed", err, { lockId: id }),
    );
  }
}
```

**Jobs that use it**: `test-scheduler`.

**Why it's right**: the dedicated `postgres(url, { max: 1 })` client is not
shared with any other code, so the lock and the unlock are guaranteed to
run on the same session. The work inside the callback uses the regular
pool (`getDb()`) for its writes, so individual `test_result` rows commit
independently. A crash during capability #7 doesn't roll back the first 6.

**Caveat**: doubles the connection count for the lifetime of the job
(one dedicated + N pool borrows). Negligible in practice (one extra
connection), but worth knowing.

### The wrong thing (don't do)

- Session-scoped `pg_try_advisory_lock` through a pooled connection
  (e.g. `getDb().execute(...)`). This was the bug. Pool reuse separates
  the lock from the unlock and the lock stays held until the backend
  terminates.
- Session-scoped lock + transaction block. Same failure mode — the
  transaction happens on one connection, the lock acquire and release
  can land on another.

### Decision rule for new jobs

```
Is the job's work < 1s, idempotent, and safely rolled-back on error?
 ├─ Yes → Pattern A (xact-scoped lock inside db.transaction)
 └─ No  → Does the job need independent per-item commit?
          ├─ Yes → Pattern B (dedicated client + session lock)
          └─ No  → Re-examine whether you need a lock at all
                   (single-instance jobs don't need one; most scheduled
                   work on Railway is single-instance today).
```

**Session 5 action**: lift this into a short style guide — probably a
comment block at the top of a `lib/job-lock.ts` that exports both patterns
as helpers, so future jobs pick one by calling the right function rather
than re-implementing the primitive.

---

## How Session 5 should use these

SCF-1 and SCF-2 are the same class of problem — **silent stalls in
infrastructure that looks like it's working**. SCF-1 is the proximate
mechanism (advisory locks on a pool), SCF-2 is the reason nobody
noticed. Fixing one without the other leaves the hole open. They should
be a single theme in Session 5 synthesis.

SCF-3 is independent but urgent — it's the only finding here that can
lose data in production rather than just silently stop doing work. It's
not urgent like "tonight" urgent, but it belongs at the top of the
Session 5 backlog.

SCF-4 is documentation, not a fix. It's here because the Phase C
execution produced the right pattern twice and the temptation for the
next developer to copy one into the wrong category is real. A short
`lib/job-lock.ts` with both helpers would kill the temptation.
