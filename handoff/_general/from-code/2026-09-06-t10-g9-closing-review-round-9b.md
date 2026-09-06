Intent: Fix `DEC-20260905-J`'s own item-count arithmetic, which merged at
`2801a08f` before a correction commit reached its branch: it has 31
numbered items, not 32; its two substantiation-only items are 26 and 27,
not 27-28; item 28 withdraws a `DEC-20260507-D` statement, not a third
substantiation. The prior round-9 handoff file's own summary carried the
same slip ("29 withdrawals across 27 records" and "32 numbered items (30
withdrawals, 2 substantiations)"): the correct counts are 29 withdrawals
across 27 records, and 31 numbered items (29 withdrawals, 2
substantiations).

## What happened

`DEC-20260905-J.md` was authored and merged with a correct item list
(items 1 through 31) but a wrong self-description in four spans: its own
Context section states "of this record's 32 numbered items" (line 644)
and "The remaining two items (27-28) withdraw nothing" (line 652); its
Consequences section states "or in items 26-28 above as substantiated"
(line 738) and, in the `DEC-20260430-A` relation paragraph, "(items 26-28
above)" (line 907). All four are wrong the same way: the record counts
32 items when it has 31, and treats item 28 (a withdrawal against
`DEC-20260507-D`) as part of the substantiation-only pair that is
actually items 26-27. Active records are immutable
(`DECISION_ACTIVE_BODY_CHANGED`), so the fix is a new amending record,
`docs/decisions/records/DEC-20260905-K.md`, not an edit to
`DEC-20260905-J.md`.

Separately, this session's verification also checked two named-source
sweep entries the round-9 sweep reports flagged that were not named in
`DEC-20260905-J` as already withdrawn: the P5 sweep's MISQUOTE finding on
`DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md:65` (the
composite quotation attributed to `DEC-20260409-B`) is the identical span
`DEC-20260905-E` item 7 already withdraws; the P6 sweep's MISQUOTE
finding on
`DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:87` ("strip
DB-canonical fields from backfill payloads") is the identical span
`DEC-20260905-D` item 10 already withdraws. Neither is a fresh finding
against `DEC-20260905-J`; `DEC-20260905-K` item 5 records this as a
substantiation, not a withdrawal.

## Deliverables

- `docs/decisions/records/DEC-20260905-K.md`, the erratum record: four
  withdrawal items correcting `DEC-20260905-J`'s own count (item counts
  31, substantiation items 26-27, item 28 against `DEC-20260507-D`), and
  one substantiation item confirming the two sweep entries above were
  already withdrawn before `DEC-20260905-J` merged.
- `docs/project/m2-closure-register.yaml`, `formal_records.record_count`
  240 -> 241; new `DEC-20260905-K` row in the git-native formal-records
  list, `git_provenance` pointing at `docs/decisions/records/DEC-20260905-J.md`
  (its own first evidence entry, per the git-native provenance rule).
- This handoff file, replacing the wrong summary counts in
  `handoff/_general/from-code/2026-09-06-t10-g9-closing-review-round-9.md`
  (that file is not edited; it is superseded prose, corrected here per
  the same immutability discipline as a merged record).
- Not committed (scratchpad, per the brief): the verification script
  (`scratchpad/verify_erratum9b_quotes.py`) asserting each of the four
  withdrawn spans is a byte-exact substring of `DEC-20260905-J.md` at
  HEAD, that its highest numbered item is 31 with no item 32, that items
  26-27 open "Restates the substantiation" and item 28 opens "Withdraws"
  under a `DEC-20260507-D` heading, and that both sweep-entry spans match
  the opening words of `DEC-20260905-E` item 7 and `DEC-20260905-D` item
  10.

Corrected counts, replacing the round-9 handoff's wrong ones: 29
withdrawals across 27 records, and 31 numbered items (29 withdrawals, 2
substantiations).

## Gates

All gates from this session's brief ran clean at HEAD before opening the
PR; see the PR body for each gate's exit line.

## Next

Round 10 runs at the commit that merges this PR into `main`, and treats
every statement withdrawn by `DEC-20260905-B` through `-J` or
`DEC-20260905-K` as corrected, and every relation substantiated in any of
those records, in `DEC-20260905-J` items 26-27, or in `DEC-20260905-K`
item 5, as substantiated.
