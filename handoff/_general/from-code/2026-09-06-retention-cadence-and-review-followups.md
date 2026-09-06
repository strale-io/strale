# Retention cadence, the clamp that made it real, and three review follow-ups

**Intent:** Fix the GDPR content-redaction backlog found while deciding what to
do after the agent-data capabilities batch, and close the items the review of
that batch left open.

Date: 2026-09-06
Branch: `fix/retention-cadence-and-followups` (PR #598)
Preceded by: `2026-09-05-agent-data-capabilities-from-competitor-review.md`

## The finding

Production, 2026-09-06: **87,718 transactions past the 90-day content-retention
window still held customer input**, oldest 102 days against a published 90-day
claim. Nothing blocked them — `legal_hold` and `deleted_at` excluded zero rows.

Not a fault, arithmetic. The redaction is capped at
`BATCH_SIZE 1000 × MAX_BATCHES_PER_RUN 50` = 50,000 rows per run and was gated
**weekly**, against **68,790 rows/week** crossing the line (9,827/day). A
standing **18,790/week deficit**.

Two things made it invisible:

- **It is not the retention job.** The redaction lives in `cleanupOldTestData`,
  called from `test-scheduler.ts`. The healthy daily `db-retention` job does
  deletes and correctly reports `ok`, which is why nothing looked wrong.
- **A capped run and a finished run returned the same shape.**

**It is a regression, not a standing condition.** Until 2026-08-23 the sweep ran
many times a day because its cadence lived in an in-process map that reset on
every deploy. **PR #376** moved cadence into `job_schedule` and made the
declared weekly interval real for the first time. The backlog begins there.
**`weekly-sweep` is the other 7-day task that inherited the same latency and
nobody has checked it.**

## The fix, and the part that nearly didn't work

Cadence weekly → daily, plus a `retention-cleanup-backlog` warning carrying the
remaining count when the ceiling is hit. Per-tick work is unchanged (1,000-row
batches 100 ms apart, same 50,000 cap), so this is DEC-20260504-B's
self-throttling option rather than a pre-drain.

**Independent review caught that this would have done nothing for a week.**
`consumeDueSlot` gates on `job_schedule.next_run_at`, and its `ON CONFLICT`
clamp only pulled that in when `last_finished_at` was set — a column
`consumeDueSlot` never writes. The clamp was permanently a no-op, so shortening
an interval had no effect until the job next fired on its old schedule.
Production confirmed it mid-review: the weekly sweep fired at 09:11 that morning
and set `next_run_at` to **2026-09-13**.

The clamp now falls back to `last_started_at`, in `consumeDueSlot` only
(`persistRegistration` keeps the original — its runner does write the column).
Simulated read-only against every affected row before merge: **exactly one row
changes** (`retention`, 13 Sept → 7 Sept); zero pushed out, zero never-run
staggers disturbed.

## Also in this batch

- **SEC rate gate on `company-fundamentals`** — one module-level chain spacing
  request starts by 120 ms, so the ~10/s ceiling holds across concurrent
  invocations. `avg_latency_ms` 840 → 2350 with a limitation saying why.
  Known limits, documented in the source: it is per-process (two Railway
  instances would double the rate) and nothing bounds how long a caller waits
  for a slot (~8 concurrent invocations pushes the last request past the 15 s
  sync wall). Neither bites today — the capability has no production row.
- **`pii-redact` disclosure** — it is defined by receiving text known to contain
  personal data, including special-category identifiers, and said nothing about
  retaining it for 90 days.
- **`docs/security/2026-09-06-input-redaction-at-write-proposal.md`** — the
  mechanism behind that and the `password-strength` correction, as a proposal
  awaiting a decision. Names the two blocking questions (audit hash chain,
  idempotency) and deliberately does not answer them.

## Verification

`npm test`: **3,917 pass, 0 fail**. CI green (check, classify, integration-db).
**9 of 9 planted mutations caught**, including reverting the cadence, bypassing
the SEC gate, and reverting the clamp.

**Two defects of my own that review and the full suite caught:**
a guard broken by splitting a drain-loop break in two (it matched by exact
source text; it now matches by structure per loop), and a comment using
backticks inside a `` sql`` `` template, which terminated the string and broke 29
test files. The second was reintroduced once by `git checkout HEAD --` after
mutation-planting restoring a version that predated the uncommitted fix — the
trap `feedback_commit_before_mutation_testing` already warns about.

I also claimed "44 of 44 CI gates pass locally (the full job)" when the sweep
excluded `npm test` — step 51 of 51, and the step that would have caught the
syntax error. **Run the real suite before claiming green.**

## DEC-20260504-B accumulated-workload audit

The cadence change accelerates **all six** purge rules in `cleanupOldTestData`
sevenfold, not just the content redaction, and each is capped at 50,000/run —
so worst case moves from ~300k row-operations per week to ~300k per day, on the
database that crash-looped from exactly this class on 2026-05-04. Raised by the
round-2 review, which noted the audit belonged in the PR body and was not there.

Measured read-only on production 2026-09-06, using each rule's own predicate:

| rule | backlog |
|---|---|
| `test_results` > 90d (`executed_at`) | **0** |
| `transaction_quality` > 1095d | **0** |
| `transactions` > 1095d | **0** |
| `health_monitor_events` > 180d | **0** |
| `capability_invocations` > 180d | **0** |

Every sibling is empty, so the first daily run does the same work the
2026-08-30 and 2026-09-06 weekly runs already did without incident: 50,000
content redactions and nothing else. The content backlog itself clears in a
single run from 37,987.

Worth carrying: those five loops have the identical invisible-ceiling shape
this batch fixed for the sixth, and only the sixth got the backlog warning.
They are a latent duplicate, not a live gap.
## Open

- **`weekly-sweep` has not been checked** for the same PR #376 latency.
- **Nothing consumes `retention-cleanup-backlog`.** The warning is an
  improvement on a silent INFO count, but no monitor or ops surface reads it.
- **Five sibling drain loops** in `data-retention.ts` carry the identical
  invisible-ceiling shape. Their backlogs measured zero today, so it is a latent
  duplicate, not a live gap.
- **`company-fundamentals`**: per-process gate, unbounded slot wait (above).
- **`DATABASE_URL` is a `postgres` superuser on the primary** — `rolsuper`,
  INSERT/UPDATE on every table. The `DATABASE_URL_WRITE` gate lives in
  `operator-db.ts` and nothing else, so any script opening the URL directly can
  write; `openOperatorDb()`'s `default_transaction_read_only` is the only real
  enforcement. Reported to Petter 2026-09-06; whether to issue a restricted role
  is his open decision.
- **This batch owes a Codex review** (DEC-20260903-A), as CX-35, alongside
  CX-34 for PR #582. Not yet added — the register requires the squash-merge
  commit, so it is a follow-up.
