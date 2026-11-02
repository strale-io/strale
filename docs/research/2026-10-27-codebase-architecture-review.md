---
doc_type: research
type: product
topic: codebase-architecture-review
question: How sound are Strale's codebase and architecture (robustness, maintainability, error detection, autonomy, text truthfulness, quality), and which changes give the highest return?
date: "2026-10-27"
status: current
sources:
  - "apps/api/src/index.ts"
  - "apps/api/src/app.ts"
  - "apps/api/src/routes/do.ts"
  - "apps/api/src/routes/x402-gateway-v2.ts"
  - "apps/api/src/capabilities/auto-register.ts"
  - "apps/api/src/capabilities/index.ts"
  - "apps/api/src/lib/startup-migrations.ts"
  - "apps/api/src/lib/onboarding-pipeline.ts"
  - "apps/api/src/lib/test-runner.ts"
  - "apps/api/src/lib/safe-fetch.ts"
  - "apps/api/src/lib/rate-limit.ts"
  - "apps/api/src/lib/log.ts"
  - "apps/api/src/lib/meta-monitoring.ts"
  - "apps/api/src/lib/transaction-failure-taxonomy.ts"
  - "apps/api/src/lib/capability-field-authority.ts"
  - "apps/api/src/jobs/test-scheduler.ts"
  - "apps/api/src/db/index.ts"
  - "apps/api/scripts/sweep-manifest-drift.ts"
  - "apps/api/scripts/check-platform-facts-drift.ts"
  - "config/env-manifest.yaml"
  - "Dockerfile"
  - ".github/workflows/ci.yml"
  - "server.json"
  - "docs/company/LESSONS.md"
  - "docs/company/CHARTER.md"
  - "docs/company/DAILY-RUN.md"
  - "docs/strategy/2026-10-23-way-of-working-review.md"
  - "https://api.strale.io/health"
  - "https://api.strale.io/v1/capabilities"
  - "https://api.strale.io/v1/platform/facts"
  - "https://api.strale.io/openapi.json"
decisions:
  - DEC-20260815-A
  - DEC-20261023-A
  - DEC-20261024-A
---

# Strale codebase and architecture review (2026-10-27)

**Status: research, nothing applied.** Read-only review of `strale-io/strale`
at `db27bef` (`origin/main`, 2026-10-27). No application code, production
data or setting was changed. Public read-only GETs to `api.strale.io` were made
on 2026-10-27 around 13:00–14:00 Swedish time. No production database, Railway
or log access was available, so every statement about production internals that
is not visible from outside is marked as inference.

The 2026-10-23 way-of-working review
(`docs/strategy/2026-10-23-way-of-working-review.md`, "the WoW review") covers
process, rules and paperwork. This review covers code and architecture. Where
the two overlap it says so, and §3.4 says where it disagrees.

Method: six read-only evidence sweeps (architecture and money paths; deploy and
robustness; maintainability; observability and self-healing; text drift; tests,
security and other angles), each spot-checked by the author against the code,
then an adversarial read by a separate reviewer. Commands and counts are given
inline. Confidence: **high** = read directly in code or measured; **moderate**
= read in code but its production effect is inferred; **low** = plausible,
not verified.

---

## Summary for Petter (plain English)

**Verdict.** The core of the product is better built than the incident
history suggests. The money handling (wallet, x402 payments) is careful and
well tested. Web fetching is well protected against abuse. The full unit suite
passes and real database tests run in CI. The weak side is not "bad code". It is
**the gap between "the code is right" and "production is actually running it,
and someone would notice if it stopped"**. Today that gap is closed by a person
or a daily Claude run looking, not by the system itself. Today's failed deploy
is the textbook case. CI was green, but production silently kept the old
version, and nothing automatic flagged it. The next merge happened to deploy
and cover it up.

**The five most important things, and what each costs.**

1. **Nothing automatic checks that a merge actually reached production.** CI
   never builds the real server image or starts it. Only the daily run
   compares, by hand, what production runs with what was merged. At about 13:30
   Swedish time today, production was still serving `7935b24` while `main` was
   at `db27bef`. By 14:10 the next merge (`28d11b2`) had deployed and hidden the
   gap. Fix: an automatic check after every merge that production reports the
   new version within 15 minutes, and a CI step that builds and boots the real
   image. *Cost: about 2 days of engineering, no spend.* Along the way we found
   that a fresh database cannot boot today because of a missing index. That
   shows boot is not exercised in CI.
2. **When something breaks, nobody is told unless they look.** Production
   logs stay in Railway's own viewer, with no alerting on errors (the log
   service key is not set). The watchdog
   that checks whether background jobs are alive runs inside the very process
   it watches, and the daily run is the main alarm. Fix: an outside "is
   everything still ticking?" check every 30 minutes that emails on failure.
   *Cost: about 2 days, no spend (GitHub Actions is free). Sending logs to an
   outside log service is your decision. It means customer inputs reach a new
   supplier, and it may cost money.*
3. **A slow supplier can stall the API and waste money.** For a normal paid
   call, the server holds a database connection and locks the customer's
   wallet for the whole time it waits on the outside supplier. There are 30
   connections, so about 30 slow calls at once stall everything, including
   payments, for up to 15 seconds at a time. When the database gives up on a
   stuck call, the supplier call keeps running and costing money, and the
   customer is not charged. The request's own timeout setting is read but never
   used. Fix: reserve the money first, call the supplier without holding the
   lock, then settle, the way longer jobs already work. *Cost: about 1 week,
   engineering only.*
4. **Public descriptions drift from what is live, and nothing notices.** 260 of
   298 live tools show different "limitations" text than the reviewed copy in
   the repo. That copy was merged today and waits for a manual sync run. Nothing
   automatic would ever have flagged it. Tools also promise certain output
   fields "always" appear, and that promise is never checked against real
   customer calls. Fix: sync text automatically on deploy and check it daily.
   *Cost: about 3–4 days, engineering only.*
5. **We cannot see our margin per call.** Supplier and AI costs are not
   recorded per call. 88 tools use the Anthropic API, none record token use,
   and a call can quietly retry up to 6 times. Fix: record cost on each call
   and produce a daily margin-per-tool view. *Cost: about 3 days, engineering
   only.*

Everything else in the action list (§10) is engineering-only clean-up, apart
from three items that touch spend or public text and are marked for you.

---

## 1. What is good, what is not (architecture of `apps/api`)

### 1.1 Shape of the system (facts, high confidence)

- `apps/api/src` has 1,103 `.ts` files and 249,491 lines, of which 170,841 are
  not tests. 19 files exceed 1,000 lines
  (`find apps/api/src -name '*.ts' | xargs wc -l | sort -n`).
- **Routes.** `app.ts` (733 lines) mounts 43 routers. The biggest are
  `routes/do.ts` (3,251), `routes/x402-gateway-v2.ts` (2,074),
  `routes/internal-tests.ts` (1,625) and `routes/admin.ts` (946). `/v1/do` is a
  middleware chain (`rateLimitByIp` → `optionalAuthMiddleware` →
  `rateLimitByKey`, `do.ts:608-613`) in front of one large handler. That handler
  covers idempotency (727-813), x402 verification (~880), input checks
  (1160-1290) and dispatch to four executor functions that take 10 positional
  arguments each (`do.ts:1371-1379`).
