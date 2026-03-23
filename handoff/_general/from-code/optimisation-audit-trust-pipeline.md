# Optimisation Audit: Trust/Quality Pipeline

**Date:** 2026-03-23
**Scope:** Query efficiency, caching, code duplication, robustness, complexity
**Constraint:** Read-only. Scoring Integrity Protocol applies. DB-column reads (DEC-20260323-A) are the canonical architecture.

---

## Findings

| # | Category | File:Line | Severity | Description | Suggested Fix | Effort |
|---|----------|-----------|----------|-------------|---------------|--------|
| 1 | PERF | solutions.ts:72-89 | HIGH | **N+1 per-solution step fetch.** GET /v1/solutions iterates all solutions and queries solutionSteps+capabilities per solution. For 81 solutions, this is 81 DB queries at page load. | Fetch all solutionSteps in one query with `inArray(solutionSteps.solutionId, allSolIds)` JOIN capabilities, group in-memory. | Medium |
| 2 | PERF | suggest.ts:191-204 | HIGH | **N+1 per-solution step fetch in catalog refresh.** loadCatalog() queries steps per solution during 10-min catalog rebuild. ~20 queries per refresh cycle. | Same batch approach as #1. One query for all solution steps, group by solutionId in-memory. | Medium |
| 3 | PERF | internal-quality.ts:135-146 | HIGH | **N+1 quality metrics per step.** GET /internal/quality/solutions/:slug calls `getCapabilityQuality()` per step in a loop. 10-step solution = 10 heavy aggregation queries. | Add `getCapabilityQualityBatch(slugs[])` to quality-aggregation.ts. One query, aggregate per-slug. | Medium |
| 4 | PERF | refresh-stale-scores.ts:54-64 | MEDIUM | **N+1 test suite lookup per stale capability.** The refresh job queries testSuites per capability in a loop. | Batch-fetch all testSuites for stale slugs in one `inArray` query, build tierMap. | Small |
| 5 | PERF | capabilities.ts:172-189 | LOW | **N+1 step count per parent solution.** GET /capabilities/:slug queries step count per solution the capability belongs to. Usually 1-5 solutions. | Use a single `GROUP BY solution_id` query with step counts. | Trivial |
| 6 | PERF | solutions.ts:166 | LOW | **select() without column list.** GET /solutions/:slug fetches all columns from solutions table when only ~10 are needed. | Specify columns explicitly in select(). | Trivial |
| 7 | DRY | 6 files | MEDIUM | **sqsLabel() defined 9 times.** Identical score-to-label mapping in capabilities.ts:59, solutions.ts:107, suggest.ts:357, internal-trust.ts:535, internal-quality.ts:55+155, transactions.ts:94. | Extract to `lib/trust-labels.ts` as single `sqsLabel(score: number): string`. | Small |
| 8 | DRY | 6 files | MEDIUM | **gradeFromScore() defined 6 times** with **inconsistent input types** (some accept `number|null`, others `string|null` with internal parseFloat). capabilities.ts:50, solutions.ts:98, internal-quality.ts:46+123, internal-trust.ts:327, transactions.ts:85. | Extract to `lib/trust-labels.ts` as `gradeFromScore(score: string|null): string` (always parseFloat internally). | Small |
| 9 | DRY | 5 files | MEDIUM | **Solution SQS aggregation (avg capped at min+20) in 5 places.** solutions.ts:95, internal-quality.ts:152, internal-trust.ts:749+890, suggest.ts:414. **One location (internal-quality.ts:152) is missing the `Math.round(...*10)/10` rounding.** | Extract to `lib/trust-labels.ts` as `computeSolutionScore(stepScores: number[]): number`. Fix rounding inconsistency. | Small |
| 10 | DRY | solutions.ts:13-41 | LOW | **Solution trend/freshness helpers** (computeSolutionTrend, worstFreshnessLevel, oldestTestedAt) are defined in solutions.ts but also needed by internal-trust.ts solutions endpoints. Currently internal-trust.ts has its own inline implementation. | Move to `lib/trust-labels.ts` and import from both routes. | Small |
| 11 | ROBUST | sqs.ts, suggest.ts, quality-aggregation.ts | MEDIUM | **8 `as any` casts** on Drizzle `db.execute(sql\`\`)` results. Pattern: `Array.isArray(rows) ? rows : (rows as any)?.rows ?? []`. Type safety lost at each site. | Wrap in typed helper: `function sqlRows<T>(result: unknown): T[]` that handles both Drizzle response shapes. | Small |
| 12 | ROBUST | do.ts:460 | LOW | **Silent error swallowing.** `computeDualProfileSQS(slug).catch(() => null)` loses error context — no log, no metric. | Add `.catch((err) => { console.warn("[do] dual-profile failed:", slug, err.message); return null; })`. | Trivial |
| 13 | ROBUST | internal-quality.ts:152 | LOW | **Rounding inconsistency.** Solution SQS `Math.min(avgSqs, minSqs + 20)` here does NOT round to 1 decimal, unlike all 4 other implementations. | Add `Math.round(... * 10) / 10`. | Trivial |
| 14 | CLEAN | internal-trust.ts:28 | LOW | **`computeDualProfileSQS` imported but only used by capability detail endpoint (line 504) and one type alias (line 182).** The batch and solutions endpoints no longer call it. Import is still needed but the type alias on line 182 (`type DualProfile = Awaited<ReturnType<typeof computeDualProfileSQS>>`) could use the exported `DualProfileSQSResult` type directly. | Replace type alias with direct import of `DualProfileSQSResult`. | Trivial |
| 15 | CLEAN | internal-trust.ts:38-75 | LOW | **SWR cache on batch endpoints serves DB column reads.** These endpoints now do cheap `db.select()` queries. The SWR overhead (cache key construction, Map lookups, background revalidation logic) may cost more than the query itself for small batches. | **Tradeoff:** Keep SWR for large batches (50-100 slugs) where parallel DB reads add up. Consider removing for single-capability detail endpoint (line 453) where one indexed SELECT is <5ms. | —  |
| 16 | CLEAN | quality.ts:61 | LOW | **computeDualProfileSQS still called on read path** for QP/RP factor detail. This is the only read-path endpoint that still live-computes (for factor breakdown, not headline score). Documented as expected. | No action needed now. Future: cache QP/RP factor arrays in JSONB columns if this endpoint gets high traffic. | — |

