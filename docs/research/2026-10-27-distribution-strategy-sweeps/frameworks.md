# Framework integrations: which native packages are worth building (2026-10-27)

> Evidence appendix to [../2026-10-27-distribution-strategy.md](../2026-10-27-distribution-strategy.md). Written by a read-only research agent on 2026-10-27; raw API dumps referenced below (`research/raw/`, `research/data/`) were working files and are not kept in the repository.

Read-only research. Nothing in the repo was changed, nothing was published, and no one was contacted.
Confidence: **H** = measured or read directly in this session. **M** = documentation or search result, not checked against code. **L** = inference.

## 0. Method notes (read before trusting numbers)

- **npm `downloads/point/last-month` was stale.** Through the proxy it returned the window 2026-06-02..2026-07-01. Every npm figure below comes from `api.npmjs.org/downloads/range/2026-09-26:2026-10-26/<pkg>` instead. That endpoint returned 31 days, with non-zero counts as late as 2026-10-25. **H**
- **PyPI figures** are `pypistats.org/api/packages/<pkg>/recent` → `last_month`. pypistats is internally inconsistent: langchain-strale shows last_week 39 against last_month 21. **H (raw), L (meaning)**
- **The download noise floor is high.** The three **yanked** packages still get as many downloads as the live ones: openai-agents-strale 36/mo, google-adk-strale 25, pydantic-ai-strale 9. So double-digit monthly counts for our packages mostly measure mirrors and bots, not users. **H (numbers), L (interpretation)**
- **GitHub stars** come from the GitHub search API, read 2026-10-27. The REST `repos/*` endpoint is blocked in this session. **H**

## 1. Audit of our existing packages

| Package | Registry / version | Last publish | 30-day downloads | Framework code? | Test? | Stale content | Verdict |
|---|---|---|---|---|---|---|---|
| `strale-mcp` | npm 0.2.8 | 2026-08-23 | 181 | n/a (MCP SDK) | — | README: "250+", "81 solutions" (live: 298 visible capabilities, 95 solutions). The package.json description leads with "pre-flight check any paid API" | **Keep, the main surface.** Fix the counts. |
| Remote MCP `https://api.strale.io/mcp` | — | live | — | Streamable HTTP; `initialize` returned 200, protocol 2025-06-18 | — | serverInfo version "0.1.0" | **This is the integration for every MCP-capable framework.** **H** |
| `straleio` (TS SDK) | npm 0.1.3 | 2026-08-14 | 18 | — | has `test/` | `types.ts:59` says "Trust layer metadata (quality scores…)". SQS is retired. | Keep. Fix the comment. |
| `straleio` (Py SDK) | PyPI 0.1.4 | 2026-08-13 | 17 | — | none in package | — | Keep. |
| `langchain-strale` | PyPI 0.1.4 | 2026-03-26 | 21 | Yes: `BaseTool`, `BaseToolkit` from `langchain_core` | `tests/test_toolkit.py` exists, but every test is `skipif(not STRALE_API_KEY)` and CI runs no Python tests. **Effectively untested.** | "250+", "27 countries", "Returns structured JSON with quality scores" (README:98). Pins `langchain-core>=0.2.0`; current is 1.7.0 and the package has never been tested against 1.x. `get_tools()` returns about 300 tools at once (context blow-up; the MCP server went meta-tool for exactly this reason). User-Agent hardcoded `0.1.0`. `execute()` never checks HTTP status. | **Real but stale.** Listed in LangChain's `integration_external_docs.yaml` (line 1069, links to strale.dev/docs). Refresh, don't rebuild. |
| `straleio-langchain` (TS) | npm 0.1.0 | 2026-02-26 | 17 | Yes: `Tool` from `@langchain/core/tools`. A single "fallback" tool. | **No test.** Not covered by `check-framework-packages.mjs` (its rule matches only `langchain-strale`). | devDep `@langchain/core ^0.3.0`; current is 1.3.0. Uses the deprecated `Tool` string-input class, not `tool()` / `StructuredTool`. Unpublished for 8 months. | **Weakest live package.** Fold it into a refresh, or deprecate it. |
| `crewai-strale` | PyPI 0.1.4 | 2026-03-26 | 26 | Yes: `crewai.tools.BaseTool` | Same live-key-gated tests, never run in CI | "250+", "27 countries", "quality scores". Pydantic v1-style `class Config`. Returns about 300 tools. crewai is now 1.15.30. | Real but stale. CrewAI has native MCP (§2), so this is low value. |
| `composio-strale` | PyPI 0.1.4 | 2026-03-30 | 11 | Yes: `@composio.tools.custom_tool(toolkit="strale")` | `tests/test_toolkit.py` only checks the constructor and imports. **It never exercises a Composio primitive.** | README: "270+ **quality-scored**". Pins `composio>=0.7.0`; current is 0.30.0, and the custom-tool API was not re-verified. | Hollow-ish test. Low value. |
| `strale-semantic-kernel` | npm 0.1.4 | 2026-03-26 | 28 | Imports `kernelFunction` from npm **`semantic-kernel`**. That package is an **unofficial community port** (afshinm/semantic-kernel-js; its README says "This project is not an official Microsoft product"): 0.3.0, last published 2025-09-05, **418 downloads/30d**. | Live-key-gated `node:test`, skipped in CI | Our README calls it a "Semantic Kernel plugin" and never says "unofficial port". JSDoc imports `@strale/semantic-kernel`, which is not the real package name. Microsoft SK has no official JS SDK and is itself superseded by Microsoft Agent Framework (SK README). | **Reputational risk, near-zero audience.** Recommend deprecation (§3). |
| `strale-capabilities` | npm 0.1.0 | 2026-03-22 | 7 | — | — | "250+", "27 countries" | A frozen snapshot from March. Regenerate it or retire it. |
| `skill` (SKILL.md) | not a registry package | — | — | — | — | **Worst stale copy.** "Quality-scored API capabilities" (line 14), a "Quality scores" section describing the dual-profile SQS (lines 222+), and "250+". | Rewrite. It actively misdescribes the product. |
| `google-adk-strale`, `openai-agents-strale`, `pydantic-ai-strale` | PyPI 0.1.1, **yanked** | 2026-03-25 | 25 / 36 / 9 | none (that was the incident) | — | `docs/operations/distribution-registry.yaml` still records all three as `status: published` (2026-09-11). That is wrong: they are yanked. | Leave yanked. Fix the registry rows. |

