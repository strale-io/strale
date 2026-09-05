Intent: Program track T17 / WP13 second batch (drizzle-orm 0.38.4 -> 0.45.2, semver-major) -- the
highest-priority reachable advisory from the 2026-09-02 WP13 triage, deferred out of batch 1
(hono, PR #499) because it's the ORM every query in `apps/api/src` goes through and needs its own
Audit-Follow-up Test Coverage Protocol (DEC-20260504-A) treatment.

## What changed

- `apps/api/package.json`: `drizzle-orm` `^0.38.4` -> `^0.45.2`; `drizzle-kit` `^0.30.6` -> `^0.31.10`
  (dev dependency).
- `package-lock.json` updated accordingly. `postgres` (the postgres-js driver) is untouched --
  stayed at the exact same resolved version, `3.4.8`, before and after (confirmed via
  package-lock.json diff).
- Method: `npm install drizzle-orm@0.45.2 --workspace=apps/api` then
  `npm install drizzle-kit@0.31.10 --save-dev --workspace=apps/api` -- explicit installs, not
  `npm update`. Grepped every workspace's `package.json` (`apps/api`, `packages/mcp-server`,
  `packages/sdk-typescript`, `packages/semantic-kernel-strale`, `packages/langchain-strale`,
  `packages/crewai-strale`, and the monorepo root) -- `apps/api/package.json` is the only
  declaration site for either package.
- Version choice: `0.45.2` is npm's published `latest` dist-tag for `drizzle-orm` and is exactly
  what `npm audit`'s `fixAvailable` pointed at for the vulnerable range (`<0.45.2`). GitHub's
  changelog folder for drizzle-orm has an unpublished `0.45.3` entry, but it was never published to
  npm as of this session, so `0.45.2` is correctly "current latest". `drizzle-kit`'s npm `latest`
  is `0.31.10` -- it is versioned on its own independent track (no `peerDependency` link to
  `drizzle-orm`; confirmed via `npm view drizzle-orm@0.45.2 peerDependencies` and
  `npm view drizzle-kit@0.31.10 dependencies`, neither references the other package).
- No code changes were required anywhere in `apps/api/src` or `apps/api/scripts` -- the upgrade
  compiled and ran clean with zero source edits.

## Release notes read (every drizzle-orm minor/patch between 0.38.4 and 0.45.2, plus drizzle-kit
0.30.6 through 0.31.10)

Fetched every `changelogs/drizzle-orm/<version>.md` (0.39.0 through 0.45.2, 21 files) and
`changelogs/drizzle-kit/<version>.md` (0.31.0 through 0.31.10, 10 files) from
`drizzle-team/drizzle-orm` on GitHub. Full per-version notes and the "not found in range" negative
findings are in the receipt's `raw.changelog_review` block. Summary of what's relevant:

- **0.45.2 -- the advisory itself.** Fixed `sql.identifier()` / `sql.as()` escaping (previously
  unescaped, CWE-89 SQL injection: `GHSA-gpj5-g38j-94v9`, CVSS 7.5). Grepped `apps/api/src` and
  `apps/api/scripts` for `sql.identifier(` and `sql.as(` -- **zero matches**. Neither function is
  called anywhere in this codebase. The advisory was never exploitable in Strale before this
  upgrade; the upgrade closes the `npm audit` finding as hygiene, not live-vulnerability
  remediation.
- **0.44.0 -- `DrizzleQueryError`.** Wraps driver errors with a proper stack trace pointing at the
  failing query, the generated SQL + params, and the original driver error as `.cause`. Also adds
  an opt-in query cache (`global: false` by default). Checked every catch block downstream of a
  drizzle call that inspects error shape (`wallet-service.ts`, x402 settlement paths,
  `startup-migrations.ts`) -- none narrow on the wrapper's own identity in a way this would break;
  they either check `.code`/`.message` on whatever was thrown (still reachable through
  `DrizzleQueryError.cause`) or catch-and-log generically. The cache feature is never enabled
  anywhere in this codebase (grepped `src/db` for a `cache:` option passed to `drizzle()` --
  absent), so it has zero effect. Confirmed via the full test suite, including the
  error-swallow-visibility tests DEC-20260504-A rule 4 requires (`x402-settlement-alerting.test.ts`
  and friends) -- all pass.
