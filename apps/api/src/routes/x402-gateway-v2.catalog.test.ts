/**
 * GET /x402/catalog — the seller-owned `output_schema` projection.
 *
 * Origin: this is the shape of PR #409 by @epistemedeus, which proposed
 * projecting `output_schema` on every catalogue entry unconditionally. The
 * gap it identified is real — the credential-free catalogue described what to
 * send and never what comes back. The projection is opt-in here rather than
 * default because the unconditional form was measured against the live
 * payload: 203 KB -> 574 KB raw, 40 KB -> 182 KB gzipped, a 4.5x regression on
 * an endpoint discovery crawlers poll, for something the 402 challenge already
 * hands a buyer per-slug in ~3.5 KB at the moment of authorization.
 *
 * Hits the exported Hono app with a DB-backed cache refresh, the same path the
 * public route uses.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkL2ForOpenAPI,
  getOpenAPI,
  PaymentInfoSchema,
} from "@agentcash/discovery";

process.env.EUR_USD_RATE = "1.08";

const {
  eurCentsToUsd,
  eurCentsToUsdcAtomic,
  getFacilitatorUrl,
} = await import("../lib/x402-gateway.js");

const state = vi.hoisted(() => ({
  capRows: [] as Record<string, unknown>[],
  solRows: [] as Record<string, unknown>[],
}));

/**
 * The catalog refresh is `select(shape).from(table).where(...)`. The
 * capability shape includes `outputSchema` and the solution shape does not —
 * that split is also the authority this route must preserve, so the mock keys
 * off it rather than off call order.
 */
function chain(rows: unknown[]) {
  const thenable = Promise.resolve(rows) as unknown as Record<string, unknown>;
  thenable.where = () => chain(rows);
  thenable.from = () => chain(rows);
  thenable.limit = () => chain(rows);
  thenable.orderBy = () => chain(rows);
  thenable.innerJoin = () => chain(rows);
  thenable.leftJoin = () => chain(rows);
  return thenable;
}

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
    select: (shape?: Record<string, unknown>) => {
      const rows =
        shape && Object.prototype.hasOwnProperty.call(shape, "outputSchema")
          ? state.capRows
          : state.solRows;
      return chain(rows);
    },
  }),
}));

const {
  __resetX402CacheForTests,
  build402,
  encodeBudgetedPaymentRequiredHeader,
  getX402Manifest,
  getX402OpenApiPaths,
  x402GatewayV2,
} = await import("./x402-gateway-v2.js");

const BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";
const NETWORK = process.env.X402_NETWORK ?? "base-sepolia";
const WALLET = process.env.X402_WALLET_ADDRESS || null;

const PAID_INPUT = Object.freeze({
  type: "object",
  required: ["url"],
  properties: { url: { type: "string", description: "The endpoint to check" } },
});

const PAID_OUTPUT = Object.freeze({
  type: "object",
  required: ["url", "is_reachable"],
  properties: {
    url: { type: "string" },
    is_reachable: { type: "boolean" },
    status_code: { type: "integer" },
  },
});

function capabilityRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cap-paid-api-preflight",
    slug: "paid-api-preflight",
    name: "Paid API Pre-flight Check",
    description: "Verify any paid API endpoint before your agent spends money.",
    x402Method: "POST",
    inputSchema: PAID_INPUT,
    outputSchema: PAID_OUTPUT,
    priceCents: 2,
    transparencyTag: "algorithmic",
    capabilityType: "stable_api",
    dataSource: "HTTP fetch",
    dataClassification: null,
    processesPersonalData: false,
    personalDataCategories: [],
    ...overrides,
  };
}

function solutionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sol-kyb-essentials-se",
    slug: "kyb-essentials-se",
    name: "KYB Essentials Sweden",
    description: "Quick company verification for Sweden.",
    priceCents: 150,
    inputSchema: {
      type: "object",
      required: ["org_number"],
      properties: { org_number: { type: "string" } },
    },
    ...overrides,
  };
}

