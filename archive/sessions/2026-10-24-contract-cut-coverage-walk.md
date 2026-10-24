Intent: Record where every CLAUDE.md section and every protocol-coverage row went in the contract cut, so no rule was dropped.

# Contract cut: coverage walk (2026-10-24)

Way-of-working review §4 step 3, under DEC-20261024-A (items 2 and 5 wait for
Petter's confirmation; this walk belongs to the draft PR that waits on them).
The text before the cut is preserved verbatim in
`archive/sessions/2026-10-24-entrypoints-before-contract-cut/` (`CLAUDE.md`,
`AGENTS.md`).

Legend: **moved** = verbatim text now authoritative at the destination;
**summarised** = one or more lines in `AGENTS.md`, full text at the
destination; **retired** = no longer in force, with the reason. ⚠ marks a
production-safety rule (review §3 incident flag).

## 1. `docs/project/protocol-coverage.yaml` rows (20)

Every row's `enforced_by` code is unchanged; only the text's home moved.

| Row | ⚠ | Destination | Enforced by (unchanged) |
|---|---|---|---|
| session-contract | ⚠ | moved: `docs/governance/protocols/SESSION_CONTRACT.md`; summarised: AGENTS.md "Session contract" | `scripts/handoff/*`, `.githooks/*`, `.claude/hooks/*` |
| distribution-pr-integrity | ⚠ | moved: `DISTRIBUTION_PR_INTEGRITY.md`; reading map; `REVIEW.md` always-check | `check-framework-packages.mjs` |
| capability-onboarding | ⚠ | moved: `CAPABILITY_ONBOARDING.md`; reading map; `onboard-capability` skill; `REVIEW.md` | `onboard.ts`, `validate-capability.ts`, `capability-readiness.ts` |
| capability-onboarding-pipeline | ⚠ | moved: `CAPABILITY_ONBOARDING_PIPELINE.md`; skill | same |
| audit-followup-test-coverage | ⚠ | moved: `AUDIT_FOLLOWUP_TEST_COVERAGE.md`; reading map; `REVIEW.md` | review (no code) |
| bulk-operation-deploy | ⚠ | moved: `BULK_OPERATION_DEPLOY.md`; reading map; `REVIEW.md` | review (no code) |
| deploy-mechanism-verification | ⚠ | moved: `DEPLOY_MECHANISM_VERIFICATION.md`; reading map; `REVIEW.md` | `scheduled:check`, integration lane |
| shared-checkout-rule | ⚠ | moved: `SHARED_CHECKOUT_RULE.md`; summarised: AGENTS.md non-negotiable 5; CLAUDE.md "Agents" | `guard-tree-integrity.mjs` + hook, handoff gate |
| worktree-node-modules-hazard | ⚠ | moved: `WORKTREE_NODE_MODULES_HAZARD.md`; non-negotiable 5 | review (no code) |
| test-infrastructure-cost-principles | ⚠ | moved: `TEST_INFRASTRUCTURE_COST_PRINCIPLES.md`; reading map; `REVIEW.md` | dependency-manifest tests, test-runner |
| wire-shape-trust-endpoints | ⚠ | moved: `WIRE_SHAPE_TRUST_ENDPOINTS.md`; reading map; `REVIEW.md` | review (no code) |
| production-authority | ⚠ | unchanged: `docs/company/CHARTER.md`; summarised: non-negotiable 2 | `production-authority.ts`, binding test |
| review-routing | | retired from the entrypoint: the rule is now session contract 2 + `REVIEW.md`; the dated record (2026-09-01 override, three amendments, DEC-20260910-A) is archived with the old CLAUDE.md; `REVIEW_ROUTING.md` moved to the same archive folder | none (codex:check retired in PR #722) |
| program-register | | moved: `PROGRAM_REGISTER.md`; reading map | `programs:check` |
| research-and-ideas | | moved: `RESEARCH_AND_IDEAS.md`; reading map | `research:check` |
| design-tokens | | moved: `DESIGN_TOKENS.md`; reading map | `design:check` |
| cheap-extras-registers | ⚠ | moved: `CHEAP_EXTRAS_REGISTERS.md`; reading map | `env:check`, `models:check`, `claims:check` |
| evidence-receipts-migration-ledger | ⚠ | moved: `EVIDENCE_RECEIPTS_MIGRATION_LEDGER.md`; reading map; `REVIEW.md` | `receipts:check`, `migrations:check` |
| scoring-integrity-retired | | moved: `SCORING_INTEGRITY_RETIRED.md`; non-negotiable 7 | review |
| drift-prevention-surfaces | | moved: `DRIFT_PREVENTION_SURFACES.md`; reading map | `check-platform-facts-drift.ts` (weekly) |

## 2. CLAUDE.md sections the manifest excluded (18), and their destinations

| Section | Destination |
|---|---|
| Workflow Protocol (Times for Petter) | AGENTS.md, top |
| Session Start (intent, Quick/Full, escalation) | retired: the reading map replaces it, and no decision depends on the mode label (review §3 A) |
| Repo-native migration continuation — pre-cutover | retired with T7 |
| Notion Access / Workspace Structure / Governance Rules | retired with T7: after #680 and #681 no code reads or writes Notion (`grep api.notion.com` finds only comments); the To-do list role moved to `docs/programs/` and `docs/company/DECISION-QUEUE.md` |
| GitHub Access | AGENTS.md non-negotiable 1 and session contract (main, branch pattern, Conventional Commits) |
| Project Spec | retired (it pointed at Notion) |
| Tech Stack, Project Structure | AGENTS.md "What Strale is" |
| Active Decisions | moved: `docs/decisions/ACTIVE.md`; reading map |
| Capabilities & Quality | moved: `docs/governance/protocols/CAPABILITIES_AND_QUALITY.md`; reading map |
| Quick / Full Session Checklist | retired: replaced by the session contract (orient, commit and review by tier, ship, gate). Kept from them: the handoff file (gate) and review before merge (`REVIEW.md`). Retired: connectivity check, Notion To-do archive, Journal entry |
| Report Filing Convention | moved: `REPORT_FILING.md`; root list summarised in AGENTS.md "Where things live" |
| Workflow Invariants | `SUPERSEDING_DECISIONS.md` (conflict duty, append-only decisions, the five supersession steps) and non-negotiable 6; Notion wording retired |
| Degraded Mode | non-negotiable 8 (Git down → stop); the Notion half retired |
| Cross-Repo Updates | moved: `CROSS_REPO_UPDATES.md`; reading map |

## 3. Production-safety rules: where each now loads

| Rule | Always loaded (AGENTS.md) | Full text | Review |
|---|---|---|---|
| Deploys (DEC-20260504-C, -B) | reading map | protocol files | `REVIEW.md` always-check |
| Migrations (append-only ledger) | reading map | `EVIDENCE_RECEIPTS_MIGRATION_LEDGER.md` | always-check; tier-2 row |
| Money paths (DEC-20260504-A) | reading map | `AUDIT_FOLLOWUP_TEST_COVERAGE.md` | always-check; tier-2 wallet/x402 rows |
| Scraping / data access (DEC-20261023-A) | non-negotiable 4 | `docs/strategy/2026-10-23-data-access-risk-rule-proposal.md` | always-check |
| Shared checkout | non-negotiable 5 (+ CLAUDE.md Agents) | `SHARED_CHECKOUT_RULE.md` | always-check |
| Published packages (DEC-20260422-A) | reading map | `DISTRIBUTION_PR_INTEGRITY.md` | always-check; tier-2 row |
| Production authority, customer-data boundary | non-negotiables 2, 3 | `docs/company/CHARTER.md` | always-check |

## 4. Machinery changed by the cut

- Retired, because each compares against CLAUDE.md text that has moved:
  `protocols:check` / `protocols:test` (mirror byte-identity) and
  `protocols:coverage` / `protocols:coverage:test` (heading classification and
  the generated `docs/project/PROTOCOL-ROUTER.md`). The manifest
  `docs/project/protocol-coverage.yaml` was used once, as this checklist, and
  is deleted with them; the reading map in AGENTS.md replaces the router.
  `docs/project/PROTOCOL-ROUTER.md` stays at its path as a frozen copy (no
  longer generated or checked) because the closed M2 closure register cites
  it as evidence.
- The pre-cutover entrypoint guard in `check-project-context.mjs` is narrowed:
  the entrypoints may now link `docs/decisions/` (authoritative), and still may
  not link `docs/project/` or an authored M2 candidate.
- Carved out and kept, blocking: `decisions:check` / `decisions:test`
  (decision-record schema, id collisions, immutability of active decisions,
  generated decision index), previously reachable only through `context:test`.
- **Not deleted here, on purpose:** the rest of group G (`context:*`, the M2
  closure register, the inventory). `scripts/project-context-lib.mjs` also
  validates `docs/operations/operator-actions.yaml` — approval-gated
  production actions (`OPERATOR_ACTION_*` findings, the F10 approval-boundary
  family) — and pending founder decisions. The review's group G table does not
  list that guard. It must be carved out like `decisions:check` before the
  context layer can be deleted; that is the next batch.
