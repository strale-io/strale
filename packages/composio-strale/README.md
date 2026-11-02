# composio-strale

> **Maintenance only (frozen 2026-10-29).** This package keeps working and
> gets fixes for breakage, but no new features. For new work, connect to the Strale MCP server at `https://api.strale.io/mcp?src=pypi-readme`, which any MCP client can use.

[Composio](https://composio.dev) integration for [Strale](https://strale.dev?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) — available pay-per-call tools as Composio custom tools.

## Install

```bash
pip install composio-strale
```

## Quick start

```python
from composio import Composio
from composio_strale import register_strale_tools

composio = Composio()
register_strale_tools(composio, api_key="sk_live_...")

# Search for capabilities
result = composio.tools.execute(
    user_id="default",
    slug="STRALE_SEARCH",
    arguments={"query": "sanctions screening"},
)

# Execute a capability
result = composio.tools.execute(
    user_id="default",
    slug="STRALE_EXECUTE",
    arguments={
        "capability_slug": "sanctions-check",
        "inputs": {"name": "Acme Corp"},
    },
)
```

## Use with an agent

```python
from composio import Composio
from composio_openai import OpenAIProvider
from composio_strale import register_strale_tools

composio = Composio(provider=OpenAIProvider())
register_strale_tools(composio)

tools = composio.tools.get(user_id="default", toolkits=["strale"])

from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    tools=tools,
    messages=[{"role": "user", "content": "Run a sanctions check on 'Acme Corp'"}],
)
```

## What's included

Three tools registered under the `strale` toolkit:

| Tool | Description |
|------|-------------|
| `STRALE_SEARCH` | Search available capabilities by keyword or category |
| `STRALE_EXECUTE` | Execute any capability with structured input |
| `STRALE_BALANCE` | Check your wallet balance |

## Get an API key

Sign up at [strale.dev](https://strale.dev?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) — trial eligibility is determined at signup.

## x402 pay-per-use access

Eligible Strale tools are also available via [x402](https://x402.org) — the HTTP-native payment protocol for AI agents. Pay per request with USDC on Base mainnet. No signup or API key needed.

- Catalog: https://api.strale.io/x402/catalog?src=pypi-readme
- Protocol: USDC on Base (eip155:8453)
- Discovery: https://api.strale.io/.well-known/x402.json

## Resources

- [Documentation](https://strale.dev/docs?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- [Examples](https://github.com/strale-io/strale-examples)
- [Pricing](https://strale.dev/pricing?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- [Quality methodology](https://strale.dev/methodology?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
