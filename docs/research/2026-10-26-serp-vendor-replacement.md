---
doc_type: research
type: vendor
topic: serp-vendor-replacement
question: If Serper does not permit resale, which per-call search vendor can replace it for Strale's eight Serper-backed tools under DEC-20261023-A?
date: "2026-10-26"
status: current
sources:
  - "https://api-dashboard.search.brave.com/documentation/pricing:"
  - "https://api-dashboard.search.brave.com/documentation/resources/terms-of-service"
  - "https://brave.com/search/api/"
  - "https://brightdata.com/license"
  - "https://dataforseo.com/our-data"
  - "https://dataforseo.com/pricing"
  - "https://dataforseo.com/pricing/backlinks:"
  - "https://dataforseo.com/pricing/serp/google-news-serp-api"
  - "https://dataforseo.com/pricing/serp/google-organic-serp-api"
  - "https://dataforseo.com/terms-of-service"
  - "https://dataforseo.com/update/pricing-update-in-dataforseo-apis"
  - "https://developers.google.com/custom-search/v1/overview"
  - "https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/"
  - "https://exa.ai/pricing"
  - "https://exa.ai/terms"
  - "https://kagi.com/api/pricing"
  - "https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/bing-grounding"
  - "https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement:"
  - "https://ppc.land/serpapi-faces-revived-google-scraping-claims-built-on-reddit-licensing-terms/"
  - "https://serper.dev/"
  - "https://serper.dev/terms"
  - "https://trajectdata.com/traject-data-terms-of-service/"
  - "https://www.ideracorp.com/Legal/Terms-of-Use"
  - "https://www.mojeek.com/about/legal/api-terms.html"
  - "https://www.mojeek.com/services/search/web-search-api/"
  - "https://www.scrapingdog.com/google-search-api"
  - "https://www.scrapingdog.com/pricing/"
  - "https://www.scrapingdog.com/terms"
  - "https://www.searchapi.io/legal/terms"
  - "https://www.tavily.com/pricing"
  - "https://www.tavily.com/terms"
  - "https://you.com/terms"
  - "docs/company/DECISION-QUEUE.md"
  - "apps/api/src/lib/vendor-terms.ts"
decisions:
  - "DEC-20261023-A"
---
# Serper replacement research (DQ-39 option 2)

Researcher session 2026-10-26. All vendor pages below were fetched on 2026-10-26 unless stated otherwise. Raw fetched text was kept in the researcher's scratch space, not in the repository. Quotes are verbatim from the page text I fetched; where a page was only summarised by a fetch tool (not read as raw text) it is marked "relayed". Nothing here is legal advice.

## 1. Bottom line

1. **No Google-based vendor with a prepaid, no-subscription model has an explicit resale clause.** DataForSEO is silent (as Serper is). Only one vendor has an explicit grant to redistribute: **Scrapingdog**, but only on a monthly subscription (from $40/month).
2. **The rule's text test ("terms permit resale") is passed today by exactly two vendors:** Scrapingdog (explicit, Google results, subscription) and, narrowly, **Mojeek** (explicit usage grant for "internet search experiences", own index, not Google, no news or related-questions).
3. **Brave and Exa are the opposite**: their terms expressly forbid resale or redistribution on the standard plan. Both would need a written enterprise agreement.
4. **Cheapest route to a clean "yes" is a written question to DataForSEO**, whose whole business is APIs for building SEO products. Its terms are silent on resale and carry one restriction (section 7.1) that needs a written answer. If DataForSEO says yes in writing, it is the best fit: prepaid, no expiry, covers all eight tools, about $2.00 per 1,000 queries.
5. **A vendor change does not remove Google-side exposure.** Google v. SerpApi and Reddit v. SerpApi/Oxylabs/Perplexity are about circumventing Google's access controls. By the same logic any vendor that collects from Google carries some of that risk. Only own-index vendors (Brave, Mojeek, Exa) avoid it. The rule limits this ("not a defendant"), it does not remove it.
6. **Two of the eight uses need no replacement at all.** `backlink-check` already uses CommonCrawl first and Serper only as a fallback; `adverse-media-check` uses Dilisense first. Dropping the Serper fallback in both is a small change.

## 2. Summary table

Key: Y = explicit permission found, N = explicit prohibition found, S = silent, ? = could not read.

