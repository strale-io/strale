# 2026-07-02 — Railway production outage recovery

Intent: Check status of the Strale Railway deployment and restore it if down.

## What happened
- Production API (strale-production.up.railway.app) was returning 502 "Application failed to respond".
- Root cause chain:
  1. Postgres on Railway had a severe I/O degradation episode ~08:30–09:00 UTC today — one checkpoint took 20 minutes (`total=1205s`, normally <30s), client authentications hit `canceling authentication due to timeout`.
  2. The API crash-looped at startup on `CONNECT_TIMEOUT postgres.railway.internal:5432` (fatal in `startup-migrations-begin`), exhausted `restartPolicyMaxRetries: 10`, and Railway stopped restarting it → service stuck in CRASHED.
  3. Postgres recovered on its own (direct connection: 771ms, `pg_stat_activity` empty, volume at 8GB/100GB — NOT a repeat of the 2026-05-04 disk-full incident), but nothing restarted the app.
- Fix: `railway redeploy --service strale` → deployment `51642542` SUCCESS at 21:30 CET. Verified: `/health` 200 (commit af580be), `/v1/capabilities` 200 in 0.67s (DB-backed, proves Postgres connectivity).

## Estimated downtime
~11 hours (approx. 08:30 UTC → 19:32 UTC). No alerting fired.

## Loose threads (flagged, not fixed)
1. **No alerting caught this.** `BETTER_STACK_SOURCE_TOKEN` is unset in production ("log shipping disabled" at startup). No external uptime monitor exists. An 11-hour outage went unnoticed. Spawn-task chip created for adding uptime monitoring + alerting.
2. **Startup hard-fails on transient DB unavailability.** `runStartupMigrations()` treats a DB connect timeout as fatal; combined with `restartPolicyMaxRetries: 10` + `ON_FAILURE`, any DB blip longer than ~10 restart cycles permanently kills the service until a human redeploys. Consider: retry-with-backoff around startup DB connection, and/or Railway restart policy change, and/or a healthcheck-based restart.
3. The Postgres I/O degradation cause is unknown (transient Railway host issue suspected). Worth watching for recurrence.
