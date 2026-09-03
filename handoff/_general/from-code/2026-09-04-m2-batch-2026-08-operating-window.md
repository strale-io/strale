Intent: land the first batch of T10 (M2 exit-gap closure) — the seven decision rows the closure register names as its next batch — as inactive formal candidate records, with the register's counts and digests made true again against the private archive.

## What this batch is

The closure register's `next_decision_batch` selects every `not_yet_reconciled`,
`active` Notion decision with a unique historical ID, absent from both collision
kinds, decided on or after 2026-08-12 (the readiness anchor). Exactly seven:
the six website design approvals of 2026-08-20 and the Austrian Firmenbuch
migration of 2026-08-27. Each is now a formal candidate record under
`docs/decisions/records/`, five protected sections, `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Implemented by a Sonnet agent from a written brief that carried every source
verbatim; verified by the orchestrator; independently reviewed read-only.

## Two deviations the agent made, and how they were resolved

Both were flagged by the agent itself, which is the behaviour the brief asked
for. Both were rejected as written.

**Relation edges "to satisfy the topic-connectivity check".** The validator
requires every pair of active records sharing a topic to be related. The
agent added A→B, B→C and C→E edges annotated as claiming nothing. A relation
is a claim; an edge that claims nothing is a fabricated one, and the
2026-09-01 doctrine batch failed review for less. Resolved by giving records
topics that match their sources: the hero and the integration section are
their own subjects; the four use-case worlds share `website-use-case-worlds`
and are connected by the edges the sources actually state — D extends C, and
F governs the sequence C, D and E establish. No other edge.

**A word budget raised to fit.** The generated decision index exceeded a
1,500-word candidate budget by 200 words, and the agent raised the budget to
1,900. A gate widened to fit content is the wrong shape. The real defect is
that a budget written for hand-authored candidate prose was being applied to
`docs/project/DECISIONS.md`, which is `generated: true` and grows with every
migrated record by construction — after the remaining 205 rows it would be
several times this size. Resolved by exempting generated documents from the
budget, with two planted tests: a generated index far over the limit passes,
a hand-written candidate over its own budget still fails.

## The private half, which only the orchestrator can do

Three register values depend on the private archive. The private projection
now sits in `strale-io/strale-context-archive` at `995cece3` with the seven
rows removed (223 → 216). `private_rows.digest` and `digests.all_rows.digest`
are canonical digests over those rows; `digests.public_rows.scope_date_digest`
binds the public rows' scope and date from the raw export at `24713c48`. The
scope/date method was proved by reproducing main's recorded value for the 95
pre-batch rows before computing the 102-row value.

The operator verifier then refused the batch on five title hashes: the rows'
`title_sha256` had been computed from the titles as quoted in the brief, not
from the export's exact `Decision` string, and no two were the same string
(a trailing period, a markdown link in the Austrian row). All seven now hash
the export string, and the two digests that cover that field were recomputed.
`scripts/m2-closure-verify-private-rows.mjs` passes against the archive: 318
export rows, 216 private rows, every projected row matching its export row
field by field, and an empty next-batch candidate set.

One process slip worth recording: a document-API write re-serialised the
whole register, turning a two-value change into a 3,695-line diff. Restored
to the committed layout with the two values applied textually. A diff should
show what changed.

## Where T10 stands after this

Of the four blocking gaps: G3's identity mechanism (source-qualified record
keys, collision registry v2) is already built and exercised by one resolved
collision; what remains for G3 is representing a Git-native claim that shares
an ID with a Notion row, which the Notion-only registry cannot yet hold.
G1 is 205 rows, 82 of them feature-scoped and pre-readiness — the population
the gap's own closing rule lets one reviewed classification cover. G2 is 34
collisions. G9 is the closing review. The next batch is the G1 classification
rule, because it retires the most rows per decision.

## Not done

- No decision outside the seven was touched; no collision was resolved.
- The register still lists the private-repo digests as operator-verified,
  not CI-verified; that is by design (DQ-28: rows stay private).
