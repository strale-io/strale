---
doc_type: decision-collision-resolution
collision_id: DEC-20260505-E
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
  - source_page_id: "35767c87082c813481a8efa27ea37438"
    disposition: formal_record
    record_key: DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438
  - source_page_id: "35767c87082c81e2ba50d630d0b95f9d"
    disposition: formal_record
    record_key: DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d
---

# Resolution of historical ID collision `DEC-20260505-E`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with two formal records, both historically active:

- The [HMRC VAT Checker disclosure decision](https://app.notion.com/35767c87082c813481a8efa27ea37438)
  becomes `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438`.
- The [Topograph downgrade decision](https://app.notion.com/35767c87082c81e2ba50d630d0b95f9d)
  becomes `DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d`.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260505-E` is still forbidden as a relationship target.

## Implementation reconciliation

- The HMRC row's `Outcome` field is null: HMRC's compliance verdict on the
  disclosed redistribution model is not recorded in this source data.
  `config/env-manifest.yaml` still carries eight `HMRC_*` credential rows,
  consistent with an active HMRC integration, but that is not the same as
  a recorded compliance verdict.
- The Topograph row's downgrade holds: no `TOPOGRAPH*` row exists in
  `config/env-manifest.yaml` and no manifest names Topograph as a
  `data_source`, consistent with Topograph never being adopted.

## Rejected representations

- Importing only one row formally would leave the other's distinct subject
  (a compliance-disclosure decision vs. a vendor-economics decision)
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
