# 2026-08-23 — morning check-in

Intent: run the DAILY-RUN.md morning session — commercial pack, overnight health,
stale-work sweep, branch graveyard, decision queue — then spend the session on the
highest-leverage work available against M1, and hand back the two artifacts the
charter requires.

Two things set the agenda. A critical alert fired overnight saying x402 settlement
volume had halved; and while probing capabilities named in this morning's invariant
alerts I found that an unauthenticated agent asking for a paid capability the
documented way had been getting HTTP 500 since March.

## Headline numbers

Every figure through `lib/metrics`. The commercial pack (`scripts/commercial-brief.ts`)
and the dashboard (`scripts/ceo-dashboard.ts`) were both run; nothing below is a
hand-rolled query against `transactions`.

| | |
|---|---|
| Current ISO week (08-17, final day) | **€59.42 / 929 calls** |
| Last completed week | 08-10 **€39.24 / 620** — `growth()` reads **rising**, two consecutive completed rises |
| Discrete series | 07-13 €27.42 · 07-20 €37.98 · 07-27 €10.85 · 08-03 €27.38 · 08-10 €39.24 · 08-17 €59.42 (closing) |
| Identified payers, this week | **4, top share 99.3%** (€59.02 vs €0.40) |
| Identity coverage | **100%** this week (92.9% over the dashboard's 7d window) |
| New vs returning | `unavailable` — the lookback still reaches back past 2026-08-15 |
| Deployed SHA | `e8c36cb` = `main` tip, verified after both merges |
| External spend | ~€4.08 of €50 |
| Remote branches | **24 → 7**, verified against `git ls-remote` after the deletions |
| Open PRs at end | **0** |

**Distance to M1: ~4×.** Unchanged in shape from yesterday. The concentration bar is
still the binding one and nothing moved it.

## 1. The overnight alert: settlement volume halved, and it is not ours

`health_monitor_events` carried one `alert_sent` row, severity critical, at
**2026-08-22T20:47:35Z**: *"x402 settlement volume dropped: 65 in 24h vs ~149/day
baseline"*. `jobs/x402-settlement-watch.ts` counts `transactions` with
`x402_settlement_id IS NOT NULL` against the trailing 7-day daily average and pages
below 50%. The instrument is honest — it counts settled money, and our harness has no
settlement ids, so it cannot be contaminated by internal traffic.

Reproduced independently through `lib/metrics` on the canonical external population:

```
08-17  186 calls  €16.29     08-21  145 calls  €9.32
08-18  190 calls  €10.97     08-22   69 calls  €4.74   <- the drop
08-19  195 calls   €8.72     08-23    3 calls  €0.09   (to 06:00Z)
08-20  141 calls   €9.29
```

**Established that it is buyer-side, four separate ways rather than by assumption:**

1. **Settlement machinery healthy.** 192 of 195 intents are in the terminal
   `recorded` state (settling → settled → recorded). The only 3 `failed` rows are
   from 08-21 12:54, three minutes apart, *before* the fall.
2. **The 402 path is unchanged.** `x402_not_on_rail` refusals from third-party
   monitors and explorers are flat across the boundary: **1,535 in the last 48h
   against 1,525 in the 48h before**. If the challenge had broken, this is the number
   that would move.
3. **Nothing is erroring.** Two failed external transactions on 08-22, zero on 08-23.
   `failed_requests` shows no new failure type.
4. **Live check.** `GET /x402/email-validate` returns a valid 402 challenge with a
   payable price.

**The buyer has not churned.** Same payer hash `e9e672ef…` throughout, including
three calls overnight. Their whole basket fell together rather than one capability
breaking: `email-validate` 151 → 116 → 91 → 29 → 29 → 3 across five days,
`keyword-suggest` 37 → 0, `startup-domain-check` 24 → 0, `google-search` 35 → 9 → 0.
A platform-side gate would not produce that shape; a client turning down its own job
would.

**What is NOT established, and is written here so it does not get promoted by
retelling:** whether this is durable. It is one full day plus an overnight. The
matched 00:00–06:15Z window carries 3 calls today and *also* carried 3 on 08-21 —
overnight variance at this volume swamps a one-day signal. The alert's cooldown is
24h, so it can page again after 20:47Z today; that is the signal to watch, and the
evening check-in should read the full 08-23 day rather than this morning's slice.

## 2. The main piece: an agent asking the documented way got HTTP 500 (#372, merged, deployed, verified)

`/v1/do` accepts either a `capability_slug` or a free-text `task`. The
unauthenticated auth gate at section 3 of the route is entered only in the first
case — `if (!user && capabilitySlug)`.

A caller who sent a `task` matched normally, passed the x402-paid branch (no payment
header), passed the free-tier and progressive-unlock branches (the capability is
neither), and fell into `executeSync` with `user` undefined. The wallet read threw
and `app.ts`'s top-level handler answered `internal_error`, HTTP 500.

Measured on production **before** touching anything:

```
POST /v1/do  task=search the web for news         -> HTTP 500 internal_error
POST /v1/do  task=take a screenshot of this page  -> HTTP 500 internal_error
POST /v1/do  capability_slug=google-search        -> HTTP 402 + valid challenge
POST /v1/do  task=validate this email  (free)     -> HTTP 200
POST /v1/do  with a bogus Bearer token            -> HTTP 401
```

So the rail answered correctly for anyone who already knew our slugs and returned an
error to everyone else. `task` is what the MCP server, the SDKs and the docs all tell
an agent to send.

**Age: 2026-03-08.** `git log -S` puts the gate's condition at `1e8ebe6`, "Fix
unauthenticated non-free capability requests to return 401 with helpful message" —
the hole arrived with the gate. **Not** a regression from WP11 or from anything
merged this week; WP11's only `do.ts` change is a comment block plus the async
completion path.

**The fix.** One `anonymousPaidRefusal`, called from both sites: it quotes the x402
price where the rail can take the capability, and otherwise returns the 401 naming
the free capabilities and the programmatic signup route. This is deliberately the
same rule `lib/free-tier.ts` established yesterday — *the answer a caller is given
must be produced by the code that decides, not by a second site that agrees today.*

**Verification, both directions.** Two route-level tests in `do.core.test.ts` (the
harness that mounts `doRoute` on a bare Hono app with `app.onError` reproducing the
real 500). Deleting the new call site produces `expected 500 to be 402` and
`expected 500 to be 401` — the production symptom, reproduced in the harness. They
also assert the executor is never invoked, no wallet transaction is opened, and the
402 quotes the capability that actually matched at its own price. Full unit suite
2,644 passed / 206 files; `tsc --noEmit` clean.

**Post-deploy, by effect rather than by log line** (`/health` = `e8c36cb` = main):

```
task=take a screenshot of this page  -> 402  "Screenshot URL costs $0.054 USDC per call."
task=search the web for news         -> 401  free list + signup route
capability_slug=google-search        -> 402  (unchanged — the refactor did not move it)
free-tier email-validate             -> 200  (unchanged)
bogus Bearer token                   -> 401  (unchanged)
```

**One thing to be honest about.** This bears on E1 and on "176 agents/week reach MCP;
~0 converted", but it does not by itself explain zero conversion: arrivals are
dominated by monitors and indexers, and nothing measures how many arrivals took the
task-shaped route. It is *a* wall that was there, not *the* wall. The follow-up is to
attribute anonymous `/v1/do` arrivals by request shape, which nothing does today.

**A second, smaller observation, recorded not fixed.** The search task now returns 401
rather than 402, while `capability_slug: google-search` returns 402 — so task-routing
landed on a capability that is not on the x402 rail when a payable one exists. Worth
a look; it is a routing-preference question, not a defect.

## 3. F1 root-cause investigation — steps 1 and 2 closed, 4–7 owed

LESSONS.md F1 ("false quality attribution") is the largest family, at six occasions
and seven mechanisms, and its step 2 — *measure the full affected population, not the
reported instances* — was unstarted. It is now done and repeatable:
`apps/api/scripts/f1-failure-attribution.ts`, read-only, no arguments.

Every distinct error string a failed transaction has carried in the 90-day window,
through `classifyTransactionFailure`: **541 strings, 280,945 calls.** 154 strings and
**47,582 calls land in `internal`** — "everything else, OUR bug until proven
otherwise", and the only class the quality floor counts against a capability.

Conservative rules, each claiming a string only on positive evidence it is *not*
about our code; anything unclaimed stays in "possibly ours":

| share of `internal` | what it actually is |
|---|---|
| 29.2% (13,879 calls, 3 strings) | `fetch failed` — a bare transport error, 26 capabilities, still arriving today |
| 23.1% (10,982) | caller input: a required field absent or malformed |
| 15.4% (7,319) | a named third-party service returning an error |
| 9.3% (4,421) | caller input: an identifier or country we do not cover |
| 5.1% (2,438) | **our own guards refusing correctly** — the paid-API budget guard (whose message reads "Customer traffic is unaffected"), the redirect limiter, the reserved-IP-range refusal, documented coverage limits |
| 18.0% (8,543) | unclaimed by any rule |

**82.0% is a lower bound on misattribution**, not an estimate.

**Second source, different population.** External paid traffic only — the only
traffic the floor acts on. 446 failed calls, 92 `internal`; the same conservative
rules claim 25%, and most of the remainder is a vendor API quoting the *caller's* bad
URL back at us ("Unable to download the file. Please verify the URL"), unclaimed only
because the string names the vendor's error type rather than ours.

**Step 3, first falsification attempt survived.** The obvious economic falsifier was
that `CALLER_ATTRIBUTABLE` is read by `execution-outcome.ts` as well as by the floor,
so widening it might change what customers are charged. It does not — both branches
of `classifyExecutionOutcome` already set `billable: false`. The repair is not
blocked by billing.

**Step 4 deliberately not shipped today, and the reason matters.** `fetch failed`
alone is 29% of the bucket and one regex would remove it. That is the seventh local
widening, which LESSONS.md's three-strike rule forbids: six of them is how this
family got here. The shared repair is to make `internal` reachable only by positive
match, with an `unclassified` fallback that leaves the correctness denominator *and*
surfaces as an evidence shortfall, so the floor reports "I could not attribute this"
rather than "the capability is broken". That touches `execution-outcome.ts` (WP4's
authority, which writes `counts_against_capability` into the durable fact table) and
`jobs/quality-floor.ts` — **both of which the remediation programme is modifying
right now on `remediation/wp9-artifacts`** — so it is the next session's work,
scoped, not slipped in beside a customer-facing fix.

### Today's invariant alerts, triaged against the same question

Four capabilities emitted `algorithmic_correctness_floor` violations overnight. Every
one is an instance of the family above, not a defect:

| capability | failing assertion | verdict |
|---|---|---|
| `cz-unreliable-vat-payer` (14×) | `Execution error: fetch failed` | environmental — the single biggest misattributed string on the platform |
| `paid-api-preflight` (11×) | `is_reachable: expected 'true', got 'false'` against httpbin | the target site, not us |
| `page-speed-test` (7×) | `performance_score: expected > 50, got 47` for google.com | a brittle threshold on a live continuous measurement |
| `barcode-lookup` (4×) | `brand: expected type 'string', got 'undefined'` | a fixture contract declaring an optional upstream field guaranteed |

The last two are fixture-contract faults rather than taxonomy faults and are
individually cheap to fix; I did not, because I had already shipped one
customer-facing change and a third rushed edit is how a good day goes wrong. Named
here so the next session can take them.

`regression_detected` also fired for `canadian-company-data` (12×, genuine — it was
the third-worst capability in the T4.3 exit measurement at 88.1%), `ticker-lookup`,
`lithuanian-company-data` and `spanish-company-data` (single upstream blips).
`quality_floor` ticked 8 times with **`decisions: 0, quarantined: []`** every time —
the floor took no action overnight. `page-exists` is still flagged for a human every
promotion tick, unchanged and correctly refusing to self-relist on harness evidence.

## 4. Stale-work sweep (B2) and PR disposition

**PR #371 (WP11 — account, trial, Stripe, key rotation, erasure) was open and
unowned.** Its own session's last commit reads *"PR #371 open, review passed, two
founder decisions"* and its handoff says *"merge is deliberately left to a separate
decision"* — but merging is execution, not a decision, and its own handoff confirms
neither founder item blocks it. Eight adversarial review rounds, `check` and
`integration-db` both green, `CLEAN` mergeable.

**Pre-merge checks I ran rather than trusting** (it ships two boot-time migration
blocks, and a boot-crash on a day the revenue rail is already weak is the worst
possible compounding):

- Block 0102 creates `wallet_transactions_stripe_session_id_unique` with
  `IF NOT EXISTS`, which matches on **name only**. Read the production definition:
  byte-identical, partial, same column — a genuine no-op, not a silent mismatch.
- Plan-checked the entitlement backfill against production read-only: **59 rows, 59
  distinct email hashes**, zero `ON CONFLICT` collisions, matching the PR's claim.
  `wallet_transactions` is 1,364 rows, so DEC-20260504-B does not apply.
- Block 0103 adds a `BEFORE UPDATE` trigger on `transactions` (919,814 rows). At
  hundreds of calls/day the per-row plpgsql cost is negligible.

Merged as `0d253ef`. **Verified after deploy by effect, not by log line:**

```
table:trial_grants                            present
table:api_key_recovery_tokens                 present
rows:trial_grants                             59        (= the plan-checked count)
idx:trial_grants_email_hash_unique            present, genuinely UNIQUE
idx:api_key_recovery_tokens_token_hash_unique present, genuinely UNIQUE
trigger:transactions_redacted_content_..._trg present
ledger:0102_account_lifecycle_tables          rows_affected = 59
```

Also checked the *deployed* trigger function body out of `pg_proc` rather than
trusting the name — it matches the source exactly. **What I could not do:** the PR's
post-deploy plan asks for a "does the guard bite" test (a duplicate `email_hash`
insert, an UPDATE restoring `output` on a redacted row, both in a rolled-back
transaction). Those are writes. `DATABASE_URL` is read-only and read-only means
read-only, so the guards are verified by *definition* and not by *behaviour*, and
that gap is owed to whoever holds a write credential.

Smoke-checked the paths WP11 rewrote: `/v1/auth/register` and `/v1/auth/recover` both
return 400 to a malformed body (not 500), and an anonymous free-tier call still
returns real output.

**Dirty branches.** `remediation/wp9-artifacts` is the primary checkout's branch and
carries genuine unique work — `docs/remediation/PUBLIC-COPY-CORRECTION.md` and
`DECISION-BRIEFS.md` are **absent from main**, which is why DQ-18's correction says
that path does not resolve for a reader. It is fully pushed (local == origin), so
nothing is at risk of loss. Owner: the remediation programme. Deadline: its own
ledger. I did not touch it and did not `git checkout` in the main tree.

The hygiene check's *"17 commits ahead of `origin/remediation/wp9`"* is a **false
alarm** worth recording: the branch's upstream points at a *different* branch. Local
and `origin/remediation/wp9-artifacts` are identical (0/0).

**One uncommitted handoff left in place, deliberately.**
`2026-08-22-starve-set-1-stranded-settlements.md` exists only on disk in the primary
checkout. It is the **superseded** original whose own correction — already on main as
`2026-08-22-starve-set-1-investigation.md` — states "the superseded file is not
preserved — it was never committed — and this replaces it". Committing it would
contradict its successor; deleting a file inside a concurrently-active session's
working tree is a hazard this repo has been bitten by. It stays, and it belongs to
the remediation programme.

## 5. Branch graveyard (B3): 24 → 7, and F7 recurred

**Six of the seven branches yesterday's handoff recorded as deleted were still on the
remote this morning.** Confirmed by `gh api repos/strale-io/strale/branches` *and*
independently by `git ls-remote`. Only `feat/phase-3-extraction-lv` had actually
gone. Yesterday's handoff had written the lesson down in its own text — "a deletion
written down is not a deletion executed" — and the next instance happened anyway.
Logged as LESSONS.md F7, incident 5, with that observation, because it is the
sharpest evidence the family has produced that writing the rule is not the repair.

Re-adjudicated every one myself rather than trusting the record, by comparing the
**contents** of each file the branch changed against main — never commit counts:

| branch | sha | finding |
|---|---|---|
| `fix/fixture-staleness-not-a-capability-fault` | `5631087f4c48d259135c37f783448ede8b677c9d` | 0 branch-only lines in all 4 files |
| `docs/land-stranded-research-2026-08-19` | `bd2a1ec7af717bf703a2a5fcdbb65937db71028e` | both research docs byte-identical on main |
| `docs/checkin-2026-08-19` | `44cb6afd44932c62cf4ca1427565819b09374c17` | 18 branch-only GOALS.md lines, all superseded snapshots |
| `fix/eligibility-reconcile-not-a-content-edit` | `c7ea3b8e3ec6311913eec8a2bd312ff1ed686a10` | 1 branch-only line: an outdated "37 blocks" assertion |
| `docs/checkin-2026-08-21` | `904a2c85dc0bc875f24b42c7adef391b2e917468` | 15 branch-only GOALS.md lines, superseded weekly snapshot |
| `docs/checkin-2026-08-21-addendum` | `ac2a5ac260fd5bba38ad905e6483cfe72ee91728` | handoff identical on main |

Then eleven more whose PRs are merged, every sha recorded: `wp9-landing` `bb57b0d`,
`remediation/wp9` `e05c55a`, `fix/mcp-public-trust` `d5cca73`,
`release/strale-mcp-0.2.7` `2090c91` (tag `strale-mcp@0.2.7` preserves it),
`ops/daily-run-and-ceo-brief` `b3b722b`, `docs/post-release-smoke-check` `7a581b9`,
`docs/daily-run-reform-accepted` `dbf6bb9`, `security/npm-trusted-publishing`
`cd25c39`, `remediation/wp11-account-lifecycle` `9697ed6`,
`docs/remediation-ledger-authz-accepted` `4147ed7`,
`security/production-authorization-boundary` `1e14359`.

And `fix/t02-quality-floor-reinstatement-audit` `02d3a4f`, which was 7 days old with
no PR and two files absent from main. **Split disposition:** the Phase-0 audit
narrative is landed to `archive/sessions/` with an unedited preamble — it has durable
value and both of its "could not verify" items have since resolved. Its companion
`--apply` reinstatement script is **not** landed: reinstatement now happens through
ledger-guarded startup-migration blocks, and a direct-postgres production-mutation
script with an `--apply` flag is precisely the shape behind family F10.

**Verified afterwards against `git ls-remote`, not the local cache: 24 → 7.**
Staying: `main`, `remediation/program`, `remediation/wp9-artifacts` (active),
`feat/phase-7a-it-stakeholders` and its two `rescue/wip-2026-07-16-*` snapshots (live
work behind DQ-1's privacy item; DQ-15 established they hold differing variants).

**Worktrees 8 → 2.** Removed five whose branches were merged and deleted, all clean.
Every one checked for junction/reparse points before removal — CLAUDE.md's
`node_modules` junction hazard — and none had any; `guard-tree-integrity.mjs` clean
afterwards, main checkout's `node_modules` intact at 495 entries. Also removed the
leftover `strale-wp11-pg` Docker container the WP11 session left running, and pruned
17 stale local branches.

## 6. Decision queue (C)

No `preauthorized_notice` item had a matured window; nothing executed automatically.

- **DQ-14** (`your_call`, 4 items) unchanged. **Item 3 routed around:** with the
  frontend repo checked out locally I ran both cross-repo checks by hand.
  `check-shape-contracts.mjs` is clean (AuditRecord, 25 fields to 25) and
  `check-platform-facts-drift.ts` scanned 162 surface files for 5 findings, **none of
  which is an inaccurate public claim** — three are "ComplyAdvantage" on a page that
  exists to compare us to competitors, and two are a hardcoded "280+ capabilities"
  against a true `active_visible` of 297, so the literal understates. So the missing
  token buys automation, not a fix. Recorded in LESSONS.md F6, with the note that a
  guard running 3-in-5 false positives on a weekly issue-opening cron is on the path
  to being ignored — diagnosed, not fixed.
- **DQ-18** remains `answered`. Nothing about it was re-opened, re-decided, or moved
  into my column.
- **Added DQ-21** (the 500 fix), **DQ-22** (the branch and worktree sweep), **DQ-23**
  (the WP11 merge, with its two founder items named and untouched).

## 7. What the next session should pick up

1. **Read the full 08-23 day against the 08-22 halving.** One day is not a trend and
   two is barely one, but this is the single most important number on the platform.
   The alert can page again after 20:47Z today.
2. **F1 step 4 — the shared repair**, now that the population is measured and the
   design is settled: `internal` reachable only by positive match, `unclassified`
   leaving the denominator and surfacing as an evidence shortfall. Coordinate with the
   remediation programme, which is holding `jobs/quality-floor.ts`.
3. **The floor's asymmetry**, carried unchanged from yesterday: it measures paid
   traffic only but its remedy withdraws the free surface too. Still the highest-value
   platform item after F1 itself.
4. **Attribute anonymous `/v1/do` arrivals by request shape** — the honest follow-up
   to today's 500, and the only way to size what it cost.
5. **`barcode-lookup` and `page-speed-test` fixture contracts** — cheap, and they are
   two of this morning's four false alerts.
6. **Concentration.** Fourth consecutive check-in saying it. Today it stopped being a
   forecast.

## Protocol notes

- **No production writes.** Every production query this session was a `SELECT`; the
  WP11 migration statements were plan-checked read-only before merge and the only
  state change came from the deployed migration path, which is the sanctioned
  mechanism. The one verification I could not perform — does the new guard *bite* — is
  named above rather than worked around.
- **No `git checkout` in the main checkout.** All editing happened in the
  `strale-wt-checkin` worktree, which has its own real `node_modules`.
- **No `git stash`, anywhere.**
- **DEC-20260504-A:** #372 carries two route-level regression tests, both verified
  failing against the un-fixed state, reproducing the production symptom exactly.
- **DEC-20260504-C:** both merges verified in production by querying the artifact —
  `/health` SHA, the served HTTP responses, and for WP11 the tables, indexes, trigger
  body out of `pg_proc` and the ledger row.
- **DEC-20260504-B** does not apply: 59 rows.
- **A measurement I nearly published wrong.** The first version of the F1 script lost
  its word-boundary escapes to a heredoc, which silently disabled two of five rules
  and moved the headline from 82% to 58%. Caught because the earlier ad-hoc run had
  produced 82% and the two disagreed. Recorded because "the script and the ad-hoc
  query disagree" is the only reason it was caught, and only one of them was going to
  be in the artifact.
- **A finding I did not report.** `mcp-trust-contract.test.ts` failed locally with
  `expected undefined to be 'strale-mcp/0.2.8'`, which reads exactly like a hollow
  guard (family F5). It was a stale local build of `packages/mcp-server`; after
  `npm --workspace=packages/mcp-server run build` it is 6/6. Checked before writing it
  down.
