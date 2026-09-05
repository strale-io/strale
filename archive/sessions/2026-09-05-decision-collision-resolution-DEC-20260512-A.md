---
doc_type: decision-collision-resolution
collision_id: DEC-20260512-A
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
  - source_page_id: "35e67c87082c8122a29ef35f256d5958"
    disposition: formal_record
    record_key: DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958
  - source_page_id: "35e67c87082c8188a014f4b1f963cf77"
    disposition: formal_record
    record_key: DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77
---

# Resolution of historical ID collision `DEC-20260512-A`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with two formal records, both historically active:

- The [KVK Option B closure decision](https://app.notion.com/35e67c87082c8122a29ef35f256d5958)
  becomes `DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958`.
- The [scheduler cost-class quota decision](https://app.notion.com/35e67c87082c8188a014f4b1f963cf77)
  becomes `DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77`.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260512-A` is still forbidden as a relationship target.

## Implementation reconciliation

- The KVK Option B closure row's foreclosure of the Company.info partner
  path is consistent with Dutch company data shipping on Openapi.com
  WW-Top instead of any KVK-affiliated channel.
- The scheduler cost-class row's mechanism is verified in force:
  `apps/api/src/jobs/test-scheduler.ts` gates scheduling on `cost_class`,
  and `apps/api/src/lib/startup-migrations.ts` carries the named Block
  0069 reconciliation comment. `CLAUDE.md`'s Capabilities & Quality section
  separately documents an `external_cost_cents`-based reconciliation of
  `scheduled_testing_eligible`, which is not the same mechanism as this
  row's `cost_class` gate; both appear to coexist in the current codebase.

## Citations of the bare id in code

`apps/api/src/capabilities/auto-register.ts` line 164 says "DEC-20260512-A: Mirjam
Boele confirmed KVK partner status" and the next line continues "is closed
to foreign EU entities". That citation means the KVK Option B row
(`DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958`), not the
scheduler cost-class row; the code comment predates this resolution and
the bare id stays prose there.

## Rejected representations

- Importing only one row formally would leave the other's distinct subject
  (a vendor-eligibility decision vs. a scheduler-infrastructure decision)
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
