# Agent-payments ecosystem: where Strale can be a featured or default supplier

> Evidence appendix to [../2026-10-27-distribution-strategy.md](../2026-10-27-distribution-strategy.md). Written by a read-only research agent on 2026-10-27; raw API dumps referenced below (`research/raw/`, `research/data/`) were working files and are not kept in the repository.

Research date: 2026-10-27, around 13:00–14:00 Swedish time (CET). This was read-only: nothing was signed up for, paid, posted or contacted.
Raw evidence is in `research/raw/` next to this file: Bazaar pages `p_*.json`, validator output `val_*.json`, `getdisc.md`, `ams_*.json`, `402*.json`, `xs.html`, `catalog.json`, `wellknown.json` and `openapi.json`.
Confidence levels: **H** = verified against a primary source or a live API today. **M** = primary source, but partial or needing interpretation. **L** = secondary source, vendor marketing, or unverified.

---

## 0. What to do next, in priority order

| # | Action | Why | Effort | Gate |
|---|---|---|---|---|
| 1 | **Add `resource.serviceName`, `tags` (max 5) and `iconUrl` (PNG, not SVG) to every 402 challenge. Add `extensions.bazaar.info.output` with a realistic `example`. Replace the `example_<field>` placeholder inputs with real ones.** | Strale's agentic.market record is `enriched:false` with an empty name, category, tags and icon. CDP's validator flags the missing `info.output` as advisory. CDP's docs say "placeholder text score[s] zero on metadata quality", and ranking weighs metadata. In Bazaar search, Strale is **absent from the top results** for "email validation", "WHOIS lookup", "translate text", "sanctions screening" and "OCR image to text". All five are endpoints Strale has listed and is being paid for. | S (code in `apps/api/src/routes/x402-gateway-v2.ts`) | Technical, so Claude's call |
| 2 | **Point `/x402/catalog` `endpoint` URLs at the `/x402/v2/` paths.** It still advertises the v1 paths. | `POST /v2/x402/validate` now **rejects every v1 path** ("endpoint uses x402 v1; upgrade to x402 v2 for bazaar discovery") and accepts the v2 paths. `/.well-known/x402.json` already lists v2. The catalog contradicts it. | S | Technical |
| 3 | **Apply for CDP Bazaar curation (the "featured" tier).** | A published, editorial featured slot exists (section 1.3). The requirements are live mainnet payments, at least 99% 30-day availability (above 99.5% gets priority), a passing health probe, agent-ready metadata and passing validation. Strale meets the first. The metadata work in rows 1–2 covers most of the rest. No application form is documented, and placement is "editorial", so getting in means vendor contact. | S once rows 1–2 are done | **Vendor contact is Petter's** (CHARTER) |
| 4 | **Submit to the Stripe Directory** (email machine-payments@stripe.com). Optionally add MPP alongside x402 and PR into the curated mpp.dev directory, which has 138 services and no Strale. | This is a documented supplier slot in Stripe's agent-facing directory. MPP is the second rail, used by AgentCash, Stripe and Visa. Strale already runs Stripe live. | M (MPP via `mppx` wraps an existing x402 server) | Vendor contact and a new rail are Petter's. A non-US business needs Stripe's approval for stablecoins. |
| 5 | **Finish the 402 Index domain claim.** All 389 Strale rows show `domain_verified: 0`, although `/.well-known/402index-verify.txt` is served. | Its `verified=true` filter, which it recommends to agents, ranks domain-verified services first. Strale also can't edit its 325 "uncategorized" rows until the claim is done. | XS (`POST /api/v1/claim` then `/claim/verify`) | Arguably a free account plus click-through, so delegated under DEC-20261027-A. Confirm before acting. |
| 6 | **Refresh the x402scan origin record and add `info.x-guidance` to `/openapi.json`.** | x402scan shows Strale as "The trust layer for AI agents — 250+ independently tested data capabilities across 27 countries … cryptographic chain hashing". That copy is from before the Oct 2026 positioning and may break claims rules. x402scan's discovery spec requires `info.x-guidance`, which Strale's openapi lacks. `x-payment-info` is already present. | XS | A public listing edit. Check against `claims.yaml`. |

