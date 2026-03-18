# straleio

TypeScript SDK for the [Strale](https://strale.dev) API — let AI agents buy and execute capabilities at runtime.

## Install

```bash
npm install straleio
```

## Quick start

```typescript
import { Strale } from "straleio";

const strale = new Strale({ apiKey: "sk_live_..." });

const result = await strale.do({
  task: "validate VAT number SE556703748501",
});

console.log(result.output);
// { valid: true, country_code: "SE", company_name: "Spotify AB" }
```

## Execute by slug

```typescript
const result = await strale.do({
  capabilitySlug: "vat-validate",
  inputs: { vat_number: "SE556703748501" },
  maxPriceCents: 10,
});
```

## Dry run (preview cost without executing)

```typescript
const preview = await strale.dryRun({
  task: "look up Swedish company Klarna",
});

console.log(preview.matched_capability); // "swedish-company-data"
console.log(preview.price_cents);        // 80
```

## Check balance

```typescript
const balance = await strale.getBalance();
console.log(balance.balance_eur); // "1.84"
```

## List capabilities

```typescript
const capabilities = await strale.listCapabilities();
// 250+ capabilities with slug, name, price, category
```

## Free-tier (no API key)

5 capabilities work without authentication:

```typescript
const strale = new Strale({ apiKey: "" });

const result = await strale.do({
  capabilitySlug: "email-validate",
  inputs: { email: "hello@example.com" },
});
```

## Options

```typescript
const strale = new Strale({
  apiKey: "sk_live_...",
  baseUrl: "https://api.strale.io",   // default
  timeout: 60_000,                     // ms, default 60s
  defaultMaxPriceCents: 200,           // cap per call, default €2.00
});
```

## Error handling

```typescript
import { Strale, StraleError } from "straleio";

try {
  const result = await strale.do({ task: "..." });
} catch (err) {
  if (err instanceof StraleError) {
    console.error(err.code);    // "insufficient_balance" | "no_matching_capability" | ...
    console.error(err.message);
  }
}
```

---

## Try for Free

5 capabilities work without an API key or signup:

- `email-validate` — verify email deliverability
- `dns-lookup` — DNS record lookup
- `json-repair` — fix malformed JSON
- `url-to-markdown` — convert any URL to markdown
- `iban-validate` — validate international bank account numbers

For all 250+ capabilities, [sign up](https://strale.dev/signup) for €2 in free trial credits.

## Resources

- 📖 [Documentation](https://strale.dev/docs)
- 💡 [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration
- 💰 [Pricing](https://strale.dev/pricing)
- 🔍 [Quality methodology](https://strale.dev/methodology)
- 🔒 [Security](https://strale.dev/security)

## License

MIT — see [LICENSE](../../LICENSE)
