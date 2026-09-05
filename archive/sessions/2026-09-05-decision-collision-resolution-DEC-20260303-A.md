---
doc_type: decision-collision-resolution
collision_id: DEC-20260303-A
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
  - source_page_id: "31867c87082c813198e2da8e3d02b531"
    disposition: formal_record
    record_key: DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531
  - source_page_id: "31867c87082c812dba47c52f4f36ca33"
    disposition: formal_record
    record_key: DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33
---

# Resolution of historical ID collision `DEC-20260303-A`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [Problem→Solution SVG-diagram decision](https://app.notion.com/31867c87082c813198e2da8e3d02b531)
  becomes `DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531`.
- The [smart-input discovery UX decision](https://app.notion.com/31867c87082c812dba47c52f4f36ca33)
  becomes `DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260303-A` is still
forbidden as a relationship target.

## Implementation reconciliation

**Problem→Solution SVG diagrams.**
`strale-io/strale-frontend@04c9fca9:src/components/ProblemSection.tsx`
imports `TodayDiagram` and `StraleDiagram` from `src/components/problem/`
alongside `VerdictChips`, and defines `painChips`/`benefitChips` bullet
arrays; no code block appears in this component, matching the row.

**Smart-input discovery UX.** `apps/api/src/routes/suggest.ts` defines
both `GET /v1/suggest/typeahead` and `POST /v1/suggest`, matching the
row's claim that the homepage input maps directly to the same endpoint
agents use. `strale-io/strale-frontend@04c9fca9:src/components/solutions/SearchHero.tsx`
rotates placeholder queries; `RecommendationCard.tsx` renders the exact
follow-up text "Not what you need? Tell me more →" and a "Copy code"
action, consistent with the row's named UX details.

## Rejected representations

- Marking either row documented-only would omit two still-verifiable,
  independently live UX decisions.
- Inventing a supersession edge between the two rows would be false: they
  describe two different homepage sections decided the same day, with no
  source-stated relationship to each other.
- Merging the two rows into one record would misrepresent two distinct
  subjects as one decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge;
an independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
