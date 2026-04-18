# Audit: Solution-Level Quality & Reliability Grade Computation Paths

**Date:** 2026-03-24
**Auditor:** Claude Code (automated)
**Scope:** Read-only. No code changes made.

---

## A. Where Are Solution-Level QP/RP Grades Computed?

### Location 1: `GET /v1/solutions` (Solutions List)
**File:** `apps/api/src/routes/solutions.ts` lines 71-86

```typescript
const gradeOrder = ["A", "B", "C", "D", "F", "pending"];

const worstQuality = steps.reduce((w, s) => {
  const g = gradeFromScore(s.qpScore);
  return gradeOrder.indexOf(g) > gradeOrder.indexOf(w) ? g : w;
}, "A");
const worstReliability = steps.reduce((w, s) => {
  const g = gradeFromScore(s.rpScore);
  return gradeOrder.indexOf(g) > gradeOrder.indexOf(w) ? g : w;
}, "A");
```

**Strategy:** Converts each step's numeric qpScore/rpScore to a letter via `gradeFromScore()`, then takes the **worst grade** (highest index in gradeOrder). Reads from DB columns.

**Returns:** `quality: worstQuality, reliability: worstReliability` (line 109-110)

### Location 2: `GET /v1/internal/trust/solutions/batch`
**File:** `apps/api/src/routes/internal-trust.ts` lines 674-709

Identical weakest-link logic. Reads from DB columns. Returns:
```typescript
quality_profile: { grade: worstQuality, score: solutionQpScore, label: "Code quality: B (weakest step)" }
reliability_profile: { grade: worstReliability, score: solutionRpScore, label: "Reliable (weakest step)" }
```

### Location 3: `GET /v1/internal/trust/solutions/:slug`
**File:** `apps/api/src/routes/internal-trust.ts` lines 811-818

Identical weakest-link logic. Redefines `gradeOrder` locally (redundant but consistent). Returns the same structure as the batch endpoint.

### Location 4: Numeric score aggregation
**File:** `apps/api/src/routes/internal-trust.ts` lines 711-712 (batch) and 821-822 (detail)

```typescript
const solutionQpScore = Math.round(Math.min(...stepData.map(s => s.qp_score)) * 10) / 10;
const solutionRpScore = Math.round(Math.min(...stepData.map(s => s.rp_score)) * 10) / 10;
```

These numeric scores are ALSO weakest-link (Math.min), separate from the letter grade reduction.

### NOT present:
- `GET /v1/internal/quality/solutions/:slug` (`internal-quality.ts`) — returns per-step grades only, no solution-level grades
- `suggest.ts` — no solution-level grades in the suggest catalog

---

## B. Which API Endpoints Return Solution-Level Grades?

| Endpoint | Response Fields | Serves |
|----------|----------------|--------|
| `GET /v1/solutions` | `quality` (string), `reliability` (string) | Solutions list page |
| `GET /v1/internal/trust/solutions/batch` | `quality_profile.grade`, `reliability_profile.grade` | Solutions list page (trust overlay) |
| `GET /v1/internal/trust/solutions/:slug` | `quality_profile.grade`, `reliability_profile.grade` | Solution detail page |

---

## C. Which Frontend Components Display Solution-Level Grades?

### 1. SolutionCard.tsx (List View)
**File:** `strale-frontend/src/components/solutions/SolutionCard.tsx` lines 90-115
- Reads `trust.quality` and `trust.reliability` from `BatchTrustEntry`
- Layout: `SQS Score · Quality: A · Reliability: B · Trend`
- Colors via `getGradeColor()`

### 2. SolutionDetailHeader.tsx (Detail Page Header)
**File:** `strale-frontend/src/components/solutions/SolutionDetailHeader.tsx` lines 24-25, 87, 99
- Reads `trust_summary.quality_profile.grade` and `trust_summary.reliability_profile.grade`
- Layout: Under SQS score, inline with trend

### 3. ZoneBReliability.tsx (Detail Page Body)
**File:** `strale-frontend/src/components/solutions/ZoneBReliability.tsx` lines 555-556, 638, 650
- Reads `quality_profile.grade` and `reliability_profile.grade`
- Also shows per-step grades at lines 485, 492

### 4. StepQualityTable.tsx (Per-Step Table)
**File:** `strale-frontend/src/components/solutions/StepQualityTable.tsx` lines 50-51, 100, 108
- Per-step only: `step.quality_grade` and `step.reliability_grade`
- These would NOT need to change (per-step grades remain individual)

### Color function:
**File:** `strale-frontend/src/components/solutions/sqs-display.ts` lines 81-90
```typescript
export function getGradeColor(grade: string): string {
  switch (grade) {
    case "A": return "text-success";
    case "B": return "text-teal";
    case "C": return "text-warning";
    case "D":
    case "E": return "text-destructive";
    default: return "text-muted-foreground";
  }
}
```

---

## D. How Are Step-Level QP/RP Scores Available?

