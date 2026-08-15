## Part A — diagnosis

### 1. MCP funnel: the original diagnosis used stale code

The checked-out branch is stale:

- It registers tools without `onFunnelEvent` at [mcp.ts:138](/C:/Users/pette/Projects/strale/apps/api/src/routes/mcp.ts:138).
- Its only MCP discovery write is `/mcp:initialize` at [mcp.ts:245](/C:/Users/pette/Projects/strale/apps/api/src/routes/mcp.ts:245).
- In this checkout, `StraleClientOptions` does not even contain `onFunnelEvent` at [tools.ts:67](/C:/Users/pette/Projects/strale/packages/mcp-server/src/tools.ts:67).

That is not what the repository’s `origin/main` contains:

- `classifyMcpRequest` maps `tools/list` and `tools/call` at `origin/main:apps/api/src/routes/mcp.ts:193-199`.
- The POST handler records that classification at `:337-345`.
- The HTTP transport wires `onFunnelEvent` at `:229-238`.
- The callback is defined at `origin/main:packages/mcp-server/src/tools.ts:82-105`.

Important distinction: `onFunnelEvent` records rejection outcomes. It does not record ordinary `tools/list` or `tools/call`; those come from the separate pre-dispatch `classifyMcpRequest` path.

The only in-repo application source for `/mcp:tools/list` rows is PR #245, commit `d216d63`, committed 2026-08-15 11:13 CEST. That explains rows beginning around 11:00. There is no writer for that literal on the stale branch. Manual SQL or another deployed revision cannot be disproved from source alone.

The live deployment SHA could not be queried from this sandbox. The code already exposes it through `/health` at [app.ts:269](/C:/Users/pette/Projects/strale/apps/api/src/app.ts:269), so production claims should be checked against that SHA, not `origin/main`.

### 2. User-agent substring matching is not a customer classifier

`isProbeAgent` is a heuristic, not a sound population definition: [probe-agents.ts:33](/C:/Users/pette/Projects/strale/apps/api/src/lib/probe-agents.ts:33).

It will produce:

- False positives: legitimate clients containing `probe`, `health`, `registry`, `monitor`, `bot/`, `crawler`, or `scanner`. An actual agent named `company-registry-bot/1.0` is automatically discarded as non-demand.
- False negatives: monitors using `curl`, `undici`, browser UAs, blank UAs, vendor names without those keywords, or deliberately generic identities.
- Cross-step inconsistency: MCP `initialize` replaces the UA with `clientInfo`, while `tools/list` uses the HTTP UA. The same caller can be classified differently between funnel steps.
- SQL/TypeScript disagreement for nulls: TypeScript treats absent UA as “not proven probe” ([probe-agents.ts:40](/C:/Users/pette/Projects/strale/apps/api/src/lib/probe-agents.ts:40)); SQL `NOT (NULL ILIKE ANY(...))` is `NULL`, so the dashboard counts it as neither customer nor probe.
- Category collapse: registry indexers, health monitors, crawlers, and prospective agents are distinct populations. A binary customer/probe split throws away useful distribution evidence.

Use explicit categories—`known_monitor`, `known_indexer`, `customer_candidate`, `unknown`—and keep unknowns out of conversion claims. Known signatures plus behavioral rules are defensible; vocabulary substring matching is not.

### 3. Dashboard audit

The 30-day-as-week error is fixed: current and prior revenue use explicit rolling seven-day windows at [ceo-dashboard.ts:88](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:88). The rest is not clean.

- Payer freshness guard is invalid. `MIN(created_at)` is calculated only among payer-bearing rows inside the requested seven-day window ([ceo-dashboard.ts:109](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:109)). That is the first observed payer in the window, not instrument activation. Sparse traffic makes an old instrument look new; backfill makes a new one look old. `>= 6` days then blesses an incomplete seven-day window ([ceo-dashboard.ts:117](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:117)). It also counts only x402 wallets, yet renders “Paying customers”; authenticated wallet customers are excluded, and one wallet is not necessarily one customer.

- Funnel guard is incomplete. It guards only `initialize` and `tools/list` ([ceo-dashboard.ts:136](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:136)) but renders `tools/call`, rejection, and payment too ([ceo-dashboard.ts:153](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:153), [ceo-dashboard.ts:428](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:428)). The payment row uses a seven-day payer window inside a shorter MCP window.

- It is not a funnel. It aggregates unrelated events, not cohorts. Event counts drive bar widths, while daily-rotating IP hashes are labelled “agents.” The hash deliberately changes each UTC day ([attribution.ts:25](/C:/Users/pette/Projects/strale/apps/api/src/lib/attribution.ts:25)), so a seven-day distinct count is visitor-days, not agents. Repeated `tools/list` calls can also exceed initializes.

- The funnel becomes all-time. `funnelFrom` is the latest first-observed event, with no `max(now()-7d, ...)` cap ([ceo-dashboard.ts:137](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:137)). As it ages, the dashboard header still says “Last 7 days” while the funnel accumulates indefinitely.

- Arrivals and funnel use inconsistent windows. Arrivals are seven days ([ceo-dashboard.ts:158](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:158)); funnel is since its inferred start. They are individually labelled, but the funnel note injects the weekly probe count, and the page presents both under a global seven-day header.

- Budget is not a forecast or actual spend. It is retrospective run count × declared suite cost ([ceo-dashboard.ts:180](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:180)). Settlement cost charges every settlement at `$0.001`, ignores the documented first-1,000/month free tier, and uses a hard-coded `1.09` FX rate ([ceo-dashboard.ts:191](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:191)). It omits invoice-backed subscriptions and production vendor costs, yet renders “spent” and “left.”

