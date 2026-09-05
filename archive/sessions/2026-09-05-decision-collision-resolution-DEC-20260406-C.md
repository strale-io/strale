---
doc_type: decision-collision-resolution
collision_id: DEC-20260406-C
resolution_status: resolved
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
resolved_at: 2026-09-05
implementation_status: not-applicable
corrects_migration_state_in: []
source_rows:
  - source_page_id: "33a67c87082c814b8afafb2e1c6ca317"
    disposition: formal_record
    record_key: DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317
  - source_page_id: "33a67c87082c819cabf6d47331d695ce"
    disposition: formal_record
    record_key: DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce
---

# Resolution of historical ID collision `DEC-20260406-C`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [Project Home physical tidy decision](https://app.notion.com/33a67c87082c814b8afafb2e1c6ca317)
  becomes `DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317`.
- The [Rule E working-rules decision](https://app.notion.com/33a67c87082c819cabf6d47331d695ce)
  becomes `DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The tidy row's own
Rationale names `DEC-20260406-B` ("Operating Manual (DEC-20260406-B)
established the governance layer") as the governance protocol its content
tidy executes; that id is itself a resolved collision from G2 batch 2, and
its "Operating Manual" sibling row's record key
(`DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52`) is the relation
target, chosen over its other sibling
(`DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319`, "Fix nested
field reference resolution in solution input mapping") because only the
Operating Manual record matches the tidy row's own naming. The Rule E row
names no other decision by id. The duplicate display ID remains unchanged
for both sources. A bare `DEC-20260406-C` is still forbidden as a
relationship target.

## Implementation reconciliation

Both rows describe Notion-workspace state, not repo-tracked artefacts, and
this repository's pre-cutover posture (`CLAUDE.md`'s "Repo-native migration
continuation — pre-cutover" section, `docs/strategy/2026-08-31-repo-native-operating-model-migration.md`)
leaves both untouched by design: Notion-backed workflows remain
authoritative until the M4 cutover, so no repo evidence can confirm or deny
whether the ~90-page Notion archive still holds, or whether Rule E's em-dash
rule still governs Notion-side authoring today. `implementation_status` is
`not-applicable` for this reason on both rows, not `verified` or
`drift-open`: there is no code path this pair of decisions was meant to
change.

`docs/company/VOICE.md`, the repository's own writing-rules authority, does
not restate Rule E's specific "no em dashes" rule, and its own second line
contains an em dash. CLAUDE.md's "Notion Governance Rules (enforced)"
section still restates content-hygiene rules matching the tidy row's intent
("Check before creating," "ONE page per topic," "Superseded pages archived
same session"), run in parallel with the repo-native model rather than
demonstrably descended from this specific tidy.

## Grep of existing records for the bare collided id

`DEC-20260406-C` is named in no existing record under
`docs/decisions/records/*.md` and not in CLAUDE.md. `DEC-20260406-E.md`
(checked per this batch's specific pre-check hint, since the two ids are
numerically adjacent) does not in fact name `DEC-20260406-C` anywhere in
its text. `corrects_migration_state_in` is `[]`.

## Rejected representations

- Marking either row documented-only would omit a Notion-workspace state
  this repository has no other record of, and cannot itself verify happened
  or reversed.
- Treating CLAUDE.md's parallel "Notion Governance Rules" section as this
  tidy's direct successor would invent an edge this repository's records do
  not state.
- Merging the two rows into one record would misrepresent two distinct
  subjects (a Notion content reorganization and a writing-voice rule) as one
  decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the evidence
binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
