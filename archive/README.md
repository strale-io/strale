# archive/

Historical artifacts extracted from work-in-progress storage during the
2026-04-18 unfinalized-work resolution. These files are **not build
dependencies**; they exist for historical reference only.

## Subtrees

### `submissions/`

Source material for plugin / catalog / marketplace submissions Petter made
to agent-ecosystem repos. Each subdirectory is one platform:

| Platform | Upstream status (at time of extraction) |
|---|---|
| `agentic-community-submission/` | MCP Gateway Registry — submission via `agentic-community/mcp-gateway-registry#723` (open) |
| `bedrock-agentcore-submission/` | AWS Bedrock AgentCore — submission via `awslabs/agentcore-samples#1232` (open) |
| `docker-mcp-submission/` | Docker MCP Registry — submission via `docker/mcp-registry#2202` (open) |
| `ibm-contextforge-submission/` | IBM MCP Context Forge — submission via `IBM/mcp-context-forge#3974` (open) |

These are separate from the three plugin submissions whose worktrees were
discarded on the same day (Flowise, LangFlow, Windmill Hub — all live
upstream per `PRE_RESOLUTION_INVESTIGATION.md`).

### `growth-ops/`

Marketing and distribution material drafted during March–April 2026:

- `devto-sqs-methodology.md` — long-form dev.to article on the SQS model
- `fact-check-audit.md` — dev.to fact-check pass
- `tweets-v2.md` — drafts for the X/Twitter content calendar
- `typefully_drafts.txt` — Typefully queue snapshot
- `upload-graphics.sh` — helper script for graphic uploads
- `current-og-image.png` + `graphics/*.png` — 19 promotional graphics
  (dev.to covers, SQS distribution charts, Twitter post visuals)

### `sessions/`

Audit / investigation / retrospective documents from pre-Phase-B work:

- `AUDIT-*.md`, `DIAGNOSTIC-*.md`, `STRATEGIC-*.md`, `REVIEW_TEMPLATE.md` — solo audits + templates
- `strale-*-audit-2026-04-08.md` × 4 — the Apr-08 audit cluster (capabilities, correlation, conversion, real-users)
- `capability-inventory.md`, `gate4b-*.md`, `gate5-*.md` — rollout retrospectives
- `x402-gateway-design.md` — initial design document for the x402 gateway
- `bosch-kyb-response-final*.json` × 3 — Bosch KYB PoC response snapshots (iterations v1, v2, v3)
- `digest-preview.html` — rendered sample of the daily digest email
- `01-eu-company-data.md` — research notes for EU company-data capability sources
- `handoff-from-code/` — session handoffs from agents (2026-04-15 and 2026-04-16)

## How these got here

Extracted from `stash@{0}` (pre-Phase-C-closeout-session, ~18 hours old at
time of extraction) during Batch 2 of the 2026-04-18 resolution session.
The stash's tracked changes (`/health/deep` + REINDEX) shipped via PRs
#13 and #14. The stash's untracked half was 76 files; 57 landed here, 19
were discarded (secrets, a 19 MB binary, and 14 one-off scratch scripts).

See `RESOLUTION_REPORT.md` at repo root for the full per-file
classification table.
