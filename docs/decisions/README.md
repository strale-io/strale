---
doc_type: decision-system-readme
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-01
---

# Decision Records (Candidate)

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**
> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

Formal candidates live at `records/DEC-*.md`. Each keeps its historical ID and
decision status while the extra M2 fields make clear that the repo-native
register itself is not yet authoritative.

Every record has five protected sections: Decision, Context, Rationale,
Consequences, and Reversal conditions. Once a record is active, those sections
cannot be edited in place. Change is represented by a new decision and an
explicit `supersedes`, `amends`, `interprets`, or `affirms` relationship.

Relationships are stored only on the source record. The candidate index at
`docs/project/DECISIONS.md` is generated and supplies inverse views such as
`superseded_by` and `amended_by`.

Historical source rows that reuse an ID are preserved in
`id-collisions.yaml`. An unresolved collision excludes that ID from formal
records and relation targets; the migration never chooses one meaning silently.
Run `npm run context:generate`, then
`npm run context:test` and `npm run context:check` after changing records.
