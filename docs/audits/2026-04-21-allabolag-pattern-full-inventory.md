# Allabolag-Pattern Full Inventory — Platform-Wide Audit

**Date:** 2026-04-21
**Author:** Claude Code (read-only audit)
**Scope:** Every capability under `apps/api/src/capabilities/*.ts` (307 files), their manifests under `manifests/*.yaml` (292 files), and the shared outbound-call helpers under `apps/api/src/capabilities/lib/`.
**Status:** Read-only inventory. No code, schema, DB, or manifest changes. One new file written: this report.
**Driver:** DEC-20260405-A ("Allabolag pattern") was treated as an isolated Swedish case. The prior 2026-04-21 KYB audit found it recurring in 10 EU+CH countries. This audit answers the wider question: how many capabilities platform-wide have a manifest `data_source` that does not match the runtime outbound host?

---

## 1. Summary

Audit covers **307 capability files** (312 `.ts` files under `apps/api/src/capabilities/` minus 3 SSRF test files and 2 non-capability support files `index.ts` / `auto-register.ts`). Joined against **292 manifests**; 15 capabilities have **no manifest** (pre-manifest era — 4 deactivated country caps, 11 active UK-property / algorithmic caps).

Headline counts:

- **11 `full-divergence`** — manifest names an authority, runtime hits an unrelated third-party aggregator or KYB-competitor-owned domain. Includes the prior Swedish and 10-country KYB inventory plus **2 newly surfaced cases** inside this audit (`annual-report-extract`, `officer-search`) and 3 **pre-existing deactivated** country caps that hit `opencorporates.com` / `tofler.in` (HK, SG, IN).
- **13 `transport-divergence`** — manifest names the correct authority but the runtime channel is a third-party wrapper, a public-UI scrape, or a sibling government agency. Includes all 6 non-Nordic EU+non-EU KYB countries from the prior audit plus **6 newly surfaced cases** this prompt (`brazilian-company-data`, `australian-company-data`, `canadian-company-data`, `japanese-company-data`, `austrian-company-data`, `estonian-company-data`) plus `customs-duty-lookup`, `hs-code-lookup`, `german-company-data`.
- **1 `undeclared-scrape`** — `amazon-price`: no manifest, browserless scrape.
- **10 `needs-runtime-trace`** — pre-manifest-era capabilities (no manifest file) that fetch direct public APIs. Not a divergence per se — but they have no declared `data_source` at all. See Section 10.
- **108 `match`** — manifest and runtime agree. This includes the 34 honestly-declared scraper caps (cookie-scan, price-compare, container-track, etc.) where the manifest honestly names "Headless browser" / "HTTP fetch" / names the scraped host.
- **60 `licensed-third-party`** — primarily Anthropic (Claude API) and Etherscan-backed capabilities where the manifest correctly names the licensed provider.
- **102 `pure-computation`** — deterministic / algorithmic / node-native only. No outbound HTTP.
- **2 `internal`** — `vasp-verify` and `vasp-non-compliant-check` read a local CASP dataset via `lib/vasp-data.ts`.

**Total divergence surface: 25 capabilities (11 full + 13 transport + 1 undeclared) = 8.1% of all capabilities.**
Plus 10 `needs-runtime-trace` pre-manifest caps with no declared `data_source` = **35 capabilities needing either manifest correction or runtime swap (11.4%).**

**No stop condition fired.** Divergence total is below the 50-capability halt threshold. No new-country KYB-competitor exposure beyond what the prior audit already flagged (no new `full-divergence` lands on a country not in the prior 10+CH set — except the activation of **BR** (receitaws.com.br, a third-party), and the deactivated HK/SG/IN caps hitting OpenCorporates, which is an ODbL-licensing exposure but the caps are not in v1 scope).

---

## 2. Class counts

| Class | Count | % of 307 |
| --- | ---: | ---: |
| `match` | 108 | 35.2% |
| `pure-computation` | 102 | 33.2% |
| `licensed-third-party` | 60 | 19.5% |
| `transport-divergence` | 13 | 4.2% |
| `full-divergence` | 11 | 3.6% |
| `needs-runtime-trace` | 10 | 3.3% |
| `internal` | 2 | 0.7% |
| `undeclared-scrape` | 1 | 0.3% |
| **Total** | **307** | **100.0%** |

