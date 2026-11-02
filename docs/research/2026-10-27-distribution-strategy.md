---
doc_type: research
type: market
topic: distribution-strategy
question: How does Strale get agents and developers calling it, and paying, fastest and most cheaply over the next 90 days, given what it is today?
date: "2026-10-27"
status: current
sources:
  - docs/research/2026-10-27-distribution-strategy-sweeps/directories.md
  - docs/research/2026-10-27-distribution-strategy-sweeps/competitors.md
  - docs/research/2026-10-27-distribution-strategy-sweeps/frameworks.md
  - docs/research/2026-10-27-distribution-strategy-sweeps/payments.md
  - docs/research/2026-10-27-distribution-strategy-sweeps/integrations.md
  - docs/company/DISTRIBUTION-FINDINGS.md
  - docs/company/DIRECTORY-MAP.md
  - docs/company/GOALS.md
  - docs/company/CHARTER.md
  - docs/company/claims.yaml
  - docs/company/VOICE.md
  - docs/company/DECISION-QUEUE.md
  - docs/strategy/2026-08-12-attribution-design.md
  - docs/strategy/2026-08-12-platform-readiness-program.md
  - docs/strategy/2026-10-23-positioning-adoption.md
  - docs/strategy/2026-10-23-portfolio-plan.md
  - docs/programs/brand-website/MESSAGING-LEVELS.md
  - docs/x402-listing.md
  - apps/api/src/lib/attribution.ts
  - apps/api/src/lib/discovery-source.ts
  - apps/api/scripts/attribution-rollup.ts
  - server.json
  - context7.json
  - smithery.yaml
  - packages/mcp-server/package.json
  - https://api.strale.io/v1/platform/facts
  - https://api.strale.io/x402/catalog
  - https://api.strale.io/llms.txt
  - https://strale.dev/llms.txt
  - https://registry.modelcontextprotocol.io/v0/servers?search=strale
  - https://registry.smithery.ai/servers?q=strale
  - https://glama.ai/mcp/servers/@strale-io/strale
  - https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources
  - https://docs.cdp.coinbase.com/x402/seller/get-discovered.md
  - https://claude.com/docs/connectors/directory.md
  - https://claude.com/docs/connectors/building/submission.md
  - https://ai-sdk.dev/tools-registry
  - https://docs.zapier.com/platform/publish/integration-publishing-requirements
  - https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines
  - https://www.clay.com/partners/integrations
  - https://docs.stripe.com/directory.md
  - https://api.npmjs.org/downloads/range/2026-06-01:2026-10-26/strale-mcp
  - https://pypistats.org/api/packages/langchain-strale/recent
decisions:
  - DEC-20261023-B
  - DEC-20260815-A
  - DEC-20260422-A
  - DEC-20261027-A
  - DEC-20260812-A
  - DEC-20260905-A
  - DEC-20261023-A
  - DEC-20260822-A
---

# Distribution strategy: how Strale gets chosen, called and paid (2026-10-27)

Research, not a decision. It changes no decision record, no code and no
listing. Every outward step in it is a recommendation, marked with who may take
it. Times are Swedish local time. Confidence on major claims: **high** (measured
or read from a primary source today), **moderate** (primary source needing
interpretation, or a reputable secondary), **low** (single secondary source or
inference).

Evidence for this file lives in five sweep files written by read-only research
agents on 2026-10-27, kept alongside it in
`2026-10-27-distribution-strategy-sweeps/`:
[directories](2026-10-27-distribution-strategy-sweeps/directories.md),
[competitors](2026-10-27-distribution-strategy-sweeps/competitors.md),
[frameworks](2026-10-27-distribution-strategy-sweeps/frameworks.md),
[payments](2026-10-27-distribution-strategy-sweeps/payments.md),
[integrations](2026-10-27-distribution-strategy-sweeps/integrations.md).
Those files carry the per-claim links; this file cites them by section.

No production database was read. Every usage figure here comes from a public
venue (npm, PyPI, Smithery, the Coinbase Bazaar API, x402scan) or from repo
documents that say where they came from. The latest revenue measurement used is
GOALS.md's reading of the week of 2026-10-19, taken on 2026-10-26.

---

## 1. One page for Petter

**The verdict.** Strale is not short of listings. It is badly described in the
places it already appears, it is missing from the few places where an agent or
its builder installs a tool in one click, and it has no step built into the
recurring work where its best data (company records, VAT, sanctions) is
actually needed. Fix the descriptions first, because it costs almost nothing
and three of our published integrations are actively broken. Then put effort into four
channels where a tool gets *picked*, not just seen. Spend no money on
campaigns or content until our own tracking can say which channel produced a
paying customer.

**What the evidence says (each detailed below):**

- **We are listed almost everywhere that crawls, and almost every listing is
  wrong.** The official MCP registry, Smithery, Glama, mcp.so, MCP Market,
  PulseMCP, Context7, x402scan and our own GitHub page still describe the
  quality-score system we deleted in May, and old tool counts (250+, 271, 290+,
  27 countries). They copy it from our own stale files. *(High.)*
- **Three published integrations call API routes that no longer exist**
  (Pipedream, Activepieces, our n8n node), and an open Langflow PR has no tests.
  This is the same kind of embarrassment as the pydantic-ai incident and is the
  first thing to fix. *(High.)*
- **Narrow beats broad.** On Smithery a single-country UK due-diligence server
  shows about 61,000 uses; Strale's broad server shows 989. *(High that the
  numbers are as reported; moderate on what "use" measures.)*
- **The agent-payments market is real but small and concentrated.** Coinbase's
  Bazaar index shows about 926,000 settled calls in 30 days across 1,324
  sellers; the top ten take 72%. Demand for official company-registry data over
  x402 is about 2,000 calls a month across the whole market, against roughly
  20,000 each for enrichment, search and scraping. *(High on the arithmetic;
  the index counts only payments settled through Coinbase.)*
- **Company data is needed inside business workflows, not in an agent's
  wallet.** The jobs that repeat on their own — a VAT check on every invoice, a
  check on every new supplier, a monthly sanctions re-check — happen in Zapier,
  n8n, spreadsheets and Clay. Strale has no proper step in any of them today.
  *(Moderate.)*

**The bets, in order:**