---

## Summary Statistics

| Category | Count | Trivial | Small | Medium |
|----------|-------|---------|-------|--------|
| PERF | 6 | 2 | 0 | 4 |
| DRY | 4 | 0 | 4 | 0 |
| ROBUST | 3 | 2 | 1 | 0 |
| CLEAN | 3 | 1 | 0 | 0 |
| **Total** | **16** | **5** | **5** | **4** |

---

## Recommended Priority Order

### Phase 1: Quick wins (trivial, high confidence)
1. **#13** Fix rounding inconsistency in internal-quality.ts:152 (1 line)
2. **#12** Add error logging to do.ts:460 (1 line)
3. **#5** Batch step count query in capabilities.ts:172 (small refactor)
4. **#6** Explicit column list in solutions.ts:166 (find-replace)

### Phase 2: Extract shared helpers (small, reduces maintenance burden)
5. **#7 + #8 + #9** Create `lib/trust-labels.ts` with sqsLabel, gradeFromScore, computeSolutionScore. Replace 20+ inline definitions across 6 files.
6. **#10** Move solution aggregation helpers to trust-labels.ts.
7. **#11** Create typed `sqlRows<T>()` helper for Drizzle execute results.

### Phase 3: Query optimisation (medium, measurable perf impact)
8. **#1** Batch solution step fetch in GET /v1/solutions. Biggest user-facing improvement.
9. **#2** Batch solution step fetch in suggest.ts catalog refresh.
10. **#3** Batch quality metrics in internal-quality solutions endpoint.
11. **#4** Batch test suite lookup in refresh job.

### Deferred
12. **#15** Re-evaluate SWR on trust batch endpoints after Phase 3 queries are optimised.
13. **#16** Consider JSONB factor caching if quality.ts traffic grows.
14. **#14** Type alias cleanup (cosmetic).

---

## Caching Assessment Summary

| Cache | Location | TTL | Still Useful? | Recommendation |
|-------|----------|-----|---------------|----------------|
| sqsCache (legacy) | sqs.ts:146 | 10 min | Yes (write-path) | Keep. Prevents re-computation during batch test runs. |
| dualCache (current) | sqs.ts:663 | 10 min | Yes (write-path + quality.ts factor detail) | Keep. Same justification. |
| Quality aggregation | quality-aggregation.ts:31 | 5 min | Yes (RP computation, quality endpoints) | Keep. Heavy per-capability queries. |
| Suggest catalog | suggest.ts:157 | 10 min | Yes (30+ queries per rebuild, embeddings) | Keep. Essential for suggest performance. |
| Suggest query | suggest.ts:130 | 10 min | Yes (avoids Claude re-ranking per query) | Keep. Saves ~1s+ per repeated query. |
| SWR trust batch | internal-trust.ts:38 | 2m/30m | **Marginal** (DB reads are now cheap) | Keep for now. Re-evaluate after #1 batch optimisation. |
| HTTP Cache-Control | Various | 30s-5m | Yes | Appropriate for data that updates on test runs. |
