Intent: Program track T17 / WP13 first batch — upgrade `hono` in `apps/api` to close its 27
open advisories, prove nothing regressed, and record the reachability findings that the
2026-09-02 WP13 triage receipt flagged as the lower-risk first upgrade (ahead of the
semver-major `drizzle-orm` bump, which gets its own scoped session).

## What changed

- `apps/api/package.json`: `hono` `^4.7.4` -> `^4.13.5`.
- `package-lock.json` updated accordingly (hono resolves to `4.13.5` everywhere it's used
  by `@strale/api`, deduped against `@hono/node-server` and `@modelcontextprotocol/sdk`'s
  own hono ranges).
- Method: `npm install hono@^4.13.5 --workspace=apps/api` (an explicit install, not
  `npm update`). The original range `^4.7.4` already permitted `4.13.5` — `npm update`
  alone would have resolved the same version without touching `package.json` — but I ran
  `install` so the declared floor also moves up, matching the version actually verified
  here.
- No other workspace (`packages/mcp-server`, `packages/sdk-typescript`,
  `packages/semantic-kernel-strale`, `packages/langchain-strale`, `packages/crewai-strale`)
  declares `hono` directly; grep confirmed `apps/api/package.json` is the only declaration
  site.

## Audit numbers (observed, `npm audit --omit=dev --json` at repo root)

| | critical | high | moderate | low | total |
|---|---|---|---|---|---|
| before | 1 | 14 | 7 | 2 | 24 |
| after  | 1 | 13 | 7 | 2 | 23 |

`hono`'s audit entry (before: severity high, isDirect true, range `<=4.12.33`, 27 advisories
folded into one entry, fixAvailable true) is **absent** from the after-audit output — it
resolved cleanly off the vulnerable range. High-severity count dropped by exactly 1 (the
folded hono entry), matching expectation.

## Verification

- `npm --workspace=packages/mcp-server run build` — clean (run first per the task note, to
  avoid the 4 phantom `routes/mcp.ts` errors under `tsc --noEmit`).
- `apps/api && npx tsc --noEmit` — clean, zero errors.
- `apps/api && npx vitest run src/routes/ src/lib/x402-visibility.test.ts
  src/lib/public-ops-visibility.test.ts src/routes/public-surface-visibility.test.ts
  src/routes/public-trust.test.ts src/routes/a2a-card.test.ts`:
  first pass — 7 test files failed / 21 passed / 16 skipped (44 files); 10 tests failed /
  245 passed / 125 skipped (380 tests). All 10 failures were `Error: Test timed out in
  10000ms` **except one** deterministic assertion failure in `x402-body-limit.test.ts`
  (see finding below).
- Re-ran the 6 timed-out files alone: `admin-apply-migrations.test.ts`,
  `internal-auth.test.ts`, `public-trust.test.ts`, `transactions.test.ts`, `verify.test.ts`,
  `wallet.test.ts` — all 6 files passed, 55/55 tests, in one run. Confirms this is the
  documented "local suite flaky under concurrent load" pattern (project memory:
  `project_local_suite_flaky_ci_is_the_gate`), not a hono-upgrade regression.
- Re-ran `x402-body-limit.test.ts` alone twice — same deterministic result both times: 17
  passed / 1 failed (not a timeout). Re-scoped the one failing test to assert hono's new
  behavior instead of the old bug it could no longer reproduce (see finding below); after
  that change the file passes 18/18, twice in a row.
- `npm run env:check` — ok (126 env names checked against 129 manifest rows).
- `npm run models:check` — ok (667 files checked).
- `npm run claims:check` — ok (27 claim rows checked).

## Finding — one test's expectation was stale, re-scoped in this session (NOT a regression)

`src/routes/x402-body-limit.test.ts`, test
`"the streaming branch refuses instead of reporting success" > "FAIL-BEFORE: swallowing the
abort reports 200 on an oversized body"` now fails: it expects `res.status` to be `200` and
gets `413`.

This test deliberately reconstructs the app's **pre-fix** buggy shape (a bare
`try { await c.req.json() } catch { fall through to query params }` around a purpose-built
Hono app with `bodyLimit` on a chunked/no-`Content-Length` stream) as a "FAIL-BEFORE"
pinning test, per the swallow-visibility discipline in DEC-20260504-A — it exists to prove
what the old bug looked like, contrasted against the sibling test
`"rethrowing the abort produces a 413"`.

