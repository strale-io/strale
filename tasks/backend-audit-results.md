# Backend Audit Results

**Date:** 2026-03-04
**Scope:** `apps/api/src/` and `packages/`
**Mode:** Report only — no fixes applied

---

## Executive Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| 1. Silent catches | 0 | 0 | 0 | 0 |
| 2. API key exposure | 1 | 1 | 4 | 1 |
| 3. SQL injection / input validation | 1 | 1 | 4 | 1 |
| 4. Rate limiting coverage | 1 | 1 | 1 | 0 |
| 5. Error handling | 0 | 2 | 4 | 0 |
| 6. Type safety | 0 | 0 | 2 | 1 |
| 7. Dead code / unused exports | 0 | 1 | 0 | 1 |
| 8. Database health | 0 | 3 | 4 | 4 |
| 9. Capability dependencies | 0 | 0 | 0 | 2 |
| 10. Test coverage | 1 | 0 | 0 | 0 |
| **TOTAL** | **4** | **9** | **15** | **10** |

**Top 5 findings to fix before first real user:**
1. `/v1/internal/tests/run` is publicly accessible with no auth or rate limit (CRITICAL)
2. SQL injection via `sql.raw()` in `internal-trust.ts:223` (CRITICAL)
3. Zero test coverage on wallet debit, auth, and rate limiting (CRITICAL)
4. Stripe webhook handler not wrapped in DB transaction (HIGH)
5. No global Hono error handler — unhandled exceptions leak stack traces (HIGH)

---

## 1. Silent Catch Audit

**Verdict: PASS — no dangerous silent catches**

114 catch blocks examined. All fall into safe categories:

| Pattern | Count | Risk |
|---------|-------|------|
| Fire-and-forget (`.catch(() => {})`) | 11 | LOW — non-critical side-effects |
| JSON.parse fallback | 6 | SAFE — null checked downstream |
| DNS/optional lookup | 5 | SAFE — returns empty arrays |
| Commented fall-through (`/* fall through */`) | ~40 | SAFE — documented intent |
| Response text extraction (`.text().catch(() => "")`) | ~20 | SAFE — error reporting |
| Properly logged catches | ~30 | N/A |

No action required.

---

## 2. API Key / Secret Exposure Audit

### CRITICAL

| # | File | Line | Issue |
|---|------|------|-------|
| 2.1 | `.claude/settings.local.json` | 69-115 | **Hardcoded API keys in bash permission commands**: 6 `sk_live_*` keys, 1 Railway token, 1 npm token. File is gitignored but should still be rotated. |

### HIGH

| # | File | Line | Issue |
|---|------|------|-------|
| 2.2 | `apps/api/.env.test` | 1 | Hardcoded `ADMIN_SECRET` in test env file |

### MEDIUM

| # | File | Line | Issue |
|---|------|------|-------|
| 2.3 | `apps/api/src/lib/embeddings.ts` | 31, 70 | `VOYAGE_API_KEY` used without startup validation |
| 2.4 | `apps/api/src/lib/stripe.ts` | 7 | `STRIPE_SECRET_KEY` used without startup validation |
| 2.5 | `apps/api/src/lib/webhook.ts` | 19-26 | Webhook URL logged to console on error |
| 2.6 | `packages/mcp-server/src/server.ts` | 15-22 | Env vars used without startup validation |

### Positive

- API key hashing with SHA-256 + prefix lookup: correct (DEC-20)
- `timingSafeEqual` for key comparison: correct
- No API keys returned in HTTP responses

---

## 3. SQL Injection / Input Validation Audit

### CRITICAL

| # | File | Line | Issue |
|---|------|------|-------|
| 3.1 | `routes/internal-trust.ts` | 223 | **SQL injection via `sql.raw()`**: Capability slugs interpolated into `ARRAY[...]` with string concatenation. Although slugs originate from DB, the pattern is unsafe. Fix: use parameterized array `${capSlugs}::text[]`. |

### HIGH

