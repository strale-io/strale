Intent: record where the promise-audit T1 Codex lanes stand after their first independent reviews (Strale master, 2026-11-15).

# Promise-audit T1 Codex lanes: round 2 dispatched

Both first-round Codex results were reviewed by a fresh Claude agent in a separate context. Both were NO-GO; both corrections are dispatched to the Codex dispatcher as run 2 of 3.

| Lane | First PR | Review at | Verdict | Correction branch and brief |
|---|---|---|---|---|
| billed-wrong-answers-four-tools | strale-io/strale#1062 | 2c3e01fa | NO-GO: github-repo-analyze sends `GITHUB_TOKEN` on all five calls for a caller-named repo | `codex/billed-wrong-answers-four-tools-2`, `docs/lanes/codex/billed-wrong-answers-four-tools-2-brief.md` (on that branch) |
| security-audit-severity | strale-io/strale#1063 | 39022b8a | NO-GO: CI `lint:upstream-catches` red on the OSV detail-fetch catch; also a test that passes on main, CVSS plain-object lookups, PyPI `checked` | `codex/security-audit-severity-2`, `docs/lanes/codex/security-audit-severity-2-brief.md` (on that branch) |

## When the corrections return

- Open a draft PR from each `-2` branch, close the superseded PR, run a fresh independent review on the new head and label `ready-to-merge` only on GO with green CI.
- Neither PR's database-backed checks (`validate-capability.ts`, readiness, smoke test) were run: no `DATABASE_URL` in the review sessions.

## Found, not yet briefed

- **GITHUB_TOKEN with caller-supplied names, already on main.** github-repo-compare, github-user-profile and social-profile-check send the production `GITHUB_TOKEN` (which also writes issues in strale-io/strale) on requests for repositories or users the caller names. If the token can read private repositories, a caller could read metadata Strale can see. This needs a scope check of the token and a decision: drop the token from caller-driven calls, or use a separate public-only token. Out of scope for the -2 lane by design.

Next authorised action: review each -2 Codex result and open its PR | Owner: Strale master | Blocker: Codex runs in progress
