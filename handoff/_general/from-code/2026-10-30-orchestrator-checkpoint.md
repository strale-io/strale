Intent: replace the stale 2026-10-28 orchestrator checkpoint so the Strale
master orchestrator (bus identity `strale-planning`) can resume on any Claude
account without chat history.

# Orchestrator checkpoint, 2026-10-30 (morning, Swedish time)

> **SUPERSEDED on 2026-10-30 (evening) by
> [`2026-10-30-orchestrator-checkpoint-evening.md`](2026-10-30-orchestrator-checkpoint-evening.md).**
> Resume from that file, not this one: H7 closed and D1 advanced after this was
> written, so this file's "Remaining work" items 1 and 2 are out of date. Its
> x402 settlement reconciliation and its "Waiting on Petter" list still hold
> and are not repeated in the successor.

Read this file first, then `docs/programs/platform-hardening/PROGRAM.md` and
`docs/programs/distribution/PROGRAM.md` (their **Resume here** sections and
`tracks.yaml`).

**This supersedes `2026-10-28-orchestrator-checkpoint.md`**, whose "Remaining
work" still lists H7c, D7, D8 and D9 and whose "Next authorised action" is to
start H7c — all shipped on 10-29. Do not resume from that file.

## Why this file exists

The orchestrator ran through 10-29 and merged roughly PRs #810 to #843 — 23
lane handoffs are on disk for that day — then stopped between units at about
00:21 Swedish time on 10-30 (its last merge, #843, at `2026-10-29T23:21:42Z`;
its last bus post `2026-10-29T19:20:04Z`). It ran out of tokens on another
Claude account and **never wrote an end-of-day checkpoint**, which is what the
"Switching coding agents" rule exists to prevent. This file is written by a
different session from the repository state, not from its transcript — no
local transcript for it exists on this machine, so anything it knew and did
not commit is gone.

It died clean: no uncommitted work in any worktree, no stranded branches, no
open PRs of its own, and production on its last merge.

## Resume block

- **Mandate:** DEC-20261027-B. Implement platform-hardening (H1 to H8) and
  distribution (D0 to D10) with as little founder involvement as possible.
  - Codex CLI does the builds: gpt-6.1-sol for judgement, gpt-6-astra for the
    money path, gpt-6.1-terra for precise fixes.
  - A separate read-only Claude reviewer verifies, on real Postgres 16 for
    money-path work.
  - The orchestrator commits, pushes, opens the PR, merges on green CI and
    verifies production.
