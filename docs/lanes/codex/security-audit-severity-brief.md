Intent: Codex builder brief: the two paid security-audit capabilities stop selling "low" for vulnerabilities nobody rated, and stop selling a clean audit for packages nobody checked.

# Brief: dependency-audit and package-security-audit rate severity from the real advisory and never bill an unchecked package as clean

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-15. Founder go-ahead in session the same day.
  - Source: promise-audit T1 in `docs/programs/promise-audit/tracks.yaml`, the "Pre-existing defects found in the wave 2a review, not fixed there" list. The master re-checked each defect against `origin/main` at 842ca71a and found two more (items 5 and 6 below).
- **Branch:** push only `codex/security-audit-severity`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets and no production data. All tests are offline vitest unit tests with `fetch` stubbed, like the existing ones.
- **Read first:**
  - `apps/api/src/capabilities/dependency-audit.ts` (the header comment, `batchCveCheck`, `requireSomeAnswer`, `getHighestSeverity`, `auditNpm`, `auditPypi`);
  - `apps/api/src/capabilities/package-security-audit.ts` (the handler, `fetchOsv`, `extractSeverity`, the risk score);
  - their existing tests (`rg -l "dependency-audit|package-security-audit" apps/api/src --glob '*.test.ts'`);
  - `apps/api/src/lib/upstream-result.ts` and `apps/api/src/lib/capability-refusal.ts` (`inputRefusal`), for how an upstream failure and a caller mistake are thrown;
  - `manifests/dependency-audit.yaml` and `manifests/package-security-audit.yaml`.

## Why

Both capabilities are paid, and both currently charge for answers that are wrong in the customer's favourite direction: "nothing serious here".

1. **dependency-audit rates every vulnerability "low".** It uses OSV's `POST /v1/querybatch`, which answers each vulnerability with only `id` and `modified`. There is no `severity`, `summary` or `aliases`, so `getHighestSeverity` falls through to `"low"`, and `summary` and `aliases` are empty. A critical CVE is sold as low.
2. **Even with full records, the CVSS parse is wrong.** OSV's `severity[].score` is a CVSS vector string such as `CVSS:3.1/AV:N/AC:L/...`, not a number. `parseFloat` on it gives `NaN`, which is never `>= 4`, so the answer is still `"low"`.
3. **A package the npm registry answers 404 for never reaches OSV.** The `osvQueries` filter drops every dependency with an `error` unless it is `unavailable`. Malicious packages that npm removed are exactly the ones that 404, and OSV holds `MAL-` advisories for them. They are billed as 0 vulnerabilities.
4. **An unpinned PyPI requirement is never checked**, yet its zero count reads as clean. If every dependency is a 404 or unavailable and nothing is queryable, the call bills an empty audit (the `requireSomeAnswer` edge).
5. **package-security-audit misreads GitHub's severity word.** `database_specific.severity` from GHSA is `CRITICAL`, `HIGH`, `MODERATE` or `LOW`. The code checks for `MEDIUM`, so every `MODERATE` advisory is counted as low. Its CVSS fallback has the same `parseFloat` bug as item 2 (`"CVSS:3.1".split("/")[0]` is `"CVSS:3.1"`), and an `UNKNOWN` severity is counted as low.
6. **package-security-audit bills a version that does not exist.** An explicit `version` that the registry has never published gets `{}` from OSV, the real "no known vulnerability" answer for a real version, and is billed as a low-risk package.

## What to change

### 1. One shared severity helper

Add `apps/api/src/lib/osv-severity.ts`, used by both capabilities, which returns `"critical" | "high" | "medium" | "low" | "unknown"` for one full OSV record:

- **First, `database_specific.severity`** when it is a string: `CRITICAL` → critical, `HIGH` → high, `MODERATE` or `MEDIUM` → medium, `LOW` → low, case-insensitive. Anything else falls through.
- **Then a `CVSS_V3` vector** in `severity[]`: compute the CVSS v3.x base score from the vector with the published FIRST 3.1 formula, and bucket it: 9.0 and up critical, 7.0 to 8.9 high, 4.0 to 6.9 medium, 0.1 to 3.9 low, 0.0 low. Write the formula in the helper. Add **no new dependency**. A malformed vector falls through.
- **Otherwise `"unknown"`**, including for a `CVSS_V4`-only record. Never default to `"low"`.

Unit-test the helper with at least these vectors and their known base scores:
- `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = 9.8, critical;
- `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N` = 6.1, medium;
- `CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N` = 1.8, low;
- `CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H` = 10.0, critical;
- one malformed vector, which gives unknown.

### 2. dependency-audit fetches the full advisory

- **Fetch full records.** After `querybatch`, collect the distinct vulnerability ids and fetch each with `GET https://api.osv.dev/v1/vulns/{id}`. Bound it:
  - at most 100 distinct ids per call;
  - at most 8 requests in flight;
  - each request with its own `AbortSignal.timeout(8000)`.
