# Strale

Trust and quality infrastructure for AI agents.

[![npm](https://img.shields.io/npm/v/strale-mcp?label=strale-mcp)](https://www.npmjs.com/package/strale-mcp)
[![npm](https://img.shields.io/npm/v/straleio?label=straleio)](https://www.npmjs.com/package/straleio)
[![PyPI](https://img.shields.io/pypi/v/straleio?label=straleio%20PyPI)](https://pypi.org/project/straleio/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![strale.dev](https://img.shields.io/badge/strale.dev-live-green)](https://strale.dev)

## What is Strale

Strale is a capability marketplace for AI agents. Agents call `strale.do()` at runtime to access 225+ verified capabilities — company lookups, compliance checks, financial data, web extraction, and more — without hardcoding integrations or managing credentials.

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
| [`langchain-strale`](https://pypi.org/project/langchain-strale/) | PyPI | LangChain toolkit — 225+ tools via `StraleToolkit` |
| [`crewai-strale`](https://pypi.org/project/crewai-strale/) | PyPI | CrewAI integration — drop-in BaseTools for agents |
| [`strale-semantic-kernel`](https://www.npmjs.com/package/strale-semantic-kernel) | npm | Semantic Kernel plugin for .NET and TypeScript agents |

## Quality Scoring (SQS)

Every capability has a Strale Quality Score (SQS) from 0 to 100. The score is a weighted composite of five factors: correctness (40%), schema stability (25%), availability (20%), error handling (10%), and edge case coverage (5%), computed over a recency-weighted rolling 10-run window.

Scores are public. Check any capability:

```
GET https://api.strale.io/v1/quality/eu-vat-validate
```

Agents can set a `min_sqs` threshold on any `POST /v1/do` call — requests are rejected if the capability's current score falls below the threshold.

## Links

- [strale.dev](https://strale.dev) — Homepage and sign-up
- [strale.dev/docs](https://strale.dev/docs) — API reference
- [strale.dev/pricing](https://strale.dev/pricing) — Pricing
- [strale.dev/quality](https://strale.dev/quality) — Quality methodology

## Agent Skills & Code Examples

Teach your AI coding agent how to use Strale:

- **[Agent Skills](https://github.com/strale-io/agent-skills)** — SKILL.md files for Claude Code, Cursor, Copilot, and Codex. Copy `skills/strale/` into your project's `.claude/skills/`, `.github/skills/`, or `.cursor/skills/` directory.

Code examples:

- [Verify a company with Strale](https://gist.github.com/petterlindstrom79/5e22945748c3ce42155bf6d41f46c4e0) (Python)
- [Validate IBANs — free, no API key](https://gist.github.com/petterlindstrom79/7f83fdc892dcafbc280735af5d0e360d) (Python)
- [Build an agent with Strale](https://gist.github.com/petterlindstrom79/2e4750eb919d314db7c697a504086e0b) (TypeScript)
- [Connect Strale to Claude](https://gist.github.com/petterlindstrom79/c08ddc1cb3dfed3ca434c70305dc9e54) (setup guide)

Strale is the trust layer for AI agents.

## License

MIT
