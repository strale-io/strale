# Where agents and their builders find tools: a map of the venues, and where Strale stands (2026-10-27)

> Evidence appendix to [../2026-10-27-distribution-strategy.md](../2026-10-27-distribution-strategy.md). Written by a read-only research agent on 2026-10-27; raw API dumps referenced below (`research/raw/`, `research/data/`) were working files and are not kept in the repository.

This is read-only research. I probed live on 2026-10-27, usually with `curl` or WebFetch, and every claim below links to its source. Where a number is "unknown", no source gave one. Raw fetches are kept in `research/raw/` in this scratchpad.

Earlier internal context: `docs/company/DIRECTORY-MAP.md` (2026-08-15) lists crawler hits from the `discovery_hits` table. Ten venues crawl us, and the conclusion there was "not undiscovered, under-converting". I did not query the production database for this report.

## Headline finding

Strale is **listed in most of the crawler directories, but almost every listing shows retired claims**. Those claims include the SQS / "dual-profile quality score" (the engine was deleted 2026-05-05), "250+/270+/290+", "27 countries" and "Trust and quality infrastructure". The sources that feed the directories are themselves stale:

- the GitHub repo description;
- the official-registry version 0.2.4;
- Smithery's description;
- Context7's index, last built 2026-03-31.

Strale is **absent from every curated, one-click client marketplace** (Claude Connectors Directory, GitHub/VS Code registry, Cursor, Cline, Docker, Windsurf). Strale's remote server **fails a hard Claude-directory requirement**: none of its 9 tools has a `title` or a `readOnlyHint`/`destructiveHint` annotation, as the live `tools/list` showed on 2026-10-27. It also authenticates with a Bearer API key rather than OAuth.

---

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