Sum check: 108 + 102 + 60 + 13 + 11 + 10 + 2 + 1 = 307. ✓ No slug appears in more than one class (verified by generating `byclass/*.tsv`).

---

## 3. Full-divergence list

| Slug | Manifest `data_source` | Runtime host | Runtime library | Blast radius |
| --- | --- | --- | --- | --- |
| `swedish-company-data` | Bolagsverket (Swedish Companies Registration Office) | `www.allabolag.se` (Enento/UC-owned KYB competitor) | `lib/web-provider` + `lib/browserless-extract` + `@anthropic-ai/sdk` | KYB v1 (3) `kyb-essentials-se`, `kyb-complete-se`, `invoice-verify-se`; legacy `kyc-sweden` (inactive) |
| `dutch-company-data` | KVK / Kamer van Koophandel (Netherlands Chamber of Commerce) | `www.northdata.com` | `lib/northdata` | KYB v1 (3) `kyb-essentials-nl`, `kyb-complete-nl`, `invoice-verify-nl` + `extendsWith` link from a real-estate solution |
| `portuguese-company-data` | Registo Comercial (Portuguese Commercial Register) | `www.northdata.com` | `lib/northdata` | KYB v1 (3) `kyb-essentials-pt`, `kyb-complete-pt`, `invoice-verify-pt` |
| `lithuanian-company-data` | Registrų centras (Lithuanian Centre of Registers) | `www.northdata.com` | `lib/northdata` | KYB v1 (3) `kyb-essentials-lt`, `kyb-complete-lt`, `invoice-verify-lt` |
| `spanish-company-data` | Registro Mercantil Central (Spanish Commercial Register) | `www.empresia.es` + `www.infocif.es` | `lib/browserless-extract` | KYB v1 (3) `kyb-essentials-es`, `kyb-complete-es`, `invoice-verify-es` |
| `annual-report-extract` | Claude API (financial document analysis) | `www.allabolag.se` (scraped for Swedish annual-report PDFs) | `@anthropic-ai/sdk` + direct fetch | standalone; used inside some Swedish invoice-verify flows |
| `business-license-check-se` | Headless browser + Swedish authority registries | `www.allabolag.se` | `lib/browserless-extract` + `@anthropic-ai/sdk` | standalone (Swedish compliance suite) |
| `officer-search` | **(NO MANIFEST)** | `api.company-information.service.gov.uk` + `data.sec.gov` + `www.northdata.com` | direct fetch | standalone |
| `hong-kong-company-data` | **(NO MANIFEST)** — DEACTIVATED | `opencorporates.com` | `lib/browserless-extract` | none (DEACTIVATED per `auto-register.ts`) |
| `singapore-company-data` | **(NO MANIFEST)** — DEACTIVATED | `opencorporates.com` | `lib/browserless-extract` | none (DEACTIVATED per `auto-register.ts`) |
| `indian-company-data` | **(NO MANIFEST)** — DEACTIVATED | `www.tofler.in` (third-party IN company-data aggregator) | `lib/browserless-extract` | none (DEACTIVATED per `auto-register.ts`) |

Sort: blast radius desc.

**Full-divergence adds beyond the prior KYB audit:** `annual-report-extract` (active, silent on allabolag), `officer-search` (active, silent on northdata.com), and the 3 deactivated OpenCorporates/tofler caps. `swedish-company-data`, `business-license-check-se`, DE/NL/PT/LT/ES retained from the prior audit.

---

## 4. Transport-divergence list

