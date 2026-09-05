---
doc_type: decision-collision-resolution
collision_id: DEC-20260507-A
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
  - source_page_id: "35967c87082c81b0ad02d69148811b57"
    disposition: formal_record
    record_key: DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57
  - source_page_id: "35967c87082c81a9abc3da329b92a0f9"
    disposition: formal_record
    record_key: DEC-20260507-A--notion-35967c87082c81a9abc3da329b92a0f9
---

# Resolution of historical ID collision `DEC-20260507-A`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with two formal records, both historically active:

- The [drift-check substrate decision](https://app.notion.com/35967c87082c81b0ad02d69148811b57)
  becomes `DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57`.
- The [Gap-8-to-Gap-7 reclassification decision](https://app.notion.com/35967c87082c81a9abc3da329b92a0f9)
  becomes `DEC-20260507-A--notion-35967c87082c81a9abc3da329b92a0f9`.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260507-A` is still forbidden as a relationship target.

## Implementation reconciliation

- The drift-check substrate row's mechanism is verified in force:
  `apps/api/src/lib/platform-facts.ts` exports `getActiveVendorNames()` and
  `getStaleVendorNames()`, and `apps/api/scripts/check-platform-facts-drift.ts`
  imports and uses them, matching the row's description exactly.
- The Gap-8 reclassification row's SK correction is consistent with SK
  having a shipped `slovak-company-data` capability (referenced by
  `docs/decisions/records/DEC-20260513-C.md`). SI, RO, and MT status were
  not independently re-verified beyond the row's own text in this batch.

## Rejected representations

- Importing only one row formally would leave the other's distinct subject
  (a CI-tooling decision vs. a country-gap-classification decision)
  undocumented.
- Treating either row as superseded would misstate the source data: both
  carry `historical_status: active`.

## Verification boundary

This resolution is complete only when the collision registry, formal
records, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions in this batch are resolved
under separate reports.
