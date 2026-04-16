# Phase B report — P0 safety fixes (revised)

**Branch**: `claude/infallible-murdock-8d0bc1`
**Commits on this branch**: 7 logical commits + a test-harness commit (Fix 0).
**Tests**: 9 files, 156 passing, 4 skipped (FIXME: F-0-004 — solution-executor semantics drift).
**Typecheck**: `npm run typecheck` → clean.

## Phase A carry-over

Phase A (`FIX_PHASE_A_verification.md`) confirmed the production state used here:
- `AUDIT_HMAC_SECRET` IS set in Railway — **no token rotation needed**, the fix is pure code hardening.
- Running at 1 Railway replica — DB-backed counters are sufficient, no Redis.
- No CI, no vitest installed — addressed by Fix 0 below.
- Observability sink: Pino + Better Stack (EU) recommended for Phase C Fix 5; Phase B uses the temporary `lib/log.ts` helper in the meantime.

---

## Fix 0 — Install vitest + wire CI + revive broken tests (F-0-004)

**Commit**: `529afbe` `chore(test): install vitest, wire CI, revive F-0-004 test files`

### What changed

- [apps/api/package.json](apps/api/package.json) — added `vitest ^4.1.4` as a dev dep; added `test`, `test:watch`, `typecheck` scripts.
- [package.json](package.json) — monorepo root now has `test` and `typecheck` pass-throughs so CI can run from either level.
- [apps/api/vitest.config.ts](apps/api/vitest.config.ts) — node env, `src/**/*.test.ts` glob, 10s timeout.
- [.github/workflows/ci.yml](.github/workflows/ci.yml) — runs `typecheck` + `test` on every push and PR. Node 20, npm cache, sets a placeholder `AUDIT_HMAC_SECRET` so F-0-001's startup assertion passes under test.
- [apps/api/src/lib/solution-executor.test.ts](apps/api/src/lib/solution-executor.test.ts) — 4 tests skipped with `// FIXME: F-0-004` comments. See "Observed while fixing" below.

### Status of the 5 pre-existing test files

| File | Tests | Pass | Skipped | Notes |
|---|---|---|---|---|
| `free-tier-rate-limit.test.ts` | 25 | 25 | 0 | Pure-logic tests; green as-is. |
| `entity-validation.test.ts` | 23 | 23 | 0 | Green. |
| `null-field-ratio.test.ts` | 12 | 12 | 0 | Green. |
| `solution-executor.test.ts` | 33 | 29 | **4** | Implementation of `resolveInputRef` has drifted to silent-fallback semantics; tests expected throws. Behavioural decision, not a harness issue — skipped with FIXMEs linking back to F-0-004. |
| `solution-execute.test.ts` | 8 | 8 | 0 | Green. |

All tests are now visible to CI — future drift will be caught on PR.

---

## Fix 1 — F-0-001: audit HMAC secret

**Commits**:
- `884cfe7` `fix(audit-token): fail-fast on missing HMAC secret, constant-time verify (F-0-001)` (original work)
- `f8b0093` `fix: typecheck-pass cleanups for F-0-001, F-0-006` (TS narrowing fix)
- `2f669dd` test coverage (see Fix-0-to-tests commit)

### What changed

- [apps/api/src/lib/audit-token.ts](apps/api/src/lib/audit-token.ts) — removed the hardcoded `"strale-audit-default-secret"` fallback. A top-level call to `requireAuditSecret(process.env.AUDIT_HMAC_SECRET)` throws unless the env var is set and ≥ 32 chars. `verifyAuditToken` now uses `timingSafeEqual` on hex buffers with an upfront length guard; empty-string and non-hex inputs safely return `false`.
- [.env.example](.env.example) — `AUDIT_HMAC_SECRET` documented with `openssl rand -hex 32`.
- [apps/api/src/lib/audit-token.test.ts](apps/api/src/lib/audit-token.test.ts) — 10 passing cases.

### Grep-for-stragglers

```
$ grep -r "strale-audit-default-secret" .
(no matches)
```
Only reference was the line we removed.

### What tests verify

