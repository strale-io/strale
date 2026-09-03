Intent: stop the session-end gate instructing the destruction of live work, after it did so three times in one session.

## What happened

On 2026-09-03 the worktree finding in `scripts/handoff/handoff-check.mjs` told a
session to run `git worktree remove` on a directory that was in active use,
three times:

1. A rebase in progress, detached HEAD, carrying a commit on no remote.
2. A review agent mid fail-before check: source file mutated, backup beside it.
3. The same review agent minutes later, after it had restored its files.

Each time the instruction was disobeyed by a session that checked first. Had it
been followed, the first would have destroyed an unpushed commit and the other
two would have killed a running review.

**The gate was never wrong about the state it observed.** Detached HEAD, holds
no batch branch, two worktrees exist — all true. It was wrong about what that
state licensed. A detached HEAD is what an abandoned checkout looks like and
what live work looks like.

## The fix, and its limit

Keep the detection, drop the imperative.

- A worktree with any uncommitted path is live work: the gate says so and never
  proposes removing it. Detached *and* dirty is the shape a tool makes for
  itself, so it is also excluded from the one-batch limit — counting it was
  what made the gate demand removal of the thing it must not remove.
- A clean detached worktree still fails, because the repository does need
  tidying, but the fix text now says a clean tree is not proof of idleness and
  to ask its owner rather than removing it.

**This is sound in one direction only, and the code says so.** Dirty proves
live; clean proves nothing. Case 3 above is exactly that: the review worktree
went clean at 10:41 while still in use, between finishing its mutations and
writing its verdict — a window of minutes, and precisely when a stop hook is
most likely to fire. Liveness is not decidable from the filesystem. Head state,
cleanliness and mtime are each proxies that fail in one direction, so the gate
now states the one thing it can always support: this worktree is not yours.

The dirty-path age is reported alongside, because a tree touched four seconds
ago and one touched four days ago are different situations and the finding
could not previously tell them apart. It ranks, it does not authorise.

## A second defect, found while reading the same function

Every `dirty` finding has been naming its first path with the first character
missing — `cripts/handoff/handoff-check.mjs`. `git status --porcelain` writes
`" M path"` for an unstaged change, the git helper trims the whole output, and
that trim ate the leading space, so a fixed three-character slice removed one
character too many from the first line only. Now matched by status field
rather than by counting characters.

## Evidence

Four tests, all planted. Removing the live-work branch fails two of them
(the removal instruction, and the batch-count exclusion). The clean-detached
test asserts the fix text refuses to call the worktree idle. The path test
asserts the first path survives intact. 34/34 pass.

## Not done

- No attempt to make the gate decide liveness. It cannot, and pretending
  otherwise is how the imperative got there.
- The `.claude/worktrees/` exemption is unchanged; those were already notes.
