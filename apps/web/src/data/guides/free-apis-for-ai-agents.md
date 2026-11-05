---
slug: free-apis-for-ai-agents
title: "Free tools for AI agents: no signup, no API key"
description: "The Strale tools an agent can call without an account, how the monthly allowance works, and which tools are not free."
group: agents
framework: "REST API"
language: "cURL"
tools: [iban-validate, email-validate, dns-lookup, url-to-markdown]
---
A set of Strale tools can be called with no signup and no API key, within {{fact:free_limit}} calls a month per IP address across all of them. They are the same production endpoints that authenticated callers use, not a sandbox.

## The solution

```bash cURL: no Authorization header
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "iban-validate",
    "inputs": { "iban": "DE89370400440532013000" }
  }'
# No API key and no wallet.
```

## The tools that are free today

{{fact:free_tools}}.

The list is read from the catalogue each time the site is built. It changes as tools are added, so treat the [Tools](/tools?free=1) page, or `GET /v1/platform/facts`, as the source of truth.

## Why these tools are free

They are algorithmic or protocol-level checks, such as format validation, DNS lookups, JSON repair and address-format checks, with little or no metered upstream cost for each call. Tools that call a paid source, such as a register, a screening vendor or a language model, are not on the list.

## The allowance, precisely

Anonymous callers get {{fact:free_limit}} calls per calendar month (UTC) per IP address, counted in a database, so retries and different user agents do not reset it. The allowance is shared by every free tool, not set per tool, and an hourly guard stops bursts. Each anonymous free-tool response carries `X-RateLimit-*` headers and a `usage` block with `calls_this_month`, `monthly_limit` and `resets_at`.

With an API key, free tools get the normal limits and cost nothing. Paid tools need a funded wallet, or an x402 payment with no signup on the tools that accept it: see [x402](/docs/x402).

## Limits

- **The allowance is per IP address, not per user.** An office network, shared Wi-Fi or a CI runner behind one address shares one allowance.
- **The list can change.** Tools move on and off the free list as the catalogue changes.

## Questions

### Do free calls get a record?

Yes. Every call, with a key or without, returns a `transaction_id` and the source of the data. With a key, free calls also appear in your list of calls.

### Can I go past the allowance without paying?

Signing up is free, and a key moves you from the per-IP monthly allowance to the normal limits on the same free tools. Free tools stay free.

### Is this a sandbox with fake data?

No. These are the production endpoints with real results. The only differences are the allowance and that no key is needed.
