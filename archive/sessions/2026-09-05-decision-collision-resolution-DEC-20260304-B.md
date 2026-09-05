---
doc_type: decision-collision-resolution
collision_id: DEC-20260304-B
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
  - source_page_id: "31967c87082c81dda9c4f43b5b7674b3"
    disposition: formal_record
    record_key: DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3
  - source_page_id: "31867c87082c81a4b2f7ccdd52b99b1e"
    disposition: formal_record
    record_key: DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e
---

# Resolution of historical ID collision `DEC-20260304-B`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [kill-DIY-calculator decision](https://app.notion.com/31967c87082c81dda9c4f43b5b7674b3)
  becomes `DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3`.
- The [stats-bar-swap decision](https://app.notion.com/31867c87082c81a4b2f7ccdd52b99b1e)
  becomes `DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260304-B` is still
forbidden as a relationship target.

## Implementation reconciliation

**Kill the DIY calculator.** A grep for `calculator`, `Calculator`, and
`Compare with DIY` across the frontend `src/` tree returns no matches;
the feature was never built. `SuggestRecommendation` carries no
`component_sum_cents` field in
`strale-io/strale-frontend@04c9fca9:src/types/index.ts`, matching the
row's specific removal instruction. A `component_sum_cents` field does
exist on the unrelated `SolutionDetail` shape, but is not rendered
anywhere checked, and is not the interface this row named.

**Stats bar swap.** `strale-io/strale-frontend@04c9fca9:src/components/StatsStrip.tsx`
carries no "Countries" stat in any form. The stat is not literally
labelled "15 Solutions" today (it reads "workflows," hardcoded, per a
later cert-audit drift-prevention comment in the same component), but
the row's underlying principle (no geographic-verticals stat; concrete,
verifiable, or explicitly-flagged-placeholder numbers) still holds.

## Rejected representations

- Marking either row documented-only would omit two still-verifiable,
  independently live product decisions.
- Inventing a supersession edge between the two rows would be false: they
  describe unrelated homepage changes decided the same day.
- Merging the two rows into one record would misrepresent two distinct
  subjects as one decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge;
an independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
