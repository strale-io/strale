# DK Phase 2 (Understand) — CVR breaker false-recovery via edge_case test pass

**Date:** 2026-05-07
**Author:** Claude Code (investigation/dk-phase-2-understand)
**Related:** DEC-20260506-D (Phase 1 Contain), Bug Fix Framework canonical
**Status:** Phase 2 complete; Phase 3 Harden recommendation included.

---

## Premise correction

DEC-20260506-D and the Phase 2 prompt both framed the issue as "CVR breaker stuck open since 2026-05-06." That premise is false.

Production state at session start (queried via `railway ssh --service strale` against `capability_health`):

```json
{
  "capability_slug": "danish-company-data",
  "state": "closed",
  "consecutive_failures": 0,
  "total_failures": 2,
  "total_successes": 0,
  "last_failure_at": "2026-04-10T22:19:51.793Z",
  "last_success_at": "2026-05-06T13:58:57.803Z",
  "opened_at": null,
  "next_retry_at": null,
  "backoff_minutes": 5,
  "updated_at": "2026-05-06T13:58:57.803Z"
}
```

The breaker was open for **3.3 hours** (10:39 → 13:58 UTC on 2026-05-06), then auto-recovered to `closed` and has been closed for the ~18+ hours since. The recovery happened **3 hours before** the manually-set 6-hour `next_retry_at` window expired. The "half-open auto-probe at T+6h" semantics that DEC-20260506-D assumed do not exist in the codebase: `checkCircuitBreaker` is purely reactive (only invoked from `apps/api/src/routes/do.ts:759`), and `recordTestEvidence` does not consult `next_retry_at`.

The smoking gun is the row's combination of `last_success_at = 2026-05-06T13:58:57.803Z` with `total_successes = 0`. Only `recordTestEvidence` writes `lastSuccessAt` without incrementing `totalSuccesses` ([circuit-breaker.ts:350-360](apps/api/src/lib/circuit-breaker.ts#L350-L360)); `recordSuccess` increments both.

## Causal chain summary

CVR's free-tier quota has been exhausted continuously since at least 2026-05-06 01:59Z (75+ test failures recorded over ~30 hours, all with the same error string "The Danish business registry API quota has been temporarily exceeded. Please try again in a few hours."). The breaker substrate **does not see** this because two coupled bugs in the test runner combine to falsely report the capability healthy: edge_case validateResult treats any thrown error as `passed=true`, and `recordTestEvidence` is fed by passed=true edge_case results. A successful edge_case "pass" by way of the quota error fires `recordTestEvidence`, which transitions the breaker open → half_open → closed. Independently, the test runner's failure path writes only to the `health_monitor_events` audit table and never invokes `recordFailure` on `capability_health`, so 30 hours of consecutive failures cannot organically trip the breaker. Customer impact is currently zero — DK has had no `/v1/do` traffic since 2026-04-10 (the only path that calls `recordFailure`) — but the substrate is now persistently lying about capability health.

## Evidence references

### Production state and timeline
- `capability_health` row for `danish-company-data` at session start: state=closed, last_success_at=2026-05-06T13:58:57.803Z, total_successes=0, total_failures=2 (last 2026-04-10). Queried via `railway ssh --service strale` against prod `postgres`.
- `health_monitor_events` for `danish-company-data` since 2026-05-06T00:00Z: 75+ classification rows, all "Test classified as unknown" with the quota error string, recurring every ~2 hours from 2026-05-06T01:59Z to 2026-05-07T07:58Z (most recent at session start).
- One `circuit_breaker` event at 2026-05-06T13:58:57.805Z: `action_taken: "Circuit breaker recovered via test evidence"`, `details: { previous_state: "half_open", recovery_source: "test_evidence" }`.
- Two events at 2026-05-06T19:58Z and 21:58Z were classified `test_infrastructure` rather than `unknown` because the Anthropic API key hit a credit balance error during the LLM-based name extraction path. Unrelated to CVR; surfaces a separate billing concern not in scope here.

### False-recovery mechanism (code paths)