None of these changes the fact that buyer reach drives ranking (section 1.4). Strale's Bazaar resources mostly show **1 unique payer** in 30 days.

---

## 1. Coinbase x402 and the CDP Bazaar

### 1.1 Protocol and governance (H)
- **The x402 Foundation launched under the Linux Foundation on 2 April 2026**, and Coinbase completed its contribution of the protocol. There were 40 members at launch. Premier members: AWS, American Express, Cloudflare, Coinbase, Google, Mastercard, Shopify, Solana Foundation, Stripe, Visa. Source: https://docs.cdp.coinbase.com/x402/support/x402-foundation.md (H).
  - A later LF release, on 14 July 2026, announced the "operational launch". Secondary coverage names more premier members, including Ripple, Stellar, Circle and Monad. https://genfinity.io/2026/07/14/x402-foundation-launch-ripple-stellar-solana-quant-premier-members/ (L)
  - LF named an Executive Director on 1 Oct 2026, according to a search snippet of the LF press list (L).
- **Spec:** the canonical text is now `github.com/x402-foundation/x402`, at "Protocol Version: 2". Schemes are `exact`, `upto` and `batch-settlement`. Transports are HTTP, MCP and A2A. Discovery API: `GET /discovery/resources` and `/discovery/search` (§8). https://raw.githubusercontent.com/x402-foundation/x402/main/specs/x402-specification-v2.md (H)
- **The spec defines no `/.well-known/x402.json` standard.** Strale's file is an ad-hoc convention that some scanners read. A third-party conformance suite checks `/.well-known/x402`, without `.json`. Strale serves both (200) (M).
- **New since August:** the `resource` object carries optional fields `serviceName` (ASCII, at most 32 characters), `tags` (at most 5, each at most 32 characters) and `iconUrl`. The Bazaar uses them for search enrichment. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/extensions/bazaar.md (H)

### 1.2 Re-verifying "listing = settled in the trailing 30 days" (H, with refinements)
CDP's own docs ("Get discovered", https://docs.cdp.coinbase.com/x402/seller/get-discovered.md) now state the rule outright:
- "Every validated endpoint is eligible for indexing in the CDP Bazaar **after a successful settled payment**." Indexing runs after settlement and takes up to 15 minutes.
- "Resources that **go 30 days without a settlement are removed** from both the catalog and search results."
- Further exclusions: metadata is screened against a prompt-injection content policy, and resources that stop returning 402 are removed.
- **Today's data agrees.** All 84,631 entries fetched have `quality.lastCalledAt` between 2026-09-27T15:34Z and 2026-10-27T12:53Z, which is exactly a 30-day window. None is older.
- **Refinement for DIRECTORY-MAP.md:** settlement is necessary but no longer sufficient. Metadata screening and the v2 validator also apply. The validator calls v1 "not discoverable", yet 91 v1-path Strale resources with fresh `lastUpdated` are still listed. Today, v1 settlements still get indexed in practice, but CDP is signalling that this is being removed. Treat v1 as deprecated (M).

