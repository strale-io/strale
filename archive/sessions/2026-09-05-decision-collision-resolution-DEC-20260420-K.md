---
doc_type: decision-collision-resolution
collision_id: DEC-20260420-K
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
  - source_page_id: "34867c87082c81e3a62bf051cc0575c4"
    disposition: formal_record
    record_key: DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4
  - source_page_id: "34867c87082c8198b6ecf3569a68a9b4"
    disposition: formal_record
    record_key: DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4
---

# Resolution of historical ID collision `DEC-20260420-K`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [Payee Assurance bank-verification launch-gate row](https://app.notion.com/34867c87082c81e3a62bf051cc0575c4)
  becomes `DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4`.
- The [Session B Open Questions row](https://app.notion.com/34867c87082c8198b6ecf3569a68a9b4)
  becomes `DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4`.

The Payee Assurance row's own "Supersedes DEC-20260420-J" is recorded in
prose only, naming the specific superseded row it means (this same batch's
documented-only `DEC-20260420-J` twin, page id
`34867c87082c81dc803bc3709bd5fdd6`); no relation edge targets it, since a
documented-only disposition has no record_key. The Session B row carries
`related_to` edges to `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600`,
`DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6` (its own "resolves
trivially... from DEC-20260420-H" citation, matching that record's exact
subject), and `DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137`
(its own "DEC-20260420-J: SA.2b.d closes Session A" citation, an exact
title match). The duplicate display ID remains unchanged for both sources.
A bare `DEC-20260420-K` is still forbidden as a relationship target.

## Forward correction: two protected records call this collision unresolved

**Orchestrator pre-check, confirmed by grep of every record and CLAUDE.md
for the bare id:** `DEC-20260422-H.md` (line 60) and `DEC-20260430-A.md`
(line 82) both state, in `DEC-20260430-A`'s own protected Context section,
"The source partially superseded vendor-selection content in
`DEC-20260420-K`, whose display ID is an unresolved collision, and the
Movitz-dependent path in the unique but unmigrated `DEC-20260422-H`. Both
graph edges are withheld rather than targeting an ambiguous record or
overstating a partial retirement." `DEC-20260422-H.md` quotes that same
sentence from `DEC-20260430-A` as its own cited evidence, rather than
stating it independently.

**Both statements are now stale: `DEC-20260420-K` is resolved as of this
report, with two formal records.** Neither protected record is edited;
this is a forward, prose-only correction. "Vendor-selection content" in
both citations names this collision's Payee Assurance row specifically
(page id `34867c87082c81e3a62bf051cc0575c4`), the row that names a
bank-verification vendor shortlist (Banfico, MonitorPay, SurePay, iPiD),
not this collision's Session B Open Questions sibling, which names no
vendor. `corrects_migration_state_in` stays `[]` on both this report's
frontmatter and this batch's two formal records: the binding is enforced
against `REQUIRED_COLLISION_MIGRATION_CORRECTIONS` in
`scripts/decision-records-lib.mjs`, a hardcoded map this batch does not
edit (`scripts/` is out of scope per this batch's constraints), consistent
with how T10 G2 batch 3 handled the identical wall for `DEC-20260503-A`'s
stale statements about `DEC-20260420-E`/`F`/`H`.

## Implementation reconciliation

**None of the four vendors this row's launch condition names were
contracted; all were rejected.** `apps/api/src/lib/platform-facts.ts`'s
`STALE_VENDORS` list carries, under the comment "IBAN/name match — all
rejected per DEC-20260430-A": `SurePay`, `MonitorPay`, `Movitz`, `Banfico`,
`iPiD`, `Bottomline`, `Yapily`. No bank-verification vendor integration
exists in `apps/api/src`. `implementation_status` is `drift-open`: the
row's own condition (a vendor confirms embed-and-bill in writing) was not
met, and the row's own stated fallback (slip the ship date and re-evaluate)
is consistent with what the codebase shows, but `DEC-20260430-A`'s own
merged text does not itself list the rejected vendor names, so this
report's attribution rests on `platform-facts.ts`'s own comment, not on
`DEC-20260430-A`'s record body.

**OQ-1's hybrid split-ownership model is present in `apps/api/scripts/onboard.ts`
today, evolved into a stricter mechanism.** The script's
`--force-override-authority` guard (labeled "Cluster 2 Phase 4a" in its own
comments) is gated to interactive TTY sessions and refused in `--batch`
mode, addressing the same authority-boundary problem OQ-1's split was
designed to formalize, though not by the exact hybrid-field-list mechanism
the row specifies.

## Rejected representations

- Editing `DEC-20260422-H.md` or `DEC-20260430-A.md` to remove the
  "unresolved collision" language was rejected: both are protected merged
  records; the correction is recorded here in prose, per this batch's own
  constraints.
- Adding `corrects_migration_state_in: [DEC-20260422-H, DEC-20260430-A]`
  was rejected: the binding requires an entry in a hardcoded map this batch
  does not edit; the field would fail validation if added without that
  map entry.
- Attributing the "vendor-selection content" statement to the Session B
  Open Questions row instead of the Payee Assurance row was rejected: only
  the Payee Assurance row names a bank-verification vendor shortlist.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
