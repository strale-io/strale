Intent: Apply Round 4 label-aware country detection on top of the uncommitted Round 3 Eurostat corrections; leave changes uncommitted for orchestrator review and production onboarding.

Country detection now embeds English ESTAT GEO labels fetched 2026-10-26, preserving the same world-country codes. Seven ISO codes absent from GEO use documented equivalent GEO entries. Pre-fetch country refusal applies only to geo/partner/citizen/counterp/natvessr/reporter/c_* ids (case-insensitive). Post-fetch every dimension uses code plus a case/whitespace/punctuation-normalised label match (exact or starts with the codelist label at a word boundary). NR=Number passes; x/NR=Nauru is dropped. Restricted countries and explicit geographic groups are dropped with overall and per-dimension counts. Exact allowlisted countries pass case-insensitively; regional codes are accepted only through the geo rule. Non-geo totals such as citizen=TOTAL pass because a total is not data for a particular country. MEL/PLR/MED are denied; BAL and ESM pass as non-country aggregates. Domestic retail/wholesale/distributive trade and trade-sector titles pass; international trade and stk_flow remain refused (including nrg_stk_gas). Dimension ids and structural position maps are excluded from source-key checks. Restored filters.required: [geo].

Live local executor against the official API: migr_imm1ctz with geo=SE, sex=T, age=TOTAL, agedef=COMPLET, unit=NR, since 2024 returned 71 cells, dropped 218 in citizen. With geo=DE and 2023 bounds, rail_go_intgong returned 92 cells, dropped 64 in c_unload; fats_ctrl_rd returned 96 cells, dropped 404 in c_ctrl. All three returned zero restricted country/geographic-group rows. Ownership regression retains the recorded sbs_na_2c_own metadata.

Verification: targeted Eurostat/vendor-terms tests, MCP build, API typecheck, claims/vendors/docs/models/env/programs/receipts checks, production-write guard and whitespace check passed. Full API vitest passed. Strict manifest consistency, identity fixture shape, tier coverage and cost-class coherence checks also passed with existing allowlisted findings. Existing vendor/receipt warnings remain. Dry-run passed manifest validation then stopped at the production credential guard; validation, smoke and readiness could not run against a database. No receipt or production write.

Remaining authorised operator steps from apps/api:
- npx tsx scripts/onboard.ts --discover --manifest ../../manifests/eurostat-data.yaml
- Review generated fixtures/reliability; retain optional updated/unit and the new per-dimension count field.
- npx tsx scripts/validate-capability.ts --slug eurostat-data
- npx tsx scripts/smoke-test.ts --slug eurostat-data
- Authenticated GET /v1/internal/onboarding/readiness?slug=eurostat-data; require ready:true and preserve dark launch.

handoff:check reports dirty files, the feature branch in the primary clone and a possibly stale merged remote branch. Explicit no-commit/no-push/no-switch instructions leave closure to the orchestrator. Production readiness/billing remain unverified. No external Journal message sent.

Round 4 self-review/simplify: no further structural change needed; independent review and shipping remain with the orchestrator. No commits, pushes, PRs, receipts or production writes in this round.
