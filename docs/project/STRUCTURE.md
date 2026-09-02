---
doc_type: project-structure
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-02
---

# Structure — target vs actual

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.** Existing `AGENTS.md`,
> `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

The target information architecture is
[`docs/strategy/2026-08-31-repo-native-operating-model-migration.md`
section 5](../strategy/2026-08-31-repo-native-operating-model-migration.md#5-target-information-architecture).
That plan is explicit that physical moves are deferred until authority is
established: "logical classification first, existing authoritative paths
may remain temporarily when moving them would add risk without reducing
ambiguity." This file is the honest map of where reality currently
disagrees with the target, one line per deviation, with the reason and the
track that owns closing it — written by T5 (CTO-readable structure) so a
reader does not have to diff the target tree against the repo by hand.

Root, `docs/decisions/`, `docs/audits/`, `docs/research/`, and
`docs/security/` match the target exactly as of this file's `verified_at`
date and are not repeated below.

## docs/project/

| target | actual | reason | owner |
| --- | --- | --- | --- |
| `START-HERE.md`, `PRODUCT.md`, `STATE.md`, `ROADMAP.md`, `DECISIONS.md`, `RECENT.md`, `WORKING-MODEL.md`, `PROTOCOL-ROUTER.md` | present, matching | — | — |
| (not listed in the target — written after section 5) | `legacy-authority-inventory.json`, `m2-closure-register.yaml`, `private-archive-status.json`, `schemas/`, `STRUCTURE.md` (this file) | Section 5 predates the M1/M2 closure-audit machinery (T1) and this track (T5). These are additions the target didn't anticipate, not gaps in it. | T1, T10, T5 |

## docs/decisions/

Matches the target (`README.md`, `PENDING.md`, `records/DEC-*.md`) plus one
addition not in section 5: `id-collisions.yaml`, the historical-ID
collision registry T1's closure audit needed. Same reasoning as above —
written after the target tree, not a deviation from it.

## docs/governance/

| target | actual | reason | owner |
| --- | --- | --- | --- |
| `CHARTER.md`, `BUDGET.md`, `MEASUREMENT.md`, `LESSONS.md` directly under `docs/governance/` | still at `docs/company/CHARTER.md`, `BUDGET.md`, `MEASUREMENT.md`, `LESSONS.md` | These are live, machine-checked authority under DEC-20260815-A / DEC-20260822-A (charter-authorization-binding.test.ts, check-ceo-brief.ts, and this repo's CLAUDE.md all read `docs/company/`). This track's constraints explicitly forbid moving anything under `docs/company`; moving these four requires updating every code/test reference in the same change, which is a repo-native-workflow migration step (M3), not a filing move. | T6 |
| `protocols/capability-onboarding.md`, `distribution-pr-integrity.md`, `audit-follow-up-test-coverage.md`, `bulk-operation-deploy.md`, `deploy-mechanism-verification.md`, `engineering-invariants.md` (protocol bodies, one file each) | `protocols/` holds `README.md` (M1 skeleton) plus two relocated checklists, `DISTRIBUTION_PR_PREFLIGHT.md` and `REVIEW_TEMPLATE.md` (T5, this track) | The six named protocol bodies still live as prose sections inside `CLAUDE.md` (Capability Onboarding Protocol, Distribution PR Integrity Protocol, Audit-Follow-up Test Coverage Protocol, Bulk-Operation Deploy Protocol, Deploy Mechanism Verification Protocol) and have not been extracted into standalone files. Extraction plus a protocol-coverage manifest proving nothing was dropped is explicit M3 work (`docs/project/PROTOCOL-ROUTER.md`'s own placeholder text: "extracted and coverage-checked in later milestones"). | T6 |
| `README.md` | present, `status: skeleton`, M1 | Correctly inert per the plan — governance authority does not activate before M2/M4 review. | T6 |

## docs/product/

| target | actual | reason | owner |
| --- | --- | --- | --- |
| `GTM.md`, `WEBSITE-BRAND.md` | directory does not exist | No repo-native go-to-market or brand document has been authored yet; this content still lives in Notion (Go-to-market section) and `docs/company/VOICE.md`/`DESIGN-SYSTEM.md`. Creating `docs/product/` is new authoring, not a move — out of this track's scope (T5 moves nothing new into authority; see plan constraints). | T6 |

## docs/programs/

| target | actual | reason | owner |
| --- | --- | --- | --- |
| `remediation/` nested under `docs/programs/` | `docs/remediation/` — a separate top-level directory, not nested | The legacy remediation program (per-package YAML under `docs/remediation/packages/`) predates the `docs/programs/` register and is mid-closure (see `docs/programs/README.md`: "closure tracked by CTO-readiness track T4"). Nesting it now would rewrite paths a running program's tooling reads, for a program that is being closed rather than continued. Moving it after closure is cleaner than moving it twice. | T4 |
| `discovery/` nested under `docs/programs/` | does not exist | Discovery and retrieval (WP16) is re-homed as track T9, which by design "starts only after T7" (M4 cutover) — see `docs/programs/cto-readiness/PROGRAM.md`'s track table. Not due yet. | T9 |
| `cto-readiness/` (not in the target — this program didn't exist when section 5 was written) | present, active, this track's own program | Written after the target tree. | — |

## docs/architecture/

Target names a bare `docs/architecture/` directory; it does not exist and
no content has been proposed for it. Architecture documentation currently
lives informally in code comments, `docs/design/execution-receipt/`
(one closed subsystem), and Notion. Creating this directory is new
authoring, out of scope for a structure-cleanup track.

**Owner:** unassigned — flag for whichever track first needs to write a
cross-cutting architecture document; T5 records the gap rather than
originating one to fill it.

## docs/operations/

| target | actual | reason | owner |
| --- | --- | --- | --- |
| `runbooks/` subdirectory + `operator-actions.yaml` | `hmac-rotation.md`, `x402-facilitator-switch.md`, `operator-actions.yaml` directly under `docs/operations/`, no `runbooks/` subdirectory | Two runbooks, no nesting yet. Low-cost to fix (a rename), not requested by this track's plan (deliverable list does not include `docs/operations/`) and not blocking anything — `operator-actions.yaml`'s path is hardcoded in `scripts/check-project-context.mjs`, so nesting the runbooks alone (leaving `operator-actions.yaml` at its current path) is safe whenever a session picks it up. | unassigned |

## archive/

| target | actual | reason | owner |
| --- | --- | --- | --- |
| `imports/notion/`, `imports/chat/`, `imports/context-pack/` | not present in this repo | The private M0 preservation export lives in the private `strale-io/strale-context-archive` repository at this same relative path (`archive/imports/notion/2026-08-31/`, `archive/imports/context-pack/2026-08-31/manifest.json` — see `docs/project/private-archive-status.json`, `export_path`). `public_copy_allowed: false` on that status file means this is by design, not a gap: the target path exists, just not in the repo a reader of this file is looking at. | — (closed; M0 complete per `private-archive-status.json`) |
| `sessions/` | present, matching | — | — |
| `briefs/` | does not exist; CEO morning briefs live at `docs/company/briefs/YYYY-MM-DD.md` instead | DEC-20260822-A (2026-08-22, predates the 2026-08-31 migration plan) hardcodes `docs/company/briefs/` in `apps/api/scripts/check-ceo-brief.ts` and in the charter text itself. Reconciling the two needs either a decision amendment or a coordinated code+doc move, not a plain `git mv` — this track's constraints also forbid moving anything under `docs/company`. | T6 |
| `superseded/` | present: `superseded/manifests-drafts/` (T5, this track) | Matches the target's category; only one thing has been filed under it so far. | — |
| `growth-ops/`, `submissions/` (not in the target) | present, unchanged | Predate the target tree (2026-04-18 stash resolution); the target's `archive/` listing is a category scheme, not a closed enumeration — these fit under a category the target doesn't happen to name explicitly (marketing/distribution-submission evidence). No action implied. | — |

## Summary

Of the target's deviations, one class is genuinely open work (six protocol
bodies still embedded in `CLAUDE.md` prose rather than extracted;
`docs/product/`, `docs/architecture/` not yet authored; `docs/programs/`
nesting for `remediation/` and `discovery/`) and is owned by T6 (M3
repo-native workflows) or later, per the migration plan's own phase gates
— none of it is due before M2 closes (T10) and M3 opens. The rest is
either complete-but-external (the private preservation export, M0), a
hardcoded operational path that predates the target tree and needs a
coordinated multi-file change rather than a move (`docs/company/briefs/`),
or cosmetic (`docs/operations/runbooks/` nesting, unassigned, low
priority). Nothing on this page blocks M2 closure or the M4 cutover.