| Slug | Manifest `data_source` | Runtime host | Runtime library | Blast radius |
| --- | --- | --- | --- | --- |
| `german-company-data` | Handelsregister (German Commercial Register) via northdata.com | `www.northdata.com` | `lib/northdata` + `@anthropic-ai/sdk` | KYB v1 (3) DE |
| `belgian-company-data` | Kruispuntbank van Ondernemingen (Belgian Crossroads Bank for Enterprises) | `cbeapi.be` (third-party API wrapper) primary + `kbopub.economie.fgov.be` scrape fallback | `lib/browserless-extract` + `lib/vat-derivation` | KYB v1 (3) BE |
| `irish-company-data` | CRO / Companies Registration Office (Ireland) | `core.cro.ie` (gov UI scrape) | `lib/browserless-extract` | KYB v1 (3) IE |
| `italian-company-data` | Registro Imprese / Italian Business Register (InfoCamere) | `www.registroimprese.it` (gov UI scrape) | `lib/browserless-extract` + `lib/vat-derivation` | KYB v1 (3) IT |
| `latvian-company-data` | Uzņēmumu reģistrs (Latvian Register of Enterprises) | `info.ur.gov.lv` (gov UI scrape) | `lib/browserless-extract` | KYB v1 (3) LV |
| `austrian-company-data` | FinAPU Firmenbuch API (Austrian Commercial Register) | `firmenbuch.finapu.com` (third-party) primary + `firmen.wko.at` (Chamber of Commerce UI scrape) fallback | `lib/browserless-extract` | KYB v1 (3) AT |
| `estonian-company-data` | Äriregister / Estonian Business Register | `ariregister.rik.ee` (gov API + Browserless proxy fallback for 403'd IPs) | `lib/browserless-extract` + `@anthropic-ai/sdk` | KYB v1 (3) EE |
| `brazilian-company-data` | Receita Federal / CNPJ Registry (Brazil) | `receitaws.com.br` (third-party wrapper) | direct fetch + `@anthropic-ai/sdk` | `kyb-essentials-br`, `kyb-complete-br` (if BR is in KYB v1 build — verify per `seed-kyb-solutions.ts`) |
| `japanese-company-data` | National Tax Agency Corporate Number System (Japan) | `www.houjin-bangou.nta.go.jp` (gov UI scrape) | `lib/browserless-extract` | likely none in KYB v1; non-EU |
| `australian-company-data` | ASIC / Australian Securities and Investments Commission | `abr.business.gov.au` (different AU agency — ABR publishes ABN, ASIC holds company register) via Browserless scrape + Phase-2 provider chain to ABR API | `lib/browserless-extract` + providers/ chain | KYB v1 (3) AU. Separate sibling `au-company-data` exists and is correctly attributed to ABR. |
| `canadian-company-data` | Corporations Canada / Provincial registries | `ised-isde.canada.ca` (federal portal UI scrape) | `lib/browserless-extract` | KYB v1 (3) CA |
| `customs-duty-lookup` | TARIC (EU Customs Tariff Database, European Commission) | `ec.europa.eu` + `trade.ec.europa.eu` (gov UI scrape, not the TARIC machine-readable feed) | `lib/browserless-extract` + `@anthropic-ai/sdk` | standalone (logistics) |
| `hs-code-lookup` | Harmonized System nomenclature database (WCO) | **none — pure Claude/LLM classification from training data**; no outbound call to WCO or any database | `@anthropic-ai/sdk` | standalone |

Sort: blast radius desc within KYB v1, then alphabetical.

**Transport-divergence adds beyond the prior KYB audit:** `brazilian-company-data`, `austrian-company-data`, `estonian-company-data`, `japanese-company-data`, `australian-company-data`, `canadian-company-data`, `customs-duty-lookup`, `hs-code-lookup`. The prior audit treated AT/EE as "already canonical" implicitly — this audit re-examined and flags them.

---

## 5. Undeclared-scrape list

| Slug | Manifest `data_source` | Runtime host | Runtime library | Blast radius |
| --- | --- | --- | --- | --- |
| `amazon-price` | **(NO MANIFEST)** | `www.amazon.*` (country-specific) | `lib/browserless-extract` + `@anthropic-ai/sdk` | already noted in `auto-register.ts` DEACTIVATED list ("Amazon CAPTCHA blocks datacenter IPs") — effectively off |

Only one. Scoped, small surface.

---

## 6. Match list (completeness — manifest names agree with runtime)

108 capabilities. Sample of notable matches (includes capabilities that honestly declare a scrape mechanism):

| Slug | Manifest `data_source` | Runtime host |
| --- | --- | --- |
| `au-company-data` | Australian Business Register (ABR) | `abr.business.gov.au` |
| `cz-company-data` | ARES (Czech Ministry of Finance) | `ares.gov.cz` (+ `adisrws.mfcr.cz` VAT) |
| `danish-company-data` | CVR / Danish Business Authority (Erhvervsstyrelsen) | `cvrapi.dk` + `datacvr.virk.dk` |
| `finnish-company-data` | PRH / Finnish Patent and Registration Office | `avoindata.prh.fi` |
| `french-company-data` | INSEE / Registre du Commerce (France) | `recherche-entreprises.api.gouv.fr` |
| `norwegian-company-data` | Brønnøysund Register Centre (Norway) | `data.brreg.no` |
| `polish-company-data` | KRS / Krajowy Rejestr Sądowy (Polish National Court Register) | **primary** `api-krs.ms.gov.pl`; **fallback** `www.northdata.com` (see Section 10) |
| `swiss-company-data` | Zefix PublicREST API (Federal Office of Justice, Switzerland) | **primary** `www.zefix.admin.ch` via `providers/swiss-company-data.ts` chain; **fallback** `www.northdata.com` via `lib/northdata` (see Section 10) |
| `uk-company-data` | Companies House (UK Government) | `api.company-information.service.gov.uk` |
| `us-company-data` | SEC EDGAR (US Securities and Exchange Commission) | `data.sec.gov` + `efts.sec.gov` + `www.sec.gov` |
| `credit-report-summary` | Allabolag.se (Swedish credit data aggregator) | `www.allabolag.se` — **manifest honestly names aggregator** |
| `gdpr-fine-lookup` | GDPR Enforcement Tracker (public enforcement database) | `www.enforcementtracker.com` — manifest matches |
| `trustpilot-score` | Headless browser (Trustpilot public company pages) | `www.trustpilot.com` — manifest matches |
| `eu-court-case-search` | CURIA (Court of Justice of the European Union) | `curia.europa.eu` + `hudoc.echr.coe.int` |
| `eu-regulation-search` | EUR-Lex (Official Journal of the European Union) | `eur-lex.europa.eu` |
| `eu-trademark-search` | EUIPO (European Union Intellectual Property Office) | `euipo.europa.eu` |
| `veb-extract` / `web-extract` | Headless browser rendering via Browserless.io (JavaScript-rendered content) | user-provided URL via Browserless |
| `screenshot-url`, `html-to-pdf`, `url-to-markdown`, `youtube-summarize`, `structured-scrape`, `pricing-page-extract`, `cookie-scan`, `accessibility-audit`, `seo-audit`, `terms-of-service-extract`, `privacy-policy-analyze`, `return-policy-extract`, `product-search`, `product-reviews-extract`, `price-compare`, `company-tech-stack`, `competitor-compare`, `landing-page-roast`, `employer-review-summary`, `salary-benchmark`, `patent-search`, `container-track` | honest "Headless browser" / "HTTP fetch + Claude API" declarations | user-provided or honestly-named site |

Full match list (108): see `c:/tmp/audit-work/byclass/match.tsv` (not committed). Alphabetically: accessibility-audit, address-geocode, address-validate, adverse-media-check, approval-security-check, au-company-data, backlink-check, barcode-lookup, beneficial-ownership-lookup, charity-lookup-uk, company-news, company-tech-stack, competitor-compare, container-track, cookie-scan, country-trade-data, credit-report-summary, crypto-price, currency-convert, cve-lookup, cz-company-data, cz-unreliable-vat-payer, danish-company-data, data-protection-authority-lookup, dependency-audit, docker-hub-info, ecb-interest-rates, employer-review-summary, eori-validate, eu-court-case-search, eu-regulation-search, eu-trademark-search, exchange-rate, fear-greed-index, finnish-company-data, flight-status, food-safety-rating-uk, forex-history, french-company-data, gdpr-fine-lookup, github-repo-analyze, github-repo-compare, github-user-profile, google-search, gsb-url-check, hs6-to-duty-rate, html-to-pdf, ip-geolocation, job-board-search, keyword-suggest, landing-page-roast, lei-lookup, linkedin-company-lookup, news-headline-summary, norwegian-company-data, npm-package-info, oil-price-check, page-speed-test, patent-search, pep-check, polish-company-data, pre-trade-check, price-compare, pricing-page-extract, privacy-policy-analyze, product-reviews-extract, product-search, public-holiday-lookup, pypi-package-info, rentals-search, return-policy-extract, salary-benchmark, sanctions-screen, screenshot-url, seo-audit, sepa-direct-debit-payload, smart-contract-risk-score, solana-wallet-balance, stablecoin-volume, startup-pulse, structured-scrape, subdomain-enumerate, swiss-company-data, ted-procurement, terms-of-service-extract, trending-repos, trustpilot-score, uk-company-data, uk-filing-events, uk-companies-house-officers, url-scanner, url-to-markdown, us-company-data, vat-validate, vessel-track, voice-transcribe, weather-lookup, web-extract, wayback-lookup, yt-comment-sentiment, youtube-summarize, plus ~8 more.

---

## 7. Pure-computation list (no outbound call)

102 slugs, alphabetised:

age-verify, aml-risk-score, api-health-check, bank-bic-lookup, base64-encode-url, business-day-check, company-id-detect, company-name-match, country-tax-rates, credit-score-band, cron-explain, csv-clean, csv-to-json, cz-bank-account-validate, cz-birth-number-validate, cz-datova-schranka-id-validate, cz-ico-validate, dangerous-goods-classify, data-quality-check, date-parse, deduplicate, diff-json, dns-lookup, domain-age-check, domain-reputation, email-deliverability-check, email-reputation-score, email-validate, employment-cost-estimate, ens-resolve, ens-reverse-lookup, eu-ai-act-classify, financial-year-dates, flatten-json, gdpr-website-check, gitignore-generate, header-security-check, http-to-curl, iban-to-bank, iban-validate, id-number-validate, image-resize, incoterms-explain, invoice-validate, isbn-validate, iso-country-lookup, json-repair, json-schema-validate, json-to-csv, json-to-pydantic, json-to-typescript, json-to-zod, jwt-decode, language-detect, license-compatibility-check, link-extract, llm-cost-calculate, llm-output-validate, log-parse, markdown-to-html, marketplace-fee-calculate, meta-extract, mx-lookup, name-parse, og-image-check, openapi-validate, paid-api-preflight, password-strength, payment-reference-generate, phone-normalize, phone-type-detect, phone-validate, port-check, port-lookup, redirect-trace, robots-txt-parse, schema-infer, secret-scan, sepa-xml-validate, shipping-cost-estimate, sitemap-parse, skill-extract, skill-gap-analyze, ssl-certificate-chain, ssl-check, swift-message-parse, swift-validate, tax-id-validate, timezone-lookup, timezone-meeting-find, token-count, tool-call-validate, unit-convert, uptime-check, url-health-check, url-to-text, vat-format-validate, vat-rate-lookup, website-carbon-estimate, whois-lookup, workflow-security-audit, xml-to-json.

Note on "pure": several caps here (`dns-lookup`, `mx-lookup`, `ssl-check`, `port-check`, `whois-lookup`, `url-health-check`, `redirect-trace`, `ssl-certificate-chain`, `api-health-check`, `email-deliverability-check`, `email-reputation-score`, `header-security-check`, `domain-reputation`, `gdpr-website-check`, `og-image-check`, `robots-txt-parse`, `sitemap-parse`, `uptime-check`, `link-extract`) DO make outbound network calls but via Node native modules (`node:dns`, `node:net`, `node:tls`) or HTTP against user-provided URLs. They are "pure" in the sense that they do not depend on any single declared authority — the target is whatever domain the caller supplies. Treat them as pure for this audit; all are classified correctly against their manifests.

---

## 8. Shared-helper map

### `apps/api/src/capabilities/lib/browserless-extract.ts` (45 callers)

Provides `fetchRenderedHtml`, `htmlToText`, `extractCompanyFromText`, `extractCompanyName` — Browserless.io rendered-HTML + Claude Haiku extraction.

Grouped by class:

- **`full-divergence` (6 callers):** `swedish-company-data`, `spanish-company-data`, `business-license-check-se`, `hong-kong-company-data` (deact), `singapore-company-data` (deact), `indian-company-data` (deact).
- **`transport-divergence` (10 callers):** `belgian-company-data`, `irish-company-data`, `italian-company-data`, `latvian-company-data`, `austrian-company-data`, `australian-company-data`, `canadian-company-data`, `japanese-company-data`, `estonian-company-data`, `customs-duty-lookup`.
- **`undeclared-scrape` (1):** `amazon-price` (deact).
- **`match` (28 callers):** `accessibility-audit`, `company-tech-stack`, `competitor-compare`, `container-track`, `cookie-scan`, `credit-report-summary`, `employer-review-summary`, `eu-court-case-search`, `eu-regulation-search`, `eu-trademark-search`, `gdpr-fine-lookup`, `html-to-pdf`, `landing-page-roast`, `patent-search`, `price-compare`, `pricing-page-extract`, `privacy-policy-analyze`, `product-reviews-extract`, `product-search`, `return-policy-extract`, `salary-benchmark`, `screenshot-url`, `seo-audit`, `structured-scrape`, `terms-of-service-extract`, `trustpilot-score`, `url-to-markdown`, `youtube-summarize`.

Prior audit already noted: do NOT delete the helper when migrating the 16 divergent KYB callers off it — 28 legitimate callers remain.

### `apps/api/src/capabilities/lib/northdata.ts` (5 callers)

Provides `searchNorthdata` — fetches northdata.com profile pages and extracts JSON-LD.

- **`full-divergence` (3 callers):** `dutch-company-data`, `portuguese-company-data`, `lithuanian-company-data`.
- **`transport-divergence` (1 caller):** `german-company-data` (manifest partial-transparency: "via northdata.com").
- **`match` (1 caller):** `swiss-company-data` — uses northdata only as **fallback** after primary Zefix fails.

Also referenced as a **fallback** by `polish-company-data` (via direct fetch, not helper import) and **one of three sources** by `officer-search`. Those two caps read northdata.com but don't import the helper.

Once the 3 full-divergence migrations land and `german-company-data` moves to a licensed DE aggregator, only the Swiss fallback remains — a reasonable moment to delete the helper and the CH fallback together.

### `apps/api/src/capabilities/lib/web-provider.ts` (1 caller)

Used by `swedish-company-data` only. Wraps Browserless + parsing. Will become orphaned once the Swedish migration lands.

### `apps/api/src/capabilities/lib/etherscan-client.ts` (5 callers)

`contract-verify-check`, `wallet-age-check`, `wallet-balance-lookup`, `wallet-transactions-lookup`, `gas-price-check`. All classed `licensed-third-party`; manifests correctly name Etherscan. Clean.

### `apps/api/src/capabilities/lib/vasp-data.ts` (3 callers)

`vasp-verify`, `vasp-non-compliant-check`, `contract-verify-check` (for VASP lookups). Reads local CASP dataset; `internal` class. Clean.

### `apps/api/src/capabilities/lib/jina-reader.ts` (1 caller)

`url-to-markdown`. Clean (`match`).

### `apps/api/src/capabilities/lib/enrich-company-output.ts`, `vat-derivation.ts`, `name-resolver.ts`, `readability-convert.ts`

Non-outbound support helpers (normalisation / derivation / text processing). No shared-host concern.

---

## 9. Manifest schema observations

### Fields that exist today

Manifest YAML files contain (among others):

- `data_source` — free-text string naming the authority or mechanism. Used by 292 of 307 capabilities (15 have no manifest).
- `data_source_type` — controlled vocabulary: `api`, `scrape`, `computed`, `api+scrape`, etc. Used by all 292 manifests.
- `transparency_tag` — controlled vocabulary: `algorithmic`, `ai_generated`, `mixed`.

The `capabilities` DB table (`apps/api/src/db/schema.ts` lines 93–140) mirrors the first three as columns:

- `data_source text` (col 109)
- `transparency_tag varchar(30)` (col 105) — enum comment: `'ai_generated' | 'algorithmic' | 'mixed'`
- `freshness_category text` (col 117) — enum comment: `'live-fetch' | 'reference-data' | 'computed'`

No `data_source_type` column. `data_source_type` from manifests does not appear to be persisted — it is only validated (or copied into some JSON blob). This is a **manifest schema/DB schema mismatch**: the manifest carries more structure than the DB preserves.

### Is `data_source_type: scrape` honestly populated?

Mixed. Among the **45 browserless callers**:

- 43 manifests declare `data_source_type: scrape`.
- 2 are inconsistent: `estonian-company-data` declares `data_source_type: api` (because the primary path IS an API — the Browserless is a 403-fallback), and the 3 deactivated caps have no manifest.

Among the **5 northdata callers**: all declare `data_source_type: scrape`. But manifest `data_source` still names the downstream government authority for 4 of them — so "type=scrape" is truthful, but "data_source=KVK" is not.

**Takeaway:** `data_source_type` is mostly honest about mechanism; `data_source` is the field that lies.

### Is there an existing field that could serve as `runtime_source` without a migration?

No. `data_source` is the only attribution field in the DB. `freshness_category` is orthogonal. The manifest YAML has one more field (`data_source_type`) that is not persisted.

Options for a future structural gate:

1. **Add a `runtime_host` or `runtime_source` column** (requires Drizzle migration). Cleanest; allows the gate to check `manifest.data_source` (authority) vs `runtime.data_source` (host) as two separate declarations.
2. **Repurpose/rename `data_source` to mean "runtime host" and add a new `authority_name` field** — behavioural reuse, harder to rationalise for old rows.
3. **Store both in existing `data_source` with a delimiter** (e.g. `"KVK :: northdata.com"`) — cheapest, but fragile and unenforceable.
4. **Keep manifests as single source of truth, add a `runtime_source` field to manifest only, regenerate DB value at onboarding time** — the DB keeps one column; the manifest gains structure. Probably best fit for the existing onboarding pipeline pattern.

No viable zero-migration path if the gate needs to enforce structurally at DB write time. A manifest-level contract with `runtime_source` as a required field, validated at `onboard.ts` time, is the lowest-ceremony option.

---

## 10. Patterns and anomalies

1. **`data_source_type: scrape` is honestly populated, but `data_source` is not.** The manifest has enough structure to describe the mechanism (scrape) but not enough to declare the *target host*. This is the structural root cause of the Allabolag pattern — manifest lets you say "I scrape X" but X can be the authority name rather than the actual scraped URL.

2. **Cluster of divergence in company-data.** 16 of the 25 divergent capabilities are company-data country caps (5 full-div + 11 transport-div, counting `brazilian-company-data`). The non-company-data divergences are: `annual-report-extract`, `business-license-check-se`, `officer-search`, `customs-duty-lookup`, `hs-code-lookup`, `amazon-price`, and the 3 deactivated aggregator caps. The pattern is *country-data-specific* — 100% of non-Nordic EU country caps have some divergence; 100% of Anthropic-only LLM caps with no scraping are clean.

3. **Conditional runtimes split across classes — 3 cases.**
   - **`polish-company-data`** primary = `api-krs.ms.gov.pl` (match) + fallback = `www.northdata.com` (divergence). Classified `match` (primary path governs).
   - **`swiss-company-data`** primary = `zefix.admin.ch` via providers/ chain (match) + fallback = `northdata.com` (divergence). Classified `match`.
   - **`australian-company-data`** primary = ABR via providers/ chain + browserless fallback, against a manifest that says ASIC. Classified `transport-divergence` because ASIC is not the primary agency — ABR is. Sibling `au-company-data` correctly names ABR.
   Structural gate design should consider that a capability can have multiple runtime paths and each needs attribution, not just the primary.

4. **`hs-code-lookup` is a hallucination-source claim.** Manifest says "Harmonized System nomenclature database (WCO)". Runtime is pure Claude/LLM classification with no outbound call. This is not a scrape-vs-API divergence — it's "claims a database that is never consulted." The LLM may produce approximately correct answers, but the manifest claims a source that is not used at runtime at all. Borderline between `transport-divergence` (wrong channel) and `full-divergence` (wrong organisation entirely). Classified `transport-divergence` with explicit note.

5. **`hong-kong-company-data` / `singapore-company-data` / `indian-company-data` / `amazon-price` — deactivated but still full-divergence.** These 4 caps are listed in `auto-register.ts` DEACTIVATED map but the executor code still exists in the repo, imports `lib/browserless-extract`, and hits third-party aggregators. No manifest files exist for them. Low urgency since they are not served, but they inflate the `browserless-extract` blast-radius count and represent stale full-divergence patterns that shouldn't be revived without a manifest.

6. **10 pre-manifest-era capabilities have no manifest and no declared `data_source` at all.** `council-tax-lookup`, `email-pattern-discover`, `stamp-duty-calculate`, `uk-crime-stats`, `uk-deprivation-index`, `uk-epc-rating`, `uk-flood-risk`, `uk-rental-yield`, `uk-sold-prices`, `uk-transport-access`. All actively registered. Runtimes hit direct public-gov APIs (`data.police.uk`, `epc.opendatacommunities.org`, `landregistry.data.gov.uk`, `environment.data.gov.uk`, `naptan.api.dft.gov.uk`, `api.postcodes.io`, `stripe.com`). Not a divergence per se but these have **zero external-facing attribution** — they ship without any `data_source` metadata. Priority fix: generate manifests for them via `--discover`. Blast radius should be low — these are standalone UK-property/algorithmic capabilities.

7. **`annual-report-extract` is the second undeclared Allabolag dependency in the platform.** Manifest says "Claude API (financial document analysis)" — technically true (Claude is part of the pipeline) but silent on the scraping of `www.allabolag.se` for Swedish annual-report PDFs. Same KYB-competitor-owned aggregator dependency as `swedish-company-data` — the same Enento/UC exposure is in force here. Flag for chat: **the Swedish migration needs to address `annual-report-extract` at the same time as `swedish-company-data`** or the Allabolag dependency persists.

8. **`officer-search` is a multi-source undeclared hybrid.** No manifest. Runtime: UK Companies House (licensed), SEC EDGAR (public), and `northdata.com` (third-party aggregator). Even with manifests, it would need structured multi-source attribution. Classified `full-divergence` because the northdata.com leg is undeclared regardless of which manifest is written.

9. **Transparency tag inconsistencies.** `address-parse` declares `data_source: "Algorithmic (address component extraction, no external data)"` but imports `@anthropic-ai/sdk` — the "no external data" claim is literally false (Claude is external). Similar minor mis-statements exist across several `algorithmic` / `computed` manifests that actually call Claude. Not a data-source divergence but is a transparency-tag consistency issue worth a separate sweep.

10. **No new-country KYB-competitor-brand exposure beyond prior audit.** None of the new `full-divergence` lands on a country not already covered. BR (`receitaws.com.br`) is a developer-community wrapper, not a KYB competitor brand. HK/SG/IN hit OpenCorporates (ODbL licence — a different legal exposure, but deactivated). Japan and Canada hit *government* UI scrapes (transport-divergence, not full). The audit does **not** escalate legal exposure beyond what DEC-20260405-A and the prior audit already surfaced.

---

## Verification

- Sections 1–10 all present. ✓
- Class counts in Section 2 sum to 307 = total capabilities audited. ✓
- Each slug appears in exactly one class table (verified by `c:/tmp/audit-work/byclass/*.tsv`). ✓
- Working directory scan post-audit should show exactly one new untracked file: `docs/audits/2026-04-21-allabolag-pattern-full-inventory.md`. No tracked file modifications.
