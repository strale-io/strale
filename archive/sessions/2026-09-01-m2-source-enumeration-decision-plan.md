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

# M2 source-enumeration decision batch plan

> [!CAUTION]
> **M2 TECHNICAL MIGRATION PLAN — NOT ACTIVE PROJECT AUTHORITY.**
> This plan records existing decisions and source gaps. It does not create
> sourcing policy, authorize vendor contact or commitments, activate the
> repo-native register, change current protocol triggers, retire Notion, or
> authorize M4 cutover.

## Recommendation

Migrate one bounded, collision-free two-record chain into the inactive M2
decision graph:

1. `DEC-20260518-E` — exhaustive source enumeration is required before a
   country/source investigation is classified as blocked, no-free-path, or
   paid-only; and
2. `DEC-20260518-G` — the paid-aggregator path must also probe hidden fixed-cost
   commitments, and RFQ-gated pricing remains attestation-required rather than
   proven viable.

This is the next load-bearing batch because Codex and Claude now own technical
vendor-path choices under the operating charter, while vendor contact,
licensing, accounts, and commitments remain founder-reserved. These decisions
define the evidence work the agents must complete before that reserved boundary
is reached. Historical application overturned several false blocked verdicts,
yet neither decision is routed by the current agent entrypoints or governance
protocol surfaces.

## Exact source rows

An exact query of the live Strale Decisions data source returned one row for
each ID and no duplicates. Neither ID appears in
`docs/decisions/id-collisions.yaml` or the existing record directory.

