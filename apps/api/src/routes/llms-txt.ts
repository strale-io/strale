/**
 * LLM-friendly discovery — /llms.txt and /llms-full.txt
 *
 * Plain-text descriptions for LLMs doing retrieval.
 * /llms.txt: concise overview + quick start
 * /llms-full.txt: same + full capability category listing (dynamic, 5-min cache)
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { computePlatformFacts } from "../lib/platform-facts.js";
import { logError } from "../lib/log.js";

const llmsTxtRoute = new Hono();

// ─── Body builder (uses platform-facts for live counts) ─────────────────────
//
// Cert-audit Y-1 + Y-2: capability count and country count used to be
// hardcoded ("250+", "27 countries") and drifted from production. Now
// every count is computed at request time from PLATFORM_FACTS (cached
// 5min via the same module). The category labels also derive country
// coverage from the live catalogue rather than a hardcoded "27".

function renderLlmsTxt(facts: Awaited<ReturnType<typeof computePlatformFacts>>): string {
  const capCount = facts.capability_counts.active_visible;
  const countryCount = facts.countries.company_data_active.length;
  return `# Strale

> One API call. Verified data your agent can trust. ${capCount}+ independently tested and scored data capabilities across ${countryCount} countries.

Strale provides business data capabilities that AI agents can use at runtime via MCP, A2A, REST API, or x402 micropayments. Every capability is independently tested with the Strale Quality Score (SQS) — a dual-profile trust scoring system inspired by S&P credit ratings.

## Use Strale When Your Agent Needs To:

- Validate IBANs, VAT numbers, LEI codes, or BIC/SWIFT codes
- Look up company data across ${countryCount} countries (live catalogue)
- Check sanctions lists and adverse media
- Verify SSL certificates, DNS records, or domain availability
- Validate EU addresses and postal codes
- Convert currencies with real-time exchange rates
- Run compliance checks (KYB, AML, GDPR)
- Extract data from invoices, receipts, contracts, or web pages
- Assess wallet risk, token contract safety, or DeFi protocol health
- Resolve ENS names, check VASP licensing, detect phishing dApps

## Web3 and DeFi Agent Capabilities

17 Web3-specific capabilities and 9 solutions for on-chain agents. All payable via x402 (USDC on Base) or standard API key.

Wallet security: wallet-risk-score, approval-security-check, wallet-age-check, wallet-balance-lookup, wallet-transactions-lookup.
Token and contract safety: token-security-check, contract-verify-check, phishing-site-check.
DeFi intelligence: protocol-tvl-lookup, protocol-fees-lookup, stablecoin-flow-check, fear-greed-index, gas-price-check.
Identity and compliance: ens-resolve, ens-reverse-lookup, vasp-verify, vasp-non-compliant-check.

Pre-built solutions (single-call multi-step workflows):
- web3-counterparty-dd: wallet risk + age + ENS + sanctions + PEP + adverse media ($0.12)
- web3-token-safety: contract security + verification + deployer risk + domain ($0.05)
- web3-pre-tx-gate: go/no-go middleware for DeFi agents ($0.12)
- web3-dapp-trust: phishing detection + domain intelligence ($0.05)
- web3-protocol-health: TVL + fees + stablecoins + domain trust ($0.05)
- web3-pre-trade: price + security + TVL + sentiment + gas ($0.08)
- web3-wallet-snapshot: balance + transactions + age + ENS + price ($0.05)
- web3-vasp-check: EU MiCA VASP verification + sanctions ($0.08)
- web3-wallet-identity: ENS reverse + risk + age + balance ($0.08)

## Quick Start

### MCP (recommended for Claude, Cursor, Windsurf)
Endpoint: https://api.strale.io/mcp
Transport: Streamable HTTP
Auth: Bearer token (API key from https://strale.dev)
Free tool: strale_search works without auth

### A2A (Agent-to-Agent)
Agent Card: https://api.strale.io/.well-known/agent-card.json
Task endpoint: https://api.strale.io/a2a

### REST API
POST https://api.strale.io/v1/do
Body: { "capability": "iban-validate", "input": { "iban": "DE89370400440532013000" } }

### x402 (pay-per-request, no API key needed)
GET https://api.strale.io/x402/iban-validate?iban=DE89370400440532013000
Pay with USDC on Base

## Free Tier

The iban-validate capability is free. Use it to test the integration without an API key via MCP (strale_search to discover, then call iban-validate).

## Trust & Quality

Every capability has a Strale Quality Score (SQS) with:
- Quality Profile: correctness, schema compliance, error handling, edge case coverage
- Reliability Profile: availability, success rate, upstream health, latency
- Combined via a 5x5 matrix producing grades A through E

## Links

- Homepage: https://strale.dev
- Docs: https://strale.dev/docs
- MCP Server Card: https://api.strale.io/.well-known/mcp.json
- AI Catalog: https://api.strale.io/.well-known/ai-catalog.json
- GitHub: https://github.com/petterlindstrom79/strale
- npm: https://www.npmjs.com/package/strale-mcp
- Contact: hello@strale.io
`;
}

// ─── Category display names ─────────────────────────────────────────────────
//
// Country count for the company-data label is filled in at render time
// from the live catalogue. Hardcoding "27" was the cert-audit drift.

function categoryLabels(countryCount: number): Record<string, string> {
  return {
  "company-data": `Company Data (${countryCount} countries)`,
  compliance: "Compliance & KYB",
  "developer-tools": "Developer Tools",
  finance: "Finance & Banking",
  "data-processing": "Data Processing & Extraction",
  "web-scraping": "Web Scraping & Intelligence",
  monitoring: "Monitoring & Security",
  "agent-tooling": "Agent Tooling",
  validation: "Validation",
  "data-extraction": "Data Extraction",
  web3: "Web3 & DeFi",
  };
}

// ─── Cache for full version ─────────────────────────────────────────────────

let cachedShort: { text: string; at: number } | null = null;
let cachedFull: { text: string; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function buildShortText(): Promise<string> {
  const now = Date.now();
  if (cachedShort && now - cachedShort.at < CACHE_TTL_MS) return cachedShort.text;
  const facts = await computePlatformFacts();
  const text = renderLlmsTxt(facts);
  cachedShort = { text, at: now };
  return text;
}

async function buildFullText(): Promise<string> {
  const now = Date.now();
  if (cachedFull && now - cachedFull.at < CACHE_TTL_MS) return cachedFull.text;

  const facts = await computePlatformFacts();
  const labels = categoryLabels(facts.countries.company_data_active.length);

  const db = getDb();
  const rows = await db
    .select({ slug: capabilities.slug, category: capabilities.category })
    .from(capabilities)
    .where(eq(capabilities.isActive, true));

  // Group by category
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.category) ?? [];
    list.push(row.slug);
    grouped.set(row.category, list);
  }

  // Sort categories alphabetically, slugs alphabetically within each
  const sortedCategories = [...grouped.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  let section = "\n## Capability Categories\n";
  for (const [category, slugs] of sortedCategories) {
    const label = labels[category] ?? category;
    slugs.sort();
    section += `\n### ${label}\n${slugs.join(", ")}\n`;
  }

  const text = renderLlmsTxt(facts) + section;
  cachedFull = { text, at: now };
  return text;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Stale-tolerant fallback: if the DB is briefly unavailable, prefer the
// last good cache to a 503. llms.txt being down is more damaging than
// llms.txt being 5min stale.
async function withFallback<T>(fn: () => Promise<T>, fallback: T | null): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logError("llms-txt-render-failed", err);
    return fallback;
  }
}

llmsTxtRoute.get("/llms.txt", async (c) => {
  const text = await withFallback(buildShortText, cachedShort?.text ?? null);
  if (text == null) return c.text("Service temporarily unavailable", 503);
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(text);
});

llmsTxtRoute.get("/llms-full.txt", async (c) => {
  const text = await withFallback(buildFullText, cachedFull?.text ?? null);
  if (text == null) return c.text("Service temporarily unavailable", 503);
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(text);
});

export { llmsTxtRoute };
