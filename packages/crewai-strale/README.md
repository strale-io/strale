# crewai-strale

> **Maintenance only (frozen 2026-10-29).** This package keeps working and
> gets fixes for breakage, but no new features. CrewAI can load MCP servers directly (`MCPServerAdapter` in `crewai-tools`); for new work, connect it to the Strale MCP server at `https://api.strale.io/mcp?src=pypi-readme`.

[Strale](https://strale.dev?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) capabilities as CrewAI tools. Company data, VAT validation, web scraping, compliance checks, and more — available to your CrewAI agents with a single import.

## Install

```bash
pip install crewai-strale
```

## Quick start

```python
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_...")
tools = toolkit.get_tools()  # available capabilities + search & balance tools
```

## Filter by category

```python
tools = toolkit.get_tools(categories=["finance", "compliance"])
```

## Use with CrewAI

```python
from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_...")
tools = toolkit.get_tools()

researcher = Agent(
    role="Business Analyst",
    goal="Research and validate European companies",
    backstory="Expert in EU business data and compliance",
    tools=tools,
)

task = Task(
    description="Validate VAT number SE556703748501 and look up the company",
    agent=researcher,
    expected_output="Company details with VAT validation status",
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
```

## What's included

Each Strale capability becomes a CrewAI `BaseTool` with:

- **name** — capability slug (e.g. `vat-validate`, `swedish-company-data`)
- **description** — what it does + price in EUR
- **args_schema** — Pydantic model generated from the capability's input schema
- **_run()** — calls the Strale API

Plus two meta-tools:

- **strale_search** — discover capabilities by keyword
- **strale_balance** — check your wallet balance

## Solutions (KYB & Invoice Verify)

available solutions are available, including KYB Essentials, KYB Complete, and Invoice Verify across available countries. Use `strale_search` to discover them.

## Get an API key

Sign up at [strale.dev](https://strale.dev?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) — trial eligibility is determined at signup.

---

## Try for Free

available capabilities work without an API key or signup:

- `email-validate` — verify email deliverability
- `dns-lookup` — DNS record lookup
- `json-repair` — fix malformed JSON
- `url-to-markdown` — convert any URL to markdown
- `iban-validate` — validate international bank account numbers

For all available capabilities, [sign up](https://strale.dev/signup?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) for paid access; trial eligibility is determined at signup.

## Using Strale in agent system prompts

Add this to your CrewAI agent's backstory or system prompt for automatic capability routing:

```
When you need to verify a business, validate an IBAN or VAT number, screen
against sanctions/PEP lists, extract data from a URL or document, or check
compliance — use your Strale tools. Call strale_search to find the right
capability, then call it by name. Returns structured JSON with execution metadata.
Coverage and free-tier eligibility are listed in platform facts. Free tier: email-validate, dns-lookup,
json-repair, url-to-markdown, iban-validate (no API key needed).
```

## x402 pay-per-use access

Eligible Strale tools are also available via [x402](https://x402.org) — the HTTP-native payment protocol for AI agents. Pay per request with USDC on Base mainnet. No signup or API key needed.

- Catalog: https://api.strale.io/x402/catalog?src=pypi-readme
- Protocol: USDC on Base (eip155:8453)
- Discovery: https://api.strale.io/.well-known/x402.json

## Resources

- 📖 [Documentation](https://strale.dev/docs?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 💡 [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration
- 💰 [Pricing](https://strale.dev/pricing?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 🔍 [Quality methodology](https://strale.dev/methodology?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 🔒 [Security](https://strale.dev/security?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
