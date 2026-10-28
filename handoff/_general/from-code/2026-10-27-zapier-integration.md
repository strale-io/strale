Intent: Build Distribution D5 as a real Zapier CLI integration with fixed business jobs, API-key authentication, offline tests and a reusable job module. Leave changes uncommitted and unpushed for the orchestrator; account creation, registration, uploads, private live testing and publication remain.

# Built

`packages/zapier-strale` is an official `zapier-platform-core` app using
`defineApp` and `defineCreate`. Core and CLI are pinned to `19.2.1`, as
reported by npm on 2026-10-27. The `zapier-strale/jobs` export contains the
platform-independent definitions and explicit mappings for later n8n and
Sheets adapters. There is no arbitrary-slug action.

| Action | Tools | Hidden |
|---|---|---|
| Look Up a Company | `uk-company-data`, `swedish-company-data`, `norwegian-company-data`, `finnish-company-data` | No |
| Check Company Status | `company-status-check` | Yes |
| Check an EU VAT Number | `vat-validate` | No |
| Screen a Name | `sanctions-check` then `pep-check` | No |
| Check an Invoice Issuer | `invoice-counterparty-check` | Yes |

Company lookup accepts GB/UK, SE, NO and FI; names are supported for GB, NO
and FI, while SE requires a registration number. Screen a Name screens a
person; PEP evidence concerns people. Country is context, not a vendor match
filter. Do not infer identity from potential matches. Outputs preserve
source evidence and null/empty missing fields. Structured match/list evidence
is exposed in separately named JSON-string fields. No match score is invented.

The selected invoice primitive returns per-check evidence, not the draft's
AI-generated bundle summary. Listing copy was narrowed accordingly, formatted
to Zapier's current listing rules and checked against `claims.yaml`. The README
contains the two requested starter Zaps as text only. No monthly name-screening
template or finance/compliance-team targeting was added.

The distribution registry has a `built` row (not published), with that status
added to its schema. CI runs the package's `npm test` and a planted-failure
integrity-gate test. The framework gate requires the Zapier import plus native
app/action definitions with auth, perform, inputs and outputs.

# Public GET checks (2026-10-27)

Only unauthenticated GETs were made; no API key or paid execution was used.

| URL suffix on `https://api.strale.io` | HTTP / trimmed output |
|---|---|
| `/v1/capabilities/uk-company-data` | 200; `slug: uk-company-data` |
| `/v1/capabilities/swedish-company-data` | 200; `slug: swedish-company-data` |
| `/v1/capabilities/norwegian-company-data` | 200; `slug: norwegian-company-data` |
| `/v1/capabilities/finnish-company-data` | 200; `slug: finnish-company-data` |
| `/v1/capabilities/vat-validate` | 200; `slug: vat-validate` |
| `/v1/capabilities/sanctions-check` | 200; `slug: sanctions-check` |
| `/v1/capabilities/pep-check` | 200; `slug: pep-check` |
| `/v1/capabilities/company-status-check` | 404; `error_code: not_found` |
| `/v1/capabilities/entity-resolve` | 404; `error_code: not_found` |
| `/v1/capabilities/invoice-counterparty-check` | 404; `error_code: not_found` |
| `/v1/capabilities/danish-company-data` | 404; excluded from lookup choices |
| `/v1/solutions/invoice-verify-se` | 200; solution `price_cents: 250` |
| `/v1/capabilities/se-company-data` | 404; exploratory alias, not used |
| `/v1/capabilities/invoice-verify` | 404; exploratory capability lookup, not used |

The live invoice bundle is a different operation with broader inputs and an
AI summary. This build deliberately implements the requested invoice primitive
with fixed manifest mappings and hides it until public, rather than silently
substituting a bundle with different billing and output semantics. No capability
was created, changed or onboarded. No production DB command is required by this
integration. The separately owned capability onboarding must finish before
unhiding status and invoice actions. Recheck all public GETs before uploading.

# Authentication, errors and execution

Custom auth stores the user's API key in Zapier's password field. The auth test
is `GET /v1/wallet/balance`, confirmed in `routes/wallet.ts` as an authenticated
read without a paid executor call. Requests send `Authorization: Bearer`,
`X-Strale-Client: zapier-strale/<package version>` and `?src=zapier`; no x402.

- Caller-fix/non-retryable errors: `HaltedError`, including `details.fix`.
- HTTP 429: non-retryable caps halt with their code and fix; other 429s use
  `ThrottledError` with `details.retry_after_seconds`, top-level `retry_after`,
  or `Retry-After`, with a bounded default delay. Zapier's early generic 429
  handler is disabled so it cannot hide the API recovery message.
- Invalid/expired keys: `ExpiredAuthError`, requesting manual reconnection.
  Custom API keys have no refresh endpoint; OAuth/session `RefreshAuthError`
  would be the wrong reconnect mechanism here.
- Retryable service errors: Zapier `Error` retaining API code/status and fix.
  Non-JSON failures receive a safe generic message.

