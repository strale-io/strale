# PR backlog triage — strale-io/strale

**Date**: 2026-04-18
**Scope**: read-only investigation of open pull requests on `strale-io/strale`.

---

## Executive summary

**Total open PRs: 0.**

The triage premise — "Petter has 5–15 open PRs on strale-io/strale, all authored
by him, that have been sitting unmerged" — does not match the current state of
the repo. Every pull request ever opened against this repo has either been
merged or closed, and most have been closed out in the last 48 hours as part
of the Phase B / C / D review sprint.

The step-by-step per-PR analysis, conflict surface, CI, bucket classification,
and risk/value/effort scoring that the brief specifies are all predicated on
there being PRs to triage. There are none. This document surfaces the finding
and offers Petter three plausible interpretations rather than inventing work.

Per the brief's escalation rule — "If the count is unexpectedly large (>20),
flag it and stop to ask Petter" — the same spirit applies to an unexpectedly
small count, especially zero. Flagging before inventing.

---

## Evidence

### 1. Direct GitHub API check

```
GET /repos/strale-io/strale/pulls?state=open&per_page=50
```

Response: `[]` (empty array).

### 2. `gh pr list` equivalent

```
$ gh pr list --state open --limit 50
(no output)
```

### 3. Full PR history (all states)

There are 12 total PRs on the repo, numbered #1–#12:

| # | Title | Branch | State | Closed / merged |
|---|---|---|---|---|
| 12 | Phase D: P2 medium fixes (F-0-007, F-0-010, F-0-013 + backlink-check) | `claude/phase-d-p2-medium-fixes` | MERGED | 2026-04-18T13:06Z |
| 11 | fix(ecb-interest-rates): swap data source from ECB SDW to FRED mirror | `fix/ecb-rates-fred-swap` | MERGED | 2026-04-17T21:42Z |
| 10 | hotfix(jobs): xact-scoped advisory locks | `claude/infallible-murdock-8d0bc1` | MERGED | 2026-04-17T18:50Z |
|  9 | chore(ci): seed minimal GitHub Actions workflow | `chore/seed-ci-workflow` | MERGED | 2026-04-17T14:20Z |
|  8 | Phase B + C: P0/P1 fixes from Session 0 review | `claude/infallible-murdock-8d0bc1` | MERGED | 2026-04-17T14:09Z |
|  7 | fix(x402): verify → execute → settle across all x402 paths | `fix/x402-settle-on-success` | MERGED | 2026-04-17T08:51Z |
|  6 | fix: honest status-specific messages for web scraping failures | `fix/scraping-error-messages` | MERGED | 2026-04-17T08:26Z |
|  1 | add MCP server badge | `punkpeye:glama-badge` (external) | CLOSED (unmerged) | 2026-03-13T16:16Z |

