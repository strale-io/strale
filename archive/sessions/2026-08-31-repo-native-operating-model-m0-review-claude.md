# Claude Code M0 milestone review

Date: 2026-08-31
Model: Claude Sonnet, high effort (Opus had previously failed by timeout during
the plan-review stage; the agreed fallback remained in use)
Mode: independent, read-only

## Verdict

`PASS_WITH_FOLLOWUPS`

## Findings

### High

1. Decisions, Journal, To-do, and Vendor Roster row exports each stopped at 100
   rows while reporting `has_more: true`; the README incorrectly described them
   as full-row exports.
2. The frontend preservation worktree had continued after the initial clean
   checkpoint. Three changed files were neither in the cited commit nor the
   archive at review time.

### Medium

1. Three pages named by `CLAUDE.md` as required reading were missing: workspace
   governance, Completed To-dos, and the Capability Onboarding specification.
2. The consumer inventory did not explicitly name `.claude/DISPATCH.yaml` and
   `.claude/commands/end-session.md`.

### Low

1. The preservation commit contains substantial real product/design code; its
   evidence-only status must remain explicit.
2. `apps/api/railway-config.md` named `NOTION_TOKEN` for ship-log activity while
   the implementation reads `NOTION_API_KEY`.

## Confirmed safety properties

- No design work was accepted, merged to main, deployed, or authorized publicly.
- `DEC-20260831-A` is founder-authorized, collision-free in the repository and
  exported register, and does not claim a premature cutover.
- Original non-Git design artifacts and the supplied context pack replayed with
  zero hash mismatches.
- No authority cutover has occurred.

## Remediation disposition

- Accepted all findings.
- Preserved and pushed the three post-checkpoint frontend files at
  `998964716c8601be67d4e71a508a803160434517`.
- Captured a hashed point-in-time snapshot of the owning frontend session's
  remaining 28 modified/untracked files without stopping or accepting that work.
- Fetched the three missing Notion pages.
- Added the two missing workflow consumers and corrected the credential name.
- Could not close row pagination: both Codex and Claude Code received Notion's
  workspace-wide query-usage-limit response. The limitation is now disclosed;
  M0 remains incomplete and M1 must not start until the export is completed and
  Claude returns PASS.

## Focused remediation review

Claude Code returned `PASS_WITH_FOLLOWUPS` on the remediation pass. It confirmed
that every first-review finding other than the known pagination gap was closed:

- frontend local/remote refs match `998964716c8601be67d4e71a508a803160434517`;
- the 28-file live delta matches the documented frontend cutoff and is clearly
  evidence-only;
- all three missing Notion pages are present;
- both omitted workflow consumers are now explicit;
- the credential-name mismatch and plan/reviewer status are corrected;
- no artifact claims the truncated Notion export is complete.

It found one additional issue before commit: the preservation payload and review
records were still untracked, so they were not yet durable. This finding was
accepted. The payload must be committed and pushed before the only remaining M0
blocker can be described as the Notion pagination gap.
