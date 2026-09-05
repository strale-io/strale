---
doc_type: decision-collision-resolution
collision_id: DEC-20260225-P-c5d6
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
  - source_page_id: "31267c87082c81279b14f3859f6f2038"
    disposition: formal_record
    record_key: DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038
  - source_page_id: "31267c87082c818e9d46cd25ac0236a8"
    disposition: formal_record
    record_key: DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8
---

# Resolution of historical ID collision `DEC-20260225-P-c5d6`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

Both historically active rows under this collision become formal records:

- The [failed_requests demand-ledger table decision](https://app.notion.com/31267c87082c81279b14f3859f6f2038)
  becomes `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038`.
- The [GTM demo-first strategy decision](https://app.notion.com/31267c87082c818e9d46cd25ac0236a8)
  becomes `DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8`.

Both source rows carried `historical_status: active`; neither is superseded,
so neither requires the documented-only disposition. The duplicate display ID
remains unchanged for both sources. A bare `DEC-20260225-P-c5d6` is still
forbidden as a relationship target.

## Implementation reconciliation

**failed_requests table.** `apps/api/src/db/schema.ts` defines the
`failed_requests` table with the four fields the row named
(`task`, `category`, `max_price_cents`, `user_id`) plus `id` and
`created_at`, matching the row's stated six-column set, and additional
columns beyond it (`ip_hash`, `failure_type`, `error_detail`,
`user_agent`). `apps/api/src/routes/do.ts` inserts into this table at
four failure-branch call sites. CLAUDE.md's MVP Decisions list still
carries the row's text verbatim, matching the schema comment that cites
this decision ID directly.

**GTM demo-first strategy.** Framework integrations (`packages/langchain-strale`,
`packages/crewai-strale`) exist, matching the row's named weeks-5-to-8
distribution channel. The row's week-4-5 launch outputs (a demo video, a
dev.to/Hashnode tutorial post, direct outreach) and its week-6-7 Show HN
post were not confirmed as published from anything committed to this
repository; `archive/growth-ops/tweets-v2.md` and `archive/README.md`
show draft-stage Dev.to material, not confirmed publication. The named
north-star metric (second top-up rate) remains a tracked concept in
`docs/company/GOALS.md`.

## Rejected representations

- Marking either row documented-only would omit an actively-cited schema
  decision (the failed_requests table) or a still-relevant GTM strategy
  with verifiable framework-integration follow-through.
- Inventing a supersession edge between the two rows would be false: they
  are unrelated decisions that happen to share a display ID from the same
  day.
- Merging the two rows into one record would misrepresent two distinct
  subjects as one decision.

## Verification boundary

This resolution is complete only when the collision registry, both formal
records, this report, and generated views validate atomically; the
evidence binding and complete report bytes become immutable after merge;
an independent exact-tip review passes; and authority remains `none` /
inactive. All other historical ID collisions outside this batch remain
unresolved.
