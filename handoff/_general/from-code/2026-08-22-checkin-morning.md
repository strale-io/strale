# 2026-08-22 — morning check-in

Intent: run the Operating-Charter morning check-in — dashboard, overnight health,
stale-work sweep, branch graveyard, decision queue — then spend the session on the
highest-leverage work available against M1.

The overnight event set the agenda: at 05:58Z the quality floor withdrew a
free-tier front-door capability, on evidence that turns out to contain no defect,
and the withdrawal exposed a second bug in which the platform kept advertising
what it had just stopped serving.

## Headline numbers

Measured through `lib/metrics` and cross-checked a second way — discrete ISO
weeks over the canonical `externalCustomers()` predicate, which is a different
cut of the same table rather than the same query re-run.

| | |
|---|---|
| Current ISO week (08-17, one day still to run) | **€56.89 / 878 calls** — highest week in the series on both counts |
| Four weeks, discrete | 07-27 €10.85 · 08-03 €27.38 · 08-10 €39.24 · 08-17 €56.89 — four consecutive rises |
| Rolling `revenueCents` | 7d €64.39 · 14d €55.31/wk · 30d €36.06/wk — rate still rises as the window shortens |
| Identified payers, 7d | **4 wallets, top share 99.3%** (a week ago: 2 wallets, 94.7%) |
| Identity coverage, 7d | 91.4% |
| Breakers open | 1 — `us-court-search`, deliberately off since DQ-11 |
| Withheld from catalogue | 9 |
| Deployed SHA | `c6a3b16` = `main` tip, verified after this session's merge |
| External spend | ~€4.78 of €50 |

**Distance to M1 is now ~4×, down from ~5×.** The revenue trend is real and it is
not a windowing artefact: rolling and discrete agree, and every discrete week
since 07-27 is higher than the one before.

**Concentration is the binding constraint and it moved the wrong way.** Two more
wallets appeared this week and the top share went *up*, 94.7% → 99.3%. Three of
the four wallets are rounding error. Read together, the two numbers say we are
selling more to the same buyer. M1 requires five distinct payers with none above
60%, so the revenue bar will be cleared long before the concentration bar — and
nothing this week moved the concentration bar at all.

## What I did

### The main piece: a free-tier front door was withdrawn, and we kept advertising it (#358, merged, deployed, verified)

At **05:58:42Z** the quality floor quarantined `url-to-markdown` — one of the
eleven no-signup free-tier capabilities — at *"completion 67% on 15 eligible
calls/30d"*. Two separate things were wrong.

**The advertisement outlived the capability.** Quarantine sets `visible = false`
and `matchCapability` refuses an invisible capability by design — that is WP8,
and it is correct, quarantine must not be bypassable. But `do.ts`'s private
`getFreeTierSlugs` selected `is_free_tier AND is_active AND lifecycle_state =
'active'` and never consulted `visible`. Verified live before touching anything:

```
dns-lookup       (free tier, visible)     → 200, real output
url-to-markdown  (free tier, quarantined) → 401 … and the 401 body listed
                                            url-to-markdown among "these 11
                                            capabilities are free with no
                                            signup — try them without an API key"
```

An agent that did exactly what the refusal told it to do was refused again. A
side effect: with the slug out of the pool, "convert this url to markdown" began
matching `markdown-render`, which asks for a `markdown` field.

Two further surfaces carried hand-written slug literals that no query touched at
all. `auth.ts`'s signup gate named a hardcoded five including `url-to-markdown`,
so the instruction for unblocking signup was a call that would fail. `/v1/pricing`
listed five of the eleven and had done so since before six of them existed — a
literal cannot track a withdrawal *or* an addition.

`lib/free-tier.ts` is now the single authority and it does not re-implement
servability: it calls `isServableCapability`, the WP8 predicate that decides
whether the call will actually be served. All three surfaces read it.

**The quarantine itself was wrong.** I reproduced the floor's own population
against production and got its numbers exactly — 15 eligible, 10 completed,
66.7%, 4 distinct failure days — so the arithmetic was right and the evidence
behind it was not:

| n | error | what it actually is |
|---|---|---|
| 1 | "This page returned almost no readable text (0 words). It may require JavaScript…" | the capability answering correctly |
| 2 | "…could not be loaded (HTTP 400)" | the caller's target site |
| 2 | "This site is rate-limiting requests (HTTP 429)" | the caller's target site |

Not one is a defect. Checked three further ways: the executor's live smoke test
passes end to end, the harness is 531/531 over 7d (weak on its own — GOALS.md
says why), and the two most recent real external calls, 2026-08-07 and
2026-08-21, both completed.

The no-content refusal now classifies `caller_input` — the same line the taxonomy
already draws for "your input matches nothing", applied to page content instead
of an identifier. **Deliberately narrow.** `structured-scrape`'s "returned too
little content" was pinned as *ours* by an earlier review and stays that way: it
claims nothing about what was inspected, so it reads equally as our own fetch
under-reading the page. My first pass excused both; the existing test caught it
and the existing test was right.

