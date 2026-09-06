Intent: record round 12 of the M2 closing independent review and its
erratum, DEC-20260905-N.

Round 12 ran at commit `fdf915652fe04a6e4d56ea6a7ab6a54e074b8d4d`
(`DEC-20260905-M`'s merge commit) with six read-only partition reviewers.
Four partitions passed clean: P1 PASS, P2 PASS, P3 PASS, P4 PASS.
Partition P5 FAILed on one item; partition P6 FAILed on two items:

1. `docs/decisions/records/DEC-20260905-J.md`, item 20 (section
   `DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086`, lines
   414-428): asserts as fact that "library-as-product" is "not language
   `docs/decisions/records/DEC-20260812-A.md` ... uses." Fact:
   `docs/decisions/records/DEC-20260812-A.md` line 83 (Reversal
   conditions) reads "replaces the library-as-product strategy" —
   the literal phrase is present in that file, confirmed by
   `git grep -n -i "library-as-product" HEAD --
   docs/decisions/records/DEC-20260812-A.md` (one hit, line 83).
   `DEC-20260420-E`'s original attribution was faithful; only the
   direction-plan document itself lacks the phrase, and that part of J's
   item 20 stands.
2. `docs/decisions/records/DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md`,
   line 43 (Consequences): states `config/env-manifest.yaml` "carries
   eight `HMRC_*` rows", then enumerates exactly seven names in the same
   sentence. Fact: `config/env-manifest.yaml` at HEAD carries exactly
   seven `HMRC_*` rows, matching the record's own enumeration.
3. `docs/decisions/records/DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md`,
   frontmatter line 9: `decided_at: 2026-05-05`. Fact: the record's own
   source Notion row (page `35767c87082c81d3897fe47a2ec7a4c1`) has its
   `Date` property at 2026-05-04 and `createdTime` 2026-05-05
   09:35:36Z; the record's own Context already says the row's Outcome
   was "recorded 2026-05-04"; the sibling record for the same collision
   pattern sets `decided_at: 2026-05-04` from an identical row Date
   property.

All nine gates ran clean at the same commit. The consolidated verdict
was FAIL on P5's one item and P6's two items; the archived report is
`archive/sessions/2026-09-05-m2-closing-review-round-12.md`.

`DEC-20260905-N` withdraws the false correction and the two false
statements without editing the records it corrects (active records are
immutable): item 1 withdraws `DEC-20260905-J` item 20's false claim
about `DEC-20260812-A.md` while leaving its true observation about the
direction-plan document and every other item in `DEC-20260905-J`
undisturbed; item 2 withdraws the "eight" count in favor of seven,
matching the record's own enumerated list; item 3 states the row's
decision date is 2026-05-04 without editing the record's frontmatter.

Round 13 runs at this PR's merge commit.