Other framing defects:

- “Times sold” includes zero-price completed calls because `topCaps` has no paid-call predicate ([ceo-dashboard.ts:166](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:166)).
- “We could not answer” uses all `failed_requests`, without the external-account filter, and that table omits x402 entirely ([ceo-dashboard.ts:172](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:172); [GOALS.md:46](/C:/Users/pette/Projects/strale/docs/company/GOALS.md:46)).
- “Changes now live” is derived from `git log origin/main`, not deployment state ([ceo-dashboard.ts:243](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:243)).
- Workforce “running” status is parsed from documentation, not scheduler telemetry ([ceo-dashboard.ts:221](/C:/Users/pette/Projects/strale/apps/api/scripts/ceo-dashboard.ts:221)).

### 4. `client_meta` is not captured consistently

Production call sites are:

- `/v1/do`: [do.ts:411](/C:/Users/pette/Projects/strale/apps/api/src/routes/do.ts:411)
- Authenticated solution execution: [solution-execute.ts:145](/C:/Users/pette/Projects/strale/apps/api/src/routes/solution-execute.ts:145)
- x402 solution success, capability failure, capability success: [x402-gateway-v2.ts:1107](/C:/Users/pette/Projects/strale/apps/api/src/routes/x402-gateway-v2.ts:1107), [x402-gateway-v2.ts:1328](/C:/Users/pette/Projects/strale/apps/api/src/routes/x402-gateway-v2.ts:1328), [x402-gateway-v2.ts:1398](/C:/Users/pette/Projects/strale/apps/api/src/routes/x402-gateway-v2.ts:1398)

Gaps:

- A2A proxies to `/v1/do` with only content type and authorization ([a2a.ts:400](/C:/Users/pette/Projects/strale/apps/api/src/routes/a2a.ts:400)). It does not forward UA, IP, referrer, `src`, or an `X-Strale-Client` identity. The resulting metadata describes the internal proxy.
- MCP forwards its rail header and IP, but never supplies `mcpClientInfo` to `extractClientMeta`. That optional field is exercised only by tests; no production call site populates it.
- Test-runner transactions intentionally have no `client_meta` ([test-runner.ts:1336](/C:/Users/pette/Projects/strale/apps/api/src/lib/test-runner.ts:1336)). Therefore the document’s all-transaction “0.2% coverage” denominator is polluted by internal rows and pre-instrumentation history.
- `/v1/web3-assurance` neither writes a transaction nor captures metadata ([routes.ts:47](/C:/Users/pette/Projects/strale/apps/api/src/web3-assurance/routes.ts:47)). If it is considered a commercial rail, it is analytically invisible.
- x402 requests rejected before transaction creation—challenge, invalid input, failed settlement—have no `client_meta` row. That is acceptable for transaction identity, but not for attempted-conversion measurement.

## Part B — design review

The document currently has five open questions, not four.

1. `Measured<T>` should not throw for expected insufficiency, but the proposed shape is unsafe. A mandatory `value` plus `trustworthy: false` still lets callers render the number; lines 42–45 claim an enforcement the type does not provide. Use a discriminated union:

```ts
type Measurement<T> =
  | { status: "observed"; value: T; window: Window; population: PopulationId; instruments: InstrumentEvidence[] }
  | { status: "estimated"; value: T; methodology: string; window: Window; population: PopulationId }
  | { status: "unavailable"; reason: Reason; requestedWindow: Window; availableWindow?: Window };
```

Throw only for operational failures. Make the renderer exhaustively switch on `status`.

2. `MIN(created_at)` is unsound. Store versioned instrumentation metadata with `enabled_at`, `complete_from`, `definition_version`, and deployed commit SHA. Events need separate event time and ingestion time plus a backfill marker. `MIN` may be reported as `first_observed_at`, never as activation.

3. The proposed primary metric is directionally right but incorrectly named and too noisy. Use rolling-28-day distinct external payer identities, split into new and returning; use seven-day new payer activations as the leading indicator. Call them “payer identities,” not customers, until resolution exists. Revenue is secondary; concentration and repeat rate are guardrails.

4. Cheapest privacy-safe identity spine: persist a nullable, versioned `actor_key` at transaction write time:

- authenticated: `user:<internal user UUID>`
- x402: `x402:<keyed hash of chain + normalized payer address>`
- otherwise: `NULL`

Do not create a stable UA/IP fingerprint. It is unnecessary for paying-customer measurement and creates privacy and false-identity problems. Keep `identity_kind`, hash-key version, retention, and deletion behavior explicit.

5. Verify against deployed code, not `origin/main`. `/health` already returns `RAILWAY_GIT_COMMIT_SHA`; obtain that SHA, then inspect `git show <deployed_sha>:<path>`. Refuse a production-code conclusion when the SHA is unavailable. `origin/main` can be ahead of a failed or delayed deployment.

Missing from the design: metric definition/version, population, unit/currency, observation versus estimate, `as_of` freshness, event versus ingestion time, null handling, deployment SHA, retention effects, identity-key versioning, and semantic regression tests using fixtures that reproduce each August 15 failure.

Over-engineered at €48/week: a generic four-file metric framework and dynamic instrument discovery for every number. Build one explicit `business-metrics.ts`, one instrument registry, one actor key, and tests for the five decisions that matter. The capture semantics are the hard part; directory structure and a universal wrapper are not.