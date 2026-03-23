# Security Audit: Strale API Backend

**Date:** 2026-03-23
**Scope:** Read-only audit of authentication, authorization, input validation, SQL injection, information leakage, secrets, rate limiting, CORS, headers, dependencies, webhooks, and execution security.
**Auditor:** Claude Code (automated)

---

## Findings

| # | Category | Severity | File:Line | Description | Recommendation |
|---|----------|----------|-----------|-------------|----------------|
| S-1 | Info leakage | HIGH | do.ts:700-707,849-858 | Raw error messages from capability execution returned to clients. Can leak provider URLs, internal paths, and infrastructure details (e.g., Browserless endpoint URLs). | Apply `sanitizeFailureReason()` from `lib/sanitize.ts` to all error messages before including in /v1/do responses. The sanitizer already exists and strips URLs/hostnames/stack traces — just not wired to this path. |
| S-2 | Secrets | HIGH | CLAUDE.md (Test Credentials section) | Production API key `sk_live_fd82a5...` committed in CLAUDE.md which is tracked by git. If repo is ever shared/open-sourced, key is compromised. | Rotate the key. Remove from CLAUDE.md. Reference via local env var or untracked file. |
| S-3 | Internal exposure | MEDIUM | internal-tests.ts:648-662 | `/v1/internal/tests/health` exposes which API credentials are configured and which are missing, plus count of affected capabilities. Attacker learns exactly which external providers are in use. No auth required. | Move behind admin auth. Credential status is operational data, not transparency data. |
| S-4 | Internal exposure | MEDIUM | internal-tests.ts:1061+ | `/v1/internal/tests/cost-summary` exposes test execution cost breakdown. No auth required. | Move behind admin auth. |
| S-5 | Input validation | MEDIUM | do.ts:540-556 | POST /v1/do validates required fields but does not validate input types against capability's `inputSchema.properties`. No prototype pollution protection (`__proto__`, `constructor` keys not stripped). | Validate input types against schema. Strip dangerous keys from user-provided objects. |
| S-6 | Secrets | MEDIUM | apps/api/.env.test:1 | `ADMIN_SECRET` value committed in `.env.test` (tracked by git). If same as production value, this is CRITICAL. | Remove real value. Use placeholder. Add to .gitignore if needed. |
| S-7 | Auth | LOW | auth.ts:42-47 | Email enumeration: `POST /v1/auth/register` returns 409 for existing emails, allowing an attacker to check if an email is registered. | Consider returning 201 with generic message for both new and existing accounts. |
| S-8 | Auth | LOW | reply-webhook.ts:59 | Webhook secret comparison uses `!==` (non-constant-time). Theoretically exploitable for timing attacks, though network noise makes this impractical. | Use `timingSafeEqual` for consistency with admin auth pattern. |
| S-9 | Rate limiting | LOW | auth.ts routes | `POST /v1/auth/api-key` (key regeneration) has no explicit rate limit. Attacker with valid key could rapidly regenerate. | Add rate limit (e.g., 5/min per key). Only affects own account, so impact is low. |
| S-10 | Rate limiting | LOW | lib/rate-limit.ts:8-14 | Rate limits are in-memory (not shared across replicas, lost on restart). Acceptable for single-instance Railway deploy. | Needs Redis-backed rate limiting before horizontal scaling. |
| S-11 | Dependencies | LOW | npm audit | 1 high vulnerability (fast-xml-parser: numeric entity expansion bypass), 6 moderate (langsmith SSRF). | Run `npm audit fix`. fast-xml-parser fix available. langsmith issue is in tracing headers (low risk for this codebase). |
| S-12 | Auth | INFO | lib/auth.ts:1-21 | API keys stored as unsalted SHA-256 hashes. Lookup by key_prefix, verified with `timingSafeEqual`. Sound design — unsalted SHA-256 is acceptable for high-entropy (256-bit) tokens. | No action needed. |
| S-13 | CORS | INFO | app.ts:78-101,107-121 | Split CORS policy: public endpoints (`*`), authenticated endpoints (restricted to strale.dev origins). Server-to-server requests (no Origin header) are allowed — correct for SDK/MCP usage. | No action needed. |
| S-14 | SQL injection | INFO | All routes | All queries use Drizzle ORM with parameterized values. Template literal `sql\`...\`` properly parameterizes interpolated values. No raw string concatenation found. | No action needed. |
| S-15 | Security headers | INFO | app.ts:66-74 | Full set: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS (2 years), Permissions-Policy, CSP (`default-src 'none'`), X-XSS-Protection: 0. | No action needed. |
| S-16 | User scoping | INFO | wallet.ts, transactions.ts | All wallet and transaction queries scoped by `user.id` from auth middleware. No IDOR vulnerabilities. | No action needed. |
| S-17 | Webhooks | INFO | webhook.ts:10-34 | Stripe webhook signature properly verified via `stripe.webhooks.constructEvent()`. Idempotent via `processing_lock` pattern. | No action needed. |
| S-18 | Execution | INFO | 94 capability files | 130 `AbortSignal.timeout()` usages across 94 executor files. Consistent timeout enforcement on external requests. | No action needed. |
| S-19 | SSRF | INFO | capability executors | URLs for external requests are hardcoded per-capability (registry APIs, provider endpoints). User input determines *what* to look up, not *where* to send requests. No user-controllable URL endpoints found. | No action needed. |
| S-20 | Error handling | INFO | app.ts:41-50 | Global error handler logs full stack trace to console but returns generic error to client. Properly implemented. | No action needed. |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 3 |
| LOW | 5 |
| INFO | 10 |

### Top 3 Most Urgent Fixes

1. **S-1 (HIGH): Sanitize error messages in /v1/do responses.** The `sanitizeFailureReason()` function already exists in `lib/sanitize.ts` and is used by the test runner. Just wire it to the execution error path. Estimated effort: 30 minutes.

2. **S-2 (HIGH): Remove API key from CLAUDE.md and rotate.** The key is committed in a tracked file. Rotation is straightforward via `POST /v1/auth/api-key`. Estimated effort: 15 minutes.

3. **S-3 + S-4 (MEDIUM): Move operational internal endpoints behind admin auth.** Specifically `/v1/internal/tests/health` (credential status) and `/v1/internal/tests/cost-summary` (cost data). The admin auth pattern (`isValidAdminAuth()`) is already used by mutation endpoints. Estimated effort: 30 minutes.

### Overall Security Posture

**Good.** The API has solid fundamentals:
- Properly hashed API keys with timing-safe verification
- Parameterized SQL throughout (no injection vectors found)
- Stripe webhook signature verification
- Full security header set including CSP
- User-scoped queries preventing IDOR
- Consistent execution timeouts preventing DoS
- Split CORS policy separating public/authenticated endpoints
- Rate limiting on all user-facing endpoints

The main gaps are operational: raw error message leakage, committed secrets, and a few internal endpoints exposing too much operational data without auth. None of these are actively exploitable for data breach or financial loss — they are information disclosure issues that should be closed before public launch.
