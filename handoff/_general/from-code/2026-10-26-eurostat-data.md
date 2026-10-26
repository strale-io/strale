Intent: Finish eurostat-data on feat/eurostat-data with a dataset allowlist (round 5) and a label-aware screen for which datasets qualify; open for review and merge. Production onboarding remains.

EUROSTAT_ALLOWED_DATASETS holds 110 datasets. Any other dataset returns dataset_not_supported before any fetch, with the supported list and how to request an addition. `__fixtures__/eurostat/dataset-audit-2026-10-26.json` records the live JSON-stat metadata (latest period, no non-time filters, values omitted) for 127 candidates with a verdict and findings each; the README there states the rule and lists the 404 candidates.

The rule: a dataset is excluded when checkEurostatMetadata refuses it (non-Eurostat source, trade), when a dimension other than geo/time has a geographic id (partner, citizen, c_*, resid, ...), when such a dimension holds a category whose label names the country its ISO code denotes, or when it holds five or more ISO codes whatever their labels (no non-geographic dimension in the audit holds more than three). Round 5 first used a code-only screen; it excluded population, HICP, government finance, short-term industry and energy-price tables because codes like NR ("Number"), SA ("Seasonally adjusted") and GD ("Government gross debt") are also ISO codes. The orchestrator replaced it with the label-aware rule above. The test restates the rule independently and checks every audit verdict against it, plus synthetic cases (a renamed country dimension and a country-dense dimension are refused; NR/KM2/SA/CA/TC pass).

Runtime: geo is required and restricted to EU27, EFTA and official candidates (NUTS regions within them, EU/EA aggregates), checked before fetch and again after fetch, label-aware for geo; non-geo values are not country-checked because allowlisted datasets carry no geographic non-geo dimension. Source/trade checks stay as defence in depth.

Live probes 2026-10-26 (local executor, official upstream): demo_pjan SE 2025 10,587,710; namq_10_gdp DE 2026-Q2 1,171,696 MEUR; prc_hicp_manr SE 2025-12 2.1 (HICP CP00 currently ends at 2025-12 upstream); gov_10dd_edpt1 FR 2025 115.7 % of GDP; sts_inpr_m DE 2026-08 90.7; nrg_pc_204 SE 297 cells; zero dropped cells, zero non-allowed geos. tour_occ_nim, migr_imm1ctz and rail_go_intgong return dataset_not_supported; geo=US returns commercial_reuse_restricted.

Production steps left (need production write authority), from apps/api:
- npx tsx scripts/onboard.ts --discover --manifest ../../manifests/eurostat-data.yaml
- review generated fixtures/reliability; for an existing DB row use --backfill --discover --fix
- npx tsx scripts/validate-capability.ts --slug eurostat-data
- npx tsx scripts/smoke-test.ts --slug eurostat-data
- authenticated GET /v1/internal/onboarding/readiness?slug=eurostat-data must return ready:true
