Intent: Preserve the two existing deploy-safety decisions as inactive M2 repo-native candidates without changing product behavior or authority.

Outcome:
- PR #463 merged as `ceb7c24a3527da10f5b764d8abd1d0fa88cc4c51`.
- Added candidate records for `DEC-20260504-B` and `DEC-20260504-C`.
- Added non-retiring C → B `related_to`; the generated index supplies the inverse.
- Preserved the corrected post-recovery incident evidence and kept the exact disk-fill sub-cause uncertain.
- Context tests passed 54/54; context check returned zero findings; GitHub `check` and `integration-db` passed.
- Claude Opus/Sonnet were weekly-limit blocked. Separate xhigh Codex plan and exact-commit reviewers passed after one graph correction. Cross-provider review remains on the M4-blocking backlog.
- Journal: https://app.notion.com/p/3ce67c87082c81338c21e75fccb0b533?pvs=204

Authority:
- Both records remain `authority_scope: none`, `authority_active: false`, and `migration_status: candidate`.
- `AGENTS.md`, `CLAUDE.md`, and Notion remain authoritative. M4 and Notion retirement are not authorized.

Next:
- Continue M2 with the next collision-free, active/load-bearing decision topic batch.
- When Claude quota returns, review the then-current exact deploy-safety batch before M4 activation.
