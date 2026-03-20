Intent: Add freshness decay to SQS scoring — stale capabilities get score penalties, execution guidance downgrades, and "stale" trend override.

## What shipped

### New file: `apps/api/src/lib/freshness-decay.ts`
- `computeFreshnessDecay(lastTestedAt, scheduleTierHours)` → `FreshnessResult`
- `applyFreshnessDecay(rawMatrixSqs, freshness)` → decayed score
- `shouldOverrideTrend(freshness)` → boolean
- Staleness levels: fresh (0-2×), aging (2-4×), stale (4-8×), expired (8-12×), unverified (>12× or >30d)
- Decay: 1 point per interval past the 4th. Expired floor=50. Unverified forces to 0.

### Modified: `apps/api/src/lib/test-runner.ts` — persistDualProfileScores
- Now looks up effective schedule tier (was hardcoded B-tier)
- Computes freshness decay and applies to `matrix_sqs` before persisting
- Overrides trend to "stale" when freshness warrants it
- Overrides execution guidance: expired/unverified → usable=false, strategy=unavailable; stale → confidence halved, direct→retry_with_backoff

### Modified: `apps/api/src/routes/internal-trust.ts` — all trust endpoints
- **Single capability** (`GET /capabilities/:slug`): SQS response now includes `raw_score`, `freshness.level`, `freshness.last_tested_at`, `freshness.decay_applied`. Trend can be "stale". Execution guidance is freshness-aware. `freshness` field renamed to `data_freshness` (dataset freshness vs test freshness).
- **Capabilities batch** (`GET /capabilities/batch`): Adds `raw_sqs` and `freshness_level` fields. Batch-fetches last test times and schedule tiers for all slugs.
- **Solutions batch** (`GET /solutions/batch`): Per-step SQS now includes freshness decay. Solution trend can be "stale" (any stale step → stale solution).
- **Single solution** (`GET /solutions/:slug`): Per-step data includes freshness decay. Solution trend handles "stale".

## API response changes (FRONTEND ACTION REQUIRED)

### `GET /v1/internal/trust/capabilities/:slug` — SQS object
```diff
 sqs: {
-  score: number,
-  label: string,
-  trend: "improving" | "stable" | "declining",
+  score: number,           // matrix_sqs AFTER freshness decay
+  raw_score: number,       // matrix_sqs BEFORE freshness decay
+  label: string,
+  trend: "improving" | "stable" | "declining" | "stale",
+  freshness: {
+    level: "fresh" | "aging" | "stale" | "expired" | "unverified",
+    last_tested_at: string | null,
+    decay_applied: number,
+  },
 }
```

Also: `freshness` field renamed to `data_freshness` (was dataset freshness, not test freshness).

### `GET /v1/internal/trust/capabilities/batch` — per-capability object
```diff
 {
-  sqs: number,
+  sqs: number,          // decayed
+  raw_sqs: number,      // pre-decay
   sqs_label: string,
-  trend: string,
+  trend: string,        // can be "stale"
+  freshness_level: string,
   ...
 }
```

### Trend values
- Frontend currently handles: "improving", "stable", "declining"
- NEW: "stale" — render as clock/warning icon instead of arrow
- A capability showing "stale" has not been tested within its expected schedule window

### Execution guidance changes
- Stale capabilities: confidence halved, strategy downgraded to retry_with_backoff
- Expired/unverified capabilities: usable=false, strategy=unavailable, confidence=0
- Context string explains: "Capability has not been tested in X days. Quality cannot be verified."

## Scoring Integrity
- Core scoring functions (computeFromRows, UPSTREAM_PATTERNS, isUpstreamFailure) were NOT modified
- QP and RP scores are stored as-computed from test data — only matrix_sqs gets the penalty
- When a test runs again, the decay immediately disappears (freshness returns to "fresh")
