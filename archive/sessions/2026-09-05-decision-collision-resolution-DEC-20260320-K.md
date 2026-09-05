---
doc_type: decision-collision-resolution
collision_id: DEC-20260320-K
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
  - source_page_id: "32967c87082c81e890bfe564a3c2e917"
    disposition: formal_record
    record_key: DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917
  - source_page_id: "32967c87082c818e8cbbc29a3a0c1bed"
    disposition: formal_record
    record_key: DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed
---

# Resolution of historical ID collision `DEC-20260320-K`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [free-tier showcase-protection decision](https://app.notion.com/32967c87082c81e890bfe564a3c2e917)
  becomes `DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917`.
- The [KYB + Invoice Verify implementation-complete row](https://app.notion.com/32967c87082c818e8cbbc29a3a0c1bed)
  becomes `DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260320-K` is still
forbidden as a relationship target.

## Implementation reconciliation

**Free-tier showcase protection.** The free-tier list today has 11
capabilities per CLAUDE.md, not the row's 5; `apps/api/src/lib/platform-facts.ts`'s
header independently corroborates a free-tier count drift class ("5 in
marketing, 11 in manifests, 5 different in production") observed at the
2026-04-30 cert audit. The row's named mechanism, an SQS-90 threshold and
trend-based meta-monitor, no longer exists: CLAUDE.md records the SQS
scoring engine was deleted per DEC-20260503-B, including "the automatic
lifecycle transitions." `iban-validate`, the row's named example, remains
free-tier today.

**KYB + Invoice Verify implementation complete.** The three named
capabilities (`pep-check`, `adverse-media-check`, `risk-narrative-generate`)
exist on `main` and match the row. The 60 named solutions do not appear in
`apps/api/src/db/solution-catalogue.ts`, the sole current source
`seed-solutions.ts` upserts from (split out from it on 2026-08-16); they
were written by a separate, one-off script,
`apps/api/scripts/seed-kyb-solutions.ts`, whose template-built slugs were
never captured when the catalogue was split. Two later retirement scripts,
`drop-aggregator-kyb.ts` (15 solutions) and `drop-sg-kyb.ts` (3
solutions), confirm 18 of the row's 60 were deliberately soft-deactivated
by name, leaving 42 unaccounted for in any file this repository can read.
This report cannot prove from source alone whether the seeding script was
ever run against production or whether the remaining rows are still
`is_active`; CLAUDE.md's "New solutions (March 2026)" section still lists
the family unchanged, which is not independent confirmation of current
database state.

## Rejected representations

- Marking either row documented-only would omit a historical decision whose
  named subjects (capabilities, an SQS-90 rule, 60 solutions) are only
  partially reconcilable with the repo today, not fully contradicted.
- Treating the KYB/Invoice Verify solution-count gap as proof the row's
  decision never happened would overreach past what a static-source search
  can establish about a live database; the report states the gap as
  unresolved drift, not as a false historical claim.
- Merging the two rows into one record would misrepresent two distinct
  subjects (a free-tier reliability rule and a solution-catalog completion
  status) as one decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
