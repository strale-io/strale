---
doc_type: authority-gap-report
authority_scope: none
status: candidate
complete: true
phase: M2
authority_active: false
observed_at: 2026-09-01
---

# M2 vendor-stack authority and correction gaps

> [!CAUTION]
> **M2 EVIDENCE — NOT CURRENT VENDOR AUTHORITY.**
> This report reconciles historical source material with repository evidence.
> It does not select, switch, contact, contract, activate, suspend, or pay a
> vendor, and it does not authorize M4 cutover.

## Finding

`DEC-20260430-A` cannot be migrated as a current vendor list. It is a useful
historical governance decision wrapped around a mutable roster snapshot that
contained at least four documented defects and accumulated many later
amendments. The repo already has several narrower current-state surfaces, but
it does not yet have one designated repo-owned model that answers every vendor
selection/status question and generates the dependent views.

The safe M2 result is therefore:

- preserve four collision-free Decisions as inactive historical candidates;
- carry the corrections next to the canonicalization record;
- keep current runtime/vendor claims on their existing canonical surfaces;
- do not target collided or unmigrated partial supersession records; and
- require M3 to designate and prove a current-vendor state model before M4
  retires the Notion roster and Active Vendor Stack.

## Exact source chain

The live Decisions data source returned one row for each migrated identity:

| ID | Page identity | Historical role |
|---|---|---|
| `DEC-20260427-A` | `34f67c87082c81ed9f69de1583fd5f5e` | adverse-media language limitation |
| `DEC-20260427-B` | `34f67c87082c813c98d2cad51d99384f` | Dilisense sanctions/PEP selection |
| `DEC-20260429-A` | `35167c87082c8172bff8f3485699c961` | Dilisense wrapper and self-host deferral |
| `DEC-20260430-A` | `35267c87082c81eca01cf6eedb5eafeb` | roster canonicalization and dated stack |

None of those IDs appears in `docs/decisions/id-collisions.yaml`. The exact
query was reproduced by the authoring session. One independent reviewer hit
the connector's query limit but fetched every page directly; separate plan
reviews verified the identities and content.

## Corrections that must travel with the snapshot

### Digiteal commercial shape

The April Decision said Digiteal was pure PAYG with no monthly floor and a
waived setup fee. The later same-day Journal evidence recorded a EUR 50 monthly
floor, an applicable setup fee, and a reseller-contract gate. Both are dated
commercial claims; neither should be promoted without current binding evidence.

### OpenSanctions self-host roadmap

`DEC-20260429-A` had already deferred self-hosting after correcting the
commercial-licence premise. `DEC-20260430-A` nevertheless called it a
post-launch migration target. The 2026-05-01 Journal correction names the
earlier Decision as authoritative. Current `platform-facts.ts` and screening
code still use Dilisense and classify OpenSanctions self-host as stale/deferred.

### OpenOwnership BODS phantom integration

The canonicalized roster listed OpenOwnership BODS in the active UBO stack.
The May 7 code audit found no client, network target, ingest job, table, or
deployed capability and traced the claim back to an evaluation whose outcome
was defer. Current `STALE_VENDORS` keeps OpenOwnership out of active
customer-facing vendor copy.

### Wrong Decision identity

`DEC-20260430-A` labels `DEC-20260427-A` as the choice that dropped
OpenSanctions, and the May 1 correction repeats the mistake. The exact source
pages prove A is the adverse-media accept-and-disclose Decision and B is the
OpenSanctions/Dilisense Decision. The formal graph links B to A only as the
explicit same-session related decision; it never encodes the mistaken A label.

## Dated-claim disposition

| April claim family | 2026-09-01 repository evidence | Migration disposition |
|---|---|---|
| Sanctions/PEP on Dilisense | `STATIC_FACTS.vendors`, manifests, and executors agree | Preserve decision; recheck live account/licence state when used |
| Adverse media | Dilisense primary and Serper fallback are in current facts/code | Preserve both paths and the limitation; do not call it Dilisense-only |
| OpenSanctions self-host | Listed in `STALE_VENDORS` as deferred | Preserve correction; no roadmap activation |
| OpenOwnership BODS | Listed stale; correction found no integration | Preserve as phantom-integration lesson, not current stack |
| UK CoP via eSortcode | Current manifest and executor exist | Current code evidence only; historical price is not promoted |
| US registry/EIN via Cobalt and Liberty Data | Current facts, manifests, and executors exist | Current code evidence only; account health/terms remain separate |
| Digiteal commercial terms | Old Decision and correction disagree; no current canonical contract evidence audited here | Dated evidence only |
| Broad country-registry and litigation list | Many later changes and current manifests/coverage data exist | Never copy April list as current truth |
| Rejected-vendor list | `STALE_VENDORS` guards consumer copy, but later decisions reopened some research paths | Treat as dated selection evidence, not a permanent denylist |