Integrity check: `node apps/api/scripts/check-framework-packages.mjs` → 4 active packages OK, 3 deprecated skipped. **H.**
Gaps in the check:
- It proves only that a framework import exists. It cannot see untested packages, stale API pins, or an unofficial upstream.
- It skips `packages/langchain` (the TS package).

**Old upstream PRs (H, fetched pages)**
- **Flowise #6209:** open, no maintainer review, and **FlowiseAI/Flowise is now archived** (search API `archived: true`). Dead. The distribution registry says "open".
- **Langflow #12678:** open since 2026-04-13. No visible maintainer comment. CodeRabbit flagged 12 issues plus missing tests. The component is not in upstream `main`.
- **crewAI-examples #358:** the repo is archived (already recorded). **crewAI-tools is archived too**: its README says tools moved to `crewAIInc/crewAI/lib/crewai-tools`.
- **Pipedream:** `components/strale/package.json` (0.1.1) exists upstream and `pipedream.com/apps/strale` returns 200. **The base app is live**, but the registry YAML has no Pipedream row. Whether action PR #20584 merged was not verified.
- **LangChain docs #3445:** merged 2026-08-07 (per the registry). The YAML listing is confirmed present.

## 2. Framework-by-framework

Adoption figures are 30-day downloads (npm range 2026-09-26..10-26; PyPI pypistats last_month) plus GitHub stars on 2026-10-27. All **H** unless marked.

