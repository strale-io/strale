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
review_meaning: technical-migration-review-not-founder-approval
review_route: codex-fallback-after-claude-weekly-limit
---

# M2 deploy-safety decision batch plan

> [!CAUTION]
> **M2 TECHNICAL MIGRATION PLAN — NOT ACTIVE PROJECT AUTHORITY.**
> This batch records two existing Notion decisions that are already enforced
> by `CLAUDE.md` and `AGENTS.md`. It does not create or amend product policy,
> activate the repo-native register, retire Notion, or authorize M4 cutover.

## Outcome

Add inactive formal candidate records for the two global deploy-safety
protocols that protect long-silent bulk operations and code paths dependent on
deploy-pipeline behavior:

- `DEC-20260504-B` — Bulk-Operation Deploy Protocol;
- `DEC-20260504-C` — Deploy Mechanism Verification Protocol.

The records will preserve the operative rules, incident provenance, required
verification, reporting obligations, and the boundary between the two
protocols. They will remain `authority_scope: none` and
`authority_active: false`; the existing agent entrypoints remain authoritative.

## Why this is the next bounded batch

Both decisions are active, global, high-confidence Notion rows with unique
historical IDs. Neither appears in `docs/decisions/id-collisions.yaml`. Their
rules are already named as mandatory triggers in `AGENTS.md`, fully stated in
`CLAUDE.md`, pinned by `apps/api/src/lib/claude-md-protocols.test.ts`, and cited
throughout current strategy, remediation, and design documents. This makes the
batch high-value and low-interpretation: it records an existing safety contract
rather than selecting among unresolved product options.

The records belong together because the same 2026-05-04 incident sequence
demonstrated two different failure classes:

1. a corrected bulk operation can release accumulated work and exceed
   infrastructure capacity; and
2. correct code can still have no production effect when the actual deploy
   mechanism never reaches it.

The first protocol governs workload resumption. The second governs reachability
and post-deploy proof. A change can trigger either or both.

## Source and contradiction audit

Primary sources:

- Notion decision page `35667c87082c81fabc3cf9ecc4871d90` for
  `DEC-20260504-B`;
- Notion decision page `35667c87082c81e7af49fc042371f566` for
  `DEC-20260504-C`;
- Notion Journal page `35667c87082c8148ae24faee34f01c1d` for the
  Postgres incident and subsequent corrections;
- GitHub PRs #51 and #52 for the startup-migration reachability repair and its
  single-source-of-truth follow-up;
- the current protocol text in `CLAUDE.md`, trigger table in `AGENTS.md`, and
  protocol-presence test.

The Notion rows and current entrypoints agree on the operative requirements.
No active decision was found that supersedes, reverses, or narrows either
protocol. The retired scoring system is historical context only: the source
decisions' “does not override” list records the boundary at decision time and
must not be represented as a dependency on a still-active SQS implementation.

The incident Journal corrects its own early estimate of the accumulated row
count and leaves the exact disk-fill sub-cause partly uncertain. Therefore the
formal records must state only the evidence-backed structural lesson: an
unbounded first successful bulk run coincided with the crash and the later
bounded implementation removes that class of risk. They must not harden the
initial “weeks / 107k rows” estimate or a single unproven disk-fill mechanism
into decision fact.

## Record contract

Create `docs/decisions/records/DEC-20260504-B.md` and
`docs/decisions/records/DEC-20260504-C.md` with:

- exact unambiguous `record_key` and historical `id`;
- historical `status: active`, `scope: global`, `owner: petter`, and
  `decided_at: 2026-05-04`;
- shared topic `deploy-safety`;
- evidence links to the exact Notion pages and relevant repository/GitHub
  artifacts;
- `migration_status: candidate`, `phase: M2`, `authority_scope: none`, and
  `authority_active: false`;
- the standard visible M2 inactive-authority warning;
- exactly the five protected sections: Decision, Context, Rationale,
  Consequences, and Reversal conditions.

`DEC-20260504-B` must preserve:

