Intent: close the last M2 exit gap (G9), mark track T10 done, and hand the cto-readiness program to its next track.

# T10 / G9: the M2 exit is closed

## Outcome

The closing independent review of the complete M2 candidate set passed at
commit `b014c41767d46d73be743a1cc121045194f58714`. The verdict is archived at
`archive/sessions/2026-09-05-m2-closing-review.md` (merged in PR #618) and was
itself reviewed by a fresh read-only agent before merge. This change records it:

- `docs/project/m2-closure-register.yaml` gains its `closing_review` block, the
  G9 exit gap becomes non-blocking, and the exit-gap counts move from one
  blocking gap to none.
- Track T10 is done. Track T6 (M3 repo-native workflows) is now the active
  track, because the M2 exit gate existed to unblock it and every one of its
  dependencies is met.

The candidate record set stays inactive. Nothing here is the M4 cutover, which
remains founder-gated; Notion-backed workflows stay authoritative.

## How the review converged

Sixteen closing rounds ran. The last three rounds found defects almost
entirely inside the correction records themselves rather than in the original
decision records, and round 16 found none anywhere. The correction records are
`DEC-20260905-B` through `DEC-20260905-Q`; each round that failed is archived
at `archive/sessions/2026-09-05-m2-closing-review-round-<n>.md`.

Three process lessons came out of it, each now baked into the review prompts:

- A reviewer can re-report a statement an earlier correction already
  withdrew. Naming the withdrawn items explicitly and rerunning the partition
  fixed this; overriding the reviewer's verdict would not have.
- A consolidator once widened an exemption by analogy to reach a pass. The
  independent review of that verdict rejected it, and the verdict was closed
  unmerged. `DEC-20260905-Q` later wrote the underlying rule down explicitly,
  scoped so it cannot excuse a statement no record ever withdrew.
- Archive files were twice altered while claiming to reproduce reviewer text
  verbatim, and once stated a partition count that contradicted their own
  method section. Every archive since is verified byte for byte against its
  sources before merge.

## Tests changed by the closure, and how they were proven

Five prove-the-checker tests assumed the pre-closure world: G9 blocking, no
`closing_review` block, T10 active, T6 queued. Each now reconstructs that world
inside its own fixture before planting its failure. No assertion was weakened,
removed or inverted, and neither checker library was touched.

Each of the five was then proven by planting its failure: the checker line it
guards was deliberately broken, the test was confirmed to fail, the library was
restored from git, and the test was confirmed to pass again. All five failed
when broken and passed when restored, and both libraries were clean afterwards.

## Review routing for this batch

No rows are added to `docs/programs/codex-review-backlog.yaml`. Under the
founder's 2026-09-07 review policy, recorded as DEC-20260910-A, cross-provider
review is optional and no new batches are added to that register; an
independent same-provider review in a separate context satisfies the review
requirement. Every batch in this loop, including this one, was reviewed that
way: each erratum and verdict pull request by a fresh read-only agent that did
not author it. DEC-20260910-A also waived the register's 36 pending rows, whose
overdue `policy.review_by` had made `codex:check` fail on `main` from 2026-09-07.

## Next

T6's first sub-batch is the vendor-current-state shadow replacement named by
the vendor-stack closeout; see its `next_action` in
`docs/programs/cto-readiness/tracks.yaml` and the migration plan it points to.