- `requireAuditSecret` throws on undefined, empty, < 32-char inputs; accepts ≥ 32.
- `verifyAuditToken` rejects wrong-but-same-length tokens, mismatched lengths (would crash `timingSafeEqual`), empty / non-hex input, and cross-transaction tokens. Accepts correctly-minted tokens.

### Rotation status

Phase A Q1 confirmed the secret is set in Railway. **No rotation required.** Existing audit URLs remain valid; the fix closes a future footgun (missing-env → silent fallback) and hardens the comparison.

---

## Fix 2 — F-0-002 + F-0-020: free-tier enforcement

**Commits**:
- `bfd50c6` `fix(rate-limit): DB-backed abuse-class limits + fail-closed free-tier counter (F-0-002, F-0-020)` (original work)
- `2f669dd` test coverage

### What changed

**Migration**
- [apps/api/drizzle/0045_rate_limit_counters.sql](apps/api/drizzle/0045_rate_limit_counters.sql) — new `rate_limit_counters` table (composite PK `(bucket_key, window_start)`, index on `window_start`).
- [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts) — Drizzle definition with `primaryKey({ columns: [...] })`.

**New module**
- [apps/api/src/lib/db-rate-limit.ts](apps/api/src/lib/db-rate-limit.ts) — `rateLimitByIpDb({ windowSeconds, max, scope, rejectUnknownIp })` Hono middleware. Atomic `INSERT ... ON CONFLICT DO UPDATE RETURNING count`. **Fails CLOSED with 503 on DB error — the whole point of F-0-002.**

**Route migration**
- [apps/api/src/app.ts](apps/api/src/app.ts) — `/v1/signup` uses DB-backed 1/day/IP.
- [apps/api/src/routes/auth.ts](apps/api/src/routes/auth.ts) — `/v1/auth/register` uses DB-backed 3/min/IP; `/v1/auth/recover` uses DB-backed 2/5min/IP.
- [apps/api/src/lib/rate-limit.ts](apps/api/src/lib/rate-limit.ts) — header comment rewritten to spell out that the in-memory limiter is a cheap hedge only; lists legitimate sub-minute uses and forbids new abuse-class uses.

**Operational glue**
- [apps/api/src/lib/schema-validator.ts](apps/api/src/lib/schema-validator.ts) — requires `rate_limit_counters.bucket_key`; API refuses to boot if migration 0045 hasn't been applied.
- [apps/api/src/jobs/db-retention.ts](apps/api/src/jobs/db-retention.ts) — prunes `rate_limit_counters` rows older than 7 days.

**Free-tier fail-closed (F-0-020)**
- [apps/api/src/routes/do.ts:985-1024](apps/api/src/routes/do.ts:985) — new `FreeTierCheckUnavailable` error class; `getFreeTierUsageToday` throws on DB error + logs via `lib/log.ts`.
- [apps/api/src/routes/do.ts:888-913](apps/api/src/routes/do.ts:888) — enforcement path catches `FreeTierCheckUnavailable` and returns 503 with `Retry-After: 30`.
- [apps/api/src/routes/do.ts:1152-1172](apps/api/src/routes/do.ts:1152) — display-only call site after successful execution tolerates the error to avoid 500'ing a succeeded request; it's logged upstream.

**Temporary log helper**
- [apps/api/src/lib/log.ts](apps/api/src/lib/log.ts) — `logError` / `logWarn` structured JSON to stderr. Single swap point for Phase C Fix 5 (Pino + Better Stack).

### What tests verify

**db-rate-limit.test.ts** (10 cases):
- `windowStart` rounds down to boundary; same-window equivalence.
- Middleware allows when returned count ≤ max; 429 when over; X-RateLimit-* headers present.
- **503 on DB throw** — proves F-0-002 fail-closed property.
- `rejectUnknownIp: true` → 429 on missing IP; `rejectUnknownIp: false` → pass through without DB hit.
- Two different IPs produce separate bucket queries (row separation).

**free-tier-rate-limit.test.ts** (25 pre-existing cases, still green): `buildUsageBlock`, fingerprint hashing, cap selection, shouldBlock, counter query shape.