**Step 1 — edge_case test "passes" via thrown errors.** [test-runner.ts:994-1004](apps/api/src/lib/test-runner.ts#L994-L1004):
```js
if (suite.testType === "edge_case") {
  if (executionError) {
    return { passed: true, failureReason: null };
  }
  if (!capResult) {
    return {
      passed: false,
      failureReason: "Edge case: no result and no error",
    };
  }
}
```
Any thrown error counts as a passed edge_case. The DK seed-tests entry "CVR with leading zeros" ([seed-tests.ts:666-669](apps/api/src/db/seed-tests.ts#L666-L669)) has empty `validationRules: checks()` and input `cvr_number: "00000001"`. When the executor hits cvrapi.dk, the quota error is thrown ([danish-company-data.ts:85-87](apps/api/src/capabilities/danish-company-data.ts#L85-L87)), validateResult returns `{passed: true}`.

**Step 2 — `recordTestEvidence` fires on edge_case pass.** [test-runner.ts:550-558](apps/api/src/lib/test-runner.ts#L550-L558):
```js
} else if (passed && (suite.testType === "known_answer" || suite.testType === "edge_case")) {
  // Test passed with real execution — feed evidence to circuit breaker
  fireAndForget(
    async () => {
      const { recordTestEvidence } = await import("./circuit-breaker.js");
      return recordTestEvidence(suite.capabilitySlug);
    },
    ...
  );
}
```

**Step 3 — `recordTestEvidence` always transitions toward closed.** [circuit-breaker.ts:330-402](apps/api/src/lib/circuit-breaker.ts#L330-L402):
- state=open → state=half_open (regardless of next_retry_at)
- state=half_open → state=closed (regardless of next_retry_at)
- Sets `lastSuccessAt = now` but does not increment `totalSuccesses`.

So the 11:59Z 2026-05-06 test batch transitioned open → half_open. The 13:58Z 2026-05-06 test batch transitioned half_open → closed and emitted the recovery event. The breaker has been falsely closed since.

### Compounding observability gap

The test runner's failure path ([test-runner.ts:531-549](apps/api/src/lib/test-runner.ts#L531-L549)) writes classification events to `health_monitor_events` but does not invoke `recordFailure` on `capability_health`. Consequence: 30 continuous hours of upstream failures accumulate zero `consecutiveFailures` on the breaker. Even if Bug A above did not exist, the breaker could not trip from test signal alone. `recordFailure` is only called from `/v1/do` ([do.ts:1282, 1441, 1772, 2260](apps/api/src/routes/do.ts)) — i.e., real customer traffic. DK has had none since 2026-04-10.

### Failure-categorizer brittleness (lower priority)

[trust-helpers.ts:397](apps/api/src/lib/trust-helpers.ts#L397) checks `lower.includes("quota_exceeded")` (with underscore) for the transient classification. The executor throws "quota has been temporarily exceeded" (with spaces). The classifier returns `unknown` rather than `transient`. Both are retryable per `isRetryableFailure`, so behavior today is unchanged — but this is a tight coupling between executor wording and categorizer regex that should be loosened when Bug A and Bug B are addressed.

### CVR quota cadence (informational)

cvrapi.dk's documentation page (https://cvrapi.dk/documentation) timed out twice during the WebFetch attempt, so I could not verify the official quota policy in this session. The empirical signal is: same quota error returned continuously for ~30 hours, every 2 hours of test runs (~25 batches × 5 tests = ~125 calls × 25 confirmed by logs). cvrapi.dk's free tier is widely documented as having a monthly quota (≈1000 calls per IP per month) that does not roll. Confirming this is a Phase 3 concern for vendor-strategy reasons (datacvr.virk.dk migration was queued back in 2026-04-27 per Notion search hit `34f67c87-082c-8162-8717-e9053710e3ed` "CVR system-til-system API access — applied; rewrite danish-company-data on credentials"). It is **not** a Phase 3 concern for the breaker substrate fix — the substrate must work correctly regardless of the underlying upstream quota model.

## Phase 3 Harden recommendation

**Recommendation: code-level gate (test-runner.ts) + observability gate (test-runner.ts → recordFailure).**

The structural defect is in the platform's circuit-breaker substrate, not in the DK capability or in CVR's quota policy. Two of the three changes are one-or-two-line edits.

**Fix A — edge_case "pass via thrown error" must not feed circuit breaker evidence.**
File: `apps/api/src/lib/test-runner.ts` line 550.
Change the gate:
```diff
-} else if (passed && (suite.testType === "known_answer" || suite.testType === "edge_case")) {
+} else if (
+  passed
+  && suite.testType === "known_answer"
+  && executionError === null
+) {
```
Rationale: edge_case "passing" means "the executor produced any outcome, including a thrown error" — that's a non-signal, not a fitness signal. Limiting evidence to known_answer with `executionError === null` requires a real successful execution path. The `executionError === null` guard is doubly defensive — it prevents any future validateResult quirk on known_answer from leaking through.

**Fix B — wire test-runner failures into capability_health.**
File: `apps/api/src/lib/test-runner.ts`.
After writing the test result, when a `known_answer` or `dependency_health` test fails with a `transient` or `unknown` classification, call `recordFailure(slug, failureReason)` on capability_health. This closes the observability gap and makes the breaker organically responsive to test-runner signal — which is what DEC-20260506-D's Phase 1 author was assuming would happen ("rely on organic breaker trip via consecutiveFailures") but rejected because "the breaker hasn't tripped in 24h despite continuous failures." That rejection was right diagnosis, wrong root cause: it wasn't a threshold mis-tuning, it was a missing wire.

Pair with classification-aware suppression: do NOT recordFailure for `capability_bug` or `test_design` classifications (those are Strale-side issues, not upstream).

**Fix C — categorizer regex (low priority follow-up).**
File: `apps/api/src/lib/trust-helpers.ts` line 397.
Replace `lower.includes("quota_exceeded")` with `lower.includes("quota") && (lower.includes("exceeded") || lower.includes("exhausted"))`. Or refactor the executor side to throw structured errors with a category enum and replace the regex pipeline entirely. The latter is a separate work item.

**Plus a system-level invariant (separate Phase 3 prompt or follow-up):**
Add an invariant check in the existing `apps/api/src/jobs/invariant-checker.ts` (or a new sibling): if `capability_health.state='closed' AND last_success_at IS NOT NULL AND total_successes=0`, flag the row. This is the "lying breaker" detector. Caught the DK row immediately at session start and would have caught it 18 hours earlier.

**Cleanup of the lying DK row:**
Reset the row by hand or wait for the natural cvrapi.dk monthly quota rollover to provide an organic success. Recommended: hand-reset (`UPDATE capability_health SET state='closed', last_success_at=NULL, last_failure_at=NOW(), total_failures = total_failures + 1 WHERE capability_slug='danish-company-data'`), but only after Fix A and Fix B ship — otherwise the same false-recovery would fire again on the next 2-hour test batch.

## Phase 3 prompt outline

The next CC prompt (a separate session) should implement Fix A, Fix B, and Fix C, plus the cleanup. Skeleton:

1. **Audit phase.** Read this memo, read DEC-20260506-D, read circuit-breaker.ts, read test-runner.ts (lines 410-575 around runSingleTest + the `passed && known_answer || edge_case` gate), read trust-helpers.ts:370-422.
2. **Implement Fix A.** Change the test-runner.ts:550-558 gate per the diff above. Add a unit test that simulates an edge_case test where the executor throws a transient error: assert `recordTestEvidence` is NOT called.
3. **Implement Fix B.** Add a `recordFailure(slug, failureReason)` invocation when a known_answer or dependency_health test fails with a transient/unknown classification. Suppress for capability_bug and test_design. Add a unit test asserting 3 consecutive transient known_answer failures cause `capability_health.state` to transition to open.
4. **Implement Fix C.** Tighten the quota regex in categorizeFailureReason. Add a test asserting the DK quota error string classifies as `transient`.
5. **Cleanup the lying DK row.** Once the ship-PR has merged AND been deploy-verified per DEC-20260504-C (Deploy Mechanism Verification), apply the manual UPDATE listed above. Document in DEC and Journal entry.
6. **Verification.** Run the full test suite. Query `capability_health` 2 hours after deploy and confirm DK has trailed back to a real failure state with `consecutive_failures > 0` and `total_failures > 2`. Audit-Follow-up Test Coverage Protocol (DEC-20260504-A) applies — every commit gets a regression test.
7. **Journal entry + DEC.** Phase 3 Journal entry; if Fix B materially changes when capabilities trip, file a new DEC noting the substrate-semantics change (test-runner failures now feed circuit breaker), with a pointer back to this Phase 2 Journal entry.

The Phase 3 prompt must NOT skip the Bulk-Operation Deploy Protocol consideration — Fix B will cause backlog of test-runner failures (across all capabilities, not just DK) to suddenly start tripping breakers on the first deploy. Audit `health_monitor_events` for the prior 24-48h, count `verdict=unknown` and `verdict=transient` rows by slug, and decide whether to ship Fix B with a self-throttling shape (e.g., only call recordFailure on a capability if its current consecutive_failures count plus inferred test-failure count exceeds threshold) or pre-clean the inflight backlog of failed-test signals before deploy.

## Open questions for Phase 3

- Should Fix B feed `dependency_health` test failures too? Argument for: dependency_health is the most direct probe of upstream availability. Argument against: dependency_health is currently classification-only and historically has not been wired to failure thresholds; bringing it in changes the breaker's sensitivity profile across the platform. Recommendation: include it, but inventory the cross-platform impact during the Phase 3 audit phase.
- Should `recordTestEvidence` be retired entirely in favor of "test pass calls `recordSuccess` directly"? Argument for: simpler, single positive-signal path. Argument against: `recordSuccess` increments `totalSuccesses` (used for SQS-era metrics that haven't been fully retired) and writes audit trail under a different shape. Recommendation: keep `recordTestEvidence`, but require both `passed=true` AND `executionError === null` AND `testType === "known_answer"` at the call site. (This is what Fix A delivers.)
- Is the broader "test-runner classification → operational substrate" wiring robust beyond capability_health? Audit `health_monitor_events` consumers — at minimum check `lifecycle.ts`, `invariant-checker.ts`, any cron-driven workers — for similar gaps where test signal isn't reaching the operational substrate. (Not in scope for the immediate Phase 3 prompt; queue as a follow-up.)
- What's the right cleanup ordering between (a) ship Fix A+B+C, (b) hand-reset the DK row, (c) validate DK's CVR quota state? If we hand-reset (b) before the cvrapi.dk monthly quota rolls (likely 2026-06-01), the next test batch will trip the breaker open again — which is the correct behavior. If the quota has rolled by then, the next test batch will close it organically. Either is fine; the substrate now does what the substrate is supposed to do.
