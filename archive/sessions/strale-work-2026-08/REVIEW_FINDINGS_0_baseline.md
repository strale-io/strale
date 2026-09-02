# Strale Code Review — Session 0: Baseline sweep

## 1. Architecture summary

Strale is a single-service TypeScript monorepo: one Node/Hono API (`apps/api`) plus published client packages (`packages/*`: MCP server, TS/Python SDKs, LangChain/CrewAI/SK/Composio adapters). The API is the whole backend — capability registry, execution, wallet, compliance audit, test orchestration, admin dashboards, MCP HTTP transport, A2A, and x402 USDC gateway all live in one Hono app wired up in [apps/api/src/app.ts](apps/api/src/app.ts). Capability executors (~303 files) live under `apps/api/src/capabilities/` and are auto-registered from disk at startup by [auto-register.ts](apps/api/src/capabilities/auto-register.ts). PostgreSQL is accessed via Drizzle from a shared singleton in [apps/api/src/db/index.ts](apps/api/src/db/index.ts). Persistent state: users/wallets/transactions, capabilities, test_suites/test_results, capability_health, sqs_daily_snapshot, plus audit tables.

```
                          ┌────────────────────────────┐
  HTTP /v1/do ────────────▶  doRoute (2,161 LOC)       │──┐
  HTTP /mcp   ────────────▶  mcpRoute (stateless)       │  │
  HTTP /x402/:slug ───────▶  x402GatewayV2 (816 LOC)    │──┼──▶ getExecutor(slug)
  HTTP /a2a   ────────────▶  a2aRoute                   │  │      │
  HTTP /webhooks/stripe ──▶  webhookRoute               │  │      ▼
  HTTP /v1/solutions/...──▶  solutionExecuteRoute       │  │   capability function
  HTTP /v1/internal/...  ─▶  internalTests/health/trust │──┘   (./capabilities/<slug>.ts)
                          └────────────────────────────┘        │
                                                                ▼
                                                   fetch / Browserless / Anthropic /
                                                   Postgres / DNS / Serper / etc.

  Background jobs (started from index.ts):
    test-scheduler  invariant-checker  activation-drip  db-retention

  Cross-cutting: rate-limit (in-memory), free-tier DB counter in do.ts,
  circuit-breaker (DB-backed), SQS (dual-profile), audit/integrity-hash,
  provenance-builder, sanitize, x402-gateway, retry, schema-validator.
```

## 2. Assumptions made

- This is a breadth sweep. I did not run the app, the tests, or any SQL against a live DB.
- I reviewed the API only. The published client packages (`packages/*`) and `strale-frontend` (different repo) were sampled only where cross-referenced from the API.
- I only spot-sampled capability executors (~10 of 303). Findings that speak to "most capabilities" are pattern claims, not exhaustive inventories.
- The capability/solution onboarding engine, test-creation, test-runner, and auto-remediation subsystems are deferred to Sessions 1–4 per the brief. I logged surface-level red flags with `[DEFER:Sx]` tags and did not read them end-to-end.
- Dockerfile, Railway proxy behavior, and connection limits are taken from comments in code and CLAUDE.md — not verified against deployment config.
- I assumed the `.gitignore` entry `.claude/` means plugin settings are out of scope; I did not open `.claude/settings.*`.

## 3. Findings

### F-0-001: `AUDIT_HMAC_SECRET` falls back to a hardcoded constant

- **Category**: Safety
- **Severity**: Critical
- **Confidence**: High
- **Location**: [apps/api/src/lib/audit-token.ts:3](apps/api/src/lib/audit-token.ts:3), [.env.example](.env.example)
- **What's wrong**: `const AUDIT_SECRET = process.env.AUDIT_HMAC_SECRET || "strale-audit-default-secret";`. If the env var is not set (and it is **not listed in `.env.example`**), HMAC audit tokens are derived from a public, committed constant. Anyone can then forge a valid `/audit/:transactionId?token=...` URL for any transaction ID. Also, `verifyAuditToken` uses `token === expected` (string compare), not `timingSafeEqual`.
- **Why it matters**: Audit URLs are positioned in the product as EU AI Act / GDPR compliance proof (Article 12/15/17 — see `buildFullAudit` in [do.ts:2040–2064](apps/api/src/routes/do.ts:2040)). A forgeable audit URL undermines the whole compliance story. If the env var is missing in production (common with "fall back to default" secrets), this is silent and undetectable from the outside.
- **Reproduction / evidence**: Read the file. Check Railway env var list manually — if `AUDIT_HMAC_SECRET` is unset, the code silently uses the default.
- **Suggested direction**: Fail-fast at startup if the secret is missing. Add to `.env.example`. Use `timingSafeEqual` on the hex digest comparison. Rotate any tokens that were minted under the default secret.
- **Related findings**: F-0-003.