| # | File | Line | Issue |
|---|------|------|-------|
| 3.2 | `routes/auth.ts` | 20 | **Weak email validation**: only checks for `@` character. Allows `@x`, `a@`, spaces. Use proper regex. |

### MEDIUM

| # | File | Line | Issue |
|---|------|------|-------|
| 3.3 | `routes/demand-signals.ts` | 28-43 | Category query param used in SQL fragment without format validation |
| 3.4 | `routes/auth.ts` | 30-31 | No max-length validation on `name` field |
| 3.5 | `routes/internal-tests.ts` | 145 | Slug param not validated against `^[a-z0-9-]+$` |
| 3.6 | `lib/rate-limit.ts` | 92-95 | `X-Forwarded-For` not validated — rate limit bypass possible |

### LOW

| # | File | Line | Issue |
|---|------|------|-------|
| 3.7 | `routes/transactions.ts` | 42 | Transaction ID format not validated before query |

---

## 4. Rate Limiting Coverage Audit

### CRITICAL

| # | File | Route | Issue |
|---|------|-------|-------|
| 4.1 | `routes/internal-tests.ts` | `POST /v1/internal/tests/run` | **No auth AND no rate limit** on endpoint that triggers expensive test execution. Anyone can hammer this. |

### HIGH

| # | File | Route | Issue |
|---|------|-------|-------|
| 4.2 | `routes/admin.ts` | `GET /v1/admin/stats` | Protected by ADMIN_SECRET header only, no rate limiting. Runs 6 parallel DB queries per request. |

### MEDIUM

| # | File | Issue |
|---|------|-------|
| 4.3 | N/A | **DEC-21 spend cap not implemented**: €100/hour per-key spend rate limiting is mentioned in DEC-21 but not coded. Only request-count limiting exists. |

### Coverage Summary

| Status | Count | Routes |
|--------|-------|--------|
| Rate-limited | 14 | `/v1/do`, `/v1/auth/*`, `/v1/wallet/*`, `/v1/suggest/*`, `/v1/transactions/*`, `/v1/demand-signals*` |
| Unprotected (public, low risk) | 18 | `/v1/capabilities*`, `/v1/solutions*`, `/v1/internal/quality*`, `/v1/internal/trust*`, `/.well-known/*`, `/mcp`, `/a2a` |
| Unprotected (dangerous) | 2 | `/v1/internal/tests/run`, `/v1/admin/stats` |

---

## 5. Error Handling Audit

### HIGH

| # | File | Line | Issue |
|---|------|------|-------|
| 5.1 | `routes/wallet.ts` | 42 | **Stripe `checkout.sessions.create()` has no try-catch** — API/network error returns raw exception to client |
| 5.2 | `routes/solutions.ts` | 37-56 | **`Promise.all()` with no try-catch** — single DB query failure crashes entire list endpoint |

### MEDIUM

| # | File | Line | Issue |
|---|------|------|-------|
| 5.3 | `app.ts` | — | **No global Hono `.onError()` handler** — unhandled route exceptions leak stack traces |
| 5.4 | `lib/middleware.ts` | 35-38 | Auth DB lookup has no try-catch — DB connection failure crashes all auth'd routes |
| 5.5 | `routes/do.ts` | 368-669 | 6× `.catch(() => {})` on circuit breaker / quality recording — failures invisible |
| 5.6 | `index.ts` | — | No `process.on('unhandledRejection')` handler |

---

## 6. Type Safety Audit

**Verdict: Mostly clean**

| Pattern | Count | Risk |
|---------|-------|------|
| `as any` | 51+ across 42 files | LOW — mostly justified for DB results and external API JSON |
| `as unknown` | 7 across 5 files | LOW — type narrowing |
| `@ts-ignore` / `@ts-expect-error` | 0 | N/A |
| Non-null assertions (`!`) | 1 | LOW |

### MEDIUM

| # | File | Line | Issue |
|---|------|------|-------|
| 6.1 | `capabilities/email-validate.ts` | 5-8, 36 | Unnecessary double-cast `as unknown as ...` for DNS binding — dead code since `dns/promises` is used on line 40 |
| 6.2 | `capabilities/marketplace-fee-calculate.ts` | 245 | Unnecessary `as unknown as Record<string, unknown>` — result already typed |

