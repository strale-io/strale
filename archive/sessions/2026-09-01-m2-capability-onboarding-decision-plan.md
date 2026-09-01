---
doc_type: migration-plan
authority_scope: none
status: agreed
complete: true
phase: M2
reviewed_by: codex-gpt-5.6-sol
verified_at: 2026-09-01
authority_active: false
---

# M2 capability-onboarding decision-chain plan

## Recommendation

Migrate one bounded, collision-free four-record chain into the inactive M2
decision graph:

1. `DEC-20260320-B` — the original always-enforce capability-onboarding rule,
   recorded as superseded;
2. `DEC-20260422-C` — the directionally correct but specifically wrong bypass
   hypothesis, recorded as superseded;
3. `DEC-20260423-A` — the active structural-remediation decision that corrected
   the diagnosis and shipped the staged fix; and
4. `DEC-20260423-B` — the active revised onboarding protocol that supersedes
   `DEC-20260320-B` and preserves its always-enforce principle with corrected
   lifecycle mechanisms.

This is the next load-bearing batch because capability onboarding is a
mandatory session protocol in both agent entrypoints and has executable
enforcement in the current repository. Migrating the old label by itself would
be false: Notion explicitly superseded it on 2026-04-23.

## Exact source rows

An exact query of the Strale Decisions data source returned one row for each
ID and no duplicates. None appears in `docs/decisions/id-collisions.yaml`.

