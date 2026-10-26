Intent: Build eurostat-data with the approved commercial reuse restrictions; leave changes uncommitted for the orchestrator.

Added a 3-cent, zero-upstream-cost executor, manifest, dense/sparse tests, Eurostat terms record and shadow vendor register/view. Required geo uses one exported EU27/EFTA/candidate/aggregate allowlist, with post-fetch drops counted. Trade prefixes and returned trade metadata are refused, covering Swiss/Liechtenstein and Austrian CN8 restrictions. Third-party source/rights notices are refused; outputs include attribution and modification/non-responsibility notices. URL-scoped terms avoid claiming unrelated ec.europa.eu services.

Live tsx: nama_10_gdp SE/DE since 2020 returned 2020–2025, Sweden 2025 = 600390.8 million euro. Health input SE/2020 = 478106.9. une_rt_m SE/PC_ACT/TOTAL/T/SA returned July–September 2026 = 8.6/8.9/8.6 percent. No geo drops. TOTAL replaced the initial empty Y15-74 query after checking live categories.

Verification: touched tests, MCP build, API typecheck, full API suite, claims/models/env/docs/programs/receipts/vendor checks, strict manifest consistency/identity/tier checks, cost coherence, production-write guard and diff whitespace check passed. The final full-suite rerun also passed. Existing allowlisted findings/warnings remain. No receipt or production write.

Limits: separately linked ESMS/catalogue notices are not inspected; source metadata gaps are stated in outputs. The attempted catalogue /toc/json endpoint returned 404. Onboarding --dry-run passed manifest validation, then refused without a write credential. Readiness remains unverified.

Remaining operator commands from apps/api:
- npx tsx scripts/onboard.ts --discover --manifest ../../manifests/eurostat-data.yaml
- Review generated reliability/fixtures; preserve optional updated/unit classifications.
- npx tsx scripts/validate-capability.ts --slug eurostat-data
- npx tsx scripts/smoke-test.ts --slug eurostat-data
- Authenticated GET /v1/internal/onboarding/readiness?slug=eurostat-data; require ready:true with zero issues. Keep invisible/x402 off for dark launch.

context:generate refuses this clone as a primary worktree. handoff:check flags dirty files, feature branch in primary checkout, missing upstream and a stale remote merged-branch finding. Explicit no-commit/no-push/no-switch instructions take precedence; orchestrator handles context generation and closure. No external Journal message sent.
