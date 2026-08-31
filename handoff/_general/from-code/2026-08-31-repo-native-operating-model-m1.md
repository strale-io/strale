Intent: Land the bounded M1 repo-native project-context foundation after the
Notion preservation milestone completed, while preserving every existing
authority boundary.

## Outcome

- Added the bounded M1 project-context foundation: inert document skeletons,
  schemas, a bare legacy-authority inventory, deterministic generation, and a
  warning-only checker.
- Left `AGENTS.md`, `CLAUDE.md`, hooks, CI, skills, commands, and all existing
  authoritative documents unchanged.
- Completed M0 first: the private archive now has terminal-page and source-count
  parity for Decisions, Journal, To-do, and Vendor Roster, sanitized history,
  and an independent Claude `PASS`.
- Extracted M1 onto a clean branch from current `origin/main`, excluding all raw
  archive/design/context-pack material, Railway configuration, production-write
  guard changes, root entrypoint activation, hooks, CI, skills, and commands.
- Verified the context tests (6/6), deterministic regeneration, and a negative
  dependency scan showing that existing consumers do not depend on the new
  foundation.
- Independent Claude review of the clean extraction returned `PASS`, with zero
  high, medium, or low findings and `SAFE_TO_OPEN_AND_MERGE_PR: YES`.
- PR #447 passed all GitHub checks and was squash-merged to `main` at
  `072b54a38ad8c6c68a82628c5031721f219f481e`.

## Open

- M2 truth reconciliation is now the next milestone. Every authority-changing
  or cutover action remains blocked until the separate product/decision audit
  is available, M2 is reconciled, and Claude gives a fresh milestone verdict.
- The Railway environment-variable documentation mismatch is a real but
  unrelated docs fix; handle it in a separate follow-up rather than widening
  M1.
- The production-write guard changes from the staging branch only supported
  excluded context-pack evidence. They are intentionally not part of M1 and
  should be reconsidered only if that evidence is proposed for the public repo.
- `[BACKFILL]` Create the matching Notion Journal session entry if the retired
  workspace remains available. No Notion mutation was attempted here.

## Non-obvious learnings

- The legacy-reference scan must exclude the new foundation and its generator
  code so staging the generated files cannot make the inventory self-referential.
- Review and handoff evidence can legitimately change detected legacy-reference
  lists; regenerate and restage the inventory after adding such evidence.
- A fresh isolated worktree must build `packages/mcp-server` before the API
  typecheck or `src/routes/mcp.ts` reports phantom missing-module errors.

## Cost

No metered API spend. Codex and Claude review used subscription-included routes.
