---
doc_type: decision-collision-resolution
collision_id: DEC-20260505-D
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
  - source_page_id: "35767c87082c81059f67e756f5c5eefa"
    disposition: formal_record
    record_key: DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa
  - source_page_id: "35767c87082c81d3897fe47a2ec7a4c1"
    disposition: formal_record
    record_key: DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1
---

# Resolution of historical ID collision `DEC-20260505-D`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with two formal records, both historically active:

- The [InfoCamere route decision](https://app.notion.com/35767c87082c81059f67e756f5c5eefa)
  becomes `DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa`.
- The [v1 launch scope expansion decision](https://app.notion.com/35767c87082c81d3897fe47a2ec7a4c1)
  becomes `DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1`.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260505-D` is still forbidden as a relationship target.

## Implementation reconciliation

- The InfoCamere row's InfoCamere Distributore Ufficiale path did not ship;
  Italy shipped on the Openapi.com Tier-3 aggregator path instead, per the
  v1-scope row's own companion collision `DEC-20260507-C`. The InfoCamere
  application's outcome is not recorded anywhere in the source data.
- The v1-scope-expansion row's target list of five mid-rebuild countries
  (DE, NL, IT, ES, PT, AT) all shipped, but two diverged from the row's own
  vendor expectations: Spain shipped on the OpenMercantil.es Tier-2 path it
  had rejected as too slow to build, and Austria shipped on a direct
  government API (JustizOnline) rather than a vendor-mediated path at all.
  The `coverage_via` response field this row proposed was not located in
  this repository.

## Rejected representations

- Importing only one row formally would leave the other's distinct subject
  (a vendor-outreach decision vs. a scope-expansion decision) undocumented.
- Treating either row as superseded would misstate the source data: both
  carry `historical_status: active`.

## Verification boundary

This resolution is complete only when the collision registry, formal
records, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions in this batch are resolved
under separate reports; the `DEC-20260507-B` collision's superseded NL row
is documented_only, not a formal record.
