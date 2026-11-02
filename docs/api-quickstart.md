# Strale API Quickstart

## Free capabilities (no API key needed)

These capabilities work without signup or authentication. The anonymous per-IP allowance resets each calendar month (UTC); read `static.free_tier_monthly_limit` from `GET https://api.strale.io/v1/platform/facts` for the current number. An hourly anti-abuse guard also applies.

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
Spending includes open undebited sync holds plus ledger purchases (including
open async reservations), less refunds
linked to the original purchase. A refund restores that purchase's budget; its
hour follows the purchase time. No balance/counter is stored on the key.

Last-used timestamps update at most once a minute per key across replicas.
Revocation/cap updates serialize with reservations on the wallet row lock; a
call reserved before revocation can finish and capture its reserved amount. Free calls have no debit.

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
An x402 payment is bound to the capability or solution it was first presented
to. Presenting the same payment for different work returns HTTP 409
`payment_already_used`; sign a fresh authorization for that tool. A settlement
that fails or cannot be confirmed after the tool ran returns HTTP 402
`payment_failed`; check your wallet before signing a fresh authorization. If
settlement could not start, the response is HTTP 503 `payment_failed` with
`retryable: true`: no payment was taken and the same request can be retried.

The TypeScript SDK keeps `StraleError.message` unchanged and retains
`StraleError.details`; `fix`, `retryable` and `nextStep` expose the corresponding
details fields when present. MCP tool error text includes the fix as well as details.
x402 retains its payment challenge and legacy `error` fields, adding `details`;
A2A and HTTP MCP protocol errors carry guidance at `error.data.details`.
The executor rollout covers the tools listed in the error inventory;
remaining executors can adopt explicit field-level fixes in a later batch.

## Batch calls: one tool, many inputs

`POST /v1/do/batch` runs one paid tool over up to 100 inputs in one request,
with one quote and one Idempotency-Key. API key and wallet only.

```bash
curl -X POST https://api.strale.io/v1/do/batch \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: vat-run-2026-10-29" \
  -d '{"capability_slug": "vat-validate",
       "inputs": [{"vat_number": "SE556703748501"}, {"vat_number": "DE811569869"}],
       "max_total_price_cents": 10}'
```

- The quote is the tool's `price_cents` times the number of inputs. It must
  not exceed `max_total_price_cents`, the wallet must cover it, and the hourly
  spend cap and the key's spend limits count all of it. The whole quote is
  held before anything runs.
- Every input is validated first. One invalid input refuses the batch with its
  index in `details.invalid_items`, and nothing is charged.
- Items run five at a time. Each completed item is charged its price; a failed
  item is not. Items not started within the batch's 90-second budget come back
  as `not_run`, not charged, and can be resent.
- `results` is in input order, one entry per input, each with `status`,
  `price_cents` (what that item was charged), `output` and `transaction_id`.
  `charged_cents` and `released_cents` give the totals.
- The rate limit counts items: 300 per minute per key.
- Retrying with the same Idempotency-Key returns the recorded results without
  charging again; while the first batch is still running, the retry gets 409
  `request_in_progress`.
- `dry_run: true` validates and quotes without reserving anything.
- Free tools and tools that run asynchronously cannot be batched; call them
  with `POST /v1/do`.

TypeScript: `await strale.doBatch({ capability_slug, inputs, max_total_price_cents })`.

## Synchronous paid calls: reservations and timeouts

`POST /v1/do` reserves funds before running a synchronous paid capability.
Open holds count against available funds, the account hourly cap, and the API
key's hourly and total caps. The wallet balance and purchase ledger change
only after success. `wallet_balance_cents` in the success response is the
ledger balance after capture, including concurrent wallet changes.

`timeout_seconds` is documented as an integer and defaults to 30. The effective
deadline is clamped to 5–60 seconds: positive values below 5 (including legacy
fractional values such as 0.01) are raised to 5; values above 60 are capped at 60.
Non-positive or non-finite values are rejected. The budget starts immediately before synchronous
paid execution, includes retries, and also bounds Anthropic SDK calls.
Validation, matching and wallet bookkeeping are outside that budget: it is
not a deadline for the entire HTTP response. Free-tier, asynchronous and
solution execution retain their existing behavior.

On expiry, the API returns HTTP 503 `timeout_exceeded`, with
`details.retryable: true` and `details.fix`. The hold is released without a
debit or refund. Late completion cannot charge or create a second transaction.
The failed transaction remains available; unresolved vendor cost is recorded
as unknown. Executors have no caller AbortSignal parameter, so the watchdog
does not cancel arbitrary work: LLM calls use the remaining budget and fetches
retain their own timeouts. No further retry starts after the deadline. A
blocked JavaScript event loop can delay the watchdog; elapsed time is also
checked before capture.

The same `Idempotency-Key` and fingerprint replay the stored transaction,
with HTTP 200 and `meta.idempotency_replay: true` once complete. While the first
call is `executing`, retries return HTTP 409 `request_in_progress`,
`details.retryable: true`, `details.retry_after_seconds: 2`, and `details.fix`
instructing the caller to retry with the same key. Concurrent retries cannot
both execute. Different inputs with that key return HTTP 409
`idempotency_key_reused`. Use a new key to attempt a failed or timed-out call
again; changing only `timeout_seconds` does not change the fingerprint.

A process crash leaves a durable hold. The reconciler releases open holds
past their 15-minute deadline, longer than the maximum sync budget. It handles
at most 25 reservations per one-minute tick, so a backlog needs more ticks.

The x402 gateway atomically claims the payment hash after verification and
before validation or execution. A concurrent duplicate receives the existing
HTTP 502 replay response; a completed payment replays its output. Confirmed
unsettled failures release the claim, allowing a retry with the same signed
payment while valid, up to two executor invocations per payment hash (including
transient retries). A third attempt receives the existing HTTP 502 replay
response. Rejections before execution delete the claim and consume no execution
budget. The settlement reconciler releases claims older than 10 minutes only
when they have no settlement intent and no settlement; an old owner cannot
settle after its claim is released. An ambiguous transport failure during
settlement retains the claim and durable intent for reconciliation.
