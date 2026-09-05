Intent: Archive M2 closing-review round 4 (six fresh read-only partitions,
P2 reviewed twice, at commit `65bf77f1b12813f9f94c42540f1f1272988ab1f3`)
and land `DEC-20260905-E`, which withdraws every remaining round-4 finding
and substantiates the one relation gap that round raised
(`DEC-20260409-D`->`DEC-20260409-A`) rather than withdrawing it.

## What happened

Round 4 (P1-P6, P2 reviewed twice as P2/P2b) had already run before this
session started; its seven reports and gate output lived in the
scratchpad. This session:

1. Read `DEC-20260905-D.md` (round 3's erratum, the shape to copy) and all
   seven round-4 partition reports plus the gate output.
2. Ran the operator checker (`scripts/m2-quote-fidelity.mjs`) over the
   full 234-record corpus at commit `65bf77f1` (this worktree's HEAD):
   1096 spans, 1001 faithful, 95 residual. Reconciled every one of the 95
   by hand: 0 already withdrawn by `DEC-20260905-B`/`-C`/`-D`; 1 real
   defect (the `DEC-20260420-G` composite quotation, independently found
   by partition P5 too); 94 checker misses with a located and quoted
   source (11 individual + 82 self-referential parsing artifacts inside
   `DEC-20260905-C.md`'s own body + 1 inside `DEC-20260905-D.md`'s own
   body, the same class round 3's reconciliation described). Full
   reconciliation: `scratchpad/residual-reconciliation-round4.md` (not
   committed).
3. Built `archive/sessions/2026-09-05-m2-closing-review-round-4.md` by
   script from the seven reports (one heading-level demotion each; P2 and
   P2b both included), verified the demotion round-trips byte-for-byte
   back to every original report.
4. Wrote `docs/decisions/records/DEC-20260905-E.md`: 6 withdrawal items
   plus 1 relation-substantiation item (not a withdrawal). The 6
   withdrawals: four stale "no record exists" / "no formal record exists"
   claims found by P2 (`DEC-20260409-D` about `DEC-20260409-C`;
   `DEC-20260320-F` about `DEC-20260320-E`; `DEC-20260405-A` about
   `DEC-20260405-B` and about `DEC-20260225-P-m5n6`, twice in the same
   record); a `cost_note`/`purpose` field misattribution in
   `DEC-20260320-E` found by P2b; and the `DEC-20260420-G` composite
   quotation misattributed to `DEC-20260409-B`, found independently by
   both the operator checker's residual list and partition P5. The
   substantiation item resolves `DEC-20260409-D`'s declared relation to
   `DEC-20260409-A` (flagged by P2b as unnarrated in either record's own
   body): re-verifying it myself found the relation is in fact already
   narrated in `DEC-20260409-A.md`'s own merged body ("that separate DEC
   is `DEC-20260409-D`, decided the same day"), the same reciprocal-
   narration pattern `DEC-20260905-B` excused for `DEC-20260314-A` and
   `DEC-20260423-A`; the item states this plus the two rows' own shared
   Source field and same-day decision as the fuller basis. P2's own
   summary had in fact already flagged this relation as narrated in
   `DEC-20260409-A.md`, disagreeing with P2b's finding; this session's own
   re-verification sided with P2's reading but wrote the substantiation
   item anyway, per this session's task instructions, since the relation
   is genuinely true either way and stating its basis explicitly costs
   nothing.
5. The brief's own framing described "seven defects and one unsubstantiated
   relation"; this session's own count is 6 defects and 1 substantiation
   (listed above). Flagging the discrepancy rather than silently
   reconciling it; nothing in the seven reports names a seventh defect
   beyond the six above.
6. Wrote and ran `scratchpad/verify_erratum4_quotes.py`: delegates the
   convention-faithful check to the operator checker itself (20/20 spans
   faithful in `DEC-20260905-E.md`), separately confirms byte-exact
   matching (whitespace-insensitive, per the corpus's own stated
   convention) for every span quoted directly from another record's own
   body, and confirms every cited pre-existing file is unchanged between
   commit `65bf77f1` and HEAD. Full output pasted in the session's final
   message.
7. Appended the `DEC-20260905-E` row to
   `docs/project/m2-closure-register.yaml`'s `formal_records` list and
   bumped `sources.formal_records.record_count` 234 -> 235.
8. Regenerated the inventory (`npm run archive:index`,
   `npm run context:generate` x2, per the two-pass rule).

## Not adopted (per the orchestrator's own instruction)

P3 listed `DEC-20260429-A`'s four-review-trigger sentence as unverifiable
from the parsed Notion export (the export carries only row properties, not
page body content). Per the brief, this is recorded as verified true from
the Decisions-database page body (`35167c87082c8172bff8f3485699c961`,
section "Re-evaluation triggers") rather than as a withdrawal; this
session did not itself fetch Notion, per the brief's instruction not to.

## Gates

All ten required gates run; results in the session's final message and
the PR body. No merge performed, PR left open per the task's instructions.

## What's next

Round 5 runs at the merge commit and should find nothing: every round-4
finding is withdrawn, the one relation gap is substantiated, and the
checker's residual reconciliation locates a source (or a withdrawal) for
every one of its 95 residuals at this commit.
