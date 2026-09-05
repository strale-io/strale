---
doc_type: decision-collision-resolution
collision_id: DEC-20260320-C
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
  - source_page_id: "32967c87082c81bfa5d1ee04b7d753dc"
    disposition: formal_record
    record_key: DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc
  - source_page_id: "32967c87082c81178c7acc8b5c396aa3"
    disposition: formal_record
    record_key: DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3
---

# Resolution of historical ID collision `DEC-20260320-C`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [au-company-data ABR onboarding decision](https://app.notion.com/32967c87082c81bfa5d1ee04b7d753dc)
  becomes `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc`.
- The [auto-register .d.ts filter + startup health gate hotfix](https://app.notion.com/32967c87082c81178c7acc8b5c396aa3)
  becomes `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260320-C` is still
forbidden as a relationship target.

## Implementation reconciliation

**au-company-data.** `manifests/au-company-data.yaml` and
`apps/api/src/capabilities/au-company-data.ts` match the row: category
`company-data`, price €0.05, ABR data source, regex-based XML parsing, and
the env var rename (`ABR_AUTH_GUID` → `ABN_LOOKUP_GUID`) the row's own
Outcome recorded is reflected in both the executor and
`config/env-manifest.yaml`.

**auto-register .d.ts filter + startup health gate.** Neither mechanism
exists in `apps/api/src/capabilities/auto-register.ts` today. The file's
own header comment states the filesystem-glob discovery this row patched
was itself replaced: "The previous filesystem-glob discovery pulled in
test files (`.test.ts`) and any unrelated `.ts` file, producing spurious
errors and masking real failures. Manifest is the source of truth."
Registration now reads `manifests/*.yaml` directly and dynamic-imports
declared slugs; there is no directory scan to misclassify a `.d.ts` file
against, so this row's specific defect cannot recur under the current
architecture. There is also no `process.exit(1)` startup gate keyed on an
expected executor count; distinct labelled log outcomes replace it without
halting startup. This is an architectural replacement, not a contradiction
of the row's decision text, and no decision record in this repository
names the replacement directly.

## Rejected representations

- Marking either row documented-only would omit a still-live capability
  (au-company-data) and a hotfix whose root-cause diagnosis remains
  historically accurate even though its specific mechanism has since been
  replaced.
- Inventing a supersession edge from the hotfix row to an unnamed later
  architecture change would invent a decision ID this repository does not
  record.
- Merging the two rows into one record would misrepresent two distinct
  subjects (a capability onboarding and an infrastructure hotfix) as one
  decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
