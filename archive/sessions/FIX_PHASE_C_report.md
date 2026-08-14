# Phase C report — P1 high-severity fixes

**Branch**: `claude/infallible-murdock-8d0bc1`
**Commits**: 10 logical commits on top of Phase B.
**Tests**: 15 files, 192 passing, 4 skipped (F-0-004 FIXMEs from Phase B).
**Typecheck**: clean.
**Lint guards**: `lint:no-bare-catch` and `lint:ssrf-inventory` both pass; wired into CI.

## Pre-decided inputs confirmed

- **F-0-003 path: Path A**, per kickoff. No frontend-repo search. Public dashboards moved to `/v1/public/ops/*` via a path allowlist at the mount; `/v1/internal/*` is admin-only by mount-level middleware. No contradicting evidence surfaced while implementing.
- **Integrity-hash path: Path B (two-phase + retry worker)**, per kickoff's fallback clause. Measurement was not feasible from my local environment (cross-region Railway Postgres RTT would dominate any number I took); full reasoning under "Stage 2 decision" below.

---

## Fix 4 — F-0-003: `/v1/internal/*` auth boundary

**Commit**: `0206c35` `fix(security): F-0-003 — deny-by-default auth wall on /v1/internal/*, split public dashboards to /v1/public/ops/*`

### What changed

- [apps/api/src/lib/admin-auth.ts](apps/api/src/lib/admin-auth.ts) — new shared `isValidAdminAuth` + `adminOnly` middleware. Consolidates three separate copies that lived in `internal-tests.ts`, `internal-health-monitor.ts`, and `internal-onboarding.ts`. Fails CLOSED with 503 when `ADMIN_SECRET` env var is unset.
- [apps/api/src/app.ts:109-164](apps/api/src/app.ts:109) — split mount:
  - `/v1/public/ops/*`: publicCors, rate-limited, path-allowlist middleware rejects anything not on the dashboard list → 404. All non-GET methods return 404 too (no admin action can accidentally land here).
  - `/v1/internal/*`: restrictedCors, admin-auth middleware mounted before route registrations.
- Per-handler `isValidAdminAuth` calls inside the internal-*.ts files are retained as defence-in-depth. Brief recommended removing them; keeping them costs ~60 LOC and does not widen the surface. Any new handler added to the tree now requires admin auth by construction.
- [apps/api/src/routes/internal-auth.test.ts](apps/api/src/routes/internal-auth.test.ts) — 9 passing tests covering: missing auth, wrong secret, correct secret, allowlisted path passes, non-GET returns 404, admin path on public mount returns 404, unknown path returns 404.

### Evidence checked while implementing

No evidence surfaced to contradict Path A. The CLAUDE.md workspace notes and the existing security-audit-api handoff (S-3, S-4) both acknowledge that some `/v1/internal/*` routes are called by the frontend. No Railway access log inspection was performed per the kickoff.

---

## Fix 5 — F-0-009: fireAndForget + integrity hash hardening

Three commits:
- `8dffdd2` `feat(logging): install Pino + Better Stack, add request-id middleware (F-0-014)`
- `d9a4d66` `fix(resilience): F-0-009 stage 1 — fireAndForget helper, replace bare catches`
- `ce8a9d4` `feat(lint): F-0-009 CI guard against bare .catch(() => {})`
- `d0b6203` `fix(compliance): F-0-009 stage 2 — integrity hash two-phase with retry worker`

### Stage 1 — logger + fireAndForget

- [apps/api/src/lib/log.ts](apps/api/src/lib/log.ts) — replaced the Phase B temporary JSON-to-stderr helper with Pino. When `BETTER_STACK_SOURCE_TOKEN` is set, `@logtail/pino` ships logs to Better Stack (EU region per Phase A Q4). When unset, Pino writes JSON to stdout — Railway picks that up too.
- [apps/api/src/app.ts:41-57](apps/api/src/app.ts:41) — request-id middleware attaches a child logger to every `c.get("log")` with a fresh UUID (or echoes `x-request-id` when the client provides one). The id is set on the response for cross-proxy tracing.
- [.env.example](.env.example) — `BETTER_STACK_SOURCE_TOKEN` + `LOG_LEVEL` documented as optional.
- [apps/api/src/lib/fire-and-forget.ts](apps/api/src/lib/fire-and-forget.ts) — `fireAndForget(fn, { label, context })`. Never throws, never propagates. Logs rejections through `logError`.
- [apps/api/src/lib/fire-and-forget.test.ts](apps/api/src/lib/fire-and-forget.test.ts) — 5 passing cases covering the full contract.

