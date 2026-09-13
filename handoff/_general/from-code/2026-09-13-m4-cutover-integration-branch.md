Intent: record what the `m4/cutover` integration branch has changed so far, what
remains before the single merge to `main`, and what only the founder can do.

# M4 atomic authority cutover: the integration branch

## Why a branch rather than a series of merges

M4 moves operating authority from the Notion workspace to this repository. Half
a cutover is worse than either side of it: an entrypoint pointing at a document
that is still a candidate, or a check made blocking before the thing it checks
exists. So every batch is a reviewed pull request into `m4/cutover`, and the
branch reaches `main` as one squash merge that can be reverted as one unit. The
branch opens with an empty commit so the handoff gate does not read the
integration branch as already merged.

## What has landed on the branch

In order, each its own reviewed pull request:

1. The `.claude/` starter-kit files are retired without losing a live rule. The
   rules that were only written there are extracted first, and the
   `PROTOCOL.md` pointers are retargeted.
2. The M2 closing review is scoped to the reviewed commit's own record set, so
   that a frozen review no longer blocks every new decision record. Then the
   active decisions that only `CLAUDE.md` carried are recorded as records.
3. The pre-commit inventory gate is narrowed to stale generated context, so it
   blocks on the thing it exists to catch and not on every unrelated edit.
4. The project documents the entrypoints will point at are activated, ahead of
   the entrypoint rewrites that reference them. A per-document guard fires if
   an entrypoint ever references a document still marked inactive.
5. `CLAUDE.md` is rewritten as a repo-native entrypoint.

Batch 3, `AGENTS.md` as a peer entrypoint plus the entrypoint parity check, is
open as a pull request and under review.

## Where each mandatory protocol now lives

Both entrypoints are loaded automatically by their own tool, and a pointer is
followed only by choice. That asymmetry decided the shape: the mandatory
protocols stay in full in the entrypoints rather than moving behind pointers,
and the parity check proves each protocol is reachable from both files.

## What the review rounds cost, and why they were worth it

The parity check took nine review rounds. Rounds seven and eight each found a
real defect after six rounds had passed it. Two are worth carrying forward as
lessons rather than as trivia:

- The mutable-fact scan read one line at a time, so any fact whose halves fell
  on either side of an ordinary paragraph wrap was invisible. The same failure
  class had already been recorded for a different scanner in this repository.
  Whenever a checker matches prose, ask what unit it matches against.
- The library's own docblock claimed every pattern already matched across a
  joined newline. That was false for four patterns, and the test written to
  cover the rule happened to use one of the patterns that worked. A confident
  comment plus a test that picks the working example is how a gap survives
  review. Correcting the claim mattered more than widening the patterns.

## What remains

- Activate the repo-native session-end and vendor-switch mechanisms.
- Move the digest readers into production, retire the shadow workflow, and
  remove the last reader of the Notion API key. The production move depends on
  a build step, so the check must read the built image, not the source tree.
- Retarget the weekly vendor-roster drift job away from Notion and drop its
  token from the job's secret map.
- Add the anti-regression check for reintroduced Notion reads, and make the
  report-only checks blocking.
- Flip the authority markers and the schema that carries them, last, so nothing
  on the branch claims the cutover happened before it did.

## Founder only

Three acts at cutover are his and are not automated here: removing the Notion
API key from the hosting project, removing the workspace token from the
repository's secrets, and setting the Notion workspace read only. The branch is
written so that none of the three is a prerequisite for the merge, only for the
cutover being complete.

## Known limits, stated rather than worked around

The parity check's mutable-fact scan is a heuristic net. It matches shapes:
money, counts, dated status, decision summaries. A stale fact phrased outside
those shapes passes. A fact added to a protocol's section and its mirror in the
same change is invisible to it and to the protocol equality check alike, because
both compare the two copies rather than checking either against the world. What
governs that path is the reviewed pull request, not a check, and the library
header says so.
