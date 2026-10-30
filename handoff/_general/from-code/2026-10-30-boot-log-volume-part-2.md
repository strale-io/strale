Intent: finish the boot-log fix — PR #851 wired the notice handler onto the
one client that barely emits notices, so production got no quieter.

# #851 fixed the wrong client

Measured after #851 deployed (`/health` → `b25466e7`), on a 500-line window:

| signal | before #851 | after #851 |
|---|---|---|
| raw postgres object lines | 90 of 500 | **251 of 500** |
| NOTICE objects | 12 | **35** |
| structured `pg-notice` lines | n/a | **0** |
| per-slug `auto-register-skip-deactivated` lines | ~30 | **0** |

The `auto-register` half worked. The notice half did nothing: **zero**
`pg-notice` lines, so `handlePgNotice` was never called. (The higher counts
are not a regression — this capture covers more of a boot than the earlier
tail did.)

## Why

`handlePgNotice` was wired onto `getDb()`'s pool in `apps/api/src/db/index.ts`.
That pool serves API traffic and emits almost no notices. The boot DDL runs on
**two clients that `runStartupMigrations` builds itself**, in
`apps/api/src/lib/startup-migrations.ts`: `lockClient` (the advisory-lock
session) and `blockClient` (the per-block runner). Both call
`postgres(process.env.DATABASE_URL!, …)` directly, so neither inherited the
handler.

This is the "enumerate the readers" failure in a fix of my own: I changed the
client I found first instead of the client that produces the output I was
measuring, and a passing unit test on `handlePgNotice` made it look done.
The unit test could not fail, because the function was correct — it simply was
not reached.

## The change

`onnotice: handlePgNotice` on both runner-owned clients, with the import
widened to `{ getDb, handlePgNotice }`.

## Evidence

Receipt: [runner clients](../../../archive/receipts/2026-10-30-test-run-boot-log-volume-runner-clients.json).
A new test in `startup-migrations.test.ts` records the options of every client
the runner builds and asserts each carries the handler. Applying the exact
defect #851 shipped — the handler present but absent from both runner clients
— **fails that test** (1 of 222), and it passes with the wiring restored. The
mutant was applied and run, not argued.

Both recorder and handler go through `vi.hoisted`, because `vi.mock` is
hoisted above module initialisation and a plain top-level `const` is not yet
assigned when the factory runs.

## Verify after this deploys

Capture a window and expect raw postgres object lines near zero, with any
genuine notice appearing as a single `label="pg-notice"` line:

```sh
railway logs --service strale > /tmp/post.log
grep -cE "^  (severity|code|message|file|line|routine)" /tmp/post.log
grep -c 'label="pg-notice"' /tmp/post.log
```

The measurement is the point: #851 was merged on green CI and a passing unit
test, and was still wrong in production. A log-volume change is only done when
the log is measured.

Durable logging remains DEC-20261029-A's Better Stack sink, merged and dormant
until its two Railway variables are set.
