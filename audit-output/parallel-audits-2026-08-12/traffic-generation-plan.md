# Strale — Traffic Generation Plan

**Date:** 2026-08-12 · **Scope:** how Strale generates more traffic, weighted to machine-discoverable surfaces over human content marketing.
**Status:** READ-ONLY analysis. **Nothing was submitted, posted, published, PR'd, or registered anywhere.** Every outward-facing item below is a drafted artifact awaiting Petter.

**Companion documents (read these first, this one does not repeat them):**
- `distribution-playbook.md` (same folder) — the per-directory research and drafted submission copy. This plan *supersedes three of its factual claims*; see §1.
- `docs/strategy/2026-08-12-attribution-design.md` — the measurement design this plan's §4 connects to.
- `docs/strategy/2026-08-12-platform-readiness-program.md` — WS5 and the escalation contract that determines the tags below.

## Tag legend

| Tag | Meaning |
|---|---|
| **[auto]** | Inside the DEC-20260812-A escalation contract's "platform's job" set. No approval needed. |
| **[Petter]** | Outward-facing. The escalation contract reserves *"publishing new external claims"* to Petter — every directory submission, external-repo PR, package publish, and account-settings change lands here. |
| **[blocked: X]** | Cannot proceed until X exists or is decided. |

Evidence labels: **[V]** verified by fetch/read this session · **[I]** inferred · **[U]** unverified.

---

## 0. Executive framing

The distribution playbook answers *"where should Strale be listed?"* very well. This plan answers a
different question, and the answer inverts the priority order.

**Strale's traffic problem is not primarily absence from directories. It is that three of the
channels it already owns are switched off, mis-serving, or shipping false copy — and that the
program's own stated precondition for a distribution push ("attribution before spend") is not built.**

Listing on ten more directories multiplies a number that is currently unmeasurable, while the
largest owned channel (being in and retrievable by models) is disabled at the CDN. Fix the owned
surfaces first; they are cheap, they are mostly [auto], and several of them gate the value of every
submission in the playbook.

### 0.1 — The market-size finding that should temper expectations

Independent research this session surfaced published evidence that changes the expected value of the
entire directory-submission programme. Reported honestly, with its sourcing, because it argues
*against* the obvious plan:

- **Roughly half of x402 transaction volume appears to be artificial.** CoinDesk (March 2026),
  citing on-chain analysis by Artemis, reports self-dealing wallets acting as both buyer and seller,
  and wash patterns where the seller funds the buyer wallet which immediately returns funds. Artemis's
  summary: the x402 agent-payments boom is characterised as still mostly a mirage. Measured real
  daily volume in that analysis: **~$28,000/day** — against headline cumulative figures in the
  hundreds of millions of transactions. **[I — second-hand via search; not independently verified.
  Re-check before it is quoted anywhere external.]**
- **Volume concentrates brutally at the head.** x402-list.com's own dashboard reports the **top 10
  services accounting for 97.8% of settlement volume** across 534 listed services. The long tail —
  where a newly-listed Strale would sit — sees close to nothing. **[I]**
- The structural reason given: the small single-purpose data APIs x402 was designed for remain rare,
  so the bottleneck is *demand-side agent adoption*, not the number of discovery surfaces. **[I]**

**What this does and does not change.** It does not argue against the x402 rail — Strale's own
revenue is 92% x402, which is real, first-party, and the strongest evidence available. It does argue
that **being listed in the 500-service long tail is optionality, not a growth plan**, and that the
marginal 11th directory is worth much less than making the channels Strale already occupies work
properly. It also raises the value of the two items that are *not* long-tail listings: the Bazaar
facilitator change (which is head-of-market infrastructure, not a listing) and fixing the MCP
server's measured 75% uptime (§2, D-5) — because a directory entry pointing at an endpoint that is
down a quarter of the time converts at zero regardless of how many directories carry it.

---

## 1. Corrections to the distribution playbook

These are load-bearing. Acting on the playbook without them ships false claims — which violates
Readiness commitment #1 ("the platform never lies") on the exact surfaces that commitment is about.

### C-1 — The three "yanked" framework packages were never yanked [V] 🔴

Playbook §3.9 states: *"No live trace of either was found [V], consistent with removal."* That is wrong.

| Package | PyPI version | Yanked? | Uploaded | Summary still served |
|---|---|---|---|---|
| `pydantic-ai-strale` | 0.1.1 | **`yanked=false`** on all releases | 2026-03-25 | "Pydantic AI integration for Strale — 250+ business capabilities as agent tools" |
| `openai-agents-strale` | 0.1.1 | **`yanked=false`** on all releases | 2026-03-25 | "OpenAI Agents SDK integration for Strale — …" |
| `google-adk-strale` | 0.1.1 | **`yanked=false`** on all releases | 2026-03-25 | "Google ADK integration for Strale — …" |

Method: `GET https://pypi.org/pypi/<pkg>/json`, walked every file of every release. All three are
**installable right now**, all three carry Beta classifiers and keyword-rich metadata
(`pydantic-ai`, `openai`, `google-adk`, `vertex-ai`, `kyb`, `aml`, …).