1. **Fix the shop window (week 1–2, ~€0).** Rewrite every description at its
   source, repair the three broken integrations, and close the three tracking
   gaps (§5). Without the tracking, none of the bets below can be judged.
2. **Coinbase's x402 marketplace.** x402 is the rail nearly all revenue
   arrives on; which venue led those buyers there is not measured (§5). Add the
   metadata Coinbase now ranks on, then ask for the hand-picked "featured"
   tier. Strale already ranks #1 for "PEP check";
   it is absent for "email validation" although it sells it.
3. **Claude's connector directory.** The only place found where the *model
   itself* suggests a tool mid-conversation. Needs small code changes and
   a sign-in path for paid tools; submitting is your call.
4. **Built-in steps for recurring business jobs: Zapier first, then a rebuilt
   n8n node, and a Clay template.** This is where the flagship data turns
   one-off calls into monthly ones.
5. **Narrow, named entry points** ("UK company check", "EU VAT check", "web
   page reader") on the MCP directories, tested against our broad listing.

One native framework package is worth building, for the Vercel AI SDK, because
it comes with a curated listing next to our direct peers. Every other major
framework already reaches us through our MCP server.

**Stop or skip:** content marketing and launch posts (no evidence they move
this buyer; revisit when attribution shows a human-read channel converting);
new crawler directories beyond fixing the ones we're in; new wrapper packages
for OpenAI Agents, Pydantic AI, Google ADK, CrewAI or Semantic Kernel (MCP
covers them, and two of those are where we were burned); RapidAPI; Cloudflare's
paywall (US sellers only); Visa, Mastercard, Google AP2 and ChatGPT checkout
(no slot for per-call tools); paid boosts. Deprecate `strale-semantic-kernel`:
it is built on an unofficial community port and its README does not say so.

**Cost.** About €0 external spend in the 90 days. The work is Claude
engineering time: my estimate is 15–25 sessions across the quarter (low
confidence; the hygiene and metadata work is two or three, while the Zapier
app, the n8n rebuild, sign-in for the Claude directory and the AI SDK package
are likely two to four each). Nothing in the plan needs money beyond the
€50/week envelope. Submitting to the Claude directory needs a paid Claude plan;
I have not checked whether the company account has one.

**What to aim for by day 90.** The goal that binds today is GOALS.md's M1: at
least five distinct paying customers a week, none above 60% of revenue. The
week of 2026-10-19 had seven payers and the largest at 79.8%. The plan's
target: M1's concentration bar met, with at least two of the new weekly
payers traceable to a channel this plan opened.

**What needs you:** see §9. Nine items, each a yes/no.

### The better question behind the one asked

"How do we get distribution?" hides two sharper questions:

1. **Which channel produced the paying customers we already have?** We don't
   know, and the design written in August to answer it is only half used: our
   own submitted links carry no source tag, three of our packages send no
   identifier, and signups record no source (§5). Until that is fixed, any
   channel spend is a guess. *(High.)*
2. **Where does the flagship's buyer already work?** DEC-20261023-B makes
   official company and compliance data the premium part of the library. The
   x402 market barely buys it (≈2,000 calls a month market-wide). The people who
   need it at a decision point (a supplier, an invoice, a new account) work in
   automation tools, spreadsheets and enrichment tables. So the flagship's
   distribution is *integrations*, and the broad library's distribution is
   *agent marketplaces*. They are two channel plans, not one. *(Moderate.)*

---

## 2. Where Strale stands today

| Signal | Value (2026-10-27) | Source | Confidence |
|---|---|---|---|
| Visible tools / bundles | 298 / 95 | `/v1/platform/facts` | high |
| Tools and bundles payable over x402 | 275 / 88 | `/x402/catalog` | high |
| Company-data countries | 25 | `/v1/platform/facts` | high |
| `strale-mcp` npm downloads by month | Jun 306 · Jul 308 · Aug 669 · Sep 223 · Oct 132 (to the 25th) | npm range API | high (counts); low (as users — mirrors and CI included) |
| Framework packages, PyPI last month | langchain-strale 21 · crewai-strale 26 · composio-strale 11 · straleio 17 | pypistats | high (counts); the **yanked** packages get similar numbers, so most of this is bots |
| GitHub | 5 stars, 1 fork | GitHub API | high |
| Smithery `strale/agent-tools` | 989 uses, unverified, description still about SQS | Smithery registry API | high |
| Official MCP registry | latest entry v0.2.4 (April), "290+ quality-scored… 27 countries"; npm is at 0.2.8; repo `server.json` at 0.2.3 | registry API | high |
| Glama | rated A, score 4.4, but summary describes SQS | glama.ai | high |
| Coinbase Bazaar | 163 Strale resources (135 tools) of 84,636 in the index; most have **one** paying wallet in 30 days | CDP discovery API | high |
| x402scan | #23 by transactions, 16 buyers, stale "trust layer" description | x402scan.com | high (rank); moderate (window read from page data) |
| Revenue and concentration | week of 2026-10-19: €72.61 from 7 payers; largest 79.8% (down from 94.7%); four bought on more than one day; one registered API-key buyer at €12.27 over 6 days, first purchase in the window `uk-company-data` | `GOALS.md` (measured 2026-10-26) | moderate (not re-measured here) |
| Crawler visits per month | ~1,800 from ten directories, one customer | `DIRECTORY-MAP.md` (August) | moderate (dated) |

**Read:** we are visible but under-converting, and the description problem is
self-inflicted. Most revenue still comes from one agent wallet buying simple
primitives over x402, but the week of 2026-10-19 showed the first measurable
second recurring buyer: a registered API-key account whose first purchase was
a company-data lookup. That is one data point, not a trend, and it is the
first flagship purchase arriving by API key rather than x402.

**One live risk shapes the copy.** Eight tools that resell Google results
(including `google-search`, which the main customer buys) run under a terms
exception that ends 2026-11-09 unless Serper confirms resale rights
(DQ-39). Listings in this plan therefore say "web search" generically and do
not headline the search tools.

---

## 3. What makes a tool get chosen (synthesis)

1. **Two kinds of venue.** *Crawler directories* (Glama, mcp.so, PulseMCP, MCP
   Market, LobeHub, the official registry) create awareness among people
   browsing; they convert poorly for us (1 customer from ~1,800 visits a month;
   PulseMCP shows 1 visitor a week). *Client catalogues* (Claude's directory,
   the GitHub/VS Code registry, Cursor, Cline, Docker) are where an install
   happens in one click. We are in many of the first and none of the second.
   *(High.)*
2. **Defaults win.** Tavily is in LangChain's quickstart; Exa is OpenRouter's
   fallback search; seven peers ship as named tools in `crewai-tools`. Their
   PyPI downloads (Tavily 9.6M, Exa 5.4M, Firecrawl 5.3M a month) follow from
   that. No company-registry or sanctions tool is in `crewai-tools` (108 tools)
   or LangChain's category tables. *(High.)*
3. **Rankings use usage, liveness and tool-definition quality, not copy.**
   Smithery `useCount`, Claude's usage-based ranking, mcpbeat's handshake and
   download score, Glama's tool-definition score, Coinbase's unique-payer
   weighting. A good description is necessary, not sufficient. *(High.)*
4. **Once connected, an agent chooses from the tool descriptions in the MCP
   `tools/list`, not the directory blurb.** Strale exposes nine meta-tools; the
   agent picks `strale_search` from its description and searches from there.
   Those nine titles and descriptions are the most-read copy we have, and none
   carries a `title` or safety annotation today. *(High on the facts; moderate
   on the weight.)*
5. **Narrow, named servers beat broad ones in MCP directories** (UK
   due-diligence about 61,000 vs Strale 989 on Smithery). *(Moderate: one strong
   example, consistent with "the X API" positioning of every winner.)*
6. **Free tiers that reset monthly and are stated as a number** (Tavily,
   Firecrawl, Browserbase ≈1,000 calls; Exa $10; Apify $5). Ours is
   "10 a day per IP on 11 tools", which nobody quotes because it fits no
   pricing column. In August only two outside callers used it in 90 days.
   *(High on peers; high on our August figure.)*
7. **Intermediaries carry data vendors.** Resellers and routers (StableEnrich,
   Delegate, Clay, OpenRouter) capture most x402 payers. *(Moderate.)*

---

## 4. Channel scorecard

Scores 1–5 (5 = best). **Reach** = reach to our real buyers (agent wallets for
the library; ops and finance automation for the flagship). **Cost** = 5 means
cheapest. **Speed** = time to a first measurable result. **Fit** = fit with
DEC-20261023-B. Evidence links are in the sweep sections named.

| Channel | Reach | Cost | Speed | Fit | Our state today | Verdict | Evidence | Conf. |
|---|---|---|---|---|---|---|---|---|
| Fix our own source texts (GitHub, `server.json`, `context7.json`, npm, llms.txt, agent card) | 3 | 5 | 5 | 5 | stale everywhere | **Do now** | directories §1–7, §18 | high |
| Repair broken integrations (Pipedream, Activepieces, n8n, Langflow PR) | 2 | 5 | 5 | 5 | calling dead routes | **Do now** | integrations §0 | high |
| Coinbase Bazaar metadata + search | 4 | 5 | 4 | 5 | listed, unenriched, absent from most searches | **Bet** | payments §1.4–1.5 | high |
| Bazaar curated "featured" tier | 4 | 5 | 2 | 5 | not featured; no form exists | **Bet** (after metadata) | payments §1.3 | moderate |
| x402scan / 402 Index registration and claims (AgentCash inherits from x402scan) | 3 | 5 | 4 | 5 | listed, stale, unverified | **Do** | payments §3 | high |
| Claude connector directory | 4 | 4 | 3 | 5 | not eligible (no titles/annotations, no OAuth) | **Bet** | directories §11 | high (rules); unknown (reach) |
| Zapier public integration | 4 | 4 | 3 | 5 | none | **Bet** | integrations §1a | high (rules); moderate (reach) |
| n8n node rebuilt to verified standard | 3 | 4 | 2 | 5 | unverified node calling a dead route | **Bet** (may be refused) | integrations §1a | high (rules) |
| Clay HTTP template, later partner programme | 3 | 5 | 4 | 4 | none | **Do template**; partner = your call | integrations §2 | moderate |
| Narrow named MCP entry points | 3 | 4 | 4 | 4 | one broad server | **Test** | competitors §9 | moderate |
| Vercel AI SDK package + Tools Registry | 3 | 4 | 3 | 4 | none | **Build one** | frameworks §2–3 | high |
| Refresh `langchain-strale` (only native package with a live LangChain listing) | 2 | 4 | 4 | 4 | stale, untested on langchain-core 1.x | **Maintain** | frameworks §1 | high |
| Client catalogues by PR (Docker, Cline, awesome-remote-mcp-servers, Cursor plugin) | 2 | 5 | 3 | 4 | absent | **Do, cheaply** | directories §12–16 | moderate |
| Stripe Directory (+ MPP rail) | 2 | 3 | 2 | 4 | absent | Later; your call | payments §5 | high (process) |
| Google Sheets custom functions | 3 | 3 | 2 | 5 | none | Second wave | integrations §2 | moderate |
| Router / reseller supply (Delegate, StableEnrich, Apify Actors) | 3 | 4 | 2 | 4 | absent as a supply listing | Your call (terms) | competitors §10–12 | moderate |
| Crawler directories we are not in (LobeHub etc.) | 1 | 5 | 4 | 3 | absent | Skip until conversion shows | directories §9 | moderate |
| Native packages for OpenAI Agents, Pydantic AI, Google ADK, CrewAI, Mastra, LlamaIndex | 1 | 3 | 3 | 2 | three yanked; CrewAI stale | **Skip** (MCP covers) | frameworks §2 | high |
| Content, SEO for "X API" queries, launch posts | 2 | 3 | 1 | 4 | none | **Skip for 90 days** | DISTRIBUTION-FINDINGS (human funnel ≈€0.10/signup over six months) | moderate |
| Cloudflare Monetization Gateway | — | — | — | 4 | n/a | **Not available** (US-only beta) | payments §5 | high |
| Visa / Mastercard / AP2 / ACP / PayPal agent commerce | 1 | — | — | 2 | n/a | **Skip** (no per-call slot) | payments §5 | moderate |
| ChatGPT Apps directory | 2 | 3 | 2 | 2 | n/a | **Skip** (no API keys, no digital-service sales) | integrations §1a | high |
| RapidAPI | 1 | 3 | 3 | 2 | absent | **Skip** | competitors §8 | low–moderate |
| HubSpot, Salesforce, Xero, QuickBooks marketplaces | 2 | 1 | 1 | 5 | none | Later (OAuth + install minimums) | integrations §2 | high (rules) |
| OEM / white-label supply | 3 | 2 | 1 | 5 | none; no SOC 2 | Later; your call | integrations §3 | moderate |

---

## 5. Attribution and measurement

**Verdict: most of the instrument exists; three gaps stop it answering "which
channel produced a paying call". Close them in week 1, before any channel
work is judged.** *(High confidence on what the code does; unknown what it
currently reports, because no production data was read.)*

### What already exists (read from code)

| Signal | Where | Answers |
|---|---|---|
| `?src=` tag on discovery URLs **and on paid x402 calls** | `x402-gateway-v2.ts` passes `c.req.query("src")` to `extractClientMeta` at every capture point; `/v1/do` and the bundle route too | exact channel, when the link carries a tag |
| Referer host and known crawler user agents → venue | `lib/discovery-source.ts` `VENUE_SIGNATURES` | which directory indexed or linked us |
| `X-Strale-Client: <pkg>/<version>` | sent by `strale-mcp`, the TypeScript SDK and the Python SDK | which of our packages made the call |
| MCP `clientInfo` and funnel (`/mcp:tools/list`, `/mcp:tools/call:{tool}`, `/mcp:reject:*`) | `routes/mcp.ts` → `discovery_hits.endpoint` | which MCP client, and where agents drop off |
| Stable keyed hash of the x402 payer | `transactions.x402_payer_hash` | distinct and repeat payers, with no raw identity in analytics |
| Weekly first-touch report | `apps/api/scripts/attribution-rollup.ts` | new paying wallets by first-touch source; unattributed share |

### The gaps

1. **Our own links are not tagged.** The August design said every submission
   uses `?src=<venue>`. `server.json`'s remote URL, `smithery.yaml`, the READMEs
   and the directory copy all use bare URLs. Fix: tag every URL we control.
2. **Five integration surfaces send no identifier.** `langchain-strale` and
   `crewai-strale` send `User-Agent: <pkg>/0.1.0` (hard-coded, and not
   `X-Strale-Client`); `composio-strale`, `strale-semantic-kernel` and the
   TypeScript LangChain package send nothing; the Pipedream, Activepieces and
   n8n integrations live in other repos and send whatever their HTTP client
   sends. Fix: add `X-Strale-Client` (e.g. `zapier-strale/1.0.0`,
   `n8n-nodes-strale/0.2.0`) to every integration on its next honest release,
   so each integration's calls and installs count separately.
3. **Signups record no source.** `users` has `signup_ip_hash` but no source or
   referrer. Fix: one nullable `signup_src` column filled from `src`, UTM or
   referrer host at signup. One migration plus one capture point;
   DEC-20260504-C deploy verification applies.

### Conventions

- **`src` values** (lowercase venue slug): `mcp-registry`, `smithery`, `glama`,
  `pulsemcp`, `mcpso`, `mcpmarket`, `docker-mcp`, `cline`, `claude-dir`,
  `bazaar`, `x402scan`, `agentcash`, `402index`, `context7`, `gh-readme`,
  `npm-readme`, `pypi-readme`, `llms-txt`, `ai-sdk-registry`, `zapier`, `n8n`,
  `pipedream`, `activepieces`, `clay-template`, `sheets`, `bench-datacircle`,
  and `mcp-<server>` for each narrow entry point. Each new venue also gets a
  needle in `VENUE_SIGNATURES`.
- **UTM only on links to the human website** (`utm_source=<venue>&utm_medium=listing|email|post&utm_campaign=<experiment id>`), never on API URLs.
- **Venue counters** (Smithery uses, npm/PyPI downloads, Zapier and n8n
  install counts where shown, Glama score, Bazaar search positions) are read
  weekly and recorded with a date. Download counts are an upper bound, not
  users.
- **The decision metric for every channel bet:** *new distinct paying payers
  per week by first-touch source* (x402 payer hash or API-key user), plus
  *unattributed share*: the share of new payers whose first paid call has no
  source tag, client header, referer or matching discovery hit. This is not
  GOALS.md's "€0 unattributed", which means revenue tied to *a payer*; this one
  ties a payer to *a channel*. The August design's target of under 50% is
  unlikely for x402 payers, who arrive without tags; the realistic target is
  that every channel this plan opens is countable, with the overall share
  reported weekly. This is the
  same unit as the goal that binds today: GOALS.md's M1 needs five distinct
  payers with none above 60%. Calls and revenue by source come second; crawler
  hits never count as a result.

### Customer-data boundary

All of this answers "which venue", never "which person" (CHARTER.md,
DEC-20260815-A). It may not be used to name, contact or profile a payer; no
outreach is derived from it; IP hashes stay daily-salted; content is still
cleared at 90 days. A source tag on a signup is a channel label, not a lead.

---

## 6. Listing and description quality

Drafts are in
[`docs/company/drafts/distribution/01-listing-texts.md`](../company/drafts/distribution/01-listing-texts.md)
and, for integrations,
[`04-integration-listings.md`](../company/drafts/distribution/04-integration-listings.md).
Rules they follow:

- Lead with the job (DEC-20260905-A, DEC-20261023-B); flagship second, never
  the headline; never limited to Europe.
- **No typed counts** in static texts; point to `/v1/platform/facts`. Three
  surfaces carry wrong counts today because someone typed them.
- x402 copy always says "eligible tools" (`all-x402-coverage` is forbidden;
  275 of 298 tools are on x402). `no-account-required-x402` is
  `needs_evidence` and is used only scoped to x402.
- Avoided: verified, trusted, trust layer, quality-scored, SQS, independently
  tested, compliant, most popular, SLA, average latency.
- "Official business registers" is treated as **needs_evidence** until the row
  MESSAGING-LEVELS.md proof gap 4 asks for exists (several countries, US among
  them per `/v1/platform/facts`, come through vendors that wrap the register).

**Where the stale text lives, and the fix (all narrowing, so Claude's to do
under DEC-20260822-A part 2, except where noted):**

| Surface | Today | Fix |
|---|---|---|
| GitHub repo description | "Trust and quality infrastructure… 225+ quality-scored capabilities, SQS scoring, EU AI Act support" | draft A–C; several directories copy it |
| `server.json` → official registry | v0.2.3 in repo, v0.2.4 live: "290+ quality-scored… 27 countries" | draft A; bump to the npm version; republish (our own namespace) |
| `strale-mcp` package description and README | "pre-flight check any paid API… 250+"; "81 solutions" | draft B, on the next release |
| `context7.json` | "Trust layer… 250+ verified"; lists the three yanked packages | draft D; re-index |
| `strale.dev/llms.txt` | "trust layer", "All capabilities are available via x402" | draft F (strale-frontend maintenance edit) |
| A2A agent card | typed "298+"; "Every call returns an audit record" | draft E |
| `/.well-known/mcp.json` | version 0.1.0; advertises "Payee Assurance" | remove the retired product; read version from the package |
| `packages/skill/SKILL.md` | describes the deleted SQS engine | rewrite, then serve at a stable URL (portfolio Phase 3 item 1) |
| `docs/x402-listing.md` | "independently quality-tested", "no minimum", "23 countries" | replace with draft G |
| MCP tool definitions (nine tools) | no `title`, no `readOnlyHint`/`destructiveHint`; two tools (`strale_trust_profile`, `strale_methodology`) still named for the retired system | add titles and annotations; decide whether to retire or rename those two |
| x402 402 challenge | no `serviceName`/`tags`/`iconUrl`; placeholder example inputs (`example_email`); no output example; catalog lists v1 paths CDP now rejects | technical fix (payments §0 rows 1–2) |
| Third-party listings (Smithery, Glama, mcp.so, MCP Market, PulseMCP, x402scan, 402 Index) | stale SQS copy | most re-crawl from the sources above; Smithery and 402 Index need an edit or claim from our account (delegated under DEC-20261027-A as a free account action, with the text checked against `claims.yaml`) |

---

## 7. Integrations: how Strale gets built into recurring work

This is the flagship's distribution channel. A Strale step inside a
customer's own workflow fires on events the customer already has (a new
supplier, a new invoice, a new account) or on a schedule, so calls follow
their business volume instead of a developer's curiosity. *(Moderate: the
mechanism is standard; Strale has no data of its own on it yet.)*

