# Capability Disposition (generated) — 2026-08-12

Readiness program artifact (DEC-20260812-A). Source: production sweep `prod-sweep-2026-08-12.jsonl` + external traffic (internal accounts excluded). **Buckets are proposals for the P1 pass, not actions — nothing has been delisted or deactivated by this script.**

Coverage: 299 active capabilities, 299 in this table.

**Floor rule applied (DEC-20260812-A, verbatim):** ≥10 external calls in the last 30 days; completion <70% → quarantine proposal; <30% → deactivate proposal. The 90d columns are context only.

**What this cannot see:** the sweep sends one canned fixture input per capability, so it measures "does the declared contract hold for a known-good input" — not the real-input failure modes the 30d completion column captures, and not well-formed-but-empty responses (the dishonest-output class, deferred to P1).

**Bucket legend:** `keep` verified + traffic healthy · `fix` named defect (fixture, config, schema gate, or execution) · `quarantine-proposal` / `deactivate-proposal` below the traffic floor · `retire-candidate` broken in sweep AND below deactivate floor · `not-verified` sweep could not produce a verdict (breaker open, no fixture) · `unverified-by-policy` vendor denylisted · `excluded` see reason.

**Sweep-code legend:** PASS assertions hold · FIXTURE_FAIL assertions fail · ROUTE_REJECTED input schema blocks the fixture · EXEC_FAIL_ENV/_UPSTREAM execution failed (config / upstream) · CIRCUIT_OPEN breaker was open · NO_EXECUTOR_DEPLOYED catalog row without code · ASYNC_TIMEOUT no terminal status in 180s. Sample-size caveat: completion % on <10 calls is noise, not signal.

| Bucket | Count |
|---|---|
| keep | 269 |
| fix | 14 |
| quarantine-proposal | 3 |
| deactivate-proposal | 1 |
| retire-candidate | 0 |
| not-verified | 4 |
| unverified-by-policy | 7 |
| excluded | 1 |

## keep (269)

