---
doc_type: decision-collision-resolution
collision_id: DEC-20260420-E
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
  - source_page_id: "34867c87082c81b590b4e8bee4b59228"
    disposition: formal_record
    record_key: DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228
  - source_page_id: "34867c87082c81d5a898f48cc1554086"
    disposition: formal_record
    record_key: DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086
---

# Resolution of historical ID collision `DEC-20260420-E`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [F-A-005 free-tier transaction lookup redaction row](https://app.notion.com/34867c87082c81b590b4e8bee4b59228)
  becomes `DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228`.
- The ["Product architecture and first wedge" row](https://app.notion.com/34867c87082c81d5a898f48cc1554086)
  becomes `DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086`.

The F-A-005 row carries relations to `DEC-20260420-A` and to this batch's
own formal record for the SA.2b PII classification collision
(`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600`), both named
explicitly in its own "Prior DECs" reference list. The "Product architecture
and first wedge" row's export carries a title only (`Rationale` and
`Outcome` both null), so it names no other decision and carries no
relations. The duplicate display ID remains unchanged for both sources. A
bare `DEC-20260420-E` is still forbidden as a relationship target.

## Implementation reconciliation

**F-A-005 shipped and is the live mechanism today.**
`apps/api/src/routes/transactions.ts` carries the comment "F-A-005: explicit
body redaction marker. input, output, error, ..." at the `body_redacted`
construction and "F-A-005: Unauthenticated lookups return a redacted
envelope — body fields" at the branch that builds it, matching the row's
always-redact, asymmetric-marker, 200-status design exactly. The verify
endpoint carve-out this row specified is preserved, now under the tighter
depth/rate-limit hardening this batch's `DEC-20260420-G` (F-A-012)
resolves. `implementation_status` is `verified` for this row.

**"Product architecture and first wedge" cannot itself be verified against
a code artefact**, since its export carries no Rationale describing what
architecture or wedge it names. The nearest dated evidence is
`docs/strategy/2026-08-05-direction-plan.md`'s Part Two "Positioning"
subsection (a different, later wedge-selection exercise for a secondary,
gated compliance-vertical track) and `DEC-20260812-A`'s statement that the
direction plan's Part One supersedes the Counterparty Assurance framing
this row's contemporary neighbours describe. This record does not equate
this row's unstated wedge with either later document; `implementation_status`
for the collision as a whole is `verified`, reflecting the technical row's
demonstrable shipped state, with the product row's own record noting its
Consequences are inferential.

## Grep of existing records for the bare collided id

`DEC-20260420-E` is named once in `docs/decisions/records/DEC-20260503-A.md`:
"The source page also says this decision extends the product decision
filed as `DEC-20260502-A` and refines `DEC-20260420-E`, `DEC-20260420-F`,
and `DEC-20260420-H`. Each of those historical IDs is reused by a different
Notion row. Their structured amendment edges are therefore withheld and
preserved as unresolved source-ID collisions rather than aimed at an
ambiguous target." No other existing record or CLAUDE.md names
`DEC-20260420-E`. `DEC-20260503-A.md`'s statement is now stale prose (this
collision resolves in this batch); `corrects_migration_state_in` stays `[]`
because `REQUIRED_COLLISION_MIGRATION_CORRECTIONS` in
`scripts/decision-records-lib.mjs` is a hardcoded map with only
`DEC-20260502-A → [DEC-20260812-A]` today, and this batch does not touch
`scripts/`. See this batch's `DEC-20260420-H` resolution report for the
full three-collision analysis of `DEC-20260503-A.md`'s stale statement.

## Rejected representations

- Marking the "Product architecture and first wedge" row documented-only
  would require an evidence-backed rationale this batch does not have (its
  export is a title with no Rationale or Outcome, and it is not superseded);
  the rule for a null-content active row is a formal record whose Context
  states the gap honestly, not a manufactured documented-only disposition.
- Treating the F-A-005 row's "Prior DECs" bibliography line as identifying
  its collision-sibling ("Product architecture and first wedge") rather than
  the SA.2b PII classification row would be a misreading: the line names
  "DEC-20260420-D (SA.2b PII classification)" by its actual subject, which
  matches only the technical sibling of that other collision, not this
  collision's product row.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
