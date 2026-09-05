---
doc_type: decision-collision-resolution
collision_id: DEC-20260421-D
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
  - source_page_id: "34867c87082c81a2a12cc95010bf25bf"
    disposition: formal_record
    record_key: DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf
  - source_page_id: "34967c87082c810695c2e365deb8f2c8"
    disposition: formal_record
    record_key: DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8
---

# Resolution of historical ID collision `DEC-20260421-D`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [Phase 4 4a/4b split row](https://app.notion.com/34867c87082c81a2a12cc95010bf25bf)
  becomes `DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf`.
- The [landing-page Section 2 agent-in-use animation row](https://app.notion.com/34967c87082c810695c2e365deb8f2c8)
  becomes `DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8`.

The Phase 4 split row carries a `related_to` edge to
`DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79` (its own "Same
reasoning pattern as C1/C2 split from Phase 3" citation, matching that
record's own subject). The Section 2 animation row's own text names no
other Decision ID. The duplicate display ID remains unchanged for both
sources. A bare `DEC-20260421-D` is still forbidden as a relationship
target.

## Implementation reconciliation

**4a's authority-enforcement mechanism is live today, in a stricter form.**
`apps/api/scripts/onboard.ts` carries a `--force-override-authority` flag
explicitly labeled "Cluster 2 Phase 4a," gated to interactive TTY sessions
and refused in `--batch` mode. 4b's manifest-completeness audit output
exists in the repository as `archive/sessions/audit-reports/2026-04-20-phase-4b-audit.md`;
whether its fail-closed enforcement has since shipped was not verified in
this pass.

**The Section 2 animation this row's sibling describes is not live; a
different component occupies the numbered slot today.**
`strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` labels its second
section "Solutions showcase (with discovery demo folded in)" and renders
`<SolutionsShowcase />`, not the deterministic 5-counterparty agent-in-use
animation this row specifies. `implementation_status` is `drift-open`: 4a
is verified live; 4b's status is unconfirmed; the Section 2 animation
never shipped as described, on the evidence available.

## Rejected representations

- Adding a relation edge between this collision's two rows was rejected:
  neither row's own text names the other, and they belong to unrelated
  workstreams (an engineering-pipeline split and a website-design choice)
  that happen to share a display ID.
- Claiming the Section 2 animation shipped in some altered form was
  rejected: the current page's own section comment and top-level markup
  name a different feature (a solutions/discovery showcase), and this
  report did not inspect `SolutionsShowcase`'s internals to look for a
  partial implementation of this row's specific mechanics
  (`IntersectionObserver` start/pause, an 8-second loop, 5 deterministic
  counterparty presets).

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
