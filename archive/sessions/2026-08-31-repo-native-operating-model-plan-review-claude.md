# Independent plan review — repo-native operating model

**Date:** 2026-08-31  
**Plan:** `docs/strategy/2026-08-31-repo-native-operating-model-migration.md`  
**Requested route:** Claude Code, Opus, high effort  
**Actual route:** Wanted Opus, fell to Sonnet. The Opus read-only invocation
timed out after ten minutes without returning a verdict. Sonnet/high effort then
completed the bounded read-only review.  
**Verdict:** `PASS_WITH_FOLLOWUPS`

This file preserves the substantive reviewer output. Reviewer findings are data,
not doctrine; Codex independently checked and dispositioned them in the plan's
review log.

## Blocking findings

### Critical — no canonical home or contract for full mandatory protocols

The plan defined `PROTOCOL-ROUTER.md` but did not define whether it owned full
protocol text or pointers, did not name the home of the full protocol bodies,
and had no coverage guard. The current `CLAUDE.md` contains full required steps,
incident rationale, and report formats for multiple mandatory protocols. A thin
entrypoint migration could therefore preserve the trigger names while losing
the operative protocol.

**Required correction:** define the router contract, name canonical full-body
paths, and fail when a protocol referenced by code/tests/decisions lacks both a
router entry and full body.

### High — decision schema could not represent amendment or interpretation

The draft modeled only supersession. Existing decisions also amend, affirm, and
interpret other still-active decisions: DEC-20260815-A amends DEC-20260812-A,
DEC-20260822-A amends DEC-20260815-A without superseding it, and
DEC-20260813-A affirms an interpretation of DEC-20260428-A. Treating all such
relationships as supersession would incorrectly retire active doctrine.

**Required correction:** represent amendment and interpretation/affirmation,
and validate every relation type.

### High — M3 and M4 had contradictory Notion cutover responsibilities

M3 claimed both tools no longer required Notion and rewrote end-session and
vendor-switch, while M4 separately claimed to remove those same Notion actions.
The transition boundary and rollback behavior were therefore ambiguous.

**Required correction:** choose one explicit transition. Avoid ongoing dual
authority.

### High — non-Git design preservation captured hashes, not bytes

The draft required hashes for non-Git design artifacts while claiming that no
unique bytes would remain only locally. A hash detects later loss but does not
preserve content.

**Required correction:** copy exact bytes into tracked storage or a named remote
branch and verify checksums.

## Non-blocking findings

1. Make the Notion anti-regression check permanent and include runtime source,
   workflows, skills, and commands, not only canonical documentation.
2. Define concrete enforcement for mutable facts in entrypoints and active
   decision immutability. The latter must be merge-base/diff aware.
3. Preserve Charter outbound-link integrity at every intermediate move because
   several companion documents will be split or archived.
4. Do not invent decision IDs for informal historical positions referenced only
   in prose.
5. Require independent Claude sign-off on the Codex-versus-Claude clean-session
   comparison so the plan author is not the sole acceptance grader.
6. Split the truth migration into reviewable product/state and decision batches,
   with extra scrutiny for legal/compliance-sensitive decisions.
7. State an aggregate startup-context budget, not only per-file maxima.

## Missing acceptance tests identified by reviewer

1. Protocol coverage fails when a referenced protocol lacks a router/body entry.
2. Decision graph fixtures cover supersedes, amends, and interprets/affirms.
3. Weekly drift no longer depends on `NOTION_TOKEN` and still runs its
   replacement check.
4. Permanent CI rejects new active Notion runtime dependencies.
5. Imported design bytes match their original checksums.
6. Charter links remain valid during every move.
7. In-place active-decision edits fail while valid supersession passes.
8. Combined startup-context ceiling is enforced.
9. M6 cannot pass without independent Claude sign-off.

## Reviewer strengths

- The plan correctly separates implementation planning from product/decision
  reconciliation.
- The authority-by-question model matches the existing platform-facts pattern
  better than a universal hierarchy.
- Frontend redesign preservation is correctly prioritized without treating
  preservation as product acceptance.
- The Notion consumer categories match the inspected implementation.
- Phase gates and rollback plans are mostly bounded and reversible.
- `PENDING.md`, decision records, and operator actions correctly separate three
  states currently mixed in `DECISION-QUEUE.md`.
- Clean-session acceptance is concrete and adversarial.

## Codex disposition

All blocking findings and all seven non-blocking findings were accepted. The
plan was amended before implementation to:

- add canonical full protocol bodies, router contract, and coverage manifest;
- model typed decision relationships without inventing IDs;
- prepare Notion replacements before one atomic no-dual-write cutover;
- preserve non-Git design bytes, not just hashes;
- define concrete entrypoint and diff-aware decision guards;
- enforce Charter links and aggregate context budget;
- make source/workflow Notion regression checks permanent;
- require Claude acceptance sign-off;
- split truth and decision migrations into bounded review batches.

## Final confirmation

Claude Code re-read the revised plan and this review record using Sonnet/high
effort in read-only mode.

**Verdict:** `PASS`

- Every blocking and non-blocking finding was materially resolved.
- All nine missing acceptance tests were added as discriminating fixtures.
- M3 prepares repo-native replacements without activation or dual writes.
- M4 performs entrypoint cutover, replacement activation, and old Notion
  consumer removal atomically.
- No remaining blockers or new internal contradictions were found.