| Field | Finding |
|---|---|
| What | The open, canonical metadata registry. Downstream registries (GitHub, mcpbeat, PulseMCP and others) ingest from it. |
| Reach | **51,098 distinct server names at latest version.** I counted them myself by paging the whole API (`/v0/servers?version=latest`, 511 pages) on 2026-10-27. A third-party pull counted 9,652 in May 2026 ([nordicapis](https://nordicapis.com/10-interesting-mcp-statistics/), [dev.to](https://dev.to/amareswer/the-mcp-registry-by-the-numbers-38nc)). It has no end-user traffic of its own: it is infrastructure. |
| Listing | Self-publish with the `mcp-publisher` CLI. A namespace proof is required (GitHub OAuth for `io.github.*`, or DNS/.well-known for a domain). Anthropic's docs say that proof "applies only to the open MCP Registry" ([claude.com/docs](https://claude.com/docs/connectors/directory.md)). |
| Ranking | None. It is a metadata store, and the API returns entries alphabetically or by cursor. |
| Cost | Free. |
| **Strale state** | `io.github.strale-io/strale`, with 7 versions. **The latest is 0.2.4, published 2026-04-12**: title "Strale - 290+ API capabilities for AI agents", description "290+ quality-scored API capabilities for AI agents across 27 countries via MCP." ([API](https://registry.modelcontextprotocol.io/v0/servers?search=strale)). npm is at **0.2.8** (2026-08-23) ([npm](https://registry.npmjs.org/strale-mcp)). The repo's `server.json` says 0.2.3 with "Trust and quality infrastructure… 250+ quality-scored", so it is behind both. Both the remote (`https://api.strale.io/mcp`) and the npm package are declared. |
| Confidence | High |

## 2. Smithery (smithery.ai)

| Field | Finding |
|---|---|
| What | A directory plus a hosted gateway. Smithery proxies remote servers (`*.run.tools`) and counts the calls. |
| Reach | **20,764 servers** (`totalCount`), of which **193 are verified** ([registry API](https://registry.smithery.ai/servers?pageSize=1), [verified](https://registry.smithery.ai/servers?q=is:verified&pageSize=1)). No published traffic figure; unknown. |
| Listing | URL-based publish at smithery.ai/new, or a GitHub repo with `smithery.yaml`. |
| Ranking | The search returns a relevance `score`, plus `useCount` and a `verified` flag. Per its data policy, Smithery tracks tool calls on hosted servers and installs (plus consented tool calls) on local ones, "to help rank servers" ([summary via search of smithery.ai/docs/data-policy](https://smithery.ai/docs/data-policy)). |
| Cost | Free to list. |
| **Strale state** | **Found: `strale/agent-tools`** (the slug the August map was looking for): displayName "Strale", `verified: false`, **`useCount: 989`**, remote, deployed at `https://agent-tools--strale.run.tools`, created 2026-02-27. It ranks #1 for "strale" ([API](https://registry.smithery.ai/servers?q=strale), [detail](https://registry.smithery.ai/servers/strale/agent-tools)). The description is **stale**: "dual-profile quality scoring… combined into a single SQS confidence score… Failed calls due to upstream issues are never billed." The listed tools include `strale_trust_profile` and `strale_methodology`. Public page: https://smithery.ai/server/strale/agent-tools. |
| Confidence | High |

## 3. Glama (glama.ai/mcp)

| Field | Finding |
|---|---|
| What | A directory, chat client, inspector and gateway, run by the same owner as the punkpeye awesome lists. |
| Reach | About 21k servers per April page headers ([glama](https://glama.ai/mcp/servers/polymarket-mcp)). Traffic unknown. The punkpeye awesome list links to Glama for every entry. |
| Listing | Auto-crawled from GitHub. You claim the listing with `glama.json` (`maintainers`). |
| Ranking | The **overall score is 70% TDQS (Tool Definition Quality Score) plus 30% Server Coherence.** At server level, TDQS is 60% the mean across tools plus 40% the worst tool. Grades: A ≥3.5, B ≥3.0, C ≥2.0. Security scans and license detection apply, and a server without a LICENSE cannot be installed. Glama's levers are to claim the listing, complete the profile, provide a test profile, and record more successful uses ([score page example](https://glama.ai/mcp/servers/mnott/Hook/score), [TDQS](https://tdqs.dev)). A paid "Boosted"/advertise option exists ([glama.ai/advertise](https://glama.ai/advertise)). |
| Cost | Free, with paid boost optional. |
| **Strale state** | https://glama.ai/mcp/servers/@strale-io/strale, live with 200. The badge reads **"rated A"** ([card.svg](https://glama.ai/mcp/servers/strale-io/strale/badges/card.svg)). Page data shows `overallScore` 4.4 and a TDQS of 4.7 on one tool. License: MIT. Categories: Autonomous Agents, Legal & Compliance, RAG Systems. **The meta and OG descriptions and the AI-generated "What can you do" summary are stale.** They say "Every capability has a dual-profile SQS quality score", "290+", "27 countries", and describe `strale_trust_profile` as returning an "SQS quality score (0-100), Quality grade (A–F)…". The README section underneath is current. Glama's tool definitions come from an older crawl: the current `packages/mcp-server/src/tools.ts` already removed the SQS wording. Install count is not shown. |
| Confidence | High for the listing. Moderate for how scores map to search rank. |

## 4. mcp.so

| Field | Finding |
|---|---|
| What | A large community directory with a Chinese/English audience. |
| Reach | Unknown. I found no count on the page. Third-party guides call it "one of the most popular" ([geekflare](https://geekflare.com/guides/mcp-server-directories/)). |
| Listing | A submit form. An API endpoint `mcp.so/api/submit-project` is reported second-hand only. |
| Ranking | Unknown, with featured placement visible. |
| **Strale state** | Listed at https://mcp.so/servers/strale as "Strale — Trust And Quality Infrastructure For Ai Agents", category Cloud & Infrastructure, created 2026-03-13. Description: "…Every capability has a transparent SQS quality score. Audit trails on every call. EU AI Act support." Its FAQ JSON-LD **states the full retired SQS formula** ("correctness (40%), schema stability (25%)…"). It shows no installs, rating or stars (`verified: false`). |
| Confidence | High for the state. Low for reach. |

## 5. PulseMCP (pulsemcp.com)

| Field | Finding |
|---|---|
| What | A directory plus a weekly newsletter. Its sub-registry mirrors the official registry. |
| Reach | Lists **"21,620+" servers** ([search page](https://www.pulsemcp.com/servers?q=strale)). It shows an estimated weekly visitor count for each server. |
| Listing | Mostly ingested from the official registry, with manual submission available. |
| Ranking | Sort options: Recommended (default), Most Popular (all time, month or week; based on estimated visitors), Recently Released, Last Updated. |
| **Strale state** | https://www.pulsemcp.com/servers/strale, classified "official", released Feb 25, 2026. Description: "Capability marketplace providing AI agents with access to quality-scored business tools…" (stale). **Estimated visitors: 1 per week.** |
| Confidence | Moderate. The direct curl was 403, so this comes through WebFetch. |

## 6. mcpbeat (mcpbeat.com)

| Field | Finding |
|---|---|
| What | An independent liveness monitor and ranking. |
| Reach | Tracks 51,646 servers from the official registry. 36,003 have remote endpoints and 29,152 were answering at the last run ([mcpbeat.com](https://mcpbeat.com/)). Visitor traffic unknown. |
| Listing | Automatic, nightly from the official registry. |
| Ranking | **Out of 100: answering a real MCP handshake every 15 minutes (40); weekly npm/PyPI downloads on a log scale (40); tools exposed via `tools/list` (20).** No stars, editorial picks or paid placement. |
| **Strale state** | The `mcpbeat` crawler hit us 232 times in 30 days (DIRECTORY-MAP). The guessed URL `/servers/io.github.strale-io/strale` returned 404, so our score and rank are **unknown**. Our weak inputs are the download count (see §20) and only 9 tools exposed. |
| Confidence | Moderate |

## 7. Context7 (context7.com)

| Field | Finding |
|---|---|
| What | Upstash's documentation index that coding agents query through the Context7 MCP server. It is the **#2 server by downloads in Cline's marketplace (135,059)** ([Cline API](https://api.cline.bot/v1/mcp/marketplace)). |
| Reach | Large among coding agents. Exact number unknown. |
| Listing | Submit a repo, configured by `context7.json`. |
| Ranking | Library search shows `trustScore` and `benchmarkScore`. |
| **Strale state** | https://context7.com/strale-io/strale: 375 snippets, 119,777 tokens, trustScore 7.5, benchmarkScore 83.6, stars 0. **`lastUpdateDate` 2026-03-31: the index predates the SQS deletion and recent catalogue changes.** The repo's `context7.json` description also still says "Trust layer… 250+ verified". Its `folders` list includes `openai-agents-strale`, `pydantic-ai-strale` and `google-adk-strale`, the packages flagged in the 2026-04 containment incident. |
| Confidence | High |

## 8. MCP Market (mcpmarket.com)

| Field | Finding |
|---|---|
| What | A directory plus a skills catalogue. |
| Reach | Unknown. |
| Listing | Submit a GitHub repo. Content looks AI-generated from the repo. |
| Ranking | GitHub stars are displayed. |
| **Strale state** | https://mcpmarket.com/server/strale: "Provides a trusted capability marketplace for AI agents…", "over 200 verified capabilities", **"Proprietary Strale Quality Score (SQS)"**, "0 GitHub stars". The repo has 5 stars per the GitHub API. |
| Confidence | High for the state. Low for reach. |

## 9. LobeHub MCP marketplace

| Field | Finding |
|---|---|
| Reach | `totalMarketCount` 114,623 entries ([lobehub.com/mcp](https://lobehub.com/mcp?q=strale)). It is heavily crawled and duplicated. |
| Ranking | "Ratings on activity, stability, and community feedback" (page meta). |
| **Strale state** | **Not listed.** `totalCount: 0` for "strale". |
| Confidence | Moderate |

## 10. GitHub MCP Registry (github.com/mcp), which backs VS Code's MCP view

| Field | Finding |
|---|---|
| What | A curated registry. It powers the VS Code Extensions › MCP view with one-click "Install in VS Code" ([GitHub blog](https://github.blog/ai-and-ml/generative-ai/how-to-find-install-and-manage-mcp-servers-with-the-github-mcp-registry/)). Enterprise "registry only" policies block servers that are not in the registry ([changelog](https://github.blog/changelog/2025-11-18-internal-mcp-registry-and-allowlist-controls-for-vs-code-stable-in-public-preview/)). |
| Reach | **648 servers** ([API](https://api.mcp.github.com/v0.1/servers?per_page=1)). VS Code and Copilot user base. |
| Listing | Publish to the official registry. GitHub then curates a subset; the selection criteria are not public. |
| Ranking | GitHub stars and community engagement. |
| **Strale state** | **Not listed** ([search](https://api.mcp.github.com/v0.1/servers?search=strale) returns total 0). |
| Confidence | High |

## 11. Claude Connectors Directory (Anthropic)

| Field | Finding |
|---|---|
| What | One catalogue across claude.ai, Desktop, mobile, Claude Code and Cowork ([docs](https://claude.com/docs/connectors/directory.md)). |
| Reach | All Claude users. No count is published. |
| Listing | The developer portal at claude.ai/directory/manage (any paid Claude plan). Anthropic scans automatically and "by default, lists it as a Community connector". Listings "flagged as highly useful" are escalated automatically to **Verified** review ([submission](https://claude.com/docs/connectors/building/submission.md), [verification](https://claude.com/docs/connectors/verification.md)). |
| Requirements | Remote HTTPS. **OAuth 2.0 for authenticated services, or no auth for public data.** **Every tool needs a `title` and a `readOnlyHint` or `destructiveHint`.** Docs, privacy-policy and support URLs, an icon, and a reviewer test account. Seven compliance acknowledgements, including **financial transactions** and prompt injection. Compliance with the Software Directory Terms and Policy. |
| Ranking | **"Ranking is usage-based, similar to other app stores."** **Every directory entry is automatically eligible for "Suggested Connectors": in-chat recommendations shown when relevant to the user's task.** |
| Cost | Free, but it requires a paid Claude plan to submit. |
| **Strale state** | **Not verifiable without login; almost certainly not listed.** Strale is **not eligible as built**: live `tools/list` returns 9 tools (`strale_ping`, `strale_getting_started`, `strale_execute`, `strale_search`, `strale_balance`, `strale_methodology`, `strale_trust_profile`, `strale_transaction`, `strale_web3_assurance`), each with `title: null` and `annotations: null`. Auth is a Bearer `sk_live_` key, not OAuth. |
| Confidence | High for the requirements. Strale's listing status is unknown, but its ineligibility is high-confidence. |

## 12. Cursor (cursor.com marketplace and directory)

| Field | Finding |
|---|---|
| What | Cursor's plugin marketplace ([directory](https://cursor.com/docs/context/mcp/directory)), with Featured and Recently Added tabs. Plugins bundle MCP servers with rules, skills and agents. |
| Reach | Cursor users. No count is published. |
| Listing | A Cursor staff member advises building the server as a plugin and submitting it at cursor.com/marketplace/publish. There is a backlog of direct MCP requests ([forum](https://forum.cursor.com/t/when-will-mcp-server-registration-requests-be-processed/153911)). |
| Ranking | Editorial featured placement, plus recency. Criteria not public. |
| **Strale state** | **Not listed** (0 mentions in the directory page). |
| Confidence | Moderate |

## 13. Windsurf MCP store

| Field | Finding |
|---|---|
| What | One-click store in the Cascade panel. Official servers carry a blue check ([fast.io guide](https://fast.io/resources/windsurf-mcp-setup-guide/), [designrevision](https://designrevision.com/blog/add-mcp-server-to-windsurf)). |
| Listing | Curated. I found no public submission process. |
| **Strale state** | Not verifiable in-app; no evidence of a listing. |
| Confidence | Low |

## 14. Docker MCP Catalog / Toolkit

| Field | Finding |
|---|---|
| Reach | 245 images in the `mcp/` Docker Hub namespace ([hub API](https://hub.docker.com/v2/repositories/mcp/?page_size=1)). Built into Docker Desktop's MCP Toolkit. |
| Listing | A PR to `docker/mcp-registry` with `servers/<name>/server.yaml`, CI, and Docker-team review. Remote (streamable-http) servers are accepted without a Dockerfile. MIT or Apache license preferred ([CONTRIBUTING](https://raw.githubusercontent.com/docker/mcp-registry/main/CONTRIBUTING.md)). |
| **Strale state** | **Not listed** (`servers/strale/server.yaml` returns 404; `hub.docker.com/v2/repositories/mcp/strale` returns 404). |
| Confidence | High |

## 15. Cline MCP Marketplace

| Field | Finding |
|---|---|
| Reach | **199 curated servers, about 1.47M cumulative downloads.** Top entries are File System (162,656) and Context7 (135,059). The newest entry was added 2026-03-27, so additions look slow ([API](https://api.cline.bot/v1/mcp/marketplace)). |
| Listing | A GitHub issue at cline/mcp-marketplace with a repo, a 400×400 logo, and proof that Cline can install the server from the README or `llms-install.md` ([README](https://raw.githubusercontent.com/cline/mcp-marketplace/main/README.md)). |
| Ranking | `downloadCount`, `githubStars`, `isRecommended`. |
| **Strale state** | **Not listed.** |
| Confidence | High |

## 16. Awesome lists (punkpeye)

| Field | Finding |
|---|---|
| Reach | `awesome-mcp-servers` has about 4,600 entries. Star count unknown, because GitHub API access is blocked in this session. |
| Listing | A PR. The scope says remote-only servers belong in `awesome-remote-mcp-servers`. There is an agent fast-track (append 🤖🤖🤖 to the PR title) ([CONTRIBUTING](https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/CONTRIBUTING.md)). |
| **Strale state** | **Not in punkpeye/awesome-mcp-servers, punkpeye/awesome-remote-mcp-servers, appcypher or wong2** (grep of the raw READMEs: 0 hits). |
| Confidence | High |

## 17. API marketplaces: RapidAPI, Postman, APIs.guru

| Venue | Finding | Strale state | Confidence |
|---|---|---|---|
| RapidAPI Hub | A legacy API marketplace with a paid-listing revenue share. Its "millions of developers" claim is undated ([profile](https://jobs.qumracapital.com/companies/rapidapi)). | Not found ([search](https://rapidapi.com/search/strale)) | Low |
| Postman API Network | Public workspaces. | Not found in the search page HTML (it is client-rendered, so this is inconclusive) | Low |
| APIs.guru | An OpenAPI directory of 2,529 APIs ([list.json](https://api.apis.guru/v2/list.json)). Listing is a GitHub PR with an OpenAPI spec. | Not listed | High |

## 18. LLM-readable surfaces (llms.txt)

**https://api.strale.io/llms.txt** is current. Its pitch is "Give your agent a new tool without opening another provider account". It also says:

- 298 tools, 25 countries;
- 11 free tools, listed by name, which matches `/v1/platform/facts`: `active_visible` 298 and the same 11 slugs ([facts](https://api.strale.io/v1/platform/facts));
- MCP, A2A, REST and x402 quick starts, with x402 "on eligible tools".

Issue: its GitHub link points to `github.com/petterlindstrom79/strale`. The canonical repo is `strale-io/strale`. I could not confirm whether the old link redirects.

**https://strale.dev/llms.txt** is stale. Specifically:

- It opens with "The trust layer of the agent economy… Independently tested API capabilities", a positioning superseded by DEC-20261023-B.
- It says "**All capabilities are available via x402**", which contradicts the api file's "eligible tools" and `/x402/catalog`.
- It still calls Strale a "capability marketplace".
- It lists only five SDKs/toolkits.
- It correctly says there is no numeric quality score, and it points to the dynamic file.

**Other well-knowns:**

- `/.well-known/mcp.json` and `/.well-known/ai-catalog.json` carry the new pitch and 298 tools. However, `mcp.json` reports `"version":"0.1.0"` and still advertises a "Payee Assurance" product.
- `strale.dev/.well-known/agent.json` still says "The trust layer for AI agents".

## 19. A2A agent card

[`https://api.strale.io/.well-known/agent-card.json`](https://api.strale.io/.well-known/agent-card.json) is identical to `agent.json` (228 KB). It contains:

- name "Strale", version 1.0.0, url `https://api.strale.io/a2a`;
- description: "Commercial capability marketplace for AI agents. 298+ capabilities… company data across 25 countries… Every call returns an audit record";
- auth schemes `apiKey` and `x402`;
- a `payments.x402` block with catalog and discovery links;
- **393 skills**, each a capability or solution, for example `sanctions-check` and `product-web3-assurance`.

The provider URL is `https://strale.io` rather than strale.dev. The card is fine, but there is no real A2A directory of consequence today. The DIRECTORY-MAP crawler list includes agent indexers (Waggle, agent-tools.cloud, Szerverbank), but none has shown evidence of meaningful traffic.

## 20. Strale's own usage signals (for context)

- npm `strale-mcp` monthly downloads were 308 in July, 669 in August, 223 in September, and 132 in October up to the 25th ([npm range API](https://api.npmjs.org/downloads/range/2026-07-01:2026-10-26/strale-mcp)). For scale, `@modelcontextprotocol/server-filesystem` had 1.33M in June ([npm](https://api.npmjs.org/downloads/point/last-month/@modelcontextprotocol/server-filesystem)). Much of the npm count is probably mirror and crawler noise.
- PyPI `straleio`: 17 in the last month ([pypistats](https://pypistats.org/api/packages/straleio/recent)).
- Smithery `useCount` 989 is the only venue-reported usage number that is more than trivial.
- PulseMCP shows 1 estimated visitor per week.

---

## What makes a tool get chosen: synthesis

1. **There are two kinds of venue, and they do different things.**
   - *Crawler directories* (Glama, mcp.so, PulseMCP, MCP Market, LobeHub, mcpbeat) auto-ingest from GitHub or the official registry. Together they hold 20k–115k entries and sort by downloads, stars, visitors or quality scores. They create **awareness among human builders browsing**. Strale is already in most of them, and the evidence so far is that they convert poorly: about 1,800 crawler visits a month produced one customer (DIRECTORY-MAP), and PulseMCP shows 1 visitor a week.
   - *Client-embedded catalogues* (Claude Connectors Directory, VS Code/GitHub registry, Cursor marketplace, Cline, Docker Toolkit, Windsurf) are where the install happens, in one click inside the tool the builder already uses.
2. **The Claude directory differs in kind from a crawler.** Its listings are eligible for **Suggested Connectors**, where Claude itself recommends a connector in the conversation when it fits the task, and ranking is usage-based ([docs](https://claude.com/docs/connectors/directory.md)). That is the only venue found where the *agent/model* surfaces the tool, not a human browsing a list. The open registry and crawler directories have no such in-flow placement. The VS Code registry is similar but weaker: enterprise "registry-only" policies make listing a precondition for being usable at all in locked-down orgs.
3. **The signals that recur are usage, liveness and tool-definition quality, not editorial copy.**
   - Usage: Smithery `useCount`, Claude's usage-based ranking, mcpbeat's 40 points on downloads, Cline `downloadCount`, PulseMCP visitors.
   - Liveness: mcpbeat pings every 15 minutes.
   - Tool-definition quality: Glama TDQS. The Claude directory requires annotations, and mcpbeat reads `tools/list`.
   - Stars matter on GitHub's registry and MCP Market.
   - Verified badges (Smithery: 193 of 20,764; Claude: Verified versus Community) are scarce and usage- or review-gated.
4. **Once an agent is connected, it chooses tools from the descriptions inside `tools/list`.** The directory blurb does not reach it. Strale exposes 9 meta-tools behind `strale_search`/`strale_execute`, so the agent picks the *meta-tool* from its description and then searches the catalogue. That makes tool titles, annotations and descriptions the highest-leverage copy Strale has.
5. **Evidence on which venue drives installs is thin.**
   - No independent study attributes installs by venue. Zuplo's "State of MCP" surveyed about 100 leaders, found most users have 2–7 servers configured, and does not break down discovery channels ([nordicapis](https://nordicapis.com/10-interesting-mcp-statistics/)).
   - The hard numbers are client-side: Cline downloads are dominated by official and developer-tool servers, and Context7 is #2. They show **concentration on a few well-known servers**.
   - Strale's own attribution (`discovery_hits` source derivation, PR #261) is the best available instrument and should be read before investing. I did not query it in this research.

## Concrete quick wins for Strale (ordered by value per effort)

1. **Fix the stale upstream sources**, because the directories copy them:
   - **GitHub repo description**: currently "Trust and quality infrastructure… 225+ quality-scored capabilities, SQS scoring, EU AI Act support". It feeds MCP Market, mcp.so and Glama.
   - **`server.json`**: bump to 0.2.8 with the new pitch and no counts or SQS, then **republish to the official registry**. The latest entry there is the April 0.2.4 "290+ quality-scored… 27 countries". PulseMCP, mcpbeat and GitHub ingest from it.
   - **`context7.json`**: new description, drop the three incident packages from `folders`, then trigger a re-index (last built 2026-03-31).
   - **`strale.dev/llms.txt`**: "all capabilities via x402", "trust layer". Also `strale.dev/.well-known/agent.json` and the "Payee Assurance" block in `mcp.json`.
2. **Edit the claimed listings in place.** On Smithery (`strale/agent-tools`), replace the SQS text, re-scan tools and decide whether to retire `strale_trust_profile`/`strale_methodology`. On Glama (already claimed), trigger a re-sync so the summary and tool descriptions refresh. The mcp.so and MCP Market pages need a resubmit or claim. *Submitting or editing third-party listings may count as a public act or an account action under CHARTER/DEC-20261027-A; check before doing it.*
3. **Add a `title` and `readOnlyHint`/`destructiveHint` to all 9 MCP tools.** For example, `strale_execute` spends money and gets `destructiveHint: false, readOnlyHint: false` plus an open-world hint; `strale_search` and `strale_ping` are read-only. This is a hard Claude-directory requirement, it improves Glama TDQS, and it helps any client show safe or unsafe affordances. It is a small code change in `packages/mcp-server/src/tools.ts` and the remote route.
4. **Make the remote server Claude-directory eligible.** Option A: OAuth 2.0 in front of the API key, which is the proper path for wallet-spending tools. Option B: a no-auth public mode, where search and free-tier tools work unauthenticated and a key or x402 is needed only for paid execution. The submission includes a **financial transactions** compliance acknowledgement, so read the Software Directory Policy on paid tool calls first ([policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)). Submitting needs a paid Claude plan and agreement to Anthropic's directory terms, which is legally binding for Moonlighter AB, so it is **Petter's call**. Once listed, every entry is eligible for in-chat Suggested Connectors, the only model-side discovery surface found.
5. **List in the curated client catalogues that take remote servers by PR or issue:**
   - Docker `docker/mcp-registry` (remote `server.yaml`);
   - Cline (issue plus `llms-install.md`);
   - `punkpeye/awesome-remote-mcp-servers` (PR);
   - a Cursor plugin bundling the remote MCP with a rules file (the repo already has `docs/ide-rules/strale-compliance.mdc`).

   GitHub's 648-server registry is curated from the official registry, so a clean official entry is the prerequisite.
6. **Measure before adding more venues.** Read `discovery_hits` by source for the last 60 days, along with Smithery's `useCount` trend, to see which venue produces calls and signups. The August conclusion still holds: fixing what ten existing venues display is worth more than an eleventh directory.
