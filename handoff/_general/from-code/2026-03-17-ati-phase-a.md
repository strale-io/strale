# ATI Phase A: Classification Engine + SQS Constitution Alignment

**Intent:** Complete ATI Phase A — upstream escalation tracker, won't-fix status annotations, and classification breakdown on quality endpoints.

**Date:** 2026-03-17
**Branch:** `feat/ati-phase-a` (based on `feat/pipeline-phase-1`)
**Commits:** pending

## What Was Built (This Session)

Most of ATI Phase A was already implemented in prior sessions (failure-classifier.ts, SQS upgrade with 10-run window / linear decay / MIN_RUNS=5 / evidence filtering / circuit breaker, schema columns). This session completed the remaining pieces:

### 1. Upstream Escalation Tracker (`src/lib/upstream-tracker.ts`)

New module that tracks upstream failure patterns and auto-escalates:
- **5+ `upstream_transient` in 48h** → marks test suites as `upstream_broken`
- **3+ `upstream_changed` in 7 days** → logs `health_monitor_event` for human review
- Deduplicates flag events to avoid spam
- Wired into test runner (post-run check for failed capabilities)
- Wired into health sweep (bulk escalation check)

### 2. Won't-Fix Test Status Script (`scripts/apply-test-status.ts`)

Script to annotate known structurally-limited capabilities:
- `ecb-interest-rates` → `infra_limited` (ECB SDW API geo-restricted to EU)
- `page-speed-test` → `env_dependent` (Google rate-limits shared IPs)
- `youtube-summarize` → `env_dependent` (requires auth context)
- `norwegian-company-data` → `upstream_broken` (brreg.no intermittent from non-NO IPs)

Run after deploy: `npx tsx scripts/apply-test-status.ts`

### 3. Classification Breakdown on Quality Endpoints

Both public and internal quality endpoints now return `failure_classification` — a breakdown of recent (30-day) failure verdicts:
- `GET /v1/quality/:slug` → `failure_classification: { upstream_transient: 5, capability_bug: 1, ... }`
- `GET /v1/internal/trust/capabilities/:slug` → same breakdown

This lets agents and the dashboard understand *why* a score is what it is.

## Already Implemented (Prior Sessions)

- `failure-classifier.ts` — 7-verdict classification engine
- SQS computation with 10-run window, linear decay weights, MIN_RUNS=5
- Evidence filtering (only capability_bug + upstream_degraded/changed count in SQS)
- Circuit breaker penalties (-30 for 3 consecutive failures, -20 for 5 correctness, -15 for schema break)
- "Building track record" and "Unverified" qualification states
- `failure_classification` and `auto_fixed` columns on test_results
- ATI columns on test_suites (test_status, quarantine_reason, last_classification, auto_remediation_log)
- Health sweep with auto-remediation (5 rules)

## Scripts to Run After Deploy

1. `npx tsx scripts/apply-test-status.ts` — annotate won't-fix capabilities
2. Pipeline Phase I migration (if not yet run): `0023_pipeline_foundation.sql`
3. `npx tsx scripts/backfill-field-reliability.ts` — field reliability annotations

## What Depends on This

- **Pipeline Phase II** (lifecycle transitions) — uses upstream-tracker for automated state changes
- **Health Monitor HM-1** — uses health_monitor_events for escalation audit trail
- **Dashboard** — can display failure_classification breakdown per capability