Numbers 2, 3, 4, 5 are not PR numbers — they are the issue numbers
currently open on the repo (#2 "rate-limit headers on /v1/do", #3 "Python
type stubs for straleio", #4 "Document free-tier capabilities"). GitHub
shares the numbering namespace between issues and PRs; when Petter may be
remembering "N open things," he may be conflating the three open issues
with phantom PRs.

### 4. `open_issues_count` on the repo

```
GET /repos/strale-io/strale
open_issues_count: 3
```

All three are issues, not PRs (verified via
`GET /issues?state=open` — every entry has `pull_request: null`).

### 5. Remote branches — all merged

There are 11 remote branches on `origin`, listed below. Every one that is
not `main` / `HEAD` is already fully merged into `main`:

| Branch | Tip | In main? | Last commit |
|---|---|---|---|
| `claude/infallible-murdock-8d0bc1` | 89234a2 | ✅ | 2026-04-17 20:53 |
| `claude/phase-d-p2-medium-fixes` | 4e3ee77 | ✅ | 2026-04-18 15:04 |
| `feat/pipeline-phase-1` | 34411c6 | ✅ | 2026-03-17 16:24 |
| `feat/quality-aggregation` | f529a87 | ✅ | 2026-03-03 16:49 |
| `feat/quality-capture` | 5b08d81 | ✅ | 2026-03-03 16:44 |
| `feat/solutions` | d463dd9 | ✅ | 2026-03-02 10:18 |
| `feat/test-suite-runner` | 58c432f | ✅ | 2026-03-03 17:16 |
| `feat/trust-pipeline` | 7323950 | ✅ | 2026-03-03 21:48 |
| `fix/sprint-9-credibility` | d6c4ce1 | ✅ | 2026-03-14 14:47 |

No branch exists on the remote that has commits not already on `main`.
There is no hidden WIP pointed at the remote.

### 6. Sibling `strale-io` repos

| Repo | Open PRs |
|---|---|
| `strale-io/strale` | 0 |
| `strale-io/strale-frontend` | 0 |
| `strale-io/strale-x402-starter` | 0 |
| `strale-io/n8n-nodes-strale` | 0 |
| `strale-io/strale-beacon` | 0 |
| `strale-io/strale-examples` | 0 |
| `strale-io/agent-skills` | 0 |

Zero open PRs anywhere in the strale-io org.

---

## Plausible explanations

Three hypotheses for why Petter expected a 5–15 PR backlog. None required
any state change to confirm or rule out — this is strictly an ordered
prompt for the next conversation.

### A — Conflating open **issues** with open PRs

Most likely. There are three open items on the repo that surface in
notification counts (`3` in the sidebar, `3` on the "Issues" tab):

- Issue #2 — "Add rate-limit headers to /v1/do response"
- Issue #3 — "Add Python type stubs for straleio SDK"
- Issue #4 — "Document all free-tier capabilities in a single markdown file"

Three is far from the 5–15 estimate, but if Petter glanced at
`strale-io/strale` and saw "3 issues" without distinguishing Issues from
PRs, the gut reaction "there's a backlog" is understandable. Each of
these is a small, standalone follow-up.

### B — Mistaken recollection post-sprint

The last 48 hours merged seven PRs back-to-back (#6 through #12) as part
of the Phase B/C/D review sprint. Before that, the previous PRs were
from March. It's possible Petter remembers "there were a lot of PRs open
recently" which was true at various points during the sprint — but every
one of them has now landed.

### C — Backlog lives in a different place

The work is documented but not as PRs:

- **`SESSION_5_CARRY_FORWARD.md`** lists four architectural findings (SCF-1
  advisory-lock pattern, SCF-2 job-liveness check, SCF-3 untracked schema
  writes, SCF-4 two patterns for long-running job locks). These are
  Session 5 scope, not PRs.
- **`FIX_PHASE_B_ssrf_migration_todo.md`** tracked SSRF migrations
  capability-by-capability; the one remaining preemptive item
  (backlink-check) was handled in Phase D.
- **Phase E** items (F-0-011 circuit breaker atomicity, F-0-012 dead
  code, F-0-014 structured logger, F-0-015 Stripe URL, F-0-016 Stripe
  topup max) are the natural next tier. None of them have PRs yet.

If Petter is thinking of "the list of things we know we still need to
do," those items exist as documents and open issues rather than as PRs.

---

## What I would need from Petter before this session produces anything

This triage session has nothing to triage. Rather than fabricate a per-PR
breakdown, the deliverable is one of the following, depending on Petter's
actual intent:

1. **If Petter meant the open issues**: swap this session into an issue
   triage. Each of the three issues (#2, #3, #4) gets a recommendation:
   pick up now / defer to Phase E / close as superseded / reassign.
2. **If Petter meant the Phase E / Session 5 docs**: swap this session
   into a planning exercise. Pick the next phase from the documented
   backlog and scope it.
3. **If Petter meant a different repo or a different GitHub account**:
   point me at it. Nothing in `strale-io/*` has an open PR right now.

No PRs were merged, closed, commented on, rebased, or pushed during this
session. Every authority listed in the brief (`gh pr list`, `gh pr view`,
`git fetch`, read-only `git diff` / `git merge-base` / `git log`, file
reads) was used; the writable authority (`gh pr merge`, `gh pr close`,
`gh pr comment`, `git merge`, `git rebase`, `git push`, `git commit`) was
not exercised.

---

## Commands used (all read-only)

```
gh pr list --state open --limit 50
gh pr list --state all --limit 30
gh pr list --state closed --search "is:unmerged"
gh api repos/strale-io/strale/pulls?state=open&per_page=50
gh api repos/strale-io/strale/issues?state=open
gh api repos/strale-io/strale --jq .open_issues_count
gh repo list strale-io --limit 20
for repo in <all strale-io repos>: gh api "repos/$repo/pulls?state=open"
git fetch --all --prune
git branch -r
git branch -r --no-merged origin/main
for branch in <each remote branch>: git rev-list --count origin/main..$branch
for branch in <each remote branch>: git branch -r --contains <tip> origin/main
```
