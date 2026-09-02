---
doc_type: session-plan
authority_scope: none
status: executed
superseded_notes: handoff disposition corrected to archive after review; see Corrections
complete: true
phase: M2
authority_active: false
created_at: 2026-09-02
owners:
  - claude-code
review_route: author-self-verification-plus-fresh-codex-review
---

# T1 — M2 closure audit: stored plan

> Execution record for track T1 of the CTO-readiness program
> (`docs/programs/cto-readiness/tracks.yaml`). Not project truth.

## Scope

Produce the M2 closure disposition register named by the migration plan's
2026-09-02 continuation checkpoint, leaving the M1 bare inventory contract
untouched.

## Files

- `docs/project/m2-closure-register.yaml` — authored register.
- `docs/project/schemas/m2-closure-register.schema.json` — field shapes.
- `scripts/m2-closure-register-lib.mjs` — cross-row and filesystem checks.
- `scripts/m2-closure-register.test.mjs` — discriminating tests.
- `scripts/check-project-context.mjs`, `package.json` — wiring into
  `context:check` (warning mode) and `context:test`.

## Method

1. Enumerate the Decision universe from the private preservation archive
   (`strale-io/strale-context-archive@24713c48`, four `decisions-rows*.json`
   pages, 318 rows, 278 distinct IDs, 5 empty IDs). Only identity fields are
   carried into the register: page id, ID, title, status, scope, date.
2. Derive dispositions mechanically where the evidence is mechanical: a row is
   `formally_migrated` only if a formal record has the same historical ID and
   cites the row's page id; collision rows follow the registry's own status;
   superseded-in-source rows without a record are `obsolete_or_superseded`;
   empty-ID rows are `unclear`; everything else is `not_yet_reconciled`.
   Two hand dispositions carry cited evidence: `DEC-20260517-B`
   (intentionally historical) and `DEC-20260422-A` (cross-surface collision).
3. Classify the 15 inventory entries from the plan's section 9 migration map,
   with a `progress` field so "target treatment" and "how far along" are not
   conflated. `handoff/` is `unclear` because the plan does not specify it.
4. Reconcile every forward-looking sentence in the plan against merged PRs.
5. List exit gaps and choose the next batch by a rule the validator enforces:
   unique, collision-free, historically active, most recent.

## Exit test

- `npm run context:check -- --json` returns zero findings with the register
  present.
- `npm run context:test` passes, including the register suite whose tests, apart from one labelled positive smoke test, each mutate
  the valid register and assert a specific finding code.
- Counts in the register equal the counts a reader can recompute from its rows.

## Corrections after review

- Step 3 and the last bullet below recorded `handoff/` as unclear. Independent
  review pointed at the migration map's row "Existing handoffs: promote
  remaining current truth, then archive"; the register classifies it as
  `archive`. The text above is left as written because this file is an
  executed plan, not the register.

## Out of scope

- Resolving any collision, migrating any Decision content, or editing any
  protected record.
- M3 work, Notion changes, production changes.
- Deciding the `handoff/` disposition; it is recorded as unclear.
