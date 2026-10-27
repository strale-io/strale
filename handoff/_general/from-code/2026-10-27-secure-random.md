Intent: Build the paid secure-random capability for portfolio Phase 2 item 2.12; complete offline verification and leave production onboarding to the orchestrator.

Implemented `apps/api/src/capabilities/secure-random.ts`,
`apps/api/src/capabilities/secure-random.test.ts` and
`manifests/secure-random.yaml` on `feat/secure-random` from `79d64589`.
The explicit task date overrides the generic previous-day handoff template.

Five operations use only Node.js crypto: inclusive integers with optional
uniqueness, UUIDv4, hex/base64 bytes, Fisher–Yates shuffle, and pick without
replacement by input position. All validation precedes randomness. Refusals
carry `invalid_request`, field and fix details, and classify as caller input.
Per-call bounds and duplicate-input sampling semantics are documented.

Price: integer `price_cents: 2` (€0.02), the lowest paid band. Bounded local
computation has no upstream API cost; `external_cost_cents: 0`,
`cost_class: free_unlimited`, `is_free_tier: false`. No vendor, terms check,
credential or dependency probe is needed. Data access is `not_applicable` /
`computed`. Latency is the protocol's 20 ms algorithmic estimate.

The description, limitations and executor docs warn against using outputs as
passwords, keys or session tokens and say to generate secrets locally. Inputs
and outputs stay in transaction records for 90 days like other calls. Results
are not publicly verifiable: no commit-reveal and no beacon.

No x402 customization is needed: manifest-driven auto-registration supplies the
executor to the standard gateway, which uses DB eligibility and pricing.
No `x402_enabled` flag was set. Keep the initial capability dark until the
normal first-green-week promotion. The existing developer-tools category does
not require a frontend category update.

Independent technical and product reviews: GO, round 1, no HIGH or MEDIUM
findings; see `archive/sessions/2026-10-27-secure-random-review.md`.
The `go` workflow was applied through local verification, simplification and
review. Its push/PR/merge steps are excluded by the orchestrator's instructions.

Onboarding readiness: AUTHORIZATION_UNAVAILABLE in this build environment;
production readiness has not been established.

Actual offline CLI results (all exited 1):

- `cd apps/api && npx tsx scripts/onboard.ts --discover --dry-run --manifest ../../manifests/secure-random.yaml`: refuses the mutually exclusive flags: "--discover requires live execution and cannot be combined with --dry-run."
- `cd apps/api && npx tsx scripts/onboard.ts --dry-run --manifest ../../manifests/secure-random.yaml`: "No production write credential is available to this process." Even dry-run opens the production-authorized write handle before validation.
- `cd apps/api && npx tsx scripts/validate-capability.ts --slug secure-random`: "DATABASE_URL is required for a read-only operator handle."
- `cd apps/api && npx tsx scripts/smoke-test.ts --slug secure-random`: same missing read-only database handle.
- `cd apps/api && node scripts/assert-disposable-test-db.mjs`: "DATABASE_URL_TEST is not set; nothing to verify." The separate CI integration-db job's schema push and startup migrations were not attempted.

Offline unit tests invoke the real authoring and structural gates, validate
JSON schemas for every operation, and execute the known-answer fixture's
shape and length assertions. This does not substitute for DB-backed readiness.

Production steps remaining (orchestrator only, after review/merge/deploy):

1. **Orchestrator change after round 2:** the onboarding verifier (`checkFieldAssertion` in `apps/api/src/lib/onboarding-pipeline.ts`) reads only top-level fields, so the dotted `values.length`, `values.0` and `values.1` assertions were removed from the manifest's `known_answer`. No other manifest uses dotted paths. A shared-pipeline change for one manifest was not worth the risk. The known answer now asserts `values` is an array, `operation` equals `uuid`, and `parameters` is an object. The count and element types stay covered by the unit tests.
2. Onboard with **discover unchecked** (`mode=onboard`, `discover=false`), so the authored assertions are used as written.
3. Download the `onboarding-results` artifact and require successful known-answer verification, all five test types, and readiness with zero issues. Discovery-off works for a new capability: `.github/scripts/onboard-capability.mjs` forwards the boolean to `POST /v1/internal/onboarding/run`, which forwards it to `runOnboardingPipeline`.
4. In the authorized operator environment run `cd apps/api && npx tsx scripts/validate-capability.ts --slug secure-random` and `npx tsx scripts/smoke-test.ts --slug secure-random`. The equivalent direct onboarding command, if needed there, is `npx tsx scripts/onboard.ts --strict --manifest ../../manifests/secure-random.yaml` (no discover and no dry-run).
5. Check authenticated `GET /v1/internal/onboarding/readiness?slug=secure-random`; require `ready: true` and zero issues. Keep it paid and follow the normal dark-launch and x402 promotion workflow rather than manually setting flags.

