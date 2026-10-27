# Who wins distribution for agent tools, and why: comparables for Strale

> Evidence appendix to [../2026-10-27-distribution-strategy.md](../2026-10-27-distribution-strategy.md). Written by a read-only research agent on 2026-10-27; raw API dumps referenced below (`research/raw/`, `research/data/`) were working files and are not kept in the repository.

Research date: 2026-10-27. Read-only desk research: no signups, payments, posts or contact.
Raw data: `research/data/` (Bazaar pages bz0-85.json, npm.tsv, pypi.tsv, gh.tsv), `research/all_items.json`, `research/bazaar_out.txt`, `research/kw_out.txt`. Scripts: `research/analyze.py`, `research/kw.py`.

## How the numbers were collected (read this before quoting any of them)

- **npm**: `api.npmjs.org/downloads/point/2026-09-26:2026-10-25/<pkg>`. The `last-month` alias returned stale data (2026-06-02 to 2026-07-01) when I ran it, so I used an explicit date range. npm counts include CI installs and installs pulled in by dependent packages. For example, `@browserbasehq/sdk` is pulled in by Stagehand. Use them to compare order of magnitude, not to count users.
- **PyPI**: `pypistats.org/api/packages/<pkg>/recent` → `last_month`. These also include mirrors and CI.
- **GitHub stars**: from `ungh.cc` (a GitHub API proxy), because direct GitHub API access was blocked in this session. Pulled 2026-10-27.
- **Smithery**: `registry.smithery.ai/servers` `useCount`. Smithery does not document what `useCount` measures, so treat it as relative.
- Funding and traction figures are what the companies said, as reported in the press. They are labelled that way below.

---

## Comparables