**Block 0100** re-lists the capability with its promotion event in the same
transaction. Flags without the event would leave the floor's window clamp and the
promotion job reading an un-reversed takedown, and the next tick would
re-quarantine on the same July rows. Ledger-guarded, so a later legitimate
quarantine is not undone on the next deploy.

Verification, both directions and in production:

- **14 new assertions, every one checked against the un-fixed state.** Reverting
  the taxonomy pattern fails 2; reverting `isServableCapability` fails 3; three
  separate mutations of the migration block (unconditional event, no ledger
  guard, `x402_enabled` without `visible`) fail 1, 1 and 2 respectively. Full
  suite 2300 passed / 187 files.
- **Pre-merge:** all three block statements `EXPLAIN`-planned against production
  read-only — plan only, nothing executed. The `UPDATE` matched exactly one row
  and the post-state satisfies `capabilities_no_half_quarantine`.
- **Post-deploy, by effect rather than by log line:** `url-to-markdown` serves on
  the free tier with real output; present in `/x402/catalog` and
  `/v1/capabilities`; `/v1/pricing` now lists **11** free capabilities from the
  database instead of a hardcoded 5; ledger row present with `rows_affected = 1`;
  promotion event `promoted_with_x402`, `mode = enforce`, timestamped after the
  quarantine; half-quarantine census still 0.

### Stale-work sweep (B2)

- **Open PRs at start: none.** #358 was opened, merged and deploy-verified inside
  this session, per the charter's "the session that opens a PR merges it".
- **Deployed SHA:** `88c09dc` at start (= `main`), `c6a3b16` after the merge
  (= `main`). Never diverged.
- **`remediation/wp9`** is the one dirty branch — the remediation programme,
  running concurrently under its own autonomy, last commit 07:54 today. Two
  commits existed **only on this disk**; I pushed the branch to origin and left
  the work strictly alone. Same failure mode yesterday's session found on
  `remediation/program`, and it will keep recurring until that programme pushes
  as it goes. Owner: the remediation programme. Deadline: its own ledger.
- **Local hygiene (B2b):** 3 yellows — no upstream on `remediation/wp9` (now
  fixed by the push), no handoff yet for today (this file), and the primary
  checkout sitting on `remediation/wp9` **0 commits behind main**, which is
  correct for work in flight. I did **not** `git checkout` in the main tree.

### Branch graveyard (B3): 13 → 6

**Three branches yesterday's handoff recorded as deleted were still on origin**
(`fix/fixture-staleness-not-a-capability-fault`,
`docs/land-stranded-research-2026-08-19`, `docs/checkin-2026-08-19`). Checked
against the GitHub API, not the local ref cache. Another instance of DQ-11's
lesson — a deletion written down is not a deletion executed — and worth the next
session verifying its own sweep against `gh api repos/.../branches` before
recording it.

Deleted after comparing **file contents** against `main` — never paths, never
commit counts. Every SHA recorded, so all seven are restorable:

| branch | sha | why |
|---|---|---|
| `fix/fixture-staleness-not-a-capability-fault` | `5631087f4c48d259135c37f783448ede8b677c9d` | landed as #341; zero branch-only lines in either changed file |
| `docs/land-stranded-research-2026-08-19` | `bd2a1ec7af717bf703a2a5fcdbb65937db71028e` | both research docs byte-identical on main |
| `docs/checkin-2026-08-19` | `44cb6afd44932c62cf4ca1427565819b09374c17` | handoff identical; the 18 GOALS.md branch-only lines are superseded states of a living doc |
| `fix/eligibility-reconcile-not-a-content-edit` | `c7ea3b8e3ec6311913eec8a2bd312ff1ed686a10` | landed as #346; zero branch-only lines |
| `docs/checkin-2026-08-21` | `904a2c85dc0bc875f24b42c7adef391b2e917468` | main's handoff is a strict superset (carries the addendum) |
| `docs/checkin-2026-08-21-addendum` | `ac2a5ac260fd5bba38ad905e6483cfe72ee91728` | handoff identical on main |
| `feat/phase-3-extraction-lv` | `2969d90370920ca71c48e06097ee890b687177e7` | superseded — see below |

**`feat/phase-3-extraction-lv` was yesterday's open question and the answer is
settled.** My first pass looked alarming: 91 lines on the branch absent from
main, including the whole `amatpersonas` officer-extraction block, which reads
like unfinished work. It is not. Main's executor is 324 lines to the branch's
273, carries 142 lines the branch lacks, and uses the *same* officers resource
(`e665114a-73c2-4375-9470-55874b4cfa6b`) — the branch simply names the dataset in
Latvian in its comments and main names it by its formal title. Settled at the
level that actually counts: calling `latvian-company-data` on production for
airBaltic returns **2 legal representatives** with roles, representation rights
and start dates — richer than the branch's shape. Main is strictly ahead.

Staying, with reasons:

- Three Italian branches (`feat/phase-7a-it-stakeholders` and its two 07-16
  rescue snapshots) — live work behind DQ-1's privacy item; DQ-15 established
  they hold differing variants, so none is redundant.
