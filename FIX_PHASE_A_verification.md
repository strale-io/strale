# Fix Phase A — Verification of production state

**Session intent**: Answer four questions that affect the shape of Session 0 fixes. Investigation only — no code changes.

---

## Q1: Is `AUDIT_HMAC_SECRET` set in production?

**Answer: Unverifiable from code — requires manual check in Railway.**

Evidence:
- Source reference: [apps/api/src/lib/audit-token.ts:3](apps/api/src/lib/audit-token.ts:3) — `const AUDIT_SECRET = process.env.AUDIT_HMAC_SECRET || "strale-audit-default-secret";`
- Documentation reference: [apps/api/railway-config.md:28](apps/api/railway-config.md:28) lists `AUDIT_HMAC_SECRET — Transaction integrity hashing` under "Required env vars" for the `strale` service. This is documentation, not automation.
- Not in `.env.example` (verified — only `DATABASE_URL`, `STRIPE_*`, `ADMIN_SECRET`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `BROWSERLESS_*`, and optional-provider keys are listed).
- No `railway.json` / `railway.toml` / `Procfile` exists at repo root (verified via `find` — only `Dockerfile` is present).
- No `.github/` directory anywhere in the repo tree (searched up to depth 4 under `strale/` and under the worktree — no GitHub Actions, no deploy workflows).
- Nothing else references the variable — grep across the whole worktree finds only the source file, the railway-config.md documentation entry, and our prior findings report.

**Steps for Petter to verify manually:**
1. Open https://railway.app → project `desirable-serenity` (per CLAUDE.md / user memory).
2. Select the `strale` service (not `chromium` or `postgres`).
3. Variables tab → search `AUDIT_HMAC_SECRET`.
4. If **present and non-empty** → F-0-001 severity drops to Medium (fix = make missing env fatal, add to `.env.example`, switch `verifyAuditToken` to `timingSafeEqual`).
5. If **absent** → F-0-001 stays Critical. All audit-share URLs issued since the feature shipped are signed with the public default secret and are forgeable. Plan: (a) generate + set a strong secret, (b) redeploy, (c) decide whether to invalidate the old-format tokens (they'll still verify against the old constant if the code isn't patched, so the secret change alone is not enough — the hardcoded fallback must also be removed).

---

## Q2: How many Railway replicas is `apps/api` running?

**Answer: 1 replica.** Evidence is indirect but consistent; no contradicting signal found.

Evidence:
- [handoff/_general/from-code/security-audit-api.md:22](handoff/_general/from-code/security-audit-api.md:22) (S-10): _"Rate limits are in-memory (not shared across replicas, lost on restart). **Acceptable for single-instance Railway deploy.** Needs Redis-backed rate limiting before horizontal scaling."_ — a prior internal audit's explicit assumption.
- [apps/api/src/lib/rate-limit.ts:9](apps/api/src/lib/rate-limit.ts:9) treats multi-replica as hypothetical: _"state is NOT shared across multiple Railway replicas. If the service is scaled horizontally, each instance has its own counter..."_
- No `railway.json` / `railway.toml` / `Procfile` exists anywhere in the repo (verified). Railway's replica count therefore lives only in the Railway dashboard, defaulting to 1.
- [Dockerfile](Dockerfile) is single-stage, single-entrypoint (`CMD ["node", "apps/api/dist/index.js"]`), no scaling hints.
- No references to `REPLICAS`, `numReplicas`, `autoscaling`, or `horizontalScaling` in the codebase (grep — the only hit is coincidental, an auto-register comment about `horizontally`).
- [apps/api/src/db/index.ts:13](apps/api/src/db/index.ts:13) sets `postgres(..., { max: 30 })`. A multi-replica deployment with this pool size would exhaust Railway Postgres's default 100-connection limit at 3-4 replicas — consistent with single-instance design.

**Implication for Session 0 fixes:**
- F-0-002 (in-memory rate limiter) keeps its practical severity at "High for per-day limits like `/v1/signup` because restarts reset the window" — but drops the "multi-replica multiplier" concern as hypothetical. Fix can be DB-backed counters for day-scale limits without requiring Redis.
- F-0-011 (circuit-breaker races) stays Low. Two concurrent requests on the same instance can still race, but multi-instance is not a factor today.

---

## Q3: Does CI run vitest tests?

**Answer: No.** Vitest is not installed anywhere in the monorepo, there is no CI config, and there is no `test` script.

