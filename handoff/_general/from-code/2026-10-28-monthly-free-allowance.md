Intent: Implement D10's adopted calendar-month free allowance on the existing zero-cost tools; leave the build uncommitted for orchestrator review, deployment and measurement.

Authority: DEC-20261027-B §9 item 5 and distribution strategy §8 D10. This branch is an isolated clone on `feat/monthly-free-allowance`, based on `origin/main` at `939aa422`. No commit, push, PR, package publish, production mutation or branch switch was performed.

## Behaviour

- The sole allowance number is `STATIC_FACTS.free_tier_monthly_limit` in `apps/api/src/lib/platform-facts.ts`. The public endpoint exposes it under `static`. Runtime discovery and OpenAPI descriptions interpolate it; static package/docs surfaces link to that field rather than repeat the number.
- Anonymous calls reserve a monthly counter atomically, then an hourly anti-abuse counter (60/hour, fixed UTC hour), in one transaction. Monthly-row locking serializes reservations for an identity. An hourly refusal rolls back the monthly reservation. Monthly exhaustion takes precedence and returns HTTP 429, `rate_limited`, `window: month`, the canonical limit, next UTC month start as `resets_at`, and `retryable: false`. Signup advice uses `https://strale.dev/signup?src=free-tier-limit`.
- Success headers retain the existing names `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix seconds). Rejections also set `Retry-After`. Hourly rejections describe the anti-abuse guard in their details and headers. Successful anonymous usage now has `calls_this_month`, `monthly_limit`, `resets_at`; the TypeScript SDK wire type matches.
- The identified-IP hash is preferred; the existing fingerprint fallback gets a separate counter namespace with the same limits. Callers with neither identity receive a refusal instead of unlimited access. Existing progressive-unlock routing remains unchanged. No free-tool flags, capability manifests, paid prices, authenticated execution/debit paths or x402 settlement paths changed.
- Counters use the existing `rate_limit_counters` schema; no migration or backfill. Binds are ISO strings, numbers and hashes, never Date/Buffer. The seven-day retention rule now protects current-month `free-tier:month:` rows; previous months are eligible on the next scheduled retention tick. Hourly and other counters retain their existing seven-day cleanup. Cleanup remains bounded by the existing batch and per-rule time budgets. This narrows deletion of newly introduced monthly rows; it does not resume a silent bulk operation or create an old backlog to drain.

## Deploy mechanism and remaining production checks (DEC-20260504-C)

`Dockerfile` builds the MCP package and API, then starts `apps/api/dist/index.js`. Request handling imports the new limiter via `routes/do.ts`. `apps/api/src/index.ts` imports `jobs/db-retention.ts` and calls `startDbRetention()`, which registers `runRetention` with the job scheduler. No new env, schedule or boot migration is required.

After the orchestrator reviews, merges and deploys:

1. Check `/health/version` against the merged SHA.
2. `curl -fsS https://api.strale.io/v1/platform/facts` — confirm `static.free_tier_monthly_limit` equals the source value and the existing free-tool slugs remain unchanged. Pre-deploy read-only GET succeeded: allowance field absent (`null` in the trimmed probe), eleven existing slugs returned. This is the old deployment, not evidence of rollout.
3. Make one anonymous free request with a synthetic input, e.g. `curl -i https://api.strale.io/v1/do?src=free-tier-d10-smoke -H 'Content-Type: application/json' --data '{"capability_slug":"email-validate","inputs":{"email":"demo@example.com"},"max_price_cents":0}'`. Confirm HTTP success, zero price, monthly usage and all three rate-limit headers. The remaining allowance must decline by one. This call was NOT run here because it writes a production transaction.
4. Inspect the next scheduled `db-retention` run. Read-only verification SQL: `SELECT count(*) FROM rate_limit_counters WHERE bucket_key LIKE 'free-tier:month:%' AND window_start < date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';`. After the first cleanup tick of the next month, expired monthly rows should be drained within the existing bounded job. Confirm current-month counters survive after day seven. Do not expose bucket keys/hashes in the public report.
5. Run `cd apps/api && npx tsx scripts/commercial-brief.ts --json` with the approved read-only DB role. Inspect `freeFunnel`. There is no production DB connection in this build environment, so SQL execution and observed funnel figures remain unverified.

