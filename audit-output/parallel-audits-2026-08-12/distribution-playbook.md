# Strale Machine-Distribution Playbook
**Readiness WS5 / P5 — presence in every channel through which an agent discovers a supplier**

Research date: 2026-08-12. Read-only research. **No submissions, postings, PRs, forms, or account creations were made.** Every submission below is a drafted artifact awaiting a human decision.

---

## Legend

- **[V]** VERIFIED — I fetched the page/API and read the actual content.
- **[I]** INFERRED — derived from search summaries or secondary sources; re-check before acting.
- **[U]** UNVERIFIED — fetch blocked (403/429/SPA); needs a manual browser check.

Search-summarizer output was treated as untrusted throughout: several summaries returned claims about Strale that did not match the real product (e.g. "read emails, manage your calendar"). Those were discarded, not reported.

---

## 0. Executive summary — the finding that outranks everything else

**Strale is technically ready for the largest x402 discovery surface and is structurally excluded from it by one configuration choice.**

Verified facts:

1. Strale's 402 responses are **fully conformant and unusually rich** [V — curled `https://api.strale.io/x402/iban-validate`]. The response already contains `x402Version`, `accepts[]`, `paymentRequirements[]`, per-field `outputSchema` (input *and* output), and — critically — a complete `extensions.bazaar` block with `"discoverable": true` and a JSON-Schema `schema`. Someone already did the Bazaar integration work.
2. `https://api.strale.io/.well-known/x402.json` is live and advertises **456 endpoints** [V], facilitator `https://x402.org/facilitator`, network `base`, wallet `0x66D7…83bC`.
3. **The CDP Bazaar only indexes resources whose payments are processed by a Bazaar-supporting facilitator.** Coinbase's seller docs state the requirement plainly: "Swap in the CDP Facilitator," and list a four-step path ending in "complete a successful paid call through the facilitator." There is **no documented path for non-CDP facilitators** [V — `docs.cdp.coinbase.com/x402/seller/get-discovered`].
4. The protocol spec confirms the mechanism is settlement-time, not declaration-time: "Cataloging happens when a facilitator processes a PaymentPayload that includes the echoed bazaar extension," and facilitator support is optional — "Facilitators that support the Bazaar extension **may** provide a `/discovery/resources` endpoint" [V — `docs.x402.org/extensions/bazaar`].
5. Bazaar indexing **cascades**: "If your service/endpoints are indexed on the Bazaar, you'll automatically show up on agentic.market" [V]. Agentic.Market is Coinbase's public x402 marketplace. Onyx Bazaar (a public leaderboard) also indexes via the CDP discovery API [I]. x402-list.com auto-imports from Bazaar and x402scan [V].

**The implication.** Strale is already emitting perfect Bazaar metadata into a facilitator that (as far as the docs state) doesn't catalog it. Because 92% of revenue already arrives via x402 paid calls, switching or dual-routing settlement to a Bazaar-supporting facilitator would cause **456 endpoints to self-index from organic production traffic**, with zero per-listing submission effort, and cascade into Agentic.Market and downstream aggregators automatically.

That is a code/config decision, not a marketing task — and it is the single highest-leverage item in this document. It is also the one item here that is **not** a submission, so it isn't blocked on the "human decides each submission" constraint; it's blocked on an engineering decision about payment routing.

**Caveat worth stating honestly:** switching facilitators touches the money path. Per DEC-14 the x402 flow is verify → execute → settle, and the settlement-order test file (`x402-gateway-v2.settlement-order.test.ts`) exists precisely because that ordering is load-bearing. This should be scoped as a Full-mode change with its own review, not slipped in as a config tweak. A dual-facilitator arrangement (CDP for indexing, existing for fallback) may be safer than a swap — but I did not verify whether the x402 spec or Strale's gateway supports multiple facilitators concurrently, so treat that as an open engineering question.

---

## 1. Where Strale already stands (verified inventory)

Worth stating up front, because roughly half the "distribution work" is already done and re-doing it would waste effort or create duplicates.

