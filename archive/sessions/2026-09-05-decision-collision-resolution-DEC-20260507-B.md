---
doc_type: decision-collision-resolution
collision_id: DEC-20260507-B
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
  - source_page_id: "35967c87082c81ec9db7cba5b6fecb76"
    disposition: formal_record
    record_key: DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76
  - source_page_id: "35967c87082c81f38091f6afba337a8a"
    disposition: documented_only
    rationale: This row's `Status` is `superseded` and its own `Superseded By` field names
      https://app.notion.com/35a67c87082c817eb9b5d491786dc67b, the row that became
      `DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b` in this same batch (its own Rationale
      confirms it supersedes this row "for the eligibility question"). No formal record is created for
      a row the source data itself marks superseded.
---

# Resolution of historical ID collision `DEC-20260507-B`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with one formal record and one documented-only
row:

- The [closing-steps Rule 16 decision](https://app.notion.com/35967c87082c81ec9db7cba5b6fecb76)
  becomes the active source-qualified formal record
  `DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76`.
- The [NL dutch-company-data KVK-direct decision](https://app.notion.com/35967c87082c81f38091f6afba337a8a)
  remains preserved in the registry as `documented_only`. Its historical
  status is `superseded`, and its own `Superseded By` field names the row
  that became `DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b` in
  this same batch, whose own Rationale confirms it supersedes this row "for the eligibility question."

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260507-B` is still forbidden as a relationship target.

## Implementation reconciliation

- The Rule 16 self-merge decision's substance is carried forward at the
  operating-charter level: `CLAUDE.md` states "**Shipping is never Petter's decision** — the session that opens a PR merges it and reports afterwards in plain English;" under `DEC-20260815-A`, the same self-merge posture
  this row established as a numbered closing-steps rule.
- The superseded NL KVK-direct row never shipped: `manifests/dutch-company-data.yaml`
  declares `data_source: Openapi.com WW-Top`, not KVK direct, consistent
  with the eligibility this row proposed having been closed by
  `DEC-20260508-C`.

## Citations of the bare id in code

`apps/api/src/capabilities/auto-register.ts` line 166 says "Openapi is the
licensed-aggregator path per DEC-20260507-B". That citation means the
superseded NL row (KVK direct API replaced by an aggregator path), not the
Rule 16 self-merge row; the code comment predates this resolution and the
bare id stays prose there.

## Rejected representations

- Formally recording the superseded NL row would create a second competing
  record for a decision the source data itself says was replaced.
- Treating the Rule 16 row as anything other than active would misstate the
  source data.

## Verification boundary

This resolution is complete only when the collision registry, formal
record, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions in this batch are resolved
under separate reports.
