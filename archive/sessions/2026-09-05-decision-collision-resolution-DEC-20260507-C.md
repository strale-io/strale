---
doc_type: decision-collision-resolution
collision_id: DEC-20260507-C
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
  - source_page_id: "35967c87082c81f187e7f1881a6d74c4"
    disposition: formal_record
    record_key: DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4
  - source_page_id: "35967c87082c817cad56ec58c707d895"
    disposition: formal_record
    record_key: DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895
---

# Resolution of historical ID collision `DEC-20260507-C`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with two formal records, both historically active:

- The [branch protection decision](https://app.notion.com/35967c87082c81f187e7f1881a6d74c4)
  becomes `DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4`.
- The [IT/ES/PT/AT Openapi PAYG cohort decision](https://app.notion.com/35967c87082c817cad56ec58c707d895)
  becomes `DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895`.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260507-C` is still forbidden as a relationship target.

## Implementation reconciliation

- Branch protection is a GitHub repository setting, not a tracked file, so
  this repository cannot independently confirm it today. `CLAUDE.md`'s
  session contract states `main` changes only through reviewed PRs and that
  pre-push refuses a direct push, consistent with the assumption still
  holding.
- The Openapi PAYG cohort default holds for Italy and Portugal
  (`manifests/italian-company-data.yaml` and
  `manifests/portuguese-company-data.yaml` both declare an Openapi.com
  Tier-3 `data_source`), but not for Spain (shipped on OpenMercantil.es,
  Tier-2) or Austria (shipped on JustizOnline, a direct government API).
  `config/env-manifest.yaml`'s `OPENAPI_ENABLED` row confirms the resolver
  is still gated off in production pending the case-151296 resale-addendum
  countersignature this row named as critical.

## Rejected representations

- Importing only one row formally would leave the other's distinct subject
  (a CI-security decision vs. a vendor-sourcing decision) undocumented.
- Treating either row as superseded would misstate the source data: both
  carry `historical_status: active`.

## Verification boundary

This resolution is complete only when the collision registry, formal
records, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions in this batch are resolved
under separate reports.
