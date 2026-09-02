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

# T5 — CTO-readable repository structure: stored plan

> The last piece of the founder's original ask: a repository a newly hired
> CTO understands in one read. Execution record, not project truth.

## What exists

- `README.md` (166 lines) is a product and SDK quick start: MCP, TypeScript,
  Python, packages, Web3, quality, links. It says nothing about how the
  repository is organised or how work happens here.
- `docs/` has 18 subtrees and no index; `archive/` has 260 files and a
  README; `handoff/` has 215 files (212 session records) and no index.
- Root holds, besides the four canon files (`README.md`, `CLAUDE.md`,
  `AGENTS.md`, `WORKTREES.md`), `DISTRIBUTION_PR_PREFLIGHT.md`,
  `REVIEW_TEMPLATE.md`, MCP registry manifests (`context7.json`,
  `glama.json`, `server.json`, `smithery.yaml`), build files, `LICENSE`, and
  a `manifests-drafts/` folder.
- The migration plan section 5 names a target layout (docs/project,
  decisions, product, governance, programs, architecture, operations,
  security, research, audits; archive/imports|sessions|briefs|superseded)
  and says physical moves are deferred until authority is established:
  logical classification first, existing authoritative paths may stay.

## Deliverables

1. **README.md rewritten top-down for a stranger**, in this order: what
   Strale is (two paragraphs, claims-register safe: run `npm run
   claims:check`), how to use it (the existing quick starts, condensed with
   links to package READMEs), how the code is organised (`apps/api`,
   `packages/*`, `manifests/`, `design/`, `config/`, `scripts/`), how the
   company runs the repository (where truth lives: `docs/project/START-HERE.md`
   and the program register; how sessions work: CLAUDE.md/AGENTS.md, the
   session-end gate, batch worktrees; the checks CI runs, one line each),
   and where history lives (`archive/`, `handoff/`). Keep every existing
   external link that still resolves. No counts that go stale (capability
   numbers come from the platform facts endpoint, say so).
2. **`docs/README.md`**: one line per subtree, saying what it holds, whether
   it is authoritative today, a candidate (M2, `authority_active: false`),
   evidence, or historical; generated where a generator already exists
   (decisions index, research index, coverage summary) and hand-written
   otherwise; a checker `npm run docs:check` fails when a `docs/` subtree
   has no line or a listed subtree is gone.
3. **`archive/README.md` and `handoff/README.md` generated** by
   `scripts/generate-archive-index.mjs` (`npm run archive:index`, `--check`
   in CI): archive by subtree with counts and the newest file; handoff as a
   reverse-chronological table (date, file, first `Intent:` line, ≤ 120
   chars). Files that lack an `Intent:` first line are listed with a
   placeholder and counted; the check does not fail on them (T2 imported
   history).
4. **Root**: `DISTRIBUTION_PR_PREFLIGHT.md` and `REVIEW_TEMPLATE.md` move
   under `docs/governance/protocols/` with every reference updated
   (`git grep` first; CLAUDE.md and AGENTS.md references are inventory
   targets, so regenerate the inventory); `manifests-drafts/` moves to
   `archive/superseded/manifests-drafts/` if nothing under `apps/` or
   `scripts/` reads it (grep; if something does, leave it and record why);
   MCP registry manifests and build files stay (registries read them at
   root). CLAUDE.md's Report Filing Convention sentence about root canon is
   updated to match.
5. **Deviations record** `docs/project/STRUCTURE.md`: the migration plan's
   target tree next to the actual tree, one line per deviation with the
   reason (authority not yet cut over, code reads the path, registry
   requirement), and which track closes it. This is the honest map a CTO
   reads before touching anything.
6. **LESSONS.md**: under family F5 (hollow tests), add the standing rule
   proven four times on 2026-09-02: no checker ships until it has failed on
   a planted case, and the plant is recorded in the PR.

## Constraints

Nothing under `docs/company`, `docs/project`, `docs/decisions`,
`docs/programs` moves (authority pre-cutover; the migration owns those
moves). No file content changes beyond the README, the indexes, the two
moved files' references, LESSONS, and STRUCTURE.md. `npm run research:check`,
`design:check`, `env:check`, `models:check`, `claims:check`,
`programs:check`, `context:check` stay green; the inventory is regenerated
in the same commit as any target edit.

## Exit

- A stranger can go README → docs/README.md → START-HERE → program register
  without a dead link; `docs:check` and `archive:index --check` pass in CI
  and fail on a planted unlisted subtree / stale index.
- Root contains only the canon files, LICENSE, build files and registry
  manifests; every remaining deviation from the target layout is a line in
  STRUCTURE.md with a reason and an owner track.
