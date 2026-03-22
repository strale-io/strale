# strale-capabilities

Local catalog of 250+ [Strale](https://strale.dev) capabilities — IBAN validation, VAT checks, company data across 27 countries, sanctions screening, SSL certificate checks, EU compliance automation, and more.

Use this package to explore the Strale capability catalog offline, build tool selectors, or integrate capability metadata into your AI agent setup.

## Installation

```bash
npm install strale-capabilities
```

## Usage

```js
const strale = require("strale-capabilities");

// Total count
console.log(strale.totalCount); // 251

// Find by slug
const iban = strale.find("iban-validate");
console.log(iban.name);        // "IBAN Validate"
console.log(iban.price_cents); // 0 (free tier)

// Filter by category
const compliance = strale.byCategory("compliance");
console.log(`${compliance.length} compliance capabilities`);

// Keyword search
const vatTools = strale.search("VAT");
vatTools.forEach((c) => console.log(`  ${c.slug} — ${c.description}`));

// All categories
console.log(strale.categories);
```

## API

| Export | Type | Description |
|--------|------|-------------|
| `capabilities` | `Capability[]` | Full array of all capabilities |
| `categories` | `string[]` | All category slugs |
| `totalCount` | `number` | Total capability count |
| `generatedAt` | `string` | ISO timestamp of catalog snapshot |
| `find(slug)` | `Capability \| null` | Find capability by slug |
| `byCategory(category)` | `Capability[]` | Filter by category |
| `search(query)` | `Capability[]` | Keyword search in name/description/slug |

### Capability Shape

```ts
interface Capability {
  slug: string;          // e.g. "iban-validate"
  name: string;          // e.g. "IBAN Validate"
  description: string;   // What it does
  category: string;      // e.g. "validation"
  price_cents: number;   // Price in EUR cents (0 = free)
  input_schema: object;  // JSON Schema for inputs
}
```

## Categories

| Category | Examples |
|----------|----------|
| **compliance** | sanctions-check, pep-check, adverse-media-check, vat-validate |
| **validation** | iban-validate, vat-format-validate, lei-lookup, swift-validate |
| **financial** | exchange-rate, invoice-validate, invoice-extract |
| **web-intelligence** | ssl-check, dns-lookup, domain-reputation, seo-audit |
| **web-scraping** | cookie-scan, privacy-policy-analyze, trustpilot-score |
| **data-extraction** | pdf-extract, web-extract, url-to-markdown |
| **developer-tools** | cve-lookup, npm-package-info, github-repo-compare |
| **security** | header-security-check, ssl-certificate-chain, port-check |
| **monitoring** | uptime-check, page-speed-test, redirect-trace |

Full list at [strale.dev/capabilities](https://strale.dev/capabilities).

## Using Capabilities

This package is a **catalog** — it tells you what's available. To actually _execute_ capabilities, use:

- **[strale-mcp](https://www.npmjs.com/package/strale-mcp)** — MCP server for Claude, Cursor, Windsurf
- **[straleio](https://pypi.org/project/straleio/)** — Python SDK
- **REST API** — `POST https://api.strale.io/v1/do`
- **MCP endpoint** — `https://api.strale.io/mcp` (Streamable HTTP)

## Free Tier

5 capabilities work without an API key: `email-validate`, `dns-lookup`, `json-repair`, `url-to-markdown`, `iban-validate`.

## Trust & Quality

Every capability has a Strale Quality Score (SQS) — a dual-profile trust rating combining code quality and operational reliability. Scores at [strale.dev/trust](https://strale.dev/trust).

## Regenerating the Catalog

```bash
npm run generate
```

Fetches the latest capabilities from the Strale API and writes `capabilities.json`.

## Links

- [Homepage](https://strale.dev)
- [Documentation](https://strale.dev/docs)
- [Capabilities](https://strale.dev/capabilities)
- [GitHub](https://github.com/petterlindstrom79/strale)
- [MCP Server Card](https://api.strale.io/.well-known/mcp.json)
