Intent: Monitor yesterday's reliability changes + build Netherlands property vertical.

## Session Summary (2026-04-12)

1 commit to main. Platform: 292 capabilities, 103 solutions.

### Diagnostic Results — Reliability Changes (shipped 2026-04-11)

**Model ID fix (9 capabilities):** Working. cookie-scan, code-review, agent-trace-analyze, prompt-optimize, risk-narrative-generate, terms-of-service-extract all at 100% pass rate post-fix. Remaining failures in privacy-policy-analyze and competitor-compare are Browserless timeouts, not model errors.

**Maintenance-class scheduling:** Working. landing-page-roast (scraping, C-tier) hasn't run since Apr 8 — correct 72h cycle. 2,635 test runs / 10,323 tests in last 2 days with 94% pass rate.

**Jina Reader fallback:** Healthy. 99.9% uptime over 7d, 232ms latency. url-to-markdown at 100%.

**Browserless:** Only 36.5% uptime over 7 days (intermittent outages). Currently healthy at 989ms. Multiple `browserless_probe_failed` situations logged. Jina fallback absorbing the impact.

### Netherlands Property Vertical (5 capabilities + 1 solution)

**New capabilities:**
- `nl-bag-address` — BAG API address/building lookup (needs BAG_API_KEY, free registration). €0.05
- `nl-woz-value` — CBS municipality WOZ averages (no auth). €0.03
- `nl-housing-price-index` — CBS national price index (no auth). €0.03
- `nl-housing-stats` — CBS regional sale prices + housing stock (no auth). €0.03
- `nl-energy-label` — EP-Online energy labels (needs EP_ONLINE_API_KEY, free registration). €0.05

**New solution:**
- `nl-property-check` — All 5 steps parallel. €0.19

**All 5 capabilities:** Onboarded, validated (all checks green), in probation lifecycle. CBS capabilities verified with live Amsterdam data. BAG and EP-Online awaiting key registration.

### Bug Fix
- `onboarding-gates.ts` — Fixed `ANY(${capSlugs})` raw SQL array bug → `inArray(capabilities.slug, capSlugs)`. Was preventing seed-solutions.ts from running.

### Pending (next session)
- Register BAG_API_KEY at kadaster.nl and EP_ONLINE_API_KEY at apikey.ep-online.nl
- Add keys to Railway env vars, re-verify BAG + EP-Online capabilities
- Fixture snapshot system for scraping tests (cost reduction)
- Post Reddit replies (r/LLMDevs CI/CD thread, r/AgentsOfAI agents-as-APIs thread)
- UK property capabilities still in validating state — need test runs for SQS
- CBS data quirk: OData `$orderby` not reliable, client-side sort needed (implemented)

### DB changes applied directly
- 5 NL capabilities inserted via onboarding pipeline
- nl-property-check solution inserted via seed-solutions.ts
- All capabilities promoted to probation lifecycle via validate-capability.ts --apply
