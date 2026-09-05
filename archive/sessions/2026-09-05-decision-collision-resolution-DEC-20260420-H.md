---
doc_type: decision-collision-resolution
collision_id: DEC-20260420-H
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
  - source_page_id: "34867c87082c81c6a58dfbc5f46ed3f6"
    disposition: formal_record
    record_key: DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6
  - source_page_id: "34867c87082c81b58b36de5f71c0937f"
    disposition: formal_record
    record_key: DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f
---

# Resolution of historical ID collision `DEC-20260420-H`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [Option C manifest-drift row](https://app.notion.com/34867c87082c81c6a58dfbc5f46ed3f6)
  becomes `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6`.
- The ["Strale positioning and ICP clarification" row](https://app.notion.com/34867c87082c81b58b36de5f71c0937f)
  becomes `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f`.

The Option C row carries relations to `DEC-20260420-A` and to this batch's
own formal records for the SA.2b PII classification, F-A-005, F-A-006/007,
and F-A-012 collisions, all resolvable from its own "DEC-20260420-A through
DEC-20260420-G (complete SA.2 + F-A series)" reference read together with
its own "SA.2 + F-A series" framing (which names only the technical
continuation row of each collision letter, not that collision's unrelated
sibling). "Strale positioning and ICP clarification"'s export carries a
title only (`Rationale` and `Outcome` both null), so it names no other
decision and carries no relations. The duplicate display ID remains
unchanged for both sources. A bare `DEC-20260420-H` is still forbidden as a
relationship target.

## Which row carries the social-platform scraping rule

**Orchestrator pre-check, confirmed by reading both rows in full: neither
row states the ToS-prohibited social-platform-scraping rule several later,
merged records attribute to the bare id `DEC-20260420-H`.**

CLAUDE.md's `DEC-20260813-A` bullet reads: "Still absolute: bulk crawling,
ToS-prohibited targets (DEC-20260420-H social platforms, DEC-20260427-H-4
Google), robots.txt evasion, CAPTCHA solving, proxy rotation, login-wall
circumvention." The already-merged record `docs/decisions/records/DEC-20260427-H.md`
states, quoting its own source row's Rationale: "DEC-20260420-H established
that capabilities sourcing data via ToS-prohibited scraping are banned," and
separately quotes `DEC-20260813-A`'s own text verbatim: "the social-platform
targets prohibited by `DEC-20260420-H`; Google surfaces prohibited by
`DEC-20260427-H-4`; robots.txt evasion..." The already-merged record
`docs/decisions/records/DEC-20260427-I.md` states its row "applies the same
legal reasoning as `DEC-20260420-H` (ToS-prohibited commercial-aggregator
scraping)."

Read in full via `dump_rows.py PAGE:34867c87082c81c6a58dfbc5f46ed3f6` and
`PAGE:34867c87082c81b58b36de5f71c0937f`:

- The Option C row's full Rationale (over 2,000 words) is entirely about a
  912-line manifest/DB drift audit across 275 manifests, three drift
  classes, and an onboarding-script mapping fix. It never mentions ToS,
  scraping, robots.txt, or social platforms.
- The "Strale positioning and ICP clarification" row's `Rationale` and
  `Outcome` fields are both `null`; only its title was exported.

Neither exported row states the rule the citing records assume. The
nearest export evidence of that rule's actual substance is a different row
entirely: `DEC-20260420-I` (page id `34867c87082c81c8b9d4c6b5568bbcef`,
itself an unresolved collision id reserved for a later G2 batch). Read in
full via `dump_rows.py PAGE:34867c87082c81c8b9d4c6b5568bbcef`, its
Rationale opens: "Strale's doctrine under DEC-20260420-H states \"direct
data connections only. No scraping. Full ToS compliance with every
provider.\" The CC diligence report of 2026-04-20 and CC's parallel
Provider-Coverage audit both established that a literal reading of this
rule drops Payee Assurance v1 from ~17 countries to 4 (NL, IE, LV, SE)." Its
`Decision` field (the export's summary line) reads in full: "Adopt
split-by-data-source-type as the operable form of the \"direct connections
only\" doctrine. Amends DEC-20260420-H."

This is the only export evidence that `DEC-20260420-H` states a "direct
connections only. No scraping" doctrine at all, and it is one step removed
even from that: `DEC-20260420-I` attributes the doctrine to
`DEC-20260420-H`, it does not reproduce `DEC-20260420-H`'s own text. That
doctrine's own wording is closer to, but not identical with, the
"social-platform targets" framing CLAUDE.md and `DEC-20260427-H.md` use;
`DEC-20260420-I`'s own quote does not itself say "social platforms." This
report attributes the doctrine to the positioning-and-ICP row only as an
inference from its date (same day) and title (a positioning decision is
the kind of row a data-sourcing doctrine would plausibly sit inside), never
from any exported content of that row's own: its Rationale and Outcome
are both null. The doctrine's actual text is not present anywhere in this
export under either of this collision's two rows.

**Grep of every existing record for each of this batch's six other bare
collided ids**, per this batch's rule-4 pre-check: `DEC-20260406-C`,
`DEC-20260409-C`, `DEC-20260420-D`, `DEC-20260420-G` are named nowhere in
`docs/decisions/records/*.md` or CLAUDE.md. `DEC-20260420-E` and
`DEC-20260420-F` are both named once, in
`docs/decisions/records/DEC-20260503-A.md`: "The source page also says this
decision extends the product decision filed as `DEC-20260502-A` and refines
`DEC-20260420-E`, `DEC-20260420-F`, and `DEC-20260420-H`. Each of those
historical IDs is reused by a different Notion row. Their structured
amendment edges are therefore withheld and preserved as unresolved
source-ID collisions rather than aimed at an ambiguous target." `DEC-20260409-C`
is named twice in `docs/decisions/records/DEC-20260409-D.md` (already
addressed in this batch's own `DEC-20260409-C` resolution report).
`DEC-20260406-E.md` (checked per this batch's specific pre-check hint) does
not in fact name `DEC-20260406-C` anywhere in its text, despite the two ids'
numeric proximity.

`DEC-20260503-A.md`'s text above satisfies the schema requirement for
`corrects_migration_state_in` on its face (it names the collision id and
contains the word "withheld"), but `REQUIRED_COLLISION_MIGRATION_CORRECTIONS`
in `scripts/decision-records-lib.mjs` is a hardcoded map containing only
`DEC-20260502-A → [DEC-20260812-A]` today; this batch does not touch
`scripts/`, so `corrects_migration_state_in` stays `[]` for this collision
(and, for the same reason, would stay `[]` for `DEC-20260420-E` and
`DEC-20260420-F` in their own reports too). This mirrors G2 batch 2's
handling of the same wall. `DEC-20260503-A.md`'s own body is not edited by
this batch; its statement that these three ids' amendment edges are
"withheld and preserved as unresolved source-ID collisions" is now stale
prose (all three collisions resolve in this batch, two of them in this same
batch's own PR), recorded here in prose per the same constraint, not as a
schema-bound correction.

## Implementation reconciliation

**Option C's narrow fix shipped, and the deferred authority question it
parked has since been resolved by a different path than the row itself
named.** `apps/api/scripts/onboard.ts` carries the `ai_assisted` mapping
case and the `--force` backfill safety banner exactly as this row
specifies. All 342 manifests now declare `processes_personal_data` (this
batch's `DEC-20260420-D` resolution), and the heuristic fallback was
removed after migration 0050 per `audit-helpers.ts`'s own comment. The
238-slug Class 4 land mine this row named as blocking SA.2b.c was resolved
by the direct-SQL backfill path this row's own "Path forward for SA.2b.c"
section already anticipated, not by the "Session 1 onboarding engine
rewrite" the row deferred the Class 4 authority question to (no evidence
that rewrite has occurred). `implementation_status` is `drift-open`: the
row's own narrow fix is verified, but its explicit deferral target was
never reached; the underlying blocker was worked around instead.

**"Strale positioning and ICP clarification" cannot be verified against a
code artefact**, since its export carries no Rationale. The nearest dated
evidence is `DEC-20260812-A`'s statement that the direction plan
supersedes "DEC-20260502-A (Counterparty Assurance rename/ICP)... the
Counterparty Assurance framing is retired as primary product", a later
retirement of a positioning/ICP framing in the same lineage this row's
title names, four months on. This record does not claim they state the
same thing.

## Rejected representations

- Attributing the social-platform-scraping rule to the Option C row (its
  sibling under this collision) was rejected: its full text, read in
  entirety, is exclusively about manifest/DB drift and never mentions
  scraping.
- Attributing the rule definitively to the positioning-and-ICP row, rather
  than noting it as inference only, would overstate what a null-Rationale
  export can support.
- Adding `corrects_migration_state_in: [DEC-20260503-A]` was rejected: the
  binding is enforced against a hardcoded map this batch cannot edit
  (`scripts/` is out of scope), so the field would fail
  `DECISION_COLLISION_RESOLUTION_CORRECTION_BINDING_MISMATCH`. The stale
  statement is instead documented in prose above, consistent with G2 batch
  2's handling of the same constraint.
- Marking "Strale positioning and ICP clarification" documented-only would
  require an evidence-backed rationale this batch does not have; it becomes
  a formal record whose Context states the gap honestly instead.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge; an
independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
