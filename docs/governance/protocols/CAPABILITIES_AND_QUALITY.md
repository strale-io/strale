---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Capabilities & Quality"
moved_at: 2026-10-24
---

# Capabilities & Quality

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.
<!-- Reminder: changes to capabilities, SDKs, or integrations require updating public/llms.txt in strale-frontend -->
290+ capabilities across 7 verticals (company-data, compliance, developer-tools, finance, data-processing, web-scraping, monitoring) plus 100+ bundled solutions across 6 categories. Full catalog: GET /v1/capabilities. Solutions: GET /v1/solutions. Counts grow frequently — check `manifests/*.yaml` and recent git log for exact current numbers.

**x402 Payment Gateway (March 2026):**
All capabilities and solutions available via x402 pay-per-use USDC payments on Base mainnet. No signup or API key needed — payment IS the auth. DB-driven: adding capabilities to x402 requires only `UPDATE capabilities SET x402_enabled = true`. Catalog: GET /x402/catalog. Discovery: GET /.well-known/x402.json. Wildcard handler: GET/POST /x402/:slug.

**New capabilities (March 2026):**
- `pep-check` — Dilisense consolidated PEP database (230+ territories, EU C/2023/724-aligned, RCAs included). Category: compliance. Price: €0.05. Transparency: algorithmic. Uses DILISENSE_API_KEY. (OpenSanctions previously primary with Dilisense fallback; OS dropped 2026-04-27 commit `16ca790` — single-vendor on Dilisense per DEC-20260429-A.)
- `adverse-media-check` — Dilisense Adverse Media (235k+ news sources, FATF-categorized) primary; Serper.dev (Google) fallback with deterministic keyword classification. No LLM. Category: compliance. Price: €0.20. Transparency: algorithmic. Uses DILISENSE_API_KEY (primary) + SERPER_API_KEY (fallback). Risk-level rule documented in output via `risk_level_thresholds`.
- `risk-narrative-generate` — AI synthesis of structured check results into plain-language risk narrative. Category: agent-tooling. Price: €0.05. Transparency: ai_generated. Uses ANTHROPIC_API_KEY.
- `au-company-data` — Australian Business Register (ABR) lookup by ABN. Category: company-data. Price: €0.05. Transparency: algorithmic. Uses ABN_LOOKUP_GUID.

**New solutions (March 2026):**
- KYB Essentials (×20 countries) — Quick company verification. 3-4 checks, €1.50. Slug: `kyb-essentials-{cc}`
- KYB Complete (×20 countries) — Full compliance check with risk narrative. 11-14 checks, €2.50. Slug: `kyb-complete-{cc}`
- Invoice Verify (×20 countries) — Invoice fraud detection with risk narrative. 12-14 checks, €2.50. Slug: `invoice-verify-{cc}`
- Countries: SE, NO, DK, FI, UK, DE, FR, NL, BE, AT, IE, ES, IT, CH, PL, PT, US, CA, AU, SG
- Predecessors that overlap the KYB families: kyc-sweden, kyc-norway, kyc-denmark, kyc-finland, verify-us-company. This file previously recorded them as deprecated with `isActive: false`; production contradicted that on 2026-08-14. Status is deliberately not restated here — read `is_active` / `x402_enabled` from the `solutions` table (per the drift-prevention rule below) before acting on them, and do not deactivate any of them on the strength of a line in this file.

SQS scoring engine deleted per DEC-20260503-B (PR1 shipped 2026-05-05). The dual-profile model (QP + RP + 5×5 matrix), the `min_sqs` request parameter on POST /v1/do, the platform floor SQS gate, the floor-aware solution SQS rule, the public `/v1/quality/:slug` endpoint, and the automatic lifecycle transitions (probation→active, active→degraded, degraded→active, degraded→suspended) are all gone. PR2 will drop the residual schema columns (`qp_score`, `rp_score`, `matrix_sqs`, `matrix_sqs_raw`, `trend`, `guidance_*`) and the `sqs_daily_snapshot` table, and rename `capability_health` → `source_health`. Test scheduling now filters on `test_suites.scheduled_testing_eligible = TRUE` (DEC-20260503-B), with `external_cost_cents = 0` as the underlying source of truth. A startup migration rewrites the flag on every boot: `SET scheduled_testing_eligible = (external_cost_cents = 0)`. Consequence: hand-editing `scheduled_testing_eligible` is silently reverted at the next deploy; `external_cost_cents` is the only durable knob even though it appears billing-only. Paid capabilities are not proactively tested; quality signals come from production observability, piggyback test suites, and any zero-cost auth-less probes the vendor permits. Circuit-breaker logic on `capability_health` survives. Fixture and canary test modes survive.

Free-tier: 11 capabilities as of 2026-08 (email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate, plus 6 crypto address validators: bitcoin/eth/solana/tron/dogecoin/xrp-address-validate) require no auth/signup. Canonical list is `is_free_tier = true` in the capabilities table, surfaced via `GET /v1/platform/facts` (`free_tier_slugs`) — check there before quoting a count. IP-based daily rate limit (10/day, enforced via DB counter in do.ts using `rateLimitByIp`). Authenticated users calling free-tier capabilities get normal rate limits and no wallet debit.

Testing: test_suites table has `test_mode` column: `live` (calls real API), `fixture` (uses saved data, €0 external cost), `canary` (periodic live check at reduced frequency). `external_cost_cents` tracks estimated external API cost per test execution.

Stripe is LIVE in production (sk_live_ key on Railway). Local .env uses sk_test_ for development.
