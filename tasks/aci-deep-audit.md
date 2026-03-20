# ACI Deep Audit — Testing, Monitoring, Scoring & Data Infrastructure

**Date:** 2026-03-20
**Scope:** Complete codebase audit of apps/api/src/lib/ quality infrastructure
**Method:** Every file read at source level, every data flow traced

---

## Section 1: Complete Database Schema Map

**15 tables total.** Key tables for quality/testing:

### test_suites (10 indexes: capability_slug_idx)
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID PK | |
| capability_slug | text NOT NULL | Which capability |
| test_name | text NOT NULL | Human-readable name |
| test_type | text NOT NULL | known_answer, schema_check, edge_case, negative, dependency_health |
| input | jsonb NOT NULL | Test input data |
| expected_output | jsonb | Expected output (optional) |
| validation_rules | jsonb NOT NULL | Assertion checks |
| active | boolean DEFAULT true | |
| schedule_tier | text DEFAULT 'B' | A=6h, B=24h, C=72h |
| estimated_cost_cents | integer DEFAULT 0 | |
| baseline_output | jsonb | Captured on first success |
| baseline_captured_at | timestamp | |
| test_status | text DEFAULT 'normal' | normal, infra_limited, env_dependent, upstream_broken, quarantined |
| quarantine_reason | text | |
| last_classification | jsonb | Last failure classification |
| auto_remediation_log | jsonb | |
| test_mode | varchar(20) DEFAULT 'live' | live, fixture, canary |
| fixture_last_refreshed | timestamp | |
| external_cost_cents | integer DEFAULT 0 | |

**Current counts:** 1,348 active suites. Distribution by type:
- dependency_health: 259 (256 caps)
- edge_case: 256 (256 caps)
- known_answer: 292 (256 caps) — some caps have multiple
- negative: 259 (256 caps)
- piggyback: 5 (5 caps — free-tier only)
- schema_check: 277 (256 caps)

**Tier distribution:** A: 190, B: 794, C: 364

### test_results (4 indexes: capability_slug, executed_at, test_suite_id, composite slug+executed_at)
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID PK | |
| test_suite_id | UUID FK→test_suites (CASCADE) | |
| capability_slug | text NOT NULL | Denormalized for query performance |
| passed | boolean NOT NULL | |
| actual_output | jsonb | Full output captured |
| failure_reason | text | Error/failure message |
| response_time_ms | integer NOT NULL | |
| executed_at | timestamp NOT NULL DEFAULT now() | |
| output_hash | text | SHA-256 for staleness detection |
| failure_classification | text | 8 verdict types |
| auto_fixed | boolean DEFAULT false | |

**Current:** 64,821 rows. Oldest: 2026-03-03. ~2,000-5,000 rows/day.

### transaction_quality
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID PK | |
| transaction_id | UUID FK→transactions UNIQUE CASCADE | |
| response_time_ms | integer NOT NULL | Capped at 30,000ms |
| upstream_latency_ms | integer | |
| schema_conformant | boolean NOT NULL | |
| fields_returned | integer NOT NULL | |
| fields_expected | integer NOT NULL | |
| field_completeness_pct | decimal(5,2) NOT NULL | |
| error_type | text | upstream_timeout, upstream_error, schema_mismatch, internal_error, rate_limited |
| quality_flags | jsonb DEFAULT {} | |

**Current:** 53,417 rows. Last 7 days: 20,867 rows.

### capability_health (circuit breaker state)
| Column | Type | Purpose |
|--------|------|---------|
| capability_slug | varchar(255) NOT NULL UNIQUE | |
| state | varchar(20) DEFAULT 'closed' | closed, open, half_open |
| consecutive_failures | integer DEFAULT 0 | |
| total_failures / total_successes | integer | Lifetime counters |
| last_failure_at / last_success_at | timestamp | |
| opened_at / next_retry_at | timestamp | Circuit breaker timing |
| backoff_minutes | integer DEFAULT 5 | Exponential: 5→10→20→30 max |

