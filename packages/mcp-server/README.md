# strale-mcp

MCP server for [Strale](https://strale.io) — gives AI agents access to 250+ capabilities via 8 meta-tools. Compatible with Claude, ChatGPT, Cursor, Windsurf, GitHub Copilot, and any MCP client.

The MCP server version reported in the `initialize` response matches the npm package version.

## Installation

```bash
npx strale-mcp
```

Or install globally:

```bash
npm install -g strale-mcp
```

## Architecture

**Meta-tools only**: Instead of registering 250+ individual tools (which exceeds limits in ChatGPT, Cursor, and Copilot), the server exposes 8 meta-tools. Agents discover capabilities via `strale_search`, then execute via `strale_execute`.

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

> **Note:** `strale_ping`, `strale_search`, `strale_methodology`, and `strale_trust_profile` work without an API key. `strale_execute` and `strale_balance` require authentication.

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

## Available Tools (8)

### Highlighted: Pre-flight check for paid APIs

Before your agent pays for any external API call, use `paid-api-preflight` to verify the endpoint is live, the SSL is valid, and the payment handshake (L402, x402, or MPP) is properly configured. Returns a simple proceed/caution/avoid recommendation. Costs €0.02.

### Example capabilities

| Tool | Description | Price |
|------|-------------|-------|
| `paid-api-preflight` | Verify any paid API endpoint before your agent spends money (L402, x402, MPP) | €0.02 |
| `vat-validate` | Validate EU VAT number via VIES | €0.10 |
| `swedish-company-data` | Extract Swedish company data | €0.05 |
| `email-validate` | Verify email deliverability | Free |
| `iban-validate` | Validate international bank account numbers | Free |

### Meta-tools

| Tool | Auth Required | Description |
|------|:---:|-------------|
| `strale_ping` | No | Health check. Returns server status, tool count, and capability count. |
| `strale_getting_started` | No | Onboarding guide. Returns free capabilities available without an API key, usage steps, and signup link. |
| `strale_search` | No | Search 250+ capabilities and 81 solutions by keyword or category. Returns matches with price, input fields, and geography. |
| `strale_execute` | No* | Execute any capability by slug. Returns output data, cost, latency, and data provenance. *Free-tier capabilities work without an API key. |
| `strale_methodology` | No | Returns Strale's trust methodology as a short reference document — test cadence, audit records, and provenance. |
| `strale_trust_profile` | No | Returns the trust profile for any capability or solution — lifecycle state, last-tested timestamp, test history, known limitations, data source and provenance, and cost envelope. Exposes no single numeric quality score. |
| `strale_balance` | Yes | Returns your wallet balance in EUR cents and EUR. |
| `strale_transaction` | No* | Returns a past execution record by transaction ID: inputs, outputs, latency, price, provenance, and failure categorization. *Free-tier transactions accessible by ID only. |

## Trust Data

Strale does not publish a single numeric quality score. The dual-profile scoring engine (Quality Profile + Reliability Profile combined into a 0–100 SQS via a 5×5 matrix) was deleted 2026-05-05 (DEC-20260503-B). In its place:

- `strale_methodology` returns a short reference document — test cadence, the audit trail, provenance fields, and capability lifecycle states.
- `strale_trust_profile` returns the capability's trust profile: lifecycle state, last-tested timestamp, recent test history, known limitations, data source and provenance, and cost envelope.

### Search result fields

```json
{
  "type": "capability",
  "slug": "vat-validate",
  "name": "VAT Validate",
  "description": "Validate an EU VAT number via VIES",
  "category": "compliance",
  "geography": "eu",
  "price": "€0.10",
  "input_fields": "Required: vat_number (string)"
}
```

### Execute response fields

```json
{
  "output": { ... },
  "price_cents": 10,
  "latency_ms": 340,
  "wallet_balance_cents": 1890,
  "provenance": { "source": "VIES", "fetched_at": "2026-08-30T12:00:00Z" },
  "transaction_id": "txn_...",
  "next_steps": [
    "Transaction ID recorded. Call strale_transaction with id \"txn_...\" to retrieve the full audit record.",
    "Call strale_trust_profile with slug \"vat-validate\" to see how this source is tested and evidenced.",
    "Call strale_search to find related capabilities."
  ]
}
```

`price_cents`, `latency_ms`, `wallet_balance_cents`, `provenance`, and `transaction_id` are included whenever the underlying `/v1/do` response carries them; `next_steps` is always present. Neither this response nor `strale_search` results carry a quality or reliability score — call `strale_trust_profile` for the capability's test history and limitations instead.

## Solutions (bundled workflows)

Strale offers 81 pre-built solutions that chain multiple capabilities:

- **KYB Essentials** (20 countries) — Quick company verification: registry + VAT + sanctions + LEI. €1.50.
- **KYB Complete** (20 countries) — Full compliance: registry, PEP, adverse media, digital presence + risk narrative. €2.50.
- **Invoice Verify** (20 countries) — Fraud detection: company verify, payment validation, sender analysis + risk narrative. €2.50.

```
Agent: strale_search(query: "kyb essentials sweden")
→ Returns: kyb-essentials-se | €1.50 | 4 checks

Agent: strale_execute(slug: "kyb-essentials-se", inputs: { org_number: "5591674668" })
→ Returns: { checks: { company_exists: true, sanctions_clear: true, ... }, disclaimer: {...} }
```

## Try It

After connecting, ask your agent:

- "Use Strale to validate the email hello@example.com"
- "Use Strale to check the DNS records for github.com"
- "Search Strale for KYB solutions"
- "Run a full compliance check on a Swedish company"

These use free capabilities — no API key needed (KYB/Invoice solutions require an API key).

## Usage Workflow

```
1. strale_ping          → Verify the connection is working
2. strale_search        → Find capabilities matching your needs
3. strale_trust_profile → (Optional) Check quality data for a specific capability
4. strale_execute       → Run the capability with the required inputs
5. strale_transaction   → (Optional) Retrieve the full audit trail for any past execution
6. strale_balance       → Check remaining balance
```

### Example

```
Agent: strale_search(query: "swedish company")
→ Returns: swedish-company-data | €0.80 | Required: company_name (string)

Agent: strale_execute(slug: "swedish-company-data", inputs: { company_name: "Spotify AB" })
→ Returns: { output: { org_number: "5568401925", ... }, price_cents: 80, latency_ms: 2340,
             provenance: { source: "Bolagsverket Värdefulla datamängder API", fetched_at: "2026-08-30T12:00:00Z" } }
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
2. Eight meta-tools are registered: ping, getting_started, search, execute, methodology, trust_profile, balance, transaction
3. Agents use `strale_search` to discover capabilities with input requirements and quality scores
4. `strale_execute` sends `POST /v1/do` with `capability_slug` and `inputs`
5. The response (output, price, latency, provenance, quality) is returned as structured text
6. Async capabilities (>10s) return a transaction ID for polling
7. Errors (insufficient balance, degraded capability, etc.) are returned with helpful messages

## API Reference

Full API documentation: [strale.dev/docs](https://strale.dev/docs)

Quality methodology: [strale.dev/trust/methodology](https://strale.dev/trust/methodology)

## Contributing

Issues and pull requests are welcome. Please open an issue first to discuss significant changes.

Report bugs or request capabilities at: [github.com/strale-io/strale/issues](https://github.com/strale-io/strale/issues)

---

## Try for Free

5 capabilities work without an API key or signup:

- `email-validate` — verify email deliverability
- `dns-lookup` — DNS record lookup
- `json-repair` — fix malformed JSON
- `url-to-markdown` — convert any URL to markdown
- `iban-validate` — validate international bank account numbers

For all 250+ capabilities, [sign up](https://strale.dev/signup) for €2 in free trial credits.

## x402 pay-per-use access

All Strale capabilities are also available via [x402](https://x402.org) — the HTTP-native payment protocol for AI agents. Pay per request with USDC on Base mainnet. No signup or API key needed.

- Catalog: https://api.strale.io/x402/catalog
- Protocol: USDC on Base (eip155:8453)
- Discovery: https://api.strale.io/.well-known/x402.json

## Resources

- 📖 [Documentation](https://strale.dev/docs)
- 💡 [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration
- 💰 [Pricing](https://strale.dev/pricing)
- 🔍 [Quality methodology](https://strale.dev/methodology)
- 🔒 [Security](https://strale.dev/security)

## License

MIT — see [LICENSE](../../LICENSE)
