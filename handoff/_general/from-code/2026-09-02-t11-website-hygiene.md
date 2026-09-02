Intent: preserve every piece of website design material that lived outside git on the founder's machine, sweep the frontend repository, install the session-end gate there, and record the founder's direction that the redesign is built inside this repository (track T11).

## What landed (frontend side, strale-io/strale-frontend)

- Orphan folders measured against the repository's object store without
  touching them: `codex-how-process-field` identical to its branch;
  `codex-homepage-a` (70 unique paths) and `website-redesign` (364) preserved
  as tags `archive/rescue-2026-09-02/*`.
- Branches: two merged PRs deleted at their tips (#1, #14); closed PR #2
  tagged and deleted; nine `rescue/wip-*` branches converted to
  `archive/branches/*` tags. Left: `main`, three Codex work branches, PR #5.
- Release `preserve-2026-09-02`: Quiet Material v0.7 folder zip (134 MB) and
  the Codex handoff zip (53 MB) with `SHA256SUMS.txt`. Text sources tracked in
  `design/candidates/quiet-material-v0.7/` (status candidate) and
  `docs/handoffs/2026-08-23-codex-website-handoff-v2/` (status historical).
- Session-end gate installed (same scripts as here), website register
  `docs/programs/website/tracks.yaml`, CI runs the gate tests.
- The archive repository's finished M0 worktree removed and its landed branch
  deleted.

## This repository

- Register: T11 active (T4 queued until T11 closes); ROADMAP section 7 carries
  the direction. A formal record was drafted and withdrawn from this PR:
  adding a repo-native record outside the M2 closure path trips the closure
  register (FORMAL_RECORD_MISSING, SOURCE_COUNT_DRIFT), so DEC-20260902-A is
  filed through that path once Petter confirms the draft below.
- Founder direction: the website redesign is built as `apps/web` here
  (monorepo); preserve first, then build; `strale-frontend` swept and kept
  until cutover.

## Draft decision text (DEC-20260902-A, for Petter's confirmation)

**Decision.** When the website redesign is built, it is built inside
`strale-io/strale` as `apps/web`, so that repository becomes the monorepo
for API, packages and website. `strale-frontend` is preserved and swept,
not extended: no new website work starts there after 2026-09-02, and it is
retired once the `apps/web` site serves production. Preserve first, then
build; the current site is not migrated mid-redesign.

**Rationale.** One repository gives one design-token source, one CI, one
session-end gate, atomic changes across API and site, and an in-repo
backend–frontend contract check instead of a cross-repo job that never
runs. Known costs: the site source becomes part of a public repository (a
secrets scan precedes the move) and the Cloudflare Pages build must point
at `apps/web` with the root lockfile.

**Reversal.** A new record if Cloudflare Pages cannot build from a
subdirectory of the monorepo, or if the site source holds material that
must stay private.

## Open

- Delete the five folders and the zip from the machine once the frontend PR
  is merged and the release checksums are verified (T11 next action).
- `cleanup/freetiershowcase-polish` (PR #5, open since May) needs a verdict.
- File DEC-20260902-A (Notion Decisions DB entry + closure-register row) when
  Petter confirms the draft above.
