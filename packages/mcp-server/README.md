# strale-mcp

MCP server for [Strale](https://strale.io) — gives AI agents access to 233+ capabilities via 5 meta-tools. Compatible with Claude, ChatGPT, Cursor, Windsurf, GitHub Copilot, and any MCP client.

## Architecture

**Meta-tools only**: Instead of registering 233 individual tools (which exceeds limits in ChatGPT, Cursor, and Copilot), the server exposes 5 meta-tools. Agents discover capabilities via `strale_search`, then execute via `strale_execute`.

At startup, the server fetches the capability catalog, solutions, and trust data from the Strale API and caches them for search.

## Setup

### 1. Get a Strale API key

Sign up at the Strale API and get your API key (starts with `sk_`).

### 2. Configure your MCP client

There are two ways to connect: **Remote** (no installation needed) or **Local** (stdio transport).

#### Option A: Remote (Streamable HTTP) — Recommended

No installation required. Connect directly to the hosted MCP server.

**Claude Desktop / Claude Code:**

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

**Cursor** (`.cursor/mcp.json`):

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

**Any MCP client supporting Streamable HTTP:**

```
URL:    https://api.strale.io/mcp
Auth:   Authorization: Bearer sk_live_your_key_here
```

> **Note:** `strale_search`, `strale_methodology`, and `strale_trust_profile` work without an API key. `strale_execute` and `strale_balance` require authentication.

#### Option B: Local (stdio transport)

Run the MCP server locally on your machine:

**Claude Desktop / Claude Code:**

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

**Cursor** (`.cursor/mcp.json`):

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
| `STRALE_BASE_URL` | No | `https://api.strale.io` | API base URL |
| `STRALE_MAX_PRICE_CENTS` | No | `200` | Default max price per execution (€2.00) |

## Available Tools

| Tool | Auth Required | Description |
|------|:---:|-------------|
| `strale_search` | No | Search 233+ capabilities and 20+ solutions by keyword or category. Returns matches with price, input fields, SQS quality score, and trust grade. |
| `strale_execute` | Yes | Execute any capability by slug. Pass the slug and inputs from search results. Returns output data, cost, latency, and provenance. |
| `strale_methodology` | No | Get Strale's quality and trust methodology — SQS scoring, trust grades, test infrastructure, badge system, and current limitations. |
| `strale_trust_profile` | No | Get the full trust profile for any capability or solution — SQS breakdown, test results, pass rates, failure details, limitations, and badge status. |
| `strale_balance` | Yes | Check your wallet balance in EUR. |

## Usage Workflow

```
1. strale_search   → Find capabilities matching your needs
2. strale_trust_profile → (Optional) Check quality data for a specific capability
3. strale_execute  → Run the capability with the required inputs
```

### Example

```
Agent: strale_search(query: "swedish company")
→ Returns: swedish-company-data (€0.80, Required: company_name (string))

Agent: strale_execute(slug: "swedish-company-data", inputs: { company_name: "Spotify AB" })
→ Returns: { output: { org_number: "5568401925", ... }, price_cents: 80, latency_ms: 2340 }
```

## Development

```bash
# Build
npm run build --workspace=packages/mcp-server

# Run in development (with tsx)
npm run dev --workspace=packages/mcp-server
```

## How it works

1. Server starts and fetches capabilities, solutions, and trust data from the Strale API
2. Five meta-tools are registered: search, execute, methodology, trust_profile, balance
3. Agents use `strale_search` to discover capabilities with input requirements and quality scores
4. `strale_execute` sends `POST /v1/do` with `capability_slug` and `inputs`
5. The response (output, price, latency, provenance) is returned as structured text
6. Async capabilities (>10s) return a transaction ID for polling
7. Errors (insufficient balance, suspended capability, etc.) are returned with helpful messages