### 7.1 First: what we already have is broken

| Surface | Problem | Fix | Conf. |
|---|---|---|---|
| Pipedream app `strale` | calls `/v1/quality/{slug}` (returns 404 since May); description "290+ quality-tested" | upstream PR: remove the method, typed actions, new copy | high |
| Activepieces piece 0.2.0 | "Trust Profile" calls `/v1/internal/trust/…` (401); copy "271 capabilities", "quality score (SQS)" | upstream PR | high |
| `n8n-nodes-strale` 0.1.4 (npm) | calls `/v1/quality/`; "271 verified… quality scores" | rebuild (7.3) or deprecate | high |
| Langflow PR #12678 | six months without maintainer action; no tests | close it [C]: it is our own PR, closing is reversible, and no decision requires Petter's approval for it; MCP Tools covers Langflow | high |
| Flowise PR #6209 | repository archived | record as dead | high |

This is the DEC-20260422-A failure class: a published integration that does
not do what it says. It goes first, before anything new.

### 7.2 Platforms

| Platform | What a native integration takes | Listing and review | Billable per call? | Effort | What "real, not hollow" means there | Verdict | Conf. |
|---|---|---|---|---|---|---|---|
| **Zapier** | `zapier-platform` CLI app: actions, searches; API-key auth supported | Owned by the service's company; launched product; test account; live test Zaps; first contact "1 week or less", reports of 10–28 days | Yes, user's own key; no x402 | M | typed actions per job (Look up company, Check EU VAT, Screen a name, Check an invoice issuer) and searches; `zapier test` with recorded fixtures; not one free-text "execute any slug" box | **First** (listing positioning: §9 item 8) | high (rules); moderate (that public actions then reach agents through Zapier MCP) |
| **n8n** | TypeScript node on `n8n-workflow` types; credentials class | Unverified: npm. Verified: no runtime deps, no env access, one service per package, MIT, scanner pass, GitHub-Action publish with provenance; "proxy layer" packages generally don't qualify | Yes; x402 impractical | S–M | fixed operations, `NodeOperationError`, unit tests on n8n mocks, scanner pass | **Second** (expect a possible "proxy" refusal; fall back to unverified) | high (rules) |
| **Clay** | (a) HTTP API enrichment column with the user's key; (b) Integrations Partner Program | (a) none; (b) 30–60 days at Clay's discretion | Yes (BYOK) | S / M | (a) a published template whose columns map to real output fields, tested end-to-end on a sample table | **Template now; partner application = your call** | high/moderate |
| **Claude connectors + Claude plugin with our skill** | annotated remote MCP; OAuth 2.0 for paid tools or no-auth for public | developer portal; Community listing by default; usage-ranked; Suggested Connectors | Yes once OAuth maps to a Strale account | S (free tools) → M (OAuth) | every tool annotated and tested as a custom connector; skill calls real tools and claims no count | **Bet** (§8 D4) | high (rules) |
| **Google Sheets** custom functions (`=STRALE_VAT()`, `=STRALE_COMPANY()`, `=STRALE_SCREEN()`) | Apps Script `UrlFetchApp`, user-stored key; Workspace Marketplace | OAuth-scope verification ~24–72 h | Yes | M | functions return real fields; tests with mocked `UrlFetchApp` | **Second wave** | moderate |
| Pipedream / Activepieces | already listed | upstream PR | Yes | S | typed actions with annotations / `createAction` | **Repair only** | high |
| Make, Power Automate | JSON app / OpenAPI connector | QA review; Microsoft ~15 business days, Premium tier | Yes | M | reuse the Zapier action design | **After Zapier** | high |
| Gumloop, Langflow, Dify, Flowise, Relevance AI | consume remote MCP | — | — | S (docs only) | the MCP server is the integration | **Docs page only** | moderate |
| ChatGPT apps | remote MCP, OAuth 2.1 or no auth; no API keys; no selling digital services; pass-through apps refused | — | No | — | — | **Skip** | high |
| Gemini Enterprise agent gallery | free or flat subscription pricing only | Partner Network + Marketplace agreement | No | L | — | **Skip** | moderate |

