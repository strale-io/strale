---
doc_type: decision-collision-resolution
collision_id: DEC-20260304-A
resolution_status: resolved
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
resolved_at: 2026-09-05
implementation_status: drift-open
corrects_migration_state_in: []
source_rows:
  - source_page_id: "31967c87082c8185b0a6c33de2293215"
    disposition: formal_record
    record_key: DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215
  - source_page_id: "31867c87082c812c9ccef7f58256f40a"
    disposition: formal_record
    record_key: DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a
---

# Resolution of historical ID collision `DEC-20260304-A`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [hide-component-prices decision](https://app.notion.com/31967c87082c8185b0a6c33de2293215)
  becomes `DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215`.
- The [homepage v2.1 visual-polish decision](https://app.notion.com/31867c87082c812c9ccef7f58256f40a)
  becomes `DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260304-A` is still
forbidden as a relationship target.

## Implementation reconciliation

**Hide component prices.**
`strale-io/strale-frontend@04c9fca9:src/types/index.ts`'s
`TypeaheadResult.price_cents` carries the inline comment
`// null for capabilities (DEC-20260304-A)`, directly citing this decision.
Neither `TypeaheadResult` nor `SuggestRecommendation` carries a
`component_sum_cents` field. A `component_sum_cents` field does exist on
the unrelated `SolutionDetail` shape (`GET /v1/solutions/:slug`), but is
not rendered by any page checked; this is a distinct surface from the
discovery/suggestion responses this row's rule targets.

**Homepage v2.1 polish.** `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx`
has exactly 10 numbered sections today, matching the row's "11 to 10"
target; "Built for Agents" is gone; three-steps is a compact strip; the
integrations section is tabbed. The comparison section is not at
position #2 today (it is #4; the Solutions showcase is #2); this is an
open discrepancy against the row's stated placement, not resolved by
this record, and is why this collision's implementation status is
`drift-open` rather than `verified`. CLAUDE.md names a later, related
homepage-ordering decision (`DEC-20260303-G`) outside this batch that may
account for the divergence, but that is not confirmed here.

## Rejected representations

- Marking either row documented-only would omit a still-verifiable,
  independently live discovery-UI rule and a still-mostly-matching
  homepage-structure decision.
- Inventing a supersession edge between the two rows would be false: they
  describe unrelated homepage changes decided the same day.
- Merging the two rows into one record would misrepresent two distinct
  subjects as one decision.
- Silently correcting the homepage v2.1 record's Consequences to claim
  full section-order fidelity would misstate the verified evidence; the
  comparison-placement discrepancy is reported instead.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge;
an independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
