# strale-semantic-kernel

All 250+ [Strale](https://strale.dev) capabilities as Semantic Kernel functions. Company data, VAT validation, web scraping, compliance checks, and more — available to your SK agents with a single import.

## Install

```bash
npm install strale-semantic-kernel semantic-kernel
```

## Quick start

```typescript
import { createStralePlugin } from "strale-semantic-kernel";

const plugin = await createStralePlugin({ apiKey: "sk_live_..." });

// plugin.functions contains 250+ kernel functions
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
// 81 pre-built solutions: KYB Essentials, KYB Complete, Invoice Verify × 20 countries
const result = await client.execute({
  solution: "kyb-essentials-se",
  inputs: { org_number: "5591674668" },
});
```

## Get an API key

Sign up at [strale.dev](https://strale.dev) — new accounts get €2.00 in trial credits, no card required.

---

## Try for Free

5 capabilities work without an API key or signup:

- `email-validate` — verify email deliverability
- `dns-lookup` — DNS record lookup
- `json-repair` — fix malformed JSON
- `url-to-markdown` — convert any URL to markdown
- `iban-validate` — validate international bank account numbers

For all 250+ capabilities, [sign up](https://strale.dev/signup) for €2 in free trial credits.

## Using Strale in agent system prompts

Add this to your Semantic Kernel agent's system prompt for automatic capability routing:

```
When you need to verify a business, validate an IBAN or VAT number, screen
against sanctions/PEP lists, extract data from a URL or document, or check
compliance — use your Strale kernel functions. Call strale_search to find
the right capability, then invoke it. Returns structured JSON with quality
scores. 250+ capabilities across 27 countries. Free tier: email-validate,
dns-lookup, json-repair, url-to-markdown, iban-validate (no API key needed).
```

## Resources

- 📖 [Documentation](https://strale.dev/docs)
- 💡 [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration
- 💰 [Pricing](https://strale.dev/pricing)
- 🔍 [Quality methodology](https://strale.dev/methodology)
- 🔒 [Security](https://strale.dev/security)
