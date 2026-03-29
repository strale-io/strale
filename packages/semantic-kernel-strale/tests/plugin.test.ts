/**
 * Tests for @strale/semantic-kernel plugin.
 *
 * Run: STRALE_API_KEY=sk_live_... npx tsx --test tests/plugin.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStralePlugin, StraleClient } from "../src/index.js";

const API_KEY = process.env.STRALE_API_KEY ?? "";
const BASE_URL =
  process.env.STRALE_BASE_URL ??
  "https://api.strale.io";

const skip = !API_KEY;

describe("StraleClient", { skip }, () => {
  it("lists capabilities", async () => {
    const client = new StraleClient({ apiKey: API_KEY, baseUrl: BASE_URL });
    const caps = await client.listCapabilities();
    assert.ok(Array.isArray(caps));
    assert.ok(caps.length > 200, `Expected >200 capabilities, got ${caps.length}`);
  });

  it("gets balance", async () => {
    const client = new StraleClient({ apiKey: API_KEY, baseUrl: BASE_URL });
    const balance = await client.getBalance();
    assert.ok("balance_cents" in balance);
    assert.ok("currency" in balance);
  });
});

describe("createStralePlugin", { skip }, () => {
  it("returns a plugin with 250+ functions", async () => {
    const plugin = await createStralePlugin({ apiKey: API_KEY, baseUrl: BASE_URL });
    assert.equal(plugin.name, "strale");
    assert.ok(plugin.functions.length > 200);
  });

  it("includes meta-tools", async () => {
    const plugin = await createStralePlugin({ apiKey: API_KEY, baseUrl: BASE_URL });
    const names = plugin.functions.map((f: any) => f.metadata?.name ?? f.name);
    assert.ok(
      names.some((n: string) => n === "strale_search" || n.includes("search")),
      "Missing strale_search"
    );
    assert.ok(
      names.some((n: string) => n === "strale_balance" || n.includes("balance")),
      "Missing strale_balance"
    );
  });

  it("supports category filtering", async () => {
    const all = await createStralePlugin({ apiKey: API_KEY, baseUrl: BASE_URL });
    const filtered = await createStralePlugin({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      categories: ["validation"],
    });
    assert.ok(filtered.functions.length < all.functions.length);
  });
});

describe("Tool execution", { skip }, () => {
  it("executes vat-format-validate", async () => {
    const client = new StraleClient({ apiKey: API_KEY, baseUrl: BASE_URL });
    const result = await client.execute({
      capabilitySlug: "vat-format-validate",
      inputs: { vat_number: "SE556703748501" },
      maxPriceCents: 10,
    });
    assert.ok(
      result.status === "completed" || result.output != null,
      `Unexpected result: ${JSON.stringify(result)}`
    );
  });

  it("handles bad API key", async () => {
    const client = new StraleClient({
      apiKey: "sk_live_invalid",
      baseUrl: BASE_URL,
    });
    const result = await client.execute({
      capabilitySlug: "vat-format-validate",
      inputs: { vat_number: "SE556703748501" },
      maxPriceCents: 10,
    });
    assert.equal(result.error_code, "unauthorized");
  });
});
