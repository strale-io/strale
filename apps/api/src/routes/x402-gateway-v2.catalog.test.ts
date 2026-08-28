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

import { eurCentsToUsd, getFacilitatorUrl } from "../lib/x402-gateway.js";

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

const { __resetX402CacheForTests, x402GatewayV2 } = await import("./x402-gateway-v2.js");

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