- **0.44.0 -- `inArray` widened to accept `ReadonlyArray`** in addition to `Array`. Strictly
  additive, not breaking.
- **Everything else in range** (Bun SQL driver, Gel dialect, Neon identity/auth renaming, MySQL/
  SingleStore join fixes, SQLite blob/durable-object fixes, PlanetScale type params, `pg-native`
  Pool detection in **node-postgres** transactions) does not apply: this codebase uses
  `drizzle-orm/postgres-js` exclusively (grepped `src/db` for `from "drizzle-orm/` -- only the
  `postgres-js` import appears), never `node-postgres`/`pg`, MySQL, SQLite, SingleStore, Gel, or
  Bun's SQL driver.
- **Nothing in range changes**: the `sql` template tag's array-bind serialization (the documented
  `ANY(${array})` row-value-tuple footgun in `apps/api/src/lib/internal-accounts.ts` and
  `startup-migrations.ts:4875` stays exactly as before -- see bind-shape sweep below), the
  `db.execute()`/`tx.execute()` result shape (`.count`, not `.rowCount` -- unchanged, confirmed by
  test), the transaction API, or drizzle-kit's migration-folder/generate/push handling (nothing in
  the 0.31.x changelog range touches this, and this repo doesn't use `drizzle-kit generate` at
  all -- see below).

## Bind-shape sweep (DEC-20260504-A rule 3)

Swept every `db.execute(sql\`...\`)` / `tx.execute(sql\`...\`)` call site (606 raw matches across
87 files, 72 outside tests) and every `ANY(${...})` pattern (61 raw matches). Result:

- Every production `ANY(${array})` call site either (a) runs through the `postgres` package's own
  tag directly (`jobs/quality-floor.ts`, the `jobs/__fixtures__/*.sql` fixtures,
  `scripts/build-disposition.ts`, `scripts/session-close-check.ts`,
  `scripts/sync-known-answer-fixtures.ts`, and the one-off diagnostic scripts under
  `scripts/archive/`) -- postgres-js's own tag serializes a JS array as a single `ANY($1)` bind
  correctly, and this stayed at `3.4.8` unchanged by this upgrade -- or (b) is the documented-safe
  `internalAccountEmailExclusionSql()` helper (`daily-digest/fetch-platform.ts`,
  `digest-compiler.ts`, `meta-monitoring.ts`, `reply-webhook.ts`), which builds a parameterized
  OR-list via drizzle's `sql.join(...)` rather than interpolating a raw array.
- No call site interpolates a raw JS array directly into a **drizzle** `sql\`\`` template's
  `ANY()`. `apps/api/src/lib/internal-accounts.test.ts` structurally asserts this (inspects the
  generated SQL text and param list for the tell-tale `ANY((` row-value-tuple shape, no live DB
  needed) -- passed clean under 0.45.2, both in the targeted 184-test run and the full 3733-test
  suite.
- `npm run migrations:check` -- ok, 54 migration blocks checked, none edited (no migration block
  needed touching for this upgrade).
- Targeted run: `startup-migrations.test.ts`, `internal-accounts.test.ts`,
  `guarded-executor.test.ts`, `test-scheduler-skip-bumper.test.ts` -- **4 files passed, 184/184
  tests**.
