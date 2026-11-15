Intent: Codex builder brief: final review fixes for security-audit-severity (round 3).

# Brief: security-audit-severity final fixes

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-15.
  - This follows an independent review of `codex/security-audit-severity-2` at bc25ce10, which ran the full code test suite.
  - The verdict was NO-GO on three repo-wide test failures.
  - Every item in both earlier briefs was confirmed done, including the CVSS sweep over all 5,184 base vectors.
- **This is the last run in this family.** Keep the change to exactly what is below.
- **Branch:** push only `codex/security-audit-severity-3`. It starts from `codex/security-audit-severity-2`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. All tests run offline with `fetch` stubbed.

## Fix these

1. **The OSV detail read is unbounded (blocking).**
   - **What fails:** `apps/api/src/lib/body-reader-ratchet.test.ts`, the raw `.json()` / `.text()` count, which reports `capabilities/dependency-audit.ts: 3 -> 4`.
   - **The cause:** `const detail = (await response.json()) as OsvVuln;` in the detail loop of `apps/api/src/capabilities/dependency-audit.ts`.
   - **The fix:** read the body with `readJsonWithLimit<OsvVuln>(response, MAX_FETCHED_API_RESPONSE_BYTES)`, imported from `../lib/resource-limits.js`.
   - **Oversize is a degraded upstream answer, not our defect.** In the detail catch, an oversize body throws `ResourceLimitError` (also exported from `../lib/resource-limits.js`). Treat it like a timeout: set `detailsUnavailable = true`, so that advisory reads `"unknown"`. Do not rethrow it.
   - Keep rethrowing every other error that `transportFailure` does not turn into `UpstreamUnavailableError`. Extend the `// degraded-ok:` comment, which stays the first line inside the catch, to mention an oversized body.
   - **Do not** raise the ratchet baseline.
2. **The dependency-audit refusal fails the refusal-wording test (blocking).**
   - **What fails:** `apps/api/src/lib/actionable-errors-round2.test.ts`, "dependency-audit.ts:190 fix names its field and accepted format", with `ReferenceError: field is not defined`.
   - **Why:** that test evaluates the second and third arguments of every `inputRefusal(...)` call as standalone expressions, so they must be literals. The third argument must:
     - start with "Send ";
     - contain `'<field>'`;
     - end with a period;
     - quote only lowercase words that are `input_schema` properties.
   - **The fix:** in `requireCheckedDependency`, type the parameter `field: "package_json" | "requirements_txt"`, and replace the single refusal with:
     ```ts
     throw field === "package_json"
       ? inputRefusal(
           "'package_json' must contain at least one dependency that can be checked; none had a declared version or a registry answer.",
           "package_json",
           "Send 'package_json' with at least one dependency that declares a version or is published on npm.",
         )
       : inputRefusal(
           "'requirements_txt' must contain at least one requirement that can be checked; none was pinned or had a PyPI answer.",
           "requirements_txt",
           "Send 'requirements_txt' with at least one requirement that is pinned or is published on PyPI.",
         );
     ```
3. **The package-security-audit refusal fails the same test (blocking).**
   - **What fails:** "package-security-audit.ts:38 fix names its field and accepted format", with `ReferenceError: name is not defined`.
   - **The fix:** in `apps/api/src/capabilities/package-security-audit.ts`, change only the third argument of the unpublished-version `inputRefusal` to exactly:
     `"Send 'version' as a version published for this package, or omit it to audit the latest release."`
   - The first argument may keep `${name}`.
4. **Nothing proves the detail catch rethrows our own defects (low).**
   - **Test:** in `package-audits.upstream-failures.test.ts`, make the `/v1/vulns/<id>` fetch throw `new RangeError("defect")`, and assert the audit call rejects.
   - **Second test:** a detail body larger than `MAX_FETCHED_API_RESPONSE_BYTES` gives that vulnerability `severity: "unknown"`, with "OSV vulnerability details" in `unavailable_sources`.
   - Confirm the first test fails when the catch is temporarily changed back to a bare `catch { detailsUnavailable = true; }`. Restore it with `git checkout HEAD -- <path>`. Never use `git stash`.

## Leave the rest alone

- Make no other change.
- Leave scoring, `osv-severity.ts`, the order of checks, manifests, prices, fixtures, other capabilities, the database, migrations and environment variables as they are.
- Do not add an overall time budget for the detail fetches; that is separate work.

## Verification to run

- **Build first:** `npm --workspace=packages/sdk-typescript run build` and `npm --workspace=packages/mcp-server run build`. Without the MCP build, two unrelated MCP 429 tests fail locally.
- **Full code suite:** `npm --workspace=apps/api run test:code`. It must show 0 failed. Report the counts.
- **Upstream-catch lint:** `npm --workspace=apps/api run lint:upstream-catches -- --base $(git merge-base origin/main HEAD)`.
- **Other checks:** `npm run typecheck`, `npm run env:check`, `npm run claims:check` and `npm run models:check`.

## Report

Write `docs/lanes/codex/security-audit-severity-3-report.md` with:
- the files changed;
- the tests added (names) and the fail-before result for each;
- the verification commands and their results, including the full-suite counts;
- anything not done, and why.
