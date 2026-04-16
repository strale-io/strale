# Phase B report — P0 safety fixes

**Branch**: `claude/infallible-murdock-8d0bc1`
**Commits**: 4 (3 focused fix commits + 1 typecheck cleanup)
**Typecheck**: `cd apps/api && npx tsc --noEmit` → clean

---

## Fix 1 — F-0-001: audit HMAC secret

**Commit**: `884cfe7` `fix(audit-token): fail-fast on missing HMAC secret, constant-time verify (F-0-001)`

### What changed

- [apps/api/src/lib/audit-token.ts:4-14](apps/api/src/lib/audit-token.ts:4) — module-load assertion; throws unless `AUDIT_HMAC_SECRET` is set and ≥ 32 chars. Hardcoded fallback `"strale-audit-default-secret"` is gone.
- [apps/api/src/lib/audit-token.ts:19-34](apps/api/src/lib/audit-token.ts:19) — `verifyAuditToken` now uses `timingSafeEqual` on hex buffers with an upfront length guard. Empty-string and non-hex inputs safely return `false`.
- [.env.example:17-19](.env.example:17) — `AUDIT_HMAC_SECRET` documented with the `openssl rand -hex 32` generation command.
- [apps/api/src/lib/audit-token.test.todo.ts](apps/api/src/lib/audit-token.test.todo.ts) — test placeholder (vitest not installed per Phase A Q3).

### What tests verify

Placeholder (`.test.todo.ts`) includes cases for:
- `verifyAuditToken` false on wrong-but-same-length token
- `verifyAuditToken` false on different-length token
- `verifyAuditToken` false on empty / non-hex input
- Module import throws when env is missing
- Module import throws when env is present but shorter than 32 chars

Activated in Phase D once vitest is installed.

### Token rotation required

**Phase A Q1 concluded "unverifiable from code — requires manual Railway check."** Petter must check Railway before deploy:

**Petter — verify and act:**
1. Railway project `desirable-serenity` → service `strale` → Variables tab → look for `AUDIT_HMAC_SECRET`.
2. **If set, non-empty, ≥ 32 chars**: no rotation needed. Deploy this PR as-is; the startup assertion will confirm the value is present on boot.
3. **If absent, or shorter than 32 chars**:
   - Mint one: `openssl rand -hex 32` locally.
   - Set it in Railway Variables.
   - Deploy this PR; service starts.
   - Any audit URL minted before this deploy was signed with the committed default secret `"strale-audit-default-secret"` and is therefore forgeable. Decide whether to:
     - Publicly invalidate old URLs (document it in a customer-facing changelog), OR
     - Treat the forgeability window as historic (fine if no high-value customer has acted on an audit URL they can no longer verify anyway).
   - There is no token database to rotate — the tokens are HMAC-derived on the fly from `transaction_id` + secret. Changing the secret invalidates every previously-issued URL automatically. Decide whether to ship a short-window "accept either secret" compat shim (not included in this PR) or hard-cut.

---

## Fix 2 — F-0-002 + F-0-020: free-tier enforcement

**Commit**: `bfd50c6` `fix(rate-limit): DB-backed abuse-class limits + fail-closed free-tier counter (F-0-002, F-0-020)`

### What changed

**Migration**
- [apps/api/drizzle/0045_rate_limit_counters.sql](apps/api/drizzle/0045_rate_limit_counters.sql) — new `rate_limit_counters` table, composite PK `(bucket_key, window_start)`, index on `window_start` for retention scans.
- [apps/api/src/db/schema.ts:548-568](apps/api/src/db/schema.ts:548) — Drizzle ORM definition with `primaryKey({ columns: [...] })` composite PK.

**New module**
- [apps/api/src/lib/db-rate-limit.ts](apps/api/src/lib/db-rate-limit.ts) — `rateLimitByIpDb({ windowSeconds, max, scope, rejectUnknownIp })` Hono middleware. Single `INSERT ... ON CONFLICT DO UPDATE RETURNING count` does the atomic increment-and-check. On DB error, returns 503 with `Retry-After` (fail CLOSED — the whole point of this fix).

**Route migration**
- [apps/api/src/app.ts:199-204](apps/api/src/app.ts:199) — `/v1/signup` now uses DB-backed 1/day/IP.
- [apps/api/src/routes/auth.ts:22-25](apps/api/src/routes/auth.ts:22) — `/v1/auth/register` uses DB-backed 3/min/IP.
- [apps/api/src/routes/auth.ts:132-137](apps/api/src/routes/auth.ts:132) — `/v1/auth/recover` uses DB-backed 2/5min/IP.
- [apps/api/src/lib/rate-limit.ts:4-28](apps/api/src/lib/rate-limit.ts:4) — header comment rewritten to spell out explicitly that the in-memory limiter is a cheap hedge for sub-minute burst windows only, list the legitimate users, and forbid new abuse-class uses.