Meanwhile `packages/pydantic-ai-strale/DEPRECATED.md` states verbatim: *"has been **yanked from
PyPI**"*, dated 2026-04-22. The repo believes a containment action completed that PyPI says never
happened. `check-framework-packages.mjs` also reports these three as `skip … yanked, forwarding
only` — **the guard trusts the local `DEPRECATED.md` marker rather than the registry**, so it
cannot catch this class of drift.

This is live reputational exposure on precisely the axis that produced the "Shame on you" incident.
It outranks every listing in the playbook: a maintainer who rediscovers an unyanked
`pydantic-ai-strale` while Strale is simultaneously pushing into framework directories converts a
closed incident into an open one.

**The failure class is already named in CLAUDE.md.** `origin/chore/hollow-package-guardrails` is
empty against `origin/main` [V] — the containment work *landed*. It created the `DEPRECATED.md`
markers and a checker that reads them. What it never did was verify the external effect. That is
**DEC-20260504-C** exactly: *"a clean post-deploy log is not verification — query prod for the
expected effect."* Here the local artifact says yanked, the registry says installable, and the guard
was pointed at the artifact. The fix is therefore two-part and the second part matters more: yank
the packages, **and** repoint the guard at the PyPI API so this cannot recur silently.

### C-2 — Every drafted submission's copy is already stale [V]

| Claim in drafted copy | Live value (fetched today) |
|---|---|
| "456 endpoints" (§0, §1.3, §1.6) | **331** — `GET /.well-known/x402.json` → `endpoints[].length` |
| "290+ capabilities" | **290** `active_visible` (298 active_total, 312 catalogued) — `/v1/platform/facts` |
| "24 countries" | **22** — `countries.company_data_active.length` |

