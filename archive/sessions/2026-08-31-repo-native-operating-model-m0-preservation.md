# M0 preservation evidence — repo-native operating-model migration

Date: 2026-08-31
Milestone: M0 (preserve before cleanup)
Status: incomplete — Claude review found Notion pagination gap; quota-blocked

## Frontend redesign working state

- Working copy: `C:/Users/pette/Projects/strale-frontend-codex-homepage-a`
- Remote branch: `origin/codex/homepage-redesign-batch-a`
- Initial preservation commit: `9f5eaf78086279a2def14a44dd1f2a7da9a9225b`
- Follow-up preservation commit: `998964716c8601be67d4e71a508a803160434517`
- Local and remote refs were verified equal after push.
- The initial checkpoint was verified clean. The owning frontend session then
  continued work. The follow-up commit captured three files Claude found, and
  the 28 remaining modified/untracked files at that cutoff were copied and
  hashed under `archive/imports/design/2026-08-31/frontend-live-delta-after-9989647/`.
- The commit includes the previously untracked Homepage V2 implementation,
  design-system material, public assets, generated visual artifacts, and the
  preservation checkpoint note.

This commit is a preservation checkpoint only. It is not design approval,
implementation acceptance, permission to merge, permission to deploy, or
approval of any public claim.

## Non-Git design evidence

The following sources were copied byte-for-byte into
`archive/imports/design/2026-08-31/`:

- `C:/Users/pette/Projects/strale-website-design-handoff-2026-08-25`
- `C:/Users/pette/Projects/brandkit-lab-strale-design/experiments/strale-website`

The import contains 56 source files totalling 41,890,178 bytes. The manifest
records source path, archived path, byte size, and SHA-256 digest. A full
post-copy verification reported zero missing, size-mismatched, or hash-
mismatched files.

## Notion and migration-input evidence

The project-memory databases, section pages, strategy/state candidates, active
runtime dependencies, and recent website-design records were exported without
mutating Notion to `archive/imports/notion/2026-08-31/`. Targeted searches and
duplicate titles are preserved as reconciliation evidence rather than silently
resolved during M0.

The user-supplied context pack is preserved both as its original ZIP and as an
expanded, hashed evidence set under `archive/imports/context-pack/2026-08-31/`.

Active Notion consumers and their planned repo-native replacements are recorded
in `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md`.

## Claude milestone review

Claude Code returned `PASS_WITH_FOLLOWUPS`. It independently confirmed the
decision boundary, absence of accidental design acceptance/merge/deploy, ID
collision check, original design-source hashes, and context-pack hashes. It
correctly found that four Notion row exports were truncated at 100 rows, three
required pages were absent, two workflow consumers were under-specified, and
the frontend session had continued after the clean checkpoint.

The three pages, two consumer mappings, frontend follow-up commit/snapshot, and
credential-name documentation mismatch were corrected. The row-pagination gap
remains open because the Notion workspace query quota is exhausted across both
Codex and Claude Code.

## Remaining M0 work

- Complete full pagination for Decisions, Journal, To-do, and Vendor Roster
  after the Notion query quota resets, or ingest a full Notion UI/workspace
  export supplied from an authenticated session.
- Regenerate the Notion hash manifest and obtain a focused Claude PASS.
