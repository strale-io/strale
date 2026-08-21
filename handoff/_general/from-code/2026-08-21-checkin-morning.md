# 2026-08-21 — morning check-in

Intent: run the Operating-Charter morning check-in — dashboard, overnight health,
stale-work sweep, branch graveyard, decision queue — and then spend the session on
the highest-leverage work available against M1.

## Headline numbers

Measured through `lib/metrics` with the canonical external-customer population,
cross-checked a second way where noted.

| | |
|---|---|
| Current week (ISO, 3 days still to run) | **€45.34 / 715 calls** — already above all of last week (€39.24 / 620) |
| Rolling 7d `revenueCents` | €55.77 |
| Rolling rate by window | 7d €55.77/wk · 14d €52.92/wk · 30d €35.78/wk — rate rises as the window shortens, which is what a genuinely rising series looks like |
| Identified payers, 7d | 2 wallets, **top share 94.7%** |
| Breakers open | 1 (`us-court-search`, deliberately off since DQ-11) |
| Quarantined | 0 |
| Deployed SHA | matches `main` throughout; verified twice |
| External spend | unchanged, ~€4.30 of €50 |

**One cross-check corrected itself and is worth recording.** My first discrete-week
query joined `transactions` to `users` and filtered on email — which silently drops
every x402 row, because those have `user_id IS NULL`. It reported the current week at
€1.66. The canonical `externalCustomers()` predicate says €45.34. Nearly all revenue
is x402; any hand-rolled filter that inner-joins `users` measures approximately
nothing. This is the third recorded instance of a hand-rolled population being wrong.

**Concentration, not the total, is now the binding constraint on M1.** M1 needs ≥5
distinct payers with no single payer above 60%. At 94.7% top share the revenue bar
would be cleared well before the concentration bar. The instrument is young (wallet
identity since 2026-08-15) so it is a lower bound — but it is now old enough to plan
against, which it was not a week ago.

## What I did

### The main piece: `eu-regulation-search` was never broken — our own boot was (#346, merged, deployed, verified)

Chasing the worst non-vendor pass rate on the platform (51% over 24h) found a defect
two levels upstream of where GOALS.md had it.

Startup-migration blocks **0066 and 0069 both derive
`test_suites.scheduled_testing_eligible`** — 0066 from `external_cost_cents`, 0069
from `capabilities.cost_class` — and both run on every boot, in that order. Where the
two sources disagree, each boot flips the flag twice. Neither block notices, because
each post-condition checks only its own derivation immediately after its own write.
**381 suites flip one way and straight back on every deploy.** The 381 rows sharing an
`updated_at` of exactly `2026-08-20 21:03:36` — the previous deploy — are that churn,
sitting in the table. Code-read prediction and production timestamp agreed to the row.

The damage was the `updated_at = NOW()` both UPDATEs carried. `checkBaselineStaleness`
reads `updated_at` as *"this suite's content was edited"*, so a scheduling-flag write
invalidated 12 fixture baselines every deploy. Ten are free to re-run and quietly
re-executed live instead of replaying a fixture. Two are not: `eu-regulation-search`'s
`known_bad` and `edge_case` cost 1¢ a call, so `recordStaleFixture` refused to
re-baseline and wrote `passed: false` instead — permanently. **That is the entirety of
its 51% over 24h and of the 60.4% in the Codebase Quality Program's T4.3 exit
measurement.** T4.3 was right that it was "not a capability fault at all"; this names
what it actually was.

Shipped:
- Neither eligibility UPDATE stamps `updated_at`. A scheduling flag is not an edit.
- 0066 and 0069 now partition the table — 0069 owns capabilities carrying a
  `cost_class`, 0066 owns the 27 unclassified ones (98 active suites) that 0069's
  `cost_class IS NOT NULL` never reached, so the older block cannot simply be deleted.
  0066's fail-boot post-condition is scoped identically; leaving it global would have
  crash-looped boot the moment 0069 legitimately disagreed.
- Block 0094 cleared the two poisoned baselines for live recapture (~1¢ each, once).
  Scoped to the ping-pong set only — `pep-check`, `sanctions-check` and
  `adverse-media-check` are also stale, but for the honest reason the guard exists,
  and stay human-gated.

Verification, both directions and in production:
- Reintroducing `updated_at = NOW()` and the unscoped WHERE fails all three new tests.
- All three statements `EXPLAIN`-parsed against production read-only before merge
  (plan only, no execution) — predicted 0 rows for 0066, 0 for 0069, exactly 2 for
  0094. Boot-blocking gates fail asymmetrically, so this check was not optional.
