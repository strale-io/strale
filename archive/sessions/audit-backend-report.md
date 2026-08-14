# Strale Backend Audit Report

**Date:** 2026-03-16
**Scope:** Full backend code audit — security, dead code, SQS correctness, API consistency, test infrastructure, dependencies, MCP server
**Mode:** READ-ONLY (no code changes)

---

## 1. Security Review

### CRITICAL

**S-1. Idempotency key not scoped to authenticated user**
- File: `apps/api/src/routes/do.ts:189`
- The idempotency lookup queries `transactions` by `idempotencyKey` alone with no `userId` filter. If User A and User B independently submit requests with the same idempotency key, User B receives User A's cached response — including output data, price, and wallet balance.
- **Impact:** Cross-user data leak, silent request suppression.
- **Fix:** Add `eq(transactions.userId, user.id)` to the WHERE clause.

**S-2. Async refund path missing SELECT FOR UPDATE — wallet race condition**
- File: `apps/api/src/routes/do.ts:1215-1226`
- In `executeInBackground`, the failure-path refund does a bare SELECT followed by arithmetic update without row-level locking. This violates DEC-8. The sync and async setup paths correctly use `.for("update")`, but the refund path does not.
- **Impact:** Concurrent refunds or a refund + top-up race can corrupt wallet balance.
- **Fix:** Add `.for("update")` to the SELECT inside the refund transaction.

### HIGH

**S-3. CORS policy reflects `origin: null` (sandboxed iframes)**
- File: `apps/api/src/app.ts:353`
- Returning `"null"` as an allowed origin enables sandboxed iframe CORS bypass. Attackers can use `<iframe sandbox="allow-scripts">` or `data:` URIs to issue credentialed cross-origin requests to payment endpoints.
- **Fix:** Remove the `origin === "null"` branch.

**S-4. MCP endpoint has no rate limiting for unauthenticated requests**
- File: `apps/api/src/routes/mcp.ts:217-225`
- `POST /mcp` accepts anonymous requests with no IP rate limit. Each request spins up a full `McpServer` instance with 233+ tools. Trivially abusable for resource exhaustion.
- **Fix:** Apply `rateLimitByIp` (e.g., 30 req/min) to `POST /mcp`.

**S-5. Free-tier IP rate limiting bypassable with invalid Bearer token**
- Files: `apps/api/src/lib/middleware.ts:72-75`, `apps/api/src/lib/rate-limit.ts:140-142`
- When `optionalAuthMiddleware` returns 401 early for a malformed Bearer token, neither `rateLimitByKey` nor `rateLimitFreeTierByIp` fires. An attacker sending `Authorization: Bearer invalid` bypasses both rate limiters for the 401 path without consuming their IP quota.
- **Fix:** Apply `rateLimitByIp` before `optionalAuthMiddleware` on `POST /v1/do`, or increment IP counter even on auth failure.

**S-6. `rateLimitByKey` silently skips when user context is absent**
- File: `apps/api/src/lib/rate-limit.ts:70-74`
- If `user` is unexpectedly absent (middleware bug), rate limiting is silently disabled rather than failing closed. No logging or metric when skip fires.
- **Fix:** Fail closed or add monitoring for unexpected skips.

### MEDIUM

**S-7. Internal quality/trust endpoints have no rate limiting**
- File: `apps/api/src/app.ts:373`
- All `/v1/internal/*` routes are public with no IP rate limiting. An attacker can enumerate all capability slugs and scrape full quality profiles continuously.
- **Fix:** Add `rateLimitByIp` to `/v1/internal/*` routes.

**S-8. No input schema validation on POST /v1/do**
- File: `apps/api/src/routes/do.ts:440`
- `inputs` is passed directly to capability executors with no validation against the capability's `input_schema`. Relies entirely on individual capabilities to validate their own input.
- **Fix:** Validate `inputs` against the matched capability's `inputSchema` before calling the executor.

**S-9. Admin stats cache preserves PII across auth state changes**
- File: `apps/api/src/routes/admin.ts:11-12,190-191`
- The cached stats include user emails and wallet balances. Cache is not invalidated when `ADMIN_SECRET` is missing or misconfigured.
- **Fix:** Exclude PII from cache or invalidate on auth failure.

### LOW

