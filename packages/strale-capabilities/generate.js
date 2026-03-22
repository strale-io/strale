#!/usr/bin/env node

/**
 * Fetches the live Strale capability catalog and writes capabilities.json.
 *
 * Usage: node generate.js
 */

const fs = require("fs");
const path = require("path");

const API_URL = "https://api.strale.io/v1/capabilities";

async function main() {
  console.log(`Fetching capabilities from ${API_URL}...`);
  const resp = await fetch(API_URL);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }

  const data = await resp.json();
  const capabilities = data.capabilities || [];

  const categories = [
    ...new Set(capabilities.map((c) => c.category).filter(Boolean)),
  ].sort();

  const catalog = {
    generated_at: new Date().toISOString(),
    total_count: capabilities.length,
    categories,
    capabilities: capabilities.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      category: c.category,
      price_cents: c.price_cents,
      input_schema: c.input_schema || null,
    })),
  };

  const outPath = path.join(__dirname, "capabilities.json");
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n");
  console.log(
    `Wrote ${capabilities.length} capabilities (${categories.length} categories) to capabilities.json`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
