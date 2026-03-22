# pydantic-ai-strale

[Pydantic AI](https://ai.pydantic.dev/) integration for [Strale](https://strale.dev) — 250+ independently tested and scored business data capabilities for AI agents.

Strale provides IBAN validation, VAT validation, company data across 27 countries, sanctions screening, compliance checks (KYB, AML, GDPR), invoice extraction, SSL certificate checks, and more. Every capability is quality-scored with the Strale Quality Score (SQS).

## Installation

```bash
pip install pydantic-ai-strale
```

## Quick Start

```python
from pydantic_ai import Agent
from pydantic_ai_strale import StraleClient

strale = StraleClient(api_key="sk_live_...")

agent = Agent("openai:gpt-4o")

@agent.tool_plain
def validate_iban(iban: str) -> dict:
    """Validate an IBAN number. Returns validity, country, bank BIC, bank name."""
    return strale.run("iban-validate", {"iban": iban})

@agent.tool_plain
def check_sanctions(name: str, country: str = "") -> dict:
    """Screen a name against global sanctions lists (OFAC, EU, UN)."""
    inputs = {"name": name}
    if country:
        inputs["country"] = country
    return strale.run("sanctions-check", inputs)

@agent.tool_plain
def lookup_company(org_number: str) -> dict:
    """Look up Swedish company data by organization number."""
    return strale.run("swedish-company-data", {"org_number": org_number})
```

## Multiple Capabilities

```python
from pydantic_ai_strale import StraleClient

strale = StraleClient(api_key="sk_live_...")

# List all capabilities
caps = strale.list_capabilities()
print(f"{len(caps)} capabilities available")

# Filter by category
compliance_caps = strale.list_capabilities(category="compliance")
for cap in compliance_caps:
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

If your agent framework supports MCP, you can use Strale's MCP server directly — no wrapper package needed:

- **Endpoint:** `https://api.strale.io/mcp`
- **Transport:** Streamable HTTP
- **npm package:** [strale-mcp](https://www.npmjs.com/package/strale-mcp)

## Trust & Quality

Every Strale capability has a quality score (SQS) combining:
- **Quality Profile:** correctness, schema compliance, error handling, edge cases
- **Reliability Profile:** availability, success rate, upstream health, latency

Scores and methodology: [strale.dev/trust](https://strale.dev/trust)

## Links

- [Homepage](https://strale.dev)
- [Documentation](https://strale.dev/docs)
- [Capabilities](https://strale.dev/capabilities)
- [Pricing](https://strale.dev/pricing)
- [GitHub](https://github.com/strale-io/strale)
- [MCP Server Card](https://api.strale.io/.well-known/mcp.json)
