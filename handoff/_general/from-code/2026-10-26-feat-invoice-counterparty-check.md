Intent: Build the approved invoice-counterparty-check evidence composite for portfolio 1C.3; production onboarding, authenticated sanctions verification and readiness remain for the orchestrator.

Full session, based on origin/main 737c10e5, branch feat/invoice-counterparty-check. Built by a Codex build agent in an isolated clone; the orchestrator committed, reviewed and opened the pull request. No production database write, credential search or package publication was performed.

## Implementation

- Added executor apps/api/src/capabilities/invoice-counterparty-check.ts and injected orchestration in apps/api/src/lib/invoice-counterparty/compose.ts.
- Added input validation and documented identifier mappings in input.ts; deterministic legal-name normalisation and one-pass VIES XML text decoding in name.ts.
- Extracted the existing read-only breaker peek to apps/api/src/lib/composite-breaker.ts, reused by both composites. It never changes open/half-open state; database-read failures still log and fail open.
- Extracted the unchanged tax format table into apps/api/src/lib/tax-id-formats.ts, reused by tax-id-validate and preflight validation. None of its current rules implements a checksum: the output explicitly says format_only outside EU VAT.
- Added manifests/invoice-counterparty-check.yaml: 75 cents, algorithmic, live-fetch, screening_signal. Category compliance: seed-kyb-solutions.ts uses compliance-verification, but validate-capability.ts and validateCapabilityStructure do not allow that category.
- Added mocked orchestration, actual sanctions-adapter contract and shared-breaker unit tests. No network in the new tests.

Only getExecutor is used for composition: it retains provider chains and manifest provenance. No billing or transaction calls occur inside the composite. The invoked slug alone is billed after successful completion. Required tax or sanctions failures throw sanitized structured errors; invalid VAT is completed evidence. Registry outages/errors remain per-check evidence. The registry's normalised status and insolvency block pass through. No overall verdict, risk level, score, recommendation or safe-to-pay field is emitted.

Sanctions name order is registry, VIES, invoice. Company entity_type and country are passed. The existing adapter does not send country to Dilisense; this is disclosed. Its actual match shape has name, entity_id, datasets, countries, sanction_details and last_updated_at, but no score. The composite retains those fields, full potential-match count, source-list attribution and an explicit ten-record truncation flag, without copying is_sanctioned as a verdict.

## Evidence and verification

Receipts: [verification](../../../archive/receipts/2026-10-26-test-run-invoice-counterparty-check-verification.json), [live tax/registry outputs](../../../archive/receipts/2026-10-26-check-invoice-counterparty-check-live.json).

- New tests: 105 passed (97 orchestration/input/mapping/name tests, one actual sanctions executor adapter-contract test, seven shared breaker tests).
- Focused run including company-status precedent: 376 passed, zero failed.
- Final full apps/api vitest: 5,612 passed, 321 skipped, zero failed (5,933 total). Skips are existing database-dependent integration suites; no disposable PostgreSQL was available.
- npx tsc --noEmit passed. Root npm run typecheck, MCP and SDK builds also passed.
- All 57 run commands in .github/workflows/ci.yml jobs.check, excluding npm ci already provided and npm test run separately above, passed. Exact commands, exit codes, available test counts, duration and log hashes are in the verification receipt and the table below. The separate disposable-DB CI job was not run.
- validateManifest and validateCapabilityStructure: zero errors/violations for the final manifest. Guaranteed-field consistency, cost-class coherence, claims and no-new-console were rerun after the final schema documentation update and passed.
- onboard.ts --dry-run passed manifest validation, then stopped AUTHORIZATION_UNAVAILABLE because its current implementation opens an operator-write handle even in dry-run. validate-capability.ts stopped because DATABASE_URL is required for its read-only handle. No database connection was supplied or fabricated.
- Readiness and smoke execution remain unverified; no ready:true claim is made.
- npm run context:generate was attempted and refused because the isolated clone is technically a primary Git worktree. No generator bypass or branch switch was used. The existing pre-commit hook regenerates the staged handoff/archive indexes and legacy-authority inventory; normal context:check/context:test passed.
- git diff --check passed.
- npm run handoff:check in the provided checkout failed with dirty (metadata prevents commit), branch (clone classified as trunk), ahead (feature tracks origin/main), and a pre-existing remote merged-branch finding. The prescribed push, branch switch and remote deletion conflict with the explicit build-agent boundary and were not performed. This is an unresolved environment/workflow gate, not a code/test failure.