| Framework | Stars | Downloads / 30d | Built-in MCP client? | How third parties get in | Native package worth it? |
|---|---|---|---|---|---|
| **LangChain (Py)** | 148,555 | langchain 170.5M; langchain-core 144.8M | Yes, via `langchain-mcp-adapters` (6.16M/mo) | Standalone package in your own org (`langchain-<x>`). No PRs to the main repo. File an "Integration listing" issue in `langchain-ai/docs`; automation edits `integration_external_docs.yaml`. A hosted guide needs **50k+ monthly downloads** or "featured" status (docs, **H**) | **Already have it.** Refresh to langchain-core 1.x, switch to the meta-tool pattern, add a real offline test. Don't build anything new. |
| **LangChain (JS)** | 18,298 | @langchain/core 22.6M; langchain 11.2M | Yes, `@langchain/mcp-adapters` (1.01M) | Same policy (standalone on npm) | Only as part of the refresh. MCP adapters cover it. |
| **LangGraph** | 43,984 | langgraph 44.8M (Py); @langchain/langgraph 13.6M | Uses LangChain tools plus MCP adapters | No separate tool ecosystem: it consumes LangChain `BaseTool`s | **No separate package.** langchain-strale tools already work in LangGraph. Say so in the docs. |
| **CrewAI** | 60,167 | crewai 2.44M; crewai-tools 1.83M | Yes. CrewAI has MCP support (MCPServerAdapter / agent-level MCP config) **M** | Tools live in the `crewAI` monorepo (`lib/crewai-tools`). The old crewAI-tools repo is archived. There is also a commercial "Tool Repository" in CrewAI AMP **M** | **No.** Keep crewai-strale on maintenance (or deprecate). MCP covers it. |
| **LlamaIndex** | 52,684 | llama-index-core 6.57M | Yes, `llama-index-tools-mcp` (65k/mo) | Integrations live in the monorepo as separate `llama-index-tools-<x>` packages. "New integrations should meaningfully integrate with existing framework components… may be declined" **M**. llama-hub merged into the main repo. | **Skip for now.** Smaller agent-tool audience (now "document processing platform"), and MCP covers it. A ToolSpec PR would also put us inside their monorepo CI and review burden. |
| **Vercel AI SDK** | 27,538 | `ai` **109.7M**; `@ai-sdk/mcp` 18.4M | Yes (`@ai-sdk/mcp` `createMCPClient`) | **Curated Tools Registry** at ai-sdk.dev/tools-registry. Add an entry to `content/tools-registry/registry.ts` in vercel/ai by PR. Vendors publish their own npm package from the `vercel-labs/ai-sdk-tool-as-package-template` template. **20 entries today**, mostly direct peers of Strale: Exa, Tavily, Perplexity, Parallel, Firecrawl, Browserbase, You.com, Valyu, AgentMail (**H**) | **Yes. Best candidate.** See §3. |
| **OpenAI Agents SDK** | 30,328 (py); 3,947 (js) | openai-agents 12.4M (Py); @openai/agents 7.53M | Yes: `MCPServerStreamableHttp`, plus hosted MCP tool via the Responses API **M** | No third-party tool registry. Function tools are plain decorated Python functions. | **No.** The remote MCP URL is a one-liner. A native package would recreate the yanked openai-agents-strale with almost no framework surface to use. High reputational risk. |
| **Mastra** | 29,115 | @mastra/core 7.61M; @mastra/mcp 2.60M | Yes, `@mastra/mcp` MCPClient; MCP is a first-class topic | Mastra tools are `createTool()`. No formal third-party tool registry was found (**L**). | **No for now.** MCP is first-class here. A docs/example PR at most. |
| **Pydantic AI** | 20,903 | pydantic-ai-slim 23.9M; pydantic-ai 5.38M | Yes: `MCPServerStreamableHTTP` toolsets **M** | Third-party toolsets docs page (PR #4866 was rejected) | **Skip, and don't approach.** The maintainers publicly rejected us. MCP covers it fully. Any return needs a genuinely native `FunctionToolset`/`AbstractToolset` with tests, plus a clear reason MCP is not enough, and there isn't one. |
| **Google ADK** | 22,021 (py) | google-adk 10.1M | Yes: `McpToolset` **M** | adk.dev integrations catalog, with a contribution guide in `google/adk-docs`. Community code lives in `google/adk-python-community` (188 stars). The CONTRIBUTING file bans integrations that violate ToS. **M** | **Not a package.** If anything, an adk.dev catalog *docs page* showing `McpToolset` → `https://api.strale.io/mcp`. That costs nothing and gives an honest listing. |
| **Agno** | 42,917 | agno 1.78M | Yes: `MCPTools` **M** | Toolkits are added to the main repo by PR (`agno/tools/*`, fork + PR + ruff/mypy). Our cookbook PR #7203 has been open since 2026-06-06 (registry). | Possible later: a real `Toolkit` subclass in-tree is accepted practice. Medium effort, and it depends on maintainer review. Second tier. |
| **Semantic Kernel / MS Agent Framework** | SK 28,704; MAF 14,340 | semantic-kernel (Py) 301k; agent-framework (Py) 190k; npm `semantic-kernel` (unofficial) **418** | Yes (MAF: "interoperability via A2A and MCP"; SK README) | SK is superseded by MAF. No official JS SDK exists. | **Deprecate strale-semantic-kernel.** Don't build an MAF package; MCP covers it. |
| **Composio** | 30,775 | composio 1.73M (Py); @composio/core 4.17M | Composio *is* a tool platform (1000+ toolkits) and exposes MCP | Custom tools live in user code. Toolkit listing is Composio's own catalog decision. | **No new work.** composio-strale is user-side custom-tool glue. Keep on maintenance or deprecate. |
| **n8n** | 208,742 | n8n 447k | Yes: MCP Client Tool node (official docs reference it) **M** | Community nodes (`n8n-nodes-*` npm). **Verified** nodes go through the Creator Portal: MIT licence, no runtime deps, and since 2026-05-01 a GitHub Actions publish with provenance **M** | **Maybe later.** A huge audience and a real native primitive (`INodeType`), which suits non-agent workflow users that MCP doesn't reach well. Effort 3–5 days plus review with no timeline. Second tier. |
| **Dify** | 159,696 | (no package metric) | MCP plugins exist in the marketplace (community `mcp_sse` plugin supports Streamable HTTP) **M** | Plugin marketplace; the submission process was not verified | Skip for now. MCP route exists. |
| **Flowise** | 55,529 | flowise 9.9k (npm) | Has MCP tool node **M** | **Repo archived** (`archived: true`) | **Skip.** Our PR #6209 is dead. |
| **Langflow** | 156,061 | (n/a) | Yes: MCP Tools component (connects by HTTP/SSE URL) **M** | Components PR into the main repo. Ours (#12678) has had no maintainer action for 6 months, and CodeRabbit flagged no tests. | **Skip native.** MCP Tools covers it. Consider closing #12678 rather than leaving a stale PR open. |
| **Pipedream** | 11,759 | @pipedream/platform 569k | Pipedream also offers MCP **L** | Public registry, PR plus review | **Already live** (base app). Low incremental value. Record it in the registry. |
| **Zapier** | — | — | Zapier MCP exists **L** | Developer Platform. A public listing needs **integration ownership** plus app review (~1 week first response). Prohibited/restricted-app rules apply. **M** | Defer. Strale owns its API, so it would qualify, but the audience is non-developer automation. Revisit after demand is proven. |

## 3. Recommendation

### Build first: a Vercel AI SDK tool package (`strale-ai-sdk` or a scoped name), listed in the AI SDK Tools Registry

Why this one (all **H** except where marked):
1. **Distribution, not technical need, decides it.** The registry is a curated list of 20 entries made up of exactly our peer set: agent-facing data and tool APIs (Exa, Tavily, Perplexity, Parallel, Firecrawl, Valyu, You.com). Being on it puts Strale where AI SDK users (`ai`: 109.7M downloads/30d) look for tools. MCP does not get us onto that page.
2. **The acceptance norm fits us.** Vendors publish their own package and add one registry entry by PR. That is exactly what we'd do, so no maintainer has to adopt our code.
3. **The native primitive is real and small.** The package would contain:
   - `tool()` from `ai`, with a zod or `jsonSchema` `inputSchema` and an `execute`;
   - `strale.search` and `strale.execute` meta-tools, plus a typed factory `straleTool("iban-validate")` that builds `inputSchema` from the capability's `input_schema`;
   - an optional x402/wallet rail later.

   A test can use `MockLanguageModelV*` from `ai/test`: drive `generateText({ tools })` through a tool call, with `fetch` mocked, so it runs offline in CI. That is a framework-primitive test, not a live-key-gated stub.
4. **TypeScript and serverless/edge users benefit for real.** There is no MCP client lifecycle or transport session to manage, which matters in short-lived functions. That makes it more than a re-wrap. **M/L**
5. **Effort:** about 2–3 days, including the README, an example, and the CI test. **Reputational risk is low**, provided the README says plainly that the remote MCP server is the alternative and the package imports `ai` for real (add a rule to `check-framework-packages.mjs` for it).

Honest counterpoint: AI SDK users can already call `createMCPClient` against `https://api.strale.io/mcp`. If the registry PR isn't accepted, the package's value drops to marginal. **Open the registry PR (step 2 of the playbook) in the same batch, and treat a rejection as the stop signal.**

### Do before (or with) that: refresh what already exists
- `langchain-strale` is the only native package with a confirmed live listing (LangChain YAML). Re-test it on langchain-core 1.x, switch `get_tools()` default to meta-tools plus opt-in slugs, add an offline test that runs in CI, remove "quality scores" / "250+" / "27 countries", and republish. **About 1 day.** Same pass for `straleio-langchain`, or deprecate it in favour of `@langchain/mcp-adapters`.
- Rewrite `packages/skill/SKILL.md` (it describes the retired SQS engine) and fix the `strale-mcp` README counts. These are public stale claims (LESSONS F6).

### Skip (MCP covers it, or the risk outweighs the reach)
- **OpenAI Agents SDK, Pydantic AI, Google ADK:** each has a built-in streamable-HTTP MCP client, and all three are the frameworks we were burned on. Publish copy-paste MCP snippets in our own docs. Optionally submit an adk.dev catalog page that shows only `McpToolset`.
- **Mastra, LlamaIndex, Langflow, Dify, Composio, MS Agent Framework:** MCP is first-class in each. No native package.
- **Flowise:** the repo is archived.
- **Semantic Kernel:** deprecate `strale-semantic-kernel`. It binds to an unofficial 418-downloads/month port of a framework Microsoft has superseded, and its README doesn't disclose that.
- **CrewAI:** freeze `crewai-strale` on maintenance. Don't invest further.

### Second tier (revisit after the AI SDK result)
- **n8n verified community node:** a large, non-MCP-native workflow audience. Strict verification rules (MIT, no deps, provenance publish).
- **Agno in-tree Toolkit:** accepted practice, but it depends on reviewers. PR #7203 has been unreviewed since June.

## 4. Housekeeping found (not done; read-only)
- `docs/operations/distribution-registry.yaml` has four problems:
  - the three yanked packages are listed as `published`;
  - Flowise #6209 is listed as `open` on an archived repo;
  - there is no Pipedream row, though the app is live;
  - Langflow #12678 has gone 6 months without maintainer action.
- `check-framework-packages.mjs` does not cover `packages/langchain` (TS) and does not check that a test exercises the framework.
- No framework-package test runs in CI. The live tests all skip without `STRALE_API_KEY` (LESSONS F5 pattern).

## Sources
- LangChain publishing policy: https://docs.langchain.com/oss/python/contributing/publish-langchain
- LangChain listing YAML (Strale at line 1069): https://raw.githubusercontent.com/langchain-ai/docs/main/scripts/data/integration_external_docs.yaml
- AI SDK Tools Registry: https://ai-sdk.dev/tools-registry · registry file https://github.com/vercel/ai/blob/main/content/tools-registry/registry.ts
- crewAI-tools deprecation notice: https://raw.githubusercontent.com/crewAIInc/crewAI-tools/main/README.md
- Semantic Kernel → Agent Framework: https://github.com/microsoft/semantic-kernel (README)
- Unofficial SK JS port: https://github.com/afshinm/semantic-kernel-js (`src/semantic-kernel/README.md`)
- Google ADK integrations catalog and contributing: https://adk.dev/integrations/ · https://raw.githubusercontent.com/google/adk-docs/main/CONTRIBUTING.md
- n8n verification guidelines: https://docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines · submission https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes
- Agno contributing: https://docs.agno.com/how-to/contribute
- LlamaIndex integrations: https://developers.llamaindex.ai/python/framework/community/integrations/
- Langflow MCP client: https://docs.langflow.org/mcp-client · Flowise MCP: https://docs.flowiseai.com/tutorials/tools-and-mcp
- Pipedream contributing: https://pipedream.com/docs/components/contributing · Zapier publishing requirements: https://docs.zapier.com/platform/publish/integration-publishing-requirements
- PR pages: https://github.com/langflow-ai/langflow/pull/12678 · https://github.com/FlowiseAI/Flowise/pull/6209
- Download APIs: api.npmjs.org/downloads/range/2026-09-26:2026-10-26/<pkg>; pypistats.org/api/packages/<pkg>/recent; registry.npmjs.org; pypi.org/pypi/<pkg>/json