- the workload-resumption trigger for a long-silent bulk operation;
- the pre-merge accumulated-workload audit;
- explicit choice between supervised pre-drain and bounded self-throttling;
- refusal to call the deploy complete without first-run outcome evidence;
- relevant resource dimensions, including rows/bytes, WAL or replication,
  connection pools, memory/disk, and upstream rate limits.

`DEC-20260504-C` must preserve:

- identification of the exact deploy-pipeline dependency;
- inspection of the real entrypoint, build, startup, env, scheduler, cron, or
  workflow wiring;
- proof by reachable file path rather than historical assumption;
- post-deploy verification of the resulting production artifact rather than a
  log line alone;
- refusal to call the change complete when that proof is missing.

Give `DEC-20260504-C` one non-retiring `related_to` edge targeting
`DEC-20260504-B`. This records the source decisions' explicit coexistence and
satisfies the active same-topic connectivity invariant without claiming
supersession, amendment, interpretation, or affirmation. `DEC-20260504-B`
needs no reciprocal stored edge because the generated index supplies inverse
views.

## Implementation sequence

1. Obtain an independent plan review. Route first to Claude Opus/high effort,
   then Claude Sonnet/high effort only after a real provider timeout or
   invocation failure. If both fail, use a separate Codex
   `gpt-5.6-sol`/xhigh reviewer and add this batch to the Claude verification
   backlog. The founder explicitly authorized this same-provider fallback when
   Claude's quota is exhausted. It permits this inactive M2 documentation
   batch to continue and merge, but it remains an explicit exception to the
   normal different-provider gate and does not clear this batch for M4
   authority activation.
2. Amend this plan with the reviewer route, verdict, and any accepted
   corrections; mark it complete only after material findings are resolved.
3. Add the two candidate records and stage them so the context generator can
   inventory new records.
4. Run `npm run context:generate`, then `npm run context:test` and
   `npm run context:check -- --json`; inspect the generated decision index and
   confirm no unrelated generated drift.
5. Commit the implementation and obtain an exact-commit independent review
   with the same different-provider-first routing. Use a fresh Codex verifier
   only after bounded Claude failures, record the backlog, and complete the
   verifier after its verdict. A Codex fallback verdict is sufficient for this
   inactive M2 merge only under the founder's standing exception; the Claude
   backlog remains a blocking prerequisite for later M4 activation.
6. Open the PR, wait for required CI, merge only on a clean review and green
   gates, then add the normal repo handoff and Notion Journal record without
   editing either source Decision page.

## Required verification

- both record filenames equal their `record_key` values;
- neither ID is present in the unresolved collision registry;
- source title, status, date, scope, and operative requirements match the exact
  Notion pages;
- the corrected Journal evidence is reflected without claiming an uncertain
  backlog size or crash sub-cause as settled fact;
- `DEC-20260504-C` has exactly one `related_to` edge to `DEC-20260504-B`, the
  inverse view generates correctly, and no directional cycle is introduced;
- generated `docs/project/DECISIONS.md` contains both records under the
  `deploy-safety` topic;
- both records retain the inactive-authority metadata and visible warning;
- `npm run context:test`, `npm run context:check -- --json`, and
  `git diff --check` pass;
- the exact implementation commit receives an independent verdict with no
  unresolved material finding.

## Completion boundary

Completion means this two-record candidate batch is independently reviewed,
merged, handed off, and journaled. It does not activate repo-native decisions,
resolve any historical ID collision, change either protocol's trigger, or
authorize Notion retirement or M4.

## Plan-review outcome

Claude Opus/high and Sonnet/high were both rejected by Claude Code's weekly
subscription limit before returning a verdict. A fresh
`gpt-5.6-sol`/xhigh verifier first found that two active records sharing one
topic require an explicit graph connection. The plan now records a
non-retiring `DEC-20260504-C` → `DEC-20260504-B` `related_to` edge. The same
verifier then returned PASS with no remaining material issue after applying
the founder-authorized Codex fallback boundary documented above. The verifier
completed immediately after its final verdict.