| ID | Source | Historical status | Scope | Date |
|---|---|---|---|---|
| `DEC-20260518-E` | [Notion Decision](https://app.notion.com/p/36467c87082c817db910d00b828a2bf3) | active | global | 2026-05-18 |
| `DEC-20260518-G` | [Notion Decision](https://app.notion.com/p/36467c87082c81129f04e07d01a93045) | active | global | 2026-05-18 |

The `Source` property on `DEC-20260518-E` points to PR #137. That PR implemented
CZ representative extraction but does not contain the decision text or the
later eight-path research corpus. The Notion page is therefore the formal
content source; PR #137 is preserved as adjacent historical provenance, not
misrepresented as the full decision artifact.

## Proposed graph

Both records use topic `source-enumeration`.

- `DEC-20260518-G` `amends` `DEC-20260518-E`.

The source explicitly calls G a refinement of E's paid-aggregator path and says
it does not supersede E. `amends` is therefore the narrowest supported typed
relationship: both decisions remain active, and the generated inverse is
`amended_by` rather than `superseded_by`.

No relation will be invented to `DEC-20260511-D`. That general vendor-
evaluation decision does not name E or G, and its operative methodology still
lives on a separate Notion page. It should be audited as its own later batch.

## Durable source-enumeration contract

The `DEC-20260518-E` candidate will preserve the minimum eight-path research
rubric:

1. the same source's other products, endpoints, schemas, or operations, after
   fully enumerating the applicable OpenAPI, WSDL, or equivalent specification
   rather than stopping at the first endpoint;
2. authenticated free access at the same source;
3. other free or open aggregators;
4. other paid per-call aggregators;
5. every data product exposed by the source and relevant open-data portals,
   including bulk files, RDF, SPARQL, or GraphQL rather than only the primary
   API product;
6. a public registry web page or PDF only under the active sourcing doctrine;
7. BRIS or the applicable cross-border register surface; and
8. a separate court, commercial, or gazette register.

For every path, evidence must record the probed URL, endpoint schema or response
sample, fields returned, officer-data presence as `yes`, `no`, or `partial`,
cost model, observed latency, authentication or contract requirement, and
redistribution rights.
Named vendors and country examples in the 2026 source remain dated examples;
they must be re-queried rather than frozen into current doctrine.

The `DEC-20260518-G` candidate will preserve the six mandatory cost probes:
platform fee, setup or activation fee, monthly minimum, annual contract floor,
precommitted volume-tier floor, and termination fee. When pricing is RFQ-only,
magic-link-gated, or otherwise unable to establish all six dimensions, the
path remains `attestation-required`; absence of a public fee is not evidence
that no fee exists. It can clear that state only when a signed vendor pricing
attestation confirms the absence of all six fee structures. Obtaining that
attestation requires vendor contact and therefore remains founder-reserved;
the agents may prepare the evidence packet and exact questions but may not send
them or represent Moonlighter AB.

## Later-doctrine reconciliation

Three parts of the May wording require explicit reconciliation rather than
literal promotion:

- E's Path 6 originally paused for Petter to interpret the scraping doctrine.
  `DEC-20260518-F`, later affirmed by `DEC-20260813-A`, now supplies the active
  four-constraint interpretation. A future session must use that formal
  doctrine instead of asking the founder to re-decide the technical path.
- G expressed uncertain vendors as `v1.1 (attestation-required)`. The v1/v1.1
  country-launch program is historical product vocabulary. The durable state
  is only `attestation-required`; this migration must not reactivate a retired
  roadmap label.
- The old cost directive treated fixed fees as automatically out for v1. The
  current charter independently reserves vendor contact, account creation,
  terms, licensing, new recurring costs, and spend beyond its envelope to the
  founder. Agents may complete read-only enumeration and recommend a vendor,
  but this record cannot authorize contact, an account, a contract, or spend.

These are source-fidelity qualifications, not new policy. The candidate status
continues to reproduce the source row's `active` value while
`migration_status: candidate`, `authority_scope: none`, and
`authority_active: false` keep the repo graph inert.

## Git and current-repository evidence

The decisions were materially applied after creation:

- `c7e6ee9cc841aa09d67e3f5841a527eaee5bbd92` added the SE/DK exhaustive
  enumeration;
- `71f20bdfcc868c7c0575ef9c7685e1b3c3322105` added the NL/ES/AT enumeration;
- `644c1c5217d65375ce2138c64a1c2d991430774f` implemented the EE open-data
  path surfaced by the research; and
- `4376140930ad6ca8549b4abf24e4ce7455dd1ead` implemented the CY open-data path.

Current code still cites `DEC-20260518-E` in the EE and CY coverage matrices,
executors, ingest jobs, startup wiring, and manifests. The August direction
plan still identifies source qualification as a strict capability-factory gate
and cites the Topograph incident behind `DEC-20260518-G`.

That evidence proves historical application and continued relevance. It does
not prove current structural enforcement: `AGENTS.md`, `CLAUDE.md`, `.agents/`,
`.claude/`, `docs/governance/`, and `docs/project/` contain no routed E/G
protocol or complete eight-path/six-probe body.

## Enforcement gap to preserve

This batch will add
`archive/sessions/2026-09-01-m2-source-enumeration-authority-gaps.md` recording:

- the absent current entrypoint/router/skill coverage;
- the weak PR #137 `Source` property versus the actual Notion decision body and
  later Git application evidence;
- the Path 6 reconciliation through `DEC-20260518-F` and
  `DEC-20260813-A`;
- the retirement of v1/v1.1 vocabulary while retaining the evidence state
  `attestation-required`;
- the current charter boundary around vendor contact and commitments; and
- the M4 requirement for a bounded source-qualification protocol body,
  trigger/coverage mapping, and read-back evidence before activation.

M2 will not edit an entrypoint, create the future protocol body, contact a
vendor, query private pricing, create an account, change a capability, or alter
Notion source content.

## Files to add or update

- add `docs/decisions/records/DEC-20260518-E.md`;
- add `docs/decisions/records/DEC-20260518-G.md`;
- add the source-enumeration authority-gap report;
- update the Claude verification backlog with the exact review route;
- regenerate only context files changed by the new tracked evidence; and
- after implementation merge, add the review report, handoff, and Notion
  Journal entry without editing the source Decisions.

Each decision record will contain exactly the five protected sections and the
standard inactive warning.

## Review and implementation sequence

1. Route this plan to Claude Opus/high, then Sonnet/high after a real provider
   failure. If the weekly limit remains, use a fresh
   `gpt-5.6-sol`/xhigh verifier under the founder's standing exception and keep
   the exact batch on the M4-blocking Claude backlog.
2. Resolve every material plan finding and mark this plan agreed.
3. Add the two candidate records, authority-gap report, and backlog entry.
   Stage authored files before generation so the legacy inventory sees them.
4. Run `npm run context:generate`, `npm run context:test`,
   `npm run context:check -- --json`, and `git diff --check`.
5. Commit and obtain a fresh exact-commit review using the same
   different-provider-first route.
6. Merge only after required CI passes; then write the closeout evidence and
   Journal entry, independently review the closeout, merge it, and terminate
   all verifier tasks.

## Required verification

- the live Decisions query returns exactly one row per ID;
- neither ID is collided, duplicated, or already migrated;
- G's relation to E is non-retiring and generates `amended_by`;
- the eight research paths and six cost probes remain complete without making
  dated vendor claims current facts;
- Path 6 routes to the later active sourcing doctrine rather than reopening a
  founder question;
- `attestation-required` is preserved without reactivating v1/v1.1 roadmap
  language;
- vendor contact, accounts, terms, licensing, commitments, and reserved spend
  remain outside agent authority;
- PR #137 is not falsely described as containing the decision body;
- current code references are treated as provenance, not structural protocol
  coverage;
- no entrypoint, source Decision, product behavior, vendor state, or production
  state changes;
- generated context is reproducible and warning-clean; and
- exact-commit independent review returns no unresolved material finding.

## Completion boundary

Completion means this two-record chain and its source/enforcement gaps are
independently reviewed, merged, handed off, and journaled. It does not migrate
the broader Vendor Evaluation Methodology, contact or select a vendor, approve
licensing, change the product roadmap, resolve historical country findings,
activate repo-native authority, or authorize M4/Notion retirement.

## Plan-review outcome

Claude Opus/high and Sonnet/high were both rejected by Claude Code's weekly
subscription limit before returning a verdict. A fresh
`gpt-5.6-sol`/xhigh verifier found two MEDIUM source-fidelity omissions and one
LOW scope broadening:

- Path 1 needed explicit full OpenAPI/WSDL/spec enumeration, Path 5 needed all
  same-source data products and relevant open-data portals, and the per-path
  record needed exact officer-data presence as `yes`, `no`, or `partial`;
- G's RFQ clearance rule needed the signed attestation confirming absence of
  all six fee structures plus the founder-reserved vendor-contact boundary;
  and
- the stop condition needed to remain scoped to country/source investigations
  rather than a free-standing evidence path.

The plan was amended on all three points. The same verifier re-reviewed it,
returned PASS with no remaining material finding, and completed after its
verdict.

## Implementation outcome

The agreed batch was implemented in exact commit
`4a63773f7688478c7cbd8254ac15a9a6c4a102c6`. Fresh Claude Opus/high and
Sonnet/high exact-commit attempts were rejected by the weekly subscription
limit. A separate `gpt-5.6-sol`/xhigh verifier then checked the exact commit
against both live Notion rows and bodies, the cited Git history, current EE/CY
references, later sourcing doctrine, the operating charter, generated graph,
and inactive-authority boundary. It returned PASS with no HIGH, MEDIUM, or LOW
findings and completed after its verdict.

PR [#469](https://github.com/strale-io/strale/pull/469) passed the required
`check` and `integration-db` jobs and merged as
`063be00a56c1c6880427d6695fe1aa67a9925fa5`. The completion Journal entry is
[M2 source-enumeration decision chain migrated](https://app.notion.com/p/3ce67c87082c8199a2eee92eddcf5043?pvs=204).

The implementation did not edit source Decisions, entrypoints, product
behavior, vendor state, database state, or production. Both records remain
inactive candidates, and cross-provider verification remains required before
M4.
