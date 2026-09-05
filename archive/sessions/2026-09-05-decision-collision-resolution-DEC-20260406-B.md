---
doc_type: decision-collision-resolution
collision_id: DEC-20260406-B
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
  - source_page_id: "33967c87082c8103becfe4900a1ff319"
    disposition: formal_record
    record_key: DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319
  - source_page_id: "33a67c87082c81629339d9f208f65f52"
    disposition: formal_record
    record_key: DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52
---

# Resolution of historical ID collision `DEC-20260406-B`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [nested field reference resolution fix](https://app.notion.com/33967c87082c8103becfe4900a1ff319)
  becomes `DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319`.
- The [Notion workspace restructure around the Operating Manual](https://app.notion.com/33a67c87082c81629339d9f208f65f52)
  becomes `DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260406-B` is still
forbidden as a relationship target.

## Implementation reconciliation

**Nested field reference resolution.** `apps/api/src/lib/solution-executor.ts`
exports `parsePath()` and `walkPath()`, and `resolveInputRef()`'s doc
comment states support for "`$input.<path>` → walk path from inputs
(supports nested: `$input.company.name`)" and "`$steps[N].<path>` → walk
path from `completedSteps[N]` (supports nested: `$steps[0].license.spdx`)",
which matches the row's named `dependency-risk-check` example exactly.

**Notion workspace restructure.** CLAUDE.md's current "Notion Workspace
Structure (8 sections under Project Home)" describes an 8-section layout
(🏠 Start Here through ⚙️ How we work) with no "Operating Manual" page
named and a different organizing principle from the row's four-layer
model (canonical pages / databases / archives / not-Strale). This report
cannot determine from the repository alone whether the 8-section
structure supersedes, coexists with, or postdates this row's restructure
inside Notion; CLAUDE.md is this repository's only readable trace of it.
Separately, operating governance has since moved substantially into the
repository (`docs/company/CHARTER.md`, `docs/programs/README.md`), a
shift this row's Notion-only restructure predates and did not anticipate.

## Rejected representations

- Marking either row documented-only would omit a still-live code fix and
  a historical governance restructure whose stated diagnosis (drift,
  archival gaps, ledger decay) remains a legitimate historical record even
  though the current structure differs from what it built.
- Treating CLAUDE.md's 8-section structure as proof the row's restructure
  never happened would overreach past what a repository-only search can
  establish about Notion's actual current page tree.
- Merging the two rows into one record would misrepresent two distinct
  subjects (a solution-executor bug fix and a Notion workspace
  restructure) as one decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