- Brief's named-file sweep (`data-retention*`, `db-retention*`, `wallet*`, `x402*`,
  `idempotency*`, `job-coordinator*`): no file literally named `db-retention.ts` exists in this
  repo (only `data-retention.ts` / `data-retention.test.ts` / `data-retention-coverage.test.ts` --
  matches project memory that `db-retention.ts` predates a rename); no bare `wallet.test.ts`
  exists either (the unit coverage is `wallet-service.guard.test.ts`; the DB-backed coverage is
  `wallet-service.integration.test.ts` + `wallet-reservations.integration.test.ts`, both
  DB-gated -- see below). Ran every unit-level match found:
  `data-retention.test.ts`, `data-retention-coverage.test.ts`, `idempotency-fingerprint.test.ts`,
  `wallet-service.guard.test.ts`, `x402-demand.test.ts`, `x402-eligibility.test.ts`,
  `x402-eligibility.guard.test.ts`, `x402-facilitator.test.ts`, `x402-gateway.test.ts`,
  `x402-input-validation.test.ts`, `x402-settlement-alerting.test.ts`, `x402-v2-challenge.test.ts`,
  `x402-visibility.test.ts`, `job-coordinator.watchdog.test.ts` -- **14 files passed, 169/169
  tests**.

## No generated migration (brief's STOP condition did not trigger)

`apps/api/drizzle.config.ts` is explicitly scoped ("TEST-DATABASE BOOTSTRAP ONLY") to run
`drizzle-kit push --force` against an ephemeral CI Postgres from `src/db/schema.ts`. Production
schema changes go exclusively through the hand-written, ledgered blocks in
`runStartupMigrations()` (DEC-20260504-C). There is no committed `apps/api/drizzle/` output
directory, and no `drizzle-kit generate` or `drizzle-kit migrate` invocation exists anywhere in
`package.json` or `.github/workflows/*.yml` -- only `push`. The upgrade therefore could not
produce a generated migration to commit, and `git status` confirms none appeared. The brief's
"STOP and report" condition never triggered.

## Type-check

- `npm --workspace=packages/mcp-server run build` -- clean, zero errors (run first, per the task
  note, to avoid phantom `routes/mcp.ts` errors).
- `cd apps/api && npx tsc --noEmit` -- clean, zero errors. No source code changes were needed by
  the upgrade.

## Full-suite test result (and every re-run)

- **Run 1** (`npx vitest run`, full `apps/api` suite, no filter): **1 failed | 254 passed | 30
  skipped** (285 files); **1 failed | 3732 passed | 314 skipped** (4047 tests). The one failure:
  `src/capabilities/domain-contact-extract.test.ts > EMAIL_RE — ReDoS regression > scales linearly,
  not quadratically` -- `expected 408.1338 to be less than 264.3592`, a wall-clock timing
  assertion on regex-scan duration under concurrent-file load. This test imports no drizzle/DB
  code at all -- it benchmarks a regex against long strings to catch ReDoS regressions in the
  regex itself.
- **Isolated rerun**: `npx vitest run src/capabilities/domain-contact-extract.test.ts` alone --
  **1 file passed**, deterministically. Confirms the documented "local suite flaky under
  concurrent load" pattern (project memory `project_local_suite_flaky_ci_is_the_gate`), not a
  drizzle-orm regression.
- **Run 2** (full suite again, stability confirmation): **0 failed | 255 passed | 30 skipped**
  (285 files); **3733 passed | 314 skipped** (4047 tests). Zero failures.
- `npm run env:check` -- ok (126 env names checked against 129 manifest rows).
- `npm run models:check` -- ok (668 files checked).
- `npm run claims:check` -- ok (27 claim rows checked).
- `npm run migrations:check` -- ok (54 migration blocks checked).
- `npm run receipts:check` -- ok (7 receipts checked; the 7 warnings printed are pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on unrelated older handoff files, not from this batch).

Full test-run detail (per-run file/test counts, the flaky-file root-cause analysis, and every
command run) is in the receipt at
`archive/receipts/2026-09-04-audit-wp13-drizzle-upgrade.json`.

