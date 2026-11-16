Intent: Codex builder brief: five read-only money-path checks in the ops-read endpoint, so cloud sessions can measure A-7, B-6 and B-5 without a founder database session.

# Brief: money-path checks for ops-read, slug `ops-read-money-checks`

**Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), for `docs/plan/PLAN.md` item 3, with the dispatcher route confirmed by the wow-core master on 2026-11-16.
**Branch:** the dispatcher's `codex/ops-read-money-checks`, cut from `main`. Never push `main`, label, approve, merge or comment.
**Data:** this brief and the repository only. There are no secrets, tokens, production rows or customer data in it, and none are needed: every test runs offline against a recording fake.

Why: three items on the founder's list are reads of production money data: A-7 (wallet debits against recorded prices), B-6 (exposure on the 36 tools that bill a swallowed upstream failure) and B-5 (exchange-rate error rate after #976/#977). The reviewed SQL is in `docs/lanes/pc/a7-bundle-queries-brief.md`. Today it can only run in a session on the founder's PC. `GET /v1/ops-read/:check` (PR #880) already serves fixed, read-only, token-gated checks to cloud sessions; adding these five removes the PC session.

Owned paths: `apps/api/src/lib/ops-read.ts`, `apps/api/src/lib/ops-read.test.ts`, `docs/lanes/codex/ops-read-money-checks-report.md`.

Prior work: PR #880 (merged) built the endpoint and its three checks; copy its style. No other open or closed PR adds money checks (searched `is:pull-request ops-read` and `money-path checks`).

## What to build

Add five entries to `OPS_READ_CHECKS` in `apps/api/src/lib/ops-read.ts`. Each takes no caller input (`prepare: () => null`). Each runs the SQL of the named query in `docs/lanes/pc/a7-bundle-queries-brief.md`, changed only as this brief says. Bind every timestamp as an ISO string literal inside the SQL text or as a text parameter cast in SQL, never as a `Date` (DEC-20260504-A).

| Check name | Brief queries | Returns |
|---|---|---|
| `capability-debits` | Q1 | `{ total: {…}, slugs: [ {slug, …} ] }`: the `(total)` row as `total`, the other rows as `slugs` |
| `solution-debits` | Q2 and Q2b | `{ total: {…}, slugs: [ … ], before_wp3: { calls, recorded_cents, first_day, last_day } }` |
| `kept-charges` | Q3, Q3b and Q3c | `{ groups: [ … ], orphan_debits: [ {month, no_reference, debits, debited_cents} ], unmatched_refunds: [ {pre_wp3, is_solution, refunds, refunded_cents} ] }` |
| `swallowed-failure-exposure` | Q4 | `{ total: {…}, slugs: [ {slug, payment_method, …} ] }` |
| `fx-error-rate` | Q5 | `{ from: "2026-11-09", to: "2026-11-15", oldest_result_day, rows: [ {source, slug, outcome, n} ] }`; `oldest_result_day` is `MIN(executed_at)` of `test_results` as a day (or null), computed as `test-call-cost` does, so a pruned window is visible rather than a false zero |

Rules for the SQL:
1. **Totals without a fake slug.** Do not emit the `'(total)'` string (it fails the `slug` shape). Run the per-slug query and a separate total query, or split the ROLLUP row out in TypeScript using a `GROUPING(...)` column you then drop.
2. **Payers only in the total.** `distinct_payers` and `payers_unknown` appear in `swallowed-failure-exposure`'s `total` only, never per slug: a per-tool payer count of 1 can point to one customer. `OUTPUT_FIELDS` is a flat key map, so it cannot enforce this by depth: `run()` must build each per-slug row from an explicit list of allowed fields, and the per-slug SQL must not compute payer columns at all.
3. **Counts as integers, cents as text.** Cast counts `::int`; cast cents `::bigint::text`, as `test-call-cost` does. Every cents value here is non-negative by construction (debits are negated sums, refunds are positive sums); keep it that way.
4. **No ids, no content.** Select no user, wallet, transaction or key id, and no input, output or error text. The only text values are slugs, the closed vocabularies below and dates.
5. **Keep the reviewed filters exactly**, in every query that has them:
   - Q1, Q2, Q2b, Q4: `t.status = 'completed'`, `t.is_free_tier = false` and `t.price_cents > 0` (the last keeps Strale's test-harness rows out: they are written completed, wallet, price 0); Q1 and Q2/Q2b also `t.payment_method = 'wallet'`; Q1 also `t.solution_slug IS NULL`, Q2/Q2b `t.solution_slug IS NOT NULL`;
   - Q2: `created_at >= 2026-08-22`; Q2b: `created_at < 2026-08-22`; Q3c: the `pre_wp3` split at 2026-08-22;
   - Q3: `created_at < now() - interval '1 day'` and the completed-price allowance;
   - Q5: `receipt_rail IS DISTINCT FROM 'internal'` on calls, `test_type <> 'piggyback'` on tests, and the 2026-11-09 to 2026-11-16 window on both;
   - Q4: the 36 slugs, held once as an exported `const` array.
   Bind the array as **one** parameter: `= ANY(${sql.param(SLUGS)}::text[])`, which renders `$1::text[]`, or expand it with `IN (${sql.join(SLUGS.map((s) => sql`${s}`), sql`, `)})`. Do **not** write `ANY(${SLUGS}::text[])`: drizzle renders that as `ANY(($1, $2, …)::text[])`, a row constructor Postgres refuses, and the offline fake cannot see it.
6. **Date strings in SQL output** come from `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD')` (days) or `'YYYY-MM'` (months).
7. **Timeouts and bad values fail loudly.** The route's statement timeout is 5 seconds. Several of these statements scan `transactions`, which is never pruned and has no index on `solution_slug`, `payment_method`, `price_cents` or `created_at` alone (`apps/api/src/db/schema.ts` around lines 586-613). A timed-out check must surface as the route's existing error ("The check failed."), never as zero rows: do not catch database errors inside `run()`. Likewise, a negative cents value from a ledger bug fails the `cents` shape and the whole check errors; that is intended. In your report, give for each statement the indexes it can use and whether you expect a sequential scan. Do not add indexes or migrations; the master times each check after deploy and, if one is too slow, a follow-up adds a date-window parameter or a partial index.

Extend the output contract (`OUTPUT_FIELDS`, `SHAPES`, `checkLeaf`) only by adding:
- keys: `total`, `slugs`, `groups`, `orphan_debits`, `unmatched_refunds`, `rows`, `before_wp3` (objects or lists as named above; Q3c's boolean column is `pre_wp3`, a different key, so each key keeps one shape), and the leaf columns each query returns (for example `calls`, `no_debit`, `debit_ne_recorded`, `recorded_ne_listed`, `no_longer_listed`, `refunded`, `debited_cents`, `recorded_cents`, `debited_calls`, `overcharged_calls`, `overcharged_cents`, `overrefunded_calls`, `overrefunded_cents`, `refunds`, `refunded_cents`, `pre_wp3`, `completed_paid_calls`, `distinct_payers`, `payers_unknown`, `first_day`, `last_day`, `month`, `no_reference`, `debits`, `n`, `is_solution`, `slug`, `source`, `outcome`, `status`, `payment_method`);
- a `month` shape `/^\d{4}-\d{2}$/`;
- closed vocabularies, as sets like `TEST_TYPES`: `payment_method` ∈ {`wallet`, `x402`}; `status` and `outcome` ∈ {`completed`, `failed`, `executing`, `pending`, `passed`}; `source` ∈ {`calls`, `tests`}.
  Q3 has no date floor, so a status written by older code and missing here makes `kept-charges` fail on its first production run. That is the intended loud failure; the master then adds the value with its source.
  These cover every value these five checks can return (`health_probe` is also written to `transactions.status`, by `app.ts`, but those rows are price 0 and outside every filter here; `deferred` is never written to it). If you find another written value, add it and name the file and line in your report.

Do not loosen any existing shape, and do not change the three existing checks, the route, the token rule or the 5-second statement timeout.

## Tests (in `apps/api/src/lib/ops-read.test.ts`, using `recordingExecutor`)

- `only the named checks exist`: update the expected list to the eight names.
- For each new check, one test that:
  - feeds canned rows through `run`;
  - passes the result through `assertSafeOutput({ check, result })`;
  - asserts the returned shape exactly.
- `no Date reaches a query`: for all five checks, every bound parameter is not a `Date`.
- `no id or content key is returned`: for all five checks, fed canned rows that also carry `user_id`, `wallet_id`, `api_key_id`, `id`, `input`, `output`, `error`, `key_prefix` and `email`, `run()`'s own result, **before** `assertSafeOutput`, contains none of those keys at any depth, and then passes `assertSafeOutput`. (`assertSafeOutput` would throw on those keys anyway, so testing after it proves nothing: `run()` must build every row from an explicit field list, as rule 2 asks for per-slug rows. Ids may appear inside aggregates in the SQL, for example `COUNT(DISTINCT ...user_id...)`; the test is on what comes back.)
- `reviewed filters are present`, **per check and per query**: for each statement each check runs, assert that its own SQL text or bound parameters contain every filter rule 5 lists for that query. One check carrying a filter must not satisfy the test for another.
- `the slug list binds as one array`: the `swallowed-failure-exposure` SQL contains `ANY($` with a single array parameter equal to the list, or `IN ($1, $2,` with 36 parameters; it never contains `ANY(($`.
- `a database error propagates`: for each of the five checks, an executor whose `execute` rejects with `new Error("canceling statement due to statement timeout")` makes `run(...)` reject with that error. A `run()` that catches it and returns empty rows must fail this test.
- `swallowed-failure slug list`: the exported `const` has exactly these 36 distinct entries, written out in the test (copied once from Q4 of `docs/lanes/pc/a7-bundle-queries-brief.md`; do not read that file at test time).
- `payers never per slug`: a canned per-slug row carrying `distinct_payers` and `payers_unknown` comes back without those keys, while the canned total keeps them.
- `planted text is refused`: a canned `payment_method` of `"refund to jane.doe@example.com"` makes `assertSafeOutput` throw.

Show each new test failing once before your code makes it pass, and quote that in the report.

## Done when

- `npm --workspace=apps/api exec vitest run src/lib/ops-read.test.ts src/routes/ops-read.test.ts` passes;
- `npm run typecheck` passes;
- `docs/lanes/codex/ops-read-money-checks-report.md` is written: status, files changed, each command with its output tail, the red-then-green evidence, and anything you could not do or doubt.

## Out of scope

- No migration, no new route, no new environment variable, no change to `routes/ops-read.ts`.
- No refund logic of any kind.
- Running the checks against production: the master does that after merge and deploy.

## Rules for every Codex build task (read first)

You are a builder in a cloud container for strale-io/strale. The master (a separate Claude session) wrote this brief and will review, verify and merge your diff. This prompt and this brief are your assignment and go-ahead: carry them out now, end to end.

1. Read `AGENTS.md` and this brief. Copy the style of `ops-read.ts` and `ops-read.test.ts`.
2. Change only the owned paths. Never edit `CLAUDE.md`, `AGENTS.md`, decision records, `docs/company/*`, `docs/plan/*` or `docs/programs/*`; if one needs a change, say so in your report.
3. **Windows traps** (the master may run your tests on Windows): match line ends with `\r?\n`; build paths with `path.join`; no `/tmp` paths.
4. No secrets, tokens or real data anywhere; tests use fakes.
5. Leave your work as the task's changes. Write the report (under 60 lines).
6. A design choice you cannot settle, or a finding you doubt: put the question in your report.
