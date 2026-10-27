# strale-mcp

MCP server for [Strale](https://strale.dev?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) — connects agents to hundreds of pay-per-call tools: company records, screening, validation, web page reading and document extraction. Compatible with Claude, ChatGPT, Cursor, Windsurf, GitHub Copilot, and any MCP client.

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

**Meta-tools only**: Instead of registering the entire catalogue as individual tools (which exceeds limits in ChatGPT, Cursor, and Copilot), the server exposes a compact set of discovery and execution tools. Agents discover capabilities via `strale_search`, then execute via `strale_execute`.

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
      "url": "https://api.strale.io/mcp?src=npm-readme",
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
      "url": "https://api.strale.io/mcp?src=npm-readme",
      "headers": {
        "Authorization": "Bearer sk_live_your_key_here"
      }
    }
  }
}
```

**Any MCP client supporting Streamable HTTP:**

```
URL:    https://api.strale.io/mcp?src=npm-readme
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

## Available Tools

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
| `strale_search` | No | Search available capabilities and bundled workflows by keyword or category. Returns matches with price, input fields, and geography. |
| `strale_execute` | No* | Execute any capability by slug. Returns output data, cost, latency, and data provenance. *Free-tier capabilities work without an API key. |
| `strale_methodology` | No | Explains testing modes, source context and transaction retrieval. |
| `strale_trust_profile` | No | Reads current public test results for a tool or bundle: badge, tested flag, recent pass rate and last-tested time where available. Use the catalogue for inputs, limitations and sources. |
| `strale_balance` | Yes | Returns your wallet balance in EUR cents and EUR. |
| `strale_web3_assurance` | Yes | Checks on-chain counterparty signals; requires an API key. |
| `strale_transaction` | No* | Returns a past execution record by transaction ID: inputs, outputs, latency, price, provenance, and failure categorization. *Free-tier transactions accessible by ID only. |

## Trust Data

Testing modes vary by tool. Read the current test and availability signals with `strale_trust_profile`; use the catalogue for source context and limitations.

## Solutions (bundled workflows)

Strale offers available solutions that chain multiple capabilities:

- **KYB Essentials** (available countries) — Quick company verification: registry + VAT + sanctions + LEI. €1.50.
- **KYB Complete** (available countries) — Full compliance: registry, PEP, adverse media, digital presence + risk narrative. €2.50.
- **Invoice Verify** (available countries) — Fraud detection: company verify, payment validation, sender analysis + risk narrative. €2.50.

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
3. strale_trust_profile → (Optional) Read current public test and availability signals for a tool or bundle
4. strale_execute       → Run the capability with the required inputs
5. strale_transaction   → (Optional) Retrieve an execution record where accessible for this rail
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
2. The meta-tools are registered: ping, getting_started, search, execute, methodology, trust_profile, balance, transaction, web3_assurance
3. Agents use `strale_search` to discover capabilities with input requirements and pricing
4. `strale_execute` sends `POST /v1/do` with `capability_slug` and `inputs`
5. The response (output, price, latency, provenance) is returned as structured text
6. Async capabilities (>10s) return a transaction ID for polling
7. Errors (insufficient balance, degraded capability, etc.) are returned with helpful messages

## API Reference

Full API documentation: [strale.dev/docs](https://strale.dev/docs?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)

Quality methodology: [strale.dev/trust/methodology](https://strale.dev/trust/methodology?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)

## Contributing

Issues and pull requests are welcome. Please open an issue first to discuss significant changes.

Report bugs or request capabilities at: [github.com/strale-io/strale/issues](https://github.com/strale-io/strale/issues)

---

## Try for Free

available capabilities work without an API key or signup:

- `email-validate` — verify email deliverability
- `dns-lookup` — DNS record lookup
- `json-repair` — fix malformed JSON
- `url-to-markdown` — convert any URL to markdown
- `iban-validate` — validate international bank account numbers

For all available capabilities, [sign up](https://strale.dev/signup?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) for paid access; trial eligibility is determined at signup.

## x402 pay-per-use access

Eligible Strale tools are also available via [x402](https://x402.org) — the HTTP-native payment protocol for AI agents. Pay per request with USDC on Base mainnet. No signup or API key needed.

- Catalog: https://api.strale.io/x402/catalog?src=npm-readme
- Protocol: USDC on Base (eip155:8453)
- Discovery: https://api.strale.io/.well-known/x402.json

## Resources

- 📖 [Documentation](https://strale.dev/docs?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 💡 [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration
- 💰 [Pricing](https://strale.dev/pricing?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 🔍 [Quality methodology](https://strale.dev/methodology?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 🔒 [Security](https://strale.dev/security?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)

## License

MIT — see [LICENSE](../../LICENSE)