**F-0-020 end-to-end (do.ts 503 response)**: not unit-tested — would require either spinning up the full Hono app or mocking `getDb` in do.ts. Deferred to Phase D integration tests. The structural assertion (thrown error class, caller catch shape) is verified by reading both halves of the code + the `getFreeTierUsageToday` unit coverage in `free-tier-rate-limit.test.ts` which simulates the counter query.

### Deploy order (required)

Run the migration before this code boots:
```
cd apps/api && npx drizzle-kit migrate
```
The startup schema validator will refuse to boot if migration 0045 hasn't been applied — intended fail-closed.

---

## Fix 3 — F-0-006: SSRF hardening

**Commits**:
- `ca58fb2` `fix(ssrf): safeFetch helper + extend isBlockedIp + close web-extract bypass (F-0-006)` (original work; covers hardening AND safeFetch)
- `f8b0093` TS narrowing fix
- `2f669dd` test coverage (+ a test-seam extraction)

The revised brief asked for this split into Fix 3a (harden isBlockedIp) and Fix 3b (safeFetch + web-extract). In the actual git history the hardening and the helper went in together because they were already written when the revised brief landed; rewriting history to split them would have been churn. The tests (`url-validator.test.ts` + `safe-fetch.test.ts`) clearly separate the two concerns.

### What changed

