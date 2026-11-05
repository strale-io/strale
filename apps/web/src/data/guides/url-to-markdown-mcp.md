---
slug: url-to-markdown-mcp
title: "How do I fetch and convert web pages to Markdown through MCP?"
description: "Add the Strale MCP server to your client and ask the assistant to turn a URL into Markdown. Free tools need no key."
group: web
framework: "MCP"
language: "JSON"
tools: [url-to-markdown, web-extract, dns-lookup, email-validate]
steps:
  - "Add the Strale MCP server to your client's configuration. No key is needed for free tools."
  - "Restart the client."
  - "Ask the assistant to convert a URL to Markdown."
  - "Use the Markdown it returns."
---
Add the Strale MCP server to your client and ask the assistant to convert a URL to Markdown. `url-to-markdown` is {{cost:url-to-markdown}} and runs without a key, within {{fact:free_limit}} free calls a month per IP address across all free tools.

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

Then ask:

```text Prompt
Convert https://example.com to Markdown
```

## How it works

The assistant calls `strale_execute` with `url-to-markdown` and the URL. The tool extracts the page's main content and returns it as Markdown, which is cheaper for a model to read than raw HTML.

It follows the site's robots.txt and stops at pages that block automated access. Pages behind a login or a paywall cannot be read.

`strale_search` lets the assistant find other tools. Ask "what tools do you have for reading web pages?" and it lists the options, including [Web Extract](/tools/web-extract). The server's options are in [Connect over MCP](/docs/mcp).