| Vendor | Index | Resale / redistribution (exact clause in section 3) | Covers (of our 8) | Price per 1,000 | Prepaid / minimum | Litigation found | Verdict |
|---|---|---|---|---|---|---|---|
| **Serper** (baseline) | Google | S. Mirror ban "as-is with no-value-added" | all | $1.00 (50k pack) down to $0.30 (12.5M pack); credits valid 6 months | prepaid from $50 | none found | rule not met |
| **DataForSEO** | Google (and Bing etc.), own backlink index | **S** (and s.7.1 "shall not be used to compete with ... the search engine providers") | organic, news, PAA, related searches, rank depth, autocomplete, backlinks API | $2.00 live; $1.20 priority; $0.60 standard queue; operators x5, depth +1 base price per extra 10 | prepaid, $50 minimum top-up, balance never expires | none found | **ask in writing; best fit if yes** |
| **Scrapingdog** | Google | **Y** (s.2: "access, store, display, analyze, and redistribute, commercially or otherwise") while a paid subscription is active | organic (Light/Advance), news, PAA ("Questions" in the Google SERP API sample); no backlinks | Light $1.00 and News $1.00 on the $40 plan (5 credits per request, 200,000 credits); Advance $2.00 (10 credits) | **monthly subscription** from $40; unused credits expire each billing period | none found | **passes text test; fixed cost** |
| **Mojeek** | own index | **Y, narrow**: "All data ... may be used in internet search experiences" | organic only (no news endpoint seen, no PAA, no Google rank) | GBP 2 (Startup) / GBP 3 (Business) | PAYG, no minimum, no automatic payments, card required; Startup may only cache 1 hour | none found | **passes text test for web search only** |
| **Brave Search API** | own index | **N**: "(xii) redistribute, resell, or sublicense the Search Results" | web, news (`/news` endpoint listed in docs) | $5.00 (web/LLM context) | prepaid credits, card required; free tier gone | none found | needs enterprise agreement |
| **Exa** | own index | **N**: "(e) resell, lease or sublicense the Services to any third party without our prior consent"; no display or distribution of results without written permission | web | from $4 | PAYG | none found | needs written consent |
| **Tavily** | own + others | **N/ambiguous**: "solely for Customer's internal business purposes"; "resell, distribute" barred, with an integration carve-out | web, news | $8.00 (PAYG $0.008 per credit, 1 credit per basic search) | PAYG or $30/month | none found | not clean |
| **You.com API** | own | **?** only the consumer terms (Aug 27 2024) were readable; no API grant found | web, news | $5 | PAYG | none found | unverified |
| **Kagi** | mixed | **?** no API terms found | web, news | $12 | PAYG, invoiced every 30 days or at $100 | none found | unverified |
| **SearchApi.io** | Google | **N**: "(i) to resell, redistribute or offer our Services to a third-party without prior written consent" | all | $4 on the $40 plan | subscription | trade-secret suit as defendant (SerpApi v. SearchApi, not about collection) | out |
| **Zenserp** | Google | **N** (parent Idera terms): "Modify, copy, distribute, ... sell any information, software, products or services obtained from the Site, Services, or Materials" | most | not collected | subscription | none found | out |
| **VALUE SERP / Traject Data** | Google | **N** (relayed): "sell, assign, rent, lease, or grant rights in the Service"; personal-use wording | most | $2.50 PAYG ($25 first purchase); $50/month for 25k | PAYG or subscription | none found | out (page only readable via relay) |
| **Bright Data SERP** | Google | **N**: "Not engage in any reselling of the Service in whole or in part, without Bright Data's prior written authorization" (proxy terms; no separate SERP terms found) | all | from $1 | not collected | **X Corp. v. Bright Data** (contract/tort claims on scraping X; status after early 2025 not confirmed) | flag, out |
| **Oxylabs** | Google | not read | | | | **named defendant** in Reddit v. SerpApi/Oxylabs/AWMProxy/Perplexity (S.D.N.Y.) | **excluded by rule** |
| **SerpApi** | Google | | | | | defendant in Google and Reddit suits | **excluded by DQ-39** |
| **Bing / Grounding with Bing** | Bing | N/A: Bing Search APIs retired 2025-08-11; the replacement returns no raw results | none | n/a | | | not usable |
| **Google Programmable Search / Vertex AI Search** | Google | n/a | none | n/a | | | not usable |
| Searlo, Serpent API (noticed, not on your list) | Google | Searlo FAQ says "Yes. You're free to use our API data in your own products" (marketing, not contract; ToS dated Dec 1 2024 is generic). Serpent API terms bar "Resell or redistribute the Service without authorization" | | Searlo from $0.30 | | | Searlo: unknown operator, low confidence; Serpent: out |

