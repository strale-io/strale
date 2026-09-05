Intent: make every `scripts/m2-closure-register.test.mjs` fixture that locates a
live `unresolved_collision` / notion-duplicate row instead plant its own
synthetic one, so G2 draining the live bucket to zero (the same class of
break `not_yet_reconciled` hit at batch 18) does not throw or pass any
fixture vacuously. `scripts/m2-closure-register-lib.mjs` is unchanged.

Work done:

- Added `withSyntheticCollision(register, context)` to
  `scripts/m2-closure-register.test.mjs`: plants two public `decision_rows`
  entries (fresh `sha256`-derived 32-hex page ids, a fresh
  `DEC-99990101-NN` id) with disposition `unresolved_collision` /
  `collision.kind: notion-duplicate`, a matching entry in a copied
  `context.collisions` (two `records`, `resolution_status: unresolved`,
  per-record `disposition: unresolved`), `sources.collision_registry`
  counts bumped, `context.public` extended so the planted identities pass
  the public-boundary check, and counts/digest resynced via the file's
  existing `resync()` helper. Each call plants a fresh id/page-id pair
  (module-level sequence counter) so multiple calls in one test never
  collide with each other.
- Added `pcodesWith(register, rows, ctx)`, the private-projection analogue
  of the existing `pcodes` helper, for the one fixture that needs a
  synthetic collision inside `validatePrivateProjection`.
- Rewrote every fixture that searched the live register for an
  `unresolved_collision` / notion-duplicate row to use
  `withSyntheticCollision` instead: "blocking is derived", "collision rows
  must agree with the collision registry" (four sub-cases), "collision
  payloads are validated wherever they appear and forbidden elsewhere"
  (the registry-row-stripped-of-its-payload sub-case), "private rows whose
  identities are already public...", "evidence must be
  disposition-specific...", "a cross-surface collision must not be a
  registry row...", "the next batch cutoff is anchored..." (the
  NEXT_BATCH_COLLIDES sub-case), and "every open bucket must be covered by
  an exit gap" (the two fixtures adapted in PR #551 for the same reason,
  now sourcing the open bucket from the synthetic row). Each rewrite keeps
  the exact rule it plants; see the PR body for the finding code each one
  still fires.
- `scripts/decision-records.test.mjs`: checked for the same dependency;
  none found (its collision-registry fixtures already build fully
  self-contained synthetic registries).

Proof run in this worktree:

- `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs` against the live register: exit 0.
- The same two files against a throwaway in-memory-derived copy of the
  live register and collision registry with every `unresolved_collision`
  row flipped to `resolved_collision` (simulating G2's end state), run via
  a temporary script deleted before this handoff (never a committed edit
  to the tracked register or collision registry -- `git status` confirmed
  clean before and after): every fixture this change touches still passes,
  and still fails on its planted mutation; the one incidental failure is
  `decision-records.test.mjs`'s own repository-wide immutability smoke
  test, which independently validates every *resolved* collision's
  authored resolution-evidence report against a strict front-matter
  contract -- expected, since the throwaway script fabricates 23
  resolutions with no real evidence report (a real G2 batch authors one
  report per collision), and unrelated to the fixtures this change
  targets.
- `npm run context:check`, `npm run context:test`, `npm run
  receipts:check`: all exit 0. `receipts:check` prints its pre-existing
  7 `HANDOFF_BARE_TEST_COUNT` warnings from older handoffs, unrelated to
  this change (warnings do not fail the check).

No changes to CLAUDE.md, AGENTS.md, `docs/programs/**`, apps/api source,
packages, manifests, config, design, or Notion. The register and the
collision registry on disk are untouched by this change; only the test
file was edited.

Next: none opened by this session. G2 continues draining the live
`unresolved_collision` bucket in its own batches; this change means those
batches no longer need to touch `scripts/m2-closure-register.test.mjs`.
