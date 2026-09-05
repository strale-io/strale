Intent: archive the M2 closing independent review's round 1 and correct the
statements it found false or misattributed, without editing any of the
protected active candidate records those statements live in.

Round 1 ran at commit `3a7089c5b48432a3dd359acefdd048a63af5034f` as six
read-only partition reviewers. P1, P5, and P6 passed. P2, P3, and P4 failed
on false, fabricated, or misattributed claims: `DEC-20260313-C`'s stale
claim about the frontend's `isSQSUnqualified` filter (contradicted by
DEC-20260904-C and confirmed against `strale-io/strale-frontend`),
`DEC-20260330-B`'s fabricated quotation of a `context7.json` rule that no
longer says what the record claims, `DEC-20260419-A`'s misattribution of
its own restated policy to a script's header comment, `DEC-20260315-I`'s
misattribution of a code comment to the wrong function, a stale figure in
`DEC-20260510-A` quoted from an auto-generated file that has since moved,
an unverifiable attribution in `DEC-20260511-C`, and several punctuation
and word-level quotation-fidelity slips in `DEC-20260505-E`, `DEC-20260506-G`,
`DEC-20260314-F`, `DEC-20260314-A`, `DEC-20260321-A`, `DEC-20260425-A`, and
`DEC-20260225-P-c5d6`. The gate run recorded at the reviewed commit is void
(the worktree lost its files partway through, after `context:check` and
`context:test` both recorded exit 0).

This PR does two things. First, it archives round 1 verbatim at
`archive/sessions/2026-09-05-m2-closing-review-round-1.md`, including the
void gate run. Second, because every record round 1 flagged is `status:
active` and the protected-section validator refuses any edit to an active
record's body or metadata, it adds `docs/decisions/records/DEC-20260905-A.md`:
one amending record that withdraws each false or misattributed statement
from its named record and states the correct fact with fresh evidence,
without changing any amended record's own text. A verification script
(not committed; see the PR body) checked every double-quoted span in the
new record against its named source and reported zero mismatches.

Round 2 needs: rerun all six partitions and the full gate sequence at the
commit that merges this PR into `main`, and treat any statement withdrawn
by `DEC-20260905-A` as corrected rather than re-flagging it.