Per step, the following data is available from DB columns on the `capabilities` table:
- `qpScore` (numeric, decimal 5,2) — Quality Profile score
- `rpScore` (numeric, decimal 5,2) — Reliability Profile score
- `matrixSqs` (numeric, decimal 5,2) — Combined SQS score

The trust detail endpoint returns per-step objects including:
```typescript
{
  capability_slug: string,
  sqs: { score, label },
  quality: string,      // letter grade (from gradeFromScore)
  reliability: string,  // letter grade (from gradeFromScore)
  qp_score: number,     // raw numeric
  rp_score: number,     // raw numeric
}
```

---

## E. The `gradeFromScore()` Function

**File:** `apps/api/src/lib/trust-labels.ts` lines 24-33

```typescript
export function gradeFromScore(score: number | string | null): string {
  if (score == null) return "pending";
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (isNaN(n)) return "pending";
  if (n >= 90) return "A";
  if (n >= 75) return "B";
  if (n >= 50) return "C";
  if (n >= 25) return "D";
  return "F";
}
```

Used identically for both capability-level and solution-level grades. The thresholds match the SQS label thresholds (Excellent/Good/Fair/Poor) though the letters differ (A/B/C/D/F vs Excellent/Good/Fair/Poor/Degraded).

---

## F. Other Consumers of Solution-Level Grades

### MCP Server
**File:** `packages/mcp-server/src/tools.ts` lines 429-430

```typescript
quality: data.quality_profile?.grade ?? "pending",
reliability: data.reliability_profile?.grade ?? "pending",
```

The `strale_trust_profile` tool with `type: "solution"` fetches from `GET /v1/internal/trust/solutions/:slug` and returns the solution-level grades. **This would automatically reflect any backend change** since it reads from the trust endpoint.

### NOT present in:
- Suggest catalog (`suggest.ts`) — no solution-level grades
- Typeahead (`suggest.ts`) — no solution-level grades
- A2A agent card — no solution-level grades
- No caching layers store pre-computed solution-level grades

---

## Change Plan

### Files to Modify

| # | File | Change | Risk |
|---|------|--------|------|
| 1 | `apps/api/src/lib/trust-labels.ts` | Add `computeSolutionGrade(stepScores: number[]): string` — average the step QP/RP numeric scores, then apply `gradeFromScore()` to the average | Low — new function, no existing code changes |
| 2 | `apps/api/src/routes/solutions.ts` lines 71-86 | Replace `worstQuality`/`worstReliability` reduce with `computeSolutionGrade(steps.map(s => parseFloat(s.qpScore)))` | Medium — changes API response for solution list |
| 3 | `apps/api/src/routes/internal-trust.ts` lines 674-709 | Replace weakest-link grade in batch endpoint with average-based grade | Medium — changes API response for batch trust |
| 4 | `apps/api/src/routes/internal-trust.ts` lines 811-818 | Replace weakest-link grade in detail endpoint with average-based grade | Medium — changes API response for detail trust |
| 5 | `apps/api/src/routes/internal-trust.ts` lines 711-712, 821-822 | Replace `Math.min(...scores)` with `avg(scores)` for numeric QP/RP | Medium — changes numeric score aggregation |
| 6 | `apps/api/src/routes/internal-trust.ts` lines 725-726, 871-879 | Update `label` from "weakest step" to "average across steps" | Low — cosmetic label change |

### Files That Do NOT Need Changes
- `internal-quality.ts` — no solution-level grades
- Frontend components — read grade from API response, will reflect backend changes automatically
- MCP server — reads from trust endpoint, will reflect backend changes automatically
- `sqs-display.ts` — grade color mapping doesn't change
- Per-step grade display — individual step grades remain unchanged
- `gradeFromScore()` — thresholds unchanged

### Risks and Edge Cases
1. **API response shape is unchanged** — same field names, same types. Only the values change. No breaking change for consumers.
2. **Grade could go UP** — a solution with steps [A, A, A, C] currently shows C (weakest). With averaging, the scores might average to B. This is the DESIRED behavior.
3. **Grade could theoretically go DOWN** — if most steps are C but one is A, the current weakest-link shows C. Averaging might still produce C. No downgrade risk in practice.
4. **Pending steps** — if a step has `qpScore = null`, what does the average do? Should it exclude pending steps or treat them as 0? Current weakest-link treats "pending" as the worst. Averaging should exclude pending steps.
5. **The label suffix** — changing from "(weakest step)" to "(average across steps)" or "(weighted average)" is a cosmetic but important signal to consumers that understand the methodology.

### Suggested Order
1. Add `computeSolutionGrade()` to `trust-labels.ts` (new function, zero risk)
2. Update `solutions.ts` (affects the public solutions list — highest visibility)
3. Update `internal-trust.ts` batch endpoint (affects solution cards via trust overlay)
4. Update `internal-trust.ts` detail endpoint (affects solution detail page)
5. Verify frontend displays correct grades without code changes
6. Update the `(weakest step)` label to `(average)` in all three endpoints
