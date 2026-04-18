# Strale Capability & Solution Inventory Audit
**Date:** 2026-04-08 (UTC)
**Source:** Live production database query

## Summary

| Metric | Count |
|--------|-------|
| Active capabilities | 269 |
| Active solutions | 101 |
| Continuous test suites | 1712 |
| Capabilities with x402 | 269 |
| Non-active capabilities | 10 |
| Capabilities with tests | 279 |
| Countries with registry/licensed data | 20 |

### Drift flags

- **101 solutions with price drift** (solution price != sum of component capability prices)

---
## 1. Capability Inventory

**Total active:** 269

### By category

| Category | Count |
|----------|-------|
| data-extraction | 90 |
| developer-tools | 43 |
| validation | 33 |
| data-processing | 19 |
| web3 | 17 |
| compliance | 9 |
| monitoring | 7 |
| web-scraping | 7 |
| security | 6 |
| competitive-intelligence | 5 |
| web-intelligence | 4 |
| utility | 4 |
| text-processing | 4 |
| agent-tooling | 4 |
| file-conversion | 4 |
| document-extraction | 4 |
| financial | 4 |
| content-writing | 3 |
| trade | 1 |
| company-data | 1 |

### Free-tier capabilities (5)

- `json-repair` (data-processing)
- `email-validate` (validation)
- `iban-validate` (validation)
- `dns-lookup` (web-intelligence)
- `url-to-markdown` (web-scraping)

### x402-enabled: 269 of 269

### Non-active capabilities (10)

| Slug | Lifecycle state | is_active | Category |
|------|----------------|-----------|----------|
| `amazon-price` | deactivated | False | data-extraction |
| `ecb-interest-rates` | deactivated | False | data-extraction |
| `hong-kong-company-data` | deactivated | False | data-extraction |
| `indian-company-data` | deactivated | False | data-extraction |
| `singapore-company-data` | deactivated | False | data-extraction |
| `youtube-summarize` | deactivated | False | utility |
| `eu-court-case-search` | degraded | True | data-extraction |
| `html-to-pdf` | degraded | True | file-conversion |
| `italian-company-data` | degraded | True | data-extraction |
| `landing-page-roast` | degraded | True | competitive-intelligence |

---
## 2. Solution Inventory

**Total active:** 101

### compliance (3 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `customer-risk-screen` | Customer Risk Screen | global | 3 | E1.00 | E0.55 DRIFT | active |
| `enhanced-due-diligence` | Enhanced Due Diligence | eu-global | 5 | E3.00 | E1.60 DRIFT | active |
| `vendor-onboard` | Vendor Onboarding Check | eu-global | 5 | E1.50 | E1.18 DRIFT | active |

