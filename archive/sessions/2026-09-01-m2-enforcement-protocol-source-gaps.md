---
doc_type: decision-source-gap-report
authority_scope: none
status: evidence
complete: true
phase: M2
authority_active: false
created_at: 2026-09-01
---

# M2 enforcement-protocol decision source gaps

> [!CAUTION]
> **M2 EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report explains why some live protocol labels cannot yet become formal
> decision records. It does not change those protocols, resolve an identity,
> edit Notion, or authorize M4.

## `DEC-20260422-A` has two cross-surface meanings

Git commit
[`3b256587`](https://github.com/strale-io/strale/commit/3b25658736bfed53eec52c8acf2619dacd54d1f5)
introduced the Distribution PR Integrity Protocol under `DEC-20260422-A` after
the hollow-framework-package incident. `CLAUDE.md`, `AGENTS.md`, the protocol
presence test, release documentation, strategy documents, and current package
workflow still use that meaning.

The Notion Decisions database assigns `DEC-20260422-A` to a different active,
feature-scoped decision:
[Phase 4b.2 orphan resolution partial](https://app.notion.com/p/34967c87082c81ffacfbd04b59df64fe?pvs=204).
No matching Distribution PR Integrity Decision row was found by exact ID,
title query, or workspace search.

The existing `docs/decisions/id-collisions.yaml` is generated from duplicate
Notion source rows. It therefore cannot detect a single Notion row colliding
with an authority claim introduced directly in Git. A bare formal record would
silently select one meaning. This batch consequently creates no
`DEC-20260422-A.md` and no relationship target using that ID.

Future resolution requires an independently reviewed identity mechanism that
can represent source-qualified non-Notion authority claims alongside Notion
rows. Neither historical meaning should be renamed, deleted, or chosen by
convenience.

## `DEC-20260504-A` is Git-native but unambiguous

No Notion Decision row uses `DEC-20260504-A`. Unlike the collision above, only
one historical meaning was found. Commit
[`31ca662e`](https://github.com/strale-io/strale/commit/31ca662e92d996d9d8a3ee150ce6f924d5419707)
and [PR #44](https://github.com/strale-io/strale/pull/44) introduced the exact
ID, full Audit-Follow-up Test Coverage Protocol, its implementation, and its
tests in one reviewed change. The text remains mandatory in both agent
entrypoints and is referenced by many current regression tests.

This is sufficient provenance for an inactive formal candidate as long as the
record says explicitly that its metadata is derived from Git and current
entrypoints rather than pretending a Notion source exists. Its active/global
status does not activate the candidate graph; that remains disabled until M4.

## `DEC-20260517-B` is preserved but not migrated

The [Notion source](https://app.notion.com/p/36367c87082c81048009eedcd0dbcd17?pvs=204)
and `apps/api/coverage-matrix/PROTOCOL.md` require Claude.ai to emit a Claude
Code prompt that Petter manually pastes because chat supposedly lacks a repo
write path. That mechanism no longer describes the founder's operating model:
Codex and Claude Code now work directly in isolated worktrees and are delegated
technical implementation.

The durable objective—reference-data changes must be audited, validated,
committed, and checked—remains sound. Importing the source row as an active
formal candidate would nevertheless make stale mechanics appear current.
The row is therefore preserved as evidence and deferred to an explicit
contradiction/supersession batch.

## No-change boundary

- Do not edit either source Decision row or the current Working Rules page.
- Do not change the live `CLAUDE.md` or `AGENTS.md` protocol labels in this
  evidence batch.
- Do not add either source gap to the Notion-only collision registry without a
  schema/mechanism designed for cross-surface claims.
- Do not delete the archived Provider-Coverage database or any other Notion
  content.
- Do not treat this report or its candidate records as authority before M4.