| Capability | Sweep | 30d calls | 30d compl. | 90d calls | 90d compl. | 90d revenue | Reason |
|---|---|---|---|---|---|---|---|
| email-validate | PASS | 368 | 100% | 472 | 100% | €12.60 | prod-verified |
| google-search | PASS | 235 | 100% | 336 | 100% | €33.50 | prod-verified |
| tech-stack-detect | PASS | 210 | 80% | 222 | 79% | €5.25 | prod-verified |
| url-to-markdown | PASS | 50 | 70% | 202 | 72% | €1.60 | prod-verified |
| keyword-suggest | PASS | 147 | 100% | 189 | 100% | €5.67 | prod-verified |
| email-deliverability-check | PASS | 136 | 100% | 139 | 100% | €6.95 | prod-verified |
| serp-analyze | PASS | 90 | 100% | 95 | 100% | €14.25 | prod-verified |
| company-industry-classify | PASS | 1 | 0% | 50 | 88% | €2.20 | prod-verified |
| address-geocode | PASS | 2 | 100% | 48 | 100% | €0.96 | prod-verified |
| startup-domain-check | PASS | 41 | 100% | 47 | 100% | €2.35 | prod-verified |
| weather-lookup | PASS | 34 | 94% | 43 | 81% | €1.75 | prod-verified |
| social-post-generate | PASS | 13 | 77% | 36 | 86% | €1.55 | prod-verified |
| dns-lookup | PASS | 28 | 89% | 33 | 91% | €0.27 | prod-verified |
| barcode-lookup | PASS | 25 | 100% | 31 | 100% | €1.55 | prod-verified |
| backlink-check | PASS | 24 | 100% | 30 | 100% | €4.50 | prod-verified |
| domain-reputation | PASS | 22 | 100% | 24 | 100% | €1.20 | prod-verified |
| fear-greed-index | PASS | 17 | 100% | 24 | 100% | €0.48 | prod-verified |
| invoice-validate | PASS | 8 | 75% | 24 | 92% | €0.44 | prod-verified |
| uk-company-data | PASS | 18 | 94% | 24 | 79% | €0.95 | prod-verified |
| iban-validate | PASS | 17 | 100% | 23 | 100% | €0.15 | prod-verified |
| brand-mention-search | PASS | 9 | 100% | 20 | 100% | €6.00 | prod-verified |
| uptime-check | PASS | 15 | 100% | 20 | 100% | €0.40 | prod-verified |
| wallet-transactions-lookup | PASS | 14 | 100% | 20 | 100% | €0.40 | prod-verified |
| invoice-extract | PASS | 1 | 0% | 19 | 63% | €6.00 | prod-verified |
| exchange-rate | PASS | 9 | 89% | 18 | 67% | €0.24 | prod-verified |
| pricing-page-extract | PASS | 15 | 87% | 18 | 89% | €4.80 | prod-verified |
| sitemap-parse | PASS | 10 | 80% | 17 | 59% | €0.50 | prod-verified |
| wallet-age-check | PASS | 10 | 100% | 16 | 100% | €0.32 | prod-verified |
| github-user-profile | PASS | 6 | 67% | 15 | 87% | €0.65 | prod-verified |
| seo-audit | PASS | 10 | 100% | 15 | 100% | €4.50 | prod-verified |
| company-enrich | PASS | 9 | 100% | 14 | 93% | €6.50 | prod-verified |
| page-speed-test | PASS | 10 | 70% | 14 | 79% | €0.55 | prod-verified |
| job-posting-analyze | PASS | 4 | 75% | 13 | 54% | €1.40 | prod-verified |
| price-compare | PASS | 8 | 50% | 13 | 38% | €1.00 | prod-verified |
| prompt-optimize | PASS | 0 | — | 13 | 54% | €1.05 | prod-verified |
| sentiment-analyze | PASS | 1 | 100% | 13 | 100% | €0.65 | prod-verified |
| web-extract | PASS | 6 | 33% | 13 | 62% | €1.05 | prod-verified |
| job-board-search | PASS | 7 | 100% | 12 | 100% | €2.40 | prod-verified |
| product-search | PASS | 6 | 17% | 12 | 58% | €1.05 | prod-verified |
| stock-quote | PASS | 7 | 86% | 12 | 92% | €0.55 | prod-verified |
| currency-convert | PASS | 6 | 100% | 11 | 100% | €0.22 | prod-verified |
| domain-age-check | PASS | 7 | 100% | 11 | 100% | €0.33 | prod-verified |
| gdpr-fine-lookup | PASS | 1 | 0% | 11 | 27% | €0.60 | prod-verified |
| image-resize | PASS | 2 | 0% | 11 | 27% | €0.09 | prod-verified |
| ssl-check | PASS | 9 | 56% | 11 | 64% | €0.21 | prod-verified |
| whois-lookup | PASS | 9 | 100% | 11 | 100% | €0.55 | prod-verified |
| charity-lookup-uk | PASS | 1 | 0% | 10 | 20% | €0.10 | prod-verified |
| credit-score-band | PASS | 7 | 100% | 10 | 100% | €0.20 | prod-verified |
| error-explain | PASS | 0 | — | 10 | 100% | €0.50 | prod-verified |
| french-company-data | PASS | 3 | 67% | 10 | 50% | €0.25 | prod-verified |
| json-repair | PASS | 3 | 100% | 10 | 100% | €0.20 | prod-verified |
| npm-package-info | PASS | 2 | 100% | 10 | 100% | €0.50 | prod-verified |
| pypi-package-info | PASS | 7 | 100% | 10 | 100% | €0.50 | prod-verified |
| ssl-certificate-chain | PASS | 1 | 0% | 10 | 40% | €0.20 | prod-verified |
| email-reputation-score | PASS | 6 | 100% | 9 | 100% | €0.27 | prod-verified |
| finnish-company-data | PASS | 2 | 0% | 9 | 22% | €0.10 | prod-verified |
| gas-price-check | PASS | 0 | — | 9 | 67% | €0.12 | prod-verified |
| github-repo-analyze | PASS | 5 | 100% | 9 | 78% | €0.35 | prod-verified |
| lei-lookup | PASS | 3 | 67% | 9 | 44% | €0.20 | prod-verified |
| log-parse | PASS | 3 | 100% | 9 | 100% | €0.45 | prod-verified |
| meeting-notes-extract | PASS | 0 | — | 9 | 100% | €1.80 | prod-verified |
| password-strength | PASS | 7 | 100% | 9 | 100% | €0.18 | prod-verified |
| phone-validate | PASS | 4 | 100% | 9 | 100% | €0.14 | prod-verified |
| social-profile-check | PASS | 5 | 100% | 9 | 100% | €0.45 | prod-verified |
| stablecoin-flow-check | PASS | 1 | 0% | 9 | 78% | €0.14 | prod-verified |
| timezone-lookup | PASS | 6 | 100% | 9 | 100% | €0.18 | prod-verified |
| token-count | PASS | 5 | 100% | 9 | 100% | €0.18 | prod-verified |
| token-security-check | PASS | 4 | 100% | 9 | 100% | €0.18 | prod-verified |
| uk-companies-house-officers | PASS | 2 | 0% | 9 | 33% | €0.15 | prod-verified |
| address-parse | PASS | 6 | 100% | 8 | 100% | €0.40 | prod-verified |
| api-docs-generate | PASS | 1 | 0% | 8 | 25% | €0.40 | prod-verified |
| company-id-detect | PASS | 6 | 100% | 8 | 100% | €0.40 | prod-verified |
| company-tech-stack | PASS | 1 | 100% | 8 | 100% | €2.40 | prod-verified |
| customs-duty-lookup | PASS | 0 | — | 8 | 100% | €1.60 | prod-verified |
| date-parse | PASS | 5 | 100% | 8 | 100% | €0.24 | prod-verified |
| dependency-audit | PASS | 1 | 0% | 8 | 25% | €0.10 | prod-verified |
| env-template-generate | PASS | 1 | 0% | 8 | 25% | €0.10 | prod-verified |
| markdown-to-html | PASS | 5 | 100% | 8 | 100% | €0.16 | prod-verified |
| phone-normalize | PASS | 6 | 100% | 8 | 100% | €0.24 | prod-verified |
| structured-scrape | PASS | 3 | 0% | 8 | 25% | €0.40 | prod-verified |
| translate | PASS | 2 | 100% | 8 | 100% | €0.40 | prod-verified |
| code-review | PASS | 0 | — | 7 | 57% | €0.80 | prod-verified |
| cve-lookup | PASS | 3 | 100% | 7 | 100% | €0.35 | prod-verified |
| eu-trademark-search | PASS | 1 | 100% | 7 | 100% | €3.50 | prod-verified |
| header-security-check | PASS | 4 | 100% | 7 | 100% | €0.35 | prod-verified |
| holiday-calendar | PASS | 4 | 100% | 7 | 100% | €0.14 | prod-verified |
| meta-extract | PASS | 2 | 50% | 7 | 86% | €0.15 | prod-verified |
| redirect-trace | PASS | 3 | 100% | 7 | 86% | €0.30 | prod-verified |
| secret-scan | PASS | 5 | 100% | 7 | 100% | €0.14 | prod-verified |
| sql-explain | PASS | 5 | 100% | 7 | 100% | €0.35 | prod-verified |
| wallet-balance-lookup | PASS | 4 | 100% | 7 | 100% | €0.14 | prod-verified |
| employment-cost-estimate | PASS | 2 | 0% | 6 | 67% | €0.12 | prod-verified |
| forex-history | PASS | 0 | — | 6 | 17% | €0.05 | prod-verified |
| link-extract | PASS | 3 | 67% | 6 | 83% | €0.15 | prod-verified |
| og-image-check | PASS | 1 | 0% | 6 | 50% | €0.15 | prod-verified |
| swedish-company-data | PASS | 2 | 100% | 6 | 100% | €0.30 | prod-verified |
| swift-message-parse | PASS | 0 | — | 6 | 100% | €0.12 | prod-verified |
| canadian-company-data | PASS | 0 | — | 5 | 100% | €4.00 | prod-verified |
| container-track | PASS | 2 | 100% | 5 | 100% | €0.25 | prod-verified |
| country-tax-rates | PASS | 1 | 0% | 5 | 80% | €0.08 | prod-verified |
| country-trade-data | PASS | 2 | 100% | 5 | 100% | €1.00 | prod-verified |
| email-draft | PASS | 2 | 100% | 5 | 100% | €0.25 | prod-verified |
| financial-year-dates | PASS | 0 | — | 5 | 100% | €0.10 | prod-verified |
| flight-status | PASS | 1 | 100% | 5 | 100% | €0.25 | prod-verified |
| pdf-extract | PASS | 0 | — | 5 | 0% | €0.00 | prod-verified |
| phone-type-detect | PASS | 2 | 100% | 5 | 100% | €0.10 | prod-verified |
| pr-description-generate | PASS | 0 | — | 5 | 100% | €0.25 | prod-verified |
| privacy-policy-analyze | PASS | 0 | — | 5 | 80% | €1.20 | prod-verified |
| protocol-fees-lookup | PASS | 1 | 0% | 5 | 80% | €0.08 | prod-verified |
| readme-generate | PASS | 0 | — | 5 | 0% | €0.00 | prod-verified |
| receipt-categorize | PASS | 1 | 0% | 5 | 40% | €0.10 | prod-verified |
| return-policy-extract | PASS | 0 | — | 5 | 0% | €0.00 | prod-verified |
| robots-txt-parse | PASS | 1 | 100% | 5 | 100% | €0.10 | prod-verified |
| schema-infer | PASS | 0 | — | 5 | 0% | €0.00 | prod-verified |
| sepa-xml-validate | PASS | 0 | — | 5 | 100% | €0.10 | prod-verified |
| swiss-company-data | PASS | 0 | — | 5 | 0% | €0.00 | prod-verified |
| terms-of-service-extract | PASS | 0 | — | 5 | 0% | €0.00 | prod-verified |
| vat-validate | PASS | 0 | — | 5 | 100% | €0.10 | prod-verified |
| au-company-data | PASS | 1 | 0% | 4 | 75% | €0.15 | prod-verified |
| code-convert | PASS | 0 | — | 4 | 75% | €0.15 | prod-verified |
| contract-verify-check | PASS | 0 | — | 4 | 100% | €0.08 | prod-verified |
| gdpr-website-check | PASS | 0 | — | 4 | 100% | €0.40 | prod-verified |
| japanese-company-data | PASS | 0 | — | 4 | 100% | €3.20 | prod-verified |
| jwt-decode | PASS | 1 | 0% | 4 | 75% | €0.06 | prod-verified |
| language-detect | PASS | 0 | — | 4 | 100% | €0.08 | prod-verified |
| llm-output-validate | PASS | 0 | — | 4 | 100% | €0.20 | prod-verified |
| mx-lookup | PASS | 2 | 100% | 4 | 100% | €0.08 | prod-verified |
| postal-code-lookup | PASS | 2 | 100% | 4 | 100% | €0.08 | prod-verified |
| prompt-compress | PASS | 0 | — | 4 | 50% | €0.06 | prod-verified |
| public-holiday-lookup | PASS | 0 | — | 4 | 100% | €0.12 | prod-verified |
| swift-validate | PASS | 1 | 100% | 4 | 100% | €0.12 | prod-verified |
| tax-id-validate | PASS | 0 | — | 4 | 100% | €0.08 | prod-verified |
| ted-procurement | PASS | 0 | — | 4 | 100% | €2.00 | prod-verified |
| url-health-check | PASS | 0 | — | 4 | 50% | €0.06 | prod-verified |
| webhook-test-payload | PASS | 0 | — | 4 | 50% | €0.10 | prod-verified |
| xml-to-json | PASS | 0 | — | 4 | 100% | €0.12 | prod-verified |
| aml-risk-score | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| api-mock-response | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| business-day-check | PASS | 1 | 0% | 3 | 67% | €0.04 | prod-verified |
| commit-message-generate | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| contract-extract | PASS | 1 | 0% | 3 | 67% | €1.00 | prod-verified |
| cookie-scan | PASS | 0 | — | 3 | 100% | €0.45 | prod-verified |
| crypto-price | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| data-protection-authority-lookup | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| deduplicate | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| diff-json | PASS | 0 | — | 3 | 100% | €0.09 | prod-verified |
| ens-resolve | PASS | 0 | — | 3 | 67% | €0.04 | prod-verified |
| eu-ai-act-classify | PASS | 0 | — | 3 | 100% | €0.60 | prod-verified |
| flatten-json | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| github-actions-generate | PASS | 0 | — | 3 | 100% | €0.45 | prod-verified |
| github-repo-compare | PASS | 1 | 0% | 3 | 67% | €0.10 | prod-verified |
| incoterms-explain | PASS | 0 | — | 3 | 100% | €0.09 | prod-verified |
| insolvency-check | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| ip-geolocation | PASS | 1 | 0% | 3 | 67% | €0.04 | prod-verified |
| ip-risk-score | PASS | 0 | — | 3 | 100% | €0.09 | prod-verified |
| json-to-csv | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| json-to-pydantic | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| json-to-typescript | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| marketplace-fee-calculate | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| name-parse | PASS | 0 | — | 3 | 100% | €0.09 | prod-verified |
| norwegian-company-data | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| openapi-validate | PASS | 0 | — | 3 | 67% | €0.10 | prod-verified |
| package-security-audit | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| paid-api-preflight | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| payment-reference-generate | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| port-lookup | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| protocol-tvl-lookup | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| resume-parse | PASS | 1 | 0% | 3 | 67% | €0.60 | prod-verified |
| shipping-track | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| skill-extract | PASS | 0 | — | 3 | 100% | €0.09 | prod-verified |
| skill-gap-analyze | PASS | 0 | — | 3 | 100% | €0.45 | prod-verified |
| sql-generate | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| ticker-lookup | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| timezone-meeting-find | PASS | 0 | — | 3 | 100% | €0.09 | prod-verified |
| tool-call-validate | PASS | 0 | — | 3 | 100% | €0.15 | prod-verified |
| unit-convert | PASS | 0 | — | 3 | 67% | €0.04 | prod-verified |
| vasp-non-compliant-check | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| vasp-verify | PASS | 0 | — | 3 | 100% | €0.06 | prod-verified |
| vat-rate-lookup | PASS | 0 | — | 3 | 100% | €0.09 | prod-verified |
| work-permit-requirements | PASS | 0 | — | 3 | 67% | €0.04 | prod-verified |
| accessibility-audit | PASS | 0 | — | 2 | 100% | €0.60 | prod-verified |
| address-validate | PASS | 0 | — | 2 | 100% | €0.06 | prod-verified |
| agent-trace-analyze | PASS | 0 | — | 2 | 100% | €0.40 | prod-verified |
| api-health-check | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| bank-bic-lookup | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| blog-post-outline | PASS | 0 | — | 2 | 100% | €0.40 | prod-verified |
| changelog-generate | PASS | 0 | — | 2 | 100% | €0.06 | prod-verified |
| classify-text | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| company-name-match | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| context-window-optimize | PASS | 0 | — | 2 | 100% | €0.06 | prod-verified |
| cron-explain | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| crontab-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| csv-clean | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| csv-to-json | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| curl-to-code | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| dangerous-goods-classify | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| data-quality-check | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| dockerfile-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| docstring-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| ens-reverse-lookup | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| eori-validate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| estonian-company-data | PASS | 0 | — | 2 | 0% | €0.00 | prod-verified |
| eth-address-validate | PASS | 1 | 100% | 2 | 100% | €0.00 | prod-verified |
| fake-data-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| food-safety-rating-uk | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| gitignore-generate | PASS | 0 | — | 2 | 100% | €0.06 | prod-verified |
| hs-code-lookup | PASS | 0 | — | 2 | 100% | €0.06 | prod-verified |
| http-to-curl | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| iban-to-bank | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| id-number-validate | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| isbn-validate | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| jsdoc-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| json-to-zod | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| license-compatibility-check | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| nginx-config-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| openapi-generate | PASS | 0 | — | 2 | 100% | €0.30 | prod-verified |
| phishing-site-check | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| pii-redact | PASS | 0 | — | 2 | 100% | €0.06 | prod-verified |
| polish-company-data | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| port-check | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| regex-explain | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| regex-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| release-notes-generate | PASS | 0 | — | 2 | 100% | €0.06 | prod-verified |
| risk-narrative-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| schema-migration-generate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| shipping-cost-estimate | PASS | 0 | — | 2 | 100% | €0.30 | prod-verified |
| sql-optimize | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| summarize | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| test-case-generate | PASS | 0 | — | 2 | 100% | €0.30 | prod-verified |
| vat-format-validate | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| wallet-risk-score | PASS | 0 | — | 2 | 100% | €0.04 | prod-verified |
| website-carbon-estimate | PASS | 0 | — | 2 | 100% | €0.10 | prod-verified |
| json-schema-validate | PASS | 0 | — | 1 | 100% | €0.02 | prod-verified |
| bitcoin-address-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| company-news | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| croatian-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| cz-bank-account-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| cz-birth-number-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| cz-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| cz-datova-schranka-id-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| cz-ico-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| diff-review | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| docker-hub-info | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| dogecoin-address-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| domain-contact-extract | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| email-validate-bulk | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| gleif-l2-children-lookup | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| gleif-l2-ubo-lookup | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| greek-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| html-to-pdf | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| irish-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| keyword-rank-check | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| landing-page-roast | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| latvian-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| lithuanian-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| nl-bag-address | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| nl-energy-label | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| nl-housing-stats | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| nl-woz-value | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| no-bankruptcy-check | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| sec-filing-events | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| singapore-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| slovak-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| slovenian-company-data | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| solana-address-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| tron-address-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| uk-filing-events | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| workflow-security-audit | PASS | 0 | — | 0 | — | €0.00 | prod-verified |
| xrp-address-validate | PASS | 0 | — | 0 | — | €0.00 | prod-verified |

