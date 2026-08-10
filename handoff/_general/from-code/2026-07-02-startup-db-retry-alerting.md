# 2026-07-02 — Outage follow-up: startup DB retry + alerting gaps

Intent: Close the three alerting/resilience gaps from the 2026-07-02 ~11h outage (see `2026-07-02-railway-outage-recovery.md` for the incident itself).

## Done this session

### 1. Startup DB retry + fatal-startup email alert (PR #147)
- https://github.com/strale-io/strale/pull/147 — awaiting Petter's merge.
- Transient DB connectivity errors at boot (the exact incident shape) now retry in-process with backoff under a shared per-boot budget (default 10 min, `STARTUP_DB_RETRY_BUDGET_MS`). Combined with Railway's 10 restarts this tolerates hours of DB downtime instead of minutes.
- Fatal startup errors now send a critical email via Resend before exit (prod only). **This works TODAY** — `RESEND_API_KEY` + `ALERT_RECIPIENTS` are already set on Railway. Had it existed on 2026-07-02, the page would have fired at ~08:30 UTC instead of silence.
- Six-lens review ran (/go); 1 HIGH + 2 MEDIUM findings fixed pre-PR; full suite green (721 passed).

### 2 & 3. Better Stack log shipping + external uptime monitor — BLOCKED on Petter (~10 min)
Could not complete: no Better Stack account/session exists (checked the browser — not signed in), and account creation/sign-in is an action Claude is prohibited from doing on your behalf. Everything else is prepped. Runbook:

#### A. Create the account (once)
1. Go to https://betterstack.com → Sign up (free plan: 10 monitors, 3-min checks, email alerts — sufficient).
2. Use petter@strale.io so alert routing is consistent.

#### B. Uptime monitor (~3 min)
1. Better Stack → Uptime → Monitors → Create monitor.
2. URL: `https://strale-production.up.railway.app/health/deep`
   - **Use /health/deep, not /health** — it exercises the Postgres write path (insert+delete probe row), so it would have caught the 08:30 DB degradation itself, hours before the crash. Verified working today: 200 in 0.23s, `write_path: ok`, 6ms.
   - Optionally add a second monitor on plain `/health` (process-alive signal) to distinguish "DB degraded" from "app dead".
3. Check frequency: 3 min (free tier max). Expect "200" status. Request timeout: 30s (deep check does a DB write; give it headroom during degradation).
4. Alerting: email to petter@strale.io (default). Add phone/push via the Better Stack mobile app if wanted — voice calls are free-tier unlimited.

#### C. Log shipping source (~3 min)
1. Better Stack → Telemetry (Logs) → Sources → Connect source → platform "JavaScript • Node.js" (Logtail/pino).
2. Copy the **source token**.
3. Then run (or paste the token to Claude Code and it will run):
   ```
   railway variables --set BETTER_STACK_SOURCE_TOKEN=<token> --service strale
   railway redeploy --service strale
   ```
4. Verify after deploy: startup logs should NO LONGER print `alerting.no-log-sink` ("BETTER_STACK_SOURCE_TOKEN unset"). Live logs should appear in the Better Stack Logs UI within a minute.
5. Optional but recommended: in Better Stack Logs, create an alert on `label:"startup-db-retry-exhausted"` OR `severity:"critical"` → email. That pages on the new retry-exhaustion path even if email via Resend also fails.

#### Why Better Stack over UptimeRobot
One vendor covers both gaps (uptime + log sink), the codebase is already wired for it (`@logtail/pino` transport in `lib/log.ts` activates on the env var alone — zero code change), and `lib/alerting.ts` docs already reference it.

## Notes / loose ends
- **Railway project was renamed**: CLAUDE.md and memory say project "desirable-serenity", but `railway status` reports the project name is now **"Strale"** (id `16920e2f-8258-47db-86c0-60ec9d7edc13`). Memory updated this session; CLAUDE.md still says desirable-serenity in two places — cleanup candidate.
- Railway service has `healthcheckPath: null` — no deploy-time HTTP probe. With the in-process retry shipped, adding a Railway healthcheck on `/health` is optional; revisit if deploys ever go live with a broken boot.
- The Postgres I/O degradation root cause remains unknown (suspected transient Railway host issue). The `/health/deep` monitor is the recurrence tripwire.
- Post-merge verification for PR #147 (per DEC-20260504-C): after deploy, confirm boot logs show `startup-migrations-complete` and `GET /health/version`-equivalent (`/health` commit field) shows the new SHA.