### 7.3 Business systems where the data is needed at the decision

| Recurring job | Where it happens | Strale tools | Route for us | Conf. |
|---|---|---|---|---|
| Check every new supplier before first payment | AP inbox, ERP vendor form, a sheet | `company-status-check`, country company-data, `vat-validate`, `sanctions-check` / KYB bundles | Zapier / n8n / Sheets steps; Fortnox and Xero apps later | moderate |
| VAT check on every inbound invoice | invoice parser → AP | `vat-validate`, `iban-validate` (format only), `invoice-verify-*` bundles | Zapier / n8n step after the parser | moderate |
| Monthly re-screening of all counterparties | scheduler over a list | `sanctions-check`, `pep-check`, `company-status-check` | n8n Cron, Zapier Schedule, Sheets refresh | moderate |
| Enrich a CRM account at creation | HubSpot, Pipedrive, Clay | company-data by country | Clay template now; CRM apps later | moderate |

HubSpot and Xero need OAuth and at least three outside installs before
listing; Salesforce, QuickBooks, NetSuite, Coupa and Ariba are enterprise
programmes. All are later. Persona's marketplace, Fortnox's partner programme
and Clay's partner programme involve agreements, so they are your decisions.

### 7.4 Embedding patterns and what Strale lacks

| Pattern | Supported today? | Recommended engineering, ranked |
|---|---|---|
| Typed, job-named actions per platform | no (generic "execute slug" everywhere) | 1. Define one shared set of five job operations (company lookup, company status, VAT, sanctions/PEP, invoice-issuer check) with fixed inputs and outputs; reuse it across Zapier, n8n, Sheets, Clay and the narrow MCP servers |
| Bundles (one call, several checks) | **yes** — 95 solutions incl. KYB and invoice-verify per country | expose them as the "verify supplier" and "verify invoice" actions |
| Status primitive for re-checks | **yes** — `company-status-check` | make it the core of the monthly re-check template |
| Batch calls (many inputs, one order) | no — planned, portfolio plan Phase 3 item 5 | 2. Build batch; monthly re-screening of a list is the main user, and BigQuery remote functions send rows in batches |
| Scheduled re-checks run by Strale | no | 3. Not needed for 90 days: platforms' own schedulers cover it |
| Change alerts / webhooks to the customer | no (the webhook route is Stripe's) | 4. A "watch this company" endpoint that calls back on a status change. Build only after re-check templates show recurring use |
| Templates and starter workflows to copy | no | 5. One template per job per platform (Zapier, n8n, Clay, Sheets), linked from the tool pages |
| SDK snippets in framework docs and cookbooks | partly (LangChain listing) | 6. MCP snippets on our own docs for each MCP-capable framework; AI SDK package (§8 D6) |

### 7.5 Partnership and embed (OEM) deals

Who could put Strale behind their own agent product: KYB and onboarding agent
startups, decisioning platforms, procurement and AP agents, and tool platforms
that already redistribute us (Composio, Pipedream Connect, Activepieces' MCP
servers). What they typically need, and where we stand:

| Requirement | Strale today |
|---|---|
| SOC 2 Type II or ISO 27001 | none; `soc2-certified` is a forbidden claim. The main blocker for regulated buyers |
| DPA, sub-processor list | DPA referenced; sub-processors include Dilisense and the registries |
| SLA | none published (and `sla-commitment` is forbidden until one exists) |
| Provenance and audit trail | strong: source and fetch time per answer, retrievable call records for API-key calls |
| Invoicing, volume pricing, redistribution rights | prepaid wallet only; redistribution depends on upstream terms (DEC-20261023-A) |

**Every OEM or partner agreement is legally binding on Moonlighter AB and is
your decision.** Recommendation: none in the next 90 days; revisit when an
integration shows recurring calls, which is the evidence an OEM partner would
ask for.

### 7.6 Hollow-integration guard (DEC-20260422-A, per platform)

| Platform | Must contain | Must not |
|---|---|---|
| Zapier | `zapier-platform-core` app with typed actions/searches, auth test, `zapier test` suite with fixtures | a single "run any capability" action |
| n8n | `INodeType` implementation, credentials class, unit tests with `n8n-workflow` mocks, scanner pass | runtime dependencies, env access, a generic proxy node |
| Clay | template whose columns map to documented output fields, tested on a sample table | a template that only forwards raw JSON |
| Claude connector / plugin | annotated tools; skill that calls them; tested as a custom connector | a skill describing features the server lacks |
| Google Sheets | custom functions returning named fields; tests with mocked `UrlFetchApp` | a function that returns unparsed JSON |
| Vercel AI SDK | `tool()` from `ai` with schemas; offline test driving a mock model through a tool call | a package that does not import `ai` |
| Pipedream / Activepieces | the platform's component or piece primitives with annotations | calls to routes that do not exist (today's state) |

