# Capability Onboarding Improvements

Post-mortem from Web3 vertical launch (2026-03-30).
17 capabilities + 9 solutions shipped. 6 issues identified.

## Problem Summary

Capabilities went live on the frontend with SQS 0 ("Degraded/Unavailable")
because the pipeline has no gate between "code deployed" and "ready for
customers." The test infrastructure, scoring system, and frontend display
all assume capabilities arrive fully tested — but that assumption breaks
when capabilities are added in batch.

## Recommended Changes (ordered by impact)

### 1. Onboarding Gate: Block solutions until all steps score > 0

**Problem:** Solutions include capabilities with SQS 0. Frontend shows "Degraded."
**Fix:** Add a check to `seed-solutions.ts` and the solution seed logic:

```typescript
// Before inserting a solution, verify all step capabilities have SQS > 0
for (const step of solution.steps) {
  const [cap] = await db.select({ matrixSqs: capabilities.matrixSqs })
    .from(capabilities).where(eq(capabilities.slug, step.capabilitySlug));
  if (!cap?.matrixSqs || parseFloat(cap.matrixSqs) === 0) {
    console.warn(`BLOCKED: Solution ${solution.slug} — step ${step.capabilitySlug} has SQS 0`);
    // Don't insert solution; add to deferred list
  }
}
```

**Alternative (softer):** Insert the solution but set `isActive: false` and `lifecycleState: "probation"`. Auto-activate when all steps reach SQS > 50.

### 2. Unified onboarding command: `onboard-capability`

**Problem:** Seeding a capability requires 4 separate steps (seed.ts, seed-tests.ts, run tests, verify scores). Missing any step leaves the capability in a broken intermediate state.

**Fix:** Create a single CLI command that does everything:

```bash
npx tsx scripts/onboard-capability.ts --slug wallet-risk-score
```

This command:
1. Verifies the executor file exists and compiles
2. Inserts or updates the DB row (from seed.ts data or manifest)
3. Generates ALL test suite types (known_answer, schema_check, negative, edge_case)
4. Runs the test suites 5 times (MIN_RUNS)
5. Computes and persists SQS scores
6. Sets `lifecycleState: "active"` only if SQS > 50
7. Enables x402 with computed price
8. Reports final status

If any step fails, the capability stays in `probation` state and is not
included in solutions or the public catalog.

### 3. Verify test fixtures before inserting test suites

**Problem:** Edge case test for wallet-age-check used address 0x1 (a precompile with activity), causing permanent failures.

**Fix:** Extend `verifyKnownAnswerTest()` to ALL test types, not just `known_answer`:

```typescript
// In seed-tests.ts, change the verification gate:
if (test.testType === "known_answer" || test.testType === "edge_case") {
  const verification = await verifyKnownAnswerTest(test);
  if (!verification.ok) {
    console.error(`BLOCKED: ${test.testName} — ${verification.reason}`);
    skipped++;
    continue;
  }
}
```

For `negative` tests, verify the capability THROWS (not succeeds):
```typescript
if (test.testType === "negative") {
  const executor = await tryGetExecutor(test.capabilitySlug);
  if (executor) {
    try {
      await executor(test.input);
      console.error(`BLOCKED: Negative test "${test.testName}" should throw but succeeded`);
      skipped++;
      continue;
    } catch { /* Expected — test is valid */ }
  }
}
```

### 4. Production smoke test before lifecycle activation

**Problem:** ENS resolve worked locally but failed from Railway (CCIP-Read, rate limits).

**Fix:** After deploying but before setting `lifecycleState: "active"`, the scheduler should:
1. Execute the capability once from production with the health_check_input
2. If it fails, keep `lifecycleState: "probation"` and log a warning
3. Only promote to "active" after 3 consecutive successful test runs from production

This already partially exists (the `degraded → active` recovery requires 3 clean runs), but the initial promotion from `draft → active` bypasses it.

### 5. Auto-generate all 5 test types on capability creation

**Problem:** `onCapabilityCreated()` only generates schema_check + negative. known_answer, edge_case, and schema_check with field assertions are left to seed-tests.ts (manual).

**Fix:** Enhance `onCapabilityCreated()` to generate all 5 test types:

```
known_answer:  Execute with health_check_input, capture output, assert key fields not null
schema_check:  Assert all outputSchema.properties fields exist with correct types
negative:      Empty input {} — should throw error
edge_case:     Generate from inputSchema (empty strings, extreme values, unicode)
dependency_health: Probe the external API endpoint (if applicable)
```

The known_answer generation already exists for algorithmic caps
(`generateAlgorithmicRegressionTest`). Extend it to all capability types.

### 6. Solution SQS should show "Building" not "Degraded" for new steps

**Problem:** A solution with one step at SQS 0 (pending) shows "20 Degraded" and "Unavailable."

**Fix:** In `computeSolutionScore()` and the solution display logic:

