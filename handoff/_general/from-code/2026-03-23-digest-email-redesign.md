Intent: Rewrite weekly digest email template using the email design system with trust-safe content

## What was done

### Rewrote `apps/api/src/lib/digest-formatter.ts`

Complete rewrite using the shared email design system from `email-templates.ts`. No changes to the `DigestData` interface or `compileWeeklyDigest()` — the formatter adapts to the existing data structure.

### Email structure (8 sections, top to bottom)

| # | Section | Source Attribution |
|---|---------|-------------------|
| 1 | Action items (amber border, APPROVE/REJECT) | health_monitor_events (proposal_created) |
| 2 | Capability status (4-up metric grid) | capabilities table (lifecycle_state) |
| 3 | SQS distribution (colored stacked bar) | capabilities table (matrix_sqs) |
| 4 | Test activity (3-up metric grid) | test_results table, last 7 days |
| 5 | Automated actions (event log table) | health_monitor_events, last 7 days |
| 6 | Infrastructure status (dependency table) | runDependencyHealthChecks(), point-in-time |
| 7 | Qualification progress (if any) | capabilities in probation/validating |
| 8 | Demand signals (if any) | failed_requests table, last 7 days |

### Subject line logic

- With action items: `Strale Weekly Report — 2 items need attention`
- Without: `Strale Weekly Report — Week of 17 Mar – 23 Mar`

### Trust-safe compliance

Every section has a source attribution in italic text. No week-over-week claims (would require daily snapshots). No trend claims. Infrastructure labeled as "point-in-time snapshot." Pass rate formula documented.

### Design system change

Added `"info"` to the `BadgeKind` type in `email-templates.ts` (was missing, needed for lifecycle transition badges).

### Test results

- 16,604 chars HTML output
- 8 source attributions across sections
- SQS stacked bar with colored segments
- Infrastructure table with healthy/down badges
- Action items with APPROVE/REJECT instructions
- Subject line reflects action count

## Files changed

- `apps/api/src/lib/digest-formatter.ts` — full rewrite
- `apps/api/src/lib/email-templates.ts` — added `"info"` badge kind

## Verification

- TypeScript: `npx tsc --noEmit` — zero errors
- Render test: all 8 sections present, all source attributions included
- Backward compatible: same `formatDigestEmail(data: DigestData)` signature, same callers work
