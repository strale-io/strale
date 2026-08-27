Intent: run the morning operating session under DAILY-RUN.md — measure the
business, clear overnight health, empty the PR queue, repair one false
instrument, and settle two things the record carried as unverified.

Proactivity level 5. Yesterday (2026-08-26) produced no run: no handoff, no
brief, no commit on main. This session covers two days.

## Headline numbers

| | |
|---|---|
| Last completed week (08-17) | **€66.31 / 1,000 calls** — highest in the series, third consecutive completed rise |
| Week in progress (08-24, day 4 of 7) | €38.42 / 691 calls — **not comparable**, `Concentration.comparable = false` |
| Distinct payers, 7d | 9 (1 account + 8 x402 wallets); top share **76.4%** |
| External spend, 7d | €2.09 of the €50 envelope (harness €1.11 + settlement €0.98) |
| Deployed commit | `ae49ca0` mid-session → `fa5e5ab` at end; `/health` matched `origin/main` at both checks |
| Open PRs | 2 at start, **0 at end** |
| Open breakers | 1 (`us-court-search`, DQ-14 item 1, unchanged since 08-17) |
| Scheduled jobs | 18 registered, **0 consecutive failures on every one** |

## The commercial read

**The card customer came back a third time, on a day nobody was watching, and
the 08-25 conclusion about them needs correcting in two places.**

Per-day, all completed, zero failures:

- 08-23 — 2 calls, €2.00, trial credit, `competitor-compare`
- 08-25 — 14 calls, €3.09, the compliance burst (`pep-check`, `sanctions-check`,
  `adverse-media-check`, `beneficial-ownership-lookup`, `insolvency-check`,
  `vat-validate`, `lei-lookup`, `uk-company-data`,
  `uk-disqualified-director-check`, `us-company-data`, `stock-quote`)
- 08-26 — 3 calls, €3.00, **all `competitor-compare`**

Wallet balance now **€3.91**.

**Correction 1 — "they are buying compliance" is half wrong.** Their *money*
went to `competitor-compare`: €7.00 of the €10.09 spent, 69%. The whole
compliance burst was 12 calls for €1.09 — cheap exploration at €0.02–€0.25 a
call. The day after exploring it they went back to the €1.00 capability.
GOALS.md's "follow the money" rule applied to this customer says competitive
intelligence, not KYB. The 08-25 entry is right that compliance got its first
supporting evidence; it is wrong that compliance is what they buy.

**Correction 2 — "seven of their ten euros are unspent, so waiting costs weeks"
is now false.** €3.91 at €1.00 a call is **under four more calls**. On the
08-26 pattern that is days. The 08-25 brief already corrected "wait for a
second payment" to "watch the balance"; the balance has since moved from €7 of
cheap calls to €3.91 of expensive ones.

**New product signal — they are running N-way comparisons by hand.** The three
08-26 calls were three *different* domain pairs covering three companies, all
within 49 seconds — every pairwise combination of a three-company set. They are
paying €3.00 to assemble a three-way comparison our catalogue only sells
pairwise. This is demonstrated, paid-for demand for a multi-entity comparison,
from the only customer who has ever paid us by card. (Domains and account
withheld from both artifacts; the charter allows anonymous product insight from
telemetry and nothing wider, and the shape is the whole finding.)

Two margin notes on the same evidence: each pairwise call scrapes both sites,
so a three-company set scrapes six pages for three distinct domains — a
per-domain scrape cache would halve our cost on this shape. And the 24h result
cache cannot help this customer at all, because they never repeat a pair.

**The dominant wallet is not slowing.** `e9e672ef719ee934`: 1,753 calls,
€101.25, active on 13 of the last 14 days, last seen **today**. The 2026-08-22
"the business pauses when one buyer pauses" scare is finished. Second-sourced
against `payingActors(7d)` top share 76.4% and the 14d per-actor breakdown.

**Two second-tier wallets show return behaviour**: `35f8dfc00fc9f340` (56
calls, €5.47, first 08-21, last today) and `6bfcaec686ef7739` (39 calls, €1.95,
first 08-26, last today). Both far too young to call habits.

## Closed: the cache is verified in production

The 08-25 handoff recorded `unverified: the cache is NOT confirmed working in
production` and could not close it because `STRALE_API_KEY` is dead. Production
traffic settled it without a key:

```
08-25 08:43:28Z  github.com x gitlab.com   cache_hit=false
08-25 08:44:05Z  github.com x gitlab.com   cache_hit=true, cache_age_hours=0
```

37 seconds apart, same input, opposite verdicts. Self-second-sourcing: the
`cache_hit` field only exists in the post-`f992fd5` build — every
competitor-compare row before the deploy has it null — so these rows are also
evidence of *which* build served them. The account was `test3@strale.internal`,
so this is a production exercise by us rather than by a customer, which is
enough for the claim being made.

**`STRALE_API_KEY` is still dead** and still blocks every authenticated local
end-to-end check. Unchanged from 08-25; needs a production write.

## Settled without escalation: OpenRegister

