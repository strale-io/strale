# 2026-04-27 — x402scan indexing live + 13-PR distribution cleanup

**Intent:** Diagnose why Strale wasn't being indexed by x402scan / agentic.market, fix what was fixable on Strale's side, and clean up the 18 outstanding distribution PRs against the Distribution PR Integrity Protocol.

## What shipped

### Backend (4 commits, all on main)

1. **[`3436f82`](https://github.com/strale-io/strale/commit/3436f82) — `feat(x402): add spec-compliant /.well-known/x402 fan-out for x402scan`**
   New `GET /.well-known/x402` route returning `{ version: 1, resources: [absolute URL, ...] }` per [x402scan DISCOVERY.md](https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md). Strale already served `/.well-known/x402.json` (with extension) but x402scan's probe expects no extension.

2. **[`d4abc17`](https://github.com/strale-io/strale/commit/d4abc17) — `feat(x402): expose paid routes in /openapi.json with x-payment-info`**
   New `getX402OpenApiPaths()` in the gateway. `/openapi.json` now merges in 359 paid `/x402/*` paths annotated with `x-payment-info` (protocols + fixed-mode price), `security: []`, 402 + 200 responses, and parameters / requestBody from the capability's input_schema. Same DB-backed cache as `/.well-known/x402` — new paid capabilities surface automatically once `x402_enabled = true`.

3. **[`eb52a2c`](https://github.com/strale-io/strale/commit/eb52a2c) — `fix(x402): drop Payment-Required header on 402 responses`**
   Diagnosed via the `@agentcash/discovery` package (used by x402scan): if the response has a `payment-required` header, the probe **only** tries v2-base64 decoding and never falls back to body parsing. Strale's header was v1-encoded → v2 decode returns null → probe rejects every URL. Removed the two `c.header("Payment-Required", ...)` emissions in the wildcard handlers; v1 body remains the canonical source.

4. **[`087d4e5`](https://github.com/strale-io/strale/commit/087d4e5) — `fix(x402): exclude free-tier ($0) capabilities from paid-route discovery`**
   Free-tier capabilities skip the payment check and run the executor directly, returning 400 for empty inputs. The probe sees a non-402 status and rejects them. Added `x402PriceUsd > 0` filter in both `getX402WellKnownResources()` and `getX402OpenApiPaths()`. Free-tier remains reachable via `/v1/capabilities`, `/x402/catalog`, and direct calls.

### Result
- **358 / 358 paid endpoints registered on x402scan** with zero failures (verified via `https://www.x402scan.com/api/trpc/public.resources.registerFromOrigin` and confirmed in their public listings under `originId d7f288aa-e6b4-433d-a324-0842f3a75186`).
- `agentcash-discovery` CLI now reports paid routes correctly with no `L2_NO_PAID_ROUTES` warning.

### Distribution PR cleanup (12 of 13 PRs)

Audited all 18 open external PRs for Distribution PR Integrity Protocol violations. **Yanked-package references: zero** (clean). **Promotional language ("quality-scored", "trust layer", inflated counts): 13 PRs**.

Cleaned (PR body + content rewritten to neighbor-matching matter-of-fact tone, no bump comments):

| PR | Notes |
|---|---|
| [punkpeye/awesome-mcp-servers#3696](https://github.com/punkpeye/awesome-mcp-servers/pull/3696) | Pushed to wrong fork initially (caught by final audit). Right fork is `strale-io/awesome-mcp-servers`, not `petterlindstrom79/`. Also removed a duplicate Strale entry that had a broken link. |
| [ever-works/awesome-mcp-servers#51](https://github.com/ever-works/awesome-mcp-servers/pull/51) | **Force-pushed** — the original PR's single commit added 14+ unrelated MCP entries and removed Xata/Xiyan/Zilliz Milvus. Reset to upstream master, added a single clean line. |
| [habitoai/awesome-mcp-servers#28](https://github.com/habitoai/awesome-mcp-servers/pull/28) | Single-line description tightened. |
| [heilcheng/awesome-agent-skills#163](https://github.com/heilcheng/awesome-agent-skills/pull/163) | Plus a line-ending-normalization commit to fix CRLF/LF drift. |
| [PatrickJS/awesome-cursorrules#212](https://github.com/PatrickJS/awesome-cursorrules/pull/212) | `.cursorrules` description tightened. |
| [detailobsessed/awesome-windsurf#283](https://github.com/detailobsessed/awesome-windsurf/pull/283) | PR body only — rule files were already factual. |
| [docker/mcp-registry#2202](https://github.com/docker/mcp-registry/pull/2202) | Full trifecta dropped from `readme.md` + `server.yaml` + body. |
| [IBM/mcp-context-forge#3974](https://github.com/IBM/mcp-context-forge/pull/3974) | `docs/strale.md` + `mcp-catalog.yml`. |
| [agentic-community/mcp-gateway-registry#723](https://github.com/agentic-community/mcp-gateway-registry/pull/723) | Most polluted (16+ instances) across 3 files. |
| [awslabs/agentcore-samples#1232](https://github.com/awslabs/agentcore-samples/pull/1232) | Left AWS IAM `trust_policy` terminology untouched. |
| [FlowiseAI/Flowise#6209](https://github.com/FlowiseAI/Flowise/pull/6209) | Component description strings cleaned. |
| [langflow-ai/langflow#12678](https://github.com/langflow-ai/langflow/pull/12678) | Plus a follow-up commit fixing Ruff `RUF001` (curly apostrophe → ASCII), which was the failing CI check. |

### Notion updates
- **`x402scan` Distribution Surfaces row** flipped from `Blocked` → `Live`, notes rewritten to describe the four backend fixes that unblocked indexing.
- **`Distribution surfaces` overview page** updated: dropped "x402scan validator rejects valid 402 responses" from the "Not working" list, added the indexing win to "Working", protocol-ecosystem paragraph reflects current state.
- **12 PR-tracking rows** updated with cleanup notes and `Last verified = 2026-04-27`.
- **CrewAI examples row** flipped from `Pending` → `Blocked` — `crewAIInc/crewAI-examples` repo is archived (read-only). `gh pr edit` returns `Repository was archived so is read-only`.

## Open

1. **`punkpeye/awesome-mcp-servers` not in the Distribution Surfaces database** — only its `habitoai` and `ever-works` forks are tracked. Worth its own row now that PR #3696 is clean against the 30k+ star upstream.
2. **agentic.market direct listing** — Strale is in CDP merchant discovery (269 entries) but agentic.market's listings are hand-curated (`enriched: true` flag). Direct outreach to Coinbase product needed; not auto-pulling from CDP.
3. **All 12 cleaned PRs are mergeable but unreviewed.** No bump comments added per existing pattern (Petter has bumped each ~4× already; more would be counterproductive).
4. **Two distribution PRs are now genuinely dead:**
   - `crewAIInc/crewAI-examples#358` — repo archived
   - Possibly `coinbase/x402#14` was already closed (correct fork is `x402-foundation/x402`)

## Non-obvious learnings

- **`@agentcash/discovery`'s probe treats the `payment-required` header as v2-only.** This is upstream behavior we can't change. Strale's choice is to either not emit the header (what we did) or emit it as v2-formatted while keeping body v1 (incoherent, rejected). Worth knowing if other tools in the x402 ecosystem do the same.
- **agentcash's discovery is OpenAPI-first with no fallback.** If `/openapi.json` returns 200, `/.well-known/x402` is never tried. Strale's `/.well-known/x402` fix alone wouldn't have unblocked indexing — annotating openapi was the actual fix.
- **`gh repo clone` on Windows enables `core.autocrlf=true` by default**, which converts LF→CRLF on checkout. Setting `core.autocrlf false` *after* cloning doesn't fix already-checked-out files. Workflow now: clone, then `git config core.autocrlf false`, then `git rm --cached` or re-checkout the files we'll edit. Saved a re-do twice this session.
- **GitHub Pull Request head-ref can come from any fork**, not just the user's personal fork. PR #3696 was from `strale-io/awesome-mcp-servers` (org fork), and pushing to `petterlindstrom79/awesome-mcp-servers` did nothing for that PR. Check `head.repo.full_name` via `gh api` first when a "fix" doesn't appear in the PR diff.
- **Force-pushing fork branches is fine when the PR's head and current state are both ours**, but it's a real action that re-triggers CI and notifies maintainers. Used once this session (ever-works) to recover from earlier scope corruption.

## Cost

No external paid-API spend this session. Backend deploys via Railway (already paid-for hosting). All cleanup commits are within the bandwidth/storage costs of GitHub free.