## 3. Per-vendor evidence

### Serper (baseline)
- Terms: https://serper.dev/terms, "Updated on May 29, 2024", read 2026-10-26. Matches the DQ-39 update. Relevant text:
  - "Serper is a business-to-business service and does not provide end-user (consumer) services."
  - Licence restrictions include "Mirror the materials on any other server as-is with no-value-added." and "Register more than one account at any point in time."
  - Data licence: "you will not, and will not permit your end users or others acting on your behalf, to ... Misrepresent the ownership or the source. Obscure, remove or change any copyright, trademark, or other proprietary notices."
  - Indemnification is mutual: "Both parties agree to defend, indemnify, and hold harmless each other".
  - Governing law is United Kingdom. No resale or sublicensing clause either way.
- Price: https://serper.dev/ (pricing block on the home page; `/pricing` returns 404): Starter $50 for 50k credits ($1.00/1k), Standard $375 for 500k ($0.75/1k), Scale $1,250 for 2.5M ($0.50/1k), Ultimate $3,750 for 12.5M ($0.30/1k). "Credits valid for 6 months". "No monthly subscriptions". I did not verify per-endpoint credit multipliers (news, num above 10).
- Litigation: none found for Serper.dev (searches only returned SerpApi cases).
- Observation: the terms contemplate customers' "end users", which supports asking Serper (DQ-39 option 1), but it is not a grant.

### DataForSEO
- Terms: https://dataforseo.com/terms-of-service, "UPDATED: 12 JUNE, 2026".
  - 3.1: "The Service is made available on a pay-as-you-go and/or on-demand subscription basis".
  - 7.1: "You acknowledge and agree that any search engine results page (SERP) data or content obtained through the Service, including but not limited to data from Google, Bing, Yahoo, and other search engine providers, shall not be used to compete with or adversely affect the business interests of the search engine providers from which such data originates."
  - 7.2: "You agree to indemnify, defend, and hold harmless DataForSEO from any and all claims, damages and losses arising from or relating to Your violation of Section 7.1, including any use of SERP data that violates the terms of service or legal rights of the search engine providers."
  - 8.1: "Certain services provided by DataForSEO are resold."
  - No clause on resale, redistribution, sublicensing, derivative works or storage by customers. Silence is not permission under the rule.
  - Two risks for us: 7.1 could be read against a general-purpose search tool for agents (a Google-substitute), and 7.2 puts the indemnity on us.
