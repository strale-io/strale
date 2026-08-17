# Capability Adoption-Package Discovery Scan
**Date:** 2026-04-08
**Source:** Production API (api.strale.io) + local repo scan

## Headline Numbers

| Metric | Value |
|--------|-------|
| Total capabilities scanned | 272 |
| Capabilities with zero example responses | 11 |
| Capabilities without a public page | 0 |
| Capabilities without structured data markup | 0 |
| Capabilities without code example on page | 0 |

## Capabilities by Category

| Category | Count |
|----------|-------|
| data-extraction | 91 |
| developer-tools | 43 |
| validation | 33 |
| data-processing | 19 |
| web3 | 17 |
| compliance | 9 |
| web-scraping | 7 |
| monitoring | 7 |
| competitive-intelligence | 6 |
| security | 6 |
| file-conversion | 5 |
| web-intelligence | 4 |
| financial | 4 |
| text-processing | 4 |
| agent-tooling | 4 |
| utility | 4 |
| document-extraction | 4 |
| content-writing | 3 |
| trade | 1 |
| company-data | 1 |

## Description Length Distribution

| Metric | Short description |
|--------|------------------|
| Min | 86 |
| P25 | 116 |
| P50 (median) | 131 |
| P75 | 158 |
| P90 | 182 |
| Max | 498 |

Note: The API exposes a single `description` field. There is no separate long_description column in the DB.

## Page Length Distribution (capabilities with pages)

| Metric | HTML length (chars) |
|--------|-------------------|
| Min | 28221 |
| P50 | 28221 |
| P90 | 28221 |
| Max | 28221 |
| Count with pages | 272 |

## Example Coverage

| Metric | Count |
|--------|-------|
| Capabilities with input schema params (proxy for example calls) | 272 |
| Capabilities with example response in output_schema | 261 |
| Capabilities with zero example responses | 11 |

## Top 10 by Completeness (most fields populated)

| Slug | Category | Score (/12) |
|------|----------|-------------|
| `dns-lookup` | web-intelligence | 12 |
| `postal-code-lookup` | data-extraction | 12 |
| `paid-api-preflight` | validation | 12 |
| `log-parse` | developer-tools | 12 |
| `job-board-search` | data-extraction | 12 |
| `seo-audit` | competitive-intelligence | 12 |
| `insolvency-check` | compliance | 12 |
| `company-industry-classify` | data-processing | 12 |
| `env-template-generate` | developer-tools | 12 |
| `crypto-price` | data-extraction | 12 |

## Top 10 by Incompleteness (fewest fields populated)

| Slug | Category | Score (/12) |
|------|----------|-------------|
| `openapi-generate` | developer-tools | 11 |
| `return-policy-extract` | data-extraction | 11 |
| `token-security-check` | web3 | 11 |
| `vasp-verify` | web3 | 11 |
| `phishing-site-check` | web3 | 11 |
| `wallet-age-check` | web3 | 11 |
| `stablecoin-flow-check` | web3 | 11 |
| `protocol-fees-lookup` | web3 | 11 |
| `ens-resolve` | web3 | 11 |
| `eu-court-case-search` | data-extraction | 11 |

## Executor Coverage

| Metric | Count |
|--------|-------|
| Capabilities with executor file in src/capabilities/ | 272 |
| Capabilities with manifest in manifests/ | 255 |
