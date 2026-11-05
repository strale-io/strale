---
slug: iban-validation-mcp
title: "How do I validate IBANs through MCP in Claude Desktop or Cursor?"
description: "Add the Strale MCP server to Claude Desktop or Cursor and ask for an IBAN check. Free tools need no key."
group: payments
framework: "MCP"
language: "JSON"
tools: [iban-validate, swift-validate, email-validate, dns-lookup]
steps:
  - "Open your MCP configuration file (Claude Desktop: `claude_desktop_config.json`; Cursor: `.cursor/mcp.json`)."
  - "Add the Strale server entry."
  - "Restart the app so it loads the server."
  - "Ask for an IBAN check."
---
Add the Strale MCP server to your client's configuration and ask the assistant to validate an IBAN. `iban-validate` is {{cost:iban-validate}} and runs without a key, within {{fact:free_limit}} free calls a month per IP address across all free tools.

## The solution

```json Config
{
  "mcpServers": {
    "strale": {
      "command": "npx",
      "args": ["-y", "strale-mcp"]
    }
  }
}
```

Then ask the assistant:

```text Prompt
Validate this IBAN: DE89370400440532013000
```

## How it works

The server adds a small set of meta-tools to your client, not one tool per Strale tool. The assistant finds a tool with `strale_search` and runs it with `strale_execute`, so you can ask for "a way to check a bank code" without knowing a slug.

Free tools need no key. For paid tools, set `STRALE_API_KEY` in the server's `env` block. The full set of options, the hosted server and Claude Code are covered in [Connect over MCP](/docs/mcp).