- **Executors.** There are 354 executor files and 355 manifests.
  `auto-register.ts:457-510` dynamically imports each manifest slug's executor
  at boot, skipping a DEACTIVATED map of 41 slugs. The only contract is
  one shared type, `CapabilityExecutor = (input: {[k]: unknown}) =>
  Promise<{output, provenance}>` (`capabilities/index.ts:8-23`). Input and
  output schemas exist only as data (manifest and DB), not as types.
- **DB.** `db/schema.ts` defines 39 tables in 1,610 lines. There is no
  migrations folder. Production schema changes come only from
  `lib/startup-migrations.ts` (6,828 lines, 68 blocks, 68 ledger entries), and
  **all 68 blocks run on every boot** (`runStartupMigrations`, ~4481-4518).
  649 lines of non-test source use raw `sql\``, 293 of them in the migrations
  file.
- **Packages.** There are 13 directories under `packages/`. `strale-mcp`
  (0.2.8, 1,354 lines) has no tests. The TypeScript SDK has 2. Four Python
  framework packages have 1 each. Three packages are only a `DEPRECATED.md`.

### 1.2 Strongest parts

1. **Money ledger discipline (high).** Every balance change is a delta with a
   ledger row, written through one module (`lib/wallet-service.ts:1-30,111`).
   Async and solution runs use durable reservations with a reconciler
   (`lib/wallet-reservations.ts`, `jobs/reservation-reconciler.ts`). Charging
   happens only after success (DEC-14). Idempotency keys carry a fingerprint
   and reject mismatched reuse (`do.ts:757-813`).
2. **x402 failure modes are designed, not accidental (high).** The order is
   verify → replay lookup → validate → execute → settle → record. Nothing is
   settled on failure (`x402-gateway-v2.ts` ~1739-1800). A durable settlement
   intent is written before the irreversible call
   (`lib/x402-settlement-intent.ts`). Orphans are captured (`:963-990`), and a
   unique index on the payment hash backs replay protection
   (`schema.ts:559-561`).
3. **Outbound fetch safety (high).** `lib/safe-fetch.ts:40-106` re-validates
   every resolved IP inside the socket lookup, which closes DNS rebinding.
   Redirects are followed by hand and re-checked on each hop (`:223-284`), and
   `lib/url-validator.ts:29-95` blocks private, loopback, link-local, CGNAT and
   cloud-metadata ranges. Three CI lints enforce its use.
4. **Boot is honest about some failures (high).** There is an executor-count
   floor, a refusal to boot without a deploy identity (`index.ts:59-87`), schema
   validation after migrations (`:182`), and a content-hashed migration ledger
   enforced by `migrations:check`.

### 1.3 Weakest parts

1. **`routes/do.ts` is the money path and the largest, least typed file (high).**
   It has 3,251 lines, 29 `as any` casts and 14 untyped `c.get(... as any)`
   context reads. The x402 settlement logic is written out three times:
   `do.ts:1604-1640`, plus a capability copy and a solution copy in
   `x402-gateway-v2.ts`. It changed in 21 commits since 2026-08-01.
2. **Request input validation is shallow (high).** Only required fields and
   anyOf/oneOf groups are checked (`do.ts:1196-1290`,
   `lib/x402-input-validation.ts`). There is no type, format or enum check
   against `input_schema`, and zod appears in only 6 files. Executors cast
   `input.x as string` themselves, so a number where a string is expected
   becomes a `TypeError` in the executor.
3. **Schema management is one ever-growing file that runs all of itself on
   every boot (high), without the safety one would expect (moderate).** The
   runner is a sequential loop with no wrapping transaction and no advisory lock
   (`grep -n advisory apps/api/src/lib/startup-migrations.ts` returns nothing).
   Advisory locks exist only for jobs (`index.ts:232,240`). A throwing block
   leaves earlier blocks committed and the boot failed. Frozen data payloads now
   live in `lib/` as well (`lib/catalogue-copy-0123.ts` is 3,078 lines). It is
   the most-changed file in the API (37 commits since 2026-08-01).

### 1.4 The five biggest structural risks, ranked

| # | Risk | Evidence | Confidence |
|---|---|---|---|
| 1 | **CI green does not mean deployed and booting.** No image build, no boot, no post-merge version check. A fresh DB cannot even boot today. | §2.1 | high |
| 2 | **Sync paid calls hold a pooled DB connection and the wallet row lock across the vendor call.** Pool max is 30 (`db/index.ts:80`). The executor runs inside `db.transaction` (`do.ts:2069-2161`, see the comment at 2071-2075). The bound is `SET LOCAL idle_in_transaction_session_timeout = '15s'` (`do.ts:2080`). It frees the slot after 15 s, so the impact is repeated stalls of up to 15 s under about 30 concurrent slow calls, not a permanent freeze. **The executor gets no abort signal.** After the kill it keeps running, up to the 10-minute LLM SDK timeout with retries, so vendor cost is spent, the debit fails and the caller's request hangs. `timeoutSeconds` is computed (`do.ts:669`) and never read again. | read in code; the kill behaviour and saturation threshold are inferred, not tested | high (mechanism), moderate (impact) |
| 3 | **Alerting lives inside the process it watches.** There is no external log sink, no error tracker and no external dead-man check (§4). | §4 | high |
| 4 | **The startup-migration monolith runs every boot**, with no lock and no transaction, and every boot gets slower as blocks are added. That is pre-listen work inside a 20 s healthcheck window (`index.ts:157-170`). | §1.3, §2.1 | moderate |
| 5 | **Executor import failures are silent.** A failing import is one log line (`auto-register.ts:497-500`), and boot fails only below 200 executors (`index.ts:10,21`) out of about 326 that load. A tool can stay listed and x402-enabled with no executor behind it. | code | high (mechanism), low (current occurrence: today 0 import errors at `db27bef`) |

Runners-up:
- **x402 concurrent-replay window (moderate).** The duplicate check runs before
  execution, but the unique row is written after settlement, so two identical
  concurrent requests can both execute at Strale's cost. Double settlement
  depends on the facilitator rejecting the reused nonce.
- **Per-process rate limits (moderate).** `lib/rate-limit.ts:5,25-35` says so
  itself. The limits multiply with replicas, and requests with no IP header skip
  them (`:171`).

---

## 2. Robustness

### 2.1 The gap between "CI green" and "running in production"

**Live example.** PR #767 (`db27bef`) was committed at 13:14 Swedish time on
2026-10-27. Two readings of `GET https://api.strale.io/health`:

| Time (Swedish) | Served commit | What it is |
|---|---|---|
| about 13:30 | `7935b242a0ac` | PR #766, the previous version, while `main` was at `db27bef` |
| 14:11 | `28d11b2aeb0d` | PR #768, the next merge, which deployed and superseded the gap |

