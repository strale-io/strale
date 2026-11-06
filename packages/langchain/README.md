# straleio-langchain

A [LangChain](https://js.langchain.com) tool for [Strale](https://strale.io?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1): give a LangChain agent one tool that can call Strale's pay-per-call tools with your Strale API key.

`StraleFallbackTool` extends LangChain's `Tool` class (from `@langchain/core/tools`) and calls Strale through the [`straleio`](https://www.npmjs.com/package/straleio) client. It does nothing else: one class, no other exports.

## Install

```bash
npm install straleio-langchain straleio @langchain/core
```

## Use

```typescript
import { StraleFallbackTool } from "straleio-langchain";

const strale = new StraleFallbackTool({
  apiKey: process.env.STRALE_API_KEY!, // from strale.io/signup
  maxPrice: 0.5, // EUR per call; default 2.00
});

// Hand it to any LangChain agent that accepts a Tool.
const tools = [strale];
```

The agent describes what it needs in plain language, for example `validate VAT number SE556703748501`. Strale matches a tool, runs it and returns JSON with `capability_used`, `price_cents`, `output` and `provenance` (the source and fetch time). A failed call returns `{ "error": true, "error_code", "message" }` instead of throwing.

## Options

| Option | Meaning |
|---|---|
| `apiKey` | Your Strale API key (required). |
| `maxPrice` | The most one call may cost, in EUR. The call is refused above it. Default 2.00. |
| `capabilitySlug` | Always use this tool instead of matching the task. The input text is sent as its `task` input. |
| `baseUrl` | Override the API address. |

Calls are paid per call from your Strale balance. Tool inputs, output fields and prices are listed at [strale.io/tools](https://strale.io/tools?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1).

The requests carry the header `X-Strale-Client: straleio-langchain/<version>`, so Strale can tell which integration a call came from.

For Python, see [`langchain-strale`](https://pypi.org/project/langchain-strale/). To use Strale from any MCP client instead, see [`strale-mcp`](https://www.npmjs.com/package/strale-mcp).

## Licence

MIT, Moonlighter AB.
