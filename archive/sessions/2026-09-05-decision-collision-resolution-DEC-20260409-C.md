---
doc_type: decision-collision-resolution
collision_id: DEC-20260409-C
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
  - source_page_id: "33d67c87082c81c19655cb04fb7d3ecf"
    disposition: formal_record
    record_key: DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf
  - source_page_id: "33d67c87082c81f4a3ffcb774b1d84e4"
    disposition: documented_only
    rationale: "This row's `historical_status` is `superseded` and its own `Superseded By` field names https://app.notion.com/33d67c87082c8118af3bf12a823aa540, which is the source row for the already-merged formal record `DEC-20260409-D.md` (\"Gate 4 (revised): Four-layer solution test pyramid, free-first\"). That record's own evidence list cites exactly this page id, and its own Context section quotes the row's Rationale: \"Supersedes DEC-20260409-C.\" The superseding decision's record therefore already documents this row's retirement; creating a second formal record for near-duplicate content that a merged record already supersedes would misrepresent the collision as two live decisions rather than one retired plan and its replacement."
---

# Resolution of historical ID collision `DEC-20260409-C`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with one formal record and one documented-only row:

- The [earlier, `active` Gate 4 row](https://app.notion.com/33d67c87082c81c19655cb04fb7d3ecf)
  becomes `DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf`.
- The [later, `superseded` twin](https://app.notion.com/33d67c87082c81f4a3ffcb774b1d84e4)
  (created about one minute after the first, with near-identical Rationale
  text) remains `documented_only`. Its own `Superseded By` field points to the
  page that became `DEC-20260409-D`, whose merged record already states
  "Supersedes DEC-20260409-C" in its own Context section, sourced from the
  superseded row's Rationale.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260409-C` is still forbidden as a relationship target. The formal
record carries `related_to` edges to `DEC-20260409-A` (Gate 2) and
`DEC-20260409-B` (code-based lookup + cross-validation), both named
explicitly in the row's own "RELATED:" line and both already existing as
single, non-collided records.

## Implementation reconciliation

This row's own plan (run every solution end-to-end on the scheduler, a
`canonical_test_input` block per solution, daily-cadence scheduled
execution) was itself replaced the same day by `DEC-20260409-D`'s four-layer
pyramid, before this row's specific design shipped. `DEC-20260409-D`'s own,
already-merged Consequences section establishes what actually shipped:
Layer A (static graph checks, `onboarding-gates.ts`) and Layer B
(`apps/api/src/lib/gate4b-solution-dryrun.ts`, headed "Gate 4b — Solution
Dry-Run Composition Check (DEC-20260409-D Layer B)") shipped; Layer C
(piggyback validation) exists as a general mechanism but is not labelled to
either decision; Layer D (the live-execution design this row itself
specifies) was never built. `apps/api/src/jobs/test-scheduler.ts`'s
`weekly-sweep` is a URL/dependency health probe by its own code comment, not
a representative-solution execution layer. `implementation_status` is
`drift-open`: the mechanism this row asked for does not exist, but its
replacement (from the same day) substantially covers the underlying need at
lower cost, so this is a deliberate design pivot, not an unaddressed gap.

## Rejected representations

- Marking the earlier row documented-only, rather than formal, would omit
  the row's own text (Gate 1 through Gate 4 lineage, the SpendLatch incident
  citation) that the superseding decision's own merged record relies on as
  background.
- Creating a second formal record for the superseded twin, given its
  near-identical content and an already-merged successor record naming it by
  supersession, would represent one abandoned plan as two live decisions.
- Editing `DEC-20260409-D` to add a `supersedes` edge back to this
  collision's rows was rejected: this batch does not edit any existing
  record, and `DEC-20260409-D`'s own merged Context section already states
  why it could not target `DEC-20260409-C` at the time it was written (no
  record existed for the bare id). This resolution closes that gap by
  creating the record, without retroactively editing the protected one.

## Verification boundary

This resolution is complete only when the collision registry, the formal
record, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
