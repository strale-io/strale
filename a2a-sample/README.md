# Strale — Quality-Scored Capability Provider via A2A

Strale is a capability marketplace for AI agents. It provides 256+ quality-scored capabilities — company verification, compliance screening, data validation, financial data, web extraction — covering 27 countries.

Every capability is independently tested and assigned a **Strale Quality Score (SQS)** from 0-100, updated continuously from automated test suites.

## Agent Card

```
https://api.strale.io/.well-known/agent-card.json
```

The Agent Card advertises 337 skills (256 capabilities + 81 bundled solutions) with live SQS scores in each skill description.

## Free-tier capabilities (no API key required)

| Capability | Description |
|---|---|
| `email-validate` | Validate email addresses (syntax, MX, disposable detection) |
| `dns-lookup` | DNS record lookup (A, AAAA, MX, TXT, CNAME, NS) |
| `json-repair` | Fix malformed JSON (trailing commas, single quotes, comments) |
| `url-to-markdown` | Extract web content as clean Markdown |
| `iban-validate` | Validate international bank account numbers |

## Quick start

```bash
pip install a2a-sdk httpx
python client_example.py
```

## How it works

1. **Discovery**: Fetch the Agent Card from `/.well-known/agent-card.json`
2. **Skill selection**: Find a skill by `id` (capability slug) or search `tags`
3. **Execution**: Send a `message/send` JSON-RPC request with the skill ID and input data
4. **Response**: Get structured JSON output with provenance and quality metadata

## Architecture

```
Your Agent  ──A2A──>  Strale  ──>  External APIs / Registries / LLMs
                        │
                   Quality Layer
                   (SQS scoring,
                    test suites,
                    circuit breakers)
```

Strale acts as a trust layer between your agent and 50+ external data sources, providing:
- **Quality scores** — know the reliability before you call
- **Retry logic** — transient failures are retried automatically
- **Audit trails** — every transaction logged with provenance
- **Compliance** — EU AI Act transparency markers on every response
