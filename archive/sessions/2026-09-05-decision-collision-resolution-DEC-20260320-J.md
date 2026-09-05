---
doc_type: decision-collision-resolution
collision_id: DEC-20260320-J
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
  - source_page_id: "32967c87082c8177a82be21d48f57411"
    disposition: formal_record
    record_key: DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411
  - source_page_id: "32967c87082c8192b920f8d8cfb40aa7"
    disposition: formal_record
    record_key: DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7
---

# Resolution of historical ID collision `DEC-20260320-J`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [dynamic methodology counts decision](https://app.notion.com/32967c87082c8177a82be21d48f57411)
  becomes `DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411`.
- The [pep-check transparency-tag choice](https://app.notion.com/32967c87082c8192b920f8d8cfb40aa7)
  becomes `DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260320-J` is still
forbidden as a relationship target.

## Implementation reconciliation

**Dynamic methodology counts.** `apps/api/src/lib/platform-facts.ts`
computes capability and solution counts from the database rather than a
constant, matching the row's rule. Its own header comment independently
documents a further drift instance beyond the row's two named ones ("
free-tier list: 5 in marketing, 11 in manifests, 5 different in
production"). The current frontend Methodology page
(`strale-io/strale-frontend@04c9fca9:src/pages/Methodology.tsx`) does not
display capability, solution, or test-suite counts at all, so the row's
specific named defect (stale counts on that page) cannot recur there
today, though this report cannot confirm whether that is because the row's
fix was applied and later the counts were removed, or because they were
never added to this particular page.

**pep-check transparency tag.** `manifests/pep-check.yaml` declares
`transparency_tag: algorithmic` today, matching neither of the row's two
named values (`mixed`, the row's chosen substitute, or `commercial_data`,
the row's rejected value). No commit or later decision record in this
repository documents the further change from `mixed` to `algorithmic`.

## Rejected representations

- Marking either row documented-only would omit an architecturally
  implemented rule (live-computed counts) and a still-live manifest field
  whose value has independently drifted from what the row records.
- Inventing a supersession edge for the pep-check tag's later change to
  `algorithmic` would invent a decision ID this repository does not
  record.
- Merging the two rows into one record would misrepresent two distinct
  subjects (a public-copy accuracy rule and a single capability's manifest
  field) as one decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
