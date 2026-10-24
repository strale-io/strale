Intent: Prepare, as a DRAFT that waits for Petter, the way-of-working review's step 2 (close T7 small) and step 3 (the AGENTS.md/CLAUDE.md contract cut).

# Draft: T7 close and the contract cut

Waits for Petter's confirmation of DEC-20261024-A items 2 (re-scope T7 small)
and 5 (the infrastructure window). Nothing here merges before that.

Step 2 (close T7 small), from m4/cutover onto a fresh branch from main:
- #665: the six `.claude/` starter-kit files archived, live rules kept.
- #679: repo-native end-session and vendor-switch flows (no Notion Journal or
  To-do step).
- #680: the daily digest reads the repository in production. It touches the
  `Dockerfile`, so DEC-20260504-C applies: after merge, check that the built
  image carries the COPY'd files and that the next digest renders the repo
  sections.
- #681: the weekly vendor-roster sweep is retargeted off Notion.
- T7 `next_action` and exits rewritten; T5's index exit notes the pre-commit
  regeneration.
- Not brought over: PR #682 / the b7 rescue (it made group-G checks blocking,
  and the cut retires them instead).

Step 3 (contract cut):
- `AGENTS.md` is canonical (150 lines: non-negotiables, reading map, session
  contract). `CLAUDE.md` is `@AGENTS.md` plus Claude-only notes (44 lines).
- Every protocol mirror in `docs/governance/protocols/` is now authoritative
  (verbatim bodies, checked). New files: `CROSS_REPO_UPDATES.md`,
  `CAPABILITIES_AND_QUALITY.md`, `REPORT_FILING.md`,
  `SUPERSEDING_DECISIONS.md`, and `docs/decisions/ACTIVE.md`.
- Pre-cut text archived verbatim in
  `archive/sessions/2026-10-24-entrypoints-before-contract-cut/`; the
  coverage walk in `archive/sessions/2026-10-24-contract-cut-coverage-walk.md`.
- `decisions:check` carved out; `protocols:*` retired;
  `claude-md-protocols.test.ts` now asserts the contract routes to every
  incident protocol.

Next batch after T7: carve the operator-actions validation out of
`project-context-lib.mjs` (an approval-boundary guard the review's group G
table missed), then retire `context:*`, the M2 closure register and the
inventory.
