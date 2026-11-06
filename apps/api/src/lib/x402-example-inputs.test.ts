/**
 * The input examples Strale publishes for x402 must be real requests.
 *
 * Origin: probe402 (an x402 API tester) reported in October 2026 that its paid
 * calls to aml-risk-score, country-tax-rates and ens-resolve were refused.
 * Agents build a paid call from the example a 402 challenge or a 400 body
 * shows; where we published none they invented one, and where we generated one
 * it was `example_<field>`. The executors refuse both: ENS rejects
 * "example_name" ('underscore allowed only at start'), the tax table has no
 * "example_country_code", the AML scorer needs a 2-letter country.
 *
 * What is pinned here:
 *  1. each of the three tools publishes a real example, and its executor accepts it;
 *  2. the old placeholders are refused by those executors (so the test fails
 *     against the un-fixed publication, not only against a typo);
 *  3. no manifest anywhere publishes a placeholder-looking input example;
 *  4. a 400 body never carries an invented `example_*` value;
 *  5. the reviewed-example exception stays as narrow as it is documented.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import yaml from "js-yaml";
import { namehash } from "viem";
import { normalize } from "viem/ens";
import { Hono } from "hono";
import { getExecutor } from "../capabilities/index.js";
import "../capabilities/aml-risk-score.js";
import "../capabilities/country-tax-rates.js";
import {
  getDiscoveryMetadata,
  metadataFromManifest,
  publishedInputExample,
  REVIEWED_PUBLIC_INPUT_EXAMPLES,
  type DiscoveryManifest,
} from "./x402-discovery-metadata.js";
import { schemaBadRequest } from "../routes/x402-gateway-v2.js";

const manifestDirectory = new URL("../../../../manifests/", import.meta.url);
const manifests = readdirSync(manifestDirectory).filter(file => file.endsWith(".yaml"))
  .map(file => yaml.load(readFileSync(new URL(file, manifestDirectory), "utf8")) as DiscoveryManifest);
const manifest = (slug: string) => manifests.find(item => item.slug === slug)!;

const EXPECTED = {
  "aml-risk-score": { entity_name: "Nordvik Handel AB (fictional)", entity_type: "company", country_code: "SE" },
  "country-tax-rates": { country_code: "US" },
  "ens-resolve": { name: "vitalik.eth" },
} as const;

describe("the three tools probe402 reported publish a real example", () => {
  it.each(Object.entries(EXPECTED))("%s publishes its example in the 402 challenge metadata", (slug, example) => {
    expect(getDiscoveryMetadata("capability", slug)?.inputExample).toEqual(example);
    expect(publishedInputExample({ kind: "capability", slug }, manifest(slug).input_schema)).toEqual(example);
  });

  it("aml-risk-score: the executor accepts the example and scores it", async () => {
    const { output } = await getExecutor("aml-risk-score")!(EXPECTED["aml-risk-score"] as Record<string, unknown>) as { output: Record<string, unknown> };
    expect(output).toMatchObject({ entity_name: "Nordvik Handel AB (fictional)", entity_type: "company", country_code: "SE", risk_level: "low" });
    expect(typeof output.risk_score).toBe("number");
  });

  it("country-tax-rates: the executor accepts the example", async () => {
    const { output } = await getExecutor("country-tax-rates")!(EXPECTED["country-tax-rates"] as Record<string, unknown>) as { output: Record<string, unknown> };
    expect(output).toMatchObject({ country_code: "US", corporate_tax_rate: 21 });
  });

  it("ens-resolve: the example is a valid, normalised ENS name (the executor's own pre-network step)", () => {
    // The executor lowercases, appends .eth if there is no dot, then normalize()s and hashes.
    // Everything after that is a network read, which an offline test must not make.
    const name = EXPECTED["ens-resolve"].name;
    expect(normalize(name)).toBe(name);
    expect(namehash(normalize(name))).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("the placeholders agents used to receive are refused by the same executors", async () => {
    await expect(getExecutor("country-tax-rates")!({ country_code: "example_country_code" })).rejects.toThrow(/not available/);
    await expect(getExecutor("aml-risk-score")!({ entity_name: "example_entity_name", country_code: "example_country_code" })).rejects.toThrow(/country_code/);
    expect(() => normalize("example_name.eth")).toThrow(/underscore/);
  });
});

describe("no published input example is a placeholder", () => {
  const PLACEHOLDER = [
    /^\s*(?:string|example|test|foo|bar|baz|xxx+|value|placeholder|sample|todo|changeme|n\/a|null|undefined)\s*$/i,
    /^example_\w+$/i,
    /^<[^>]*>$/,
    /^\{\{.*\}\}$/,
    /^0x0{8,}/i,
    /^test (?:company|user|name)$/i,
  ];
  const strings = (value: unknown): string[] =>
    typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

  it("covers every manifest (a published example exists for a meaningful share)", () => {
    expect(manifests.filter(item => metadataFromManifest(item).inputExample !== undefined).length).toBeGreaterThan(50);
  });

  it.each(manifests.map(item => [item.slug, item] as const))("%s", (_slug, item) => {
    const example = metadataFromManifest(item).inputExample;
    expect(strings(example).filter(text => PLACEHOLDER.some(pattern => pattern.test(text)))).toEqual([]);
  });

  it("the detector itself recognises the shapes it is meant to catch", () => {
    for (const bad of ["string", "Example", "example_name", "<name>", "{{name}}", "0x0000000000000000000000000000000000000000", "Test Company", "xxx"]) {
      expect(PLACEHOLDER.some(pattern => pattern.test(bad)), bad).toBe(true);
    }
    for (const good of ["vitalik.eth", "Nordvik Handel AB (fictional)", "SE", "US", "example.com", "https://example.com/a", "testing"]) {
      expect(PLACEHOLDER.some(pattern => pattern.test(good)), good).toBe(false);
    }
  });
});

describe("a 400 body never invents an example", () => {
  const app = new Hono();
  const schema = { type: "object", required: ["country_code"], properties: { country_code: { type: "string" }, mode: { type: "string", enum: ["fast", "slow"] } } };
  app.get("/published", c => schemaBadRequest(c, "Invalid input.", manifest("country-tax-rates").input_schema!, "invalid_request", undefined, { kind: "capability", slug: "country-tax-rates" }));
  app.get("/reviewed", c => schemaBadRequest(c, "Invalid input.", manifest("ens-resolve").input_schema!, "execution_failed", undefined, { kind: "capability", slug: "ens-resolve" }));
  app.get("/unpublished", c => schemaBadRequest(c, "Invalid input.", schema, "invalid_request", undefined, { kind: "capability", slug: "no-such-slug" }));
  app.get("/no-identity", c => schemaBadRequest(c, "Invalid input.", schema));
  app.get("/enum-only", c => schemaBadRequest(c, "Invalid input.", { type: "object", properties: { mode: { type: "string", enum: ["fast", "slow"] } } }));

  const body = async (path: string) => (await app.request(path)).json() as Promise<Record<string, unknown>>;

  it("serves the published example when there is one", async () => {
    expect((await body("/published")).example).toEqual({ country_code: "US" });
    expect((await body("/reviewed")).example).toEqual({ name: "vitalik.eth" });
  });
  it("omits the example instead of inventing one for a required free-text field", async () => {
    for (const path of ["/unpublished", "/no-identity"]) {
      const result = await body(path);
      expect(result.example, path).toBeUndefined();
      expect(JSON.stringify(result)).not.toMatch(/example_\w+/);
    }
  });
  it("still builds a request from values the schema itself declares", async () => {
    expect((await body("/enum-only")).example).toEqual({ mode: "fast" });
  });
});

describe("the reviewed-example exception stays narrow", () => {
  it("every reviewed row is exactly the manifest's health_check_input and carries a reason", () => {
    for (const [slug, row] of Object.entries(REVIEWED_PUBLIC_INPUT_EXAMPLES)) {
      expect(manifest(slug).test_fixtures?.health_check_input, slug).toEqual(row.value);
      expect(row.reason.length, slug).toBeGreaterThan(20);
    }
  });
  it("an edited manifest input is withheld again until the reviewed row is updated", () => {
    const edited = { ...manifest("ens-resolve"), test_fixtures: { health_check_input: { name: "someone-private.eth" } } };
    expect(metadataFromManifest(edited).inputExample).toBeUndefined();
    expect(metadataFromManifest(edited).inputOmission).toBe("processes_personal_data");
  });
  it("another compliance tool with the same input stays withheld", () => {
    const other = { ...manifest("aml-risk-score"), slug: "other-compliance-tool" };
    expect(metadataFromManifest(other).inputOmission).toBe("compliance or screening category");
  });
  it("a reviewed input is still refused when it no longer fits the tool's input schema", () => {
    const schemaBreak = { ...manifest("ens-resolve"), input_schema: { type: "object", required: ["address"], properties: { address: { type: "string" } } } };
    expect(metadataFromManifest(schemaBreak).inputExample).toBeUndefined();
    expect(metadataFromManifest(schemaBreak).inputOmission).toContain("address");
  });
  it("output examples of the reviewed tools stay withheld", () => {
    for (const slug of Object.keys(REVIEWED_PUBLIC_INPUT_EXAMPLES)) {
      expect(metadataFromManifest(manifest(slug)).outputExample, slug).toBeUndefined();
    }
  });
});