- `fix/t02-quality-floor-reinstatement-audit` — 6 days old, audit narrative
  unique, not yet graveyard-eligible.
- `remediation/program` and `remediation/wp9` — active.

### Decision queue (C)

No `your_call` item had a matured default; nothing executed automatically.

- **DQ-14** unchanged and still open — CourtListener key, reporting the UK
  Gazette outage to the vendor, a read-only GitHub token for the frontend repo,
  archiving `wow-core`. None blocks anything.
- **DQ-18 added** (`your_call`): a pointer to the two decision briefs the
  remediation programme committed at 07:54 today. They were living only in
  `docs/remediation/DECISION-BRIEFS.md`, which the dashboard does not read. I
  have not re-decided either — the programme owns them. Brief A (eleven
  unfinished transactions; ten free-tier with no money at all, one €1.00 on our
  own internal account) I would approve as proposed. Brief B (the
  "tamper-evident" claim on six website pages) is genuinely his: it is a claim a
  compliance buyer or a regulator would read, and it overstates what the chain
  provides for the 2026-05-04 → 2026-08-21 window.
- **DQ-17 added** (`decided`): today's re-listing, the free-tier advertisement
  fix, and the seven branch deletions. All reversible.

## Overnight health

Clean apart from the quarantine above. All dependency probes healthy, scheduler
ticking, one breaker open and it is the deliberately-deactivated
`us-court-search`. The **381-row-per-boot `test_suites` churn that #346 fixed is
still gone** — a third independent boot-day sample, maximum 2 suites bumped in
any minute over 24h.

Three invariant alerts recur every two hours and none is new:
`uk-gazette-notice-search` (vendor returns HTTP 500 to everyone — DQ-14 item 2,
his to report), `lithuanian-company-data` (a single upstream Spinta 500), and a
`lying_breaker` row on `danish-company-data` whose own remediation note says to
wait for two fixes to ship first. `canadian-company-data` opened
`regression_detected` twice overnight; it was already the third-worst capability
in the T4.3 exit measurement at 88.1% and is a genuine one.

**`page-exists` is being flagged for a human every promotion tick** — 100% over
420 tests, but it "was taken down, not merely never listed", and the job
correctly refuses to re-list on harness evidence alone. Its takedown reason was
`No executor registered for 'page-exists'` on 2026-08-15, which is an
infrastructure fault and not a capability fault. I did **not** re-list it today:
unlike `url-to-markdown` it has no external paid traffic at all, so there is no
customer-level evidence either way, and I would be re-listing on exactly the
harness signal the job is right to distrust. It needs a deliberate look, not a
flag-flip.

## What the next session should pick up

1. **The floor's asymmetry, which today's incident exposed and did not fix.**
   The quality floor *measures* paid traffic only — free-tier calls are excluded
   from its population as an anti-Sybil measure — but its *remedy* withdraws the
   free surface too. So a front-door capability can be delisted on fifteen paid
   calls while the traffic that actually matters for it is invisible to the
   decision. That is a structural defect in the remedy, not in the threshold,
   and it is the highest-value platform item I know of right now.
2. **Concentration, not revenue.** Four consecutive rising weeks and a 99.3% top
   share. Revenue is on a plausible path to M1 and a second payer is not. Worth a
   whole session on where a *new* payer comes from rather than more breadth for
   the existing one. This is the third check-in to say so.
3. **Attribute the x402 enumerator.** Still unstarted, still the prerequisite
   GOALS.md names before the catalog role may read `failed_requests` at all.
4. **`page-exists`** — decide it deliberately, per the note above.
5. **`eu-regulation-search`'s two cleared baselines** — carried from yesterday.
   Worth one query to confirm the recapture landed; I did not get to it and it is
   cheap.

## Protocol notes

- **No production writes.** Every production query this session was a `SELECT`;
  the three migration statements were `EXPLAIN`-planned only. The only production
  state change came from the deployed migration block, which is the sanctioned
  mechanism.
- **No `git checkout` in the main checkout.** All editing happened in the
  `strale-wt-checkin` worktree, which has its own real `node_modules`;
  `guard-tree-integrity.mjs` run after each branch move, clean both times.
- **No `git stash`, anywhere.**
- **DEC-20260504-A:** #358 carries 14 regression assertions, each verified failing
  against the un-fixed state in both directions, including three mutations of the
  migration block.
- **DEC-20260504-C:** deploy dependency identified (`runStartupMigrations`'
  `BLOCKS` registry, pinned by the canonical-list test at 43), deployed SHA
  confirmed via `/health`, and production queried for the block's actual effect —
  flags, ledger row and promotion event — rather than a log line.
- **DEC-20260504-B** does not apply: one row.
- One local gate fails for an environmental reason and not because of this
  change: the root `npm run typecheck` fails in `packages/langchain` on a missing
  `straleio` type declaration. My diff touches `apps/api` only, `apps/api`'s own
  `tsc --noEmit` is clean, and CI is green on both the PR and `main`.
