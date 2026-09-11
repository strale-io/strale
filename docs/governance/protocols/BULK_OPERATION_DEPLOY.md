---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Bulk-Operation Deploy Protocol (DEC-20260504-B)"
---

# Bulk-Operation Deploy Protocol (DEC-20260504-B)

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 6b). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Bulk-Operation Deploy Protocol (DEC-20260504-B)

**MANDATORY — applies to ANY deploy that fixes a long-silent bulk operation (retention, archival, reconciliation, batch processing, periodic cleanup).**

**Rule:** When fixing a long-silent bulk operation, the deploy must include either: (a) a pre-fix backlog drain plan, or (b) a self-throttling fix that bounds resource usage per tick (e.g., LIMIT-paginated DELETE). Do NOT treat this as a normal bug fix. The first successful run after fixing a long-silent bulk operation is a workload-resumption event, not a routine execution. Audit accumulated workload BEFORE deploying. If accumulated workload could exceed infrastructure capacity (disk, memory, connection pool, rate limits, WAL volume), pre-cleaning or throttling is required.

**Background:** 2026-05-04 Postgres crash incident (Journal entry `35667c87-082c-8148-ae24-faee34f01c1d`). PR #44's retention fix re-enabled bulk DELETE on accumulated rows that had been silently failing for the prior outage window. The first successful run filled the volume; Postgres crash-looped for 28 minutes. The fix itself was correct in isolation — the failure mode was treating "first successful execution after a long silent failure" as a routine deploy.

**Required steps (non-negotiable):**

1. **Identify the latency.** If a bulk operation has been silently failing or unscheduled for >24h, the next successful run is a workload-resumption event. Treat it as one.
2. **Audit accumulated workload before merge.** Query the table(s) the operation touches and estimate the row count, byte volume, and downstream effects (WAL bytes, replication lag, rate-limit consumption, connection-pool occupancy). Document the estimate in the PR body.
3. **Pick a deploy strategy explicitly:**
   - (a) **Pre-drain:** ship a one-shot script that processes the backlog under operator supervision, then deploy the fix. The fix's first run sees a clean state.
   - (b) **Self-throttle:** ship a fix that bounds per-tick resource usage (LIMIT-paginated DELETE, batch-size cap, time-budgeted loop with early exit). The fix processes the backlog over many ticks.
4. **Reject the third option.** "Just deploy the fix and let it run" is the failure mode this protocol exists to prevent. If the deploy strategy is "ship and pray," stop and pick (a) or (b).

**At session end, report:**
- The accumulated-workload estimate and the chosen deploy strategy.
- The first-successful-run outcome (rows processed, duration, peak resource usage).

**Do NOT mark a bulk-operation fix as deployed if the accumulated-workload audit was skipped.** Report what's missing.

**This rule does NOT override:**
- The Capability Onboarding Protocol (DEC-20260320-B).
- The Distribution PR Integrity Protocol (DEC-20260422-A).
- The Audit-Follow-up Test Coverage Protocol (DEC-20260504-A).
<!-- END VERBATIM FROM CLAUDE.md -->
