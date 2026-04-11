Intent: Infrastructure hardening, reliability improvements, developer solution restructure, UK property vertical launch, new capabilities.

## Session Summary (2026-04-11 → 2026-04-12)

12 commits to main. Platform went from 274 active capabilities / 101 solutions → 287 capabilities / 102 solutions.

### Infrastructure (commits 1-4)
- **maintenance_class column**: Added to capabilities table with 6 allowed values. Backfilled all 276 capabilities. Gate 1 now validates on onboarding. Onboard pipeline reads from manifests.
- **Model ID fix**: 9 capabilities had non-existent `claude-sonnet-4-6-20250514` → reverted to `claude-haiku-4-5-20251001`. Was causing 100% failure rate on cookie-scan, landing-page-roast, privacy-policy-analyze, competitor-compare, terms-of-service-extract, code-review, agent-trace-analyze, prompt-optimize, risk-narrative-generate.
- **Jina Reader fallback**: Added as free middle tier in web-provider chain (plain HTTP → Jina → Browserless). 200 RPM free tier. Reduces paid Browserless load.
- **Maintenance-class-aware scheduling**: 914 test suites re-tiered. pure-computation → A (6h), free-stable-api/commercial → B (24h), scraping → C (72h). ~80% reduction in Browserless test calls.

### Pricing & Solutions (commits 5-6, 9-10)
- **Dynamic solution pricing**: `solution-pricing.ts` computes price from component capabilities × markup tier. Auto-recomputes on `/v1/admin/reprice`. Backfilled all 101 solutions.
- **Output_schema examples**: All 276 capabilities now have example responses (14 from real transactions, 19 synthetic).
- **Developer solution restructure**: Deactivated 4 overlapping solutions (domain-intel, domain-trust, website-security-audit, web-extract-clean). Created 3 new (domain-security-check, api-quality-check, repo-health-check). Strengthened dependency-risk-check (2→4 steps). Pre-merge-check moved to data-lookup tier.
- **Pricing fixes**: dependency-audit 20¢→5¢ (was overpriced for free API), secret-scan 5¢→2¢. Both reclassified.

### New Capabilities (commits 7-8, 11-12)
- **belgian-company-data**: CBEAPI.be as primary data source (free, structured JSON). Browserless scraper as fallback. maintenance_class → free-stable-api. Requires CBEAPI_KEY env var.
- **diff-review**: AI-powered unified diff analysis for CI/CD pre-merge checks. 10¢, commercial-stable-api.
- **workflow-security-audit**: Static YAML analysis for GitHub Actions supply chain risks (unpinned actions, permissions, secrets, pull_request_target). 3¢, pure-computation.
- **dependency-audit upgrade**: Added batch CVE scanning via OSV.dev querybatch API.
- **7 UK property capabilities**: stamp-duty-calculate, council-tax-lookup, uk-crime-stats, uk-flood-risk, uk-epc-rating, uk-sold-prices, uk-rental-yield. All free-stable-api or pure-computation.
- **2 UK property Phase 2**: uk-deprivation-index, uk-transport-access.
- **Orphan resolution**: ecb-interest-rates and youtube-summarize reactivated. 4 intentionally deactivated capabilities left as-is.

### New Solutions
- **pre-merge-check**: 5 steps (diff-review + secret-scan + dependency-audit + license-check + workflow-security-audit). €0.32.
- **uk-property-check**: 9 steps, all parallel, all free government sources. €0.30.
- **api-quality-check**: 3 steps. €0.50.
- **repo-health-check**: 4 steps. €0.22.
- **domain-security-check**: 6 steps. €0.52. Replaces 3 deactivated solutions.

### Pending (next session)
- Monitor Jina + scheduling impact on Browserless costs (check after 24-48h)
- Netherlands property vertical (BAG + WOZ + EP-Online — 3 confirmed free APIs)
- Fixture snapshot system for scraping tests (biggest remaining cost reduction)
- Post Reddit replies (r/LLMDevs CI/CD thread, r/AgentsOfAI agents-as-APIs thread)
- uk-school-ratings if a free JSON API is found (Ofsted/DfE registration)

### DB changes applied directly (not via migration)
- maintenance_class column added (migration file 0044 exists but was applied via direct SQL)
- All capability/solution price updates, maintenance_class backfills, schedule tier backfills
- New capabilities and solutions inserted via onboarding scripts
- CBEAPI_KEY added to Railway env vars

### Notion
- Journal entry: "Property vertical launched" (2026-04-11)
- Journal entry: "Property vertical expansion — UK gaps + 5 international markets" (research)
- Notion todo items need updating (dynamic pricing, output_schema, orphan resolution → done)