### LOW

| # | File | Line | Issue |
|---|------|------|-------|
| 6.3 | `capabilities/sanctions-check.ts` | 29 | `as any` for deep property mutation — define a type instead |

---

## 7. Dead Code / Unused Exports Audit

### HIGH

| # | File | Lines | Issue |
|---|------|-------|-------|
| 7.1 | `lib/embeddings.ts` | 30-124 | **Entire module unused**: `embedQuery()`, `embedDocuments()`, `cosineSimilarity()` are exported but never called. Imported in `suggest.ts` but invocations were removed when switching to keyword matching. |
| 7.1b | `lib/suggest.ts` | 9 | Dead import: `import { embedQuery, embedDocuments, cosineSimilarity } from "./embeddings.js"` |

### LOW

| # | File | Line | Issue |
|---|------|-------|-------|
| 7.2 | `lib/suggest.ts` | 282 | TODO comment: "batch trust data queries" — document as optimization candidate |

No commented-out code blocks (>3 lines) found. No deprecated endpoints.

---

## 8. Database Health Audit

### HIGH

| # | File | Line | Issue |
|---|------|------|-------|
| 8.1 | `routes/solutions.ts` | 37-57 | **N+1 query pattern**: loads all solutions, then runs separate query per solution for steps. 50 solutions = 51 queries. Fix: single JOIN or batch query. |
| 8.2 | `drizzle/0000_damp_mastermind.sql` | 79-83 | **Missing CASCADE DELETE**: `failed_requests`, `transactions`, `wallet_transactions`, `wallets` all use `ON DELETE no action` for user FK. User deletion leaves orphaned records. |
| 8.3 | `routes/webhook.ts` | 48-80 | **Stripe webhook not in DB transaction**: idempotency check and wallet update are separate queries. Server crash between them could cause duplicate credit. |

### MEDIUM

| # | File | Line | Issue |
|---|------|------|-------|
| 8.4 | `db/schema.ts` | — | Missing explicit index on `transactions.capabilityId` (frequently joined) |
| 8.5 | `drizzle/0006_curly_owl.sql` | 15 | `capability_limitations` has index on `capability_slug` but queries filter by `(capability_slug, active)` — composite index would help |
| 8.6 | `db/index.ts` | 13-14 | **Connection pool not configured**: uses postgres-js defaults (10 max). No `max`, `idle_timeout`, or `statement_timeout` set. |
| 8.7 | `db/index.ts` | — | No query timeout configured — long-running queries can hang indefinitely |

### LOW

| # | File | Line | Issue |
|---|------|------|-------|
| 8.8 | `routes/do.ts` | 376-383 | Raw SQL for milestone count instead of Drizzle query builder (consistency) |
| 8.9 | `routes/wallet.ts` | 96-104 | Selects `wallets.id` but never uses the value |
| 8.10 | `lib/rate-limit.ts` | 15-21 | In-memory rate limit store has no size cap — could grow unbounded under high cardinality |
| 8.11 | `db/schema.ts` | — | Inconsistent NULL defaults across JSONB columns |

### Positive

- SELECT FOR UPDATE locking on wallet debits: correct (DEC-8)
- Sync execution wrapped in `db.transaction()`: correct
- `solution_steps`, `transactionQuality`, `testResults` all use CASCADE: correct
- Idempotency key with partial unique index: correct (DEC-9)

---

## 9. Capability Dependency Health Audit

**Verdict: PASS — all external calls have timeouts**

| Check | Result |
|-------|--------|
| Timeout on all fetch() calls | 84/84 capabilities with external calls have `AbortSignal.timeout()` |
| Paid API key validation | All checked at request time (Serper, AviationStack, Companies House) |
| Fallback mechanisms | EORI, flight-status, job-board-search have graceful fallbacks |
| Browserless dual timeout | 35s outer + 25s inner: correct |

### LOW (Monitor)