| Channel | Status | Evidence |
|---|---|---|
| Official MCP Registry | **Listed**, v0.2.4, `isLatest: true` | [V] API returned all 7 published versions of `io.github.strale-io/strale` |
| Glama | **Listed, UNCLAIMED** | [V] `glama.ai/mcp/servers/strale-io/strale`; License A, Quality A, Maintenance C; 8 tools enumerated |
| Smithery | **Listed, stale** ("270+", should be 290+) | [V] `smithery.ai/server/strale-io/strale`, score 62/100, published 2026-03-30 |
| PulseMCP | **Listed**, classified "Official" | [V] `pulsemcp.com/servers/strale` |
| LangChain providers page | **Listed — merged 2026-08-07** | [V] `all_providers.mdx` contains the Strale Card; PR `langchain-ai/docs#3445` merged |
| Merit awesome-agentic-commerce | **Listed twice** (Ecosystem + Open Source/SDKs) | [V] raw README |
| agent-tools.cloud | **Listed**, 20 endpoint entries, health "ok", reliability ~81.6/100 | [V] `agent-tools.cloud/api/v1/search?q=strale` |
| LobeHub **Skills** marketplace | Listed, stale ("233+") | [V] |
| A2A agent card | Live and rich | [V] `api.strale.io/.well-known/agent-card.json` |
| **CDP Bazaar / Agentic.Market** | **NOT listed** — facilitator gap | [V] see §0 |
| **x402-list.com** | **NOT listed** (`total: 0` for q=strale) | [V] API query |
| **xpaysh/awesome-x402** | **NOT listed** | [V] raw README, zero matches |
| **punkpeye/awesome-mcp-servers** | **NOT listed** | [V] raw README, `grep -c` returned 0 |
| x402.org ecosystem page | NOT listed | [I] no Strale in member/project lists surfaced |
| Docker MCP Catalog | NOT listed | [I] weak negative |
| Anthropic Connectors Directory | NOT listed, and gated (see §3) | [V] |

