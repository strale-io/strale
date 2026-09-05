---
doc_type: decision-collision-resolution
collision_id: DEC-20260421-C
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
  - source_page_id: "34967c87082c81bd8c6bf8e92e901711"
    disposition: formal_record
    record_key: DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711
  - source_page_id: "34867c87082c81a6bb52ca8dbd61dc25"
    disposition: formal_record
    record_key: DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25
---

# Resolution of historical ID collision `DEC-20260421-C`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The ["No scraping" positioning commitment row](https://app.notion.com/34967c87082c81bd8c6bf8e92e901711)
  becomes `DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711`.
- The [Phase 4 evidence-based validation-gate row](https://app.notion.com/34867c87082c81a6bb52ca8dbd61dc25)
  becomes `DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25`.

The positioning row carries a `related_to` edge to
`DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef` (its own
"consistent with Brand & Voice 4.1 (data-source-type doctrine under
DEC-20260420-I)" citation, an exact subject match to this batch's own
doctrine record). The validation-gate row carries `related_to` edges to
`DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79` (its own "Cluster
2 Phase 3" reference, matching that record's own title) and
`DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf` (its own
`lei-lookup` `price_cents=10`-overwriting-`price_cents=5` authority-gap
example, identical to that record's own headline example). The duplicate
display ID remains unchanged for both sources. A bare `DEC-20260421-C` is
still forbidden as a relationship target.

## Implementation reconciliation

**The 9-country scraping migration this row commits to cannot be verified
country-by-country from manifest evidence.** `manifests/*.yaml`'s
`data_source_type` values today include 32 capabilities still declaring
`scrape`; this report did not enumerate which correspond to the row's named
nine countries (BE, ES, IE, IT, LT, LV, NL, PT, SE) or Germany's northdata
dependency. `DEC-20260428-A` and `DEC-20260813-A` (both existing records)
establish a later, more permissive vendor-consumption and per-call-parsing
framework than this row's absolute "must be migrated" commitment;
whether any of the 32 `scrape`-declared capabilities today operate under
that later permission, rather than as unresolved residue, is not
distinguishable from manifest data alone. `implementation_status` is
`drift-open` for this reason.

**The Phase 4 validation-gate methodology and its authority-gap finding are
both corroborated in the codebase.**
`apps/api/scripts/archive/validate-phase-3/trigger-hook-failure.mjs` is
present, at an archived path consistent with the row's own "kept in repo as
a reusable pattern" claim. The `lei-lookup` authority gap this row's gates
caught (manifest overwriting an admin-tuned `price_cents`) is the same
example the sibling `DEC-20260421-D` record's own row names as its Phase 4
headline problem, and this batch's `DEC-20260421-D` formal record confirms
`apps/api/scripts/onboard.ts` now carries a
`--force-override-authority` guard addressing it.

## Rejected representations

- Adding a relation edge between this collision's two rows was rejected:
  neither row's own text names the other by id or by a matching mechanism;
  both instead name mechanisms belonging to the sibling collisions cited
  above.
- Claiming the 9-country migration fully completed, on the strength of the
  reduced `scrape` count relative to the row's original 9-country claim,
  was rejected: this report did not map specific manifests to specific
  countries, so no completion claim is supportable from this evidence.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
