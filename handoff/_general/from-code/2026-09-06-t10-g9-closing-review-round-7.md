# 2026-09-06: T10 G9 closing-review round 7 archived; DEC-20260905-H

**Intent:** archive round 7 (final round) of the M2 closing independent
review (six fresh read-only partitions at
`f15bbdd9e7cb88401771cedb62c5907636bf7477`) and land `DEC-20260905-H`, the
erratum record that withdraws round 7's confirmed defects plus one
further sibling-state statement found by a broader corpus-wide re-sweep
this round's brief required.

## What happened

Round 7 partitions P1, P2, P4, and P6 passed with no confirmed defects.
P3 found one defect: `DEC-20260506-G`'s Context section states no formal
record exists for `DEC-20260422-H`, when `docs/decisions/records/DEC-20260422-H.md`
exists in this repository (the companion claim in the same sentence,
about `DEC-20260506-F`, is true and is not withdrawn). P3 separately
flagged `DEC-20260429-A`'s "four review triggers" enumeration; per the
orchestrator's own instruction this is recorded again under Not adopted,
citing `DEC-20260905-E` (which already verified the four triggers from
the Notion page body), not as a fresh withdrawal. P5 found one defect:
`DEC-20260420-H--notion-...b58b36de5f71c0937f.md` attributes the
19-character phrase `"library-as-product"` to `docs/strategy/2026-08-05-direction-plan.md`,
when that file's own wording is "commits to the library as the product" /
"The library, built properly", the exact phrase belongs to
`CLAUDE.md:302`'s own summary bullet instead.

Beyond the six partitions, this batch ran the broader sibling-state
re-sweep the round-7 brief required (a wider grep pattern than round 6's
own sweep, 56 raw hits, each judged individually against
`docs/decisions/records/` and `docs/decisions/id-collisions.yaml`). It
found exactly one statement not already withdrawn and not still true:
`DEC-20260506-G`'s stale `DEC-20260422-H` claim, independently
corroborating P3's own direct-reading finding rather than surfacing a
second, distinct instance the six partitions missed. Round 6's own sweep
had listed `DEC-20260506-G` among its raw hits but did not withdraw its
false half; this record closes that gap. This batch also ran the checker
a second time at `--min-chars 12` (122 residual vs 99 at the default),
reconciling all 23 additional short-quotation residuals as checker
misses; the "library-as-product" misattribution is not among either
run's residuals at any threshold because the checker accepts CLAUDE.md
and AGENTS.md as sources for every span whatever file the sentence names,
and the phrase occurs in CLAUDE.md; it was found only by reading the
record and its source directly.

The two brief-requested `DEC-20260430-A` relation-substantiation items
(to `DEC-20260428-A` and to `DEC-20260428-B`) were added as fresh
substantiation items in `DEC-20260905-H`, even though `DEC-20260905-F`
items 1-2 already substantiate the same relations and this round's own
P3 partition reconfirmed the substantiation holds with no new basis on
the row (its `Rationale` field is null). `DEC-20260905-G`'s own Not-adopted
section had previously declined to duplicate this exact substantiation on
the reasoning that a fresh item would only restate an existing basis; this
round's brief explicitly asked for the items anyway, so they are included
here as items 2-3, each independently re-verified against the row and both
target records' frontmatter.

All confirmed statements are withdrawn, without editing any protected
record, by `docs/decisions/records/DEC-20260905-H.md`, following the same
mechanism `DEC-20260905-B` through `-G` used for rounds 1 through 6.

## Verification

The operator checker (`scripts/m2-quote-fidelity.mjs`) ran over the full
237-record corpus: 1147 spans, 1048 faithful, 99 residual at the default
25-character threshold. All 99 reconcile as checker misses with a
located, quoted source (0 already withdrawn by prior rounds, 0 new
defects), 88 self-referential parsing artifacts inside the three
already-merged withdrawal records (`DEC-20260905-C.md` 82, `-D.md` 1,
`-F.md` 5), and 11 individually verified checker misses across 11 files.
A second run at `--min-chars 12` found 122 residual (23 beyond the
default), all reconciling the same way (0 already withdrawn, 0 new
defects, 23 checker misses). Full reconciliation:
`scratchpad/residual-reconciliation-round7.md`;
`scratchpad/residual-reconciliation-round7-short.md`;
`scratchpad/sibling-state-sweep-round7.md` (none committed). A standalone
verification script (`scratchpad/verify_erratum7_quotes.py`, not
committed) independently confirmed: every double-quoted span >=20
characters in `DEC-20260905-H.md` this script could extract and map to
its attributed source is convention-faithful (8/8 mapped attribution
checks, plus a byte-for-byte, whitespace-normalized withdrawn-span check
against `DEC-20260506-G.md`); every cited repository file is identical
between `f15bbdd9e7cb88401771cedb62c5907636bf7477` and this batch's HEAD
(9/9).

All nine gates ran clean at the reviewed commit (context:check,
context:test, the two `node --test` register/decision-record suites,
`m2-closure-verify-private-rows.mjs`, `programs:check`, `codex:check`,
`receipts:check`, `check-pii.mjs --strict`, `check-no-committed-secrets.mjs`)
per `scratchpad/closing7-review-gates.txt` (not committed); this batch's
own PR reruns the full gate list plus `generate-archive-index.mjs
--check` before opening.

## Artefacts

- `archive/sessions/2026-09-05-m2-closing-review-round-7.md` (new;
  round-7 archive, six partition reports demoted one heading level, gate
  run verbatim, undoing the demotion round-trips each report byte for
  byte)
- `docs/decisions/records/DEC-20260905-H.md` (new; the erratum record)
- `docs/project/m2-closure-register.yaml` (formal_records row appended
  for `DEC-20260905-H`; `sources.formal_records.record_count` 237 -> 238)
- No file under `docs/decisions/records/` was edited; no
  `archive/sessions/` file was edited; `docs/decisions/id-collisions.yaml`
  was read, never written.

## Not adopted (see `DEC-20260905-H` Consequences (c) for the full list)

- `DEC-20260429-A`'s "four review triggers" enumeration (already recorded
  as verified from the Notion page body by `DEC-20260905-E`).
- Every unverifiable database/production-state claim any round-7 report
  flagged, left exactly as the record states it.
- Every convention-covered checker residual (grep-pattern self-quotes,
  unattributed paraphrases, self-referential parsing artifacts).

## Next action

Round 8 runs at the commit that merges this PR into `main`, and treats
every statement withdrawn by `DEC-20260905-B` through `-H` as corrected,
and the two `DEC-20260430-A` relations as substantiated.
