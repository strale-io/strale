# WP11 — Account / trial / Stripe lifecycle

**Intent:** Execute WP11 of the master remediation program end to end — restate
the defect, establish production evidence, converge each affected business fact
on a single authority, prove the tests discriminate, review adversarially until
clean, and open a PR without merging.

**Date:** 2026-08-23
**Worktree:** `C:\Users\pette\Projects\strale-wt-wp11` (kept — PR is unmerged)
**Branch:** `remediation/wp11-account-lifecycle`
**PR:** https://github.com/strale-io/strale/pull/371
**Head SHA:** `df22cd3cf086de80366a729b1da221872baa2087` (15 commits)
**CI:** `check` and `integration-db` both green on that exact SHA
(run 32619588288)
**Status:** OPEN, MERGEABLE, **not merged** — merge is deliberately left to a
separate decision.

## Review verdict

`PASS_WITH_NON_BLOCKING_FINDINGS`, with an explicit merge recommendation.

Eight adversarial rounds by independent agents with rotating lenses. Rounds 1–7
returned `FAIL_REMEDIATION_REQUIRED`. The first two ran in parallel on different
briefs and converged on the same three blockers without seeing each other's
work.

## What shipped

Four business facts, each previously decided by more than one authority, and in
three of four the authorities disagreed:

| Fact | Authority now |
|---|---|
| an account exists, with a wallet and its opening grant | `lib/account-service.ts` — one transaction |
| trial entitlement | `lib/trial-eligibility.ts` + `trial_grants.email_hash` UNIQUE |
| what a Stripe session settled | `lib/stripe-settlement.ts`, reading Stripe's session |
| is a key rotation authorized | `lib/key-recovery.ts` — single-use 30-minute token |
| what closure does, and what the customer is told | `lib/account-closure.ts` |

Two migrations: **0102** (the two new tables, the adopted Stripe replay index,
a 59-row entitlement backfill) and **0103** (a BEFORE UPDATE trigger making
redacted content unrestorable).

## Production evidence gathered (read-only)

- 60 users / 59 wallets — the one gap is the harness principal, so the
  non-atomic-signup window has not been hit by a real signup.
- **Live trial farming:** 8 accounts, signup IP hash `d5ab85828d59fa6f`,
  2026-05-25 → 05-27, €16.00 granted, all spent zero, all via the ungated
  `/v1/auth/register`.
- **Zero** `wallet_transactions` rows have ever carried a `stripe_session_id` —
  the Stripe defect was latent, not realised.
- 22 wallets carry pre-WP2 ledger drift (net €1,085.75), every one internal.
- 312,677 of 919,304 user-linked transaction rows already carry `redacted_at`.
- `suggest_log` held 3,011 IP hashes since 2026-04-17 with **no retention rule**
  — found by WP11's own new guard, not by any reviewer. Given 90-day parity with
  `discovery_hits`; flagged to WP14, which owns retention duration.

## Two lessons worth carrying forward

**1. When a claim enumerates something, derive the enumeration or delete the
claim.** The closure receipt was found inaccurate in five consecutive rounds,
each time somewhere the previous round had not pointed. Correcting the literals
could not converge because the claim and the behaviour were two artifacts kept
in agreement by hand. It ends with the plan performing the closure *and*
building the summary, the JSONB keys read from the account's own rows, the
column lists derived from `CUSTOMER_CONTENT_COLUMNS`, and the completeness
guard querying `information_schema` rather than parsing TypeScript.

**2. A guard that cannot see the shape it guards against reports success.**
Three separate guards in this package were green while doing nothing: one
asserted SQL text under a behavioural name, one was blind to a declaration
style used elsewhere in the same file, one was aimed at a different file than
the defect. Each was found by a reviewer, none by the suite.

A third, narrower one: the receipt **refused erasure on a false ground** —
telling subjects the content could not be cleared without breaking the hash
chain, while the retention job cleared exactly those columns on every row at 90
days. Nobody had checked the claim against the platform's own scheduled
behaviour. Closure performs that redaction immediately now.

## Founder decisions outstanding

Neither blocks the merge. Both write production wallets, which is why they are
not mine:

1. **Reconcile the 22 pre-WP2 drifted internal wallets** (net €1,085.75). Same
   class as WP3's 11 stranded rows — CHECK-IN B.
2. **Whether to reclaim the €16.00 of farmed trial credit.** All eight accounts
   spent zero, so the exposure is already contained.

## Required follow-up before this reaches customers

`strale-frontend/src/pages/docs-content.ts:1172` still says a recovery request
emails a new key and invalidates the old one. Both halves are now false, and a
customer following it would discard a still-valid credential on our written
instruction. `Privacy.tsx` also needs the `trial_grants` retention disclosed.
Cross-repo, so out of this PR's scope; recorded in the manifest.

## Post-deploy reconciliation

Listed in full in the PR body. The load-bearing ones: confirm both tables and
both triggers exist by query rather than by log line, and confirm each guard
*bites* rather than merely exists — attempt a duplicate `email_hash` insert and
an UPDATE restoring `output` on a redacted row, both inside a rolled-back
transaction.

## Environment notes for the next session

- The disposable Postgres for this package is still running:
  `docker` container `strale-wp11-pg` on port 55444, schema materialised and
  both migrations applied. Left up because the PR is unmerged.
- The worktree is left in place for the same reason. Remove with
  `git worktree remove`, never `rm -rf` (the node_modules junction hazard).
- Run the integration lane with `--no-file-parallelism`; without it,
  `do.crash-recovery` and `do.wallet-concurrency` race and fail for reasons
  unrelated to the code.
- `ssrf-bucket-a/b/c` fail as network-probe timeouts under full-suite load and
  pass in isolation. Pre-existing, not a regression.

## Process note against myself

I destroyed uncommitted work once with `git checkout HEAD --` while restoring
after a fail-before run — the exact hazard CLAUDE.md warns about. Recovered
from scratchpad scripts and verified green, but the correct order is commit
first, then revert. Also: two of my own fixes reintroduced defects this repo has
written protocols about — a `Date` bound into a `sql` template (PR-43 class) and
enumerating call sites instead of enforcing an invariant. Both were caught by
the integration lane rather than by inspection, which is the argument for the
lane.