### health_monitor_events (3 indexes: slug+created_at, type+created_at, tier+created_at)
| Column | Type | Purpose |
|--------|------|---------|
| event_type | varchar(50) NOT NULL | classification, upstream_escalation, regression_detected, meta_monitoring, lifecycle_transition, etc. |
| capability_slug | text | Nullable for platform-level events |
| tier | integer NOT NULL | 1=info, 2=warning, 3=critical |
| action_taken | text NOT NULL | Human-readable |
| details | jsonb DEFAULT {} | Structured data |
| human_override | boolean DEFAULT false | |

**Current:** 2,682 events. Top types: classification (1,225), upstream_escalation (1,020), regression_detected (278).

### capabilities table — quality-relevant columns
- `qp_score` decimal(5,2) — cached Quality Profile score (written by persistDualProfileScores)
- `rp_score` decimal(5,2) — cached Reliability Profile score
- `matrix_sqs` decimal(5,2) — cached combined SQS (the canonical score)
- `guidance_usable` boolean — cached execution guidance
- `guidance_strategy` text — direct, retry_with_backoff, queue_for_later, unavailable
- `guidance_confidence` decimal(5,1)
- `capability_type` text DEFAULT 'stable_api' — deterministic, stable_api, scraping, ai_assisted
- `transparency_tag` varchar(30) — algorithmic, ai_generated, mixed
- `lifecycle_state` varchar(20) DEFAULT 'draft'
- `output_field_reliability` jsonb — {field: guaranteed|common|rare}
- `search_tags` text[] DEFAULT []

**No SQS history table exists.** Score changes are overwritten in-place.

---

## Section 2: Test Execution Data Flow

### startScheduledTests() — 6 independent timers

| Timer | Interval | First Fire | Purpose |
|-------|----------|------------|---------|
| Adaptive Scheduler | 1 hour | 30s | Determines due capabilities, runs tests |
| Dependency Health | 6 hours | 60s | Probes 6 upstream services |
| Chromium Probe | 30 min | 45s | Browserless health check |
| Weekly Sweep | 7 days | 5 min | Auto-remediation + quarantine review |
| Daily Diagnostic | 24 hours | 10 min | Self-healing diagnostic |
| Weekly Digest | 7 days (Mon 8am CET) | Computed | Email digest |

### runSingleTest() — 3 code paths

**Path 1: schema_check (dry-run, FREE)**
- Validates input against inputSchema, output_schema structure
- Verifies executor exists
- Writes: test_results (passed/failed, failureReason, responseTimeMs)

**Path 2: regression (structure comparison)**
- Executes capability for real
- Compares output key structure via extractKeyStructure() against baseline
- Writes: test_results (with actualOutput, outputHash)

**Path 3: Regular execution (known_answer, negative, edge_case, dependency_health)**
- Executes capability
- Validates result per validation_rules (respecting field reliability)
- Classifies failures via classifyFailure()
- Writes: test_results, updates testSuites.lastClassification
- Fire-and-forget: recordTestQuality() → transactions + transaction_quality
- First success: captureBaseline(), captureExampleOutput()

### Post-batch processing (in runTests)
1. Insert test_run_log row
2. persistDualProfileScores() → updates capabilities.qp_score, rp_score, matrix_sqs, guidance_*
3. checkUpstreamEscalation() for failed slugs
4. evaluateLifecycle() for all affected slugs
5. Mass failure detection → interrupt email if >10% and >5 failures
6. Meta-monitoring: checkNewFailures(), checkInfrastructureHealth()

### Data written per test execution

| Table | Rows | When |
|-------|------|------|
| test_results | 1 | Every test |
| test_suites | Update | On failure (lastClassification) or first success (baseline) |
| transactions | 1 | recordTestQuality (fire-and-forget) |
| transaction_quality | 1 | recordTestQuality (fire-and-forget) |
| capabilities | Update | persistDualProfileScores (batch, post-run) |
| capability_health | Update | Circuit breaker (from do.ts, not test runner) |
| health_monitor_events | 0-N | On failures, state transitions |
| test_run_log | 1 | End of batch |

---

## Section 3: Quality Capture Pipeline