- Price: https://dataforseo.com/pricing/serp/google-organic-serp-api. Google Organic per SERP of 10 results: Standard queue $0.0006 ($0.60/1k, about 5 minutes average, "Target: 45 minutes"), Priority $0.0012 ($1.20/1k, up to 1 minute), Live $0.002 ($2.00/1k, up to 6 seconds). Search operators in the query (`site:` etc.) x5 base price per operator; `depth` beyond 10 results +1 base price per extra 10; AI Overview +1 base price; PAA click-through $0.00015 per click. Google News SERP: same three prices (https://dataforseo.com/pricing/serp/google-news-serp-api). Autocomplete: same three prices.
- Minimum: https://dataforseo.com/pricing FAQ: "The minimum account top-up is $50. ... It is not a subscription fee or a monthly payment, and you can use the balance at your own pace since it has no expiration date."
- Backlinks API: https://dataforseo.com/update/pricing-update-in-dataforseo-apis (July 1, 2026): "The $100 monthly commitment for the Backlinks API and LLM Mentions API access is now removed." and "Backlinks API: +20% for all endpoints". Current list price on https://dataforseo.com/pricing/backlinks: "$0.024 per task + $0.000036 per row" (own crawler index, https://dataforseo.com/our-data).
- Response content: the organic advanced response documents `people_also_ask` and `related_searches` element types and `rank_absolute` (https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/).
- Litigation: none found naming DataForSEO. A secondary source says Google blocked a DataForSEO cost-saving workaround in October 2025 (relayed, not verified; it is about Google's `num` handling, not a suit).
- Gap: help-center search found no article on reselling or white-labelling. Third-party reviews describe customers as SEO-software companies building their own products (relayed, not a clause).

### Scrapingdog
- Terms: https://www.scrapingdog.com/terms, "Last revised: January 13, 2026".
  - "While your paid subscription is active, Scrapingdog grants you a non-exclusive, worldwide license to access, store, display, analyze, and redistribute, commercially or otherwise, the publicly available data returned by Scrapingdog's API ("Licensed Data")."
  - "You may present, transform, or combine the Licensed Data in any manner, provided that you do not add or alter data points in a way that would misrepresent the information actually returned by Scrapingdog's API or cause harm to third parties."
  - "When your subscription ends, your license to receive new Licensed Data terminates automatically."
  - "Except as stated above, Scrapingdog imposes no additional limitations on copying, commercial use, reverse-engineering, or retention of the Licensed Data once it is in your possession."
  - "All Licensed Data is collected solely from sources that are publicly accessible on the open internet." No indemnity from the vendor ("makes no warranties"). No attribution requirement.
- Price: https://www.scrapingdog.com/pricing/. Plans are monthly or annual: Lite $40/month for 200,000 credits; Standard $90/month for 1,000,000; Pro $200/month for 3,000,000. "Credit Rollover Policy: If you cancel or downgrade your subscription, any unused credits from your current Billing Period will expire at the end of that Billing Period" (terms s.5). Google SERP Light 5 credits per request ($1.00/1k at Lite), Google SERP Advance 10 credits ($2.00/1k), Google News 5 credits ($1.00/1k). Free: 100 credits. "Failed requests never charged."
- Coverage: https://www.scrapingdog.com/google-search-api shows organic results and a "Questions" tab in the sample; I did not verify related searches or a rank-depth parameter. No backlinks product.
- Litigation: none found. Uses proxies against Google, so it carries the same Google-side exposure as Serper.
- Open: whether "paid subscription" can be the smallest plan; the clause is in the website terms, not a signed contract.

### Mojeek
- Terms: https://www.mojeek.com/about/legal/api-terms.html (no date on page). "Usage":
  - "All data provided by the Services ("Data") may be used in internet search experiences."
  - "Data may be used in a non-internet search experience for the sole purpose of discovering sources of information."
  - "You may reorder the search results ranking." "You may combine Data with search results from other sources, including other search engines." "You may modify the Data, unless prohibited by law and subject to the Exclusions below."
  - Exclusions: "For the Startup Plan: Do not compile, copy, or store any Data." "For the Startup Plan: Do not cache any Data, except to temporarily cache in order to serve the same user for up to 1 hour." "Do not use Data as part of any search index." "Licensor may in writing vary these terms for Our Enterprise customers".
  - Indemnity is one-way: "You will defend and indemnify Us". Liability cap GBP 1,000. English law.
- FAQ (https://www.mojeek.com/services/search/web-search-api/): "Can I use search results for commercial purposes? Yes, you can use our Search API for commercial reasons, such as your own subscription service, as long as you adhere to our Terms of Service Agreement and policies." "We don't require attribution". "We do not grant any rights to use third party content on these webpages so customers must comply with publisher copyright terms."
- Price: GBP 2 per 1,000 (Startup, 5 queries/sec, 100,000/day, up to 10 results) and GBP 3 per 1,000 (Business, up to 40 results); "no minimum commitment, no automatic payments and can cancel anytime"; card required.
- Index: "Independent Index", crawler "MojeekBot which respects Robots Exclusion Protocol". Smaller index; results are not Google's, so no rank checking or PAA. The request parameters offer `since`/`before` date filters but I saw no news vertical.
- Whether an agent-tool that returns results to API callers is an "internet search experience" is a judgement the vendor should confirm.

### Brave Search API
- Terms: https://api-dashboard.search.brave.com/documentation/resources/terms-of-service, "Last updated: 1 Sep, 2026".
  - Licence: "limited, worldwide, revocable ... non-transferable and non-assignable, non-sublicensable license ... to (ii) use the Search Results with the Customer Applications".
  - Restrictions: "Customer shall not and shall not permit End Users or others to: (i) store, cache, or create a database of Search Results ... other than transient storage required for operation of Customer Applications"; "(ii) create derivative works of the API, Documentation or Search Results"; "(xii) redistribute, resell, or sublicense the Search Results"; "(xiii) use the Search Results to create, evaluate, train, re-train, fine-tune, benchmark or otherwise improve artificial intelligence models".
  - "Customer shall ensure that each End User is bound by a written agreement with Customer pursuant to which such End User agrees to be bound by obligations substantially similar to those in section 3(b)".
  - Attribution is optional: "Customer may provide attribution ... "POWERED BY BRAVE"".
- Brave's own page (https://brave.com/search/api/): "Every result comes from Brave's own independent index ... There is no fallback to another search engine", and "Can I store results or use them to train models? Yes, with a plan that includes storage rights." Enterprise: "Custom agreements & NDAs".
- Price: https://api-dashboard.search.brave.com/documentation/pricing: "$5.00 per 1,000 requests", "Includes free $5 in credits every month", prepaid, 50 requests per second.
- A returning-results product is "redistribute" on its face; usable only under a written enterprise agreement. Covers web and news, not Google rank checking.
- Litigation: none found.

### Exa
- Terms: https://exa.ai/terms (PDF; creation date 2025-03-04, no "Last Revised" date seen in the text).
  - 4.2(a): you may not "download, modify, copy, distribute, transmit, display, perform, reproduce, duplicate, publish, license, create derivative works from, or offer for sale any information contained on, or obtained from or through, the Services ... unless ... you have our written permission".
  - 4.2(e): "resell, lease or sublicense the Services to any third party without our prior consent".
- Price (https://exa.ai/pricing): "From $4/1k requests"; PAYG. Not a Google index; no rank checking.

### Tavily
- Terms: https://www.tavily.com/terms, "Last updated: May 4, 2026".
  - s.2: licence is "solely for Customer's internal business purposes, including for integration with Customer Applications".
  - 3.2(ii): the customer will not "license, sublicense, resell, distribute, lease, rent, lend, transfer, assign or otherwise dispose of the Services (provided, that integration of the Services in Customer Applications in accordance with this Agreement will not constitute a violation of this subsection)".
  - "Services" is defined as excluding "Output", so the resale bar may not reach results themselves; "internal business purposes" cuts the other way. Ambiguous, needs written confirmation.
- Price: https://www.tavily.com/pricing "$0.008 / credit" PAYG; $30/month Project plan.

### You.com, Kagi
- You.com: only https://you.com/terms (consumer terms, "Last updated: August 27, 2024", relayed) was readable: s.2.4(3) bars "modifying, copying, sublicensing, leasing, selling or otherwise distributing any of our Services". No API terms located. Price page: Web Search API "$5 /1k calls", "No minimums".
- Kagi: https://kagi.com/api/pricing shows Search "$12 /1k requests". I could not find API terms (`kagi.com/terms` and `/tos` returned 404). Unverified.

### SearchApi.io, Zenserp, VALUE SERP, Bright Data, Oxylabs (out)
- SearchApi.io, https://www.searchapi.io/legal/terms, "Last updated: April 11, 2026": Prohibited uses "(i) to resell, redistribute or offer our Services to a third-party without prior written consent from us". Its "Legal Protection Guarantee" excludes "any claim arising from your use, storage, redistribution, or commercialization of data". SerpApi is suing SearchApi over trade secrets (about a former contractor, not collection).
- Zenserp (parent Idera): https://www.ideracorp.com/Legal/Terms-of-Use prohibits "Modify, copy, distribute, transmit, display, perform, reproduce, publish, license, create derivative works from, transfer, or sell any information, software, products or services obtained from the Site, Services, or Materials." Zenserp's own terms page links to this document.
- VALUE SERP / Traject Data: direct fetches returned 403. Via the fetch tool (relayed): terms effective November 18, 2025 (https://trajectdata.com/traject-data-terms-of-service/) with s.2.2 "sell, assign, rent, lease, or grant rights in the Service, including, without limitation, through sublicense" and personal-use wording; the text refers to "ScraperAPI". Pricing: $2.50 per 1,000 PAYG with $25 first purchase, or $50/month for 25,000.
- Bright Data: https://brightdata.com/license, "Last Updated: October 12, 2026": "Not engage in any reselling of the Service in whole or in part, without Bright Data's prior written authorization." and licence "with no right to sublicense ... solely for the purpose of Client's internal business operations". No separate SERP terms were found. X Corp. v. Bright Data (N.D. Cal. 23-cv-03698): in May 2024 the court dismissed X's contract claims with leave to amend; in November 2024 some tort claims were allowed to proceed; later status unconfirmed.
- Oxylabs: named defendant with SerpApi, AWMProxy and Perplexity in Reddit's S.D.N.Y. suit (filed 2025-10-22; Judge Engelmayer largely denied motions to dismiss on 2026-07-31, per trade press). Excluded under the rule's vendor-not-a-defendant condition.

### Microsoft and Google first-party options
- Bing: https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement: "Bing Search APIs will be retired on August 11, 2025 ... no longer available to be used or new customer signup." The replacement (Grounding with Bing Search, https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/bing-grounding, page updated 2026-07-11): "Developers and end users don't have access to raw content returned from Grounding with Bing Search", with use-and-display requirements. Cannot back a search tool.
- Google Custom Search JSON API (https://developers.google.com/custom-search/v1/overview): "The Custom Search JSON API is closed to new customers." and "Existing ... customers have until January 1, 2027 to transition". Vertex AI Search is for up to 50 domains; full-web access is by "contact us" form only. Not usable.

### Litigation context (secondary sources, not primary filings)
- Google v. SerpApi (N.D. Cal. 4:25-cv-10826-YGR): filed 2025-12-19 under DMCA s.1201. 2026-07-20: claims about results without copyrighted content dismissed without leave to amend; Knowledge Panel image claims dismissed with leave. 2026-08-10: amended complaint adds licensor (Reddit) allegations. Source: https://ppc.land/serpapi-faces-revived-google-scraping-claims-built-on-reddit-licensing-terms/ (2026-08-12).
- Reddit v. SerpApi, Oxylabs, AWMProxy, Perplexity (S.D.N.Y.): filed 2025-10-22; on 2026-07-31 motions to dismiss "predominately" denied, including a conspiracy theory against Perplexity as a customer. Source: Law360 and trade press via search results (not verified against the order).
- No suit found against Serper, DataForSEO, Scrapingdog, Mojeek, Brave, Exa, Tavily, Zenserp, SearchApi (as a collector) or Traject. This is an absence in news searches, not proof.

## 4. Which vendor covers which of our eight tools

Current Serper use (from `apps/api/src/capabilities/*.ts`): `POST google.serper.dev/search` with `q`, `num`, `gl`, `hl`, reading `organic`, `peopleAlsoAsk`, `relatedSearches`; `POST google.serper.dev/news` for news. Prices today: google-search 10c, serp-analyze 15c, brand-mention-search 30c, google-news-search 10c, keyword-rank-check 15c, serp-related-questions 10c, backlink-check 15c, adverse-media-check 20c (manifests). Vendor cost of $0.002 to $0.005 per call is small against these prices, so price is not the constraint; the resale clause is.

| Tool | Serper use | DataForSEO | Scrapingdog | Brave | Mojeek | Switch effort |
|---|---|---|---|---|---|---|
| google-search | search, `num`, `gl`, PAA | Organic Live, `depth`, PAA, related | SERP Light/Advance | web (not Google, rename or accept different results) | web (different results) | M |
| serp-analyze | search, position, domain, PAA, relatedSearches, total results, SERP-feature flags | yes (element types) | likely, not fully verified | no (Google-specific) | no | M |
| brand-mention-search | search, `num` | yes | yes | yes (results differ) | yes (results differ) | S |
| google-news-search | `/news` | Google News SERP | Google News API | news endpoint | no news vertical seen | S to M (Serper returns relative dates; mapping needed) |
| keyword-rank-check | search with `num` = depth, finds host position | yes: `depth` up to 100 costs 10 SERPs (about $0.02 live) | likely, depth not verified | no, ranks would be Brave's, not Google's | no | M (exact-host matching logic is already in our code; only the fetch layer changes) |
| serp-related-questions | PAA and relatedSearches | yes (`people_also_ask`, `related_searches`) | PAA yes, related not verified | not verified | no | M |
| backlink-check | CommonCrawl first; Serper only if fewer than 5 backlinks found | Backlinks API (own crawler), or drop fallback | no | no | no | S (drop fallback; M if adding DataForSEO Backlinks API) |
| adverse-media-check fallback | Serper only if Dilisense fails | news or organic | news or organic | news | no | S (drop fallback, or reuse the new adapter) |

The `vendor-terms.test.ts` register requires every executor that calls a vendor host to be listed, so each switch also needs a `VENDOR_TERMS_RECORDS` entry, `metered_id` change, `env-manifest.yaml` row, manifest `data_source` and provenance (`upstream_vendor`, `acquisition_method`) changes. A single `serp-provider` adapter behind the eight tools makes the change one reviewable PR and keeps a later switch cheap.

## 5. Ranked recommendation

Ranking criteria: rule's resale test first, coverage of the eight tools second, no-subscription third.

1. **DataForSEO, after a written yes (confidence: moderate that it works, high that it is the best fit if it does).** Send one question: may Moonlighter AB return DataForSEO SERP, News and PAA data to its own paying API customers, and how does s.7.1 apply to a search tool for AI agents? A yes in an email from DataForSEO support or sales is a recordable "terms permit resale" for `vendor-terms.ts`. Prepaid, $50 minimum, no expiry. Covers all eight uses (the Backlinks API replaces the fallback); the remaining risk is the Google-side exposure every Google-based vendor shares. This is vendor contact on behalf of Moonlighter AB, so it is Petter's.
2. **Scrapingdog now, if the two-week window passes without a yes (confidence: high that the text clause is clear, moderate that a website clause will hold up as a negotiated licence).** It is the only Google-data vendor whose published terms already say "redistribute, commercially or otherwise". Cost: $40/month fixed with monthly expiry, which is roughly the revenue of the three biggest tools (about EUR 46/month per DQ-39). Spending on a subscription is Petter's call. Covers google-search, brand-mention-search, google-news-search and probably serp-analyze, keyword-rank-check and serp-related-questions (not fully verified).
3. **Mojeek for generic web search only (confidence: moderate).** Explicit usage grant, PAYG without minimum, own index, no Google exposure. Use for `brand-mention-search` and the `adverse-media-check` fallback if Petter accepts non-Google results. It cannot serve rank, news or related-questions.
4. **Brave, only with a signed enterprise agreement (confidence: high that standard terms forbid our use).** Best own-index quality and no circumvention exposure, but the standard terms ban redistribution and storing, and add an obligation to bind our end users to similar terms.
5. **Not worth pursuing:** Exa, Tavily, You.com, Kagi (terms unread), SearchApi, Zenserp, VALUE SERP, Bright Data, Serpent API; Oxylabs and SerpApi are excluded. Bing and Google first-party search are unavailable.

### What switches off if nothing is confirmed
- Without a Google-data vendor: `serp-analyze`, `keyword-rank-check`, `serp-related-questions` and `google-search` have no replacement (Brave/Mojeek would be different products and the Google names would be false claims). `google-news-search` and `brand-mention-search` could move to Brave or Mojeek with changed descriptions.
- `backlink-check`: keep, minus the Serper fallback (CommonCrawl only, lower recall on small domains). `adverse-media-check`: keep, minus the fallback (Dilisense only; the executor already prefers it).

### Open questions only a vendor can answer
- **Serper:** may a customer return results to its own paying API customers, and does "as-is with no-value-added" apply to an unmodified list of results? (This was DQ-39 option 1.)
- **DataForSEO:** (a) written permission to include results in a product sold per call to third parties; (b) meaning of s.7.1 for a general search tool; (c) whether s.7.2's indemnity is limited to our own breach of 7.1.
- **Scrapingdog:** does the s.2 licence cover the smallest paid plan; any minimum term; does it keep working if Google blocks it (SLA)?
- **Mojeek:** is an AI-agent API a "search experience"; can the storage exclusions be waived for short-term caching of repeated queries?
- **Brave:** price and terms of an enterprise plan that permits returning results to API customers; whether "End User" agreement terms can be satisfied by our API terms.

### Confidence
- DataForSEO, Scrapingdog, Mojeek, Brave, Exa, Tavily, SearchApi, Serper clauses: **high** (raw page text read).
- Zenserp (clause is in a parent company's general terms): **moderate**.
- VALUE SERP/Traject, You.com consumer terms: **moderate to low** (read via a fetch tool's summary, not raw text).
- Kagi, Searlo: **low** (terms unread or generic).
- Litigation findings: **moderate**; trade press and search summaries, not dockets. Absence of a suit against a named vendor is not proof.
- Migration effort estimates: **moderate**; based on reading the eight executors, not on running a vendor's API.

### Not examined
Perplexity Search API, Parallel, Firecrawl search, Jina Search (Jina is already flagged in `vendor-terms.ts`), Google's partner-only full-web programme (no public terms), Yandex/Baidu.
