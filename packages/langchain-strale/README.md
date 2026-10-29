# langchain-strale

[Strale](https://strale.dev?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) tools as LangChain tools: company registry lookups, VAT and IBAN checks, sanctions and PEP screening, web page reading, and more, each paid per call. Built on `langchain-core` 1.x (`BaseTool`, `BaseToolkit`).

## Install

```bash
pip install langchain-strale
```

## Quick start: two meta-tools

The model gets `strale_search` (find a tool and its input schema) and `strale_execute` (run it by slug), the same pattern as the Strale MCP server. This keeps the prompt small however large the catalogue grows.

```python
from langchain.agents import create_agent
from langchain_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_...")  # or set STRALE_API_KEY
agent = create_agent(
    "openai:gpt-4o",
    toolkit.get_meta_tools(),  # strale_search, strale_execute, strale_balance
    system_prompt="Use strale_search to find a Strale tool, then strale_execute to run it.",
)

result = agent.invoke({"messages": [{"role": "user", "content": "Is SE556703748501 a valid VAT number?"}]})
```

`create_agent` comes from the `langchain` package (1.x); any model with tool calling works. The tools are ordinary LangChain tools, so `model.bind_tools(toolkit.get_meta_tools())` works too.

`strale_execute` returns JSON with `ok`, `output`, `price_cents`, `provenance` and `transaction_id`. With an API key, each call is charged to your wallet and capped by `max_price_cents` (default 200, i.e. €2.00; set it on the toolkit, from 1 to 2000).

## One tool per capability

```python
tools = toolkit.get_tools()  # one tool per capability, plus the meta-tools
tools = toolkit.get_tools(categories=["finance", "compliance"])
```

Each capability becomes a `BaseTool` named by its slug (e.g. `vat-validate`), with the price in its description and an `args_schema` generated from the capability's input schema. This loads the whole catalogue into the prompt; prefer the meta-tools for large toolsets.

## Bundled solutions

Solutions (for example `kyb-essentials-se`) show up in `strale_search` results with `"type": "solution"`; the model passes that type to `strale_execute`.

## Without an API key

Search works without a key, and some tools are free without one (for example `iban-validate`, `email-validate`, `dns-lookup`). The current free list is `free_tier_slugs` at https://api.strale.io/v1/platform/facts. A paid tool called without a key returns `ok: false` with instructions.

Get a key at [strale.dev](https://strale.dev/signup?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1).

## x402 pay-per-use access

Eligible Strale tools are also sold per request over [x402](https://x402.org) with USDC on Base, no signup needed. This package uses API keys; for x402, call the HTTP endpoints directly.

- Catalog: https://api.strale.io/x402/catalog?src=pypi-readme
- Discovery: https://api.strale.io/.well-known/x402.json

## Resources

- [Documentation](https://strale.dev/docs?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- [Pricing](https://strale.dev/pricing?src=pypi-readme&utm_source=pypi-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- [Changelog](https://github.com/strale-io/strale/blob/main/packages/langchain-strale/CHANGELOG.md)