### quality-capture.ts → transaction_quality
- Called from routes/do.ts (6 call sites — after success, on error, async results)
- Fire-and-forget (async, errors swallowed)
- Records: responseTimeMs (capped 30s), schemaConformant, fieldsReturned/Expected, fieldCompletenessPct, errorType, qualityFlags
- One INSERT per customer transaction

### quality-aggregation.ts → in-memory cache (5-min TTL)
- Complex CTE query: recency-weighted (7d=3x, 30d=1x)
- Aggregates: success_rate, schema_conformance_rate, avg_field_completeness_pct
- Latency: last 50 transactions (naturally ages), requires ≥5 samples for p95
- Solution aggregation: parallel-aware latency (respects parallelGroup)
- **Read-only** — no DB writes

### piggyback-monitor.ts → test_results
- Called from routes/do.ts after successful executions
- Creates piggyback test_suite per capability (lazy, cached in-memory)
- Validates output against schema
- Inserts test_results row with test_type="piggyback"
- **Current:** 5 piggyback suites (free-tier only), 240 results

### Overlap analysis
- **quality-capture** and **piggyback-monitor** both process the same customer execution
- quality-capture → transaction_quality (financial/operational metrics)
- piggyback → test_results (schema correctness signal for SQS)
- No duplication — different tables, different purposes

---

## Section 4: SQS Scoring Deep Dive

### Legacy SQS (computeCapabilitySQS)

**Constants:**
- MIN_RUNS = 5 (minimum distinct run windows for qualification)
- ROLLING_RUNS = 10 (maximum windows analyzed)
- Recency weights: [1.0, 0.95, 0.90, 0.85, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30]

**Factor weights:**
| Factor | Weight | Fed by test_types |
|--------|--------|-------------------|
| correctness | 0.40 | known_answer, piggyback, regression |
| schema | 0.25 | schema_check |
| availability | 0.20 | dependency_health |
| error_handling | 0.10 | negative |
| edge_cases | 0.05 | edge_case |

**When factor has zero data:** Factor gets `has_data: false`. If ALL factors lack data → "Building track record". If SOME factors lack data, active factors are re-weighted proportionally.

**External service exclusion (EXTERNAL_SERVICE_PATTERNS):**
```
HTTP 429, HTTP 503, HTTP 502, Too Many Requests, rate limit, QUOTA_EXCEEDED,
ECONNRESET, ECONNREFUSED, ETIMEDOUT, ENOTFOUND, timeout, upstream, Browserless,
VIES error, Navigation timeout, fetch failed
```
Missing API keys are intentionally NOT excluded (Strale infrastructure responsibility).

**Circuit breaker penalties:**
- 3 consecutive execution failures → score = max(score − 30, 20)
- 5 consecutive correctness failures → score = max(score − 20, 30)
- Latest schema_check failed → score = max(score − 15, 40)
- Recovery: 3 consecutive passes clear penalty

**Cache:** 10-minute TTL, key: `sqs:cap:{slug}` or `sqs:sol:{sorted_slugs}`

### Dual-Profile SQS (computeDualProfileSQS)

**Quality Profile (QP):** 4 factors (correctness 50%, schema 31%, error_handling 13%, edge_cases 6%). dependency_health excluded. Upstream failures excluded entirely.

**Reliability Profile (RP):** 4 factors with type-specific weights:

| Factor | Deterministic | Stable API | Scraping | AI-assisted |
|--------|:---:|:---:|:---:|:---:|
| current_availability | 10% | 30% | 35% | 25% |
| rolling_success | 30% | 30% | 30% | 30% |
| upstream_health | 10% | 25% | 25% | 25% |
| latency | 50% | 15% | 10% | 20% |

**Matrix SQS:** 5×5 lookup (QP grade × RP grade) with ±3 point interpolation.

**Trend:** Recent 5 vs older 5 runs. diff > 5pp → improving; diff < −5pp AND ≥3 failures → declining. (DEC-20260320-J calibration)

### Factor data coverage (current state)