Read-only live check: `GET https://api.strale.io/health` returned HTTP 200,
`{"status":"ok","commit":"79d645891033"}`. No paid invocation or production
mutation was attempted. Notion/Journal updates are left to the orchestrator;
this handoff is the build record.

Session environment exceptions: the build agent was explicitly assigned an
isolated clone on its existing feature branch, with no branch switching or
pushing. `npm run context:generate` refused because it treats every primary
clone checkout as the shared trunk; no bypass was used. The standard pre-commit
index hook handles the generated archive/handoff indexes and inventory. The
session handoff gate also reports that primary-checkout classification, absent
feature upstream and existing merged branches. Do not switch the branch, push
or delete unrelated local/remote branches from this build session.

Verification evidence: `archive/receipts/2026-10-27-test-run-secure-random.json`.
Focused suite: 53 passed. Full API suite (`npm test` / apps/api vitest):
6,003 passed, 346 skipped; 343 files passed and 33 skipped. No failures.
Skipped tests remain unverified, including DB-backed coverage without the
disposable test database. No production readiness claim is made.

All commands below actually ran. CI `npm ci` was preprovisioned by the orchestrator and rerun during the
writable-clone commit recovery in both the assigned and temporary clone. The separate integration-db
job's schema push and startup migrations were not run without its disposable
database. Existing research/vendor/receipt warnings and the Vite dynamic-import
warning remain; none was changed or suppressed.

