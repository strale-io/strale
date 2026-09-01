---
doc_type: review-report
authority_scope: none
status: interim-same-provider
reviewed_at: 2026-09-01
reviewer: separate-codex-session
final_reviewed_commit: 1e64efdd384dc030439e29474e391b08ade9058f
merged_commit: 6e1c28194e906f062aaef48e1f18e95f05b0872d
authority_active: false
---

# M2 capability-onboarding decision chain — interim Codex review

## Outcome

PR [#467](https://github.com/strale-io/strale/pull/467) migrated the complete
four-record capability-onboarding supersession chain into the inactive M2
decision graph. The required `check` and `integration-db` jobs passed, and the
PR merged as `6e1c28194e906f062aaef48e1f18e95f05b0872d`.

No runtime, database, production, or product behavior changed. Every record
remains `migration_status: candidate`, `authority_scope: none`, and
`authority_active: false`.

## Review route

Codex authored the batch. Claude Opus/high and Sonnet/high were each attempted
for plan review and again for exact-commit review. All four invocations were
rejected by Claude Code's weekly subscription limit, reported to reset on
2026-09-03 at 17:00 Europe/Stockholm; none returned a verdict.

Under the founder's standing instruction, fresh `gpt-5.6-sol`/xhigh Codex
verifier sessions provided fallback plan and exact-commit review. The plan
reviewer found one MEDIUM omission: M4 must replace both the stale decision-ID
route and the historical full-spec authority dependency. After amendment, the
same reviewer returned PASS. The exact implementation reviewer then passed
commit `1e64efdd` with no material findings. Both verifier tasks completed
after their verdicts.

This same-provider evidence permits the inactive M2 merge under the founder's
explicit exception. It does not clear the different-provider gate for M4; the
batch remains in the Claude verification backlog.

## Source and fidelity result

- Exact live Notion queries returned one row for each of `DEC-20260320-B`,
  `DEC-20260422-C`, `DEC-20260423-A`, and `DEC-20260423-B`, with no duplicate
  or collision entry.
- `DEC-20260423-B` faithfully supersedes `DEC-20260320-B`, and
  `DEC-20260423-A` faithfully supersedes `DEC-20260422-C`.
- The non-retiring relation between the two active 2026-04-23 decisions is
  supported by both source texts and does not imply a false supersession.
- The five implementation commits cited by the corrected decision exist and
  support the historical mechanism claims.
- The report correctly distinguishes current runtime token-setting from the
  absent fresh-database trigger/function DDL. Production trigger state remains
  explicitly unknown.
- Retired SQS, automatic-lifecycle, scheduled-test, and seed-era mechanisms
  remain historical evidence and were not reintroduced as current authority.
- All four candidates have the inactive warning and exactly five protected
  sections.

## Verification

- `npm run context:test` — 54/54 pass.
- `npm run context:check -- --json` — zero findings.
- `git diff --check` — pass.
- Generated `docs/project/DECISIONS.md` and
  `docs/project/legacy-authority-inventory.json` — reproducible.
- GitHub `check` and `integration-db` — pass.
- Exact-commit verifier — PASS, no material findings.

## Journal and authority boundary

The closeout Journal entry is
[M2 capability-onboarding decision chain migrated](https://app.notion.com/p/3ce67c87082c8130bc0cf2918a1b694f?pvs=204).
No source Decision was edited and no Notion content was deleted. Existing
`AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative
until a separately reviewed M4 cutover.
