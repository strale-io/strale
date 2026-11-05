---
slug: mcp-server-claude-code-setup
title: "How do I add the Strale MCP server to Claude Code?"
description: "One command adds Strale as an MCP server in Claude Code. Free tools work without a key."
group: agents
framework: "MCP"
language: "Shell, JSON"
tools: [iban-validate, email-validate, dns-lookup, json-repair]
steps:
  - "Run the `claude mcp add` command."
  - "Or create `.mcp.json` in your project root."
  - "Add `STRALE_API_KEY` for paid tools (optional)."
  - "Ask Claude Code to use a Strale tool."
---
Add Strale to Claude Code with one command. Free tools work without an API key, within {{fact:free_limit}} free calls a month per IP address across all free tools.

## The solution

```bash Command
claude mcp add strale -- npx -y strale-mcp
```
```json .mcp.json
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

Then ask Claude Code:

```text Prompt
Validate this IBAN: DE89370400440532013000
```

## How it works

The server gives Claude Code a few meta-tools. `strale_search` finds a tool by keyword, `strale_execute` runs it and `strale_balance` shows your wallet balance. Ask "what Strale tools can check financial data?" and it lists matches with their prices.

The server runs as a local process, and `npx -y strale-mcp` fetches the latest version. Leave the key out to use free tools only. The hosted server and every option are in [Connect over MCP](/docs/mcp).
