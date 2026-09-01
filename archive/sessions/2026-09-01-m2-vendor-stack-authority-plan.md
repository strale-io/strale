---
doc_type: session-plan
authority_scope: none
status: agreed
complete: false
phase: M2
authority_active: false
created_at: 2026-09-01
owners:
  - codex
reviewed_by:
  - codex-gpt-5.6-sol
review_route: independent-codex-review-by-founder-direction
review_meaning: technical-migration-review-not-founder-approval
---

# M2 vendor-stack authority-chain migration plan

> [!CAUTION]
> **M2 TECHNICAL MIGRATION PLAN — NOT ACTIVE PROJECT AUTHORITY.**
> This plan records historical decisions and authority gaps. It does not select
> or switch a vendor, contact a vendor, create an account, accept terms, incur a
> recurring commitment, change runtime routing, activate the repo-native
> register, retire Notion, or authorize M4 cutover.

## Recommendation

Migrate one bounded, collision-free four-record foundation into the inactive M2
decision graph:

1. `DEC-20260427-A` — accept and disclose the measured adverse-media
   native-language coverage gap rather than pre-purchasing a second source;
2. `DEC-20260427-B` — use Dilisense alone for the then-current sanctions and
   PEP path rather than OpenSanctions, while retaining Dilisense primary plus
   Serper fallback for adverse media;
3. `DEC-20260429-A` — keep sanctions/PEP as a Dilisense Tier-2 wrapper and
   defer OpenSanctions self-hosting after the commercial-licence premise was
   disproved; and
4. `DEC-20260430-A` — make the Vendor Roster the then-current vendor-selection
   surface and require vendor changes to update the roster before dependent
   pages.

This is the safest first batch in the broader vendor-stack chain. The four
source IDs are unique, the current repository still implements the central
Dilisense outcome, and the batch exposes why the old `DEC-20260430-A` vendor
list cannot be promoted as current truth. Later amendments span many records,
including unresolved duplicate IDs for `DEC-20260505-D` and
`DEC-20260505-E`; they need their own collision-aware batches instead of being
silently folded into this record.

The founder also ended Claude check-ins during this planning session. The same
batch will persist the project-specific review-route override in the active
entrypoints and retire the pending Claude backlog as a historical record. Fresh
separate Codex tasks remain required at the plan, exact-commit, and closeout
gates; prior Claude verdicts remain historical evidence, not work to repeat.

## Exact source identities

An exact query of the live Strale Decisions data source returned one row for
each ID. None appears in `docs/decisions/id-collisions.yaml`, and no matching
formal record exists.