The P1 truth pass, the armed quality floor (screenshot-url / brazilian / us-company-data
quarantined), and `product-search` deactivation moved these numbers *after* the playbook was
written. They will move again. **Every drafted description must be regenerated from
`/v1/platform/facts` immediately before submission, or written without numbers at all** — the
CLAUDE.md drift rule applied to external surfaces. Preferred: drop the counts and point at the
facts endpoint, so a directory entry can never go stale (the playbook itself recommends this in
§2.4; it just didn't apply it to its own drafts).

### C-3 — `?src=` on x402 endpoints is gateway-safe, but still shouldn't be used [V]

The playbook flags this as an unverified risk. Resolved by reading the code:
`validateX402Input` (`apps/api/src/lib/x402-input-validation.ts:70`) checks only `required` and
`anyOf`/`oneOf` branches. **There is no `additionalProperties: false` anywhere in the validation
path**, and the gateway's query extractor passes unknown keys straight through
(`x402-gateway-v2.ts:246`). So `?src=` will not 400 at the gateway.

**The recommendation stands anyway, for a different reason:** aggregators republish the exact URL
you submit as the canonical call template. A tagged payable URL teaches every downstream agent to
send `src` as an input field forever. Tag `strale.dev` URLs; never tag `api.strale.io/x402/*` or the
`.well-known` documents.

### C-4 — `composio-strale` clears the authenticity check [V]

The playbook flags it as an undocumented package of "April-incident shape". Verified:
`node apps/api/scripts/check-framework-packages.mjs` → `ok composio-strale (import found in
packages/composio-strale/composio_strale/toolkit.py)`; `pyproject.toml` declares `composio>=0.7.0`;
`tests/test_toolkit.py` exists. It is genuine — it is only *undocumented*. Two more undocumented
published packages surfaced alongside it: **`strale-capabilities`** (npm 0.1.0) and
**`straleio-langchain`** (npm 0.1.0). All three should be added to CLAUDE.md/memory. **[auto]**

### C-5 — the suspected Smithery duplicate is real, and the better-scoring one is unexplained [I]

The playbook flagged this as possible summariser confusion. It is not. Two live listings:

| Smithery slug | Owner handle | Published | Score | Description |
|---|---|---|---|---|
| `strale/agent-tools` | `strale` | 2026-02-27 | **82/100** | "…company registries across 25+ countries…" |
| `strale-io/strale` | `strale-io` | 2026-03-30 | 62/100 | "270+ quality-scored API capabilities… 27 countries…" |

**No GitHub repo exists at `strale/agent-tools`** — only the `strale-io` org. So the higher-scoring,
older listing sits under a handle that does not correspond to a Strale repository. Most likely an
early self-submission under a different handle that was never cleaned up; the alternative (a
third-party listing under Strale's name) matters more and should be excluded first.

Either way it is a live problem: two entries split the signal, both carry stale counts, and the one
a ranking algorithm prefers is the one Strale has least control over. **[Petter]** — needs account
access to resolve. **[I — subagent-sourced; confirm both listings in a browser before acting.]**

### C-6 — two "unverified" registries turn out to already list Strale [I]

`mcp.so` and `mcpmarket.com` both blocked direct fetch (403 / 429), but search-index snippets show
Strale listed on both, with stale counts ("233+" and "225+" respectively) and, on mcpmarket, the
title *"Strale: Verified AI Agent Capabilities & Trust Layer."* These move from the **submit** column
to the **refresh** column — which matters, because submitting to a directory that already lists you
creates the duplicate problem C-5 describes. **Check before submitting anywhere the playbook marked
[U].** **[I — snippet-sourced, not a direct page read.]**

---

## 2. The owned-surface defects (fix before any submission)

### D-1 — strale.dev tells every major AI crawler not to read it 🔴 [V]

`GET https://strale.dev/robots.txt` returns a **Cloudflare Managed Content block that is served
before the repo's own file**, and which the repo file cannot override:

```
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /

User-agent: ClaudeBot           Disallow: /
User-agent: GPTBot              Disallow: /
User-agent: CCBot               Disallow: /
User-agent: Google-Extended     Disallow: /
User-agent: meta-externalagent  Disallow: /
User-agent: Amazonbot           Disallow: /
User-agent: Applebot-Extended   Disallow: /
User-agent: Bytespider          Disallow: /
# END Cloudflare Managed Content
```

…followed by the repo's `public/robots.txt`, whose comment reads *"# AI crawlers welcome"* and
which `Allow: /` for GPTBot, Google-Extended, Amazonbot, `Claude-Web`, `anthropic-ai`.

Three separate problems:

1. **Unambiguously blocked:** `ClaudeBot`, `CCBot`, `meta-externalagent`, `Applebot-Extended`,
   `Bytespider` appear only in the Cloudflare block. `CCBot` is Common Crawl — the corpus a large
   share of retrieval and training pipelines derive from. `ClaudeBot` is Anthropic's *current*
   crawler.
2. **Ambiguous / parser-dependent:** GPTBot, Google-Extended and Amazonbot each appear in **two
   groups** with contradictory rules. Under RFC 9309 same-name groups merge and the least
   restrictive rule wins, so these probably resolve to Allow — but "probably, depending on whose
   parser" is not a state to leave the primary discovery channel in.
3. **The repo file targets retired tokens.** `Claude-Web` and `anthropic-ai` are legacy names;
   `ClaudeBot` (the one that matters) is not in the repo file at all, so the merge rescue that
   accidentally saves GPTBot does not apply to it. `OAI-SearchBot` (ChatGPT's search-time fetcher,
   distinct from GPTBot) is absent entirely.

**Readiness WS5 channel #1 is "the model's training data" and channel #2 is "live web search at task
time."** Both are currently being told no at the CDN, by a setting nobody in the repo appears to
know is on. Note the asymmetry: `ai-train=no` is a *deliberate, reasonable* policy for a company
that sells data — but it was almost certainly not a deliberate choice here, and it is flatly
contradicted by the repo file's own stated intent.

This is a Cloudflare dashboard setting (AI Crawler Control / managed robots.txt), not a repo edit.
**[Petter — account settings change; also a genuine policy decision, not just a bug]**

### D-2 — `strale.dev/.well-known/x402.json` returns SPA HTML with HTTP 200 [V]

```
https://strale.dev/.well-known/x402.json  →  200, content-type: text/html, <!doctype html>…
https://api.strale.io/.well-known/x402.json →  200, valid JSON, 331 endpoints
```

A crawler that probes the *apex* domain for the discovery document — the obvious first guess, since
`strale.dev` is the brand — receives a 200 with an HTML body rather than a 404. Some discovery
crawlers will record that as "has an x402 doc, unparseable" and drop Strale; others will retry the
API host. Either way it is free to fix: serve a 301 from `strale.dev/.well-known/*` to
`api.strale.io/.well-known/*`, or a real 404. Same applies to `agent-card.json` and
`ai-catalog.json` on the apex. **[auto — frontend redirect config]**

### D-3 — the A2A agent card is 145 KB / 394 skills [V]

`GET /.well-known/agent-card.json` → 144,861 bytes, `skills[]` length 394, each with full
description, tags and examples. It is rich and conformant, but a 145 KB card is at or past the size
where crawlers truncate, context-windows clip, and directory ingesters time out. Consider a
summary card (top ~25 skills + a pointer to the full catalog) at the well-known path with the
exhaustive list behind `?full=1`. **[auto — but verify against the A2A spec's card requirements
first; this is a legibility judgement, not a known defect]**

### D-4 — attribution is designed and not built [V]

`grep` across `apps/api/src` for `discovery_hits`, `client_meta`, `X-Strale-Client`: **zero matches.**
No `src` query-param handling on any discovery route. Umami exists but is a frontend `<script>` tag
(`index.html:25`) — it measures humans on strale.dev and nothing else. So:

> The readiness program states "attribution before distribution … otherwise the spend is
> unmeasurable." That precondition is currently unmet, and every item in the playbook's
> "Recommended sequence" would land into an unmeasured void.

This is the single item that changes the *value* of everything else in this document. See §5.
**[auto — it is a build, fully inside the platform's job]**

### D-5 — Strale's MCP server is publicly graded at 75% uptime 🔴 [I]

**YellowMCP** (`yellowmcp.com`) is not a directory — it is a reliability monitor that auto-discovers
remote MCP servers by aggregating the Smithery / PulseMCP / official-registry feeds, and it has been
probing Strale's endpoint. It reports, publicly:

| Metric | Reported value |
|---|---|
| 30-day uptime | **75.0%** (flagged: below their 80% threshold) |
| Avg latency | 2,598 ms |
| P95 latency | 10,005 ms |
| Tools discovered | 8 (~1,615 schema tokens) |
| Transport / compliance | Streamable-HTTP, "full MCP compliance" |
| Security score | 85 / Good, with **overly-permissive CORS** flagged (medium) |

**[I — single-source, fetched by a research subagent, not independently re-verified. Verify against
Strale's own health data before acting on the number.]**

Two consequences, and the second is the important one:

1. **This is public reputational surface, not vanity.** Anyone evaluating Strale's MCP server —
   including the registries that syndicate from the same feeds — can see a 75% uptime figure and a
   CORS finding. Every MCP registry listing in Tier 2 points at an endpoint carrying that grade.
2. **If the number is even roughly right, it caps the conversion of the entire MCP channel.** A
   monitor that succeeds 3 times in 4 describes an endpoint that fails an agent's tool call 1 time
   in 4. Adding registry listings on top of that multiplies impressions against a broken
   denominator. The P95 of 10,005 ms is its own signal — it looks like a 10-second timeout boundary
   being hit, which is worth correlating with the async threshold (10,000 ms) that has already
   bitten `eu-regulation-search` this month.

**First action is verification, not remediation** — query `transactions` / `health_monitor_events`
for the real `POST /mcp` success rate and latency distribution, then decide. There is also a
`/claim` flow on YellowMCP for a "Verified Operator" badge; the verification mechanism was not
disclosed on the fetched page. **[auto]** to verify the numbers; **[Petter]** to claim the listing.

---

## 3. (a) Prioritized traffic plan

Ordered by expected traffic per unit of effort, after accounting for the fact that unmeasured traffic
is worth substantially less than measured traffic.

### Tier 0 — Unblock and instrument (do first; nearly all [auto])

| # | Action | Tag | Effort |
|---|---|---|---|
| 0.1 | **Build attribution** per `2026-08-12-attribution-design.md`: `client_meta` JSONB on `transactions`, `discovery_hits` table, `src` capture on the 4 discovery routes, MCP `clientInfo` capture. DEC-20260504-C applies (verify the migration against `runStartupMigrations()` in `index.ts`, then query prod for the effect). | **[auto]** | 1 session |
| 0.2 | **Resolve the robots.txt contradiction** (D-1). Decide the policy, then make one file say it. If the intent is discoverability: disable Cloudflare's managed AI-crawler block, drop `ai-train=no`, and rewrite the repo file against *current* UA tokens (`ClaudeBot`, `OAI-SearchBot`, `GPTBot`, `PerplexityBot`, `Google-Extended`, `CCBot`). | **[Petter]** — account settings + a real policy choice | 15 min once decided |
| 0.3 | **Yank the three packages for real**, or decide publicly not to (C-1). Then fix `check-framework-packages.mjs` to verify yank status **against the PyPI API**, not against a local `DEPRECATED.md`. | Yank: **[Petter]** (package publish). Guard fix: **[auto]** | 30 min + 1h |
| 0.4 | **Apex `.well-known` redirects** (D-2). | **[auto]** | 20 min |
| 0.5 | **Regenerate all drafted submission copy from `/v1/platform/facts`**, or strip counts entirely (C-2). Build it as a script so every future submission is generated, never typed. | **[auto]** (generating) | 1h |
| 0.6 | Document `composio-strale`, `strale-capabilities`, `straleio-langchain` in CLAUDE.md + memory (C-4). | **[auto]** | 10 min |
| 0.7 | **Verify the MCP endpoint's real uptime/latency** against `transactions` + `health_monitor_events` (D-5). If the third-party 75% figure is roughly right, this outranks every Tier-2 listing. Also review the flagged permissive CORS on `/mcp`. | **[auto]** | 1–2h |
| 0.8 | **Resolve the confirmed Smithery duplicate** (C-5) — decide which listing survives. | **[Petter]** — account action | 15 min |

### Tier 1 — The x402 rail (the only channel with proven conversion)

| # | Action | Tag | Effort |
|---|---|---|---|
| 1.1 | **CDP Bazaar via facilitator change.** Still the largest single prize in the entire distribution surface: 331 endpoints self-index from organic paid traffic and cascade to Agentic.Market and downstream aggregators, with zero per-listing effort. Strale already emits a complete `extensions.bazaar` block with `discoverable: true` — into a facilitator that does not catalog it. | **[Petter]** — money-path change; also on the escalation list | Full-mode session + money-path review |
| 1.2 | Add `serviceName`, up to 5 `tags`, `iconUrl` to the 402 resource object — Bazaar ranks on metadata completeness. Ships value the moment 1.1 lands, harmless before. | **[auto]** | 1–2h |
| 1.3 | x402-list.com submission (playbook §1.3 — best manual-submission ROI; verified absent, `total: 0`). Regenerate copy first per 0.5. | **[Petter]** | 15 min |
| 1.4 | agent-tools.cloud **MCP + A2A** submissions — x402 is already partly indexed (20 of 331 endpoints), MCP and A2A are entirely absent despite both being live. Auto-verified, immediate. | **[Petter]** | 10 min |
| 1.5 | x402scan.com register (playbook §1.2). | **[Petter]** | 10 min |
| 1.6 | `x402-foundation/x402` ecosystem PR — needs a logo PNG. | **[Petter]** — external-repo PR, DEC-20260422-A pre-flight applies | 30 min + asset |
| 1.7 | `xpaysh/awesome-x402` PR — verified absent while direct competitors (Kaisha, Sirenic, GlobalAPI) are listed. | **[Petter]** | 15 min |

### Tier 2 — MCP registries (mostly refresh, not submit)

| # | Action | Tag | Effort |
|---|---|---|---|
| 2.1 | **Claim the Glama listing** — listed, accurate, unclaimed. Trust signal on a 71k-server directory. | **[Petter]** — account action | minutes |
| 2.2 | `punkpeye/awesome-mcp-servers` PR — verified absent; one-line markdown, zero authenticity risk. | **[Petter]** | 15 min |
| 2.3 | **Version-bump the official MCP registry** so mirrors (PulseMCP, Smithery) refresh, with counts removed from the description so they can never go stale again. This is the highest-fanout Tier-2 action: one publish propagates to several surfaces. | **[Petter]** — package publish | 30 min |
| 2.4 | Refresh Smithery; resolve the suspected duplicate entry. | **[Petter]** | 15 min |
| 2.5 | Docker MCP Catalog (remote-server entry, no Dockerfile needed; MIT satisfies their licence bar). | **[Petter]** | 1h |

### Tier 3 — Framework catalogs

**Gated on 0.3.** Do not push into any framework directory while three unyanked misnamed packages
sit on PyPI. After that: PyPI keyword alignment to the `strale-mcp` template **[auto]** (that package
carries 17 well-chosen keywords; `langchain-strale` and `crewai-strale` carry 6 generic ones and miss
`kyb`, `compliance`, `company-registry`, `sanctions`, `business-data`); `straleio` PyPI still carries
an **Alpha** classifier while its siblings are Beta **[auto]**; awesome-list one-liners **[Petter]**;
Flowise / LangFlow genuine-code contributions **[Petter]**.

### Tier 4 — Task-shaped content (the human/retrieval channel)

Playbook §6 is right and its evidence is honest — *no page's ranking was attributable to an
`llms.txt` file; the winners ranked on conventional signals.* Two amendments:

- **This tier is worth materially less until D-1 is resolved.** Writing retrieval-optimised pages
  for models that are told not to read them is the definition of wasted effort. Sequence 0.2 first.
- The sitemap carries **463 URLs, 454 of them `/capabilities/{slug}`** [V] and **zero `/guides/`
  pages**. The per-capability pages exist and rank only for brand-qualified queries. Build playbook
  pages #1–#4, measure, then decide on #5–#10. **[auto]** to draft; **[Petter]** to publish (new
  external claims).

### Not recommended

- **Anthropic Connectors Directory** — needs a Team/Enterprise plan *and* OAuth 2.0. Two hard gates,
  one of them a cost decision. Escalate as a question, don't build. **[blocked: plan + OAuth design]**
- **Semantic Kernel directories** — SK is in maintenance mode since MAF 1.0 (2026-04). No
  authoritative listing surface. Watch, don't invest.
- **Human AI-tool directories** (theresanaiforthat and similar) — wrong audience. Strale's buyer is
  a machine with a wallet.
- **OpenAI Apps SDK / ChatGPT app directory** — now open to third-party submissions, but apps must
  present an interactive UI inside ChatGPT and can currently only monetise **physical-goods**
  checkout, not API/data access. Structurally wrong shape for pay-per-call data. [V]
- **ACP Ready** (`acpready.com`) — real directory, but it indexes retail/merchant commerce
  infrastructure (Shopify, Etsy, Walmart, processors) for consumer purchases. Not an API-supplier
  registry. [V]
- **Google AP2** — a protocol and partner programme, not a public supplier registry. No submission
  path exists. [I]
- **Skyfire** — has a real Service Directory, but entry appears to run through their own
  partnership onboarding rather than a self-serve form. Watch. [I]
- **RapidAPI / Postman Public API Network / APIs.guru** — real and accepting, but oriented at humans
  browsing and testing APIs. No evidence of agent-runtime consumption at call time. APIs.guru would
  additionally need a stable published OpenAPI spec URL. Low priority; not zero, if a spec already
  exists. [V/I]
- **MCP client-side galleries** (Cline, Cursor, Copilot, Continue, Goose, HuggingFace) — these
  re-package the upstream registry feeds. Publishing to the official registry (2.3) is what reaches
  them; submitting individually duplicates effort and risks the C-5 problem. [I]

---

## 4. (b) Machine-discovery checklist

Status verified this session where marked [V]; otherwise inherited from `distribution-playbook.md`
with its label preserved.

### Owned surfaces (no submission — just be correct)

| Surface | URL | Status | Action needed |
|---|---|---|---|
| x402 discovery doc | `api.strale.io/.well-known/x402.json` | ✅ live, 331 endpoints [V] | Add `serviceName`/`tags`/`iconUrl` (1.2) |
| x402 catalog | `api.strale.io/x402/catalog` | ✅ live | Add `?src=` capture (0.1) |
| A2A agent card | `api.strale.io/.well-known/agent-card.json` | ⚠️ live but 145 KB / 394 skills [V] | Size review (D-3) |
| AI catalog | `api.strale.io/.well-known/ai-catalog.json` | ✅ live, 1.3 KB, facts-driven [V] | `?src=` capture |
| MCP server card | `api.strale.io/.well-known/mcp.json` | ✅ live [V] | — |
| llms.txt (API) | `api.strale.io/llms.txt` | ✅ live, dynamic, facts-driven [V] | — |
| llms.txt (site) | `strale.dev/llms.txt` | ✅ live, static, accurate [V] | Keep in sync with the dynamic one |
| **robots.txt** | `strale.dev/robots.txt` | 🔴 **contradictory; major AI crawlers blocked** [V] | **D-1 — highest priority** |
| Apex `.well-known/*` | `strale.dev/.well-known/x402.json` | 🔴 **200 + HTML** [V] | D-2 redirect |
| sitemap.xml | `strale.dev/sitemap.xml` | ✅ 463 URLs [V] | Add guide pages when built |

### x402 / agentic-commerce directories

| Registry | Strale listed? | Submission artifact | Tag |
|---|---|---|---|
| **CDP Bazaar** → Agentic.Market | ❌ — facilitator gap | Not a submission: route settlement through a Bazaar-supporting facilitator | **[Petter]** |
| **x402-list.com** | ❌ (`total: 0`) [V] | Web form; fields drafted in playbook §1.3 (regenerate copy) | **[Petter]** |
| **x402scan.com** | [U] — SPA, needs browser check | Paste `https://api.strale.io/.well-known/x402.json` at `/resources/register` | **[Petter]** |
| **agent-tools.cloud** | Partial — 20 x402 entries; **no MCP, no A2A** | `POST /api/v1/mcp/submit`, `/api/v1/a2a/submit` | **[Petter]** |
| **x402.org ecosystem** | ❌ | PR: `partners-data/strale/metadata.json` + `public/logos/strale.png` | **[Petter]** |
| **xpaysh/awesome-x402** | ❌ [V] | One-line README PR | **[Petter]** |
| **Onyx Bazaar** (`onyx-actions.onrender.com/bazaar`) | ❌ — zero matches in its full JSON dump [V] | **No submission path** — auto-indexes from the CDP discovery API every 15 min. Absence is independent confirmation of the facilitator gap; fixed only by 1.1. | — |
| **gold-402** (`github.com/Haustorium12/gold-402`) | ❌ [V] | PR, one entry: `[Name](url) — Description.` Hand-verified: must prove a live endpoint answering `X-Payment`; **no marketing language** | **[Petter]** |
| **Signal402** (`signal402.com`) | ❌ [V] | Paid web form ($0.01 via x402) + manual editorial review. Fields: name, HTTPS URL, category, price/request, description, email | **[Petter]** |
| **Merit awesome-agentic-commerce** | ✅ already listed twice, stale copy | Refresh, don't resubmit | **[Petter]** |
| x402catalog.com / a2alist.ai | Probably **do not exist** — no direct hits [U] | Drop from the watchlist | — |
| x402bazaar.org / pay.sh / ampersend | [U] | Verify before investing | — |

### MCP registries

| Registry | Strale listed? | Action | Tag |
|---|---|---|---|
| Official MCP Registry | ✅ v0.2.4, `isLatest` | Version-bump, drop counts from description | **[Petter]** |
| Glama | ✅ **unclaimed** | Claim it | **[Petter]** |
| Smithery | ✅ **duplicated** (C-5) — `strale/agent-tools` 82 + `strale-io/strale` 62 | Resolve the duplicate first, then refresh | **[Petter]** |
| PulseMCP | ✅ "Official" | Mirrors the official registry — 2.3 covers it | — |
| **YellowMCP** | ✅ auto-indexed; **75% uptime + CORS finding publicly shown** [I] | Verify our own numbers (0.7); `/claim` for Verified Operator badge | **[auto]** verify / **[Petter]** claim |
| **mcp.so** | ✅ listed, stale "233+" [I] | Refresh — **do not resubmit** | **[Petter]** |
| **mcpmarket.com** | ✅ listed, stale "225+" [I] | Refresh — **do not resubmit** | **[Petter]** |
| **mcpservers.org** | ❌ [V] | Free hosted form: name, short description, link, category, email (a $39 "premium review" upsell exists — skip it) | **[Petter]** |
| LobeHub | Skills ✅ (stale) / MCP ❌ | Submit to `lobehub.com/mcp` | **[Petter]** |
| punkpeye/awesome-mcp-servers | ❌ [V] | One-line PR | **[Petter]** |
| Docker MCP Catalog | ❌ | `servers/strale/server.yaml` (remote type) | **[Petter]** |
| Cline / Cursor / Copilot gallery / Continue / Goose / HF | — | **Skip.** Downstream re-packagers of the official registry + Smithery + Glama feeds; 2.3 feeds them | — |
| Anthropic Connectors | ❌ | **[blocked: Team plan + OAuth]** | — |

### Framework catalogs

| Surface | Status | Action | Tag |
|---|---|---|---|
| LangChain providers page | ✅ merged 2026-08-07 | Confirm `strale.dev/docs` backs the card | **[auto]** to verify |
| `pydantic-ai` / `openai-agents` / `google-adk` PyPI | 🔴 **live, unyanked** [V] | **Yank for real (C-1)** | **[Petter]** |
| PyPI keywords | Thin on 3 of 4 packages [V] | Align to `strale-mcp` template | **[auto]** prep, **[Petter]** publish |
| `straleio` PyPI classifier | Alpha while siblings are Beta [V] | Align | **[Petter]** publish |
| awesome-langchain / awesome-ai-agents | ❌ | One-line PRs | **[Petter]** |
| Flowise / LangFlow | ❌ | Genuine node/bundle code + PR | **[Petter]**, DEC-20260422-A pre-flight |
| Composio | ❌ (package exists, clean [V]) | Coordinate via their Discussions first | **[Petter]** |
| agno | ❌, no package | Write real Agno-interface code first | **[Petter]** |

### A2A — verdict: keep the card correct, invest nothing

The playbook's read was right and the follow-up research sharpens it. `a2alist.ai` could not be
confirmed to exist. The two real surfaces are **`a2a-registry.org`** and **`a2aregistry.org`** (both
have `/submit` flows; both returned 403 to fetch [U]). Neither publishes install counts, query
volume, or any usage evidence — and unlike x402, A2A has **no public settlement ledger** against
which real traffic could be independently verified. So there is no way to distinguish these from
vanity listings today.

**Action:** the free agent-tools.cloud A2A submission (1.4) is worth 30 seconds. Beyond that, keep
the agent card live and correct — subject to the 145 KB size question in D-3 — and revisit when a
directory publishes usage numbers. Do not build for A2A distribution.

---

## 5. (c) Measurement loop

The design in `docs/strategy/2026-08-12-attribution-design.md` is sound and does not need
redesigning. What follows is what it needs *added* to close the loop for traffic specifically, plus
the honest limits.

### Build exactly what the design doc specifies (0.1)

`client_meta` JSONB on `transactions` · `discovery_hits(endpoint, src_tag, ua, ip_hash, ts)` ·
capture at the 4 points (x402 wildcard, `/v1/do`, MCP tool-call, A2A) · `X-Strale-Client` header in
the 6 published packages · first-touch join · weekly rollup. **[auto]**

### Three additions this analysis argues for

1. **A `listed_at` ledger.** A one-row-per-surface table (or a checked-in YAML) recording
   `surface`, `submitted_at`, `live_at`, `src_tag`, `url`. Without it, the only viable measurement
   for the machine channel — *step-change in x402 volume against listing date* — has no x-axis. The
   attribution design assumes tagged URLs carry the signal; for Bazaar and every auto-indexing
   surface there is no URL to tag, so the listing date **is** the instrument. Cheap, and it must
   exist *before* the submissions, not after. **[auto]**
2. **Per-capability first-touch, not just per-wallet.** The revenue pattern is the embed: one agent,
   one capability, forever. So the question that matters is not "which surface produced a wallet"
   but "which surface produced a *capability adoption*". Record the capability of the first paid
   call alongside the surface. This is a one-column addition to the design's first-touch join and it
   converts the rollup from a marketing metric into a supply-roadmap input feeding WS4 demand
   sensing. **[auto]**
3. **Discovery-fetch → first-paid-call funnel per surface.** `discovery_hits` gives the top of the
   funnel and `transactions` the bottom. The ratio between them is the only thing that distinguishes
   a directory that sends crawlers from one that sends *buyers* — which is exactly the vanity-listing
   question. Report it in the weekly rollup as `hits → distinct UA → first paid call`. **[auto]**

### What Petter should pull from Umami (this session cannot access it)

Umami is a frontend-only tag (`cloud.umami.is`, site `9f534d25-…`) and measures humans on
strale.dev. It cannot see x402, MCP, or A2A traffic — so treat it as the *human* half only. Worth
pulling, as a pre-push baseline:

- **Referrers, last 90 days** — is any directory already sending humans? Any inbound from
  glama.ai / smithery.ai / pulsemcp.com / x402 sites is a free signal about which listings are
  actually surfaced to people.
- **Top pages** — do `/capabilities/{slug}` pages get any traffic, or only the homepage? This
  decides whether the 454 capability pages are an asset or dead weight, and therefore whether
  playbook §6's guide-page plan is a good bet.
- **Entry-page + bounce for `/docs`** — the "human operator" channel (WS5 #5) lives or dies here.
- **Country/region split** — the ICP framing assumes EU; verify.
- **Any traffic at all to `/llms.txt`, `/robots.txt`, `/.well-known/*`** — Umami won't catch
  non-JS crawlers, so a *zero* here is uninformative, but a non-zero is a real signal.

Record these as a dated baseline row before the first submission lands. After the push, the
comparison is only meaningful against a captured "before".

### Honest limits (do not over-promise this instrument)

- Agents send no referrer and hold no session; `?src=` captures **human clicks only**. Expect the
  machine channel to be measured by *volume step-change against listing date*, not by tags.
- At tens of wallets/month, one embedded agent swamps the signal. Read direction, not magnitude,
  for at least a quarter.
- Target from the design doc: **unattributed share below 50%**. Given the above, treat that as
  aspirational for the x402 rail and achievable for MCP (where `clientInfo` is exact and free) and
  the SDK/framework rail (where `X-Strale-Client` is exact by construction).

---

## 6. (d) Three highest-leverage moves for the next two weeks

Chosen on expected traffic × probability of success ÷ effort, with a hard preference for moves that
are irreversible-if-skipped (the robots.txt block compounds daily; a stale listing does not).

### Move 1 — Stop the bleed on the owned surfaces

Three live defects on channels Strale already owns. Each is small; together they gate the value of
every submission in the playbook. Tier 4 content is near-worthless while crawlers are blocked; Tier 3
framework distribution cannot honestly proceed while three misnamed packages are installable; and
Tier 2 MCP listings all point at one endpoint whose measured reliability may be 75%.

- **Decide and implement the AI-crawler policy** (D-1): Cloudflare managed block off or deliberately
  on, `ai-train` signal chosen on purpose, repo `robots.txt` rewritten against current UA tokens so
  the two files agree and stop contradicting each other. **[Petter]** — 15 min once decided.
- **Yank the three packages for real** (C-1) **[Petter]** — 15 min; then repoint
  `check-framework-packages.mjs` at the PyPI JSON API instead of the local `DEPRECATED.md` marker,
  with a regression test per DEC-20260504-A **[auto]** — 1h.
- **Verify the MCP endpoint's real uptime and P95** (D-5) against `transactions` /
  `health_monitor_events` **[auto]** — 1–2h. Verification only at this stage; if the third-party
  75% figure is roughly right, remediation becomes its own item and should outrank every Tier-2
  listing. Review the flagged permissive CORS on `/mcp` in the same pass.

**Effort:** ~30 min Petter + ~3h platform. **Payoff:** unblocks WS5 channels #1 and #2, closes a
live reputational exposure, and either clears or exposes the ceiling on the whole MCP channel.
Highest ratio in the document.

### Move 2 — Build attribution, plus the listing ledger

The program's own precondition, and the thing that makes every later submission a measurement rather
than a hope. Scope is one session as sized in the design doc, plus the three §5 additions (listing
ledger, per-capability first-touch, funnel ratio). DEC-20260504-C applies: verify the migration
against `runStartupMigrations()` and query prod for the effect, not the log line.

**Effort:** 1 session (~4–6h). **[auto] end to end.** **Payoff:** converts distribution from
unmeasurable to measurable; the ledger in particular has to exist *before* the submissions or the
step-change analysis is impossible retroactively.

### Move 3 — Scope the CDP facilitator decision (don't implement it yet)

The largest prize and the one with real risk. Two weeks is enough to *decide*, not to ship blind.
Produce a decision memo answering the three questions the playbook leaves open:

1. Does the x402 gateway support **dual facilitators** (CDP for indexing, current as fallback), or
   is it a swap? The playbook explicitly did not verify this.
2. What does the CDP facilitator change about the verify → execute → settle ordering that DEC-14
   mandates and `x402-gateway-v2.settlement-order.test.ts` exists to protect?
3. What are the fee, custody, and counterparty terms — this touches the money path and 92% of
   revenue.

Ship 1.2 (the `serviceName`/`tags`/`iconUrl` metadata upgrade) alongside, since it is harmless now
and free value the moment the facilitator question resolves. **[auto]** to research and draft the
memo; **[Petter]** to decide.

**Effort:** ~3h research + memo. **Payoff:** 331 endpoints self-indexing from organic traffic,
cascading to Agentic.Market and downstream aggregators — but only once decided properly.

### Explicitly deferred to weeks 3–4

The playbook's zero-risk submission batch (Glama claim, awesome-list PRs, x402-list, agent-tools,
x402scan, ecosystem PR), plus the surfaces added here (gold-402, Signal402, mcpservers.org). Every
one is 10–15 minutes and worth doing — but each is **[Petter]**, each publishes external claims, and
doing them *after* Moves 1–2 means they ship with correct copy, a working attribution tag, a listing
ledger to measure against, and a crawler policy that doesn't contradict them.

**Two rules for that batch when it runs:** check whether Strale is *already* listed before
submitting anywhere (C-6 found two supposed gaps that were actually stale listings, and C-5 shows
what a duplicate costs); and regenerate every description from `/v1/platform/facts` at submission
time (C-2).

Sequencing this second costs two weeks of listing latency and buys correctness plus measurability.
Given §0.1's evidence that long-tail x402 listings capture a rounding error of real volume, two
weeks of latency is cheap. That trade is worth making exactly once — do not let it slip past week 4.

---

## 7. Open items requiring a manual browser check

Resolved since the playbook §9 list was written: Smithery duplicate (**confirmed**, C-5) · `mcp.so`
and `mcpmarket.com` (**both already list Strale**, C-6) · `x402catalog.com` and `a2alist.ai`
(**probably do not exist** — drop them) · `composio-strale` (**legitimate**, C-4).

Still open, none blocking:
- `x402scan.com/resources` — still 403; indexed or not, and what the register form asks. Best
  checked from a browser on a different network path.
- `a2a-registry.org` / `a2aregistry.org` — 403; submission fields and whether Strale is present.
- `x402-foundation/x402` category enum + logo spec · `xpaysh/awesome-x402` CONTRIBUTING ·
  Docker MCP `server.yaml` field names · `x402bazaar.org` submission form.

Added by this analysis:
- **Cloudflare dashboard** — which managed AI-crawler setting produces the D-1 block, and when it
  was enabled. If it has been on for months it substantially explains the playbook §6 finding that
  Strale is "indexed but invisible" for every non-branded query.
- **PyPI ownership** — confirm the account owning the three packages can still yank them.
- **YellowMCP `/claim`** — what the ownership-verification mechanism actually is (DNS? OAuth?
  email?); the page described only the four-step flow.
- **Onyx Bazaar absence** — confirm it is purely the facilitator gap (§1.1) and not a separate
  indexing threshold. It auto-crawls the CDP discovery API, so it is a free second confirmation
  signal once the facilitator question resolves.