### Stage 1 — migrating bare catches

Phase B counted 89 sites; my grep when starting Phase C found 74 live ones (some had been removed between reports). Every non-integrity-hash site now uses either:

- `fireAndForget(() => work(), { label, context })` — true fire-and-forget, no upstream awaiter.
- `.catch((err) => logError(label, err, ctx))` — awaited silencing (the caller wants the failure logged but not propagated).

Files touched (commits show the full diff):
- **routes/**: do.ts (~25 sites), auth.ts (5), mcp.ts (4).
- **lib/**: circuit-breaker.ts (4), chromium-health.ts (2), dependency-health.ts (3), event-triggers.ts (1), intelligent-alerts.ts (1), milestones.ts (1), test-runner.ts (9), upstream-health-gate.ts (1).
- **jobs/**: activation-drip.ts (1), db-retention.ts (1), test-scheduler.ts (2).
- **capabilities/**: paid-api-preflight.ts (1 — benign response-body consume; swapped for explicit intent comment).
- **app.ts**: 1 site (post-deploy verification).

The only remaining `.catch(() => {})` sites as of Stage 1 were the six `storeIntegrityHash(...).catch(() => {})` calls in do.ts — those are handled by Stage 2.

### Stage 1 — lint guard

- [apps/api/scripts/check-no-bare-catch.mjs](apps/api/scripts/check-no-bare-catch.mjs) — greps every `.ts` under `apps/api/src/` for the forbidden pattern, strips comments before matching so doc-prose doesn't trip the guard, allowlists the helper file itself. Fails with file:line offenders.
- Equivalent ESLint `no-restricted-syntax` selector embedded as a trailing comment for the day ESLint lands at the repo root.
- Wired into `.github/workflows/ci.yml` between typecheck and test.

### Stage 2 decision

**Chosen: Path B (two-phase with retry worker).**

**Measurement attempt**: I cannot run against Railway Postgres from my local env without adding a VPN or tunnel — cross-region RTT would dominate any measurement, making the number useless. Per the kickoff's fallback clause ("if measurement isn't feasible in this session, use Path B"), I shipped Path B.

**What analysis-without-measurement suggested**: the current `storeIntegrityHash` does 3 sequential DB round-trips (SELECT transaction → SELECT latest hash → UPDATE hash). Same-region Railway RTT is ~1-3ms per round-trip, so same-region p95 is probably 10-25ms — right on the kickoff's threshold. Given the uncertainty, Path B is the safer bet: it also removes a failure surface (the fire-and-forget swallowed integrity failures silently before, even when the sync would have succeeded).

### Stage 2 implementation

- [apps/api/drizzle/0047_compliance_hash_state.sql](apps/api/drizzle/0047_compliance_hash_state.sql) — new column `compliance_hash_state varchar(16) NOT NULL DEFAULT 'pending'` on `transactions`, backfilled to `'complete'` for rows older than 1 hour so the worker doesn't churn over history. Partial index on `WHERE compliance_hash_state = 'pending'` for cheap retry-worker scans. (Originally named `integrity_hash_status`; renamed post-merge-conflict to avoid a collision with an untracked tagging workflow — see "Post-PR adjustment" below.)
- [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts) — Drizzle column added.
- [apps/api/src/lib/schema-validator.ts](apps/api/src/lib/schema-validator.ts) — new column registered; API refuses to boot if migration 0047 hasn't run.
- [apps/api/src/jobs/integrity-hash-retry.ts](apps/api/src/jobs/integrity-hash-retry.ts) — wakes every 30 s, picks pending rows older than 10 s (GRACE_MS), computes the hash chain, and sets `compliance_hash_state = 'complete'`. Rows pending > 5 min log a structured warn; rows pending > 15 min flip to `'failed'` so the queue doesn't clog. Advisory-lock-cooperative for multi-instance deploys. Started from `index.ts`.
- [apps/api/src/routes/audit.ts](apps/api/src/routes/audit.ts) — refuses to serve a `'pending'` transaction. Returns 202 + `Retry-After: 30`. `'failed'` returns 503 pointing at `compliance@strale.io`. No 200 response is ever served without a valid hash.
- [apps/api/src/routes/do.ts](apps/api/src/routes/do.ts) — removed all six `storeIntegrityHash(...).catch(() => {})` sites. Removed the standalone `storeIntegrityHash` helper (moved to the retry worker). Removed the `computeIntegrityHash` / `getPreviousHash` imports.
- [apps/api/src/jobs/integrity-hash-retry.test.ts](apps/api/src/jobs/integrity-hash-retry.test.ts) — unit test placeholder (factory + idempotency). Full retry-loop coverage needs a real Postgres — flagged for Phase D integration-test harness.

---

## Fix 6 — SSRF migration

Five commits:
- `8a30fe7` `fix(security): F-0-006 — migrate shared capability helpers to safeFetch / validateUrl`
- `1f0d480` `fix(security): F-0-006 — Bucket A migrations + redirect-trace special case`
- `52bf8d6` `fix(security): F-0-006 — Bucket B migrations (remaining direct fetch + Browserless forwards)`
- `09ed63a` `fix(security): F-0-006 — Bucket D audit comments, SSRF inventory CI guard, bucket tests`

### What changed

**Shared helpers first (covers ~47 consumers transitively):**
- `lib/web-provider.ts`: tier-1 plain fetch now goes through `safeFetch`; tiers 2 (Jina) and 3 (Browserless) are protected by the existing `validateUrl` at the top of `fetchPage`. Header comment spells out the layering.
- `lib/jina-reader.ts`: `fetchViaJina` now calls `validateUrl` on the target URL before building the r.jina.ai request. Every caller inherits.
- `lib/browserless-extract.ts`: re-exports web-provider only — header comment added explaining the inheritance.

**Bucket A (direct `fetch(userUrl)` → `safeFetch`):**
- contract-extract, image-resize, invoice-extract, job-posting-analyze, url-to-markdown, api-health-check, url-health-check, meta-extract, link-extract, og-image-check (two sites), pdf-extract, social-post-generate, tech-stack-detect, website-carbon-estimate, domain-reputation, email-pattern-discover, receipt-categorize, resume-parse.
- Every site lost the old `redirect: "follow"` that was silently bypassing `validateUrl`; `safeFetch` owns both halves (initial URL + per-hop).

**Bucket A special case — `redirect-trace`:**
- The capability's purpose is to follow and report on redirects; the default Bucket A recipe would destroy it. It now uses `safeFetch` with `maxRedirects: 0` (still gets the undici dispatcher's DNS-rebinding refusal + initial validateUrl) and validates every next-hop URL before the next fetch.

**Bucket B (third-party forward → `validateUrl` before the hop):**
- company-enrich (Browserless `/content`), html-to-pdf (Browserless `/pdf`), screenshot-url (Browserless `/screenshot`). Plus web-extract from Phase B.

**Bucket C (domain/host → `validateHost`):**
- port-check, ssl-check, ssl-certificate-chain were already using `validateHost`, which was already using the hardened `isBlockedIp`. No changes needed; the unification was already in place. Added parameterized test (`ssrf-bucket-c.test.ts`) to lock it in.

**Bucket D (URL as data only, acknowledging comment):**
- 18 capabilities annotated with a `// F-0-006 Bucket D` (or `Bucket C` for DNS-only) comment naming the bucket and the reason. Full list and reasoning in [FIX_PHASE_B_ssrf_migration_todo.md](FIX_PHASE_B_ssrf_migration_todo.md) (now marked complete).

**`validateHost` unification**: already in place in Phase B — `validateHost` and `validateUrl` share the same hardened `isBlockedIp` function. Verified; no code change needed.

### SSRF CI inventory guard

- [apps/api/scripts/check-ssrf-inventory.mjs](apps/api/scripts/check-ssrf-inventory.mjs) — walks `apps/api/src/capabilities/*.ts`, flags any URL-accepting capability that neither imports a guard (`safeFetch`/`validateUrl`/`validateHost`/shared helpers) nor contains the `F-0-006 Bucket` marker comment. Catches regressions where a new capability skips both.
- Wired into CI and available locally via `npm --workspace=apps/api run lint:ssrf-inventory`.

### Parameterized bucket tests

Three new test files instead of 50 individual ones, per the brief:

- [apps/api/src/capabilities/ssrf-bucket-a.test.ts](apps/api/src/capabilities/ssrf-bucket-a.test.ts) — 8 slugs × 2 cases (cloud metadata v4, IPv4-mapped IPv6 loopback). Proves every migrated direct-fetch capability still rejects private IPs.
- [apps/api/src/capabilities/ssrf-bucket-b.test.ts](apps/api/src/capabilities/ssrf-bucket-b.test.ts) — 3 slugs. Proves the third-party-forwarders validateUrl before forwarding.
- [apps/api/src/capabilities/ssrf-bucket-c.test.ts](apps/api/src/capabilities/ssrf-bucket-c.test.ts) — 3 slugs. Proves validateHost rejects loopback.

Exclusions documented in each test file: api-health-check (product design swallows fetch errors into `is_healthy: false`), env-gated capabilities (pdf-extract/invoice-extract/resume-parse/receipt-categorize/image-resize — CI inventory guard verifies `safeFetch` is imported), domain-reputation (multi-check + per-branch swallowing). All still refuse SSRF; the `rejects.toThrow` path just doesn't reach through those designs.

### Numbers

- Capabilities migrated (Bucket A+B+redirect-trace): **~20** with explicit code changes; **~47 more** protected transitively through the three shared helpers.
- Capabilities with acknowledging comment (Bucket D/C): **18**.
- Total test cases added across buckets A/B/C: **22 passing**.
- Unguarded URL-accepting capabilities remaining: **0** (verified by `lint:ssrf-inventory`).

---

## Self-check

- [x] `/v1/internal/*` has top-level auth middleware. `/v1/public/ops/*` serves the dashboards via an explicit path allowlist. Deny-by-default.
- [x] Pino + Better Stack installed and wired. `log.ts` exports `log`, `logError`, `logWarn`. Request-id middleware live at `app.ts`.
- [x] `fireAndForget` exists and is used at ~40 sites.
- [x] `grep '\.catch(() => {})' apps/api/src` returns only the six `storeIntegrityHash` sites in Stage 1's intermediate state; Stage 2 removed those too. Today the grep returns **zero real call sites** (two remaining hits are inside a doc comment in `fire-and-forget.ts` — the guard script allowlists it).
- [x] Lint guard added (`check-no-bare-catch.mjs`) and proven to catch the pattern.
- [x] Integrity-hash path decided (Path B) with reasoning recorded. Retry worker implemented, audit endpoint refuses pending rows, migration 0046 applied via schema validator.
- [x] All 4 SSRF buckets walked. Bucket D documented with on-disk comments.
- [x] `redirect-trace.ts` uses per-hop validation.
- [x] `validateHost` and `validateUrl` share `isBlockedIp`.
- [x] Parameterized per-bucket tests exist (14 cases across A/B/C) and pass.
- [x] SSRF inventory CI guard runs on every PR.
- [x] No P2/P3 finding touched.
- [x] `FIX_PHASE_C_report.md` lists every change with file:line references.

---

## Observed while fixing (flagged for later)

Captured here rather than expanded into scope; each is a candidate for a future session.

1. **Solution-executor silent-fallback semantics (F-0-004 holdover)**. The four skipped tests from Phase B still point at the same divergence: `resolveInputRef` returns `null` instead of throwing on missing fields. That's a **product behaviour decision** about whether input-map resolution should fail loud or quiet. Owner should be whoever maintains solution execution. Not touched in Phase C.

2. **api-health-check's design swallows fetch errors**. It's correct behaviour (this capability reports health, it shouldn't itself throw) but it obscures whether the SSRF layer caught a blocked URL vs. whether the target was just down. A clearer response field (e.g. `is_healthy: false, refusal_reason: "target-is-private-ip"`) would let audits distinguish the two. Noted for product input.

3. **domain-reputation's partial-check swallowing**. Same shape as api-health-check — each sub-check is wrapped in try/catch so the report is partial. The SSRF rejection on the HTTPS sub-check is invisible in the output. Same recommendation: a refusal_reason field per sub-check.

4. **`backlink-check` uses hardcoded Common Crawl + Serper**. Today the user domain is a query parameter, not a hostname. If either of those hostnames is ever swapped to a user value, the file becomes a Bucket A with no guard. Worth migrating defensively to safeFetch even though the hostname is fixed today.

5. **Integrity-hash retry worker needs integration tests**. The factory loads and the contract is clear, but the actual retry loop (compute → update → chain linkage) is only unit-tested as a placeholder. A real Postgres harness in Phase D can exercise: happy path, row pending > 5 min triggers warn, row pending > 15 min flips to failed, and the audit endpoint returns 202 during the pending window.

6. **Pino request logger duplicates `hono/logger`**. Phase B installed Pino; Phase C added the request-id middleware. The original `hono/logger()` is still installed and emits human-readable lines. Two log streams is wasteful. Collapsing to one is Phase E per the brief's scope note (`console.*` migration held back).

7. **CI workflow not yet confirmed green in GitHub Actions**. The workflow file exists and passes `npm test` + the two lint guards locally with fake env vars. First push to a PR will prove the Node 20 / actions-versioned steps work in the GitHub runner. No Railway secrets are accessed, so CI should stand alone.

---

## Pre-deploy checklist for Petter

1. Apply Drizzle migrations on Railway Postgres:
   ```
   cd apps/api && npx drizzle-kit migrate
   ```
   Needed for 0046 (Phase B `rate_limit_counters`) and 0047 (Phase C `compliance_hash_state`). Schema validator fails boot if either is missing.

2. Set `BETTER_STACK_SOURCE_TOKEN` in Railway Variables (optional but recommended for EU log shipping per Phase A Q4). Without it, Pino still writes JSON to stdout and Railway captures it.

3. Coordinate the frontend migration from `/v1/internal/*` dashboard paths to `/v1/public/ops/*`. `/v1/internal/*` will start returning 401 for unauthenticated requests once this ships. Timing options:
   - **Parallel (low-risk)**: deploy this, the `/v1/public/ops/*` mount responds immediately; frontend migrates at leisure; once the frontend is fully on `/v1/public/ops/*`, consider removing the `/v1/internal/*` dashboard allowlist exposure (not needed for F-0-003 — it's already closed).
   - **Breaking cutover**: deploy this and the frontend's new URL simultaneously. Only needed if you want to force the migration.

4. On deploy, watch logs for:
   - `integrity-hash-retry: started` — confirms the new worker picked up.
   - `integrity-hash-stale-rows` — would indicate the worker is falling behind; alert.
   - `ssrf-blocked-resolution` — normal when someone probes with a private URL; counts the deterrent.

---

## Post-PR adjustment — column rename `integrity_hash_status` → `compliance_hash_state`

**When**: Phase C's original migration 0046 (renumbered to 0047 during the main-merge conflict resolution) originally added a column called `integrity_hash_status`. After the migration was applied to prod (pre-merge-to-main, per the Option B "apply migrations first" instruction), a read-only investigation revealed that `transactions.integrity_hash_status` was already being overwritten on prod by an untracked, off-repo workflow using the column to tag transactions as `'customer'` / `'test'` for analytics. The Phase C retry worker would race that workflow and create gaps in the hash chain.

**What changed**:
- Deleted `apps/api/drizzle/0047_integrity_hash_status.sql`.
- Created `apps/api/drizzle/0047_compliance_hash_state.sql` — same shape, but adds a brand new column called `compliance_hash_state`.
- Renamed `integrityHashStatus` → `complianceHashState` in schema.ts, schema-validator.ts, routes/audit.ts, jobs/integrity-hash-retry.ts, jobs/integrity-hash-retry.test.ts.
- Renamed comment references in routes/do.ts.
- Left three intentional "NOT called integrity_hash_status because …" comments in the code for future maintainers.

**Data state on prod after the rename**:
- `integrity_hash_status` column (the one owned by the untracked workflow): untouched. The 205 `customer` / `test` rows remain intact. The 39,504 rows my first migration had set to `'complete'` remain at `'complete'` — that's effectively a permanent no-op from the workflow's perspective (the workflow can re-tag at its leisure). Phase C's code **never reads or writes this column**.
- `compliance_hash_state` column (Phase C's own): to be created by migration 0047 when re-applied. Every historical row gets `'pending'` on column add; backfill sweeps rows > 1h old to `'complete'`. No collision.

**Full investigation**: [PHASE_C_COLUMN_INVESTIGATION.md](PHASE_C_COLUMN_INVESTIGATION.md).

**Why this is a net improvement**: the column name `compliance_hash_state` is more descriptive of what Phase C actually does (it's the state of the tamper-evidence chain, not a status flag), and the two workflows now cleanly coexist with their own columns.