### compliance-verification (67 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `crypto-counterparty-kyb` | Crypto Counterparty KYB | global | 5 | E1.80 | E0.48 DRIFT | active |
| `defi-risk-check` | DeFi Protocol Risk Check | global | 4 | E1.50 | E0.38 DRIFT | active |
| `invoice-verify-at` | Invoice Verify — Austria | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-au` | Invoice Verify — Australia | us-global | 12 | E2.50 | E1.01 DRIFT | active |
| `invoice-verify-be` | Invoice Verify — Belgium | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-ca` | Invoice Verify — Canada | us | 12 | E2.50 | E1.76 DRIFT | active |
| `invoice-verify-ch` | Invoice Verify — Switzerland | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-de` | Invoice Verify — Germany | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-dk` | Invoice Verify — Denmark | nordic | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-es` | Invoice Verify — Spain | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-fi` | Invoice Verify — Finland | nordic | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-fr` | Invoice Verify — France | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-ie` | Invoice Verify — Ireland | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-it` | Invoice Verify — Italy | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-nl` | Invoice Verify — Netherlands | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-no` | Invoice Verify — Norway | nordic | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-pl` | Invoice Verify — Poland | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-pt` | Invoice Verify — Portugal | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-se` | Invoice Verify — Sweden | nordic | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-sg` | Invoice Verify — Singapore | us-global | 12 | E2.50 | E1.76 DRIFT | active |
| `invoice-verify-uk` | Invoice Verify — United Kingdom | eu | 14 | E2.50 | E1.88 DRIFT | active |
| `invoice-verify-us` | Invoice Verify — United States | us | 12 | E2.50 | E1.76 DRIFT | active |
| `kyb-complete-at` | KYB Complete — Austria | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-au` | KYB Complete — Australia | us-global | 11 | E2.50 | E0.99 DRIFT | active |
| `kyb-complete-be` | KYB Complete — Belgium | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-ca` | KYB Complete — Canada | us | 11 | E2.50 | E1.74 DRIFT | active |
| `kyb-complete-ch` | KYB Complete — Switzerland | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-de` | KYB Complete — Germany | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-dk` | KYB Complete — Denmark | nordic | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-es` | KYB Complete — Spain | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-fi` | KYB Complete — Finland | nordic | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-fr` | KYB Complete — France | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-ie` | KYB Complete — Ireland | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-it` | KYB Complete — Italy | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-nl` | KYB Complete — Netherlands | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-no` | KYB Complete — Norway | nordic | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-pl` | KYB Complete — Poland | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-pt` | KYB Complete — Portugal | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-se` | KYB Complete — Sweden | nordic | 14 | E2.50 | E3.84 DRIFT | active |
| `kyb-complete-sg` | KYB Complete — Singapore | us-global | 11 | E2.50 | E1.74 DRIFT | active |
| `kyb-complete-uk` | KYB Complete — United Kingdom | eu | 12 | E2.50 | E1.84 DRIFT | active |
| `kyb-complete-us` | KYB Complete — United States | us | 11 | E2.50 | E1.74 DRIFT | active |
| `kyb-essentials-at` | KYB Essentials — Austria | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-au` | KYB Essentials — Australia | us-global | 3 | E1.50 | E0.35 DRIFT | active |
| `kyb-essentials-be` | KYB Essentials — Belgium | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-ca` | KYB Essentials — Canada | us | 3 | E1.50 | E1.10 DRIFT | active |
| `kyb-essentials-ch` | KYB Essentials — Switzerland | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-de` | KYB Essentials — Germany | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-dk` | KYB Essentials — Denmark | nordic | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-es` | KYB Essentials — Spain | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-fi` | KYB Essentials — Finland | nordic | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-fr` | KYB Essentials — France | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-ie` | KYB Essentials — Ireland | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-it` | KYB Essentials — Italy | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-nl` | KYB Essentials — Netherlands | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-no` | KYB Essentials — Norway | nordic | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-pl` | KYB Essentials — Poland | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-pt` | KYB Essentials — Portugal | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-se` | KYB Essentials — Sweden | nordic | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-sg` | KYB Essentials — Singapore | us-global | 3 | E1.50 | E1.10 DRIFT | active |
| `kyb-essentials-uk` | KYB Essentials — United Kingdom | eu | 4 | E1.50 | E1.20 DRIFT | active |
| `kyb-essentials-us` | KYB Essentials — United States | us | 3 | E1.50 | E1.10 DRIFT | active |
| `kyc-denmark` | Nordic KYC — Denmark | nordic | 5 | E1.50 | E1.45 DRIFT | active |
| `kyc-finland` | Nordic KYC — Finland | nordic | 5 | E1.50 | E1.45 DRIFT | active |
| `kyc-norway` | Nordic KYC — Norway | nordic | 5 | E1.50 | E1.45 DRIFT | active |
| `kyc-sweden` | Nordic KYC — Sweden | nordic | 5 | E1.50 | E1.45 DRIFT | active |
| `verify-us-company` | US Company Verify | us | 4 | E1.30 | E1.35 DRIFT | active |

### data-research (4 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `competitor-snapshot` | Competitive Intelligence Snapshot | global | 4 | E1.40 | E1.10 DRIFT | active |
| `hr-candidate-screen` | HR Candidate Screening | global | 5 | E0.80 | E0.70 DRIFT | active |
| `invoice-process` | Invoice Processing Pipeline | eu-global | 4 | E0.50 | E0.67 DRIFT | active |
| `web-extract-clean` | Web Extract & Clean | global | 2 | E0.30 | E0.20 DRIFT | active |

