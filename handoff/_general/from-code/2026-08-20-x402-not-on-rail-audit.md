# 2026-08-20 — x402_not_on_rail audit (no code changes)

Intent: audit the 8 capabilities the /activity synthesis flagged as `x402_not_on_rail` demand misses and enable x402 on the ones that clear the quality bar. Quick mode.

## Finding: none of the 8 should be enabled — all correctly gated

The /activity framing ("flip x402_enabled" is the highest-leverage follow-up) was wrong once investigated. All 8 slugs (product-search, salary-benchmark, employer-review-summary, australian-company-data, dutch-company-data, business-license-check-se, annual-report-extract, trustpilot-score) are `is_active: false` in the DB, not merely missing an x402 flag.

- **6 are in `auto-register.ts`'s `DEACTIVATED` map** with documented reasons: Tier-1 scraping-doctrine violations (DEC-20260428-A — Glassdoor/Trustpilot/Google ToS bans) or "no compliant source exists" findings (no free Swedish F-skatt API, annual-report PDFs behind a paid ordering service, product-search's only source was a closed ccTLD-evasion scrape). Every one names a reactivation trigger, and every trigger is a licensed vendor contract — a Petter-only spend/vendor decision, not a code fix.
- **`dutch-company-data`** isn't in the DEACTIVATED map — it has a working Openapi.com WW-Top path — but is gated behind `OPENAPI_ENABLED`, which requires the resale addendum (case 151296) to countersign first. Confirmed unset both locally and on Railway prod. Also Petter-only (legally binding Moonlighter AB matter).
- **`australian-company-data`** is a deactivated duplicate of `au-company-data`, which is already `is_active: true` + `x402_enabled: true`. The demand is already served under the correct slug — nothing to fix. Same likely true for product-search's sibling `price-compare` (also already live + x402-enabled), though the /activity misses used the deactivated slug name specifically.

## No action taken
Zero DB writes. This was pure investigation; the correct next step for the 6 ToS-blocked capabilities and dutch-company-data is Petter deciding whether to pursue the named vendor contracts, not something I can decide-then-tell my way into.

## Memory updated
[project_x402_not_on_rail_check_deactivated_first.md](../../../..%2F.claude%2Fprojects%2FC--Users-pette-Projects-strale%2Fmemory%2Fproject_x402_not_on_rail_check_deactivated_first.md) — future `/activity` sessions should check `is_active` + the DEACTIVATED map before recommending x402 enablement as a quick win.
