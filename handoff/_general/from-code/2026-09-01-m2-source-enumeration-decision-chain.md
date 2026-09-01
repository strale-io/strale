Intent: Preserve the collision-free source-enumeration decision chain as
inactive M2 repo-native candidates without changing product behavior or
authority.

Outcome:
- PR #469 merged as `063be00a56c1c6880427d6695fe1aa67a9925fa5`.
- Added candidate records for `DEC-20260518-E` and `DEC-20260518-G`.
- Preserved the complete eight-path country/source enumeration, exact per-path
  evidence fields, six hidden-fee probes, and signed-attestation clearance.
- Represented G as a non-retiring amendment of E.
- Qualified E's PR #137 source pointer rather than claiming that the PR
  contains the decision body.
- Reconciled Path 6 through `DEC-20260518-F` and `DEC-20260813-A`; did not
  reopen a technical question for the founder.
- Kept historical v1/v1.1 vocabulary retired while retaining the durable
  `attestation-required` evidence state.
- Preserved the founder-reserved boundary around vendor contact, accounts,
  terms, licensing, commitments, recurring costs, and company representation.
- Documented that current EE/CY references are application provenance, not a
  routed or structurally verified fresh-session protocol.
- Context generation was reproducible; tests passed 54/54; context check had
  zero findings; GitHub `check` and `integration-db` passed.
- Claude Opus/Sonnet were weekly-limit blocked. Fresh xhigh Codex plan and
  exact-commit reviewers passed and completed; cross-provider review remains
  on the M4-blocking backlog.
- Journal:
  https://app.notion.com/p/3ce67c87082c8199a2eee92eddcf5043?pvs=204

Authority:
- Both records remain `authority_scope: none`, `authority_active: false`, and
  `migration_status: candidate`.
- `AGENTS.md`, `CLAUDE.md`, and Notion remain authoritative. M4 and Notion
  retirement are not authorized.

Next:
- Continue M2 with the next collision-free, active/load-bearing decision or
  protocol batch.
- Before M4, create and independently review the bounded source-qualification
  protocol, trigger/coverage mapping, authority stop, and negative-verdict
  read-back described in the gap report.
- Audit `DEC-20260511-D` and its separate Notion Vendor Evaluation Methodology
  as a later batch rather than silently folding it into this one.
- When Claude quota returns, review the then-current source-enumeration batch
  before M4 activation.
