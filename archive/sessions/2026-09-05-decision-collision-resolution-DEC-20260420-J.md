---
doc_type: decision-collision-resolution
collision_id: DEC-20260420-J
resolution_status: resolved
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
resolved_at: 2026-09-05
implementation_status: verified
corrects_migration_state_in: []
source_rows:
  - source_page_id: "34867c87082c81478c15cb6985d10137"
    disposition: formal_record
    record_key: DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137
  - source_page_id: "34867c87082c81dc803bc3709bd5fdd6"
    disposition: documented_only
    rationale: "This row's `historical_status` is `superseded` and its own text opens \"SUPERSEDED 2026-04-20 by DEC-20260420-K. Original decision (defer bank verification to v1.1) was incorrect.\" The formal record for this batch's `DEC-20260420-K` collision, `DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4`, is created in this same PR and its own Context section names this exact page id and quotes this row's own superseded framing. Creating a second formal record for a plan the same-session superseding decision already fully describes would represent one abandoned scope as two live decisions."
---

# Resolution of historical ID collision `DEC-20260420-J`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with one formal record and one documented-only row:

- The [SA.2b.d Session A closure row](https://app.notion.com/34867c87082c81478c15cb6985d10137)
  becomes `DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137`.
- The [earlier, `superseded` bank-verification-deferral row](https://app.notion.com/34867c87082c81dc803bc3709bd5fdd6)
  remains `documented_only`. Its own text states it was superseded the same
  day by `DEC-20260420-K`, whose formal record (this batch) fully carries
  the supersession.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260420-J` is still forbidden as a relationship target. The formal
record carries `related_to` edges to `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600`,
`DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228` (its own "F-A-005"
citation), `DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b` (its
own "F-A-006 + F-A-007" citation), `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef`
(its own "F-A-012" citation), and `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6`
(its own "deferred to Session B per DEC-20260420-H" citation, matching that
record's exact subject).

## Range citation, expanded and labelled as inference

The row's own closing line, "Prior Session A DECs: DEC-20260420-A through
DEC-20260420-I (complete remediation chain)," is a nine-letter range. Its
formal record labels this an inference and expands it letter by letter:
`DEC-20260420-A` exists as a single non-collision record but is not
targeted by a relation edge (the range names it only as part of the span,
with no more specific content connecting this row to it); `DEC-20260420-B`
and `DEC-20260420-C` have no record or collision-registry entry in this
repository and are not targetable (`DEC-20260420-C` is separately named
twice in the row's own F-A findings list, also unresolvable to a record);
`DEC-20260420-D` through `DEC-20260420-H` are each covered by this row's own
specific F-A/manifest-drift citations (listed above); `DEC-20260420-I` is
this batch's other, separately-resolved collision, covering both its own
rows without a further edge from this record, since the range statement
does not itself distinguish which of the two rows it means.

## Implementation reconciliation

**The end state this row describes (NOT NULL, heuristic deleted) is
corroborated by current manifest state.** All 342 manifests under
`manifests/*.yaml` declare `processes_personal_data` or
`personal_data_categories`. `implementation_status` is `verified`: the
schema-level end state matches what the row describes, though the row's own
point-in-time production spot-check transaction ids and count values were
not independently re-queried in this pass.

## Rejected representations

- Creating a second formal record for the superseded bank-verification-
  deferral row was rejected: its full content (defer bank verification to
  v1.1, three options weighed) is already fully described in the row's own
  text as reproduced by this batch's `DEC-20260420-K` formal record's own
  Context section, which quotes it directly; a second formal record would
  duplicate, not add, coverage.
- Targeting the bare `DEC-20260420-A` id with a relation edge for the range
  citation was rejected: the range's own wording gives no content specific
  to `DEC-20260420-A` beyond being the first letter in the span.
- Adding `corrects_migration_state_in` for the `DEC-20260420-C` and
  `DEC-20260420-H` gaps this row's own text surfaces was rejected: neither
  gap is a stale statement in an already-merged protected record that this
  batch could name under `REQUIRED_COLLISION_MIGRATION_CORRECTIONS`; both
  ids are simply unresolvable references inside this row's own text.

## Verification boundary

This resolution is complete only when the collision registry, the formal
record, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
