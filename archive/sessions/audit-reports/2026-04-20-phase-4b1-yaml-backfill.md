# Phase 4b.1 YAML backfill — applied

**Generated:** 2026-04-20T22:44:05.029Z
**Mode:** writes applied

## Summary

- YAML files scanned: **275**
- Files to modify: **275**
- Files already complete: **0**
- Files with drift (YAML ≠ DB, preserved YAML): **0**
- Files with skip (DB value NULL): **6**
- YAML files with no DB match: **0**

### Fields added, by field

| Field | Count |
|---|---|
| geography | 269 |
| processes_personal_data | 260 |
| maintenance_class | 242 |
| personal_data_categories | 73 |

## Skipped injections (DB NULL)

| Slug | Field | Reason |
|---|---|---|
| cz-bank-account-validate | geography | DB geography IS NULL (CZ cluster) |
| cz-birth-number-validate | geography | DB geography IS NULL (CZ cluster) |
| cz-company-data | geography | DB geography IS NULL (CZ cluster) |
| cz-datova-schranka-id-validate | geography | DB geography IS NULL (CZ cluster) |
| cz-ico-validate | geography | DB geography IS NULL (CZ cluster) |
| cz-unreliable-vat-payer | geography | DB geography IS NULL (CZ cluster) |

## Per-slug diffs

### accessibility-audit

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### address-geocode

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - address
geography: global
```

### address-parse

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - address
geography: global
```

### address-validate

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - address
geography: global
```

### adverse-media-check

Added: geography

```yaml
geography: global
```

### age-verify

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - date_of_birth
geography: global
```

### agent-trace-analyze

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### aml-risk-score

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - sensitive_special
geography: global
```

### annual-report-extract

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - financial
  - professional
geography: global
```

### api-docs-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### api-health-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### api-mock-response

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### au-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: au
```

### australian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: global
```

### austrian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### backlink-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### bank-bic-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### barcode-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### base64-encode-url

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### belgian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### beneficial-ownership-lookup

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - sensitive_special
geography: global
```

### blog-post-outline

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### brand-mention-search

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### brazilian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: global
```

### business-day-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### business-license-check-se

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: nordic
```

### canadian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: global
```

### changelog-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### charity-lookup-uk

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: uk
```

### classify-text

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### code-convert

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### code-review

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### commit-message-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### company-enrich

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: global
```

### company-id-detect

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### company-industry-classify

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### company-name-match

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### company-news

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### company-tech-stack

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### competitor-compare

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### container-track

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### context-window-optimize

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### contract-extract

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - financial
geography: global
```

### cookie-scan

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### country-tax-rates

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### country-trade-data

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### credit-report-summary

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - financial
  - sensitive_special
geography: global
```

### credit-score-band

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - financial
geography: global
```

### cron-explain

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### crontab-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### crypto-price

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### csv-clean

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### csv-to-json

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### curl-to-code

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### currency-convert

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### customs-duty-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### cve-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### cz-bank-account-validate

Added: processes_personal_data, personal_data_categories

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - financial
```

### cz-birth-number-validate

Added: processes_personal_data, personal_data_categories

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - government_id
  - date_of_birth
```

### cz-company-data

Added: processes_personal_data, personal_data_categories

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
```

### cz-datova-schranka-id-validate

Added: processes_personal_data, personal_data_categories

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - government_id
```

### cz-ico-validate

Added: processes_personal_data

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
```

### cz-unreliable-vat-payer

Added: processes_personal_data, personal_data_categories

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - financial
  - professional
```

### dangerous-goods-classify

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### danish-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: nordic
```

### data-protection-authority-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### data-quality-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### date-parse

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### deduplicate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### dependency-audit

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### diff-json

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### diff-review

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### dns-lookup

Added: geography

```yaml
geography: global
```

### docker-hub-info

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### dockerfile-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### docstring-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### domain-age-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### domain-reputation

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### dutch-company-data

Added: geography

```yaml
geography: eu
```

### ecb-interest-rates

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### email-deliverability-check

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - email
geography: global
```

### email-draft

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - email
  - name
  - professional
geography: global
```

### email-reputation-score

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - email
geography: global
```

### email-validate

Added: geography

```yaml
geography: global
```

### employer-review-summary

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### employment-cost-estimate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### env-template-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### eori-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### error-explain

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### estonian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### eu-ai-act-classify

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### eu-court-case-search

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - sensitive_special
geography: eu
```

### eu-regulation-search

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### eu-trademark-search

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### exchange-rate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### fake-data-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### financial-year-dates

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### finnish-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: nordic
```

### flatten-json

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### flight-status

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### food-safety-rating-uk

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: uk
```

### forex-history

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### french-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### gdpr-fine-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### gdpr-website-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### german-company-data

Added: geography

```yaml
geography: eu
```

### github-actions-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### github-repo-analyze

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### github-repo-compare

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### github-user-profile

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - email
  - name
  - professional
geography: global
```

### gitignore-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### google-search

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### header-security-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### holiday-calendar

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### hs-code-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: requires-domain-expertise
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### html-to-pdf

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### http-to-curl

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### iban-to-bank

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - financial
geography: global
```

### iban-validate

Added: geography

```yaml
geography: global
```

### id-number-validate

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - government_id
geography: global
```

### image-resize

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### image-to-text

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### incoterms-explain

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### insolvency-check

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - sensitive_special
geography: global
```