### finance-banking (2 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `payment-validate` | B2B Payment Validation | eu | 2 | E0.25 | E0.15 DRIFT | active |
| `sepa-readiness` | SEPA Payment Readiness | eu | 3 | E0.30 | E0.17 DRIFT | active |

### legal-regulatory (2 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `ai-act-assess` | EU AI Act Risk Assessment | eu | 3 | E0.80 | E0.45 DRIFT | active |
| `gdpr-audit` | Website GDPR Audit | eu-global | 5 | E1.00 | E0.63 DRIFT | active |

### sales-outreach (4 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `contact-verify` | Contact Verification | global | 3 | E0.25 | E0.08 DRIFT | active |
| `lead-email-verify` | Lead Email Verify | us-global | 3 | E0.20 | E0.11 DRIFT | active |
| `lead-enrich` | Lead Enrichment & Qualification | us-global | 5 | E0.65 | E0.41 DRIFT | active |
| `prospect-profile` | Prospect Company Profile | us-global | 4 | E1.80 | E1.35 DRIFT | active |

### security (1 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `dependency-risk-check` | Dependency Risk Check | global | 2 | E0.25 | E0.20 DRIFT | active |

### security-risk (9 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `defi-protocol-risk` | DeFi Protocol Risk Check | global | 5 | E0.50 | E0.36 DRIFT | active |
| `domain-intel` | Domain Intelligence | global | 4 | E0.35 | E0.21 DRIFT | active |
| `domain-trust` | Domain Trust Check | global | 5 | E0.40 | E0.26 DRIFT | active |
| `email-audit` | Email Deliverability Audit | global | 3 | E0.25 | E0.16 DRIFT | active |
| `token-project-dd` | Token Project Due Diligence | global | 7 | E0.75 | E0.66 DRIFT | active |
| `vendor-risk-assess` | Vendor Risk Assessment | us-global | 7 | E1.80 | E1.26 DRIFT | active |
| `web3-counterparty-kyb` | Web3 Counterparty KYB | global | 6 | E0.70 | E0.46 DRIFT | active |
| `website-health` | Website Health Check | global | 3 | E0.40 | E0.25 DRIFT | active |
| `website-security-audit` | Website Security Audit | global | 4 | E0.45 | E0.31 DRIFT | active |

### web3 (9 active)

| Slug | Name | Geography | Steps | Solution price | Component sum | Status |
|------|------|-----------|-------|---------------|--------------|--------|
| `web3-counterparty-dd` | Web3 Counterparty Due Diligence | global | 6 | E0.15 | E0.61 DRIFT | active |
| `web3-dapp-trust` | Web3 dApp Trust Scan | global | 5 | E0.08 | E0.40 DRIFT | active |
| `web3-pre-trade` | Web3 Pre-Trade Intelligence | global | 6 | E0.12 | E0.15 DRIFT | active |
| `web3-pre-tx-gate` | Web3 Pre-Transaction Risk Gate | global | 5 | E0.15 | E0.28 DRIFT | active |
| `web3-protocol-health` | Web3 Protocol Health Report | global | 5 | E0.08 | E0.14 DRIFT | active |
| `web3-token-safety` | Web3 Token Safety Check | global | 4 | E0.08 | E0.11 DRIFT | active |
| `web3-vasp-check` | Web3 VASP Compliance Check | eu | 4 | E0.10 | E0.29 DRIFT | active |
| `web3-wallet-identity` | Web3 Wallet Identity Resolution | global | 4 | E0.10 | E0.08 DRIFT | active |
| `web3-wallet-snapshot` | Web3 Wallet Portfolio Snapshot | global | 5 | E0.05 | E0.13 DRIFT | active |

### Price drift details

