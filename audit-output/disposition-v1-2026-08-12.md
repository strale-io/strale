# Capability Disposition v1 — 2026-08-12

Readiness P0 exit artifact (DEC-20260812-A). Source: production sweep (prod-sweep-2026-08-12.jsonl) + 90-day external traffic. Buckets are proposals for P1, not actions.

## Analysis (read this before the tables)

**Headline: 273 of 299 active capabilities (91%) completed a real production call with all
declared assertions passing.** The catalog is materially healthier than the failure-rate
narrative suggested — but the remaining 9% contains every class of defect the program predicted.

**Persistent execution failures (8):**
- `danish-company-data` — known vendor quota exhaustion (cvrapi.dk free tier); the fix is the
  official datacvr.virk.dk access application, already on the backlog.
- `image-to-text`, `us-company-data` — stale fixtures (dead URL / "Google"-vs-EDGAR), both filed
  2026-08-09; us-company-data's resolution also changes in open PR #171.
- `base64-encode-url`, `llm-cost-calculate`, `approval-security-check` — **fixture-input-specific
  failures with healthy real traffic** (92% / 67% / 100% real completion). base64-encode-url's
  fixture depends on httpbin.org (notoriously flaky); llm-cost-calculate's fixture likely names a
  model absent from its price table. Fixture defects wearing capability-defect costumes.
- `eu-regulation-search`, `us-court-search` — genuine failures, need P1 triage.

**Fixture-defect classes among FIXTURE_FAIL (9):**
- *Volatile-field `equals` assertions* (cz-unreliable-vat-payer, fr-bodacc-lookup,
  nl-housing-price-index): fixtures assert `equals` on dates that legitimately advance. Test-design
  defect — the pipeline should refuse `equals` on volatile fields (P2 guard candidate).
- *Wrong-company resolution* (`german-company-data` returned "HRB TREUHAND GMBH" for a RATIONAL
  query): **the #161 class, live in production for DE.** Highest-severity finding of the sweep.
  Fix = apply `classifyNameMatch` scoring as done for FI/NO/EE/CH. `belgian-company-data`'s
  abbreviation mismatch needs the same look.
- *Output-schema drift* (iso-country-lookup, beneficial-ownership-lookup): asserted fields no
  longer exist in output. Executor changed after fixture creation; nothing re-verified — exactly
  what this sweep now catches.
- *Input-dependent* (age-verify `meets_minimum` flipped, c2pa-inspect manifest null): individual
  triage.

**First application of the DEC-20260812-A quality floor (traffic-based):** product-reviews-extract
(18% on 51 calls), charity-lookup-uk (20%), gdpr-fine-lookup (27%), image-resize (27%) fall below
the 30–70% band on ≥10 calls. They pass the sweep — their fixtures work — but the inputs real
customers send fail. The quarantine *mechanism* (delist-from-catalog while keeping explicit-slug
reachability) does not exist yet; it is the P3 build. Until then these four are quarantine
**proposals** — nothing was delisted today.

**Operational notes:**
- The sweep's retry passes tripped circuit breakers (3-consecutive-failure threshold) on 8
  capabilities; three with healthy real traffic were deliberately recovered post-sweep via one
  known-good call each after `next_retry_at`. Harness lesson recorded: cap attempts per failing
  slug per day below the breaker threshold.
- `page-exists` (HTTP 503, registered-no-executor) is another session's in-flight onboarding
  created 2026-08-12 09:17 — `visible=false`, `x402_enabled=false`, correctly dark. Excluded.
- One-off ~130ms HTTP 502s ("Application failed to respond") recurred on random slugs across
  passes — Railway edge/instance blips, all resolved on retry. Worth watching as an infra signal.
- Cost: **€0.79 external vendor spend** of the €25 cap; ~€45 in internal wallet cycling;
  denylist held (7 capabilities never called).

| Bucket | Count |
|---|---|
| keep | 255 |
| fix | 33 |
| quarantine | 4 |
| retire-candidate | 0 |
| unverified | 7 |

## fix (33)

