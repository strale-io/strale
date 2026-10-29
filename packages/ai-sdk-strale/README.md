# strale-ai-sdk

[Vercel AI SDK](https://ai-sdk.dev) tools for [Strale](https://strale.dev?src=npm-ai-sdk&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d6),
a library of pay-per-call tools for AI agents: company registry lookups, VAT and
IBAN checks, sanctions and PEP screening, web page reading, finance and developer
utilities. One package, no account with each data provider.

The package gives the model two tools built with the AI SDK's `tool()`:

| Tool | What it does |
|---|---|
| `strale_search` | Finds tools and bundled solutions for a task. Returns slug, description, price in EUR cents and the input schema. No key needed. |
| `strale_execute` | Runs one tool or solution by slug with the inputs from the schema, and returns the output with its source provenance. |

## Install

```bash
npm install strale-ai-sdk ai zod
```

Requires `ai` 7.x and Node.js 20.3 or later.

## Use

```ts
import { generateText, isStepCount } from "ai";
import { straleTools } from "strale-ai-sdk";

const { text } = await generateText({
  model: "anthropic/claude-sonnet-4.5",
  prompt: "Look up UK company 00445790 and tell me its status and registered address.",
  tools: straleTools(), // reads STRALE_API_KEY from the environment
  stopWhen: isStepCount(5),
});

console.log(text);
```

The model calls `strale_search`, reads the input schema of the best match, then
calls `strale_execute`. You can also add the tools one at a time with
`straleSearch()` and `straleExecute()`.

## Paying for calls

`strale_execute` picks the payment route in this order:

1. **API key.** Pass `apiKey`, or set `STRALE_API_KEY`. Calls are debited from your
   Strale wallet and refused above `maxPriceCents` (default 200, i.e. €2.00).
   Get a key at [strale.dev/signup](https://strale.dev/signup?src=npm-ai-sdk).
2. **x402.** With no key, pass `x402Fetch`: a fetch that settles x402 payment
   challenges in USDC on Base, such as `wrapFetchWithPayment` from
   [`x402-fetch`](https://www.npmjs.com/package/x402-fetch). The payment is the
   authentication; no signup. The wrapper's own spending limit applies, and only
   tools listed at `https://api.strale.io/x402/catalog` can be paid this way.

   ```ts
   import { wrapFetchWithPayment } from "x402-fetch";
   import { privateKeyToAccount } from "viem/accounts";

   const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`);
   const tools = straleTools({ x402Fetch: wrapFetchWithPayment(fetch, account) });
   ```
3. **Neither.** Only the free tools answer; the rest return an error the model can
   read, with how to pay.

Failures come back as `{ ok: false, error_code, message, fix }` so the model can
recover; network errors and timeouts are thrown to the AI SDK as tool errors.

## Options

| Option | Default | Meaning |
|---|---|---|
| `apiKey` | `process.env.STRALE_API_KEY` | Strale API key. |
| `x402Fetch` | none | Paying fetch for the x402 route, used when no key is set. |
| `fetch` | `globalThis.fetch` | Fetch for all other requests. |
| `baseUrl` | `https://api.strale.io` | API origin. |
| `maxPriceCents` | `200` | Highest price for one API-key call, in EUR cents. |
| `timeoutMs` | `60000` | Per-request timeout. |

## Limits

- Tools that run longer than a few seconds return `status: "executing"` with a
  `transaction_id`. Fetch the result from `GET /v1/transactions/{id}` with the
  same key; this package does not poll.
- `strale_search` makes one extra request per result to fetch its input schema.

Every request sends the header `X-Strale-Client: strale-ai-sdk/<version>`, so
Strale can count calls that came through this package. It carries no user data.

## License

MIT