### 1. Tavily: "the search tool in the LangChain tutorial"
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | Started as the open-source **GPT Researcher**, which ran on the Tavily API. LangChain blogged about it in July 2023. It became the search tool in LangChain/LangGraph tutorials. The LangChain **Deep Agents quickstart** uses Tavily today (26 mentions in the page). Has its own `langchain-tavily` partner package. Nebius agreed to acquire it on 2026-02-10; press reported about $275M. Says it serves 1M+ developers. | [Nebius release](https://nebius.com/newsroom/nebius-announces-agreement-to-acquire-tavily-to-add-agentic-search-to-its-ai-cloud-platform); [SiliconANGLE](https://siliconangle.com/2026/02/10/ai-infrastructure-giant-nebius-buys-agentic-search-startup-tavily/); https://docs.langchain.com/oss/python/deepagents/quickstart.md | high (channel), moderate (origin story) |
| (b) Free tier | **1,000 credits/month** with no card. Project plan $30/month for 4,000 credits. Pay-as-you-go $0.008/credit. Free student accounts. Startup program gives **100,000 credits**. | https://www.tavily.com/pricing | high |
| (c) Frameworks | LangChain (`langchain-tavily`, plus a row in the docs search table), CrewAI (`TavilySearchTool`, `TavilyExtractorTool`, `TavilyResearchTool`), Vercel AI SDK Tools Registry, langchain-community `tavily_search`. Also sells over x402 (`x402.tavily.com/search`, 594 calls/30d on Bazaar). | crewai-tools 1.15.30 wheel; [LangChain tools](https://docs.langchain.com/oss/python/integrations/tools); https://ai-sdk.dev/tools-registry | high |
| (d) Metrics | `tavily-python` **9.59M** PyPI/month; `@tavily/core` 1.35M npm/month; `langchain-tavily` 599k PyPI; tavily-mcp 2.5k stars; Smithery useCount 1,575. | data/pypi.tsv, npm.tsv, gh.tsv | high |
| (e) Copy | A first-party LangChain/CrewAI tool name that tutorials can import. An open-source "reference agent" (theirs was GPT Researcher) that needs the API to run. A startup credit program. | | |

### 2. Exa: "the search API built for AI", placed as the default inside other products
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | Embedded as the **default** in other products: OpenRouter's web-search plugin uses Exa for every model without native search. On x402 it is resold heavily by StableEnrich (`/api/exa/search`, 30,026 calls/30d, 162 payers) and BlockRun. It also sells directly (`api.exa.ai/search`, 9,085 calls, 93 payers). Raised a $250M Series C led by a16z (May 2026, $2.2B valuation). Says it has 400k+ developers and 5k+ businesses. | [OpenRouter docs](https://openrouter.ai/docs/guides/features/plugins/web-search); Bazaar; [Bloomberg via bgov](https://news.bgov.com/antitrust/andreessen-backed-ai-search-startup-exa-valued-at-2-2-billion) | high |
| (b) Free tier | **$10 credit, which resets monthly** (about 2,500 Lite searches) with no card, plus a one-time $10 bonus for finishing onboarding. Search $4–7 per 1k requests. | https://exa.ai/pricing | high |
| (c) Frameworks | LangChain (`langchain-exa`; the docs table says "1000 free searches/month"), CrewAI `EXASearchTool`, Vercel AI SDK registry (listed first), Smithery-verified `exa` server (useCount 9,181). | as above | high |
| (d) Metrics | `exa-py` **5.41M** PyPI/month; `exa-js` **3.41M** npm/month; exa-mcp-server 5.2k stars, npm 59k/month. | data/ | high |
| (e) Copy | Get used *inside* other people's products and resellers (OpenRouter, StableEnrich). A free credit that **resets every month**. List as an x402 seller under your own domain and let resellers wrap you. | | |

### 3. Firecrawl: open-source core, then a hosted API
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | **AGPL open-source repo with 195,888 stars**. It went from 10k stars at its v1 launch to 48k at the Aug 2025 Series A. Launch weeks. A $75M Series B in Sept 2026 alongside "Alexandria", a data library for agents. Says it has 1.25M developers and 150k organizations (self-reported). Search also offered in OpenRouter. Resold on x402 via StableEnrich. | gh.tsv; [Firecrawl v1 post](https://www.firecrawl.dev/blog/launch-week-i-day-4-introducing-firecrawl-v1); [Series A](https://firecrawl.dev/blog/firecrawl-v2-series-a-announcement); [Series B coverage](https://runtimewire.com/article/firecrawl-raises-75m-series-b-alexandria-ai-agent-data) | high (stars), moderate (user counts) |
| (b) Free tier | **1,000 credits/month** with no card. Hobby $19 for 5k, Standard $99 for 100k. | https://www.firecrawl.dev/pricing | high |
| (c) Frameworks | LangChain (search table and browsing table), CrewAI (3 tools), Vercel AI SDK registry, OpenRouter search engine option. | | high |
| (d) Metrics | `@mendable/firecrawl-js` **4.26M** npm/month; `firecrawl-py` **5.34M** PyPI/month; `firecrawl-mcp` 539k npm/month (the highest of any vendor MCP package measured here); MCP repo 7.7k stars. | data/ | high |
| (e) Copy | Open-source part of the stack: a thin, useful library or CLI that wraps your API. An MCP package people install with `npx`. Launch weeks, which cost nothing but writing. | | |

### 4. Composio: breadth plus managed auth
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | Open-source SDK repo with 30.8k stars. The pitch is "1500+ toolkits" with managed OAuth. Native provider packages for every major framework. A CLI aimed at coding agents ("Give Claude, Codex... access to 1500+ tools"). $25M Series A (Lightspeed, July 2025); at that time it said it had 100k+ developers and 200+ paying customers. | https://composio.dev; [Entrackr](https://entrackr.com/news/agentic-ai-startup-composio-raises-25-mn-led-by-lightspeed-9525112) | high (positioning), moderate (traction) |
| (b) Free tier | Hobby plan: **100,000 tool calls/month for $0**, no card. Pro $29/month. | https://composio.dev/pricing | high |
| (c) Frameworks | LangChain "Integration platforms" table (listed as 500+ there), CrewAI `ComposioTool`. | lc_tools.md, crewai-tools | high |
| (d) Metrics | `@composio/core` **4.17M** npm/month; `composio` 1.73M PyPI/month; Smithery useCount 570. | data/ | high |
| (e) Copy | Strale already has a Composio package. What can be copied is the *breadth number* in the headline and an "add to your coding agent" one-liner. Composio's real moat, managed OAuth across thousands of apps, cannot be copied. | | |

### 5. Apify: a marketplace that pays its creators, now with MCP and x402
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | Two-sided store. The homepage says "Browse **100,529 Actors**" and "$1.7M paid out last month"; I read the latter from page text split across elements as "$1"/"7M paid out last month". Developers keep 80%, Apify keeps a 20% commission. Open-source Crawlee (26.3k stars). Official Actors MCP server (13.4k stars). Accepts x402 (`agi.apify.com/protocols/x402/prepaid-tokens`, 38 payers/30d). | https://apify.com; [monetization docs](https://docs.apify.com/platform/actors/publishing/monetize) | high (commission), moderate (counts read from page text) |
| (b) Free tier | **$5 of platform usage/month**. Starter $19. Creator plan $1/month with $500 of usage for 6 months. | https://apify.com/pricing | high |
| (c) Frameworks | LangChain (`langchain-apify`, 27k PyPI/month), CrewAI `ApifyActorsTool`, plus Zapier, n8n and MCP clients. | | high |
| (d) Metrics | `apify-client` 2.27M PyPI / 1.56M npm per month; `@apify/actors-mcp-server` 92.5k npm/month. | data/ | high |
| (e) Copy | **Publish Strale capabilities as Apify Actors.** It is a distribution channel, not a competitor: no fee to list, 20% commission, and Apify handles billing. Lead-research buyers already shop there. Each Actor must follow DEC-20261023-A, meaning it calls Strale's official-source endpoints and does no scraping. | | moderate |

### 6. Browserbase: open-source SDK first, then usage-based infrastructure
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | Open-source **Stagehand** (25.8k stars) is the funnel. MCP server. $40M Series B (June 2025, $300M post-money). Reported 35M+ sessions/month in June 2026. Now sells search and fetch over x402 (`x402.browserbase.com/search`, $0.01). | gh.tsv; [SiliconANGLE](https://siliconangle.com/2025/06/17/browserbase-reels-40m-browser-automation-tools/); [AI Engineer](https://www.ai.engineer/orgs/browserbase) | high / moderate |
| (b) Free tier | 1 browser hour, 3 concurrent browsers, **1,000 search and 1,000 fetch calls**, $5 of model tokens. Developer plan $20/month. | https://www.browserbase.com/pricing | high |
| (c) Frameworks | LangChain (Stagehand), CrewAI (`BrowserbaseLoadTool`, `StagehandTool`), Vercel AI SDK registry. | | high |
| (d) Metrics | `@browserbasehq/stagehand` 6.16M npm/month; `browserbase` 3.11M PyPI/month (both inflated by dependents). | data/ | high |
| (e) Copy | Even an infrastructure company added cheap x402 primitives (search/fetch at $0.01). That confirms simple per-call primitives are where agent wallets spend. | | |

### 7. Zapier MCP: brand plus an existing app catalogue
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | Brings its existing catalogue of thousands of apps to MCP, plus its own installed base. | | moderate |
| (b) Pricing | No separate price. Uses tasks from the regular plan; **each successful MCP call reportedly costs 2 tasks**. Free plan has 100 tasks/month. These figures come from third-party sources; I did not get Zapier's own page. | [latenode](https://latenode.com/blog/zapier-mcp-pricing) | low-moderate |
| (c) Frameworks | CrewAI `ZapierActionTool` and its `zapier_adapter`; langchain-community `zapier`. | crewai-tools wheel | high |
| (d) Metrics | `@zapier/zapier-sdk` 1.14M npm/month; zapier-mcp repo 450 stars. | data/ | high |
| (e) Copy | Nothing structural. Distribution comes from an existing customer base Strale doesn't have. | | |

### 8. RapidAPI (now "Rapid", owned by Nokia): the old API marketplace
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a)–(b) | Nokia bought the technology and R&D unit in Nov 2024. It says it has 4M developers and 40k APIs (its own claim). A 2026 comparison says it charges a flat **25% marketplace fee**. Neither Bazaar nor the frameworks show any agent-specific momentum. | [dealroom](https://app.dealroom.co/news/feed/nokia-acquires-rapidapi-for-150m-assets); [geekflare](https://geekflare.com/guides/sell-apis/) | low-moderate |
| (c) | Not a built-in tool in LangChain, CrewAI or the AI SDK. | | high |
| (e) Copy | Optional and cheap: list a few Strale endpoints there for SEO and long-tail discovery. It is not where agent buyers are. | | |

### 9. Smithery-hosted servers
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| Top servers (useCount) | brave 87,579 · bouch/uk-due-diligence **60,881** · paper-search 59,106 · gmail 57,738 · googlesheets 56,138 · theagenttimes/news 43,392 · pubmed 42,137 · Polymarket 39,483 · exa 9,181 · Tavily 1,575. The registry lists 20,765 servers. | `registry.smithery.ai/servers` | high (as reported) |
| Company data on Smithery | **bouch/uk-due-diligence** (5 UK official registers, 16 tools) has 60,881 uses, the #2 server I saw. entia/entity-verification (BORME/VIES/GLEIF, free tier of 100 req/month) has 16,045. **strale/agent-tools has 989.** | as above | high |
| **Finding for Strale** | Strale's Smithery description still says "dual-profile quality scoring … SQS confidence score". That engine was deleted under DEC-20260503-B, so this is a stale public claim (failure family F6). | registry entry `strale/agent-tools` | high |
| (e) Copy | A single-country, single-purpose company-data server (UK due diligence) beats Strale's broad server by about 60x on Smithery. Ship **narrow, named servers** (e.g. "nordic-company-check", "eu-vat-and-registry") that point at the same backend. | | moderate |

### 10. Delegate (dlgt.io): a curated, neutral marketplace with a router
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | **One-line agent install**: "set up https://dlgt.io/SKILL.md", pasted into Claude Code, Codex, Cursor or Gemini CLI. Hosted MCP `app.dlgt.io/api/mcp`. Claude and ChatGPT connectors. A blog post for every new provider ("Fundable is on Delegate", "Context.dev is on Delegate"). Claims 778 services. Its SKILL.md tells the agent to call `search_services` "before a generic web search". | https://dlgt.io; https://dlgt.io/SKILL.md; https://dlgt.io/blog | high |
| (b) Pricing | No platform fee to the buyer; any fee comes from the provider side. Funds are held until an independent check confirms the result. Per-agent budget caps. Examples: PDL person enrichment $0.28, Hunter email $0.05, You.com research $0.50. | https://dlgt.io/pricing | high |
| (d) Metrics | `@dlgt-io/sdk` 278 and `@dlgt-io/cli` 254 npm/month. Early stage. | data/npm.tsv | high |
| (e) Copy | **(1) A hosted `SKILL.md` with a one-line install prompt** (cheap). **(2) Become a Delegate provider.** Its catalogue already covers company/people data and "sanctions and watchlist screening", and its SKILL.md routes agents there. Getting listed would be a partner/terms decision. Under DEC-20261027-A a session may email vendors about access and terms, but a signed agreement stays with Petter. | | moderate |

### 11. x402 resellers: StableEnrich (Merit Systems / AgentCash), Orthogonal, OneShot
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| (a) Channels | **StableEnrich** wraps Exa, Firecrawl, PDL, FullEnrich, Reddit and Google Maps behind x402 at $0.015–0.045 and is distributed through **AgentCash** (`npx agentcash onboard`). It claims "796,342 requests/month"; Bazaar sees only 42,225 over 30 days, probably because Bazaar counts only CDP-settled payments. AgentCash says 1.5M+ paid tool calls and is "giving $100,000 to our first users" (seed credits). Merit Systems also runs x402scan and mppscan, so it owns the discovery index too. **Orthogonal** resells Apollo, Icypeas and Leadsforge (296 resources). **OneShot** sells web-read and search. | https://stableenrich.dev; https://agentcash.dev; https://agentcash.dev/merchants.md | high (listing), low (self-reported volumes) |
| (c) | AgentCash works with Claude Code, Codex, Cursor and Gemini CLI. Registration with x402scan and mppscan is free (`x402scan.com/resources/register`). **Strale does not appear in the AgentCash `/apis` page HTML.** | | moderate |
| (d) | `agentcash` 6,067 npm/month; `@agentcash/router` 2,534. | | high |
| (e) Copy | **Register Strale on x402scan, mppscan and the AgentCash directory** (free). Publish OpenAPI discovery metadata at the origin. | | high |

### 12. People/company data APIs and Clay (enrichment reference)
| Item | Finding | Evidence | Conf. |
|---|---|---|---|
| People Data Labs | Free plan **100 credits/month** without contact data. Pro from $98/month. `peopledatalabs` npm 396k/month, PyPI 95k/month. Distributed mostly *through* others: Clay, Delegate ($0.28/record), StableEnrich (`/api/pdl/people-enrich` at $0.28, 1,023 calls, 45 payers). | [PDL pricing](https://www.peopledatalabs.com/pricing/person); Bazaar | high |
| Proxycurl | **Shut down 2025-07-04** after LinkedIn sued Nubela (filed 2025-01-24; fake-account scraping alleged). A reported ~$10M revenue business disappeared. This supports DEC-20261023-A's "never" lane. | [founder post](https://nubela.co/blog/goodbye-proxycurl/) | high |
| Clay | Marketplace of 150–200+ data providers with "waterfall" enrichment. For providers, being a Clay waterfall source *is* their distribution. The headline says $150M/year (Sacra); I did not verify the body. | [Sacra](https://sacra.com/research/clay-crosses-150m-year/); clay.com | moderate |
| (e) Copy | Data vendors win by being **a step inside someone else's workflow** (Clay, Delegate, StableEnrich), not by direct developer acquisition. Strale's official-registry data is a natural "verify the company is real" step for those routers. | | moderate |

---

## x402 Bazaar top-seller analysis

**Method.** I paginated `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=1000&offset=N` for offset 0 to 85,000 (86 pages) on 2026-10-27, between about 12:54 and 13:10 UTC (13:54 to 14:10 Stockholm time). The API reported total=84,636; after deduplicating by `resource` URL, 84,590 remain. Sellers are grouped by registrable domain (the last two hostname labels). Metrics come from each item's `quality` block: `l30DaysTotalCalls` (summed per host) and `l30DaysUniquePayers` (the **maximum over a host's resources**, because payers cannot be deduplicated across resources). Calls are as Bazaar reports them, which appears to be only CDP-facilitator settlements. Sellers' own test calls are not excluded.

**Ecosystem**
- 1,324 seller domains; 2,295 distinct `payTo` wallets. 30-day calls summed: **926,473**.
- Highly concentrated: the top seller has **20.9%** of calls, the top 10 have **71.6%**, the top 25 have **83.1%**. 57 domains have ≥1,000 calls in 30 days.
- Only 454 resources (0.5%) had ≥10 unique payers.
- Listing counts are inflated: **datapackvibe.com alone has 54,826 resources (65% of the index)** but at most 3 payers. Counting resources therefore says nothing about sellers.
- Networks: Base 88k accepts, Solana 15.6k, Polygon 8.8k, Arbitrum 7.1k.

**Top by 30-day calls (host · resources · calls · max payers on one resource)**
| # | Host | Res. | Calls 30d | Max payers | What |
|---|---|---|---|---|---|
| 1 | ax1.vc | 1 | 193,783 | 1,577 | AI token "verdict" (entertainment) |
| 2 | blockrun.ai | 109 | 104,314 | 300 | LLM chat completions + Exa resale |
| 3 | datapackvibe.com | 54,826 | 93,292 | 3 | package-registry lookups (index spam) |
| 4 | pocket.network | 116 | 71,452 | 36 | agent messaging, prompt-injection, search |
| 5 | api-xpay.com | 14 | 63,975 | 248 | payment quotes |
| 6 | **stableenrich.dev** | 15 | **42,225** | **162** | Exa/Firecrawl/PDL/FullEnrich resale |
| 7 | sniperx.fun | 10 | 34,653 | 17 | crypto smart-money |
| 8 | blockchhub.link | 3 | 29,605 | 62 | native transfer fee |
| 9 | chain.link | 2 | 15,650 | 2 | Chainlink workflows |
| 10 | oneshotagent.com | 84 | 14,209 | 23 | web-read, search, enrichment |
| 11 | agent402.tools | 614 | 12,510 | 25 | mixed |
| 14 | **exa.ai** | 2 | 9,896 | 93 | Exa direct |
| 19 | **orthogonal.com** | 296 | 6,441 | 11 | Apollo/Icypeas/Leadsforge resale |
| 22 | **strale.io** | 163 | **4,608** | **4** | Strale |

Brand names on x402: Nansen (38 resources, 4,178 calls), You.com (665), Tavily (594), Apify (429), Browserbase (search 331, fetch 145). Firecrawl, Zapier and Composio have no listings of their own.

**By category** (regex over description, tags and serviceName; approximate; `research/kw_out.txt`)
| Category | Hosts | Calls 30d | Leaders |
|---|---|---|---|
| Web scrape / markdown | 239 | 22,270 | oneshotagent (8,708), clawfetch.ai (2,983) |
| People / lead enrichment | 201 | 20,564 | orthogonal (4,661), blockrun, stableenrich (2,015 by regex; 42k for the whole host) |
| Web search | 115 | 19,561 | blockrun (7,155), pocket.network, oneshot, you.com |
| Sanctions / PEP / AML | 145 | 6,252 | pocket.network (1,669), mostly crypto-wallet OFAC checks; strale 148 |
| **Company registry / KYB / VAT / LEI** | 119 | **1,946** | datapackvibe 219, sirenic.eu 117, **strale 93** |
| Validation (email/phone/IBAN/VAT) | 84 | 1,838 | oneshot 587, netintel.dev (SPF/DKIM 645) |

**What this says about Strale**
1. Strale is **#22 of 1,324** sellers by Bazaar calls, but its busiest resource has only **4 unique payers**. `email-validate` shows 589 calls from 1 payer. Most of the volume is probably Strale's own testing plus the one customer. Do not quote the rank externally.
2. On x402, demand for **official company-registry data is about 2k calls/month across the whole market**. Enrichment, search and scraping are each about 10x larger. That fits Strale's only paying customer buying lead-research primitives.
3. The sellers that win are **resellers of known brands at one URL** (StableEnrich, BlockRun, Orthogonal), pushed through a wallet/MCP client that owns discovery (AgentCash, operated by Merit Systems, which also runs x402scan).
4. Small direct competitors in company data already exist: sirenic.eu (FR/EU registers, 124 resources), resolve402.dev (FR/UK directors), limitguard.ai (NL/BE lead verify), greeneris (SEC XBRL).

---

## Synthesis: recurring patterns

1. **Being the default inside a framework or tutorial is the strongest channel.** Tavily is in the LangChain Deep Agents quickstart. Exa is OpenRouter's fallback search. Tavily, Exa, Firecrawl, Composio, Apify, Browserbase and Zapier all ship as named tools in **crewai-tools**, and the PyPI download figures follow from that (Tavily 9.6M, Exa 5.4M, Firecrawl 5.3M per month). **crewai-tools has 108 tools and none of them is company-registry, KYB or sanctions data.** The same category gap exists in LangChain's categorized tables. Strale's `StraleToolkit` sits only in LangChain's long "All tools" list.
2. **An open-source core feeds the hosted API**: Firecrawl 196k stars, browser-use/Stagehand, Crawlee, Composio SDK, GPT Researcher for Tavily.
3. **A free tier that resets monthly, sized for the first prototype**: about 1,000 calls/month (Tavily, Firecrawl, Browserbase search/fetch), $10/month (Exa), $5/month (Apify), 100k calls (Composio). Plus startup or student credits (Tavily 100k) and seed bonuses (AgentCash's "$100,000 to first users").
4. **"The X API" positioning**: one noun per company (search, scrape, browser, auth). Broad libraries win only through someone else's marketplace (Apify Store, Composio's 1,500 toolkits, Delegate's 778 services, Clay's 150–200 providers).
5. **Distribution through intermediaries**: resellers and routers (StableEnrich, Delegate, OpenRouter, Clay) carry data vendors (PDL, Exa, Firecrawl). On x402, the resellers capture most of the payers.
6. **Agent-native install surfaces**: `npx <x>-mcp`, hosted MCP URL, a hosted `SKILL.md` with a "paste this into your agent" prompt (Delegate, AgentCash), and llms.txt (StableEnrich's llms.txt is written as agent operating instructions).
7. **Narrow beats broad on MCP registries**: uk-due-diligence (60,881) vs strale/agent-tools (989) on Smithery.

**Not available to a one-person team with about €50/week**
- Venture-scale funding ($25M–$250M rounds), paid developer relations, conference sponsorships, hackathon prize pools of meaningful size.
- Acquisition-scale embedding deals (Nebius/Tavily) and becoming OpenRouter's default (needs a search index and a commercial relationship).
- Large open-source communities. Firecrawl-scale stars need a genuinely general tool plus maintainers. A registry wrapper will not get there.
- Managed OAuth across thousands of apps (Composio) or an existing installed base (Zapier).
- Generous free tiers on **paid upstream** data (registries or vendors with per-call cost). The free tier has to stay on zero-cost capabilities.
- Signing marketplace or provider agreements without Petter. Any listing that needs signed terms (Delegate provider, Apify KYC payouts, Clay partnership) is his call.

## Cheap to copy, ranked by expected value per hour

1. **Get a company-verification tool into crewai-tools and the LangChain category tables.** Open PRs adding `StraleCompanyLookupTool` / a sanctions-screen tool (an empty category there), and a row in LangChain's "Search" or "Finance" table, where x402 tools such as Toolstem and Ausca are already listed. Follow the Distribution PR Integrity Protocol (DEC-20260422-A): real framework code, a test, and verified imports.
2. **Submit to the Vercel AI SDK Tools Registry.** It takes long-tail submissions: Pexafy, Nitrosend and the x402 marketplace Fatstack are listed. Needs an `ai`-SDK tool package.
3. **Register on x402scan, mppscan and the AgentCash directory** (free, no signed terms). Add `@agentcash/discovery`-valid OpenAPI metadata.
4. **Hosted `strale.dev/SKILL.md` with a one-line install prompt**, plus llms.txt written as agent operating instructions, following StableEnrich's and Delegate's pattern.
5. **Narrow, named MCP servers on Smithery and the MCP registry** that point at the same backend. Examples: "uk-company-check", "nordic-kyb", "eu-vat-validate", "sanctions-screen". **Also fix the stale SQS claim in the `strale/agent-tools` Smithery description** (failure family F6; narrowing public copy is delegated under DEC-20260822-A).
6. **A free tier that resets monthly and is stated as a number** on zero-cost capabilities, e.g. "100 free calls/month", matching the 1,000/month convention. Today's 10/day per IP is invisible in framework tables, which have a pricing column.
7. **Publish a few lead-research primitives as Apify Actors.** Apify keeps 20% and handles billing. Listing is free but payouts need KYC, so check with Petter before relying on payouts.
8. **One open-source "reference agent"**, e.g. a KYB/lead-research agent repo that runs on Strale (the GPT Researcher pattern). Cost is writing time only.
9. **Pitch Strale as a provider to routers** (Delegate; StableEnrich/AgentCash as an origin). Their buyers already ask for company data and sanctions screening. A session may send the access/terms email (DEC-20261027-A, with an OUTBOX row). Signing anything stays with Petter.
10. **A launch-week style post per new country registry**, like Delegate's "X is on Delegate" posts. Public posts are Petter's per DEC-20261027-A, so draft them only.