### F-0-002: In-memory rate limiter is the primary path despite CLAUDE.md saying DB Layer B is "the only rate-limit"

- **Category**: Safety
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/src/lib/rate-limit.ts:20-77](apps/api/src/lib/rate-limit.ts:20), [apps/api/src/app.ts:114](apps/api/src/app.ts:114), [apps/api/src/routes/do.ts:347-349](apps/api/src/routes/do.ts:347), [apps/api/src/routes/mcp.ts:214](apps/api/src/routes/mcp.ts:214)
- **What's wrong**: There are two distinct rate-limit paths. The DB-based free-tier daily counter in `do.ts` (line 937) is correctly restart-safe. But the in-memory sliding window in `rate-limit.ts` is applied everywhere — `/v1/do` (`rateLimitByIp(60, 60_000)`), `/v1/internal/*` (120/min), `/mcp` (60/min), `/v1/auth/register` (3/min), `/v1/signup` (1/day), `/v1/wallet/*` (5/sec per key). Its own header comment states the state is **not shared across Railway replicas**. On restart, the window resets — a client can immediately get another full quota. For per-day limits (`/v1/signup`), this is a trivial bypass: force a restart (or a redeploy) and signup again. For short windows it's mostly fine.
- **Why it matters**: The session brief calls out this concern explicitly ("verify it's the only rate-limit path"). It is not. The `1 signup per day per IP` guard on `/v1/signup` — the whole point of the agent self-signup anti-abuse story (DEC-20260410-A) — is defeated by a restart. On multi-replica scale-out, all limits are multiplied by the number of instances.
- **Reproduction / evidence**: Read `rate-limit.ts` comment header; grep shows `rateLimitByIp` and `rateLimitByKey` used across 8+ routes in `app.ts`, `do.ts`, `auth.ts`, `mcp.ts`, `wallet.ts`.
- **Suggested direction**: Move at least the "daily" / "abuse-class" limits (`/v1/signup`, `/v1/auth/register`, `/v1/auth/recover`) to DB-backed counters keyed by ipHash, mirroring the free-tier counter. The short sub-second limits can stay in memory as a cheap hedge, but should not be relied on for safety.
- **Related findings**: F-0-003.

### F-0-003: `/v1/internal/*` routes (1,500+ LOC) have no per-route auth — public by default

- **Category**: Safety
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/src/app.ts:113-114](apps/api/src/app.ts:113), [apps/api/src/routes/internal-tests.ts](apps/api/src/routes/internal-tests.ts), [apps/api/src/routes/internal-health-monitor.ts](apps/api/src/routes/internal-health-monitor.ts), [apps/api/src/routes/internal-trust.ts](apps/api/src/routes/internal-trust.ts)
- **What's wrong**: `/v1/internal/*` has `publicCors` + `rateLimitByIp(120, 60_000)` and nothing else. Individual handlers that run admin-level actions (test runs, migration appliers, script runners) gate themselves with `isValidAdminAuth`, but the majority of GET handlers — `/capabilities/:slug`, `/capabilities/:slug/history`, `/capabilities/:slug/runs`, `/solutions/:slug`, `/dependency-health/*`, `/cost-summary`, `/situations` — have no auth at all. That may be intentional (frontend calls them), but the name "internal" strongly implies otherwise, and it's easy to accidentally add a write handler that doesn't check the secret.
- **Why it matters**: Mixing "public ops dashboard data" and "admin actions" in one route tree without a top-level middleware is a foot-gun. A new handler added to `internal-tests.ts` without an explicit `isValidAdminAuth` check is a trivial admin bypass. Also, `/cost-summary` and `/situations` may leak operational detail an attacker can use for reconnaissance.
- **Reproduction / evidence**: Read `app.ts:113` (no auth middleware on the mount) and grep the three internal-* route files for `isValidAdminAuth` — the check appears on some handlers, not all.
- **Suggested direction**: Split into two routers: `/v1/public/ops/*` (whatever is legitimately public) and `/v1/internal/*` (with an `authMiddleware` or `isValidAdminAuth` equivalent mounted at the top). Or, at minimum, default-deny and allowlist the public GETs.

### F-0-004: Vitest is imported in 5 test files but not installed — tests cannot run