| Command | Result |
| --- | --- |
| `npm --workspace=packages/mcp-server run build` | PASS |
| `npm --workspace=packages/sdk-typescript run build` | PASS |
| `npm run typecheck` (all configured workspaces and API scripts) | PASS |
| `cd apps/api && npx tsc --noEmit` | PASS |
| `cd apps/api && npx vitest run src/capabilities/secure-random.test.ts` | PASS, 53 tests |
| `npm run handoff:orient` | PASS |
| `git diff --check` | PASS |
| `npm run archive:index` | PASS |
| `npm run context:generate` | REFUSED primary-clone classification; hook regenerates indexes/inventory |
| `npm run handoff:check` | FAIL: clone classification, no pushed feature upstream, unrelated merged branches; explicit build-agent scope takes precedence |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS |
| `npm --workspace=apps/api run lint:no-new-console` | PASS |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | PASS |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | Initially FAIL; fixed nested annotation, strict rerun PASS |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | PASS |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npm run programs:check` | PASS |
| `npm run programs:test` | PASS |
| `npm run research:check` | PASS |
| `npm run research:test` | PASS |
| `npm run design:check` | PASS |
| `npm run design:test` | PASS |
| `npm run env:check` | PASS |
| `npm run env:test` | PASS |
| `npm run vendors:check` | PASS |
| `npm run vendors:test` | PASS |
| `npm run distribution:check` | PASS |
| `npm run distribution:test` | PASS |
| `npm run digest:shadow:test` | PASS |
| `npm run candidates:test` | PASS |
| `npm run protocols:check` | PASS |
| `npm run protocols:test` | PASS |
| `npm run protocols:coverage` | PASS |
| `npm run protocols:coverage:test` | PASS |
| `npm run scheduled:check` | PASS |
| `npm run scheduled:test` | PASS |
| `npm run scheduled:outcomes:test` | PASS |
| `npm run models:check` | PASS |
| `npm run models:test` | PASS |
| `npm run claims:check` | PASS |
| `npm run claims:test` | PASS |
| `npm run docs:check` | PASS |
| `npm run docs:test` | PASS |
| `node scripts/generate-archive-index.mjs --check (CI warning-only wrapper)` | PASS |
| `npm run archive:index:test` | PASS |
| `npm run receipts:check` | PASS |
| `npm run receipts:test` | PASS |
| `npm run migrations:check` | PASS |
| `npm run migrations:test` | PASS |
| `npm run handoff:test` | PASS |
| `npm run context:check` | PASS |
| `npm run context:test` | PASS |
| `npm test` | PASS, 6,003 passed / 346 skipped |

Commit environment limitation: the assigned checkout's `.git` is mounted
read-only; `git add` failed creating `index.lock` before staging any files.
The completed files are copied to a writable temporary clone on the same
`feat/secure-random` branch for a local commit and Git bundle. No branch was
switched in the assigned checkout and no remote was pushed. The orchestrator
can import the bundle's branch and review the local commit. The assigned
checkout necessarily retains uncommitted source changes because its Git
metadata cannot be written here.


## Round 2

All four should-fix items and the naming nit are implemented. Shuffle/pick
accept only scalars and cap the serialized array at 65,536 UTF-8 JSON bytes,
including brackets and escaping. Scalars eliminate nesting with no recursive
validation; callers can send IDs/indexes for full objects. Parameters now echo
`items_count`, never `items`. Schemas, examples and limitations match; display
name is **Random Draw**, slug stays `secure-random`.

Zod issues now produce plain repair instructions with exact-text tests.
Unknown-key refusals identify the offending key. Main was checked through the
GitHub connector and has no `inputRefusal` yet; `RandomInputError` now uses its
planned `(message, field, fix)` shape. All refusals retain caller-input
classification when only their message survives.

New uniformity regressions exercise all 24 permutation cells for unique and
shuffle, and 24 ordered triples for pick over four elements. The comment
proves a finite-sample combined false-failure bound below 1.35e-11 via
Bernstein and a union bound, below the requested 1e-9.

The production steps above now explicitly require discover unchecked and
record the dotted-path verifier limitation (resolved afterwards by flattening the known answer; see production step 1). Independent technical and
product reviews both returned GO for the capability changes and confirmed
that production blocker. No shared onboarding code was modified.

This round supersedes the previous commit-recovery workaround: changes stay
uncommitted in the same checkout. No bundles or extra clones were created.
No credentials were sought or production writes attempted. The `go` skill was
applied through local verification, a manual simplification pass, and fresh
independent technical/product reviews; no simplify skill is available in this
checkout. Commit/push/PR/merge steps remain excluded by the explicit task.

Round 2 evidence: `archive/receipts/2026-10-27-test-run-secure-random-round-2.json`,
written with `npm run receipt -- --kind test-run --topic secure-random-round-2 --from -`
and JSON piped on stdin. The original receipt is unchanged. Focused: **73
passed**. Full API: **6,023 passed, 346 skipped**, **343 files passed, 33
skipped**. No final test failures. An initial focused rerun still used the old
object-item test fixtures (48 passed, 5 failed); those fixtures now use scalar
IDs. Skipped DB-backed coverage and production readiness remain unverified.

| Round 2 command | Actual result |
| --- | --- |
| `cd apps/api && npx vitest run src/capabilities/secure-random.test.ts` | PASS, 73 tests |
| `npm test` | PASS, full API counts above |
| `npm --workspace=packages/mcp-server run build` | PASS |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | PASS, API typecheck |
| `npm run claims:check` | PASS |
| `npm run models:check` | PASS |
| `npm run env:check` | PASS |
| `npm run docs:check` | PASS |
| `npm run programs:check` | PASS |
| `npm run receipts:check` | PASS, existing warnings retained |
| `npm run archive:index` | PASS |
| `npm run handoff:orient` | PASS |
| `git diff --check` | PASS |
| `npm --workspace=apps/api run lint:no-bare-catch` | PASS |
| `npm --workspace=apps/api run lint:no-unguarded-user-fetch` | PASS |
| `npm --workspace=apps/api run lint:no-new-console` | PASS |
| `npm --workspace=apps/api run lint:ssrf-inventory` | FAIL: existing wrapper assumes root cwd; direct root invocation below passes |
| `npm --workspace=apps/api run lint:no-external-column-access` | FAIL: same cwd assumption; direct root invocation below passes |
| `node apps/api/scripts/check-ssrf-inventory.mjs` | PASS |
| `node apps/api/scripts/check-no-external-column-access.mjs` | PASS |
| `node apps/api/scripts/check-mjs-syntax.mjs` | PASS |
| `node apps/api/scripts/check-framework-packages.mjs` | PASS; 3 deprecated packages skipped |
| `node apps/api/scripts/check-no-committed-secrets.mjs` | PASS |
| `node apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | PASS |
| `node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict` | PASS; existing allowlisted findings |
| `node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict` | PASS; existing allowlisted findings |
| `node apps/api/scripts/check-pii.mjs --strict` | PASS |
| `node apps/api/scripts/check-tier-coverage.mjs --strict` | PASS; existing allowlisted findings |
| `node apps/api/scripts/check-identity-fixture-shape.mjs --strict` | PASS |
| `node apps/api/scripts/check-shape-contracts.mjs` | SKIPPED: sibling frontend absent; exit 0 |
| `node apps/api/scripts/check-cost-class-coherence.mjs` | PASS |
| `node scripts/guard-production-write-access.mjs` | PASS |
| `npx tsx apps/api/scripts/check-ceo-brief.ts` | PASS; 0 errors, 15 existing length warnings |
| `cd apps/api && npx tsx scripts/onboard.ts --dry-run --manifest ../../manifests/secure-random.yaml` | REFUSED, no production write credential; exit 1 |
| `cd apps/api && npx tsx scripts/validate-capability.ts --slug secure-random` | UNAVAILABLE, no read-only database handle; exit 1 |
| `cd apps/api && npx tsx scripts/smoke-test.ts --slug secure-random` | UNAVAILABLE, no read-only database handle; exit 1 |
| `npm run handoff:check` | FAIL by explicit scope: leave uncommitted, no push/switch; also unrelated merged branches |

Round 2 live check: `GET https://api.strale.io/health` returned HTTP 200,
`{"status":"ok","commit":"f9c98049a754"}`. No capability invocation was made.
Exact remaining production commands are in the corrected production steps
above: onboard with discovery
off, validate, smoke-test, and require authenticated readiness `ready: true`.
