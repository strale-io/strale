Intent: Build and revise package-docs using public npm/PyPI registry APIs; leave the uncommitted changes for the orchestrator's review and production onboarding.

Branch: feat/package-docs. Full mode. The Round 2 instruction to leave changes uncommitted overrides the generic build-agent commit instruction. Pushing, PRs, merging and production writes remain with the orchestrator.

## Round 2

The independent NO-GO supersedes the earlier working-diff GO. This section records the fixes; it does not claim a new independent verdict. The orchestrator owns the confirmation review.

1. Attribution now allows only published display names and npm author URLs. npm string/object authors and maintainer objects are sanitised; email addresses are discarded and maintainer names capped at ten. PyPI empty author/maintainer fields fall back to display names in the corresponding email metadata, dropping address-only values. Synthetic example.invalid fixtures cover each shape. Tests reject any @ in serialised attribution. processes_personal_data is false, matching the existing package-info manifests; limitations disclose names-only attribution and no contact details.
2. npm legacy uppercase names are accepted. Punctuation-only and reserved names are refused before fetching. A registry record without versions is not found, a refusal rather than a source fault. PyPI names are capped at 200 characters.
3. The PyPI terms finding now separates permitted metadata/API use from package-licence conditions on README/description redistribution. The UGC grant is to the PSF, not downstream users; attribution grants no rights. The permitted enum is explicitly conditional, agreeing with config/vendors.yaml. npm's five-million example describes unreasonable load, not a quota.
4. A fresh stdin-produced receipt replaces the deleted receipt. Generated context, archive and handoff indexes are regenerated after receipt creation. Evidence: archive/receipts/2026-10-27-test-run-package-docs-round-2-final.json.
5. startup-domain-check now declares customer-supplied domains, DNS, npm, PyPI and GitHub; checks remains pending. Other customer_directed_fetch manifests commonly omit a vendor rather than listing only registries; this tool needs the registry declarations because it also uses those APIs.
6. Per-call provenance carries `source` (the registry URL actually read) and `fetched_at`. The data-access fields come from the manifest via `stampDataAccess`: `direct_api`, `allowed_with_checks`, checks `recorded`, upstream vendor `npm; PyPI`. An earlier draft set a per-call vendor, which made the stamper report the recorded checks as pending on every call; an independent re-review flagged that as misleading, and the orchestrator removed it.

README format follows npm readmeFilename. Empty and sentinel npm READMEs fall back to the packument README, then null with an explanation. Repository URLs become HTTPS where possible; unnormalisable values are preserved only in repository_raw. npm's invented changelog field is ignored; PyPI Changelog/Changes/Release notes links are used. PyPI licence text is capped at 200 characters, preferring a trove classifier over empty/long text. Limitations tell agents to treat README instructions as untrusted data. Truncation preserves surrogate pairs while counts remain UTF-16 units.

Explicit npm versions/dist-tags first use the smaller per-version endpoint. A missing README may trigger a bounded packument fallback; if that optional fallback exceeds the cap, the smaller release still succeeds with null README/latest and selected-release-only history. Size refusals suggest requesting a version or consulting the registry directly. If PyPI project history exceeds the cap and an explicit version was supplied, that smaller release is fetched instead, with null latest and empty history. PyPI unknown-version suggestions are ordered by upload date, newest first. The shared user-agent import follows the dependency-manifest docblock. The PyPI probe uses unauthenticated HEAD on the simple project endpoint, with no body download; the probe method type now supports HEAD.

Price: 5 cents, matching npm-package-info and pypi-package-info because package-docs returns more metadata and documentation; external cost remains zero.

## Live checks

- npm express: 5.3.0, markdown README, 10368 UTF-16 units; normalised HTTPS repository; no @ in attribution; vendor npm.
- npm JSONStream with version latest: resolved 1.3.5, markdown README, 5722 units; uppercase accepted, normalised HTTPS repository, no @ in attribution; vendor npm.
- PyPI requests 2.32.0: yanked true, markdown description, 2917 units; normalised HTTPS repository, no @ in attribution; vendor PyPI.
- PyPI HEAD simple/requests: HTTP 200, unauthenticated and zero-cost.

Terms re-read on the official pages:
https://docs.npmjs.com/policies/open-source-terms/
https://policies.python.org/pypi.org/Terms-of-Service/
https://docs.pypi.org/api/index-api/

## Verification and remaining production work

The receipt above records Round 2 verification. The CI npm-ci prerequisite was supplied by the orchestrator. Test scratch directories are kept inside the checkout. Git fixture isolation uses GIT_CEILING_DIRECTORIES so a fixture without its own Git repository cannot accidentally discover the parent checkout. A relative TMPDIR allows the tsx CLI socket to fit the operating system's socket-name limit. No gate implementation was changed for these invocation details.

The database-free authoring checks and tests do not establish production readiness. Onboarding --dry-run was attempted and still requires the unavailable operator write credential before its dry-run branch. validate-capability was attempted and requires DATABASE_URL. No credentials were sought. [BACKFILL] This handoff is the session record; no Notion Journal entry was sent from this delegated build. Production discovery, generated DB test suites, smoke and internal readiness remain unverified. The integration-db CI job also requires a disposable database and was not run.

