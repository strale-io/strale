import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import yaml from "js-yaml";

const root = new URL("../../../../", import.meta.url);
const manifests = readdirSync(new URL("manifests/", root)).filter((f) => f.endsWith(".yaml")).map((f) =>
  yaml.load(readFileSync(new URL(`manifests/${f}`, root), "utf8")) as { slug: string; description: string },
);

describe("public manifest descriptions", () => {
  it("keeps all catalogue summaries within the public length guidance and free of internal/vendor/model copy", () => {
    for (const { slug, description } of manifests) {
      expect(description.length, slug).toBeGreaterThanOrEqual(50);
      expect(description.length, slug).toBeLessThanOrEqual(160);
      expect(description, slug).not.toMatch(/Tier[- ]\d|DEC-\d|vendor aggregator|Openapi\.com|GoPlus|Shodan|Allabolag|Glassdoor|PriceRunner|CoinGecko|sec-api\.io|EINsearch|Cobalt Intelligence|GPT-\d|Claude|Gemini|Mistral|Llama/i);
    }
  });

  it("explicitly marks deactivated implementations unavailable", () => {
    const source = readFileSync(new URL("apps/api/src/capabilities/auto-register.ts", root), "utf8");
    const mapStart = source.indexOf("const DEACTIVATED");
    const mapText = source.slice(mapStart, source.indexOf("\n]);", mapStart)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const deactivated = new Set([...mapText.matchAll(/(?:\[\s*|^\s*)"([a-z0-9]+(?:-[a-z0-9]+)+)"\s*,/gm)].map((m) => m[1]));
    expect(deactivated.size).toBeGreaterThan(30);
    for (const { slug, description } of manifests) {
      if (deactivated.has(slug)) expect(description, slug).toMatch(/^Currently unavailable\./);
    }
  });
});