| ID | Source | Historical status | Scope | Date |
|---|---|---|---|---|
| `DEC-20260320-B` | [Notion Decision](https://app.notion.com/p/32967c87082c81b7a8ccd169b431f99c) | superseded by `DEC-20260423-B` | global | 2026-03-20 |
| `DEC-20260422-C` | [Notion Decision](https://app.notion.com/p/34967c87082c81ec8c4dd04c40ba5685) | superseded by `DEC-20260423-A` | global | 2026-04-22 |
| `DEC-20260423-A` | [Notion Decision](https://app.notion.com/p/34967c87082c81c08b89ea9ecc0fb478) | active | global | 2026-04-23 |
| `DEC-20260423-B` | [Notion Decision](https://app.notion.com/p/34967c87082c81e6bf87f4ce36729be2) | active | global | 2026-04-23 |

Supporting context is the current
[Capability onboarding pipeline](https://app.notion.com/p/33c67c87082c81969b1fe32c87095f5a)
Internals page and the historical
[Capability Onboarding Pipeline design spec](https://app.notion.com/p/32467c87082c819aa731d8a5f7237b33).
The Decisions rows remain the source for formal status and operative decision
content; the design spec contains later-retired SQS and lifecycle details and
must not be copied wholesale.

## Proposed graph

All four records use topic `capability-onboarding`.

- `DEC-20260423-B` `supersedes` `DEC-20260320-B`.
- `DEC-20260423-A` `supersedes` `DEC-20260422-C`.
- `DEC-20260423-B` is `related_to` `DEC-20260423-A` because the revised
  protocol depends on the same audit and the structural fix implements its
  corrected mechanisms without retiring either active decision.

The two `supersedes` edges exactly reproduce Notion's `Superseded By`
relations. The non-retiring edge is supported bidirectionally by the source
text: A identifies the corrected enforcement stages; B explicitly names A's
audit and fix as the basis for the revised pipeline.

## Source-fidelity boundary

The candidate records must preserve these distinctions:

- `DEC-20260320-B` correctly separated WHAT a prompt asks for from HOW a
  capability enters Strale, but incorrectly implied that one post-insert hook
  populated reliability and limitations.
- `DEC-20260422-C` correctly detected a structural gap but incorrectly blamed
  runtime `auto-register.ts` as a database insertion path and estimated a
  smaller affected cohort.
- `DEC-20260423-A` corrected the root cause, chose live discovery rather than
  fallback-derived metadata, added readiness gates, routed writers through
  `persistCapability`, installed a database trigger, backfilled eligible
  capabilities, parked blocked cohorts, and then made the gates blocking.
- `DEC-20260423-B` retained the always-enforce rule while distributing the
  authoritative steps across PR-time manifest validation, live discovery,
  test execution, structural validation, and pre-activation readiness.

Historical incident counts and outcomes may be recorded as dated evidence;
they are not current capability counts. The old SQS engine, automatic lifecycle
transitions, and seed-based new-capability path were later changed or retired
and must not re-enter current instructions through these records.

## Current repository verification

The core corrected mechanisms still have current code surfaces:

- `apps/api/scripts/onboard.ts` verifies fixtures before calling
  `persistCapability` and uses the persistence path for create/update work;
- `apps/api/src/lib/capability-persistence.ts` remains the transactional
  write path and sets the transaction-local capability-insert token;
- `apps/api/src/routes/admin.ts` routes capability creation through
  `persistCapability`;
- `apps/api/src/lib/capability-readiness.ts` keeps reliability and active
  limitation checks blocking;
- `.github/workflows/ci.yml`,
  `apps/api/scripts/check-manifest-guaranteed-consistency.mjs`, and the runtime
  guaranteed-fields sentinel supply later composing checks; and
- the five implementation commits named by `DEC-20260423-A` exist:
  `a2b8d69e`, `850d44f5`, `94b2078c`, `fc96a401`, and `73395b47`.

This verification supports source fidelity; it is not an activation or a
claim that every historical mechanism still provisions correctly.

## Enforcement gap that must remain explicit

Commit `94b2078c` introduced
`apps/api/drizzle/0051_capability_insert_guard.sql`, a PostgreSQL trigger that
blocked direct inserts unless the transaction-local token was set. Commit
`3e60d5d3` later removed the Drizzle migration directory while adopting the
in-TypeScript startup-migration convention. The current repository still sets
the token in `persistCapability`, but a repository-wide search finds no current
DDL that creates `capability_insert_guard` or
`check_capability_insert_guard`.

Consequently this batch must not claim that a fresh database is structurally
protected, or that production currently has the trigger without read-only
production proof. The implementation will add a source-gap report that marks
fresh-database trigger provisioning and production read-back as unresolved
follow-up. Fixing deployment or database state is outside this docs-only batch
and would separately trigger deploy-mechanism verification.

## Entrypoint drift

`CLAUDE.md` and `AGENTS.md` still call the mandatory rule “Capability
Onboarding Protocol (`DEC-20260320-B`)” even though that row is formally
superseded by `DEC-20260423-B`. The drift is broader than the label:
`CLAUDE.md` also requires agents to read the historical design spec as the
pipeline authority, while that spec still contains retired SQS, automatic
lifecycle-transition, and seed-era mechanics. The entrypoint's later inline
steps largely reflect the revised manifest-driven pipeline, but the old ID and
full-spec authority dependency can route a fresh session into contradictory
instructions.

M2 remains non-authoritative, so this batch will not edit either entrypoint or
the historical spec. The source-gap report will preserve the mismatch and
require the M4 cutover to route the protocol to the active revised decision
and replace the historical full-spec authority dependency with a current,
bounded repo-native protocol surface. That change must occur only after
cross-provider review and enforcement/read-back resolution; merely changing
the displayed decision ID is not sufficient.

## Files to add or update

- add four inactive records under `docs/decisions/records/`;
- add
  `archive/sessions/2026-09-01-m2-capability-onboarding-authority-gaps.md`;
- update the Claude verification backlog with the review route;
- regenerate only the context files changed by the four records and new
  evidence; and
- after merge, add the review report, handoff, and Notion Journal entry without
  editing any source Decision.

Each decision record will contain exactly the five protected sections and the
standard inactive warning. `status` reproduces historical source status while
`migration_status: candidate`, `authority_scope: none`, and
`authority_active: false` keep the entire graph inactive.

## Review and implementation sequence

1. Route this plan to Claude Opus/high, then Sonnet/high after a real provider
   failure. If the weekly limit remains, use a fresh
   `gpt-5.6-sol`/xhigh verifier under the founder's standing exception and keep
   the exact batch on the M4-blocking Claude backlog.
2. Resolve material plan findings and mark this plan agreed.
3. Add the four candidate records, authority-gap report, and backlog entry;
   stage authored files before generation.
4. Run `npm run context:generate`, `npm run context:test`,
   `npm run context:check -- --json`, and `git diff --check`.
5. Commit and obtain a fresh exact-commit review using the same
   different-provider-first route.
6. Merge only after required CI passes; then write the closeout evidence and
   Journal entry, independently review that closeout, merge it, and terminate
   all verifier tasks.

## Required verification

- exact Decisions data-source query returns one row for each ID;
- filenames and record keys equal the four unambiguous IDs;
- both supersession edges match Notion relations exactly;
- the two active same-topic records have one non-retiring `related_to` edge;
- the corrected versus rejected mechanism claims remain distinct;
- current code evidence is described without claiming missing trigger DDL or
  live production state as verified;
- later-retired SQS, lifecycle, and seed mechanics do not become current
  authority;
- M4 acceptance requires removing both the stale `DEC-20260320-B` route and
  the stale full-body dependency on the historical design spec;
- no entrypoint, source Decision, product behavior, database, or production
  state changes;
- generated context is reproducible and warning-clean; and
- exact-commit independent review returns no unresolved material finding.

## Completion boundary

Completion means this four-record historical chain and its enforcement gaps are
independently reviewed, merged, handed off, and journaled. It does not create
or modify a capability, repair the missing fresh-database trigger definition,
assert current production trigger state, update mandatory entrypoints or the
historical design spec, activate repo-native authority, resolve unrelated
decision IDs, or authorize M4/Notion retirement.

## Plan-review outcome

Claude Opus/high and Sonnet/high were both rejected by Claude Code's weekly
subscription limit before returning a verdict. A fresh
`gpt-5.6-sol`/xhigh verifier found one MEDIUM omission: the entrypoint gap also
included `CLAUDE.md`'s authoritative pointer to a historical design spec with
retired mechanisms, not only the superseded decision label. The plan now
requires M4 to replace both dependencies while preserving the M2 no-change
boundary. The same verifier re-reviewed the amendment, returned PASS with no
remaining finding, and completed after its verdict.

## Implementation outcome

The agreed batch was implemented in exact commit
`1e64efdd384dc030439e29474e391b08ade9058f`. A fresh
`gpt-5.6-sol`/xhigh verifier independently checked the exact commit against the
live Notion rows, the five historical implementation commits, the current
repository, and the generated decision graph. It returned PASS with no
material findings and completed after its verdict.

PR [#467](https://github.com/strale-io/strale/pull/467) passed the required
`check` and `integration-db` jobs and merged as
`6e1c28194e906f062aaef48e1f18e95f05b0872d`. The completion Journal entry is
[M2 capability-onboarding decision chain migrated](https://app.notion.com/p/3ce67c87082c8130bc0cf2918a1b694f?pvs=204).

The implementation did not edit the source Decisions, entrypoints, historical
design spec, runtime, database, or production state. All four records remain
inactive candidates. Cross-provider verification remains required before M4.