| Factor | Test types | Caps with data (30d) | Coverage |
|--------|-----------|---------------------|----------|
| correctness | known_answer, piggyback, regression | 260 | 100%+ |
| schema | schema_check | ~256 | ~100% |
| availability | dependency_health | ~256 | ~100% |
| error_handling | negative | ~256 | ~100% |
| edge_cases | edge_case | ~256 | ~100% |

**All 5 factors have real data for essentially all active capabilities.** The preliminary concern about NEUTRAL_DEFAULT inflation was unfounded — there is no NEUTRAL_DEFAULT constant in the codebase. Factors without data trigger "Building track record" state, not a default score.

---

## Section 5: Circuit Breaker

**State machine:** closed → open (3 consecutive failures) → half_open (backoff expired) → closed (1 success) or open (exponential backoff: 5→10→20→30 min cap)

**Does NOT distinguish upstream from internal failures** — any failure increments counter. This means a series of upstream timeouts will trip the breaker and suspend a healthy capability.

**Used by do.ts** (execution path), NOT by the test runner. Tests bypass the circuit breaker.

**History:** Changes logged to health_monitor_events. No dedicated history table.

---

## Section 6: Dependency Health

**6 upstream probes:** Browserless, VIES, OpenSanctions, GLEIF, BRREG, Anthropic

**Nothing persisted to DB.** Results are in-memory only. No health history, no time-series data.

**Used by:** test runner (Chromium health check skips Browserless-dependent tests). Not used by SQS or trust API.

---

## Section 7: Scheduler Reliability

**Schedule maintained by:** Native Node.js `setInterval` (6 independent timers). No cron library, no pg-based queue.

**On restart:** No catch-up logic. Missed test windows are simply skipped. Timers restart from initial offset (30s, 60s, 45s, etc.).

**HEALTH_STATE_FREQUENCY_HOURS:** Exported from health-state.ts, imported in test-runner.ts (line 12). Used in `computeAdaptiveInterval()` (line 1166). **Not dead code.**

```
new: 6h, unstable: 6h, recovering: 12h, stable: 24h, established: 48h
```

**Actual test volume:** 2,000-9,000 results/day (varies with manual runs). At steady state, ~2,500/day.

---

## Section 8: Onboarding Pipeline

**onCapabilityCreated()** auto-generates only 2 test types: schema_check + negative. The full 5-type pipeline requires the manifest-driven `onboard.ts` script.

**Test input heuristics:** Prefers manifest health_check_input > known_answer input > heuristic generation.

**Missing from auto-generation:** known_answer, edge_case, dependency_health tests. These require human-provided fixtures.

---

## Section 9: Capability Executor Patterns

### By type (256 active)
| Type | Count | Characteristics |
|------|-------|----------------|
| deterministic + algorithmic | 58 | Pure logic, no network, always deterministic |
| stable_api + algorithmic | 77 | External JSON APIs, deterministic output |
| ai_assisted + ai_generated | 61 | Claude Haiku inference, non-deterministic |
| scraping + ai_generated | 40 | Browserless + Claude, most flaky |
| Other combinations | 20 | Mixed patterns |

### Key patterns observed across 15 sampled executors
1. **All external calls use AbortSignal.timeout(10000-30000)**
2. **Zero retry logic anywhere** — all failures propagate immediately
3. **LLM output parsed via regex** (`/\{[\s\S]*\}/`) — fragile, no schema validation
4. **Browserless capabilities** are hardcoded in chromium-health.ts (45 items, manually maintained)
5. **No exponential backoff, circuit breaker, or fallback** at executor level

---

## Section 10: Trust API Surface

### Endpoints (all public, no auth except /tests/run and /recalibrate)

| Endpoint | Cache | N+1? |
|----------|-------|------|
| GET /trust/capabilities/batch?slugs= | 2 min | No (parallel) |
| GET /trust/capabilities/:slug | 2 min | Minor (guidance compute) |
| GET /trust/solutions/batch?slugs= | 2 min | No (deduped caps) |
| GET /trust/solutions/:slug | 2 min | Yes — 4N queries (N=steps) |
| GET /tests/capabilities/:slug | None | Yes — N queries (N=suites) |
| GET /tests/solutions/:slug/runs | 5 min | Yes — 2M queries (M=failed runs) |

