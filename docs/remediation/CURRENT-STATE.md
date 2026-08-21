# Remediation Program — Current State

_Last updated: 2026-08-21 (session 1)_

- **Current package:** WP6 — ACCEPTED, merged as `4302547` (PR #354), verified live.
- **Next package:** WP8
- **WP3:** ACCEPTED, merged as `ee7f737` (PR #350), verified live in production — table, all three indexes, and the CHECK constraint reached `validated=true`.
- **Latest accepted SHA:** `ee7f737` on `main`
- **Unresolved blockers:** none
- **Human approvals granted:** program-level autonomy (run continuously; escalate only per CHECK-IN A/B/C)
- **Awaiting founder:** nothing. One item is logged for *visibility only*, not decision — see "Codex disposition" below.

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
