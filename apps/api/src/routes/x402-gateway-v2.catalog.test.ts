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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function decimalUsdToAtomic(amount: string): string {
  const [whole, fraction = ""] = amount.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}

beforeEach(() => {
  state.capRows = [capabilityRow()];
  state.solRows = [solutionRow()];
});
afterEach(() => __resetX402CacheForTests());

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
      endpoint: `${BASE_URL}/x402/paid-api-preflight`,
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
