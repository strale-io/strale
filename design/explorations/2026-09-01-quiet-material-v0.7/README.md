---
status: proposed
supersedes: null
superseded_by: null
---

# Quiet Material v0.7

Found 2026-09-01 21:38 as an unversioned local folder
(`C:\Users\pette\Projects\Strale-website-design-system-2026-09-01-213316`,
outside any repo, no git ref, no build or deployment evidence). Preserved
2026-09-02 into `strale-frontend` under track T11 (website repo hygiene):
391 of its 669 files (Markdown, CSS, JSON, TypeScript, HTML, scripts) copied
unchanged to
`strale-frontend/design/candidates/quiet-material-v0.7/`, with the full
folder — including the 259 PNG / 12 SVG / 4 WebP / 1 ICO assets and a Python
logo build script this text-only preservation excludes — attached byte-for-byte
as the `strale-io/strale-frontend` release tag `preserve-2026-09-02`
(`SHA256SUMS.txt` alongside the preserved text files verifies the copy).

**What it is.** The marketing-website design system the source folder's own
`docs/website-redesign/CURRENT-DESIGN-SYSTEM.md` calls canonical, plus
Homepage v2 material and a drift guard
(`scripts/check-homepage-design-system-drift.mjs`). The source folder's
top-level `README.md` (kept as `README.source.md` in the preserved copy)
still names v0.5 as canonical — the folder disagrees with itself about its
own version; `CURRENT-DESIGN-SYSTEM.md` is the more specific and more
recently-touched claim, so v0.7 is treated as the live name here.

**What it is not.** Not what production runs. Production (`strale-frontend`
`main`) runs the dark HSL theme in `src/index.css` / `tailwind.config.ts` —
captured as the `website` surface in `design/tokens/active.json` in this
repo. This exploration becomes active only through the normal promotion
path: a decision record plus an `active.json` swap with a matching
`adopted_by`, never by editing production values in place.

## Where the material lives

- Preserved text sources: `strale-frontend/design/candidates/quiet-material-v0.7/`
  (that folder's own `README.md` has the full preservation record).
- Full byte-for-byte archive: the `preserve-2026-09-02` release on
  `strale-io/strale-frontend`.
- Token extraction for this repo's promotion pipeline:
  `design/tokens/candidates/quiet-material-v0.7.json`.

## Status

`proposed` — preserved and reviewable, not yet compared against the
Codex handoff round 23 candidate or promoted. See `design/PROVENANCE.md`
for how this sits next to the other historical directions, and
`docs/project/ROADMAP.md` section 7 for the plan to reconcile it against
`main` and Homepage v2 before any promotion decision.