**Operational glue**
- [apps/api/src/lib/schema-validator.ts:36-43](apps/api/src/lib/schema-validator.ts:36) — requires `rate_limit_counters.bucket_key`; API refuses to boot if migration 0045 hasn't been applied.
- [apps/api/src/jobs/db-retention.ts:30-32](apps/api/src/jobs/db-retention.ts:30) — prunes `rate_limit_counters` rows older than 7 days. 1-day window is the longest we use, so 7 days leaves generous safety margin.

**Free-tier fail-closed (F-0-020)**
- [apps/api/src/routes/do.ts:985-994](apps/api/src/routes/do.ts:985) — new `FreeTierCheckUnavailable` error class.
- [apps/api/src/routes/do.ts:1005-1024](apps/api/src/routes/do.ts:1005) — `getFreeTierUsageToday` now throws on DB error and logs via the shared `log` helper, instead of silently returning `count: 0` (which disabled the cap on every DB hiccup).
- [apps/api/src/routes/do.ts:888-913](apps/api/src/routes/do.ts:888) — enforcement path catches `FreeTierCheckUnavailable` and returns 503 with `Retry-After: 30`.
- [apps/api/src/routes/do.ts:1152-1172](apps/api/src/routes/do.ts:1152) — display-only call site after a successful execution tolerates the error (no point 500'ing a succeeded request), but it's already logged upstream.

**Shared log helper**
- [apps/api/src/lib/log.ts](apps/api/src/lib/log.ts) — `logError` / `logWarn` JSON-to-stderr. Temporary; Phase C Fix 5 swaps in the real Pino + Better Stack sink decided in Phase A Q4. Every call site added in this PR uses this helper so the swap is one-line-per-caller.

### What tests verify

Placeholder [apps/api/src/lib/db-rate-limit.test.todo.ts](apps/api/src/lib/db-rate-limit.test.todo.ts) shapes:
- Happy path: first N calls allowed, N+1 denied with 429 + `Retry-After`.
- Disjoint identifiers get independent quotas (row separation).
- DB failure → 503 (fail closed, proves F-0-002's core property).
- Missing IP with `rejectUnknownIp: true` → 429.

Activated in Phase D.

### Deploy order

Migration must run before this code boots:
```
cd apps/api && npx drizzle-kit migrate
```
The startup schema validator will refuse to boot if the migration hasn't run, so the deploy cannot silently half-apply.

---

## Fix 3 — F-0-006: SSRF hardening

**Commit**: `ca58fb2` `fix(ssrf): safeFetch helper + extend isBlockedIp + close web-extract bypass (F-0-006)`

### What changed

**Shared helper**
- [apps/api/src/lib/safe-fetch.ts](apps/api/src/lib/safe-fetch.ts) — `safeFetch()`:
  - `validateUrl()` runs before any network I/O.
  - `redirect: "manual"` + a manual 3-hop follow loop that re-validates every `Location`. This is the one thing `validateUrl` alone cannot do (it only sees the first URL) and is the classic SSRF bypass surface.
  - Custom `undici` Dispatcher with `connect.lookup = safeLookup` re-checks resolved IP at connection time. Closes the DNS-rebinding window between `validateUrl`'s own lookup and the real socket open.
  - Also exports `safeHttpAgent` / `safeHttpsAgent` for libraries that take a classic `http.Agent`.

**Blocklist extensions**
- [apps/api/src/lib/url-validator.ts:27-80](apps/api/src/lib/url-validator.ts:27) — `isBlockedIp` is now `export`ed and covers:
  - IPv4-mapped IPv6 (`::ffff:*`)
  - Carrier-grade NAT `100.64.0.0/10`
  - AWS cloud metadata IPv6 (`fd00:ec2:*`) — redundant with the general `fd*` guard but auditable.
- [apps/api/src/lib/url-validator.ts:88-107](apps/api/src/lib/url-validator.ts:88) — scheme error message now names the rejected schemes; `file:`, `gopher:`, `ftp:`, `dict:`, `javascript:`, `data:` all fall through the single allowlist check (`http` / `https` only).

**Worst-offender migration**
- [apps/api/src/capabilities/web-extract.ts:4-26](apps/api/src/capabilities/web-extract.ts:4) — now calls `validateUrl(url)` before forwarding to Browserless. A block-comment explains that Browserless's outbound call happens from its own network, so the only layer under our control is refusing to forward.

**Dependency pin**
- [apps/api/package.json:39](apps/api/package.json:39) — added `"undici": "^7.0.0"`. Previously only available transitively via `@hono/node-server`.

### What tests verify

Placeholder [apps/api/src/lib/safe-fetch.test.todo.ts](apps/api/src/lib/safe-fetch.test.todo.ts) shapes:
- URL resolving to a private IP is rejected.
- Redirect to a private IP is refused after the redirect.
- >3 redirects throws.
- `file:///`, `data:`, `javascript:`, `gopher://` all reject.
- `isBlockedIp` catches `::ffff:10.0.0.1`, `100.64.0.1`, `100.127.255.254`, `fd00:ec2::254`.
- `isBlockedIp` allows `::ffff:8.8.8.8` (mapped-public should stay public).

### SSRF migration TODO

The remaining URL-accepting capabilities are NOT migrated in this PR — scope creep. All 54 candidates catalogued in [FIX_PHASE_B_ssrf_migration_todo.md](FIX_PHASE_B_ssrf_migration_todo.md) with triage buckets:

- **Bucket A (~25 capabilities)**: direct `fetch(user_url)`; swap for `safeFetch`.
- **Bucket B (~23 capabilities)**: forward URL to Browserless/Jina/Anthropic; must call `validateUrl` upfront like `web-extract.ts` does now. Migrating the shared helpers (`lib/web-provider.ts`, `lib/browserless-extract.ts`, `lib/jina-reader.ts`) covers multiple callers in one change.
- **Bucket C (~11 capabilities)**: domain/hostname input for DNS/TCP; use `validateHost`.
- **Bucket D (~11 capabilities)**: URL as a parameter, not a fetch target; needs case-by-case review.

Budget ~4–5 hours for the whole list. Planned for Phase C.

---

## Observed while fixing

Scope-creep candidates spotted while working; NOT fixed in Phase B — flagged here so they show up in Phase C triage:

1. **`redirect-trace` will be a special case** when it migrates. Its entire purpose is to follow redirects. It must use `safeFetch` with `maxRedirects: 0` and do its own loop, re-validating each `Location`. Listed under Bucket A with a note. Not a new finding — implicit in F-0-006.

2. **`screenshot-url` has the same Browserless-forwarding pattern as `web-extract`** (Bucket B). Didn't touch it because scope was "worst offender only". Whoever picks up Phase C should do all Bucket B items at once — they're nearly identical changes.

3. **`do.ts:1146-1156` (free-tier usage display block)**: the structure has *three* different places that could call `getFreeTierUsageToday` — one enforcement, two display. I left them behaving slightly differently on DB error (enforcement throws 503; display returns 0). That's correct per the fix principle but the code duplication is ugly. Candidate for a small refactor in a follow-up PR.

4. **`logError`/`logWarn` in [apps/api/src/lib/log.ts](apps/api/src/lib/log.ts) is explicitly temporary**. The real Pino + Better Stack migration happens in Phase C per Phase A Q4. Every new call site I added uses this helper so the migration is a one-line-per-caller swap.

5. **IP fingerprint bucket reuses `hashIp` from do.ts** — I wrote a local copy in `db-rate-limit.ts` because importing from `routes/do.ts` would be circular. Both implementations are the same SHA-256 → first 16 chars. A follow-up should move the hash into `lib/` and have do.ts + db-rate-limit.ts both import from there. Not urgent — the two are functionally identical.

6. **The new `rate_limit_counters` table is NOT yet migrated in production**. The migration file (`0045_rate_limit_counters.sql`) is on this branch. Petter must run `npx drizzle-kit migrate` on Railway before merging — or the startup schema validator will refuse to boot, which is the intended fail-closed behaviour.

## Self-check

- [x] Every one of the three fixes has a code change, a test placeholder (`.test.todo.ts` per Phase A Q3 decision), and comments referencing the finding ID.
- [x] `.env.example` updated.
- [x] No finding other than F-0-001, F-0-002, F-0-006, F-0-020 was touched.
- [x] Three focused commits (+ 1 typecheck cleanup committed separately) on branch `claude/infallible-murdock-8d0bc1`.
- [x] `FIX_PHASE_B_report.md` and `FIX_PHASE_B_ssrf_migration_todo.md` at repo root.
- [x] `npx tsc --noEmit` in `apps/api` passes clean.
- [x] No unrelated code deleted or refactored.
