# Billed wrong answers: four tools — implementation report

## Files changed

- `apps/api/src/capabilities/eori-validate.ts` — refuses Great Britain (`GB`) EORI numbers before any EU-service request and directs callers to HMRC.
- `apps/api/src/capabilities/holiday-calendar.ts` — validates that parsed Nager.Date responses are arrays of objects with string `date` fields before caching them.
- `apps/api/src/capabilities/github-repo-analyze.ts` — obtains the preferred README through GitHub's README API with the raw media type, shared authentication headers, and the existing size limit.
- `apps/api/src/capabilities/startup-domain-check.ts` — confirms DNS NXDOMAIN results through registry RDAP and represents unanswered RDAP checks as unchecked.
- `manifests/eori-validate.yaml` and `manifests/startup-domain-check.yaml` — document the GB EORI and DNS-plus-RDAP limitations.
- `config/env-manifest.yaml` — records `github-repo-analyze` as an optional existing `GITHUB_TOKEN` consumer.
- `apps/api/src/capabilities/business-day-eori.upstream-failures.test.ts`, `holiday-calendar.test.ts`, `web-and-lookup.upstream-failures.test.ts`, and `registry-body-caps.test.ts` — regression coverage and fixture adjustments for the corrected behavior.

## Tests added

- **eori-validate: service failures throw (row 19) › refuses a GB EORI before the EU service, while XI still reaches it**
- **holiday-calendar › a 200 object is an upstream shape failure and is not cached**
- **holiday-calendar › an empty holiday list is a real answer and is cached**
- **public-holiday-lookup (shares getHolidays) › a non-list 200 throws instead of answering with no holidays**
- **github-repo-analyze negative: what GitHub says is absent keeps its output › uses GitHub's preferred README endpoint with the raw media type**
- **startup-domain-check negative: answers that were given keep their output › NXDOMAIN plus RDAP found is taken without a website probe**
- **startup-domain-check negative: answers that were given keep their output › NXDOMAIN plus an RDAP failure is unchecked and names RDAP**
- **startup-domain-check negative: answers that were given keep their output › NXDOMAIN with no RDAP base is unchecked and names RDAP**
- The existing NXDOMAIN availability test also exercises RDAP `not_found`, and the existing resolving-domain test now asserts that RDAP is not called.

## Existing tests changed

- Renamed the NXDOMAIN availability case to state that RDAP `not_found` is now required and added the brief-required one-line comment; NXDOMAIN alone is no longer enough to encode availability.
- Updated GitHub README URL matchers from raw `/README.md` to API `/readme`, because the implementation now uses GitHub's preferred-README endpoint.
- Updated repository body-cap setup/comments so the API README response, rather than raw `README.md`, exercises the unchanged 256 KiB cap.
- Updated two holiday parse-error message expectations to the new structured `UpstreamUnavailableError` wording. Their behavior remains an uncached, unbilled upstream failure.

## Verification

- `npm --workspace=apps/api exec vitest run src/capabilities/business-day-eori.upstream-failures.test.ts src/capabilities/holiday-calendar.test.ts src/capabilities/web-and-lookup.upstream-failures.test.ts src/capabilities/registry-body-caps.test.ts` — passed: 4 files, 172 tests.
- `npm run typecheck` — initially exposed that the SDK build artifact was absent after dependency installation; after `npm --workspace=packages/sdk-typescript run build`, the requested command passed across all workspaces.
- `npm run claims:check` — passed: claims register contract.
- `npm run env:check` — passed: 138 environment reads checked against 143 manifest rows.

## Independent review

- The technical and product lens review found zero high-severity issues.
- Its two medium findings (RDAP missing from provenance/source metadata and the existing GitHub token's consumer list being stale) were fixed before commit.
- Its low suggestion for direct missing-RDAP-base coverage was also implemented.

## Not done

- Per the brief, I did not run `validate-capability.ts`, readiness checks, or smoke tests because they require database-backed review-session infrastructure.
- No HMRC integration, caching, price/category/routing/billing/breaker/database changes, migrations, new environment variables, or changes to dependency-audit/package-security-audit were made.
- The first plain `npm install` was blocked while `c2pa-node` attempted to download test certificates in the network-restricted environment. `npm install --ignore-scripts` installed the existing lockfile dependencies for offline verification; no dependency or lockfile change is included.
