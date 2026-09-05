Intent: Archive M2 closing-review round 3 (six fresh read-only partitions
at commit `4318cbeca3b2f934930df1dedb473702adff33c3`) and land
`DEC-20260905-D`, which withdraws every remaining round-3 finding plus
every operator-checker residual this session could not locate a faithful
source for, and substantiates the two relation gaps round 3 raised
(`DEC-20260409-D`->`DEC-20260409-B`, `DEC-20260428-B`->`DEC-20260428-A`)
rather than withdrawing them.

## What happened

Round 3 (P1-P6) had already run before this session started; its six
reports and gate output lived in the scratchpad. This session:

1. Read `DEC-20260905-C.md` (round 2's erratum, the shape to copy) and all
   six round-3 partition reports plus the gate output.
2. Ran the operator checker (`scripts/m2-quote-fidelity.mjs`, merged since
   round 2) over the full 233-record corpus at commit `4318cbec` (this
   worktree's HEAD): 1042 spans, 933 faithful, 109 residual. Reconciled
   every one of the 109 by hand: 0 already withdrawn by `DEC-20260905-B`/
   `-C`; 14 real defects the checker caught that partition review had
   independently found in most cases too; 95 checker misses with a located
   and quoted source (13 individual + 82 that are self-referential
   parsing artifacts inside `DEC-20260905-C.md`'s own body — a record
   about quotations naturally has many nested `"..." Fact: ... reads
   "..."` constructions, and the checker's strict quote-pairing
   occasionally lands a span boundary in the connective prose between two
   correctly-extracted real quotations). Full reconciliation:
   `scratchpad/residual-reconciliation-round3.md` (not committed).
3. Built `archive/sessions/2026-09-05-m2-closing-review-round-3.md` by
   script from the six reports (one heading-level demotion each), verified
   the demotion round-trips byte-for-byte back to the original reports.
4. Wrote `docs/decisions/records/DEC-20260905-D.md`: 17 withdrawal items
   plus 2 relation-substantiation items (not withdrawals), covering every
   round-3 finding that the quotation convention still counts as a defect,
   plus 3 further defects this session's own reconciliation found (a false
   "Source field is null" claim in `DEC-20260225-P-m1n2`, a false "no
   record exists for DEC-20260420-H" claim in `DEC-20260427-H`, and a wrong
   record-key citation inside `DEC-20260905-C` itself,
   `DEC-20260320-G--notion-...` where the real id is
   `DEC-20260420-G--notion-...`, flagged by round 3's P5 as an observation
   for the consolidator). Also included, per this session's own task
   instructions: `DEC-20260515-C`'s inserted word ("a paid AJPES..."),
   which P4 found but judged not verdict-determining on a partition that
   otherwise passed.
5. Wrote and ran `scratchpad/verify_erratum3_quotes.py`: 25 sampled
   attributions, all convention-faithful, all byte-exact where the brief's
   stricter rule applies (spans quoted from another record's own body);
   18 cited files confirmed unchanged between commit `4318cbec` and HEAD
   (this worktree's HEAD is `4318cbec` itself, so this check is trivially
   clean). Full output pasted in the session's final message.
6. Appended the `DEC-20260905-D` row to
   `docs/project/m2-closure-register.yaml`'s `formal_records` list and
   bumped `sources.formal_records.record_count` 233 -> 234.
7. Regenerated the inventory (`npm run archive:index`,
   `npm run context:generate` x2, per the two-pass rule).

## Gates

All ten required gates run; results in the session's final message and
the PR body. No merge performed — PR left open per the task's
instructions.

## What's next

Round 4 runs at the merge commit and should find nothing: every round-3
finding is withdrawn, both relation gaps are substantiated, and the
checker's residual reconciliation locates a source (or a withdrawal) for
every one of its 109 residuals at this commit.