## fix (14)

| Capability | Sweep | 30d calls | 30d compl. | 90d calls | 90d compl. | 90d revenue | Reason |
|---|---|---|---|---|---|---|---|
| image-to-text | EXEC_FAIL_UPSTREAM | 25 | 64% | 201 | 87% | €8.70 | execution fails in prod: HTTP 500: The capability failed to execute. You were not charged. |
| german-company-data | FIXTURE_FAIL | 10 | 80% | 15 | 73% | €0.55 | fixture assertions fail in prod: company_name[contains="RATIONAL"] got "HRB TREUHAND GMBH Wirtschaftsprüfungsgesellschaft Steuerberatungsgesellschaft"; r |
| danish-company-data | EXEC_FAIL_UPSTREAM | 1 | 0% | 11 | 0% | €0.00 | execution fails in prod: HTTP 500: The capability failed to execute. You were not charged. |
| belgian-company-data | FIXTURE_FAIL | 2 | 50% | 9 | 44% | €0.20 | fixture assertions fail in prod: abbreviation[equals="A.P.I."] got "AB Inbev" |
| eu-regulation-search | EXEC_FAIL_UPSTREAM | 0 | — | 5 | 100% | €1.50 | execution fails in prod: HTTP 500: The capability failed to execute. You were not charged. |
| beneficial-ownership-lookup | FIXTURE_FAIL | 1 | 100% | 4 | 100% | €1.00 | fixture assertions fail in prod: coverage_note[not_null] got undefined |
| llm-cost-calculate | EXEC_FAIL_UPSTREAM | 1 | 0% | 3 | 67% | €0.04 | execution fails in prod: HTTP 500: The capability failed to execute. You were not charged. |
| age-verify | FIXTURE_FAIL | 0 | — | 2 | 100% | €0.04 | fixture assertions fail in prod: meets_minimum[equals=true] got false |
| iso-country-lookup | FIXTURE_FAIL | 0 | — | 2 | 100% | €0.04 | fixture assertions fail in prod: matches[not_null] got undefined; total_matches[not_null] got undefined |
| c2pa-inspect | FIXTURE_FAIL | 0 | — | 0 | — | €0.00 | fixture assertions fail in prod: active_manifest[not_null] got null |
| competitor-compare | ASYNC_TIMEOUT | 0 | — | 0 | — | €0.00 | no terminal status within poll budget (still 'error' after 180s) |
| cz-unreliable-vat-payer | FIXTURE_FAIL | 0 | — | 0 | — | €0.00 | fixture assertions fail in prod: response_generated_at[equals="2026-08-09"] got "2026-08-12" |
| fr-bodacc-lookup | FIXTURE_FAIL | 0 | — | 0 | — | €0.00 | fixture assertions fail in prod: most_recent_announcement_date[equals="2026-02-12"] got "2026-07-03" |
| nl-housing-price-index | FIXTURE_FAIL | 0 | — | 0 | — | €0.00 | fixture assertions fail in prod: latest_period[equals="2026-02"] got "2026-06" |