### invoice-extract

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - financial
geography: global
```

### invoice-validate

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - financial
geography: global
```

### ip-geolocation

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - behavioral
geography: global
```

### ip-risk-score

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - behavioral
geography: global
```

### irish-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### isbn-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### iso-country-lookup

Added: geography

```yaml
geography: global
```

### italian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### japanese-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: global
```

### job-board-search

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: nordic
```

### job-posting-analyze

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### jsdoc-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### json-repair

Added: geography

```yaml
geography: global
```

### json-schema-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### json-to-csv

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### json-to-pydantic

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### json-to-typescript

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### json-to-zod

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### jwt-decode

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### keyword-suggest

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### landing-page-roast

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### language-detect

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### latvian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### lei-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### license-compatibility-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### link-extract

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### linkedin-url-validate

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - professional
geography: global
```

### lithuanian-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### llm-cost-calculate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### llm-output-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### log-parse

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### markdown-to-html

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### marketplace-fee-calculate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### meeting-notes-extract

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
geography: global
```

### meta-extract

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### mx-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### name-parse

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
geography: global
```

### nginx-config-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### nl-bag-address

Added: processes_personal_data, personal_data_categories, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - address
geography: nl
```

### nl-energy-label

Added: processes_personal_data, personal_data_categories, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - address
geography: nl
```

### nl-housing-price-index

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: nl
```

### nl-housing-stats

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: nl
```

### nl-woz-value

Added: processes_personal_data, personal_data_categories, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - address
geography: nl
```

### norwegian-company-data

Added: geography

```yaml
geography: nordic
```

### npm-package-info

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### og-image-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### openapi-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### openapi-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### package-security-audit

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### page-speed-test

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### paid-api-preflight

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### password-strength

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - sensitive_special
geography: global
```

### patent-search

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - professional
geography: global
```

### payment-reference-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### pdf-extract

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### pep-check

Added: geography

```yaml
geography: global
```

### phone-normalize

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - phone
geography: global
```

### phone-type-detect

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - phone
geography: global
```

### phone-validate

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - phone
geography: global
```

### pii-redact

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - sensitive_special
geography: global
```

### polish-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### port-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### port-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### portuguese-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### postal-code-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### pr-description-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### price-compare

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### pricing-page-extract

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### privacy-policy-analyze

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### product-reviews-extract

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### product-search

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### prompt-compress

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### prompt-optimize

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### public-holiday-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### pypi-package-info

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### readme-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### receipt-categorize

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - financial
geography: global
```

### redirect-trace

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### regex-explain

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### regex-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### release-notes-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### resume-parse

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - email
  - phone
  - address
  - professional
geography: global
```

### return-policy-extract

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### risk-narrative-generate

Added: geography

```yaml
geography: global
```

### robots-txt-parse

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### salary-benchmark

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### sanctions-check

Added: geography

```yaml
geography: global
```

### schema-infer

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### schema-migration-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### screenshot-url

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### sec-filing-events

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: us
```

### secret-scan

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - sensitive_special
geography: global
```

### sentiment-analyze

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### seo-audit

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### sepa-xml-validate

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - financial
geography: eu
```

### serp-analyze

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### shipping-cost-estimate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### shipping-track

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### sitemap-parse

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### skill-extract

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - professional
geography: global
```

### skill-gap-analyze

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - professional
geography: global
```

### social-post-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### social-profile-check

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - professional
geography: global
```

### spanish-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### sql-explain

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### sql-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### sql-optimize

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### ssl-certificate-chain

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### ssl-check

Added: geography

```yaml
geography: global
```

### startup-domain-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### stock-quote

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### structured-scrape

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### summarize

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### swedish-company-data

Added: geography

```yaml
geography: nordic
```

### swift-message-parse

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - financial
geography: global
```

### swift-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### swiss-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: scraping-stable-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: eu
```

### tax-id-validate

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - government_id
geography: global
```

### tech-stack-detect

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### ted-procurement

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### terms-of-service-extract

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### test-case-generate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### ticker-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### timezone-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### timezone-meeting-find

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### token-count

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### tool-call-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### translate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### trustpilot-score

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### uk-companies-house-officers

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: global
```

### uk-company-data

Added: geography

```yaml
geography: uk
```

### uk-filing-events

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: uk
```

### unit-convert

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### uptime-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### url-health-check

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### url-to-markdown

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### url-to-text

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### us-company-data

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - address
  - professional
geography: us
```

### vat-format-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### vat-rate-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### vat-validate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: eu
```

### weather-lookup

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### web-extract

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: scraping-fragile-target
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### webhook-test-payload

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### website-carbon-estimate

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### website-to-company

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: commercial-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### whois-lookup

Added: maintenance_class, processes_personal_data, personal_data_categories, geography

```yaml
maintenance_class: free-stable-api
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: true
personal_data_categories:
  - name
  - email
  - address
geography: global
```

### work-permit-requirements

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### workflow-security-audit

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### xml-to-json

Added: maintenance_class, processes_personal_data, geography

```yaml
maintenance_class: pure-computation
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```

### youtube-summarize

Added: processes_personal_data, geography

```yaml
# SA.2b: per-capability PII classification (F-A-003, F-A-009)
processes_personal_data: false
geography: global
```