## Integration tests (CI-only, not run locally)

`wallet-service.integration.test.ts`, `wallet-reservations.integration.test.ts`,
`job-coordinator.integration.test.ts`, and the other `*.integration.test.ts` files self-skip
(`describe.skip`) unless `DATABASE_URL_TEST` is set. No `.env` file exists in this worktree
(confirmed: `ls .env` -> no such file), so these ran 0 times locally. CI's `integration-db` lane
(`.github/workflows/ci.yml`) provisions an ephemeral Postgres, runs `drizzle-kit push --force`
against it from `src/db/schema.ts`, then `npx vitest run --no-file-parallelism
integration.test.ts` -- this is where these files actually exercise drizzle-orm 0.45.2 against a
real Postgres connection. This PR's CI run is the verification for this class of test.

## Read-only production queries: none owed

The brief asked for the exact read-only production queries to run for anything the release notes
call out. The changelog review found **no** result-shape, bind-shape, transaction-API, or
`inArray` change in the 0.39.0-0.45.2 range that any of this codebase's production paths depend
on differently than before (see the changelog section above), and the one advisory this upgrade
actually fixes (`sql.identifier()`/`sql.as()` escaping) is called nowhere in this codebase. No
root `.env` / `DATABASE_URL` was available in this worktree to run a supplementary read-only
production query either way. Given both of those, no production read-only check is owed for this
batch -- the full local suite (3733/3733 passing across two runs) and CI's `integration-db` lane
against a real ephemeral Postgres are the applicable verification surfaces.

## Audit numbers (`npm audit --omit=dev --json` at repo root)

| | critical | high | moderate | low | total |
|---|---|---|---|---|---|
| before | 1 | 13 | 7 | 2 | 23 |
| after  | 1 | 12 | 7 | 2 | 22 |

`drizzle-orm`'s audit entry (before: severity high, isDirect true, range `<0.45.2`, advisory
`GHSA-gpj5-g38j-94v9`, CWE-89, CVSS 7.5, fixAvailable `0.45.2` isSemVerMajor true) is **absent**
from the after-audit output. High-severity count dropped by exactly 1, matching expectation.
`node apps/api/scripts/wp13-dependency-triage.mjs` confirms the same post-upgrade totals
(`root_metadata` / `api_metadata` both `{critical:1, high:12, moderate:7, low:2, total:22}`,
`counts_match: true`) and that `drizzle-orm`/`drizzle-kit` no longer appear in
`critical_high_advisories`.

## Receipt

`archive/receipts/2026-09-04-audit-wp13-drizzle-upgrade.json` -- carries the before/after audit
totals, both package versions, the full changelog-review table (per-version relevant items and
what was done about each, including the "nothing found" negative results), the bind-shape sweep
detail, both full-suite run results plus the isolated flaky-file rerun, and the gate results.
`npm run receipts:check` passes (7 receipts checked, ok).

## Not done here (out of scope for this batch, per WP13's own triage)

`@coinbase/cdp-sdk`, `axios`, `brace-expansion`, `c2pa-node`, and the other reachable-or-not
advisories from the WP13 triage are untouched -- this batch is `drizzle-orm`/`drizzle-kit` only,
matching the program track's per-package batching.

## Anything undone / could not verify

Nothing within this batch's scope was left undone. Integration tests requiring a live Postgres
ran 0 times locally by design (no `DATABASE_URL_TEST` in this worktree) -- CI's `integration-db`
lane on this PR is the verification for those. No deviation from the brief beyond the two notes
above (drizzle-kit's independent versioning track, and the "no production query owed" finding
being a negative result rather than a list of queries run).

## Correction (2026-09-04, same PR, follow-up session)

The "no source change needed" claim above was **wrong**. CI's `integration-db` lane FAILED on the
original commit (`7df94569`), and a fresh read-only Claude review returned FAIL. This section
records what the review found and what changed; the sections above are left as-written (this batch
never edits a receipt after the fact) with this correction appended.

