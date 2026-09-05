# 2026-09-05: T10 G9 closing-review round 6 archived; DEC-20260905-G

**Intent:** archive round 6 of the M2 closing independent review (six
fresh read-only partitions at `ff8a1384694532d037c5fc0b27588ee93daf63ae`)
and land `DEC-20260905-G`, the erratum record that withdraws round 6's
confirmed defects plus one further sibling-state statement found by an
exhaustive corpus-wide sweep this round's brief specifically required.

## What happened

Round 6 partitions P1, P3, P4, and P6 passed with no confirmed defects.
P2 found four defects: a false "found no match" search claim in
`DEC-20260314-C`, a misattributed quotation in `DEC-20260315-A` (a phrase
borrowed from `DEC-20260314-F`'s own row), a 15-vs-16-day arithmetic slip
in `DEC-20260315-B`, and a false "finds only" search claim in
`DEC-20260404-A`. P5 found one defect: `DEC-20260420-H--notion-...c6a58dfbc5f46ed3f6.md`
calls the `DEC-20260420-I` collision "itself an unresolved collision id
in a later G2 batch," when `docs/decisions/id-collisions.yaml` records it
resolved with two formal records.

Beyond the six partitions, this batch ran two corpus-wide sweeps the
round-6 brief required (a sibling-state sweep and a search-claim sweep),
since rounds 2 through 6 have each independently found the same failure
class: a statement about another record's or a collision's state that
was true when drafted and is false at the reviewed commit. The
sibling-state sweep found one further instance beyond the six partitions'
own coverage: `DEC-20260430-A` (lines 82-83) calls `DEC-20260420-K` "an
unresolved collision" and `DEC-20260422-H` "unmigrated," both false at
this commit, independently corroborated by
`archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-K.md`'s
own "Forward correction" section, which had already flagged the same gap
without being able to withdraw it (an archive file is never amended).

All six confirmed statements are withdrawn, without editing any protected
record, by `docs/decisions/records/DEC-20260905-G.md`, following the same
mechanism `DEC-20260905-B` through `-F` used for rounds 1 through 5. The
brief's requested relation-substantiation items for `DEC-20260430-A`'s
two `related_to` relations were not added: those relations were already
fully substantiated by `DEC-20260905-F` items 1-2, this round's own P3
partition independently re-confirmed the substantiation still holds, and
`DEC-20260430-A`'s own Notion row supplies no additional basis beyond what
`-F` already used, adding a duplicate item would restate an existing
substantiation, not record a new one. See `DEC-20260905-G`'s Not-adopted
section for the full reasoning.

## Verification

The operator checker (`scripts/m2-quote-fidelity.mjs`) ran over the full
236-record corpus: 1128 spans, 1029 faithful, 99 residual. All 99
reconcile as checker misses with a located, quoted source (0 already
withdrawn by prior rounds, 0 new defects), 88 self-referential parsing
artifacts inside the three already-merged withdrawal records
(`DEC-20260905-C.md` 82, `-D.md` 1, `-F.md` 5, new this round since `-F`
merged after round 5), and 11 individually verified checker misses across
11 files, each already independently confirmed by this round's own P2/P3/
P4 partitions. Full reconciliation:
`scratchpad/residual-reconciliation-round6.md`;
`scratchpad/sibling-state-sweep.md`; `scratchpad/search-claim-sweep.md`
(none committed). A standalone verification script
(`scratchpad/verify_erratum6_quotes.py`, not committed) independently
confirmed: every double-quoted span >=20 characters in `DEC-20260905-G.md`
is convention-faithful to a loaded candidate source (25/25); every
withdrawn span matches its amended record byte for byte (6/6); every
cited repository file is identical between `ff8a1384694532d037c5fc0b27588ee93daf63ae`
and this batch's HEAD (14/14).

All nine gates ran clean at the reviewed commit (context:check,
context:test, the two `node --test` register/decision-record suites,
`m2-closure-verify-private-rows.mjs`, `programs:check`, `codex:check`,
`receipts:check`, `check-pii.mjs --strict`, `check-no-committed-secrets.mjs`)
per `scratchpad/closing6-review-gates.txt` (not committed); this batch's
own PR reruns the full gate list plus `generate-archive-index.mjs
--check` before opening.

## Artefacts

- `archive/sessions/2026-09-05-m2-closing-review-round-6.md` (new;
  round-6 archive, six partition reports demoted one heading level, gate
  run verbatim)
- `docs/decisions/records/DEC-20260905-G.md` (new; the erratum record)
- `docs/project/m2-closure-register.yaml` (formal_records row appended
  for `DEC-20260905-G`; `sources.formal_records.record_count` 236 -> 237)
- No file under `docs/decisions/records/` was edited; no
  `archive/sessions/` file was edited; `docs/decisions/id-collisions.yaml`
  was read, never written.

## Next action

Round 7 runs at the commit that merges this PR into `main`, and treats
every statement withdrawn by `DEC-20260905-B` through `-G` as corrected.
