# 2026-09-02 — T5: CTO-readable repository structure

Intent: make the repository readable top-down for a stranger in one pass — README.md, docs/README.md, archive/ and handoff/ indexes, a clean root, and an honest deviation record against the migration's target layout — per archive/sessions/2026-09-02-t5-cto-readable-structure-plan.md.

## What was built

1. **README.md rewritten top-down**, in the plan's exact order: what Strale
   is (two paragraphs) → how to use it (quick starts condensed, each
   pointing at its package's own README) → how the code is organised
   (`apps/api`, `packages/*`, `manifests/`, `design/`, `config/`,
   `scripts/`) → how the company runs the repository (where truth and
   work-in-flight live, how sessions work, what CI checks by category) →
   where history lives (`archive/`, `handoff/`). Every external link kept
   is unchanged (`diff` against the pre-rewrite README's link set is
   empty). No capability/country/free-tier counts are hardcoded — each
   points at `GET /v1/platform/facts` or `/x402/catalog` instead. The old
   "Five free capabilities" line was itself already stale (real count is
   higher, includes crypto address validators) — replaced with a pointer
   to the live list rather than a corrected static number, so it can't go
   stale the same way again. `npm run claims:check` passes against it.

2. **`docs/README.md`** — one line per `docs/` subtree (18 of them), what
   it holds and its authority status (authoritative today / candidate M2 /
   candidate M1 skeleton / evidence / historical), read from each
   subtree's own front matter or README where one exists. Plus
   `scripts/check-docs-index.mjs` (`npm run docs:check`, tests in
   `scripts/check-docs-index.test.mjs`) — set-equality between real `docs/`
   subtrees and the subtree names referenced in the table; both directions
   (undocumented new subtree, vanished listed subtree) are planted in
   throwaway fixtures.

3. **`scripts/generate-archive-index.mjs`** (`npm run archive:index`,
   `--check`, tests in `scripts/generate-archive-index.test.mjs`) — writes
   `archive/README.md` (existing hand-written prose preserved verbatim
   above a `<!-- BEGIN GENERATED ARCHIVE INDEX -->` marker; a generated
   block below lists every `archive/` subtree with a file count and its
   newest dated file) and `handoff/README.md` (fully generated,
   reverse-chronological table: date, file, first `Intent:` line truncated
   to 120 chars — a file without one gets a counted placeholder, never
   silently dropped; 27 of 212 pre-T5 handoff files have no `Intent:` line
   anywhere, which is expected: they predate the convention). Every
   failure mode (subtree added/removed, handoff file added/undated,
   missing Intent line, missing README) is planted in a throwaway
   directory fixture, per the new LESSONS F5 rule below.

4. **Root cleanup.** `git mv DISTRIBUTION_PR_PREFLIGHT.md
   docs/governance/protocols/DISTRIBUTION_PR_PREFLIGHT.md` and same for
   `REVIEW_TEMPLATE.md` (filenames unchanged, only the location moved).
   `git mv manifests-drafts archive/superseded/manifests-drafts` — `git
   grep manifests-drafts -- apps scripts packages` found zero code
   references before the move. Root now holds exactly: `README.md`,
   `CLAUDE.md`, `AGENTS.md` (+ `.agents/`, `.codex/`), `WORKTREES.md`,
   `LICENSE`, the monorepo build files, and the four MCP/package-registry
   manifests (`context7.json`, `glama.json`, `server.json`,
   `smithery.yaml`) that must stay at root because each registry's
   crawler looks there by convention.

5. **`docs/project/STRUCTURE.md`** — the migration plan's section-5 target
   tree against the actual tree, one line per deviation with a reason and
   the owning track. Every deviation recorded:
   - `docs/governance/{CHARTER,BUDGET,MEASUREMENT,LESSONS}.md` still at
     `docs/company/` — live, machine-checked (charter-authorization-
     binding.test.ts, check-ceo-brief.ts) and this track's constraints
     forbid moving anything under `docs/company`. Owner: T6.
   - Six named protocol bodies (`capability-onboarding.md`,
     `distribution-pr-integrity.md`, etc.) still embedded as prose
     sections in `CLAUDE.md`, not extracted into
     `docs/governance/protocols/`. Owner: T6.
   - `docs/product/{GTM.md,WEBSITE-BRAND.md}` not yet authored (still
     Notion). Owner: T6.
   - `docs/programs/remediation/` and `docs/programs/discovery/` not
     nested — `docs/remediation/` is a separate top-level directory
     mid-closure (T4), and discovery is T9, which by design starts only
     after T7.
   - `docs/architecture/` doesn't exist; no content has been proposed for
     it. Owner: unassigned.
   - `docs/operations/runbooks/` — two runbooks sit directly under
     `docs/operations/`, no nesting. Low-priority, unassigned.
   - `archive/imports/` — not in this repo. The private M0 export lives in
     the private `strale-io/strale-context-archive` repo at the same
     relative path (`docs/project/private-archive-status.json`,
     `public_copy_allowed: false`). Verified from that file, not assumed.
   - `archive/briefs/` — CEO morning briefs live at `docs/company/briefs/`
     instead, per DEC-20260822-A, hardcoded in
     `apps/api/scripts/check-ceo-brief.ts`. Needs a coordinated code+doc
     change or a decision amendment, not a plain move; also under
     `docs/company`. Owner: T6.
   Front matter follows the M2-candidate shape shared by `PRODUCT.md`,
   `STATE.md`, `ROADMAP.md` (`status: candidate`, `phase: M2`,
   `authority_active: false`, `verified_at: 2026-09-02`) rather than
   `START-HERE.md`'s M1-skeleton shape, since this file carries real
   analysis content, not an inert stub — a judgement call; both shapes
   validate against `project-document.schema.json`, and the checker's
   fixed document lists don't cover this file either way, so no
   registration was required.

6. **`docs/company/LESSONS.md` F5** gains a dated standing rule (no
   checker ships without a planted failing case shown in its PR), cited
   against exactly what the two named handoffs record — not rounded up.
   Verified directly from `handoff/_general/from-code/2026-09-02-t13-
   design-tokens.md` and `2026-09-02-t14-cheap-extras.md`: three concrete
   bugs, two checkers (a capturing-group bug that made the design
   spacing/radii check permanently blind, a hex-literal false-positive on
   HTML numeric character references, and a claims-register matcher that
   compiled only `is_regex` rows and kept the literal slashes, so no
   forbidden claim could ever match prose). The task brief suggested a
   "three of four registers had a hole" framing (naming a fourth item,
   "design promotion gate"); that specific claim is **not** in either
   handoff — the design handoff's two bugs are the spacing regex and the
   hex regex, not a promotion-gate bug — so LESSONS states the three
   verified bugs across two checkers instead of the unverified four-item
   framing.

7. `.github/workflows/ci.yml`: `docs:check`, `docs:test`,
   `node scripts/generate-archive-index.mjs --check`, `archive:index:test`
   wired in immediately after `claims:test`.

## Judgement calls

- Kept the two moved checklists' original filenames
  (`DISTRIBUTION_PR_PREFLIGHT.md`, `REVIEW_TEMPLATE.md`) rather than
  renaming to the migration plan's eventual `distribution-pr-integrity.md`
  naming scheme — that scheme names the *protocol body* (still in
  CLAUDE.md prose), not this checklist artefact; renaming both location
  and name in one move seemed like more reference-breakage than the plan
  asked for. Recorded as its own deviation line in STRUCTURE.md.
- Did **not** edit the historical archive session reports that mention the
  old `DISTRIBUTION_PR_PREFLIGHT.md`/`REVIEW_TEMPLATE.md` root paths
  (`archive/sessions/CONTAINMENT_REPORT.md`, `RESOLUTION_REPORT.md`,
  `audit-output/parallel-audits-2026-08-12/*.md`) — those are frozen
  historical records of repo state on their own dates; the plan's deliverable
  4 only asks for CLAUDE.md/AGENTS.md references, and CLAUDE.md's own
  Report Filing Convention treats archived reports as historical, not
  living docs to keep in sync.
- `archive/` "newest file per subtree" is read from a `YYYY-MM-DD-`
  filename prefix, never from `git log` — the established fixture-test
  pattern in this repo (`research.test.mjs`, `design.test.mjs`) builds
  throwaway repos with no commits, so a git-log-based generator would be
  untestable against that pattern. Two of four archive subtrees
  (`growth-ops/`, `submissions/`) have no dated filenames and report
  `_(no dated filenames)_` rather than a guessed date.
- `handoff/README.md`'s date column falls back to `—` for the 8 pre-T5
  files with no `YYYY-MM-DD-` filename prefix, sorted after every dated
  entry — same reasoning (no git shell-outs in the generator).
- `docs/governance/protocols/README.md` (a generated M1 skeleton) said "No
  protocol body has moved. This directory is an inert future destination."
  — false the moment this track's move landed two real files in it. Edited
  the skeleton template in `scripts/project-context-lib.mjs` (not the
  generated file directly) so `context:generate` produces the corrected
  text; this is outside `docs/company`/`docs/project`/`docs/decisions`/
  `docs/programs`, so not covered by the constraint, and leaving a known
  false statement in a checked-in generated file felt worse than a
  one-paragraph template fix.

## Test counts

- `scripts/check-docs-index.test.mjs`: 6 tests (2 PLANTED FAILURE cases).
- `scripts/generate-archive-index.test.mjs`: 12 tests (5 PLANTED FAILURE
  cases: subtree added, subtree removed, handoff file without Intent,
  handoff file added post-generation, missing handoff/README.md).
- All pre-existing suites re-run clean after these changes:
  `context:test` 108, `programs:test` 30, `claims:test` 18, `design:test`
  24, `env:test` 17, `models:test` 14, `handoff:test` 30.

## Checks run (final state)

`npm run claims:check`, `docs:check`,
`node scripts/generate-archive-index.mjs --check`, `context:check` (zero
findings), `research:check` (passes; 5 pre-existing
`RESEARCH_LOOKING_FILE_OUTSIDE_CONTRACT` warnings, unrelated to this
track), `design:check`, `env:check`, `models:check`, `programs:check` —
all green. `docs:test`, `archive:index:test`, `programs:test`,
`context:test`, `claims:test`, `handoff:test`, `design:test`, `env:test`,
`models:test` — all pass. `node apps/api/scripts/check-mjs-syntax.mjs`
clean.

## Not done / explicitly out of scope

- The six protocol bodies are not extracted from CLAUDE.md into
  `docs/governance/protocols/` — recorded as a STRUCTURE.md deviation
  owned by T6, not attempted here (extraction plus a protocol-coverage
  manifest is explicit M3 work per `docs/project/PROTOCOL-ROUTER.md`).
- `docs/governance/CHARTER.md` etc. were not moved from `docs/company/` —
  forbidden by this track's own constraints.
- `docs/product/`, `docs/architecture/`, and nesting `docs/remediation/`
  under `docs/programs/` were not created/moved — no content proposed,
  program still mid-closure, respectively.

## Resume surface

Track T5 (`docs/programs/cto-readiness/tracks.yaml`) is not marked `done`
by this handoff — that edit is owned by the session applying the exit
checklist against the pushed branch, per this track's own instructions
("Do not edit tracks.yaml"). All five deliverables and the two CI wires
are complete and verified above; nothing is deferred within T5's own
scope.
