# Phase 8: Dark Launch Tooling

**Intent:** Build operational scripts and admin endpoints for the Monday morning publish workflow.

**Date:** 2026-03-17
**Commit:** 4d029d8

## What Was Built

### `scripts/batch-publish.ts`

Publishes qualified capabilities by setting `visible = true`.

```bash
npx tsx scripts/batch-publish.ts --slugs slug1,slug2,slug3
npx tsx scripts/batch-publish.ts --all-qualified
npx tsx scripts/batch-publish.ts --all-qualified --dry-run
```

- Verifies: `isActive=true`, `lifecycleState='active'`, `visible=false`
- Live SQS check via `computeCapabilitySQS()` — skips if pending or score < 60
- Logs `lifecycle_transition` event with `humanOverride=true`
- Prints published list and skipped list with reasons

### `scripts/platform-status.ts`

Quick platform snapshot.

```bash
npx tsx scripts/platform-status.ts
npx tsx scripts/platform-status.ts --json
```

**Sections:**
- Capability counts (active+visible, active+hidden, probation, validating, degraded, suspended, draft, total)
- SQS distribution using cached `matrixSqs` (excellent ≥90, good 75–89, fair 60–74, poor <60, building=null)
- Test health by `testStatus`
- Recent events last 7 days by `eventType`
- Ready-to-publish list (active+hidden, sorted by SQS desc, warns below threshold)

### `scripts/capability-report.ts`

Detailed per-capability report.

```bash
npx tsx scripts/capability-report.ts --slug swedish-company-data
npx tsx scripts/capability-report.ts --slug swedish-company-data --json
```

**Sections:**
- Overview (name, category, type, geography, data source, price)
- State (lifecycle, visible, isActive)
- Live SQS with factor breakdown (5 factors, rate, passed/total, weighted contribution, trend, circuit breaker)
- Circuit breaker details (state, consecutive failures, totals, timestamps)
- Test suite counts by type (quarantined counts shown)
- Last 5 test results (pass/fail, type, latency, timestamp, failure reason + classification)
- Field reliability (guaranteed/common/rare field groupings)
- Limitations (from `capability_limitations`, with severity icons)
- Recent health events (last 10, with tier and human override flag)

### Admin API endpoints (added to `internal-health-monitor.ts`)

All require `Authorization: Bearer $ADMIN_SECRET`.

```bash
# Publish (SQS ≥ 60 + active required)
POST /v1/internal/capabilities/:slug/publish

# Unpublish (sets visible=false, keeps lifecycle state)
POST /v1/internal/capabilities/:slug/unpublish

# Suspend (sets lifecycle_state='suspended', visible=false)
POST /v1/internal/capabilities/:slug/suspend
# Optional body: { "reason": "..." }

# Platform status JSON (same data as platform-status.ts --json)
GET /v1/internal/platform-status
```

All publish/unpublish/suspend endpoints log `lifecycle_transition` events with `humanOverride=true`.

## Publish Threshold

`PUBLISH_SQS_THRESHOLD = 60` (DEC-20260317-F). Enforced in both `batch-publish.ts` and the `/publish` endpoint.

## Monday Morning Workflow

1. `npx tsx scripts/platform-status.ts` — check the platform state
2. `npx tsx scripts/capability-report.ts --slug <slug>` — investigate specific capabilities
3. `npx tsx scripts/batch-publish.ts --all-qualified --dry-run` — preview publish
4. `npx tsx scripts/batch-publish.ts --all-qualified` — publish all qualified

Or via API:
```bash
curl -H "Authorization: Bearer $ADMIN_SECRET" /v1/internal/platform-status
curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" /v1/internal/capabilities/slug/publish
```

## What This Does NOT Cover

- Reply-to-act parser (HM-4)
- Proposal approve/reject endpoint (HM-4 scope)

## Next Session

- HM-4: Reply-to-act parser (approve/reject tier-3 proposals by email reply)
- Or: Deploy to Railway and set RESEND_API_KEY to test live digest
- Or: Begin frontend dashboard for admin publish workflow