## Frontend follow-up (sibling repository out of scope)

Update the sibling `strale-frontend` platform-facts type and `usePlatformFacts()` consumers: pricing/free-tool/try-it copy, onboarding and quota errors, any usage display reading daily fields, documentation, `public/llms.txt` and `public/.well-known/*` discovery files. Runtime components should display `static.free_tier_monthly_limit`; static files should link to the endpoint. Search the sibling for daily-limit wording and `calls_today`/`daily_limit`. No sibling checkout was present, so this is a follow-up inventory, not verified exact file locations.

## D10 measurement and reversal

Record the production rollout date as day zero; do not start the clock at build time. Run the commercial brief weekly. `monthlyFreeFunnel(window)` reports completed anonymous free-tier calls and distinct hashed IPs by UTC month, plus source slices using `transactions.client_meta.src`; `window_totals` deduplicates across months. Never sum distinct-IP source or month slices. No raw IP or hash is returned by the report.

Signup cohorts use `users.signup_src`, the first completed call's `client_meta.src`, `signup_ip_hash` matched to a preceding anonymous call, or the user's first authenticated call. The earliest completed call must be free-tier. Subsequent completed positive-price user transactions count paid conversions, observed through the report window's end. Shared networks, absent hashes, deleted/redacted history and off-account wallet purchases limit attribution; these counts indicate a funnel, not causation. Failed calls are not included. Missing-history bias remains visible as a limitation.

Compare with the strategy's August base: two free callers in ninety days. The success threshold is five times that base (ten callers in a comparable ninety-day window), plus at least two paid conversions. The brief defaults to a rolling ninety-day lookback and labels partial UTC months. At day 45, query the rollout-to-review window: if free callers have not risen above the recorded base, revert D10's allowance and copy together through a reviewed change. Record the result explicitly; do not silently extend the experiment. If rollout happens on this handoff's date, the review date is 2026-12-12; otherwise calculate rollout date plus 45 days. Keep the same free-tool set and paid-band boundaries during reversal.

## Verification and evidence

Evidence: [test receipt](../../../archive/receipts/2026-10-28-test-run-monthly-free-allowance.json), with [producer-path correction](../../../archive/receipts/2026-10-28-test-run-monthly-free-allowance-provenance-correction.json). The original receipt mistakenly named the workspace-local Vitest binary; npx used the root binary. Results are unchanged and the original immutable receipt is preserved.

| Check | Final result |
|---|---|
| `npm --workspace=packages/mcp-server run build` | Pass |
| `npx tsc --noEmit --project apps/api/tsconfig.json` | Pass |
| `npm --workspace=packages/sdk-typescript run build` | Pass |
| `npm --workspace=packages/sdk-typescript run typecheck` | Pass |
| `npm --workspace=packages/sdk-typescript run test` | Pass; seven SDK tests |
| `cd apps/api && npx vitest run --reporter=json` | Pass; 408 files, 7,544 passed, 358 skipped, zero failures |
| `npm run claims:check` | Pass |
| `npm run models:check` | Pass |
| `npm run env:check` | Pass |
| `npm run docs:check` | Pass |
| `npm run programs:check` | Pass after retaining the tracked research resume pointer; an untracked handoff cannot be a resume target before commit |
| `npm run receipts:check` | Pass, existing bare-count handoff warnings only |
| `npm run migrations:check` | Pass; no migration added |
| `npx tsx apps/api/scripts/check-platform-facts-drift.ts` | Pass offline; sibling frontend unavailable |
| `node apps/api/scripts/check-framework-packages.mjs` | Pass |
| `git diff --check` | Pass |
| `npm run handoff:orient` | Completed at session start |
| `npm run handoff:check` | Expected failure: uncommitted changes, feature-clone layout, no feature upstream, pre-existing merged branches; origin fetch unavailable |

Focused runs exercised every touched API test file through the full suite. Earlier failures were implementation/test-fixture gaps, not flakes: the logger spy initially watched console rather than logError; the hourly-order bug and discovery mocks were fixed. The final full run had no flaky files to rerun. Agent-surface tests were also rerun alone and passed.

