# strale-cli

A command-line client for [Strale](https://strale.dev?src=npm-readme&utm_source=npm-readme&utm_medium=listing&utm_campaign=distribution-d0-d1), built for AI agents and scripts first:

- every result is one JSON document on stdout;
- every failure is one JSON document on stderr, carrying the API's stable `error_code` and the text of its `fix`;
- `strale run` refuses to send a call without `--max-price-cents`;
- it never prompts, never reads stdin, and never prints colour or assumes a terminal;
- it reads your API key from `STRALE_API_KEY` and nowhere else.

It needs Node.js 18 or later and has no runtime dependencies.

## Install

```sh
npm install -g strale-cli
strale help
```

Or run it without installing:

```sh
npx -y strale-cli help
```

## Examples

Find a tool:

```sh
strale search "validate an iban" --limit 3
```

List tools, optionally by category (`--full` adds input and output schemas):

```sh
strale tools --category validation
```

Run a free-tier tool. No API key is needed; `0` means "pay nothing":

```sh
strale run iban-validate --input '{"iban":"DE89370400440532013000"}' --max-price-cents 0
```

Run a paid tool from your wallet, paying at most 5 euro cents:

```sh
export STRALE_API_KEY=sk_live_...
strale run vat-validate --input '{"vat_number":"SE556703748501"}' --max-price-cents 5
```

Check the price without running anything:

```sh
strale run vat-validate --input '{"vat_number":"SE556703748501"}' --max-price-cents 5 --dry-run
```

Check your wallet balance:

```sh
strale balance
```

Read a field with `jq`:

```sh
strale run iban-validate --input '{"iban":"DE89370400440532013000"}' --max-price-cents 0 | jq '.result.output.valid'
```

## Commands

| Command | What it does | Needs `STRALE_API_KEY` |
|---|---|---|
| `strale search <query> [--limit 1-10]` | Searches tools and solutions by keyword (`GET /v1/suggest/typeahead`). | No |
| `strale tools [--category <name>] [--full]` | Lists tools (`GET /v1/capabilities`). Compact by default. | No |
| `strale run <slug> --max-price-cents <0-2000> [--input '<json>'] [--timeout 5-60] [--wait 0-600] [--idempotency-key <key>] [--dry-run]` | Runs one tool (`POST /v1/do`) and prints the API response unchanged. | Yes, except for free-tier tools |
| `strale balance` | Prints your wallet balance in cents (`GET /v1/wallet/balance`). | Yes |
| `strale help`, `strale <command> --help` | Prints usage as JSON. | No |
| `strale version` | Prints the CLI version as JSON. | No |

`--input` must be a JSON object; it defaults to `{}`. `--max-price-cents` is the most you will pay for the call, in euro cents; the API refuses the call if the tool costs more. Options take either `--name value` or `--name=value`.

If a tool runs asynchronously, `strale run` polls the transaction every 2 seconds for up to `--wait` seconds (default 120) and prints the finished transaction. If it is still running when the wait ends, the error names the transaction id so you can fetch it later.

## Errors

On failure, stderr gets one line of JSON and stdout gets nothing:

```json
{"error":{"error_code":"invalid_request","message":"'strale run' refuses to run without a price cap.","fix":"Pass '--max-price-cents <n>': the most you will pay for this call, in euro cents (0 to 2000). Use 0 for free-tier tools.","retryable":false,"source":"cli"}}
```

| Field | Meaning |
|---|---|
| `error_code` | The API's stable error code (for example `unauthorized`, `insufficient_balance`, `budget_exceeded`, `rate_limited`). The CLI's own errors reuse these codes; it adds `network_error`, and `payment_required` when a paid tool is called without a key. |
| `message` | What went wrong. |
| `fix` | What to change, when the API or the CLI knows. |
| `retryable`, `next_step` | Passed through when the API sends them. |
| `http_status` | The HTTP status, when the API answered. |
| `source` | `api` if the API returned the error, `cli` if the CLI stopped before or after the request. |
| `details` | Any other details the API sent (for example `actual_price_cents`, or the x402 `accepts` list). |

The CLI does not sign x402 payments. Calling a paid tool without `STRALE_API_KEY` returns `payment_required` with the payment options in `details.accepts`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | the API returned an error not listed below, or the capability failed |
| 2 | usage error; nothing was sent |
| 3 | missing or rejected API key |
| 4 | payment: balance, price cap or spend cap |
| 5 | rate limited; retry later |
| 6 | network error or timeout |

## Environment

| Variable | Use |
|---|---|
| `STRALE_API_KEY` | Your API key (`sk_live_...`). Get one at [strale.dev/signup](https://strale.dev/signup). The CLI reads no other credential source and never prints the key. |

Requests go to `https://api.strale.io` and identify themselves with `X-Strale-Client: strale-cli/<version>` and `src=cli`.

## License

MIT
