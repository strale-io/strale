# strale-mcp

MCP server for [Strale](https://strale.io) — exposes 233+ capabilities as tools for Claude, Cursor, Windsurf, and any MCP-compatible client.

## Architecture

**Thin Proxy (Option A)**: The MCP server calls the Strale HTTP API (`POST /v1/do`) for each tool invocation. This keeps it decoupled from the API internals and leverages all existing middleware (auth, rate limiting, circuit breaker, wallet locking, audit trail).

At startup, the server fetches all active capabilities from `GET /v1/capabilities` and registers each as an MCP tool with proper input schemas.

## Setup

### 1. Get a Strale API key

Sign up at the Strale API and get your API key (starts with `sk_`).

### 2. Configure your MCP client

#### Claude Desktop / Claude Code

Add to your MCP configuration (`claude_desktop_config.json` or `.claude/settings.json`):

```json
{
  "mcpServers": {
    "strale": {
      "command": "node",
      "args": ["/path/to/strale/packages/mcp-server/dist/server.js"],
      "env": {
        "STRALE_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "strale": {
      "command": "node",
      "args": ["/path/to/strale/packages/mcp-server/dist/server.js"],
      "env": {
        "STRALE_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

#### Windsurf

Add to your Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "strale": {
      "command": "node",
      "args": ["/path/to/strale/packages/mcp-server/dist/server.js"],
      "env": {
        "STRALE_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRALE_API_KEY` | Yes (for execution) | — | Your Strale API key |
| `STRALE_BASE_URL` | No | `https://strale-production.up.railway.app` | API base URL |
| `STRALE_MAX_PRICE_CENTS` | No | `200` | Default max price per execution (€2.00) |

## Available Tools

### Meta-tools

- **`strale_search`** — Search and filter capabilities by keyword or category. Use this first to find the right tool.
- **`strale_balance`** — Check your wallet balance.

### Capability tools (233+)

Every active Strale capability is registered as an MCP tool using its slug as the tool name. Examples:

| Tool | Description | Price |
|------|-------------|-------|
| `vat-validate` | Validate EU VAT number via VIES | €0.10 |
| `swedish-company-data` | Extract Swedish company data | €0.80 |
| `iban-validate` | Validate IBAN numbers | €0.05 |
| `invoice-extract` | Extract data from invoice images | €0.50 |
| `web-extract` | Extract structured data from web pages | €0.15 |
| `translate` | Translate text between languages | €0.10 |
| ... | [233 total capabilities](https://strale-production.up.railway.app/v1/capabilities) | |

Use `strale_search` to discover capabilities by keyword.

## Development

```bash
# Build
npm run build --workspace=packages/mcp-server

# Run in development (with tsx)
npm run dev --workspace=packages/mcp-server
```

## How it works

1. Server starts and fetches all active capabilities from the Strale API
2. Each capability is registered as an MCP tool with its JSON Schema as the input schema
3. When a tool is called, the server sends `POST /v1/do` with `capability_slug` and `inputs`
4. The response (output, price, latency, provenance) is returned as structured text
5. Async capabilities (>10s) return a transaction ID for polling
6. Errors (insufficient balance, suspended capability, etc.) are returned with helpful messages
