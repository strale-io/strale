---
doc_type: session-plan
authority_scope: none
status: agreed
complete: true
phase: M2
authority_active: false
created_at: 2026-09-01
owners:
  - codex
reviewed_by:
  - codex-gpt-5.6-sol
review_route: codex-fallback-after-claude-weekly-limit
review_meaning: technical-migration-review-not-founder-approval
---

# M2 governance and reference-data decision batch plan

> [!CAUTION]
> **M2 TECHNICAL MIGRATION PLAN — NOT ACTIVE PROJECT AUTHORITY.**
> This plan records existing decisions and source-identity gaps. It does not
> create policy, activate the repo-native register, change current protocol
> triggers, retire Notion, or authorize M4 cutover.

## Outcome

Add inactive formal candidate records for three collision-safe, load-bearing
decisions:

- `DEC-20260424-A` — always-enforce decisions require structural enforcement
  and read-back verification;
- `DEC-20260504-A` — audit-follow-up code paths require fail-before/pass-after
  regression coverage and visibility checks;
- `DEC-20260517-A` — structured Provider-Coverage reference data is canonical
  in repository YAML rather than a mutable Notion mirror.

Also add a durable source-gap report for the originally proposed
`DEC-20260422-A` Distribution PR Integrity record. The report will explain why
that protocol cannot enter the formal graph under its current historical ID.

All new records remain `migration_status: candidate`,
`authority_scope: none`, and `authority_active: false`. Existing `AGENTS.md`,
`CLAUDE.md`, and Notion-backed workflows remain authoritative.

## Discovery that changed the batch

The current agent entrypoints label Distribution PR Integrity as
`DEC-20260422-A`. Git proves that label and protocol text were introduced by
commit `3b25658736bfed53eec52c8acf2619dacd54d1f5` after the hollow-framework-package
incident.

The Notion Decisions database, however, assigns the same ID to a different,
active, feature-scoped decision: “Phase 4b.2 orphan resolution partial,” page
`34967c87082c81ffacfbd04b59df64fe`. There is no matching Distribution PR
Integrity Decision row. This is a cross-surface identity collision even though
the generated Notion-only collision registry does not contain the ID. Creating
a formal protocol record with the bare ID would silently select one meaning
and violate the decision identity contract.

Therefore this batch will not create `DEC-20260422-A.md`, target the bare ID in
a relation, rename either historical meaning, edit the Notion row, or change
the live protocol label. A later identity-mechanism milestone must represent
non-Notion authority claims alongside Notion source rows before this collision
can be resolved safely.

## Included source audits

### `DEC-20260424-A` — structural enforcement and read-back

The active/global/high-confidence Notion row and current Working Rules Rule F
agree: an always-enforce decision requires a fail-closed mechanism at the
earliest viable lifecycle point and a read-back that proves the mechanism
fires. The source course-correction records three silent-governance failures:
documented rules and green CI checked the wrong surface while production state
drifted.

The candidate will preserve the requirement that a new always-enforce rule is
incomplete until enforcement exists or its gap is durably named. It will also
state the M4 implication: the repo-native router and record system cannot be
activated merely because the prose migrated; every routed rule needs an
enforcement/read-back disposition.

Evidence:

- Notion Decision `34967c87082c819fa6a9e23525a08c8c`;
- Working Rules page `33c67c87082c81ca91c7f5bfdccea5a2`;
- Journal course-correction `34967c87082c8127a7e0e9214bbb6dec`.

### `DEC-20260504-A` — audit-follow-up test coverage

No Notion Decision row carries this ID or title. The decision is nevertheless
an explicit, unambiguous repo-native historical decision rather than a
synthesized context-pack label:

- commit `31ca662e92d996d9d8a3ee150ce6f924d5419707` introduced the full protocol
  under the exact ID and shipped its structural tests;
- PR #44 documents the incident, decision, implementation, and test plan;
- current `CLAUDE.md` retains the original operative text;
- current `AGENTS.md` routes the same trigger; and
- the protocol-presence test plus many regression tests enforce/read back its
  application.

The candidate's historical metadata will be source-derived rather than
invented: `decided_at: 2026-05-04` from the introducing commit, `owner: petter`
from the human-authored/merged repository decision, `status: active` from the
current mandatory entrypoints, and `scope: global` from the repository-wide
trigger. Evidence will name this derivation explicitly. The record will not
claim that a missing Notion row exists.

The source's “does not override Distribution PR Integrity” clause will remain
prose only. It cannot become a graph edge because `DEC-20260422-A` is
cross-surface ambiguous.

### `DEC-20260517-A` — repo-canonical structured reference data

The active/global/high-confidence Notion row matches the implemented
`apps/api/coverage-matrix/` system: one YAML per
`(capability_slug, country, evidence_type)`, schema validation,
filename/content alignment, generated summary drift detection, and an
immutable migration snapshot.

The durable decision is that code-bound structured reference data lives in the
repo and Notion is historical evidence, not a writable mirror. The source also
contained a one-time instruction to archive the old Notion matrix and trash it
after thirty days. The matrix was archived, but the current workflow invariant
says never delete anything in Notion and the M2 plan freezes historical Notion
as evidence. The candidate must preserve this conflict visibly: the destructive
cleanup instruction is historical and non-executable under current authority.
It must not silently omit the instruction or perform the deletion.

Evidence:

- Notion Decision `36367c87082c81b99376c4225d38374c`;
- `apps/api/coverage-matrix/README.md` and its schema/generator/CI surfaces;
- implementation commits `5eeff8baf83de012540d954dbfce5837d5a1fe60` and
  `ef9f6649c59d111bdaf780c88072b98c953770fb`.