| Capability | Sweep | 90d calls | Completion | Revenue | Reason |
|---|---|---|---|---|---|
| image-to-text | HTTP_OTHER | 201 | 87% | €8.70 | HTTP_OTHER: HTTP 500: The capability failed to execute. You were not charged. |
| screenshot-url | PASS | 58 | 55% | €1.60 | sweep passes but real completion 55% — investigate real-input failure modes |
| base64-encode-url | HTTP_OTHER | 39 | 92% | €0.72 | HTTP_OTHER: HTTP 503: Capability 'base64-encode-url' is temporarily suspended due to repeated failures. |
| brazilian-company-data | PASS | 31 | 61% | €0.95 | sweep passes but real completion 61% — investigate real-input failure modes |
| us-company-data | HTTP_OTHER | 26 | 35% | €0.45 | HTTP_OTHER: HTTP 503: Capability 'us-company-data' is temporarily suspended due to repeated failures. |
| invoice-extract | PASS | 19 | 63% | €6.00 | sweep passes but real completion 63% — investigate real-input failure modes |
| exchange-rate | PASS | 18 | 67% | €0.24 | sweep passes but real completion 67% — investigate real-input failure modes |
| sitemap-parse | PASS | 17 | 59% | €0.50 | sweep passes but real completion 59% — investigate real-input failure modes |
| german-company-data | FIXTURE_FAIL | 15 | 73% | €0.55 | fixture assertions fail in prod: company_name[contains="RATIONAL"] got "HRB TREUHAND GMBH Wirtschaftsprüfungsgesellschaft Steuerberatungsgesellschaft"; r |
| url-to-text | PASS | 15 | 60% | €0.18 | sweep passes but real completion 60% — investigate real-input failure modes |
| job-posting-analyze | PASS | 13 | 54% | €1.40 | sweep passes but real completion 54% — investigate real-input failure modes |
| price-compare | PASS | 13 | 38% | €1.00 | sweep passes but real completion 38% — investigate real-input failure modes |
| prompt-optimize | PASS | 13 | 54% | €1.05 | sweep passes but real completion 54% — investigate real-input failure modes |
| web-extract | PASS | 13 | 62% | €1.05 | sweep passes but real completion 62% — investigate real-input failure modes |
| product-search | PASS | 12 | 58% | €1.05 | sweep passes but real completion 58% — investigate real-input failure modes |
| danish-company-data | HTTP_OTHER | 11 | 0% | €0.00 | HTTP_OTHER: HTTP 500: The capability failed to execute. You were not charged. |
| ssl-check | PASS | 11 | 64% | €0.21 | sweep passes but real completion 64% — investigate real-input failure modes |
| french-company-data | PASS | 10 | 50% | €0.25 | sweep passes but real completion 50% — investigate real-input failure modes |
| ssl-certificate-chain | PASS | 10 | 40% | €0.20 | sweep passes but real completion 40% — investigate real-input failure modes |
| belgian-company-data | FIXTURE_FAIL | 9 | 44% | €0.20 | fixture assertions fail in prod: abbreviation[equals="A.P.I."] got "AB Inbev" |
| eu-regulation-search | HTTP_OTHER | 5 | 100% | €1.50 | HTTP_OTHER: HTTP 500: The capability failed to execute. You were not charged. |
| beneficial-ownership-lookup | FIXTURE_FAIL | 4 | 100% | €1.00 | fixture assertions fail in prod: coverage_note[not_null] got undefined |
| llm-cost-calculate | HTTP_OTHER | 3 | 67% | €0.04 | HTTP_OTHER: HTTP 500: The capability failed to execute. You were not charged. |
| age-verify | FIXTURE_FAIL | 2 | 100% | €0.04 | fixture assertions fail in prod: meets_minimum[equals=true] got false |
| approval-security-check | HTTP_OTHER | 2 | 100% | €0.04 | HTTP_OTHER: HTTP 503: Capability 'approval-security-check' is temporarily suspended due to repeated failures. |
| iso-country-lookup | FIXTURE_FAIL | 2 | 100% | €0.04 | fixture assertions fail in prod: matches[not_null] got undefined; total_matches[not_null] got undefined |
| c2pa-inspect | FIXTURE_FAIL | 0 | — | €0.00 | fixture assertions fail in prod: active_manifest[not_null] got null |
| competitor-compare | ASYNC_TIMEOUT | 0 | — | €0.00 | no terminal status within poll budget (still 'error' after 180s) |
| cz-unreliable-vat-payer | FIXTURE_FAIL | 0 | — | €0.00 | fixture assertions fail in prod: response_generated_at[equals="2026-08-09"] got "2026-08-12" |
| fr-bodacc-lookup | FIXTURE_FAIL | 0 | — | €0.00 | fixture assertions fail in prod: most_recent_announcement_date[equals="2026-02-12"] got "2026-07-03" |
| nl-housing-price-index | FIXTURE_FAIL | 0 | — | €0.00 | fixture assertions fail in prod: latest_period[equals="2026-02"] got "2026-06" |
| page-exists | HTTP_OTHER | 0 | — | €0.00 | HTTP_OTHER: HTTP 503: Capability 'page-exists' is registered but has no executor. |
| us-court-search | HTTP_OTHER | 0 | — | €0.00 | HTTP_OTHER: HTTP 503: Capability 'us-court-search' is temporarily suspended due to repeated failures. |