## Live outputs

Actual read-only executor probes on 26 October 2026, 21:07 Swedish local time (CET). Full timestamps and provenance are in the live receipt. The harness loaded only the required executors and injected a closed read-only breaker; it did not bootstrap the database or use a Strale API key. Missing manifest provenance stamps in this minimal harness remain conservatively pending, rather than being strengthened.

```json
{"tax_id":"FI01120389","valid":true,"company_name":"Nokia Oyj","company_address":"c/oVero-osasto PL 226\n00045 NOKIA GROUP","source":"ec.europa.eu/taxation_customs/vies"}
{"country":"FI","identifier":"0112038-9","status":"active","company_name":"Nokia Oyj","registry":"PRH","insolvency":{"checked":false,"reason":"No official insolvency source is connected for FI."},"source":"avoindata.prh.fi"}
{"tax_id":"SE556042722001","valid":true,"company_name":"H &amp; M Hennes &amp; Mauritz AB","source":"ec.europa.eu/taxation_customs/vies"}
{"country":"NO","identifier":"923609016","status":"active","company_name":"EQUINOR ASA","insolvency":{"checked":true,"notices_found":0,"notices":[]},"source":"data.brreg.no"}
```

The H&M string is the existing VAT adapter's raw XML text; the new composite decodes it exactly once before comparison or sanctions screening. Nokia is the known-answer/health input. Its VIES and registry halves are confirmed live; its live sanctions response could not be checked without DILISENSE_API_KEY, and the fixture deliberately does not assert a zero fuzzy-match count.

Offline sanctions example from sanctions-contract.test.ts, using the actual sanctions-check executor with only its HTTP transport mocked (not a live screening result):

```json
{"status":"completed","source":"dilisense.com","screened_name":"Invoice Company Ltd","name_source":"company_name","potential_match_count":1,"matches":[{"name":"Potential Company Ltd","entity_id":"us_ofac_sdn","datasets":["us_ofac_sdn"],"countries":["fi"],"sanction_details":["Recorded source entry"],"last_updated_at":"2026-10-25"}],"matches_truncated":false}
```

The real executor filters out the fixture's separate PEP record and returns its source-list object and queried_at timestamp, which the composite also retains. No match score is invented.

## Mappings and sources

Every implemented mapping has an official-source URL in input.ts and a real-company-number unit test. Mapping an identifier never claims VAT validity or registration.