- **Category**: Test coverage
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/lib/free-tier-rate-limit.test.ts:15](apps/api/src/lib/free-tier-rate-limit.test.ts:15), [apps/api/src/lib/entity-validation.test.ts](apps/api/src/lib/entity-validation.test.ts), [apps/api/src/lib/null-field-ratio.test.ts](apps/api/src/lib/null-field-ratio.test.ts), [apps/api/src/lib/solution-executor.test.ts](apps/api/src/lib/solution-executor.test.ts), [apps/api/src/routes/solution-execute.test.ts](apps/api/src/routes/solution-execute.test.ts)
- **What's wrong**: Five files `import { describe, it, expect } from "vitest"`. Neither `apps/api/package.json`, nor the monorepo root, nor any shared package has vitest as a dep. `node_modules/vitest` does not exist. There is no `test` script, no `vitest.config.*`. These files are inert.
- **Why it matters**: ~1,000 lines of tests (~143+255+185+193+250) appear to test the free-tier rate limiter, solution executor, null-field logic, etc. — exactly the load-bearing bits — and none of them actually execute. This is dead test code masquerading as coverage, which is worse than no tests. Contributors may believe behaviour is guarded that isn't.
- **Reproduction / evidence**: `find ... -name "vitest" -type d` returns only `node_modules/.vite/vitest` cache dirs. `grep vitest apps/api/package.json` → no match.
- **Suggested direction**: Install vitest, add `test` script, wire a CI check. Or delete the files and stop pretending. If Session 2/3 will rely on a test harness, this needs fixing in Session 0-adjacent work.

### F-0-005: `do.ts` is a 2,161-line single-route monolith

- **Category**: Resilience
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/routes/do.ts](apps/api/src/routes/do.ts)
- **What's wrong**: The `/v1/do` handler in do.ts contains: request parsing, CORS-class fingerprinting, idempotency lookup, x402 pre-auth, capability matching, platform SQS floor, hourly spend cap, dry-run, circuit breaker check, dual-profile SQS, freshness/latency gates, 4 separate execution paths (free-tier, free-tier authed, sync paid, async paid), audit trail construction, conversion-email side-effects, integrity-hash storage, contextual "upgrade" nudges, and progressive-unlock bookkeeping. It mixes business logic with response shaping and side-effect fan-out across ~30 `fire-and-forget` `.catch(() => {})` call sites (see F-0-009). Any change here has a huge blast radius and the control flow is hard to audit.
- **Why it matters**: This is the single most load-bearing route in the product. Its size and density is now large enough that correctness-critical branches (payment refund, wallet locking, progressive unlock, free-tier counter) are surrounded by unrelated concerns. Bugs in ordering — e.g., recording piggyback data before knowing whether the DB transaction committed — are easy to introduce and hard to spot.
- **Reproduction / evidence**: `wc -l apps/api/src/routes/do.ts` → 2,161. See the inline commentary for examples: line 1,650 has a TODO about partial-success pricing that's been unaddressed long enough to warrant it; line 874 gates x402-paid execution through a `c.set/c.get` string key typed as `any`.
- **Suggested direction**: Split by execution path (`free-tier`, `free-tier-auth`, `sync-paid`, `async-paid`, `x402-paid`) into files under `routes/do/`. Move audit/provenance/integrity into a single `execution-finalizer.ts`. Introduce a typed `ExecutionContext` to replace the string-keyed `c.set("x402_paid", true)` bag.
- **Related findings**: F-0-009.

### F-0-006: SSRF validator is bypassed by `redirect: "follow"` and is vulnerable to DNS rebinding

- **Category**: Safety
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/src/lib/url-validator.ts:56-109](apps/api/src/lib/url-validator.ts:56), [apps/api/src/capabilities/api-health-check.ts:24-42](apps/api/src/capabilities/api-health-check.ts:24), [apps/api/src/capabilities/url-to-markdown.ts:40-51](apps/api/src/capabilities/url-to-markdown.ts:40), [apps/api/src/capabilities/web-extract.ts:4-50](apps/api/src/capabilities/web-extract.ts:4)
- **What's wrong**: `validateUrl()` resolves DNS, checks the IPs, then returns. The caller then does `fetch(url, { redirect: "follow" })`, which (a) does a second DNS resolution that can return a different IP (DNS rebinding / round-robin), and (b) follows redirects to arbitrary targets that were never validated. Also `web-extract.ts` does not call `validateUrl` at all — it just `new URL(url)` + passes to Browserless, so the user-supplied URL is re-fetched from Browserless's own network, which inside Railway can reach internal services (e.g. other Railway services over the private network).
- **Why it matters**: Classic SSRF to cloud metadata (`169.254.169.254`), private ranges (10/8, 172.16/12, 192.168/16), or Railway internal endpoints. The IPv4-mapped IPv6 form `::ffff:10.0.0.1` and the 100.64/10 carrier-grade NAT range are also not on the blocklist. A malicious URL can redirect through a 302 to a metadata endpoint after passing the initial validator.
- **Reproduction / evidence**: Point `api-health-check` at a site you control that 302-redirects to `http://169.254.169.254/latest/meta-data/`. Only the initial hostname is checked.
- **Suggested direction**: Use a custom HTTPS/HTTP agent with a `lookup` hook that re-applies `isBlockedIp` on the resolved address before the connection. Set `redirect: "manual"`, re-validate the `Location` URL, and cap redirects. Extend `isBlockedIp` with `::ffff:`, `100.64/10`, cloud metadata IPv6, and file/gopher schemes. Require all user-URL-accepting capabilities to route through a shared safe-fetch helper.

