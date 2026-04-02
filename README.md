# Strale

Trust and quality infrastructure for AI agents.

[![strale MCP server](https://glama.ai/mcp/servers/strale-io/strale/badges/card.svg)](https://glama.ai/mcp/servers/strale-io/strale)

[![npm](https://img.shields.io/npm/v/strale-mcp?label=strale-mcp)](https://www.npmjs.com/package/strale-mcp)
[![npm](https://img.shields.io/npm/v/straleio?label=straleio)](https://www.npmjs.com/package/straleio)
[![PyPI](https://img.shields.io/pypi/v/straleio?label=straleio%20PyPI)](https://pypi.org/project/straleio/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![strale.dev](https://img.shields.io/badge/strale.dev-live-green)](https://strale.dev)

## What is Strale

Strale is a capability marketplace for AI agents. Agents call `strale.do()` at runtime to access 270+ verified capabilities — company lookups, compliance checks, financial validation, Web3 security, and more — plus 100 bundled solutions for multi-step workflows like full KYB checks or company due diligence. No hardcoded integrations or credential management.

Every capability is continuously tested and assigned a Strale Quality Score (SQS): a 0-100 confidence score derived from two independent profiles — a Quality Profile (code correctness, schema compliance, error handling, edge cases) and a Reliability Profile (current availability, rolling success, upstream health, latency) — combined via a published matrix. Agents get reliable, scored tools. You get observability into what your agent is actually doing.

## Quick Start: MCP Server

### Recommended: Streamable HTTP (remote, no install)

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

No installation required. Works with Claude Desktop, Claude Code, Cursor, and any MCP client supporting Streamable HTTP.

### Local (stdio)

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
| [`strale-mcp`](https://www.npmjs.com/package/strale-mcp) | npm | MCP server — 270+ capabilities via Claude, Cursor, any MCP host |
| [`straleio`](https://www.npmjs.com/package/straleio) | npm | TypeScript/JavaScript SDK |
| [`straleio`](https://pypi.org/project/straleio/) | PyPI | Python SDK |
| [`langchain-strale`](https://pypi.org/project/langchain-strale/) | PyPI | LangChain toolkit — 250+ tools via `StraleToolkit` |
| [`crewai-strale`](https://pypi.org/project/crewai-strale/) | PyPI | CrewAI integration — drop-in BaseTools for agents |
| [`strale-semantic-kernel`](https://www.npmjs.com/package/strale-semantic-kernel) | npm | Semantic Kernel plugin for .NET and TypeScript agents |
| [`composio-strale`](https://pypi.org/project/composio-strale/) | PyPI | Composio integration — 250+ tools as Composio custom actions |

## Web3

17 Web3 capabilities and 9 bundled solutions for on-chain agents: wallet risk scoring (GoPlus), token honeypot detection, ENS resolution, DeFi protocol TVL and fees (DeFi Llama), gas oracle, EU MiCA VASP verification (ESMA register), and market sentiment. All available via the x402 payment protocol — pay per call with USDC on Base mainnet, no signup required.

```
GET https://api.strale.io/x402/catalog
```

## Quality Scoring (SQS)

Every capability has a Strale Quality Score (SQS) from 0 to 100, built on a dual-profile model:

- **Quality Profile (QP):** Measures code-level quality across four factors — correctness (50%), schema compliance (31%), error handling (13%), and edge case coverage (6%). Upstream failures are excluded.
- **Reliability Profile (RP):** Measures operational dependability — upstream availability, latency consistency, error recovery, and degradation handling. Factor weights vary by capability type (API-dependent, algorithmic, mixed).

The two profiles combine via a published 5x5 matrix with interpolation into the final SQS score. Grades run A through E (A >= 90, B >= 75, C >= 50, D >= 25, E < 25), computed over a recency-weighted rolling 10-run window.

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
- [scan.strale.io](https://scan.strale.io) — Beacon (free agent-readiness scanner)
- [api.strale.io/mcp](https://api.strale.io/mcp) — MCP endpoint (Streamable HTTP)
- [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration

## Agent Skills & Code Examples

Teach your AI coding agent how to use Strale:

- **[Agent Skills](https://github.com/strale-io/agent-skills)** — SKILL.md files for Claude Code, Cursor, Copilot, and Codex. Copy `skills/strale/` into your project's `.claude/skills/`, `.github/skills/`, or `.cursor/skills/` directory.

Code examples:

- [Verify a company with Strale](https://gist.github.com/petterlindstrom79/5e22945748c3ce42155bf6d41f46c4e0) (Python)
- [Validate IBANs — free, no API key](https://gist.github.com/petterlindstrom79/7f83fdc892dcafbc280735af5d0e360d) (Python)
- [Build an agent with Strale](https://gist.github.com/petterlindstrom79/2e4750eb919d314db7c697a504086e0b) (TypeScript)
- [Connect Strale to Claude](https://gist.github.com/petterlindstrom79/c08ddc1cb3dfed3ca434c70305dc9e54) (setup guide)

Strale is the trust layer for AI agents.

## IDE Rules for Safe Data Handling

Drop these files into your project to give your coding agent security guidance for trust-sensitive data (IBANs, company registries, sanctions, PII):

- **Cursor:** Copy [`docs/ide-rules/strale-compliance.mdc`](docs/ide-rules/strale-compliance.mdc) to `.cursor/rules/`
- **Windsurf:** Copy [`docs/ide-rules/strale-compliance.windsurfrules`](docs/ide-rules/strale-compliance.windsurfrules) to your project root, or into `.windsurf/rules/` as a `.md` file
- **Claude Code:** Copy the snippet from [`docs/claude-md-snippet.md`](docs/claude-md-snippet.md) into your project's `CLAUDE.md`

These rules prevent the most common vibe-coding vulnerabilities: client-side IBAN validation, hardcoded API keys, missing provenance metadata, and direct registry scraping. Free-tier endpoints are referenced as safe defaults that require no API key.

## License

MIT
