---
doc_type: research
type: product
topic: reference-data-inventory
question: Which reference datasets are hard-coded into Strale's tools, where does each come from, how old is it, how much harm would a stale copy do, and are the most harmful ones current?
date: "2026-11-06"
status: current
sources:
  - https://emta.ee/en/business-client/taxes-and-payment/value-added-tax/vat-rates-and-supply-exempt-tax/standard-vat-rate
  - https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng
  - https://kpmg.com/us/en/taxnewsflash/news/2025/08/tnf-romania-various-tax-reform-measures-effective-august-1-2025.html
  - https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en
  - https://taxfoundation.org/data/all/eu/corporate-income-tax-rates-europe
  - https://taxsummaries.pwc.com/Lithuania/Corporate/Taxes-on-corporate-income
  - https://www.cobalt.legal/wp-content/uploads/2026/02/Baltic-Tax-Card-2026.pdf
  - https://www.ey.com/en_gl/technical/tax-alerts/romanian-tax-changes-introduced-by-new-fiscal-and-budgetary-measures
  - https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html
  - https://www.gov.uk/skilled-worker-visa/your-job
  - https://www.make-it-in-germany.com/en/visa-residence/types/eu-blue-card
  - https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraatettaktiebolagellerenekonomiskforening.4.46ae6b26141980f1e2d1261.html
  - https://www.skatteverket.se/foretag/moms.4.18e1b10334ebe8bc80002497.html
  - https://www.thenationalnews.com/uae/government/2021/12/07/breaking-uae-makes-major-changes-to-working-week
  - https://www.vero.fi/en/businesses-and-corporations/taxes-and-charges/vat/rates-of-vat/
  - apps/api/src/capabilities/vat-rate-lookup.ts
  - apps/api/src/capabilities/lib/iso-3166.ts
---

# Reference data hard-coded into Strale's tools: first inventory (R2)