## quarantine-proposal (3)

| Capability | Sweep | 30d calls | 30d compl. | 90d calls | 90d compl. | 90d revenue | Reason |
|---|---|---|---|---|---|---|---|
| screenshot-url | PASS | 47 | 55% | 58 | 55% | €1.60 | fixture passes but 30d real completion 55% (<70% floor) — investigate real-input failure modes |
| brazilian-company-data | PASS | 29 | 59% | 31 | 61% | €0.95 | fixture passes but 30d real completion 59% (<70% floor) — investigate real-input failure modes |
| url-to-text | PASS | 13 | 54% | 15 | 60% | €0.18 | fixture passes but 30d real completion 54% (<70% floor) — investigate real-input failure modes |

## deactivate-proposal (1)

| Capability | Sweep | 30d calls | 30d compl. | 90d calls | 90d compl. | 90d revenue | Reason |
|---|---|---|---|---|---|---|---|
| product-reviews-extract | PASS | 43 | 12% | 51 | 18% | €2.25 | fixture passes but 30d real completion 12% (<30% floor) — inputs customers actually send fail |

## not-verified (4)

| Capability | Sweep | 30d calls | 30d compl. | 90d calls | 90d compl. | 90d revenue | Reason |
|---|---|---|---|---|---|---|---|
| base64-encode-url | CIRCUIT_OPEN | 0 | — | 39 | 92% | €0.72 | breaker open during sweep — no verdict; re-sweep after recovery (HTTP 503: Capability 'base64-encode-url' is temporarily suspended due to repeate) |
| us-company-data | CIRCUIT_OPEN | 18 | 39% | 26 | 35% | €0.45 | breaker open during sweep — no verdict; re-sweep after recovery (HTTP 503: Capability 'us-company-data' is temporarily suspended due to repeated ) |
| approval-security-check | CIRCUIT_OPEN | 0 | — | 2 | 100% | €0.04 | breaker open during sweep — no verdict; re-sweep after recovery (HTTP 503: Capability 'approval-security-check' is temporarily suspended due to r) |
| us-court-search | CIRCUIT_OPEN | 0 | — | 0 | — | €0.00 | breaker open during sweep — no verdict; re-sweep after recovery (HTTP 503: Capability 'us-court-search' is temporarily suspended due to repeated ) |

