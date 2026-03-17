# Pipeline Phase I: Onboarding Foundation

**Intent:** Add foundational infrastructure for quality-gated capability onboarding — new DB columns, health monitor events table, lifecycle-aware queries, validation/smoke-test scripts, field reliability backfill, and test runner integration.

**Date:** 2026-03-17
**Branch:** `feat/pipeline-phase-1`
**Commits:** 2

## What Was Built

### 1. Database Migration (0023_pipeline_foundation.sql)

**New columns on `capabilities` table:**
- `lifecycle_state` VARCHAR(20) NOT NULL DEFAULT 'active' — controls visibility and executability (draft/validating/probation/active/degraded/suspended)
- `output_field_reliability` JSONB — per-field annotations: guaranteed/common/rare
- `visible` BOOLEAN NOT NULL DEFAULT true — controls public catalog visibility
- `onboarding_manifest` JSONB — stores original onboarding manifest for audit trail

**Backfill:** Existing active capabilities → lifecycle_state='active', inactive → 'suspended'

**New table: `health_monitor_events`** — audit trail for all autonomous platform actions
- Columns: id, event_type, capability_slug, tier, action_taken, details, human_override, created_at
- Indexes on (slug, created_at), (event_type, created_at), (tier, created_at)

### 2. Lifecycle-Aware Query Updates

All public-facing queries now filter by `visible` and `lifecycle_state`:
- `GET /v1/capabilities` — only `active` + `visible`
- `GET /v1/capabilities/:slug` — `active` or `degraded` (degraded still findable by slug)
- `POST /v1/do` matching:
  - Direct slug: allows `active`, `degraded`, `probation` (probation enables internal testing by slug)
  - Search/suggest: only `active` + `visible`
- `POST /v1/suggest` — only `active` + `visible`
- Free-tier slug cache — only `active`

MCP server: inherits filtering from `/v1/capabilities` endpoint (no change needed).

### 3. Scripts

**`scripts/validate-capability.ts`** — Gate 1 validation (15 checks):
```
npx tsx scripts/validate-capability.ts --slug <slug>
npx tsx scripts/validate-capability.ts --all
```
Checks: exists, executor registered, name, slug URL-safe, description >=20 chars, valid category, price >0, valid input/output schema, data source, data classification, transparency tag, limitations, 5 test types, field reliability with guaranteed fields.

**`scripts/smoke-test.ts`** — End-to-end verification (7 steps):
```
npx tsx scripts/smoke-test.ts --slug <slug>
npx tsx scripts/smoke-test.ts --all --dry-run
```
Steps: structural validation, live execution with known_answer input, guaranteed field verification, negative test, SQS status, limitations check, discoverability check. `--dry-run` skips live execution (steps 2-4) to avoid cost.

**`scripts/backfill-field-reliability.ts`** — One-time annotation generator:
```
npx tsx scripts/backfill-field-reliability.ts
npx tsx scripts/backfill-field-reliability.ts --dry-run
```
Data-driven (>=3 test results): >90% presence → guaranteed, >50% → common, <50% → rare. Heuristic (no results): schema `required` array → guaranteed, others → common. Reports uncertain cases near thresholds.

### 4. Test Runner Update

`validateResult` in `test-runner.ts` now respects field reliability:
- `guaranteed` field fails → test FAILS (current behavior)
- `common` field fails → test PASSES (acceptable absence)
- `rare` field fails → test PASSES (silently skipped)
- No reliability data → all checks enforced (backward compatible)

This fixes the "address: expected non-null" pattern that broke 8 EU registries.

## Migration Not Yet Run

The migration `0023_pipeline_foundation.sql` has NOT been run against production. Run it after merging:
```
# Via Drizzle or direct SQL against the production database
```

The backfill script should be run AFTER the migration:
```
npx tsx scripts/backfill-field-reliability.ts
```

## What Depends on This

This is the foundation for all subsequent pipeline phases:
1. **ATI Phase A** (classification engine, SQS alignment) — needs lifecycle_state for classification context
2. **Pipeline Phase II** (lifecycle transitions) — needs lifecycle_state column, health_monitor_events for audit trail
3. **Health Monitor HM-1** (event logging) — needs health_monitor_events table
4. **Dark Launch Cadence** — needs visible flag for batch publishing

## Issues / Notes

- All existing capabilities default to `lifecycle_state='active'` and `visible=true` — no visibility disruption
- The `isActive` column is preserved for backward compatibility; lifecycle_state provides finer-grained control
- Scripts import `../src/app.js` for executor registration side effects — this means they load the full app context
- Backfill has not been run yet (depends on migration being applied first)
