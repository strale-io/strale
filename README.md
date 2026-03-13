# Strale

Trust and quality infrastructure for AI agents.

[![npm](https://img.shields.io/npm/v/strale-mcp?label=strale-mcp)](https://www.npmjs.com/package/strale-mcp)
[![npm](https://img.shields.io/npm/v/straleio?label=straleio)](https://www.npmjs.com/package/straleio)
[![PyPI](https://img.shields.io/pypi/v/straleio?label=straleio%20PyPI)](https://pypi.org/project/straleio/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![strale.dev](https://img.shields.io/badge/strale.dev-live-green)](https://strale.dev)

<a href="https://glama.ai/mcp/servers/strale-io/strale">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/strale-io/strale/badge" alt="strale-mcp MCP server" />
</a>

## What is Strale

Strale is a capability marketplace for AI agents. Agents call `strale.do()` at runtime to access 200+ verified capabilities — company lookups, compliance checks, financial data, web extraction, and more — without hardcoding integrations or managing credentials.

Every capability is continuously tested and assigned a Strale Quality Score (SQS): a 0–100 composite built from correctness, schema stability, availability, error handling, and edge case coverage. Agents get reliable, scored tools. You get observability into what your agent is actually doing.

## Quick Start: MCP Server

Add to your Claude Desktop or Cursor config:

```json
{
  "mcpServers": {
    "strale": {
      "command": "npx",
      "args": ["-y", "strale-mcp"],
      "env": {
        "STRALE_API_KEY": "your_api_key"
      }
    }
  }
}
```

Five capabilities (`email-validate`, `dns-lookup`, `json-repair`, `url-to-markdown`, `iban-validate`) are available without an API key. Get a key and €2 free credits at [strale.dev](https://strale.dev).

## Quick Start: TypeScript SDK

```bash
npm install straleio
```

```typescript
import Strale from "straleio";

const strale = new Strale({ apiKey: process.env.STRALE_API_KEY });

const result = await strale.do("eu-vat-validate", { vat_number: "SE556000000001" });
console.log(result);
```

## Quick Start: Python SDK

```bash
pip install straleio
```

```python
from straleio import Strale

strale = Strale(api_key="your_api_key")
result = strale.do("eu-vat-validate", {"vat_number": "SE556000000001"})
```

## Packages

| Package | Registry | Description |
|---|---|---|
| [`strale-mcp`](https://www.npmjs.com/package/strale-mcp) | npm | MCP server — Claude Desktop, Cursor, any MCP host |
| [`straleio`](https://www.npmjs.com/package/straleio) | npm | TypeScript/JavaScript SDK |
| [`straleio`](https://pypi.org/project/straleio/) | PyPI | Python SDK |
| [`langchain-strale`](https://pypi.org/project/langchain-strale/) | PyPI | LangChain toolkit — 200+ tools via `StraleToolkit` |
| [`crewai-strale`](https://pypi.org/project/crewai-strale/) | PyPI | CrewAI integration — drop-in BaseTools for agents |
| [`strale-semantic-kernel`](https://www.npmjs.com/package/strale-semantic-kernel) | npm | Semantic Kernel plugin for .NET and TypeScript agents |

## Quality Scoring (SQS)

Every capability has a Strale Quality Score (SQS) from 0 to 100. The score is a weighted composite of five factors: correctness (40%), schema stability (25%), availability (20%), error handling (10%), and edge case coverage (5%), computed over a recency-weighted rolling 10-run window.

Scores are public. Check any capability:

```
GET https://strale-production.up.railway.app/v1/quality/eu-vat-validate
```

Agents can set a `min_sqs` threshold on any `POST /v1/do` call — requests are rejected if the capability's current score falls below the threshold.

## Links

- [strale.dev](https://strale.dev) — Homepage and sign-up
- [strale.dev/docs](https://strale.dev/docs) — API reference
- [strale.dev/pricing](https://strale.dev/pricing) — Pricing
- [strale.dev/quality](https://strale.dev/quality) — Quality methodology

## License

MIT