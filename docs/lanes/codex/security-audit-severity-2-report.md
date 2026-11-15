# Security audit severity round 2 report

## Files changed

- `apps/api/src/capabilities/dependency-audit.ts` — classify only OSV detail transport and parse failures as degraded, use the shared detail-source label, derive `checked` from an actually queryable OSV request, and keep unchecked dependencies out of the up-to-date count.
- `apps/api/src/capabilities/package-audits.upstream-failures.test.ts` — add regressions for an unparsable advisory-detail response, a mixed 404/503 entirely unchecked npm list, and a mixed PyPI list whose unpinned dependency has no latest version.
- `apps/api/src/lib/osv-severity.ts` — parse metrics and weights through `Map`, reject duplicated metrics, and reject every non-finite score.
- `apps/api/src/lib/osv-severity.test.ts` — cover prototype-property metric values and a duplicated metric.
- `manifests/dependency-audit.yaml` — document that `unavailable_sources` can name OSV vulnerability details.
- `docs/lanes/codex/security-audit-severity-2-report.md` — this implementation and verification record.

## Tests added and fail-before results

- `OSV severity > rejects unsafe or duplicated metrics in CVSS:3.1/AV:constructor/...` — failed before the fix because `cvssV3BaseScore` returned `NaN` rather than `null`.
- `OSV severity > rejects unsafe or duplicated metrics in CVSS:3.1/AV:toString/...` — failed before the fix because `cvssV3BaseScore` returned `NaN` rather than `null`.
- `OSV severity > rejects unsafe or duplicated metrics in CVSS:3.1/AV:N/AV:L/...` — failed before the fix because the last repeated metric won and produced `8.4` rather than `null`.
- `security-audit-severity brief regressions > keeps an advisory with an unparsable detail body as unknown and names the degraded source` — failed with `dependency-audit.ts` checked out from `origin/main`: the old implementation did not fetch advisory details, so it did not name the degraded detail source or return the new severity field.
- `security-audit-severity brief regressions > throws upstream-unavailable when an unchecked list has both missing and unavailable registry answers` — failed with `dependency-audit.ts` checked out from `origin/main`: the promise resolved to a billable empty audit rather than throwing `UpstreamUnavailableError`.
- `security-audit-severity brief regressions > marks an unpinned PyPI dependency without a latest version as unchecked in a mixed list` — failed before the fix because the dependency had no `checked: false`, its `checked_version` was `"unknown"`, and `summary.unchecked` remained zero.

For the two explicit main comparisons, I used `git checkout origin/main -- apps/api/src/capabilities/dependency-audit.ts`, ran the regression file, and restored the implementation with `git checkout HEAD -- apps/api/src/capabilities/dependency-audit.ts`. No stash or guard-baseline change was used.

## Verification

- `npm --workspace=apps/api exec vitest run src/lib/osv-severity.test.ts src/capabilities/package-audits.upstream-failures.test.ts` — passed: 2 files, 47 tests.
- `npm --workspace=apps/api run lint:upstream-catches -- --base $(git merge-base origin/main HEAD)` — passed: 407 files, 283 handlers, 147 existing findings, and 32 documented exceptions; the OSV detail handler appears as a documented `degraded-ok` exception.
- `npm run build --workspace=packages/sdk-typescript` — passed; this restored the local SDK artifact needed by downstream workspace typechecks.
- `npm run build --workspace=packages/mcp-server` — passed; this restored the local MCP artifact before the repository typecheck.
- `npm run typecheck` — passed across the API, scripts, and all TypeScript package workspaces after the two local package builds.
- `npm run claims:check` — passed: claims register contract.
- `npm run models:check` — passed: model registry contract.
- `git diff --check` — passed.

## Not done

- `validate-capability.ts`, capability readiness, and smoke tests were not run. The original brief explicitly assigns these database-dependent checks to the review session, while this round-2 brief restricts this builder to repository data and offline fetch-stubbed tests.
- No guard baseline, price, category, fixture input, route, billing behavior, circuit breaker, database, migration, environment variable, or other capability was changed.
