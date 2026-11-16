Intent: run the five ops-read money checks (merged in #1069, deployed as ec8dfd582eea) on production once and keep the result as a receipt.

Evidence: `archive/receipts/2026-11-16-check-a7-money-path-ops-read.json` (privacy table from `docs/lanes/pc/a7-bundle-queries-brief.md` applied: counts 1-4 shown as `<5` or folded into `(other)`).

What it shows:
- All five checks answered 200; the slowest (kept-charges) took 2.93 s against the 5 s statement timeout.
- Capability debits: every paid wallet call has exactly one matching debit; none missing, none mismatched. 114 calls recorded a price different from today's listed price (interpretation: price changes since the call; the debit matches the recorded price in every case).
- Solution debits: no wallet solution calls since WP3; the 23 earlier ones are pre-WP3.
- Kept charges: no overcharge and no over-refund. Unmatched refunds: none at all; the brief expected the 21 August solution rows here and they are absent (not yet explained).
- Orphan debits: 27 with no call reference (5840 cents; the brief expects pre-WP3 solution debits here, though Q2's 23 pre-WP3 calls and 5240 cents do not reconcile exactly) and fewer than 5 whose reference matches no call (65 cents). The brief counts the second group as a finding.
- Swallowed-failure exposure: 4060 paid completed calls on the slugs in `SWALLOWED_FAILURE_SLUGS` (36 in `apps/api/src/lib/ops-read.ts`), 19929 cents recorded, 24 known payers plus 639 calls with no payer identity (mostly x402). This is exposure, not proven loss.
- FX: no FX-error calls or tests in 2026-11-09..2026-11-15.

Conclusion per the brief's results table: not all clean. Q1, Q3 and Q3c are clean, but Q3b has fewer than 5 debits (65 cents) whose reference matches no call, which the table routes to a remediation batch plus a refund measurement. A-7's debit half is therefore not yet verified. Its dry-run half (P-008) stays a code test. No refund runs before the founder's refund-caps DEC (moonlighter-ab/wow-core#348).

Wording notes for any later report: Q3c's `is_solution=false` group also covers refunds pointing at no call; the WP3 09:27 time is the merge time, the deploy came later.

Follow-ups (not done here): pin the Q1 HAVING clause, the Q3 arithmetic and the Q4 distinct-payer expression in `REVIEWED_FILTERS`; add a `test_outcome` vocabulary.

Next authorised action: brief a remediation lane to trace the dangling-reference debits and the 4-debit gap between Q2 and Q3b, then measure the refund owed; report to the wow-core master | Owner: Strale master | Blocker: none (any refund waits for the refund-caps DEC)
