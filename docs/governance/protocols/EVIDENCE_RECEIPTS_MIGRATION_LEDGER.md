---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Evidence receipts and the migration ledger (T15)"
---

# Evidence receipts and the migration ledger (T15)

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 7, review round 1). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Evidence receipts and the migration ledger (T15)

Evidence is a receipt file under `archive/receipts/`, cited by path — never a
bare test count in prose. A receipt (`archive/receipts/receipt.schema.json`;
naming rule `YYYY-MM-DD-<kind>-<topic>.json`) is written once, by the tool
that produced it, and never edited afterward; `npm run receipts:check`
enforces this as a git fact (a tracked receipt's blob at HEAD must match the
blob at the commit that first added it), validates the schema, checks that
every `evidence:` / `production_evidence:` path cited from a decision
record, a program track, or a remediation package resolves, and warns on a
post-2026-09-02 handoff stating a test count with no receipt link. Write one
with `npm run receipt -- --kind <kind> --topic <topic> --from <file|->`.
Migration blocks in `apps/api/src/lib/startup-migrations.ts` are
append-only and ledgered: `apps/api/src/lib/startup-migrations.ledger.json`
carries a content hash and `columns_written` per block, and `npm run
migrations:check` fails on an edited block (the fix is a new block, never
an in-place edit), an unledgered block, or two blocks writing the same
column unless it's allowlisted in `known_overlaps` — the 2026-08-21
incident class, where two blocks derived one column and fought every boot.
Both wired into CI after `docs:test` / `archive:index:test`.
<!-- END VERBATIM FROM CLAUDE.md -->
