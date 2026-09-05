---
doc_type: decision-collision-resolution
collision_id: DEC-20260420-D
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
  - source_page_id: "34867c87082c81f0827eedf29d133600"
    disposition: formal_record
    record_key: DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600
  - source_page_id: "34867c87082c81409ee0d6c992ce3d43"
    disposition: documented_only
    rationale: "This row carries the identical title to its sibling, \"SA.2b per-capability PII classification...\" (both `historical_status: active`). Per this batch's duplicate-title rule, the earlier-created page is the formal record and this later page (created about one minute after) is documented-only as a duplicate entry, with the field-by-field comparison below."
---

# Resolution of historical ID collision `DEC-20260420-D`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both rows carry the identical title "SA.2b per-capability PII
classification: manifest-declared field + 12-value category enum +
heuristic fallback during backfill + blocking gate for new capabilities +
15/15 top backfill shipped" and identical `historical_status: active`.
Per this batch's duplicate-title rule (rule 3), the earlier-created page is
the formal record and the later page is documented-only:

- The [earlier row](https://app.notion.com/34867c87082c81f0827eedf29d133600)
  (`createdTime: 2026-04-20 10:18:24Z`) becomes
  `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600`.
- The [later row](https://app.notion.com/34867c87082c81409ee0d6c992ce3d43)
  (`createdTime: 2026-04-20 10:19:23Z`, 59 seconds after) remains
  `documented_only` as a duplicate entry.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260420-D` is still forbidden as a relationship target.

## Field-by-field comparison

Both rows' `Decision`, `Status`, `Scope`, `Confidence`, `Source`, and
`Date` fields are byte-identical. The `Rationale` fields differ only in
minor wording, punctuation, and reference-list formatting, never in
decision substance:

- The earlier row uses straight quotation marks throughout (`"processed at
  any stage"`); the later row uses curly quotation marks in the same
  places (`"processed at any stage"` rendered with typographic quotes) and
  adds one clarifying parenthetical the earlier row lacks ("e.g. separate
  `processes_pii_in_input` / `..._in_output`").
- The later row's OQ #3 adds the word "fine" at one sentence's end ("lower
  call volume, SA.2b.c will handle them fine" versus the earlier row's
  "...will handle them.").
- The References section is formatted as one flowing paragraph in the
  earlier row and as a bulleted list in the later row, with one additional
  line in the later row explicitly naming "Audit source:
  audit-reports/SA_2b_a_audit.md (untracked, local) and
  SESSION_A_audit_findings.md (tracked, 5927bfb) for F-A-003/F-A-009/F-A-004
  verbatim", content the earlier row's paragraph form also references, but
  less explicitly labelled.
- The closing section is headed "## Outcome" in the earlier row and
  "## Outcome (retrospective)" in the later row; both contain the same
  substance (four CC sessions, ~5 hours, zero rollbacks, three manifest
  drift classes discovered).

No difference changes what was decided, only how the same decision's
supporting text was phrased and organized between two Notion pages created
59 seconds apart, evidently duplicate saves of the same session's output.

## Implementation reconciliation

The decision shipped and is the live gate today, beyond what either row's
text describes as complete: all 342 manifests under `manifests/*.yaml` now
declare `processes_personal_data` (not just the 15 this row's own text
names as classified), 127 also declare `personal_data_categories`, and
`apps/api/src/lib/audit-helpers.ts` states the `detectPersonalData`
heuristic "was removed after migration 0050" (SA.2b.d). The row's own
backfill-window fallback no longer exists because the backfill it gated
completed. `apps/api/src/lib/onboarding-gates.ts` still enforces
`PII_CATEGORY_ENUM` exactly as this row specifies. `implementation_status`
is `verified`.

## Grep of existing records for the bare collided id

`DEC-20260420-D` is named in no existing record under
`docs/decisions/records/*.md` and not in CLAUDE.md, other than this batch's
own new formal records for `DEC-20260420-E`, `DEC-20260420-F`, and
`DEC-20260420-G`, which relate to this collision's own formal record by its
source-qualified key (never the bare id). `corrects_migration_state_in` is
`[]`.

## Rejected representations

- Creating two formal records for byte-for-byte duplicate decision content
  would misrepresent one decision, saved twice, as two live decisions.
- Choosing the later-created page as the formal record, rather than the
  earlier one, would contradict this batch's own duplicate-title rule
  without a substantive reason (the content difference favours neither
  page).
- Marking both rows documented-only would drop the only formal record of a
  decision that demonstrably shipped and is still enforced in the codebase.

## Verification boundary

This resolution is complete only when the collision registry, the formal
record, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
