# Strale Usage & Conversion Audit
**Date:** 2026-04-08 (UTC)
**Window:** 30 days (2026-03-09 to 2026-04-08)
**Source:** Live production database

## Top-line numbers

| Metric | Value |
|--------|-------|
| Total calls (30d) | 104102 |
| Total calls (7d) | 31061 |
| Free-tier calls (30d) | 4130 |
| Paid calls (30d) | 99968 |
| Anonymous free-tier calls (30d) | 744 |
| Anonymous distinct IPs (30d) | 84 |
| Capabilities with zero calls (30d) | 0 of 269 active |
| Solutions with zero calls (30d) | 99 of 101 active |
| New signups (30d) | 14 |
| New signups (7d) | 4 |
| Free-to-paid conversion rate | See Section 3 |

### Daily volume trend (last 14 days)

| Day | Calls |
|-----|-------|
| 2026-04-08 | 1137 |
| 2026-04-07 | 3901 |
| 2026-04-06 | 3787 |
| 2026-04-05 | 4745 |
| 2026-04-04 | 4822 |
| 2026-04-03 | 4248 |
| 2026-04-02 | 3929 |
| 2026-04-01 | 4492 |
| 2026-03-31 | 3821 |
| 2026-03-30 | 4700 |
| 2026-03-29 | 2313 |
| 2026-03-28 | 1763 |
| 2026-03-27 | 4238 |
| 2026-03-26 | 3599 |

---
## 1. Capability Usage Ranking (30 days)

- **Total calls (individual capability, excl. solution context):** 104098
- **Top 5 share:** 12.6%
- **Top 20 share:** 23.8%
- **Zero-call capabilities:** 0 of 269
- **Sub-10-call capabilities:** 0

| Rank | Slug | Category | Tier | Calls | Users | Share | Cumul. | Avg ms |
|------|------|----------|------|-------|-------|-------|--------|--------|
| 1 | `ecb-interest-rates` | data-extraction | paid | 4110 | 1 | 3.9% | 3.9% | 271 |
| 2 | `danish-company-data` | data-extraction | paid | 3320 | 1 | 3.2% | 7.1% | 270 |
| 3 | `youtube-summarize` | utility | paid | 3185 | 1 | 3.1% | 10.2% | 2359 |
| 4 | `url-to-markdown` | web-scraping | FREE | 1329 | 1 | 1.3% | 11.5% | 5259 |
| 5 | `landing-page-roast` | competitive-intelligence | paid | 1134 | 1 | 1.1% | 12.6% | 11963 |
| 6 | `swedish-company-data` | data-extraction | paid | 949 | 2 | 0.9% | 13.5% | 18257 |
| 7 | `italian-company-data` | data-extraction | paid | 919 | 1 | 0.9% | 14.4% | 2617 |
| 8 | `vat-validate` | validation | paid | 900 | 2 | 0.9% | 15.2% | 2564 |
| 9 | `iban-validate` | validation | FREE | 875 | 3 | 0.8% | 16.1% | 1 |
| 10 | `html-to-pdf` | file-conversion | paid | 870 | 1 | 0.8% | 16.9% | 3873 |
| 11 | `accessibility-audit` | validation | paid | 861 | 1 | 0.8% | 17.7% | 5242 |
| 12 | `dns-lookup` | web-intelligence | FREE | 784 | 1 | 0.8% | 18.5% | 98 |
| 13 | `email-validate` | validation | FREE | 758 | 2 | 0.7% | 19.2% | 18 |
| 14 | `seo-audit` | competitive-intelligence | paid | 742 | 1 | 0.7% | 19.9% | 5622 |
| 15 | `company-tech-stack` | competitive-intelligence | paid | 735 | 1 | 0.7% | 20.6% | 3111 |
| 16 | `portuguese-company-data` | data-extraction | paid | 724 | 1 | 0.7% | 21.3% | 2105 |
| 17 | `screenshot-url` | web-scraping | paid | 694 | 1 | 0.7% | 22.0% | 3803 |
| 18 | `price-compare` | data-extraction | paid | 670 | 1 | 0.6% | 22.6% | 3916 |
| 19 | `exchange-rate` | financial | paid | 615 | 1 | 0.6% | 23.2% | 364 |
| 20 | `lithuanian-company-data` | data-extraction | paid | 593 | 1 | 0.6% | 23.8% | 4017 |
| 21 | `return-policy-extract` | data-extraction | paid | 583 | 1 | 0.6% | 24.4% | 48057 |
| 22 | `ssl-check` | web-intelligence | paid | 573 | 1 | 0.6% | 24.9% | 306 |
| 23 | `dutch-company-data` | data-extraction | paid | 554 | 1 | 0.5% | 25.4% | 2218 |
| 24 | `business-license-check-se` | data-extraction | paid | 547 | 1 | 0.5% | 26.0% | 2702 |
| 25 | `annual-report-extract` | data-extraction | paid | 543 | 1 | 0.5% | 26.5% | 4326 |
| 26 | `barcode-lookup` | data-extraction | paid | 497 | 1 | 0.5% | 27.0% | 544 |
| 27 | `charity-lookup-uk` | data-extraction | paid | 489 | 1 | 0.5% | 27.4% | 304 |
| 28 | `google-search` | web-scraping | paid | 488 | 1 | 0.5% | 27.9% | 555 |
| 29 | `npm-package-info` | data-extraction | paid | 485 | 1 | 0.5% | 28.4% | 104 |
| 30 | `public-holiday-lookup` | data-extraction | paid | 479 | 1 | 0.5% | 28.8% | 51 |

