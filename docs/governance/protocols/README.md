# Protocol library

The authoritative text of Strale's mandatory protocols and rules. They moved
here verbatim from `CLAUDE.md` in the contract cut (DEC-20261024-A); each file's
front matter names the heading it came from. `AGENTS.md`'s reading map says
which one to read before which task, and `REVIEW.md` turns them into review
checks. Change a protocol here, in a reviewed PR; a protocol tied to a decision
changes only with that decision (`SUPERSEDING_DECISIONS.md`).

| File | Rule |
|---|---|
| `AUDIT_FOLLOWUP_TEST_COVERAGE.md` | fail-before tests on money and compliance paths (DEC-20260504-A) |
| `BULK_OPERATION_DEPLOY.md` | resuming a long-silent bulk operation (DEC-20260504-B) |
| `DEPLOY_MECHANISM_VERIFICATION.md` | prove the deploy runs the new path, query prod for the effect (DEC-20260504-C) |
| `DISTRIBUTION_PR_INTEGRITY.md`, `DISTRIBUTION_PR_PREFLIGHT.md` | distribution PRs and published packages (DEC-20260422-A) |
| `CAPABILITY_ONBOARDING.md`, `CAPABILITY_ONBOARDING_PIPELINE.md` | capability onboarding (DEC-20260320-B) |
| `TEST_INFRASTRUCTURE_COST_PRINCIPLES.md` | zero-cost probes, validate before paid calls, piggyback never scheduled |
| `WIRE_SHAPE_TRUST_ENDPOINTS.md` | canonical wire values on trust and public endpoints |
| `DRIFT_PREVENTION_SURFACES.md`, `CROSS_REPO_UPDATES.md` | one source per fact; the frontend files that follow a backend change |
| `CAPABILITIES_AND_QUALITY.md` | capability, x402, free-tier and test-mode facts and gotchas |
| `SHARED_CHECKOUT_RULE.md`, `WORKTREE_NODE_MODULES_HAZARD.md` | concurrency safety in a shared clone |
| `SESSION_CONTRACT.md` | orient, gate before stopping, git hooks |
| `PROGRAM_REGISTER.md` | where multi-batch work resumes |
| `RESEARCH_AND_IDEAS.md` | research files and the ideas list |
| `DESIGN_TOKENS.md` | design values as data |
| `CHEAP_EXTRAS_REGISTERS.md` | env manifest, model registry, claims register |
| `EVIDENCE_RECEIPTS_MIGRATION_LEDGER.md` | evidence receipts and the append-only migration ledger |
| `SCORING_INTEGRITY_RETIRED.md` | the retired SQS rule and the root-cause principle it leaves |
| `REPORT_FILING.md` | where reports go; what the repo root may hold |
| `SUPERSEDING_DECISIONS.md` | conflict duty, append-only decisions, superseding a decision |
| `REVIEW_TEMPLATE.md` | the finding format for a review-findings file |

The production-authority rule lives in `docs/company/CHARTER.md` and
`apps/api/src/lib/production-authority.ts`, not here.
