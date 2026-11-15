Intent: Codex builder brief: review and CI fixes for security-audit-severity (round 2).

# Brief: security-audit-severity review and CI fixes

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-15.
  - This brief follows an independent review of `codex/security-audit-severity` at 39022b8a. The verdict was GO with findings.
  - It also follows a red `check` job on that commit, in strale-io/strale#1063.
- **Branch:** push only `codex/security-audit-severity-2`. It starts from `codex/security-audit-severity`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. All tests run offline with `fetch` stubbed, like the existing ones.
- **Read first:**
  - `docs/lanes/codex/security-audit-severity-brief.md` (the original brief);
  - `docs/lanes/codex/security-audit-severity-report.md` (your report);
  - the diff `git diff origin/main...HEAD`;
  - `apps/api/scripts/check-upstream-catches.mjs` (the CI guard that failed).

## Fix these

1. **CI is red: the new detail-fetch catch is unexplained.**
   - **What fails:** `npm --workspace=apps/api run lint:upstream-catches` fails with `NEW_SILENT_CATCH apps/api/src/capabilities/dependency-audit.ts`. The cause is the bare `catch { detailsUnavailable = true; }` in the OSV advisory-detail loop.
   - **Why the behaviour is right:** that catch is a genuine degraded marker. The flag puts "OSV vulnerability details" into `unavailable_sources`, and each vulnerability whose detail did not arrive reads `severity: "unknown"`, never low or clean. Keep the behaviour.
   - **What else is wrong:** the bare catch also swallows errors that are not upstream failures, such as our own defects. The rest of this file avoids that with `transportFailure()`.
   - **The fix:** in `apps/api/src/capabilities/dependency-audit.ts` only.
     - Directly below `const OSV = "OSV vulnerability database";` add `const OSV_DETAILS = "OSV vulnerability details";`. Use it in place of the literal `"OSV vulnerability details"` strings in the `unavailable_sources` spreads of `auditNpm` and `auditPypi`.
     - Replace the detail-loop handler `} catch { detailsUnavailable = true; }` with:
       ```ts
       } catch (err) {
         // degraded-ok: an OSV detail fetch that times out, fails on the network or returns a body that does not parse leaves that vulnerability listed with severity "unknown" and names "OSV vulnerability details" in unavailable_sources, never as rated or absent; any other error (our own defect) is rethrown, unbilled.
         const failure = transportFailure(OSV_DETAILS, err);
         if (!(failure instanceof UpstreamUnavailableError)) throw failure;
         detailsUnavailable = true;
       }
       ```
     - The `// degraded-ok:` line must be the first line inside the catch block, because that is where the guard reads it.
   - **Test:** stub `/v1/vulns/<id>` to answer 200 with a body that does not parse. Expect that vulnerability's `severity: "unknown"` and `unavailable_sources` to contain "OSV vulnerability details". It must fail on `origin/main`'s `dependency-audit.ts`.
   - **Do not** add anything to the guard's baseline.
   - **Check:** run the lint command above with `--base $(git merge-base origin/main HEAD)` as CI does, and show it passing in the report.
2. **One new test does not fail on main.**
   - **The problem:** "throws upstream-unavailable when an entirely unchecked list lost its registry answer" passes on `origin/main`, because main already threw when every lookup failed.
   - **The test to add:** the case that changed. A dependency list where neither dependency has a version, one registry lookup 404s and the other answers 503. Assert that it throws `UpstreamUnavailableError`. Main billed this as an empty audit.
   - Keep the existing test; it still guards the order of the two checks.
   - Confirm the new test fails with `dependency-audit.ts` taken from `origin/main`, using `git checkout origin/main -- <path>`. Restore it with `git checkout HEAD -- <path>`. Never use `git stash`.
3. **`osv-severity.ts` can still read odd data as low.**
   - **What breaks:** metric values are looked up on plain objects, so `AV:constructor` or `AV:toString` resolves to a built-in. The score becomes NaN, and NaN falls through to `"low"`. A repeated metric is also accepted, with the last one winning.
   - **The fix:**
     - use own-property lookups (`Object.hasOwn`) or `Map`s for the weight tables and for the parsed metrics;
     - refuse a vector that names a metric twice (return `null`);
     - return `null` from `cvssV3BaseScore` whenever the result is not a finite number.
   - **Tests:** add vectors with `AV:constructor`, `AV:toString` and a duplicated `AV` metric. Each must give a `null` score and an `"unknown"` rating. Each must fail before the fix.
4. **A PyPI dependency with no latest version reads as checked.**
   - **What breaks:** in `auditPypi`, an unpinned requirement whose PyPI answer has no `info.version` gets the version `"unknown"`. `isQueryable` then keeps it out of OSV, but `checked` is computed from `osvQueries` membership, so it reads checked, with 0 vulnerabilities and up to date.
   - **The fix:** derive `checked` from whether the dependency was actually sent to OSV, `osvQueries.some((q) => q.name === r.name && isQueryable(q))`, in both the npm and PyPI paths.
   - **Test:** a mixed PyPI list where one unpinned requirement's PyPI answer lacks `info.version` and the other is pinned. Assert `checked: false` on the first and `summary.unchecked` equal to 1. It must fail before the fix.
5. **The docs still describe the old `unavailable_sources`.**
   - **Where:** the `unavailable_sources` description in `manifests/dependency-audit.yaml`, and the code comments in `dependency-audit.ts` that say it is present only when a registry lookup failed.
   - **The fix:** say it can also name "OSV vulnerability details", when some advisory details could not be fetched.

## Leave the rest alone

- `highestSeverity` ranks unknown below low, as the original brief says. Do not change that.
- No change to prices, categories, fixture inputs, routing, billing, the circuit breaker, the database, migrations or environment variables.
- No change to any other capability.

## Verification to run

- `npm --workspace=apps/api exec vitest run src/lib/osv-severity.test.ts src/capabilities/package-audits.upstream-failures.test.ts`
- `npm --workspace=apps/api run lint:upstream-catches`, with the base as above
- `npm run typecheck`. Build `packages/sdk-typescript` and `packages/mcp-server` first if their artifacts are missing.
- `npm run claims:check` and `npm run models:check`

## Report

Write `docs/lanes/codex/security-audit-severity-2-report.md` with:
- files changed;
- tests added (names) and the fail-before result for each;
- the verification commands and their results;
- anything not done, and why.
