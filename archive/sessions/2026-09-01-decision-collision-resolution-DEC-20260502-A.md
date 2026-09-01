---
doc_type: decision-collision-resolution
collision_id: DEC-20260502-A
resolution_status: resolved
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
resolved_at: 2026-09-01
implementation_status: drift-open
corrects_migration_state_in:
  - DEC-20260812-A
source_rows:
  - source_page_id: "35467c87082c81ca99efdca389eb77b9"
    disposition: documented_only
  - source_page_id: "35467c87082c8124bcc5e2c2597c76c6"
    disposition: formal_record
    record_key: DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6
---

# Resolution of historical ID collision `DEC-20260502-A`

> [!CAUTION]
> **M2 MIGRATION EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report disambiguates existing historical decisions. It does not create
> product policy or activate the repo-native decision register.

## Resolution

The collision is resolved with one formal record and one documented-only row:

- The [Counterparty Assurance product decision](https://app.notion.com/p/35467c87082c81ca99efdca389eb77b9)
  remains preserved in the registry as `documented_only`. Its historical status
  is superseded, and `DEC-20260812-A` already preserves the material retirement
  of that product direction. Creating a second formal record would require an
  incoming supersession edge that cannot be added to the protected later
  record without rewriting history.
- The [x402 catalog-price decision](https://app.notion.com/p/35467c87082c8124bcc5e2c2597c76c6)
  becomes the active source-qualified formal record
  `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`.

The duplicate display ID remains unchanged for both sources. A bare
`DEC-20260502-A` is still forbidden as a relationship target.

## Forward migration-state correction

The protected consequences in
[`DEC-20260812-A`](../../docs/decisions/records/DEC-20260812-A.md) say both
colliding rows are withheld. That sentence accurately describes the earlier M2
migration state before source-qualified keys existed; it is not current
registry status after this atomic resolution. The readiness decision's product
and operating substance remains unchanged, and its protected body and metadata
were not edited.

## Implementation reconciliation

The active doctrine is one catalog price: canonical EUR cents converted through
one `EUR_USD_RATE`, with no separate x402 discount or cap.

- `apps/api/src/lib/x402-gateway.ts` performs the charging conversion using
  integer micro-USD precision.
- `apps/api/src/routes/x402-gateway-v2.ts` derives cache and JSON catalog values
  from that conversion rather than a stored USD tier.
- The same route still rounds the legacy well-known manifest to two decimals
  and OpenAPI to three. Those representations can differ from the six-decimal
  charged value, so implementation status is `drift-open`, not fully verified.
- The historical cached USD columns described by the source decision no longer
  exist. Their removal is consistent with the rule that they were not price
  authority.

The rounding defect is deliberately not repaired in this irreversible
history-resolution commit. Its correction changes money-facing machine
surfaces and requires the money-critical-path test protocol with parity checks
across challenge, catalog, well-known, OpenAPI, and settlement.

## Rejected representations

- Importing both rows formally would force a false or newly invented
  supersession edge.
- Marking both documented-only would omit a still-active rule referenced by
  live code.
- Editing `DEC-20260812-A` would violate protected-record immutability.
- Renaming either historical ID would falsify source provenance.

## Verification boundary

This resolution is complete only when the collision registry, formal record,
this report, and generated views validate atomically; the evidence binding and
complete report bytes become immutable after merge; an independent exact-tip
review passes; and authority remains `none` / inactive. All other historical
ID collisions remain unresolved.
