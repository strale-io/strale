# straleio

Python SDK for the [Strale](https://strale.dev) API — let AI agents buy and execute capabilities at runtime.

## Install

```bash
pip install straleio
```

## Quick start

```python
from straleio import Strale

strale = Strale(api_key="sk_live_...")

result = strale.do(task="validate VAT number SE556703748501")

print(result.output)
# {"valid": True, "country_code": "SE", "company_name": "Spotify AB"}
```

## Execute by slug

```python
result = strale.do(
    capability_slug="vat-validate",
    inputs={"vat_number": "SE556703748501"},
    max_price_cents=10,
)
```

## Solutions (bundled workflows)

```python
# Quick company verification (KYB Essentials — 20 countries)
result = strale.do(
    solution="kyb-essentials-se",
    input={"org_number": "5591674668"},
)

# Full compliance check with risk narrative (KYB Complete)
full_check = strale.do(
    solution="kyb-complete-se",
    input={"org_number": "5591674668", "domain": "example.com"},
)
# full_check["narrative"] — plain-language risk assessment
# full_check["checks"] — structured results

# Invoice fraud detection (Invoice Verify)
invoice_check = strale.do(
    solution="invoice-verify-se",
    input={
        "org_number": "5591674668",
        "vat_number": "SE559167466801",
        "iban": "SE3550000000058398257466",
    },
)
```

## Dry run (preview cost without executing)

```python
preview = strale.dry_run(task="look up Swedish company Klarna")

print(preview.matched_capability)  # "swedish-company-data"
print(preview.price_cents)         # 80
```

## Async support

```python
import asyncio
from straleio import Strale

async def main():
    strale = Strale(api_key="sk_live_...")
    result = await strale.do_async(task="validate VAT number SE556703748501")
    print(result.output)

asyncio.run(main())
```

## Check balance

```python
balance = strale.get_balance()
print(balance.balance_eur)  # "1.84"
```

## List capabilities

```python
capabilities = strale.list_capabilities()
# 256 capabilities with slug, name, price, category
```

## Free-tier (no API key)

5 capabilities work without authentication:

```python
strale = Strale(api_key="")

result = strale.do(
    capability_slug="email-validate",
    inputs={"email": "hello@example.com"},
)
```

## Options

```python
strale = Strale(
    api_key="sk_live_...",
    base_url="https://api.strale.io",  # default
    timeout=60.0,                       # seconds, default 60
    default_max_price_cents=200,        # cap per call, default €2.00
)
```

## Error handling

```python
from straleio import Strale, StraleError

try:
    result = strale.do(task="...")
except StraleError as e:
    print(e.code)     # "insufficient_balance" | "no_matching_capability" | ...
    print(e.message)
```

---

## Try for Free

5 capabilities work without an API key or signup:

- `email-validate` — verify email deliverability
- `dns-lookup` — DNS record lookup
- `json-repair` — fix malformed JSON
- `url-to-markdown` — convert any URL to markdown
- `iban-validate` — validate international bank account numbers

For all 256 capabilities, [sign up](https://strale.dev/signup) for €2 in free trial credits.

## Resources

- 📖 [Documentation](https://strale.dev/docs)
- 💡 [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration
- 💰 [Pricing](https://strale.dev/pricing)
- 🔍 [Quality methodology](https://strale.dev/methodology)
- 🔒 [Security](https://strale.dev/security)

## License

MIT — see [LICENSE](../../LICENSE)
