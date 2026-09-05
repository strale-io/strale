Intent: Archive M2 closing-review round 5 (the final round: six fresh
read-only partitions at commit `9bd7316f4511414ddcbb23c83dc47b206500a47a`)
and land `DEC-20260905-F`, which withdraws the one remaining
misattribution and substantiates the two relation gaps that round's
partition P3 raised (`DEC-20260430-A`->`DEC-20260428-A` and
`DEC-20260430-A`->`DEC-20260428-B`) rather than withdrawing either.

## What happened

Round 5 (P1-P6) had already run before this session started; its six
reports and gate output lived in the scratchpad, with `closing5-review-
P6.md` and the final lines of `closing5-review-gates.txt` still in
progress at session start. This session polled both to completion (P6
finished at 21:20, the gate file's ninth `exit=` and `worktree` line at
21:26) before building anything.

1. Read `DEC-20260905-E.md` (round 4's erratum, the shape to copy) and
   all six round-5 partition reports plus the gate output.
2. Ran the operator checker (`scripts/m2-quote-fidelity.mjs`) over the
   full 235-record corpus at commit `9bd7316f` (this worktree's HEAD):
   1116 spans, 1022 faithful, 94 residual -- matching P6's own full-corpus
   run exactly. Reconciled every one of the 94 by hand: 0 already
   withdrawn by `DEC-20260905-B`/`-C`/`-D`/`-E`; 0 new defects (neither of
   this round's two confirmed findings is a checker residual -- the
   misattributed quote is 22 characters, below the checker's
   25-character extraction threshold, and a relation-substantiation gap
   is not a quoted span); 94 checker misses with a located and quoted
   source (11 individual across 11 files + 82 self-referential parsing
   artifacts inside `DEC-20260905-C.md`'s own body + 1 inside
   `DEC-20260905-D.md`'s own body, the same class rounds 3 and 4 already
   described and quantified -- unchanged counts because those two records
   are immutable and do not change between rounds). Traced the root cause
   of the 82+1 class directly: a literal backslash-escaped quote at
   `DEC-20260905-C.md:373` (`"... armed in prod\")"`) desyncs the
   checker's naive `/"([^"]*)"/g` quote-pairing for every subsequent span
   in that file, confirming P6's diagnosis. Full reconciliation:
   `scratchpad/residual-reconciliation-round5.md` (not committed).
3. Built `archive/sessions/2026-09-05-m2-closing-review-round-5.md` by
   script from the six reports (one heading-level demotion each),
   verified the demotion round-trips byte-for-byte back to every
   original report, the gate output is embedded verbatim, and the
   CAUTION banner is byte-identical to round 4's archive.
4. Wrote `docs/decisions/records/DEC-20260905-F.md`: one withdrawal item
   (`DEC-20260505-H`'s misattribution of the "not set in production"
   phrase to `OPENSANCTIONS_API_KEY`'s `cost_note` field -- that row's
   actual `cost_note` reads "Held, not read...."; the withdrawn phrase is
   boilerplate on 43 other rows in `config/env-manifest.yaml`) and two
   substantiation items (`DEC-20260430-A`'s two undeclared-basis relations
   to `DEC-20260428-A` and `DEC-20260428-B`: the record's own Context
   section names both targets' unique subject matter without naming
   either ID -- "the third-party sourcing doctrine" and "the engineering
   bar" -- and both targets' frontmatter `title`/`topic` uniquely match
   those phrases, decided the same day, two days before `DEC-20260430-A`).
5. Caught and fixed one drafting error before finalizing: my first draft
   of item 3 quoted `DEC-20260505-H` as "an explicit \"not set in
   production\" note", but the source reads "...`OPENSANCTIONS_API_KEY`'s
   explicit \"not set in production\" note)" -- no leading "an". Fixed the
   quote to drop the inserted word before running the verification
   script, which would otherwise have caught the same defect class this
   record exists to correct.
6. Wrote and ran `scratchpad/verify_erratum5_quotes.py`: checks every
   double-quoted span >=20 characters in `DEC-20260905-F.md` against every
   loaded candidate source (the two relation targets' records, the
   `DEC-20260430-A`/`DEC-20260505-H` records, `config/env-manifest.yaml`,
   and the record's own earlier text for self-references) under the
   stated normalization convention; separately confirms the withdrawn
   span is present byte-for-byte in `DEC-20260505-H.md`; and confirms
   every cited pre-existing file is unchanged between commit `9bd7316f`
   and HEAD (HEAD was still `9bd7316f` throughout this session, so this
   check is currently trivial but will matter once this PR's branch
   diverges). Full output pasted in the session's final message.
7. Appended the `DEC-20260905-F` row to
   `docs/project/m2-closure-register.yaml`'s `formal_records` list and
   bumped `sources.formal_records.record_count` 235 -> 236.
8. Regenerated the inventory (`npm run archive:index`,
   `npm run context:generate` x2, per the two-pass rule).

## Two slips in the task brief, resolved by matching the established pattern

The brief (`brief-t10-g9-round5-erratum.md`) named the new record's file
as `docs/decisions/records/DEC-20260905-D.md` and its evidence array's
first entry as "the round-3 archive file", both inconsistent with its own
stated `record_key`/`id` (`DEC-20260905-F`) and with round 4's
established pattern (`DEC-20260905-E.md` cites
`archive/sessions/2026-09-05-m2-closing-review-round-4.md`, its own
round's archive file, first). Filed as `DEC-20260905-F.md` citing
`archive/sessions/2026-09-05-m2-closing-review-round-5.md` first, matching
every prior round's own pattern rather than the two literal strings in
the brief.

The brief also asked for "the evidence at commit 4318cbec" for every item.
`4318cbec` is the round-2/`DEC-20260905-C` merge commit, not this round's
reviewed commit; every citation in this record is instead verified at
`9bd7316f4511414ddcbb23c83dc47b206500a47a`, the commit round 5 actually
reviewed and every other deliverable in this task cites.

## Not adopted (per the orchestrator's own instruction)

P6's observation that `DEC-20260507-C--notion-...58c707d895` supersedes
IT/ES/PT/AT rows in `DEC-20260427-I` per its own Rationale but declares
`relations: []` in frontmatter: P6 itself classified this as an omission,
not a false/misattributed/unverifiable claim, so it is recorded in
`DEC-20260905-F`'s Consequences (c) as not adopted rather than as a
withdrawal or a new relation (adding the relation edge would mean editing
an active record's frontmatter, which the immutability rule forbids from
this side).

## Gates

All ten required gates run at commit `9bd7316f`; results in the session's
final message and the PR body. No merge performed, PR left open per the
task's instructions.

## What's next

Round 6, the closing round proper, runs at the commit that merges this PR
and should find nothing: the one misattribution is withdrawn, both
relation gaps are substantiated, and the checker's residual reconciliation
locates a source for every one of its 94 residuals at this commit.
