---
doc_type: decision-collision-resolution
collision_id: DEC-20260421-B
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
  - source_page_id: "34867c87082c81dab702f98b2034aa5d"
    disposition: formal_record
    record_key: DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d
  - source_page_id: "34967c87082c81828e3fe183dd5e8072"
    disposition: formal_record
    record_key: DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072
---

# Resolution of historical ID collision `DEC-20260421-B`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [hook-placement correction row](https://app.notion.com/34867c87082c81dab702f98b2034aa5d)
  becomes `DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d`.
- The [landing-page H1 product-led row](https://app.notion.com/34967c87082c81828e3fe183dd5e8072)
  becomes `DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072`.

The hook-placement row carries a `related_to` edge to
`DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79` (its own "C1
(8f6eff9) placed the onCapabilityCreated hook inside db.transaction"
citation, an exact commit-sha match to that record's own "C1 shipped at
8f6eff9"). The duplicate display ID remains unchanged for both sources. A
bare `DEC-20260421-B` is still forbidden as a relationship target.

## A second instance of the DEC-20260420-H unverifiable-attribution pattern

The landing-H1 row's own text states "Brand & Voice Section 7.1 (locked
under DEC-20260420-H)" and "Supersedes DEC-20260420-H's Section 7.1
primary-headline rule for the landing page specifically." `DEC-20260420-H`
was resolved in T10 G2 batch 3; neither of that collision's two records'
own exported text (the Option C manifest-drift row; the null-Rationale
"Strale positioning and ICP clarification" row) states a Brand & Voice
Section 7.1 primary-headline rule. This is a second, independent instance
of the pattern batch 3's own resolution of `DEC-20260420-H` already
identified once for the ToS-prohibited-scraping rule: a rule attributed to
the bare id in later prose that neither of that collision's two rows
actually states. Both bare-id references in this row are recorded in the
formal record as prose only, with no relation edge to either qualified
`DEC-20260420-H` record.

## Implementation reconciliation

**The hook-placement correction is live in the codebase today.**
`apps/api/src/lib/capability-persistence.ts` states directly the hook fires
"OUTSIDE the transaction. Design doc §4.3," matching this row's design.
`apps/api/src/jobs/onboarding-retry.ts`'s own header states: "since the
DEC-20260421-B correction, moved `onCapabilityCreated` outside the write
transaction and marked the row `lifecycle_state = 'hook_failed'` when the
hook throws"; the same header also documents that the promised "Phase 6
retry scheduler" this row's design anticipated "was never built" for a
period, and that this very file later built it; that gap postdates this
row and belongs to a different, later fix, not investigated further here.

**The landing H1 this row locks is not live; a different, earlier headline
is.** `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` renders "One
API call. Verified data your agent can trust.": the headline
`DEC-20260314-G` (existing record, decided 2026-03-14, over a month before
this row) locked, and whose own Consequences confirm is "live today,
verbatim." This row's own "Counterparty verification for AI agents, in one
call." H1 is absent from production. `implementation_status` is
`drift-open`: the hook-placement half is verified; the H1 half never
shipped (or shipped and was reverted, undetermined from this evidence),
and `DEC-20260812-A`'s later retirement of the Counterparty Assurance
product framing is a plausible but unconfirmed explanation.

## Rejected representations

- Targeting either qualified `DEC-20260420-H` record with a relation edge
  for either bare-id reference in the landing-H1 row was rejected: neither
  record states the Section 7.1 rule this row attributes to the bare id.
- Claiming the locked H1 shipped, on the strength of this row's own
  "locked" language, was rejected: production renders a different, earlier
  headline verbatim, per `DEC-20260314-G`'s own already-merged verification.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
