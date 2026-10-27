---
name: strale
description: Use Strale to find and call pay-per-call tools for company records, screening, validation, web page reading and document extraction.
---

# Strale tools for agents

Find tools over remote MCP at https://api.strale.io/mcp?src=skill
or run `npx strale-mcp`. Use `strale_search` to find a tool or bundle,
inspect its inputs, price, limitations and source, then use `strale_execute`.
Execution can spend prepaid wallet funds. Set a maximum price and obtain the
user's authorization to spend. Search and public information need no API key.

For REST, send `POST https://api.strale.io/v1/do?src=skill` with
`capability_slug`, `inputs` and `max_price_cents`. Paid wallet calls require
`Authorization: Bearer <api_key>`. Keep the key in environment configuration.

Eligible tools also accept x402 payments without a Strale signup. Check
https://api.strale.io/x402/catalog?src=skill for eligibility and quotes.
A subset of tools works without credentials, subject to daily limits.
Read https://api.strale.io/v1/platform/facts for the live
catalogue size, coverage and free-tier list.

Company information, sanctions and PEP screening, VAT checks, email and phone
checks, IBAN format validation, web page reading and document extraction are
examples of jobs. Follow the selected tool's schema; do not invent slugs or
treat format validation as proof of bank-account ownership.

Testing varies by tool. `strale_trust_profile` reads current test and
availability signals; `strale_methodology` explains the testing modes.
Source context and audit access vary by payment rail and execution mode.
Treat screening matches as signals for review, not findings of wrongdoing.
