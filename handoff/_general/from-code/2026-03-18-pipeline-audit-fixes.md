Intent: Fix 4 critical/high pipeline bugs found in comprehensive audit

## What was done

All 4 bugs from the pipeline audit (session ending 2026-03-17) are fixed and shipped.

### Bug 1 — CRITICAL: transitionCapability() didn't set `visible` flag
**Fix**: Added `STATE_VISIBILITY` map in lifecycle.ts. All state transitions now set
`visible = STATE_VISIBILITY[toState]` (active/degraded → true, all others → false).
The entire lifecycle pipeline was broken without this — probation→active wouldn't
make capabilities discoverable.

### Bug 2 — HIGH: validate-capability.ts check 15 too strict
**Fix**: Changed from "at least one guaranteed field" to "annotations exist and non-empty".
AI-extraction capabilities (invoice-extract, web-extract, etc.) legitimately have no
guaranteed fields — all fields are conditional on document content. invoice-extract now
passes 15/15 checks.

### Bug 3 — HIGH: Column defaults pipeline-unsafe
**Fix**: Migration 0024 changes:
- `lifecycle_state` DEFAULT: `'active'` → `'draft'`
- `visible` DEFAULT: `true` → `false`
- Added `degraded_recovery_count INTEGER NOT NULL DEFAULT 0`
New capabilities via INSERT now correctly start as hidden drafts, not immediately active.

### Bug 4 — MEDIUM: degraded→active fires on single qualifying run
**Fix**: Recovery now requires `DEGRADED_RECOVERY_RUNS=3` consecutive qualifying evaluations.
`degraded_recovery_count` column tracks the streak. Resets to 0 on any non-qualifying
evaluation or any state transition.

## Files changed
- `apps/api/src/lib/lifecycle.ts` — STATE_VISIBILITY map, visible in UPDATE, recovery counter
- `apps/api/src/db/schema.ts` — updated defaults, added degradedRecoveryCount column
- `apps/api/drizzle/0024_pipeline_safe_defaults.sql` — migration
- `apps/api/scripts/validate-capability.ts` — check 15 relaxed

## Status
- Committed: 3ad7e9f
- Pushed to main
- Migration 0024 applied to production DB
- invoice-extract validates 15/15 ✅
- TypeScript build clean ✅

## Temp scripts left untracked (can delete)
- scripts/apply-0024.ts
- scripts/check-defaults.ts
