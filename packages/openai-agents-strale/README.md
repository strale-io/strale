# openai-agents-strale

[OpenAI Agents SDK](https://github.com/openai/openai-agents-python) integration for [Strale](https://strale.dev) — 250+ independently tested and scored business data capabilities for AI agents.

Strale provides IBAN validation, VAT validation, company data across 27 countries, sanctions screening, compliance checks (KYB, AML, GDPR), invoice extraction, SSL certificate checks, and more. Every capability is quality-scored with the Strale Quality Score (SQS).

## Installation

```bash
pip install openai-agents-strale
```

## Quick Start

### Single Tool

```python
from agents import Agent, Runner
from openai_agents_strale import create_strale_tool

validate_iban = create_strale_tool(
    api_key="sk_live_...",
    capability_slug="iban-validate",
)

agent = Agent(
    name="IBAN Validator",
    instructions="You validate IBAN numbers using the Strale API.",
    tools=[validate_iban],
)

result = Runner.run_sync(agent, "Is DE89370400440532013000 a valid IBAN?")
print(result.final_output)
```

### Multiple Tools

```python
from agents import Agent, Runner
from openai_agents_strale import create_strale_tools

tools = create_strale_tools(
    api_key="sk_live_...",
    slugs=["iban-validate", "vat-format-validate", "sanctions-check"],
)

agent = Agent(
    name="Compliance Agent",
    instructions="You verify business data using Strale tools.",
    tools=tools,
)

result = Runner.run_sync(agent, "Check if VAT number SE556703748501 is valid")
print(result.final_output)
```

### Category Filter

```python
from openai_agents_strale import create_strale_tools

# Load all compliance tools
tools = create_strale_tools(
    api_key="sk_live_...",
    categories=["compliance"],
)
```

### Direct Client

```python
from openai_agents_strale import StraleClient

client = StraleClient(api_key="sk_live_...")

# Execute a capability directly
result = client.run("iban-validate", {"iban": "DE89370400440532013000"})
print(result)

# List available capabilities
caps = client.list_capabilities(category="company-data")
for cap in caps:
    print(f"  {cap['slug']} — €{cap['price_cents']/100:.2f}")
```

## Capability Categories

| Category | Examples |
|----------|----------|
| **Company Data** | swedish-company-data, german-company-data, uk-company-data (27 countries) |
| **Compliance** | sanctions-check, pep-check, adverse-media-check, vat-validate |
| **Validation** | iban-validate, vat-format-validate, lei-lookup, swift-validate |
| **Finance** | exchange-rate, invoice-extract, invoice-validate |
| **Web Intelligence** | ssl-check, dns-lookup, domain-reputation, seo-audit |
| **Data Extraction** | pdf-extract, web-extract, url-to-markdown |

Full list: [strale.dev/capabilities](https://strale.dev/capabilities)

## Free Tier

5 capabilities work without an API key or signup: `email-validate`, `dns-lookup`, `json-repair`, `url-to-markdown`, `iban-validate`.

## MCP Alternative

If your agent framework supports MCP, you can use Strale's MCP server directly:

- **Endpoint:** `https://api.strale.io/mcp`
- **Transport:** Streamable HTTP
- **npm package:** [strale-mcp](https://www.npmjs.com/package/strale-mcp)

## Trust & Quality

Every Strale capability has a quality score (SQS) combining:
- **Quality Profile:** correctness, schema compliance, error handling, edge cases
- **Reliability Profile:** availability, success rate, upstream health, latency

Scores and methodology: [strale.dev/trust](https://strale.dev/trust)

## Using Strale in agent system prompts

Add this to your OpenAI agent's instructions for automatic capability routing:

```
When you need to verify a business, validate an IBAN or VAT number, screen
against sanctions/PEP lists, extract data from a URL or document, or check
compliance — use your Strale tools. Call strale_search to find the right
capability, then call it by name. Returns structured JSON with quality scores.
250+ capabilities across 27 countries. Free tier: email-validate, dns-lookup,
json-repair, url-to-markdown, iban-validate (no API key needed).
```

## Links

- [Homepage](https://strale.dev)
- [Documentation](https://strale.dev/docs)
- [Capabilities](https://strale.dev/capabilities)
- [Pricing](https://strale.dev/pricing)
- [GitHub](https://github.com/strale-io/strale)
- [MCP Server Card](https://api.strale.io/.well-known/mcp.json)
