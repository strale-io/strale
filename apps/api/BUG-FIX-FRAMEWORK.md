# Strale Bug Fix Framework

**Status:** Canonical — applies to all bug fixes across the Strale platform
**Last updated:** 2026-03-26

## Why this exists

The Strale platform's testing infrastructure — capability onboarding, test
formulation, test execution, test correction — is the heart of the platform.
Every bug fix must do two things: stop the immediate damage AND make the
platform more robust against the same class of failure.

This framework mandates three phases for every bug. A fix that only addresses
Phase 1 leaves the next instance of the same bug to be discovered by a user.

## Three Phases — Always in Order

### Phase 1 — Contain

**Goal:** Restore correct behaviour as fast as possible.
**Time constraint:** Minutes to an hour. Do not spend Phase 1 time on analysis.
**Output:** The immediate symptom is gone. Platform is in a healthy state.

Do not skip to Phase 3 before Phase 1 is complete.

### Phase 2 — Understand

**Goal:** Build a complete causal chain. Mandatory after every Phase 1.

- **Upstream:** Trace back at least 3 steps. Ask "why was this possible?" Stop
  at a process or architectural gap, not just a line of code.
- **Downstream:** If this bug had persisted, what else would break?
- **Classification:** One-off or a class? If a class, inventory all instances.

**Output:** A `course-correction` Journal entry in Notion with the causal chain.

### Phase 3 — Harden

**Goal:** Make this class of bug impossible or immediately detectable.

Build a gate at the earliest viable lifecycle point:

1. **Onboarding time** — catch it before the capability enters the system
2. **Startup** — catch it before the API serves any requests
3. **Test run** — catch it within 6-24 hours
4. **Invariant cycle** — catch it within 2 hours
5. **Monitoring** — catch it within minutes

A Phase 3 fix that only adds a comment or process note is insufficient.
The gate must be enforced by code or automation.

**Output:** A Claude Code prompt implementing the structural gate, committed
with the causal chain in its Context section.

## Completion Criteria

A bug fix is **complete** when all three exist:
- [ ] Phase 1: Symptom resolved, platform healthy
- [ ] Phase 2: course-correction Journal entry with causal chain
- [ ] Phase 3: Structural gate implemented via CC prompt + commit

## Examples from 2026-03-26

| Bug | Contain | Root cause | Structural gate |
|---|---|---|---|
| Migration not applied | `drizzle-kit migrate` | Code/schema deploy on separate tracks | `schema-validator.ts` startup exit |
| `visible=false` default | `UPDATE SET visible=true` | Seed didn't set visible, no onboarding visibility check | `verifyCapabilityVisibility()` final onboarding step |
| Contaminated baseline | Clear baseline_output | Auto-generated test captured stale output | Migration 0035 contamination detection columns |
| HTTP 408/500 misclassified | Delete stale results | `EXTERNAL_SERVICE_PATTERNS` incomplete | `/HTTP 5\d{2}/i` + `/HTTP 408/i` in sqs.ts |

## Integration with Existing Protocols

- **Scoring Integrity Protocol:** Never change SQS scoring to fix a score — find root cause
- **Capability Onboarding Pipeline:** Preferred location for Phase 3 gates
- **Invariant Checker:** 2-hour safety net for gates that can't run at onboarding
- **Schema Validator:** All migration-added columns queried by code must be in `REQUIRED_COLUMNS`
