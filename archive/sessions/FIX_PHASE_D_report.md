# Phase D report — P2 medium-severity fixes

Branch: `claude/phase-d-p2-medium-fixes` from `origin/main` at commit
`100f188` (post-hotfix, post-T+6h-CLEAN bake state).

Scope: three Session-0 P2/medium findings (F-0-007 SQL injection defense,
F-0-010 N+1 query, F-0-013 PII in logs) plus one carry-forward from Phase
C Observation #4 (preemptive `backlink-check.ts` SSRF migration).

No schema changes. No migration files. No new dependencies. No SQS
scoring changes. Phase E out-of-scope items (`console.*` migration to
structured Pino calls, Stripe URL derivation, dead code, circuit-breaker
atomicity) deliberately left alone.

---

## Fix 1 — F-0-007: SQL string interpolation → `inArray`

**File**: `apps/api/src/lib/gate4b-solution-dryrun.ts:141`

### What was wrong

```ts
.where(sql`slug = ANY(${sql.raw(`ARRAY[${capSlugs.map((s) => `'${s}'`).join(",")}]`)}::text[])`)
```

Capability slugs were interpolated into a raw SQL array literal wrapped in
single quotes. An apostrophe in a slug would break out of the literal;
every slug was concatenated into the query text rather than bound as a
parameter.

### Why it's worth fixing

Defence in depth. Slugs come from `solution_steps.capability_slug` today,
which are ORM-inserted from operator-authored manifest files. Zero
external injection path today. But:

- The product roadmap explicitly plans third-party providers onboarding
  their own capabilities (see CLAUDE.md "Adding New Capabilities").
- The codebase otherwise uses parameter binding consistently — this line
  is an outlier that would normalize the anti-pattern if copied.

### What changed

`drizzle-orm` has a first-class `inArray(column, values[])` operator that
parameter-binds each value. Swapped the raw SQL for a safe `inArray` and
dropped `sql` from the import (no other use in the file).

```ts
// Before
import { eq, sql } from "drizzle-orm";
// ...
.where(sql`slug = ANY(${sql.raw(`ARRAY[${capSlugs.map((s) => `'${s}'`).join(",")}]`)}::text[])`)

// After
import { eq, inArray } from "drizzle-orm";
// ...
.where(inArray(capabilities.slug, capSlugs))
```

### Test

- `npx tsc --noEmit` passes.
- Full vitest suite (192 pass / 4 skip) unchanged — no test specifically
  exercised the injection path before, because there was no injection
  vector in dev data.
- Manual: the query generated is a standard `IN ($1, $2, …)` clause;
  Drizzle's `inArray` unit tests cover the binding shape.

---

## Fix 2 — F-0-010: N+1 query collapse on `/v1/internal/tests/*`

**Files**:
- `apps/api/src/routes/internal-tests.ts:117-135` (`/capabilities/:slug`)
- `apps/api/src/routes/internal-tests.ts:383-438` (`/solutions/:slug`)

### What was wrong

**`/capabilities/:slug`**: for each of ~7 test suites, one
`SELECT ... ORDER BY executed_at DESC LIMIT 1` to `test_results`. Eight
queries per request (1 suites + 7 per-suite-latest).

**`/solutions/:slug`**: for each of N steps, one `SELECT * FROM test_suites`,
then for each of M suites per step, one
`SELECT ... ORDER BY executed_at DESC LIMIT 1` against `test_results`.
For `kyb-complete-se` (12 steps, ~7 suites per step):
`1 + 12 + 12 × 7 = 97` queries per request.

### Why it's worth fixing

`/v1/internal/*` is rate-limited at 120 req/min per IP. A single attacker
drives `97 × 120 = 11,640` DB queries/minute on one endpoint — on a pool
sized `max: 30` that `/v1/do` shares. Also the N+1 hammers a
`LIMIT 1 ORDER BY ...` on `test_results` which is the highest-write table
in the schema.

The existing 5-min cache hides this only after the first uncached hit.

### What changed

Both endpoints now use a single `DISTINCT ON (test_suite_id)` aggregation:

