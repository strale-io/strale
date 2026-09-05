---
doc_type: decision-collision-resolution
collision_id: DEC-20260405-B
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
  - source_page_id: "34a67c87082c810692c8dd4374a6f9ac"
    disposition: formal_record
    record_key: DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac
  - source_page_id: "33967c87082c810c920dd09d78aa06b6"
    disposition: formal_record
    record_key: DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6
---

# Resolution of historical ID collision `DEC-20260405-B`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [credit-report-summary deactivation decision](https://app.notion.com/34a67c87082c810692c8dd4374a6f9ac)
  becomes `DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac`.
- The [solution execution transaction storage model decision](https://app.notion.com/33967c87082c810c920dd09d78aa06b6)
  becomes `DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260405-B` is still
forbidden as a relationship target.

## Stale prose reference in an existing record

`docs/decisions/records/DEC-20260405-A.md`'s Context section names this
collision in prose: "Phase 4, a separate decision on
`credit-report-summary` (`DEC-20260405-B`, no formal record exists for
that id on `main` and it is not in `docs/decisions/id-collisions.yaml`,
so it is mentioned here in prose only)." That statement accurately
described the earlier M2 migration state before this batch; it is not
current after this atomic resolution, which creates a formal record for
this id and records the collision in `docs/decisions/id-collisions.yaml`.
`DEC-20260405-A.md` is protected and was not edited; the correction is
recorded here in prose. This is not the `corrects_migration_state_in`
mechanism exercised by `DEC-20260502-A` (that mechanism is scoped by this
repository's generator to a specific hardcoded pairing and this
collision is not in it); `corrects_migration_state_in` is left empty on
this report accordingly. `DEC-20260405-A`'s product substance (the
Bolagsverket migration decision) is unaffected.

## Implementation reconciliation

**credit-report-summary deactivation.** `apps/api/src/capabilities/auto-register.ts`'s
`DEACTIVATED` map carries a `"credit-report-summary"` entry citing this
decision ID directly ("DEC-20260405-B / DEC-20260422-SE-D"), matching the
row's title exactly. `manifests/credit-report-summary.yaml` still exists
on disk, declaring the pre-deactivation Allabolag.se scrape source; the
manifest was not deleted, and `DEACTIVATED` is the mechanism preventing
its executor from registering.

**Solution execution transaction storage model.** `apps/api/src/db/schema.ts`
defines nullable `capabilityId` and `solutionSlug` columns directly on
`transactions`, matching Variant A1 exactly; no `solution_executions`,
`solution_run`, or `parent_transaction` table exists. A later migration
block's own comment (block 0101, written for an unrelated purpose)
independently confirms the shape in production: "694 solution rows, all
with a null `capability_id`." No named database-level XOR `CHECK`
constraint was located in `schema.ts` or `startup-migrations.ts`; if the
constraint exists, it is enforced at the application layer.

## Rejected representations

- Editing `DEC-20260405-A.md` to remove its now-stale prose reference
  would violate protected-record immutability; the correction is recorded
  forward in this report instead.
- Marking either row documented-only would omit a still-live deactivation
  and a still-live storage model that this batch could verify in the
  code.
- Inventing a supersession edge between the two `DEC-20260405-B` rows
  would be false: they are unrelated decisions, seventeen days apart, that
  happen to share a display ID.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
