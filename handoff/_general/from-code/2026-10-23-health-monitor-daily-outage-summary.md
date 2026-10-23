Intent: stop per-event Health Monitor emails for outside data sources; send one daily summary instead.

# Health Monitor — daily outside data-source outage summary

**Date:** 2026-10-23 · **Branch:** `claude/health-monitor-daily-digest-ee6a1e` · **PR:** draft, not merged.

## Why

Petter's inbox received 577 "Strale Health Monitor" emails between 2026-08-24
and 2026-10-23 (~10/day): "<source> is not responding", "<source> recovered",
"Multiple dependencies failing simultaneously". In production, every alert
email of the 30 days before this change (`health_monitor_events`,
`situation_assessment` with `alert_sent=true`, plus recoveries) concerned a
third-party source. None was actionable for him.

## What changed

- `apps/api/src/lib/external-outage-digest.ts` (new): `isExternalDependency`
  (manifest tier not `self-hosted` and not `strale_infrastructure`; unknown
  names count as Strale's own and keep alerting), a pure
  `summarizeExternalOutages` over persisted `dependency_probe` rows, the email
  renderer (Swedish time, plain language), and `sendExternalOutageDigest`
  (no email when nothing went down; records an `external_outage_digest`
  health event either way).
- `intelligent-alerts.ts`: external dependencies go through
  `handleExternalProbeResult` — no per-event email. Immediate email only when
  the outage has lasted ≥ 60 min AND ≥ 1 failed paid, non-internal call hit a
  capability behind it since it went down (or the assessment already carries
  `customersAffected`). One email per outage (in-memory + DB dedupe across
  restarts); recovery is emailed only for an escalated outage.
- `test-scheduler.ts`: sends the summary on the first poll from 08:00 to
  11:59 Europe/Stockholm (due slot `external-outage-digest`, 12h interval).
- `internal-health-monitor.ts`: `POST /v1/internal/health-monitor/send-external-outage-digest`
  (`{ "preview_only": true }` to preview).
- Unchanged: Browserless/own-service alerts, scheduler-stale, mass test
  failure, "API failed to start", `alerting.ts` ("Strale Alerts").

## Evidence

- Tests: `external-outage-digest.test.ts` (13), `intelligent-alerts.external-routing.test.ts` (9);
  7 of the 9 routing tests fail against the pre-change `intelligent-alerts.ts`.
- Read-only production preview for 20–23 Oct: 3–7 sources per day; OpenAlex
  down ~21–22 h every day for a month.
- 30-day backtest: 0 days on which the escalation rule would have fired.

## Second item: "A paying customer has gone quiet" repeats (separate commit)

Production ledger (`health_monitor_events`, `event_type='alert_sent'`,
`alert_key LIKE 'revenue-heartbeat:%'`): 76 alerts in 30 days from 4
customers — 42 from one user account. Two causes in
`apps/api/src/jobs/revenue-heartbeat.ts`:

1. The 12h cooldown keyed on the customer re-paged the same silence every 12h
   (x402 wallets stopped for good: 24h, 36h … 230h).
2. Rhythm = 3 × average gap. The account calls in bursts (median gap ~0, mean
   2.8h, p95 10.8h), so the bar was ~8h and every overnight pause paged.

Fix: key = customer + last paid call (one alert per silence, re-arms on the
next paid call, 15-day cooldown); rhythm = 2 × the median of each day's longest
gap between paid calls (burst-proof, unlike a percentile of all gaps — found in review), floor still 6h. Replay over the same 30 days: 78 → 11 alerts. The
main wallet's bar is 6.9h (inside the 21h outage). No reminder: the condition the
first email describes does not change while the silence lasts. 9 of 13 tests
fail against the old file.

## Deploy

No new env vars. Uses existing `RESEND_API_KEY`, `HEALTH_DIGEST_EMAIL`,
`HEALTH_DIGEST_FROM`. Schedule is in-process (no Railway cron).

## Merged and verified (2026-10-23)

Merged as #704 (`acb6ec3d`) after #710, #712 and #714; live per `GET /health`.
In production: no per-event alert email after the deploy, and the
`preview_only` endpoint returned a 5-source summary while recording nothing.
The first scheduled summary is due from 08:00 Swedish time on 2026-10-24.
Follow-up fix in its own PR: a preview on a quiet day recorded a run and
would have cut short the next morning's window.

## Follow-ups (not done)

- ~~OpenAlex probe/source has been failing ~21 h/day for a month~~ — fixed
  in #710 (the probe was spending OpenAlex's daily budget).
- Both older digests are dead in production: the business "Strale Daily
  Digest" (Railway `strale-digest-cron`, last snapshot 2026-04-14) and the
  weekly HM-2 digest (no schedule).
