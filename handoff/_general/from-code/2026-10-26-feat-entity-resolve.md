Intent: Built entity-resolve on the assigned isolated clone/branch, tested public GLEIF lookups, and prepared files for a local commit; the commit attempt was blocked by a read-only .git mount. Production onboarding, readiness and smoke checks remain for the orchestrator; no push, PR, merge, credentials search or production writes were performed.

[BACKFILL] Journal: this file records the session for later backfill; no Notion connector was available or used.

Implementation:
- LEI mod-97, ISIN Luhn, BIC shape and EU/XI national VAT shape detection; optional hints; strict ISO2 country for registry identifiers. Recognized standard identifiers take priority over registry fallback. Unknown/unprefixed ambiguous inputs request type and country.
- Shared GLEIF transport with lei-lookup, honest User-Agent and timeout. Existing lei-lookup output/search/error behavior remains covered by regression tests.
- GLEIF ISIN/BIC filters; eight-character BIC expands to XXX. Only one ISIN page item is fetched, using pagination.total for the count. No bulk downloads or full ISIN lists.
- Registry candidate discovery by number/country, authority jurisdiction confirmation, then number plus authority filter. Multiple/truncated candidates remain unresolved. VAT reuses vat-validate, refuses stale results, and resolves only a unique matching legal name/country with probable confidence.
- Manifest: company-data, price_cents 15, external_cost_cents 0 (VIES is free), data_lookup. Nullable and conditional fields have honest reliability and limitations.
- Actual GLEIF terms read on 2026-10-26: https://www.gleif.org/en/meta/lei-data-terms-of-use (section II: individual lookups; CC0 commercial reuse). Official API overview and BIC/ISIN mapping pages were read. The linked Postman technical documentation did not render through the web tool and answered 403 from the shell; filter behavior was verified directly against public API responses, without circumventing the block.
- GLEIF already exists in config/vendors.yaml. Its new terms record covers all four existing/new executors. Existing GLEIF manifests add upstream_vendor metadata. Vendor-policy scanner now follows literal static/dynamic imports of shared helpers; exact-caller checks and orphan-client rejection remain active.

Verification (real outcomes):
- npm run handoff:orient: passed. This assignment is portfolio work, not continuation of an active migration track.
- First targeted vitest run: entity-resolve.test.ts + lei-lookup.test.ts passed. Expanded run initially failed vendor metadata/shared-client checks; fixed those causes. Final run of these plus vendor-terms.test.ts and data-access-manifests.test.ts passed: [final receipt](../../../archive/receipts/2026-10-26-test-run-entity-resolve-final.json). The earlier receipt records the preceding successful run; it was not edited.
- Temporary unrecorded static and dynamic GLEIF helper callers each made the vendor exact-caller test fail as intended. Probe removed in finally; final full targeted run passed after removal. Evidence in final receipt.
- npm --workspace=packages/mcp-server run build: passed.
- cd apps/api && npx tsc --noEmit: passed, including repeat after detector fixes.
- npm run claims:check, models:check, env:check, docs:check, programs:check, receipts:check: passed. Receipts emitted historical bare-test-count warnings, unrelated to this change.
- node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict: passed (existing allowlisted findings).
- node apps/api/scripts/check-identity-fixture-shape.mjs --strict: passed.
- node apps/api/scripts/check-tier-coverage.mjs --strict: passed (existing allowlisted findings).
- node apps/api/scripts/check-cost-class-coherence.mjs: passed.
- cd apps/api && npx tsx scripts/onboard.ts --manifest ../../manifests/entity-resolve.yaml --dry-run: manifest validation passed, then command exited 1 with ProductionAuthorityError / no production write credential. No workaround attempted.
- git diff --check: passed.
- npm run context:generate: exited 1 because its primary-worktree guard classifies this isolated clone as shared. The normal pre-commit hook would regenerate staged archive/handoff indexes and inventory, but could not run because git add cannot write the index; no guard override was used.
- go skill: verification, self-simplification and independent technical/product reviews performed; no HIGH findings. Detector findings fixed and confirmed in round 2. Separate bounded policy-check review found literal dynamic imports missing; fixed and proven with the dynamic probe.
- git add / git commit: exited 128 at git add, before commit, because .git/index.lock cannot be created (read-only filesystem). No local commit exists for this build.
- handoff:check reports dirty paths/resume surface (handoff exists, but cannot be committed) and branch/upstream policy conflicts with the explicit build-agent assignment. Final check cannot pass the trunk/main and pushed-upstream requirements because the user expressly forbids switching branches and pushing. No override to production/readiness or claim of shipping.

Live check: cd apps/api && npx tsx scripts/live-entity-resolve.ts --fixtures (passed twice; final fixtures captured from final executor). All below resolved:true / confidence:exact / as_of:2026-10-26T00:00:00Z:
- HWUPKR0MPOU8FGXBT394 -> lei_direct; Apple Inc.; LEI HWUPKR0MPOU8FGXBT394; isin_count 949.
- US0378331005 -> isin_mapping; Apple Inc.; same LEI; isin_count 949.
- DEUTDEFF -> bic_mapping; DEUTSCHE BANK AKTIENGESELLSCHAFT; LEI 7LTWFZYICNSX8D621K86; isin_count 23008.
- 00048839 / country GB / type registry -> registry_id; BARCLAYS PLC; LEI 213800LBQA1Y9L22JB70; isin_count 71.
Full company-only output fixtures: apps/api/src/capabilities/__fixtures__/entity-resolve.live.json. VAT live validation was not run; it is mocked in tests, as requested.

Remaining production steps (orchestrator only, in an authorized environment; do not skip gates):
1. cd apps/api && npx tsx scripts/onboard.ts --discover --manifest ../../manifests/entity-resolve.yaml
   Review generated expected_fields/reliability: optional fields must not become guaranteed. Keep dark-launch visibility/x402 off; do not use --force-override-authority or --skip-gates.
2. cd apps/api && npx tsx scripts/validate-capability.ts --slug entity-resolve
3. cd apps/api && npx tsx scripts/smoke-test.ts --slug entity-resolve
4. With the operator's existing configured admin credential: curl --fail -s -H "Authorization: Bearer $ADMIN_SECRET" "https://api.strale.io/v1/internal/onboarding/readiness?slug=entity-resolve"; require ready:true / zero issues.
5. Run validate-capability.ts, smoke-test.ts and the same readiness query for lei-lookup (shared transport) and gleif-l2-ubo-lookup / gleif-l2-children-lookup (vendor metadata). No onboarding/backfill is needed for these metadata-only additions unless the authorized checker reports a real gap.
6. Orchestrator stages these files, runs the normal pre-commit index regeneration, commits, reviews the final commit, pushes, opens the PR and merges; this build agent does none of those actions.

Limitations still to assess before shipping:
- No writable .git: local commit and clean handoff gate are blocked. Files remain in the assigned clone; /tmp/entity-resolve.patch is a complete patch of tracked and new changes for recovery or review.
- No production DB/API-key access: database-backed validation, generated suites, readiness and smoke are unverified. This capability is locally implemented, not declared production-ready.
- Existing /v1/do catches flatten executor-specific error codes/details to execution_failed (HTTP 500). Actionable messages survive and canonical refusal wording prevents caller-input health penalties; public preservation of invalid_request is an existing route-layer limitation, left outside this capability build.
- Registry matching requires GLEIF's published number formatting and a legal-address country candidate; unusual foreign-address registrations may remain unresolved. Legal forms are GLEIF ELF codes, not expanded labels.