```sql
SELECT DISTINCT ON (test_suite_id)
  test_suite_id, passed, failure_reason, response_time_ms, executed_at
FROM test_results
WHERE test_suite_id IN (<bound array of suite ids>)
ORDER BY test_suite_id, executed_at DESC
```

For `/capabilities/:slug`: 8 queries → **2 queries** (suites + latest).

For `/solutions/:slug`: 97 queries → **3 queries** (step slugs + all
suites via `inArray` + all latest results via DISTINCT ON). JavaScript
buckets the suites back to their capability_slug and the latest results
back to their suite id via `Map` lookups.

The response shape is unchanged — same fields, same values. The 5-min
cache layer is untouched.

### Test

- `npx tsc --noEmit` passes.
- Full vitest suite green.
- Manual reasoning: the DISTINCT ON ordering matches the prior semantics
  exactly (`ORDER BY test_suite_id, executed_at DESC` picks the latest
  per suite; same as `ORDER BY executed_at DESC LIMIT 1` applied once
  per suite).

### Nominal perf impact

For a 12-step `kyb-complete-se` request:
- Before: 97 round trips × ~2ms each = ~200ms of pure DB wait on cache miss.
- After: 3 round trips × ~4ms each (larger rows) = ~12ms.

Not measured in prod; this is the design math.

---

## Fix 3 — F-0-013: PII and user-enumeration leaks in stdout logs

**Files**:
- `apps/api/src/routes/wallet.ts:25` (`[topup-attempt]`)
- `apps/api/src/routes/wallet.ts:69` (`[topup-session-created]`)
- `apps/api/src/routes/auth.ts:170` (`[key-recovery] user_found=false`)
- `apps/api/src/routes/auth.ts:190` (`[key-recovery] user_found=true`)
- `apps/api/src/routes/auth.ts:367` (`[agent-signup]`)

### What was wrong

- `[topup-*]` logged `email=${user.email}` in plain text on every top-up
  attempt and session creation. PII to Railway's stdout log sink.
- `[key-recovery] email=${email} user_found=false|true` is both PII
  **and** a user-enumeration oracle — anyone with log-read access can
  determine which emails are registered by scanning for matching
  `user_found=true` lines.
- `[agent-signup]` logged both the email and the raw client IP on the
  same line — a tidy per-user dossier.

### Why it's worth fixing

GDPR Art. 5 (data minimization) and Art. 32 (appropriate security). The
product actively markets itself as a GDPR / EU-AI-Act compliance platform;
running `console.log(email)` on a production path is the kind of thing an
auditor flags on first look. The recovery enumeration oracle is also a
security finding on its own, independent of GDPR.

### What changed

All five call sites retain their tag and operational context (user.id,
session.id, amount_cents, flagged flag, timestamp) but drop email and raw
IP:

- `[topup-attempt]`: email removed. user.id, amount, timestamp kept.
- `[topup-session-created]`: email removed. user.id, amount,
  session.id, timestamp kept.
- `[key-recovery] user_found=false` branch: email removed. Just the tag
  and timestamp remain — enough to show a lookup happened, nothing
  identifying.
- `[key-recovery] user_found=true` branch: email replaced with user.id.
- `[agent-signup]`: email and raw IP removed. user.id, flagged flag,
  timestamp kept. The `signupIpHash` column on `users` still captures
  the IP for abuse detection — the cleartext IP just isn't in logs
  anymore.

### Test

- `npx tsc --noEmit` passes.
- Full vitest suite green.
- `grep -nE 'console\.(log|warn|error).*email' apps/api/src/routes/{auth,wallet}.ts`
  returns zero hits.

### Not in scope

F-0-014 (migrate all `console.*` to structured Pino calls) is Phase E and
deliberately untouched. This fix stays within the same logger primitive
and just removes the PII payload.

---

## Fix 4 — Preemptive SSRF migration in `backlink-check.ts`

**File**: `apps/api/src/capabilities/backlink-check.ts`

### What was wrong (defensively)

