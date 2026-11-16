Intent: run the five ops-read money checks (merged in #1069, deployed as ec8dfd582eea) on production once and keep the result as a receipt.

Evidence: `archive/receipts/2026-11-16-check-a7-money-path-ops-read.json` (privacy table from `docs/lanes/pc/a7-bundle-queries-brief.md` applied: counts 1-4 shown as `<5` or folded into `(other)`).

What it shows:
- All five checks answered 200; the slowest (kept-charges) took 2.93 s against the 5 s statement timeout.
- Capability debits: every paid wallet call has exactly one matching debit; none missing, none mismatched. 114 calls recorded a price different from today's listed price (price changes since the call, not a charging error).
- Solution debits: no wallet solution calls since WP3; the 23 earlier ones are pre-WP3.
- Kept charges: no overcharge and no over-refund. No unmatched refunds.
- Orphan debits: 27 with no call reference (5840 cents, April and August, consistent with pre-WP3 solution debits that carried no reference) and fewer than 5 with a dangling reference (March).
- Swallowed-failure exposure: 4060 paid completed calls on the 36 listed slugs, 19929 cents recorded, 24 known payers plus 639 calls with no payer identity (mostly x402). This is exposure, not proven loss.
- FX: no FX-error calls or tests in 2026-11-09..2026-11-15.

Conclusion per the brief's results table: A-7's debit half is verified; its dry-run half (P-008) stays a code test.

Wording notes for any later report: Q3c's `is_solution=false` group also covers refunds pointing at no call; the WP3 09:27 time is the merge time, the deploy came later.

Follow-ups (not done here): pin the Q1 HAVING clause, the Q3 arithmetic and the Q4 distinct-payer expression in `REVIEWED_FILTERS`; add a `test_outcome` vocabulary.

Next authorised action: report the A-7 result to the wow-core master; then brief a lane for the REVIEWED_FILTERS pins | Owner: Strale master | Blocker: none
