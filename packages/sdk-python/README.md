# straleio

Python client for the [Strale](https://strale.dev) API: call any Strale tool from your code with one API key, paid per call from your Strale balance.

## Install

```bash
pip install straleio
```

## Quick start

```python
import os
from straleio import Strale, DoRequest

strale = Strale(api_key=os.environ["STRALE_API_KEY"])

result = strale.do(DoRequest(
    capability_slug="vat-validate",
    inputs={"vat_number": "SE556703748501"},
    max_price_cents=10,
))

print(result.output)      # the tool's structured fields
print(result.provenance)  # Provenance(source=..., fetched_at=...)
```

`do()` takes a `DoRequest`. `max_price_cents` is required: it caps what one call may cost, and the call is refused if the tool costs more. Each tool's inputs, output fields and price are on its page at [strale.dev/tools](https://strale.dev/tools) and in `strale.capability(slug)`.

## Describe the task instead of naming the tool

```python
result = strale.do(DoRequest(task="validate VAT number SE556703748501", max_price_cents=10))
print(result.capability_used)  # the tool Strale matched
```

## Dry run: see what would run and what it costs

```python
preview = strale.do(DoRequest(
    task="look up Swedish company 556703-7485",
    max_price_cents=50,
    dry_run=True,
))

print(preview.would_execute)      # the tool that would run
print(preview.price_cents)        # its price
print(preview.wallet_sufficient)  # whether your balance covers it
```

## Balance, tools and past calls

```python
balance = strale.balance()            # BalanceResponse(balance_cents=..., currency=...)
tools = strale.capabilities()         # every tool: slug, name, description, category, price_cents, schemas
tool = strale.capability("vat-validate")
recent = strale.transactions()
one = strale.transaction(recent[0].id)
```

The client holds an HTTP connection pool. Use it as a context manager, or call `close()`:

```python
with Strale(api_key=os.environ["STRALE_API_KEY"]) as strale:
    ...
```

## Bundled checks

Bundled checks (for example `kyb-essentials-se`) are not in this client yet. Call them over REST:

```python
import httpx

res = httpx.post(
    "https://api.strale.io/v1/solutions/kyb-essentials-se/execute",
    headers={"Authorization": f"Bearer {os.environ['STRALE_API_KEY']}"},
    json={"inputs": {"org_number": "5567037485"}},
    timeout=120,
)
```

Each bundle's inputs and price are on its page at [strale.dev/tools#bundled](https://strale.dev/tools#bundled).

## Free tools

This client always sends an API key. Free tools cost nothing with a key. They also work without any key at a small daily limit, if you call the REST API directly:

```bash
curl -X POST https://api.strale.io/v1/do \
  -H 'Content-Type: application/json' \
  -d '{"capability_slug": "email-validate", "inputs": {"email": "hello@example.com"}}'
```

The current list of free tools is `free_tier_slugs` in [`/v1/platform/facts`](https://api.strale.io/v1/platform/facts).

## Options

```python
strale = Strale(
    api_key="sk_live_...",              # required
    base_url="https://api.strale.io",   # default
    timeout=60.0,                       # seconds per HTTP request, default 60
    default_max_price_cents=100,        # used when a DoRequest leaves max_price_cents falsy; no default
    poll_interval=2.0,                  # seconds between polls for long-running calls
    max_poll_wait=120.0,                # seconds to keep polling before giving up
)
```

## Error handling

```python
from straleio import StraleError, InsufficientBalanceError

try:
    strale.do(DoRequest(capability_slug="vat-validate", inputs={"vat_number": "SE556703748501"}, max_price_cents=10))
except InsufficientBalanceError:
    ...  # top up at https://strale.dev/topup
except StraleError as e:
    print(e.error_code, e.status_code, e)
```

`error_code` is one of `insufficient_balance`, `no_matching_capability`, `capability_unavailable`, `execution_failed`, `timeout_exceeded`, `invalid_request`, `rate_limited`, `unauthorized` or `not_found`.

## Resources

- [Documentation](https://strale.dev/docs)
- [Pricing](https://strale.dev/pricing)
- [Security](https://strale.dev/security)

## License

MIT — see [LICENSE](../../LICENSE)
