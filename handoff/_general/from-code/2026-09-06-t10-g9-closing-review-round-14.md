Intent: record round 14 of the M2 closing independent review (all pass, one finding on review of the verdict itself), and add DEC-20260905-P to note it.

Round 14 ran at commit `d0e21ecdb3009c8ce83a5345c95755c8cc386ec1`. Six read-only partitions (P1 through P6) all returned `PARTITION VERDICT: PASS` with no numbered findings, and all nine gates exited 0. Partition P5 separately flagged, as an ancillary observation outside its own graded record set, that `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-D.md` (lines 91-92) repeats a statement about `PII_CATEGORY_ENUM` that `DEC-20260905-C` item 34 already withdraws from the formal record it belongs to, but no `DEC-20260905-*` record named the resolution report itself. The consolidator wrote a PASS verdict, ruling the statement a stated limitation, on pull request #611. The independent review of that verdict PR ruled the item a live finding: the round's rule (a) exempts only a stale resolution-report statement an amending record lists, and this one was unlisted. The orchestrator accepted that ruling and closed PR #611 unmerged. Round 14 is therefore FAIL on that one item.

This session adds `docs/decisions/records/DEC-20260905-P.md`, which notes the resolution report by name (the same treatment `DEC-20260905-G` already gives two other resolution reports repeating a withdrawn statement), without editing the immutable report or widening the note beyond this one instance. It also archives the round at `archive/sessions/2026-09-05-m2-closing-review-round-14.md` (six partition reports and the gate output reproduced verbatim, verdict FAIL), appends the `formal_records` register row for DEC-20260905-P, and bumps `sources.formal_records.record_count` from 245 to 246.

Round 15 runs at this PR's merge commit.

## Addendum: a second resolution report noted before merge

The independent review of this batch's own pull request swept the
resolution reports for the same class and found a second one,
`archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260505-E.md`
line 45, asserting that `config/env-manifest.yaml` still carries eight
`HMRC_*` credential rows. The file carries seven, and `DEC-20260905-N`
item 2 had already withdrawn that count from the formal record while
naming only the record. `DEC-20260905-P` was extended to note both
reports before merge, so round 15 starts with the class fully listed.