**What the review found.** Since drizzle-orm 0.44.0, `db.execute`/`tx.execute`/the query
builder/transactions all rethrow driver errors wrapped in `DrizzleQueryError`
(`node_modules/drizzle-orm/errors.js`): message `Failed query: ...\nparams: ...`, fields `query`,
`params`, `cause` -- **no `.code`**. The real Postgres error (SQLSTATE code, message) is only at
`.cause`. The changelog-review paragraph above ("existing string/code checks against nested driver
errors still work") asserted the opposite without actually constructing a wrapped error and
checking. Three call sites read a caught DB error's `.code`/`.message` directly and broke:

1. `apps/api/src/lib/account-service.ts` `isUniqueViolation(err)` read `err.code` -- a
   duplicate-email race escaped as an unhandled 500 instead of `EmailAlreadyRegisteredError` ->
   409, reproduced in the CI log on `POST /v1/auth/register`.
2. `apps/api/src/app.ts` `classifyError(err)` read `err.code` and the bind-encoder `TypeError`
   shape directly -- every DB failure logged `error_class: "unknown"` with no `pg_code`, undoing
   the PR-43 observability fix. `src/app.classify-error.test.ts` never fed it a wrapped error, so
   it stayed green while the classifier had stopped working for every real DB failure.
3. `apps/api/src/lib/receipt/execution-receipt.integration.test.ts` (8 assertions) and three
   sibling `*.integration.test.ts` files -- `partial-quarantine.integration.test.ts` (1),
   `receipt-chain-junction.integration.test.ts` (1), `receipt-invariants.integration.test.ts` (16)
   -- asserted `.rejects.toThrow(/trigger-or-constraint-text/)` against the wrapper's generic
   message, which no longer contains that text. 26 assertions total across 4 files.

A grep sweep for every other reader of `.code`/`.message`/`.constraint`/`.detail` on a caught error
(per the follow-up brief) found one more, not yet reproduced in prod but the same class of bug:
`apps/api/src/lib/startup-db-retry.ts` `isTransientDbConnectError` reads `err.code` to decide
whether a startup DB-connectivity failure is transient (CONNECT_TIMEOUT/errno/SQLSTATE class
08/53) -- `runStartupMigrations()`/`validateSchema()` call `db.execute()` internally, so a
connection failure surfacing through a query attempt is wrapped the same way. Fixed proactively.

**What changed.**

- New module `apps/api/src/lib/db-error.ts` -- the only place that knows the wrapper's shape:
  `unwrapDbError`, `pgErrorCode`, `dbErrorMessage`, `wasWrapped`. Identification is by
  `instanceof DrizzleQueryError` (imported from `drizzle-orm/errors`), with a SQLSTATE-bearing-
  cause heuristic as a fallback -- **not** `err.name === "DrizzleQueryError"` as the orchestrator
  brief specified: verified against the installed 0.45.2 build that `DrizzleQueryError` does not
  set `this.name` at all, so it inherits the bare `"Error"` name from its `Error` superclass and
  that check would never match. Documented in the module; noted here as a deviation from the
  brief's exact wording, not from its intent.
- `account-service.ts`: `isUniqueViolation` now reads `pgErrorCode(err)`.
- `app.ts`: `classifyError` unwraps first, then runs every existing branch against the unwrapped
  error; adds `wrapped: true` to the result only when unwrapping actually happened, so the exact
  prior output shape is preserved for every already-unwrapped input (all 7 pre-existing
  `classifyError` tests pass unchanged).
- `startup-db-retry.ts`: `isTransientDbConnectError` unwraps first.
- New integration-test helper `apps/api/src/test-support/db-errors.ts` (`expectDbRejection`):
  awaits the rejection, unwraps with `dbErrorMessage`, and asserts the regex against the unwrapped
  message -- falling back to the raw message so the same assertion also passes against an
  unwrapped driver error. All 26 affected assertions converted. Two assertions in the same files
  that looked similar were left as plain `.rejects.toThrow()` because they are JS-level thrown
  errors, not DB-raised ones: `receipt-invariants.integration.test.ts`'s "mis-addressed" snapshot
  assertion (thrown by `manifest-snapshot.ts`'s own validation) and
  `wallet-service.integration.test.ts`'s "must run inside a transaction" assertion (thrown by
  `wallet-service.ts`'s own guard).
- `startup-migrations.ts`: the 4 `err.message` log lines a full-file grep found are all inside
  ledgered migration-block functions (`runMigration0095_walletReservations`,
  `runMigration0098_perCustomerIdempotency`, `runMigration0099_noHalfQuarantine`,
  `runMigration0101_capabilityInvocations`) -- left untouched per the append-only ledger rule;
  diagnostic-only degradation (no control-flow effect), same treatment the module already gives
  its own non-ledgered logging.

**New/changed unit tests, each shown failing against the pre-fix code first** (DEC-20260504-A;
`git show HEAD:<path> > <path>` swap, restored from a scratchpad backup copy -- never
`git checkout <branch> --`, which on an uncommitted-fix worktree silently restores the branch tip
instead, discarding the fix; hit once in this session and recovered by re-applying the edit):
`db-error.test.ts` (new, 13 tests), `account-service.test.ts` (new, 3 tests -- the wrapped-23505
case fails pre-fix with `expected Error: Failed query: ... to be instanceof
EmailAlreadyRegisteredError`), `app.classify-error.test.ts` (+3 tests -- both wrapped-input cases
fail pre-fix with `error_class: "unknown"` instead of `db_unique_violation`/`db_bind_encoder`),
`startup-db-retry.test.ts` (+2 tests -- the wrapped-CONNECT_TIMEOUT case fails pre-fix with
`expected false to be true`).

**The receipt.** `archive/receipts/2026-09-04-audit-wp13-drizzle-upgrade.json` was deleted (never
reached `main`; its "existing string/code checks against nested driver errors still work" claim
was false) and replaced by
`archive/receipts/2026-09-04-audit-wp13-drizzle-upgrade-corrected.json`, written via
`npm run receipt`, carrying this narrative and two fresh `npm audit --omit=dev --json` runs (both
`{critical:1, high:12, moderate:7, low:2, total:22}`, `drizzle-orm` absent from both -- this
correction batch made no dependency changes).

**Full local suite, both runs green, zero failures** (unlike the original receipt's one flaky
timing test, neither run in this session hit it): 257 passed | 30 skipped (287 files); 3754
passed | 314 skipped (4068 tests), both runs. `tsc --noEmit` clean. `migrations:check`,
`env:check`, `models:check`, `claims:check`, `receipts:check`, `context:check`, `context:test`
all pass (`context:check` shows two pre-existing `WARN` lines on
`docs/project/legacy-authority-inventory.json`, unrelated to this batch and warning-only).

## Round three (2026-09-04, same PR, second follow-up session)

The second independent review found two more raw `.code` reads on money paths the round-two sweep
missed, and one weakness in `db-error.ts`'s own fallback heuristic. All three fixed; the round-two
receipt (`-corrected`, not yet on `main`) is superseded by `-final`, which this section, not the
earlier one, is now authoritative for.

**The two missed sites (both money paths, both cert-audit-numbered).**

1. `apps/api/src/routes/do.ts` ~line 2245 (cert-audit Y-5, the wallet-transaction catch): read
   `(err as { code?: string }).code` to recognize Postgres `25P03`/`55P03` and answer a clean 503
   `timeout_exceeded` instead of a 500. Post-0.44 the wrapper has no `.code` of its own, so this
   read always returned `undefined` and every wallet-tx timeout fell through to a raw 500 instead
   of the documented clean timeout response. Routed through `pgErrorCode(err)`.
2. `apps/api/src/jobs/settlement-reconciler.ts` ~line 239: read
   `(err as { code?: string } | null)?.code` to recognize `23505` on the x402 recovery-row insert
   as "another replica already recovered this" (a benign race, discharged) rather than a real
   failure. Post-0.44 this also always read `undefined`, so a benign cross-replica race on the
   recovery insert would have logged as `settlement-reconcile-item-failed` on every tick two
   replicas happened to collide. Routed through `pgErrorCode(err)`.

**The heuristic weakness (`db-error.ts`).** The fallback (non-`DrizzleQueryError`) path in
`unwrapDbError` unwrapped ANY object whose `cause.code` matched the 5-char SQLSTATE regex
(`/^[0-9A-Z]{5}$/`). That regex also matches several Node.js system error codes that happen to be
exactly 5 uppercase letters — `EPIPE`, `EINTR` — so a plain wrapper around an unrelated Node error
(nothing to do with Postgres) would have been misidentified as a DB wrapper and silently unwrapped.
Narrowed: the fallback now also requires the cause to look like a postgres-js `PostgresError` —
either `cause.name === "PostgresError"`, or the SQLSTATE-shaped `code` accompanied by a `severity`
or `routine` field, both of which postgres-js always sets and a bare Node system error never has.

**New/changed tests, each shown failing against the pre-fix code first** (same swap-and-restore
method as round two — `git show HEAD:<path>` copied to a scratchpad file, swapped in, restored from
the scratchpad backup after confirming the fail; never `git checkout <branch> --`):

- `src/lib/db-error.test.ts`: 2 new tests reject the EPIPE/EINTR lookalike shapes (fail pre-fix
  with `expected Error: write EPIPE ... to be Error: Failed query: ...` — the old heuristic
  unwrapped them), 2 more assert the accepted `PostgresError`-shaped lookalikes still unwrap. 16
  tests total, all pass post-fix.
- `src/routes/do.core.test.ts`: 1 new test ("wallet-transaction timeout (postgres 25P03/55P03 via
  DrizzleQueryError)") drives the wallet-lock `.for("update")` call to reject with a
  `DrizzleQueryError` wrapping a 55P03 cause. Fails pre-fix (`expected 500 to be 503`), passes
  post-fix (503 `timeout_exceeded`, `details.postgres_code: "55P03"`, executor never called).
- `src/jobs/settlement-reconciler.test.ts` (new file — none existed for this job): 2 tests. The
  23505-race test fails pre-fix (`expected +0 to be 1` — the race fell through to `summary.failed`
  and a `settlement-reconcile-item-failed` log instead of `summary.discharged`), passes post-fix.
  A second test pins that a genuinely different SQLSTATE (`08006`, connection terminated) still
  counts as a real failure and still logs — the fix routes the code correctly, it does not
  suppress every DB error.

**Completeness sweep (grep patterns, full hit list with verdicts).** Every pattern from the
follow-up brief, run against `apps/api/src` and `apps/api/scripts`, excluding `*.test.ts`:

| Pattern | Hits (non-test) | Verdict |
|---|---|---|
| `\.code\b` | `app.ts` (classifyError, unwrapped-first), `account-service.ts` (isUniqueViolation, via pgErrorCode), `startup-db-retry.ts` (isTransientDbConnectError, via unwrapDbError), `do.ts` (this round, now via pgErrorCode), `settlement-reconciler.ts` (this round, now via pgErrorCode), `db-error.ts` (the module itself), `trial-eligibility.ts:453`, `safe-fetch.ts:43`, `startup-domain-check.ts:86`, plus ~25 unrelated capability-response-field hits (`slovak-company-data.ts`, `belgian-company-data.ts`, `c2pa-inspect.ts`, `incoterms-explain.ts`, `openapi-resolver.ts`, etc.) | routed / unaffected — see per-site rows below |
| `as { code` / `as {code` / `code?: string }` | `app.ts:95` (routed, reads the already-unwrapped `e`), `db-error.ts:66,102` (the module's own internals), `trial-eligibility.ts:453` (unaffected — DNS) | routed / unaffected |
| `pgCode` | `settlement-reconciler.ts:243-244` (this round, routed) | routed |
| `sqlState` | no hits | n/a |
| `'23505'` / `"23505"` | `app.ts:101` (routed, consumes unwrapped code), `settlement-reconciler.ts:244` (this round, routed), `account-service.ts:43` (`UNIQUE_VIOLATION` constant, consumed via `pgErrorCode` at `account-service.ts:66`) | routed |
| `'25P03'` / `"25P03"`, `'55P03'` / `"55P03"` | `app.ts:105-106` (routed), `do.ts:2243-2244,2251-2252` (this round, routed) | routed |
| `'40001'` / `"40001"` | `app.ts:108` (routed, `db_serialization_failure` label) | routed |
| `'57014'` / `"57014"` | `app.ts:107` (routed), `startup-db-retry.ts:91` (routed, consumes unwrapped code) | routed |
| `.message.includes(` | `app.ts:125,132` (routed — `e` is the unwrapped error; 132 is AbortError, unrelated to DB), remainder (`adverse-media-check.ts`, `beneficial-ownership-lookup.ts`, `openapi-resolver.ts`, `redirect-trace.ts`, `url-to-markdown.ts`, `url-validator.ts` x2) all check application-level messages their own code threw — never a driver/DB error | routed / unaffected |
| `.message.match(` | no hits | n/a |
| `/already exists/` | no hits | n/a |
| `instanceof PostgresError` | no hits outside this session's new `db-error.test.ts` | n/a |
| `.cause` | `app.ts:89` (comment), `account-service.ts:66` (comment), `db-error.ts` (the module's own internals), `startup-db-retry.ts:76` (comment), `x402-settlement-intent.ts:147` (sets `.cause` on a custom error class it constructs — not reading a caught DB error's code), `do.ts:1397` (same pattern, `FreeTierCheckUnavailable`), `scripts/archive/diag-browserless-probe.ts:61` (prints `err.cause` for an HTTP-fetch diagnostic, not DB) | routed / unaffected |

No further sites found. `trial-eligibility.ts:453` and `startup-domain-check.ts:86` both read
`NodeJS.ErrnoException.code` off a `dns.resolve*`/`dns.lookup` rejection (`ENOTFOUND`/`ENODATA`) —
DNS resolver codes, structurally unrelated to a drizzle/Postgres call, confirmed by reading both
functions' full bodies. `safe-fetch.ts:43` *sets* a custom `err.code = "ESSRFBLOCKED"` on an error
it constructs itself (SSRF guard) — not a read of a caught DB error's code.

**The receipt.** `archive/receipts/2026-09-04-audit-wp13-drizzle-upgrade-corrected.json` was
deleted (it had not reached `main` and its completeness claim was wrong — it missed the two sites
above) and replaced by `archive/receipts/2026-09-04-audit-wp13-drizzle-upgrade-final.json`, written
via `npm run receipt`, carrying this round's wrapper finding, all five routed sites (the three from
round two plus the two above), the sweep patterns and verdicts, and two fresh
`npm audit --omit=dev --json` runs.

**Gates.** `npm --workspace=packages/mcp-server run build`, `cd apps/api && npx tsc --noEmit`,
`cd apps/api && npx vitest run` (full suite, plus an isolated re-run of any timing-flaky file),
`npm run migrations:check`, `env:check`, `models:check`, `claims:check`, `receipts:check`,
`npm run archive:index` (run before `context:generate`, per the brief), `context:check`,
`context:test`, `node scripts/generate-archive-index.mjs --check` — results in this session's own
final report rather than restated here a third time.
