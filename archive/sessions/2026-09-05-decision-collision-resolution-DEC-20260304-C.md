---
doc_type: decision-collision-resolution
collision_id: DEC-20260304-C
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
  - source_page_id: "31967c87082c815cb440e586e783df0a"
    disposition: formal_record
    record_key: DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a
  - source_page_id: "31867c87082c810197f9efa520332024"
    disposition: formal_record
    record_key: DEC-20260304-C--notion-31867c87082c810197f9efa520332024
---

# Resolution of historical ID collision `DEC-20260304-C`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [no-false-confidence rule decision](https://app.notion.com/31967c87082c815cb440e586e783df0a)
  becomes `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a`.
- The [trust-card monitoring-dashboard redesign decision](https://app.notion.com/31867c87082c810197f9efa520332024)
  becomes `DEC-20260304-C--notion-31867c87082c810197f9efa520332024`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260304-C` is still
forbidden as a relationship target.

## Implementation reconciliation

**No false confidence.**
`strale-io/strale-frontend@04c9fca9:src/lib/trust-display.ts` defines
`getTrustDisplayState()` with a header comment mandating every trust-
rendering component call it first, matching the row's named frontend
guard. A literal `data_confidence` field was not found on
`apps/api/src/routes/public-trust.ts` or
`apps/api/src/lib/trust-grade.ts`; instead, `trust-grade.ts` computes a
combined grade as the worst of SQS, freshness, and latency grades, a
more granular successor mechanism to the row's named single field. This
is why this collision's implementation status is `drift-open` rather
than `verified`: the frontend guard is confirmed exactly as named, the
backend field is not confirmed under its named identifier.

**Trust card redesign.**
`strale-io/strale-frontend@04c9fca9:src/components/solutions/TestRunLog.tsx`
renders a monospace, pass-rate-accented, bordered log format consistent
with the row's dashboard-panel direction. This record could not
independently confirm every named visual detail (a sparkline element, an
exact border-weight change, or the removal of an "Example" label) as
discrete elements in the components checked.

## Rejected representations

- Marking either row documented-only would omit two still-relevant trust-
  display decisions with partial, evidenced implementation today.
- Inventing a supersession edge between the two rows would be false: they
  describe two related but source-distinct trust-display decisions made
  the same day, with no source-stated relationship between them.
- Merging the two rows into one record would misrepresent two distinct
  subjects (a display rule and a card redesign) as one decision.
- Overstating the backend anomaly-detection mechanism as an exact match
  to the row's named `data_confidence` field would misrepresent the
  verified evidence; the successor mechanism is reported honestly
  instead.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge;
an independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
