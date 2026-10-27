# Strale directory description

**Strale — tools your agent can call and pay for per call.**
One connection gives an agent hundreds of tools. Look up company records
from business registers and register-backed sources in countries across
Europe, the Americas and Asia-Pacific (live list:
https://api.strale.io/v1/platform/facts); screen companies and people
against sanctions and PEP lists and adverse media; check email addresses,
phone numbers, IBAN format and EU VAT numbers; turn any web page into
clean text; pull fields out of invoices, receipts and PDFs; run DNS, SSL
and tech-stack checks.

Pay per call, no subscription. Use one API key and a prepaid balance, or —
on eligible tools — pay each request in USDC over x402 with no signup.
A set of free tools works without a key. Each tool page lists inputs,
output fields, price, limitations and source.

Connect: remote MCP at `https://api.strale.io/mcp?src=x402scan`, `npx strale-mcp`,
REST `POST /v1/do`, TypeScript and Python SDKs.
