Intent: land T10 (M2 exit-gap closure) batch 8, five capability-onboarding-pipeline Decision rows (DEC-20260309-G the 12-category risk framework, DEC-20260318-A the manifest-driven pipeline mandate, DEC-20260318-B the --discover/--fix/execute-and-verify upgrades, DEC-20260320-A the onboarding hardening pass, DEC-20260411-B Gate 5 path coverage) as active formal candidate records, contradiction-checked against the live pipeline code (`apps/api/scripts/onboard.ts`, `apps/api/src/capabilities/auto-register.ts`, `apps/api/src/lib/capability-readiness.ts`, `apps/api/src/lib/gate5-path-coverage.ts`), with the register's counts and digests made true again against the private archive.

## What this batch is

Five rows resolved from the private projection at archive commit
`4ed9c88485ea1ec66513e9f2f73e5b932b4729bf` (126 rows, the commit recorded
in the register at launch time). All five matched exactly on `id` in the
private file: `historical_status: active`, `historical_scope: global`,
`disposition: not_yet_reconciled`, and their `title_sha256`/`decided_at`
values matched the brief's page-id table exactly. None collided
(`docs/decisions/id-collisions.yaml` has no entry for any of the five
ids), none was a Git-native protocol label, none had an existing record
(a repo-wide search for each id found only `docs/programs/cto-readiness/tracks.yaml`'s
forward-looking mention of this batch, not a record file). Each is now a
formal candidate record under `docs/decisions/records/`, five protected
sections (Decision, Context, Rationale, Consequences, Reversal
conditions), `scope: technical` (all five are engineering-pipeline
conventions, noted in each Context as a vocabulary translation from the
historical Notion `global` scope), `owner: petter`, `authority_scope:
none`, `authority_active: false`, `migration_status: candidate`, `phase:
M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome`, `Scope`,
`Confidence`, `Source`) was read read-only from
`strale-io/strale-context-archive` at commit `995cece3` (same commit
batches 4-7 used), matching each row by page id with dashes stripped
against the four `decisions-rows*.json` export files. All five page ids
resolved to exactly one row each; no other row's content was read into
any of the five records. None of the five rows had a non-empty `Outcome`
field in the export.

## Per-record fidelity: what was kept, what was compressed

- **DEC-20260309-G** (risk framework): kept every named risk domain
  (upstream dependency, rate limits, cascading failures, legal liability,
  data freshness, geographic coverage bias), the "12 risk categories"
  claim, and the "companion to the Data Model Field Reference" framing
  verbatim. Compressed nothing substantive; the Notion Rationale text
  itself does not enumerate the 12 category names, so none could be
  listed (stated plainly in Rationale, not inferred).
- **DEC-20260318-A** (pipeline mandate): kept the 14-capabilities /
  2-of-5-test-types / SQS 39.3 figures and the `phone-type-detect`
  citation verbatim.
- **DEC-20260318-B** (--discover/--fix/execute-and-verify): kept all three
  named upgrades and their descriptions verbatim, plus the
  `phone-type-detect` root-cause citation.