## Explicitly excluded adjacent decision

Do not migrate `DEC-20260517-B` in this batch. Its durable aim—verified repo
changes rather than unverified chat claims—remains sensible, but its operative
mechanism says Claude.ai has no filesystem/GitHub path and Petter must paste a
CC prompt into Claude Code. The founder's current operating model delegates
implementation directly to Codex or Claude Code, and both can edit isolated
worktrees. Importing the row as active without a forward contradiction decision
would make stale workflow mechanics appear current. Preserve the source and
queue it for a later contradiction/supersession batch.

## Record contract

Create:

- `docs/decisions/records/DEC-20260424-A.md` with topic
  `structural-rule-enforcement`;
- `docs/decisions/records/DEC-20260504-A.md` with topic
  `audit-follow-up-test-coverage`;
- `docs/decisions/records/DEC-20260517-A.md` with topic
  `reference-data-authority`.

Each record must have exact unambiguous `record_key` and `id`, the standard M2
inactive-authority metadata and warning, evidence that resolves to the audited
source, and exactly the five protected sections: Decision, Context, Rationale,
Consequences, and Reversal conditions.

No graph relation is required among these records. They have distinct topics,
and the sources do not declare supersession, amendment, interpretation, or
affirmation between them. Do not invent an edge merely because Rule F explains
the enforcement shape used by the other two.

## Source-gap report contract

Create
`archive/sessions/2026-09-01-m2-enforcement-protocol-source-gaps.md` as
non-authoritative M2 evidence. It must record:

- the two meanings currently labeled `DEC-20260422-A` with exact Notion/Git
  provenance;
- why the Notion-only collision registry does not catch the cross-surface
  reuse;
- the separate Git-only provenance of `DEC-20260504-A` and why that one is
  unambiguous enough to migrate;
- the exclusion of stale `DEC-20260517-B` mechanics;
- the no-change boundary for live protocol labels, Notion content, and M4;
- the required future mechanism: a source-qualified authority-claim identity
  layer or equivalent independently reviewed reconciliation.

## Implementation and review sequence

1. Route this plan first to Claude Opus/high, then Sonnet/high after a real
   provider failure. If the weekly limit remains, use a fresh
   `gpt-5.6-sol`/xhigh verifier under the founder's standing exception, record
   the Claude backlog, and retain cross-provider review as an M4 blocker.
2. Resolve all material plan findings and mark the plan agreed.
3. Add the source-gap report and three inactive records; stage new files before
   generation so the inventory sees them.
4. Run `npm run context:generate`, `npm run context:test`,
   `npm run context:check -- --json`, and `git diff --check`.
5. Commit and obtain a fresh exact-commit review with the same
   different-provider-first route. A Codex fallback permits this inactive M2
   merge only; it does not clear M4.
6. Open a PR, wait for required CI, merge, then file the durable handoff,
   review report, Claude backlog update, and Notion Journal entry without
   editing source Decisions.

## Required verification

- all three included IDs are absent from the unresolved Notion collision
  registry and have unique filenames/record keys;
- the Git-only provenance and metadata derivation for `DEC-20260504-A` are
  explicit and evidence-backed;
- no formal record or relation target uses ambiguous `DEC-20260422-A`;
- no record is created for `DEC-20260517-B`;
- `DEC-20260517-A` preserves the historical cleanup instruction while making
  clear that no Notion deletion is authorized;
- every record has exactly five protected sections and inactive authority;
- generated decision and inventory views are reproducible;
- context tests/checks and whitespace checks pass;
- exact-commit independent review returns no unresolved material finding.

## Completion boundary

Completion means the three safe candidates and the source-gap evidence are
reviewed, merged, handed off, and journaled. It does not resolve
`DEC-20260422-A`, supersede `DEC-20260517-B`, create a new global decision,
change live protocol triggers, delete Notion data, or authorize M4.

## Plan-review outcome

Claude Opus/high and Sonnet/high were both rejected by Claude Code's weekly
subscription limit before returning a verdict. The first broad Codex fallback
review exceeded its bounded window and was interrupted without a verdict. A
fresh, narrower `gpt-5.6-sol`/xhigh reviewer then returned PASS with no material
correction. It specifically affirmed the Git-native provenance of
`DEC-20260504-A`, the block on ambiguous `DEC-20260422-A`, the exclusion of
stale `DEC-20260517-B`, the non-executable treatment of the historical Notion
deletion instruction, the distinct topics, and the inactive M2/M4 boundary.
The passing verifier completed after its verdict.

## Implementation outcome

Implementation commit `5ab19ff09f6ead5674946c27ee62489a29b67071`
added the three inactive candidates, the source-gap report, and reproducible
generated context. `npm run context:test` passed 54/54,
`npm run context:check -- --json` returned zero findings, and
`git diff --check` passed.

Claude Opus/high and Sonnet/high were each attempted again for exact-commit
review and rejected by the weekly subscription limit. A fresh separate
`gpt-5.6-sol`/xhigh verifier returned PASS with no material findings after
checking live Notion sources, Git history, the deliberate exclusions, and the
inactive-authority boundary. PR [#465](https://github.com/strale-io/strale/pull/465)
then passed `check` and `integration-db` and merged as
`e02355aab61722eab1a25c7bb1a4a85140fda7b8`.

The closeout Journal entry is
[M2 governance and reference-data decision migration — PR #465](https://app.notion.com/p/3ce67c87082c81558c50dce0ee221210?pvs=204).
All source Decisions remain unchanged and the cross-provider review remains an
M4-blocking backlog item.
