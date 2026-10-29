# Strale plugin for Cursor

Connects Cursor to [Strale](https://strale.dev?src=cursor&utm_source=cursor&utm_medium=listing&utm_campaign=distribution-t12),
a library of pay-per-call tools for agents: company records, EU VAT checks,
sanctions and PEP screening, validation and web page reading.

## What it adds

- **MCP server** (`mcp.json`): Strale's hosted server at
  `https://api.strale.io/mcp`. Nothing to install.
- **Rule** (`rules/strale-tools.mdc`): tells the agent when to search for a
  Strale tool and how to read its result. Set to "Agent Decides" by default.

## Tools

| Tool | What it does |
| --- | --- |
| `strale_search` | Find tools and bundles by plain-language query |
| `strale_execute` | Run a tool by slug |
| `strale_getting_started` | What works without a key |
| `strale_balance` | Wallet balance |
| `strale_trust_profile` | Current public test results for a tool |
| `strale_methodology` | Testing modes and source notes |
| `strale_transaction` | Read a past execution record |
| `strale_web3_assurance` | Check an on-chain counterparty |
| `strale_ping` | Connection check |

## Using paid tools

Search and the free tools work without a key. For paid tools, get an API key
at [strale.dev/signup](https://strale.dev/signup?src=cursor&utm_source=cursor&utm_medium=listing&utm_campaign=distribution-t12)
and add it as a header in your Cursor MCP settings:

```json
{
  "mcpServers": {
    "strale": {
      "type": "http",
      "url": "https://api.strale.io/mcp?src=cursor",
      "headers": { "Authorization": "Bearer sk_live_your_key_here" }
    }
  }
}
```

The plugin ships without the header on purpose: a header whose variable is
not set would send a placeholder instead of no key, and the server would
refuse even the free tools.

## Test locally

Copy this folder to `~/.cursor/plugins/local/strale`, run **Developer:
Reload Window**, and check that the rule and the `strale` MCP server appear
under **Customize**.

## License

MIT
