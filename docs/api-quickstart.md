# Strale API Quickstart

## Free capabilities (no API key needed)

These capabilities work without signup or authentication. IP rate limited to 10 requests/day.

### Validate an email

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "email-validate", "inputs": {"email": "user@example.com"}}'
```

### Validate an IBAN

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "iban-validate", "inputs": {"iban": "DE89370400440532013000"}}'
```

### DNS lookup

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "dns-lookup", "inputs": {"domain": "example.com"}}'
```

### Convert URL to Markdown

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "url-to-markdown", "inputs": {"url": "https://example.com"}}'
```

### Fix malformed JSON

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "json-repair", "inputs": {"json_string": "{name: \"test\", missing: true,}"}}'
```

## Paid capabilities (API key required)

Set your API key as an environment variable:

```bash
export STRALE_API_KEY=sk_live_your_key_here
```

### Python

```python
import os
from straleio import Strale

s = Strale(api_key=os.environ["STRALE_API_KEY"])

# Execute a capability by slug
result = s.do(capability_slug="vat-validate", inputs={"vat_number": "SE556703748501"})
print(result.output)
# {"valid": True, "country_code": "SE", "company_name": "Spotify AB"}
print(result.provenance)  # data source and timestamp

# Run a multi-step solution
kyb = s.do(solution="kyb-essentials-se", input={"org_number": "5591674668"})
print(kyb.output)

# Dry run (preview cost without executing)
preview = s.dry_run(task="look up Swedish company Klarna")
print(preview.matched_capability)  # "swedish-company-data"
print(preview.price_cents)         # 80
```

### TypeScript

```typescript
import { Strale } from 'straleio';

const s = new Strale({ apiKey: process.env.STRALE_API_KEY });

// Execute a capability by slug
const result = await s.do({
  capabilitySlug: 'vat-validate',
  inputs: { vat_number: 'SE556703748501' },
});
console.log(result.output);
console.log(result.provenance);

// Run a multi-step solution
const kyb = await s.do({
  solution: 'kyb-essentials-se',
  input: { org_number: '5591674668' },
});

// Dry run
const preview = await s.dryRun({ task: 'look up Swedish company Klarna' });
console.log(preview.matched_capability); // "swedish-company-data"
console.log(preview.price_cents);        // 80
```

### Direct HTTP (any language)

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -d '{"capability_slug": "swedish-company-data", "inputs": {"query": "5591674668"}}'
```

## MCP Server (for AI coding agents)

Connect any MCP client (Claude Code, Cursor, Windsurf, etc.) to Strale:

```json
{
  "mcpServers": {
    "strale": {
      "type": "streamableHttp",
      "url": "https://api.strale.io/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_your_key_here"
      }
    }
  }
}
```

Free capabilities work without the Authorization header.

## Check sources and limitations before calling

Read each tool's inputs, source and limitations in the catalogue. Public test
and availability signals describe observed tests, not a guarantee about the next call.

## Browse available capabilities

```bash
curl https://api.strale.io/v1/capabilities
```

Categories: compliance, validation, data-extraction, developer-tools, web3, security, web-scraping, monitoring, financial, text-processing, and more.

## Get an API key

