# Pre-push diagnostics — PR1 (SQS deletion)

**Date:** 2026-05-05
**PR1 head:** `063d53a chore: final SQS reference sweep`
**Authority:** DEC-20260503-B (Notion `33c67c87082c81c5bd9fe6d6e330934a`)

---

## Summary

**Check A — lifecycle state distribution (active=true).** 285 active, 6 suspended, 1 probation, 1 degraded. After PR1, the 8 non-active capabilities will not auto-recover; manual flips via `lifecycle-transition.ts --slug X --to active` for any to be reactivated. Below the explicit "more than 5 in degraded would never recover" trip in the prompt's plan-invalidating findings: 1 in `degraded`, well within tolerance.

**Check B — solutions cascade prediction.** 113 currently-active solutions; 3 (2.7%) would be deactivated by the new "every step has at least one passing test_result in 30 days" gate on the next test scheduler tick. Below the 10% stop threshold. All three Singapore solutions, all blocked on the same dead step `singapore-company-data` which has not produced a passing test_result in the last 30 days.

**Stop-condition check:** none triggered.
- Lifecycle: 1 capability in `degraded` (threshold for halt was >5).
- Cascade: 2.7% (threshold for halt was >10%).

**Phase 2 (frontend grep):** skipped — see §2 below.

---

## Phase 1 — Diagnostics output

Verbatim stdout from `npx tsx apps/api/scripts/prepush-diagnostics.ts` (run 2026-05-05 against the production database via the project's `.env` `DATABASE_URL`):

```
=== Check A — lifecycle state distribution ===

┌─────────┬─────────────────┬───────┐
│ (index) │ lifecycle_state │ count │
├─────────┼─────────────────┼───────┤
│ 0       │ 'active'        │ 285   │
│ 1       │ 'suspended'     │ 6     │
│ 2       │ 'probation'     │ 1     │
│ 3       │ 'degraded'      │ 1     │
└─────────┴─────────────────┴───────┘

=== Check B — solutions cascade prediction ===

┌─────────┬────────────────────────┬──────────────────┬──────────────────────┐
│ (index) │ currently_active_total │ would_deactivate │ pct_would_deactivate │
├─────────┼────────────────────────┼──────────────────┼──────────────────────┤
│ 0       │ 113                    │ 3                │ '2.7'                │
└─────────┴────────────────────────┴──────────────────┴──────────────────────┘

=== Check B — sample of solutions that would be deactivated ===

  invoice-verify-sg  →  dead steps: singapore-company-data
  kyb-complete-sg  →  dead steps: singapore-company-data
  kyb-essentials-sg  →  dead steps: singapore-company-data

Done. No writes performed.
```

### Schema-name deltas vs the prompt's draft SQL

The prompt's draft SQL assumed `solution_steps.solution_slug` and `test_results.success` / `test_results.created_at`. The actual schema (verified in `apps/api/src/db/schema.ts`) uses `solution_steps.solution_id` (UUID, joined through `solutions.id`), `test_results.passed` (boolean), and `test_results.executed_at` (timestamptz). The diagnostic script uses the actual names.

---

## Phase 2 — Skipped

Skipped per chat decision 2026-05-05. The strale-frontend working tree is dirty with an in-progress redesign that includes the SQS-rendering pages (`src/pages/CapabilityDetail.tsx`, `src/pages/SolutionDetail.tsx`, plus a fresh `src/components/integrations/`, `src/data/integrations/`, `design-system/`, `design-mockups/` set of directories not yet committed). Folding SQS field removal into the redesign supersedes the inventory step.

---

## Decision

Push approved. 8 lifecycle-stuck capabilities accepted as manual-flip backlog. 2.7% solutions cascade accepted as below threshold. SG-specific cascade flagged for separate investigation (3 SG solutions, all blocked on `singapore-company-data` having no passing test in last 30 days).
