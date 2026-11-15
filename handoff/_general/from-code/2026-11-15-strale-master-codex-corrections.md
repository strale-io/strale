Intent: record where the promise-audit T1 Codex lanes ended and what they left open (Strale master, 2026-11-15).

# Promise-audit T1 Codex lanes: both families closed, final PRs labelled

Each family ran the full three Codex runs. An independent Claude agent reviewed every run in a separate context. Both final PRs are GO and carry `ready-to-merge`.

| Lane | Superseded PRs | Final PR | Final head | Verdict |
|---|---|---|---|---|
| billed-wrong-answers-four-tools | strale-io/strale#1062 | strale-io/strale#1065 | 988088e3 | GO |
| security-audit-severity | strale-io/strale#1063 | strale-io/strale#1066 | 169771ee | GO |

- **Round 1 failures:**
  - #1062 sent `GITHUB_TOKEN` for repositories the caller names.
  - #1063 failed CI on `lint:upstream-catches`.
- **Round 2 failures:** repo-wide tests that the first reviews had not run.
  - `actionable-errors-round2.test.ts`: the refusal fix text.
  - `body-reader-ratchet.test.ts`: an unbounded body read.
- **Round 3:** both runs fixed exactly what their briefs named.
- **169771ee:** a manifest-only commit by the master. After round 3, the `--strict` manifest guaranteed-field check failed on four dotted reliability keys. They are now `common`, and a separate review confirmed it.
- **Database checks:** none were run (`validate-capability.ts`, readiness, smoke test), because no review session had `DATABASE_URL`.

## Lessons for the next Codex brief
- A review must run the full `npm --workspace=apps/api run test:code`, not only the files the brief names.
- A review must also run the CI `check` job's manifest steps.
- A brief that adds manifest reliability keys must say that they are top-level names only, or that they are declared in `output_schema`.

## Found, not yet briefed
- **GITHUB_TOKEN with caller-supplied names, already on main.** github-repo-compare, github-user-profile and social-profile-check send the production `GITHUB_TOKEN` on requests for repositories or users that the caller names. That token can also write issues in strale-io/strale. If it can read private repositories, a caller could read metadata that Strale can see. Two steps are needed:
  - a scope check of the token;
  - a choice between dropping the token from caller-driven calls and using a separate token that reads public repositories only.
- **OSV detail fetches have no overall time budget.** In the worst case one audit takes about 104 s against the 30 s `/v1/do` timeout, so a large audit times out unbilled instead of reading `unknown`.
- **Nested audit fields are understated.** `summary.unchecked` (dependency-audit) is always emitted but is marked `common`. Declaring the nested properties in `output_schema` would let them stay `guaranteed`.
- **Empty dependency list.** It now gets a refusal whose wording reads oddly.
- **PyPI malicious advisories.** `MAL-` advisories do not set `malicious` for PyPI.
- **Dead parameter.** `fetchPypiRegistry` has an unused `version` parameter.
- **RDAP errors.** startup-domain-check maps every RDAP lookup error to unavailable, including our own defects.

Next authorised action: confirm #1065 and #1066 merged and deployed, then brief the GITHUB_TOKEN scope fix | Owner: Strale master | Blocker: merge gate on both PRs