**Housekeeping finding:** `composio-strale` exists on PyPI [V, indirectly — appears in Glama's package list and an independent PyPI scanner index] but is **not in project memory or CLAUDE.md**. Given the April 2026 framework-package incident, this package's authenticity should be audited before it is referenced anywhere. Run `node apps/api/scripts/check-framework-packages.mjs` against it.

---

## 2. TIER 1 — x402 channels (the only channel with proven conversion)

Ordered by expected conversion per unit effort.

### 1.1 — CDP Bazaar via facilitator change ★ highest leverage

- **What it is:** the protocol-native discovery layer; the index that Agentic.Market, Onyx Bazaar and several aggregators read from.
- **Process:** not a submission. Route x402 settlement through a Bazaar-supporting facilitator; the `extensions.bazaar` block Strale already emits then gets catalogued on each real paid call.
- **Requirements (all already met except the facilitator)** [V]: public HTTPS ✓; endpoint validation ✓; description ≤500 chars ✓; input schemas with examples ✓; output schema ✓; per-call pricing ✓; networks ✓.
- **Effort:** engineering, Full-mode, money-path review required.
- **Expected payoff:** highest in the document — 456 endpoints indexed from existing traffic, cascading to at least 2–3 downstream directories.
- **Optional metadata upgrade** [V — spec supports these]: add `serviceName` (≤32 ASCII), up to 5 `tags` (≤32 chars each), and `iconUrl` to the resource object. Currently absent from Strale's 402 payloads. Cheap ranking signal — Bazaar search "ranks by a blend of query relevance and quality, considering… the completeness of the description, output schema, and service metadata" [V].

### 1.2 — x402scan.com ★ trivial, auto-verifying

- **Directory:** `https://www.x402scan.com` · **Submit:** `https://www.x402scan.com/resources/register`
- **Process:** paste a URL; "if the URL returns a valid x402 schema, it will be added to the resources list automatically" [I — search-sourced; the register page itself is a JS SPA that WebFetch could not read, so **confirm the form fields in a browser**].
- **Requirements:** valid x402 schema at the URL. Strale's is conformant [V], so this should pass on submit.
- **Strale listed?** [U] — the site is a Next.js SPA and its API path is undocumented; **needs a manual browser check** at `x402scan.com/resources`.
- **Draft submission:** submit the discovery document, which enumerates all 456 endpoints in one shot:
  ```
  https://api.strale.io/.well-known/x402.json
  ```
  If it demands a payable endpoint rather than a discovery doc, use a cheap, always-working one:
  ```
  https://api.strale.io/x402/iban-validate?src=x402scan
  ```
  **Attribution note:** `?src=` on a *payable* endpoint is only safe if the gateway ignores unknown query params. `iban-validate` declares `iban` as its only queryParam; an unexpected `src` param could in principle trip strict input validation. **Verify before submitting** — otherwise submit untagged and rely on referrer.

### 1.3 — x402-list.com ★ best manual-submission ROI

- **Directory:** `https://x402-list.com` · **Submit:** `https://x402-list.com/submit`
- **What it is:** agent-first directory, ~470 services / 2,133 endpoints, live uptime monitoring, x402 compliance grading (14-point checklist), on-chain volume and distinct-buyer stats. Exposes `/api/v1/services`, an OpenAPI 3.1 spec, `/llms-full.txt`, and its own MCP server at `mcp.x402-list.com/mcp` [V]. This is a machine-readable surface agents actually query — not just a human web page.
- **Strale listed?** **No** [V — `GET /api/v1/services?q=strale` returned `"total": 0`].
- **Process** [V]: free. Automated 402 probe, then manual review. 7-day review window; pending submissions auto-reject after that. A $0.50 x402 fee applies **only** on resubmission within 14 days of a rejection. Free-hosting/dev-tunnel domains (Vercel, Workers, ngrok) are barred — `api.strale.io` is a real owned domain, so this is satisfied.
- **Requirement:** protected endpoints must return HTTP 402 with a valid `accepts[]` payload. Verified true [V].
- **Ready-to-submit draft** (exact form fields as read from the page):

  | Field | Value |
  |---|---|
  | Service name | `Strale` |
  | Service base URL | `https://api.strale.io` |
  | Website URL | `https://strale.dev/?src=x402-list` |
  | Your email | *(founder's address — human supplies)* |
  | Category | `Data` (best fit; `Verification` is the alternative if the KYB/compliance framing is preferred) |
  | Description | `Business data and compliance APIs for AI agents. 290+ independently quality-tested capabilities — company registry lookups across 24 countries, KYB and sanctions/PEP screening, VAT/IBAN/LEI validation, document extraction. Pay per call in USDC on Base via x402, no signup and no API key. Every call returns an audit record with cryptographic chain hashing.` |
  | Endpoint paths | `/x402/iban-validate`, `/x402/vat-validate`, `/x402/swedish-company-data`, `/x402/norwegian-company-data`, `/x402/sanctions-check`, `/x402/pep-check`, `/x402/adverse-media-check`, `/x402/lei-lookup`, `/x402/email-validate`, `/x402/dns-lookup` — plus full catalog at `/.well-known/x402.json` |
  | Notes | `Full machine-readable catalog of 456 endpoints at https://api.strale.io/.well-known/x402.json. MCP server at https://api.strale.io/mcp. A2A agent card at https://api.strale.io/.well-known/agent-card.json.` |

  Verify each listed endpoint path against the live catalog before submitting — I sampled `iban-validate` only.

### 1.4 — agent-tools.cloud ★ triple-protocol, already partly listed

- **Directory:** `https://agent-tools.cloud` (x402 + MCP + A2A in one index; 21,051 entries, 17,464 healthy) · **Submit:** `/submit`, or POST to `/api/v1/submit`, `/api/v1/mcp/submit`, `/api/v1/a2a/submit` [V]
- **Strale listed?** **Partially — yes for x402** [V]: 20 `api.strale.io` endpoint entries, all health "ok", latency 37–62 ms, reliability ~81.6/100. Aggregated automatically (sources: x402scan, awesome-x402, CDP Bazaar, pay-skills PRs, own crawl).
- **The gap:** only 20 of 456 endpoints are indexed, and there is **no MCP or A2A entry** — despite both being live and conformant. Free, auto-verified, immediate listing on success.
- **Draft — MCP submission:**
  | Field | Value |
  |---|---|
  | Endpoint URL | `https://api.strale.io/mcp` |
  | Name | `Strale` |
  | Description | `MCP server for Strale — pre-flight check any paid API before your agent pays, plus 250+ business data, compliance, and validation tools.` |
  | Transport | `streamable-http` |
  | Contact email | *(human supplies)* |
- **Draft — A2A submission:** Agent URL `https://api.strale.io` (the crawler reads `/.well-known/agent-card.json` itself) + contact email.
- **Draft — x402 (to widen coverage):** Name `Strale`, URL `https://api.strale.io/.well-known/x402.json`, Category `Data`, Price `0.02–2.50 USDC per call`, Chains `base`.

### 1.5 — Official x402 ecosystem page (x402-foundation/x402)

- **Directory:** `https://www.x402.org/ecosystem` · **Submit:** PR to `github.com/x402-foundation/x402` (note: repo moved from `coinbase/x402` to the Linux Foundation org).
- **Process** [V — read PR #3050's diff directly]: add exactly two files —
  - `typescript/site/app/ecosystem/partners-data/<slug>/metadata.json`
  - `typescript/site/public/logos/<slug>.png`
- **Exact schema** [V — verbatim from the merged Attest402 entry]:
  ```json
  {
    "name": "Attest402",
    "description": "Agent-native evidence service: ...",
    "logoUrl": "/logos/attest402.png",
    "websiteUrl": "https://attest402.com",
    "category": "Services/Endpoints"
  }
  ```
- **Ready-to-submit draft** — `typescript/site/app/ecosystem/partners-data/strale/metadata.json`:
  ```json
  {
    "name": "Strale",
    "description": "Business data and compliance APIs for AI agents. 290+ independently quality-tested capabilities across 24 countries — company registry lookups, KYB and sanctions/PEP screening, VAT/IBAN/LEI validation, and document extraction. Pay per call in USDC on Base via x402 with no signup or API key; every call returns a cryptographically chained audit record.",
    "logoUrl": "/logos/strale.png",
    "websiteUrl": "https://strale.dev/?src=x402-ecosystem",
    "category": "Services/Endpoints"
  }
  ```
  Plus `typescript/site/public/logos/strale.png`. **Category enum unconfirmed** [U] — `Services/Endpoints` is verified as valid by example; `Facilitators`, `Infrastructure/Tools`, `Client Integrations` are inferred from the page's category filters. Check sibling `metadata.json` files before opening the PR. PR title convention, per recent merges: `Add Strale to ecosystem (Services/Endpoints)`.
- **Note:** this repo is high-traffic (6,493 stars, PR numbers in the 3000s) and ecosystem PRs merge routinely. Low risk, good authority signal.

### 1.6 — xpaysh/awesome-x402

- **Repo:** `github.com/xpaysh/awesome-x402` · **Strale listed?** **No** [V — zero matches in raw README].
- **Why it matters:** this list ranks for "x402 API directory" queries [V], and it **already lists Strale's closest competitors** — including **Kaisha (Japan Company Registry API)**, Sirenic, GlobalAPI, agentdata-nl, and PayAPI Market. Kaisha's entry is a near-perfect structural template for Strale's.
- **Format** [V — verbatim from the Kaisha entry]:
  ```
  - [Kaisha — Japan Company Registry API](https://kaisha-api.hp-vladic.workers.dev) - Official-registry data for all 5.76M Japanese corporations...no API keys. MCP: `npx -y kaisha-mcp`.
  ```
- **Ready-to-submit draft** — add under *Production Implementations*:
  ```markdown
  - [Strale — EU Company Registry &amp; Compliance API](https://strale.dev/?src=awesome-x402) - Official-registry company data across 24 countries, plus KYB, sanctions/PEP and adverse-media screening, VAT/IBAN/LEI validation. 456 x402 endpoints on Base, no signup or API keys. Catalog: `https://api.strale.io/.well-known/x402.json`. MCP: `npx -y strale-mcp`.
  ```
  Contribution guidelines section was truncated in the fetch [U] — check `CONTRIBUTING.md` before opening the PR.

### 1.7 — Watchlist (lower confidence, verify before investing)

`agentic.market` (should arrive free via Bazaar — do not submit manually until 1.1 is resolved) · `x402catalog.com` [403 on fetch] · `x402bazaar.org` (third-party, distinct from CDP Bazaar) · `x402daily.xyz/resources/ecosystem` (26 projects, no submission process found) · Gold-402 / Onyx Bazaar [I — search-sourced only, no first-party page reached] · `signal402.com`, `x402list.fun`, `pay.sh`, `ampersend.ai/discover`, `hol.org` registry.

---

## 3. TIER 2 — MCP registries

Most of the high-authority work here is **already done**. The remaining actions are refresh-and-claim, not submit.

### 2.1 — Glama: claim the listing ★ do this first in Tier 2

Listed and accurate (290+, 8 tools correctly enumerated, License A / Quality A / Maintenance C) but **unclaimed — "no verification badge; admin claim option available"** [V]. Claiming is a trust signal on a directory carrying 71,000+ servers. Effort: minutes. The Maintenance C grade is worth investigating separately — it likely reflects commit recency or issue-response metrics on `strale-io/strale`.

### 2.2 — Smithery: refresh the stale description

Listed since 2026-03-30 with "270+" (now 290+) and score 62/100 [V]. Refresh via re-scan or the verification flow (listing → Settings → Verification). **One open item:** a search result suggested a possible *second* entry under a different slug (`strale/agent-tools`) — I could not confirm this by fetch and it may be summarizer confusion. **Manually check `smithery.ai/servers?q=strale`**; if a duplicate exists, it should be removed or merged.

### 2.3 — punkpeye/awesome-mcp-servers ★ best effort/payoff in Tier 2

**Verified absent** [V — `grep -c "strale"` on the raw README returned 0]. Pure one-line markdown PR, no schema, no code, zero authenticity risk. This list is a primary citation source for "best MCP servers for X" queries.

**Draft** (place under the appropriate category — likely *Finance* or *Data Platforms*; match neighbours' formatting and alphabetical position):
```markdown
- [strale-io/strale](https://github.com/strale-io/strale) 🏠 ☁️ - Business data and compliance tools for agents: company registry lookups across 24 countries, KYB and sanctions/PEP screening, VAT/IBAN/LEI validation. Pre-flight check any paid API before your agent pays.
```
Confirm the emoji legend against the README header before submitting — that list uses a specific icon vocabulary (🏠 local, ☁️ cloud, etc.) and getting it wrong is the usual reason these PRs get review comments.

### 2.4 — Official MCP Registry: keep current

Already published through v0.2.4 [V]. Not a submission target — a maintenance habit. `mcp-publisher` requires `server.json` **at repo root**; schema `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` [V]. Bump `version` in both `server.json` and npm, then `mcp-publisher login github && mcp-publisher publish`.

This matters more than it looks: **PulseMCP and Smithery appear to mirror the official registry** [I — inferred from exact `io.github.strale-io/strale` naming and version-history consistency, not from a documented guarantee], and **VS Code / Copilot discover servers through the official registry rather than a separate gallery** [I]. So one version bump propagates to several surfaces. Currently every downstream copy carries a stale capability count — which is itself an argument for the CLAUDE.md drift-prevention discipline: the description string should read from a canonical source rather than being retyped per registry. Better still, **drop the number entirely** and point at `/v1/platform/facts`, so the description can never go stale.

### 2.5 — Docker MCP Catalog

Not listed [I]. Requirements [V — CONTRIBUTING.md]: fork `docker/mcp-registry`, add `servers/{name}/server.yaml` plus `tools.json` and `readme.md` for **remote** servers (no Dockerfile needed — Strale's MCP is remote Streamable HTTP). License must be permissive: "MIT or Apache 2 are great, GPL is not" — Strale is MIT ✓. Uses `task wizard` / `task create` scaffolding; Docker team review required.

Draft `server.yaml` (field names **not confirmed** [U] — copy an existing remote-server example in `servers/` first):
```yaml
name: strale
type: remote
url: https://api.strale.io/mcp
description: >
  Business data and compliance tools for AI agents — company registry lookups
  across 24 countries, KYB and sanctions/PEP screening, VAT/IBAN/LEI validation.
repository: https://github.com/strale-io/strale
license: MIT
```

### 2.6 — LobeHub MCP marketplace

Strale appears in LobeHub's **Skills** marketplace (stale, "233+") but **not** the MCP marketplace at `lobehub.com/mcp` [V for Skills; U for MCP gallery]. Submit button on `lobehub.com/mcp`; form fields not fetched [U]. Use the generic draft in §6.

### 2.7 — Anthropic Connectors Directory — flag, don't build

Not listed [V]. Submission portal `https://claude.ai/admin-settings/directory/submissions/new` [V]. **Two hard gates:**

1. **Requires a Team or Enterprise Claude.ai organization** — admin settings don't exist on individual plans. Cost decision, not engineering.
2. **Directory mandates OAuth 2.0 for authenticated services.** Strale's MCP uses Bearer API-key auth. `strale_search` works unauthenticated, so a no-auth or custom-connection submission is conceivable, but full tool access needs the key.

Also required: `title` + `readOnlyHint`/`destructiveHint` annotations on every tool, privacy-policy URL, docs URL, test-account credentials, 7 compliance acknowledgments, and 3–5 PNG screenshots ≥1000px if any MCP UI. No stated review SLA.

**Recommendation: do not action this in a Quick-mode session.** Building an OAuth wrapper is a design decision with security implications and hits CLAUDE.md's Full-mode escalation triggers. Raise it as a scoping question first.

### 2.8 — Unverified / low priority

`mcp.so` [U — 403/429], `mcpmarket.com` [U — 429; a page titled "Strale: Verified AI Agent Capabilities & Trust Layer" surfaced in search but could not be confirmed], `mcpservers.org` [weak negative — worth a submission, it ranks for "MCP server company data lookup"], Cursor directory [U — appears to be rules/prompts, not MCP; `cursor/mcp-servers` is deprecated in favour of the official registry, so likely already covered], OpenAI Apps/Connectors [poor fit — consumer-app oriented, no comparable B2B API directory found].

---

## 4. TIER 3 — Agent-framework catalogs

**Governing constraint (DEC-20260422-A):** every item here is gated on the package containing genuine framework-interface code. The April 2026 pydantic-ai incident ("Shame on you") is the precedent. Nothing in this tier should be actioned without running `node apps/api/scripts/check-framework-packages.mjs` and the four-point pre-flight in `DISTRIBUTION_PR_PREFLIGHT.md`.

### 3.1 — LangChain: DONE ✓ (not open work)

**`langchain-strale` is already live on LangChain's official providers page** [V, two independent confirmations]:
- `raw.githubusercontent.com/langchain-ai/docs/main/src/oss/python/integrations/providers/all_providers.mdx` contains a `<Card title="Strale" href="https://strale.dev/docs" …>` between "Spidra" and "Stardog".
- PR `langchain-ai/docs#3445` — "docs: add langchain-strale integration" — opened by `petterlindstrom79`, **merged 2026-08-07**.

A reviewer noted LangChain no longer hosts external integration doc pages; current policy is a one-line Card linking to the vendor's own docs. **The merged card contains no code or import example**, so there is no fabricated-import surface — this one is clean.

**Follow-up that does matter:** `https://strale.dev/docs` is now the *only* thing standing behind LangChain's endorsement. Confirm it accurately documents `StraleToolkit`. Update Notion/CLAUDE.md — this is shipped, not pending.

### 3.2 — Awesome-lists ★ best effort/payoff in Tier 3

`kyrolabs/awesome-langchain`, `slavakurilyak/awesome-ai-agents`, `aloth/awesome-ai-agents`, `kyrolabs/awesome-agents` are active and PR-accepting [V — existence confirmed; submission templates not fetched]. One-line entries, no code, **zero framework-authenticity risk**. Use the §6 generic draft with `?src=awesome-langchain` etc.

### 3.3 — Flowise / LangFlow

Both are genuine code-contribution paths, and the TS SDK (`straleio`) already exists to wrap — so the authenticity bar is satisfiable cheaply and honestly.
- **Flowise** [V]: new folder under `packages/components/nodes/tools/`, TypeScript file, PR.
- **LangFlow** [V]: "bundle" under `lfx`, Python file(s) + `__init__.py`, PR, team review. Docs may be stale on the exact path [U].

### 3.4 — Composio — coordinate first

Real fit (Composio aggregates 1000+ toolkits and redistributes to many frameworks downstream) but heavier process: CONTRIBUTING.md explicitly requires coordination before building — "the framework caters a diverse audience and new features require upfront coordination" — via an issue or the `Tool-Toolkit Request` Discussions category. Full test coverage expected [V].

**Do this first:** `composio-strale` already exists on PyPI but is absent from project memory/CLAUDE.md. Audit it before engaging Composio — an unaudited framework package is exactly the shape of the April incident.

### 3.5 — agno

New tool = directory under `libs/agno/agno/tools`, subclass their `Toolkit`, run `./scripts/format.sh` + `./scripts/validate.sh`, PR [V]. **No `agno-strale` package exists** — this requires writing genuine Agno-interface code from scratch. Reusing `straleio` internals with a rename would repeat the pydantic-ai mistake. Medium effort, honest payoff.

### 3.6 — CrewAI — no documented intake

`crewAIInc/crewAI-tools` is **deprecated**; tools moved into the monorepo at `crewAIInc/crewAI/tree/main/lib/crewai-tools` [V]. `docs.crewai.com/en/concepts/tools` documents building custom tools for your own use and contains **no community directory, marketplace, or submission process** [V]. A PR would be exploratory — read the folder structure, copy the pattern, see what a maintainer says.

Separate surface: **CrewAI Enterprise Marketplace** (`marketplace.crewai.com`) accepts whole crew/flow *templates*, not tool packages [V]. A "KYB Compliance Crew" demo built on `crewai-strale` would qualify — different artifact, marketing rather than listing.

### 3.7 — Semantic Kernel — recommend deprioritizing, and a strategic flag

**Microsoft Agent Framework (MAF) 1.0 shipped 2026-04-03, unifying Semantic Kernel + AutoGen. SK v1.x is in maintenance mode** — critical bugs and security only; "the majority of new features will be built for Microsoft Agent Framework" [V].

There is no official Microsoft-run SK connector directory — only an informal community repo (`samitugal/semantic-kernel-plugins`, PR-based, unclear traffic) [V]. So: no authoritative listing surface, on a framework Microsoft is actively deprioritizing.

**Flag for Petter, don't decide unilaterally:** should `strale-semantic-kernel` be re-pointed at Microsoft Agent Framework? I found no MAF community-integrations directory yet (framework is ~4 months past 1.0) — that space is worth watching rather than acting on. This is a product decision, not a distribution task.

### 3.8 — Requires a package that doesn't exist yet (treat as separate projects)

LlamaIndex/LlamaHub (`llama-index-tools-<name>` PR into `run-llama/llama_index`; team publishes to PyPI for you) · Haystack (`.md` with frontmatter into `deepset-ai/haystack-integrations` — clean, well-documented process [V]) · n8n (`n8n-nodes-strale`, `n8n-community-node-package` keyword, formal verification program [V]) · Dify (`.difypkg`, privacy policy mandatory [V]) · Pipedream (team-built, not self-service) · AutoGen/AG2 (demo showcase, not a registry).

### 3.9 — Do not resurrect

`openai-agents-strale` and `google-adk-strale` were the two other packages flagged in the April authenticity audit. **No live trace of either was found** [V], consistent with removal. There is also no OpenAI Agents SDK third-party directory to submit to even if they existed. Leave them dead unless genuinely rebuilt under the full pre-flight.

### 3.10 — Package-registry SEO (cheap, do alongside)

`strale-mcp` is the best-optimised package by a distance — 17 keywords covering client names (claude, cursor, windsurf) and protocol terms (x402, l402, mpp) [V]. **Use it as the template for the other five.** The PyPI packages are thin: `langchain-strale` and `crewai-strale` carry only 6 generic keywords each and miss the terms a searcher would actually type — `kyb`, `compliance`, `business-data`, `company-registry`, `sanctions`, `agent-tools`. `straleio` (PyPI) still carries an **Alpha** classifier while its siblings are Beta — worth aligning if stability supports it.

---

## 5. TIER 4 — A2A and emerging directories (state maturity honestly)

**Honest assessment: this tier is immature and none of it has proven conversion. Spend minutes, not days.**

Strale's A2A agent card is live, rich and conformant [V] — `name`, `description`, `url`, `documentationUrl`, `provider`, `capabilities`, `authentication: ["apiKey","x402"]`, and detailed `skills[]` with tags and examples. The asset exists; the directories to put it in barely do.

- **agent-tools.cloud A2A** — the one concrete, free, automated A2A submission path found (§1.4). Crawler reads the agent card itself. **Worth doing; it's a 30-second form.**
- **a2alist.ai** — exists and indexes A2A agents (it surfaced an `awesome-x402` entry), but returned 403 to fetch [U]. Manual browser check.
- **hol.org agent registry** — surfaced in search with a UAID-style identifier scheme [I]. Unverified maturity.
- **Google's A2A ecosystem** — the protocol has real institutional backing, but I found **no authoritative public agent directory** with a submission process comparable to the MCP registry.

**Recommendation:** submit to agent-tools.cloud, keep the agent card current, and otherwise *watch*. Do not invest in A2A distribution until a directory with real agent traffic emerges. The card being live and correct is the whole job for now.

---

## 6. TIER 5 — LLM answer-time visibility

**The verified finding: Strale is indexed but invisible.**

Across 10 non-branded developer-intent queries, **strale.dev did not appear once** [V]. It ranks only for brand-qualified queries — "strale.dev" (homepage #4), "strale API capabilities" (homepage + `/capabilities/latvian-company-data`, `/capabilities/phone-type-detect`), "strale x402" (two dev.to posts by `petter-strale`). There is real indexed surface area; it just isn't aimed at any query a stranger would type.

**Who owns the queries today** [V]: CompanyData.com (dominates "company registry lookup" intent with 3+ separately-ranking pages), Apify (actor-store SEO — occupies 4 of 8 slots on "Norwegian company registry API" with scraper wrappers around the same free Brreg data Strale calls directly), Kyckr / Global Database / Topograph / Businessdataguide (own the per-country "Company Register Guide: [Country]" format), Didit (owns KYB pricing intent with a title reading literally "Business Verification API — KYB at $2"), x402-list.com and `awesome-x402` (own x402-directory intent), Base and CoinGecko docs (own x402 how-to intent), `companies-house-mcp` and mcpservers.org (own MCP-discovery intent).

**Winning archetypes** [V]: exact-query-phrase in H1 and URL slug; per-country "guide" pages; real developer docs (`docs.base.org`, `docs.coingecko.com/ai-integration/x402` both rank top for their queries — docs-as-content demonstrably works); dev.to community listicles with the query as the literal title; and price-in-title vendor pages.

**On llms.txt — evidence, not hype** [V]: across 40+ ranking URLs examined, **no page's ranking was attributable to an `llms.txt` or `/.well-known/` file**. Every winner ranked on conventional signals. Advocacy sites claim broad adoption but that is self-interested and unverified. What *is* verified: genuine structured developer docs rank at or near the top for their exact queries. **Keep `llms.txt` accurate as hygiene; do not treat it as a distribution strategy.**

### The 10 pages, prioritised

| # | Page title | Target query | Slug | Why it wins | Effort |
|---|---|---|---|---|---|
| 1 | Swedish Company Org Number Lookup API — Free, No Signup, 3-Line Example | "Swedish company registry API" | `/guides/swedish-company-lookup-api` | Occupies the "Company Register Guide" format Kyckr/Businessdataguide own, but as runnable code. Genuinely-no-signup is a real differentiator vs Bolagsverket's agreement process. | Low |
| 2 | Norwegian Company Registry API (Brreg) — Query by Org Number, No API Key | "Norwegian company registry API" | `/guides/norwegian-company-lookup-api` | Apify holds 4/8 slots with scraper wrappers over the same free data Strale calls directly; a direct-API page beats a scraper page on trust framing. | Low |
| 3 | Free VAT Number Validation API — No API Key Required | "VAT number validation API free" | `/guides/free-vat-validation-api` | Every current top-8 result ("free") still requires signup for a key. Strale's genuinely-keyless path is the gap — if the title says so. | Low (retitle existing) |
| 4 | 11 Free No-Key APIs for AI Agents | "no API key business data API for AI agents" | `/free-tier` | Matches the dev.to-listicle format winning this query; Strale's 11 no-auth capabilities are a direct first-party answer, not a roundup. **Read the count from `/v1/platform/facts`, don't hardcode it.** | Low |
| 5 | x402 Company Data & KYB API — Pay-Per-Call in USDC, No Signup | "x402 pay per use API" | `/x402` | Strale is verified absent from x402-list.com and awesome-x402 where near-identical competitors (Kaisha, Sirenic, GlobalAPI) are listed. Pairs with §1.3/§1.6. | Low |
| 6 | KYB API Pricing — €0.05–€2.50 Per Check, No Subscription, No Minimum | "KYB API pay per call no subscription" | `/pricing` | Directly answers Didit's price-in-title pattern; per-check pricing across 20 countries is a stronger claim than single-country rivals. | Low |
| 7 | Sanctions / PEP / Adverse Media Check API — Pay Per Call, No Contract | KYB-adjacent compliance intent | `/capabilities/pep-check` | Current KYB-pricing winners are identity/KYC, not sanctions/PEP screening — an uncovered angle. **Must respect DEC-20260428-B framing: "screening checks found", never asserted fact.** | Low |
| 8 | MCP Server for Company & Business Registry Data — 27 Countries | "MCP server company data lookup" | `/mcp` | `companies-house-mcp` is UK-only; no multi-country company-data MCP server ranks. Pairs with the §2.3 awesome-list PR. | Medium |
| 9 | x402 vs API Keys for Business Data — When Pay-Per-Call Wins | "x402 pay per use API" / comparison intent | `/x402/vs-api-keys` | x402-list.com runs a generic `/learn/x402-vs-api-keys`; a KYB/company-data-specific version fills the vertical gap. | Medium |
| 10 | Company Registry API Coverage — hub + per-country pages | "[country] company registry API" × 20 | `/registries/{country}` | Mirrors the single most-repeated winning format across every country query tested (4 publishers own it). Templatable from `manifests/*.yaml`. | High |

**Sequencing note:** #1, #2 and #10 are the same template at three scales. Build #1 well, prove it ranks, then generate the rest from manifest data. Country counts and capability counts on these pages must read from `/v1/platform/facts` per the drift-prevention rule — these are exactly the surfaces where hardcoded numbers rot.

---

## 7. Attribution scheme

Consistent `?src=<channel>` tagging, one slug per channel, so conversion per channel is measurable:

`x402-list` · `x402scan` · `x402-ecosystem` · `awesome-x402` · `agent-tools` · `bazaar` · `agentic-market` · `mcp-registry` · `smithery` · `glama` · `pulsemcp` · `mcp-so` · `mcpmarket` · `lobehub` · `docker-mcp` · `awesome-mcp` · `langchain` · `awesome-langchain` · `flowise` · `langflow` · `composio` · `crewai`

**Three cautions:**

1. **Tag website URLs, not payable endpoints.** `https://strale.dev/?src=x402-list` is safe. `https://api.strale.io/x402/iban-validate?src=…` injects an undeclared query param into a capability whose schema declares only `iban` — it could trip input validation, and per the input-contract lesson (PR #171) undeclared-param handling deserves an explicit check rather than an assumption. Verify the gateway ignores unknown params before tagging any x402 URL.
2. **Don't tag the discovery documents.** `/.well-known/x402.json` and `/.well-known/agent-card.json` are machine-read and often cached or re-published by aggregators; a tagged copy propagates noise.
3. **Attribution will undercount.** Agents don't send referrers, and the x402 path has no session. Expect `?src=` to capture human clicks only; measure machine conversion via x402 endpoint volume against listing dates instead.

---

## 8. Recommended sequence

**Engineering decision (blocks the largest prize):**
0. Scope the CDP-facilitator question (§1.1). Full-mode, money-path review. Everything in Tier 1's cascade depends on it.

**Zero-risk, minutes each — no code, no authenticity exposure:**
1. Claim the Glama listing (§2.1)
2. `punkpeye/awesome-mcp-servers` PR (§2.3)
3. `xpaysh/awesome-x402` PR (§1.6)
4. x402-list.com form (§1.3)
5. agent-tools.cloud — MCP + A2A submissions (§1.4)
6. x402scan register (§1.2)
7. `x402-foundation/x402` ecosystem PR — needs a logo PNG (§1.5)

**Hygiene, same session:**
8. Refresh Smithery; resolve the possible duplicate (§2.2)
9. Version-bump the official registry so mirrors refresh; drop hardcoded counts from descriptions (§2.4)
10. Align PyPI keywords to the `strale-mcp` template (§3.10)
11. Confirm `strale.dev/docs` backs the merged LangChain card (§3.1)

**Audit before touching:**
12. `composio-strale` authenticity check (§3.4) — undocumented package, April-incident shape

**Content, in order:**
13. Pages #1–#4 (§6), then measure before building #5–#10

**Escalate as decisions, don't build:**
14. Anthropic Connectors OAuth + Team-plan question (§2.7)
15. Semantic Kernel → Microsoft Agent Framework repointing (§3.7)

---

## 9. Open items requiring a manual browser check

Fetches blocked by 403/429/SPA rendering — none are blockers, all are quick:

- `x402scan.com/resources` — is Strale already indexed? What does the register form ask?
- `smithery.ai/servers?q=strale` — is there a duplicate entry?
- `mcp.so/search?q=strale` · `mcpmarket.com` — listed or not?
- `x402catalog.com` · `a2alist.ai` — what are they, and is Strale there?
- `x402-foundation/x402` — full `category` enum and logo spec, from sibling `metadata.json` files
- `xpaysh/awesome-x402` — CONTRIBUTING rules (truncated in fetch)
- Docker MCP `server.yaml` field names — from a live remote-server example
