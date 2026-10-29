# strale-semantic-kernel

> **Deprecated (2026-10-29).** This package is built on
> [`semantic-kernel` on npm](https://www.npmjs.com/package/semantic-kernel),
> an unofficial community port of Semantic Kernel to JavaScript
> (`afshinm/semantic-kernel-js`), not a Microsoft package. It gets no new
> features or fixes. Use the Strale MCP server instead: connect to
> `https://api.strale.io/mcp?src=npm-readme`, or run `npx strale-mcp`.
> Semantic Kernel for Python and .NET can load MCP servers as plugins.

[Strale](https://strale.dev?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) capabilities as Semantic Kernel functions. Company data, VAT validation, web scraping, compliance checks, and more — available to your SK agents with a single import.

## Install

```bash
npm install strale-semantic-kernel semantic-kernel
```

## Quick start

```typescript
import { createStralePlugin } from "strale-semantic-kernel";

const plugin = await createStralePlugin({ apiKey: "sk_live_..." });

// plugin.functions contains available kernel functions
console.log(`Loaded ${plugin.functions.length} Strale capabilities`);
```

## Use with Semantic Kernel

```typescript
import { Kernel, FunctionChoiceBehavior, functionInvocation } from "semantic-kernel";
import { OpenAIChatClient } from "@semantic-kernel/openai";
import { createStralePlugin } from "strale-semantic-kernel";

const chatClient = new OpenAIChatClient({
  apiKey: process.env.OPENAI_API_KEY!,
  modelId: "gpt-4o",
}).asBuilder().use(functionInvocation).build();

const kernel = new Kernel().addService(chatClient);

const stralePlugin = await createStralePlugin({ apiKey: "sk_live_..." });
kernel.addPlugin(stralePlugin);

const result = await kernel.invokePrompt(
  "Validate the VAT number SE556703748501",
  {
    executionSettings: {
      functionChoiceBehavior: FunctionChoiceBehavior.Auto(),
    },
  }
);
```

## Filter by category

```typescript
const plugin = await createStralePlugin({
  apiKey: "sk_live_...",
  categories: ["finance", "compliance"],
});
```

## Direct API client

```typescript
import { StraleClient } from "strale-semantic-kernel";

const client = new StraleClient({ apiKey: "sk_live_..." });

// List all capabilities
const caps = await client.listCapabilities();

// Execute a capability
const result = await client.execute({
  capabilitySlug: "vat-format-validate",
  inputs: { vat_number: "SE556703748501" },
  maxPriceCents: 10,
});

// Check balance
const balance = await client.getBalance();
```

## What's included

Each Strale capability becomes a kernel function with:

- **name** — capability slug (e.g. `vat-validate`, `swedish-company-data`)
- **description** — what it does + price in EUR
- **schema** — JSON Schema for parameters
- **implementation** — calls the Strale API

Plus two meta-functions:

- **strale_search** — discover capabilities by keyword
- **strale_balance** — check your wallet balance

## Solutions (KYB & Invoice Verify)

```typescript
// Solutions are discoverable via strale_search
// available solutions: KYB Essentials, KYB Complete, Invoice Verify × available countries
const result = await client.execute({
  solution: "kyb-essentials-se",
  inputs: { org_number: "5591674668" },
});
```

## Get an API key

Sign up at [strale.dev](https://strale.dev?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) — trial eligibility is determined at signup.

---

## Try for Free

available capabilities work without an API key or signup:

- `email-validate` — verify email deliverability
- `dns-lookup` — DNS record lookup
- `json-repair` — fix malformed JSON
- `url-to-markdown` — convert any URL to markdown
- `iban-validate` — validate international bank account numbers

For all available capabilities, [sign up](https://strale.dev/signup?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) for paid access; trial eligibility is determined at signup.

## Using Strale in agent system prompts

Add this to your Semantic Kernel agent's system prompt for automatic capability routing:

```
When you need to verify a business, validate an IBAN or VAT number, screen
against sanctions/PEP lists, extract data from a URL or document, or check
compliance — use your Strale kernel functions. Call strale_search to find
the right capability, then invoke it. Returns structured JSON with execution metadata. Coverage and free-tier eligibility are listed in platform facts. Free tier: email-validate,
dns-lookup, json-repair, url-to-markdown, iban-validate (no API key needed).
```

## x402 pay-per-use access

Eligible Strale tools are also available via [x402](https://x402.org) — the HTTP-native payment protocol for AI agents. Pay per request with USDC on Base mainnet. No signup or API key needed.

- Catalog: https://api.strale.io/x402/catalog?src=npm-readme
- Protocol: USDC on Base (eip155:8453)
- Discovery: https://api.strale.io/.well-known/x402.json

## Resources

- 📖 [Documentation](https://strale.dev/docs?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 💡 [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration
- 💰 [Pricing](https://strale.dev/pricing?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 🔍 [Quality methodology](https://strale.dev/methodology?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- 🔒 [Security](https://strale.dev/security?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)

This JavaScript integration uses the community `semantic-kernel` npm port. It is not Microsoft’s official .NET or Python Semantic Kernel SDK.