Two `fetch()` calls to hardcoded third-party hostnames
(`index.commoncrawl.org`, `google.serper.dev`). Today the capability's
user-controlled `domain` input goes into the URL's query string, not its
hostname — so there's no live SSRF surface. Classified as F-0-006 Bucket
D ("user URL-like input exists, but the value never becomes the host we
fetch") in the SSRF inventory.

Phase C Observation #4 raised the concern: if either hostname is ever
swapped to a user-provided value (a product pivot toward "check backlinks
from this user-supplied search backend" or similar), Bucket D flips to
Bucket A with no guard.

### What changed

Both `fetch()` calls now go through `safeFetch` from `lib/safe-fetch.ts`,
which applies `validateUrl` + a DNS-rebinding-resistant dispatcher +
manual redirect re-validation. The Bucket D comment is retained with a
note that the migration was done defensively.

Since both hostnames are public and pass `validateUrl`, `safeFetch` is a
drop-in replacement with no behavioral change in the normal case.

### Test

- `npx tsc --noEmit` passes.
- `node apps/api/scripts/check-ssrf-inventory.mjs` green.
- Full vitest suite green (the SSRF bucket tests still classify the
  capability correctly — the presence of both `safeFetch` AND the
  Bucket D comment is accepted as "guarded by import" by the inventory
  script).

### Cost

None. One extra import, two `fetch` → `safeFetch` swaps, a comment
tweak.

---

## Pre-push verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` (apps/api) | ✅ clean, no errors |
| `npm test` | ✅ 15 files, 192 pass / 4 skip (baseline) |
| `node apps/api/scripts/check-no-bare-catch.mjs apps/api/src` | ✅ `no bare '.catch(() => {})' found.` |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | ✅ `every URL-accepting capability is either protected or has an acknowledging comment.` |
| `grep -nE 'console\.(log\|warn\|error).*email' apps/api/src/routes/{auth,wallet}.ts` | ✅ zero hits |

---

## Files changed

- `apps/api/src/lib/gate4b-solution-dryrun.ts` — F-0-007
- `apps/api/src/routes/internal-tests.ts` — F-0-010 (both variants)
- `apps/api/src/routes/wallet.ts` — F-0-013 (2 sites)
- `apps/api/src/routes/auth.ts` — F-0-013 (3 sites)
- `apps/api/src/capabilities/backlink-check.ts` — Phase C Obs #4

No migrations. No schema changes. No new dependencies.

---

## Deploy notes

- Same deploy model as Phase C: push → CI → merge → Railway auto-deploy.
- No migrations to apply.
- No 48h bake required per the Phase D brief; a smoke-test after deploy
  is sufficient. Targets:
  - `GET /v1/public/ops/tests/capabilities/email-validate` → 200, shape
    unchanged, response time within normal envelope (F-0-010 variant 1).
  - `GET /v1/public/ops/tests/solutions/kyb-essentials-se` → 200, shape
    unchanged, response time meaningfully faster on cache miss
    (F-0-010 variant 2).
  - `POST /v1/do` with a URL capability → no SSRF regression.
  - `POST /v1/wallet/topup` with a test account → `[topup-*]` logs
    visible in Railway, contain user.id, do **not** contain email.
  - `POST /v1/auth/recover-key` with a known and an unknown email →
    `[key-recovery]` logs visible, do **not** contain email.

- Bake window safety nets: the T+24h and T+48h Phase C bake checkpoints
  continue to run on schedule. If either surfaces an anomaly during or
  after Phase D merge, Phase D can be reverted cleanly (one commit,
  no schema impact).

---

## Out of scope (deliberately not touched)

- F-0-011 — circuit breaker state transitions atomicity (low severity,
  Phase E).
- F-0-012 — dead code / one-off scripts in `src/db/*` (Phase E).
- F-0-014 — `console.*` → structured Pino migration (Phase E).
- F-0-015 — Stripe `success_url` derivation from `c.req.url` (Phase E).
- F-0-016 — Stripe top-up has no maximum amount (Phase E).
- Session 0 deferred findings (onboarding engine, test creation, etc.)
  (Session 5).
- Everything in `SESSION_5_CARRY_FORWARD.md` (SCF-1 through SCF-4).