The vendor tower's four `CRITICAL` lines are known and already handled by
design — `german-company-data` and the three German bundles stay suspended
until both the 2026-09-06T23:40Z free-allowance reset and confirmed usable
credits. Not new, not a defect.

What is new is *who* the demand was. All 36 external German calls landed on a
single day, **2026-08-24**, €1.80, from one wallet — and that wallet is
`e9e672ef719ee934`, the dominant buyer, not a new customer. So the suspension
costs €1.80 from someone already spending ~€100/week with us. OpenRegister Pro
at €59/month needs ~295 paid calls/month to break even; one day of 36 calls at
the corrected €0.20 price is €7.20. **Not worth buying, and therefore not a
founder decision.** Re-open only if the September reset is immediately
exhausted again.

## Shipped

| PR | what | gates |
|---|---|---|
| #399 `498650e` | `/x402/*` had no request-body cap at all; adds one plus decoded-byte and output-pixel limits on image-resize | check + integration-db pass |
| #402 `d60aadd` | paid-api-preflight declares its 12-field output contract; manifest enums and true nullability | check + integration-db pass |
| #407 `ab69416` | the orphaned-handoff warning was reading the wrong branch — mine, this session | check + integration-db pass |

Deployed `fa5e5ab`; `/health` confirmed `ae49ca0` after #399 and the tip after
#407.

### #402 is the repository's first outside contribution, ever

Author `epistemedeus`, from fork `epistemedeus/strale`,
`author_association = FIRST_TIME_CONTRIBUTOR`. Not an org member, not a repo
collaborator, no prior commit on main — every one of the last 200 commits on
main is `petterlindstrom79 <petter@stridemacro.com>`. The repo is public with
exactly one fork, which is theirs. The branch prefix `codex/` matches our own
Codex-CLI convention, so it may well be a third account of Petter's; I could
not establish that and did not guess.

What I checked before merging, rather than escalating:

- The diff is two files: a new test and `manifests/paid-api-preflight.yaml`.
  No executor, no workflow, no dependency, no CI config.
- The manifest change cannot affect serving: `db/schema.ts:188` records
  `output_schema` as *"documentation only, not enforcement"*.
- CI is plain `pull_request`, never `pull_request_target`, and references no
  secrets — so approving the held fork run exposes nothing and hands the fork a
  read-only token. That made running the gates a technical decision, not a
  trust one.
- Both lanes green after the run was approved.

Merged as `SYSTEM_ACTING`, reversible by revert. Reported to Petter as
decide-then-tell: if the account is not his, the thing to revisit is who may
propose changes, not this diff.

## The instrument that was lying (#407)

`session-close-check --hygiene-only` reported two incident records as *"exist
only on disk — losing this directory loses them"*. Both were byte-identical to
the copies on `origin/main`:

```
2026-08-22-PROCESS-VIOLATION-...  local=c97235f1  main=c97235f1  IDENTICAL
2026-08-22-starve-set-1-...       local=9d9f630d  main=9d9f630d  IDENTICAL
```

Cause: `git ls-files --error-unmatch` asks whether the path is in the index of
*whichever branch this checkout is sitting on*. The primary checkout is on
`remediation/wp9-artifacts`, 48 commits behind main, so everything added to
main since reads as unsaved. LESSONS.md F1 — an alert firing on something
correct — and CHARTER "Act first" item 2 makes repairing it outrank what it was
pointing at.

The predicate now lives in `src/lib/handoff-preservation.ts` (in `src/` because
vitest collects only `src/**` and `test/**`; a predicate left in `scripts/` is
untestable, which is part of why this shipped unexamined). It clears a file on
any of: tracked here, identical blob at the same path on `origin/main`,
identical blob on the branch's pushed upstream. Strict superset of the old
safe-set, so it can only withdraw false positives. Matching is on **content,
not path** — a locally-edited handoff whose filename exists on main is still
flagged, and there is a test for that direction.

Discrimination, both levels:

- unit — swapping in the un-fixed predicate (`return !trackedHere`) fails 2 of
  6 tests, passes 4;
- end-to-end — reproduced the real condition by un-indexing a handoff whose
  identical content is on `origin/main`; the old script emits the warning, the
  new script is silent, same repo state and same file.

## Investigated and found NOT to be a fault — do not re-investigate

Seven rows in `job_schedule` carry `last_started_at` with `last_finished_at`
and `last_outcome` both null: `chromium-probe`, `diagnostics`, `health-check`,
`meta-daily`, `meta-hourly`, `retention`, `weekly-sweep`. `retention` and
`weekly-sweep` have looked like this since 2026-08-23, which reads exactly like
a silent bulk-operation failure.

It is deliberate. Those seven are test-scheduler tasks that go through
`consumeDueSlot`, not `claimJob`, and the comment at
`job-coordinator.ts:483-488` says so explicitly: only the START is recorded,
because the first version wrote `last_outcome = 'ok'` *before* the task ran and
so recorded a sweep that then threw as a success. These rows are never claimed
through `claimJob`, so a null finish mark misleads no one. Cost real time this
morning; writing it down is the fix.