Under `hono@4.13.5` the same swallow-shaped handler now returns `413` instead of `200` —
hono itself closed the underlying chunked-`bodyLimit`-bypass at the framework level. This
matches two of the advisories this exact upgrade fixes: `GHSA-9vqf-7f2p-gf9v` ("bodyLimit()
can be bypassed for chunked / unknown-length requests") and/or `GHSA-rv63-4mwf-qqc2` ("Body
Limit Middleware can be bypassed on AWS Lambda by understating Content-Length").

Confirmed this is not a production regression:
- The sibling test (`"rethrowing the abort produces a 413"`) still passes.
- The separate describe block `"the gateway itself no longer swallows the abort"`, which
  exercises the **real** `x402-gateway-v2.ts` code (not the synthetic pinning app), still
  passes — production behavior for an oversized chunked `/x402/*` body was `413` before
  this upgrade and is still `413` after.
- What changed is that hono itself now independently defends against the bug class the
  app-level fix defends against — a strict improvement, not a break.

**Update (architect decision, same session):** the test was re-scoped rather than left
stale. It is renamed to `"swallowing the abort no longer reports 200: hono 4.13.5 refuses
the oversized body itself"`, now asserts `413`, and its comment documents what it used to
prove, that hono <4.12.16 returned 200 here (the bug), that 4.13.5 refuses it at the
middleware, and that the gateway's rethrow stays as defence in depth, proved by the
sibling `"rethrowing the abort produces a 413"` test. `x402-body-limit.test.ts` now passes
18/18, confirmed deterministic across two isolated runs.

## Reachability — the HIGH CORS advisory

`GHSA-88fw-hqm2-52qc` ("CORS Middleware reflects any Origin with credentials when `origin`
defaults to the wildcard") requires BOTH `origin` left at Hono's wildcard default AND the
caller setting `credentials: true`. Grepped all three `cors(...)` call sites in
`apps/api/src`:

| call site | sets `credentials: true` | `origin` left at default |
|---|---|---|
| `apps/api/src/app.ts:225-233` (`restrictedCors`) | no | no — explicit function over `ALLOWED_ORIGINS`, denies with `""` on no match |
| `apps/api/src/app.ts:235-239` (`publicCors`) | no | no — explicit `origin: "*"` |
| `apps/api/src/routes/x402-gateway-v2.ts:980-988` (`x402GatewayV2` cors) | no | no — explicit `origin: "*"`; comment: "payment IS the auth" |

**Conclusion: the HIGH CORS advisory was never exploitable in Strale.** None of the three
call sites sets `credentials: true`, and none leaves `origin` unset.

## Reachability — other hono middleware/helpers named in the task

Grepped `apps/api/src` for each (results: used / not used):

- `serveStatic` (`hono/serve-static`) — **not used**.
- `ipRestriction` (`hono/ip-restriction`) — **not used**.
- `jwt`/`verify` (`hono/jwt`) — **not used**.
- `bodyLimit` (`hono/body-limit`) — **used**: `app.ts` applies it to `/v1/*` (1 MiB),
  `/a2a` (256 KiB), `/mcp` (512 KiB), `/webhooks/*` (512 KiB), `/x402/*` (8 MiB); exercised
  directly by `x402-body-limit.test.ts` and `webhook.body-limit.test.ts`.
- `cache` (`hono/cache`) — **not used**.
- `hono/jsx` — **not used**.
- `toSSG` (`hono/ssg`) — **not used**.
- `proxy` (`hono/proxy`) — **not used**.
- language middleware (`hono/language`) — **not used**.

Of the 27 advisories closed by this upgrade, the ones affecting unused middleware
(serveStatic path traversal, ipRestriction IPv4/IPv6 matching, JWT NumericDate/scheme
validation, cache Vary-header leakage, hono/jsx HTML-injection/context-isolation/XSS
variants, toSSG path traversal, proxy Connection-header handling, language-middleware
ReDoS) were closed as a side effect of the version bump but were never reachable from
Strale's running API. The ones affecting used code (`bodyLimit` chunked-bypass, the CORS
ReDoS via `Access-Control-Request-Headers`, and the HIGH wildcard+credentials CORS finding
addressed above) were the actual load-bearing part of this upgrade.

## Receipt

`archive/receipts/2026-09-03-audit-wp13-hono-upgrade.json` — carries the before/after audit
totals, hono versions, exact commands, and the full reachability table (the `raw` field);
`summary` carries the flat scalar counts per the receipt schema. `npm run receipts:check`
passes (6 receipts checked, ok; the 7 warnings printed are pre-existing
`HANDOFF_BARE_TEST_COUNT` warnings on unrelated older handoff files, not from this batch).

## Not done here (by design, per WP13's own triage)

- `drizzle-orm` (the highest-priority reachable advisory, SQL injection via improperly
  escaped identifiers) is **not** upgraded in this batch — it's a semver-major bump
  (0.38.4 -> 0.45.2+) that the WP13 block explicitly scopes to its own session under the
  DEC-20260504-A regression-test discipline.
- The 5 unreachable advisories (`ip-address`, `js-yaml`, `path-to-regexp`, `shell-quote`,
  `ws`) and the other 4 reachable-but-not-hono advisories (`@coinbase/cdp-sdk`, `axios`,
  `brace-expansion`, `c2pa-node`, `fast-uri`, `form-data`, `sharp`, `undici`) are untouched
  — out of scope for this batch, which was hono only.
- (Removed from this list in a follow-up: the `x402-body-limit.test.ts` FAIL-BEFORE test
  expectation was re-scoped in this session per an architect decision — see finding above.)

## Anything undone / could not verify

Nothing else was left undone within this batch's scope. The moderate/low advisories (7
moderate, 2 low per both audits) were not individually triaged here — WP13's own scope note
says moderate/low triage is "out of this pass's scope"; this batch only touched the
reachable-high-severity hono entry per the program's `upgrade_track` pointer.
