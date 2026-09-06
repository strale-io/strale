Intent: Archive M2 closing-review round 10 (the final planned round) and
land `DEC-20260905-L`, the erratum record that withdraws the three
confirmed defects round 10 found, each inside an amending record rather
than a still-open finding against an original candidate record.

## What happened

Round 10 ran at commit `0fd6364fe867a177a4bcde7f1703660837a2e578`
(`DEC-20260905-K`'s merge commit), in six read-only partitions covering
the full candidate corpus (P1-P4 bare-keyed slices, P5 the `--notion-`
qualified collision records, P6 the remaining qualified records plus the
ten amending records `DEC-20260905-B` through `-K` themselves) plus a
full gate run. All nine gates ran clean at that commit
(`scratchpad/closing10-review-gates.txt`).

Each partition verdict, as the reports themselves state it:

- P1: FAIL (Finding 1: `DEC-20260905-C`'s own correction of
  `DEC-20260224-P-g7h8` item 1 asserts a "Vertical-agnostic" statement
  `CLAUDE.md` does not contain)
- P2: PASS (its own "Findings" section nonetheless names one real
  defect: `DEC-20260320-A`'s bracketed-insertion quotation of
  `capability-readiness.ts`'s header comment)
- P3: FAIL (Finding 1: `DEC-20260905-J` item 28 withdraws a
  `DEC-20260507-D` sentence on a false basis)
- P4: PASS (no findings)
- P5: PASS (no findings; operator checker could not run in this
  partition's worktree due to a Windows `npm ci` `ENOTEMPTY`/`EPERM`
  collision with sibling partitions installing concurrently, so every
  quotation was checked by hand instead)
- P6: PASS (no findings; 92 checker residuals across
  `DEC-20260905-C`/`-D`/`-F`/`-G`, all classified as checker misses on
  direct reading)

Three confirmed defects survive after cross-checking every statement
against the existing withdrawal chain (`DEC-20260905-B` through `-K`),
none of them previously withdrawn:

1. `DEC-20260905-C.md:142-144` (P1): the record's own correction of
   `DEC-20260224-P-g7h8` item 1 states "CLAUDE.md does state the
   platform is 'Vertical-agnostic'..." -- false; `CLAUDE.md` at this
   commit contains neither the word "vertical-agnostic" nor any
   long-term data-source ambition statement (`git grep -n -i
   "vertical-agnostic" 0fd6364f -- CLAUDE.md` is empty). The word exists
   only in the user's external `MEMORY.md`, which `DEC-20260905-C`'s own
   item already rules out as a source for this exact claim.
2. `DEC-20260320-A.md:96-98` (P2): quotes `apps/api/src/lib/capability-
   readiness.ts`'s header comment with a bracketed insertion,
   "[reliability and limitations]", that does not appear in the source
   file at all. Benign (accurate paraphrase) but a literal
   inserted-words defect under the stated convention.
3. `DEC-20260905-J.md:536-543` item 28 (P3): withdraws a
   `DEC-20260507-D` sentence on the basis that "future BYO-endpoint
   augmentation" is unverifiable against any admitted source -- false;
   the phrase is a verbatim substring of the parsed row's own
   `Rationale` field for page `35967c87082c81bab96dc64b983e85f1`, which
   is `DEC-20260507-D`'s own `evidence[0]`.

`DEC-20260905-L` withdraws all three without editing the records they
appear in (active records are immutable, `DECISION_ACTIVE_BODY_CHANGED`).
Nothing in `DEC-20260224-P-g7h8`, `apps/api/src/lib/capability-
readiness.ts`'s underlying description, or `DEC-20260507-D` itself is
disturbed; `DEC-20260905-C`'s original withdrawal (the "tens/hundreds of
thousands" quote never appearing in `CLAUDE.md`) stands.

Round 11, if scheduled, runs at the commit that merges this PR and
treats every statement withdrawn by `DEC-20260905-B` through `-L` as
corrected.

## Verification

`scratchpad/verify_erratum10_quotes.py` (not committed) asserts each
withdrawn span in `DEC-20260905-L.md` is a byte-exact substring of the
record it withdraws from at HEAD, and each stated source sentence a
byte-exact substring of its named source file. Output pasted into the
PR body.

## Gates (this session, at HEAD after this PR's own commits)

`npm run context:check`; `node --test scripts/decision-records.test.mjs
scripts/m2-closure-register.test.mjs`; `node
scripts/m2-closure-verify-private-rows.mjs`; `npm run programs:check`;
`npm run codex:check`; `npm run receipts:check`; `node
apps/api/scripts/check-pii.mjs --strict`; `node
apps/api/scripts/check-no-committed-secrets.mjs`; `node
scripts/generate-archive-index.mjs --check`; `node
scripts/m2-quote-fidelity.mjs --export <export> --frontend
<strale-frontend> --min-chars 12 --only
docs/decisions/records/DEC-20260905-L.md`. Results are in the PR body
and the final session message.

## Files touched

- `docs/decisions/records/DEC-20260905-L.md` (new erratum record)
- `archive/sessions/2026-09-05-m2-closing-review-round-10.md` (new;
  reproduces the six partition reports and the gate run verbatim)
- `docs/project/m2-closure-register.yaml` (formal_records row for
  `DEC-20260905-L`; `sources.formal_records.record_count` 241 -> 242)
- This handoff file.
- `docs/project/context-inventory.json` (regenerated, twice per the
  two-pass rule)

## Not adopted

None -- all three of this round's findings are confirmed and withdrawn
by `DEC-20260905-L`.

## Next action

Round 11 (if scheduled) runs at this PR's merge commit and treats every
withdrawal through `DEC-20260905-L` as corrected. No open finding is
left pending from round 10.