`node apps/api/scripts/check-framework-packages.mjs` covers only in-repo
packages and only checks that the framework is imported. It should also cover
`packages/langchain` (TypeScript) and fail a package whose only tests skip
without a live key. *(High.)*

---

## 8. 90-day plan: small, measurable experiments

Ids are **D0–D10** ("distribution") so they do not collide with GOALS.md's
"Active experiments (M1)" E1–E4. GOALS E1 (advertise x402 when MCP refuses a
call) and E2 (funnel instrumentation) sit next to D0 and are read in the same
weekly rollup.

Owners: **[C]** engineering a Claude session can do; **[D]** delegated
no-spend action under DEC-20261027-A (free account, click-through terms, an
email to a directory or registry about access, logged in `OUTBOX.yaml`);
**[P]** Petter only: spend beyond the envelope, signed agreements, public
posts, CAPTCHAs, and the one-way public acts and pricing the charter reserves
("What still needs Petter", items 3 and 4). A step marked "[C] build, publish
per §9 item N" is built by a session and published only once Petter has
answered that item. Every package publish runs the Distribution PR Integrity
Protocol in full.

Metric unit everywhere unless stated: **new distinct paying payers per week by
first-touch source** ("payers").

| # | Weeks | Experiment | Hypothesis | Metric | Success | Kill | Steps and owners |
|---|---|---|---|---|---|---|---|
| **D0** | 1–2 | Close the three attribution gaps | — (prerequisite: without it no channel can be judged) | every channel this plan opens carries a tag or client header; unattributed share of new payers reported weekly | all new surfaces countable by day 30 | — | tag our URLs [C]; `X-Strale-Client` in packages on their next release [C, publish per §9 item 7]; `signup_src` migration with deploy verification [C] |
| **D1** | 1–2 | Rewrite every source text and repair broken integrations | Hygiene, not an experiment: stale and broken listings are a standing defect (LESSONS F6, DEC-20260422-A) | Smithery uses per week and directory-attributed tool calls, recorded as a baseline for D7 | done when no source text or integration carries a retired claim or calls a removed route | — | source texts and tool annotations [C]; official registry republish [C, publish per §9 item 7]; Pipedream and Activepieces upstream PRs [C, after preflight]; Smithery and 402 Index edits and claims [D]; strale.dev llms.txt [C] |
| **D2** | 2–4 | x402 metadata for Coinbase ranking | Strale is missing from Bazaar search because of missing metadata, not missing demand | Strale position in the top 20 for 12 fixed queries (payments sweep §1.4); distinct x402 payers | top 20 in ≥6 of 12 queries within 21 days of deploy; ≥3 new x402 payers in 60 days | no search movement 30 days after deploy → stop metadata work | `serviceName`/`tags`/`iconUrl`, output example, real example inputs, v2 paths in the catalog, `x-guidance` in OpenAPI [C]; x402scan registration [D] signed with a dedicated zero-balance wallet whose key lives in Bitwarden, never the receiving wallet |
| **D3** | 4–6 | Ask for Coinbase's featured tier | Featured placement feeds Coinbase's agent wallets, MCP server and storefront | featured yes/no; payers from `bazaar` | featured within 45 days of the request | no answer in 45 days → one follow-up, then drop | request by CDP support email only, after D2 [D per §9 item 1]; no Discord or forum post (public posts are Petter's) |
| **D4** | 3–8 | Claude connector directory | The only model-side discovery surface; it ranks on usage | listed yes/no; weekly tool calls from Claude clients (`clientInfo`); payers with `claude-dir` first touch | listed within 45 days; ≥20 tool calls a week from Claude clients by day 90 | refused, or under 5 calls a week 30 days after listing → stop | titles and annotations [C]; no-auth mode for search and free tools first, sign-in (OAuth) for paid tools second [C]; submit [P, §9 item 2] |
| **D5** | 3–8 | Zapier public integration | Teams will put a Strale step in recurring invoice and supplier Zaps | Zapier installs; calls with `X-Strale-Client: zapier-strale/*`; repeat callers (same key in ≥4 weeks) | published; ≥5 accounts with live Zaps and ≥2 calling weekly by day 90 | refused, or under 2 accounts 30 days after publishing → stop and keep the action design for Make | build with five typed actions and tests [C]; developer account [D]; submission [C, publish per §9 items 3 and 8] |
| **D6** | 4–6 | Vercel AI SDK package + Tools Registry PR | A curated listing next to our peers reaches TypeScript agent builders that MCP alone does not | PR accepted; calls with the package's client header | accepted within 30 days of the PR; ≥10 distinct callers by day 90 | refused, or no merge in 60 days → stop (MCP stays the answer) | package with `tool()` and an offline mock-model test [C]; npm publish and registry PR [C, publish per §9 item 7] |
| **D7** | 5–9 | Narrow named MCP entry points (at most three: company check, EU VAT and screening, web page reader) | Narrow servers get picked more in directories (UK due-diligence about 61,000 uses vs our 989) | Smithery uses per server; tool calls by entry point; payers by `mcp-<server>` | one narrow server beats the broad one's weekly uses within 45 days | none does → retire them (no listing sprawl) | scoped tool sets on the same backend [C]; official registry and Smithery entries [C, publish per §9 item 7; registry entries cannot be deleted] |
| **D8** | 6–10 | n8n node to verified standard + one monthly re-check template | Scheduled re-checks turn one-off use into monthly calls | verified yes/no; calls via the node; accounts calling in ≥3 separate months | verified, or unverified with ≥5 installs, and ≥2 accounts calling monthly by day 90 | refused as a "proxy" and under 3 installs → deprecate the node | rebuild [C]; npm publish and Creator Portal submission [C, publish per §9 items 3, 7 and 8] |
| **D9** | 6–8 | Clay HTTP template | GTM teams enrich accounts with register records at creation | calls with `src=clay-template`; repeat accounts | ≥3 accounts calling in two separate weeks by day 90 | none in 45 days → stop | template and doc page [C]; partner application [P, §9 item 4] |
| **D10** | 8–12 | Monthly free allowance stated as a number on zero-cost tools | A free tier nobody quotes is not a funnel | free-tier callers; free→paid conversions | free-tier callers 5× the August base (2 in 90 days); ≥2 conversions | no rise in 45 days → revert | allowance [P, §9 item 5]; implementation and texts [C] |

Housekeeping riding along (no experiment): refresh `langchain-strale` for
langchain-core 1.x with meta-tools and an offline CI test [C, publish per §9
item 7]; deprecate `strale-semantic-kernel` [C, package protocol]; freeze
`crewai-strale` and `composio-strale` [C]; fix
`docs/operations/distribution-registry.yaml` (three yanked packages marked
published, Flowise open, no Pipedream row) [C]; PRs to Docker's MCP registry,
Cline, `awesome-remote-mcp-servers` and a Cursor plugin once D1 lands [C].

**Sequencing rule:** D0 and D1 first. D2 and D4 in parallel next. One
integration build at a time after that (D5, then D8). Every experiment reports
in the weekly attribution rollup; a kill is recorded, not quietly dropped.

---

## 9. Decisions this needs from Petter

Each is a yes/no. Recommendation first.

1. **May a session ask Coinbase, by support email, to consider Strale for the
   Bazaar featured tier?** Recommendation: yes, once D2's metadata is live.
   The charter text called vendor contact yours; DEC-20261027-A later
   delegated emails "about access, terms, permission or credentials". A
   placement request is close to that line, so it is put to you once.
2. **Submit Strale to the Claude connector directory once it is eligible?**
   Recommendation: yes. It involves accepting Anthropic's directory terms for
   Moonlighter AB and a "financial transactions" acknowledgement, which go
   beyond a free account's click-through, and needs a paid Claude plan.
3. **May a session publish integrations under Strale's name on Zapier and
   n8n?** Recommendation: yes, with each listing text checked against
   `claims.yaml`. The developer accounts are free, but a listing is a public
   act, so the class is put to you once.
4. **Apply to Clay's partner programme, Stripe's Directory (which for a
   non-US business also needs Stripe's stablecoin approval) and router supply
   (Delegate, StableEnrich, Apify Actors)?** Recommendation: not in the first
   60 days. Revisit with D5 and D9 results. These involve agreements or payout
   identity checks.
5. **Free allowance.** Today 11 tools are free at 10 calls a day per IP.
   Recommendation: state it as a monthly number on the same zero-cost tools
   (about 300 a month, roughly today's daily limit restated). Free is outside
   the €0.02–€1.00 band, so this is yours (charter "What still needs Petter"
   item 4).
6. **No OEM or partner agreements for 90 days.** Recommendation: agree. The
   missing SOC 2 makes regulated buyers unlikely; integration evidence comes
   first.
7. **One-way package and registry publishes.** The charter reserves
   "publishing a package version that cannot be unpublished, submitting to a
   directory that does not accept removal". This plan needs several: a new
   npm package (AI SDK), official MCP registry entries (they cannot be
   deleted), an n8n major release, a `langchain-strale` refresh, and package
   releases that add the client header. Recommendation: approve the class for
   this plan, on the condition that each publish passes the Distribution PR
   Integrity Protocol and the production smoke test, and is reported after.
8. **Integration listings and the compliance gate (DEC-20260812-A).**
   Recommendation: list the Zapier and n8n integrations as general business
   tools (company lookup, VAT, invoice checks, with name screening as one
   action of five), and hold the "monthly sanctions re-screening" template and
   any finance- or compliance-team targeting until you say the gate is not
   triggered, or until customer discovery has run.
9. **Delete the three merged branches this session could not remove**
   (`chore/nta-env-set-in-railway`, `docs/email-phone-validation-copy`,
   `docs/ops-delegation`; PRs #763–#765). Not a strategy question: the git
   proxy refused the delete, and the "Delete branch" button on each PR clears
   the handoff gate.

---

## 10. Conflicts with active decisions

- **DEC-20261023-B (flagship not the headline) — no conflict, one emphasis.**
  The evidence says the flagship's buyers come through integrations, not x402.
  Narrow entry points (D7) and integration listings (§7) lead with
  flagship jobs in *those* venues; the library-level copy keeps the breadth
  lead.
- **DEC-20260812-A (compliance-specific products gated on customer
  discovery) — a real tension, put to Petter (§9 item 8).** Job-named
  integration actions only expose existing tools, which DEC-20261023-B already
  features as the flagship. But a Zapier or n8n listing whose templates are
  "monthly sanctions re-screening" and whose audience is finance and ops
  teams is marketing to compliance-adjacent buyers, which is close to what
  the gate governs. The drafts therefore position the integrations under
  general business use (company lookup, VAT, invoice checks) with screening
  as one action among five, and the sanctions template is held until Petter
  answers.
- **CHARTER "vendor contact is Petter's" vs DEC-20261027-A.** The later
  decision delegates access emails. §9 items 1 and 3 put the borderline cases
  to Petter once rather than reading the delegation widely.
- **DISTRIBUTION-FINDINGS and DIRECTORY-MAP (August) said Coinbase's index
  was "not worth further engineering effort".** That was right for *listing*
  (still earned by settlement, now documented by Coinbase) and is out of date
  for *ranking* and *curation*, which now use metadata Strale controls
  (payments §1.2–1.3). Those files are dated records and are not edited; this
  file supersedes their conclusion on that point.
- **DQ-39 (Serper resale terms).** Search tools are not headlined until it
  resolves.

---

## 11. Risks

| Risk | Why it matters | Mitigation | Conf. |
|---|---|---|---|
| Hollow or broken integrations | The pydantic-ai maintainer called us out publicly; three integrations call dead routes today | §7.1 first; §7.6 per platform; the integrity check extended | high |
| Listing sprawl reads as spam | Narrow servers and many directories can look like keyword farming (one Bazaar seller holds 65% of the index) | at most three narrow entry points, each a distinct tool set; retire losers | moderate |
| Overclaiming | Our own files carry retired claims today | claims register on every draft; no typed counts | high |
| Platform dependency | Coinbase controls ranking and featuring; Zapier and n8n control listing | spread bets across x402, Claude, and two automation platforms; measure each | moderate |
| x402 is early and concentrated | ≈$19M adjusted volume since May 2025; ~4,000 wallets ≈90% of spend; half of headline volume is wash trading | judge by distinct payers, not volume; keep the API-key path first-class | moderate |
| One buyer is ≈80% of revenue (week of 2026-10-19) | Losing them would cut revenue by most of its weekly total; nothing in this plan may degrade the tools they buy | no changes to those tools' behaviour; the customer-data boundary forbids contacting them | moderate |
| Search tools may switch off on 2026-11-09 | They are what the main customer buys | do not headline them; DQ-39 owns the outcome | high |
| n8n refuses a "proxy" node | Strale is an aggregator | pitch fixed job operations; fall back to unverified | moderate |
| OAuth on the MCP server touches a money path | Paid tool calls through Claude spend wallet money | OAuth tokens scoped to a key with its own spend limit (multi-key spend limits shipped in #761) | moderate |

---

## 12. What this research could not establish

- Which channel produced any past payer (not measured; §5).
- What Smithery `useCount` counts; Claude directory traffic; Zapier MCP's
  real use of public actions.
- Whether Strale is already in the Claude directory (needs a login), and our
  mcpbeat score.
- Delegate's provider list (its catalogue loads in the browser).
- Current revenue and payer counts beyond GOALS.md's 2026-10-26 reading (no
  production access).
