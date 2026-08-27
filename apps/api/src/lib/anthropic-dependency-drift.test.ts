import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PROVIDERS } from "./dependency-manifest.js";

describe("Anthropic dependency inventory", () => {
  it("exactly matches direct clients and Anthropic-backed extraction helpers", () => {
    const capabilitiesDir = resolve(import.meta.dirname, "../capabilities");
    const consumers = readdirSync(capabilitiesDir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .filter((name) => {
        const source = readFileSync(resolve(capabilitiesDir, name), "utf8");
        return source.includes("new Anthropic") || (
          source.includes("./lib/browserless-extract.js") &&
          (source.includes("extractCompanyFromText") || source.includes("extractCompanyName"))
        );
      })
      .map((name) => name.slice(0, -3))
      .sort();
    const provider = PROVIDERS.find((item) => item.name === "anthropic");
    const inventoried = new Set([
      ...(provider?.capabilities ?? []),
      ...(provider?.fallbackCapabilities ?? []),
    ]);

    expect(consumers.filter((slug) => !inventoried.has(slug))).toEqual([]);
    expect([...inventoried].filter((slug) => !consumers.includes(slug)).sort()).toEqual([]);
  });
});
