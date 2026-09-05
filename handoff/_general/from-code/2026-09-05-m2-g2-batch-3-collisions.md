Intent: resolve T10 gap G2 batch 3, seven historical decision-ID collisions
(fourteen Notion rows) in the M2 closure register, following the method
landed in G2 batches 1 and 2 (PRs #553, #555): DEC-20260406-C,
DEC-20260409-C, DEC-20260420-D, DEC-20260420-E, DEC-20260420-F,
DEC-20260420-G, DEC-20260420-H.

Work done:

- Twelve formal candidate records under distinct `--notion-<page id>`
  source-qualified keys, in `docs/decisions/records/`: two each for
  DEC-20260406-C, DEC-20260420-E, DEC-20260420-F, DEC-20260420-G,
  DEC-20260420-H (all historically active pairs); one each for
  DEC-20260409-C (the active row) and DEC-20260420-D (the earlier-created
  of two identically-titled rows).
- Seven resolution reports in `archive/sessions/`, one per collision.
  DEC-20260409-C's superseded twin and DEC-20260420-D's duplicate-titled
  later page are `documented_only`, both explained in their reports.
- `docs/decisions/id-collisions.yaml`: all seven collisions flipped to
  `resolved`; twelve rows given `disposition: formal_record` and a
  `record_key`; two rows given `disposition: documented_only` with a
  `rationale`.
- `docs/project/m2-closure-register.yaml`: the fourteen collision rows'
  `disposition`/`collision` block updated in place; twelve `formal_records`
  entries added; `counts.decision_rows.unresolved_collision` 47 → 33,
  `formally_migrated` 181 → 193, `resolved_collision` 2 → 4;
  `sources.formal_records.record_count` 188 → 200;
  `digests.public_rows.digest` and `digests.all_rows.digest` recomputed
  against the private projection at its recorded commit over `gh api` (no
  private-row content changed; `private_rows.*` and `scope_date_digest`
  are untouched); G2 gap text updated to name the seven newly resolved
  collisions and the remaining count (16 collisions, 33 rows).
- Relation edges: the Project Home tidy row names `DEC-20260406-B`'s
  Operating Manual sibling; the Gate 4 row names `DEC-20260409-A` and
  `DEC-20260409-B` from its own "RELATED:" line; the SA.2b/F-A-005/
  F-A-006-007/F-A-012/Option-C technical rows chain
  `related_to` edges through `DEC-20260420-A` and each other, following
  each row's own "Prior DECs" reference list (including the Option C
  row's collapsed "DEC-20260420-A through DEC-20260420-G" range, resolved
  to each collision's SA.2/F-A-series sibling specifically, since the
  range's own framing excludes the unrelated product-strategy siblings).
  `DEC-20260420-B` and `DEC-20260420-C` are named in several rows but have
  no formal record yet, so no edge targets them.

`DEC-20260420-H`'s two rows (Option C manifest-drift, and Strale
positioning and ICP) were read in full. Neither states the ToS-prohibited
social-platform-scraping rule that CLAUDE.md's `DEC-20260813-A` bullet and
the merged records `DEC-20260427-H.md`/`DEC-20260427-I.md` attribute to
the bare id `DEC-20260420-H`. The nearest export evidence of that rule's
actual substance is a different row entirely, `DEC-20260420-I` (itself an
unresolved collision id reserved for a later batch), whose own text
attributes a "direct connections only. No scraping" doctrine to
`DEC-20260420-H` and amends it, one step removed from `DEC-20260420-H`'s
own wording, which this export does not preserve under either row. Full
analysis in the `DEC-20260420-H` resolution report.

`docs/decisions/records/DEC-20260503-A.md` (an existing, merged, superseded
record) states its source page "extends... and refines DEC-20260420-E,
DEC-20260420-F, and DEC-20260420-H," withholding those edges as unresolved
collisions. All three collisions resolve in this batch, making that
sentence stale prose. `corrects_migration_state_in` stays `[]` on all three
reports: the binding is enforced against a hardcoded map in
`scripts/decision-records-lib.mjs` this batch cannot edit (`scripts/` is
out of scope), so the stale statement is documented in prose in each
report instead, following G2 batch 2's handling of the same constraint.

Notable contradictions surfaced in Consequences sections (verified against
`main` on 2026-09-05):

- All 342 manifests now declare `processes_personal_data` (127 also
  `personal_data_categories`); the `detectPersonalData` heuristic fallback
  the SA.2b row kept "during backfill" was removed after migration 0050
  per `apps/api/src/lib/audit-helpers.ts`'s own comment.
- F-A-005, F-A-006/007, and F-A-012 all shipped and remain the live
  mechanism in `apps/api/src/routes/transactions.ts`,
  `apps/api/src/lib/audit-token.ts`, `apps/api/src/routes/audit.ts`, and
  `apps/api/src/routes/verify.ts`, each still carrying the finding-numbered
  comments the rows describe.
- The Option C manifest-drift row's own deferred "Session 1 onboarding
  engine rewrite" was never reached; the 238-slug Class 4 drift it named
  as blocking SA.2b.c was instead resolved by the direct-SQL backfill path
  the row's own text already anticipated.
- Neither "Product architecture and first wedge," "Capability
  rationalization and site rebuild," nor "Entity resolution as priority
  engineering investment" exported any Rationale; their records state this
  honestly and cite the nearest dated evidence (the 2026-08-05 direction
  plan, `DEC-20260812-A`, `DEC-20260513-A`, `DEC-20260902-A`,
  `DEC-20260409-B`'s already-documented orphaned cross-validation module)
  as inference only, never as confirmation.
- `apps/` contains only `api`; no `apps/web` exists, consistent with
  `DEC-20260902-A` describing that rebuild as not yet begun.
- `docs/company/VOICE.md` (the current writing-rules authority) does not
  restate Rule E's specific "no em dashes" rule and its own second line
  contains an em dash.

Grep of every existing record and CLAUDE.md for all seven collided IDs
(rule 4 pre-check): `DEC-20260406-C`, `DEC-20260420-D`, `DEC-20260420-G`
are named nowhere. `DEC-20260409-C` is named twice in
`docs/decisions/records/DEC-20260409-D.md` (its own supersession source,
addressed in that collision's own resolution). `DEC-20260420-E`,
`DEC-20260420-F`, `DEC-20260420-H` are each named once, in the single
`DEC-20260503-A.md` sentence above. `DEC-20260406-E.md` (checked per this
batch's specific pre-check hint) does not in fact name `DEC-20260406-C`.

Gates run in this worktree: `node --test scripts/m2-closure-register.test.mjs
scripts/decision-records.test.mjs` (all pass), `npm run context:generate`
(twice, staging between), `npm run context:check` (no warnings),
`npm run context:test`, `npm run programs:check` (ok), `npm run codex:check`
(ok, unchanged backlog), `npm run receipts:check` (ok; pre-existing,
unrelated bare-test-count warnings only), `node apps/api/scripts/check-pii.mjs
--strict` (clean), `node apps/api/scripts/check-no-committed-secrets.mjs`
(clean), `node scripts/m2-closure-verify-private-rows.mjs` (ok, 318 rows
verified, 0 private next-batch candidates). See the PR body and the
session's final report for exact outcomes.

No changes to CLAUDE.md, AGENTS.md, `docs/programs/**`, apps/api source,
packages, manifests, config, design, the frontend checkout, or Notion.
Nothing merged.

Next: the remaining 16 collisions (33 rows) are open G2 work, batch 4
onward.