| Country | Mapping and real example | Official source / routing outcome |
|---|---|---|
| SE | SE + ten organisation digits + 01; Spotify SE556703748501 → 556703-7485; H&M SE556042722001 → 556042-7220 | [Skatteverket](https://www.skatteverket.se/foretag/moms/kopavarorochtjanster/inkopfranandraeulander/kopatjansterfranandraeulander). Personal identity numbers excluded. Swedish live registry was not probed without credentials. |
| FI | FI plus Business ID without hyphen; Nokia FI01120389 → 0112038-9 | [Vero](https://www.vero.fi/en/detailed-guidance/guidance/48090/vat-invoice-requirements/). Both halves confirmed live. |
| NO | NO + organisation number + MVA; Equinor NO923609016MVA → 923609016 | [Altinn](https://info.altinn.no/en/start-and-run-business/direct-and-indirect-taxes/indirect-taxes/value-added-tax/). Registry confirmed live; tax check here is format-only. |
| BE | Remove BE to obtain enterprise number; BNP Paribas Fortis BE0403199702 → 0403199702 | [FPS Economy](https://economie.fgov.be/en/themes/enterprises/starting-business/steps-starting-business/vat-identification). [Company example](https://app.easybanking.bnpparibasfortis.be/en/public/about-us/suppliers) confirms this real number. Mapping tested but company-status-check excludes BE, so registry remains not_available. |
| DK | No general VAT-to-CVR mapping implemented; DK24256790 is a real VAT example tested as unsupported for derivation | [Statistics Denmark](https://www.dst.dk/da/Statistik/dokumentation/Times/moduldata-for-arbejdsmarked/senr): SE administrative identifiers can differ from CVR. DK is outside company-status-check coverage anyway. |
| NL | No VAT-to-KVK mapping | [KVK](https://www.kvk.nl/en/starting/everything-you-need-to-know-about-the-vat-identification-number/). entity-resolve's VAT route searches by name; it is deliberately never called here. |

Other registry countries can be checked using an explicitly supplied company_id. That identifier is not independently linked to the tax ID; the manifest discloses this. No additional VAT mapping was assumed.

## Access, costs and review

No new upstream, fetch path, credential, provider-health probe or VENDOR_TERMS_RECORDS entry was added. Existing registry/VIES/sanctions executors are reused. Read existing vendor records and prohibited hosts; fetched official mapping pages and [Dilisense's actual terms](https://dilisense.com/en/terms), which describe machine-to-machine API access under a paid agreement. Existing Dilisense reseller agreement verification remains pending; this composite preserves that pending lane and makes no stronger rights claim.

external_cost_cents is explicitly 1 in the manifest: the existing platform's conservative Dilisense cost classification, plus zero for VIES/format checks and official registry identifier lookups. This is an estimate, not a newly verified private contract price. Existing onboard.ts does not consume a manifest external_cost_cents into generated test_suites; it uses cost_class to keep paid_prepaid suites unscheduled. The production operator must confirm generated-suite cost metadata/eligibility before enabling any scheduled tests. No pipeline or migration change was bundled into this capability.

The go skill was applied within the local-build boundary. No simplify skill is installed; a manual simplification/read-through retained the small injected composite and shared helpers. Independent technical and product contexts read REVIEW.md and reviewed the diff. Both reported GO after round 2. Findings fixed: valid Mexican national RFCs must not be mistaken for country prefixes; XML-escaped VIES names must be decoded before screening and string comparison. No open findings. No PR was opened.

## Fail-before verification

The safe mutation tool ran against the committed candidate in the writable clone: green baseline, deliberately broken implementation, failing regression, restored implementation, green regression, clean Git tree. All nine mutations were caught: required tax failure, required sanctions failure, validation before executor lookup, optional registry, no verdict, XML name decoding, screened-name priority, all identifier mappings and legal-form normalisation. Evidence: [mutation receipt](../../../archive/receipts/2026-10-26-test-run-invoice-counterparty-check-mutations.json). The later test-file change only corrects the Belgian example's company label; its number and assertions are unchanged.

## Remaining authorized production steps (orchestrator/operator only)

Run from an environment with the appropriate operator-write authority, read-only database handle, Dilisense key and registry credentials. --discover makes real paid calls and writes the database/manifest; do not combine it with --dry-run.

```bash
cd apps/api
npx tsx scripts/onboard.ts --discover --strict --manifest ../../manifests/invoice-counterparty-check.yaml
# Inspect generated expected_fields / reliability: optional fields must not become guaranteed.
npx tsx scripts/validate-capability.ts --slug invoice-counterparty-check
npx tsx scripts/smoke-test.ts --slug invoice-counterparty-check
curl --fail --silent --show-error -H "Authorization: Bearer $ADMIN_SECRET" "$STRALE_API_URL/v1/internal/onboarding/readiness?slug=invoice-counterparty-check"
```

Require ready:true with zero issues; inspect generated paid-suite costs/eligibility. Keep the new capability invisible and off x402 until its first green week. Confirm authenticated sanctions results, live full-composite behavior and the actual upstream tariff; do not claim a screening result from these mocked tests.

[BACKFILL] Journal summary for the orchestrator: implemented approved portfolio 1C.3 as evidence-only tax/registry/sanctions composite; offline checks and unauthenticated official tax/registry probes passed; production onboarding/readiness/authenticated screening remain. No external Journal write was performed in this local-build session.

## Root CI command results

| Command | Result | Tests reported by command |
|---|---|---|
| `npm --workspace=packages/mcp-server run build` | PASS (exit 0) | — |
| `npm --workspace=packages/sdk-typescript run build` | PASS (exit 0) | — |
| `npm run typecheck` | PASS (exit 0) | — |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS (exit 0) | — |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS (exit 0) | — |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS (exit 0) | — |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS (exit 0) | — |
| `npm --workspace=apps/api run lint:no-new-console` | PASS (exit 0) | — |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS (exit 0) | — |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS (exit 0) | — |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | PASS (exit 0) | — |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS (exit 0) | — |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS (exit 0) | — |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS (exit 0) | — |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS (exit 0) | — |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS (exit 0) | — |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS (exit 0) | — |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS (exit 0) | — |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS (exit 0) | — |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS (exit 0) | — |
| `node scripts/guard-production-write-access.mjs` | PASS (exit 0) | — |
| `npm run programs:check` | PASS (exit 0) | — |
| `npm run programs:test` | PASS (exit 0) | 30 |
| `npm run research:check` | PASS (exit 0) | — |
| `npm run research:test` | PASS (exit 0) | 31 |
| `npm run design:check` | PASS (exit 0) | — |
| `npm run design:test` | PASS (exit 0) | 84 |
| `npm run env:check` | PASS (exit 0) | — |
| `npm run env:test` | PASS (exit 0) | 24 |
| `npm run vendors:check` | PASS (exit 0) | — |
| `npm run vendors:test` | PASS (exit 0) | 78 |
| `npm run distribution:check` | PASS (exit 0) | — |
| `npm run distribution:test` | PASS (exit 0) | 15 |
| `npm run digest:shadow:test` | PASS (exit 0) | 20 |
| `npm run candidates:test` | PASS (exit 0) | 3 |
| `npm run protocols:check` | PASS (exit 0) | — |
| `npm run protocols:test` | PASS (exit 0) | 12 |
| `npm run protocols:coverage` | PASS (exit 0) | — |
| `npm run protocols:coverage:test` | PASS (exit 0) | 16 |
| `npm run scheduled:check` | PASS (exit 0) | — |
| `npm run scheduled:test` | PASS (exit 0) | 43 |
| `npm run scheduled:outcomes:test` | PASS (exit 0) | 24 |
| `npm run models:check` | PASS (exit 0) | — |
| `npm run models:test` | PASS (exit 0) | 14 |
| `npm run claims:check` | PASS (exit 0) | — |
| `npm run claims:test` | PASS (exit 0) | 18 |
| `npm run docs:check` | PASS (exit 0) | — |
| `npm run docs:test` | PASS (exit 0) | 6 |
| `node scripts/generate-archive-index.mjs --check (CI warning-only wrapper)` | PASS (exit 0) | — |
| `npm run archive:index:test` | PASS (exit 0) | 12 |
| `npm run receipts:check` | PASS (exit 0) | — |
| `npm run receipts:test` | PASS (exit 0) | 25 |
| `npm run migrations:check` | PASS (exit 0) | — |
| `npm run migrations:test` | PASS (exit 0) | 23 |
| `npm run handoff:test` | PASS (exit 0) | 46 |
| `npm run context:check` | PASS (exit 0) | — |
| `npm run context:test` | PASS (exit 0) | 180 |


## Round 2

Fixed B1 with identifier-agreement evidence/findings and separate sanctions evidence for differing VIES/registry names; all required screenings must complete before billing. Fixed B2 with checks_errored, partition assertions across the test harness, registry-incomplete findings and completed found:false evidence for no-record replies. Source names decode XML and remove control/format characters without hiding short or ZWNJ-containing hits. Added legal_form_differs/findings, the company-only/sole-trader limitation, sanitized warning categories and broader no-verdict coverage. The manifest documents the new fields and a conservative two-call cost of 2 cents. Verification: 143 invoice tests, 421 focused tests and 5,657 full API tests passed (321 DB-dependent skips); tsc, root typecheck and all 57 root CI checks passed. Tests-first verification exposed 29 failures against 784d6687; the receipt also records an intermediate run invalidated by overlapping edits and its clean frozen-source replacement. [Commands, counts and fail-before tests](../../../archive/receipts/2026-10-26-test-run-invoice-counterparty-check-round-2.json). Production validation/readiness and independent confirmation remain with the orchestrator; commands are above. Git metadata is read-only, so changes remain uncommitted; the handoff gate's dirty/branch/remote-merged-branch findings require actions forbidden to this build agent. [BACKFILL] Journal: Round 2 repair verified locally; no external write.