- **Ids over the cap, or a failed detail fetch:** that vulnerability keeps its id, gets `severity: "unknown"`, and OSV vulnerability details is named in `unavailable_sources`. The call does not fail. The vulnerability was found, only its rating is missing, and "unknown" says so honestly.
- **Per-vulnerability output:** each entry in `vulnerabilities` gains `severity`, and `summary` and `aliases` come from the full record.
- **`highest_severity`:** the highest rated severity among a dependency's vulnerabilities, or `"unknown"` when it has vulnerabilities and none is rated. It stays `null` when there are none. Delete `getHighestSeverity` and use the helper. No dead copy remains.

### 3. dependency-audit checks what it can, and says what it could not

- **npm:** a dependency whose registry lookup answered 404 or 410 and that declares a version still goes to OSV with that version. When OSV returns any advisory whose id starts with `MAL-` for a dependency, set `malicious: true` on it and list it first in `critical_updates`, as `<name> (malicious package advisory)`.
- **PyPI:** an unpinned requirement whose registry lookup answered is checked against the latest version the registry reports. It gains `checked_version: <latest>` and `version_source: "latest"`, because that is what `pip install` would fetch. A pinned one gains `version_source: "declared"`.
- **Unchecked dependencies:** a dependency that reached no OSV query (no version, and no registry answer to take one from) gains `checked: false`. The output's `summary` gains `unchecked: <count>`, for both ecosystems. Do not count an unchecked dependency as up to date.
- **Nothing checked:** replace `requireSomeAnswer` with a single rule, applied after the OSV queries are built. If no dependency was sent to OSV:
  - throw `UpstreamUnavailableError` when at least one registry lookup was `unavailable`, since a retry may succeed;
  - otherwise throw `inputRefusal`, saying that none of the dependencies could be checked (no versions declared and no registry answer), naming the field.

  Either way, nothing is billed for an audit that audited nothing.
- **Header comment:** update it to say this. Remove the sentence that records the unpinned case as unchecked.

### 4. package-security-audit

- **Severity:** `extractSeverity` is replaced by the shared helper. The result counts gain `unknown`. An unknown vulnerability is never counted as `low`.
- **Risk score:** an unknown vulnerability costs the same as a medium one (8 points, inside the existing medium cap of 16). The reason: a vulnerability exists and nobody has said it is minor. Put that reason in a comment.
- **Version that does not exist:** when the caller passes an explicit `version` and the registry data shows it was never published (it is absent from the version list the registry fetch already returns), throw `inputRefusal` naming `version` and saying it is not a published version of the package. Do it before any OSV or deps.dev call. When `version` is omitted, the latest-version path is unchanged.

### 5. Manifests

In `manifests/dependency-audit.yaml` and `manifests/package-security-audit.yaml`:
- add the new output fields to `output_field_reliability`:
  - `severity` on each vulnerability: guaranteed;
  - `malicious`, `checked`, `checked_version`, `version_source`: rare;
  - `summary.unchecked`: guaranteed;
  - `vulnerabilities.unknown` on package-security-audit: guaranteed;
- add one limitation each: "Severity is read from the advisory's own rating or its CVSS 3.x vector; an advisory with neither (including CVSS 4.0-only advisories) is reported as unknown."

Do not change `price_cents`, the category or any test fixture input.

### 6. Leave the rest alone

- No change to any other capability, to routing, billing, the circuit breaker or the database.
- No migration and no new environment variable.

## Tests

Every new test must fail against `origin/main`:

1. A querybatch answer with id only, plus a stubbed `/v1/vulns/{id}` carrying `database_specific.severity: "CRITICAL"`: `highest_severity` is `critical`, and `summary` and `aliases` are filled.
2. The same with a CVSS 3.1 vector only, scoring 9.8: critical.
3. A failed detail fetch: that vulnerability has `severity: "unknown"`, `unavailable_sources` names OSV vulnerability details, and the call still answers.
4. An npm dependency that 404s with a declared version and an OSV `MAL-` advisory: it is queried, `malicious: true`, and first in `critical_updates`.
5. An unpinned PyPI requirement: it is checked at the registry's latest version, with `version_source: "latest"`.
6. All dependencies 404 with no version: `inputRefusal`. All dependencies unavailable with no version: `UpstreamUnavailableError`. Neither returns output.
7. package-security-audit with a GHSA `MODERATE` advisory: counted as medium, not low.
8. package-security-audit with an explicit version that is not in the registry's version list: `inputRefusal`, and OSV is never called (assert on the fetch stub).
9. package-security-audit with an unrated advisory: counted as `unknown`, and the risk score drops by 8.

Existing tests whose expectation encodes the old wrong answer, for example an assertion that a vulnerability reads `"low"` with no rating, may change. Each change gets a one-line comment naming this brief. Any other existing test that fails is a defect in the implementation: stop and say so in the report.

## Verification to run

- `npm --workspace=apps/api exec vitest run src/lib/osv-severity.test.ts src/capabilities` (or the narrower set of the touched test files, if the whole directory needs a database you do not have; say which)
- `npm run typecheck`
- `npm run models:check` and `npm run claims:check`

Not yours to run: `validate-capability.ts`, the readiness check and the smoke test. They need the database, and the review session runs them.

## Report

Write `docs/lanes/codex/security-audit-severity-report.md` with: files changed, tests added (names), the verification commands and their results, every existing test you changed and why, and anything not done and why.
