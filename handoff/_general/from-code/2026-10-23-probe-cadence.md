Intent: cut outside-source health probes from ~1,000/day per source.

# Health-probe cadence

**Date:** 2026-10-23 · **Branch:** `claude/probe-cadence` · **PR:** draft, not merged.

## Finding

`runDependencyHealthChecks()` was awaited on every test-scheduler poll (the
skip-unhealthy-providers check in `jobs/test-scheduler.ts`, once a minute when
suites are due). Production, 14 days to 2026-10-23: **32,153 probes/day across
31 providers**, ~1,000 per source, each also persisted as a
`health_monitor_events` row. The file header promised ~4×/day. Side effects:
OpenAlex's keyless budget spent by the probe alone (PR #710), load on free
public APIs, and false flaps feeding the Health Monitor.

Other callers are fine as they are: the 6h auxiliary task, the 2h invariant
checker, `self-heal`, the admin route and the weekly digest compiler.

## Change

- `getRecentDependencyHealth(maxAgeMs = PROBE_REUSE_MS)` returns the last run
  if it finished within 10 minutes, else probes. Used by the scheduler's
  per-poll check only.
- `runDependencyHealthChecks()` still probes fresh, and concurrent callers now
  share one in-flight run.
- Expected volume: ~144 probes/day per source at most, ~4,500/day in total
  (−86%), and the same reduction in `dependency_probe` rows.

## Why 10 minutes

Over 14 days, 94 of 149 confirmed outages (2+ failed probes in a row) ended
within 10 minutes; 3 lasted over an hour. Trade-offs, stated plainly:
- A real outage is confirmed after ~20 minutes (two probes) instead of ~2.
- Outages shorter than ~20 minutes mostly read as single blips and drop out
  of the daily outage summary (PR #704) — the intent.
- Tests behind a newly-down provider can run for up to 10 minutes before the
  scheduler starts skipping them.

## Tests

`dependency-health.cadence.test.ts`: reuse inside the window, expiry, fresh
explicit runs, a shared in-flight run, and a source check that the scheduler
calls `getRecentDependencyHealth()`. All 6 fail against `origin/main`.

## After deploy

Re-count `dependency_probe` rows per day and per source in
`health_monitor_events`. Expect ≤144 per source from the scheduler, plus the
6h/2h jobs.
