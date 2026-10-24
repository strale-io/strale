---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Evidence receipts and the migration ledger (T15)"
moved_at: 2026-10-24
---

# Evidence receipts and the migration ledger (T15)

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

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