```typescript
// If ANY step is pending (SQS 0 AND no test results), show "Building" instead of "Degraded"
const hasPendingStep = stepData.some(s => s.sqs_score === 0 && !s.has_test_results);
if (hasPendingStep) {
  return {
    sqs: null, // Not scored yet
    label: "Building track record",
    pending: true,
    qualification_estimate: "Score available after all steps are tested",
  };
}
```

This prevents the alarming "Degraded" label for brand-new solutions that simply haven't been tested yet.

### 7. Require `avgLatencyMs` at seed time (estimate from capability type)

**Problem:** `avgLatencyMs` is required by readiness check but not set at seed time. Causes "Missing avg_latency_ms" warnings.

**Fix:** Add a default estimator in seed.ts based on transparency_tag:

```typescript
function estimateLatency(cap: SeedCapability): number {
  if (cap.transparencyTag === "algorithmic") return 50;
  if (cap.category === "web3") return 500; // External API
  if (cap.transparencyTag === "ai_generated") return 3000;
  if (cap.transparencyTag === "mixed") return 2000;
  return 500; // Default for external APIs
}
```

### 8. Add dependency manifest entries for new external APIs

**Problem:** GoPlus, DeFi Llama, Etherscan, Alternative.me, and publicnode.com are not in `dependency-manifest.ts`. Health probes don't monitor them. When they go down, the test runner doesn't know to skip tests.

**Fix:** Add entries to `dependency-manifest.ts`:

```typescript
{ name: "goplus", displayName: "GoPlus Security", baseUrl: "https://api.gopluslabs.io",
  authType: "none", healthProbe: { path: "/api/v1/token_security/1?contract_addresses=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", method: "GET", healthyStatuses: [200], timeoutMs: 5000 },
  capabilities: ["wallet-risk-score", "token-security-check", "approval-security-check", "phishing-site-check"], tier: "free" },

{ name: "defillama", displayName: "DeFi Llama", baseUrl: "https://api.llama.fi",
  authType: "none", healthProbe: { path: "/protocols", method: "GET", healthyStatuses: [200], timeoutMs: 5000 },
  capabilities: ["protocol-tvl-lookup", "protocol-fees-lookup", "stablecoin-flow-check"], tier: "free" },

{ name: "etherscan", displayName: "Etherscan V2", baseUrl: "https://api.etherscan.io",
  authType: "api-key-query", envVar: "ETHERSCAN_API_KEY",
  healthProbe: { path: "/v2/api?chainid=1&module=gastracker&action=gasoracle", method: "GET", healthyStatuses: [200], timeoutMs: 5000 },
  capabilities: ["wallet-age-check", "contract-verify-check", "gas-price-check", "wallet-balance-lookup", "wallet-transactions-lookup"], tier: "free" },

{ name: "alternative-me", displayName: "Alternative.me", baseUrl: "https://api.alternative.me",
  authType: "none", healthProbe: { path: "/fng/?limit=1&format=json", method: "GET", healthyStatuses: [200], timeoutMs: 3000 },
  capabilities: ["fear-greed-index"], tier: "free" },
```

### 9. x402 should respect lifecycle state

**Problem:** The x402 gateway serves any capability with `x402_enabled = true` regardless of lifecycle state. A capability in `probation` or `degraded` is still available via x402.

**Fix:** The x402 cache query should filter on lifecycle state:

```typescript
.where(and(
  eq(capabilities.x402Enabled, true),
  eq(capabilities.isActive, true),
  inArray(capabilities.lifecycleState, ["active"]), // Not probation, degraded, suspended
))
```

### 10. Batch onboarding script for new verticals

**Problem:** Adding 17 capabilities required 4 separate prompts and multiple fix iterations. Each capability went through the same pattern: write file → seed → discover missing tests → add tests → run tests → fix failing tests.

**Fix:** Create a batch onboarding script:

```bash
npx tsx scripts/onboard-vertical.ts --category web3
```

This script:
1. Finds all executor files in `src/capabilities/` matching the category
2. For each, runs the full onboarding pipeline (recommendation #2)
3. Creates solutions from a solutions manifest file
4. Gates solution activation on all steps being qualified
5. Reports a summary at the end

## Priority Order

| # | Fix | Effort | Impact | Ship When |
|---|-----|--------|--------|-----------|
| 1 | Block solutions until steps scored | 2h | Critical | Before next vertical |
| 2 | Unified onboard command | 4h | High | Before next vertical |
| 3 | Verify ALL test fixtures | 1h | High | Immediate |
| 4 | Production smoke test gate | 2h | High | Before next vertical |
| 5 | Auto-generate all 5 test types | 3h | Medium | Sprint backlog |
| 6 | "Building" label for new solutions | 1h | Medium | Immediate |
| 7 | Default avgLatencyMs at seed time | 30m | Low | Immediate |
| 8 | Dependency manifest for Web3 APIs | 1h | Medium | This week |
| 9 | x402 lifecycle filter | 30m | Low | This week |
| 10 | Batch vertical onboarding | 4h | High | Before next vertical |