Fail-before: used `git show origin/main:<path>` into an in-checkout scratch folder, never stash. An executable probe transpiled the original counter function and anonymous branch; with ten prior calls it returned 429 for the next call where the new monthly policy expects 200. Current runtime tests allow every call through the canonical monthly limit and refuse the next, including when the hourly count is also at its cap. Fake time covers ordinary, leap-February and year-end month boundaries. Scratch source probes also distinguish the new route wiring, fact, retention protection and drift guard from origin/main. A mutation removing the SQL capped-update predicate fails the runtime test's SQL-shape assertion; the original passes. Scratch copies were removed after recording the results.

The receipt carries per-file full-suite outcomes, checks, fail-before details and the trimmed pre-deploy GET output. No production database was available; real Postgres execution of the funnel SQL and counter transaction remains a deployment check, while mocked tests validate binds and SQL structure.

## Review and session limitations

Independent read-only review under `.agents/skills/go/SKILL.md` ran technical and product lenses in two rounds at base `939aa422` over the uncommitted diff. No high-severity findings. SDK field names, stale operating guidance and SQL predicate-test gaps were corrected. Simplification retained two counter reservations in one transaction and the existing retention pipeline; no additional storage abstraction or migration was needed. The standalone simplify skill is not installed.

The orchestrator owns commit/push/PR/merge. The expected uncommitted/unpushed handoff-gate findings do not authorize those actions. No production DB metrics, deployment or package-publication smoke test was attempted. [BACKFILL] Journal entry for this implementation is represented by this handoff; no external workspace message was sent.

## Files changed

- `AGENTS.md`
- `CLAUDE.md`
- `apps/api/scripts/check-platform-facts-drift.ts`
- `apps/api/scripts/commercial-brief.ts`
- `apps/api/src/jobs/db-retention.test.ts`
- `apps/api/src/jobs/db-retention.ts`
- `apps/api/src/lib/actionable-errors-round2.test.ts`
- `apps/api/src/lib/free-tier-allowance.ts`
- `apps/api/src/lib/free-tier-rate-limit.test.ts`
- `apps/api/src/lib/metrics/commercial.ts`
- `apps/api/src/lib/metrics/monthly-free-funnel.test.ts`
- `apps/api/src/lib/platform-facts-live.test.ts`
- `apps/api/src/lib/platform-facts.ts`
- `apps/api/src/lib/rate-limit.ts`
- `apps/api/src/openapi.ts`
- `apps/api/src/routes/agent-surfaces.test.ts`
- `apps/api/src/routes/do.ts`
- `apps/api/src/routes/llms-txt.ts`
- `apps/api/src/routes/public-surface-visibility.test.ts`
- `apps/api/src/routes/skill.ts`
- `archive/receipts/2026-10-28-test-run-monthly-free-allowance-provenance-correction.json`
- `archive/receipts/2026-10-28-test-run-monthly-free-allowance.json`
- `docs/api-quickstart.md`
- `docs/company/claims.yaml`
- `docs/programs/brand-website/SITE-STRUCTURE.md`
- `docs/programs/distribution/tracks.yaml`
- `handoff/_general/from-code/2026-10-28-monthly-free-allowance.md`
- `packages/mcp-server/src/tools.ts`
- `packages/sdk-python/README.md`
- `packages/sdk-typescript/README.md`
- `packages/sdk-typescript/src/types.ts`
- `packages/skill/SKILL.md`

## Orchestrator follow-ups after review

Independent review (real Postgres 16 concurrency: 200 concurrent requests gave exactly 60 passes; 600 across waves gave exactly 300) returned GO. Applied: fingerprint-only callers (no IP from the proxy) share buckets, so they get 30/month and 10/hour instead of the IP allowance; the hourly refusal now carries `retry_after_seconds`; a stale 10/day comment in invocation-facts is corrected. Accepted and recorded for later: the leftmost X-Forwarded-For entry is client-settable (pre-existing CR-19), so the allowance is not abuse-proof until the trusted proxy hop is used; the SDK `usage` field rename is a typed-consumer change to note at the next SDK release.