async function requestCatalog(query = "") {
  __resetX402CacheForTests();
  const res = await x402GatewayV2.request(`/catalog${query}`);
  const body = (await res.json()) as {
    capabilities: Array<Record<string, unknown>>;
    solutions: Array<Record<string, unknown>>;
    total: number;
    x402: boolean;
    network: string;
    facilitator: string;
    wallet: string | null;
  };
  return { res, body };
}

function openApiPriceAmount(
  paths: Record<string, unknown>,
  path: string,
  method: string,
): string {
  const pathItem = paths[path] as Record<string, unknown>;
  const operation = pathItem[method] as Record<string, unknown>;
  const paymentInfo = operation["x-payment-info"] as Record<string, unknown>;
  const price = paymentInfo.price as Record<string, unknown>;
  return price.amount as string;
}

function openApiOperation(
  paths: Record<string, unknown>,
  path: string,
  method: string,
): Record<string, unknown> {
  const pathItem = paths[path] as Record<string, unknown>;
  return pathItem[method] as Record<string, unknown>;
}

function decimalUsdToAtomic(amount: string): string {
  const [whole, fraction = ""] = amount.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}

beforeEach(() => {
  state.capRows = [capabilityRow()];
  state.solRows = [solutionRow()];
});
afterEach(() => {
  __resetX402CacheForTests();
  vi.unstubAllGlobals();
});

