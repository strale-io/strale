---
doc_type: decision-collision-resolution
collision_id: DEC-20260513-F
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
  - source_page_id: "35f67c87082c81269b79cb7d0367dc46"
    disposition: formal_record
    record_key: DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46
  - source_page_id: "35f67c87082c81c09fbfc2253cf4e24c"
    disposition: formal_record
    record_key: DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c
---

# Resolution of historical ID collision `DEC-20260513-F`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with two formal records, both historically active:

- The [manifest_drift non-tripping classification decision](https://app.notion.com/35f67c87082c81269b79cb7d0367dc46)
  becomes `DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46`.
- The [v1 Identity coverage verdict decision](https://app.notion.com/35f67c87082c81c09fbfc2253cf4e24c)
  becomes `DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c`.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260513-F` is still forbidden as a relationship target.

## Implementation reconciliation

- The manifest_drift classification row's mechanism is verified in force in
  `apps/api/src/lib/trust-helpers.ts`: the `manifest_drift` category exists
  and `guaranteed_field_missing:` reasons map to it. The code comment
  attributing the mechanism to `DEC-20260513-B` and `DEC-20260513-C`
  instead of this row appears to be a misattribution: both of those
  records describe unrelated subjects (a Swiss breaker-pin release and a
  Slovak scheduler hash-stagger fix).
- The Identity coverage verdict row names its cost-class blocker
  (`DEC-20260512-A`) directly and its canonical source document,
  `apps/api/docs/v1-identity-coverage-matrix-2026-05-13.md`, still exists
  in this repository.

## Rejected representations

- Importing only one row formally would leave the other's distinct subject
  (a failure-taxonomy decision vs. a coverage-audit verdict) undocumented.
- Treating either row as superseded would misstate the source data: both
  carry `historical_status: active`.

## Verification boundary

This resolution is complete only when the collision registry, formal
records, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions in this batch are resolved
under separate reports.
