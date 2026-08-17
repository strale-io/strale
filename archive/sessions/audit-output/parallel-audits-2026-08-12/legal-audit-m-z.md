# Legal / provenance audit — manifests m–z

Readiness program WS1c, DEC-20260812-A. Scope: all 146 manifests in `manifests/` with slug m–z.
Repo state audited: branch `readiness/p2-underbuilt` @ `9c915cd` (i.e. **PR #180 changes present** —
`apps/api/src/lib/tos-blocklist.ts` + gates in `safe-fetch.ts` and `lib/web-provider.ts`).
Read-only; no edits, no git state changes, no DB access.

## Method

- Rubric: DEC-20260428-A three-tier scraping doctrine; manifest-vs-executor truthfulness;
  PII/GDPR Art. 22 declarations; upstream attribution/licence obligations vs what
  `provenance` actually carries; ToS-sensitive hosts absent from the blocklist.
- Executors read at `apps/api/src/capabilities/<slug>.ts` plus shared libs
  (`lib/web-provider.ts`, `lib/browserless-extract.ts`, `lib/openapi-resolver.ts`,
  `lib/vasp-data.ts`, `lib/etherscan-client.ts`, `../lib/safe-fetch.ts`, `../lib/url-validator.ts`).

### Standing fact established during the audit (changes several verdicts)

`lib/browserless-extract.ts` no longer implements its own fetch — it **re-exports
`fetchRenderedHtml` / `fetchRenderedHtmlFresh` from `lib/web-provider.ts`**, and
`web-provider.fetchPage()` calls `assertTargetAllowed()` at line 196 before any network work.
`../lib/safe-fetch.ts` calls it at line 150 and again per redirect hop at line 230.
**Therefore every Browserless render path and every `safeFetch` path in m–z is ToS-gated.**
The residual exposure is confined to executors that call bare `fetch()` (list in F-3) and to
hosts that are ToS-sensitive but **not on the blocklist** (F-1, F-2).

---

## Per-capability table