## unverified-by-policy (7)

| Capability | Sweep | 30d calls | 30d compl. | 90d calls | 90d compl. | 90d revenue | Reason |
|---|---|---|---|---|---|---|---|
| sanctions-check | DENYLISTED | 5 | 100% | 7 | 100% | €1.40 | vendor denylisted (Dilisense — same) — verify via piggyback/real traffic |
| pep-check | DENYLISTED | 3 | 100% | 6 | 100% | €0.30 | vendor denylisted (Dilisense — informal Starter-tier grace, do not burn quota) — verify via piggyback/real traffic |
| adverse-media-check | DENYLISTED | 0 | — | 2 | 100% | €0.40 | vendor denylisted (Dilisense — same) — verify via piggyback/real traffic |
| uk-cop-check | DENYLISTED | 0 | — | 0 | — | €0.00 | vendor denylisted (Pay.UK CoP via eSortcode — metered scheme access) — verify via piggyback/real traffic |
| us-company-data-cobalt | DENYLISTED | 0 | — | 0 | — | €0.00 | vendor denylisted (Cobalt Intelligence, €2.00/call) — verify via piggyback/real traffic |
| us-ein-match | DENYLISTED | 0 | — | 0 | — | €0.00 | vendor denylisted (€0.75/call) — verify via piggyback/real traffic |
| us-sec-filings-extended | DENYLISTED | 0 | — | 0 | — | €0.00 | vendor denylisted (€0.25/call, paired with the Cobalt stack) — verify via piggyback/real traffic |

## excluded (1)

| Capability | Sweep | 30d calls | 30d compl. | 90d calls | 90d compl. | 90d revenue | Reason |
|---|---|---|---|---|---|---|---|
| page-exists | NO_EXECUTOR_DEPLOYED | 0 | — | 0 | — | €0.00 | in-flight onboarding (created 2026-08-12, visible=false, x402=false) — not yet deployed, another session owns it |