## quarantine (4)

| Capability | Sweep | 90d calls | Completion | Revenue | Reason |
|---|---|---|---|---|---|
| product-reviews-extract | PASS | 51 | 18% | €2.25 | sweep passes but real completion 18% — inputs customers actually send fail |
| gdpr-fine-lookup | PASS | 11 | 27% | €0.60 | sweep passes but real completion 27% — inputs customers actually send fail |
| image-resize | PASS | 11 | 27% | €0.09 | sweep passes but real completion 27% — inputs customers actually send fail |
| charity-lookup-uk | PASS | 10 | 20% | €0.10 | sweep passes but real completion 20% — inputs customers actually send fail |

## unverified (7)

| Capability | Sweep | 90d calls | Completion | Revenue | Reason |
|---|---|---|---|---|---|
| sanctions-check | DENYLISTED | 7 | 100% | €1.40 | vendor denylisted (Dilisense — same) — verify via piggyback/real traffic |
| pep-check | DENYLISTED | 6 | 100% | €0.30 | vendor denylisted (Dilisense — informal Starter-tier grace, do not burn quota) — verify via piggyback/real traffic |
| adverse-media-check | DENYLISTED | 2 | 100% | €0.40 | vendor denylisted (Dilisense — same) — verify via piggyback/real traffic |
| uk-cop-check | DENYLISTED | 0 | — | €0.00 | vendor denylisted (Pay.UK CoP via eSortcode — metered scheme access) — verify via piggyback/real traffic |
| us-company-data-cobalt | DENYLISTED | 0 | — | €0.00 | vendor denylisted (Cobalt Intelligence, €2.00/call) — verify via piggyback/real traffic |
| us-ein-match | DENYLISTED | 0 | — | €0.00 | vendor denylisted (€0.75/call) — verify via piggyback/real traffic |
| us-sec-filings-extended | DENYLISTED | 0 | — | €0.00 | vendor denylisted (€0.25/call, paired with the Cobalt stack) — verify via piggyback/real traffic |

## keep (255)