| slug | data_source (manifest) | declared type | actual mechanism | assessment | note |
|---|---|---|---|---|---|
| maltese-company-data | Openapi.com WW-Top (Tier-3 aggregator) | api | `lib/openapi-resolver.ts` → api.openapi.com | tier-2-provenance-gap | resolver emits `upstream_vendor`+`acquisition_method` but no `primary_source_reference` |
| markdown-to-html | Algorithmic | computed | in-process markdown render | clean | |
| marketplace-fee-calculate | Algorithmic (fee tables) | computed | static tables | clean | |
| meeting-notes-extract | Claude API | api | Anthropic SDK on caller text | clean | customer-supplied content only |
| meta-extract | HTTP fetch + HTML parse | api | `safeFetch` GET, regex meta parse | clean | ToS-gated via safe-fetch; category `web-scraping` is a stretch but harmless |
| mx-lookup | DNS protocol | api | `node:dns` resolver | clean | |
| name-parse | Algorithmic | computed | in-process | clean | processes person names but no storage/lookup |
| nginx-config-generate | Claude API | api | Anthropic SDK | clean | |
| nl-bag-address | Kadaster BAG API | api | api.bag.kadaster.nl (key) | attribution-gap | BAG is CC BY 4.0 / "Bron: Kadaster" required; provenance carries host only |
| nl-energy-label | EP-Online (RVO) | api | public.ep-online.nl/api/v5 | attribution-gap | RVO reuse conditions require source naming; not carried |
| nl-housing-price-index | CBS OpenData 85773NED | api | opendata.cbs.nl OData | attribution-gap | CBS licence requires "Bron: CBS"; provenance carries dataset id only |
| nl-housing-stats | CBS OpenData 83625NED+82900NED | api | opendata.cbs.nl OData | attribution-gap | same |
| nl-woz-value | CBS OpenData 85036NED | api | opendata.cbs.nl OData | attribution-gap | same |
| no-bankruptcy-check | Brønnøysundregistrene | api | shared Brreg client | attribution-gap | Brreg data is NLOD; no licence/attribution in provenance |
| norwegian-company-data | Brønnøysund Register Centre | api / mixed | Brreg API + Anthropic name-resolution | attribution-gap | mechanism matches `mixed`; NLOD attribution missing |
| npm-package-info | npm Registry API | api | registry.npmjs.org | clean | `license` hit is an output field, not provenance |
| officer-search | UK Companies House + SEC EDGAR | api | CH API + data.sec.gov, declared UA | needs-human-review | returns named natural persons (directors); `data_lookup` classification, no purpose-limitation flag |
| og-image-check | HTTP fetch | api | `safeFetch` | clean | gated |
| openapi-generate | Claude API | api | Anthropic SDK | clean | |
| openapi-validate | Algorithmic | computed | in-process | clean | |
| package-security-audit | OSV.dev + deps.dev + npm + PyPI | api | 4 direct APIs | clean | all permissive; OSV CC-BY attribution is nice-to-have |
| page-speed-test | Google PageSpeed Insights API | api | www.googleapis.com (documented API) | attribution-gap | licensed API, not scraping; Google Terms require attribution for displayed results |
| paid-api-preflight | HTTP fetch + x402 header parse | api | bare `fetch()` on caller URL | tos-risk | **not gated** — arbitrary-URL probe bypasses `assertTargetAllowed` (F-3) |
| password-strength | Algorithmic | computed | in-process | clean | |
| patent-search | Google Patents (scrape) | scrape | Browserless + Claude | clean (deactivated) | in DEACTIVATED, DEC-20260427-H-1; host on blocklist |
| payment-reference-generate | Algorithmic | computed | in-process | clean | |
| pdf-extract | Claude API | api | Anthropic SDK + `safeFetch` | clean | |
| pep-check | Dilisense PEP DB | api | api.dilisense.com | needs-human-review | manifest carries `attribution`; **no `gdpr_art_22_classification`** → defaults `data_lookup` (F-4) |
| phishing-site-check | GoPlus Labs | api | api.gopluslabs.io | needs-human-review | GoPlus commercial redistribution terms not documented in manifest |
| phone-normalize | Algorithmic | computed | in-process | clean | |
| phone-type-detect | libphonenumber-js | computed | library | clean | Apache-2.0 |
| phone-validate | libphonenumber-js | computed | library | clean | |
| pii-redact | "Algorithmic (regex + NLP)" | api | Anthropic SDK (`ai_generated`) | misdeclared | `data_source` says algorithmic/regex; runtime is an LLM call. Contradicts its own `transparency_tag` |
| polish-company-data | KRS (Ministry of Justice) | api | api-krs.ms.gov.pl + Claude resolution | clean | carries `acquisition_method` + `attribution` + `primary_source_reference` — model example |
| port-check | TCP probe | api | `net.Socket` | clean | |
| port-lookup | UN/LOCODE static | api | bundled dataset | clean | type should be `reference` not `api`, cosmetic |
| portuguese-company-data | Openapi.com PT-Advanced | api | `lib/openapi-resolver.ts` | tier-2-provenance-gap | no `primary_source_reference`; double-gated by OPENAPI_ENABLED |
| postal-code-lookup | Zippopotam.us | api | api.zippopotam.us | attribution-gap | derived from GeoNames (CC BY 4.0); neither Zippopotam nor GeoNames named in provenance |
| pr-description-generate | Claude API | api | Anthropic SDK | clean | |
| price-compare | Multi-retailer (scrape) | scrape | Browserless (pricerunner.{se,no,dk,fi}) + Claude | needs-human-review | Google Shopping fallback correctly retired 2026-08-12; PriceRunner ToS never assessed, host not on blocklist |
| pricing-page-extract | Pricing pages + Claude | scrape | `fetchRenderedHtml` + Claude | clean | gated |
| privacy-policy-analyze | HTTP fetch + Claude | scrape | Browserless + Claude, calls `assertTargetAllowed` directly | clean | |
| product-reviews-extract | E-commerce pages + Claude | scrape | Browserless + Claude, direct gate call | clean | Trustpilot URLs now refused |
| product-search | E-commerce search (scrape) | scrape | **`https://www.google.{tld}/search?tbm=shop`** via Browserless + Claude | tos-risk | **the only code path targets a blocklisted URL** (F-1) — now 100% refusal, still active+priced |
| prompt-compress | Claude API | api | Anthropic SDK | clean | |
| prompt-optimize | Claude API | api | Anthropic SDK | clean | |
| protocol-fees-lookup | DefiLlama | api | api.llama.fi | attribution-gap | DefiLlama free API asks for attribution; not carried |
| protocol-tvl-lookup | DefiLlama | api | api.llama.fi | attribution-gap | same |
| public-holiday-lookup | Nager.Date | api | date.nager.at | attribution-gap | MIT-licensed project, attribution expected; not carried |
| pypi-package-info | PyPI JSON API | api | pypi.org/pypi/*/json | clean | |
| readme-generate | Claude API | api | Anthropic SDK | clean | |
| receipt-categorize | Claude API | api | Anthropic SDK + `safeFetch` | clean | |
| redirect-trace | HTTP manual redirect | api | `safeFetch`/`followRedirects` | clean | per-hop gate at safe-fetch:230 |
| regex-explain | Claude API | api | Anthropic SDK | clean | |
| regex-generate | Claude API | api | Anthropic SDK | clean | |
| release-notes-generate | Claude API | api | Anthropic SDK | clean | |
| resume-parse | Claude API | api | Anthropic SDK on caller-supplied CV | needs-human-review | extracts name/email/phone/location; no GDPR classification, no purpose-limitation note (F-4) |
| return-policy-extract | Retailer policy pages | scrape | `fetchRenderedHtml` + Claude | clean | gated |
| risk-narrative-generate | Claude Sonnet | api | Anthropic SDK | clean | correctly `risk_synthesis` |
| robots-txt-parse | HTTP fetch robots.txt | api | bare `fetch()` on /robots.txt | clean | ungated but robots.txt is the one file explicitly published for agents |
| romanian-company-data | Openapi.com WW-Top | api | `lib/openapi-resolver.ts` | tier-2-provenance-gap | no `primary_source_reference` |
| salary-benchmark | Salary aggregators (scrape) | scrape | Glassdoor via Browserless | clean (deactivated) | DEACTIVATED + host on blocklist |
| sanctions-check | Dilisense consolidated | api | api.dilisense.com | needs-human-review | **no `gdpr_art_22_classification`** despite CLAUDE.md naming it the canonical `screening_signal` (F-4) |
| schema-infer | Algorithmic | computed | in-process | clean | |
| schema-migration-generate | Claude API | api | Anthropic SDK | clean | |
| screenshot-url | Browserless render | scrape | Browserless, direct gate call | clean | |
| sec-filing-events | SEC EDGAR | api | data.sec.gov with declared UA | clean | SEC Fair Access UA present |
| secret-scan | Algorithmic regex | api | in-process regex | misdeclared | `data_source_type: api` but no external call — should be `computed` |
| sentiment-analyze | Claude API | api | Anthropic SDK | clean | |
| seo-audit | HTTP response analysis | scrape | `fetchRenderedHtml` + Claude | clean | gated; `data_source` text understates the Browserless render |
| sepa-xml-validate | Algorithmic ISO 20022 | computed | in-process | clean | |
| serp-analyze | Serper.dev API | api | google.serper.dev | misdeclared | manifest is right, but **executor provenance says `source: "google.com"`** — hides the licensed intermediary (F-5) |
| shipping-cost-estimate | Algorithmic | computed | in-process | clean | |
| shipping-track | "HTTP fetch (carrier APIs and portals)" | computed | **zero `fetch()` calls** — builds carrier tracking URLs only | misdeclared | manifest + limitations claim scraping that does not occur (F-6) |
| singapore-company-data | data.gov.sg ACRA CKAN | api | data.gov.sg datastore_search | clean | carries licence + attribution + `primary_source_reference` — model example |
| sitemap-parse | HTTP fetch sitemap.xml | api | bare `fetch()` on /sitemap.xml | clean | ungated but sitemap.xml is published for agents |
| skill-extract | Algorithmic taxonomy | computed | in-process | clean | |
| skill-gap-analyze | Algorithmic | computed | in-process | clean | |
| slovak-company-data | ŠÚ SR RPO, CC-BY 4.0 | api | api.statistics.sk | clean | licence + attribution + `primary_source_reference` present |
| slovenian-company-data | podatki.gov.si | api | podatki.gov.si | clean | licence + attribution present |
| social-post-generate | Claude API | api | Anthropic SDK + `safeFetch` | clean | |
| social-profile-check | HTTP fetch public profiles | api | **bare `fetch()` with spoofed Chrome UA** to reddit/tiktok/pinterest/youtube/github/npm/pypi | tos-risk | ungated + UA spoof; identical shape to the deactivated linkedin-url-validate (F-2, F-3) |
| solana-address-validate | Algorithmic base58 | computed | in-process | clean | |
| spanish-company-data | Openapi.com ES-Advanced | api | `lib/openapi-resolver.ts` | tier-2-provenance-gap | no `primary_source_reference` |
| sql-explain | Claude API | api | Anthropic SDK | clean | |
| sql-generate | Claude API | api | Anthropic SDK | clean | |
| sql-optimize | Claude API | api | Anthropic SDK | clean | |
| ssl-certificate-chain | TLS handshake | api | `node:tls` | clean | |
| ssl-check | TLS handshake | api | `node:tls` | clean | |
| stablecoin-flow-check | DefiLlama Stablecoins | api | stablecoins.llama.fi | attribution-gap | as other DefiLlama caps |
| startup-domain-check | DNS + WHOIS + HTTP | api | dns + whois + registry probes | clean | PR #180 added the gate here |
| stock-quote | "Yahoo Finance API" | api | **`query1.finance.yahoo.com`** (undocumented endpoint) | tos-risk | no public Yahoo Finance API; Yahoo ToS forbids automated extraction. Host not on blocklist (F-2) |
| structured-scrape | Web scrape + Claude | scrape | `fetchRenderedHtml` + Claude | clean | arbitrary URL, but gated via web-provider |
| summarize | Claude API | api | Anthropic SDK | clean | |
| swedish-company-data | Bolagsverket HVD API | api | gw.api.bolagsverket.se | clean | licence + attribution carried |
| swift-message-parse | Algorithmic ISO 15022 | computed | in-process | clean | |
| swift-validate | Algorithmic ISO 9362 | computed | in-process | clean | |
| swiss-company-data | Zefix PublicREST | api | Zefix REST (credentialed) | clean | Browserless/northdata fallback removed under DEC-20260427-I; manifest carries attribution |
| tax-id-validate | Strale validator | computed | in-process | clean | |
| tech-stack-detect | HTTP response analysis | scrape | `safeFetch` + header/JS fingerprinting, direct gate call | clean | linkedin.com now refused (was the documented leak) |
| ted-procurement | TED (European Commission) | api | api.ted.europa.eu v3 | attribution-gap | EC reuse decision 2011/833/EU requires source acknowledgement; not carried |
| terms-of-service-extract | HTTP fetch + Claude | scrape | Browserless + Claude, direct gate call | clean | |
| test-case-generate | Claude API | api | Anthropic SDK | clean | |
| ticker-lookup | Yahoo Finance autocomplete | api | **`query1.finance.yahoo.com`** | tos-risk | same undocumented-endpoint problem as stock-quote (F-2) |
| timezone-lookup | IANA tz + Intl | computed | in-process | clean | |
| timezone-meeting-find | Algorithmic | computed | in-process | clean | |
| token-count | Algorithmic tokenizer | api | in-process | misdeclared | `data_source_type: api`, no external call — should be `computed` |
| token-security-check | GoPlus Labs | api | api.gopluslabs.io | needs-human-review | GoPlus redistribution terms undocumented |
| tool-call-validate | Algorithmic | computed | in-process | clean | |
| translate | Claude API | api | Anthropic SDK | clean | |
| tron-address-validate | Algorithmic Base58Check | computed | in-process | clean | |
| trustpilot-score | Trustpilot pages (scrape) | scrape | Browserless | clean (deactivated) | DEACTIVATED + host on blocklist |
| uk-companies-house-officers | Companies House API | api | api.company-information.service.gov.uk | needs-human-review | officer PII; no GDPR classification; CH licence is OGL v3, attribution not carried (F-4) |
| uk-company-data | Companies House | api | CH API + Claude | attribution-gap | OGL v3 attribution not carried |
| uk-cop-check | Pay.UK CoP via eSortcode | api | wsp.esortcode.com | clean | `acquisition_method: vendor_mediated_scheme`, licence + attribution present, `screening_signal` set — best-in-class |
| uk-filing-events | UK Companies House | api | CH API | attribution-gap | OGL v3; also manifest fields are quoted strings (`"api"`), cosmetic YAML inconsistency |
| unit-convert | Algorithmic | computed | in-process | clean | |
| uptime-check | HTTP fetch | api | bare `fetch()` on caller URL | tos-risk | **not gated** — arbitrary-URL availability probe (F-3) |
| url-health-check | HTTP fetch | api | `safeFetch` | clean | gated |
| url-to-markdown | HTTP + HTML→md | scrape | Browserless/`safeFetch`, direct gate call | clean | |
| url-to-text | HTTP + HTML→text | api | bare `fetch()` on caller URL | tos-risk | **not gated** — full content retrieval from any host (F-3, highest-value of the ungated set) |
| us-company-data-cobalt | Cobalt Intelligence (50-state SoS) | api | apigateway.cobaltintelligence.com | tier-2-provenance-gap | has `upstream_vendor`+`acquisition_method`+`attribution`; missing `primary_source_reference` (which state SoS) |
| us-company-data | SEC EDGAR | api | data.sec.gov + efts.sec.gov, declared UA | clean | `acquisition_method` + `primary_source_reference` present |
| us-court-search | CourtListener / RECAP | api | www.courtlistener.com | clean | `acquisition_method` + licence carried; note court dockets are PII-dense — see F-4 |
| us-ein-match | Liberty Data EINsearch | api | einsearch.com | tier-2-provenance-gap | bureau-derived (manifest admits it); provenance has neither `upstream_vendor` nor `acquisition_method` |
| us-sec-filings-extended | sec-api.io | api | api.sec-api.io | clean | `upstream_vendor` + `acquisition_method` + `attribution` present |
| vasp-non-compliant-check | ESMA CASP Register | api | ESMA published CSV via `lib/vasp-data.ts` | clean | bulk file download, not scraping; ESMA reuse permitted |
| vasp-verify | ESMA CASP Register | api | same CSV path | clean | |
| vat-format-validate | Algorithmic | computed | in-process | clean | |
| vat-rate-lookup | Static VAT rate DB | computed | bundled table | clean | |
| vat-validate | VIES (European Commission) | api | VIES SOAP/REST | clean | |
| wallet-age-check | Etherscan | api | `lib/etherscan-client.ts` | clean | keyed API |
| wallet-balance-lookup | Etherscan | api | `lib/etherscan-client.ts` | clean | |
| wallet-risk-score | GoPlus Labs | api | api.gopluslabs.io | needs-human-review | GoPlus terms undocumented; output is a risk signal — arguably `screening_signal` (F-4) |
| wallet-transactions-lookup | Etherscan | api | `lib/etherscan-client.ts` | clean | |
| weather-lookup | Open-Meteo | api | api.open-meteo.com | attribution-gap | Open-Meteo is CC BY 4.0 and requires visible attribution; provenance carries host only |
| web-extract | Browserless render | api | `lib/web-provider.ts` (gated) | clean | `data_source_type: api` understates the render, cosmetic |
| webhook-test-payload | Claude API | api | Anthropic SDK | clean | |
| website-carbon-estimate | HTTP fetch + estimation | api | `safeFetch` + page-weight model | clean | gated |
| website-to-company | Website metadata + registries | computed | composes meta-extract + url-to-markdown + whois + registry executors + Claude | misdeclared | `data_source_type: computed` for a capability that performs live web fetches and registry calls |
| whois-lookup | WHOIS protocol | api | `node:net` port 43 | clean | |
| work-permit-requirements | Static rule DB | computed | bundled table (gov URLs are references only) | clean | |
| workflow-security-audit | Static analysis | computed | in-process | clean | |
| xml-to-json | Algorithmic | computed | in-process | clean | |
| xrp-address-validate | ripple-address-codec | computed | library | clean | |
| youtube-summarize | YouTube transcript + Claude Haiku | scrape | Browserless on youtube.com watch page → regex-extracts `api/timedtext` caption URL → Claude | tos-risk | YouTube ToS forbids access to content outside the player/API; **youtube.com not on the blocklist** (F-2) |

---

## Findings and remediation

### F-1 — `product-search` scrapes Google Search, the exact target the blocklist prohibits (highest severity)

`apps/api/src/capabilities/product-search.ts:18` builds
`https://www.google.${tld}/search?q=...&tbm=shop&hl=en` and renders it through
`fetchRenderedHtml`. `lib/tos-blocklist.ts` prohibits `google.com` with `pathPrefix: "/search"`
under DEC-20260427-H-4 — the same ruling that got `employer-review-summary` deactivated.
The sibling capability `price-compare` had precisely this fallback removed on 2026-08-12
(its manifest limitation now says so explicitly); `product-search` was missed in that sweep.

Two distinct problems:
1. **Compliance**: for non-`.com` TLDs (`google.se`, `google.de`, …) the blocklist rule does
   **not** match — `hostname.endsWith(".google.com")` is false for `www.google.se` — so those
   requests still execute and Strale still scrapes Google Search.
2. **Correctness**: for the default `country=com` path the gate now fires, so the capability
   returns a policy refusal 100% of the time while remaining active and priced.

Remediation: deactivate `product-search` in `auto-register.ts` with a DEC reference (mirroring
the `employer-review-summary` entry), **and** widen the Google rule to cover the ccTLD family
(`google.*` registrable-domain matching, not just `google.com`) so the ccTLD bypass is closed
for every caller, not just this slug. Both belong in the same change.

### F-2 — ToS-sensitive hosts reached in m–z that are not on the blocklist

| host | reached by | why it matters |
|---|---|---|
| `youtube.com` | youtube-summarize (Browserless render + `api/timedtext` extraction) | YouTube ToS §"Permissions and Restrictions" forbids accessing content other than through the player or the YouTube API. Extracting the internal `timedtext` caption endpoint from page JS is the canonical prohibited pattern |
| `query1.finance.yahoo.com` | stock-quote, ticker-lookup | Yahoo retired its public finance API; `query1` is an undocumented internal endpoint. Yahoo ToS forbids automated extraction. Manifests call it "Yahoo Finance API", which overstates its status |
| `reddit.com`, `tiktok.com`, `pinterest.com` | social-profile-check | all three forbid automated access including existence probes — the exact ruling that deactivated `linkedin-url-validate` (DEC-20260427-H-5) |
| `pricerunner.{se,no,dk,fi}` | price-compare | never assessed; now the sole source for the capability |
| `google.se`/`.de`/… (ccTLDs) | product-search | see F-1 |

Remediation: a single DEC entry ruling on each host, then add the ones ruled prohibited to
`PROHIBITED_TARGETS` with `decision` + `alternatives` populated. For `youtube-summarize` the
compliant path is the YouTube Data API v3 `captions` endpoint (OAuth, owner-scoped) or a
licensed transcript vendor — worth deciding before adding the host, since the block kills the
capability. For `stock-quote`/`ticker-lookup` the compliant path is a keyed vendor
(Finnhub/Twelve Data/Alpha Vantage free tiers all cover quotes + symbol search).

### F-3 — Executors calling bare `fetch()`, bypassing the ToS gate

PR #180 put `assertTargetAllowed()` on the two shared fetch paths (`safe-fetch.ts:150` and
`web-provider.fetchPage:196`) and `browserless-extract` now re-exports from `web-provider`, so
almost everything is covered. These m–z executors still call `fetch()` directly and are
therefore ungated **and** un-SSRF-guarded on the response path:

- `url-to-text.ts:12` — arbitrary URL, returns full page text. Highest value to a caller
  wanting a blocked host's content, and the closest functional substitute for
  `url-to-markdown` (which *is* gated). This is the current side door.
- `uptime-check.ts` — arbitrary-URL availability probe. Functionally identical to
  `linkedin-url-validate`, which was deactivated for exactly this.
- `paid-api-preflight.ts:23,251` — arbitrary-URL reachability + header probe.
- `social-profile-check.ts:28` — fixed host list, but with a **spoofed Chrome User-Agent**
  (`Mozilla/5.0 … Chrome/120.0.0.0`). UA spoofing to defeat bot detection is an aggravating
  factor in every ToS ruling the platform has cited, and is hard to defend after the fact.
- `robots-txt-parse.ts`, `sitemap-parse.ts` — ungated, but both fetch only the files a site
  publishes specifically for automated agents. Low risk; route them through `safeFetch` for
  uniformity rather than as a compliance fix.

Remediation: switch all six to `safeFetch`. Drop the spoofed UA in `social-profile-check` in
favour of an honest `Strale/1.0 (+https://strale.dev)` identifier — the SEC-EDGAR executors
already model this (`us-company-data.ts:6`). Add a lint/CI grep for bare `fetch(` in
`src/capabilities/` so the gate cannot be re-bypassed by the next executor; the blocklist
module's own docstring argues for exactly this ("the check belongs on the fetch path, not on
the capability name") and the argument extends to enforcing that the fetch path is the only path.

### F-4 — GDPR Art. 22 classification is unset on the PII-bearing and screening capabilities

Only 12 of 146 m–z manifests declare `gdpr_art_22_classification`; the rest default to
`data_lookup`. The defaults are wrong for:

- **`sanctions-check`** and **`pep-check`** — CLAUDE.md names `sanctions-check` as *the*
  example of `screening_signal`, yet neither manifest sets it. These produce match findings a
  customer uses to refuse business; misclassified as plain lookups, the audit body's `gdpr`
  block and the dispute-endpoint URL are wrong for the two most consequential capabilities in
  the catalogue. Fix first — it is a two-line manifest change each.
- **`wallet-risk-score`** — emits a risk verdict on an address; `screening_signal` fits.
- **`officer-search`**, **`uk-companies-house-officers`** — return named directors' roles,
  nationalities, partial DoB. `data_lookup` is defensible, but neither manifest carries a
  purpose-limitation limitation entry. Given the `email-finder` precedent in
  `auto-register.ts` (shelved on Art. 5(1)(b) grounds, citing the CNIL/Kaspr fine), the same
  reasoning should be written down here rather than left implicit.
- **`resume-parse`**, **`us-ein-match`**, **`us-court-search`** — CV contents, tax identifiers,
  and court dockets respectively. All PII-dense, none classified, none carrying a
  purpose-limitation note.

Remediation: set `gdpr_art_22_classification` explicitly on all eight; add a
purpose-limitation limitation (`category: legal`) to the four that return third-party natural-person
data. Consider making the field mandatory in `validateCapabilityStructure` gate 15 for any
capability whose output schema contains a person-name field, so the default can never silently
apply to a screening capability again.

### F-5 — `serp-analyze` provenance names Google, not the licensed intermediary

`serp-analyze.ts:101` emits `provenance: { source: "google.com" }` while the actual call is to
`google.serper.dev`. The manifest is correct (`Serper.dev API`); the executor is not. This is
backwards from the usual failure — it makes a licensed vendor call *look like* direct Google
scraping in the audit trail, which is the single worst thing to have on record given F-1.

Remediation: `source: "google.serper.dev"`, `upstream_vendor: "serper.dev"`,
`acquisition_method: "vendor_aggregation"`, and `primary_source_reference: "google.com"`.

### F-6 — `shipping-track` claims scraping it does not perform

`shipping-track.ts` contains **zero** `fetch()` calls — it maps a tracking number to carrier
tracking URLs and returns them. But `data_source` reads "HTTP fetch (carrier tracking APIs and
portals)" and the limitation says "Tracking is scraped from carrier websites". `data_source_type`
is `computed`, which is the only accurate field.

Harmless in the compliance direction but it is a truthfulness defect in a customer-facing
manifest, and it makes the catalogue look like it operates carrier scrapers when it does not —
which cuts against the Tier-1 posture the platform advertises.

Remediation: `data_source: "Algorithmic (carrier tracking-URL construction, no external fetch)"`,
and rewrite the limitation to say the capability returns tracking links rather than live status.
Then check whether the price and description still match what is delivered.

### F-7 — Tier-2/3 vendor provenance is missing `primary_source_reference`

DEC-20260428-A Tier 2 requires the vendor to "provide primary-source provenance per fact" and
requires Strale to disclose it via `provenance.upstream_vendor` / `acquisition_method` /
`primary_source_reference`. The first two are carried; the third is absent across the vendor set:

- `lib/openapi-resolver.ts:662` — its `OpenapiResolverResult.provenance` interface (lines 45–55)
  has `source`, `source_url`, `upstream_vendor`, `acquisition_method`, `authoritative`, but no
  `primary_source_reference`. Affects **maltese-, romanian-, portuguese-, spanish-company-data**
  in this half (and the a–l Openapi caps — flag to the sibling agent).
- `us-company-data-cobalt.ts` — carries vendor + method + attribution, but does not say which
  state Secretary of State register a given fact came from, which is the whole point of the field.
- `us-ein-match.ts:77,97` — `provenance: { source: "einsearch.com" }` only. The manifest itself
  admits the data is "sourced from filings and bureau records, not directly from the IRS", so
  the primary source is both unknown per-fact and undisclosed.

Remediation: add `primary_source_reference` to the resolver's provenance interface and populate
it from the vendor payload (Openapi returns the originating registry per product; Cobalt returns
the state). For `us-ein-match`, add `upstream_vendor: "einsearch.com"` +
`acquisition_method: "vendor_aggregation"` and state explicitly that per-fact primary sourcing is
not available from this vendor — an honest gap disclosure satisfies the doctrine better than silence.

### F-8 — Open-data attribution obligations not carried in provenance

Nineteen capabilities consume sources whose licences require source acknowledgement, but their
`provenance` blocks carry only a hostname. `polish-company-data`, `singapore-company-data`,
`slovak-company-data`, `slovenian-company-data`, `swedish-company-data`, `uk-cop-check` and
`us-court-search` already do this correctly and are the template to copy.

Affected: `nl-bag-address` (Kadaster BAG, "Bron: Kadaster"), `nl-energy-label` (RVO/EP-Online),
`nl-housing-price-index` / `nl-housing-stats` / `nl-woz-value` (CBS, "Bron: CBS"),
`no-bankruptcy-check` + `norwegian-company-data` (Brreg, NLOD), `uk-company-data` +
`uk-filing-events` (Companies House, OGL v3), `weather-lookup` (Open-Meteo, CC BY 4.0 —
explicitly requires visible attribution), `postal-code-lookup` (Zippopotam → GeoNames CC BY 4.0),
`public-holiday-lookup` (Nager.Date), `protocol-tvl-lookup` / `protocol-fees-lookup` /
`stablecoin-flow-check` (DefiLlama), `ted-procurement` (EC decision 2011/833/EU),
`page-speed-test` (Google API terms).

Remediation: add `license` + `attribution` to each provenance block. This is mechanical and
low-risk. Worth doing as one PR with a shared helper rather than 19 individual edits, and worth
adding to the onboarding pipeline's `--discover` step so new capabilities inherit it.

### F-9 — Minor misdeclarations

- `pii-redact` — `data_source: "Algorithmic (regex pattern matching + NLP entity recognition)"`
  but the runtime is an Anthropic call and `transparency_tag` is already `ai_generated`. The
  manifest contradicts itself; a customer reading `data_source` would conclude no LLM is involved
  and no content leaves the platform. Fix the `data_source` string.
- `website-to-company` — `data_source_type: computed` for a capability that fans out to
  `meta-extract`, `url-to-markdown`, `whois-lookup` and registry executors. Should be `mixed`.
- `secret-scan`, `token-count` — `data_source_type: api` with no external call; should be `computed`.
- `port-lookup`, `vat-rate-lookup`, `work-permit-requirements` — bundled static datasets typed as
  `api`/`computed`; `reference` is the accurate value. Cosmetic.
- `uk-filing-events` — manifest scalars are quoted (`"api"`, `"algorithmic"`), unlike every
  sibling. Parses fine, but breaks the grep-ability the drift-check scripts rely on.

---

## Counts

| assessment | count |
|---|---|
| clean | 106 |
| attribution-gap | 19 |
| needs-human-review | 9 |
| misdeclared | 6 |
| tier-2-provenance-gap | 6 |
| tos-risk | 6 |
| **total (m–z)** | **146** |

Note: three of the six `tos-risk` entries (`product-search`, `url-to-text`, `uptime-check`) are
gate-bypass defects fixable in code; three (`youtube-summarize`, `stock-quote`, `ticker-lookup`,
plus `social-profile-check` overlapping both classes) need a source decision first. Four
capabilities carrying prohibited-host code (`patent-search`, `salary-benchmark`,
`trustpilot-score`, and the a–l `employer-review-summary`) are correctly DEACTIVATED and counted
clean.

## Suggested order of work

1. F-1 `product-search` — live doctrine violation on ccTLDs, plus the ccTLD gap in the blocklist
   rule affects every caller. Same PR.
2. F-3 bare-`fetch()` sweep + CI grep — closes the remaining side doors structurally.
3. F-4 GDPR classifications on `sanctions-check` / `pep-check` — two-line fix, highest
   consequence-per-character in the report.
4. F-2 host rulings (needs a DEC and a source decision for YouTube and Yahoo).
5. F-5, F-6, F-9 — truthfulness fixes, mechanical.
6. F-7, F-8 — provenance/attribution enrichment, mechanical, batchable.
