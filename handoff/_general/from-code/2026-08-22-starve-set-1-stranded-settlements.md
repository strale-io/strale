# STARVE-SET-1 — stranded settlement set closed

**Intent:** investigate alert STARVE-SET-1 from durable production evidence and,
if the remediation was safe/bounded/policy-covered, execute and verify it.

## The identifier is not in any registry

`STARVE-SET-1` appears nowhere in the repo (full-tree search, including
`archive/` and `node_modules/`) and nowhere in the production alert ledger
(`health_monitor_events WHERE event_type='alert_sent'`, no row matching
`%starve%` in any column). It was matched **by condition, not by lookup**.

Two candidate starvation conditions were checked:

| Candidate | Finding |
|---|---|
| x402 settlement-intent starvation (WP5 class) | **Empty.** 142 `recorded`, 3 `failed`, zero `settling`, zero `escalated`. No backlog. |
| Wallet-rail transactions stranded in `status='executing'` | **11 rows since 2026-04-07.** Matches the alert's shape and the founder policy quoted in the instruction verbatim. Acted on. |

## Evidence on the eleven (before)

- All 11 `output IS NULL`, `error IS NULL`, `completed_at IS NULL` — **no durable
  evidence of delivery for any of them**.
- 10 are free-tier, `price_cents = 0`, `user_id = NULL`. No wallet touched, no
  ledger row. Zero economic content.
- 1 (`e995cbb7`, 2026-08-12, `competitor-compare`) carried a **100c wallet debit**
  on the internal account `test2@strale.io`. One ledger row, `purchase −100c`.
- **No refund had occurred.** 13 refunds exist platform-wide; none referenced any
  of the eleven.
- `manual_reconciliation` events: **0** — the script had never run in write mode.
- No x402 involvement: all 11 `x402_settlement_id IS NULL`; `x402_orphan_settlements`
  empty. No on-chain money to reverse.

## Action

Ran `apps/api/scripts/reconcile-stranded-executing.ts --apply` (dry run first).
Pinned to 11 literal UUIDs, three independent exclusion guards, single DB
transaction covering refund + status close + durable record.

## Verified after (independent queries, not the script's own output)

- All 11 now `status='failed'`; `completed_at` still NULL (correct — they never
  completed, and it keeps `integrity-hash-retry` away from them).
- Closure note written only to the one non-redacted row; the 10 redacted rows'
  `error` left untouched.
- Wallet `32abb6eb`: **3047c → 3147c**, delta **+100c**.
- Ledger for `e995cbb7`: `purchase −100c` **and** `refund +100c`.
- 11 `manual_reconciliation` events, `human_override=true`, policy recorded verbatim.
- **Blast radius zero:** no row outside the eleven carries the closure note;
  platform-wide `status='executing'` is 0; last-15-min traffic is 100%
  `system@strale.internal` and unaffected.
- Charge standing against undelivered work in the set: **100c → 0c**.

## Loose ends (no action owed)

1. **3 failed x402 intents** (`keyword-suggest`, 2026-08-21 12:54,
   `settle_exact_failed_onchain`). All three: `settlement_id NULL`,
   `transaction_id NULL`, zero matching transaction rows. No USDC moved, caller
   got a 402, nothing was charged. Lost sale, not customer harm.
2. **`authorised_by` string in the 11 events** reads
   `"founder approval, 2026-08-21 stranded-row reconciliation"` — the date of the
   *plan*, not of the approval (2026-08-22, correctly recorded in each event's
   `created_at`). An edit correcting it was reverted on disk by the shared-checkout
   hazard before the run. **Not amended after the fact** — rewriting an audit
   record for wording is exactly what this program exists to prevent. Noted in the
   script header instead.
3. **Internal wallet `32abb6eb` ledger sum (−8697c) ≠ balance (3147c).**
   Pre-existing, caused by direct top-ups via `topup-test.ts` that bypass the
   ledger. Internal account only. Not touched here; worth a separate look if the
   ledger is ever treated as authoritative.

## Repo state

`apps/api/scripts/reconcile-stranded-executing.ts` header updated from
"NOT YET APPLIED" to the applied record. **Uncommitted** — the branch
(`remediation/wp9`) carries another session's in-flight work and was not swept
into a commit.
