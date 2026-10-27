# straleio

TypeScript client for the [Strale](https://strale.dev?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) API: call any Strale tool from your code with one API key, paid per call from your Strale balance.

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

`max_price_cents` caps what one call may cost: the call is refused with `budget_exceeded` if the tool costs more. The API also has a hard ceiling per request. Each tool's inputs, output fields and price are on its page at [strale.dev/capabilities](https://strale.dev/capabilities?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1) and in `strale.capability(slug)`.

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

Each bundle's inputs and price are on its page at [strale.dev/solutions](https://strale.dev/solutions?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1).

## Free tools

This client always sends an API key. Free tools cost nothing with a key. They also work without any key at a small daily limit, if you call the REST API directly:

```bash
curl -X POST https://api.strale.io/v1/do?src=npm-readme \
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
    // top up at https://strale.dev/topup?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1
  } else if (err instanceof StraleError) {
    console.error(err.errorCode, err.statusCode, err.message);
  }
}
```

Common `errorCode` values include `insufficient_balance`, `budget_exceeded` (the tool costs more than `max_price_cents`), `spend_cap_exceeded`, `no_matching_capability`, `capability_unavailable`, `execution_failed`, `timeout_exceeded`, `invalid_request`, `rate_limited`, `unauthorized` and `not_found`. Codes without their own error class arrive as a plain `StraleError`.

## Resources

- [Documentation](https://strale.dev/docs?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- [Pricing](https://strale.dev/pricing?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)
- [Security](https://strale.dev/security?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1)

## License

MIT — see [LICENSE](https://github.com/strale-io/strale/blob/main/LICENSE)

### Additional API keys

```typescript
const agentKey = await strale.createApiKey({
  label: "Invoice agent",
  max_spend_per_hour_cents: 100,
  max_spend_total_cents: 1000,
});
// Store agentKey.api_key securely now. It is returned only once.
const keys = await strale.apiKeys();
await strale.updateApiKey(agentKey.id, { max_spend_total_cents: 2000 });
await strale.revokeApiKey(agentKey.id);
```

Caps are integer EUR cents; null means unlimited, zero blocks paid calls.
Both account and key caps apply. List results include net ledger spending for
the rolling hour and lifetime, last-use time, and revocation time, never secrets
or hashes. Refunds restore the budget of the original purchase. The primary key
is unchanged and cannot be revoked through these methods. These management
methods require a client configured with the account's primary key. Additional
keys may spend and read, but cannot list/manage keys, rotate the primary key,
close the account, erase transactions, reissue audit links, submit account-holder disputes or start wallet top-ups.
Those actions return 403 `primary_key_required` for additional keys.

The account may have at most 25 active additional keys; a 26th create returns 409
`active_key_limit_exceeded` ("Revoke an unused key first"). `apiKeys()` returns
at most 25 active keys and excludes revoked keys. Labels are trimmed, must be
1–64 characters and cannot contain control characters. Management is limited to
5 requests/second/account. Cap errors retain HTTP 429, preserve
`key_hourly_cap_exceeded` / `key_total_cap_exceeded` in `StraleError.errorCode`
and include `details.retryable: false`; ask the owner to raise the cap using the
primary key, or use another key. x402 is unchanged.

Email recovery rotates only the primary key. Additional keys survive and can
still spend up to their caps. Configure the client with the recovered primary
key, call `apiKeys()`, and `revokeApiKey(id)` for unused or unrecognized keys.

### Error recovery

`StraleError.message` contains the API's original message unchanged. Use
`error.fix` for caller guidance, `error.retryable` to decide whether to retry,
and `error.nextStep` for the next action when the failure is outside your control.
These optional properties read `details.fix`, `details.retryable`, and
`details.next_step`; the full response details remain on `error.details`.