---
## 2. Free Tier vs Paid Tier

**Confirmed free-tier capabilities:** dns-lookup, email-validate, iban-validate, json-repair, url-to-markdown

| Metric | Free tier | Paid tier |
|--------|-----------|-----------|
| Calls (30d) | 4130 | 99968 |
| Share of total | 4.0% | 96.0% |
| Unique authenticated users | 3 | 4 |

### Top 5 free-tier capabilities

- `url-to-markdown`: 1329 calls
- `iban-validate`: 875 calls
- `dns-lookup`: 784 calls
- `email-validate`: 758 calls

### Top 5 paid capabilities

- `ecb-interest-rates`: 4110 calls
- `danish-company-data`: 3320 calls
- `youtube-summarize`: 3185 calls
- `landing-page-roast`: 1134 calls
- `swedish-company-data`: 949 calls

---
## 3. Free-to-Paid Conversion Funnel

**Total authenticated users (all time):** 17
**Users whose first call was free-tier:** 2

| First free capability | Cohort size | Converters | Conv. rate | Paid capabilities called |
|----------------------|-------------|------------|------------|--------------------------|
| `iban-validate` | 2 | 2 | 100% | accessibility-audit,address-geocode,address-parse,address-validate,adverse-media... |

**Overall conversion rate (free-first users to any paid call):** 100.0% (2/2)

**Conversion to compliance capabilities specifically:** 100.0% (2/2)

**Note on anonymous free-tier users:** The conversion funnel above only tracks *authenticated* users (those who signed up and got an API key). The majority of free-tier usage comes from anonymous users (sandbox visitors and unauthenticated API calls) who are not tracked through to paid conversion because they have no user_id. Anonymous free-tier calls in the last 30 days: 744 from 84 distinct IPs.

---
## 4. Geographic Distribution (30 days)

| Capability | Calls | Unique users |
|-----------|-------|-------------|
| `danish-company-data` | 3320 | 1 |
| `swedish-company-data` | 949 | 2 |
| `dutch-company-data` | 554 | 1 |
| `business-license-check-se` | 547 | 1 |
| `charity-lookup-uk` | 489 | 1 |
| `german-company-data` | 431 | 1 |
| `uk-companies-house-officers` | 431 | 1 |
| `food-safety-rating-uk` | 380 | 1 |
| `norwegian-company-data` | 379 | 1 |
| `us-company-data` | 350 | 1 |
| `belgian-company-data` | 348 | 1 |
| `finnish-company-data` | 341 | 1 |
| `au-company-data` | 294 | 1 |
| `uk-company-data` | 228 | 1 |
| `french-company-data` | 221 | 1 |

---
## 5. Failed Requests Analysis

**Total failed requests (30d):** 18
**Total failed requests (all time):** 22
**Unique agents:** 8

### Top 30 failed request tasks

| Task/slug | Failure type | Count | Unique agents |
|-----------|-------------|-------|--------------|
| `pep check` | no_match | 4 | 1 |
| `kyb-essentials-se` | no_match | 4 | 1 |
| `{"iban": "SE4550000000058398257466"}` | no_match | 1 | 1 |
| `iban-validate` | missing_fields | 1 | 1 |
| `json-repair` | missing_fields | 1 | 1 |
| `swedish-company-data` | no_match | 1 | 1 |
| `Twenty-seven jurisdictions and you're bottlenecking at trust` | no_match | 1 | 1 |
| `url-to-markdown` | missing_fields | 1 | 1 |
| `validate IBAN DE89370400440532013000` | no_match | 1 | 1 |
| `dns-lookup` | missing_fields | 1 | 1 |
| `vat-validate` | no_match | 1 | 1 |
| `email-validate` | missing_fields | 1 | 1 |

---
## 6. Solution vs Capability Usage Split

| Metric | Count |
|--------|-------|
| Solution calls (30d) | 4 |
| Individual capability calls (30d) | 104098 |
| Solution share of total | 0.0% |
| Solutions with zero calls (30d) | 99 of 101 |

### Top 10 solutions by call count

| Solution | Calls |
|----------|-------|
| `kyb-essentials-se` | 3 |
| `domain-trust` | 1 |

---
## 7. New User Growth

| Metric | Count |
|--------|-------|
| Total users (all time) | 33 |
| New signups (30d) | 14 |
| New signups (7d) | 4 |
| Activated (made >= 1 call) | 1 of 14 (7%) |
| Still active (call in last 7d) | 1 |

---
## 8. Data Quality Flags

- **Anonymous conversion gap:** The majority of free-tier usage is anonymous (no user_id). These users cannot be tracked through a conversion funnel. The conversion rates in Section 3 only reflect authenticated users, which is a small subset.
- **Solution calls are transaction-level:** Solution calls are tracked via `solution_slug` on the transaction row. Individual capability calls made *within* a solution execution are excluded from the capability ranking in Section 1 (filtered by `solution_slug IS NULL`).
- **Zero-call concentration:** 0 of 269 active capabilities had zero calls in 30 days. This suggests significant shelfware in the catalogue.
- **Solution shelfware:** 99 of 101 active solutions had zero calls in 30 days.
- **ip_hash as proxy:** For anonymous users, ip_hash is the only identifier. IP rotation and shared IPs make this an imperfect proxy for unique users.
