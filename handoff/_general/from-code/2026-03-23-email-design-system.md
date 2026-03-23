Intent: Create shared email design system foundation for platform health emails

## What was built

### 1. `apps/api/src/lib/email-templates.ts` — Design System

15 component functions, all returning inline-CSS HTML strings:

| # | Function | Purpose |
|---|----------|---------|
| 1 | `emailWrapper(headerColor, iconText, topLabel, title, bodyHtml)` | Outer shell — 620px, colored header, footer with timestamp |
| 2 | `metricCard(label, value, subtitle?)` | Single stat box on secondary background |
| 3 | `metricGrid(cards[])` | Table-based grid of metric cards |
| 4 | `statusBadge(status, text?)` | Pill badge — 8 variants (healthy/down/warning/auto/retry/recovered/upstream/internal) |
| 5 | `sqsGradeBadge(grade, score)` | SQS grade pill (A=green through F=red) |
| 6 | `checkItem(text)` | Green checkmark + text row |
| 7 | `timelineItem(opts)` | Vertical timeline step with dot color states |
| 8 | `numberedStep(n, title, detail)` | Investigation step with circled number |
| 9 | `sectionHeader(text)` | Uppercase label with letter-spacing |
| 10 | `sourceAttribution(text)` | Italic footnote for data provenance |
| 11 | `codeBlock(text)` | Monospace block on secondary background |
| 12 | `probeDataTable(rows[])` | Two-column key-value table for probe data |
| 13 | `capabilityTable(rows[])` | Capability table with slug, SQS badge, freshness, last-tested |
| 14 | `eventLogTable(rows[])` | Timeline/event log with optional badge |
| 15 | `infrastructureTable(deps[])` | Dependency health with status badge + latency |

Design tokens exported as `COLORS` constant.

### 2. `apps/api/src/lib/digest-compiler.ts` — Data Enrichment (appended)

5 new query functions:

| Function | Returns | Used by |
|----------|---------|---------|
| `getAffectedCapabilityDetails(slugs[])` | `{slug, sqs_score, sqs_grade, freshness, last_tested}[]` | `capabilityTable()` |
| `getDependencyOutageHistory(name, days)` | `{time, event, badge?}[]` | `eventLogTable()` |
| `getCircuitBreakerState(slug)` | `{state, consecutiveFailures, nextRetryAt, backoffMinutes, ...}` | Interrupt emails |
| `checkEnvVarExists(varName)` | `boolean` | Distinguish "key missing" vs "service down" |
| `getTestActivitySummary(days)` | `{totalRuns, passCount, failCount, passRate}` | Weekly digest |

## How prompts 02-04 depend on this

- **Prompt 02 (Interrupt emails):** Import `emailWrapper`, `statusBadge`, `capabilityTable`, `numberedStep`, `probeDataTable`, `infrastructureTable`, `codeBlock` + enrichment functions `getAffectedCapabilityDetails`, `getCircuitBreakerState`, `checkEnvVarExists`
- **Prompt 03 (Weekly digest):** Import all table/grid components + `getTestActivitySummary`, `getDependencyOutageHistory`
- **Prompt 04 (Test/preview tooling):** Import `emailWrapper` with mock data to render preview HTML

## Verification

- TypeScript: `npx tsc --noEmit` — zero errors
- Template rendering: `emailWrapper()` → 10,063 chars valid HTML with DOCTYPE, 12 table layouts, Outlook conditionals, inline styles, footer
- `checkEnvVarExists()` — returns boolean correctly
- All email HTML rules followed: table layout, inline CSS, no <style> blocks, max 620px, Outlook conditionals