| # | Capability | Issue |
|---|------------|-------|
| 9.1 | `swedish-company-data` | 3-operation chain can take ~100s worst case (org resolution → search → scrape). Under DEC-22 async threshold but tight. |
| 9.2 | `exchange-rate` | ECB SDW API is **geo-restricted** — may fail from Railway US East. Needs production verification. |

---

## 10. Test Coverage Audit

### CRITICAL

| # | Issue |
|---|-------|
| 10.1 | **Effectively zero test coverage** across the entire production codebase. Only 4 integration tests exist (Semantic Kernel plugin, skipped without API key). No unit tests for any route, middleware, or library. |

### Coverage by area

| Area | Files | Lines (est.) | Tests | Coverage |
|------|-------|-------------|-------|----------|
| Route handlers | 16 | ~1200 | 0 | 0% |
| Wallet logic | 2 | ~150 | 0 | 0% |
| Auth + middleware | 2 | ~150 | 0 | 0% |
| Rate limiting | 1 | ~112 | 0 | 0% |
| Quality capture/aggregation | 2 | ~330 | 0 | 0% |
| Capabilities | 233 | ~10,000+ | 0 | 0% |
| Circuit breaker | 1 | ~120 | 0 | 0% |
| TypeScript SDK | 4 | ~400 | 0 | 0% |
| Matching / suggest | 3 | ~500 | 0 | 0% |

### Untested critical decisions

| Decision | Code Location | Test Status |
|----------|--------------|-------------|
| DEC-8: SELECT FOR UPDATE locking | `routes/do.ts` | **UNTESTED** |
| DEC-14: Lock → execute → debit | `routes/do.ts` | **UNTESTED** |
| DEC-21: 10 req/sec rate limit | `lib/rate-limit.ts` | **UNTESTED** |
| DEC-22: Sync/async threshold | `routes/do.ts:204` | **UNTESTED** |

### Recommended test priority

1. **Week 1**: Wallet debit (concurrent locking), auth middleware, rate limiting
2. **Week 2**: POST /v1/do route, circuit breaker state machine, SDK client
3. **Week 3**: Quality capture/aggregation, Stripe webhook, matching engine

---

## Action Priority Matrix

### Fix before first real user (CRITICAL + HIGH)

| # | Finding | Category | Effort |
|---|---------|----------|--------|
| 4.1 | Add auth + rate limit to `/v1/internal/tests/run` | Rate limiting | 15 min |
| 3.1 | Fix `sql.raw()` injection in `internal-trust.ts:223` | Security | 15 min |
| 5.3 | Add global Hono `.onError()` handler | Error handling | 30 min |
| 8.3 | Wrap Stripe webhook in DB transaction | Database | 30 min |
| 5.1 | Add try-catch to Stripe checkout in `wallet.ts` | Error handling | 15 min |
| 5.2 | Add try-catch to `Promise.all` in `solutions.ts` | Error handling | 15 min |
| 4.2 | Add rate limit to `/v1/admin/stats` | Rate limiting | 5 min |
| 3.2 | Fix email validation regex in `auth.ts` | Input validation | 10 min |
| 8.1 | Fix N+1 query in solutions list | Database | 30 min |
| 7.1 | Remove dead embeddings imports/exports | Dead code | 10 min |

### Fix before scaling (MEDIUM)

| # | Finding | Category | Effort |
|---|---------|----------|--------|
| 8.6 | Configure connection pool (max, idle_timeout) | Database | 10 min |
| 8.7 | Add query statement_timeout | Database | 5 min |
| 5.4 | Add try-catch to auth middleware DB lookup | Error handling | 10 min |
| 3.6 | Validate X-Forwarded-For in rate limiter | Input validation | 20 min |
| 4.3 | Implement DEC-21 spend cap (€100/hr) | Rate limiting | 2 hr |
| 8.2 | Add CASCADE DELETE on user FKs | Database | Migration |
| 5.6 | Add `process.on('unhandledRejection')` handler | Error handling | 5 min |
| 10.1 | Start test suite (wallet, auth, rate limit) | Testing | Days |

---

*Report generated by Claude Code backend audit, 2026-03-04*