### Missing for frontend dashboard
- Historical SQS/QP/RP trends (time-series)
- User-specific transaction history
- Recalibration status (long-running async)
- Slow query detection

---

## Section 11: Data Retention and Growth

### Current state
| Table | Rows | Growth/day | Oldest |
|-------|------|-----------|--------|
| test_results | 64,821 | ~3,000 | 2026-03-03 (17 days) |
| transaction_quality | 53,417 | ~3,000 | Unknown |
| health_monitor_events | 2,682 | ~150 | Unknown |
| test_run_log | ~100 | ~6 | Unknown |

### Projections at 1,000 capabilities (4,000 active suites)

| Scenario | Rows/month | Storage concern |
|----------|-----------|----------------|
| Tier B daily, 4 suites/cap | ~120,000 test_results | Moderate |
| + Tier A 6h, 1 suite/cap | +120,000 | Growing |
| + piggyback at 100 txn/day | +3,000,000 | **Significant** |
| + 1 known_answer/day/cap | +30,000 | Moderate |

### Retention policy
**None exists.** No cleanup jobs, no partition strategy, no archival. At current growth (~3K rows/day), the table reaches 1M rows in ~11 months. At 1,000 capabilities, that accelerates to ~3 months.

**Recommendation:** Add time-based retention (90 days for test_results, 180 days for transaction_quality) or partition by month.

---

## Section 12: Missing Data Signals

| Signal | Status | Impact |
|--------|--------|--------|
| **SQS score history** | NOT captured — overwritten in-place | Cannot show trends, cannot detect sudden drops |
| **Schema fingerprints** | Partial — output_hash in test_results | No dedicated evolution tracking |
| **Dependency health history** | NOT persisted | Lost on restart, no time-series |
| **Circuit breaker state history** | Partial — logged to health_monitor_events | Not queryable as time-series |
| **Known-answer correctness validation** | EXISTS — 292 known_answer suites | 100% coverage |
| **Output field reliability per field** | EXISTS — output_field_reliability jsonb | Used in test validation |
| **Upstream vs internal latency** | Partial — upstream_latency_ms in transaction_quality | Only populated when capability reports it |
| **Test cost tracking (actual)** | NOT captured — only estimated_cost_cents | Cannot audit real spend |
| **Failure classification at write time** | EXISTS — failure_classification on test_results | Written immediately |

---

## Section 13: SQS Scoring Critical Review

### Q1: NEUTRAL_DEFAULT behavior
**No NEUTRAL_DEFAULT constant exists.** When a factor has zero data, the factor gets `has_data: false` and the capability enters "Building track record" state (SQS=0, pending=true). Active factors are re-weighted proportionally when some (but not all) factors have data. This is honest — no artificial inflation.

### Q2: Rolling window depth
ROLLING_RUNS=10 means 10 distinct minute-granularity windows. At Tier B daily, this is ~10 days of data. A capability broken for 6 months but with 10 good runs WOULD show as excellent — the window only looks at the last 10 runs, not a time range. The MIN_RUNS=5 threshold is about data quantity, not recency.

**Gap:** No freshness penalty. A capability tested 30 days ago retains its last SQS indefinitely.

### Q3: Upstream exclusion — false positive/negative analysis

| Pattern | False positive example | True positive example |
|---------|----------------------|---------------------|
| `/timeout/i` | Infinite loop in executor causes timeout → hidden as upstream | External API genuinely times out |
| `/fetch failed/i` | Malformed URL in executor code → hidden | DNS resolution failure for external API |
| `/Browserless/i` | Bug in Browserless integration code → hidden | Browserless.io service outage |
| `/upstream/i` | Error message "upstream validation failed" in executor code → hidden | Genuine upstream dependency failure |

**Missing patterns:** None obvious. The current list is comprehensive for network-level failures.

### Q4: Factor data coverage
**All 5 factors have data for 256/256 active capabilities.** This is because the onboarding pipeline generates all 5 test types. The preliminary concern about sparse data was unfounded.

