# M0 preservation CI-guard compatibility review — Claude

- Date: 2026-08-31
- Author under review: Codex
- Reviewer route: Claude Sonnet, high effort (Opus had previously timed out)
- Final verdict: **PASS**
- Findings after remediation: **0 high, 0 medium, 0 low**

## Context

The preserved context-pack evidence contains three legitimate prose statements
about the production-write credential boundary. The existing security guard
requires every prose mention outside `handoff/` to be explicitly allowlisted,
while preservation fidelity prohibits rewriting imported source evidence.

The repair adds only these three immutable evidence paths to the guard's exact
allowlist:

- `archive/imports/context-pack/2026-08-31/expanded/02-CURRENT-STATE-AND-ROADMAP.md`
- `archive/imports/context-pack/2026-08-31/expanded/03-DECISIONS.md`
- `archive/imports/context-pack/2026-08-31/expanded/05-TECHNICAL-PROGRAM.md`

It does not create an archive-directory exemption and does not alter the
authorized code readers.

## Review sequence

Claude's first pass returned `PASS_WITH_FOLLOWUPS` with one low finding: add a
regression test proving the imported exception is exact-path-only.

The existing scratch-repository test was extended with:

- the exact imported path, which must not be reported; and
- a sibling Markdown file in the same directory, which must remain an offender.

The focused test suite passed 11/11. The real guard reported its expected
authorized readers, zero unauthorized references, and zero operator scripts
using the application write pool.

Claude's follow-up returned `PASS` with no remaining findings and confirmed the
two-file repair was safe to commit.
