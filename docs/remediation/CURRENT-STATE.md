# Remediation Program — Current State

_Last updated: 2026-08-21 (session 1)_

- **Current package:** WP4 — in independent adversarial review on `remediation/wp4`.
- **Next package:** WP5
- **WP3:** ACCEPTED, merged as `ee7f737` (PR #350), verified live in production — table, all three indexes, and the CHECK constraint reached `validated=true`.
- **Latest accepted SHA:** `ee7f737` on `main`
- **Unresolved blockers:** none
- **Human approvals granted:** program-level autonomy (run continuously; escalate only per CHECK-IN A/B/C)
- **Awaiting founder:** nothing. One item is logged for *visibility only*, not decision — see "Codex disposition" below.

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
