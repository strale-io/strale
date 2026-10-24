# Design tokens

For the website brand, start at the [Open Flow design system](brand-kit/open-flow/README.md). It is the founder-chosen direction (BrandKit Lab kit 06, chosen 23 October 2026), adopted on 24 October 2026 by DEC-20261024-B and promoted into the `website` surface of `active.json`, which `apps/web` builds from. The [Quiet Material kit index](brand-kit/README.md) is history: superseded as the visual direction, kept unchanged.

Design values are data, not prose or hardcoded literals. This directory is
the source of truth for what every Strale surface looks like, what is being
considered, and how a candidate becomes production.

```
design/
  README.md                 this file
  tokens/
    schema.json              JSON Schema 2020-12 for every token file below
    active.json               what production runs today, per surface
    candidates/
      open-flow.json                status: adopted (DEC-20261024-B, 2026-10-24; the website surface)
      quiet-material-v0.7.json      status: proposed (historical; superseded as direction 2026-10-23)
      quiet-material-catalogue.json status: proposed (retained values; specimen geometry)
      codex-handoff-round-23.json   status: exploring
      quiet-material-refinement.json status: rejected (closed study)
      instrument.json              status: rejected
      fieldwork.json               status: rejected
  explorations/
    README.md                 convention for exploration folders
    2026-09-01-quiet-material-v0.7/README.md
  PROVENANCE.md              every historical direction, one status each
  brand-kit/open-flow/       adopted website design system: guide, generated tokens.css, contrast proof, specimen
  brand-kit/quiet-material/  historical Quiet Material register and specimen catalogue
  lint-allowlist.json        today's off-token literals in consumer code, ratcheted down
```

## What is active

The website runs [Open Flow](brand-kit/open-flow/README.md), adopted by
DEC-20261024-B. Its candidate file (`design/tokens/candidates/open-flow.json`,
status `adopted`) still generates the kit's `tokens.css`, WCAG proof and
specimen, and `build.mjs --check` fails if it ever differs from the `website`
surface below. The earlier Quiet Material register
([atmosphere/surface register](brand-kit/quiet-material/README.md)) is history.

`design/tokens/active.json` has one entry per production surface under
`surfaces`. Today there are two:

- **`internal-reports`** — the CEO dashboard, weekly digest, and interrupt
  emails. Adopted by `DEC-20260815-A` (2026-08-15). Builds into
  `apps/api/scripts/lib/design-tokens.generated.ts` via
  `scripts/generate-design-tokens.mjs`; `apps/api/scripts/lib/design-system.ts`
  imports it and is the only file the three consumers (`ceo-dashboard.ts`,
  `digest-formatter.ts`, `interrupt-sender.ts`) touch. Human-readable
  companion: `docs/company/DESIGN-SYSTEM.md`.
- **`website`** — the redesign in `apps/web` (DEC-20260902-A). Adopted by
  `DEC-20261024-B` (2026-10-24): the Open Flow values, verbatim from the
  adopted candidate. Builds into `apps/web/src/styles/tokens.generated.css`
  via `scripts/generate-web-tokens.mjs` (`npm run design:web-tokens`), using
  the same renderer as the kit's `tokens.css`. strale.dev itself still serves
  `strale-frontend` and its dark Inter theme until the founder-reserved
  public cutover; the snapshot this block held until 24 October 2026 is in
  git history and `design/PROVENANCE.md`.

Every surface carries `provenance` (the source file, and the commit for a
cross-repo capture) and `adopted_by` / `adopted_at` (the decision that made
it live, or `"unrecorded"`).

## What is a candidate

`design/tokens/candidates/*.json` are directions under consideration. Each
carries its own `status`: `exploring` → `proposed` → `adopted` (at which
point it stops being a candidate and its values move into `active.json`) or
`rejected`. See `design/PROVENANCE.md` for the full status of every
direction this platform has tried, and each candidate file's `provenance`
for exactly what it was extracted from.

## How to propose a direction

1. Do the exploratory work wherever it naturally lives (a design tool, a
   preserved folder, a handoff document) and write a
   `design/explorations/<date>-<name>/README.md` pointing at it, with a
   `status`. See `design/explorations/README.md` for the convention.
2. When it's worth weighing against what's live, extract its values into
   `design/tokens/candidates/<name>.json` against `design/tokens/schema.json`,
   with `status: proposed` and `provenance` pointing back at the
   exploration.
3. Promotion is a decision record plus a file swap — never an edit to
   `active.json` values in place. The decision record names the surface and
   the candidate; the same commit updates that surface's block in
   `active.json` (values, `provenance`, and `adopted_by` set to the
   decision id) and flips the candidate's `status` to `adopted`.
4. If a value the tokens don't yet have is needed anywhere along the way —
   add the token first, in the schema and the relevant file. Never reach for
   a literal because the token set doesn't happen to have what's wanted yet;
   that literal is exactly what `npm run design:check` exists to catch.

## The checker

`npm run design:check` (`--json` for machine output) and its test suite
`npm run design:test` both run in CI, after `research:test`. They fail on:

- a token file that doesn't validate against `schema.json`;
- more than one active file, or a candidate whose `status` isn't one of
  `exploring | proposed | adopted | rejected`;
- `active.json` differing from `origin/main` with no surface's `adopted_by`
  also different — promotion without a decision. (This PR creates the file,
  so "absent on `origin/main`" is treated as a pass, not a diff.)
- the generated file (`apps/api/scripts/lib/design-tokens.generated.ts`)
  being stale against `active.json`'s `internal-reports` surface;
- a hardcoded six-digit hex color, `rgb(`/`hsl(` literal, raw
  `font-family:`, or an off-scale margin/padding/gap/border-radius px value
  in the three HTML/CSS-emitting consumers
  (`apps/api/scripts/ceo-dashboard.ts`, `apps/api/src/lib/digest-formatter.ts`,
  `apps/api/src/lib/interrupt-sender.ts`) — unless the exact literal is
  listed in `design/lint-allowlist.json`. That allowlist is a ratchet: it
  can only shrink. A previously-listed literal that no longer appears
  anywhere in its file also fails the check, so the allowlist can't rot
  into pointing at fixed code while hiding a real new violation behind it.
  `design-system.ts` and the generated file are the token source and are
  exempt — that is where a literal is supposed to live.
- for `apps/web`: every source file (`.astro` included) is linted the same
  way, judged against the `website` surface's spacing and radii, with the
  generated token file exempt. On top of that, `scripts/web-design-lib.mjs`
  applies the Open Flow specimen lint to the site's styles (`.css`,
  `<style>` blocks, literal `style=""`): no hex, no px/rem/ms lengths, no
  colour functions or named colours, no raw font stacks, no unknown tokens,
  min-width media queries on token breakpoints only. A stale or missing
  `tokens.generated.css` fails too. `font-family: var(--token)` is on-token
  everywhere.

See `apps/api/scripts/lib/design-tokens.generated.ts`'s own header and
`scripts/design-lib.mjs` for exactly what each check does.
