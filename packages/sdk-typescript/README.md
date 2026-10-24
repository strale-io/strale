# straleio

TypeScript client for the [Strale](https://strale.dev) API: call any Strale tool from your code with one API key, paid per call from your Strale balance.

## Install

```bash
npm install straleio
```

## Quick start

```typescript
import { Strale } from "straleio";

const strale = new Strale({ apiKey: process.env.STRALE_API_KEY! });

const result = await strale.do({
  capability_slug: "vat-validate",
  inputs: { vat_number: "SE556703748501" },
  max_price_cents: 10,
});

console.log(result.output);     // the tool's structured fields
console.log(result.provenance); // { source, fetched_at }
```

`max_price_cents` caps what one call may cost: the call is refused with `budget_exceeded` if the tool costs more. The API also has a hard ceiling per request. Each tool's inputs, output fields and price are on its page at [strale.dev/capabilities](https://strale.dev/capabilities) and in `strale.capability(slug)`.

## Describe the task instead of naming the tool

```typescript
const result = await strale.do({
  task: "validate VAT number SE556703748501",
  max_price_cents: 10,
});
console.log(result.capability_used); // the tool Strale matched
```

## Dry run: see what would run and what it costs

```typescript
import type { DryRunResponse } from "straleio";

// do() returns a DryRunResponse when dry_run is true. The current typings resolve
// to DoResponse, so the cast is needed until the overloads are reordered.
const preview = (await strale.do({
  task: "look up Swedish company 556703-7485",
  max_price_cents: 50,
  dry_run: true,
})) as unknown as DryRunResponse;

console.log(preview.would_execute);     // the tool that would run
console.log(preview.price_cents);       // its price
console.log(preview.wallet_sufficient); // whether your balance covers it
```

## Balance, tools and past calls

```typescript
const balance = await strale.balance();        // { balance_cents, currency }
const tools = await strale.capabilities();     // every tool: slug, name, description, category, price_cents, schemas
const tool = await strale.capability("vat-validate");
const recent = await strale.transactions();
const one = await strale.transaction(recent[0].id);
```

## Bundled checks

Bundled checks (for example `kyb-essentials-se`) are not in this client yet. Call them over REST:

```typescript
const res = await fetch("https://api.strale.io/v1/solutions/kyb-essentials-se/execute", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.STRALE_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ inputs: { org_number: "5567037485" } }),
});
```

Each bundle's inputs and price are on its page at [strale.dev/solutions](https://strale.dev/solutions).

## Free tools

This client always sends an API key. Free tools cost nothing with a key. They also work without any key at a small daily limit, if you call the REST API directly:

```bash
curl -X POST https://api.strale.io/v1/do \
  -H 'Content-Type: application/json' \
  -d '{"capability_slug": "email-validate", "inputs": {"email": "hello@example.com"}}'
```

The current list of free tools is `free_tier_slugs` in [`/v1/platform/facts`](https://api.strale.io/v1/platform/facts).

## Options

```typescript
const strale = new Strale({
  apiKey: "sk_live_...",               // required
  baseUrl: "https://api.strale.io",    // default
  timeout: 60_000,                     // ms per HTTP request, default 60 s
  defaultMaxPriceCents: 100,           // fallback only if max_price_cents is undefined at runtime (the typings require it); no default
  pollInterval: 2_000,                 // ms between polls for long-running calls
  maxPollWait: 120_000,                // ms to keep polling before giving up
});
```

## Error handling

```typescript
import { Strale, StraleError, InsufficientBalanceError } from "straleio";

try {
  await strale.do({ capability_slug: "vat-validate", inputs: { vat_number: "SE556703748501" }, max_price_cents: 10 });
} catch (err) {
  if (err instanceof InsufficientBalanceError) {
    // top up at https://strale.dev/topup
  } else if (err instanceof StraleError) {
    console.error(err.errorCode, err.statusCode, err.message);
  }
}
```

Common `errorCode` values include `insufficient_balance`, `budget_exceeded` (the tool costs more than `max_price_cents`), `spend_cap_exceeded`, `no_matching_capability`, `capability_unavailable`, `execution_failed`, `timeout_exceeded`, `invalid_request`, `rate_limited`, `unauthorized` and `not_found`. Codes without their own error class arrive as a plain `StraleError`.

## Resources

- [Documentation](https://strale.dev/docs)
- [Pricing](https://strale.dev/pricing)
- [Security](https://strale.dev/security)

## License

MIT — see [LICENSE](https://github.com/strale-io/strale/blob/main/LICENSE)