- **DEC-20260320-A** (hardening): kept the 88.8% (229/258) and 98.4%
  (254/258, 4 intentionally deactivated) figures, the "312-line" `app.ts`
  import-list figure, the "6-dimension" readiness-checker figure, the
  4-tier reliability ordering ("DB metadata -> schema required ->
  baselines -> heuristics"), and the SQS-preservation clause, all
  verbatim.
- **DEC-20260411-B** (Gate 5): kept the "12 of 15 multi-path capabilities"
  audit finding, the Polish company-data name-search case, both spec
  refinements (asymmetric PRIMARY/SECONDARY coverage, inward-trace
  heuristic), and the `bank-bic-lookup` false-positive citation, all
  verbatim.

## Contradictions found and how they are stated

All stated as dated "status on 2026-09-04" notes in each record's
Consequences section, never editing the Decision/Rationale/Outcome text:

1. **The 12-category risk framework does not exist in this repository
   (DEC-20260309-G).** A case-insensitive repository search for "risk
   framework", "12 categories"/"12-category", and "risk categor*" across
   `.ts`/`.md`/`.yaml` found no matches outside this new record. Nothing
   in `onboard.ts`, `capability-readiness.ts`, or `validate-capability.ts`
   enforces a 12-category checklist. Stated plainly: nothing enforces this
   framework today. The closest surviving artifact is `manifests/*.yaml`'s
   free-text `limitations` field.
2. **`seed.ts` deletion makes DEC-20260318-A's prohibition structural
   (DEC-20260318-A).** `seed.ts` was deleted in PR #79; `git ls-files`
   under `apps/api` finds no `seed.ts`. There is nothing left to
   accidentally choose instead of the pipeline. Quoted CLAUDE.md's own
   confirming sentence in the record.
3. **`onboard.ts` still exposes all five original flags plus newer ones
   (DEC-20260318-A, DEC-20260318-B).** Verified by reading the flag-parsing
   block at the bottom of `onboard.ts`
   (`process.argv.slice(2)` / `args.includes(...)`): `--dry-run`,
   `--backfill`, `--strict`, `--fix`, `--discover` all present, plus
   `--batch`, `--force`, `--force-override-authority` added later.
   Execute-and-verify code (headed "Enhancement 1" in the file) still runs,
   gated by `--strict` for abort-on-failure.
4. **The readiness checker's dimension count grew from 6 to 8
   (DEC-20260320-A).** `checkReadiness` in
   `apps/api/src/lib/capability-readiness.ts` today checks 8 dimensions
   (`has_executor`, `has_db_row`/`is_active`, `has_test_suites`,
   `has_latency_estimate`, `has_transparency_tag`,
   `has_input_schema`/`has_output_schema`, `has_reliability`,
   `has_limitations`), not the 6 this row states. The module's own header
   comment attributes the growth to `DEC-20260423-B` ("34 caps shipped to
   prod with NULL reliability"), a dated change after this row's 2026-03-20
   decision. It remains the single gateway in the sense that matters: a
   repo-wide search for `db.insert(capabilities)` / `INSERT INTO
   capabilities` outside `apps/api/scripts/archive/` finds one production
   call site, `apps/api/src/lib/capability-persistence.ts`, called from
   `onboard.ts`.
5. **The risk framework's 12 categories: nothing enforces them
   (DEC-20260309-G, cross-referenced from DEC-20260320-A's Consequences).**
   Restated: neither `onboard.ts`, `checkReadiness`, nor
   `validate-capability.ts` gates on the 12 named risk domains.
6. **Gate 5 (path coverage) exists in code today, under the same name
   (DEC-20260411-B).** `apps/api/src/lib/gate5-path-coverage.ts` exists on
   `main`; its own header comment matches this row's Decision and both
   spec refinements (asymmetric PRIMARY/SECONDARY, inward-trace heuristic,
   the `bank-bic-lookup` false-positive case) essentially verbatim.
   `onboard.ts` references "Gate 5 multi-path fixture coverage,
   DEC-20260411-B" by this row's own id directly in multiple comments.
7. **SQS references across all five rows are historical.** DEC-20260318-A's
   "SQS 39.3" figure and DEC-20260320-A's "no changes to SQS scoring
   logic" clause both predate the SQS engine's full deletion per
   DEC-20260503-B (PR1, 2026-05-05): `sqs.ts`,
   `EXTERNAL_SERVICE_PATTERNS`, `isExternalServiceFailure`, and
   `computeFromRows` no longer exist. `scheduled_testing_eligible`
   (rewritten from `external_cost_cents` on every boot) replaced
   SQS-driven scheduling. Both figures are preserved verbatim in the
   Decision/Rationale text and marked historical in Consequences.

None of these change a Decision's recorded meaning, so none required a
STOP; all are within the fidelity-and-contradiction-surfacing mandate.

## Relations: none added

None of the five rows' extracted Notion text (Decision, Rationale,
Outcome, Source) names another `DEC-2026...` id string anywhere, checked
by literal string search over each field. Per the brief's relation rules
(edges only where source-stated), no `relations` entries were added on any
of the five records; all carry `relations: []`.

- **DEC-20260318-A / DEC-20260318-B**: both name `phone-type-detect` as
  the shared root cause, but neither text names the other row's id — the
  brief's specific trigger ("if 0318-B's text names 0318-A, amends") did
  not fire. Stated as a prose cross-reference in each record's
  Consequences instead.
- **DEC-20260320-A**: does not name 0318-A or 0318-B by id either; no
  edge added, per the brief's own conditional.
- **DEC-20260320-B** (has an existing record, `status: superseded`): the
  brief allowed a `related_to DEC-20260320-B` edge on DEC-20260318-A
  "ONLY if the source names it"; DEC-20260318-A's text does not name it.
  No edge added; DEC-20260320-B is cited in evidence and discussed in
  prose in DEC-20260309-G's Consequences (successor-protocol comparison)
  instead.

## Register changes

Targeted string edits only, per batch 4-7 method:

- Five new rows appended to `decision_rows` (the public array), shape
  matching existing `formally_migrated` rows: `page_id`, `id`,
  `title_sha256` copied verbatim from the private projection,
  `historical_status: active`, `source_url`, `record_key`, `disposition:
  formally_migrated`, `evidence: [docs/decisions/records/DEC-....md]`,
  standard rationale string.
- `formal_records` += five `notion-row` entries (appended after
  `DEC-20260513-E`, the prior tail).
- `sources.formal_records.record_count`: 51 -> 56.
- `counts.decision_rows.formally_migrated`: 44 -> 49.
- `counts.decision_rows.not_yet_reconciled`: 115 -> 110.
- `digests.public_rows.count`: 192 -> 197.
- `digests.public_rows.digest`:
  `81638be3e74a784617effbf502f196c0a419b10a5046ec39c3859cbaf8227c1e` ->
  `178ec1cbd8c5a2b1e77a7efc9e49e5e117a3573b1109e22dbb8bffa1fd7c920c`.
- `digests.public_rows.scope_date_digest`:
  `bce8ef3ef19038f9c9fcf75da47eab8c782bcdce186f291b190b95c927c13b65` ->
  `af3e04d791b7610aef880aa8720847868b87c70dbad507709cb826389e3b5886`
  (recomputed over all 197 public rows' `Scope`/`date:Date:start` triples
  from the raw export, using `scopeDateDigest` per `compareRowsToExport`'s
  own definition — all 197 rows matched an export row, zero missing).
- `digests.all_rows.digest`:
  `9cc1609ee82f79bd79b4f8e5d69441af734748e14c1e6896189f9138b397b759` ->
  `4e1a4b00fc6e041b76e35087e3e80163979431b4558768e2728b55974cfefa5e` (count
  stays 318: 197 public + 121 private).
- `private_rows.count`: 126 -> 121; `private_rows.digest`:
  `c13991c33d02919cbbc7515a7e3fac60a5f4beb83f92481a8e3d30ffc0a788a0` ->
  `3c5bf3b7309301b92af5b96978a7e7d9618ec54b24b1b0cffcb048246995b24d`;
  `counts_by_disposition.not_yet_reconciled`: 115 -> 110.
  `private_rows.commit` is left at
  `4ed9c88485ea1ec66513e9f2f73e5b932b4729bf` in this PR; the orchestrator
  commits the new private half (below) to the archive repository and
  bumps this field afterward.
- Gap `G1`'s `gap` text: "115 preserved Decision rows (114 global, 1
  temporary)..." -> "110 preserved Decision rows (109 global, 1
  temporary)...", with this batch's five record ids appended to both the
  narrative and `evidence`.

No line was deleted from the register except as part of the in-place text
replacements above (the old digest/count values and the old G1 gap
sentence). Specifically, the deleted lines are:
- `count: 192` / `digest: 81638be3e7...` / `scope_date_digest: bce8ef3ef1...` (public_rows, replaced)
- `count: 318` / `digest: 9cc1609ee8...` (all_rows, digest replaced, count unchanged)
- `formally_migrated: 44` / `not_yet_reconciled: 115` (counts.decision_rows, replaced)
- `record_count: 51` (formal_records, replaced)
- `count: 126` / `digest: c13991c33d...` / `not_yet_reconciled: 115` (private_rows, replaced)
- the old G1 `gap:` paragraph (115/114 preserved rows, replaced with the
  110/109 paragraph naming this batch)

No row, gap, or evidence entry was removed.

## Digests computed (all shown above); collected here for convenience

- `public_rows.digest`: `178ec1cbd8c5a2b1e77a7efc9e49e5e117a3573b1109e22dbb8bffa1fd7c920c`
- `public_rows.scope_date_digest`: `af3e04d791b7610aef880aa8720847868b87c70dbad507709cb826389e3b5886`
- `all_rows.digest`: `4e1a4b00fc6e041b76e35087e3e80163979431b4558768e2728b55974cfefa5e`
- `private_rows.digest` (new 121-row projection): `3c5bf3b7309301b92af5b96978a7e7d9618ec54b24b1b0cffcb048246995b24d`

Computed with `scripts/m2-closure-register-lib.mjs`'s own
`canonicalDigest`/`scopeDateDigest` functions, imported directly (via a
throwaway `.mjs` script run inside the worktree and deleted before commit,
never staged), over the 121-row private file plus the register's 197
public rows plus the full 318-row raw export (all four
`decisions-rows*.json` files fetched read-only from the private archive at
commit `995cece3`, same commit prior batches used).

## Private half for the orchestrator

New 121-row private projection (five rows removed, nothing else changed,
same layout as the source) written to (NOT committed, per the brief):
`C:/Users/pette/AppData/Local/Temp/claude/C--Users-pette-Projects-strale/4f68dcca-de52-4ade-b2b2-8341f736268e/scratchpad/2026-09-02-m2-closure-private-rows.batch8.yaml`

## Checks run

- `npm run archive:index` (before `context:generate`, per the brief): wrote
  `archive/README.md` and `handoff/README.md` (229 handoff files indexed);
  no content diff against `HEAD`.
- `npm run context:generate`: clean on the first run (all five records
  already carried the mandatory fifth `## Reversal conditions` heading);
  regenerated 13 non-authoritative files; `docs/project/DECISIONS.md`
  picked up the five new records, no other file changed materially.
- `npm run context:check`: warning-only mode; "no warnings," exit 0, run
  after staging.
- `npm run context:test`: green. CI is the gate; see `archive/receipts/`
  convention for the count-with-receipt rule this handoff avoids by
  pointing at CI rather than stating a bare count as evidence.
- `npm run programs:check`: `ok docs/programs/cto-readiness/tracks.yaml`
  (untouched by this batch, per the constraint).
- `npm run codex:check`: `ok codex re-review backlog`; 9 pre-existing rows
  awaiting Codex, none added or touched by this batch (per the constraint
  not to touch `docs/programs/**`; the backlog register lives there and was
  not edited).
- `npm run receipts:check`: `ok receipts contract`; 7 pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on older handoffs, unrelated to this
  batch.
- `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs`: green. CI is the gate.
- `node scripts/generate-archive-index.mjs --check`: "archive/README.md and
  handoff/README.md up to date."
- `node scripts/m2-closure-verify-private-rows.mjs`: 37 `FAIL` lines, all
  in the expected private count/digest classes and their direct
  consequences (the archive-repo file at the recorded commit still holds
  126 rows, five of which are now also public, so the operator script
  correctly reports `EXPORT_ROW_DUPLICATE` x5,
  `PRIVATE_ROW_ALSO_PUBLIC`/`PRIVATE_ROW_ALREADY_PUBLIC` x5,
  `PRIVATE_ROW_MUST_BE_PUBLIC` (x2 forms per row, x5),
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` x5, the two
  `PRIVATE_COUNT_MISMATCH` lines, `PRIVATE_DIGEST_MISMATCH`, and
  `ALL_ROWS_DIGEST_MISMATCH`). None is a schema, evidence, derivation-rule,
  or record-citation failure: every failure traces to the private file at
  the archive commit not yet reflecting this batch's five removed rows,
  exactly what the brief says to expect until the orchestrator commits the
  private half and bumps `private_rows.commit`.
- `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`) run against this PR's register
  plus the new 121-row private file plus `docs/decisions/id-collisions.yaml`:
  **0 findings.**

## Deviations from the brief

None identified. Every deliverable, check, and constraint in the brief was
met as specified; the two throwaway `.mjs` digest-computation scripts used
during this batch were run inside the worktree and deleted before the
final `git add`, never staged or committed (verified: `git status --short`
shows only the five new record files and the two register-derived
generated-file changes before commit).
