---
doc_type: decision-source-gap-report
authority_scope: none
status: evidence
complete: true
phase: M2
authority_active: false
created_at: 2026-09-04
---

# M2 cross-surface collision resolved: DEC-20260422-A

> [!CAUTION]
> **M2 EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report explains how the `DEC-20260422-A` cross-surface collision was
> resolved. It does not change either source meaning, edit Notion, or
> authorize M4.

## The two meanings, resolved to distinct identities

Notion page `34967c87082c81ffacfbd04b59df64fe` and Git commit
[`3b256587`](https://github.com/strale-io/strale/commit/3b25658736bfed53eec52c8acf2619dacd54d1f5)
both use the historical ID `DEC-20260422-A`, first documented as an
unresolved cross-surface collision in
`archive/sessions/2026-09-01-m2-enforcement-protocol-source-gaps.md`.
`DEC-20260904-B` landed a general cross-surface identity mechanism
(`--git-<sha>` record keys, symmetric to the existing `--notion-` qualifier)
without applying it. This report is the reviewed application of that
mechanism to this one collision.

- **Git meaning** — the Distribution PR Integrity Protocol, live in
  `CLAUDE.md` (also referenced by `AGENTS.md`,
  `docs/governance/protocols/DISTRIBUTION_PR_PREFLIGHT.md`, and
  `archive/sessions/CONTAINMENT_REPORT.md`). It receives the record key
  `DEC-20260422-A--git-3b256587`
  (`docs/decisions/records/DEC-20260422-A--git-3b256587.md`), whose evidence
  names the introducing commit as an ancestor of `HEAD`.
- **Notion meaning** — page `34967c87082c81ffacfbd04b59df64fe`, the Phase
  4b.2 orphan-resolution execution record. It stays evidence-only
  (`documented_only`).

## Why the Notion meaning is evidence-only

Page `34967c87082c81ffacfbd04b59df64fe` is a completed catalog-hygiene
execution log from before the readiness program (`DEC-20260812-A`), not a
decision a customer-facing or governance surface reads from today. No
matching Distribution PR Integrity Decision row was found in Notion by exact
ID, title query, or workspace search when the collision was first
documented; the two meanings are unrelated in substance, not merely in
identity.

`DEC-20260904-A` (the G1 pre-readiness feature-scope rule) deliberately
excludes any row whose page id or historical ID appears in the collision
registry or as a cross-surface collision — collision rows are G2/G3's remit,
not G1's. This row is therefore not covered by that rule and needed its own
reviewed classification, which this report is: an execution record whose
durable content is preserved as evidence, with no formal candidate record
created for it, because a formal record under the bare or a `--notion-`
qualified `DEC-20260422-A` key would either collide with the Git-native
protocol's identity or misrepresent a closed execution log as a standing
decision.

## Mechanism and record key

The resolution uses the mechanism `DEC-20260904-B` defines: a cross-surface
collision resolves to `disposition: resolved_collision` with
`collision.resolution_status: resolved` and `collision.row_disposition:
documented_only` exactly when a git-qualified formal record exists for the
collision id and a tracked gap report — this one — cited in the row's own
evidence names the row's page id. `row_disposition: formal_record` is not
supported for a cross-surface row in this stage. The Git meaning's record
key is `DEC-20260422-A--git-3b256587`.

## No-change boundary

- Do not edit the source Notion row or its Working Rules context.
- Do not change the live `CLAUDE.md` or `AGENTS.md` Distribution PR
  Integrity Protocol heading; `gitNativeClaims` continues to read it exactly
  as it is.
- Do not create a bare `DEC-20260422-A.md` or a `--notion-`-qualified record
  for the page.
- Do not delete or alter `archive/sessions/2026-09-01-m2-enforcement-protocol-source-gaps.md`;
  it remains cited evidence on the row alongside this report.