### F-0-007: SQL string interpolation in `gate4b-solution-dryrun.ts` reintroduces injection risk

- **Category**: Safety
- **Severity**: Medium
- **Confidence**: Medium
- **Location**: [apps/api/src/lib/gate4b-solution-dryrun.ts:141](apps/api/src/lib/gate4b-solution-dryrun.ts:141)
- **What's wrong**: `where(sql\`slug = ANY(${sql.raw(\`ARRAY[${capSlugs.map((s) => \`'${s}'\`).join(",")}]\`)}::text[])\`)`. `capSlugs` is read from `solutionSteps.capabilitySlug` rows, but the value is interpolated into a raw SQL array literal without escaping. An apostrophe in a slug would break out. Drizzle has a safe `inArray` / parameter binding for exactly this pattern.
- **Why it matters**: Defence-in-depth. Currently slugs come from your own DB rows which were inserted via the ORM, so there's no external injection. If tomorrow the onboarding pipeline accepts third-party slugs (the product vision explicitly mentions this), this becomes live. The overall codebase otherwise uses parameter-binding consistently — this is an outlier worth fixing so it doesn't become a pattern.
- **Reproduction / evidence**: Read the line; compare against `inArray(...)` usage in `x402-gateway-v2.ts:92`.
- **Suggested direction**: Replace with `where(inArray(capabilities.slug, capSlugs))`. Audit the rest of the file.

### F-0-008: `execSync` calls `grep` with an interpolated `provider.baseUrl`

- **Category**: Safety
- **Severity**: Low
- **Confidence**: Medium
- **Location**: [apps/api/src/jobs/invariant-checker.ts:810-814](apps/api/src/jobs/invariant-checker.ts:810)
- **What's wrong**: `execSync(\`grep -rl "${provider.baseUrl}" apps/api/src/capabilities/ --include="*.ts" 2>/dev/null || true\`, ...)`. `provider.baseUrl` currently comes from a hardcoded manifest (`getRetiredProviders()`), so no live injection exists. But the shape — interpolating a URL into a shell command — is an anti-pattern, and the same invariant-checker also assumes the process is running inside a git worktree with source files available (it won't be in a packaged Docker image).
- **Why it matters**: Runtime dependency on source filesystem inside a deployed server is fragile. If the manifest ever becomes DB-driven, this becomes a command injection.
- **Reproduction / evidence**: Read the function. In a Dockerfile-based Railway deploy, `apps/api/src/capabilities/` may not be on disk at runtime.
- **Suggested direction**: Run this check in CI instead. If it must run in-process, use `Grep` via a library (ripgrep-via-`child_process.spawn` with `[url]` as an argument array, never string-concatenated).

### F-0-009: "Fire-and-forget `.catch(() => {})`" is a project-wide anti-pattern

- **Category**: Resilience
- **Severity**: High
- **Confidence**: High
- **Location**: ~89 occurrences across 25 files. Worst offenders: [apps/api/src/routes/do.ts](apps/api/src/routes/do.ts) (33), [apps/api/src/routes/auth.ts](apps/api/src/routes/auth.ts) (8), [apps/api/src/routes/admin.ts](apps/api/src/routes/admin.ts) (6), [apps/api/src/lib/test-runner.ts](apps/api/src/lib/test-runner.ts) (9), [apps/api/src/lib/circuit-breaker.ts](apps/api/src/lib/circuit-breaker.ts) (4).
- **What's wrong**: After a user-facing operation completes, the code commonly kicks off follow-up work (circuit breaker write, quality capture, piggyback, integrity hash, conversion emails, activation hook, webhook, milestone counter) with `.catch(() => {})`. Errors from any of these are silently swallowed — no log, no metric, no alert. Integrity hashing (compliance-critical) is in this bucket ([do.ts:1100, 1160, 1259, 1316, 1605, 1860, 1927](apps/api/src/routes/do.ts:1100)).
- **Why it matters**: The things being silenced are exactly the ones Strale sells — EU AI Act audit trail, transaction integrity hash, circuit breaker accuracy, quality signal capture for SQS. If `storeIntegrityHash` starts failing (DB column missing, postgres timeout), nobody finds out until a regulator asks. Also makes debugging near-impossible: a partial-state transaction looks fine until you realise half its audit fan-out was silently dropped.
- **Reproduction / evidence**: `grep -c '\.catch(() => {})' apps/api/src/routes/do.ts` → 33. Every one of these drops the error.
- **Suggested direction**: Introduce a `fireAndForget(fn, { label })` helper that logs structured errors (slug, transactionId, label) to stderr/Sentry. Forbid bare `.catch(() => {})` in `do.ts` via an ESLint rule. Integrity hashing in particular should be synchronous enough to surface — or should write a `status=pending_hash` row and let a retrying worker fix it.
- **Related findings**: F-0-005.

