Intent: cut the boot log volume that pushed the API replica past Railway's
log rate limit, so dropped messages stop destroying the evidence a production
diagnosis needs.

# Railway was dropping our log lines, and that hid a real error

## What was found

While trying to diagnose the backfill failure in
`2026-10-30-backfill-blocked-three-slugs.md`, the API log contained **no line
at all** for the failing onboarding request — no `onboarding-run-start`, no
`onboarding-pipeline-failed`, not even a `request-complete` for
`/v1/internal/onboarding/run`. The obvious reading, that the request never
reached the API, was wrong: the API had answered 200 with a full run body.

The log said why, in a line of its own:

```
Railway rate limit of 500 logs/sec reached for replica, update your
application to reduce the logging rate. Messages dropped: 137
```

**Railway silently discards messages above 500/sec per replica.** The lines
existed and were thrown away, and the error that would have explained the
backfill failure went with them.

## What was emitting the volume

Measured on a captured 500-line window, not guessed:

| source | cost |
|---|---|
| postgres server NOTICEs | 12 notices → **90 lines** (~7.5 each) |
| structured app lines | 382 |

`postgres-js` prints every NOTICE to the console as a raw multi-line object,
and no `onnotice` handler was set. The startup migrations are idempotent DDL
(83 blocks of `CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), so
every boot emits a burst of `already exists, skipping` notices. Second
contributor: `auto-register` logged one line per deactivated capability with
its full reason text — about 30 lines a boot, whose content is already in the
`DEACTIVATED` map in source and identical on every boot.

The `startup-migrations-complete` blob looks like the obvious culprit but is
not: all 83 block outcomes are a single message, and the limit counts
messages.

## The change

- `handlePgNotice` in `apps/api/src/db/index.ts`, wired as postgres-js
  `onnotice`: drops the benign `(already exists|does not exist), skipping`
  class, and keeps every other notice as one structured `pg-notice` line,
  because an unexpected notice is a signal.
- `auto-register` collects the deactivated slugs and emits
  `auto-register-skip-deactivated` **once** with a count and the slug list,
  instead of once per slug with the reason. The per-slug labels for real
  failures (`auto-register-no-executor-after-import`,
  `-executor-file-missing`, `-import-failed`) are untouched, so an expected
  skip is still never confused with a bug. No other reader of that label
  exists — checked before renaming the shape.

## Evidence

Receipt: [boot log volume](../../../archive/receipts/2026-10-30-test-run-boot-log-volume.json).
`pg-notice.test.ts` pins the filter **from both sides**, which matters because
a filter that drops everything would pass a naive test:

| mutant | result |
|---|---|
| drop every notice | 3 of 4 tests fail |
| keep every notice | 1 of 4 tests fails |

Both were applied and run, not reasoned about. 7 tests pass across the new
file and `auto-register-data-access.test.ts`; root `npm run typecheck` clean
apart from the pre-existing `@duckdb/node-api` resolution error.

## This is a mitigation, not the fix

Lowering our rate makes drops less likely; it does not make logs durable, and
nothing warns us when Railway drops the next burst. The decided fix already
exists and is merged but dormant: **DEC-20261029-A**, the Better Stack EU
sink, waiting on `BETTERSTACK_SOURCE_TOKEN` and `BETTERSTACK_INGEST_HOST` in
Railway — Petter's two variables, on his queue as the H8 walkthrough. Until
then, treat the API log as lossy: reproduce an event while tailing rather than
searching back, and put anything that must be provable afterwards in a DB row
or a receipt.

## Still open

The three frozen test suites (`eurostat-data`, `entity-resolve`,
`places-search`) are unchanged. Their backfill still throws in 4 ms, and this
change only improves the odds that the next attempt's error line survives long
enough to be read. Retry the three after this deploys and tail the log while
doing it.
