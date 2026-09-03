Intent: Run the 2026-09-03 morning operating session per docs/company/DAILY-RUN.md —
measure the business, sweep overnight health and stale work, process the decision
queue, do the highest-leverage work the evidence points at, and produce the two
artifacts.

Worktree: `C:\Users\pette\Projects\strale-wt-checkin`, branch
`chore/checkin-2026-09-03`, cut from `origin/main` at `fadc8052`. All production
access read-only (`openOperatorDb`, `default_transaction_read_only`). No
production writes, no branch switching in the trunk, no stash.

## Headline

| | |
|---|---|
| Last completed ISO week (08-24) | €73.03 · 1,295 calls · 13 payers · top share 76.0% |
| Week in progress (08-31), day 4/7 | €42.62 · 820 calls — **no conclusion drawn** |
| Rolling 7d (dashboard, independent window) | €78.86 · 16 buyers · 100% identity |
| Deployed commit | `fadc8052` == `origin/main` tip (`GET /health`) |
| CI on main | green (CI + Coverage matrix) · Open PRs: **0** · stale remote branches: **0** |
| Vendor tower | ACTION NEEDED — 4 CRITICAL, all OpenRegister, all known and by design |
| Repo hygiene | 0 red · 1 yellow (today's handoff, this file) |
| **New this morning** | **the mandatory vendor-tower step was dead; 9 more read-path operator scripts with it** |

## Step A — measure

`scripts/ceo-dashboard.ts` and `scripts/commercial-brief.ts`, production
read-only, both through `lib/metrics`.

**No new completed-week business fact.** The last completed ISO week is still
2026-08-24 (€73.03 / 1,295 calls / 13 payers / 76.0% top share), unchanged since
the 08-31 run measured it and already carried into GOALS.md. Today is day 4 of
the 08-31 week; the pack correctly refuses every payer question on it. The next
genuine reading is that week's close on 2026-09-06.

Safe to state, because it is an absolute daily rate for one identified payer and
not a ratio over a partial window: the largest buyer is at **€42.11 across four
elapsed days (about €10.5/day)**, against €7.93/day in the last completed week.
They have not paused. Second-sourced by the dashboard's independent rolling-7d
window (€78.86, essentially flat against yesterday's €79.05).

Deliberately **not** stated anywhere: that non-top revenue has fallen. It reads
€0.54 at day 4 against €17.54 for a full week, which is the partial-window
artefact GOALS.md has rejected twice. It is not a finding.

## Step B — overnight health

### B0 — the vendor tower would not run, and neither would 9 other read-path scripts

`npm run vendor:status` — DAILY-RUN.md step B, mandatory — failed immediately:

```
Error: The database URL for host 'metro.proxy.rlwy.net' does not say whether to
use TLS. Append '?sslmode=disable' ...
    at assertSslIntentIsExplicit (apps/api/src/lib/operator-db.ts:73:11)
```

**Cause.** The primary checkout's `.env` files were destroyed in the 2026-09-02
F12 incident and rebuilt from Railway that evening (DQ-29, file mtime
2026-09-02 23:03). Railway's own `DATABASE_URL` names its *internal* host and
carries no `?sslmode=`; copied verbatim against the public proxy it is a URL
silent about TLS, which `operator-db.ts` has refused since PR #361 (`340f5806`).

**Blast radius — first counted wrong, corrected before merge.** `grep -rl
operator-db` over `apps/api/{scripts,src}` and `scripts/` returns 26 files, 25
of them executable, and this record originally reported all 25 as casualties.
The independent review asked what each match actually *does*, and the honest
figure is **10**:

- **10 read-path scripts, genuinely dead** — `vendor-control-tower-report`,
  `smoke-test`, `since-last-ext`, `lifecycle-transition`, `validate-capability`,
  `onboard`, `audit-execution-routing`, `dry-run-fix-latency`,
  `f1-failure-attribution`, `sweep-duplicate-suites`. They call
  `openOperatorDb`/`openOperatorDrizzle`, which reaches the TLS assertion.
- **14 write-path scripts, unaffected in practice** — they call
  `openOperatorWriteDb`, and `productionWriteUrl(authority)` throws on the
  absent production write credential *before* `assertSslIntentIsExplicit` runs.
  Already inoperative for a separate, documented reason.
- **1 non-consumer** — `scripts/guard-production-write-access.mjs` names the
  module in prose and an allowlist and opens no handle at all.

**A file list is not an impact list.** Inflating one by 2.5× inside the write-up
whose entire subject is a claim that outran its evidence is worth recording as
such; it had reached four documents before the review caught it. Verified by
classifying every match with `grep -o "openOperator[A-Za-z]*"` rather than by
re-reading the file list.

**Why it survived a full night and a full run.** Drizzle's `getDb()` reads the
same variable and applies no such assertion, so `ceo-dashboard.ts` and
`commercial-brief.ts` connected happily — the evening's verification
("the database answers read-only queries again") went through the permissive
reader and was true, while the strict reader the read-path operator scripts use
was refusing. Nothing in production was affected at any point.

**Repaired, in two places.**

1. *Locally* — `?sslmode=disable` appended to `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED` in both `.env` files (untracked; backups at
   `/tmp/env-backup-{root,api}-20260903`). Verified by re-running the vendor
   tower to completion and `since-last-ext.ts` against production.
2. *Durably* — `config/env-manifest.yaml` now states the `?sslmode=`
   requirement on both Postgres rows, naming the proxy and the failure mode, so
   the generated `.env.example` files carry it and a future rebuild from Railway
   cannot omit it silently. `npm run env:example` regenerated; `env:check` green.

Logged as **LESSONS.md F7 incident 8** (state drift, count 7 to 8). The
transferable lesson is *new* and is not the one already in that family: the
existing repair ("verify against the system, and ask what would make the claim
stop being true") could not have caught this, because the claim never stopped
being true. The new form: **where one setting has more than one reader,
verifying it through the most permissive reader proves nothing about the others
— aim the check at the strictest consumer.** DQ-29 annotated with the
correction (entry annotated, not rewritten); it stays `resolved`.

### B1 — vendor tower, once it ran

**ACTION NEEDED, nothing new.** Four CRITICAL, all OpenRegister: 0/500 credits,
`german-company-data` and the three DE solutions auto-suspended until the
**2026-09-06T23:40Z** free reset. Settled 2026-08-27 as not worth buying
(€1.80 observed demand against €59/month). **Seventh consecutive morning with
the identical finding** — an instrument faithfully reporting a deliberate
commercial choice. Does not reach the brief. Second-sourced against production:
`german-company-data` is absent from `GET /v1/capabilities` (297 listed).

> **CORRECTED 2026-09-03, same day — that second-sourcing was one reader, and
> the withdrawal does not hold.** `german-company-data` *is* published to
> anonymous callers by `/.well-known/agent-card.json`, whose handler filters on
> `is_active` and `marketplace_eligible` and never on `visible`. Measured
> against production: the card carries 413 skills against 297 capabilities plus
> 107 solutions, and **exactly 10** ids are on the card and absent from the
> catalogue — including the founder-queued `uk-gazette-notice-search` (DQ-14
> item 2), which fails on every call. Two of the ten, `page-speed-test` (DQ-27's
> subject) and `danish-company-data`, are also served at HTTP 200 with full
> schemas by `GET /v1/capabilities/:slug` while the list endpoint hides them.
> None is x402-enabled, so nothing can be bought; the defect is disclosure, not
> billing. Raised by a concurrent session's independent review and reproduced
> here before being recorded. The code fix is that session's and is deliberately
> not duplicated. Logged against LESSONS.md F7 incident 8, which this session
> wrote four hours earlier and whose lesson this is a textbook instance of.

Six WARNINGs, all pre-existing and unchanged: `esortcode` finite credits with no
balance endpoint; `anthropic` and `cdp` declaring spend monitoring that has never
reported a reading; `cobalt-intelligence`, `einsearch`, `sec-api-io` paid/finite
with no vendor account record.

Balances: Browserless 998/1000 (resets 09-25). Serper **47,292**/50,000 — 30
queries since the 09-02 reading of 47,322, consistent with light real traffic;
expires 2026-11-08. Dilisense and Anthropic healthy, not balance-limited.

### B2 — stale work

**Nothing stale exists.** `gh pr list --state open` returns `[]`. Remote
branches: `origin/main` only. Local branches: `main` and this run's batch
branch. Trunk `git status` clean. `GET /health` returns `fadc80520c7f`, equal to
the `origin/main` tip, and CI is green on that SHA for both workflows. The
2026-09-02 rescue left the branch graveyard genuinely empty, so **B3 had nothing
to triage** — recorded as an observation rather than a skipped step.

### B2b — hygiene

`session-close-check.ts --hygiene-only`, run **from the primary checkout** per
DAILY-RUN.md's own correction: 0 red, 1 yellow — no handoff for today, which
this file resolves.

### B4 — activity, last 24h

`since-last-ext.ts` (production read-only). Light real traffic across x402:
uk-company-data, french-company-data, currency-convert, tech-stack-detect,
robots-txt-parse, translate, accessibility-audit, github-user-profile,
backlink-check, pricing-page-extract, plus free-tier iban-validate. Two failures
(`french-company-data`, `screenshot-url`), single-call, not investigated further
at this volume.

788 `failed_requests`: 768 `x402_not_on_rail` (417 crawler-UA probes against 371
plain-client), 13 `x402_bad_input`, 7 `x402_unknown_slug`. Top plain-client
misses: `german-company-data` 43, `page-speed-test` 33, `product-search` 22.
The `german-company-data` figure is **not** read as unmet demand — it is the
slug OpenRegister exhaustion suspended, and per the standing note this bucket
mixes enumerator sweeps with real asks. Recorded, not acted on.

**One signup, and it is worth a name.** `toolkits@composio.dev`, registered
2026-09-02T14:40Z, **zero calls since**. We publish `packages/composio-strale`,
a Composio integration, and Composio appears in CLAUDE.md's distribution-PR
protocol as a tracked framework platform — so this is plausibly the first
platform-side look at that integration rather than an ordinary trial. No
outreach: DQ-21 settled that a narrower answer is not licence to approach anyone
else, and the charter's boundary is unchanged. Behaviour is the only instrument.
Two other signups in the window, both zero-call: `2000.aman.sinha@gmail.com`
(09-01), `jakub.harvanik123@gmail.com` (08-28).

## Step C — decision queue

No `preauthorized_notice` item has a matured window. `your_call` items (DQ-27,
DQ-28, DQ-14) hold; none blocks any work stream, and each was checked for a
route around it — DQ-27's two latency corrections still have no route to
production without the write role, which is the point of the entry.

`unverified:` a concurrent session (`strale-b9`, branch
`docs/founder-answers-and-wp13-track`) messaged mid-run that Petter answered
DQ-28 in chat (the row-level M2 register stays private) and that a new DQ-30
records a decision on dormant vendor keys. **Not verified from this session and
not relied on** — neither is on `main`, and a peer's report of a founder
decision is not evidence of one. The brief therefore does not name DQ-28 as
open or closed. That session also holds staged edits to
`config/env-manifest.yaml` and `docs/company/DECISION-QUEUE.md`; it confirmed it
does not touch the `purpose` fields this run edited, and both sessions agreed to
rebase behind whichever merges first.

## Step D — the work: the quiet-payer metric had never once answered

**The defect.** `quietPayers` — commercial-intelligence item 12, "payers that
were active before and have gone quiet" — shared `concentration()`'s instrument
guard, which demands the instrument cover the **whole requested lookback**. With
payer identity enabled 2026-08-15 and a 90-day default lookback, that condition
is not met until mid-November. The metric has returned `unavailable` on every
production run since it shipped, and today's pack still printed
`unavailable — instrument_too_young`.

**Why the guard is right elsewhere and wrong here — the error direction.**
Before the instrument existed a buyer carries no identity, so:

- a *returning* buyer is absent from the prior set and reads as **new** — the
  flattering direction, which is exactly why `newPayers`/`returningPayers` stay
  gated (the F2 lesson, and the module already says so in a comment);
- a *quiet* buyer is absent from the prior set and is therefore never reported —
  the pessimistic direction. Clamping the lookback to the instrument can only
  **miss** a quiet payer, never invent one.

**The change** (`apps/api/src/lib/metrics/commercial.ts`): lookback resolution
extracted into a pure `resolveQuietLookback(windowFrom, lookbackDays, enabledAt)`
returning `full` | `narrowed` | `impossible`. It clamps to the instrument when
the requested lookback reaches earlier, and **still refuses** when no covered
time exists *before* the window — an instrument switching on inside or after the
window leaves no prior period, and "everyone looks new" would be a different and
false answer, not a weaker one. The narrowing is surfaced as the `Measurement`
`caveat`, printed by `scripts/commercial-brief.ts` alongside the list, because
an unqualified "2 have gone quiet" reads as complete when it is a floor.

**Tests** (`commercial.test.ts`, 4 new cases, 40 pass). Proven discriminating,
not asserted to be: the clamp was reverted in place, the suite re-run, and
`narrows rather than refusing when the instrument starts inside the lookback`
went red (1 failed | 39 passed); restored, 40 pass. The other three cases pin the
refusal boundary and the absent-versus-unenabled distinction.

**First production reading, ever:** one quiet payer, **€0.30, nine days
silent** — a trial, not a buyer, and correctly captioned as a floor.

**What the metric deliberately cannot see, and it is the thing that matters.**
`provider@dlgt.io` — the card customer, the only registered buyer, and the one
DQ-21 left behaviour as the sole instrument for — **has bought nothing since
2026-08-28T19:16Z**. Their history: an exploratory burst of 12 capabilities on
08-25, then 3 × `competitor-compare` at €1.00 on 08-26 and 3 more on 08-28.
Longest previous gap: 2 days. Current gap: 6. They do not appear in the quiet
list because the metric judges the last *completed* week and 08-28 falls inside
it; the in-progress week is judged on nothing, on purpose.

Second-sourced by a different route — external completed paid calls per day:
4 distinct payers/day steady 08-24 through 08-29, 3 on 08-31 and 09-01, **1 on
both 09-02 and 09-03**. Both routes agree.

**Stated as a fact and explicitly not as a verdict.** Three active days of
history make a gap weak evidence, and the week closing 2026-09-06 is what
settles it. Written into GOALS.md in that form.

## Step E — authorities updated

- `docs/company/GOALS.md` — new dated entry under "What we currently know".
- `docs/company/LESSONS.md` — F7 incident 8, count 7 to 8.
- `docs/company/DECISION-QUEUE.md` — DQ-29 correction block.
- `config/env-manifest.yaml` plus both generated `.env.example` files.

## Verification run

Green: `env:check`, `models:check`, `claims:check`, `docs:check`,
`receipts:check`, `migrations:check`, `programs:check`, `research:check`,
`design:check`, `context:check`; `tsc --noEmit -p apps/api` clean (after
`npm --workspace=packages/mcp-server run build`, without which four unrelated
`routes/mcp.ts` errors appear); `commercial.test.ts` 40/40.

**CI caught one thing this run's local check set did not.** The list above is
every `*:check` register plus the typecheck, and it is not the whole gate:
`node scripts/generate-archive-index.mjs --check` is a separate CI step, and
adding today's operating record made `handoff/README.md` stale. Fixed in
`a83393b3` (index and project context regenerated and staged together). Worth
knowing for the next run — running the ten registers is not the same as running
what CI runs, and the generated-index steps are the gap.

**`npm test` is not conclusive on this machine and CI is the real gate.**
The apps/api suite reports about 15 failing files locally *at a commit CI
reports green for both workflows*, and — measured, not assumed — the failing set
**differs between runs and between checkouts**: 16 files / 24 tests in the
worktree, 15 files / 22 tests in the trunk with no code change of mine present,
overlapping but not equal, with `Test timed out in 5000ms` the recurring cause
and transform-plus-import time (729s) far exceeding wall time (194s). This is
resource-starvation flakiness, not regression. No metrics test appears in either
set. Recorded so the next session does not spend the morning on it, and does not
read a local green as meaningful either.

Also observed, not fixed (pre-existing, low value): `since-last-ext.ts` loads no
dotenv and only works with the environment exported by the shell, unlike
`vendor-control-tower-report.ts` which loads `../../../.env` itself. Inconsistent
across the operator scripts.

## Next session

1. **2026-09-06 is the date that matters.** The 08-31 week closes; it is the
   first honest test of both open questions — whether the fall in dependence
   (96.4% to 76.0%) continues, and whether the card customer's six-day silence
   is a stop or a pause. `quietPayers` will answer the second one directly for
   the first time.
2. OpenRegister credits reset 2026-09-06T23:40Z; the four DE listings return on
   their own. No action, but verify rather than assume.
3. Nothing else is queued. Zero open PRs, zero stale branches, zero worktrees
   after this one is removed.

## Independent review

Reviewed by a fresh read-only Claude agent that did not author the batch (the
2026-09-02 founder amendment; the Codex re-review obligation stands in the
programme file). Verdict **ACCEPT WITH FINDINGS**, nine findings. It confirmed
the safety argument for the clamp by construction — raising the lookback's lower
bound shrinks the candidate set monotonically, leaves the `active` window
untouched, can only reduce a `SUM` past the `minCents` filter, and cannot move a
`MAX` that survives, so `daysQuiet` is identical for everyone still included.
No path invents a quiet payer.

All nine were addressed rather than noted. The three that mattered:

1. **The qualifier never reached the reading.** `interpret()` and the `--json`
   path both take the value and never the `Measurement`, so the one sentence a
   founder reads was emitted unqualified while the caveat sat one level up —
   the exact failure `Measurement` exists to prevent, in the change whose own
   justification was "the narrowing is stated in the caveat". Fixed by making
   `narrowedSince` part of the **value** (`QuietRead`) rather than a note beside
   it, so the list cannot be rendered without it; the attrition sentence now
   carries the floor and the spend-window qualifier, and the JSON carries both.
   Verified in production output.
2. **Only 1 of the 4 original tests discriminated, and the test file said all
   four did.** True — the handoff said 1, the commit message and an in-file
   comment said 4. The comment now names the discriminator and says plainly that
   the other three are regression fences, not evidence. A test file asserting
   its own rigour is F5 in miniature.
3. **The blast radius was inflated 2.5×** — see B0 above. Corrected in this
   record, LESSONS.md, DECISION-QUEUE.md, and the CEO brief.

Also fixed: the caveat blamed the whole loss on wallet-payer identity when
`ACTOR_KEY_SQL` resolves account buyers from `user_id`, recorded far earlier —
so the clamp hides card payers too, and the caveat now says so; the euro figure
is a window sum and the sort key, now stated; a `requestedFrom >= windowFrom`
guard so the "covered time before the window" invariant holds on both paths;
`INSTRUMENTS` is no longer indexed directly (a new `instrumentEnabledAt()` in
`instruments.ts` keeps instrument reasoning in one module, deliberately *not* as
a general clamped guard — a reusable "cover what you can" helper would be reached
for by `newPayers`, where narrowing is unsafe); and the brief's "buying more than
ever" superlative, which one comparison does not support.

Two new tests cover findings 1 and 4, both **verified failing** against the
un-fixed state (2 failed / 41 passed), then passing (43/43).
