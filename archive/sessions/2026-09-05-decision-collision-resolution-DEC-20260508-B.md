---
doc_type: decision-collision-resolution
collision_id: DEC-20260508-B
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
  - source_page_id: "35a67c87082c814bbb8df7036fccf8e1"
    disposition: formal_record
    record_key: DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1
  - source_page_id: "35a67c87082c8119a22bf1414e307e5f"
    disposition: formal_record
    record_key: DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f
---

# Resolution of historical ID collision `DEC-20260508-B`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with two formal records, both historically active:

- The [canonical worktree structure decision](https://app.notion.com/35a67c87082c814bbb8df7036fccf8e1)
  becomes `DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1`.
- The [aggregator provenance posture decision](https://app.notion.com/35a67c87082c8119a22bf1414e307e5f)
  becomes `DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f`.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260508-B` is still forbidden as a relationship target.

## Implementation reconciliation

- The worktree-structure row's two-worktree naming convention
  (`strale-work` / `strale-research`, both detached HEAD) has been extended
  by a per-track worktree convention: `CLAUDE.md`'s session contract now
  requires "one batch worktree (`strale-wt-<track>`)" per agent, and its
  Shared-Checkout Rule requires worktree isolation for any file-editing
  agent. `WORKTREES.md` still exists at the repo root as the operational
  doc this row named.
- The provenance-posture row's aggregator-vs-register naming rule is
  consistent with `manifests/italian-company-data.yaml`'s attribution-string
  provenance note, and compatible with (though not a formal relation to)
  `docs/decisions/records/DEC-20260428-A.md`'s vendor-mediated provenance
  requirement.

## Rejected representations

- Importing only one row formally would leave the other's distinct subject
  (a local-tooling decision vs. a data-provenance decision) undocumented.
- Treating either row as superseded would misstate the source data: both
  carry `historical_status: active`.

## Verification boundary

This resolution is complete only when the collision registry, formal
records, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions in this batch are resolved
under separate reports.
