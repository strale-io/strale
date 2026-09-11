# Handoff baseline cleared; two review branches preserved as tags

**Intent:** founder directed (2026-09-11) that the branches and checkouts
waiting on his decision in `scripts/handoff/baseline.json` be deleted, and the
session closed out.

Date: 2026-09-11
Branch: `chore/clear-handoff-baseline`

## What was removed

| Entry | State found | Action |
|---|---|---|
| worktree `C:/tmp/strale-closing10-gates` | directory no longer exists | entry removed |
| worktree `C:/tmp/strale-closing10-P5` | directory no longer exists | entry removed |
| branch `pr-555-review` (bc6c2a26) | local and on origin; differs from the merged head of PR #555 in 5 files | tagged `archive/branches/pr-555-review`, then deleted locally and on origin |
| branch `pr-563-check` (ef51de5e) | local and on origin; see the open question below | tagged `archive/branches/pr-563-check`, then deleted locally and on origin |

Both tags are annotated, pushed, and point at the exact branch tips
(checked with `git ls-remote` before the remote branches were deleted), so
nothing was lost.

## Open question carried forward (M2 G9)

`pr-563-check`'s review-fix commit `ef51de5e` still differs from `origin/main`
by one line in each of three decision records: `DEC-20260420-I`,
`DEC-20260420-J` and the `DEC-20260420-K` record ending `c0575c4`.

- Two of the differences are punctuation (a comma on main, a dash on the
  branch).
- One is quote wording: "Exact same" on main, "the same" on the branch.

Whether those review findings never merged, or main changed them afterwards,
is still the G9 question the baseline recorded. The branch is no longer where
to look; it is in the tag:

`git diff origin/main archive/branches/pr-563-check -- 'docs/**/DEC-20260420-[IJK]*'`

## This session, for the record

- #659: the wallet and gas capabilities gained more chains, and job search
  gained France and US federal jobs behind their credentials.
- #660: correction after the deploy. Alchemy serves only the networks enabled
  on its app. Details and the founder's steps are in
  `handoff/_general/from-code/2026-09-11-multichain-and-job-countries.md`.