| ID | Historical status | Scope | Date | Notion source |
|---|---|---|---|---|
| `DEC-20260427-A` | active | product | 2026-04-27 | [Adverse-media coverage decision](https://app.notion.com/p/34f67c87082c81ed9f69de1583fd5f5e) |
| `DEC-20260427-B` | active | technical | 2026-04-27 | [Dilisense sanctions/PEP decision](https://app.notion.com/p/34f67c87082c813c98d2cad51d99384f) |
| `DEC-20260429-A` | active | technical | 2026-04-29 | [Dilisense wrapper and self-host deferral](https://app.notion.com/p/35167c87082c8172bff8f3485699c961) |
| `DEC-20260430-A` | active | global | 2026-04-30 | [Vendor-stack canonicalization](https://app.notion.com/p/35267c87082c81eca01cf6eedb5eafeb) |

The recorded `active` values are historical source data only.
`migration_status: candidate`, `authority_scope: none`, and
`authority_active: false` keep every repo record inert during M2.

## Proposed graph

- `DEC-20260427-B` has a `related_to` edge to `DEC-20260427-A`; its source
  explicitly names A as the same-session adverse-media decision.
- `DEC-20260429-A` has `related_to` edges to the already migrated
  `DEC-20260428-A` and `DEC-20260428-B`; its source explicitly classifies
  Dilisense under A and explains why B remains applicable to self-built
  services but not the wrapped sanctions/PEP path.
- `DEC-20260430-A` has `related_to` edges to the already migrated
  `DEC-20260428-A` and `DEC-20260428-B`; its source explicitly names both as
  governing doctrine that it does not supersede.
- No structured edge is invented from `DEC-20260429-A` to
  `DEC-20260427-B`. The later decision clearly continues the Dilisense outcome,
  but its source does not state a formal relation to B.
- No edge is created between `DEC-20260429-A` and `DEC-20260430-A`. The latter
  was written one day later but contradicted A's self-host deferral; a Journal
  correction established A as authoritative for that claim. Encoding a clean
  amendment edge would falsely repair source history.
- `DEC-20260430-A` says it supersedes parts of `DEC-20260420-K` and
  `DEC-20260422-H`. `DEC-20260420-K` is an unresolved reused-ID collision and
  is not targetable. `DEC-20260422-H` has one live Notion row but has not yet
  been migrated; the source describes only a partial retirement of its
  Movitz-dependent COGS path. Both edges are withheld and documented rather
  than aiming at an ambiguous target or broadening a partial supersession.

## Source-fidelity boundaries

### Dated evidence is not current vendor truth

The April decisions contain vendor prices, quotas, coverage claims, roadmap
labels, and product scope that were observations at the time. The formal
records will preserve the decisions and their evidence without presenting
those mutable details as current facts. Any operational use must re-query the
current canonical surfaces.

Current repository evidence confirms only bounded points relevant to this
batch:

- `apps/api/src/lib/platform-facts.ts` names Dilisense for sanctions, PEP, and
  primary adverse media, with Serper as the adverse-media fallback;
- the sanctions, PEP, and adverse-media executors and manifests use those
  sources today;
- `STALE_VENDORS` treats OpenSanctions self-host as deferred; and
- the Vendor Control Tower monitors account health and spend consequences but
  is not a vendor-selection register.

Manifests, `platform-facts.ts`, dependency metadata, the coverage matrix, and
live database facts remain the current runtime evidence. Historical Decision
bodies explain why choices were made; they do not replace those state surfaces.

### Four known defects in `DEC-20260430-A`

The record must carry explicit correction evidence:

1. [Digiteal pricing correction](https://app.notion.com/p/35267c87082c817b81aaefae94a0d71a)
   invalidated the “pure PAYG, no monthly floor, setup waived” description.
2. [OpenSanctions correction](https://app.notion.com/p/35367c87082c8147a642e5fe3ac006a0)
   established that `DEC-20260429-A` had already deferred self-hosting
   indefinitely.
3. [OpenOwnership BODS correction](https://app.notion.com/p/35967c87082c81dc905fceff85603fe5)
   proved that a vendor evaluated and deferred had been promoted into the
   active-stack narrative despite no deployed integration.
4. The source's doctrinal-context section calls `DEC-20260427-A` the decision
   that dropped OpenSanctions, and the 2026-05-01 Journal correction repeats
   that label. The live source identities establish that
   [`DEC-20260427-A`](https://app.notion.com/p/34f67c87082c81ed9f69de1583fd5f5e)
   is the adverse-media accept-and-disclose decision and
   [`DEC-20260427-B`](https://app.notion.com/p/34f67c87082c813c98d2cad51d99384f)
   is the OpenSanctions/Dilisense decision. The migration preserves the
   mistaken citation as source history but never encodes it as a graph edge.

These corrections do not authorize editing the immutable source Decision.
They are evidence that its dated roster snapshot cannot answer “what vendors
are we using now?”

### Re-evaluation triggers do not authorize external acts

The historical sources contain spend thresholds, customer-count triggers,
annual reviews, and “do not re-evaluate without new signal” language. In the
repo candidates those triggers reopen technical evaluation only. They do not
authorize vendor contact, account creation, terms acceptance, licensing,
commitments, recurring cost, or company representation. Those acts remain
founder-reserved under `docs/company/CHARTER.md`.

The current Charter also gives Codex and Claude the technical vendor choice.
The durable interpretation is therefore: agents investigate and recommend or
choose the technical path within existing authority, while reserved external
acts remain `approval_required` in the decision queue and are presented as a
settled approval request. `AUTHORIZATION_UNAVAILABLE` may describe the runtime
permission state when execution lacks a required grant or credential; it never
reclassifies a founder-reserved decision.

## Why the old authority hierarchy cannot be copied forward

`DEC-20260430-A` instructed sessions to read Vendor Roster first, then its
commitment narrative, and update the roster before consumer pages. The later
Active Vendor Stack page accumulated many amendments and eventually said the
Decisions DB was vendor-status authority. `DEC-20260517-A` separately moved
structured capability-by-country reference data to repo YAML. Current code
also has `STATIC_FACTS.vendors`, manifests, dependency metadata, and a Vendor
Control Tower.

Those surfaces answer different questions:

- formal Decisions: why a durable choice or constraint exists;
- manifests, platform facts, dependencies, and database facts: what code can
  serve now and through which source;
- Vendor Control Tower: whether an already configured vendor account is
  currently usable; and
- historical Vendor Roster / Active Vendor Stack: migration evidence and
  dated commercial research.

M2 must not choose a new writable vendor registry by implication. The
authority-gap report will inventory the current surfaces and preserve an M3
requirement to designate one repo-owned current-vendor state model, generate
derived views, and prove its relationship to formal Decisions and runtime
dependency data before M4 retires the Notion surfaces.

## Files to add or update

- add `docs/decisions/records/DEC-20260427-A.md`;
- add `docs/decisions/records/DEC-20260427-B.md`;
- add `docs/decisions/records/DEC-20260429-A.md`;
- add `docs/decisions/records/DEC-20260430-A.md`;
- add `archive/sessions/2026-09-01-m2-vendor-stack-authority-gaps.md`;
- update `CLAUDE.md` and its `AGENTS.md` derivative with the founder's active
  project-specific no-Claude-review override;
- add a dated override to the operating-model migration plan so its historical
  Claude-gate wording cannot restart those checks;
- mark the existing Claude verification backlog retired while preserving every
  historical attempt and verdict requirement as evidence;
- replace `STATE.md`'s pending-Claude review debt with the new separate-Codex
  route;
- regenerate only repository context derived from tracked evidence; and
- after the implementation merge, add a review report, handoff, and new
  Journal entry without editing source Decisions or prior Journal entries.

Each formal record will keep exactly the five protected sections: Decision,
Context, Rationale, Consequences, and Reversal conditions.

## Implementation and review sequence

1. Use a fresh `gpt-5.6-sol`/xhigh Codex verifier for this plan. The founder
   explicitly ended Claude check-ins on 2026-09-01; no further Claude attempt
   or new Claude-backlog entry is required.
2. Resolve every material plan finding and mark this plan agreed.
3. Add the four inactive records and the authority-gap report. Stage authored
   files before generation so the legacy inventory sees them. Apply the
   founder-directed review-route override to the active project entrypoints and
   retire the old backlog without deleting its history.
4. Run `npm run context:generate`, `npm run context:test`,
   `npm run context:check -- --json`, and `git diff --check`.
5. Commit and obtain a fresh exact-commit review from a different Codex task.
6. Open and merge the implementation PR only after required CI passes.
7. Create the completion Journal entry, add closeout evidence and handoff,
   independently review the closeout, merge it, close every verifier task, and
   remove the registered worktree after ancestor proof.

## Required verification

- the live Decisions query returns exactly one row for every proposed ID;
- none of the four IDs is collided, duplicated, or already migrated;
- every formal relation is source-supported and targetable by `record_key`;
- the collided `DEC-20260420-K` target and unmigrated partial
  `DEC-20260422-H` target remain unlinked with distinct reasons recorded;
- all four `DEC-20260430-A` defects are prominent and source-linked, including
  the A/B identity error that must not become a graph relation;
- no April price, quota, coverage, contract, or vendor-status claim is
  represented as current without current evidence;
- current Dilisense/Serper runtime evidence is described narrowly and no
  production state is inferred from a code comment alone;
- historical v1/v1.1 and Payee Assurance language remains historical;
- the Charter's technical-choice and founder-reserved external-act boundaries
  are both preserved;
- the Vendor Control Tower is not misrepresented as selection authority;
- no source Decision or Journal content, product behavior, vendor routing,
  database state, or production state changes; entrypoint edits are limited to
  the founder-directed review-routing override;
- generated context is reproducible and warning-clean; and
- exact-commit independent review returns no unresolved material finding.
- active entrypoints no longer instruct future sessions to invoke Claude for a
  review or second opinion, and historical plan/backlog wording has an explicit
  dated override rather than being silently rewritten;

## Completion boundary

Completion means this four-record historical foundation and its
authority/correction gaps are independently reviewed, merged, handed off, and
journaled, and the no-Claude-review direction is persistent in project
entrypoints. It does not migrate every later vendor decision, resolve the
`DEC-20260505-D/E` collisions, establish the M3 current-vendor schema, select
or switch a vendor, approve licensing or spend, activate repo-native authority,
or authorize M4/Notion retirement.

## Plan-review outcome

Claude Opus/high and Sonnet/high were attempted before the founder ended Claude
check-ins; both timed out without a verdict. After the founder's direction, all
review routing was changed to fresh separate Codex tasks and no new Claude debt
was created.

The first `gpt-5.6-sol`/xhigh reviewer found four material source/authority
issues: adverse media needed to preserve the Serper fallback; `DEC-20260429-A`
needed its explicit doctrine relations; `approval_required` could not be
collapsed into `AUTHORIZATION_UNAVAILABLE`; and a stale backlog instruction
remained. It then found the distinct A/B identity error embedded in
`DEC-20260430-A`. All five findings were corrected.

After the founder-directed entrypoint persistence was added, a fresh reviewer
found one contradictory no-entrypoint-change acceptance line. That line was
narrowed to allow only the explicit review-route override. A third fresh
reviewer returned PASS with no material findings and completed after its
verdict.