Evidence:
- No `.github/` directory anywhere in the repo (depth-4 search confirmed). No GitHub Actions workflows.
- No `.gitlab-ci.yml`, `circle.yml`, `.circleci/`, or any other CI config at repo root.
- Root [package.json](package.json) scripts: `dev`, `build`, `db:generate`, `db:migrate`, `db:push`, `mcp:build`, `mcp:dev`. No `test`, no `check`, no `ci`, no `lint`.
- [apps/api/package.json](apps/api/package.json) scripts: `dev`, `build`, `start`, `digest`, `digest:preview`, `db:*`. No test script. Vitest is in neither `dependencies` nor `devDependencies`.
- Grep for `vitest` across the monorepo finds it only in:
  - The 5 broken test files themselves (which import it).
  - `manifests/dockerfile-generate.yaml` (a capability manifest — unrelated).
  - `REVIEW_FINDINGS_0_baseline.md` (our own report).
- Verified absent from `packages/*/package.json` (all 7 packages checked).
- Only `strale-frontend/package.json` (a separate repo outside the worktree) has vitest. That's a different codebase.

**Implication for F-0-004:** The 5 test files are unambiguously inert. Fix options are (a) install vitest + wire a `test` script + minimal GitHub Actions workflow, or (b) delete the files. A middle path — install locally but not in CI — would just recreate the current drift.

---

## Q4: What observability sink should `fireAndForget` log to?

**Answer: None integrated. Recommendation: `pino` + Better Stack (Logtail) or Axiom, via a thin `stderr`-compatible transport.**

Evidence of current state:
- Grep for `sentry`, `@sentry`, `axiom`, `@axiomhq`, `datadog`, `pino`, `winston`, `bunyan` across all `package.json` files and source: zero real hits. The file matches in `apps/api/src/capabilities/tech-stack-detect.ts`, `skill-extract.ts`, `iso-country-lookup.ts`, and `lib/disposable-domains.txt` are coincidental — they're a skill-taxonomy string list and a disposable-domains blocklist, not imports.
- The only structured-logger-ish thing installed is [hono/logger](apps/api/src/app.ts:3) — a human-readable request logger that prints to stdout.
- Everything else is `console.log/warn/error` with ad-hoc string prefixes (`[auto-register]`, `[mcp-http]`, `[topup-attempt]`, `[do]`, `[integrity]`, `[x402]`) — see F-0-014. Prefixed strings are not JSON.
- 771 `console.*` calls across 104 files. There is no correlation ID, no request ID, no severity discipline.

**Recommendation: Pino + Better Stack (preferred) OR Pino + Axiom.**

Why pino:
- Fastest Node.js logger by a meaningful margin (relevant for a capability executor that's already doing 200+ fetch calls).
- Native JSON output; Railway captures stdout JSON lines cleanly and every log sink accepts them.
- Tiny API surface — trivial to wrap with `fireAndForget(fn, { label, transactionId })`.
- Works with Hono via `hono-pino` or a hand-rolled context middleware. The existing `hono/logger` can be replaced with one line.

Why Better Stack (formerly Logtail) as the sink:
- EU region available (matches the CLAUDE.md "EU/Nordic data wedge" posture; the live deploy is US-East per user memory but the product narrative is EU).
- Free tier is generous (1GB/month retained 3 days) — enough to run this without a bill until traffic warrants.
- Railway has a one-click integration: set `BETTER_STACK_SOURCE_TOKEN` and tail stdout.
- Minimal code: `pino({}, pino.transport({ target: "@logtail/pino", options: { sourceToken: ... } }))`.

Why Axiom as the second choice:
- Similar cost profile, excellent query UX, good for operational dashboards.
- No EU region (US-only hosting at last check), so if EU-residency matters for logs containing PII that slips through (see F-0-013), pick Better Stack first.

Why not Sentry:
- Overkill for general logs (it's optimized for exceptions with source maps).
- Useful as a _second_ integration for unhandled exceptions, but not a substitute for a structured log stream.
- If you go this route anyway, `@sentry/node` handles `console.*` and `process.on('uncaughtException')` cleanly in ~5 lines.

Why not Datadog:
- Enterprise pricing scale. Doesn't make sense for a bootstrapped Railway-hosted service.

**Minimum-effort implementation path (for when fixes begin):**
1. `npm i pino @logtail/pino` in `apps/api`.
2. New module `lib/logger.ts` that exports `logger` and `fireAndForget(fn, ctx)`.
3. Request middleware that sets `c.set('logger', logger.child({ request_id: crypto.randomUUID() }))`.
4. Replace the 89 bare `.catch(() => {})` with `.catch(fireAndForgetError({ label, ... }))` using a codemod or ESLint autofix.
5. Leave `console.*` migration for a follow-up session — the anti-pattern hunt (F-0-009 / F-0-014) is bigger than the sink choice.