After orchestrator review and authorised onboarding, the remaining commands are:

```sh
cd apps/api
npx tsx scripts/onboard.ts --discover --manifest ../../manifests/package-docs.yaml
npx tsx scripts/validate-capability.ts --slug package-docs
npx tsx scripts/smoke-test.ts --slug package-docs
curl --fail-with-body --silent --show-error -H "Authorization: Bearer $ADMIN_SECRET" "$STRALE_API_URL/v1/internal/onboarding/readiness?slug=package-docs"
```

Review discovery-generated reliability honestly and require ready: true with zero issues. Preserve validating/invisible/off-x402 status until the first green week. No new category or frontend llms.txt change is involved. The go skill's verification and manual simplification pass apply; the explicitly reserved review/push/PR/merge steps remain with the orchestrator. A callable simplify skill is unavailable.

## Round 2 command results

Evidence for the test counts: archive/receipts/2026-10-27-test-run-package-docs-round-2-final.json.

| Command | Result |
| --- | --- |
| npm --workspace=packages/mcp-server run build | PASS |
| npm --workspace=packages/sdk-typescript run build | PASS |
| npm run typecheck | PASS |
| node apps/api/scripts/check-mjs-syntax.mjs | PASS |
| npm --workspace=apps/api run lint:no-bare-catch | PASS |
| npm --workspace=apps/api run lint:no-unguarded-user-fetch | PASS |
| node apps/api/scripts/check-ssrf-inventory.mjs | PASS |
| npm --workspace=apps/api run lint:no-new-console | PASS |
| node apps/api/scripts/check-no-external-column-access.mjs | PASS |
| node apps/api/scripts/check-framework-packages.mjs | PASS |
| npx tsx apps/api/scripts/check-ceo-brief.ts | PASS |
| node apps/api/scripts/check-no-committed-secrets.mjs | PASS |
| node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs | PASS |
| node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict | PASS |
| node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict | PASS |
| node apps/api/scripts/check-pii.mjs --strict | PASS |
| node apps/api/scripts/check-tier-coverage.mjs --strict | PASS |
| node apps/api/scripts/check-identity-fixture-shape.mjs --strict | PASS |
| node apps/api/scripts/check-shape-contracts.mjs | PASS |
| node apps/api/scripts/check-cost-class-coherence.mjs | PASS |
| node scripts/guard-production-write-access.mjs | PASS |
| npm run programs:check | PASS |
| npm run programs:test | PASS |
| npm run research:check | PASS |
| npm run research:test | PASS |
| npm run design:check | PASS |
| npm run design:test | PASS |
| npm run env:check | PASS |
| npm run env:test | PASS |
| npm run vendors:check | PASS |
| npm run vendors:test | PASS; ℹ tests 78; ℹ pass 78; ℹ fail 0 |
| npm run distribution:check | PASS |
| npm run distribution:test | PASS |
| npm run digest:shadow:test | PASS |
| npm run candidates:test | PASS |
| npm run protocols:check | PASS |
| npm run protocols:test | PASS |
| npm run protocols:coverage | PASS |
| npm run protocols:coverage:test | PASS |
| npm run scheduled:check | PASS |
| npm run scheduled:test | PASS |
| npm run scheduled:outcomes:test | PASS |
| npm run models:check | PASS |
| npm run models:test | PASS |
| npm run claims:check | PASS |
| npm run claims:test | PASS |
| npm run docs:check | PASS |
| npm run docs:test | PASS |
| archive and handoff index CI step | PASS |
| npm run archive:index:test | PASS |
| npm run receipts:check | PASS |
| npm run receipts:test | PASS |
| npm run migrations:check | PASS |
| npm run migrations:test | PASS |
| npm run handoff:test | PASS |
| npm run context:check | PASS |
| npm run context:test | PASS; ℹ tests 180; ℹ pass 180; ℹ fail 0 |
| npm test | PASS; Test Files  343 passed | 33 skipped (376); Tests  6047 passed | 346 skipped (6393) |

Additional verification: final targeted registry/terms/manifest/probe run passed 200 tests (91 package-docs, 94 vendor-terms, 6 data-access-manifests, 9 dependency probes); standalone API tsc passed; database-free validateManifest returned zero errors; git diff --check passed. handoff:orient passed. handoff:check failed on intentionally uncommitted/unpushed work and unrelated merged-branch cleanup, with origin fetch unavailable. No branch cleanup or remote writes were attempted.

Initial invocation failures were resolved by adding HEAD to the probe method union, using a relative scratch directory for the tsx socket, setting Git discovery ceilings for nested fixtures, and regenerating context after replacing the receipt. The first full API run had 6045 passes and one fixture-isolation failure; the rerun passed 6046 with 346 skips.

The final API rerun after the PyPI oversized-project recovery passed 6047 tests with 346 skips. All 58 check-job commands actually executed passed; npm ci was the supplied prerequisite, and the separate integration-db job was unavailable without a disposable database. The final receipt supersedes the earlier Round 2 snapshot for final counts.