Prepared 2026-11-06 against `origin/main` at `b8aa9361` (after #954 and #956), read-only.
Scope: `apps/api/src/capabilities/**` (including `lib/`, `providers/`) and `apps/api/src/data/`, tests and fixtures excluded. No JSON/YAML data files are imported by in-scope code (the only JSON/YAML reads are manifests in `auto-register.ts` and runtime caches), so the inventory is all TypeScript literals plus one dependency (`libphonenumber-js` metadata).

## Summary

- **80 datasets in 72 files.**
  - By harm class: **A 19**, **B 9**, **C 30**, **D 22**.
- **Paid or free:**
  - **77** sit behind a paid tool. 4 of those tools are deactivated: `ip-risk-score`, `flight-status`, `crypto-price` and `lithuanian-company-data`.
  - **2** are free-tier: `iban-validate` and `email-validate`.
  - **1** is shared by the KYB solutions: `lib/vat-derivation.ts`.
- **Sources:** 13 name a real source. 3 more gesture at one ("published rate guides", an implied model, or internal file references). **64 state none.**
- **Dates:** 10 carry an as-of date.
  - Those 10 are the four `aml-risk-score` lists, two Dilisense disclosures, LLM pricing, two Eurostat lists and the Lithuanian classifier snapshot.
  - 4 more carry only a year label inside the data or notes.
  - **66 carry no date.**
- **Untouched since creation:** 44 of the 80 were last changed on 2026-02-26 or 2026-02-27. That is the repo's bulk-creation week; git history starts 2026-02-25. Their content predates the repo and looks like 2024-era reference figures, which several self-label: "2024/2025 tax tables", "(2024)", "year: 2023".
- **Only one dataset has a mechanical staleness alarm:** `llm-cost-calculate` has `PRICING_VERIFIED_ON` plus a 180-day test. It is the model to copy.
- **Duplication:**
  - IBAN lengths are held twice, and the copies disagree on Andorra.
  - EU VAT number regex is held three times: `vat-format-validate`, `invoice-validate` and `lib/entity-identifier`.
  - WHOIS servers are held twice.
  - Dutch municipality codes are held twice.
  - EU member lists are held 4 or more times: `iso-3166`, `shipping-cost-estimate`, `work-permit-requirements` and `vies`.
  - Each copy drifts on its own; the register should point all of them at one source.

### Confirmed stale or wrong today (from spot-checks and known public changes)

| Dataset | What is wrong |
|---|---|
| `vat-rate-lookup` VAT_RATES (B) | EE 22% (24% since 1 Jul 2025); RO 19% / 5% / 9% (21% / 11% since 1 Aug 2025); FI 10% books and medicine and 14% food (13.5% since 1 Jan 2026; 10% now only press); SE food 12% (6% since 1 Apr 2026, through 2027); BG currency BGN (euro since 1 Jan 2026). SK reduced [10] likely stale too (2025 rates 19% / 5%; not re-checked). |
| `country-tax-rates` TAX_DATA (B) | Same VAT errors for EE, RO, FI, SE, SK; EE corporate 20% (22% from 2025); LT corporate 15% (16% from 2025). |
| `eu-ai-act-classify` (A, 20c) | Says Annex III obligations "apply from 2 August 2026"; Regulation (EU) 2026/1744 (Digital Omnibus on AI, OJ 24 Jul 2026) moved them to 2 December 2027. |
| `work-permit-requirements` (A) | UK Skilled Worker "GBP 26,200" (gov.uk now: GBP 41,700); Germany Blue Card "EUR 45,300 / 41,041.80 ... in 2024" (2026: EUR 50,700 / 45,934.20). |
| `financial-year-dates` (A) | Sweden "tax filing May 1 (calendar year companies)"; Skatteverket: calendar-year AB files by 1 August. Croatia VAT threshold still in HRK (euro since 2023). |
| `lib/iso-3166.ts` (C, shared) | BG and RO `schengen: false` (full Schengen members since 1 Jan 2025); BG `eurozone: false`, currency BGN (euro since 1 Jan 2026). |
| `business-day-check` (C) | UAE (AE) treated as a Fri-Sat weekend; UAE moved to Sat-Sun on 1 Jan 2022, so business-day answers for AE are wrong on Fridays and Sundays. |
| `iban-to-bank` IBAN_LENGTHS (C) | Andorra length 28; the registry and `iban-validate` say 24, so valid AD IBANs fail. |
| `aml-risk-score` SECRECY_JURISDICTIONS (A) | No source and no date, which the code itself admits. Not checkable as stale, but cannot be defended in a compliance answer. |

## Full inventory (80 datasets)

| # | Class | file:line | Dataset | Holds | Entries | Source stated | As-of in code | Last git change | Tool (price) | Re-check against | Trigger | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A | `eu-ai-act-classify.ts:31-166` | UNACCEPTABLE_RULES + HIGH_RISK_RULES (+ limited) | AI Act prohibited / Annex III areas, articles, obligations and application dates | 5+8+1 | Regulation (EU) 2024/1689 (stated) | none | 2026-02-27 | eu-ai-act-classify (20c) | EUR-Lex: Reg. 2024/1689 as amended by Reg. 2026/1744 (Digital Omnibus); AI Office guidelines | On each amending act or Commission guideline; quarterly | STALE (spot-checked): Annex III dates moved to 2 Dec 2027 by Reg. (EU) 2026/1744 |
| 2 | A | `work-permit-requirements.ts:6-59` | EU_EEA, NORDIC, SCHENGEN_WAIVER, GUIDANCE_URLS | Free-movement area, visa-waiver nationals, official guidance links | 30+5+24+15 | none stated | none | 2026-02-27 | work-permit-requirements (2c) | EU Reg. 2018/1806 Annex II (visa list); national migration agencies | When Reg. 2018/1806 Annex II changes; annually | Visa-waiver list partial; ETIAS/UK ETA not modelled |
| 3 | A | `financial-year-dates.ts:18-547` | FISCAL_YEAR_DATA | Fiscal year, tax-filing and annual-report deadlines, VAT filing frequency per country | 48 | none stated | none | 2026-02-27 | financial-year-dates (2c) | National tax authorities (Skatteverket, HMRC, IRS...) and business registers | Annually (before filing season), per country | STALE/WRONG (spot-checked): SE says 1 May; Skatteverket: 1 Aug (calendar-year AB). HR row still uses HRK |
| 4 | A | `data-protection-authority-lookup.ts:16-318` | DPA_DIRECTORY | National data protection authorities: names, websites, contacts | 30 | none stated | none | 2026-02-27 | data-protection-authority-lookup (5c) | EDPB members list (edpb.europa.eu) | Annually; on EDPB membership change |  |
| 5 | A | `invoice-validate.ts:85-101` | EU_REQUIRED_FIELDS / EU_RECOMMENDED_FIELDS | Mandatory invoice particulars used for the compliance verdict | 7+5 | none stated | none | 2026-02-27 | invoice-validate (2c) | VAT Directive 2006/112/EC Art. 226 (EUR-Lex); ViDA e-invoicing changes | On VAT Directive amendment (ViDA 2030 timeline); annually |  |
| 6 | A | `dangerous-goods-classify.ts:20-257` | DANGEROUS_GOODS + CLASS_DESCRIPTIONS | UN numbers, shipping names, classes, packing groups | 163+25 | none stated | none | 2026-02-27 | dangerous-goods-classify (2c) | UN Model Regulations (UNECE), ADR, IATA DGR | Biennially (UN Model Regs revision; ADR odd years 1 Jan) |  |
| 7 | A | `incoterms-explain.ts:18-419` | INCOTERMS | ICC Incoterms 2020 rule texts and risk/cost transfer | 11 | none stated | none | 2026-02-27 | incoterms-explain (3c) | ICC (iccwbo.org) | On the next ICC Incoterms revision (watch ~2030) |  |
| 8 | A | `license-compatibility-check.ts:22-72` | LICENSES (add calls) + ALIASES | SPDX licences: OSI approval, copyleft, SaaS and patent flags | 27+34 | none stated | none | 2026-04-02 | license-compatibility-check (5c) | SPDX License List; OSI approved licences | Quarterly (SPDX releases) |  |
| 9 | A | `package-security-audit.ts:11-11` | COPYLEFT_LICENSES | SPDX ids treated as copyleft | 10 | none stated | none | 2026-04-02 | package-security-audit (5c) | SPDX License List | Quarterly |  |
| 10 | A | `uk-cop-check.ts:47-62` | COP_CODE_TO_STATUS | Confirmation of Payee response codes mapped to match verdicts | 14 | none stated | none | 2026-05-02 | uk-cop-check (25c) | Pay.UK CoP standards / vendor API docs | On Pay.UK rulebook release; semi-annually |  |
| 11 | A | `risk-narrative-generate.ts:89-212` | NON_ACTIVE_REGISTRY_STATUSES + REGISTRY_STATUS_PHRASES | Registry status codes treated as non-active, and their phrases | 35+37 | executor file:line refs (internal) | none | 2026-10-27 | risk-narrative-generate (5c) | Each national business register's status codelist | When an upstream register changes its codelist; quarterly |  |
| 12 | A | `aml-risk-score.ts:91-98` | SECRECY_JURISDICTIONS | Tax-haven / secrecy jurisdictions used in risk score | 15 | none stated (comment says Strale's own selection) | none | 2026-11-06 | aml-risk-score (2c) | EU Council list of non-cooperative jurisdictions (Annex I), or Tax Justice Network FSI | After each EU Council revision (Feb, Oct) | No source, no date (comment admits it) |
| 13 | A | `work-permit-requirements.ts:140-330` | inline rule engine notes | Per-country permit rules and salary thresholds (UK GBP 26,200; DE Blue Card 2024 figures) | ~15 destinations | none stated | "2024" in DE note | 2026-02-27 | work-permit-requirements (2c) | gov.uk (Skilled Worker), make-it-in-germany.com / BMI, Migrationsverket, etc. | Annually on 1 Jan (DE Blue Card), each UK rules change (Apr/Jul) | STALE (spot-checked): UK threshold now GBP 41,700; DE Blue Card 2026 EUR 50,700 / 45,934.20 |
| 14 | A | `lib/dilisense-sources.ts:22-65` | SANCTIONS_MAJOR_LISTS | Sanctions lists disclosed as screened in lists_queried evidence | 37 | dilisense.com/en/sources (stated) | 2026-04-27 snapshot (comment) | 2026-04-27 | sanctions-check (20c) | Dilisense source catalogue (vendor) | Quarterly, and on any vendor source-list change | Disclosure claim; snapshot 6 months old |
| 15 | A | `lib/dilisense-sources.ts:81-106` | PEP_MAJOR_SOURCES + DILISENSE_PEP_LISTS_QUERIED | PEP sources and source_count (230) disclosed in evidence | 11+7 | dilisense.com/en/sources (stated) | 2026-04-27 snapshot (comment) | 2026-04-27 | pep-check (5c) | Dilisense source catalogue (vendor) | Quarterly |  |
| 16 | A | `aml-risk-score.ts:17-36` | FATF_GREY_LIST | FATF jurisdictions under increased monitoring | 18 | FATF via FinCEN release + ComplyAdvantage note (stated) | 2026-10-30 (FATF_LISTS_AS_OF) | 2026-11-06 | aml-risk-score (2c) | FATF (fatf-gafi.org) plenary outcomes | After each FATF plenary (Feb, Jun, Oct) |  |
| 17 | A | `aml-risk-score.ts:38-42` | FATF_BLACK_LIST | FATF call-for-action jurisdictions | 3 | FATF (stated) | 2026-10-30 (FATF_LISTS_AS_OF) | 2026-11-06 | aml-risk-score (2c) | FATF call-for-action statement | After each FATF plenary (Feb, Jun, Oct) |  |
| 18 | A | `aml-risk-score.ts:48-48` | FATF_COUNTERMEASURES | Call-for-action jurisdictions subject to countermeasures | 2 | FATF statement 30 Oct 2026 (stated) | 2026-10-30 (FATF_LISTS_AS_OF) | 2026-11-06 | aml-risk-score (2c) | FATF call-for-action statement | After each FATF plenary (Feb, Jun, Oct) |  |
| 19 | A | `aml-risk-score.ts:57-89` | EU_HIGH_RISK | EU high-risk third countries (Annex to Del. Reg. 2016/1675) | 26 | EUR-Lex consolidated CELEX 02016R1675-20260129 (stated) | 2026-01-29 (EU_HIGH_RISK_AS_OF) | 2026-11-06 | aml-risk-score (2c) | European Commission / EUR-Lex (Del. Reg. 2016/1675 amendments) | On each new Commission delegated regulation; check monthly, and after each FATF plenary |  |
| 20 | B | `vat-rate-lookup.ts:21-384` | VAT_RATES | Standard, reduced, super-reduced, parking rates and currency for EU27+GB, NO, CH, IS | 31 | none stated | none | 2026-02-27 | vat-rate-lookup (3c) | European Commission TEDB; national tax authorities | Annually on 1 Jan plus 1 Jul; on any national budget change | STALE (spot-checked): EE 22->24, RO 19->21/11, FI 10/14->13.5/10, SE food 12->6, BG currency BGN->EUR |
| 21 | B | `country-tax-rates.ts:16-65` | TAX_DATA | Corporate, VAT, top PIT, CGT, WHT, social security rates per country | 48 | none stated | none | 2026-02-27 | country-tax-rates (2c) | OECD tax database; national tax authorities; EC TEDB | Annually on 1 Jan | STALE (spot-checked): EE VAT 24 / CIT 22, RO VAT 21, LT CIT 16 |
| 22 | B | `token-count.ts:4-19` | MODEL_INFO | Context sizes and per-1K prices for 14 models | 14 | none stated | none | 2026-02-27 | token-count (2c) | OpenAI, Anthropic, Google pricing pages | Monthly | Prices for gpt-4o era models; no date, no test (unlike llm-cost-calculate) |
| 23 | B | `marketplace-fee-calculate.ts:28-195` | AMAZON_REFERRAL_RATES + eBay/Etsy/Shopify fee constants | Marketplace referral, transaction and processing fees | 24+~15 | none stated | none | 2026-02-27 | marketplace-fee-calculate (5c) | Amazon Seller Central, eBay, Etsy, Shopify fee pages | Quarterly; Amazon annual fee change (Jan/Feb) |  |
| 24 | B | `shipping-cost-estimate.ts:16-110` | BASE_RATES + EU_COUNTRIES + NORDIC | Carrier zone base prices (PostNord, DHL, UPS) and zone membership | 3 carriers x 4 zones x 3 tiers + 27 + 5 | "published rate guides" (unnamed) | none | 2026-02-27 | shipping-cost-estimate (15c) | PostNord, DHL, UPS published price lists | Annually (carriers revise 1 Jan) | Invented-looking round prices; no named rate card |
| 25 | B | `credit-score-band.ts:13-62` | SCORING_SYSTEMS | FICO, VantageScore, Experian UK, Equifax UK ranges and bands | 4 systems / ~20 bands | none stated | none | 2026-03-18 | credit-score-band (2c) | FICO, VantageScore, Experian UK, Equifax UK | Annually |  |
| 26 | B | `employment-cost-estimate.ts:17-383` | COUNTRY_PROFILES | Employer social, pension rates and income-tax brackets | 18 | none stated | "2024/2025 tax tables" (header); "(2024)" in SE note | 2026-02-27 | employment-cost-estimate (3c) | National tax / social insurance authorities; OECD Taxing Wages | Annually on 1 Jan (and fiscal-year start for GB, AU, CA) | Self-labelled 2024/2025 tables; SE state-tax threshold dated 2024 |
| 27 | B | `country-trade-data.ts:30-856` | EMBEDDED_DATA | Exports, imports, partners, top products per country (year 2023) | 33 | none stated (year field 2023) | year 2023 in data | 2026-02-27 | country-trade-data (20c) | UN Comtrade / WTO / World Bank WITS | Annually when the next year's data is final | Year disclosed (2023); 2024 data now final |
| 28 | B | `llm-cost-calculate.ts:44-124` | PRICING + MODEL_ALIASES | USD per 1K tokens per model, context windows | 52+8 | vendor pricing pages (PRICING_SOURCES) | 2026-08-15 (PRICING_VERIFIED_ON; test fails after 180 days) | 2026-08-15 | llm-cost-calculate (2c) | OpenAI, Anthropic, Google pricing pages | Monthly; on each model launch | Has staleness test (180 days); good pattern |
| 29 | C | `iban-validate.ts:7-44` | IBAN_LENGTHS + extractBankInfo positions | IBAN length and bank/branch code position per country | 79 + 12 | none stated | none | 2026-02-26 | iban-validate (free tier) (free tier) | SWIFT IBAN Registry | On each IBAN Registry release (several per year) | Likely missing recent registry entries (e.g. RU, OM, MN, NI, SO, YE, DJ, FK, BI); unverified |
| 30 | C | `swift-validate.ts:8-25` | COUNTRY_CODES | ISO 3166 alpha-2 codes accepted in a BIC | 219 | none stated | none | 2026-02-26 | swift-validate (3c) | ISO 3166 Maintenance Agency | On ISO 3166 newsletter |  |
| 31 | C | `vat-format-validate.ts:13-45` | VAT_FORMATS | EU VAT number regex and examples | 30 | none stated | none | 2026-02-26 | vat-format-validate (2c) | EC VIES technical docs | Annually |  |
| 32 | C | `company-id-detect.ts:17-50` | PATTERNS | Registry and tax ID formats per country | 23 | none stated | none | 2026-02-26 | company-id-detect (5c) | National business registers | Annually |  |
| 33 | C | `whois-lookup.ts:12-51` | TLD_SERVERS | WHOIS server per TLD | 38 | none stated | none | 2026-02-26 | whois-lookup (5c) | IANA root zone database | Quarterly |  |
| 34 | C | `bank-bic-lookup.ts:3-63` | KNOWN_BICS + ISO_COUNTRIES | BIC bank-code prefixes to bank names; alpha-2 names | 73+121 | none stated | none | 2026-02-27 | bank-bic-lookup (5c) | SWIFT BIC directory; ISO 3166 MA | Quarterly |  |
| 35 | C | `invoice-validate.ts:6-37` | VAT_PATTERNS | EU VAT number regex (third copy) | 30 | none stated | none | 2026-02-27 | invoice-validate (2c) | EC VIES technical docs | Annually |  |
| 36 | C | `domain-reputation.ts:88-88` | suspiciousTlds | TLDs treated as suspicious | 11 | none stated | none | 2026-02-27 | domain-reputation (5c) | Spamhaus TLD reputation; Interisle phishing reports | Quarterly |  |
| 37 | C | `secret-scan.ts:3-34` | PATTERNS | Vendor credential formats (AWS, GitHub, Stripe, ...) | 17 | none stated | none | 2026-02-27 | secret-scan (2c) | Vendor token-format docs; gitleaks rules | Quarterly |  |
| 38 | C | `header-security-check.ts:5-18` | SECURITY_HEADERS | Recommended headers, severities, values | 7 | none stated | none | 2026-02-27 | header-security-check (5c) | OWASP Secure Headers Project | Annually |  |
| 39 | C | `container-track.ts:26-76` | CARRIER_PREFIXES | Container owner prefix to carrier | 49 | none stated | none | 2026-02-27 | container-track (5c) | BIC (bic-code.org) owner codes | Annually |  |
| 40 | C | `shipping-track.ts:11-62` | carriers | Tracking-number formats and tracking URLs per carrier | 10 | none stated | none | 2026-02-27 | shipping-track (2c) | Carrier developer docs | Annually |  |
| 41 | C | `iban-to-bank.ts:4-57` | IBAN_LENGTHS + COUNTRY_NAMES + BANK_CODES | IBAN lengths (second copy; AD=28 disagrees with iban-validate's 24) and bank-code-to-bank map | 73+34+4 countries | none stated | none | 2026-03-18 | iban-to-bank (2c) | SWIFT IBAN Registry; Bundesbank BLZ file, national bank-code files | IBAN Registry releases; BLZ file quarterly | WRONG: AD length 28 (registry: 24); 6 countries fewer than iban-validate |
| 42 | C | `business-day-check.ts:6-8` | FRI_SAT_WEEKEND + FRI_ONLY_OFF | Countries with a Fri-Sat (or Fri) weekend | 17+1 | none stated | none | 2026-03-18 | business-day-check (2c) | National labour law / government gazettes | Annually | STALE: AE listed as Fri-Sat; UAE moved to Sat-Sun on 1 Jan 2022 |
| 43 | C | `timezone-lookup.ts:4-52` | COUNTRY_TIMEZONES + CITY_TIMEZONES | Country and city to IANA zone | 81+58 | none stated | none | 2026-03-18 | timezone-lookup (2c) | IANA tz database | On each tzdata release |  |
| 44 | C | `email-reputation-score.ts:7-35` | DISPOSABLE_DOMAINS + REPUTABLE_PROVIDERS | Disposable domains and provider reputation scores | 70+17 | none stated | none | 2026-03-18 | email-reputation-score (3c) | disposable-email-domains community list | Monthly |  |
| 45 | C | `domain-age-check.ts:9-17` | TLD_SERVERS | WHOIS server per TLD (second copy) | 20 | none stated | none | 2026-03-18 | domain-age-check (3c) | IANA root zone database | Quarterly |  |
| 46 | C | `ip-risk-score.ts:4-28` | DATACENTER_ASNS + VPN_ASNS | ASNs treated as datacenter / VPN | 17+5 | none stated | none | 2026-03-18 | ip-risk-score (deactivated) (3c, deactivated) | RIR / PeeringDB | On reactivation |  |
| 47 | C | `lib/vat-derivation.ts:127-129` | canDeriveVat list | Countries where the registry ID derives the VAT number | 8 | none stated | none | 2026-04-09 | kyb solutions / company data (shared) | National tax authorities | Annually |  |
| 48 | C | `workflow-security-audit.ts:118-129` | TRUSTED_PUBLISHERS | GitHub Action owners treated as trusted | 10 | none stated | none | 2026-04-11 | workflow-security-audit (3c) | GitHub verified creators | Annually |  |
| 49 | C | `nl-woz-value.ts:10-41` | CITY_TO_GM | Dutch city to CBS municipality code | 30 | none stated | none | 2026-04-12 | nl-woz-value (3c) | CBS Gemeentelijke indeling | Annually on 1 Jan (municipal mergers) |  |
| 50 | C | `nl-housing-stats.ts:10-41` | CITY_TO_GM | Dutch city to CBS municipality code (copy) | 30 | none stated | none | 2026-04-12 | nl-housing-stats (3c) | CBS Gemeentelijke indeling | Annually on 1 Jan |  |
| 51 | C | `lib/vat-providers/vies.ts:16-21` | EU27_PREFIXES | VAT prefixes routed to VIES (EU27 + XI) | 28 | none stated | none | 2026-04-27 | vat-validate (2c) | EC VIES | On EU membership change |  |
| 52 | C | `lib/iso-3166.ts:31-423` | COUNTRIES + SUPPLEMENTARY + ALIASES | Country codes, currency, capital, calling code, eu_member / schengen / eurozone flags | 204+46+22 | none stated | none | 2026-08-09 | iso-country-lookup (+ shared validation) (2c) | ISO 3166 MA; ECB (euro area); EU Commission (Schengen) | On ISO newsletter; 1 Jan for euro/Schengen accessions | STALE: BG, RO schengen=false (full members since 1 Jan 2025); BG eurozone=false, currency BGN (euro since 1 Jan 2026) |
| 53 | C | `keyword-rank-check.ts:262-272` | BARE_PUBLIC_SUFFIXES | Public suffixes | 41 | none stated | none | 2026-08-09 | keyword-rank-check (15c) | Public Suffix List (publicsuffix.org) | Quarterly |  |
| 54 | C | `lib/entity-identifier.ts:36-46` | VAT_SHAPES | EU VAT number regex per member state | 28 | none stated | none | 2026-10-26 | entity-resolve (15c) | EC VIES technical docs / TEDB | Annually |  |
| 55 | C | `email-validate.ts:17-89` | ROLE_PREFIXES + KNOWN_PROVIDERS + FREE_PROVIDERS | Role-account prefixes, known and free mailbox providers | 38+32+10 | none stated | none | 2026-11-06 | email-validate (free tier) (free tier) | disposable/free-provider community lists | Quarterly |  |
| 56 | C | `apps/api/package.json` | libphonenumber-js metadata (dependency) | Numbering-plan ranges via package ^1.12.38 | n/a | libphonenumber-js (stated in provenance) | package version only | 2026-02-26 | phone-validate, phone-normalize, phone-type-detect (2c) | ITU-T E.164 national plans via Google libphonenumber | Monthly dependency bump |  |
| 57 | C | `eurostat-data.ts:127-406` | EUROSTAT_ALLOWED_COUNTRIES/AGGREGATES/COUNTRY_LABELS | Eurostat GEO codes, aggregates and labels | 40+23+257 | Eurostat GEO codelist (stated) | 2026-10-26 (comment) | 2026-10-26 | eurostat-data (3c) | Eurostat GEO codelist | Annually on 1 Jan (euro-area/EU aggregates) |  |
| 58 | C | `lib/eurostat-regions.ts:9-211` | EUROSTAT_ALLOWED_REGIONS | NUTS region codes allowed | 2196 | generated from dataset audit fixture (stated) | 2026-10-26 (comment) | 2026-10-26 | eurostat-data (3c) | Eurostat NUTS classification | On NUTS revision (next NUTS 2027) |  |
| 59 | D | `uk-company-data.ts:150-161` | statusMap | Companies House status vocabulary | 10 | none stated | none | 2026-02-26 | uk-company-data (5c) | Companies House API enumerations (GitHub) | Annually |  |
| 60 | D | `swift-message-parse.ts:7-74` | TAG_NAMES + MT_DESCRIPTIONS | SWIFT MT field tags and message types | 45+17 | none stated | none | 2026-02-27 | swift-message-parse (2c) | Swift Standards MT release (MT retired for cross-border payments Nov 2025) | Annually (Swift Standards Release, Nov) |  |
| 61 | D | `port-lookup.ts:17-341` | PORTS | Ports with UN/LOCODE and coordinates | 196 | none stated | none | 2026-02-27 | port-lookup (5c) | UNECE UN/LOCODE | Semi-annually (UN/LOCODE releases) |  |
| 62 | D | `gdpr-website-check.ts:32-37` | cookieConsentPatterns | Consent-manager signatures | 16 | none stated | none | 2026-02-27 | gdpr-website-check (10c) | CMP vendor docs | Annually |  |
| 63 | D | `skill-extract.ts:6-190` | TECHNICAL_SKILLS, TOOLS, CERTIFICATIONS, ... | Skill, tool and certification vocabularies | 609 | none stated | none | 2026-02-27 | skill-extract (3c) | ESCO / vendor certification catalogues | Annually |  |
| 64 | D | `password-strength.ts:4-16` | COMMON_PASSWORDS + KEYBOARD_PATTERNS | Common passwords | 42+13 | none stated | none | 2026-02-27 | password-strength (2c) | NCSC / HIBP Pwned Passwords top lists | Annually |  |
| 65 | D | `flight-status.ts:66-77` | airlines | IATA airline codes to names | 33 | none stated | none | 2026-02-27 | flight-status (deactivated) (5c, deactivated) | IATA airline codes | On reactivation |  |
| 66 | D | `crypto-price.ts:13-19` | symbolMap | Ticker to CoinGecko id | 18 | none stated | none | 2026-02-27 | crypto-price (deactivated) (5c, deactivated) | CoinGecko | On reactivation |  |
| 67 | D | `lei-lookup.ts:29-56` | LEGAL_FORM_EXPANSIONS | Legal-form abbreviations | 20 | none stated | none | 2026-04-10 | lei-lookup (5c) | GLEIF ELF code list (ISO 20275) | Annually |  |
| 68 | D | `uk-filing-events.ts:16-29` | FILING_CATEGORIES | Companies House filing categories | 12 | none stated | none | 2026-04-12 | uk-filing-events (5c) | Companies House API enumerations | Annually |  |
| 69 | D | `sec-filing-events.ts:17-44` | ITEM_DESCRIPTIONS | SEC Form 8-K item numbers and titles | 26 | none stated | none | 2026-04-12 | sec-filing-events (5c) | SEC Form 8-K instructions | Annually |  |
| 70 | D | `c2pa-inspect.ts:26-32` | AI_ASSERTION_LABELS | C2PA / vendor assertion labels meaning AI generation | 5 | none stated | none | 2026-04-27 | c2pa-inspect (10c) | C2PA specification | On C2PA spec release |  |
| 71 | D | `estonian-company-data.ts:249-265` | legalForms + statusMap | e-Business Register legal form and status codes | 8+4 | none stated | none | 2026-05-15 | estonian-company-data (5c) | RIK e-Business Register codelists | Annually |  |
| 72 | D | `country-economic-indicators.ts:19-30` | INDICATOR_MAP | World Bank indicator codes | 10 | none stated | none | 2026-08-14 | country-economic-indicators (8c) | World Bank WDI | Annually |  |
| 73 | D | `company-fundamentals.ts:20-30` | METRICS | US-GAAP XBRL tags per metric | 9 | none stated | none | 2026-09-06 | company-fundamentals (10c) | FASB US GAAP taxonomy | Annually (taxonomy release) |  |
| 74 | D | `breach-exposure-check.ts:78-86` | CREDENTIAL_CLASSES | HIBP data classes counted as credentials | 7 | none stated | none | 2026-09-06 | breach-exposure-check (5c) | HIBP data classes API | Annually |  |
| 75 | D | `lib/tech-dns.ts:31-31` | SECOND_LEVEL_LABELS | Second-level labels for registrable-domain logic | 10 | none stated | none | 2026-11-06 | tech-stack-detect, company-tech-stack (3c) | Public Suffix List | Annually |  |
| 76 | D | `lib/vasp-data.ts:581-581` | REGISTRY_SECOND_LEVEL | Second-level labels for domain matching | 9 | none stated | none | 2026-11-06 | vasp-verify (2c) | Public Suffix List | Annually |  |
| 77 | D | `lib/tech-signatures.ts:85-528` | TECH_SIGNATURES + TECH_NAME_ALIASES | Technology fingerprints | 387+22 | none stated | none | 2026-11-06 | tech-stack-detect, company-tech-stack (3c) | Wappalyzer-style fingerprint sets | Quarterly |  |
| 78 | D | `website-carbon-estimate.ts:6-12` | ENERGY_PER_GB_KWH, CARBON_PER_KWH_GRAMS, MEDIAN_PAGE_SIZE_BYTES | Energy and grid-intensity factors for CO2 estimate | 5 | none stated (SWD model implied) | "2024" in page-size comment | 2026-02-27 | website-carbon-estimate (5c) | Sustainable Web Design model (SWDM v4); Ember global grid intensity; HTTP Archive | Annually |  |
| 79 | D | `lib/lithuanian-classifiers.ts:16-220` | FORMA_SNAPSHOT + STATUSAS_SNAPSHOT | Legal-form and status classifiers (fallback snapshot) | 168+31 | data.gov.lt Spinta API (stated) | 2026-09-24 (CLASSIFIER_SNAPSHOT_FETCHED_AT) | 2026-09-24 | lithuanian-company-data (deactivated) (5c, deactivated) | VĮ Registrų centras via data.gov.lt | On reactivation; semi-annually |  |
| 80 | D | `eurostat-data.ts:5-116` | EUROSTAT_ALLOWED_DATASETS | Eurostat dataset codes allowed | 110 | Eurostat (implied) | none on the list | 2026-10-26 | eurostat-data (3c) | Eurostat dataset catalogue | Semi-annually |  |

**How to read the table.**
- **Sort order:** rows are sorted by harm class, then undated before dated, then oldest last change first.
- **"Last git change":** the date from `git log -L <start>,<end>:<file> --format=%ad --date=short -s -1`. A date of 2026-02-26 or 2026-02-27 means the lines have not been touched since the repo's bulk creation.
- **Price:** `price_cents` from `manifests/<slug>.yaml`. "Shared" means the data is library code used by several tools.
- **"Re-check against":** the authoritative publisher. These are named from general knowledge and have not been verified per row, except for those spot-checked below.

## Spot-checks (5 most harmful class A/B datasets)

1. **`vat-rate-lookup.ts` VAT_RATES (B, 3c, also feeds invoice and tax answers): STALE.**
   - **Finland:** Vero.fi says 25.5% standard, **13.5%** (food, restaurants, books, medicine, transport, accommodation, culture) since 1 Jan 2026, and 10% only for newspapers and periodicals. The code has 10% for books, medicine and the like, and 14% for food. Source: [vero.fi rates of VAT](https://www.vero.fi/en/businesses-and-corporations/taxes-and-charges/vat/rates-of-vat/).
   - **Sweden:** food is **6%** from 1 Apr 2026 to 31 Dec 2027; restaurant service stays 12%. The code has food 12%. Source: [Skatteverket, moms](https://www.skatteverket.se/foretag/moms.4.18e1b10334ebe8bc80002497.html).
   - **Estonia:** standard **24%** since 1 Jul 2025, with 13% accommodation. The code has 22%. Source: [EMTA VAT rates](https://emta.ee/en/business-client/taxes-and-payment/value-added-tax/vat-rates-and-supply-exempt-tax/standard-vat-rate).
   - **Romania:** **21% / 11%** since 1 Aug 2025 under Law 141/2025. The code has 19% / 5% / 9%. Confirmed by secondary sources only ([EY](https://www.ey.com/en_gl/technical/tax-alerts/romanian-tax-changes-introduced-by-new-fiscal-and-budgetary-measures), [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2025/08/tnf-romania-various-tax-reform-measures-effective-august-1-2025.html)); the ANAF statute text was not opened.
   - **Commission source:** the Commission's own consolidated table now lives in TEDB ([taxation-customs.ec.europa.eu/vat-rates](https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en)). Its old PDF URL returns 404, so national authorities were used instead.

2. **`country-tax-rates.ts` TAX_DATA (B, 2c): STALE.**
   - It carries the same VAT errors (EE, RO, FI, SE, and likely SK).
   - **Corporate rates:** Lithuania is **16%** from 2025 (code: 15%) and Estonia is **22%** (22/78) from 2025 (code: 20%). These come from secondary sources ([PwC tax summaries, LT](https://taxsummaries.pwc.com/Lithuania/Corporate/Taxes-on-corporate-income), [Tax Foundation](https://taxfoundation.org/data/all/eu/corporate-income-tax-rates-europe), [Cobalt Baltic Tax Card 2026](https://www.cobalt.legal/wp-content/uploads/2026/02/Baltic-Tax-Card-2026.pdf)); the VMI and EMTA pages were not surfaced.
   - The other ~45 countries were not checked row by row.

3. **`eu-ai-act-classify.ts` rules (A, 20c, the most expensive class-A tool here): STALE.**
   - EUR-Lex shows **Regulation (EU) 2026/1744** of 8 July 2026 (Digital Omnibus on AI), published in the OJ on 24 July 2026. It sets **2 December 2027** for Annex III high-risk obligations ([EUR-Lex](https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng)).
   - Every HIGH_RISK_RULES row says "Obligations apply from 2 August 2026". After that date has passed, this tells callers the obligations are already in force.
   - Annex I-embedded systems reportedly move to 2 Aug 2028 (secondary sources only).
   - The prohibitions dated 2 Feb 2025 remain correct.

4. **`work-permit-requirements.ts` rule notes (A, 2c): STALE.**
   - **UK:** gov.uk gives the Skilled Worker general threshold as **GBP 41,700**; the code says GBP 26,200 ([gov.uk](https://www.gov.uk/skilled-worker-visa/your-job)).
   - **Germany:** Make it in Germany gives the 2026 Blue Card as **EUR 50,700**, or EUR 45,934.20 for shortage occupations; the code has the 2024 figures ([make-it-in-germany.com](https://www.make-it-in-germany.com/en/visa-residence/types/eu-blue-card)).
   - **Not checked:** the SCHENGEN_WAIVER and EU_EEA sets, and Sweden's 80%-of-median salary rule (not modelled).

5. **`financial-year-dates.ts` FISCAL_YEAR_DATA (A, 2c): STALE or wrong for Sweden.**
   - Skatteverket sets the Inkomstdeklaration 2 deadline by fiscal-year end. A calendar-year company files by **1 August**; the code says "May 1", with "6 months after FY end" for broken years ([Skatteverket](https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraatettaktiebolagellerenekonomiskforening.4.46ae6b26141980f1e2d1261.html)).
   - The other 47 countries were not checked.

**Additional check: `business-day-check` UAE weekend: STALE.** The UAE moved to a Saturday-Sunday weekend on 1 Jan 2022. This is confirmed by news coverage of the government announcement ([The National](https://www.thenationalnews.com/uae/government/2021/12/07/breaking-uae-makes-major-changes-to-working-week)); the u.ae page was not surfaced.

**Not spot-checked but high on the list:**
- `data-protection-authority-lookup`: 30 DPA contacts, undated.
- `dangerous-goods-classify`: UN numbers. These are stable, but the packing data follows the biennial ADR/UN revision.
- `lib/dilisense-sources.ts`: a six-month-old snapshot behind a disclosure claim.
- `employment-cost-estimate`: self-labelled 2024/2025.
- `token-count` prices.
- `marketplace-fee-calculate`.

No site blocked access during the checks. The EC VAT PDF URL was dead (404) rather than bot-blocked.

## Excluded on purpose

- **Stable standards that do not move in practice:** month and day names, cron fields, unit conversions, WMO weather codes, IANA well-known ports, Base58 version bytes, national-ID checksum algorithms, ISO 639 language names, RF/OCR payment-reference algorithms.
- **Internal enums and routing:** `data/error-codes.ts`, `data/capability-fallbacks.ts`, `guarded-executor` cost classes and ALLOW_MATRIX, `auto-register` DEACTIVATED, `website-to-company` routing, `lib/enrich-company-output` COUNTRY_ID_MAP, `lib/openapi-resolver` PRODUCT_REGISTRY, `lib/alchemy-client` CHAINS (vendor config).
- **Scoring methodology Strale owns:** `adverse-media-check` thresholds and keywords, `aml-risk-score` point weights.
- **Heuristic word lists:** DKIM selectors, policy-page paths, soft-404 phrases, name prefixes and particles, gitignore templates, country-name alias maps.
- **Data fetched live:** holidays (Nager.Date), postal codes, HS and customs (LLM plus TARIC page), sanctions and PEP (Dilisense). Their correctness is upstream's.
- **Out of scope but adjacent:** `apps/api/src/lib/tos-blocklist.ts` and `vendor-terms.ts` hold dated vendor-terms facts and should join the register later.

## Proposed register shape

The proposal is one file, `config/reference-data.yaml`, with a schema `config/reference-data.schema.json` and a checker `npm run refdata:check`. It is the same shape as `config/env-manifest.yaml` and `docs/company/claims.yaml`: a header comment that says what the check can and cannot see, then one row per dataset.

```yaml
# Reference-data register (robustness R2). One row per hard-coded dataset whose
# correctness depends on the outside world. Checker: scripts/check-reference-data.mjs
# (`npm run refdata:check`). What it CAN see: every row resolves to a symbol in
# its file; every `as_of_symbol` constant exists and equals `as_of`; no row is
# past `recheck.due`; an edit to the dataset's lines (git blob of the symbol's
# span) without a new `verified_on` fails. What it CANNOT see: whether the
# values are right. That is the human or agent re-check named in `recheck`.
- id: fatf-grey-list
  file: apps/api/src/capabilities/aml-risk-score.ts
  symbol: FATF_GREY_LIST            # resolved by AST, not line number
  as_of_symbol: FATF_LISTS_AS_OF    # optional; constant in code that must equal as_of
  holds: FATF jurisdictions under increased monitoring (ISO alpha-2)
  entries: 18
  harm_class: A                     # A compliance/legal | B money/tax | C validation | D convenience
  tools: [aml-risk-score]           # slugs; price and free-tier read from manifests at check time
  shared_with: []                   # other ids holding the same facts (dedupe target)
  source:
    publisher: FATF
    url: https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html
    secondary: FinCEN release 2026-10-30   # when the primary blocks automated reads
  as_of: 2026-10-30                 # date the publisher's data is from
  verified_on: 2026-11-06           # date a person/agent last compared code to source
  verified_by: receipt              # path under archive/receipts/ (T15) or a PR number
  recheck:
    trigger: after each FATF plenary (Feb, Jun, Oct)
    max_age_days: 120               # check fails when verified_on + max_age_days < today
  status: current                   # current | stale | unverified | retired
  note: >
    Myanmar is call-for-action but EDD-only; countermeasures set is separate.
```

**Checker rules**, mirroring `env:check` and `codex:check`:
- **Every row resolves:** the file exists, and the symbol exists and is a literal.
- **Rows are complete:** `harm_class` A and B rows must have `source.url`, `as_of` and `max_age_days` ≤ 180, with A ≤ 120 for plenary or legislative cadences.
- **Rows are not overdue:** `verified_on + max_age_days` must not be in the past. The check warns 30 days early and fails after the limit. This is the alarm that FATF and EU lists lacked.
- **Edits need re-verification:** changing the symbol's span without moving `verified_on` fails, because editing data is a verification event and must cite its receipt.
- **Unregistered datasets fail:** a new literal set, array or object with 10 or more country codes, rates or similar values under `capabilities/` that has no row fails. The heuristic can reuse this inventory's AST scan (`scan.cjs`, kept in the scratchpad).
- **Duplicates must point to one source:** a row with `shared_with` set fails unless the duplicates import one source. This forces the IBAN, VAT-regex, EU-member and WHOIS copies to consolidate.
- **Optional tool output:** class A and B tools emit `provenance.reference_data_as_of`, so callers see the date. The aml-risk-score pattern already exposes this.

## Method and caveats

- **How datasets were found:** a TypeScript-AST scan of all in-scope files flagged every variable whose initializer is a literal array, object, `Set` or `Map` with 4 or more literal entries (219 hits in 140 files). A regex pass then caught inline country lists, threshold strings and date comments. Both scripts are under `/tmp/claude-0/-home-user/c5c26bd7-e338-5d6d-a137-2638247415e8/scratchpad/inv/`. Each hit was then classified by hand.
- **Possible misses:** datasets built by function calls were found only by grep. `license-compatibility-check` `add(...)` calls and `shipping-cost-estimate` BASE_RATES (3 top-level keys) were found that way, and a few others may have been missed.
- **Entry counts:** these are top-level entries; nested values such as VAT categories are not counted.
- **Authoritative sources and cadences:** proposed from general knowledge, and not verified per row except in the spot-checks.
- **Unverified claim:** `iban-validate` is probably missing recent IBAN-registry countries (RU, OM, MN, NI, SO, YE, DJ, FK, BI). This was not checked against the SWIFT registry.
