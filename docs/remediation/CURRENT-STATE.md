# Remediation Program — Current State

_Last updated: 2026-08-25 (governance rebaseline)_

## Governance rebaseline, 2026-08-25

`PACKAGE-GRAPH.yaml` had drifted far enough to mislead: WP3–WP9 and WP11 still
read `PLANNED` long after acceptance, WP17 was absent entirely, WP12 was not
marked blocked, and WP7's exit list still asked for a unique index the package
file itself records as impossible. The graph is machine-readable, so a graph
that disagrees with its own package files is worse than none.

**Authority is now stated explicitly: the per-package YAML files are the
source of truth for status, and the graph is a view reconciled against them.**

### One finding worth more than the tidy-up

**WP8's acceptance was written and lost.** Its status read `REMEDIATED` — not a
value in this programme's own legend, used exactly once, unexplained. It was
not deliberate. Commit `f2e76f4` ("docs(WP8): accepted, with production
reconciliation", 2026-08-22) set it to `ACCEPTED` and recorded a real
reconciliation: constraint present and validated in production, census zero,
both incident capabilities correctly withdrawn, and the constraint proved to
**bite** — a half-quarantine write inside a rolled-back transaction was
refused, because existence is not enforcement.

**That commit never reached `main`.** It exists only on
`remediation/wp9-artifacts`, unmerged. So for three days the programme record
said a package was in an undefined state when it had in fact been accepted with
evidence.

The mechanism is worth naming, because it will recur: squash merges make a
merged branch look permanently "ahead", so a branch that still shows unmerged
commits reads as normal. Most of that branch's content *did* land via PR #360;
this one docs commit did not, and nothing distinguished it.

**Two documents on that branch are also still unmerged** and were deliberately
not swept into this PR, because they have not been reviewed here:
`docs/remediation/DECISION-BRIEFS.md` and
`docs/remediation/PUBLIC-COPY-CORRECTION.md`. They need a decision of their
own — merge, supersede, or discard.

### Also reconciled

- **WP7** — the impossible `prev_hash uniqueness` exit criterion is formally
  superseded in the graph, with the reason preserved rather than deleted. The
  package file was already correct; only the graph asked for it.
- **VERIFY-P3** — no longer an undifferentiated `PARTIAL`. Three of its four
  deferred portions are closed (settlement by WP5, process-kill by WP10's
  measured 1.0h restart interval, plus the original read-only work); only
  cadence remains, and that is WP10's dated gate rather than unstarted work.
- **WP9's `transaction_id` linkage** — classified as a **residual, not an
  acceptance blocker**, determined by reading the package's six exit
  conditions, none of which mention it.
- **Adjacent workstreams recorded** in the graph — the execution-receipt
  programme, the production-authorization incident, daily-run reform, trusted
  publishing / MCP trust / post-publish smoke test, and the three privacy PRs —
  because several of them narrowed packages above and a graph that omits them
  overstates the remaining work.

---


- **Current package:** WP10 — **MERGED, DEPLOYED, UNDER OBSERVATION**.
  Squash `ce5e63f` (PR #376), verified live on `ce5e63f09186`. Immediate
  reconciliation clean: `docs/remediation/packages/WP10-RECONCILIATION.md`.
  **Acceptance gate: the seven-day cadence measurement, due 2026-08-30.**
  Immediate readings show cadence advancing from the run (drift 0.000s on all
  ten completed jobs) and the weekly sweep scheduled a week out instead of 56x
  — but nothing yet shows cadence surviving a DEPLOY, because no restart has
  happened since the merge. Do not force one.
- **WP11:** ACCEPTED. Merged `0d253ef` (PR #371), deployed and verified on
  `0d253efdc380`. Record: `docs/remediation/packages/WP11-ACCEPTANCE.md`.
- **WP9:** merged and deployed, under its observation period. Untouched by
  WP10 and WP11 — no watch condition fired.
- **WP12:** still **BLOCKED on VERIFY-IP, which remains OPEN.** WP10 did not
  touch it and inferred no Railway proxy hop count. Reading the wrong
  X-Forwarded-For entry breaks every IP-keyed rate limit at once; confirm the
  hop count first.
- **Founder decisions, 2026-08-23:** the 22 pre-WP2 drifted internal wallets
  and the 1,600 cents of farmed trial credit are both left as historical
  state, verified present and deliberately not mutated.

## What WP10 found, and why the number is the argument

The audit said "most jobs boot-relative". That is true and it undersells it.
Every recurring job used `setTimeout(startupDelay)` then
`setInterval(period)`, and the median gap between production process starts
is **1.0 hour**. So for any job declared at 6h, 24h or 7d, the `setInterval`
arm is not merely unreliable — it is **unreachable**. The only arm that ever
fires is the startup delay, which means the declared period had been
silently replaced by the deploy interval everywhere.

Measured, not inferred: quality-floor ran **51** times in seven days against
a declared 24h period; the **weekly** health sweep ran **141 times in 17.6
days**, 56x its declared cadence, while probing external URLs and applying
auto-remediation. The mechanism is provable rather than merely plausible —
45 of 47 capability-promotion ticks land 4.8 minutes after a quality-floor
tick, exactly the gap between their 20- and 15-minute startup delays. Two
jobs on independent 24h timers cannot produce that correlation; two jobs
reading the same boot instant must.

**The generalisable lesson: a declared constant is not a measurement.**
`INTERVAL_MS = 24h` reads like a fact about the system and was a fact about
nothing. Nobody had checked it against the platform's own event history, and
the check took one query.

Second, from the same package: **a marker with no reader is not a feature.**
`lifecycle_state = 'hook_failed'` had been written for months, with three
comments promising the sweeper that would read it. A grep found the writer,
its test, and nothing else. The consequence was invisible by construction —
the hook is what generates test suites, so an affected capability had none
and was skipped by the scheduler forever, silently.

## What WP11 cost, and why it is worth writing down
## What WP11 cost, and why it is worth writing down

Eight review rounds, seven of them FAIL. The account-closure receipt was
found inaccurate in five consecutive rounds, each time somewhere the previous
round had not pointed. Correcting the literals could not converge, because
the claim and the behaviour were two artifacts kept in agreement by hand.

**The generalisable lesson: when a claim enumerates something, derive the
enumeration or delete the claim.** WP11 ended with the closure plan
performing the closure AND building the customer-facing summary; the JSONB
keys read from the account's own rows; the column lists derived from
`CUSTOMER_CONTENT_COLUMNS`; and the completeness guard querying
`information_schema` rather than parsing TypeScript. That guard then found
three identifier columns no reviewer had named, plus `suggest_log.ip_hash` —
3,011 rows carrying an IP hash since April with no retention rule at all.

Second lesson, from the same rounds: **a guard that cannot see the shape it
guards against reports success.** Three separate guards in this package were
green while doing nothing — one asserted SQL text under a behavioural name,
one was blind to a declaration style used elsewhere in the same file, one was
aimed at a different file than the defect. Each was found by a reviewer, not
by the suite.

Third: the receipt **refused erasure on a false ground** — it told data
subjects the content could not be cleared without breaking the hash chain,
while the retention job cleared exactly those columns on every row at 90
days. Closure now performs that redaction immediately. A claim nobody had
checked against the platform's own scheduled behaviour survived months.

## Prior state (WP0–WP9)

- **Current package:** WP6 — ACCEPTED, merged as `4302547` (PR #354), verified live.
- **Next package:** WP8
- **WP3:** ACCEPTED, merged as `ee7f737` (PR #350), verified live in production — table, all three indexes, and the CHECK constraint reached `validated=true`.
- **Latest accepted SHA:** `ee7f737` on `main`
- **Unresolved blockers:** none
- **Human approvals granted:** program-level autonomy (run continuously; escalate only per CHECK-IN A/B/C)
- **Awaiting founder:** nothing. One item is logged for *visibility only*, not decision — see "Codex disposition" below.

## The `danish-company-data` chronology — recorded so it cannot be re-litigated

Written out in full because a later reader could easily reconstruct the wrong
story from the code alone, and one review round already did.

| When | What |
|---|---|
| **2026-08-12** | Legitimately quarantined by the quality floor — the first action under DEC-20260812-A's escalation contract. 0% completion on 11 external calls over 90 days; cvrapi.dk's free tier was exhausted and failing even identifier lookups. Intended DB state recorded in `manifests/danish-company-data.yaml`: **`visible=false, x402_enabled=false`**. Recovery condition documented: quota top-up (Petter's action), then re-verify via a prod sweep. |
| **2026-08-21 00:08:18Z** | An **unexplained out-of-band write** set `x402_enabled` back to `true`, leaving `visible=false`. No job can produce this: the quality floor and the promotion job each write both flags together in one statement. No commit corresponds, no `health_monitor_events` row records it, and exactly one capability row changed in that minute. The platform has **no audit trail for capability flag changes**, which is why the writer is unidentifiable. |
| **2026-08-21 (WP8)** | WP8 shipped and **correctly** treated the capability as non-servable — it was withdrawn from the catalogue, and that is what `visible=false` means. |
| **2026-08-21 (PR #356)** | I inferred from the drifted row that `visible=false` should stop meaning "withdrawn", and opened a hotfix to redefine the servability authority around it. **Wrong on two counts**: the premise contradicted repository history, and the change coupled the global "fit to execute" authority to `x402Enabled`, a rail-specific flag — the exact coupling WP8 exists to remove. **Closed unmerged.** |
| **2026-08-21 21:06Z** | Production restored to the intended `visible=false, x402_enabled=false` by one conditional update. No other capability was in that shape. |
| **2026-08-21 (this package)** | A DB `CHECK` constraint now **prevents** the state, and a scheduled invariant check **detects** it if the constraint ever fails to apply. |

**The capability is still not healthy and the quarantine still stands**: 14 real
customer calls over 90 days, all 14 failed, zero successes. Promotion requires
the manifest's documented recovery condition, not a flag flip.

**The lesson worth keeping**: a production row is evidence of *state*, never of
*policy*. Policy lives in the manifest, the decision record and the code that
writes the state. I read a row and inferred a rule from it, which is the same
error class as reading two columns without checking what writes them.

## Where WP6 landed

Idempotency keys are bound to a fingerprint of the request they were issued
for. WP1's three pinned defects all inverted.

The sharpest was that a key reused across two capabilities returned the FIRST
one's output while the response echoed the slug the caller had just asked for.
Reusing `order-123` across two calls is far likelier than a UUID collision.

Two gaps beyond the pins, both money: **solutions had no replay guard at all**
(a retried EUR 2.50 call was charged twice — the capability rail has had this
since MVP, the bundle rail never did), and **A2A dropped the header**, so those
clients could not make a retry safe no matter what they sent.

The review's two blocking findings were both mine and both instructive:

1. A parameter threaded into `executeFreeTierAuthenticated` and never written.
   Its PRESENCE is what made the omission read as done — tsc cannot flag an
   unused parameter, and every integration case seeded a paid capability.
2. The solutions replay matched ANY prior row with that key, and all 421
   existing keyed rows are capability rows with a null fingerprint. A customer
   reusing an old key on a KYB bundle would have received a capability's payload
   labelled as a KYB Complete result — the wrong-answer class this package
   exists to close, introduced BY it.

**Post-deploy verification mattered here specifically.** Block 0098 has no
behavioural test — CI materialises the schema before migrations run, so its
statements are no-ops there. Confirmed against production: fingerprint column
present, global unique index dropped, per-user index in force.

## Where WP7 landed — the biggest finding of the program

**The audit chain had not been a chain since 2026-05-04.** One parent held
150,719 children. Found by querying production, not by reading the audit.

`getPreviousHash` ordered by `completed_at DESC`, and Postgres sorts NULLs
FIRST under DESC, so a `health_probe` row with a null `completed_at` held the
head permanently. A star has no sequence, so the chain evidenced nothing about
ordering or deletion — the whole tamper-evidence property.

**And the generator was still running.** `/health/deep` used a data-modifying
CTE whose DELETE ran against a snapshot predating its own INSERT, so it never
deleted anything: one leaked row per call on a public endpoint, 200 in August.
One of the May rows is the 150,719-child parent. Now zero in 20 minutes of
production traffic.

**My first fix did not fix it.** I made the sort keys agree and left the
admission key different. The reviewer replayed the rule over 30 days of real
rows: nine new forks. `completed_at` is stamped from a clock read BEFORE the
row's own `created_at` default (median −1.5 ms), so it cannot define a head at
all. The head is now `chain_seq`, assigned at hash time — the last row the
worker actually hashed.

The general lesson, and it is not specific to hashing: **a head derived from a
wall-clock column is not a head.** Wall clocks are not monotone with the order
work actually happens in.

History is deliberately not rewritten. Recomputing 863,946 hashes would erase
the evidence the break happened. Single-parent is now CHECKED daily by a
scheduled job — a unique index would abort boot on the existing forks.

Verified live: column and sequence present, exactly one seeded head (a
completed row, continuing the chain rather than starting a second root).

## Where WP5 landed

Durable settlement intent, written before the facilitator is called. An x402
settlement is irreversible, and the orphan capture was a catch block in the
same process — it handled "the INSERT threw" and could not handle "the process
died", when it never runs either.

Two gaps found by checking rather than assuming: **nothing ever read**
`x402_orphan_settlements`, and no unique index constrained how many rows one
settlement could produce.

**The review found the sharpest defect of the program.** The escalate branch
deliberately left unresolvable rows untouched — but the sweep is
`ORDER BY updated_at ASC LIMIT 25`, so untouched rows stay permanently the
oldest, and 25 of them would own the batch forever. The recovery job would have
silently stopped recovering, with a tick log indistinguishable from health,
while per-row paging muted the only channel that could report it. The general
lesson: **a queue that skips rows without mutating them is not a queue.**

Proved fixed by measurement — 30 stuck rows plus one real crash: tick 1
escalated 25, tick 2 recovered the real one, tick 3 drained.

Verified live: table, all four indexes (including the new one on
`transactions.x402_settlement_id`, checked against prod for duplicates first —
0 across 5,675 rows), zero unreconciled orphans.

## Where WP4 landed

One authority for billability: `lib/execution-outcome.ts`. Payment consumes
`billable`. A rail still decides HOW to collect; it no longer decides WHETHER.

The defect was real and sharper than the audit stated. `gated` appeared twelve
times in the wallet solution route and zero times in the x402 one, so a gated
run refunded one customer in full and charged the other in full. `result.gated`
was available on the x402 rail the whole time.

**The review's blocking finding was about my own claim, not just my code.** I
rewired four of five rails and recorded "no route decides billability
independently" as MET. That was false — the x402 capability rail still settled
on any resolution — and the half-fix *created* a new asymmetry between
`/v1/do` + X-PAYMENT and `/x402/:slug`. The guard was green throughout because
its import check was file-scoped: one handler importing the module satisfied it
while another settled 250 lines away. The lesson generalises past this package:
a guard that checks a FILE cannot protect a decision made in a FUNCTION.

Also closed: `counts_against_capability` had no consumer, so the advertised
"refusals don't count against a capability" fix was documentation only against
an armed quality floor; `UnbillableOutputError` discarded upstream error text
and so misfiled 5xx failures as Strale's bug; a gated x402 solution wrote no
transaction row and no replay-dedup entry, leaving the authorization replayable
at our cost.

Three review findings were guard bugs rather than code bugs and were fixed as
such — worth remembering that an adversarial reviewer's findings also need
adjudicating rather than blanket acceptance.

## WP3 in production — verified, with one honest gap

Checked against prod 90 minutes after `ee7f737` deployed:

- Schema effect confirmed by query, not by log: the table, all three indexes,
  and `wallets_balance_cents_non_negative` at `convalidated = true`, so the
  `NOT VALID` → `VALIDATE` two-step completed.
- No negative wallets. No past-deadline open reservations.
- Traffic profile unchanged: 375 completed / 338 failed in the 90 minutes
  after deploy, and **exactly** 375 / 338 in the same window yesterday. The
  harness sweep is deterministic, so identical counts across two disjoint
  windows is the expected shape and good evidence of no regression.

**The gap:** `wallet_reservations` holds zero rows, because only 2 non-harness
transactions have run since deploy. The migration is verified in production;
the reservation *write path* is not — it has been exercised only by the
integration suite. The first real paid call is what proves it, and nothing
about the deploy tells us when that arrives. Worth a deliberate look at the
table after the next customer call rather than assuming silence means health.

## Review lane — founder decision, 2026-08-21

Codex exhausted its credits mid-WP3 (available again 27 Aug). Decision: **do
not buy more now.** Adversarial review continues via independent Claude agents
given the same brief, with a **single Codex pass reserved for the end** of the
program.

Rationale for recording it: the substitute is not a downgrade in kind. On WP3
the agent returned FAIL_REMEDIATION_REQUIRED with three blocking findings, one
of which — a migration that reintroduced a TOCTOU defect the same file had
fixed two commits earlier, and could ship without its unique index — was at
least as sharp as anything Codex produced. What a single reviewer cannot give
is *independence across packages*: the same model reviewing its own family of
work has a correlated blind spot, which is what the final Codex pass exists to
catch.

Practical note for whoever runs that pass: brief it on the FULL branch diff,
not per-package, and give it the residuals list from each package manifest so
it can check that deferred items actually landed where they were promised.

## Where WP3 landed

Durable reservations. Every debit now writes, in the same transaction, the fact
that the money movement is provisional; that record outlives the process, so a
reconciler finds what a crash abandoned. The state machine is
`reserved → executing → captured | released`, every transition a conditional
UPDATE, which is what makes duplicate capture and duplicate release no-ops
rather than second money movements.

**The WP1 crash tests are inverted** — they pinned the bug (no refund ever,
transaction stranded) and now pin the recovery. Verified discriminating.

Solutions had the identical window on the most expensive SKUs, plus a comment
in the route falsely claiming this reconciler already covered it. Wired and
proved end to end.

The independent agent returned FAIL_REMEDIATION_REQUIRED (3 blocking, 9
non-blocking); all closed. Sharpest: a migration that reintroduced the
check-then-bare-DDL defect the same file had fixed two commits earlier, and an
ABBA deadlock that could have recorded a SUCCEEDED call as failed and discarded
its output.

**Still open, founder decision:** the 11 historical stranded rows predate the
table and carry no reservation, so `findAbandoned` can never reach them.
Reconciling them writes real customer wallets — CHECK-IN B.

## Where WP2 landed

One authority for wallet mutations: `lib/wallet-service.ts`. Every balance
change now writes a matching ledger row in the same transaction, and every
change is a delta — there is no exported way to set an absolute balance.

Two real defects fixed by the migration: the solutions refund (absolute,
unlocked, outside any transaction — it clobbered concurrent top-ups) and the
closure burn (no ledger entry at all). Affordability is now enforced by the
database via a conditional UPDATE, not by the caller's snapshot.

The bypass guard covers **code, scripts, and docs** — each surface added
because a real bypass was found on it, including a runbook that told an
operator to run bare `UPDATE wallets`.

**Codex returned PASS_WITH_NON_BLOCKING_FINDINGS — the first clean verdict of
the program**, after three FAIL rounds. It also caught a hollow guard (a regex
containing a literal backspace, so it matched nothing) and a commit whose
message described two fixes that were not in the tree.

## Where WP1 landed

The proof floor exists. 10 files / 59 tests run against a real Postgres in CI;
15 of them had never executed before because no workflow set `DATABASE_URL_TEST`.

- First-ever coverage of the Stripe money-in path, with real HMAC signatures.
- Hard-SIGKILL crash test proving N1: the debit survives, no refund is written,
  the transaction is stranded. WP3 must invert the last two.
- DEC-8 wallet locking proven by racing 6 calls at a wallet funded for 1
  (verified: removing the lock makes all 6 succeed).
- Three idempotency defects pinned as WP6's acceptance signal.
- Audit chain tested as the re-audit REFRAMED it, not as the audit stated it.
- **Live production bug found and fixed:** every "your agent ran out of
  credits" conversion email was failing silently on a bad column reference.
- A DB-gated suite that ran in neither CI job was rescued; a guard now makes
  that impossible.

Safety, because these tests write: loopback host + test-named database +
a pre-write content check that refuses anything holding real data (verified
against production). Runs BEFORE the schema push — Codex caught that the
check was originally positioned after it.

## Where WP0 landed

Closed, each with a test verified failing against pre-fix code:
- `/v1/demand-signals` verbatim customer text (3,426 prod rows) → admin-gated; aggregate `/categories` stays public
- public example-output serving customer-derived rows (508 piggyback rows) → curated fixture types only, plus suite/result slug equality, retired-suite exclusion, and a fail-closed gate on the Art. 22 screening classes
- quality-floor delisting bypass via `/v1/do` X-Payment (30 prod capabilities) → single shared predicate `lib/x402-eligibility.ts`
- `/webhooks` unbounded pre-auth body → 512 KB cap; and body-limit rejections now return 413 instead of a mislabelled 500 (this bug also affected the pre-existing `/v1`, `/a2a`, `/mcp` caps)
- `/health/deep` public DB-write amplifier → IP rate limited
- x402 verify-flood path → IP rate limited (catalog excluded to preserve its documented 120/min)
- `ADMIN_SECRET` strength floor + `admin.ts` private auth copy deleted

## Codex disposition (visibility, not a decision)

Codex never returned PASS across three rounds. Every finding was fixed or
carried as an explicit residual. Its one open blocker is a **scope** dispute:
it wants public examples gated by a positive publication-approval artifact
(schema + authoring workflow) rather than inferred from test type. Fable
adjudicated `VALID_NON_BLOCKING` for a containment package declaring
`migration_required: false`, and promoted it to a **mandatory WP14 exit
condition**. The automatic, unauthenticated publication path is closed; the
residual path requires admin credentials.

## Residuals handed to later packages

| Item | Owner |
|---|---|
| Publication-approval artifact for public examples | WP14 (mandatory exit) |
| ~~Crash-orphan reconciler~~ — CLOSED in WP3 | — |
| 11 stranded `executing` transactions (pre-date the reservations table; reconciler cannot reach them) | CHECK-IN B — writes prod wallets |
| `wallet_reservations` retention rule (omission, not yet a decision) | WP14 |
| Two concurrent reconciler instances untested; advisory lock asserted by inspection | WP15 |
| Wallet rail still serves quarantined capabilities; solution steps ungated | WP8 |
| x402 in-flight delisting race at settlement | WP8 |
| ~~SQL-text assertions want row-level tests~~ — CLOSED in WP1 | — |
| Lane disposability is heuristic; create-and-drop own database instead | WP15 |
| Frozen 200-query retrieval benchmark (master plan listed it under WP1) | WP16.1 |
| Rate limiter fails open on unknown IP; counters process-local | WP12 (+ VERIFY-IP) |
| Raw-socket DNS rebinding; CIDR-vs-prefix IPv6 gaps | WP12 |
| Key-recovery emails a reusable key; unauthenticated rotation DoS | WP11 |
| Customer-facing legal wording corrections | WP14 (CHECK-IN B batch) |

## Verification gates

- **VERIFY-P3:** PARTIAL — prod read-only done for x402 index, stale executing rows, delisting, free-x402, publication surfaces. Process-kill/cadence/settlement deferred to WP1–WP5.
- **VERIFY-IP / VERIFY-LEGAL:** OPEN. **VERIFY-DEP:** PARTIAL (1 critical / 14 high / 7 moderate / 2 low counted; reachability triage unrun).

## Operational notes for the next session

- Run vitest from `apps/api`, not the repo root — the root config lacks the API setup files and produces misleading failures.
- App-level tests are cold-start sensitive; import `app.ts` in `beforeAll` with a generous hook timeout rather than inside the first test.
- `ssrf-bucket-a/b.test.ts` fail as network-probe hook timeouts on the baseline too — not a regression.
- `codex exec - < brief.md` works; `codex exec review --base` produces no output non-interactively, and long repo-exploring briefs exhaust budget before a verdict. Inline the diff.
- Untracked `apps/api/scripts/_tmp_*.ts` from earlier sessions break `tsc --noEmit`; filter them or clean them up.