So `db27bef` itself was apparently never served. The next merge then hid that,
and nothing automatic recorded it. `/health/version` does not exist (404). The
other session owns the investigation. This section only maps the gap.

What the deploy does (facts, high):
- The `Dockerfile` is single-stage `node:20-slim`. It copies only
  `apps/api`, `packages/{sdk-typescript,mcp-server}`, `manifests/` and
  `tsconfig.json`, runs `npm ci`, builds mcp-server and then the API, and starts
  with `CMD node apps/api/dist/index.js`. There is no `.dockerignore`.
- **The Railway configuration is not in the repo.** There is no
  `railway.json` or `railway.toml`. `apps/api/railway-config.md:46-47`
  describes a `/health` healthcheck and an `apps/api/Dockerfile` that does not
  exist. The comment at `index.ts:157-170` says production actually uses
  `/health/deep` with a 20 s window, and cites a 2026-08-23 deploy where a good
  build failed health checks and an unchanged redeploy went green.
- **Everything runs before `serve()`.** Boot does, in order:
  1. auto-register;
  2. the alerting check;
  3. deploy identity;
  4. the x402 facilitator check;
  5. all 68 migrations;
  6. schema validation;
  7. the cost-class invariant;
  8. imports the app;
  9. starts the job coordinator and about 15 schedulers.

  Only then does it call `serve()` (`index.ts:15-320`).

What CI does and does not do (facts, high; `.github/workflows/ci.yml`):

| Check | In CI? |
|---|---|
| Real Postgres service | **Yes** (`integration-db` job, `:150-239`) |
| Startup migrations against that DB | **Yes**, through `scripts/apply-startup-migrations.ts` (`:216-220`), not through boot |
| Integration tests on wallet, idempotency, spend cap, settlement | **Yes**, fail-closed when the DB is missing (`:235-239`) |
| Build the real `Dockerfile` | **No** (no `docker build` in any workflow) |
| Emit `apps/api/dist` | **No** (`tsc --noEmit` only, `:291`) |
| Boot `index.ts` and hit `/health` | **No** |
| Verify that production serves the merge SHA | **No** |
| Alert on a failed Railway build or health check | **No** (boot fatals email via `index.ts:359-379`, but only if the process starts and then dies) |

The only deployed-SHA check is a manual step in the daily run
(`docs/company/DAILY-RUN.md:168-169`).

**Reproduction (high).** The deploy sweep extracted exactly what the
Dockerfile copies at `db27bef`, compiled it, and booted `node
apps/api/dist/index.js` against a fresh Postgres 16. 326 executors registered
with 0 errors, migrations took 268 ms, the server listened at about 3.1 s, and
`/health` reported `db27bef88531`. The reproduction reused the main checkout's
`node_modules` rather than a fresh `npm ci`, but `db27bef` changes neither
`package.json` nor the lockfile. So the failure is not a compile error, a missing
build-context file or an import crash. It was either something about the
production environment (DB state, healthcheck timing, env) or a transient
Railway build or health failure. The 2026-08-23 precedent was of the second
kind. Only Railway's log can settle it, and this review does not guess
further (moderate).

**Found on the way (high): a fresh database cannot boot.** `drizzle-kit push`
creates the `integrity_hash` column but not `transactions_integrity_hash_idx`.
The index is created only inside block 0030 (`startup-migrations.ts:142-160`),
which skips itself when the column already exists. Boot's `validateSchema` then
fails with `StartupFatalError` on that index. This was reproduced, and adding the
index by hand made boot pass. It does not affect production, which has the index.
But it means boot is not exercised in CI. CI's `apply-startup-migrations.ts`
never calls `validateSchema`. A disaster-recovery
rebuild from `schema.ts` would not boot without a manual step.

**Proposed closures:**

