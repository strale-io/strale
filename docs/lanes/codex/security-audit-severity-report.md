# Security audit severity report

## Files changed

- `apps/api/src/lib/osv-severity.ts` — shared named-severity and FIRST CVSS v3.x base-score parser.
- `apps/api/src/lib/osv-severity.test.ts` — direct unit coverage for the required CVSS vectors, malformed input and named ratings.
- `apps/api/src/capabilities/dependency-audit.ts` — bounded OSV advisory hydration, honest unknown ratings, removed-package malware checks, latest-version PyPI checks, and explicit unchecked/refusal behavior.
- `apps/api/src/capabilities/package-security-audit.ts` — shared severity ratings, unknown counts and penalty, and unpublished-version refusal before OSV/deps.dev.
- `apps/api/src/capabilities/package-audits.upstream-failures.test.ts` — end-to-end regressions for both executors.
- `manifests/dependency-audit.yaml` and `manifests/package-security-audit.yaml` — reliability declarations and severity limitations.
- `docs/lanes/codex/security-audit-severity-report.md` — this implementation and verification record.

## Tests added

- `OSV severity > scores ...` (four required known CVSS v3.0/v3.1 scores)
- `OSV severity > returns unknown for malformed and CVSS v4-only vectors`
- `OSV severity > prefers the advisory's case-insensitive named rating`
- `security-audit-severity brief regressions > hydrates dependency advisories with named severity`
- `security-audit-severity brief regressions > hydrates dependency advisories with CVSS vector`
- `security-audit-severity brief regressions > keeps a failed advisory detail fetch as unknown and names the degraded source`
- `security-audit-severity brief regressions > queries a removed npm package and prioritises its malicious advisory`
- `security-audit-severity brief regressions > checks an unpinned PyPI requirement at the registry latest version`
- `security-audit-severity brief regressions > refuses an entirely unchecked dependency list`
- `security-audit-severity brief regressions > throws upstream-unavailable when an entirely unchecked list lost its registry answer`
- `security-audit-severity brief regressions > counts GHSA MODERATE as medium and unrated advisories as unknown with equal penalties`
- `security-audit-severity brief regressions > refuses an unpublished explicit version before calling OSV`

## Existing tests changed

- `package-security-audit: secondary legs are marked, never clean (row 7) > keeps the real negative...` now expects `unknown: 0`; the brief makes unknown a guaranteed, separately counted result rather than folding it into low.
- `dependency-audit: registry failures are marked, never clean (row 8) > keeps the real negative...` now expects the declared-version npm 404 dependency to be included in the two OSV queries; the brief requires removed packages to reach OSV so `MAL-` advisories remain visible.

Both changed expectations have a one-line comment naming the security-audit-severity brief.

## Verification

- `npm --workspace=apps/api exec vitest run src/lib/osv-severity.test.ts src/capabilities/package-audits.upstream-failures.test.ts` — passed: 2 files, 41 tests. This is the narrower permitted set covering both touched capability executors; the full capability directory was not needed.
- `npm run typecheck` — passed after building the local TypeScript SDK artifact with `npm run build --workspace=packages/sdk-typescript` (the first run could not resolve the unbuilt local `straleio` package from the LangChain workspace).
- `npm run models:check` — passed.
- `npm run claims:check` — passed.
- `git diff --check` — passed.

## Not done

- `validate-capability.ts`, capability readiness and smoke tests were not run because the brief explicitly assigns those database-dependent checks to the review session.
- No routing, billing, circuit-breaker, database, migration, environment-variable, price or fixture-input changes were made.