### Q5: Score comparability
The legacy SQS does NOT differentiate by capability type. The dual-profile RP DOES — latency thresholds and factor weights vary by type (deterministic gets 50% latency weight with tight 100ms threshold; scraping gets 10% latency weight with loose 5000ms threshold). This is the correct approach.

### Q6: Confidence/uncertainty signal
**YES.** `runs_analyzed` is included in every SQS response. Additionally, `pending: boolean` and labels ("Building track record", "Unverified") communicate data quantity state. A consumer CAN distinguish "SQS 85 based on 10 data points" from "SQS 85 based on 3 data points" via the runs_analyzed field.

### Q7: Freshness
**No freshness penalty in scoring.** The trend computation requires 6+ runs and compares recent vs older halves, but there's no decay for untested capabilities. A capability tested 30 days ago retains its score. The meta-monitor check_stale_tests flags suites not run in 30 days, but doesn't affect the score.

### Q8: Solution SQS floor cap
```
solutionSqs = min(avgStepSqs, minStepSqs + 20)
```
The +20 cap is configurable only in code. Not evidence-based — it's a design decision: "a solution can't be more than 20 points better than its worst step." This seems reasonable but the specific number is arbitrary.

### Q9: Cache invalidation
SQS uses 10-minute in-memory cache. After a test failure, the stale "Excellent" score persists for up to 10 minutes. However, `persistDualProfileScores()` updates the DB columns (qp_score, rp_score, matrix_sqs) immediately after each test batch, so the capabilities endpoint (which reads DB columns) updates faster than the SQS computation cache.

### Q10: Data source separation
**Partial.** The trust API does NOT explicitly label whether scores are based on internal tests vs customer traffic. However:
- `qualityFlags: { source: 'internal_test' }` in transaction_quality distinguishes internal test transactions
- `test_type: 'piggyback'` in test_results distinguishes customer-derived data
- The API consumer cannot see this breakdown — scores are opaque composites

---

## Section 14: Economic Analysis

### Current test execution cost
| Type | Suites | Est. cost/run | Frequency | Monthly cost |
|------|--------|---------------|-----------|-------------|
| schema_check | 277 | €0.00 (dry-run) | Daily | €0.00 |
| negative | 259 | €0.00 (errors expected) | Daily | €0.00 |
| edge_case | 256 | ~€0.00 (partial input) | 72h | ~€0.00 |
| dependency_health | 259 | ~€0.02/run avg | 6h | ~€6.22 |
| known_answer | 292 | ~€0.11/run avg | Daily | ~€32.12/day = ~€963 |

**Estimated monthly test cost: ~€1,000** (dominated by known_answer tests calling real executors). External cost is much lower — most "cost" is internal API credit consumption.

### Projected at 1,000 capabilities
- 5,000 test suites (5 types × 1,000 caps)
- known_answer daily: 1,000 × €0.10 avg = €100/day = **€3,000/month**
- dependency_health 6h: 1,000 × 4/day × €0.02 = €80/day = **€2,400/month**
- **Total: ~€5,500/month**

### Piggyback economics
At current state: 240 piggyback results from 5 free-tier capabilities. For a capability to get sufficient correctness data from piggyback alone: need ~10 results/30 days = ~1 transaction every 3 days. At €0.10/call average, a capability generating €3/month in revenue would produce enough piggyback data to replace scheduled known_answer testing.

### Cost ceiling (10% of revenue)
- €0.05/call capability: 10% = €0.005/test. At daily testing: €0.15/month budget. Known_answer test costs €0.05 = within budget for daily.
- €0.50/call capability: 10% = €0.05/test. Comfortable for daily testing.
- **Constraint:** The cheapest capabilities (€0.02-0.05) have the tightest test budgets.

---

## Section 15: Preliminary Audit Verification

### 1. "SQS scores are artificially inflated because correctness has no real data"
**ALREADY ADDRESSED.** 260/256 capabilities have correctness data in the last 30 days (>100% because some have multiple correctness test types). All 5 factors have real data for essentially all capabilities. There is no NEUTRAL_DEFAULT — capabilities without data show "Building track record" (score 0, pending=true).