| Capability | Sweep | 90d calls | Completion | Revenue | Reason |
|---|---|---|---|---|---|
| email-validate | PASS | 472 | 100% | €12.60 | prod-verified |
| google-search | PASS | 336 | 100% | €33.50 | prod-verified |
| tech-stack-detect | PASS | 222 | 79% | €5.25 | prod-verified |
| url-to-markdown | PASS | 202 | 72% | €1.60 | prod-verified |
| keyword-suggest | PASS | 189 | 100% | €5.67 | prod-verified |
| email-deliverability-check | PASS | 139 | 100% | €6.95 | prod-verified |
| serp-analyze | PASS | 95 | 100% | €14.25 | prod-verified |
| company-industry-classify | PASS | 50 | 88% | €2.20 | prod-verified |
| address-geocode | PASS | 48 | 100% | €0.96 | prod-verified |
| startup-domain-check | PASS | 47 | 100% | €2.35 | prod-verified |
| weather-lookup | PASS | 43 | 81% | €1.75 | prod-verified |
| social-post-generate | PASS | 36 | 86% | €1.55 | prod-verified |
| dns-lookup | PASS | 33 | 91% | €0.27 | prod-verified |
| barcode-lookup | PASS | 31 | 100% | €1.55 | prod-verified |
| backlink-check | PASS | 30 | 100% | €4.50 | prod-verified |
| domain-reputation | PASS | 24 | 100% | €1.20 | prod-verified |
| fear-greed-index | PASS | 24 | 100% | €0.48 | prod-verified |
| invoice-validate | PASS | 24 | 92% | €0.44 | prod-verified |
| iban-validate | PASS | 23 | 100% | €0.15 | prod-verified |
| uk-company-data | PASS | 21 | 76% | €0.80 | prod-verified |
| brand-mention-search | PASS | 20 | 100% | €6.00 | prod-verified |
| uptime-check | PASS | 20 | 100% | €0.40 | prod-verified |
| wallet-transactions-lookup | PASS | 20 | 100% | €0.40 | prod-verified |
| pricing-page-extract | PASS | 18 | 89% | €4.80 | prod-verified |
| wallet-age-check | PASS | 16 | 100% | €0.32 | prod-verified |
| github-user-profile | PASS | 15 | 87% | €0.65 | prod-verified |
| seo-audit | PASS | 15 | 100% | €4.50 | prod-verified |
| company-enrich | PASS | 14 | 93% | €6.50 | prod-verified |
| page-speed-test | PASS | 14 | 79% | €0.55 | prod-verified |
| sentiment-analyze | PASS | 13 | 100% | €0.65 | prod-verified |
| job-board-search | PASS | 12 | 100% | €2.40 | prod-verified |
| stock-quote | PASS | 12 | 92% | €0.55 | prod-verified |
| currency-convert | PASS | 11 | 100% | €0.22 | prod-verified |
| domain-age-check | PASS | 11 | 100% | €0.33 | prod-verified |
| whois-lookup | PASS | 11 | 100% | €0.55 | prod-verified |
| credit-score-band | PASS | 10 | 100% | €0.20 | prod-verified |
| error-explain | PASS | 10 | 100% | €0.50 | prod-verified |
| json-repair | PASS | 10 | 100% | €0.20 | prod-verified |
| npm-package-info | PASS | 10 | 100% | €0.50 | prod-verified |
| pypi-package-info | PASS | 10 | 100% | €0.50 | prod-verified |
| email-reputation-score | PASS | 9 | 100% | €0.27 | prod-verified |
| finnish-company-data | PASS | 9 | 22% | €0.10 | prod-verified |
| gas-price-check | PASS | 9 | 67% | €0.12 | prod-verified |
| github-repo-analyze | PASS | 9 | 78% | €0.35 | prod-verified |
| lei-lookup | PASS | 9 | 44% | €0.20 | prod-verified |
| log-parse | PASS | 9 | 100% | €0.45 | prod-verified |
| meeting-notes-extract | PASS | 9 | 100% | €1.80 | prod-verified |
| password-strength | PASS | 9 | 100% | €0.18 | prod-verified |
| phone-validate | PASS | 9 | 100% | €0.14 | prod-verified |
| social-profile-check | PASS | 9 | 100% | €0.45 | prod-verified |
| stablecoin-flow-check | PASS | 9 | 78% | €0.14 | prod-verified |
| timezone-lookup | PASS | 9 | 100% | €0.18 | prod-verified |
| token-count | PASS | 9 | 100% | €0.18 | prod-verified |
| token-security-check | PASS | 9 | 100% | €0.18 | prod-verified |
| uk-companies-house-officers | PASS | 9 | 33% | €0.15 | prod-verified |
| address-parse | PASS | 8 | 100% | €0.40 | prod-verified |
| api-docs-generate | PASS | 8 | 25% | €0.40 | prod-verified |
| company-id-detect | PASS | 8 | 100% | €0.40 | prod-verified |
| company-tech-stack | PASS | 8 | 100% | €2.40 | prod-verified |
| customs-duty-lookup | PASS | 8 | 100% | €1.60 | prod-verified |
| date-parse | PASS | 8 | 100% | €0.24 | prod-verified |
| dependency-audit | PASS | 8 | 25% | €0.10 | prod-verified |
| env-template-generate | PASS | 8 | 25% | €0.10 | prod-verified |
| markdown-to-html | PASS | 8 | 100% | €0.16 | prod-verified |
| phone-normalize | PASS | 8 | 100% | €0.24 | prod-verified |
| structured-scrape | PASS | 8 | 25% | €0.40 | prod-verified |
| translate | PASS | 8 | 100% | €0.40 | prod-verified |
| code-review | PASS | 7 | 57% | €0.80 | prod-verified |
| cve-lookup | PASS | 7 | 100% | €0.35 | prod-verified |
| eu-trademark-search | PASS | 7 | 100% | €3.50 | prod-verified |
| header-security-check | PASS | 7 | 100% | €0.35 | prod-verified |
| holiday-calendar | PASS | 7 | 100% | €0.14 | prod-verified |
| meta-extract | PASS | 7 | 86% | €0.15 | prod-verified |
| redirect-trace | PASS | 7 | 86% | €0.30 | prod-verified |
| secret-scan | PASS | 7 | 100% | €0.14 | prod-verified |
| sql-explain | PASS | 7 | 100% | €0.35 | prod-verified |
| wallet-balance-lookup | PASS | 7 | 100% | €0.14 | prod-verified |
| employment-cost-estimate | PASS | 6 | 67% | €0.12 | prod-verified |
| forex-history | PASS | 6 | 17% | €0.05 | prod-verified |
| link-extract | PASS | 6 | 83% | €0.15 | prod-verified |
| og-image-check | PASS | 6 | 50% | €0.15 | prod-verified |
| swedish-company-data | PASS | 6 | 100% | €0.30 | prod-verified |
| swift-message-parse | PASS | 6 | 100% | €0.12 | prod-verified |
| canadian-company-data | PASS | 5 | 100% | €4.00 | prod-verified |
| container-track | PASS | 5 | 100% | €0.25 | prod-verified |
| country-tax-rates | PASS | 5 | 80% | €0.08 | prod-verified |
| country-trade-data | PASS | 5 | 100% | €1.00 | prod-verified |
| email-draft | PASS | 5 | 100% | €0.25 | prod-verified |
| financial-year-dates | PASS | 5 | 100% | €0.10 | prod-verified |
| flight-status | PASS | 5 | 100% | €0.25 | prod-verified |
| pdf-extract | PASS | 5 | 0% | €0.00 | prod-verified |
| phone-type-detect | PASS | 5 | 100% | €0.10 | prod-verified |
| pr-description-generate | PASS | 5 | 100% | €0.25 | prod-verified |
| privacy-policy-analyze | PASS | 5 | 80% | €1.20 | prod-verified |
| protocol-fees-lookup | PASS | 5 | 80% | €0.08 | prod-verified |
| readme-generate | PASS | 5 | 0% | €0.00 | prod-verified |
| receipt-categorize | PASS | 5 | 40% | €0.10 | prod-verified |
| return-policy-extract | PASS | 5 | 0% | €0.00 | prod-verified |
| robots-txt-parse | PASS | 5 | 100% | €0.10 | prod-verified |
| schema-infer | PASS | 5 | 0% | €0.00 | prod-verified |
| sepa-xml-validate | PASS | 5 | 100% | €0.10 | prod-verified |
| swiss-company-data | PASS | 5 | 0% | €0.00 | prod-verified |
| terms-of-service-extract | PASS | 5 | 0% | €0.00 | prod-verified |
| vat-validate | PASS | 5 | 100% | €0.10 | prod-verified |
| au-company-data | PASS | 4 | 75% | €0.15 | prod-verified |
| code-convert | PASS | 4 | 75% | €0.15 | prod-verified |
| contract-verify-check | PASS | 4 | 100% | €0.08 | prod-verified |
| gdpr-website-check | PASS | 4 | 100% | €0.40 | prod-verified |
| japanese-company-data | PASS | 4 | 100% | €3.20 | prod-verified |
| jwt-decode | PASS | 4 | 75% | €0.06 | prod-verified |
| language-detect | PASS | 4 | 100% | €0.08 | prod-verified |
| llm-output-validate | PASS | 4 | 100% | €0.20 | prod-verified |
| mx-lookup | PASS | 4 | 100% | €0.08 | prod-verified |
| postal-code-lookup | PASS | 4 | 100% | €0.08 | prod-verified |
| prompt-compress | PASS | 4 | 50% | €0.06 | prod-verified |
| public-holiday-lookup | PASS | 4 | 100% | €0.12 | prod-verified |
| swift-validate | PASS | 4 | 100% | €0.12 | prod-verified |
| tax-id-validate | PASS | 4 | 100% | €0.08 | prod-verified |
| ted-procurement | PASS | 4 | 100% | €2.00 | prod-verified |
| url-health-check | PASS | 4 | 50% | €0.06 | prod-verified |
| webhook-test-payload | PASS | 4 | 50% | €0.10 | prod-verified |
| xml-to-json | PASS | 4 | 100% | €0.12 | prod-verified |
| aml-risk-score | PASS | 3 | 100% | €0.06 | prod-verified |
| api-mock-response | PASS | 3 | 100% | €0.15 | prod-verified |
| business-day-check | PASS | 3 | 67% | €0.04 | prod-verified |
| commit-message-generate | PASS | 3 | 100% | €0.15 | prod-verified |
| contract-extract | PASS | 3 | 67% | €1.00 | prod-verified |
| cookie-scan | PASS | 3 | 100% | €0.45 | prod-verified |
| crypto-price | PASS | 3 | 100% | €0.15 | prod-verified |
| data-protection-authority-lookup | PASS | 3 | 100% | €0.15 | prod-verified |
| deduplicate | PASS | 3 | 100% | €0.06 | prod-verified |
| diff-json | PASS | 3 | 100% | €0.09 | prod-verified |
| ens-resolve | PASS | 3 | 67% | €0.04 | prod-verified |
| eu-ai-act-classify | PASS | 3 | 100% | €0.60 | prod-verified |
| flatten-json | PASS | 3 | 100% | €0.06 | prod-verified |
| github-actions-generate | PASS | 3 | 100% | €0.45 | prod-verified |
| github-repo-compare | PASS | 3 | 67% | €0.10 | prod-verified |
| incoterms-explain | PASS | 3 | 100% | €0.09 | prod-verified |
| insolvency-check | PASS | 3 | 100% | €0.06 | prod-verified |
| ip-geolocation | PASS | 3 | 67% | €0.04 | prod-verified |
| ip-risk-score | PASS | 3 | 100% | €0.09 | prod-verified |
| json-to-csv | PASS | 3 | 100% | €0.06 | prod-verified |
| json-to-pydantic | PASS | 3 | 100% | €0.15 | prod-verified |
| json-to-typescript | PASS | 3 | 100% | €0.15 | prod-verified |
| marketplace-fee-calculate | PASS | 3 | 100% | €0.15 | prod-verified |
| name-parse | PASS | 3 | 100% | €0.09 | prod-verified |
| norwegian-company-data | PASS | 3 | 100% | €0.15 | prod-verified |
| openapi-validate | PASS | 3 | 67% | €0.10 | prod-verified |
| package-security-audit | PASS | 3 | 100% | €0.15 | prod-verified |
| paid-api-preflight | PASS | 3 | 100% | €0.06 | prod-verified |
| payment-reference-generate | PASS | 3 | 100% | €0.06 | prod-verified |
| port-lookup | PASS | 3 | 100% | €0.15 | prod-verified |
| protocol-tvl-lookup | PASS | 3 | 100% | €0.06 | prod-verified |
| resume-parse | PASS | 3 | 67% | €0.60 | prod-verified |
| shipping-track | PASS | 3 | 100% | €0.06 | prod-verified |
| skill-extract | PASS | 3 | 100% | €0.09 | prod-verified |
| skill-gap-analyze | PASS | 3 | 100% | €0.45 | prod-verified |
| sql-generate | PASS | 3 | 100% | €0.15 | prod-verified |
| ticker-lookup | PASS | 3 | 100% | €0.15 | prod-verified |
| timezone-meeting-find | PASS | 3 | 100% | €0.09 | prod-verified |
| tool-call-validate | PASS | 3 | 100% | €0.15 | prod-verified |
| unit-convert | PASS | 3 | 67% | €0.04 | prod-verified |
| vasp-non-compliant-check | PASS | 3 | 100% | €0.06 | prod-verified |
| vasp-verify | PASS | 3 | 100% | €0.06 | prod-verified |
| vat-rate-lookup | PASS | 3 | 100% | €0.09 | prod-verified |
| work-permit-requirements | PASS | 3 | 67% | €0.04 | prod-verified |
| accessibility-audit | PASS | 2 | 100% | €0.60 | prod-verified |
| address-validate | PASS | 2 | 100% | €0.06 | prod-verified |
| agent-trace-analyze | PASS | 2 | 100% | €0.40 | prod-verified |
| api-health-check | PASS | 2 | 100% | €0.10 | prod-verified |
| bank-bic-lookup | PASS | 2 | 100% | €0.10 | prod-verified |
| blog-post-outline | PASS | 2 | 100% | €0.40 | prod-verified |
| changelog-generate | PASS | 2 | 100% | €0.06 | prod-verified |
| classify-text | PASS | 2 | 100% | €0.10 | prod-verified |
| company-name-match | PASS | 2 | 100% | €0.04 | prod-verified |
| context-window-optimize | PASS | 2 | 100% | €0.06 | prod-verified |
| cron-explain | PASS | 2 | 100% | €0.04 | prod-verified |
| crontab-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| csv-clean | PASS | 2 | 100% | €0.04 | prod-verified |
| csv-to-json | PASS | 2 | 100% | €0.04 | prod-verified |
| curl-to-code | PASS | 2 | 100% | €0.10 | prod-verified |
| dangerous-goods-classify | PASS | 2 | 100% | €0.04 | prod-verified |
| data-quality-check | PASS | 2 | 100% | €0.04 | prod-verified |
| dockerfile-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| docstring-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| ens-reverse-lookup | PASS | 2 | 100% | €0.04 | prod-verified |
| eori-validate | PASS | 2 | 100% | €0.10 | prod-verified |
| estonian-company-data | PASS | 2 | 0% | €0.00 | prod-verified |
| eth-address-validate | PASS | 2 | 100% | €0.00 | prod-verified |
| fake-data-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| food-safety-rating-uk | PASS | 2 | 100% | €0.10 | prod-verified |
| gitignore-generate | PASS | 2 | 100% | €0.06 | prod-verified |
| hs-code-lookup | PASS | 2 | 100% | €0.06 | prod-verified |
| http-to-curl | PASS | 2 | 100% | €0.04 | prod-verified |
| iban-to-bank | PASS | 2 | 100% | €0.04 | prod-verified |
| id-number-validate | PASS | 2 | 100% | €0.04 | prod-verified |
| isbn-validate | PASS | 2 | 100% | €0.04 | prod-verified |
| jsdoc-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| json-to-zod | PASS | 2 | 100% | €0.10 | prod-verified |
| license-compatibility-check | PASS | 2 | 100% | €0.10 | prod-verified |
| nginx-config-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| openapi-generate | PASS | 2 | 100% | €0.30 | prod-verified |
| phishing-site-check | PASS | 2 | 100% | €0.04 | prod-verified |
| pii-redact | PASS | 2 | 100% | €0.06 | prod-verified |
| polish-company-data | PASS | 2 | 100% | €0.10 | prod-verified |
| port-check | PASS | 2 | 100% | €0.10 | prod-verified |
| regex-explain | PASS | 2 | 100% | €0.10 | prod-verified |
| regex-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| release-notes-generate | PASS | 2 | 100% | €0.06 | prod-verified |
| risk-narrative-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| schema-migration-generate | PASS | 2 | 100% | €0.10 | prod-verified |
| shipping-cost-estimate | PASS | 2 | 100% | €0.30 | prod-verified |
| sql-optimize | PASS | 2 | 100% | €0.10 | prod-verified |
| summarize | PASS | 2 | 100% | €0.10 | prod-verified |
| test-case-generate | PASS | 2 | 100% | €0.30 | prod-verified |
| vat-format-validate | PASS | 2 | 100% | €0.04 | prod-verified |
| wallet-risk-score | PASS | 2 | 100% | €0.04 | prod-verified |
| website-carbon-estimate | PASS | 2 | 100% | €0.10 | prod-verified |
| json-schema-validate | PASS | 1 | 100% | €0.02 | prod-verified |
| bitcoin-address-validate | PASS | 0 | — | €0.00 | prod-verified |
| company-news | PASS | 0 | — | €0.00 | prod-verified |
| croatian-company-data | PASS | 0 | — | €0.00 | prod-verified |
| cz-bank-account-validate | PASS | 0 | — | €0.00 | prod-verified |
| cz-birth-number-validate | PASS | 0 | — | €0.00 | prod-verified |
| cz-company-data | PASS | 0 | — | €0.00 | prod-verified |
| cz-datova-schranka-id-validate | PASS | 0 | — | €0.00 | prod-verified |
| cz-ico-validate | PASS | 0 | — | €0.00 | prod-verified |
| diff-review | PASS | 0 | — | €0.00 | prod-verified |
| docker-hub-info | PASS | 0 | — | €0.00 | prod-verified |
| dogecoin-address-validate | PASS | 0 | — | €0.00 | prod-verified |
| domain-contact-extract | PASS | 0 | — | €0.00 | prod-verified |
| email-validate-bulk | PASS | 0 | — | €0.00 | prod-verified |
| gleif-l2-children-lookup | PASS | 0 | — | €0.00 | prod-verified |
| gleif-l2-ubo-lookup | PASS | 0 | — | €0.00 | prod-verified |
| greek-company-data | PASS | 0 | — | €0.00 | prod-verified |
| html-to-pdf | PASS | 0 | — | €0.00 | prod-verified |
| irish-company-data | PASS | 0 | — | €0.00 | prod-verified |
| keyword-rank-check | PASS | 0 | — | €0.00 | prod-verified |
| landing-page-roast | PASS | 0 | — | €0.00 | prod-verified |
| latvian-company-data | PASS | 0 | — | €0.00 | prod-verified |
| lithuanian-company-data | PASS | 0 | — | €0.00 | prod-verified |
| nl-bag-address | PASS | 0 | — | €0.00 | prod-verified |
| nl-energy-label | PASS | 0 | — | €0.00 | prod-verified |
| nl-housing-stats | PASS | 0 | — | €0.00 | prod-verified |
| nl-woz-value | PASS | 0 | — | €0.00 | prod-verified |
| no-bankruptcy-check | PASS | 0 | — | €0.00 | prod-verified |
| sec-filing-events | PASS | 0 | — | €0.00 | prod-verified |
| singapore-company-data | PASS | 0 | — | €0.00 | prod-verified |
| slovak-company-data | PASS | 0 | — | €0.00 | prod-verified |
| slovenian-company-data | PASS | 0 | — | €0.00 | prod-verified |
| solana-address-validate | PASS | 0 | — | €0.00 | prod-verified |
| tron-address-validate | PASS | 0 | — | €0.00 | prod-verified |
| uk-filing-events | PASS | 0 | — | €0.00 | prod-verified |
| workflow-security-audit | PASS | 0 | — | €0.00 | prod-verified |
| xrp-address-validate | PASS | 0 | — | €0.00 | prod-verified |