- **Trunk at checkpoint:** `origin/main` `c813e53e` (PR #844). The morning
  check-in merged #844 and #845 at `07:37Z` and verified the deploy:
  `GET /health` → `c813e53ee96d`.
- **Program status** (from the registers, not from memory):
  - platform-hardening: T1/T2/T4 **done**, T7 (H7) **active**, T3/T5/T6
    queued, T8 founder-gated.
  - distribution: T2 (D1) **active**, T1 and T3 to T12 queued except T4 (D3)
    and T10 (D9), founder-gated.
  - brand-website: T4 active (Open Flow adopted); T6 is the `apps/web` build.
  - cto-readiness: T7 (M4 cutover) active; the cutover merge stays Petter's.

## Shipped since the 10-28 checkpoint

10-29, in merge order: #810 Czech ARES reuse basis · #805/#807/#808/#809 H7d
migrations (one file per block, ledger-hash skip, SQS column drop) · #799/#802
H7c offline contract tests · #801 free_tier_health meta-monitoring fix · #800
bus inbox hook · #798 wow-core comms profile · #804/#806 D7 narrow MCP servers
· #811 x402-watch single-buyer wording · #813 alerts to the bus · #814/#818
D9 Clay and D3 draft · #815 D6 Vercel AI SDK · #817/#821 D8 n8n 1.0.0 ·
#816/#822 D4 Claude connector with OAuth · #819 x402/v2 discovery · #820
per-key /v1/do limits · #823/#824 H8 Better Stack (dormant) · #812 merge_group
CI · #825 registercheck vendor check · #826 D10 record · #827 D5 Zapier ·
#828 strale-cli · #830 langchain-strale 0.2.0 · #831 D12 housekeeping and four
directory submissions · #832/#836 source_health rename and H4 register ·
#829 x402 payment bound to its capability · #833 async jobs with file output ·
#835 /v1/do/batch · #834 H7e A migration repairs · #837 H7e B known_answer
tightening · #838 PyPI trusted publishing · #839 placeholder-bearer auth fix ·
#840 places-search · #841 H1 watch-fires test · #842 transcription/OCR vendor
research · #843 document-ocr.

10-30, by the morning check-in (not the orchestrator): #844 `price-compare`
delisted and the `image-resize` fixture moved off a robots-disallowed host;
#845 `openapi-validate` object specs and `prompt-compress` fenced JSON.

## The two production checks it asked for — both now done

Both were posted to the bus for the morning run and neither appears in that
run's operating record. Done in this session, read-only. Receipt:
[x402 settlement reconciliation](../../../archive/receipts/2026-10-30-audit-x402-settlement-reconciliation.json).

**1. x402 settlement reconciliation (bus #6491948434) — no gap.** The
2026-10-28T17:51Z CRITICAL "settlement volume dropped: 78 in 24h vs ~158/day"
was a **real dip that has since recovered**, not a recording failure:
102 settlements on 10-28, 588 on 10-29, 731 in the 24 h to 10-30T08:05Z.

| check | result |
|---|---|
| our x402 transactions, 24 h | 731 |
| x402scan, same recipient, 24 h | 743 txns, US$25.86 (snapshot taken minutes later) |
| distinct payers / buyers | 4 / 4 |
| `x402_orphan_settlements` | 0 rows, ever |
| `x402_settlement_intents` state `escalated` | 0 |
| recorded intents in 7 d | 1,976 |
| …of those, with no matching transaction | **0** |
| x402 transactions in 7 d with no intent row | **0** |
| 10 newest on-chain hashes from x402scan, found in `transactions` | **10 of 10** |
| negative control (impossible hash) | returns nothing, so the lookup discriminates |

Two method notes for whoever repeats this. The on-chain transaction hash is
**`transactions.x402_settlement_id`**, not `x402_payment_hash` (an internal
32-hex digest); matching the explorer against the latter reports every
settlement missing. And an earlier pass filtered intents on states
`settled`/`completed`/`captured`, which **no row holds** — the populated
terminal state is `recorded`, so that pass returned a vacuous 0. The numbers
above use `recorded` and carry their denominator.

The on-chain leg is the explorer plus a 10-hash spot check, not a full log
scan: the public Base RPC refuses `eth_getLogs` outright, and our Alchemy app
has only Ethereum enabled (portfolio 2.1, needs Petter). A complete on-chain
count needs that network switch-on.

**2. Block 0139 and the skip behaviour (bus #6506171504) — as designed.**
All ten of `runMigration0130` to `runMigration0139` are in
`startup_migration_applied`. `0137` and `0139` have
`first_applied_at == last_applied_at` (`2026-10-29T17:51:25Z`), so they ran
once and have not re-run. `0087`, `0089`, `0030` and `0103` last applied
`2026-10-29T17:22Z` and were **not** advanced by the `2026-10-30T07:48:34Z`
boot, which did touch 0130 and 0132 to 0138 — so they are being skipped, which
is what H7d's ledger-hash skip is for.

`0139`'s own `rows_affected` is **not available here**: it is only in the
Railway boot log, which this session cannot read. Per DEC-20260504-C the
effect-level evidence above is the better check anyway, but if the figure
itself is wanted, it needs Railway log access.

## Open PRs at checkpoint

None belong to the orchestrator.

| PR | State | Owner and lane |
|---|---|---|
| 846 | open | this session: the status sweep and this checkpoint |
| 736 | draft | website lane (Website 4) |
| 730 | draft | T7 contract and way-of-working lane |
| 727, 726, 725 | draft | website lane (Website 3/5, 2/5, 1/5) |
| 682 | ready | M4 cutover lane (blocking checks) |

## In-flight

Nothing is building. No Codex run is active. The only worktree carrying
uncommitted work is `.claude/worktrees/agent-aa0d77d823b642e00` (`b7-fix-work`,
6 paths, untouched since September, M4 property) — not the orchestrator's.

**The handoff gate is red** on two batch worktrees
(`strale-wt-checkin-1030`, `strale-wt-design`), both pushed and unmerged and
neither this session's. Do not remove or baseline another session's worktree;
see `feedback_concurrent_sessions_make_batch_gate_unsatisfiable`. It clears
when those lanes finish.

## Remaining work, in order

1. **H7 finish:** the production queries still owed on block 0132 are now
   answered above; what is left is in
   `handoff/_general/from-code/2026-10-29-h7-block-repairs.md`.
2. **D1 publish steps** (DEC-20261027-B item 7). Blocked on Petter's npm and
   PyPI logins: `strale-cli` first publish, the PyPI trusted publisher for
   `langchain-strale`, the `strale-semantic-kernel` deprecation, then bump
   `server.json` and republish the registry entry.
3. **The Strale inbox routine** (DEC-20261027-C) and the connector probe.
4. **H6:** switch `INPUT_VALIDATION_MODE` to enforce after 7 clean days of
   report-mode logs (#786 landed 10-28, so not before 11-04).
5. **D10:** the 45-day free-tier review, recorded for 2026-12-12.
6. **Two hardening items from review, no money impact:** a replayed payment
   hash used on a different capability of the same price returns the first
   capability's output (gateway and `/v1/do`); a thrown facilitator call on
   `/v1/do` still returns the legacy 500 envelope.
7. **Carried from the morning run:** the `image-resize` production suite still
   points at the robots-disallowed gstatic fixture and needs a write-authorised
   `onboard.ts --backfill`; LESSONS.md is not updated for the #786 class
   (a guard rollout disabled paid tools the harness cannot call).

## Waiting on Petter

Unchanged by this session, and the real constraint on Phase 1:

- **DQ-41** — `ONBOARDING_RUN_SECRET` in Railway plus the GitHub environment
  `production-onboarding` restricted to `main`. Four finished tools are merged
  and not live.
- **DQ-42** — `eu-trademark-search` has been refusing since 10-28 under our own
  robots rule; it earned €5.50 on x402. Recommendation: off sale now, open the
  free EUIPO account.
- **DQ-43** — the NTA change form for Moonlighter AB.
- **Serper expires 2026-11-08** (46,862 of 50,000 used), eight tools behind it.
- **HMRC sandbox keys** into Bitwarden project `strale` before about 11-12.
- The bus `needs-petter` queue: Better Stack signup, Zapier submission, four
  directory listings, the repo description, the x402scan wallet, and the
  Alchemy network switch-on (which also unblocks a full on-chain recount).

## Next authorised action

Item 1, then item 2 as far as it goes without Petter. Both are inside the
DEC-20261027-B mandate. Start in a fresh worktree from `origin/main`; the
trunk stays on `main`.