| Closure | What | Effort |
|---|---|---|
| A. Fresh-DB bootability | New block (or `schema.ts` index) creating `transactions_integrity_hash_idx` unconditionally. Prerequisite for B. | S |
| B. Pre-merge image smoke | In `integration-db`: `docker build .`, run the image against the Postgres service with `RAILWAY_GIT_COMMIT_SHA=$GITHUB_SHA`, poll `/health/deep` for at most 20 s (Railway's budget), assert `/health.commit` equals the SHA, and fail on `Fatal startup error`. Covers build context, emit, boot order, migrations, schema validation and boot time. | M (1 day) |
| C. Post-merge deploy check | A `push: main` workflow polls `/health` every 30 s for up to 15 min. If `commit` is not the merge SHA, the job fails, opens or refreshes a GitHub issue and emails through the existing Resend path. Plus a 30-minute scheduled comparison of `origin/main` with the served commit. | S |
| D. Railway config as code | `railway.json` with dockerfile path, `healthcheckPath`, `healthcheckTimeout` and restart policy. Correct `railway-config.md`. Size the healthcheck timeout against measured worst-case pre-listen time, not 20 s. | S (needs someone with Railway access to confirm the live settings) |
| E. Listen first, then become ready | Call `serve()` early with `/health` returning 503 until boot work finishes. This separates "process is up" from "ready" and gives Railway a readable failure. | M |
| F. Railway deploy-failure webhook into `sendAlert` | Catches build and health-check failures that never start the process. | M (needs Railway access) |

### 2.2 Silent failure, unbounded work, missing timeouts (facts, high, unless marked)

- **Catches.** A brace-matching scan of non-test `apps/api/src` found 537
  catch blocks. 175 neither rethrow nor return, 66 only log, 76 contain only a
  comment, and 1 is empty (`jobs/invariant-checker.ts:192`). There are also 76
  `.catch(() => …)` sites, 34 of which return a neutral value. Important
  examples:
  - `x402-gateway-v2.ts:985`: a settled payment whose both writes failed is
    only logged, on a money path;
  - `lib/job-coordinator.ts:657`: a failed poll cycle is only logged;
  - `lib/alert-once.ts:60`: failing to record an alert is only logged.

  Many of these are intentionally best-effort (moderate). The issue is that a
  log line is the only trace, and logs are not collected (§4).
- **Timeouts.** Outbound `fetch` is well covered: 227 call sites against 319
  signal uses, enforced by `check-fetch-timeout-coverage --strict`
  (`ci.yml:374`). Only `capabilities/http-to-curl.ts` and `lib/tos-blocklist.ts`
  have none. Two gaps remain:
  - **The sync request path has no wall-clock timeout** (risk 2).
  - **93 of 94 `new Anthropic()` sites (in 92 files) use SDK defaults**; only
    `lib/search/smart.ts:185` sets its own. The defaults are a 10-minute timeout
    and 2 retries, under an outer transient retry. So one call can make up to 6
    LLM requests (moderate: the stacking is read in code, the frequency is not
    measured).
- **Silent env defaults.** There are 48 `process.env.X ||`/`??` fallbacks, 14
  of them to `""`. Example: `lib/attribution.ts:104` (`AUDIT_HMAC_SECRET ?? ""`)
  disables hashing with only a warning. `config/env-manifest.yaml` and
  `env:check` document the env vars, but they do not prove a required one is set
  in production.
- **Single points of failure.** These are:
  - one Postgres with a pool of 30;
  - all schedulers in-process in every replica (the coordinator uses DB leases,
    but 10 `setInterval` timers do not, for example `settlement-reconciler.ts:300`
    and `integrity-hash-retry.ts:451`);
  - Anthropic, used by about 88 executors;
  - Browserless, used by about 34–37.

  The replica count is unknown from outside (low).

---

## 3. Maintainability

### 3.1 Size and coupling (facts, high)

The hot spots are `startup-migrations.ts` (6,828 lines, 37 commits since
August), `do.ts` (3,251, 21), `x402-gateway-v2.ts` (2,074, 21) and
`test-runner.ts` (2,265, which imports about 25 lib modules and has two imports
in the middle of the file at `:1753-1754`). The most-imported lib modules are
`log` (127 files), `models` (93), `capability-refusal` (75), `resource-limits`
(71) and `safe-fetch` (46). These are healthy central seams. No cycle analysis
was possible, because neither madge nor dpdm is installed.

### 3.2 Duplicated logic (facts, high)

- **Nested-path lookup exists five times:**
  - `lib/test-runner.ts:1990`
  - `lib/auto-remediation.ts:623`
  - `db/audit-tests.ts:77`
  - `scripts/sweep-paid-fixtures.ts:61`
  - `scripts/sweep-prod-catalog.ts:95`

  The first three are byte-identical.
- **The onboarding verifier disagrees with the test runner.**
  `onboarding-pipeline.ts:338-342` reads `output[ef.field]`, so it sees
  top-level keys only, while `test-runner.ts:1884,1990` resolves dotted paths.
  `--discover` and `--fix` also see only top-level keys (`:418,433-470`). So a
  dotted `expected_fields` entry would fail onboarding and pass scheduled tests.
  The bug is latent today: 0 of 2,247 manifest `field:` lines are dotted. It is
  real the moment someone writes one.
- **Other duplicated helpers:**

  | Helper | Copies | Where |
  |---|---|---|
  | `levenshtein` | 4 | while a shared `lib/company-name-match.ts` exists |
  | `withTimeout` | 3 | |
  | Company-name normalisers | 3 | `lib/invoice-counterparty/name.ts:21`, `lib/company-name-match.ts:78`, `lib/entity-validation.ts:16`; inconsistent matching risk (moderate) |
  | Country-name maps | 10+ | `routes/do.ts:249` among them |
  | Error-sanitising helpers | 4 | LESSONS F5 incident 11 was a bug from passing the sanitised string to a classifier |

- **Four failure classifiers keyed on message strings:**
  `transaction-failure-taxonomy.ts`, `failure-classifier.ts`,
  `circuit-breaker.ts:158-216` and `self-heal.ts:19-28`. Some of the
  differences are deliberate (`taxonomy.ts:10-19`). But this is the F8
  (duplicated authority) shape: a new vendor error string is unclassified in
  some of them and misfiled in others (moderate).

### 3.3 Dead code and stale text (facts, high)

- **SQS leftovers.** The SQS schema clean-up ("PR2") never landed:
  `qp_score`, `matrix_sqs` and `matrix_sqs_raw` remain in `db/schema.ts:240-244`
  and `:1031`. `capability_health` is still named in 19 files, and the planned
  `source_health` in only 2. `lib/trust-helpers.ts:356-357` still tells readers
  "Do NOT modify sqs.ts patterns". `sqs.ts` was deleted in May.
- **Unused exports.** About 38 of 1,064 `lib/` exports appear unreferenced, by
  a token-count heuristic. Treat the count as approximate. A similar check
  wrongly flagged `lib/limitation-repair.ts` as unused, but
  `apps/api/scripts/repair-limitation-titles.ts:73` imports it. They include an SQS-era cluster in `trust-labels.ts` and `trust-grade.ts`, and
  `wallet-service.readBalance`.
- **Header contradicted by code.** `lib/quality-floor.ts:30-33` says "Promotion
  is NOT automatic in v1", while `jobs/capability-promotion.ts` does exactly
  that.
- **Stale `server.json`.** It is at version `0.2.3` against `strale-mcp`
  `0.2.8`, and says "250+ quality-scored capabilities" and "5 capabilities work
  without a key" (facts: 298 visible, 11 free-tier, SQS retired).
- **Deactivated executors kept on disk.** 28 of the 41 DEACTIVATED slugs
  still have executor files (about 3,600 lines). Some are kept on purpose, so
  `getDirectExecutor` can refuse them.

### 3.4 Guard scripts and the governance machinery

Facts (high):
- The root `package.json` has 61 scripts, 38 of them checks or tests.
  `apps/api` has 10 more. There are 8 workflows. `ci.yml` has about 66 `run:`
  steps across 3 jobs.
- Root `scripts/` is 27,052 lines. About 17,800 of them are governance (project
  context, decision records, programs, research, receipts, archive index, M2,
  protocols, digest, candidates, handoff) and about 9,200 are product or
  operations guards. A further 660-line CEO-brief linter lives inside the API
  runtime tree (`apps/api/src/lib/ceo-brief-lint.ts`).
- Of the last 300 commits (2026-08-31 to 2026-10-27), 82 touched product source
  (`apps/api/src`, `manifests`, `packages`, `apps/web`) and 218 did not. The 218
  include 17 merge commits, which `--name-only` lists without files. Commit
  counts are not effort, but the direction is clear. The product share began
  rising before the WoW review and rose further after it. Product-touching
  commits per block of 50, newest first:

  | Block (newest first) | Product-touching commits of 50 |
  |---|---|
  | 1 | 35 |
  | 2 | 23 |
  | 3 | 10 |
  | 4 | 2 |
  | 5 | 8 |
  | 6 | 4 |

  The newest block covers 23–27 October.
- What has caught real defects:
  - LESSONS records that two of four F6 stale-claim incidents were caught by
    drift guards (`LESSONS.md:721`).
  - F10 and F11 incidents: "none was caught by a control"
    (`LESSONS.md:1258-1259,1374`).
  - The documented catches by governance checkers are mostly bugs in the
    checkers themselves. The claims scanner was "hollow end to end"
    (`LESSONS.md:655-670`).
  - The product checks (`migrations:check`, `models:check`, the integration DB
    job, the SSRF and timeout lints) are tied to real incidents.
  - No commit since August credits a governance check with catching a product
    defect. That is absence of evidence, so moderate.

**Keep, merge or delete (code-side, adding to the WoW review's tables):**

| Item | Verdict | Why |
|---|---|---|
| `migrations:check`, `models:check`, `env:check`, `check-framework-packages`, `guard-production-write-access`, integration-DB job | **keep** | Cheap, tied to real incidents, product-facing. |
| The three fetch guards (`check-ssrf-inventory`, `check-no-unguarded-user-fetch`, `check-fetch-timeout-coverage`) | **merge** into one call-site check | They walk the same `fetch(` sites with three regex sets. Better: one wrapper that is the only allowed `fetch` in `capabilities/`, plus one lint. |
| `check-platform-facts-drift.ts` | **merge into `claims:check`**, and widen its file list | It scans 4 backend files and misses every README, `server.json` and `package.json` description (§6), and has a 3-in-5 false-positive history (`LESSONS.md:740-748`). |
| `ceo-brief-lint.ts` in `apps/api/src/lib` | **move** out of the runtime tree | It is not product code, and it ships in the image. |
| Group-G governance (context, candidates, digest shadow, protocol coverage, about 18k lines) | **delete after T7**, as the WoW review says | Agree. |
| Missing: shared `getByPath` plus an agreement test; dead-export check (knip or ts-prune); "every gate fails on an empty input set" (F5's open finding) | **add** | These guard product correctness, not paperwork. |

**Where this review disagrees with the WoW review.**

1. **What it calls "product checks" is not enough.** The WoW review counts
   the CI failures from paperwork checks and concludes that the product checks
   are fine. This review's finding is that the product checks are fine *for what
   they look at*. The failures that actually reached production in 2026 were
   silent:
   - deploy not happening;
   - jobs failing quietly;
   - a published package degraded;
   - stale public copy.

   No check of any kind is pointed at those. Trimming paperwork recovers time,
   but it does not close the gap. §2 and §4 do.
2. **"One line when green" for the daily run.** The WoW review's step-0 item 4
   is now adopted (DEC-20261024-A). Today the daily run is the only alarm for
   several failure classes: deployed-SHA drift, dead scheduled workflows,
   multi-day invariant patterns. Shortening its *report* is fine. But its checks
   must move into automated alerts (§4, §5) before anyone relies on "green"
   meaning green. Otherwise "green" just means "nobody looked hard".

---

## 4. Spotting and handling errors

Facts (high, unless marked):
- **Logging.** The logger is pino (`lib/log.ts:14-34`), with structured
  `logError`/`logWarn` carrying a kebab-case `label` (335 calls). Executors make
  0 `console` calls, enforced by `lint:no-new-console`. **Production logs go only
  to Railway stdout.** They are searchable in Railway's viewer, but nothing
  alerts on them and their retention is Railway's. The Better Stack transport is wired (`log.ts:16-21`), but
  `BETTER_STACK_SOURCE_TOKEN` is `set_in: none` (`config/env-manifest.yaml:209-217`).
  There is no error tracker, and no pino `redact` configuration.
- **Error taxonomy.** `transaction-failure-taxonomy.ts:31-39` is a good piece of
  work. It defaults to `unclassified` rather than `internal` after F1 (82% of
  47,582 "internal" failures were misattributed). It feeds the quality floor,
  the invariant checker, billable flags (`execution-outcome.ts:373`) and
  customer advice (`errors.ts:111`). There are 29 error classes, including
  `CapabilityRefusalError`, `SourceBlockedError` and `VendorUnavailableError`.
  Only 31 executors use the structured `inputRefusal`; about 280 files still
  `throw new Error(...)`.
- **Health and breakers.** The breaker opens after 3 failures, backs off from 5
  to 30 minutes, and closes on passing test evidence (`circuit-breaker.ts:14-82,
  397-430`). The quality floor quarantines below 70% on 10 or more calls, at
  most 3 per run, and is armed in production per the env manifest. Promotion
  reverses quarantines. The vendor control tower suspends and restores tools on
  a vendor failure or exhaustion. Dependency probes buffer and de-duplicate
  alerts (`intelligent-alerts.ts`).
- **Alerting channels.** Resend email (`lib/alerting.ts:127-215`), GitHub
  issues from `weekly-drift.yml`, and the daily run. `WEBHOOK_URL` is
  `set_in: none`. The older digest cron was last seen 2026-04-14.
- **Dead-man check: circular.** `checkSchedulerHeartbeat`
  (`meta-monitoring.ts:774-822`) runs inside the test scheduler's own loop
  (`test-scheduler.ts:659-668`), and its comment admits it cannot see "the
  truly-stopped case". The backstop script `apps/api/scripts/meta-monitoring-run.ts`
  is not scheduled in GitHub Actions (`grep -rn meta-monitoring-run .github` is
  empty). Its header describes a Railway invocation, which this review could
  not verify (low). Either way, it would run on the same platform it watches.
  `/health` reports only status and commit.

**Where an incident would go unnoticed for days (moderate: mechanisms read
in code, durations inferred from history):**

| Failure | Signal today | Missing |
|---|---|---|
| Scheduler or job coordinator stalled while HTTP is up | in-process heartbeat; `/health` says ok | an outside check of `job_schedule` freshness and heartbeat age |
| A job failing on every tick (the retention class) | `consecutive_failures` written to `job_schedule` | anyone reading it, or a threshold alert |
| An error logged and never read | stdout only | a log sink with an error-rate alert |
| Deploy failed while the build succeeded (today) | the daily run's manual SHA check | post-merge check §2.1 C |
| Published package degraded (strale-mcp, about 3.5 months) | manual post-publish smoke test | a scheduled `npx -y strale-mcp` contract probe |
| A scheduled GitHub workflow dead (weekly-drift had 5 failed runs; last green 2026-08-10 per `DAILY-RUN.md:150-170`) | `scheduled:outcomes`, during the daily run only | an automatic failure notice |
| A rotated or invalid vendor key | `config` class in the taxonomy | an alert on a `config`-class spike |
| Growth in unclassified failures | they leave the denominator | a trend alert |
| Paid tools quietly degrading | real traffic only; paid tools are never scheduled-tested | guaranteed-field checks on real traffic (§6) |

---

## 5. Autonomy and self-healing

**Already automatic (facts, high).**
- **Retries:** one transient retry (`lib/retry.ts:66,125`).
- **Fallbacks:** 60 executors mention a vendor fallback.
- **Breakers:** half-open recovery.
- **Vendor tower:** suspends and restores capabilities.
- **Quarantine and promotion.**
- **Test-input repair:** stale dates, dead URLs, field renames
  (`lib/self-heal.ts`, `lib/auto-remediation.ts`).
- **Fixture re-capture:** with a failure counter.
- **Job leases:** recovery and back-off.

That is a lot already. What is missing is the *outer* loop: noticing that the
machinery itself stopped, and acting on the deploy.

Everything below sits inside CHARTER.md's "decide, then tell" list (turning
services on and off, quarantine and promotion, retries, delisting, refunds, and
spend under €50/week). None of it needs spend, a contract or a public act. The
exceptions are named in each design.

**Top three designs:**

1. **External dead-man and deploy watchdog.**
   - *Signal:* a GitHub Actions cron every 30 minutes calls an extended
     `/health` that also returns: scheduler heartbeat age; overdue
     `job_schedule` rows (more than 2× their interval) and rows with
     `consecutive_failures` of 3 or more; the served commit; and the oldest
     unsettled x402 intent. The detail goes on an admin-authenticated endpoint
     (for example `/v1/internal/health/jobs`), not the public `/health`. Job
     failures and unsettled payments are not public information. The public
     `/health` stays coarse.
   - *Action:* email once through the existing Resend path and open or refresh a
     GitHub issue. If the commit does not equal `main` 15 minutes after a merge,
     retry the deploy once (Railway API).
   - *Bound:* one automatic redeploy per merge and one alert per incident, with
     de-duplication.
   - *Stays human:* any second failure, rollback to an older version when the new
     one cannot boot (which needs a judgement about what broke), and anything
     touching production data.
   - *Prerequisite:* a Railway API token in GitHub secrets. That is a
     credential, not spend, but it is a new production write path, so Petter
     should confirm it.
2. **Credential and config failure auto-suspend.**
   - *Signal:* `classifyTransactionFailure === "config"`, or a 401/403 from our
     own vendor key, on 3 or more calls within 1 hour for one provider.
   - *Action:* suspend the dependent tools through the existing
     `suspendRequiredCapabilities` path, refund the affected calls under the
     existing policy, and email once.
   - *Bound:* the provider's tools only, and restore on a credential fingerprint
     change, as the tower already does.
   - *Stays human:* rotating a key that needs a vendor login, payment or a new
     contract.
3. **Text and contract self-check after deploy** (the mechanism in §6).
   - *Signal:* the post-deploy sync finds a difference between the DB and the
     reviewed manifest, or real traffic shows a "guaranteed" field missing in
     more than X% of N calls.
   - *Action:* apply the reviewed manifest text (the manifest is already
     authoritative for these columns per `capability-field-authority.ts:56-100`),
     or downgrade the field's reliability claim in the public view and file the
     manifest change as a PR.
   - *Bound:* text columns the manifest owns. Never price, never activation.
   - *Where it runs:* in-process at boot, under the existing
     `catalogue_metadata_sync` authority (`lib/production-authority.ts:107`).
     A GitHub post-deploy job would need a new production write credential,
     which is Petter's call (CHARTER.md "no write credential").
   - *Stays human:* any *widening* claim (DEC-20260822-A narrows only), pricing,
     and **any change to a compliance or methodology tool's public claims**
     (sanctions, PEP, adverse media, KYB). CHARTER.md:91-99 keeps
     regulator-readable claims with Petter in both directions, so for those
     tools the self-check reports and Petter publishes.

Also worth doing, smaller:
- scheduled production contract probes for the published packages, read-only;
- one automatic re-run of a red scheduled workflow;
- moving the 10 lease-less `setInterval` jobs under the coordinator.

---

## 6. Do descriptive texts stay true?

**How text flows (facts, high).** Manifests are the authoring surface.
`lib/capability-field-authority.ts:56-100` makes the manifest authoritative for
name, description, category, schemas, data source, `output_field_reliability`
and limitations. The DB is authoritative for price, free tier, transparency tag
and activation. The claim "the DB copy changes only on onboarding or backfill"
is **mostly true**, with three refinements:
1. no sync runs at boot;
2. copy rewrites now ship as hand-built, append-only startup-migration blocks
   with frozen old and new values (block 0123 for 296 names and descriptions,
   block 0124 for descriptions);
3. prices are DB-authored after creation, so a manifest price is only a seed.

**Measured drift, production against manifests (facts, high; 298 public tools,
read 2026-10-27).**

| Field | Tools that differ |
|---|---|
| description | 0 (blocks 0123/0124 synced them) |
| price | 0 |
| category | 0 |
| name | 1 (`social-profile-check`) |
| data_source | 2 |
| transparency_tag | 1 (`japanese-company-data`: production `ai_generated`, manifest `algorithmic`, after #762 today) |
| `input_schema.required` | 3 |
| `output_schema` property sets | 7 |
| `output_schema.required` | at least 1: 4 manifests declare it (`paid-api-preflight`, `entity-resolve`, `invoice-counterparty-check`, `secure-random`); live `paid-api-preflight` serves none |
| **limitations** | **260** (243 titles, 136 texts, 55 counts) |

The limitations drift is the reviewed rewrite from #756 (`d193c46`, today),
which waits on a manual backfill run. One spot check:
`/v1/public/ops/limitations/capabilities/iban-validate` still serves the old
title, while `manifests/iban-validate.yaml:72` has the new one. The point is not
that a backfill is late. It is that **no check would have flagged the
difference, today or in a month.**

Other drift:
- Four package READMEs say "27 countries" (facts: 25).
- `packages/mcp-server/README.md:146` says "81 solutions" (facts: 95).
- `server.json` is stale (§3.3).
- `/openapi.json`: all 25 documented non-x402 paths are real, but at least 9
  live public routes are undocumented, including `/v1/platform/facts`,
  `/v1/transactions/{id}/verify` and `/v1/public/ops/*`, and no test compares the
  spec with the route table.
- `llms.txt` is generated live from facts and matched production ("298 tools,
  25 countries").

**What the existing guards check, and miss (facts, high):**

| Guard | Runs | Checks | Misses |
|---|---|---|---|
| `sweep-manifest-drift.ts` | weekly, against the real DB | 9 fields plus `input_schema` | name, description, category, price, `output_schema`, **limitations**, visibility. Last run 2026-10-26: "342 clean, 2 drifted". |
| `check-platform-facts-drift.ts` | weekly | counts and vendor names in 4 backend files | every README, `server.json`, `package.json` descriptions |
| `claims:check` | CI | 27 regex rows over READMEs, manifests, `platform-facts.ts` | numbers; `server.json`; live output |
| `check-manifest-guaranteed-consistency` | CI | guaranteed fields appear in the manifest `output_schema` | production; 42 grandfathered entries |
| piggyback validation | real traffic | `output_schema.required`, and that the output is an object (`piggyback-monitor.ts:98-103`) | **0 of 298 public schemas declare `required`, so it passes every object-shaped output** |
| Gate 3 sentinel (`test-runner.ts:1843-1848`) | scheduled known-answer suites | guaranteed fields | the 96 paid tools, never scheduled |

So the 1,475 "guaranteed" field promises across 290 tools are checked against
real customer output **nowhere** (high).

**Proposed mechanism: one source per text, a sync on deploy, and a verifier
for each.**

| Text | Canonical source | Sync | Verify |
|---|---|---|---|
| name, description, category, data source, schemas, limitations, reliability | manifest | One idempotent post-deploy step "apply manifest text". It writes only the columns `capability-field-authority.ts` gives to the manifest, stores a `manifest_text_hash` per row, and replaces the hand-built copy blocks and the manual limitations workflow. Build it from the existing `apps/api/scripts/sync-manifest-text-to-db.ts`, `sync-manifest-canonical-to-db.ts` and `repair-limitation-titles.ts`, not from scratch. Run it in-process after boot under `catalogue_metadata_sync` (§5.3); compliance and methodology tools are report-only. | Extend `sweep-manifest-drift.ts` to all manifest-owned columns plus limitations. Run it in the post-deploy job (§2.1 C) and fail it on any difference. |
| price, free tier, active, visible, transparency tag | DB | none; mark these manifest fields `seed_only` | the transparency tag is a public honesty field, so the sweep reports differences for a human decision |
| "guaranteed" fields | live output | none | Change the piggyback check to `checkGuaranteedFieldsPresent(output, output_field_reliability)`. Record misses per tool and field, and alert above a threshold on 20 or more calls. For paid tools, a monthly budgeted sample through `sweep-prod-catalog.ts` inside the €25 cap (DEC-20260812-A). |
| counts in READMEs, `server.json`, package metadata | `/v1/platform/facts` | write no numbers, or generate them at release | one numeric-claim rule in `claims:check` covering `server.json` and `package.json` descriptions |
| OpenAPI | Hono route table | — | A test that walks the registered routes: every spec path exists, and every public route is documented or on an explicit internal list. |
| `llms.txt` | facts | already live | keep |

---

## 7. General quality

### 7.1 Tests (facts, high)

- **Unit suite.** `cd apps/api && npx vitest run` at `db27bef` passed with 0
  failures. The only skipped files were the `*.integration.test.ts` files, which
  run in CI's DB job. `tsc --noEmit` is clean. Counts are deliberately not
  restated here: no receipt was written for this run, and the repo's rule is
  receipts, not bare counts.
- **Not hollow.** A 10-test sample across capabilities, jobs, lib and routes
  found no hollow test. Several pin real incidents, for example
  `jobs/db-retention.test.ts` (bind shape, LIMIT, swallow visibility) and
  `capabilities/serper-input-validation.test.ts` ("fetch not called" on bad
  input). `routes/do.core.test.ts` mocks the DB heavily (78 mock lines); the
  integration suites back it.
- **Coverage is uneven.** 137 of 353 executor files (39%) are imported by any
  test, and 60% have their slug named in some test. Recent tools ship with tests;
  the older catalogue mostly does not.
- **Fixture mode proves less than it sounds.** It checks a saved snapshot
  against the contract. It does not show the upstream still works. Paid tools
  are never scheduled-tested at all (`scheduled_testing_eligible =
  external_cost_cents = 0`).
- **F5's open finding still stands:** no CI gate fails when its input set is
  empty (`LESSONS.md` F5).

### 7.2 Type safety and input validation (facts, high)

- `strict: true`, without `noUncheckedIndexedAccess`.
- 266 `as any` in non-test source (29 in `do.ts`), and 0 `@ts-ignore`.
- Request validation is shallow (§1.3).
- **Principle B** (validate before a paid call), in a sample of 15 executors:
  - 6 enforce the 2-character minimum;
  - 6 check only for empty input (for example `translate`, `invoice-extract`,
    `uk-company-data`).

### 7.3 Security (facts, high, unless marked)

- **API keys:** good. 32 random bytes, SHA-256, prefix lookup,
  `timingSafeEqual` (`lib/api-keys.ts:11-48`).
- **Admin:** constant-time comparison, a 32-character minimum, fails closed
  (`lib/admin-auth.ts:47-79`). Two route files keep their own weaker
  `isValidAdminAuth` copies (`internal-health-monitor.ts:55`,
  `internal-onboarding.ts:34`). They are safe only because the mount-level
  check also runs.
- **SSRF:** strong (§1.2). Missing ranges: 198.18/15, 224/4, 240/4, NAT64
  `64:ff9b::/96` and 6to4 `2002::/16`.
- **robots.txt (DEC-20261023-A): partly adopted.** It is enforced in
  `capabilities/lib/web-provider.ts:529-563` and `page-speed-test`, but
  `safeFetch` itself has no robots check. 41 executors call `safeFetch`. By a
  grep heuristic, only about 6 of them call `assertRobotsAllowed`, and at least
  28 never touch robots handling at all. Examples include `link-extract`,
  `meta-extract`, `url-to-text` and `sitemap-parse`. Some fetch
  customer-supplied documents, where robots arguably does not apply (moderate on
  scope). The honest user agent `StraleBot/1.0` is in place
  (`lib/site-access.ts:44`).
- **Secrets:** no secret values seen in logs, but there is no log redaction
  configuration. Some vendor keys travel in URL query strings
  (`us-sec-filings-extended.ts:63`, `landing-page-roast.ts:30`).
- **Rate limits:** the in-memory limiter keys on the first `x-forwarded-for`
  value and skips requests with no IP (`rate-limit.ts:155,171`). The free-tier
  daily limit is DB-backed, which is correct. Whether XFF can be spoofed behind
  Railway's proxy is unverified (low).

### 7.4 Highest-return quality changes

1. **Schema-validate inputs at dispatch** (Ajv over the existing `input_schema`)
   with one structured refusal. This makes Principle B true for all tools at
   once and removes the class of 500s caused by a TypeError. Effort: M.
2. **Every gate fails on an empty input set**, as F5 recommends. Effort: S.
3. **robots.txt inside `safeFetch`**, as an opt-out per call type for
   customer-supplied documents. Do the pino `redact` configuration, the shared
   admin check and the missing SSRF ranges in the same change. Effort: S–M.
4. **Fixture-driven contract tests for the untested 60% of executors.** Use the
   recorded baseline outputs; about 0.5 day per 10 tools. Effort: L, ongoing.
5. **Shared `getByPath`, plus a test that onboarding and the runner agree.**
   Effort: S.

---

## 8. Other angles

Three angles were chosen because they decide whether the next 300 tools are
profitable and safe to add.

### 8.1 Cost per call and margin: invisible (facts, high)

- `external_cost_cents` exists only on `test_suites`, as a scheduling knob
  (`db/schema.ts:873`). Transactions store `price_cents` and `latency_ms`, but
  no cost.
- LLM costs are hard-coded floors of 1–3 cents (`lib/llm-capability-costs.ts:55`,
  which itself says "not cost accuracy").
- None of the 94 `new Anthropic()` sites reads `.usage` (token counts).
- x402 converts EUR to USD at a static rate with a default of 1.08
  (`lib/x402-gateway.ts:43`).

With a modal live price of €0.05 (124 of 298 public tools, `/v1/capabilities`), and up to 6 LLM requests per call
under stacked retries (§2.2), some tools could lose money on every call, and
nothing would show it (moderate).

**Fix:** one shared Anthropic client factory (explicit `timeout`,
`maxRetries: 0`, records `usage`), plus `cost_cents` on transactions filled by
LLM usage and vendor unit prices. Then a daily margin-per-tool query feeds the
commercial pack. Effort: M (about 3 days).

### 8.2 Vendor concentration (facts, high; impact moderate)

| Dependency | Executors |
|---|---|
| `ANTHROPIC_API_KEY` | about 88 reading the key directly (plus 67 importing `llm-extract`; the sets overlap) |
| Browserless | about 34–37 |
| Serper | 8 (adverse-media fallback included; whether Serper permits resale is open, see `docs/research/2026-10-26-serp-vendor-replacement.md`) |
| Dilisense | 3 (but these are the compliance flagships) |

An Anthropic outage or key problem takes out about 30% of the catalogue at once.
The vendor control tower can suspend them cleanly. **What is missing is a
per-vendor blast-radius view** in the daily run, and a cheaper second LLM route
for the simple extraction tools.

### 8.3 Scaling to the next 300 tools (facts, high; projections moderate)

- **Per-tool cost.** Each tool means about 10–20 touched files: executor,
  manifest, tests, and often `llm-capability-costs.ts`, `env-manifest.yaml`,
  `vendor-terms.ts`, plus a receipt and a handoff.
- **Boot work grows.** Every boot dynamically imports about 330 executors and
  parses 355 manifests.
- **Migrations grow.** Every copy rewrite adds a frozen migration block and a
  data file to the hot boot path.

What does not scale:
- the migration monolith;
- untyped executors with per-executor input checks;
- copy sync through migration blocks;
- `do.ts` as a single file.

What scales well:
- manifest-driven onboarding;
- the field-authority table;
- `safeFetch`;
- the failure taxonomy.

**Recommendation:**
- a typed executor contract generated from the manifest schema;
- per-block migration files;
- the post-deploy text sync (§6) instead of new copy blocks.

### 8.4 Developer and agent experience (facts, high; brief)

- **Good:** a typed `ErrorCode` union of 25 codes, now with recovery details
  (#767); idempotency keys; and a 388-path OpenAPI 3.1 spec with per-tool
  examples.
- **Weak:** only 5 component schemas; undocumented public routes (§6); and
  `timeout_seconds` is accepted but ignored (§1.4). That last one is a silent
  API lie and should either work or be removed from the documentation.

---

## 9. What this review did not verify

- Railway settings: replica count, live healthcheck path and timeout, the
  deploy log for `db27bef`.
- Production DB state: `job_schedule`, failure rates, which of the 57 manifests
  not visible in production are inactive and which were never onboarded.
- Whether `x-forwarded-for` can be spoofed behind Railway's edge.
- Whether the daily run executes every day.
- Production DB integration tests were not run locally. CI runs them.

---

## 10. Ranked action list

**Impact** is what it prevents or enables. **Effort:** S under 1 day, M 1–5
days, L more than 5 days. **Decision** is "eng" (engineering-only, inside
CHARTER authority) or "Petter" with the reason.

| # | Action | Impact | Effort | Risk of the change | Decision |
|---|---|---|---|---|---|
| 1 | Post-merge deploy check: poll `/health.commit` against the merge SHA, issue and email on mismatch (§2.1 C) | Today's failure class becomes visible in 15 min instead of up to a day | S | none (read-only) | eng |
| 2 | Make a fresh DB bootable (`transactions_integrity_hash_idx`), then a pre-merge image build and boot smoke in CI (§2.1 A, B) | Catches build-context, boot-order, migration and schema-validation failures before merge | M | low (CI only; the new migration block follows DEC-20260504-C) | eng |
| 3 | External dead-man: an admin-authenticated job-freshness endpoint, plus a 30-min GitHub Actions probe that emails (§5.1) | Stalled jobs and silent bulk failures surface within an hour | M | low | eng; a Railway API token for auto-redeploy is **Petter** (new production write credential) |
| 4 | Sync paid path: reserve, execute outside the transaction, then capture; honour `timeout_seconds` (§1.4 risk 2) | Removes the 15-second pool stalls and wallet serialisation, and stops paying vendors for calls whose DB session was already killed | M (about 1 week with integration tests) | **medium**: money path; DEC-20260504-A fail-before tests and tier-2 review | eng |
| 5 | Per-call cost recording and a shared Anthropic client (timeout, no hidden retries, usage) (§8.1) | Margin per tool becomes visible; cuts up to 6× LLM amplification | M | low | eng |
| 6 | Post-deploy "apply manifest text" step plus a widened drift sweep that fails on difference (§6) | Public copy and limitations match the reviewed text within one deploy; no more hand-built copy blocks | M | low–medium (writes production copy columns in-process under `catalogue_metadata_sync`) | eng, except compliance and methodology tools: report-only, **Petter** publishes (CHARTER.md:91-99) |
| 7 | Piggyback checks guaranteed fields on real traffic; alert by threshold (§6) | 1,475 public "always present" promises become measured | S–M | low | eng to measure and alert; downgrading a public claim on a compliance tool is **Petter** |
| 8 | Ajv input validation at dispatch with one structured refusal (§7.4) | Principle B true everywhere; removes TypeError 500s | M | medium (may refuse inputs that pass today; ship in report-only mode first) | eng |
| 9 | robots.txt in `safeFetch`, plus pino redact, shared admin check and missing SSRF ranges (§7.3) | Closes the DEC-20261023-A adoption gap for 28 executors | S–M | low–medium (some fetches will now stop at robots) | eng (applying an adopted decision) |
| 10 | Turn on a log sink (Better Stack token, or another) with an error-rate alert | Logged-only failures become visible | S | low, once pino `redact` is in place (prerequisite) | **Petter**: customer inputs in logs would reach a new sub-processor (privacy and legal), and the token holder is Petter (`env-manifest.yaml:209-217`) |
| 11 | Railway config as code (`railway.json`), and a healthcheck timeout sized from measurement (§2.1 D) | Deploy behaviour is reviewable; ends the "stale `railway-config.md`" confusion | S | low | eng, with someone holding Railway access to confirm the live values |
| 12 | Every CI gate fails on an empty input set (F5) | Ends the hollow-gate class | S | low | eng |
| 13 | Merge the three fetch guards; fold `check-platform-facts-drift` into `claims:check` and widen it to READMEs, `server.json` and `package.json`; numeric-claim rule (§3.4, §6) | Fewer, sharper checks; the stale counts get caught | S | none | eng for the checks; README corrections are narrowing (DEC-20260822-A) but `packages/*-strale` edits fall under the Distribution PR Integrity Protocol (DEC-20260422-A) |
| 14 | Split `startup-migrations.ts` into per-block files (ledger unchanged); add an advisory lock around the runner; move data payloads out of `lib/` | Smaller boot hot spot; safe concurrent boots | M | medium (boot path; DEC-20260504-C) | eng |
| 15 | Split `do.ts` along execute and settle seams; one x402 settle function for all three copies | Less chance of a money-path divergence | L | medium | eng |
| 16 | Clean-up: shared `getByPath` and agreement test; remove SQS leftovers (code, comments, residual columns via a new block); dead exports (knip); one company-name normaliser; one failure-string classifier source | Lower confusion cost for every future change | M | low | eng |
| 17 | Fixture-driven contract tests for the untested 60% of executors | Catches executor regressions before deploy | L (ongoing) | none | eng |
| 18 | Scheduled `npx -y strale-mcp` contract probe; one automatic re-run of a red scheduled workflow (§5) | The 3.5-month degraded-package class surfaces in a day | S | none | eng |
| 19 | Fix `server.json` (version, counts, SQS wording) and the four "27 countries" READMEs | Public metadata is true | S | none | eng for the repo text under DEC-20260422-A; PyPI and npm READMEs only change with a new published version, a one-way public act that is **Petter**'s |

The order matters for the first four. Item 1 is a day's work and would have
caught today's failure. Items 2 and 3 close the rest of the gap between "CI
green" and "running in production". Item 4 is the one real architectural fault
on the money path.
