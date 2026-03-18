# HM-2: Weekly Platform Health Digest Email

**Intent:** Build the weekly Monday 08:00 CET platform health digest email.

**Date:** 2026-03-17
**Commit:** 37a8619

## What Was Built

### `src/lib/digest-compiler.ts`

Compiles `DigestData` from multiple DB sources. All queries run in parallel.

**Sections compiled:**
- `snapshot` — capability counts by lifecycle_state (active/degraded/suspended/probation/validating/draft)
- `sqsDist` — SQS distribution (Excellent ≥90, Good 75–89, Fair 50–74, Poor 25–49, Degraded <25, Pending=null) — active capabilities only
- `weekOverWeek` — lifecycle transition events this week vs prior week (active/degraded/suspended/probation deltas)
- `tier3Proposals` — unresolved `proposal_created` events (no matching `proposal_approved`/`proposal_rejected`), numbered 1..N
- `tier2Actions` — all tier=2 events in last 7 days
- `tier1Summary` — counts by event_type + named lists for stale_date fixes, dead URL fixes, field renames, circuit breaker trips, upstream exclusion count
- `qualification` — probation/validating capabilities with run count + current SQS
- `demandSignals` — top 5 from failed_requests last 7d, grouped by task+category
- `infra` — runDependencyHealthChecks() + test run count + pass rate + estimated cost from test_suites.estimated_cost_cents

### `src/lib/digest-formatter.ts`

Formats `DigestData` → `{ html: string, subject: string }`.

- Subject: `STRALE PLATFORM HEALTH — Week of [date]`
- Mobile-friendly HTML, single-column, inline CSS only
- Dark header (#0f172a) with week label
- State cards with emoji (✅⚠️🔴🔵⏳📋) and SQS distribution row
- Tier 3 proposals: APPROVE-N / REJECT-N reply instructions + curl command fallback
- Footer with generated timestamp and curl commands for all actionable items
- Sections omitted if empty (no tier2/tier3/qualification if empty)

### `src/lib/digest-sender.ts`

Sends via Resend:
- `sendDigestEmail(html, subject)` — throws on failure
- `isEmailConfigured()` — checks RESEND_API_KEY without throwing

**Env vars:**
- `RESEND_API_KEY` — required to send
- `HEALTH_DIGEST_EMAIL` — recipient (default: `admin@strale.io`)
- `HEALTH_DIGEST_FROM` — sender (default: `Strale Health Monitor <health@strale.io>`)

### Endpoint: `POST /v1/internal/health-monitor/send-digest`

Admin auth (ADMIN_SECRET). Added to `internal-health-monitor.ts`.

```bash
# Send immediately
curl -X POST /v1/internal/health-monitor/send-digest \
  -H "Authorization: Bearer $ADMIN_SECRET"

# Preview HTML without sending
curl -X POST /v1/internal/health-monitor/send-digest \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"preview_only": true}'
```

Response includes `digest_summary` (snapshot + proposal/action/signal counts).

### Scheduler: Monday 08:00 CET

Added `scheduleWeeklyDigest()` to `startScheduledTests()` in `test-runner.ts`.

- Computes ms until next Monday 08:00 Europe/Stockholm via `Intl.DateTimeFormat`
- CET↔CEST transitions handled automatically
- First fire via `setTimeout`, then `setInterval(7d)`
- Skips silently if `RESEND_API_KEY` not set

## Env Vars to Add (Railway)

```
RESEND_API_KEY=re_...
HEALTH_DIGEST_EMAIL=petter@strale.io
HEALTH_DIGEST_FROM=Strale Health Monitor <health@strale.io>
API_BASE_URL=https://strale-production.up.railway.app
```

## Testing

1. Get preview HTML: `curl -X POST .../send-digest -d '{"preview_only":true}'`
2. Set `RESEND_API_KEY` and `HEALTH_DIGEST_EMAIL`, then trigger manually
3. Verify sections are populated correctly as health_monitor_events accumulate

## What This Does NOT Cover

- Reply-to-act parser (HM-4)
- Interrupt emails (HM-3)
- Proposal approve/reject endpoint (linked in curl commands but not built — HM-4 scope)

## Next Session

- HM-3: Interrupt emails (suspension warnings, mass failure detection)
- Or: Deploy to Railway + set env vars to test live digest