### F-0-010: N+1 query pattern in `/v1/internal/tests/solutions/:slug`

- **Category**: Resource efficiency
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/routes/internal-tests.ts:383-419](apps/api/src/routes/internal-tests.ts:383)
- **What's wrong**: For each solution step, one `testSuites` query; for each suite, one query for the latest result. A solution with 12 steps and ~7 test types per step ⇒ `1 + 12 + (12 × 7) = 97` queries per request. The endpoint has no auth and is mounted under `/v1/internal/*` which caps at 120 req/min per IP, so a single attacker can drive ~11.6k DB queries/min on this one endpoint. `/capabilities/:slug` ([line 117](apps/api/src/routes/internal-tests.ts:117)) has a milder variant of the same pattern.
- **Why it matters**: Postgres pool is `max: 30` per instance ([db/index.ts:13](apps/api/src/db/index.ts:13)). A handful of concurrent pathological requests saturate the pool and stall the rest of the app (the same pool is used for `/v1/do`). Also the N+1 is all `ORDER BY ... LIMIT 1` in hot tables — latency compounds.
- **Reproduction / evidence**: Read the function. Count steps in `kyb-complete-se` (look up via `/v1/solutions/kyb-complete-se`).
- **Suggested direction**: Replace with a single aggregated query using `DISTINCT ON (test_suite_id) ... ORDER BY test_suite_id, executed_at DESC` or a LATERAL subquery. The `getCached` 5-minute cache partially hides this, but only after first hit.

### F-0-011: Circuit breaker state transitions are not atomic

- **Category**: Bug
- **Severity**: Low
- **Confidence**: Medium
- **Location**: [apps/api/src/lib/circuit-breaker.ts:32-75](apps/api/src/lib/circuit-breaker.ts:32), [apps/api/src/lib/circuit-breaker.ts:166-279](apps/api/src/lib/circuit-breaker.ts:166)
- **What's wrong**: `checkCircuitBreaker`, `recordSuccess`, and `recordFailure` all do read-then-write on `capability_health` without a DB transaction or `SELECT ... FOR UPDATE`. Two concurrent `checkCircuitBreaker` calls racing can both see `state=open` past `nextRetryAt`, both transition to `half_open`, and both return `allowed=true`. Similarly, `recordFailure` can race and double-count `consecutiveFailures` or miss an increment.
- **Why it matters**: Not catastrophic — worst case, a couple of extra probes slip through while the service is down. But the logic's design intent (one probe in half-open) is violated, and SQS scoring downstream treats `consecutiveFailures` as authoritative.
- **Reproduction / evidence**: Read the functions. None use `tx =>` or `.for("update")`.
- **Suggested direction**: Wrap each public function in `db.transaction(async (tx) => { ... })` with a `for("update")` on the row. Low-effort; one-paragraph fix.

### F-0-012: `x402-gateway.legacy.ts` and a herd of `db/*` / `scripts/*` scripts are dead

- **Category**: Resource efficiency (maintenance)
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/routes/x402-gateway.legacy.ts](apps/api/src/routes/x402-gateway.legacy.ts) (221 LOC, not imported), [apps/api/src/db/](apps/api/src/db/) (42 files — many one-off `backfill-*.ts`, `fix-low-sqs-*.ts`, `check-geo.ts`, `migrate-geography.ts`, `run-migration-0015.ts`, `rotate-test-key.ts`, `manual-test-rerun.ts`), [apps/api/scripts/](apps/api/scripts/) (58 files — many one-off diag scripts).
- **What's wrong**: A grep for `x402-gateway.legacy` in the source has zero matches. The file just sits there. Similarly, `apps/api/src/db/` contains 20+ scripts that are one-shot backfills (the content of their comments says "one-off", "diagnostic", "fix-missing-latency", etc.). Each one is `getDb()`-importable and runs the full app initialization, which is fine — but the accumulated cognitive load of 100+ scripts is real, and some scripts mutate production data paths.
- **Why it matters**: Mostly maintenance drag, but also: `src/db/topup-test.ts` is a test-account top-up script living next to production DB code. If it's ever accidentally imported or run from an admin tooling script, it mutates state. A one-off script should live under `scripts/` or be deleted after use.
- **Reproduction / evidence**: `grep -l x402-gateway.legacy apps/api/src` → no matches. `ls apps/api/src/db | wc -l` → 42.
- **Suggested direction**: Delete `x402-gateway.legacy.ts`. Audit `src/db/*` for one-off scripts; move surviving ones to `scripts/` (which is already git-tracked) and delete the rest. Keep `schema.ts`, `seed.ts`, `seed-solutions.ts`, `seed-limitations.ts`, `seed-tests.ts`, `index.ts`.