### 1.3 New since August: ranking, curation, and distribution surfaces (H)
- **Ranking:** "real economic usage and listing quality over a rolling 30-day window". Quality is recomputed every 6 h. Usage covers buyer reach (unique payers), volume and recency. Metadata quality covers the description (500 characters at most; placeholder text scores zero), complete input and output schemas with realistic examples, and dedicated domains, with tunnels down-weighted. Results are **capped per domain**. Search returns **at most 20** results.
- **Curation, the featured tier:** "A hand-selected slice of the highest-quality endpoints is additionally curated and featured … Curation is how you go from indexed to distributed." Listing is "editorial, based on service quality, category coverage, and ecosystem fit." The requirements table is in section 0, row 3. Curated endpoints are health-probed. Failing endpoints are down-ranked and then dropped from the featured tier, and restored automatically once they recover. **No application path is documented.** Contact would go through CDP (Discord or support). That is a vendor conversation (M on the contact path).
- **Where the Bazaar is consumed:** "tens of thousands of agents through CDP APIs, the Bazaar MCP server, and Amazon Bedrock AgentCore, and … agentic.market". The doc also says the "x402 Bazaar lists more than 23,000 x402 resources". That figure is stale against today's API total of 84,636 (see below).
  - **Bazaar MCP server:** `https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp`. Tools: `search_resources`, `proxy_tool_call`, `validate_endpoint`. https://docs.cdp.coinbase.com/x402/buyer/mcp-payments.md
  - **Coinbase Agentic Wallet skills** (`npx skills add coinbase/agentic-wallet-skills`) include `search-for-service`, which searches the Bazaar. So **Bazaar search rank is a direct buyer funnel**. https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/overview.md
  - **Amazon Bedrock AgentCore Payments** is in preview. The Bazaar is an MCP target in AgentCore Gateway, and wallets come from CDP or Stripe Privy. https://docs.cdp.coinbase.com/x402/integrations/amazon-bedrock-agentcore.md (H that the integration exists; preview status per AWS docs and press, M)
  - **agentic.market**, Coinbase's storefront, launched around 19–20 April 2026. Today: **3,651 services**. It has an `enriched` flag, `integrationType` 1P/3P, categories and icons. https://agentic.market/api/markdown, https://api.agentic.market/v1/services (H)

### 1.4 Strale in the Bazaar today (H)
Method: `GET /platform/v2/x402/discovery/resources?limit=1000&offset=0..84000`. 85 pages; the API caps limit at 1000. Pagination total: **84,636**. Items fetched: 84,631. Unique resources: 84,590 across 2,774 hosts. Concentration: one host, `market.datapackvibe.com`, holds 54,826 of them.

| Metric | Value |
|---|---|
| Strale resources listed (`api.strale.io`) | **163**: 91 on the v1 path (`/x402/<slug>`), 72 on v2 (`/x402/v2/<slug>`). August's figure was 95. |
| Unique Strale slugs | 135, of 363 advertised (275 capabilities and 88 solutions in `/x402/catalog`) |
| Strale 30-day calls, summed over resources | 4,608 |
| Unique payers per resource | 129 resources have 1, 25 have 2, 7 have 3, 2 have 4. The maximum is 4 (`image-to-text`, `translate`, `fear-greed-index` have 3). |
| Top Strale resources (30-day calls) | email-validate 589 · base64-encode-url (v2) 551 · base64-encode-url (v1) 534 · image-to-text 430 · translate 391 · startup-domain-check 214 · screenshot-url 185 · google-search 155 · sanctions-check 123 |
| `serviceName` / `tags` / icon on Strale entries | 0 of 163. By comparison, 22,031 entries in the whole index have a serviceName and 76,669 have tags. |
| Strale rank among Bazaar hosts by resource count | #22 |

**Bazaar search spot-check** (`GET /v2/x402/discovery/search?query=…`, top 20):

| Query | Strale position |
|---|---|
| PEP check | 1 |
| beneficial ownership | 2 and 5 |
| screenshot url | 7 |
| UK company data | 9 |
| sanctions screening | absent |
| email validation | absent |
| WHOIS lookup | absent |
| translate text | absent |
| OCR image to text | absent |
| VAT number validation | absent |
| tech stack detection | absent |
| keyword suggestions SEO | absent |

Strale only ranks where competition is thin. **Interpretation (M):** with one payer per resource, Strale's buyer-reach score is weak. The metadata gaps in section 0 rows 1–2 are the part Strale controls.

**Ecosystem context from the same index (H, CDP-settled traffic only):** listed resources sum to about 926,517 calls over 30 days. That double-counts across resources and excludes non-CDP facilitators. Top hosts by 30-day calls:

| Host | 30-day calls |
|---|---|
| ax1.vc | 193,783 (one resource, 1,577 payers) |
| blockrun.ai | 104,314 |
| market.datapackvibe.com | 93,336 |
| agent.pocket.network | 71,452 |
| api-xpay.com | 63,975 |
| stableenrich.dev | 42,225 |

stableenrich.dev is a direct enrichment competitor: 15 resources, up to 162 payers on one resource.

### 1.5 The CDP validator on Strale (H)
`POST https://api.cdp.coinbase.com/platform/v2/x402/validate` takes no key and makes no payment.

