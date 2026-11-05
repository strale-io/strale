---
slug: kyb-mcp-claude
title: "How do I run a company check in Claude Desktop through MCP?"
description: "Add the Strale MCP server to Claude Desktop and ask Claude to look up a company, check its VAT number and screen it. No code."
group: companies
framework: "MCP"
language: "JSON"
tools: [uk-company-data, sanctions-check, vat-format-validate, pep-check]
steps:
  - "Add the Strale MCP server to your Claude Desktop configuration with your API key."
  - "Restart Claude Desktop."
  - "Ask Claude to check a company."
  - "Claude searches for the tools and runs the lookups one after another."
---
Add the Strale MCP server to Claude Desktop with your API key and ask Claude to look up a company, check its VAT number and screen it. Claude finds and chains the tools itself. The tools used here need a key.

## The solution

```json Config
{
  "mcpServers": {
    "strale": {
      "command": "npx",
      "args": ["-y", "strale-mcp"],
      "env": {
        "STRALE_API_KEY": "sk_live_YOUR_KEY"
      }
    }
  }
}
```

Then ask Claude:

```text Prompt
Verify UK company 00445790. Look up its company data, check its VAT number and run a sanctions screening.
```

## How it works

The Strale MCP server gives Claude a few meta-tools: `strale_search` finds a tool, `strale_execute` runs it. For a company check Claude typically looks up the company, then screens the name. A VAT number is not part of the company lookup result: if you want it checked, give Claude the number from your own records. Screening results are matches for a person to review, not a verdict.

Each `strale_execute` call carries a price ceiling, so a tool that costs more than the ceiling is refused before it runs. The options are in [Connect over MCP](/docs/mcp).

For a repeatable check, use a bundled check instead. It runs the same steps in one call, at one price, with one record. They are listed under [Bundled checks](/tools#bundled).