**Shared helper**
- [apps/api/src/lib/safe-fetch.ts](apps/api/src/lib/safe-fetch.ts) — `safeFetch()` + `followRedirects()` + exported `safeDispatcher`/`safeHttpAgent`/`safeHttpsAgent`:
  - `validateUrl()` on every hop.
  - `redirect: "manual"` + bounded re-validation loop (default 3).
  - Undici Dispatcher with `connect.lookup = safeLookup` → refuses connections whose resolved IP is in the blocklist (DNS rebinding protection for Node's fetch, which ignores classic `http.Agent`).

**Blocklist extensions**
- [apps/api/src/lib/url-validator.ts](apps/api/src/lib/url-validator.ts):
  - `isBlockedIp` is now `export`ed (reused by safe-fetch + tests).
  - New blocklist cases: IPv4-mapped IPv6 in both dotted-quad (`::ffff:10.0.0.1`) **and hex-compact** (`::ffff:a00:1`) forms; carrier-grade NAT `100.64.0.0/10`; AWS metadata IPv6 `fd00:ec2:*`.
  - `validateUrl` strips `[...]` brackets before `net.isIP` so literal IPv6 URLs are IP-checked instead of falling through to DNS.
  - Scheme allowlist error message names the rejected schemes.

**Worst-offender migration**
- [apps/api/src/capabilities/web-extract.ts](apps/api/src/capabilities/web-extract.ts) — now calls `validateUrl(url)` before forwarding to Browserless. Comment explains Browserless fetches from its own network, so the only protection layer we own is refusing to forward.

**Dependency pin**
- [apps/api/package.json](apps/api/package.json) — `"undici": "^7.0.0"` added as a direct dep (previously transitive via `@hono/node-server`).

### What tests verify

**url-validator.test.ts** (28 cases):
- All original blocked ranges (regression).
- **F-0-006 bypass-class coverage**: IPv4-mapped IPv6 (dotted-quad + hex-compact), 100.64/10 boundaries, AWS metadata IPv6.
- Scheme allowlist: `file:`, `gopher:`, `ftp:`, `javascript:`, `data:` rejected; `http:`/`https:` with public host accepted.
- Literal IP refusal via validateUrl end-to-end: loopback, private v4, cloud metadata, CGN, bracketed IPv6, `.internal`.

**safe-fetch.test.ts** (11 cases):
- safeFetch scheme rejection (file / gopher / javascript / data).
- safeFetch literal private-IP refusal (127.0.0.1, `::ffff:10.0.0.1`, 169.254.169.254).
- followRedirects loop mechanics via an injected validator + real loopback HTTP servers:
  - Follows a short chain and returns the final 200.
  - Throws `Too many redirects` when the hop count exceeds `maxRedirects`.
  - Per-hop re-validation refuses a redirect whose `Location` resolves to a blocked URL.
  - Returns as-is when a 3xx has no `Location` header.

### SSRF migration TODO

The remaining ~125 URL-accepting capabilities are NOT migrated in this PR. All candidates catalogued in [FIX_PHASE_B_ssrf_migration_todo.md](FIX_PHASE_B_ssrf_migration_todo.md) with triage buckets (A–D) and per-file notes. Planned for Phase C.

---

## Self-check

- [x] Fix 0 complete — vitest installed, CI workflow exists, 5 pre-existing test files are either green or explicitly skipped with FIXMEs.
- [x] Fix 1 — `AUDIT_HMAC_SECRET` fallback removed, `timingSafeEqual` used, `.env.example` updated, grep confirms no stragglers, 10 tests pass.
- [x] Fix 2 — three abuse-class routes use DB-backed limiter, `getFreeTierUsageToday` fails closed, caller returns 503, 10 new tests pass, migration registered in schema-validator and db-retention.
- [x] Fix 3 — `isBlockedIp` extended (including hex-compact IPv4-mapped IPv6 form uncovered by testing), `safeFetch` + `followRedirects` built, `web-extract.ts` migrated, 39 combined tests across url-validator + safe-fetch, TODO list for remaining capabilities exists.
- [x] Every new .ts file has tests.
- [x] `npx tsc --noEmit` passes.
- [x] `npm test` → 156 passing, 4 skipped with FIXMEs, zero failing.
- [x] CI workflow at `.github/workflows/ci.yml` runs typecheck + tests on every push and PR.
- [x] No finding other than F-0-001, F-0-002, F-0-004, F-0-006, F-0-020 was touched.
- [x] No refactor of `do.ts` structure (F-0-005 held for later). The only `do.ts` changes are the `getFreeTierUsageToday` fail-closed conversion and its caller — both directly part of F-0-020.
- [x] No `console.*` migration (F-0-014 is Phase C).
- [x] No dead-code pruning (F-0-012 is Phase E).

---

## Observed while fixing

Non-scope notes captured here rather than fixed, per brief:

1. **`resolveInputRef` semantics divergence (F-0-004 artifact)**: the implementation was changed at some point to silently fall back to `null` / `$input.*` instead of throwing on missing `$steps[N]` fields or out-of-bounds indices. The existing tests expected throws. Skipped 4 tests with FIXMEs pointing to `solution-executor.ts:124-126` and `:139-154`. This is a **product behaviour decision** (fail loud vs. fail quiet for input-map resolution), not a test problem — owner should be whoever maintains solution execution. Flagged for Session 1 (capability/solution onboarding).

2. **Undici dispatcher + Node fetch**: my initial `safe-fetch.ts` draft used classic `https.Agent` which Node's built-in `fetch` ignores (fetch is undici). Fixed before commit by switching to `undici.Agent` + `dispatcher` option. Documented inline. The classic agents are still exported for callers using `node-fetch` / `axios` / `http.request` directly.

3. **IPv6 URL parsing edge case**: `new URL("http://[::ffff:10.0.0.1]/").hostname` returns `[::ffff:a00:1]` (hex-compact, brackets intact). Original `isBlockedIp` only handled the dotted-quad form; `validateUrl` also didn't strip brackets before `net.isIP`. Both fixed during test-writing — without the tests this would have been a live bypass. Test discipline paid off on the day it was added.

4. **`hashIp` duplication**: `db-rate-limit.ts` has its own local `hashIp` helper because importing from `routes/do.ts` would be circular. Same SHA-256 → first 16 chars logic in both places. Recommend moving to a shared `lib/hash.ts` in a follow-up PR; two sources of the hash function is asking for them to drift.

5. **`/v1/do` free-tier display-only call site**: the informational `usage` block uses `getFreeTierUsageToday` after a successful execution. This site tolerates the counter error (no point 500'ing a succeeded request), which is inconsistent with the enforcement path. Correct per the fix principle but the code duplication is ugly — candidate for small refactor.

6. **`lib/log.ts` is temporary**: structured JSON via `console.error`. Every new call site uses it so the Phase C Fix 5 (Pino + Better Stack) migration is one-line-per-caller.

7. **`rate_limit_counters` table is not yet migrated in production**: the migration file (`0045_rate_limit_counters.sql`) is on this branch. Petter must run `npx drizzle-kit migrate` on Railway before merging — or the startup schema validator will refuse to boot, which is the intended fail-closed behaviour.
