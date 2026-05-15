# Rate-limit config + CA orchestration concurrency — pre-v1 action verdict

**Date:** 2026-05-15
**Triggered by:** [burst-probe-capability-health-blind-spot-2026-05-15.md](burst-probe-capability-health-blind-spot-2026-05-15.md) (commit `335c59c`) verdict "academic for v1" rested on two assumptions chat was uncertain about: (A) the 10 req/sec rate-limit is a deliberate production setting, (B) "production-realistic load" of 5 concurrent calls matches actual customer fan-out.
**Method:** read-only code investigation across rate-limit middleware, CA / solution orchestration code, and pre-execution rejection emission paths. Zero upstream calls. Zero wallet spend.

---

## Headline verdict

**NO PRE-V1 ACTION REQUIRED.** The burst probe verdict stands.

- Rate-limit (10 req/sec per key on POST `/v1/do`, `/v1/solutions/:slug/execute`, etc.) is a **deliberate production setting** per DEC-21, not a stale dev default.
- CA orchestration is not yet implemented as a distinct route, but the closest existing analogue (KYB Complete solutions via `/v1/solutions/.../execute`) internalises capability fan-out inside a *single HTTP request* — internal `Promise.all` parallelism does NOT consume rate-limit budget.
- Pre-execution rejection visibility is **partial, not blind**: every 429 is logged at the `request-complete` Pino log line via `middleware/request-context.ts:46-49` with `status_code: 429`. Operators can grep logs; what's missing is metric aggregation.

