# MCP Quickstart — strale-mcp

Give Claude Desktop, Claude Code, Cursor, or any MCP client direct access to
every Strale capability through the Model Context Protocol. No custom code —
this is configuration only.

Two ways to connect:

| Option | Install | Auth | Best for |
|---|---|---|---|
| **A. Remote (Streamable HTTP)** | None — connects to the hosted server | `Authorization: Bearer` header | Fastest to set up, always up to date |
| **B. Local (stdio)** | `npx strale-mcp` | `STRALE_API_KEY` env var | Air-gapped/offline dev, custom `STRALE_BASE_URL` |

Both expose the same tools — `strale_search`, `strale_execute`,
`strale_balance`, and more, covering the full capability catalog via a
small set of meta-tools (registering 250+ capabilities as individual MCP
tools would exceed limits in several clients, so Strale exposes search +
execute-by-slug instead).

## Prerequisites

- A Strale API key — sign up at [strale.dev/signup](https://strale.dev/signup)
  for EUR 2.00 free trial credit, no card required. (`strale_ping`,
  `strale_search`, `strale_methodology`, and `strale_trust_profile` work
  without a key; `strale_execute` works without a key only for the free-tier
  capabilities, e.g. `email-validate`, `iban-validate`, `dns-lookup`.)
- Node.js 20+ if using Option B (local stdio).

## Option A: Remote (recommended — no install)

1. Find your MCP client's config file. For **Claude Desktop**:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Merge in [`claude_desktop_config.remote.example.json`](./claude_desktop_config.remote.example.json),
   replacing `sk_live_PLACEHOLDER` with your real key:

   ```json
   {
     "mcpServers": {
       "strale": {
         "type": "streamableHttp",
         "url": "https://api.strale.io/mcp",
         "headers": {
           "Authorization": "Bearer sk_live_your_key_here"
         }
       }
     }
   }
   ```

3. Restart Claude Desktop.

Cursor uses the same shape in `.cursor/mcp.json`. Any other client that
speaks MCP Streamable HTTP: point it at `https://api.strale.io/mcp` with
that same `Authorization` header.

## Option B: Local (stdio)

1. Merge in [`claude_desktop_config.local.example.json`](./claude_desktop_config.local.example.json),
   replacing `sk_live_PLACEHOLDER`:

   ```json
   {
     "mcpServers": {
       "strale": {
         "command": "npx",
         "args": ["-y", "strale-mcp"],
         "env": {
           "STRALE_API_KEY": "sk_live_your_key_here"
         }
       }
     }
   }
   ```

2. Restart your MCP client. It will run `npx -y strale-mcp` itself — no
   separate `npm install -g` step needed (though `npm install -g strale-mcp`
   works too, and avoids the download-on-every-launch npx behavior).

Optional env vars: `STRALE_BASE_URL` (default `https://api.strale.io`),
`STRALE_MAX_PRICE_CENTS` (default `200` = EUR 2.00 per call — the safety
ceiling passed as `max_price_cents` on every `strale_execute` call).

## Verify it's connected

Ask your MCP client something like:

> What Strale tools do you have, and what does `strale_search` find for
> "VAT validation"?

A working connection calls `strale_search` and returns matches like
`vat-validate` with its price and input schema. To spend nothing while
verifying, try a free-tier capability:

> Use Strale to validate the IBAN `SE4550000000058398257466`.

## Verified

- **Remote:** `POST https://api.strale.io/mcp` with an MCP `initialize`
  request returned a valid handshake (`protocolVersion: "2025-06-18"`,
  `serverInfo: {"name":"strale", ...}`) on 2026-08-13 — the hosted endpoint
  is live.
- **Local:** `npx strale-mcp` started cleanly on 2026-08-13, loaded the
  live capability and solution catalog from `https://api.strale.io`, and
  began serving on stdio.

## Source

- MCP server package: [`strale-mcp` on npm](https://www.npmjs.com/package/strale-mcp)
  (this repo: `packages/mcp-server/`)
- Discovery: [`GET /.well-known/mcp.json`](https://api.strale.io/.well-known/mcp.json)
