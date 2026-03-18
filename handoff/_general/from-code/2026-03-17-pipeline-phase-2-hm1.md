# Pipeline Phase II Complete + HM-1 Event Logging

**Intent:** Finish Pipeline Phase II (lifecycle transitions) and build HM-1 (health monitor event logging).

**Date:** 2026-03-17
**Commit:** 5f2273b

## What Was Built

### A1: Lifecycle threshold corrections (`src/lib/lifecycle.ts`)

Corrected thresholds to match SQS Constitution:
- `ACTIVE_SQS_MIN = 50` (was 60)
- `DEGRADE_SQS_THRESHOLD = 25` (was 40)
- `DEGRADED_SUSPEND_DAYS = 7` (unchanged)
- Removed `PROBATION_DAYS` / `DEGRADED_RECOVERY_HOURS`
- `probation → active`: uses `!sqs.pending && sqs.score >= 50` — run-count gate via SQS `pending` flag (≥5 runs + all 5 factors), not calendar days
- `degraded → active`: `sqs.score >= 50 && !sqs.circuit_breaker`
- `degraded → suspended`: `degradedDays >= 7` regardless of SQS
- `transitionCapability` now uses `logHealthEvent` instead of direct DB insert
- Added `sqsScore?: number` param to `transitionCapability`, stored in event details
- `transitionTier()`: degraded/suspended → tier 2, others → tier 1

### B1: Health monitor event logging (`src/lib/health-monitor.ts`)

New module:
- `logHealthEvent(event: HealthEventInput): Promise<void>`
- Error-swallowing: logs to console but never throws, so callers can fire-and-forget
- All downstream event writes use this (lifecycle, circuit-breaker, upstream-tracker, test-runner)

### A2+B2: Test runner wiring (`src/lib/test-runner.ts`)

After test run completes:
- Logs `classification` event (tier 2 for capability_bug, tier 1 otherwise) with verdict + test context
- Triggers `evaluateLifecycle(slug)` fire-and-forget for affected capabilities

### B3: Circuit breaker events (`src/lib/circuit-breaker.ts`)

- `recordSuccess`: logs `circuit_breaker` recovery event when transitioning from open/half_open
- `recordFailure`: logs `circuit_breaker` trip event after opening breaker

### B5: Upstream tracker refactor (`src/lib/upstream-tracker.ts`)

- Replaced both `db.insert(healthMonitorEvents)` calls with `logHealthEvent()`
- Fixed `tier: 0` → `tier: 1` (invalid value bug)

### A4: quality_warning in /v1/do (`src/routes/do.ts`)

- `buildDualProfileResponse` now accepts `lifecycleState?: string`
- All 3 call sites pass `capability.lifecycleState`
- Response includes `quality_warning: "This capability is currently degraded. Results may be unreliable."` when `lifecycleState === "degraded"`
- Added `lifecycleState: string` to `CapabilityInfo` type

### A3+B6+B8: New internal routes (`src/routes/internal-health-monitor.ts`)

Mounted at `/v1/internal`:

**`POST /v1/internal/capabilities/:slug/restore`** (admin-only)
- Sets `lifecycle_state → validating`, `visible = false`
- Logs lifecycle_transition event with `humanOverride: true`

**`GET /v1/internal/health-monitor/events`**
- Returns health_monitor_events with filters: `since`, `capability_slug`, `tier`, `event_type`
- `limit` param, default 100, max 500
- No auth required (internal observability)

**`POST /v1/internal/health-sweep`** (admin-only)
- On-demand trigger for `runWeeklyHealthSweep()`
- Returns full sweep report

## State

All Pipeline Phase II items complete. All HM-1 items complete. TypeScript clean (tsc --noEmit passes).

## Next Session

- HM-2: Human intervention tier (Tier 2 events → alert mechanism)
- HM-3: Proposal workflow (Tier 3 events → proposed_changes queue)
- HM-4: External monitor integration (webhook/email on Tier 2+ events)
- Or: Roadmap review for next priority area
