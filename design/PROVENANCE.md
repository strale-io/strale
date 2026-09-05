# Design provenance

Every direction Strale's design has taken, live or historical, with one
status each. This is the history section `docs/company/DESIGN-SYSTEM.md`
used to carry — it moved here so that page could stay one page about what
production runs today. See `design/README.md` for the mechanism (tokens as
data, candidates, promotion) this record feeds.

Status values: `adopted` (a decision record made it what a surface runs),
`unrecorded` (running in production, but no decision record ever adopted
it), `superseded` (replaced by a later direction in the same lineage),
`proposed` (preserved and candidate, not yet promoted), `exploring` (under
active review, earlier than proposed), `rejected` (closed without adoption;
preserved as history, excluded from implementation).

## Instrument and Fieldwork — rejected, 2026-09-05

The founder rejected these alternatives and clarified that the existing Quiet Material redesign should be retained and its system completed. [Preserved concepts](explorations/2026-09-05-brand-directions/README.md) are historical evidence, not implementation inputs. The candidate token records are rejected. Resume at the [system completion plan](../docs/programs/brand-website/SYSTEM-COMPLETION.md). No existing runtime token or artwork was changed.

## Internal reports — `adopted`, 2026-08-15

Light-mode operational SaaS: white cards on a soft grey ground, one accent
(`#2563EB`), system font, tabular numbers. Locked by DEC-20260815-A the day
the operating charter shipped. Token source:
`apps/api/scripts/lib/design-system.ts`; captured as the `internal-reports`
surface in `design/tokens/active.json`. Direction rationale (single-theme,
because the audience is one founder reading daily in daylight) is in
`docs/company/DESIGN-SYSTEM.md`.

## Website dark Inter theme — `unrecorded`, running since before this
discipline existed

Dark HSL-variable theme, Inter + JetBrains Mono, `strale-frontend`
`src/index.css` + `tailwind.config.ts`. Serves `strale.dev` on `main` today
— this is what a visitor actually sees. No decision record ever adopted it;
it accreted through ordinary frontend commits before design values were
treated as a decision surface. Captured as the `website` surface in
`design/tokens/active.json` with `adopted_by: "unrecorded"` rather than
backfilling a decision id that never existed. The 2026-09-02 survey that
produced this track found 28 hex literals and 325 arbitrary Tailwind values
in `strale-frontend` source outside the token file — out of scope for this
track (see `design/README.md` "Out of scope"); they move with the site into
`apps/web` per `docs/project/ROADMAP.md` section 7, where the same lint
applies.

## Frontend `design-system/` draft v1 — `superseded`, 2026-04-15

An earlier `strale-frontend` `design-system/` directory draft, dated
2026-04-15 by its own commit history, predating both preserved candidates
below. Superseded by Quiet Material's own lineage (v0.5, then v0.7) inside
the frontend repo well before this track existed to record it formally;
recorded here for completeness of the lineage, not because any file from it
survives as a live candidate.

## Quiet Material v0.5 — `superseded` by v0.7

The version the source folder's own top-level `README.md` still names as
canonical, even though its more specific and more recently touched
`docs/website-redesign/CURRENT-DESIGN-SYSTEM.md` names v0.7. Treated as
superseded here on that basis — the folder disagrees with itself, and the
later, more specific document wins. No separate v0.5 token file exists in
`design/tokens/candidates/`; it is recorded as a lineage step only.

## Quiet Material v0.7 — `proposed`

Found 2026-09-01 as an unversioned local folder with no git ref, build, or
deployment evidence; preserved 2026-09-02 into `strale-frontend`
(`design/candidates/quiet-material-v0.7/`, release tag
`preserve-2026-09-02`) under track T11. Light theme, material-driven
surfaces (image-backed atmosphere tokens, soft gradients) rather than flat
fills. Candidate token file: `design/tokens/candidates/quiet-material-v0.7.json`.
Exploration record: `design/explorations/2026-09-01-quiet-material-v0.7/README.md`.
Not yet compared against the website's live theme or the Codex handoff
round-23 candidate; not promoted.

## Codex handoff round 23 — `exploring`

A design-system delta proposed alongside round-23 homepage copy and
strategy (`strale-frontend`
`docs/handoffs/2026-08-23-codex-website-handoff-v2/05_DESIGN_SYSTEM_DELTA.md`,
`06_TYPOGRAPHY_SPEC.md`). Frames itself as a revision of the existing
system rather than a replacement: keeps Instrument Sans + IBM Plex Mono,
narrows Strale Blue (`#275DFF`) from a default selected-state color to an
identity/focus accent, adds a restrained "mineral" selection family, tightens
marketing section rhythm (160/112/104/80 to 120/104/88/64), and retires the
old atmospheric-imagery-per-narrative-chapter system. Its own status line
("decision-complete for Codex handoff") is a spec-authoring status, not a
promotion status — it has not been evaluated against the live `website`
surface or against Quiet Material v0.7 as a design-tokens candidate, so it
is `exploring` here regardless of what its source document calls itself.
Candidate token file: `design/tokens/candidates/codex-handoff-round-23.json`.
No `design/explorations/` entry exists for it — the source document is
already a self-contained spec, unlike Quiet Material's dated folder, so
there was nothing further to preserve before extracting the token subset.

## 5 September 2026: Quiet Material refinement — `rejected` (closed study)

DEC-20260905-A adopts the positioning, not the visual identity. The [preserved study](explorations/2026-09-05-quiet-material-refinement/README.md) tested retained Quiet Material assets through website, social and PDF applications. It is now closed without adoption following the founder's correction to retain the original redesign and audit its system. Its token and authoring records are rejected as implementation inputs; this does not reject Quiet Material v0.7 or its original assets. Resume at the [system completion plan](../docs/programs/brand-website/SYSTEM-COMPLETION.md).