**S-10. SHA-256 API key hashing without salt**
- File: `apps/api/src/lib/auth.ts:10-12`
- API keys are 256-bit random values (sufficient entropy to prevent rainbow tables), but using a salted KDF (scrypt/argon2) is the accepted standard. Timing-safe comparison is correctly implemented.
- **Note:** Acceptable given key entropy. Document reasoning for future reviewers.

### Verified Correct
- No hardcoded secrets — all from `process.env`
- Auth middleware applied to all protected routes
- Stripe webhook signature verification correct
- SQL injection safe — Drizzle parameterized queries throughout
- SSRF protection via `validateUrl`/`validateHost` blocking private ranges
- Body size limits applied (1MB /v1/*, 512KB /mcp, 256KB /a2a)
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) set globally
- Error sanitization strips stack traces, provider names, and hostnames

---

## 2. Dead Code and Stale References

### MEDIUM

**D-1. Legacy 5-factor SQS model still active**
- File: `apps/api/src/lib/sqs.ts:38-44`
- The old WEIGHTS constant (40/25/20/10/5) and `computeCapabilitySQS()` function are still actively used — not dead code. The legacy model is the actual quality gate on POST /v1/do (see SQS-1 below). New dual-profile exists alongside it.

**D-2. Deactivated capabilities still imported and registered**
- File: `apps/api/src/app.ts:73-75,251`
- `amazon-price`, `hong-kong-company-data`, `indian-company-data`, `singapore-company-data` are imported and `registerCapability()` executes at startup. Harmless (DB `isActive=false` prevents execution) but unnecessary overhead.
- **Fix:** Remove imports from `app.ts` when cleanup is desired.

**D-3. `computeLegacySQS` deprecated export still present**
- File: `apps/api/src/lib/sqs.ts:640`
- Alias kept for "backward compat during transition." No callers found.
- **Fix:** Remove when transition is complete.

**D-4. `legacy_score` field in DualProfileSQSResult**
- File: `apps/api/src/lib/sqs.ts:653`
- Transition comparison field. Can be removed once dual-profile is fully adopted.

### LOW

**D-5. Two documented TODOs (non-blocking)**
- `apps/api/src/lib/suggest.ts:~25` — batch trust data queries (marked as OK for now)
- `apps/api/src/routes/do.ts:~265` — partial results for multi-step solution execution (documented feature gap)

**D-6. No commented-out code blocks > 5 lines found**
- Codebase is clean on this front.

**D-7. No unused imports detected in key files**
- `index.ts`, `routes/do.ts`, `routes/capabilities.ts`, `lib/sqs.ts` all clean.

---

## 3. SQS Correctness

### CRITICAL

**SQS-1. POST /v1/do quality gate uses legacy SQS, not matrix SQS**
- File: `apps/api/src/routes/do.ts:368-392`
- The platform floor gate and `min_sqs` user filter use `computeCapabilitySQS` (legacy 5-factor). The dual-profile `computeDualProfileSQS` is called separately only to populate the response body. The quality gate enforcing execution does NOT use the canonical matrix SQS score.
- **Impact:** The enforced quality gate and the reported quality score can diverge significantly. A capability that scores well on the legacy model but poorly on the matrix model (or vice versa) will have inconsistent behavior.
- **Fix:** Migrate the gate to use `computeDualProfileSQS().score` (matrix score).

**SQS-2. `confidence_after_strategy` always returns 100 for solutions**
- File: `apps/api/src/routes/internal-trust.ts:586`
- The lambda `stepData.map(() => 100)` ignores all step data — `confidence_after_strategy` is hardcoded to 100 for every solution regardless of step RP grades.
- **Fix:** Use actual step RP scores: `stepData.map(s => s.rp?.grade === "A" ? 100 : Math.min(99, Math.round(s.rp?.score ?? 50)))`.

### HIGH

**SQS-3. `computeSolutionSQS` is dead code**
- File: `apps/api/src/lib/sqs.ts:233-319`
- Three routes implement inline solution aggregation independently with minor behavioral differences. The centralized function is never called.
- **Impact:** Behavioral inconsistency across solution endpoints.
- **Fix:** Either use the centralized function or remove it and document that inline aggregation is intentional.

**SQS-4. Audit trail `quality.sqs` is always 0 for sync paid execution**
- File: `apps/api/src/routes/do.ts:964`
- The audit trail stores `sqs: { score: 0, label: qualityStatus }` where `qualityStatus` is a health string ("healthy"/"degraded") from pass-rate thresholds — not the actual SQS score or label.
- **Impact:** Audit records for paid sync executions have incorrect SQS data.

### MEDIUM

**SQS-5. MIN_RUNS and ROLLING_RUNS duplicated in three files**
- Files: `sqs.ts:48-49`, `quality-profile.ts:58-59`, `reliability-profile.ts:76-77`
- All set to `MIN_RUNS=5, ROLLING_RUNS=10`. Must be updated in three places if values change.
- **Fix:** Extract to a shared constant.

**SQS-6. RP circuit breaker includes upstream failures in streak detection; legacy SQS excludes them**
- Files: `reliability-profile.ts:332-334` vs `sqs.ts:424-426`
- The behavioral difference is undocumented. Upstream failures can trigger/clear RP circuit breaker streaks but not legacy SQS streaks.

**SQS-7. QP and RP profiles are not independently cached**
- Files: `quality-profile.ts`, `reliability-profile.ts`
- Every call to `computeDualProfileSQS` executes multiple SQL queries against `test_results`. Only the legacy SQS has a 10-minute in-process cache. The `/v1/quality/:slug` endpoint has HTTP caching (5 min) but no in-process cache.

### Verified Correct
- QP weights match spec: correctness 50%, schema 31%, error_handling 13%, edge_cases 6%
- RP uses 4 capability-type-specific weight sets (deterministic, stable_api, scraping, ai_assisted)
- Matrix 5x5 grid values match spec with ±3 intra-band interpolation
- Upstream failures excluded from QP, included in RP — correct per design
- Circuit breaker in RP only (not QP) — correct per spec
- Solution SQS uses floor-aware weighted average with weakest+20 cap
- SQS cache TTL: 10 minutes (legacy), per-route caching on trust endpoints (2 min)

---

## 4. API Surface Consistency

### HIGH

**API-1. `quality_profile` field is a string in /v1/do, an object everywhere else**
- File: `apps/api/src/routes/do.ts:40`
- `/v1/do` returns `quality_profile: "A"` (string grade). GET `/v1/quality/:slug` returns `quality_profile: { grade, score, label, factors[] }` (full object). Breaking inconsistency for clients consuming both.

**API-2. RP factor names aliased incorrectly in internal-trust**
- File: `apps/api/src/routes/internal-trust.ts:397-403`
- `edge_cases` data is exposed as `latency`. This is factually incorrect — edge case test pass rates are not latency measurements. Other aliases: `availability→current_availability`, `correctness→rolling_success`, `schema→upstream_health`, `error_handling→error_resilience`.

### MEDIUM

**API-3. Solutions endpoints use camelCase; capabilities use snake_case**
- File: `apps/api/src/routes/solutions.ts:95-113`
- Solution list returns `priceCents`, `stepCount`, `transparencyTag` (camelCase). Capabilities list uses `price_cents`, `transparency_tag` (snake_case). The detail endpoint mixes both conventions within the same response.

**API-4. `data_source` absent from solutions list response**
- File: `apps/api/src/routes/solutions.ts:95-113`
- Available on capabilities list and solution detail steps but not the solution list.

**API-5. Deactivated capabilities accessible via internal endpoints**
- Files: `internal-trust.ts:321`, `internal-quality.ts:27`
- `GET /v1/internal/trust/capabilities/:slug` and `GET /v1/internal/quality/capabilities/:slug` do not filter on `isActive`.

**API-6. `execution_guidance` structure varies across endpoints**
- `/v1/do`: 3 fields (`usable`, `strategy`, `confidence_after_strategy`)
- Internal trust detail: 10 fields (full config, error_handling, recovery, etc.)
- Solution trust: 4 fields (simplified subset)

### Verified Correct
- `sqs` field name used consistently (no `sqs_score` anywhere)
- Deactivated capabilities filtered from public `GET /v1/capabilities` and `GET /v1/quality/:slug`

---

## 5. Test Infrastructure Health

### HIGH

**T-1. No auto-linkage between capabilities.isActive and test_suites.active**
- Files: `apps/api/src/db/schema.ts:95,299`, `apps/api/src/lib/test-runner.ts`
- The adaptive scheduler filters only on `testSuites.active` and `testSuites.testStatus` — it does not cross-join with `capabilities.is_active`. Deactivated capabilities' test suites may still run and generate noise in SQS scores unless manually deactivated.
- **Note:** The 4 deactivated capabilities had their test suites manually set to `active=false` earlier today, but there is no enforcement mechanism preventing this from drifting.

### MEDIUM

**T-2. No auto-cleanup of orphaned test suites**
- File: `apps/api/src/lib/test-runner.ts:309-325`
- If a capability is deleted from the DB, its test suites remain active. The schema_check test gracefully handles missing capabilities (returns fail), but orphaned suites pollute test run logs.

**T-3. `.env.example` BROWSERLESS_URL points to US endpoint**
- File: `.env.example:17`
- Documents `https://chrome.browserless.io` (US legacy). Production should use the EU endpoint.

### Verified Correct
- `startScheduledTests()` called on startup (`app.ts:421`) with double-start guard
- Failure classifier covers Browserless error patterns (HTTP 401/403/5xx, net::ERR_*, navigation timeout)
- EU migration errors correctly fall through to `upstream_transient` classification

---

## 6. Dependency and Configuration

### HIGH

**C-1. `.env.example` documents only 8 of ~18 required env vars**
- File: `.env.example`
- Missing: `COMPANIES_HOUSE_API_KEY`, `SERPER_API_KEY`, `PAGESPEED_API_KEY`, `AVIATIONSTACK_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADMIN_SECRET`, `STRALE_BASE_URL`, `STRALE_MAX_PRICE_CENTS`, `FRONTEND_URL`, `STRIPE_PRICE_ID`

**C-2. No Dockerfile in source control**
- CLAUDE.md notes "Dockerfile-based Railway deploy" but no Dockerfile exists in the repo. Deployment configuration lives only in Railway UI.

### LOW

**C-3. `strale-mcp: "*"` wildcard dependency**
- File: `apps/api/package.json`
- Unconventional workspace reference. Verify it resolves to workspace, not npm registry.

### Verified Correct
- All npm dependencies are on recent major versions, no obviously vulnerable packages
- No `package-lock.json` issues identified

---

## 7. MCP Server Consistency

### MEDIUM

**M-1. Hardcoded "233+" capability count is stale**
- File: `packages/mcp-server/src/tools.ts:501,510,559,854`
- Multiple locations hardcode "233+" in descriptions. With 4 deactivated capabilities, active count is 229.
- Also: "1,215 active test suites" in methodology text is stale (should be ~1,195).

**M-2. `strale_search` filters by usable+sqs proxy, not is_active**
- File: `packages/mcp-server/src/tools.ts:615-623`
- A deactivated capability with a non-zero cached SQS score would pass through the filter. Relies on `/v1/capabilities` endpoint filtering (which is correct), but the MCP cache may be stale.

### LOW

**M-3. `strale_ping` hardcodes `tools_registered: 8`**
- File: `packages/mcp-server/src/tools.ts:476`
- Will silently mis-report if a tool is added.

### Verified Correct
- Tool descriptions correctly reference dual-profile model (not old 5-factor)
- `strale_methodology` returns accurate methodology text for dual-profile
- `strale_trust_profile` returns live dual-profile data from API (not cached/hardcoded)
- Trust batch pre-fetch chunks into 50-item batches with proper error handling

---

## AUDIT SUMMARY

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 11 |
| MEDIUM | 14 |
| LOW | 7 |
| **Total** | **35** |

### Critical (must fix before launch)

1. **S-1:** Idempotency key not scoped to user — cross-user data leak
2. **S-2:** Async refund missing SELECT FOR UPDATE — wallet race condition
3. **SQS-1:** Quality gate uses legacy SQS, not matrix SQS — enforced score diverges from reported score

### Top 5 High-Priority Items

1. **S-3:** CORS `origin: null` reflection — sandboxed iframe bypass
2. **S-4:** MCP endpoint no rate limiting — resource exhaustion vector
3. **SQS-2:** Solution confidence always 100 — meaningless trust signal
4. **API-1:** `quality_profile` field type inconsistency between endpoints
5. **API-2:** RP factor names incorrectly aliased (`edge_cases` → `latency`)

### Deferred / Acceptable

- **S-10:** SHA-256 key hashing — acceptable given key entropy
- **D-5:** Two documented TODOs — acknowledged feature gaps
- **D-6, D-7:** Codebase is clean (no commented-out blocks, no unused imports)
