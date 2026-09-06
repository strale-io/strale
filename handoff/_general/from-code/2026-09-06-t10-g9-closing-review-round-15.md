Intent: Land round 15 of the M2 closing independent review and its
erratum record, `DEC-20260905-Q`.

Round 15 ran at `dd8dd3e1497d46f13c51cd24d086ce0b815b4d22` (`DEC-20260905-P`'s
merge commit) with six read-only partition reviewers. Partitions P2, P3, P4
and P6 returned `PARTITION VERDICT: PASS` with no findings. Partitions P1
and P5 each returned `PARTITION VERDICT: FAIL` with one finding. All nine
gates exited 0. The round's own verdict is `VERDICT: FAIL` on those two
items; the archive of all six partition reports and the gate output is at
`archive/sessions/2026-09-05-m2-closing-review-round-15.md`.

P1's finding: `docs/decisions/records/DEC-20260225-P-m1n2.md` line 109
presents `"not CI reports"` as a literal clause of the row in parallel
with a genuine quotation (`"MCP server + SDK"`), when no field of the row
contains that phrase; the row's actual wording is "Don't build: CI
reports, PDF engines, domain-specific pipelines, enterprise sales."

P5's finding: `archive/sessions/2026-09-05-decision-collision-resolution-DEC-20260420-H.md`
line 159 asserts, in its own voice as current fact, that `DEC-20260812-A`
states the direction plan "supersedes 'DEC-20260502-A (Counterparty
Assurance rename/ICP)... the Counterparty Assurance framing is retired as
primary product'", an attribution `DEC-20260905-C` items 35 and 36
already withdrew from the two formal records under this same collision,
naming only those two records, never this resolution report.

Per the task's item 3, I swept all 36 files matching
`archive/sessions/*-decision-collision-resolution-*.md` against the
amending records `DEC-20260905-B` through `-P` for the same collision id.
I read all 36 in full. Beyond P5's finding above, I found no other
resolution report asserting, in its own voice as current fact, a
statement one of those records withdrew. `DEC-20260905-G` item 5 already
names this same resolution report for a different statement at its line
82; item 2 in `DEC-20260905-Q` is now the second distinct statement noted
against this same report.

`DEC-20260905-Q` (`docs/decisions/records/DEC-20260905-Q.md`):
- Withdraws the `"not CI reports"` span from `DEC-20260225-P-m1n2.md`
  (item 1), without disturbing the record's substantive point.
- Notes the Counterparty Assurance repeat in the resolution report
  (item 2), extending `DEC-20260905-C` items 35/36's treatment to the
  report, per the same treatment `DEC-20260905-P` already gave two other
  resolution reports.
- States, as its main point, the rule the corpus has been applying since
  `DEC-20260905-G`: a resolution report under `archive/sessions/` is
  immutable; a statement in it that an amending record withdrew from the
  corresponding formal record stays withdrawn wherever it appears, the
  report is never edited, and it is not a separate defect. This replaces
  the enumeration approach, which has now missed a case in three
  consecutive rounds of review.

Verification script `verify_erratum15_quotes.py` (scratchpad, not
committed) confirmed every withdrawn span in `DEC-20260905-Q` is a
byte-exact substring of its named source at HEAD, and every stated source
sentence is a byte-exact substring of its own source file.

Round 16 runs at this PR's merge commit.

Regenerated: `npm run archive:index`, `npm run context:generate` (twice,
second pass to absorb the first pass's own generated-file changes).

Gates run this session: `npm run context:check`,
`node --test scripts/decision-records.test.mjs scripts/m2-closure-register.test.mjs`,
`node scripts/m2-closure-verify-private-rows.mjs`, `npm run programs:check`,
`npm run codex:check`, `npm run receipts:check`,
`node apps/api/scripts/check-pii.mjs --strict`,
`node apps/api/scripts/check-no-committed-secrets.mjs`,
`node scripts/generate-archive-index.mjs --check`, and
`node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12 --only docs/decisions/records/DEC-20260905-Q.md`.
See the PR body for each gate's exit line.

Next action: none pending from this batch; round 16 of the closing review
is the next continuation point for the M2 closing-review program, at
whatever commit this PR merges to.

## Addendum: a false partition count, corrected and noted

The independent review of this batch's own pull request found that the
round-15 archive's Consolidated findings section said five partitions
passed when four did, contradicting the same file's own method section.
It is corrected here before merge. The same sentence had been copied
from the already-merged round-12 archive, where it is equally false,
since round 12 also had four passes and two failures. That archive is
never amended, so DEC-20260905-Q item 4 notes it and records the true
counts. The sentence originated in the brief that commissioned the
round-12 erratum, not in either worker's own reading.