- After deploy `b5e7428` cut over: **0 suites bumped, 0 `stale_input` writes, both
  baselines cleared.** Prediction and production matched.

Also landed `guarded-executor.budget.test.ts` — the regression test owed to the
cert-audit A-7 follow-up under DEC-20260504-A. It had been written in May, left on an
abandoned rescue branch, and never merged. As written it exercised Drizzle rather than
the fix and passed either way, so I added a source-level check that actually
discriminates. Both new assertions fail if the raw `Date` is restored.

### Stale-work sweep (B2)

- **Open PRs: none** at start. #346 was opened, merged and deploy-verified within this
  session, per the charter's "the session that opens a PR merges it".
- **Deployed SHA = `main` tip**, checked before (`aaf95ee`) and after (`b5e7428`).
- **`remediation/program`** is the one dirty branch: 19 commits, WP0 and WP1 accepted,
  WP2 (wallet service) actively in flight in a concurrent session as I write. Not
  stale — owned, moving, and running under its own program-level autonomy. I left it
  strictly alone but **pushed it to origin**, because five of its commits existed only
  on this disk. Owner: the remediation program. Deadline: its own ledger.
- Local repo hygiene (B2b) run: 4 yellows, all explained by that concurrent session
  (its uncommitted files, no upstream on its branch, no handoff yet). The primary
  checkout sits on `remediation/program` **0 commits behind main** — correct for the
  work in progress, and I did not touch it. No `git checkout` was run in the main tree.

### Branch graveyard (B3): 13 → 7

Deleted after comparing **file contents**, never paths or commit counts — the DQ-15
lesson — and every SHA is recorded here, so all six are restorable:

| branch | sha | why |
|---|---|---|
| `docs/land-stranded-research-2026-08-19` | `bd2a1ec` | both research docs verbatim on main |
| `docs/checkin-2026-08-19` | `44cb6af` | handoff + doc edits all on main |
| `fix/fixture-staleness-not-a-capability-fault` | `5631087` | landed as #341 |
| `archive/retire-solutions-abandoned-2026-05` | `06183f6` | would retire the solutions surface, which is live and carries our only selling bundle line; deliberately abandoned in May, contradicts current strategy |
| `rescue/wip-2026-08-21-detached-e2f4856` | `e2f4856` | two scratch polling scripts from an August session |
| `rescue/stale-2026-08-15-…-budget-counter-date-sql-…` | `6bb5cf4` | **both code fixes already on main; its one unique asset was the regression test, which I landed in #346 before deleting** |
| `tooling/session-state-marker` | `75fa750` | 3 months old, no PR; superseded — the hygiene check is now deliberately *not* session-scoped, so an exact session marker has no consumer |

Staying, with reasons:
- Three Italian-company branches (`feat/phase-7a-it-stakeholders` plus its two 07-16
  rescue snapshots) — live work behind DQ-1's privacy item; DQ-15 already established
  that the three hold *differing variants*, so none is redundant.
- `fix/t02-quality-floor-reinstatement-audit` — 5 days old, not yet graveyard-eligible.
  Its reinstatement script is spent (see below) but its audit narrative is unique.
