Intent: Rewrite interrupt email templates to use the email design system with trust-safe content

## What was done

Rewrote all 5 interrupt email templates in `apps/api/src/lib/interrupt-sender.ts` to use the shared design system from `email-templates.ts`.

### Changes to `interrupt-sender.ts`

**Interface changes (backward-compatible):**
- Added optional fields to `InterruptPayload`: `dependency`, `affectedSlugs`, `probeError`, `probeLatencyMs`, `failureCount`, `totalInBatch`
- Existing callers (lifecycle.ts) work without changes — new fields are optional

**`buildInterruptEmail()` is now async** — queries enrichment data at send time:
- `getAffectedCapabilityDetails()` — real SQS scores for affected capabilities
- `getCircuitBreakerState()` — actual CB state from `capability_health` table
- `getDependencyOutageHistory()` — real events from `health_monitor_events`
- `checkEnvVarExists()` — distinguishes "key missing" from "service down"

**Template rewrites:**

| Template | Design changes |
|----------|---------------|
| `infrastructure_down` | Red header, metric grid, automated response box (blue border with checkmarks + timeline), suggested investigation with disclaimer, probe data table, affected capabilities table with SQS badges, outage history |
| `mass_failure` | Red header, failure breakdown by classification, automated response box, explicit note that mass failures DO count in SQS (unlike upstream exclusions), investigation steps |
| `suspension_warning` | Amber header, SQS metric, "what suspended means" box, KEEP reply instruction, current state table |
| `validation_failure` | Amber header, pass/fail metrics, failing checks list, fix command |
| `billing_alert` | Red header, probe data table, investigation steps |

**Trust-safe language applied:**
- No fabricated timelines ("scores recover in 24-48h" → "depends on test tier schedule")
- No claimed root causes ("memory exhaustion" → "system cannot access infrastructure logs")
- No unverifiable claims ("customer calls still work" → omitted)
- Disclaimer on investigation steps: "The system cannot access Railway logs or container metrics"
- Freshness described by level names, not point values

### Helper functions added

- `getAffectedSlugsForDependency(dep)` — reverse lookup from the upstream-health-gate mapping
- `automatedResponseBox(bodyHtml)` — blue-bordered info box for automated actions
- `formatCET(date)` — consistent CET timestamp formatting

### Call sites

- `lifecycle.ts:248` — suspension_warning (unchanged, backward compatible)
- `situation-assessment.ts` → `intelligent-alerts.ts` — mass_failure/infrastructure_down (these modules can pass the richer payload when ready)

## Verification

- TypeScript: `npx tsc --noEmit` — zero errors
- All 5 templates use the shared design system (emailWrapper, metricGrid, statusBadge, etc.)
- Existing lifecycle.ts caller works without changes
- Enrichment queries fetch real data at send time, not hardcoded values
