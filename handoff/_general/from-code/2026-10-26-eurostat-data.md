Intent: Apply the requested Eurostat fixes; leave changes uncommitted for the orchestrator.

Expanded trade refusal by prefixes, returned title/theme/category words and trade-source lineage. Corrected source-institution handling with recorded tec00013 metadata. Added aggregates, NUTS regions, case-insensitive filters and country checks for geo, partner, citizen, c_birth, c_resid, c_orig, c_dest, counterp and live-discovered c_work. Empty/all-null results throw no_observations; real array errors and extraction/asynchronous limits are handled. Outputs include DOI/access date; manifest and terms describe enforcement.

Live: GDP SE/2020 = 478106.9 CP_MEUR; EA21/2025 = 15993332.2; unemployment SE/September 2026 = 8.6; tec00013 succeeds; immigration SE/citizen DE/2024 = 3570. cult_trd_prd, bop_its6_tot and tet00038 are refused. Unknown dimensions retain Eurostat's error; large BoP extraction maps to observation_limit_exceeded; GDP/1900 returns no_observations. The requested word rule also refuses migration queries containing “European Free Trade Association”; selecting citizen DE succeeds. EA14 is policy-allowed but absent from the checked codelist.

Verification: targeted/full API vitest, MCP build, API typecheck, claims/models/env/docs/programs/receipts/vendors checks, strict manifest/identity/tier checks, cost coherence, production-write guard and whitespace check passed. Existing warnings remain. No receipt or production write.

Remaining operator commands from apps/api:
- npx tsx scripts/onboard.ts --discover --manifest ../../manifests/eurostat-data.yaml
- Review generated fixtures/reliability; preserve optional updated/unit.
- npx tsx scripts/validate-capability.ts --slug eurostat-data
- npx tsx scripts/smoke-test.ts --slug eurostat-data
- Authenticated GET /v1/internal/onboarding/readiness?slug=eurostat-data; require ready:true and preserve dark launch.

Dry-run passed manifest validation, then stopped at the credential guard. Validation/smoke require DATABASE_URL; readiness and production billing remain unverified. handoff:check reports dirty files, feature branch in the primary clone and a possibly stale merged remote branch. Explicit no-commit/no-push/no-switch instructions leave closure to the orchestrator. No external Journal message sent.
