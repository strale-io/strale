/**
 * LLM-friendly discovery — /llms.txt and /llms-full.txt
 *
 * Plain-text descriptions for LLMs doing retrieval.
 * /llms.txt: concise overview + quick start
 * /llms-full.txt: same + full capability category listing (dynamic, 5-min cache)
 */

import { Hono } from "hono";
import { recordDiscoveryHit } from "../lib/attribution.js";
import { and, eq } from "drizzle-orm";
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
  const countryCount = facts.countries.company_data_active_iso.length;
  return `# Strale

> Give your agent a new tool without opening another provider account.

Strale is a library of ${capCount} tools for AI agents, paid per call with no subscription or contract. Company-data tools cover ${countryCount} countries. Add tools through the connection you already have, using MCP, A2A or the REST API. On eligible tools, an x402 wallet pays per request without signup.

## Use Strale When Your Agent Needs To:

- Search and read the web
- Extract text and fields from images, invoices, receipts and PDFs
- Check email addresses, phone numbers, IBAN format and EU VAT numbers
- Handle DNS, SSL, domain checks, translation, wallet and ENS lookups
- Look up company information; fields vary by source
- Screen sanctions and politically exposed person lists, adverse media, and ownership where it is published

## Quick Start

### MCP (recommended for Claude, Cursor, Windsurf)
Endpoint: https://api.strale.io/mcp?src=llms-txt
Transport: Streamable HTTP
Auth: Bearer token (API key from https://strale.dev?src=llms-txt&utm_source=llms-txt&utm_medium=listing&utm_campaign=distribution-d0-d1)
Free tool: strale_search works without auth

### A2A (Agent-to-Agent)
Agent Card: https://api.strale.io/.well-known/agent-card.json?src=llms-txt
Task endpoint: https://api.strale.io/a2a?src=llms-txt

### REST API
POST https://api.strale.io/v1/do?src=llms-txt
Body: { "capability_slug": "iban-validate", "inputs": { "iban": "DE89370400440532013000" }, "max_price_cents": 10 }

### x402 (pay-per-request, no API key needed)
GET https://api.strale.io/x402/iban-validate?iban=DE89370400440532013000&src=llms-txt
Pay with USDC on Base

## Free Tier

${facts.capability_counts.free_tier_slugs.length} free tools: ${facts.capability_counts.free_tier_slugs.join(", ") || "none currently listed"}.
Use POST /v1/do without an API key for eligible free tools, with ${facts.static.free_tier_monthly_limit} calls per calendar month (UTC) per IP and an hourly anti-abuse guard.

## Discovery

Browse inputs, output fields, prices and limitations at /v1/capabilities. Search with POST /v1/suggest using a query field. Check /x402/catalog for eligible wallet-paid tools and current quotes.

## Links

- Homepage: https://strale.dev?src=llms-txt&utm_source=llms-txt&utm_medium=listing&utm_campaign=distribution-d0-d1
- Docs: https://strale.dev/docs?src=llms-txt&utm_source=llms-txt&utm_medium=listing&utm_campaign=distribution-d0-d1
- Agent skill: https://api.strale.io/SKILL.md
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
  const labels = categoryLabels(facts.countries.company_data_active_iso.length);

  const db = getDb();
  const rows = await db
    .select({ slug: capabilities.slug, category: capabilities.category })
    .from(capabilities)
    .where(
      and(
        eq(capabilities.isActive, true),
        // strale.dev surfacing per DEC-20260503-A.
        eq(capabilities.marketplaceEligible, true),
        // A withdrawn capability may not be advertised. This file is public,
        // unauthenticated and written for machines to read; on 2026-09-03 it
        // listed the same ten invisible capabilities as the agent card,
        // including one suspended and two quarantined by the quality floor.
        eq(capabilities.visible, true),
      ),
    );

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
  recordDiscoveryHit("/llms.txt", c.req, { src: c.req.query("src"), ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") });
  const text = await withFallback(buildShortText, cachedShort?.text ?? null);
  if (text == null) return c.text("Service temporarily unavailable", 503);
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(text);
});

llmsTxtRoute.get("/llms-full.txt", async (c) => {
  recordDiscoveryHit("/llms-full.txt", c.req, { src: c.req.query("src"), ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") });
  const text = await withFallback(buildFullText, cachedFull?.text ?? null);
  if (text == null) return c.text("Service temporarily unavailable", 503);
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(text);
});

export { llmsTxtRoute };
