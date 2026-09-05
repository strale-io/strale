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

Formal candidates live at `records/DEC-*.md`. Each keeps its historical `id`
and decision status while the extra M2 fields make clear that the repo-native
register itself is not yet authoritative. `record_key` is the graph identity
and filename. It equals `id` for an unambiguous record; a future record whose
historical ID was reused must instead have a portable, source-qualified key.

Every record has five protected sections: Decision, Context, Rationale,
Consequences, and Reversal conditions. Once a record is active, those sections
cannot be edited in place. Change is represented by a new decision and an
explicit `supersedes`, `amends`, `interprets`, or `affirms` relationship.

Relationships are stored only on the source record and target `record_key`,
never an ambiguous display ID. The candidate index at
`docs/project/DECISIONS.md` is generated and supplies inverse views such as
`superseded_by` and `amended_by`.

A record key may instead be qualified `--git-<sha>`, naming the commit (7 to
40 lowercase hex characters) that introduced the id directly in Git. It
asserts that the record's provenance is that commit rather than a Notion
page, and is checked the same way: the commit must be an ancestor of the
current history. A cross-surface collision, where a Notion row and a
Git-native claim share one id, resolves to two distinct qualified keys (one
`--notion-`, one `--git-`) or to an evidence-only, documented disposition; it
never resolves to the bare id either way, and a `--git-` key's legitimacy
rests on the closure register claiming its id as a cross-surface collision,
not on `id-collisions.yaml`, which records only notion-duplicate collisions.

Historical source rows that reuse an ID are preserved in
`id-collisions.yaml`. Each row carries its immutable Notion page identity and a
disposition. An unresolved collision keeps every row at `unresolved` and
excludes that display ID from formal records and relation targets. A future
resolution must map every `formal_record` disposition one-to-one to a formal
record and give every `documented_only` disposition an evidence-backed
rationale. A bare collided ID is never targetable, even after resolution; the
migration never chooses one meaning silently.

Resolve collisions in two stages: land and verify any required graph mechanism
first, then change one collision's dispositions and formal records atomically
with source evidence and independent review. Run `npm run context:generate`, then
`npm run context:test` and `npm run context:check` after changing records.

The M2 closure register (`docs/project/m2-closure-register.yaml`) carries an
optional `closing_review` block once the exit gate's fresh independent review
has actually happened: the route taken, the exact commit reviewed, a `PASS`
verdict, the review date, and an `archive/sessions/` evidence file that reads
as that verdict. The validator checks the route against the recorded route
(substituting the fresh read-only Claude agent while the Codex quota is out,
per CLAUDE.md's 2026-09-03 amendment, only when the Codex re-review backlog
holds a pending row naming the closing review), the commit's ancestry, the
evidence file's content, that nothing which could move a Decision's
disposition changed since the reviewed commit, and the recomputed candidate-
set counts. Once recorded, `closing_review` is as immutable as a receipt: its
commit, verdict, review date, and evidence may not change and the block may
not be removed. A clean block releases the `plan.review_route` exit gap's
blocking requirement; the gap itself must still cover that bucket regardless.
This block records no review by itself. It only lets the validator see one
that has actually happened.
