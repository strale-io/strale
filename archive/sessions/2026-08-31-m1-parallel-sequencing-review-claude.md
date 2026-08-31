# Claude Code review — M1 parallel sequencing amendment

Date: 2026-08-31
Model: Claude Sonnet, high effort (wanted Opus; prior Opus invocation timed out)
Mode: independent, read-only
Verdict: `PASS_WITH_FOLLOWUPS`

## Conclusion

Additive M1 foundation work may proceed while the four Notion databases remain
first-page-only. The incomplete export creates risk when selecting, migrating,
or retiring truth; it does not prevent building an inert, rollback-safe
container and warning-mode validation for the future model.

## Accepted follow-ups

1. Cite this fresh review as the authorization for reversing the earlier
   temporary "M1 must not start" milestone gate.
2. Restrict M1's legacy inventory to bare enumeration. M2 retains exclusive
   ownership of `migrated`, `evidence-only`, `archive`, `obsolete`, and `unclear`
   dispositions.
3. Require every skeleton to be empty/template-only, machine-marked
   `status: skeleton`, and visibly non-authoritative.
4. Require generated `DECISIONS.md` and `RECENT.md` views to be machine-marked
   `complete: false` and visibly partial.
5. Keep the checker warning/report-only and do not wire any root entrypoint,
   hook, CI gate, skill, or command to the new layer.
6. Land M1 as one bounded Foundation branch/PR with an explicit Claude milestone
   verdict.

## Gates that remain closed

- M2 and all authority-changing work require a complete M0 export, regenerated
  manifest, and focused Claude M0 PASS.
- No `AGENTS.md`/`CLAUDE.md` rewrite before M4.
- No Notion dependency or secret removal before M4.
- No real product/state/roadmap/decision content in M1 skeletons.
- No legacy disposition labels, moves, or deletions.
- No blocking project-context checker and no active protocol-router consumer.
