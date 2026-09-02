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

# T12 — Research contract: stored plan

> Milestone 1 of the founder's 2026-09-02 plan ("one canonical current answer,
> dated evidence with explicit status and supersession, mechanical checks that
> refuse drift"). Execution record, not project truth.

## What exists

`docs/research/` holds 37 top-level Markdown files plus data subfolders (JSON
fixtures, a swagger file), 4 with YAML front matter, 12 with a prose
`**Status:**` line that only says "research only", none with supersession.
Decision records (`docs/decisions/records/*.md`, candidate) carry
`evidence:` lists that may cite research paths. `docs/strategy/` holds 8
plans and analyses; `docs/audits/` 3 and `docs/diligence/` 4 research-like
documents.

## Contract

Every research output is one dated Markdown file under `docs/research/`
named `YYYY-MM-DD-<topic-or-title>.md` with YAML front matter:

```yaml
---
doc_type: research
type: market | competitor | positioning | product | user | vendor | registry
topic: <stable-kebab-slug>          # one topic may have many files over time
question: <one sentence this file answers>
date: YYYY-MM-DD
status: current | superseded | historical
supersedes: [<file names>]          # optional; reciprocal with superseded_by
superseded_by: <file name>          # required when status is superseded
sources: [<urls or repo paths>]     # at least one
decisions: [<DEC ids>]              # optional: decisions this file changed
---
```

`vendor` and `registry` are added to the founder's five types because 30 of
the 37 existing files are vendor evaluations and registry build paths; forcing
them into `product` would make the topic index useless.

Research is evidence, never authority. A finding that changes direction must
produce a decision record; a decision that cites a research file requires that
file to be `current` at the time the decision is active.

## Checker (`npm run research:check`, tests `npm run research:test`, both in CI)

Fails on: missing or invalid front matter (schema-validated with Ajv, like
the program register); a file not matching the name pattern; more than one
`status: current` file per `topic`; a `superseded` file without
`superseded_by`, or a `superseded_by`/`supersedes` pair that is not reciprocal
or that forms a cycle; a `superseded_by` target that does not exist; a
`historical` file that some other file still claims to supersede into
currency incorrectly; a Markdown link or `sources` repo path that does not
resolve; a decision record (`docs/decisions/records/*.md`, status active)
whose `evidence` cites a research file that is not `current`. Warns (does not
fail) on `docs/strategy`, `docs/audits`, `docs/diligence` files that look like
research (heading contains research/audit/evaluation/benchmark) but live
outside the contract, listing them for migration.

## Index

`npm run research:index` regenerates `docs/research/README.md`: one row per
topic with the current file, its question, date, and the count of superseded
files; a second table of historical files. `research:check` fails when the
committed README differs from the regenerated one (same pattern as the
coverage-matrix summary).

## Migration of existing files

Front matter is added to all 37 files; bodies are untouched. `type`, `topic`
and `question` are inferred from each file's title, date line and scope, and
recorded in a migration table in the T12 handoff so the inference is
reviewable. Files that evidently repeat an earlier file on the same topic
(registry coverage 2026-04-27 → 2026-05-06; pricing benchmarks 04-22 → 04-28;
build-path files → their `-verify` successors) are linked with
`supersedes`/`superseded_by`; everything else is `current` on its own topic.
Data subfolders and JSON fixtures are not research files and are ignored by
the checker (`sources` may point at them).

## Ideas file (cheap extra, rides along)

`docs/company/IDEAS.md`: append-only list, one line per idea:
`- YYYY-MM-DD · <status: inbox | considered | promoted | dropped> · <one line> [· → <research file or DEC id>]`.
`research:check` validates the line shape and that a `promoted` entry names
a research file or decision id that exists. CLAUDE.md and AGENTS.md get one
identical paragraph: research goes to `docs/research/` in the template,
ideas go to `docs/company/IDEAS.md`, nowhere else.

## Exit

- `research:check` passes on `main`; planting each failure mode (two current
  files on one topic, a dangling `superseded_by`, a cycle, a decision citing a
  superseded file, a malformed ideas line) fails it with a one-line fix.
- All 37 files carry valid front matter; the README lists every topic.
- The identical paragraph is in CLAUDE.md and AGENTS.md; the inventory is
  regenerated in the same commit.

## Out of scope

Moving `docs/strategy`, `docs/audits`, `docs/diligence` files (listed as
warnings for a later batch); Notion Journal brainstorms; the design milestones.