Sign up at [strale.dev](https://strale.dev) — trial credits are available where eligible.

## Several agents on one wallet

Create a separate additional key per agent with `POST /v1/api-keys`. Authenticate
with your primary key. Save `api_key` from the 201 response
securely: it is shown once and never included in list/update/revoke responses.

```json
{"label":"Invoice agent","max_spend_per_hour_cents":100,"max_spend_total_cents":1000}
```

- `GET /v1/api-keys` lists at most 25 active additional keys (revoked keys are excluded): `id`,
  `key_prefix`, `label`, both caps, `spent_hour_cents`, `spent_total_cents`,
  `created_at`, `last_used_at`, `revoked_at`. Dates are ISO 8601 or null.
- `PATCH /v1/api-keys/{id}` updates label and/or caps. Omitted fields stay as
  they are; null removes a cap; zero prevents paid calls. Caps are integer
  EUR cents from 0 through 2147483647. Labels are 1–64 characters after trimming; control characters are rejected, including before trimming.
- `DELETE /v1/api-keys/{id}` revokes idempotently. Only the primary key can revoke additional keys. The primary key remains available or recoverable through email recovery.

All four endpoints require the primary key as Bearer auth and share a 5 requests/second/account
management limit. A revoked key gets exactly the same 401 body as an unknown key.
The primary key and its account cap remain in place. Every additional-key paid
capability or solution call must pass both the account cap and its own caps.
x402 payments are unchanged.

A refusal returns HTTP 429 and `error_code` of `key_hourly_cap_exceeded` or
`key_total_cap_exceeded`, with `spent_cents`, `requested_cents`, and `limit_cents`
in `details`, alongside `retryable: false`. Ask the owner to raise that key's cap using the primary key, or use another key. `spend_cap_exceeded`
continues to mean the account hourly limit. The hour is a rolling 60 minutes.
Spending is ledger purchases, including open async reservations, less refunds
linked to the original purchase. A refund restores that purchase's budget; its
hour follows the purchase time. No balance/counter is stored on the key.

Last-used timestamps update at most once a minute per key across replicas.
Revocation/cap updates serialize with debits on the wallet row lock; an already
locked call can finish before revocation takes effect. Free calls have no debit.

Additional keys are spending keys: they can execute capabilities/solutions and
read balances, transactions and results, but cannot manage the account. Creating,
listing, updating or revoking keys, rotating the primary key, closing the account,
erasing transactions, reissuing audit links, submitting account-holder disputes and starting a Stripe wallet top-up
require the primary key. Additional keys receive HTTP 403 `primary_key_required`
with "Use the account's primary key for this action".

At most 25 non-revoked additional keys can exist per account. The 26th create
returns HTTP 409 `active_key_limit_exceeded`: "Revoke an unused key first".
Email recovery rotates only the primary key. Additional keys survive recovery and
can still spend up to their caps. Use the recovered primary key to review
`GET /v1/api-keys` and revoke unused or unrecognized keys with
`DELETE /v1/api-keys/{id}`. Keeping additional keys active avoids unexpectedly
stopping every agent when the owner recovers the primary key. Keep that primary
key secure. The dashboard key UI is follow-up. See `/openapi.json` for schemas.


## Recovering from errors

Errors keep the DEC-19 shape `{ error_code, message, details? }`. Branch on
`error_code`, not message text. Codes, status codes and existing fields are
unchanged. `details` is extensible; clients should accept unknown fields.

Caller-fixable errors include `details.fix`: an imperative sentence explaining
what to change. Input refusals may include `field` and `required_fields`;
alternative-field constraints may include `any_of` or `one_of` schema groups;
wallet validation includes `min_topup_cents`; discovery guidance may include
`docs_url`. Rate limits include `retry_after_seconds` when the limiter knows
the wait, and the fix uses that real wait. Honour the `Retry-After` header.
Do not retry a spend-cap refusal automatically: wait for rolling usage to fall or contact support to change the account limit;
per-key limits can be changed by the account owner with PATCH /v1/api-keys/:id.

```json
{
  "error_code": "invalid_request",
  "message": "Missing required input fields: email",
  "details": {
    "fix": "Send the missing fields inside 'inputs': email.",
    "missing_fields": ["email"],
    "required_fields": ["email"]
  }
}
```

Failures outside the caller's control include `details.retryable` and a
`details.next_step` explaining whether to back off or contact support.
`retryable: false` means unchanged retries will not resolve the error.
Keep the `transaction_id` for support. Follow idempotency and payment rules
before retrying: a new payment authorization can create a new paid call.

The TypeScript SDK keeps `StraleError.message` unchanged and retains
`StraleError.details`; `fix`, `retryable` and `nextStep` expose the corresponding
details fields when present. MCP tool error text includes the fix as well as details.
x402 retains its payment challenge and legacy `error` fields, adding `details`;
A2A and HTTP MCP protocol errors carry guidance at `error.data.details`.
The executor rollout covers the tools listed in the error inventory;
remaining executors can adopt explicit field-level fixes in a later batch.
