Intent: Preserve the complete capability-onboarding supersession chain as
inactive M2 repo-native candidates without changing product behavior or
authority.

Outcome:
- PR #467 merged as `6e1c28194e906f062aaef48e1f18e95f05b0872d`.
- Added candidate records for `DEC-20260320-B`, `DEC-20260422-C`,
  `DEC-20260423-A`, and `DEC-20260423-B`.
- Preserved both source supersession chains and the supported non-retiring
  relation between the two active replacement decisions.
- Documented that `CLAUDE.md` and `AGENTS.md` still route the protocol through
  superseded `DEC-20260320-B`, and that `CLAUDE.md` still treats a historical
  spec containing retired mechanics as authoritative.
- Documented that the current repo sets the capability-insert transaction
  token but does not provision the historical guard trigger/function on a
  fresh database. Production trigger state was not queried and remains
  unknown.
- Context tests passed 54/54; context check returned zero findings; GitHub
  `check` and `integration-db` passed.
- Claude Opus/Sonnet were weekly-limit blocked. Fresh xhigh Codex plan and
  exact-commit reviewers passed and completed; cross-provider review remains
  on the M4-blocking backlog.
- Journal:
  https://app.notion.com/p/3ce67c87082c8130bc0cf2918a1b694f?pvs=204

Authority:
- All four records remain `authority_scope: none`, `authority_active: false`,
  and `migration_status: candidate`.
- `AGENTS.md`, `CLAUDE.md`, and Notion remain authoritative. M4 and Notion
  retirement are not authorized.

Next:
- Continue M2 with the next collision-free, active/load-bearing decision or
  protocol batch.
- Before M4, repair and verify the capability-insert guard provisioning/read-
  back gap, then replace both stale protocol authority routes in one reviewed
  cutover.
- When Claude quota returns, review the then-current capability-onboarding
  batch before M4 activation.
