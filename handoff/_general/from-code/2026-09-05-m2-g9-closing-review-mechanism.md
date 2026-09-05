Intent: land the G9 stage-1 closing-review mechanism so the M2 closure
register validator can see a real closing review once one happens, without
recording one or closing anything.

## What this session did

Gap G9 (`plan.review_route`) requires an unconditional gap AND a blocking
gap while open, which makes the M2 exit gate unreachable until a closing
review is actually recorded and seen. This PR adds an optional
`closing_review` block to the register's schema and the machinery in
`scripts/m2-closure-register-lib.mjs` to validate it, so a future stage can
record a real review and have the blocking requirement release cleanly. This
PR itself adds no `closing_review` block to the live register and changes no
disposition.

## Changes

- `docs/project/schemas/m2-closure-register.schema.json`: optional top-level
  `closing_review` object (`route`, `commit`, `verdict` const `PASS`,
  `reviewed_at`, `evidence`, `candidate_set` with three integer counts). Not
  in the top-level `required` array.
- `scripts/m2-closure-register-lib.mjs`:
  - New pure helpers `changedPathsBetween`, `readRegisterAtCommit`, plus a
    key-order-insensitive deep-equal and a strip helper for the staleness
    comparison.
  - `buildContext` now also loads `docs/programs/codex-review-backlog.yaml`
    (optional, `null` when absent, same pattern as `tracks`) and exposes
    `changedPathsBetween` / `registerAtCommit` closures.
  - A new validation block (placed before the exit-gaps section so its
    result is available to the blocking check) validates a present
    `closing_review`: route consistency, commit ancestry, evidence content,
    staleness (both a path-scoped git diff and a full register comparison
    with `closing_review`, the `plan.review_route`-covering gap, and
    `counts.exit_gaps` stripped from both sides), and candidate-set counts.
  - The `plan.review_route` blocking check (`EXIT_GAP_NOT_BLOCKING`) is now
    skipped when `closing_review` is present and produced zero
    `CLOSING_REVIEW_*` findings. `EXIT_GAP_UNCOVERED` for that bucket stays
    unconditional.
  - Merge-base immutability (`CLOSING_REVIEW_MUTATED`) added next to the
    register's other base-immutability checks: once `closing_review` exists
    on the base, `commit`/`verdict`/`reviewed_at`/`evidence` may not change
    and the block may not be removed.
- `docs/decisions/README.md`: short paragraph documenting the mechanism.
- `scripts/m2-closure-register.test.mjs`: nine new tests (one positive
  fixture, one per finding code, one for the "present but not clean" case).
  Full detail and the disable-and-confirm proof for each code are in the PR
  body.

## Verification

`npm run archive:index`, `npm run context:generate` (twice), `npm run
context:check` (zero findings on the live register), `npm run context:test`,
`node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs`,
`npm run programs:check`, `npm run codex:check`, `npm run receipts:check`,
`node apps/api/scripts/check-pii.mjs --strict` all pass (receipts:check's
nine `HANDOFF_BARE_TEST_COUNT` warnings are pre-existing and unrelated).

## What this is not

Stage 2 (a future session) records the actual closing review: a real
`archive/sessions/*.md` verdict file, a real `closing_review` block on the
register, and the resulting release of the `plan.review_route` blocking gap
on the live register. This PR touches no file under `docs/programs`,
`docs/project/m2-closure-register.yaml`, `docs/decisions/records`, or
`CLAUDE.md`.
