---
doc_type: decision-collision-resolution
collision_id: DEC-20260421-A
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
  - source_page_id: "34867c87082c81babd35eba5856ded79"
    disposition: formal_record
    record_key: DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79
  - source_page_id: "34967c87082c813c825cc3e4dca30a98"
    disposition: formal_record
    record_key: DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98
---

# Resolution of historical ID collision `DEC-20260421-A`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [Cluster 2 Phase 3 C1/C2 split row](https://app.notion.com/34867c87082c81babd35eba5856ded79)
  becomes `DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79`.
- The [Payee Assurance single-field input-spec row](https://app.notion.com/34967c87082c813c825cc3e4dca30a98)
  becomes `DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98`.

The input-spec row carries a `related_to` edge to
`DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1` (its own "extends
DEC-20260420-G, which established entity resolution as the highest-priority
engineering investment" citation, an exact title match to the "Entity
resolution as priority engineering investment" record, not its
DoS-hardening sibling). The C1/C2 split row's own text names no other
Decision ID (only "DEC-20260420-M," a design-doc reference with no record
or registry entry, recorded as prose only). The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260421-A` is still
forbidden as a relationship target.

## Implementation reconciliation

**Cluster 2 is tracked in this repository as an audit-report series, not a
Decision record.** `archive/sessions/audit-reports/cluster_2_design.md`
("Cluster 2 Design: Unified Onboarding Engine"),
`2026-04-20-phase-3-validation.md`, and `2026-04-20-phase-4b-audit.md`
document the same workstream this row's C1/C2 split belongs to. The C1/C2
hook-placement work this row's C2 commit describes was itself corrected by
this batch's `DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d`
record: C1 placed the hook inside `db.transaction`; the fix (outside the
transaction) shipped in C2. `apps/api/src/lib/capability-persistence.ts`
confirms the corrected, outside-transaction placement is live today.

**No dedicated "entity resolution engine" module exists under that name.**
A search of `apps/api/src` finds no company-name entity-resolution
capability; the one "entity resolution" hit in
`apps/api/src/db/solution-catalogue.ts` is unrelated web3 wallet-identity
resolution. This record does not confirm whether the single-field
sandbox input this row's sibling record describes shipped on the current
production frontend, out of scope for this pass. `implementation_status`
is `drift-open`: the engineering split (C1/C2) verifiably shipped and was
itself corrected; the input-spec commitment's downstream product state is
unconfirmed.

## Rejected representations

- Adding a relation edge between this collision's two rows was rejected:
  neither row's own text names the other by id or by a matching mechanism.
- Targeting `DEC-20260420-M` with a relation edge was rejected: it has no
  record or collision-registry entry in this repository.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
