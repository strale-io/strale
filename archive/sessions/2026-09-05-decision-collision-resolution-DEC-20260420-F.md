---
doc_type: decision-collision-resolution
collision_id: DEC-20260420-F
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
  - source_page_id: "34867c87082c810b8df1e8e459039d35"
    disposition: formal_record
    record_key: DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35
  - source_page_id: "34867c87082c810b8547fccb3e75c61b"
    disposition: formal_record
    record_key: DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b
---

# Resolution of historical ID collision `DEC-20260420-F`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The ["Capability rationalization and site rebuild" row](https://app.notion.com/34867c87082c810b8df1e8e459039d35)
  becomes `DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35`.
- The [F-A-006 + F-A-007 HMAC audit token lifecycle row](https://app.notion.com/34867c87082c810b8547fccb3e75c61b)
  becomes `DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b`.

The F-A-006/007 row carries relations to `DEC-20260420-A` and to this
batch's own formal records for the SA.2b PII classification collision
(`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600`) and the F-A-005
collision
(`DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228`), all named
explicitly in its own "Prior DECs" reference list. "Capability
rationalization and site rebuild"'s export carries a title only
(`Rationale` and `Outcome` both null), so it names no other decision and
carries no relations. The duplicate display ID remains unchanged for both
sources. A bare `DEC-20260420-F` is still forbidden as a relationship
target.

## Implementation reconciliation

**F-A-006/007 shipped and is the live mechanism today.**
`apps/api/src/lib/audit-token.ts` carries "F-A-007: optional rotation
fallback," "F-A-006: default token TTL. 90 days...," and "F-A-006 + F-A-007:
verify with expiry check and two-key ring fallback" at the functions this
row specifies; `apps/api/src/routes/audit.ts` returns the exact sunset
message the row's 180-day grace design predicts. `implementation_status` is
`verified` for this row.

**"Capability rationalization and site rebuild" has not happened as its
title names it, on the strongest available evidence.** `apps/` in this
repository contains only `api`; no `apps/web` exists. `DEC-20260902-A`
(CLAUDE.md, September 2026) states the website redesign will be built
inside this repository as `apps/web` (monorepo) and that `strale-frontend`
"is kept, not extended, until the `apps/web` site serves production", a
rebuild not yet begun, four and a half months after this row and describing
a different mechanism (monorepo) than whatever this row's null-Rationale
"site rebuild" specified. `docs/decisions/records/DEC-20260513-A.md`
(existing record, hosting-plan partial supersession, monorepo deferred) is
the nearest dated record on the intervening period; this record does not
claim it is this row's direct successor, only the nearest evidence of how
the question evolved. `implementation_status` for the collision as a whole
is `verified`, reflecting the technical row's demonstrable shipped state,
with the product row's own record noting its Consequences are inferential
and its named rebuild appears not to have occurred as of this batch.

## Grep of existing records for the bare collided id

`DEC-20260420-F` is named once in `docs/decisions/records/DEC-20260503-A.md`,
in the same sentence as `DEC-20260420-E` and `DEC-20260420-H`: "The source
page also says this decision extends the product decision filed as
`DEC-20260502-A` and refines `DEC-20260420-E`, `DEC-20260420-F`, and
`DEC-20260420-H`. Each of those historical IDs is reused by a different
Notion row. Their structured amendment edges are therefore withheld and
preserved as unresolved source-ID collisions rather than aimed at an
ambiguous target." No other existing record or CLAUDE.md names
`DEC-20260420-F`. `corrects_migration_state_in` stays `[]` for the same
hardcoded-map reason given in this batch's `DEC-20260420-H` resolution
report, which carries the full three-collision analysis.

## Rejected representations

- Marking "Capability rationalization and site rebuild" documented-only
  would require an evidence-backed rationale this batch does not have (its
  export is a title with no Rationale or Outcome, and it is not superseded);
  it becomes a formal record whose Context states the gap honestly instead.
- Treating `DEC-20260513-A` as this row's formal successor would invent a
  supersession edge neither record's own text states; it is cited only as
  the nearest dated evidence.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
