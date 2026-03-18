# Pipeline Phase II — Lifecycle State Machine

**Intent:** Build the lifecycle state machine and automated transitions for capabilities.

**Date:** 2026-03-17
**Commit:** a8b4f6a

## What Was Built

### `src/lib/lifecycle.ts` (new)

Core state machine module. Three exports:

**`transitionCapability(slug, toState, reason, triggeredBy)`**
- Updates `lifecycle_state` on capabilities table
- Inserts `health_monitor_event` with `eventType: "lifecycle_transition"`, tier 1, full audit trail in `details: { from, to, reason, triggered_by }`
- `triggeredBy`: "auto" | "admin" | "validation"

**`evaluateLifecycle(slug)`**
Auto-transition logic based on current state + SQS + time in state:
| Condition | Transition |
|-----------|-----------|
| `probation` + 30d + SQS ≥ 60 | → `active` |
| `active` + SQS < 40 or circuit_breaker | → `degraded` |
| `degraded` + SQS ≥ 60 + been degraded ≥ 48h | → `active` |
| `degraded` + SQS < 20 + been degraded ≥ 7d | → `suspended` |

Time-in-state is determined by scanning the last 20 `lifecycle_transition` events in `health_monitor_events` for the capability (in-memory JSON filter, fast).

**`runLifecycleSweep()`**
Bulk evaluates all capabilities in `probation`, `active`, or `degraded` states.

### `src/lib/health-sweep.ts` (modified)
Added step 7: calls `runLifecycleSweep()` after the upstream escalation sweep. Wrapped in try/catch, logged per-transition.

### `scripts/lifecycle-transition.ts` (new)

Admin CLI:
```bash
# Manual transition
npx tsx scripts/lifecycle-transition.ts --slug <slug> --to <state> --reason "explanation"

# Run automated sweep
npx tsx scripts/lifecycle-transition.ts --sweep
```

Validates that slug exists before transitioning. Prints `from → to` and reason on success.

### `scripts/validate-capability.ts` (modified)
After running all 15 Gate 1 checks, if `lifecycleState === "validating"`:
- All 15 pass → transition to `probation` ("All 15 Gate 1 checks passed")
- Any fail → transition to `draft` (lists the failing check names in reason)

Does NOT affect capabilities in other states (`active`, `probation`, etc.).

## State Machine Diagram

```
draft ──(validate, pass)──→ probation ──(30d + SQS≥60)──→ active
  ↑                                                          ↓     ↑
(validate, fail)←──── validating                     SQS<40 or   SQS≥60
                                                      circuit    + 48h
                              suspended ←──(7d + SQS<20)── degraded
                                  ↑
                             admin --to suspended
                                  ↓
                              admin --to draft
```

Manual-only: any → suspended, suspended → draft

## Default State of Existing Capabilities

All 229 existing capabilities have `lifecycle_state = 'active'` (the schema default). They will be evaluated on the next health sweep and degrade if SQS < 40 or circuit breaker is active.

## Notes

- `probation_since` is not a column — it's derived from `health_monitor_events` at evaluation time. If no event exists (seeded in probation), `getStateEnteredAt` returns null and the probation → active transition won't trigger. Use `lifecycle-transition.ts --slug X --to active` to manually promote if needed.
- `suspended → draft` is manual-only (via `lifecycle-transition.ts`)
- The `validating` state is set by running `lifecycle-transition.ts --slug X --to validating` before running validate-capability.ts