### F-0-013: PII (email addresses) logged at `console.log` level in auth/wallet flows

- **Category**: Safety
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/routes/wallet.ts:25](apps/api/src/routes/wallet.ts:25), [apps/api/src/routes/wallet.ts:69](apps/api/src/routes/wallet.ts:69), [apps/api/src/routes/auth.ts:154](apps/api/src/routes/auth.ts:154), [apps/api/src/routes/auth.ts:174](apps/api/src/routes/auth.ts:174), [apps/api/src/routes/auth.ts:340](apps/api/src/routes/auth.ts:340)
- **What's wrong**: Top-up attempts log `email=${user.email}` in plain text. The recovery endpoint logs `email=${email} user_found=true|false` — which is both PII and a user-enumeration oracle (the log reveals whether an email is registered). `/v1/signup` logs `email` + full client IP. These go to Railway stdout logs, which are retained and may be forwarded to third-party log aggregators.
- **Why it matters**: GDPR Article 5 / 32 requires minimization. The product explicitly markets itself as a GDPR/EU-AI-Act compliance platform. Running `console.log(email)` in a production path is an easy win for an auditor to flag.
- **Reproduction / evidence**: `grep -n 'email=' apps/api/src/routes/{auth,wallet}.ts`.
- **Suggested direction**: Log `user.id` and a hash or bucket of the email domain, not the address. Either drop the recovery log line entirely or log only `user_found` (not the email). Same for `/v1/signup`.

### F-0-014: No structured logger — mix of `console.log`, `console.warn`, `console.error`, and prefixed tags

- **Category**: Resilience
- **Severity**: Low
- **Confidence**: High
- **Location**: 771 `console.*` calls across 104 files.
- **What's wrong**: Log lines are free-form strings with ad-hoc prefixes (`[auto-register]`, `[mcp-http]`, `[topup-attempt]`, `[do]`, `[integrity]`, `[x402]`). There is no correlation ID, no request ID, no severity convention, and no JSON shape. `hono/logger` middleware is also enabled globally in `app.ts:64`, producing a different format.
- **Why it matters**: Not a direct bug, but it means: (a) log search requires guessing prefixes, (b) correlating a single `/v1/do` call across its fan-out of fire-and-forget writes is impossible, (c) moving to any hosted log sink (Datadog, Better Stack, Axiom) requires rework. With F-0-009 it also means most silent failures have no trace.
- **Suggested direction**: Adopt `pino` (fast, structured, Hono-compatible). Attach `request_id`, `user_id`, `capability_slug`, `transaction_id` at context creation time and thread them through. Deprecate `console.*` in code review. Don't do this now — bundle with F-0-009.

### F-0-015: `success_url`/`cancel_url` in Stripe checkout uses `c.req.url.split("/v1")[0]`

- **Category**: Bug
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/routes/wallet.ts:65-66](apps/api/src/routes/wallet.ts:65)
- **What's wrong**: If the request URL ever lacks `/v1` (e.g., misrouted, reverse-proxy rewrites, `.split("/v1")` returns a single-element array), `success_url` becomes `undefined`. Stripe will error. More importantly: this is a brittle way to derive "the API's public base URL" — `FRONTEND_URL` or `API_BASE_URL` (both already present in env) would be the right source. Redirecting to `/v1/wallet/balance` after checkout is also a weird UX — that's a JSON endpoint, not a page.
- **Why it matters**: One oddly-shaped request breaks checkout. Also sends the user to a JSON payload post-payment.
- **Reproduction / evidence**: Read the function.
- **Suggested direction**: Use `process.env.FRONTEND_URL` (or a dedicated `DASHBOARD_URL`). Send the user to an actual dashboard page.

### F-0-016: Stripe top-up has no maximum amount

- **Category**: Bug
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/routes/wallet.ts:28-41](apps/api/src/routes/wallet.ts:28)
- **What's wrong**: Minimum is €10, maximum is unchecked. `amountCents = 1_000_000_000` would happily create a €10M Stripe checkout session. In practice Stripe caps charges, but the fact that there's a spend cap on *debits* (€100/hr) with no cap on *credits* is asymmetric and invites a typo disaster ("I'll add €100, oh wait, I added €10,000").
- **Suggested direction**: Cap at something like €10,000 per session. Flag anomalously large top-ups for manual review.

### F-0-017: A2A / agent-card / welcome / llms-txt / mcp-server-card / ai-catalog = lots of discovery surface; sampled only

