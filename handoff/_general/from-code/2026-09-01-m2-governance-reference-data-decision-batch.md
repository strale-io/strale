Intent: Preserve three collision-free governance/reference-data decisions as inactive M2 repo-native candidates without changing product behavior or authority.

Outcome:
- PR #465 merged as `e02355aab61722eab1a25c7bb1a4a85140fda7b8`.
- Added candidate records for `DEC-20260424-A`, Git-native `DEC-20260504-A`, and `DEC-20260517-A`.
- Preserved the cross-surface `DEC-20260422-A` conflict in a source-gap report instead of creating an unsafe record or relation.
- Preserved and deferred stale `DEC-20260517-B`; did not silently migrate or supersede it.
- Retained the historical Notion-deletion instruction as non-executable under current invariants.
- Context tests passed 54/54; context check returned zero findings; GitHub `check` and `integration-db` passed.
- Claude Opus/Sonnet were weekly-limit blocked. Fresh xhigh Codex plan and exact-commit reviewers passed; the exact reviewer completed after its verdict. Cross-provider review remains on the M4-blocking backlog.
- Journal: https://app.notion.com/p/3ce67c87082c81558c50dce0ee221210?pvs=204

Authority:
- All three records remain `authority_scope: none`, `authority_active: false`, and `migration_status: candidate`.
- `AGENTS.md`, `CLAUDE.md`, and Notion remain authoritative. M4 and Notion retirement are not authorized.

Next:
- Continue M2 with the next collision-free, active/load-bearing decision or protocol batch.
- Design the later source-qualified authority-claim mechanism needed to reconcile cross-surface ID reuse before M4.
- When Claude quota returns, review the then-current governance/reference-data batch before M4 activation.