The adapter unwraps the real `result` / `meta` wire envelope. An executing result
is polled through authenticated `GET /v1/transactions/:id`, without a second
submission. One 25-second action deadline covers polling and both sequential
screening calls. Pending/failed transactions halt with their ID and recovery
advice. Polling transport errors also halt with the existing transaction ID,
including retryable/429 errors, to avoid replaying the billed submission; expired
authentication preserves reconnection behavior and the transaction advice. The request includes `max_price_cents: 100` and `timeout_seconds: 20`;
the latter does not force synchronous routing. Earlier successful screening
calls can already be billed if a later call fails; replay can repeat calls and
charges. The README makes this visible. Long-running checks beyond the action
deadline require operator review; there is no durable deferred continuation.

# Publishing steps for the orchestrator (not executed)

Current sources read on 2026-10-27:
[CLI overview](https://docs.zapier.com/integrations/build-cli/overview),
[command reference](https://github.com/zapier/zapier-platform/blob/main/packages/cli/docs/cli.md),
[public integration process](https://docs.zapier.com/integrations/publish/public-integration),
[publishing requirements](https://docs.zapier.com/integrations/publish/integration-publishing-requirements).

1. Use the delegated developer-account step at
   [Zapier Developer Platform](https://developer.zapier.com/). The owner must
   represent the API owner, and at least one admin must have a company/API-domain
   email. Resolve the account/terms act under the adoption's delegation; this
   build did not create an account or accept terms.
2. Install from the reviewed lockfile with `npm ci`. Use Node.js 22 for the
   Zapier runtime. Run the package tests, local validation and framework check
   again. Confirm public availability and keep pending actions hidden. Remove
   a hidden flag only after its tool is public and a live private Zap passes.
3. From `packages/zapier-strale`, authenticate the CLI and register the app.
   The pinned CLI's executable is `zapier-platform`; the `zapier` alias below
   provides the requested traditional command names without a global install:

   ```sh
   alias zapier='npx -y zapier-platform-cli@19.2.1'
   zapier login
   zapier register "Strale"
   zapier validate --without-style
   zapier push
   ```

   Register a private integration initially, use the Strale branding and
   `https://strale.dev` homepage, and select Business Intelligence. The generated
   `.zapierapprc` app linkage and `build/` are locally ignored. Copy app/listing
   text from the README/package description and action definitions. Do not npm
   publish this private app package.
4. Private-test the uploaded version in Zapier with an authorized Strale test
   key and funded wallet. Invite testers through the Developer Platform sharing
   controls. Create a Zap for each visible action, turn it on, and retain at
   least one successful history run per action. Confirm field mapping, source
   evidence, invalid-key reconnection and useful fix messages in the editor.
   Inspect Monitoring for unexpected errors. Budget test calls; these live
   checks were not possible without a key/account and are not replaced by
   offline tests. Preserve the production contract observations in a fresh
   receipt after upload.
5. Before public submission, meet the current requirements: launched service
   and documented production HTTPS APIs; ownership/API/trademark permissions;
   third-party terms and privacy handling; credentials requested only through
   Authentication; English names/descriptions and meaningful fields; app name
   matching Strale branding; short description starting “Strale is a…” with no
   other-app mention; correct homepage; retained successful live test Zaps;
   no unexpected Monitoring errors; an admin with the company/API email domain.
   Provide a non-expiring Strale test account for `integration-testing@zapier.com`
   with required paid features enabled, limited privilege, credentials and
   usage documentation/demo suitable for this API-key product. Account setup
   and any wallet funding are later authorized operations, not commands run by
   this build.
6. Run `zapier validate --fail-for-publishing` when linked and authenticated.
   Resolve server-side publishing tasks, then use Developer Platform → Strale →
   Integration Home → Publish → complete the form → Submit for Review. The CLI
   also supports `zapier promote 0.1.0`, which for a private integration runs
   checks and supplies the public-submission form link. Do not mistake an upload
   for a public listing. Zapier's review controls approval; the documented
   process enters public beta after approval before public status. Do not
   publish the held monthly screening template or target finance/compliance
   teams without the adoption's release condition.

# Verification and review

Final command results and immutable evidence receipt are recorded below after
verification completes. No external distribution PR was touched and no package
was published; published-artifact smoke testing and the external-PR preflight's
published-package/neighbor checks remain for the publishing session.

The `go` skill's verification/review stages were applied within the user’s
no-commit/no-push/no-PR boundary. No installed simplify skill was found; a manual
simplification pass separated transport, native app glue and reusable jobs.
Independent technical and product reviews ran in fresh read-only contexts.
Round-one findings were corrected: remove real manifest examples from fixtures,
poll async results under one deadline, retain transaction IDs, remove a hardcoded
connection label, correct country-context wording and listing format, and
preserve every existing dependency version in the lockfile. Dependency additions
are nested to avoid unrelated hoisting/version changes. Round two found no HIGH
issues; its remaining MEDIUM polling-failure/replay finding was then corrected
and covered by network, 429, 503 and expired-auth polling tests. The product
review returned GO after two rounds. No third review loop was run.

[BACKFILL] Session journal: built D5 locally and verified the fixed actions;
account, live private Zaps and submission remain with the orchestrator. No
Notion Journal write was attempted in this build environment.

## Final results

Evidence: [verification receipt](../../../archive/receipts/2026-10-27-test-run-zapier-integration.json).

- Package suite: 40 passed; offline, with network access disabled.
- Framework gate regression: 1 passed (hollow app and test-only import planted failures).
- Full API suite after clean install: 356 files passed, 34 files skipped; 6,509 tests passed, 349 skipped.
- Official CLI local validation passed. Public package and jobs exports resolve.
- Framework integrity: 5 active packages verified; 3 deprecated packages skipped.
- Clean npm ci passed. Existing lockfile package versions changed: zero.
- No independent-review HIGH findings remain; round-two polling failure finding was fixed and tested.
- Docker-backed DB integration and image-boot CI jobs were not run: Docker daemon is unavailable and no disposable test DB was supplied. The API suite's environment-dependent tests were skipped, not passed.
- Live authentication and paid execution, private Zap runs, publication and post-publication production contract checks remain unverified: no Strale key or Zapier account was available.
- handoff:check intentionally fails under this orchestrator contract: dirty/uncommitted work, isolated clone treated as trunk on a feature branch, no feature upstream, and existing merged local/remote branches. No branch was switched, deleted or pushed.

Every root check-job command below ran and passed (the Actions-only dependency-status shell guard is not a local check). Package and changed gate tests were rerun after their final edits; the API suite was rerun after clean installation.

| Command | Result |
|---|---|
| npm ci | PASS |
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
| npm test --workspace=packages/zapier-strale | PASS |
| node --test apps/api/scripts/check-framework-packages.test.mjs | PASS |
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
| node --test scripts/production-watch/*.test.mjs | PASS |
| npm run programs:test | PASS |
| npm run research:check | PASS |
| npm run research:test | PASS |
| npm run design:check | PASS |
| npm run design:test | PASS |
| npm run env:check | PASS |
| npm run env:test | PASS |
| npm run vendors:check | PASS |
| npm run vendors:test | PASS |
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
| node scripts/generate-archive-index.mjs --check (CI warning policy) | PASS |
| npm run archive:index:test | PASS |
| npm run receipts:check | PASS |
| npm run receipts:test | PASS |
| npm run migrations:check | PASS |
| npm run migrations:test | PASS |
| npm run gates:test | PASS |
| npm run handoff:test | PASS |
| npm run context:check | PASS |
| npm run context:test | PASS |
| npm test | PASS |

Additional final checks passed: package CLI validate --without-style; public jobs/app export loading; git diff --check; npm run archive:index; repeated claims, distribution (including distribution:test), docs, models, env, programs and receipts checks. Final package and framework test counts above supersede their earlier CI checkpoint counts.

Changed files: package app/glue/jobs/client, metadata, README, ignored Zapier linkage/build paths, tests and structural fixtures under packages/zapier-strale/; package-lock.json; CI workflow; framework checker and its regression test; distribution registry and schema; this handoff; generated archive/handoff indexes; and the evidence receipt.

## Round 2

- Non-retryable 429 cap errors halt with their code and guidance; retryable
  429s use `details.retry_after_seconds`, then top-level `retry_after` or the
  response header. Errors also use `details.next_step` when `fix` is absent.
- Core 19.2.1's `types/custom.d.ts` documents `bundle.meta` fields, but no
  per-run or per-step identifier documented as stable across a replay. The
  deprecated `meta.zap.id` identifies a Zap, not a run. No idempotency key is
  sent and inputs are never hashed: identical lookups can be intentional.
  The README and every action's first input help warn about replayed charges.
- Name screening covers people only. GB, NO and FI name lookup returns the
  best fuzzy match; check the returned registration number.
- Local tests and CI support Node >=20.12.1, the minimum allowed by nock
  14.0.16. Core 19.2.1 requires >=16 and mocha 11.7.5 allows Node 20.9+;
  the installed dependency tree supports 20.12.1. Zapier runtime is Node 22.
  The pinned CLI runs on demand via npx, not as a dev dependency; app schema
  validation remains in the package tests. The lockfile shrank from 2,215 to
  928 package entries. See [Round 2 receipt](../../../archive/receipts/2026-10-27-test-run-zapier-integration-round2.json)
  for verification results.
- `npm audit --workspace=packages/zapier-strale --omit=dev` reports five
  high findings, including `zapier-platform-core` via its `form-data` 4.0.5
  dependency (GHSA-hmw2-7cc7-3qxx); these are not all dev-only. The full
  workspace audit reports nine findings. The Docker-shaped installation,
  which excludes this workspace, independently reports 42 findings; audit
  counts are reports, not proof of exploitability. Review dependency updates
  separately; no unsupported claim that runtime or Docker is unaffected was
  made.
- The original independent review returned GO per the orchestrator. Round 2
  changes remain for the orchestrator's review; no additional independent
  review, PR, commit, push or publication was performed. The `go` workflow's
  shipping steps were overridden by the explicit handoff instructions. The
  handoff gate reports the intentional dirty branch and missing upstream as
  well as pre-existing merged branches; it also expects a trunk/worktree
  layout incompatible with this supplied clone.