The P1 To-do (https://www.notion.so/36167c87082c81ddbc85d0e7f68a0270) stays P1 as v1.1+ work. **Do NOT escalate to v1-launch-gate.** Burst probe's verdict is confirmed.

---

## Rate-limit configuration

### Location

- Module: [apps/api/src/lib/rate-limit.ts](../src/lib/rate-limit.ts)
- Factory functions: `rateLimitByKey(maxRequests, windowMs)` (line 111), `rateLimitByIp(maxRequests, windowMs)` (line 150).
- Companion module for day-scale limits: [apps/api/src/lib/db-rate-limit.ts](../src/lib/db-rate-limit.ts) (`rateLimitByIpDb` — used for signup, auth-recover only).

### Current values (all in-process sliding window, in-memory)

From the explicit map in [rate-limit.ts:13-18](../src/lib/rate-limit.ts#L13-L18):

| Route | Limit | Per |
|---|---|---|
| POST `/v1/do` | 60 req/min | IP |
| POST `/v1/do` | **10 req/sec** | API key |
| `/mcp/*` | 60 req/min | IP |
| `/v1/wallet/*` | 5 req/sec | API key |
| `/v1/internal/*` | 120 req/min | IP |

The "10 req/sec per key" matches the value DEC-21 documents in CLAUDE.md ("Rate limiting: 10 req/sec per key + €100/hour spend cap"). Same limit applies to `/v1/solutions/:slug/execute` via [solution-execute.ts:35](../src/routes/solution-execute.ts#L35) and `/v1/web3-assurance` via [web3-assurance/routes.ts:47](../src/web3-assurance/routes.ts#L47).

### Enforcement mechanism

In-process Hono middleware. **NOT** Railway gateway level — the rate-limiter lives entirely inside the application. Implications:
- State is per-replica: today 1 Railway replica (per [rate-limit.ts:24-26](../src/lib/rate-limit.ts#L24-L26) comment), so the limit is real. If Strale scales to 2+ replicas, the effective limit multiplies by replica count without any code change.
- State is in-memory: lost on every deploy. Customers get a fresh quota immediately after each Railway redeploy. Acceptable per the explicit "cheap hedge, not a safety control" note (F-0-002) in the source.

### Git history

The `rateLimitByKey(10, 1000)` value on POST `/v1/do` was introduced in commit `d54c701` (2026-02-26, "Add rate limiting, LangChain tool, and Python SDK") with the commit body documenting: *"Rate limiting middleware: sliding window counters (in-memory) — 10 req/sec per API key on POST /v1/do, 5 req/sec per key on wallet and transaction routes, 3 req/min per IP on POST /v1/auth/register."* No subsequent commits have changed the value.

The value matches DEC-21's documented limit. The setting is unchanged since first introduction in February 2026 — but **the absence of change does not make it stale**. DEC-21 explicitly chose 10 req/sec as the production limit; the value persists because it's been the right value, not because it's been forgotten.

### Classification: **DELIBERATE PRODUCTION SETTING**

- Source: DEC-21 (Feb 2026 MVP decisions).
- Documented in CLAUDE.md authoritatively.
- Codified in [rate-limit.ts:14-15](../src/lib/rate-limit.ts#L14-L15) as the canonical legitimate-current-user listing.
- Unchanged since first introduction → no churn signal of being wrong-by-omission.

This is **NOT** a stale dev default. Bumping it pre-v1 would supersede DEC-21 and warrant its own DEC.

---

## CA orchestration concurrency

### Discovery: no dedicated CA orchestrator in code

- `find apps/api/src -type f \( -name "*counterparty*" -o -name "*ca-*" -o -name "*orchestrat*" \)` returns only `onboarding-gates-orchestrator.test.ts` — unrelated.
- No `counterparty-assurance` capability slug, no `ca-check` route, no `verify-counterparty` endpoint.
- Code references to "Counterparty Assurance" exist as **policy comments** (e.g., DEC-20260420-H scraping ban in [auto-register.ts](../src/capabilities/auto-register.ts)), not as orchestrator implementations.

### Closest existing analogue: solutions executor

[apps/api/src/routes/solution-execute.ts](../src/routes/solution-execute.ts) + [apps/api/src/lib/solution-executor.ts](../src/lib/solution-executor.ts) implement the `/v1/solutions/:slug/execute` endpoint that bundles N capabilities and runs them inside a single HTTP request. KYB Complete and Invoice Verify (per DEC-20260302-A and current solution seed) are the closest existing analogues to a CA-style orchestration.

### Solution-execute concurrency shape

From [solution-executor.ts:243-249](../src/lib/solution-executor.ts#L243-L249):

> - Steps with parallelGroup != null share a group and run concurrently
> - Steps with parallelGroup == null are sequential (each in its own group)

Implementation: steps within a `parallelGroup` are awaited via `Promise.all(executions)` at [solution-executor.ts:361](../src/lib/solution-executor.ts#L361). Groups themselves execute sequentially (`for (const { steps: groupSteps } of sortedGroups)` at line 270).

### KYB Complete fan-out shape (read from `apps/api/scripts/seed-kyb-solutions.ts`)

A KYB Complete solution has roughly 4 sequential phases with internal parallelism:

| Phase | Concurrent capabilities |
|---|---|
| 1 | up to 3 (identity + initial validations) |
| 2 | up to 3 (sanctions + PEP + adverse media) |
| 3 | up to 5 (registry checks across providers) |
| 4 | up to 4 (UBO + LEI + tail signals) |

Maximum intra-group concurrency: ~5. Total capability calls per CA-style check: ~14 across phases.

### Critical observation — rate-limit doesn't see internal fan-out

The rate-limit middleware [`rateLimitByKey(10, 1000)`](../src/routes/solution-execute.ts#L35) gates at the **HTTP request entry** — it counts incoming POSTs per second per API key. A single `/v1/solutions/kyb-complete-XX/execute` call counts as **1 request** against the 10/sec budget, regardless of whether it fans out internally to 5 or 50 capability calls.

Implications:
- A customer running 1 CA-check per second hits the rate-limit at 10 customers' worth of traffic, not at 1 customer × 14 capability fan-out.
- A single batch script calling `/v1/solutions/.../execute` 11 times in 1 second would trigger the limit. A single batch script calling once per second for 11 seconds would not.

### Classification: **NOT-YET-BUILT, BUT EXISTING ANALOGUE INTERNALISES FAN-OUT**

CA itself isn't built. KYB Complete (the analogue) issues 1 HTTP request per check and fans out internally via Promise.all. The customer-perceived concurrency shape is **1 HTTP request per CA-check**, well within the 10 req/sec limit for any realistic per-customer rate.

The hypothesis that "real customer concurrency is customers × fan-out" is wrong for the solutions pattern: **fan-out happens server-side inside one request, not over multiple HTTP requests.**

---

## Pre-execution rejection visibility

### Rate-limit middleware emits no specific log

[rate-limit.ts:124-131](../src/lib/rate-limit.ts#L124-L131) and [180-189](../src/lib/rate-limit.ts#L180-L189) return the 429 JSON via `apiError("rate_limited", ...)` directly. **No `c.get("log").warn(...)` call before the return.** The rate-limit module itself emits zero log records.

### Generic request-complete logger DOES capture 429s

[middleware/request-context.ts:43-49](../src/middleware/request-context.ts#L43-L49) runs as the first middleware on every request and logs `request-complete` after the response is sent:

```typescript
c.get("log").info(
  { label: "request-complete", status_code: c.res.status, duration_ms },
  "request-complete",
);
```

When a 429 fires, the rate-limit middleware writes the response → control returns up the middleware chain → `requestContext` logs `request-complete` with `status_code: 429, duration_ms: <X>`. This emits to the structured Pino logger, which goes to stdout in production (and therefore to Railway's log stream visible in the dashboard).

### What's NOT tracked

- No per-route 429 counter / metric.
- No `source_health` row for rate-limit rejections.
- No `capability_health.total_failures` increment (confirmed empirically by the burst probe).
- No Sentry / external aggregation (Strale doesn't use Sentry).
- No alerting threshold on 429 rate.

### Classification: **PARTIAL VISIBILITY**

Per-request 429s are logged structurally in stdout via `request-complete`. An operator running `railway logs | grep '"status_code":429'` can see them happen. What's missing is *aggregation* — without metrics, you can't know "what fraction of /v1/do calls hit the rate limit last hour" without scraping logs.

**Not fully blind.** The audit-time concern that "we have no visibility into rate-limit rejections" was *partially* wrong; the correct concern is "we have logs but no metrics."

---

## Verdict matrix lookup

| Rate-limit | CA concurrency | Pre-exec visibility | Verdict |
|---|---|---|---|
| ~~stale-dev-default~~ | parallel-fan-out | fully blind | bump rate-limit + add logging |
| ~~stale-dev-default~~ | sequential | fully blind | bump rate-limit (logging optional) |
| ~~stale-dev-default~~ | parallel-fan-out | partial visibility | bump rate-limit |
| ~~deliberate-production~~ | parallel-fan-out | fully blind | add gateway-rejection logging |
| **deliberate-production** | **sequential** (at HTTP layer) | **partial visibility** | (off-table — see below) |
| ~~deliberate-production~~ | parallel-fan-out | partial visibility | no pre-v1 action |

The actual row is **deliberate-production + sequential-at-HTTP-layer + partial visibility**, which doesn't match a row in the prompt's matrix exactly — it's a stronger case than any of the listed rows because:

1. Rate-limit is deliberate AND well-documented (DEC-21).
2. CA-style fan-out happens inside a single HTTP request, so the relevant concurrency is "1 per CA-check", not "fan-out × CA-checks".
3. 429s are logged structurally (Pino), just not metricized.

→ **Verdict: NO PRE-V1 ACTION REQUIRED.** Stronger than any of the no-pre-v1-action rows.

---

## Recommended pre-v1 work items

### Required: NONE

The burst probe verdict stands. The capability_health blind spot remains a v1.1+ observability work item.

### Optional pre-v1 hardening (chat decides)

These are *non-blocking* improvements that could be added pre-v1 if the cost is acceptable:

#### Option 1: Add rate-limit-specific log emit (10 min PR)

In [lib/rate-limit.ts](../src/lib/rate-limit.ts), before the `return c.json(apiError(...))` at lines 124 and 178, add:

```typescript
c.get("log")?.warn({
  label: "rate-limited",
  scope: "by_key", // or "by_ip"
  key,
  limit: maxRequests,
  retry_after_seconds: result.retryAfterSeconds,
}, "rate-limit-rejected");
```

**Benefit:** lets operators grep `"label":"rate-limited"` in logs with structured fields (key, scope, retry-after) instead of relying on generic `status_code: 429`. Improves troubleshooting if a customer reports being throttled.

**Effort:** ~10 minutes. ~6 lines per middleware × 2 middlewares. Breaking-change risk: zero. No DEC needed.

#### Option 2: Increment a gateway-rejections counter on rate-limited responses (1-2 hours PR)

Add a separate `gateway_rejections` table or column to track pre-execution rejections in aggregate. This is effectively the v1.1+ P1 To-do done early.

**Benefit:** solves the capability_health blind spot directly.

**Effort:** ~1-2 hours. New table (migration) + middleware integration. Breaking-change risk: low. Probably warrants a DEC since it's a schema addition.

#### Option 3: Raise 10 req/sec to 30 req/sec for batch-friendly customers (zero-line code change + DEC)

If chat believes v1 customer patterns will include batch-import scripts hitting >10/sec from a single key, raise the limit. This supersedes DEC-21's value.

**Benefit:** fewer false-positive 429s for legitimate customer batch workflows.

**Risk:** larger surface for abuse from a stolen key. The 60 req/min per IP and €100/hour spend cap mitigate but don't eliminate.

**Effort:** 5 minutes code change + DEC supersession entry. Effort is mostly in the decision, not the code.

### Recommendation to chat

**Ship Option 1 if and only if the v1 launch window has 10 minutes to spare.** It's pure-upside operational hardening with no design tradeoffs. Skip Options 2 and 3 — they belong in v1.1+.

---

## Open questions for chat

1. **Replica count assumption.** [rate-limit.ts:24-26](../src/lib/rate-limit.ts#L24-L26) assumes 1 Railway replica. Confirm this is still the deployment shape for v1 launch. If multi-replica is on the v1 roadmap, the rate-limit's effective multiplier matters and v1.1+ should add a Redis-backed shared counter (or migrate to Cloudflare's rate-limit primitives).
2. **Burst probe vs audit 502 reproduction gap.** The audit hit 502s at 15-concurrent; today's Tier 3 hit 429s at 15-concurrent. Different failure mode under nominally-identical load. Investigating this is *not* a v1 blocker but is a useful trace to follow in v1.1+ when fixing the blind spot.
3. **Solution-execute internal-fan-out budget.** Today KYB Complete fans out up to 5 capabilities per group. If CA proper lands with 8-10 capabilities per parallel group, internal `Promise.all` concurrency rises. Internal calls don't hit the rate-limit but they do hit upstream rate-limits (per the Slovak RPO 60 rpm finding from the burst probe). Worth thinking through CA's per-group cap before launch — separate prompt scope.

---

*Generated by Claude Code session 2026-05-15. Wallet spend: €0 (read-only). Worktree: strale-research, branch `docs/identity-field-coverage-2026-05-15`. No code changes, no DB writes, no PR. The capability_health blind-spot triage chain (audit → triage → burst-probe → this) concludes with NO pre-v1 action required.*