- **Category**: (Deferred)
- **Severity**: Unknown
- **Confidence**: Low
- **Location**: `apps/api/src/routes/{a2a,mcp-server-card,ai-catalog,welcome,llms-txt}.ts` (~1,000 LOC combined).
- **What's wrong**: I did not read these end-to-end. A2A is 614 LOC; welcome is 461. They all dynamically render agent discovery metadata and cache it — similar to `x402-gateway-v2.ts` which I did audit. Patterns to re-check in a later session: cache poisoning via Host header, `cf-connecting-ip` trust without a trusted-proxy allowlist, agent-card signing.
- **Suggested direction**: Flag for Session 4 or a dedicated discovery-surface review.

### F-0-018: `hono/logger` middleware plus hand-rolled `console.*` double-logs every request

- **Category**: Resource efficiency
- **Severity**: Low
- **Confidence**: Medium
- **Location**: [apps/api/src/app.ts:64](apps/api/src/app.ts:64)
- **What's wrong**: `app.use("*", logger())` is Hono's default request logger, which prints every request. Individual handlers ALSO log with `console.log("[topup-attempt] ...")` etc. Non-JSON log, duplication, and noise. On a busy API, this adds real stdout volume.
- **Suggested direction**: Pick one (the structured logger from F-0-014) and remove the other.

### F-0-019: Auto-registered capabilities have no ownership over schema registration

- **Category**: (Deferred to S1)
- **Severity**: Unknown
- **Confidence**: Low
- **Location**: [apps/api/src/capabilities/auto-register.ts](apps/api/src/capabilities/auto-register.ts), [apps/api/src/index.ts:10-24](apps/api/src/index.ts:10)
- **What's wrong**: Startup fails if fewer than `MIN_EXPECTED_EXECUTORS = 200` register. Number is hardcoded. Four capabilities are deactivated via an in-code `DEACTIVATED` map. A new capability merged to disk auto-registers at next restart; there is no two-phase gate that prevents code-on-disk from being live in production the moment it deploys — other than what the onboarding pipeline enforces. `[DEFER:S1]`
- **Suggested direction**: Session 1 scope.

### F-0-020: `.catch(() => null)` swallowed in free-tier DB counter hides a real bug class

- **Category**: Bug
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/routes/do.ts:943-971](apps/api/src/routes/do.ts:943)
- **What's wrong**: `getFreeTierUsageToday` wraps two different DB queries in `try { ... } catch { return { count: 0, identifiedBy: "ip" }; }`. If the query fails for any reason (migration missing a column, postgres timeout, a malformed `ipHash`), the counter silently returns 0 — meaning the free-tier limit is effectively disabled for that request. The block that enforces `callsToday >= cap` will never trip.
- **Why it matters**: The DB counter is the primary restart-safe enforcement for free-tier abuse. A DB hiccup converts to "unlimited free tier" instead of "503 / retry". With F-0-002 (in-memory layer is per-instance), an attacker who can trigger DB load (or waits for a normal Railway migration) can call free-tier capabilities without limit.
- **Reproduction / evidence**: Read the function. Any thrown error is caught and returns `{ count: 0 }`.
- **Suggested direction**: Fail closed, not open. Return 503 if the counter query fails. At minimum, log the failure (also addresses F-0-009).

## 4. Patterns

**P1 — Silent fire-and-forget with `.catch(() => {})` is the dominant error-handling pattern.** 89 occurrences. Affects integrity hashing, audit trail writes, circuit breaker, quality capture, piggyback, webhook, conversion emails, and activation hook. See F-0-009, F-0-020.

**P2 — "Fail open" when something is uncertain.** Free-tier DB counter on error → count=0 (F-0-020). Dual-profile SQS compute on error → `pending, skipped` (do.ts:725). Missing `AUDIT_HMAC_SECRET` → falls back to a hardcoded default (F-0-001). The product-shaped intent is "never 500 the user" but the implementation routinely removes a safety check while appearing to work.

**P3 — "Internal" endpoints and routes are public-by-default with handler-level gating.** See F-0-003. This mirrors a broader pattern where access control is decided inside handlers (admin secret check, IP rate-limit check), not at the route mount. Easy to forget.

**P4 — Multi-layer "auth-ish" / rate-limit-ish logic in `/v1/do`.** Line 345–556: IP rate limit → optional auth → key rate limit → x402 pre-auth → free-tier counter → SQS floor → circuit breaker → SQS gate → freshness → max_latency → execute. Any one of these can say no. The layering is correct in intent but the code reads as sequential `if` branches with scattered responsibility. F-0-005.

**P5 — User-supplied URLs go to `fetch()` without consistent SSRF hardening.** Only 17 of 126+ URL-accepting capability files use `validateUrl`. F-0-006.

## 5. What I did not review

