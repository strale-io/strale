/**
 * GET /x402/catalog must project a capability's seller-owned output_schema
 * so a buyer can inspect the contract before authorization.
 *
 * After PR #402, paid-api-preflight declares a strict output_schema and
 * GET /v1/capabilities already surfaces it. The credential-free catalog
 * transformation only returned input_schema. Solutions have no output-schema
 * column; absence must stay absent — not become `{}` or null.
 *
 * Hits the exported Hono app (`x402GatewayV2`) with a DB-backed cache
 * refresh, the same path the public /x402/catalog route uses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

import { eurCentsToUsd, getFacilitatorUrl } from "../lib/x402-gateway.js";

const state = vi.hoisted(() => ({
  capRows: [] as Record<string, unknown>[],
  solRows: [] as Record<string, unknown>[],
}));

/**
 * Drizzle's catalog refresh is `select(shape).from(table).where(...)`.
 * Capability shape includes `outputSchema`; solution shape does not —
 * that is also the authority split this route must preserve.
 */
function chain(rows: unknown[]) {
  const thenable: Record<string, unknown> = Promise.resolve(rows) as unknown as Record<
    string,
    unknown
  >;
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

import { __resetX402CacheForTests, x402GatewayV2 } from "./x402-gateway-v2.js";

const BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";
const NETWORK = process.env.X402_NETWORK ?? "base-sepolia";
const WALLET = process.env.X402_WALLET_ADDRESS || null;

const PAID_INPUT = Object.freeze({
  type: "object",
  required: ["url"],
  properties: {
    url: {
      type: "string",
      description: "The paid API endpoint URL to check before paying",
    },
  },
});

function loadPaidPreflightOutputSchema(): Record<string, unknown> {
  const file = resolve(import.meta.dirname, "../../../../manifests/paid-api-preflight.yaml");
  const manifest = yaml.load(readFileSync(file, "utf8")) as {
    output_schema: Record<string, unknown>;
  };
  return manifest.output_schema;
}

function capabilityRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cap-paid-api-preflight",
    slug: "paid-api-preflight",
    name: "Paid API Pre-flight Check",
    description: "Verify any paid API endpoint before your agent spends money.",
    x402Method: "POST",
    inputSchema: PAID_INPUT,
    outputSchema: loadPaidPreflightOutputSchema(),
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

async function requestCatalog() {
  __resetX402CacheForTests();
  const res = await x402GatewayV2.request("/catalog");
  const body = (await res.json()) as {
    x402: boolean;
    network: string;
    facilitator: string;
    wallet: string | null;
    capabilities: Array<Record<string, unknown>>;
    solutions: Array<Record<string, unknown>>;
    total: number;
  };
  return { res, body };
}

beforeEach(() => {
  state.capRows = [];
  state.solRows = [];
});

afterEach(() => {
  __resetX402CacheForTests();
});

describe("GET /x402/catalog output-schema projection", () => {
  it("projects the seller-owned paid-api-preflight output_schema without rewriting it", async () => {
    const sellerSchema = loadPaidPreflightOutputSchema();
    state.capRows = [capabilityRow({ outputSchema: sellerSchema })];

    const { res, body } = await requestCatalog();
    expect(res.status).toBe(200);

    const entry = body.capabilities.find((c) => c.slug === "paid-api-preflight");
    expect(entry, "paid-api-preflight must appear in the credential-free catalog").toBeDefined();
    expect(entry!.output_schema).toEqual(sellerSchema);
    expect(entry!.output_schema).not.toBeUndefined();
  });

  it("projects an empty but authoritative capability output_schema as-is", async () => {
    const emptySchema = {};
    state.capRows = [
      capabilityRow({
        id: "cap-empty-output",
        slug: "empty-output-cap",
        name: "Empty output contract",
        outputSchema: emptySchema,
        x402Method: "GET",
        priceCents: 5,
      }),
    ];

    const { body } = await requestCatalog();
    const entry = body.capabilities.find((c) => c.slug === "empty-output-cap");
    expect(entry).toBeDefined();
    expect(entry).toHaveProperty("output_schema");
    expect(entry!.output_schema).toEqual({});
  });

  it("does not invent an output_schema for a solution that has no source column", async () => {
    state.solRows = [solutionRow()];

    const { body } = await requestCatalog();
    const entry = body.solutions.find((s) => s.slug === "kyb-essentials-se");
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("output_schema");
    expect(Object.keys(entry!).sort()).toEqual(
      ["description", "endpoint", "input_schema", "method", "name", "price_usd", "slug"].sort(),
    );
  });

  it("leaves catalog identity, price, request schema, network, facilitator, wallet, method, and endpoint unchanged", async () => {
    const sellerSchema = loadPaidPreflightOutputSchema();
    const solInput = {
      type: "object",
      required: ["org_number"],
      properties: { org_number: { type: "string" } },
    };
    state.capRows = [capabilityRow({ outputSchema: sellerSchema })];
    state.solRows = [solutionRow({ inputSchema: solInput })];

    const { res, body } = await requestCatalog();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");

    expect(Object.keys(body).sort()).toEqual(
      ["capabilities", "facilitator", "network", "solutions", "total", "wallet", "x402"].sort(),
    );
    expect(body.x402).toBe(true);
    expect(body.network).toBe(NETWORK);
    expect(body.facilitator).toBe(getFacilitatorUrl());
    expect(body.wallet).toBe(WALLET);
    expect(body.total).toBe(2);

    expect(body.capabilities).toHaveLength(1);
    expect(body.capabilities[0]).toEqual({
      slug: "paid-api-preflight",
      name: "Paid API Pre-flight Check",
      description: "Verify any paid API endpoint before your agent spends money.",
      price_usd: eurCentsToUsd(2),
      method: "POST",
      endpoint: `${BASE_URL}/x402/paid-api-preflight`,
      input_schema: PAID_INPUT,
      output_schema: sellerSchema,
    });

    expect(body.solutions).toHaveLength(1);
    expect(body.solutions[0]).toEqual({
      slug: "kyb-essentials-se",
      name: "KYB Essentials Sweden",
      description: "Quick company verification for Sweden.",
      price_usd: eurCentsToUsd(150),
      method: "POST",
      endpoint: `${BASE_URL}/x402/solutions/kyb-essentials-se`,
      input_schema: solInput,
    });
  });
});
