Intent: Audit all outstanding PRs and distribution submissions, fix what can be fixed, submit to Windmill Hub.

# Session: 2026-04-15 — PR audit + fixes + Windmill submission

## What shipped

### PRs
- **Activepieces #12391** — confirmed MERGED 2026-04-06 by sanket-a11y. Notion row "Activepieces community piece" updated Pending → Live.
- **Langflow #12678** — branch was polluted with 30 unrelated `starter_projects/*.json` + `component_index.json` edits from a dev-env regeneration step (CodeRabbit was flagging them). Force-pushed clean branch rebased on current upstream/main. PR now contains only the 2 Strale component files (271 additions, 0 deletions). Posted explanatory comment on the PR. Notion row updated.
  - Work done in temp clone: `c:/tmp/langflow-strale-fix` (can be deleted).

### Distribution Surfaces DB
- Added two missing rows (were tracked in the old registry but not migrated in April cleanup):
  - **CrewAI examples** — PR #358 at crewAIInc/crewAI-examples
  - **Agno cookbook** — PR #7203 at agno-agi/agno
- DB now has 44 surfaces.

### Windmill Hub
- Resource type `strale` published: https://hub.windmill.dev/resource_types/374/strale
- 5 scripts submitted via web UI (Deno/TypeScript):
  - Search Capabilities
  - Execute Capability
  - Get Wallet Balance
  - Check Quality Score (no-auth)
  - Search and Execute
- Notion row "Windmill script hub" updated Not started → Pending.
- Note: Windmill Hub submission is entirely via web UI — no GitHub PR flow. The `windmill-labs/windmill-community` repo referenced in my initial instructions does not exist (corrected during session).

### Pipedream unblock
- Pipedream maintainer (michelle0927) on 2026-04-14 asked for an app request before the component PR could be reviewed.
- Filed app request issue: PipedreamHQ/pipedream#20611
- Commented back on PR #20584 linking the request.
- Notion row updated.

## Findings flagged (not fixed per user instruction)

### x402 Bazaar protocol extension — Notion status overstates reality
- Notion row marked **Live** since 2026-03-30.
- Live verification (2026-04-15):
  - Strale's `/x402/*` endpoints DO return proper Bazaar-compliant 402 responses with `extensions.bazaar.info` schema metadata. Protocol code is correct.
  - Coinbase CDP discovery registry: 6,468 endpoints, **0 Strale endpoints** (paginated through all).
  - PayAI discovery registry: ~152 endpoints, **0 Strale endpoints**.
  - Root cause: Strale's `x402.json` configures facilitator as `https://x402.org/facilitator`, which has no discovery catalog. Discovery is per-facilitator — CDP only indexes endpoints that use CDP as facilitator; same for PayAI.
- Fix options (user deferred):
  1. Switch facilitator to `api.cdp.coinbase.com` — gets into 6,468-endpoint catalog
  2. Multi-facilitator support
  3. Manual registration with CDP/PayAI
  4. Downgrade Notion row to Pending or annotate degraded-mode
- **User chose to leave the Bazaar row as-is for now.**

## Outstanding PR state (19 open)

### Waiting on maintainers (clean, no action needed)
- ever-works/awesome-mcp-servers #51 (clean)
- habitoai/awesome-mcp-servers #28 (clean)
- PatrickJS/awesome-cursorrules #212 (clean)
- sanjeed5/awesome-cursor-rules-mdc #32 (clean)
- IBM/mcp-context-forge #3974
- agentic-community/mcp-gateway-registry #723
- x402-foundation/x402 #1709
- pydantic/pydantic-ai #4866 (only human comments were resolved CI request + jokes — not actionable)
- langchain-ai/docs #3445
- FlowiseAI/Flowise #6209
- crewAIInc/crewAI-examples #358
- agno-agi/agno #7203

### Blocked, nothing to do from our side
- docker/mcp-registry #2202 — no maintainer response after 2 follow-ups
- awslabs/agentcore-samples #1232 — no maintainer response after 2 follow-ups
- Merit-Systems/awesome-x402 #111 — silence after 5 Petter comments
- detailobsessed/awesome-windsurf #283 — Notion says don't respond to further bot feedback
- heilcheng/awesome-agent-skills #163 — Vercel auth needs heilcheng team action

### Newly unblocked
- PipedreamHQ/pipedream #20584 — app request #20611 filed, awaiting integration approval
- langflow-ai/langflow #12678 — clean branch force-pushed, awaiting review

## Manual tasks still on Petter

1. Windmill Hub — scripts may get reviewer pings; respond as needed
2. Bazaar — decide fix approach when ready
