---
doc_type: source-gap-report
authority_scope: none
status: open
complete: true
phase: M2
verified_at: 2026-09-01
authority_active: false
---

# Capability-onboarding authority and enforcement gaps

## Summary

The exact Notion decision chain is unambiguous, but the current mandatory
entrypoints and fresh-database enforcement surface do not fully match it. This
report preserves those gaps while the new formal records remain inactive M2
candidates.

## Exact decision chain

- [`DEC-20260320-B`](https://app.notion.com/p/32967c87082c81b7a8ccd169b431f99c)
  is superseded by
  [`DEC-20260423-B`](https://app.notion.com/p/34967c87082c81e6bf87f4ce36729be2).
- [`DEC-20260422-C`](https://app.notion.com/p/34967c87082c81ec8c4dd04c40ba5685)
  is superseded by
  [`DEC-20260423-A`](https://app.notion.com/p/34967c87082c81c08b89ea9ecc0fb478).
- A and B remain active together: A is the structural remediation; B is the
  corrected always-enforce protocol.

An exact Decisions data-source query returned one row for each ID. None is in
the unresolved collision registry.

## Gap 1 — mandatory entrypoints route through superseded authority

`CLAUDE.md` and `AGENTS.md` still name `DEC-20260320-B` as the Capability
Onboarding Protocol even though Notion marks it superseded. `CLAUDE.md` also
requires agents to read the historical design spec as the pipeline authority.
That spec still contains retired SQS, automatic lifecycle-transition, and
seed-era instructions.

The later inline entrypoint steps mostly describe the current manifest-driven
pipeline, so changing only the displayed ID would not resolve the mixed
authority. Before M4, the protocol route must point to the active revised
decision and to a bounded current repo-native protocol surface rather than the
historical spec's full body.

## Gap 2 — fresh-database trigger provisioning is not in current source

Commit `94b2078c2d0ea5310faa625f71799f08b57fcc68` added
`apps/api/drizzle/0051_capability_insert_guard.sql`. The trigger rejected direct
`capabilities` inserts unless `persistCapability` set a transaction-local GUC.

Commit `3e60d5d3` later deleted the Drizzle migration directory during adoption
of in-TypeScript startup migrations. The current repository still sets the
token in `apps/api/src/lib/capability-persistence.ts`, but a repository-wide
search finds no current DDL that creates `capability_insert_guard` or
`check_capability_insert_guard`.

This proves a fresh-database provisioning gap in repository source. It does
not prove that the historical trigger disappeared from the existing production
database. Production trigger state remains unknown until a read-only catalog
query checks it. No database or production query was required or executed by
this docs-only batch.

## Gap 3 — later mechanism changes must not be revived

The historical design spec includes an SQS engine, automatic lifecycle
transitions, probation scoring, broad scheduled testing, and a seed-based
path. Later decisions and code changes retired or altered those mechanisms.
The candidate chain preserves the invariant—capabilities use a structurally
enforced manifest pipeline—without restoring those obsolete details.

Later incident decisions also added manifest-consistency and guaranteed-field
checks. They remain separate decisions and evidence; this batch does not
silently fold them into the 2026-04-23 chain or invent amendment edges.

## Current code evidence

- `apps/api/scripts/onboard.ts` verifies fixtures and calls
  `persistCapability`.
- `apps/api/src/routes/admin.ts` uses the same persistence path.
- `apps/api/src/lib/capability-readiness.ts` blocks on reliability coverage and
  active limitations.
- CI and runtime guaranteed-field checks provide later composing controls.

These surfaces show substantial continuing implementation, but they do not
close the two authority/provisioning gaps above.

## Required resolution before M4

1. Replace the superseded decision route in both agent entrypoints.
2. Replace the historical full-spec dependency with a current bounded
   repo-native protocol surface.
3. Restore or explicitly replace fresh-database structural insert enforcement.
4. Read back production trigger state without modifying it.
5. Add executable checks proving the selected structural control fires.
6. Obtain different-provider review of the then-current exact commit.

## No-change boundary

This report does not edit entrypoints, historical specs, source Decisions,
database state, production state, capability code, or live protocol behavior.
It does not activate the candidate records or authorize M4.