### 2. "Test quality recording creates duplicate transactions"
**VALID BUT INTENTIONAL.** `recordTestQuality()` creates a real transactions row for each test execution (with userId=system@strale.internal, priceCents=0). This IS a separate record from any customer transaction. It's not a duplicate — it's intentional: internal test transactions feed quality-aggregation.ts metrics. The transaction_quality row links 1:1 to the transaction.

### 3. "The health state frequency map is dead code"
**ALREADY ADDRESSED.** `HEALTH_STATE_FREQUENCY_HOURS` is imported in test-runner.ts (line 12) and used in `computeAdaptiveInterval()` (line 1166). It determines per-capability test frequency based on health state. Not dead code.

### 4. "All capabilities get Tier B regardless of characteristics"
**PARTIALLY ADDRESSED.** Current distribution: Tier A: 190 suites, Tier B: 794 suites, Tier C: 364 suites. Capabilities DO have varied tiers. However, the onboarding pipeline defaults new capabilities to specific tiers: known_answer=B, schema_check=A, negative=B, edge_case=C, dependency_health=A. The tier is per-suite, not per-capability.

### 5. "Dependency health checks are console-only"
**VALID.** `runDependencyHealthChecks()` returns results in-memory but does NOT persist to any database table. Results are lost on process restart. The only side effect is triggering event-triggers.js on state changes, but the probe results themselves are ephemeral.

### 6. "The ALGORITHMIC_CAPABILITIES set in do.ts is hardcoded"
**VALID — DUPLICATION EXISTS.** `ALGORITHMIC_CAPABILITIES` in do.ts (line 1421) is a hardcoded Set of ~120 slugs used for EU AI Act transparency markers. This duplicates the `transparency_tag` column on the capabilities table. The hardcoded set is used only for the `transparency_marker` field on transactions, not for SQS scoring.

### 7. "No alerting exists"
**ALREADY ADDRESSED.** Multiple alerting mechanisms exist:
- `interrupt-sender.ts` — sends interrupt emails on critical failures (4 sent total)
- `chromium-health.ts` — sends alert on Browserless failure
- `digest-sender.ts` — weekly health digest email
- `lifecycle.ts` — sends notifications on state transitions
- All use Resend email service

### 8. "Schema drift detection is embryonic"
**PARTIALLY ADDRESSED.** `extractKeyStructure()` recursively extracts all key paths from objects — this is a real structural comparison, not just top-level. `captureBaseline()` stores first successful output. Regression tests compare key structure. However: no schema fingerprint history, no diff reporting, no drift alerting. The detection exists but the response system is minimal.

---

## Prioritized Recommendations

### Critical (blocking ACI)
1. **Data retention policy** — test_results will hit 1M rows in months. Add time-based partitioning or cleanup.
2. **SQS score history table** — Cannot build trend dashboards without historical scores. Add `sqs_history` table.
3. **Dependency health persistence** — Probe results lost on restart. Add to health_monitor_events or new table.

### High (significant quality improvement)
4. **Freshness penalty in scoring** — Capabilities not tested in 7+ days should see SQS decay.
5. **Retry logic in executors** — Zero retry anywhere. Add 1-retry with backoff for transient failures.
6. **Schema validation for LLM outputs** — Current regex parsing is fragile. Add Zod validation.
7. **Remove hardcoded ALGORITHMIC_CAPABILITIES** — Use transparency_tag column instead.

### Medium (scaling preparation)
8. **Batch test execution** — Current serial execution within runSingleTest(). Parallelize independent tests.
9. **Test cost tracking (actual)** — Track real API costs, not just estimates.
10. **Dynamic Browserless capability list** — Replace hardcoded 45-item set with auto-discovery.

### Low (polish)
11. **Solution SQS floor cap tuning** — The +20 constant is arbitrary. Analyze real data for optimal value.
12. **Piggyback expansion** — Only 5 free-tier capabilities have piggyback. Expand to all capabilities with customer traffic.
