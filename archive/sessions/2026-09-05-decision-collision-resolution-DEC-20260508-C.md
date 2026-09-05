---
doc_type: decision-collision-resolution
collision_id: DEC-20260508-C
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
  - source_page_id: "35a67c87082c81dd8477cdb92d1403f2"
    disposition: formal_record
    record_key: DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2
  - source_page_id: "35a67c87082c8170a19af278e67abd46"
    disposition: formal_record
    record_key: DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46
  - source_page_id: "35a67c87082c817eb9b5d491786dc67b"
    disposition: formal_record
    record_key: DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b
---

# Resolution of historical ID collision `DEC-20260508-C`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

This is a three-row collision, resolved with three formal records, all
historically active:

- The [audit-first template extension decision](https://app.notion.com/35a67c87082c81dd8477cdb92d1403f2)
  becomes `DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2`.
- The [closing-steps Rule 17 decision](https://app.notion.com/35a67c87082c8170a19af278e67abd46)
  becomes `DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46`.
- The [KVK-direct-ineligible / NL reverts-to-Company.info decision](https://app.notion.com/35a67c87082c817eb9b5d491786dc67b)
  becomes `DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b`.

The duplicate display ID remains unchanged for all three sources. A bare
`DEC-20260508-C` is still forbidden as a relationship target.

## Implementation reconciliation

- Neither the audit-first template nor `stop-conditions.md` exists as a
  named file in this repository; whether the specific mtime-based
  write-conflict check and worktree-HEAD-state tripwire these two rows
  describe still run today is unverifiable from files alone. `CLAUDE.md`'s
  Shared-Checkout Rule and Session contract carry a related but not
  identical concurrency-safety mechanism (per-agent worktree isolation
  rather than a per-session mtime or HEAD-state check).
- The KVK-ineligibility row's NL fallback (Company.info) did not ship;
  `manifests/dutch-company-data.yaml` shows Openapi.com WW-Top instead, the
  same pattern found for the `DEC-20260507-B` collision's superseded twin
  and for `DEC-20260512-A`'s KVK Option B closure.

## Rejected representations

- Importing fewer than three rows formally would leave one of three
  distinct subjects (worktree audit tooling, session-start verification,
  and NL vendor eligibility) undocumented.
- Treating any of the three rows as superseded would misstate the source
  data: all three carry `historical_status: active`.

## Verification boundary

This resolution is complete only when the collision registry, formal
records, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions in this batch are resolved
under separate reports.
