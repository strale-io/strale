Intent: record round 11 of the M2 closing independent review and its
erratum, DEC-20260905-M.

Round 11 ran at commit `ef16b2c68b59a679eabd37d95d30e642982ab38d`
(`DEC-20260905-L`'s merge commit) with six read-only partition reviewers.
Five partitions passed clean: P1 PASS, P2 PASS, P3 PASS, P5 PASS, P6
PASS. Partition P4 FAILed, finding two double-quoted spans that no source
contains:

1. `docs/decisions/records/DEC-20260510-A.md`, lines 86-87: the phrase
   "promote a useful handoff note to tracked" is not in the row's
   Notion Rationale, `handoff/README.md`, or
   `docs/programs/cto-readiness/PROGRAM.md`.
2. `docs/decisions/records/DEC-20260904-B.md`, line 101: the phrase
   "where did this id's authority come from" is not in any of that
   record's six evidence entries.

All nine gates ran clean at the same commit. The consolidated verdict
was FAIL on P4's two items; the archived report is
`archive/sessions/2026-09-05-m2-closing-review-round-11.md`.

`DEC-20260905-M` withdraws both spans as quotations without editing the
records they correct (active records are immutable). It also adds a
clause for round 12 and after: a double-quoted span a record attributes
to no source, and does not present as the words of a row, file, page or
person, is the record's own wording and is judged as prose, not as a
quotation. Both items were withdrawn regardless of the clause, because
round 10's and round 3's reviewers had already read item 2's phrase as
own wording rather than a defect, and the corpus must not depend on
which reading a given round's reviewer applies.

Round 12 runs at this PR's merge commit.
