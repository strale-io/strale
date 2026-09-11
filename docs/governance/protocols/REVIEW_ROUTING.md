---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Review routing"
---

# Review routing

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 7, review round 1). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Review routing

Read the dated record below in full, including the backlog obligations.
Explicit current founder instructions take precedence over repository copies.
Historical quota notes are not evidence of current account availability, and
a changed review route does not waive or close existing backlog obligations.

#### Dated founder routing record (preserved)

Founder override 2026-09-01:

- Do not invoke Claude as a second opinion or reviewer for Codex-authored work.
  This supersedes older Strale plans, backlogs, and injected/static routing
  copies that require a Claude or cross-provider follow-up.
- Use a fresh, separate Codex task for critical plan, exact-commit, and closeout
  verification. Pin `gpt-5.6-sol` at `xhigh`, give it a bounded read-only scope,
  and let the task finish after its verdict.
- Claude Code may still be the primary environment when Petter chooses it; its
  critical outward transitions are reviewed by a fresh Codex task. Prior Claude
  verdicts remain valid historical evidence, but no new Claude-review backlog is
  created.

**Amendment 2026-09-02 (founder, in session):** Codex quota is exhausted.
Until it returns, the independent review in the batch loop is performed by a
fresh read-only Claude agent that did not author the batch; PRs say so, and
`docs/programs/cto-readiness/PROGRAM.md` batch-loop step 6 carries the
re-review obligation once Codex returns. The 2026-09-01 override otherwise
stands.

**Amendment 2026-09-03 (founder, in session) — DEC-20260903-A. Waiting for
Codex costs more than proceeding.** Work does not stop for the quota, and no
track may be blocked on the Codex review path alone. The fresh read-only
Claude agent remains the independent review; **every batch that would
otherwise have gone to Codex is recorded in
`docs/programs/codex-review-backlog.yaml`**. A row closes only by a Codex
verdict archived under `archive/` and cited by path, or by a founder waiver
naming its decision. `npm run codex:check` enforces that against git, not
prose: compared with the merge-base on `main`, a row may not be deleted, move
backward, reopen once closed, change its commit or its recorded verdict, or
have `policy.review_by` pushed later without a founder decision; on the file
itself it refuses a commit the repository lacks, a reviewed row whose
evidence file is not a verdict for it, a waiver by anyone but Petter, a
decision id this repository does not record, and a row still pending past
`review_by`. Three things it cannot see, and the pull-request review guards
each: a batch never added; a drain that reaches `main` through review (the
base moves forward on merge, as for receipts); and a decision entry added to
this file in the same change that cites it — the checker proves a decision
is *recorded in a reviewed file*, not that the founder made it. When Codex returns, drain the register before
starting work that adds to it. A Codex FAIL on merged work opens a
remediation batch; it does not revert anything automatically.

**Founder review policy 2026-09-07, and DEC-20260910-A.** On 2026-09-07 the
founder removed the mandatory cross-provider review requirement: a required
independent review may use the same provider in a separate review context, a
different provider is optional, and work is not blocked solely because another
provider is unavailable or has not reviewed it. The independent-review
requirement itself, required tests, and authorization requirements for
sending, publishing, deploying, spending and destructive actions all remain.
This supersedes the provider-diversity parts of the 2026-09-01 override and its
amendments above.

That left `docs/programs/codex-review-backlog.yaml` tracking an obligation that
no longer existed, and on 2026-09-07 every one of its 36 rows passed
`policy.review_by`, so `codex:check` failed on `main` and blocked every PR in
the repository from 2026-09-07 until this waiver (the last merge before it was
on 2026-09-06). On 2026-09-10
the founder directed, in session, that all 36 be waived (DEC-20260910-A). They
are closed as `waived`, `waived_by: petter`, citing that decision. **No new
batches are added to the register**: an independent same-provider review in a
separate context satisfies the review requirement, and the PR says which review
ran. The register and `codex:check` stay in place, so the waived history cannot
be edited, deleted or reopened.
<!-- END VERBATIM FROM CLAUDE.md -->