## Current surfaces answer different questions

### Durable rationale

Formal Decisions explain why a lasting rule or choice exists. Their protected
bodies must not become a frequently edited table of prices, quotas, deployment,
or account state.

### Runtime and catalog truth

`apps/api/src/lib/platform-facts.ts`, manifests, executors, dependency metadata,
the repo coverage matrix, and live capability/solution rows describe what the
product can route or serve. `DEC-20260517-A` already made repo YAML canonical
for structured capability-by-country reference data.

### Account usability

The Vendor Control Tower records balances, authentication failures,
suspensions, restoration evidence, and dependency effects for configured
providers. It answers whether an existing account can serve now. It does not
decide which vendor should be selected or whether Moonlighter AB may accept a
new commercial relationship.

### Historical commercial research

The Notion Vendor Roster and Active Vendor Stack preserve evaluations, status
notes, contacts, prices, and primary-Decision links. Their mutable content and
documented drift make them migration evidence, not a safe repo current-state
schema. Existing Notion workflows remain active until the M4 cutover rather
than being silently replaced during M2.

## Authority and enforcement gaps

- There is no single repo schema linking vendor identity, selection status,
  capability dependency, current terms-verification date, governing Decision,
  evaluation evidence, and re-evaluation triggers.
- `platform-facts.ts` covers only selected cross-surface names; it is not a
  complete roster.
- Manifests describe capability data sources, not rejected, held, or candidate
  vendors and not company-level commercial authority.
- Dependency and Control Tower tables cover configured operational providers,
  not the whole selection funnel.
- `check-vendor-roster-drift.ts` still depends on pre-cutover Notion concepts.
- The `vendor-switch` skill is a useful surface-sweep checklist but still tells
  sessions to create a Notion Decision; it must be cut over only after the new
  decision and vendor-state routes exist.
- No current entrypoint routes a complete vendor-selection/status protocol from
  evidence through decision, runtime dependency, account monitoring, and
  generated public facts.

## M3 acceptance shape

M3 should first inventory every current vendor-state reader and writer. It can
then designate one repo-owned model, or a deliberately joined set of canonical
tables, that at minimum provides:

- stable vendor identity and display name;
- lifecycle state with history rather than in-place erasure;
- capability and solution dependency links with required/fallback semantics;
- governing Decision `record_key` and evaluation-evidence links;
- terms, pricing, licensing, and redistribution verification timestamps without
  storing confidential contract content in public repo;
- explicit `unknown`, `attestation-required`, and authorization states;
- re-evaluation triggers and the last evidence date; and
- generated views for agent context, drift checks, and customer-facing facts.

The design must reuse manifests, platform facts, dependencies, and the Vendor
Control Tower rather than creating a second independent copy. It must identify
which facts belong in code, a database, or private evidence and show one
write-path owner for each.

## M4 cutover conditions

M4 may retire the Vendor Roster and Active Vendor Stack as active authorities
only after:

1. every live reader and writer is mapped to the replacement;
2. current configured vendors and dependencies reconcile against manifests,
   platform facts, coverage data, and Control Tower inventory;
3. candidate, held, rejected, and deferred evidence has a preserved home;
4. the decision graph links without targeting unresolved historical IDs;
5. the vendor-switch and session entrypoints route to the repo mechanism;
6. generated views and drift checks fail on phantom integrations and stale
   consumer copy;
7. founder-reserved contact, accounts, terms, licensing, commitments, and
   external claims remain `approval_required`; and
8. a fresh separate Codex review of the then-current exact commit closes every
   material finding.

The founder ended Claude review check-ins on 2026-09-01. `CLAUDE.md`,
`AGENTS.md`, the operating-model migration plan, `STATE.md`, and the retired
historical review backlog now persist that route. No new Claude-verification
debt is created by this batch.
