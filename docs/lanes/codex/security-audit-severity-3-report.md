# Security-audit severity round 3 report

## Files changed

- `apps/api/src/capabilities/dependency-audit.ts`
  - Bounded OSV detail JSON reads at `MAX_FETCHED_API_RESPONSE_BYTES`.
  - Treats `ResourceLimitError` as degraded OSV detail data while preserving rethrows for internal defects.
  - Uses literal, field-specific refusal messages for `package_json` and `requirements_txt`.
- `apps/api/src/capabilities/package-security-audit.ts`
  - Uses the required literal remediation for an unpublished `version`.
- `apps/api/src/capabilities/package-audits.upstream-failures.test.ts`
  - Adds the two OSV detail catch regressions below.
- `docs/lanes/codex/security-audit-severity-3-report.md`
  - This report.

## Tests added and fail-before evidence

- `rethrows a defect from an advisory detail fetch`
  - Fail-before setup: temporarily replaced the detail handler with a bare `catch { detailsUnavailable = true; }`.
  - Fail-before result: **failed as intended** because the audit resolved with a billable result instead of rejecting the injected `RangeError("defect")`.
  - Restoration: restored `apps/api/src/capabilities/dependency-audit.ts` from `HEAD` with `git checkout HEAD -- apps/api/src/capabilities/dependency-audit.ts`, as required by the brief.
- `keeps an advisory with an oversized detail body as unknown and names the degraded source`
  - Fail-before result: **failed as intended** because the unbounded reader accepted the oversized valid JSON response, so `unavailable_sources` was absent and the advisory was rated rather than unknown.

## Verification

- `npm --workspace=packages/sdk-typescript run build`: **passed**.
- `npm --workspace=packages/mcp-server run build`: **passed**.
- `npx vitest run src/capabilities/package-audits.upstream-failures.test.ts`: **passed**, 1 file and 40 tests.
- `npx vitest run src/lib/body-reader-ratchet.test.ts src/lib/actionable-errors-round2.test.ts src/capabilities/package-audits.upstream-failures.test.ts`: **passed**, 3 files and 207 tests.
- `npm --workspace=apps/api run lint:upstream-catches -- --base bc25ce10`: **passed**, 407 files, 283 handlers, 147 existing findings, and 32 documented exceptions. The prescribed `$(git merge-base origin/main HEAD)` expression could not be used because this task checkout has no `origin` remote/ref; `bc25ce10` is the round-2 parent named by the brief and was used as the equivalent base.
- `npm run typecheck`: **passed**.
- `npm run env:check`: **passed**, 138 environment reads checked against 143 manifest rows.
- `npm run claims:check`: **passed**, 32 claim rows checked.
- `npm run models:check`: **passed**, 1,097 files checked.

## Not completed

- `npm --workspace=apps/api run test:code` did not produce a valid completed full-suite result in this constrained task environment. The normal parallel run was stopped after unrelated wall-clock performance assertions failed under contention (`structured-metadata.test.ts` and `url-to-markdown-parse-bound.test.ts`). A retry with `--maxWorkers=1` was then terminated by the command runner's five-minute execution ceiling before Vitest printed its final counts. The three directly affected suites pass with **207 passed, 0 failed**, but a full-suite `0 failed` result and full-suite counts therefore remain outstanding for CI/review infrastructure.
- A normal `npm ci` could not finish because `c2pa-node` attempted to download test certificates from GitHub and the environment returned `ENETUNREACH`; dependencies were installed with `npm ci --ignore-scripts` instead. No repository files were changed by that workaround.