describe("NTA required credential before x402 payment", () => {
  it("returns the standard unavailable error before a payment challenge", async () => {
    vi.stubEnv("NTA_HOUJIN_APP_ID", "");
    state.capRows = [capabilityRow({ slug: "japanese-company-data" })];
    __resetX402CacheForTests();
    try {
      const res = await x402GatewayV2.request("/japanese-company-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ corporate_number: "1180301018771" }) });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error_code: "capability_unavailable" });
      expect(res.headers.get("PAYMENT-REQUIRED")).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });
});

describe("GET /x402/catalog output_schema projection", () => {
  it("omits output_schema by default — the payload crawlers poll stays lean", async () => {
    const { res, body } = await requestCatalog();
    expect(res.status).toBe(200);
    const entry = body.capabilities.find((c) => c.slug === "paid-api-preflight");
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("output_schema");
  });

  it("projects the seller's schema verbatim when asked for", async () => {
    const { body } = await requestCatalog("?include=output_schema");
    const entry = body.capabilities.find((c) => c.slug === "paid-api-preflight");
    expect(entry).toHaveProperty("output_schema");
    expect(entry!.output_schema).toEqual(PAID_OUTPUT);
  });

  it("honours the projection inside a comma-separated list, with spaces", async () => {
    const { body } = await requestCatalog("?include=something_else,%20output_schema");
    expect(body.capabilities[0]).toHaveProperty("output_schema");
  });

  it("ignores an unknown include rather than refusing the catalogue", async () => {
    const { res, body } = await requestCatalog("?include=not_a_projection");
    expect(res.status).toBe(200);
    expect(body.capabilities[0]).not.toHaveProperty("output_schema");
  });

  it("projects an empty but authoritative schema as {} rather than dropping it", async () => {
    state.capRows = [capabilityRow({ outputSchema: {} })];
    const { body } = await requestCatalog("?include=output_schema");
    expect(body.capabilities[0]).toHaveProperty("output_schema");
    expect(body.capabilities[0]!.output_schema).toEqual({});
  });

  it("never invents an output_schema for a solution, even when asked", async () => {
    const { body } = await requestCatalog("?include=output_schema");
    const entry = body.solutions.find((s) => s.slug === "kyb-essentials-se");
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("output_schema");
    expect(entry!.endpoint).toBe(`${BASE_URL}/x402/v2/solutions/kyb-essentials-se`);
    expect(Object.keys(entry!).sort()).toEqual(
      ["description", "endpoint", "input_schema", "method", "name", "price_usd", "slug"].sort(),
    );
  });

  it("leaves identity, price, request schema, network, facilitator and wallet untouched", async () => {
    const { res, body } = await requestCatalog("?include=output_schema");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(Object.keys(body).sort()).toEqual(
      ["capabilities", "facilitator", "network", "solutions", "total", "wallet", "x402"].sort(),
    );
    expect(body.x402).toBe(true);
    expect(body.network).toBe(NETWORK);
    expect(body.facilitator).toBe(getFacilitatorUrl());
    expect(body.wallet).toBe(WALLET);
    expect(body.total).toBe(2);
    expect(body.capabilities[0]).toEqual({
      slug: "paid-api-preflight",
      name: "Paid API Pre-flight Check",
      description: "Verify any paid API endpoint before your agent spends money.",
      price_usd: eurCentsToUsd(2),
      method: "POST",
      endpoint: `${BASE_URL}/x402/v2/paid-api-preflight`,
      input_schema: PAID_INPUT,
      output_schema: PAID_OUTPUT,
    });
  });
});

describe("x402 public price representation parity", () => {
  beforeEach(() => {
    state.capRows = [capabilityRow({ priceCents: 2 })];
    state.solRows = [solutionRow({ priceCents: 2 })];
  });

  it.each([
    ["capability", "/x402/v2/paid-api-preflight"],
    ["solution", "/x402/v2/solutions/kyb-essentials-se"],
  ])("publishes the exact six-decimal manifest price for the %s", async (_kind, path) => {
    __resetX402CacheForTests();
    const manifest = await getX402Manifest();

    expect(manifest.endpoints.find((entry) => entry.path === path)?.price)
      .toBe("0.021600");
  });

  it.each([
    ["capability", "/x402/v2/paid-api-preflight", "post"],
    ["solution", "/x402/v2/solutions/kyb-essentials-se", "post"],
  ])("publishes the exact six-decimal OpenAPI price for the %s", async (_kind, path, method) => {
    __resetX402CacheForTests();
    const paths = await getX402OpenApiPaths();

    expect(openApiPriceAmount(paths, path, method))
      .toBe("0.021600");
  });

  it.each([
    {
      kind: "capability",
      manifestPath: "/x402/v2/paid-api-preflight",
      openApiPath: "/x402/v2/paid-api-preflight",
      method: "post",
    },
    {
      kind: "solution",
      manifestPath: "/x402/v2/solutions/kyb-essentials-se",
      openApiPath: "/x402/v2/solutions/kyb-essentials-se",
      method: "post",
    },
  ])("keeps the $kind catalog, discovery and challenge amounts identical", async (fixture) => {
    __resetX402CacheForTests();
    const { body: catalog } = await requestCatalog();
    const manifest = await getX402Manifest();
    const paths = await getX402OpenApiPaths();
    const catalogEntries = fixture.kind === "capability" ? catalog.capabilities : catalog.solutions;
    const slug = fixture.kind === "capability" ? "paid-api-preflight" : "kyb-essentials-se";
    const catalogPrice = catalogEntries.find((entry) => entry.slug === slug)?.price_usd;
    const manifestPrice = manifest.endpoints.find((entry) => entry.path === fixture.manifestPath)?.price;
    const openApiPrice = openApiPriceAmount(paths, fixture.openApiPath, fixture.method);
    const { body: challenge } = build402(
      "Two-cent fixture",
      "Exact public representation fixture.",
      eurCentsToUsd(2),
      `https://api.strale.io${fixture.openApiPath}`,
      null,
      fixture.method,
      null,
      2,
    );
    const challengeAmount = ((challenge as Record<string, unknown>).accepts as Record<string, unknown>[])[0]
      .amount as string;

    expect(catalogPrice).toBe(0.0216);
    expect(manifestPrice).toBe("0.021600");
    expect(openApiPrice).toBe("0.021600");
    expect(challengeAmount).toBe("21600");
    expect(decimalUsdToAtomic(manifestPrice!)).toBe(eurCentsToUsdcAtomic(2));
    expect(decimalUsdToAtomic(openApiPrice)).toBe(eurCentsToUsdcAtomic(2));
  });
});

describe("x402 AgentCash discovery contract", () => {
  beforeEach(() => {
    state.capRows = [capabilityRow({ priceCents: 2 })];
    state.solRows = [solutionRow({ priceCents: 2 })];
  });

  it.each([
    ["capability", "/x402/v2/paid-api-preflight", "post"],
    ["solution", "/x402/v2/solutions/kyb-essentials-se", "post"],
  ])("publishes schema-valid structured payment metadata for the %s", async (_kind, path, method) => {
    __resetX402CacheForTests();
    const paths = await getX402OpenApiPaths();
    const paymentInfo = openApiOperation(paths, path, method)["x-payment-info"];

    expect.soft(paymentInfo).toMatchObject({ protocols: [{ x402: {} }] });
    expect(PaymentInfoSchema.safeParse(paymentInfo).success).toBe(true);
  });

  it.each([
    ["capability", "/x402/v2/paid-api-preflight"],
    ["solution", "/x402/v2/solutions/kyb-essentials-se"],
  ])("survives real AgentCash discovery for the %s", async (_kind, path) => {
    __resetX402CacheForTests();
    const paths = await getX402OpenApiPaths();
    const document = {
      openapi: "3.1.0",
      info: { title: "Strale x402 contract fixture", version: "1.0.0" },
      servers: [{ url: BASE_URL }],
      paths,
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(document), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const result = await getOpenAPI(BASE_URL);
    if (result.isErr()) throw new Error(`AgentCash fetch failed: ${result.error.message}`);
    const source = result.value;
    if (!source || "parseFailure" in source) {
      throw new Error(`AgentCash did not parse the OpenAPI fixture: ${JSON.stringify(source)}`);
    }

    const parsedRoute = source.routes.find((route) => route.path === path && route.method === "POST");
    expect(parsedRoute).toMatchObject({
      authMode: "paid",
      protocols: ["x402"],
      pricing: {
        pricingMode: "fixed",
        price: "0.021600",
        currency: "USD",
      },
    });

    const l2Route = checkL2ForOpenAPI(source).routes.find(
      (route) => route.path === path && route.method === "POST",
    );
    expect(l2Route).toMatchObject({
      authMode: "paid",
      price: "0.021600 USD",
      pricingMode: "fixed",
      currency: "USD",
      protocols: ["x402"],
    });
  });
});

// CDP's hosted API has no offline package: exercise the published SDK parser
// and Bazaar Ajv validator for ALL manifests, a superset of enabled DB rows.
// Enabled status lives in the DB; a fixture does not assert production eligibility.
import { encodePaymentRequiredHeader } from "@x402/core/http";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import yaml from "js-yaml";
import { getDiscoveryMetadata, metadataFromManifest, type DiscoveryManifest } from "../lib/x402-discovery-metadata.js";
import { validateOfflineDiscovery } from "../test-helpers/x402-discovery-validator.js";
const manifestDirectory = new URL("../../../../manifests/", import.meta.url);
const discoveryManifests = readdirSync(manifestDirectory).filter(file => file.endsWith(".yaml"))
  .map(file => yaml.load(readFileSync(new URL(file, manifestDirectory), "utf8")) as DiscoveryManifest);

describe("D2 offline CDP/Bazaar discovery gate", () => {
  beforeAll(() => {
    for (const manifest of discoveryManifests) metadataFromManifest(manifest);
    getDiscoveryMetadata("capability", discoveryManifests[0].slug);
    validateOfflineDiscovery(build402("Warmup", "Warmup", .054, "https://api.strale.io/x402/v2/warmup", {}, "POST", {}, 2).body);
  }, 60_000);
  it("bounds all manifest capability and solution headers", () => {
    const sizes: number[] = [];
    let extensions = 0;
    const missing: string[] = [];
    const paymentHash = createHash("sha256");
    const counts = {
      capability: { GET: { input: 0, output: 0 }, POST: { input: 0, output: 0, emptyBody: 0 } },
      solution: { GET: { input: 0, output: 0 }, POST: { input: 0, output: 0, emptyBody: 0 } },
    };
    for (const kind of ["capability", "solution"] as const) {
      for (const manifest of discoveryManifests) {
        for (const method of ["GET", "POST"] as const) {
          const { body } = build402(manifest.name, manifest.description, 0.054, `https://api.strale.io/x402/v2/${kind === "solution" ? "solutions/" : ""}${manifest.slug}`, manifest.input_schema, method, manifest.output_schema, 2, { kind, slug: manifest.slug });
          const bytes = Buffer.byteLength(encodePaymentRequiredHeader(body as never));
          sizes.push(bytes);
          const info = (body.extensions.bazaar as any)?.info;
          if (info) extensions++;
          else if (kind === "capability" && method === "GET") missing.push(manifest.slug);
          const withoutSchema = (entry: Record<string, unknown>) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "outputSchema"));
          paymentHash.update(JSON.stringify([kind, manifest.slug, method, body.accepts.map(withoutSchema), body.paymentRequirements.map(withoutSchema)]));
          const input = info?.input[method === "POST" ? "body" : "queryParams"];
          const published = metadataFromManifest(manifest).inputExample;
          if (input !== undefined && published !== undefined && kind === "capability") counts[kind][method].input++;
          if (method === "POST" && input !== undefined && published === undefined) counts[kind].POST.emptyBody++;
          if (info?.output.example !== undefined) counts[kind][method].output++;
        }
      }
    }
    sizes.sort((a, b) => a - b);
    process.stdout.write("D2 header distribution " + JSON.stringify({ challenges: sizes.length, max: sizes.at(-1), p95: sizes[Math.ceil(sizes.length * .95) - 1], median: (sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2, over8192: sizes.filter(size => size > 8192).length, extensions, missing, paymentHash: paymentHash.digest("hex"), counts }) + "\n");
    expect(sizes.filter(size => size > 8192)).toEqual([]);
  }, 60_000);
  it("keeps Bazaar discovery for a large us-company-data GET challenge", () => {
    const manifest = discoveryManifests.find(item => item.slug === "us-company-data")!;
    const { body } = build402(manifest.name, manifest.description, .054, `https://api.strale.io/x402/v2/${manifest.slug}`, manifest.input_schema, "GET", manifest.output_schema, 2, { kind: "capability", slug: manifest.slug });
    expect(Buffer.byteLength(encodePaymentRequiredHeader(body as never))).toBeLessThanOrEqual(8192);
    expect(body.extensions.bazaar).toBeDefined();
  });
  it.each(discoveryManifests.flatMap(manifest => ["GET", "POST"].map(method => [manifest.slug, method, manifest] as const)))("validates %s %s challenge", (slug, method, manifest) => {
    const { body } = build402(manifest.name, manifest.description, 0.054, `https://api.strale.io/x402/v2/${slug}`, manifest.input_schema, method, manifest.output_schema, 2, { kind: "capability", slug });
    expect(validateOfflineDiscovery(body)).toEqual([]);
    const metadata = metadataFromManifest(manifest);
    expect(body.resource.serviceName).toBe("Strale");
    expect(body.resource.description).toBe(`${manifest.name}: ${manifest.description}`);
    const extension = body.extensions.bazaar as any;
    if (extension) {
      const input = extension.info.input[method === "POST" ? "body" : "queryParams"];
      // Budgeting may drop the input example or use a valid empty POST body.
      if (input !== undefined && !(method === "POST" && Object.keys(input).length === 0)) expect(input).toEqual(metadata.inputExample);
      // Header budgeting may withhold an otherwise safe output example.
      if (extension.info.output.example !== undefined) expect(extension.info.output.example).toEqual(metadata.outputExample);
      expect(JSON.stringify(extension.info.input)).not.toMatch(/example_\w+/);
    }
  }, 60_000);
  it("drops output before input as the header approaches its budget", () => {
    const manifest = discoveryManifests.find(item => {
      const metadata = metadataFromManifest(item);
      return metadata.inputExample !== undefined && metadata.outputExample !== undefined;
    })!;
    const metadata = metadataFromManifest(manifest);
    let sawOutputOnlyDropped = false;
    let sawBothDropped = false;
    for (let padding = 0; padding < 6500; padding += 16) {
      const schema = { ...manifest.input_schema, description: "z".repeat(padding) };
      const { body } = build402(manifest.name, manifest.description, .054, `https://api.strale.io/x402/v2/${manifest.slug}`, schema, "GET", manifest.output_schema, 2, { kind: "capability", slug: manifest.slug });
      const info = (body.extensions.bazaar as any)?.info;
      expect(Buffer.byteLength(encodePaymentRequiredHeader(body as never))).toBeLessThanOrEqual(8192);
      if (info?.input.queryParams === undefined) {
        expect(info?.output.example).toBeUndefined();
        sawBothDropped = true;
      } else if (info.output.example === undefined) {
        expect(info.input.queryParams).toEqual(metadata.inputExample);
        sawOutputOnlyDropped = true;
      }
      if (sawBothDropped && sawOutputOnlyDropped) break;
    }
    expect(sawOutputOnlyDropped).toBe(true);
    expect(sawBothDropped).toBe(true);
  }, 60_000);
  it.each([3000, 12000])("budgets a %i-byte verification-failure reason without changing payment fields", length => {
    const manifest = discoveryManifests.find(item => metadataFromManifest(item).inputExample !== undefined)!;
    const { body } = build402(manifest.name, manifest.description, .054, `https://api.strale.io/x402/v2/${manifest.slug}`, manifest.input_schema, "GET", manifest.output_schema, 2, { kind: "capability", slug: manifest.slug });
    const payment = { ...body.accepts[0] };
    delete payment.outputSchema;
    body.error = "Payment verification failed: " + "z".repeat(length);
    const header = encodeBudgetedPaymentRequiredHeader(body, manifest.slug);
    expect(Buffer.byteLength(header)).toBeLessThanOrEqual(8192);
    const after = { ...body.accepts[0] };
    delete after.outputSchema;
    expect(after).toEqual(payment);
    expect(JSON.parse(Buffer.from(header, "base64").toString())).toEqual(body);
  });
  it("uses an empty POST body only when the input contract accepts it", () => {
    const make = (schema: Record<string, unknown>) => build402("Tool", "Description", .054, "https://api.strale.io/x402/v2/tool", schema, "POST", null, 2).body;
    const empty = make({ type: "object", properties: { option: { type: "boolean" } } });
    expect((empty.extensions.bazaar as any).info.input.body).toEqual({});
    expect(validateOfflineDiscovery(empty)).toEqual([]);
    for (const schema of [
      { type: "object", required: ["query"], properties: { query: { type: "string" } } },
      { type: "object", anyOf: [{ required: ["query"] }] },
    ]) {
      const required = make(schema);
      expect(required.extensions.bazaar).toBeUndefined();
      expect(required.resource).toMatchObject({ serviceName: "Strale", description: "Tool: Description", tags: [], iconUrl: "https://strale.dev/favicon-32x32.png" });
      expect(validateOfflineDiscovery(required)).toEqual([]);
    }
  });
  it.each(["email-validate", "whois-lookup", "image-to-text"])("preserves every v1 payment field for %s", slug => {
    const manifest = discoveryManifests.find(item => item.slug === slug)!;
    const resource = `https://api.strale.io/x402/${slug}`;
    // Frozen payment-field projection from the d004d774 builder (pre-D2).
    const before = {
      maxAmountRequired: "54000", payTo: WALLET ?? "0x0000000000000000000000000000000000000001",
      asset: NETWORK === "base" ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      network: NETWORK, scheme: "exact", resource, maxTimeoutSeconds: 300,
    };
    const { body, paymentRequirement, headerPayload } = build402(manifest.name, manifest.description, 0.054, resource, manifest.input_schema, "POST", manifest.output_schema, 1, { kind: "capability", slug });
    const project = (requirement: Record<string, unknown>) => Object.fromEntries(Object.keys(before).map(key => [key, requirement[key]]));
    expect(JSON.stringify(project(paymentRequirement))).toBe(JSON.stringify(before));
    expect(project(body.accepts[0])).toEqual(before);
    expect(project(body.paymentRequirements[0])).toEqual(before);
    expect(project(JSON.parse(Buffer.from(headerPayload, "base64").toString()).accepts[0])).toEqual(before);
  });
  it("does not disclose a capability's example through a solution with the same slug", () => {
    const manifest = discoveryManifests.find(item => metadataFromManifest(item).inputExample !== undefined && (item.input_schema?.required as string[] | undefined)?.length)!;
    const make = (kind: "capability" | "solution") => build402("Solution", "Solution description", 0.054, `https://api.strale.io/x402/v2/solutions/${manifest.slug}`, manifest.input_schema, "POST", manifest.output_schema, 2, { kind, slug: manifest.slug }).body;
    expect((make("capability").extensions.bazaar as any).info.input.body).toBeDefined();
    const solution = make("solution");
    expect(solution.extensions.bazaar).toBeUndefined();
    expect(solution.resource.description).toBe("Solution: Solution description");
    expect(validateOfflineDiscovery(solution)).toEqual([]);
  });
  it("publishes manifest output examples on v2 without touching v1 payment fields", () => {
    // Text tools whose examples the input-only name heuristic used to withhold.
    for (const slug of ["redirect-trace", "summarize", "translate"]) {
      const manifest = discoveryManifests.find(item => item.slug === slug)!;
      const expected = (manifest.output_schema as any).example;
      const v2 = build402(manifest.name, manifest.description, .054, `https://api.strale.io/x402/v2/${slug}`, manifest.input_schema, "GET", manifest.output_schema, 2, { kind: "capability", slug });
      expect((v2.body.extensions.bazaar as any).info.output.example).toEqual(expected);
      expect(validateOfflineDiscovery(v2.body)).toEqual([]);

      // Legacy /x402/<slug> serves v1 to today's payers. Its payment fields and
      // X-PAYMENT header must be byte-identical with and without the example.
      const legacy = `https://api.strale.io/x402/${slug}`;
      const withExample = build402(manifest.name, manifest.description, .054, legacy, manifest.input_schema, "GET", manifest.output_schema, 1, { kind: "capability", slug });
      const withoutExample = build402(manifest.name, manifest.description, .054, legacy, manifest.input_schema, "GET", manifest.output_schema, 1);
      expect(withExample.body.x402Version).toBe(1);
      expect(withExample.headerPayload).toBe(withoutExample.headerPayload);
      expect(withExample.body.accepts).toEqual(withoutExample.body.accepts);
      expect(withExample.body.paymentRequirements).toEqual(withoutExample.body.paymentRequirements);
      expect(withExample.paymentRequirement).toEqual(withoutExample.paymentRequirement);
      expect(JSON.parse(Buffer.from(withExample.headerPayload, "base64").toString())).toEqual({ x402Version: 1, accepts: [withExample.paymentRequirement] });
      expect(withExample.paymentRequirement).toMatchObject({ scheme: "exact", resource: legacy, maxAmountRequired: "54000" });
    }
  });
  it("rejects malformed discovery metadata and v1 envelopes", () => {
    const body = build402("Tool", "Description", 0.054, "https://api.strale.io/x402/v2/tool", null, "POST", null, 2).body;
    expect(validateOfflineDiscovery(body)).toEqual([]);
    expect(validateOfflineDiscovery({ ...body, x402Version: 1 }).length).toBeGreaterThan(0);
    expect(validateOfflineDiscovery({ ...body, resource: { ...body.resource, serviceName: "", tags: ["x", "X"], iconUrl: "https://127.0.0.1/icon.png" } })).toEqual(expect.arrayContaining(["missing/invalid serviceName", "missing/invalid tags", "invalid iconUrl"]));
    expect(validateOfflineDiscovery({ ...body, extensions: { bazaar: { ...(body.extensions.bazaar as any), info: { input: { type: "wrong" } } } } }).length).toBeGreaterThan(0);
    expect(validateOfflineDiscovery({ ...body, extensions: { bazaar: { schema: { $schema: "https://json-schema.org/draft/2020-12/schema" }, info: { input: { type: "anything", method: "BANANA" } } } } })).toEqual(expect.arrayContaining(["missing HTTP input schema contract", "invalid HTTP method contract"]));
  });
});
