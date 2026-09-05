---
doc_type: decision-collision-resolution
collision_id: DEC-20260420-I
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
  - source_page_id: "34867c87082c81c8b9d4c6b5568bbcef"
    disposition: formal_record
    record_key: DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef
  - source_page_id: "34867c87082c8172a41ac4c9d52904de"
    disposition: formal_record
    record_key: DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de
---

# Resolution of historical ID collision `DEC-20260420-I`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [split-by-data-source-type doctrine row](https://app.notion.com/34867c87082c81c8b9d4c6b5568bbcef)
  becomes `DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef`.
- The [SA.2b.c direct-SQL PII backfill row](https://app.notion.com/34867c87082c8172a41ac4c9d52904de)
  becomes `DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de`.

The doctrine row carries a `related_to` edge to
`DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35` ("Capability
rationalization and site rebuild"), the only sibling under an already-
resolved collision (T10 G2 batch 3) whose title matches this row's own
parenthetical ("DEC-F (capability rationalization) is reinforced"). The
backfill row carries a `related_to` edge to
`DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600`, the single formal
record for that unambiguous collision. The duplicate display ID remains
unchanged for both sources. A bare `DEC-20260420-I` is still forbidden as a
relationship target.

## This collision's own doctrine text is the only export evidence of what
`DEC-20260420-H` actually says

The doctrine row quotes "Strale's doctrine under DEC-20260420-H states
'direct data connections only. No scraping. Full ToS compliance with every
provider.'" `DEC-20260420-H` was resolved in T10 G2 batch 3 into two
records, neither of which states this text (the Option C row is entirely
about manifest/DB drift; the "Strale positioning and ICP clarification" row
has null Rationale and Outcome). Batch 3's own resolution report for
`DEC-20260420-H` already found this gap and named this row
(`DEC-20260420-I`) as "the only export evidence" of the doctrine's
substance. This report confirms that finding stands: neither of
`DEC-20260420-H`'s two rows contains the quoted sentence; this row is a
one-step-removed reference to it (attributing the doctrine to
`DEC-20260420-H`, not reproducing its text), and remains the closest
available evidence.

Both bare-id references in the doctrine row ("DEC-H remains active" and
"DEC-E (Payee Assurance v1 scope) is not directly amended") are recorded as
prose only in the formal record, since neither `DEC-20260420-H`'s nor
`DEC-20260420-E`'s two rows (both resolved in batch 3) can be matched to
those specific meanings with confidence: `DEC-20260420-E`'s two rows are
"F-A-005 free-tier transaction lookup redaction" and "Product architecture
and first wedge" (the latter with null Rationale), neither titled or
evidenced as "Payee Assurance v1 scope."

## Implementation reconciliation

**The doctrine's specific six-category `data_source_type` taxonomy was
never implemented; a different, simpler taxonomy shipped.** `manifests/*.yaml`
carries five distinct `data_source_type` values today (`api`: 224 + 1
quoted variant, `computed`: 81, `scrape`: 32, `reference`: 3,
`ai_assisted`: 1), none named `govt-api`, `govt-open-data`,
`licensed-commercial-aggregator`, `govt-portal-scraping`,
`commercial-aggregator-scraping`, or `govt-adjacent-third-party`. 32
capabilities still declare `scrape`, meaning literal scraping was not fully
eliminated as this row's "Week 0" migrations required. `implementation_status`
is `drift-open`: the doctrine's operating principle (classify sourcing,
gate onboarding on it) is present in spirit (a `data_source_type` column
exists and is populated on every manifest), but the specific category
scheme and enforcement mechanism this row specifies do not exist under
their named values.

**The doctrine's substance was superseded by a broader, later framework.**
`DEC-20260428-A` (existing record) adopts an independent three-tier
doctrine for consuming third-party vendor-scraped data (a different axis
than this row's own-sourcing classification); `DEC-20260813-A` (existing
record) affirms "constrained per-call parsing" of statutorily-public
registry pages as a permitted, narrower reading. Neither cites this row or
`DEC-20260420-H` by id.

**The SA.2b.c backfill's end state is corroborated by manifest evidence.**
All 342 manifests declare `processes_personal_data` /
`personal_data_categories`, consistent with the row's own claim of full
coverage. The row's two named Class 2 fixture fixes diverge in outcome:
`manifests/estonian-company-data.yaml` still carries the exact fix
(`registry_code: "17449106"`, `company_name: Bolt App Services AS`);
`manifests/spanish-company-data.yaml` has since drifted to an unrelated
fixture (`company_name: CONSTRUCCIONES AMENABAR SA`, field `nif`, not
`cif`, no trace of Inditex or `A15075062`): this row's fix shipped and was
later superseded by a change this batch does not trace.

## Rejected representations

- Treating "DEC-H remains active" or "DEC-E (Payee Assurance v1 scope)" as
  relation edges to a specific qualified record was rejected: neither
  `DEC-20260420-H`'s nor `DEC-20260420-E`'s two rows state the specific
  content ("direct connections only" text; "Payee Assurance v1 scope")
  these references name, so no edge could be justified beyond prose.
- Marking either row documented-only was rejected: both are historically
  active, independently substantive rows with no successor record already
  covering their content.
- Claiming the six-category taxonomy shipped as specified was rejected:
  the manifests carry a different, simpler five-value taxonomy under
  different names.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
