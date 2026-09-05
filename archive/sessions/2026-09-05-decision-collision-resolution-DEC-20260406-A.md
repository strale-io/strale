---
doc_type: decision-collision-resolution
collision_id: DEC-20260406-A
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
  - source_page_id: "33a67c87082c81bdb38fd9eeaa556d98"
    disposition: formal_record
    record_key: DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98
  - source_page_id: "33967c87082c816b825cdf812ef006b8"
    disposition: formal_record
    record_key: DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8
---

# Resolution of historical ID collision `DEC-20260406-A`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [consolidate-working-rules decision](https://app.notion.com/33a67c87082c81bdb38fd9eeaa556d98)
  becomes `DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98`.
- The [per-step latencyMs fix](https://app.notion.com/33967c87082c816b825cdf812ef006b8)
  becomes `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260406-A` is still
forbidden as a relationship target.

The per-step-latencyMs record carries one relation: `related_to
DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6`, because its own
Rationale names `DEC-20260405-B` as the decision that specified per-step
latency, and only that `DEC-20260405-B` row (the transaction storage
model, resolved in the same batch) concerns `audit_trail` step structure.
The bare id `DEC-20260405-B` was never used as a target.

## Implementation reconciliation

**Consolidate working rules.** The single-governed-Notion-page model this
row built has since been substantially extended by a repo-native
operating model: CLAUDE.md's Workflow Protocol section, `docs/company/CHARTER.md`
(stated as canonical operating authority, "if they ever diverge, this
file is the text and the other two are pointers to it"), and
`docs/programs/README.md` ("Programs are execution records, not project
truth... Project truth lives in `docs/project/`... and
`docs/decisions/`") did not exist under this row's model. CLAUDE.md still
carries a parallel "Notion Governance Rules" section matching the row's
stated rules, run alongside the repo-native model rather than replaced by
it.

**Per-step latencyMs fix.** `apps/api/src/lib/solution-executor.ts`
defines `StepTiming` with a `latencyMs: number` field and pushes
`{ capabilitySlug, latencyMs: Date.now() - stepStartMs }` on both success
and failure branches, matching the row's description exactly.

## Rejected representations

- Marking either row documented-only would omit a still-relevant
  governance principle (single source of truth for rules) and a still-live
  code fix.
- Treating the repo-native operating model's later emergence as a
  supersession of this row would invent an edge this repository's records
  do not state; it is recorded as later evolution in Consequences instead.
- Merging the two rows into one record would misrepresent two distinct
  subjects (a Notion governance consolidation and a solution-executor bug
  fix) as one decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
