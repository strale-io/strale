# M0 preservation evidence — repo-native operating-model migration

Date: 2026-08-31
Milestone: M0 (preserve before cleanup)
Status: incomplete — Decisions and Vendor Roster reached terminal capture pages;
Journal and To-do pagination plus all source-count checks remain quota-blocked

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
mutating Notion to the private repository
`strale-io/strale-context-archive:archive/imports/notion/2026-08-31/`. Targeted
searches and duplicate titles are preserved as reconciliation evidence rather
than silently resolved during M0.

The repo-side export is sanitized evidence, not a secret backup. Push protection
identified three live-secret occurrences representing two distinct provider
credentials in Journal page 2; those occurrences were replaced with a
documented marker before the commit reached the remote. The founder deferred
rotation after reachability checks and independent review; the documented
immediate-rotation triggers remain in force.

The code repository is public. The founder approved a private companion
repository for raw project-memory evidence and reconstruction of the affected
public migration branch. The sanitized private archive was pushed first; the
public tree retains only the non-sensitive status pointer.

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
credential-name documentation mismatch were corrected.

The connector allowance later returned for 10 successful queries. Decisions
reached a short terminal page after 318 unique rows and Vendor Roster after 166.
These are capture-complete candidates, not source-complete claims: the SQL used
unordered `OFFSET`, so each still requires a source-side `COUNT(*)` parity check.
Journal now has 400 rows preserved and resumes at offset 400; To-do has 300 rows
preserved and resumes at offset 300. Page files, row counts, offsets, endpoint
IDs, and hashes are recorded in the private archive's
`archive/imports/notion/2026-08-31/pagination-state.json`. The allowance then
returned `usage_limit_reached` again, so the M0 gate remains open. The public
mirror of that gate is `docs/project/private-archive-status.json`.

## Remaining M0 work

- Resume Journal at offset 400 and To-do at offset 300 after the next Notion
  query reset. Continue until each returns fewer than 100 rows.
- Run `SELECT COUNT(*)` for all four sources and require equality with each
  captured unique-ID total before marking any source complete.
- Regenerate the Notion hash manifest and obtain a focused Claude PASS.
- Rotation of the two distinct credentials is deferred by the founder because
  the rejected commit and blob were never publicly reachable. Rotate immediately
  on unrecognized use, a provider alert, or any accidental publication.
- Git branch and tag cleanup is complete: the approved
  `codex/repo-native-operating-model` branch has a verified raw-export-removal
  checkpoint at `37f8e76a`, the sibling `codex/repo-native-foundation-m1` branch
  was deleted with an exact lease, and all 42 current branches plus 5 tags
  contain zero raw Notion paths.
- GitHub-retained PR, cache, and fork-network objects remain pending under open
  sensitive-data removal ticket
  [#4715462](https://support.github.com/ticket/personal/0/4715462).