- The capability/solution onboarding engine ([lib/capability-onboarding.ts](apps/api/src/lib/capability-onboarding.ts), [lib/onboarding-gates.ts](apps/api/src/lib/onboarding-gates.ts), [scripts/onboard.ts](apps/api/scripts/)). Deferred to Session 1.
- Test creation logic ([lib/test-generation.ts](apps/api/src/lib/test-generation.ts), [lib/test-input-generator.ts](apps/api/src/lib/test-input-generator.ts), [db/generate-*.ts](apps/api/src/db/)). Deferred to Session 2.
- Test execution pipeline ([lib/test-runner.ts](apps/api/src/lib/test-runner.ts) — 2,034 LOC, [jobs/test-scheduler.ts](apps/api/src/jobs/test-scheduler.ts)). Deferred to Session 3.
- Autonomous error-fix intelligence ([lib/auto-remediation.ts](apps/api/src/lib/auto-remediation.ts), [lib/failure-classifier.ts](apps/api/src/lib/failure-classifier.ts), [lib/health-monitor.ts](apps/api/src/lib/health-monitor.ts), [lib/self-heal.ts](apps/api/src/lib/self-heal.ts) — 541 LOC, [lib/situation-assessment.ts](apps/api/src/lib/situation-assessment.ts) — 535 LOC, [lib/intelligent-alerts.ts](apps/api/src/lib/intelligent-alerts.ts), [diagnostics/self-heal-check.ts](apps/api/src/diagnostics/self-heal-check.ts), [jobs/invariant-checker.ts](apps/api/src/jobs/invariant-checker.ts)). Deferred to Session 4.
- The SQS scoring math itself ([lib/sqs.ts](apps/api/src/lib/sqs.ts), [lib/sqs-matrix.ts](apps/api/src/lib/sqs-matrix.ts), [lib/quality-profile.ts](apps/api/src/lib/quality-profile.ts), [lib/reliability-profile.ts](apps/api/src/lib/reliability-profile.ts)). Deferred.
- A2A, agent-card, welcome, llms-txt, mcp-server-card, ai-catalog. F-0-017.
- Discovery routes: I only sampled welcome + llms-txt from the outside.
- Published packages (`packages/mcp-server`, `packages/sdk-typescript`, `packages/langchain-strale`, etc.). Out of scope per brief.
- `strale-frontend` — different repo.
- 293 of 303 capability executor files. I sampled `email-validate`, `dns-lookup`, `url-to-markdown`, `web-extract`, `api-health-check`, `url-validator`, and skimmed a half-dozen others. No per-capability findings beyond the SSRF pattern.
- Drizzle migrations (46 files). Did not verify idempotency or order-sensitivity. Worth a dedicated pass.
- Dependency-freshness audit: I listed deps but did not check a vulnerability database. I deferred this — running `npm audit` against the current `package-lock.json` is the right next step.
- I did not run tests, start the server, or verify any claim via live execution.

## 6. Questions for Petter

1. **F-0-001 (AUDIT_HMAC_SECRET default)** — is the env var set in Railway? If yes, the severity drops to "fix the code so a missing env is fatal." If no, tokens already minted need rotation planning.
2. **F-0-002 (in-memory rate limit)** — do you intentionally rely on the in-memory path for sub-second throttling, or was it meant to be fully DB-backed per CLAUDE.md? The answer changes whether this is a migration or a fix-in-place.
3. **F-0-003 (public `/v1/internal/*`)** — are the GET dashboards (`/capabilities/:slug`, `/solutions/:slug`, `/cost-summary`) *intentionally* public so `strale.dev` can render them without a session, or did they drift public? If public-by-design, the naming is misleading and I'd rename.
4. **F-0-004 (vitest not installed)** — is CI actually running these tests against a separate setup (e.g., GitHub Actions with vitest installed on the fly), or have they been broken long enough that nobody runs them locally either?
5. **F-0-005 (do.ts size)** — is this slated for a refactor, or is the plan to keep one handler? If the latter, I'd argue for a typed `ExecutionContext` + per-path sub-functions at minimum.
6. **F-0-006 (SSRF)** — is there an allowlist of domains that user-URL-accepting capabilities should be restricted to? If yes, that's a simpler fix than per-call validation.
7. **F-0-009 (silent fire-and-forget)** — what's the right observability sink? Sentry, Axiom, Datadog, or just stderr? A lot of hardening follow-ups depend on this answer.
8. **F-0-012 (dead scripts)** — safe to delete `x402-gateway.legacy.ts` and prune `src/db/backfill-*.ts`, or are any of them being invoked from Railway one-off jobs / your local tooling?
9. **Connection pool `max: 30`** — single-instance only, or are you ever running Railway at >1 replica? If yes, the in-memory rate limiter (F-0-002) and circuit-breaker race (F-0-011) both change from "theoretical" to "sometimes hits prod."