- `feat/phase-3-extraction-lv` — the LV `legal_representatives` work **is** on main
  (main's executor carries strictly more of it than the branch). What differs is one
  coverage-matrix line: the branch claims `tier_2_coverage: 4/5`, main says `3/5`.
  Owner: me. Deadline: tomorrow's check-in. One question — is main's 3/5 a correct
  re-derivation, or did a COVERAGE.md regen drop a row?
- `remediation/program` — active, above.

### Decision queue (C)

No `your_call` item had a matured default. **DQ-14's four founder-only items are
unchanged and still open** (CourtListener key, reporting the UK Gazette outage to the
vendor, a read-only GitHub token for the frontend repo, archiving `wow-core`). None
blocks anything today. Added **DQ-16** recording today's fix and the branch deletions,
both reversible.

## Three claims in GOALS.md were stale and are now corrected

Each was re-measured before I touched it, and two would have cost the next session a
whole morning:

1. **"The seven fixture-contract bugs are the next fixture-hygiene batch."** All seven
   are at **100% over 48h** (144, 138, 143, 143, 144, 214, 143 runs). Blocks 0090/0091
   already closed them. I had this queued as today's work; measuring first is the only
   reason I did not spend the morning fixing nothing.
2. **"The `us-company-data` re-listing has not happened — it is the first action of
   the next session."** It happened. Production says `is_active = true`,
   `x402_enabled = true`, and it is in `/x402/catalog`.
3. **`eu-regulation-search`'s 60.4%** now names its actual cause rather than stopping
   at "not a capability fault".

## E4 at day 3 of 14: zero, and too early to mean anything

No external sales yet on `competitor-read`, `page-seo-check`, `prospect-brief` or
`keyword-scout`. All four are confirmed live and payable in `/x402/catalog`. The
control is healthy: `lead-email-verify` took **79 orders for €15.80 over 35 days**,
most recent 2026-08-20. The kill criterion does not fire until 2026-09-01.

Measurement trap for whoever checks next, because it caught me: bundles are
`solution_slug` on `transactions` and live in the catalog's **`solutions`** array, not
`capabilities`. Reading only the capability list makes every bundle look delisted — it
did, for about a minute, until I checked the payload shape.

## Overnight health: clean

All 16 dependency probes healthy. Scheduler ticking (17 suites per poll). No
quarantine or promotion events in 4 days. CI green on main. One breaker open and it is
the deliberately-deactivated `us-court-search`.

Three capabilities look poor over 7d and none is a defect: `danish-company-data` 16%
(our own test-budget guard plus an upstream quota — the guard's own message says
customer traffic is unaffected), `french-company-data` 48% (ALLOW_MATRIX correctly
refusing `internal_test` on a paid-prepaid capability), `polish-company-data` 73%
(correct refusals of name-search, which has no compliant path). All three are the
refusal-vs-fault taxonomy gap, already on the record. `redirect-trace`'s alarming
"Too many redirects (>0)" strings are pre-`returnOnRedirectCap` history; it is 62/64
over 24h.

## What the next session should pick up

1. **Confirm the recapture.** `eu-regulation-search`'s `known_bad` and `edge_case`
   have `baseline_output = NULL` and are waiting on their next scheduled dispatch
   (slug-hash staggered; neither had fired by the end of this session). Expect two live
   calls at 1¢, then a fresh baseline and a pass rate that reflects reality. If they
   are still null tomorrow, the scheduler is not reaching them, and that is a new
   finding.
2. **Attribute the x402 enumerator.** Still the prerequisite GOALS.md names before the
   catalog role may read `failed_requests` at all, and still unstarted. It is the
   difference between 1,317 events being demand and being one machine walking the
   catalogue.
3. **Concentration is the M1 blocker, so aim at it.** Revenue is on a plausible path;
   a second and third payer is not. Worth a session on where a *new* payer would come
   from, rather than more capability breadth for the existing one.
4. **The `feat/phase-3-extraction-lv` coverage line** — one question, mine, tomorrow.

## Protocol notes

- No production writes. Every prod query was a `SELECT`, and the three UPDATEs were
  run as `EXPLAIN` (plans, does not execute) before merge.
- No `git checkout` in the main checkout. All editing happened in the existing
  `strale-wt-checkin` worktree, which has its own real `node_modules`.
- No `git stash`, anywhere.
- DEC-20260504-A: #346 carries regression tests verified failing against the un-fixed
  state in both directions. DEC-20260504-C: deploy dependency identified (a startup
  migration block on `runStartupMigrations`'s registry), deployed SHA confirmed via
  `/health`, and production queried for the block's actual effect rather than trusting
  a log line. DEC-20260504-B does not apply — 0094 touches 2 rows.

## Addendum — post-merge re-check (written after the docs merge redeployed)

Checked the fix once more after the second boot of the day, because one deploy is
one sample. **Still 0 `stale_input` writes, and 0 fixture-mode suites bumped.** The
381-row per-boot churn is gone across two independent boots, not one.

Six suites *did* get a fresh `updated_at` in the minutes after that boot, and they
are a different, pre-existing mechanism — `flight-status`, `page-speed-test`,
`tech-stack-detect`, `company-news`, `us-product-recall-search` and `vat-validate`,
all `live` or `canary`, all `known_answer`/`dependency_health`. Five land inside two
seconds of each other, so something at boot is rewriting them. Harmless today (the
fixture-staleness path is `test_mode = 'fixture'` only, so none of these can be
poisoned the way `eu-regulation-search` was), and six is not 381. But it is the same
*shape* as the bug fixed this morning, and nobody has named which block does it.
Worth twenty minutes at the next check-in: identify the writer, and confirm it is
editing content rather than stamping metadata. If it is stamping metadata, it is the
same defect wearing a different hat.

`eu-regulation-search`'s two cleared baselines had still not been re-dispatched by
the end of the session — expected, the scheduler staggers by slug hash. Item 1 of
"what the next session should pick up" stands unchanged.
