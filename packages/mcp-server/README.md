# strale-mcp

MCP server for [Strale](https://strale.io) — gives AI agents access to 225+ capabilities via 6 meta-tools. Compatible with Claude, ChatGPT, Cursor, Windsurf, GitHub Copilot, and any MCP client.

## Architecture

**Meta-tools only**: Instead of registering 225+ individual tools (which exceeds limits in ChatGPT, Cursor, and Copilot), the server exposes 6 meta-tools. Agents discover capabilities via `strale_search`, then execute via `strale_execute`.

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

## Available Tools (7)

| Tool | Auth Required | Description |
|------|:---:|-------------|
| `strale_ping` | No | Health check. Verifies the connection is working. Returns server status, tool count, and capability count. |
| `strale_search` | No | Search 225+ capabilities and 20+ solutions by keyword or category. Returns matches with price, input fields, SQS score, quality grade, reliability grade, and execution guidance. |
| `strale_execute` | Yes | Execute any capability by slug. Pass the slug and inputs from search results. Returns output data, cost, latency, provenance, and dual-profile quality assessment. |
| `strale_methodology` | No | Get Strale's quality methodology — dual-profile scoring (QP + RP), SQS matrix, execution guidance, and test infrastructure. |
| `strale_trust_profile` | No | Get the full trust profile for any capability or solution — Quality Profile, Reliability Profile, SQS score, execution guidance, limitations, and badge status. |
| `strale_balance` | Yes | Check your wallet balance in EUR. |
| `strale_transaction` | Yes | Retrieve a past execution record by transaction ID. Returns the full audit trail: inputs, outputs, latency, price, provenance, and failure categorization. |

## Quality Scoring

Strale uses a **dual-profile model** to score every capability:

**Quality Profile (QP)** — measures code quality (stable over time, only changes when code changes):
- Correctness (50%) — known-answer test pass rate
- Schema conformance (31%) — output structure validity
- Error handling (13%) — graceful failure behavior
- Edge cases (6%) — boundary condition handling

**Reliability Profile (RP)** — measures operational dependability (changes with live conditions):
- `current_availability` — latest test run pass rate (is it working right now?)
- `rolling_success` — recency-weighted success rate across last 10 runs (trend)
- `upstream_health` — external dependency health from 30-day assessment
- `latency` — p95 response time vs type-specific thresholds

**SQS** (0–100) is derived from the 5×5 QP × RP matrix. A capability must score well on both dimensions to reach Excellent. For full methodology: call `strale_methodology` or visit [strale.dev/trust/methodology](https://strale.dev/trust/methodology).

### Search result fields

```json
{
  "slug": "vat-validate",
  "name": "VAT Validate",
  "sqs": 84,
  "sqs_label": "Good",
  "quality": "A",
  "reliability": "B",
  "trend": "stable",
  "usable": true,
  "strategy": "direct",
  "price_cents": 2
}
```

### Trust profile fields

```json
{
  "sqs": { "score": 84.8, "label": "Good", "trend": "stable" },
  "quality_profile": {
    "grade": "A",
    "score": 97.5,
    "label": "Code quality: A",
    "factors": [
      { "name": "correctness", "rate": 98.0, "weight": 50, "has_data": true },
      { "name": "schema", "rate": 96.0, "weight": 31, "has_data": true }
    ]
  },
  "reliability_profile": {
    "grade": "B",
    "score": 71.2,
    "label": "Reliable",
    "factors": [...]
  },
  "execution_guidance": {
    "usable": true,
    "strategy": "direct",
    "confidence_after_strategy": 95,
    "error_handling": { "distinguishable_errors": true, "retryable": ["timeout"], "permanent": ["invalid_vat"] },
    "if_strategy_fails": null,
    "recovery": { "estimated_hours": null, "next_test": "2026-03-16T06:00:00Z" },
    "cost_envelope": { "primary_price": "€0.02", "worst_case_with_retries": "€0.06" }
  }
}
```

### Execution guidance

The `execution_guidance` block is machine-readable agent guidance:

| Field | Description |
|-------|-------------|
| `usable` | Whether the capability should be called. `false` means degraded — avoid unless fallback. |
| `strategy` | `direct` / `retry_with_backoff` / `queue_for_later` / `unavailable` |
| `confidence_after_strategy` | Expected success rate (%) if you follow the strategy |
| `error_handling` | Which errors are retryable vs permanent |
| `if_strategy_fails` | Fallback capability to try if the primary fails |
| `recovery` | Estimated recovery time and next scheduled test |
| `cost_envelope` | Price for single call and worst-case with retries |

**Example agent logic:**

```python
trust = strale_trust_profile(slug="vat-validate")
guidance = trust["execution_guidance"]

if not guidance["usable"]:
    fallback = guidance["if_strategy_fails"]
    if fallback:
        result = strale_execute(slug=fallback["fallback_capability"], ...)
    else:
        raise Exception(f"Capability degraded. Recovery: {guidance['recovery']}")
elif guidance["strategy"] == "retry_with_backoff":
    result = execute_with_retry(slug="vat-validate", max_attempts=3, ...)
else:
    result = strale_execute(slug="vat-validate", ...)
```

### Execute response fields

```json
{
  "status": "completed",
  "output": { ... },
  "price_cents": 2,
  "latency_ms": 340,
  "quality": {
    "sqs": 84.8,
    "label": "Good",
    "quality_profile": "A",
    "reliability_profile": "B",
    "trend": "stable"
  },
  "execution_guidance": {
    "usable": true,
    "strategy": "direct",
    "confidence_after_strategy": 95
  }
}
```

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
→ Returns: swedish-company-data | sqs: 83 | quality: A | reliability: B | usable: true | strategy: direct

Agent: strale_execute(slug: "swedish-company-data", inputs: { company_name: "Spotify AB" })
→ Returns: { output: { org_number: "5568401925", ... }, price_cents: 80, latency_ms: 2340,
             quality: { sqs: 83.5, quality_profile: "A", reliability_profile: "B" } }
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
2. Six meta-tools are registered: ping, search, execute, methodology, trust_profile, balance
3. Agents use `strale_search` to discover capabilities with input requirements and quality scores
4. `strale_execute` sends `POST /v1/do` with `capability_slug` and `inputs`
5. The response (output, price, latency, provenance, quality) is returned as structured text
6. Async capabilities (>10s) return a transaction ID for polling
7. Errors (insufficient balance, degraded capability, etc.) are returned with helpful messages