## Stale-work sweep (B2 / B2b / B3)

- **Open PRs: 0.** All three merged this session.
- **Deployed == main tip** at both checks.
- **Deleted from the remote**, recorded here first so each is restorable:
  `docs/receipt-phases-1-3-accepted` →
  `8be0a7ffd1c0aed6299cab329ca00c72f67704a7` (content diff against main: 0
  files); `fix/x402-body-limit` → `498650e085f6735c60708469a3a9732adecfd0ef`
  (merged); `fix/hygiene-orphan-handoff-false-positive` →
  `9689da0383a41250990032c88e9c84b279b85422` (merged). Verified against
  `git ls-remote`, not the local ref cache.
- **A new rescue branch appeared today**:
  `rescue/wip-2026-08-27-fix-x402-body-limit-2128c76`. Left alone; someone's
  safety net fired.
- **Hygiene check, run from the primary checkout**: 0 red, 4 yellow. Two were
  genuine (no upstream on the current branch; no handoff for today, now
  written), one is the false positive #407 fixes, and one is the finding below.

### The primary checkout is parked on live unfinished work

`C:\Users\pette\Projects\strale` sits on `remediation/wp9-artifacts`, 48
commits behind main, with three modified tracked files
(`scripts/reconcile-stranded-executing.ts`, `src/lib/alerting.ts`,
`src/test-env-setup.ts`) and an untracked `src/lib/alerting.isolation.test.ts`.
Compared by **file contents**, not commit counts: 22 of 22 touched files still
differ from main, so this is real unmerged work, not a squash-merge artefact.
**Do not switch this checkout.** Owner: the remediation programme. Deadline:
raise at the next synthesis if untouched on 2026-08-31.

### Branch graveyard — 12 oldest, every one carries unique content

Nothing else qualified for deletion: none is over a month old and none is
content-merged. Residual file-diff against main after the sweep:

```
2026-08-14 feat/phase-7a-it-stakeholders        7 of 7   <- oldest, see below
2026-08-21 remediation/program                 39 of 61
2026-08-22 remediation/wp9-artifacts           22 of 22
2026-08-22 wp9-landing                          1 of 1
2026-08-23 remediation/wp10-job-coordinator    12 of 30
2026-08-23 remediation/wp10-observation         2 of 4
2026-08-23 feat/execution-receipt                3 of 11
2026-08-23 feat/receipt-phase4                 11 of 14
2026-08-23 docs/receipt-phase4-reconciliation    1 of 1
2026-08-24 fix/sanitize-hostname-leak            2 of 2
2026-08-24 fix/audit-raw-error-leak              3 of 10
2026-08-24 feat/receipt-phase5                   6 of 25
```

**Zero open PRs against twelve branches of unmerged work is the shape to worry
about**, not any single branch. Owner: me. Deadline: at the next synthesis each
of these gets a PR or a deletion, not a third listing.

`feat/phase-7a-it-stakeholders` is the Italian ownership capability the 08-25
brief promised to finish and the 08-25 handoff flagged as *"no owner — third
morning"*. It is now the fourth. **I am deliberately not finishing it**, and
saying so rather than letting it appear again: GOALS.md ranks a second payer
above all capability work, and DQ-3 measured all 17 company-data capabilities
at €2.15 external revenue over 90 days. An eighteenth entry in that line does
not move the binding constraint. Owner: me. Disposition: parked until either
company-data revenue moves or a customer asks for Italy — and the branch
carries a PII scrub (`8774fff`) that must not be lost, which is the reason to
keep it rather than delete it.

## Decision queue (step C)

- **DQ-14** (`your_call`, Petter, open since 08-18) — unchanged, and I did not
  move it. Item 1 (CourtListener key) is why the single open breaker exists;
  nobody has called `us-court-search` in a month. Item 2 (Gazette) needs vendor
  contact, founder-gated. Item 3 was already routed around on 08-23. Item 4
  (wow-core) is a repository act on his account. Nothing here blocks anything.
- **DQ-18** — settled in both directions; not re-raised.
- **DQ-3 / DQ-10** — notes on the record, no action.
- Nothing matured into a `preauthorized_notice` execution today.

## For the next session

1. **Watch the card customer's balance, not their next payment.** €3.91 is
   under four `competitor-compare` calls. Whether they top up a second time is
   the single most informative event available to us, and on current behaviour
   it is days away, not weeks.
2. **The multi-entity comparison is the best product lead we have** — demanded,
   paid for, by the only card customer, and cheaper for us to serve than three
   pairwise calls. Scope before building: the onboarding pipeline is mandatory
   (DEC-20260320-B) and this is a new slug, not an edit.
3. **The temperature pass** from the 08-25 handoff is still unstarted. Line and
   priority order are written there; prose-heavy first (`summarize`, the
   `*-analyze` / `*-review` family), generative capabilities deliberately left
   unset.
4. **`STRALE_API_KEY` rotation** still blocks every authenticated local
   end-to-end check. Production write; not mine.
5. **Twelve branches, zero PRs.** See the graveyard table above.
