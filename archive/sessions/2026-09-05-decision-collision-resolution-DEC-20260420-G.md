---
doc_type: decision-collision-resolution
collision_id: DEC-20260420-G
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
  - source_page_id: "34867c87082c81dcafe3dea59cc119b1"
    disposition: formal_record
    record_key: DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1
  - source_page_id: "34867c87082c81c38c3acaca5d01d6ef"
    disposition: formal_record
    record_key: DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef
---

# Resolution of historical ID collision `DEC-20260420-G`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The ["Entity resolution as priority engineering investment" row](https://app.notion.com/34867c87082c81dcafe3dea59cc119b1)
  becomes `DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1`.
- The [F-A-012 verify endpoint DoS hardening row](https://app.notion.com/34867c87082c81c38c3acaca5d01d6ef)
  becomes `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef`.

The F-A-012 row carries relations to `DEC-20260420-A` and to this batch's
own formal records for the SA.2b PII classification, F-A-005, and F-A-006/007
collisions (`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600`,
`DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228`,
`DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b`), all named
explicitly in its own "Prior DECs" reference list. "Entity resolution as
priority engineering investment"'s export carries a title only
(`Rationale` and `Outcome` both null), so it names no other decision and
carries no relations. The duplicate display ID remains unchanged for both
sources. A bare `DEC-20260420-G` is still forbidden as a relationship
target.

## Implementation reconciliation

**F-A-012 shipped and is the live configuration today.**
`apps/api/src/routes/verify.ts` defines `MAX_DEPTH = 50` with the comment
"F-A-012: tighter caps than the original 200/50 (30 req/min)" and enforces
the 10/min-per-IP rate limit and explicit `truncated_reason` this row
specifies. `implementation_status` is `verified` for this row.

**"Entity resolution as priority engineering investment" names a broader
commitment than this repository's evidence can confirm followed.** A
concrete component exists, `apps/api/src/lib/company-name-match.ts`, but
`docs/decisions/records/DEC-20260409-B.md` (existing record, decided two
weeks earlier) already states its own cross-validation half "is dead code."
This row's title implies more engineering priority than `DEC-20260409-B`'s
scope covers, but its null Rationale gives no specifics to verify against.
`implementation_status` for the collision as a whole is `verified`,
reflecting the technical row's demonstrable shipped state, with the
product row's own record noting its Consequences are inferential and the
one adjacent component this record can point to predates this row and is
partly dead code by a prior record's own account.

## Grep of existing records for the bare collided id

`DEC-20260420-G` is named in no existing record under
`docs/decisions/records/*.md` and not in CLAUDE.md. `corrects_migration_state_in`
is `[]`.

## Rejected representations

- Marking "Entity resolution as priority engineering investment"
  documented-only would require an evidence-backed rationale this batch
  does not have (its export is a title with no Rationale or Outcome, and it
  is not superseded); it becomes a formal record whose Context states the
  gap honestly instead.
- Treating `company-name-match.ts` as evidence that this row's "priority
  investment" was fulfilled would overstate what a pre-existing, partly-dead
  module demonstrates.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
