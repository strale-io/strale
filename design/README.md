# Design tokens

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
      quiet-material-v0.7.json      status: proposed
      codex-handoff-round-23.json   status: exploring
      quiet-material-refinement.json status: rejected (closed study)
      instrument.json              status: rejected
      fieldwork.json               status: rejected
  explorations/
    README.md                 convention for exploration folders
    2026-09-01-quiet-material-v0.7/README.md
  PROVENANCE.md              every historical direction, one status each
  lint-allowlist.json        today's off-token literals in consumer code, ratcheted down
```

## What is active

`design/tokens/active.json` has one entry per production surface under
`surfaces`. Today there are two:

- **`internal-reports`** — the CEO dashboard, weekly digest, and interrupt
  emails. Adopted by `DEC-20260815-A` (2026-08-15). Builds into
  `apps/api/scripts/lib/design-tokens.generated.ts` via
  `scripts/generate-design-tokens.mjs`; `apps/api/scripts/lib/design-system.ts`
  imports it and is the only file the three consumers (`ceo-dashboard.ts`,
  `digest-formatter.ts`, `interrupt-sender.ts`) touch. Human-readable
  companion: `docs/company/DESIGN-SYSTEM.md`.
- **`website`** — `strale.dev`, `strale-frontend` `main`. No decision record
  ever adopted it (`adopted_by: "unrecorded"`); it is captured here as a
  faithful snapshot so it has a documented baseline, not because it went
  through this process. It becomes a real build input once `apps/web`
  exists (`docs/project/ROADMAP.md` section 7); until then this file is a
  record, not a generator input, for that surface.

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
  exempt — that is where a literal is supposed to live. The `website`
  surface is not linted anywhere yet; there is no `apps/web` for it to
  apply to.

See `apps/api/scripts/lib/design-tokens.generated.ts`'s own header and
`scripts/design-lib.mjs` for exactly what each check does.
