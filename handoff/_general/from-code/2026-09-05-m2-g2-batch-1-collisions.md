Intent: Resolve the five earliest historical ID collisions in the M2 closure
register (T10 gap G2, batch 1): DEC-20260225-P-c5d6, DEC-20260303-A,
DEC-20260304-A, DEC-20260304-B, DEC-20260304-C. All ten source rows across
these five collisions were historically active, so every row becomes a
formal candidate record under a distinct `--notion-<page id>` source-qualified
key, following the method already exercised once for DEC-20260502-A
(2026-09-01).

## What shipped

- Ten formal candidate records at `docs/decisions/records/`, one per source
  row, each with the five protected sections, the CAUTION banner, and a
  Consequences section verified against `main` and the sibling
  `strale-frontend@04c9fca9` checkout, read-only.
- Five resolution reports at `archive/sessions/2026-09-05-decision-collision-resolution-DEC-<id>.md`,
  matching the `DEC-20260502-A` worked example's frontmatter and section shape.
- `docs/decisions/id-collisions.yaml`: the five collisions flip to
  `resolution_status: resolved`, each row gets `disposition: formal_record`
  and its `record_key`.
- `docs/project/m2-closure-register.yaml`: the ten existing collision rows'
  `collision` blocks and top-level `disposition`/`evidence`/`rationale`
  updated in place (targeted edits, no row added or removed); ten new
  `formal_records` entries; `record_count` 166 -> 176;
  `counts.decision_rows.unresolved_collision` 69 -> 59,
  `formally_migrated` 159 -> 169; `digests.public_rows.digest` and
  `digests.all_rows.digest` recomputed (count stays 307 public / 318 total;
  `scope_date_digest` unaffected, since only `disposition` changed, not scope
  or date); G2 gap text updated with the remaining count (29 collisions, 59
  rows) and this batch's five collisions named.
- `scripts/m2-closure-register.test.mjs`: fixed two test-helper fragilities
  the batch's data exposed (both were array-order assumptions, not weakened
  validation): the `row()` helper now skips collision-derived rows when
  looking up a generic `"formally_migrated"` representative (since two of
  this batch's ten rows are now the first `formally_migrated` entries in the
  array, and their `title` + `collision` fields differ from the plain rows
  the tests assumed); the cross-surface-collision test now picks a
  still-`unresolved_collision` notion-duplicate row for its kind-flip
  mutation, since flipping a resolved row's kind also trips the unrelated
  `CROSS_SURFACE_FORMAL_RECORD_UNSUPPORTED` rule.
- Fixed one evidence-path defect `receipts:check` caught: the GTM record's
  evidence list cited `packages/langchain-strale` and `packages/crewai-strale`
  as directories; corrected to their `pyproject.toml` files.

## Contradictions found and reported (not resolved)

- **DEC-20260304-A homepage v2.1 polish**: the row states "comparison back to
  #2"; the live homepage's numbered section order today has the comparison
  at #4 and the Solutions showcase at #2. Reported in the record's
  Consequences and the collision's resolution report; not resolved (a later,
  out-of-batch decision, `DEC-20260303-G`, may account for it, but that is
  not confirmed).
- **DEC-20260304-C false-confidence rule**: the row's named backend field,
  `data_confidence`, does not exist under that name; `trust-grade.ts`
  computes a combined grade from SQS/freshness/latency instead, a successor
  mechanism to the row's principle, not a literal match.
- **DEC-20260304-A/B hide-component-prices / kill-DIY-calculator**: a
  `component_sum_cents` field does exist, but on the unrelated `SolutionDetail`
  shape (`GET /v1/solutions/:slug`), not on `SuggestRecommendation` /
  `TypeaheadResult` (the discovery/suggestion interfaces these two rows
  actually govern); not rendered anywhere checked.
- **DEC-20260225-P-c5d6 GTM row**: the week-4-5 launch outputs (demo video,
  dev.to/Hashnode post, direct outreach) and the week-6-7 Show HN post were
  not confirmed as published from anything committed to this repository;
  only draft-stage material and unrelated mentions were found.

## Grep for the bare collided IDs in existing records (rule 4 pre-check)

Only `docs/decisions/records/DEC-20260225-P-w9x0.md` names a bare batch-1
collided ID (`DEC-20260225-P-c5d6`), in a parenthetical aside about schema and
input-handling changes; it makes no claim about the collision's migration
state, so no `corrects_migration_state_in` entry was needed (all five
resolution reports carry `corrects_migration_state_in: []`). No record names
`DEC-20260303-A`, `DEC-20260304-A`, `DEC-20260304-B`, or `DEC-20260304-C`.

## Checks (all green)

`node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs`
(92 + 133 tests, 0 failures); `npm run archive:index`, `npm run
context:generate` (twice, staging between), `npm run context:check` (no
warnings), `npm run context:test`; `npm run programs:check`; `npm run
codex:check` (ok, no new backlog row required from this batch); `npm run
receipts:check` (ok); `node apps/api/scripts/check-pii.mjs --strict` (clean);
`node apps/api/scripts/check-no-committed-secrets.mjs` (clean); `node
scripts/m2-closure-verify-private-rows.mjs` (ok: 318 rows verified against
the archive, 0 private next-batch candidates (nothing private changed, as
expected).

## Remaining G2 scope

29 historical IDs across 59 Notion rows remain unresolved in
`docs/decisions/id-collisions.yaml`. This batch did not touch
`docs/programs/**`; the orchestrator records the batch and the Codex backlog
entry separately, as with prior T10 batches.
