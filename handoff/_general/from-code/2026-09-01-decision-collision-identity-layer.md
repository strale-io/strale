Intent: Make duplicate historical decision IDs safely representable in the inactive repo-native decision graph, starting with the `DEC-20260502-A` collision, without rewriting history or activating repo authority.

## Shipped

- Merged PR #455 at `42b66bb17583896aa30f52dd81d0f1505c8dfebc`.
- Added a stable internal `record_key` distinct from the historical display
  `id`; existing unambiguous records use `record_key == id`.
- Upgraded the collision registry to schema v2 with immutable Notion page
  identity and explicit unresolved/formal/documented-only dispositions.
- Added deterministic source-qualified key rules, bidirectional mapping,
  bare-collided-ID rejection, global source uniqueness, case-folded filename
  uniqueness, length limits, and merge-base immutability.
- Added founder-readable generated index columns for historical IDs and
  internal record keys.
- Saved the agent-agreed implementation plan at
  `archive/sessions/2026-09-01-decision-collision-identity-plan.md`.

## Verification

- Project-context and decision tests: 53/53 passed.
- Project-context checker: no warnings / zero repository findings.
- MCP package build, API typecheck, and whitespace checks passed.
- Initial exact-commit Codex review found stale generated inventory and
  missing qualified-key/removal regressions; both were fixed.
- Corrected-tip Codex review: PASS.
- Claude Sonnet cross-provider review: PASS (Opus was attempted first but hung
  in a read-only shell batch).
- GitHub `check` and `integration-db` jobs passed before merge.

## Open

- All 35 collisions and 71 source rows intentionally remain unresolved.
- `DEC-20260502-A` resolution is the next semantic milestone. It must update
  the protected historical narrative atomically before importing the active
  x402 row or assigning the superseded product row a documented-only status.
- Do not invent a replacement historical decision ID and do not target the
  bare collided ID from a relationship.

## Non-obvious learnings

- Importing only the active x402 row now would make the protected readiness
  record's statement that both colliding rows are withheld inaccurate.
- Generated inventories must be regenerated after a new reference-bearing
  file becomes tracked; generating while it is still untracked misses it.
- Source-page identity must be unique across the entire registry, not only
  within one collision group.
- The first app-created verification tasks never became tasks; their detached
  worktrees were unregistered and left only empty Windows-locked directories.
  All actual Claude and Codex verification sessions were closed on verdict.

## Cost

No paid vendor calls or metered API spend. Work used subscription-included
Codex and Claude sessions plus GitHub Actions.
