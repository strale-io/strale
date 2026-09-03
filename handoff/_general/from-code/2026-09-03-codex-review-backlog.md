Intent: act on the founder's decision that waiting for the Codex quota costs more than proceeding, by making the resulting review debt a checked register rather than a promise.

## The decision

Petter, in session 2026-09-03: *"we can't wait for Codex to come back, so you
are authorized to keep working without Codex's review. Instead, I want you to
keep a backlog of things that we want Codex to review once it's back, but we
need to proceed anyway."*

Recorded as **DEC-20260903-A**, amending the review routing in CLAUDE.md. The
2026-09-02 amendment already allowed a fresh read-only Claude agent to perform
the independent review while Codex was out; what changes today is that **no
track may be blocked on the Codex path alone**, and that the debt is now
tracked rather than remembered.

## Why a register and not a list

"We'll get Codex to look at it later" is a sentence with no mechanism behind
it, and a document recording such promises is exactly the kind that drifts —
the F7 family, twice today alone. So `docs/programs/codex-review-backlog.yaml`
is checked by `npm run codex:check`, wired into CI, and the check knows the
date:

- a row naming a commit this repository does not have is a row nobody can
  review;
- a row marked `reviewed` with no verdict and no date means somebody said so;
- a row marked `waived` with no reason is a deletion wearing a status;
- **a row still `pending` after `policy.review_by` fails the build.**

That last one is the point. On 2026-09-08 the build breaks until the register
is drained. Verified: `node scripts/check-codex-backlog.mjs --today 2026-09-08`
exits 1 and names all three rows.

Each row carries `why_codex` — why a Claude-only review is *least* adequate
here — and `what_to_attack`, so the reviewer starts where the risk is rather
than reading the diff top to bottom.

## The review that made it real

The first version validated only the file's shape, and the independent review
drained it to green five ways with no Codex review happening — waive the row
with "looks fine to me", fabricate a verdict, delete the row, push
`review_by` to 2099, empty the file. Every one is an edit to the file, so the
checker now compares the file against its merge-base on `main`, the same
git-fact discipline the receipts checker applies. A row cannot vanish, a
status moves forward only and a closed row is terminal, a commit and a
recorded verdict are immutable, the date cannot move later without a founder
decision naming the extension, closing as reviewed needs an archived verdict
that exists on disk, and waiving is Petter's alone. Each drain is planted in a
real throwaway repository and refused; the honest close — forward, with
evidence — passes.

Also from that review: a shallow clone reports a commit as *unverifiable*
rather than *missing* (a false failure on every build would be worse than no
check), the mandatory resume note in `PROGRAM.md` no longer says T10 is
blocked, and the prose in this register's header and in `CLAUDE.md` now
claims exactly what the code enforces and names the one thing it cannot: a
batch never added.

## Round three

The third review found that `codex_evidence: archive/../notes/fake.md`
passed the `archive/` prefix test and was read from wherever it pointed —
including outside the repository. Containment is now a property of the
resolved path: any `..` segment is refused, and the resolved file must sit
under `<root>/archive/`. It also showed a bold decision id anywhere in
`CLAUDE.md` satisfied the existence check — a throwaway appendix sentence
would do — so the lookup now requires a list entry, a bullet that starts with
the bold id. And it judged, correctly, that the prose should say what this
check proves: that a decision is recorded in a reviewed file, not that the
founder made it. A decision entry added in the same change that cites it is
caught by the pull-request review, not by the checker, and the header now
says so.

## What is in it

| Row | Priority | Why it needs a different model |
|---|---|---|
| CX-1 | high | PR #494. Five consecutive Claude rounds each returned FAIL, and the fourth disproved the fix strategy the third had built. That is evidence the surface is hard to reason about, not that the fifth round exhausted it. |
| CX-2 | medium | PR #497. It weakens a safety gate deliberately; a second opinion on a check that now fails less often is worth having from a different model. |
| CX-3 | high | The retention window change. Two Claude rounds got the predicate wrong in opposite directions — one left records unprotected, the next would have extended admin-typed free text from 180 days to 1095. |

## T10 is unblocked

`M2 exit-gap closure` was `blocked` solely because its closing review was
reserved for Codex. It is now `queued` and its `next_action` records why. Four
tracks sit behind it (M3 workflows, the M4 authority cutover, the M5–M7
closeout, and WP16 discovery), so this is the unblocking that matters most —
the dependency track is valuable but it gates nothing.

## Production verification of the change that shipped alongside this

PR #494 merged as `0daa93c9` and production serves it. Checked live rather
than assumed, including the over-pruning direction that five reviews did not
cover:

| | Before | After |
|---|---|---|
| Withdrawn capabilities on the agent card | 10 | **0** |
| `GET /v1/capabilities/page-speed-test` | 200 with full schemas | **404** |
| Withdrawn names in `llms-full.txt` | present | **0** |
| Trust batch for a withdrawn slug | badge + pass rate | **dropped**, visible sibling kept |
| `/onboarding/readiness` enumeration | 340 | **297**, the public count exactly |
| Website's four consumed endpoints | 200 | **200** |

## Not done

- The Notion decision record for DEC-20260903-A is filed separately; the repo
  reference is the operative one.
- No Codex review has happened. That is the whole point of the register.
