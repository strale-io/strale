---
doc_type: session-plan
authority_scope: none
status: planned
complete: false
phase: M2
authority_active: false
created_at: 2026-09-02
owners:
  - claude-code
review_route: cheaper-model implementation, fresh independent review, orchestrator verification
---

# T13 — Design tokens as data, candidates, promotion: stored plan

> Milestones 2 and 3 of the founder's 2026-09-02 plan, placed in this
> repository because DEC-20260902-A makes it the monorepo the website
> redesign is built in. Execution record, not project truth.

## What exists (from the 2026-09-02 survey)

Two production surfaces run two different design systems, and neither is
described as data:

- **Internal reports** (CEO dashboard, digest email, interrupt sender):
  `apps/api/scripts/lib/design-system.ts` exports `TOKENS` (light, cool
  neutrals, accent `#2563EB`, `system-ui`) and a CSS string; consumers
  `apps/api/scripts/ceo-dashboard.ts`, `apps/api/src/lib/digest-formatter.ts`,
  `apps/api/src/lib/interrupt-sender.ts`. `docs/company/DESIGN-SYSTEM.md`
  (92 lines) describes it in prose and carries the binding writing rules.
- **Public website** (`strale-frontend`, `src/index.css` + `tailwind.config.ts`):
  dark theme in HSL variables, Inter + JetBrains Mono; 28 hex literals and
  325 arbitrary Tailwind values in source; no document describes it.
- **Candidates**: Quiet Material v0.7 (preserved as
  `strale-frontend/design/candidates/quiet-material-v0.7/`, tokens in
  `public/strale-site/design-system/assets/design-tokens.css`, release
  `preserve-2026-09-02`) and the Codex handoff round 23 (Instrument Sans +
  IBM Plex Mono, Strale Blue `#275DFF`, `docs/handoffs/2026-08-23-codex-website-handoff-v2/`
  in the same repo). Neither has a status anywhere.

## Structure (this repository root)

```
design/
  README.md                      one page: what is active, what is candidate, how to propose
  tokens/
    schema.json                  JSON Schema 2020-12 for token files
    active.json                  what production runs, per surface, with provenance and adopted_by
    candidates/
      quiet-material-v0.7.json   status: proposed
      codex-handoff-round-23.json status: exploring
  explorations/
    README.md                    convention: <date>-<name>/README.md with status and supersedes
    2026-09-01-quiet-material-v0.7/README.md   pointer to the preserved release, status
  PROVENANCE.md                  every historical direction with status (adopted | superseded | rejected | candidate)
  lint-allowlist.json            today's offenders, ratcheted down, never up
```

`active.json` has a top-level `surfaces` object with `internal-reports` and
`website`. Each surface: `palette`, `type` (families, scale), `spacing`
(scale), `radii`, `shadows`, `motion`, `provenance` (source file and commit it
was captured from), `adopted_by` (decision id), `adopted_at`. The website
surface is a faithful capture of what `strale-frontend` main serves on
2026-09-02; it becomes the build input when `apps/web` exists.

## Build imports

`apps/api/scripts/lib/design-system.ts` stops holding values: a generator
`scripts/generate-design-tokens.mjs` writes
`apps/api/scripts/lib/design-tokens.generated.ts` from `active.json`
(`internal-reports` surface) and `design-system.ts` imports it. The
generator's `--check` fails when the committed file is stale (same pattern as
the coverage-matrix summary and the research index). The three consumers
keep importing `DESIGN_SYSTEM_CSS` unchanged.

## Checker (`npm run design:check`, tests `npm run design:test`, both in CI)

Fails on: token files that do not validate against the schema; more than one
active file or a candidate without `status` in exploring | proposed | adopted
| rejected; `active.json` changed against `origin/main` without a changed
`adopted_by` (promotion without a decision); generated tokens out of sync;
in `apps/**/src/**` and `apps/api/scripts/**` files that emit HTML or CSS
(the three consumers today; `apps/web/**` when it exists) any six-digit hex
colour, `rgb(`/`hsl(` literal, raw `font-family:`, or px/rem value not on
the surface's spacing/radii scale — except entries in `lint-allowlist.json`,
whose count may only decrease (ratchet: the check fails if the allowlist
grows or if an allowlisted entry no longer exists). `design-system.ts` and
the generated file are the token source and are exempt. The website surface
is not linted here until `apps/web` exists; the plan says so.

## Design page

`docs/company/DESIGN-SYSTEM.md` becomes one page: what production runs
(link to `active.json`, per surface), the candidate in progress (link and
status), how to propose (exploration folder with README status → candidate
token file → decision record → swap `active.json` with `adopted_by`), and
the writing rules kept as they are (they are binding). Its history section
moves to `design/PROVENANCE.md`. ROADMAP section 7 points at `design/`.

## Exit

- `design:check` passes on `main`; planting each failure mode (second active
  file, candidate without status, active change without `adopted_by` change,
  a new hex literal in a consumer, an allowlist entry added) fails it with a
  one-line fix.
- The three internal consumers render from `active.json` through the
  generated file; `git grep '#2563EB' apps/api` finds only the token source.
- `design/README.md`, `PROVENANCE.md`, both candidates, and the rewritten
  `DESIGN-SYSTEM.md` exist with statuses; CLAUDE.md and AGENTS.md get one
  identical paragraph (tokens are data in `design/tokens/`; if you need a
  value the tokens lack, add the token first).

## Out of scope

Creating `apps/web`; changing `strale-frontend`; fixing its 28 hex literals
and 325 arbitrary values (they move with the site into `apps/web`, where the
same checker applies); any visual redesign.