| Solution | Solution price | Component sum | Difference |
|----------|---------------|--------------|------------|
| `kyb-complete-au` | E2.50 | E0.99 | +E1.51 |
| `invoice-verify-au` | E2.50 | E1.01 | +E1.49 |
| `enhanced-due-diligence` | E3.00 | E1.60 | +E1.40 |
| `kyb-complete-se` | E2.50 | E3.84 | E-1.34 |
| `crypto-counterparty-kyb` | E1.80 | E0.48 | +E1.32 |
| `kyb-essentials-au` | E1.50 | E0.35 | +E1.15 |
| `defi-risk-check` | E1.50 | E0.38 | +E1.12 |
| `kyb-complete-ca` | E2.50 | E1.74 | +E0.76 |
| `kyb-complete-sg` | E2.50 | E1.74 | +E0.76 |
| `kyb-complete-us` | E2.50 | E1.74 | +E0.76 |
| `invoice-verify-ca` | E2.50 | E1.76 | +E0.74 |
| `invoice-verify-sg` | E2.50 | E1.76 | +E0.74 |
| `invoice-verify-us` | E2.50 | E1.76 | +E0.74 |
| `kyb-complete-at` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-be` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-ch` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-de` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-dk` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-es` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-fi` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-fr` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-ie` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-it` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-nl` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-no` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-pl` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-pt` | E2.50 | E1.84 | +E0.66 |
| `kyb-complete-uk` | E2.50 | E1.84 | +E0.66 |
| `invoice-verify-at` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-be` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-ch` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-de` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-dk` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-es` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-fi` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-fr` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-ie` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-it` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-nl` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-no` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-pl` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-pt` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-se` | E2.50 | E1.88 | +E0.62 |
| `invoice-verify-uk` | E2.50 | E1.88 | +E0.62 |
| `vendor-risk-assess` | E1.80 | E1.26 | +E0.54 |
| `web3-counterparty-dd` | E0.15 | E0.61 | E-0.46 |
| `customer-risk-screen` | E1.00 | E0.55 | +E0.45 |
| `prospect-profile` | E1.80 | E1.35 | +E0.45 |
| `kyb-essentials-ca` | E1.50 | E1.10 | +E0.40 |
| `kyb-essentials-sg` | E1.50 | E1.10 | +E0.40 |
| `kyb-essentials-us` | E1.50 | E1.10 | +E0.40 |
| `gdpr-audit` | E1.00 | E0.63 | +E0.37 |
| `ai-act-assess` | E0.80 | E0.45 | +E0.35 |
| `vendor-onboard` | E1.50 | E1.18 | +E0.32 |
| `web3-dapp-trust` | E0.08 | E0.40 | E-0.32 |
| `kyb-essentials-at` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-be` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-ch` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-de` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-dk` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-es` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-fi` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-fr` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-ie` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-it` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-nl` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-no` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-pl` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-pt` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-se` | E1.50 | E1.20 | +E0.30 |
| `kyb-essentials-uk` | E1.50 | E1.20 | +E0.30 |
| `competitor-snapshot` | E1.40 | E1.10 | +E0.30 |
| `lead-enrich` | E0.65 | E0.41 | +E0.24 |
| `web3-counterparty-kyb` | E0.70 | E0.46 | +E0.24 |
| `web3-vasp-check` | E0.10 | E0.29 | E-0.19 |
| `invoice-process` | E0.50 | E0.67 | E-0.17 |
| `contact-verify` | E0.25 | E0.08 | +E0.17 |
| `website-health` | E0.40 | E0.25 | +E0.15 |
| `defi-protocol-risk` | E0.50 | E0.36 | +E0.14 |
| `domain-intel` | E0.35 | E0.21 | +E0.14 |
| `domain-trust` | E0.40 | E0.26 | +E0.14 |
| `website-security-audit` | E0.45 | E0.31 | +E0.14 |
| `sepa-readiness` | E0.30 | E0.17 | +E0.13 |
| `web3-pre-tx-gate` | E0.15 | E0.28 | E-0.13 |
| `hr-candidate-screen` | E0.80 | E0.70 | +E0.10 |
| `web-extract-clean` | E0.30 | E0.20 | +E0.10 |
| `payment-validate` | E0.25 | E0.15 | +E0.10 |
| `lead-email-verify` | E0.20 | E0.11 | +E0.09 |
| `email-audit` | E0.25 | E0.16 | +E0.09 |
| `token-project-dd` | E0.75 | E0.66 | +E0.09 |
| `web3-wallet-snapshot` | E0.05 | E0.13 | E-0.08 |
| `web3-protocol-health` | E0.08 | E0.14 | E-0.06 |
| `kyc-denmark` | E1.50 | E1.45 | +E0.05 |
| `kyc-finland` | E1.50 | E1.45 | +E0.05 |
| `kyc-norway` | E1.50 | E1.45 | +E0.05 |
| `kyc-sweden` | E1.50 | E1.45 | +E0.05 |
| `verify-us-company` | E1.30 | E1.35 | E-0.05 |
| `dependency-risk-check` | E0.25 | E0.20 | +E0.05 |
| `web3-pre-trade` | E0.12 | E0.15 | E-0.03 |
| `web3-token-safety` | E0.08 | E0.11 | E-0.03 |
| `web3-wallet-identity` | E0.10 | E0.08 | +E0.02 |

---
## 3. Test Suite Coverage

**Total test suites:** 1712
**Capabilities with tests:** 279
**Average tests per capability:** 6.1

### By test type

| Test type | Count |
|-----------|-------|
| known_answer | 316 |
| schema_check | 307 |
| edge_case | 275 |
| negative | 275 |
| dependency_health | 265 |
| known_bad | 243 |
| piggyback | 31 |

### Capabilities with < 5 tests (12)

- `protocol-fees-lookup`: 3 tests
- `stablecoin-flow-check`: 4 tests
- `ens-resolve`: 4 tests
- `approval-security-check`: 4 tests
- `wallet-risk-score`: 4 tests
- `vasp-non-compliant-check`: 4 tests
- `fear-greed-index`: 4 tests
- `vasp-verify`: 4 tests
- `phishing-site-check`: 4 tests
- `protocol-tvl-lookup`: 4 tests
- `ens-reverse-lookup`: 4 tests
- `token-security-check`: 4 tests

---
## 4. Country Coverage

**Countries with country-specific capabilities:** 20

| Country | Code | Capabilities |
|---------|------|-------------|
| Australia | AU | 1 |
| Austria | AT | 1 |
| Belgium | BE | 1 |
| Denmark | DK | 1 |
| Estonia | EE | 1 |
| Finland | FI | 1 |
| France | FR | 1 |
| Germany | DE | 1 |
| Ireland | IE | 1 |
| Latvia | LV | 1 |
| Lithuania | LT | 1 |
| Netherlands | NL | 1 |
| Norway | NO | 1 |
| Poland | PL | 1 |
| Portugal | PT | 1 |
| Spain | ES | 1 |
| Sweden | SE | 2 |
| Switzerland | CH | 1 |
| United Kingdom | UK | 4 |
| United States | US | 1 |

**Australia (AU):** `au-company-data`
**Austria (AT):** `austrian-company-data`
**Belgium (BE):** `belgian-company-data`
**Denmark (DK):** `danish-company-data`
**Estonia (EE):** `estonian-company-data`
**Finland (FI):** `finnish-company-data`
**France (FR):** `french-company-data`
**Germany (DE):** `german-company-data`
**Ireland (IE):** `irish-company-data`
**Latvia (LV):** `latvian-company-data`
**Lithuania (LT):** `lithuanian-company-data`
**Netherlands (NL):** `dutch-company-data`
**Norway (NO):** `norwegian-company-data`
**Poland (PL):** `polish-company-data`
**Portugal (PT):** `portuguese-company-data`
**Spain (ES):** `spanish-company-data`
**Sweden (SE):** `business-license-check-se`, `swedish-company-data`
**Switzerland (CH):** `swiss-company-data`
**United Kingdom (UK):** `charity-lookup-uk`, `food-safety-rating-uk`, `uk-companies-house-officers`, `uk-company-data`
**United States (US):** `us-company-data`

---
## 5. Feature Registry DB Alignment

The Feature Registry DB lives in Notion. A full comparison requires querying the Notion Decisions DB
and cross-referencing with the execution DB slugs. This is deferred to a separate workstream.
**Execution DB active capabilities:** 269