| Route | Result |
|---|---|
| `/x402/whois-lookup` | `valid:false`, rejected because it uses v1. All v2-specific checks are skipped. |
| `/x402/email-validate` | `valid:false`, same v1 rejection |
| `/x402/v2/whois-lookup` | `valid:true`, `simulation.outcome: accepted`. Advisory failures: `bazaar.info.output` missing, `bazaar.info.output.example` missing. |
| `/x402/v2/email-validate` | Same as v2 whois-lookup |

---

## 2. Strale's discovery documents vs what clients and Bazaar expect

| Surface | Finding | Severity |
|---|---|---|
| `/.well-known/x402.json` | 363 endpoints, all on v2 paths, with price, method, network and a description. Not a spec-defined format. It carries no input schemas, so a client cannot build a call from it alone. | Low |
| `/x402/catalog` | 275 capabilities and 88 solutions with `input_schema`. **The `endpoint` URLs are v1 paths**, which CDP now rejects for discovery. 216 of 620 input properties lack a `description`. Descriptions run 62–159 characters (median 122): clear, outcome-first, well within the 500-character cap. | **Medium** |
| v2 402 challenge | A hybrid. `accepts[]` carries v2 fields (`network: eip155:8453`, `amount`) alongside v1 fields (`maxAmountRequired`, `resource`, `outputSchema`), plus a legacy `paymentRequirements` array with `network:"base"`. The `PAYMENT-REQUIRED` header is present. CDP accepts it. This is a deliberate hedge (code comment: "#1982 CDP drops v2 extensions on mainnet"). It is worth re-testing whether #1982 is still open; if it is fixed, the v1 fields can go. | Low |
| `extensions.bazaar.info.input` | Example values are placeholders (`"domain":"example_domain"`, `"email":"example_email"`). They are generated in `x402-gateway-v2.ts` around line 385. CDP says it **sends the example input when indexing** and that placeholder text scores zero on quality. Use the manifest's `health_check_input` or a known-answer input instead. | **Medium** |
| `extensions.bazaar.info.output` | Missing. The validator flags it as advisory. The output shape exists only in v1 `outputSchema`. | **Medium** |
| `resource.serviceName/tags/iconUrl` | Absent. agentic.market shows Strale as a bare domain with no category, so its storefront cannot categorize or enrich it. | **Medium** |
| `discoverable` flag | Set to `true` in v1 `outputSchema.input`. v2 has no such flag: discovery is the presence of `extensions.bazaar`. Fine. | OK |
| `/openapi.json` (x402scan's canonical discovery file) | 388 paths, 363 x402 paths, `x-payment-info` present, contact email present. `info.x-guidance` is missing, and x402scan's spec lists it as required. | Low |
| Retired seller | `keyword-suggest`, one of the August "proven sellers", now returns 404 on `/x402/`. It is on the DEACTIVATED list in `auto-register.ts`, so this looks deliberate. Mentioned only because it was a revenue slug. | Info |

---

## 3. Other x402 directories and scanners

| Venue | What it is | Strale status today | Submission path | Featured slot? | Conf. |
|---|---|---|---|---|---|
| **agentic.market** (Coinbase) | The Bazaar storefront: 3,651 services, `enriched` and `isNew` flags, 1P/3P integration types | Listed as `api-strale-io` with 20 endpoints shown. Empty name, description, category, tags and icon; `enriched:false`. | Automatic from the Bazaar. Enrichment comes from `serviceName/tags/iconUrl`; curated or "1P" entries look hand-made. | Curated/enriched entries rank higher. Editorial. | H |
| **x402scan** (Merit Systems) | The main explorer and registry. Its public API is paid at about $0.01–0.02 per read; registration is free with SIWX wallet auth. Canonical discovery is `/openapi.json`. | Origin "Strale API", created 2026-04-27, updated 2026-08-13. Top-sellers panel (`timeframe: 30` in page data, so read as 30 days, M): **#23 by transactions, 4,686 tx, $247.07, 16 unique buyers**. The origin description is stale copy. | https://www.x402scan.com/resources/register (free, SIWX). Spec: https://www.x402scan.com/discovery/spec.md | Ranked by activity. No paid or featured slot seen. | H (rank and description), M (window) |
| **AgentCash** (Merit) | A wallet and MCP server for Claude Code, Cursor and Codex. Discovers via the x402scan and MPPscan registries. | Inherits x402scan | Through x402scan or MPPscan registration | The default buyer tool in its niche | M |
| **MPPscan** (Merit) | Registry for MPP on Tempo | Not listed (Strale has no MPP) | https://mppscan.com/register | — | H |
| **402 Index** | Covers L402, x402 and MPP. 211,037 endpoints, of which 206,395 are x402. | **389 Strale rows** (384 from the Bazaar, 5 self-registered). **All `domain_verified:0`**, all `featured:0`. 325 are "uncategorized". 352 healthy, 37 degraded. | Domain claim: `POST /api/v1/claim` → serve token → `POST /api/v1/claim/verify`. Lets the owner PATCH names and categories. | A `featured` field exists; 10 entries are featured today. Selection criteria unpublished. | H |
| **probe402** | Independent measurement and evidence project. 18,406 endpoints observed. | Not checked per endpoint | Paid audits only. "A paid engagement changes nothing in the public record." | No | H |
| **x402 Observatory** | Crawler seen in Strale logs (`x402-observatory`, 67 hits/30 days per DIRECTORY-MAP) | Unknown | x402observatory.com/.io were unreachable through the proxy (502) | Unknown | L |
| x402station, PulseFeed MCP, B3 endpoints API, x402list.fun | Monitors and lists, mostly mirroring the Bazaar | Not verified | — | — | L |

---

## 4. Adoption and volume (with sources; numbers conflict, so use ranges)

| Claim | Figure | Source | Conf. |
|---|---|---|---|
| Bazaar index size | **84,636 resources**, 2,774 hosts, 30-day window | CDP discovery API, today | H |
| Bazaar calls over 30 days (CDP-settled, summed per resource) | about 926,517 | Same | H on the arithmetic; it undercounts the ecosystem |
| 402 Index | 211,037 endpoints (206,395 x402; 2,500 MPP; 2,142 L402) | https://402index.io/llms.txt | H |
| Cumulative x402 transactions | "over 200 million … as of June 2026" (Major Matters tracker). Artemis: ">95% … protocol signaling, not buyer-seller exchange". | Glenbrook/Forkast republication: https://glenbrook.com/payments_news/the-x402-foundation-activated-a-27-year-old-internet-code-200-million-transactions-later-the-real-volume-is-still-tiny/ | L–M |
| Adjusted volume | about $19M since May 2025, as of about 21 Apr 2026 (Visa × Artemis). About 4,000 wallets drive about 90% of adjusted spend; Base carries the bulk. | https://thedefiant.io/news/infrastructure/visa-s-sheffield-pegs-adjusted-x402-volume-at-19m | M |
| 30-day volume | 75M tx and $24M over 30 days, of which about half is wash trading; "real daily volume near $28,000" | Forkast: https://forkast.news/half-of-x402s-transaction-volume-is-artificial-the-infrastructure-layer-keeps-building-anyway/ | L |
| Coinbase figure at agentic.market launch | "165,000" vs "165 million" transactions; reports conflict | PYMNTS vs others | L, do not cite |
| Chain share | Solana about 70% of monthly volume in mid-Aug 2026, vs Base about 93% of *adjusted* volume (Visa/Artemis) | cryptobriefing; The Defiant | L |

**Read:** real demand is small, highly concentrated (a few thousand wallets), and growing in tooling more than in buyers. Strale's one-dominant-wallet profile fits this market. Distribution levers that raise *unique payers* matter more than raw listing count (M).

**Who the buyers are (M):** agent wallets via Coinbase Agentic Wallet (skills `search-for-service` and `pay-for-service`), Coinbase Payments MCP (launched 23 Oct 2025), Coinbase Wallet MCP (`wallet-mcp.coinbase.com`, x402 payments), AgentCash (Claude Code, Cursor, Codex), Bedrock AgentCore Payments (preview), Cloudflare Agents SDK and AI Gateway "Machine Payments" (beta, 30 Sep 2026), Browser Use (AgentCash wallets), and Crossmint lobster.cash for OpenClaw agents (Feb 2026, L). Every one of these discovers through **the CDP Bazaar** or **x402scan**. There is no third major index.

---

## 5. Non-x402 and adjacent rails

| Player | What | Maturity (dates) | Can Strale plug in? | Effort / cost | Featured or partner slot & contact | Conf. |
|---|---|---|---|---|---|---|
| **Stripe machine payments (x402 + MPP)** | Stripe records x402 payments (Base USDC, settled through the CDP facilitator) and MPP payments (Tempo USDC.e, Solana USDC, cards via Shared Payment Tokens, $0.50 minimum) as PaymentIntents and settles to the Stripe balance in fiat | Preview since 10 Feb 2026 (The Block). Docs live today. Stablecoins in all US states except NY; **non-US must email machine-payments@stripe.com** (30+ countries). | Yes. Strale already has Stripe live and x402 live. The gain is fiat settlement, Stripe reporting and refunds, plus listing in the Stripe Directory. | M. Cards are uneconomic at Strale's $0.02–0.20 prices because of the $0.50 SPT minimum. The stablecoin minimum is $0.01. | **Stripe Directory**: "submit … for listing" by emailing machine-payments@stripe.com with business name, account ID, profile ID, llms.txt, skills, and 1–3 example prompts. The directory indexes mpp.dev endpoints and Stripe Projects. https://docs.stripe.com/payments/machine.md, https://docs.stripe.com/directory.md (preview; feedback to directory@stripe.com) | H |
| **MPP (Stripe + Tempo)** | 402 protocol with sessions, streaming and subscriptions. Core submitted to the IETF (draft-httpauth-payment). | Launched with Tempo mainnet on 18 Mar 2026 (The Block/Decrypt, M). Docs and SDK (`mppx`) live. | Yes. `mppx` can wrap an existing x402 server so one endpoint serves both (https://mpp.dev/guides/use-mpp-with-x402.md). A Tempo charge can pay Strale's wallet directly without Stripe. | M | **mpp.dev curated directory**: 138 services today, Strale absent. Submit a PR using the service template at github.com/tempoxyz/mpp. "Accepts live, production-ready MPP services." Also MPPscan. | H |
| **ACP (OpenAI + Stripe)** / UCP | Checkout protocol for retail and e-commerce in chat assistants | Launched Sep 2025. One source says ChatGPT Instant Checkout was retired in Mar 2026 (L, unconfirmed). Stripe's current agentic-commerce docs list UCP and machine payments and no longer foreground ACP (H that the docs say this). | Poor fit. It is built for product catalogues, not per-call APIs. | — | — | M |
| **Cloudflare Monetization Gateway** | x402 paywall at the edge for APIs, MCP tools and datasets. Settles through the **CDP facilitator**, so it feeds the Bazaar. | **Closed beta since 30 Sep 2026.** "Buyers and sellers must be based in the United States." | **No** while Strale is Swedish (Moonlighter AB) | — | Request via Dashboard → Monetize | H |
| Cloudflare pay-per-crawl / Pay Per Use / NET Dollar / Wallets | Publisher content monetization. NET Dollar stablecoin was announced Sep 2025, issuer unconfirmed. Wallets announced 4 Aug 2026 (buyer side). | Beta or announced | Not relevant for an API seller | — | — | M (pay-per-crawl, Wallets), L (NET Dollar) |
| **Visa Intelligent Commerce / Trusted Agent Protocol** | Agent identity and card credentials for merchants; TAP built with Cloudflare (Web Bot Auth) | TAP released 14 Oct 2025 on GitHub and the Visa Developer Center. VIC sandbox has 30+ partners (Dec 2025). Visa extended MPP to cards. | Indirectly, via MPP card rails or Nevermined. No supplier listing. | — | None for API sellers | M |
| **Mastercard Agent Pay** | Agentic tokens on the card network; Web Bot Auth with Cloudflare | Live for US cardholders from late 2025; LatAm and APAC in 2026 (L) | No direct seller listing for APIs | — | None found | L |
| **Google AP2** | Mandate and credential protocol for agent purchases. An extension to A2A and UCP; has x402 samples. | v0.2 released and **donated to the FIDO Alliance** (ap2-protocol.org) | Not needed. Strale's x402 already covers AP2's x402 path. | — | None | M |
| **PayPal** agentic commerce (Agent Ready, Store Sync, Agent Toolkit, MCP server) | Merchant and catalogue rails for shopping agents | Announced 28 Oct 2025; rollout "early 2026" (L) | Poor fit, since it is retail-catalogue oriented | — | PayPal.ai | L |
| **Skyfire** (KYAPay) | Agent identity and payment tokens, with a seller directory | Launched Jun 2025; current status from third-party sources only | Possible: verify tokens via SDK | M | Has a seller directory (L) | L |
| **Nevermined** | Agentic payments platform: register agents and plans; x402, MCP and A2A; claims an x402 facilitator plus Visa VIC card payments (Apr 2026) | Live (vendor claims) | Possible, as an extra rail or listing | M | nevermined.app. No independent adoption data. | L |
| **Payman** | Originally agents paying humans; now bank-facing agentic banking (ICBA accelerator, May 2026) | Pivoted | Not relevant | — | — | L |
| **Crossmint** (lobster.cash) | Buyer-side agent wallets and virtual cards, with x402 and MPP support | Live (vendor) | Buyer side only. Being x402-compliant is enough. | — | — | L |
| **Delegate (dlgt.io)** | "Find the best tool, API, or data source … pay on demand." 778 services. "Curated like an app store"; ranks by verified job outcomes; "no paid placement". | Live, launch date unknown | Maybe. No provider submission path is published. | ? | hello@dlgt.io (vendor contact, so Petter's) | L–M |
| "Proxy" | Name too ambiguous; not identified | — | — | — | — | — |

---

## 6. Where a "featured/default supplier" slot actually exists

1. **CDP Bazaar curation tier** (H that the tier exists; editorial; no form). This is the highest-leverage slot, because it feeds the Bazaar MCP, the Agentic Wallet `search-for-service` skill, agentic.market and AWS AgentCore. The prerequisites in section 0 rows 1–2 are Strale's to fix. The approach itself is a vendor contact.
2. **agentic.market enrichment/"1P"** (M). The same curation pipeline, reached through `serviceName/tags/iconUrl` plus editorial selection.
3. **Stripe Directory** (H that the process exists). Submitted by email, which is a vendor contact. It indexes MPP endpoints, so adding MPP strengthens a listing.
4. **mpp.dev curated directory** (H). Submitted by GitHub PR. Requires live MPP.
5. **402 Index `featured`** (M). A field exists; criteria are unknown. Domain verification affects ranking now.
6. **x402scan / AgentCash** (H). Ranked by activity; no featured slot. Registration is free.
7. **Category gap to note (M):** in Bazaar search, Strale leads on compliance-ish queries ("PEP check" #1, "beneficial ownership" #2), where supply is thin. That fits the flagship positioning in DEC-20261023-B and suggests where curation would pick Strale for "category coverage".

---

## 7. Corrections to existing repo docs (for whoever updates them)
- DIRECTORY-MAP.md "95 of our resources are listed" is now **163** (135 slugs). The index grew from about 14.9k to **84.6k**.
- The "Listing is earned by settlement" rule is still true and is now documented by CDP. Add: v2-only validation, content-policy screening, a curation tier above the index, and quality ranking.
- DISTRIBUTION-FINDINGS.md "the gap is CDP's indexing pipeline … not worth further engineering effort" needs updating. There are now documented metadata levers (output example, realistic input examples, serviceName/tags/icon) that affect **ranking and curation**, even though listing itself still follows settlement.
- DIRECTORY-MAP.md says 402 Index is "domain verified". The live API says `domain_verified: 0` on all 389 rows.

## 8. Speculative or early, so treat with caution
NET Dollar (no issuer). Cloudflare Monetization Gateway (US-only, closed beta). AWS AgentCore Payments (preview). Stripe machine payments (preview APIs). MPP adoption outside the Stripe and Tempo ecosystem. Headline x402 volume figures (inflated by wash trading and signalling). Skyfire, Nevermined and Delegate traction (vendor claims only). ACP's current status.
