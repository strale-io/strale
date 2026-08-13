/**
 * Regression tests for the x402 v2 challenge migration (task #31, 2026-08-13).
 *
 * Background: x402scan's register crawl rejected all 354 Strale endpoints
 * with "x402 v1 response detected — migrate to v2 spec". ~400-600 x402
 * settlements/week ride on the 402 body shape and the payer client versions
 * are unknown (UA capture only started 2026-08-12), so the migration is a
 * hybrid: the body must validate as pure x402 v2 (what x402scan and v2
 * clients check) while still carrying every legacy v1 field an old client
 * reads off `accepts[0]` or `paymentRequirements[0]`.
 *
 * These tests pin both halves against the REAL zod schemas from @x402/core —
 * the exact validation x402scan's probe runs. They fail against the pre-fix
 * v1-only body (x402Version: 1 fails the V2 discriminant) and fail if a
 * future edit drops the legacy fields (v1-client compat) or the rollback
 * lever.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parsePaymentRequired } from "@x402/core/schemas";

// Capture facilitator.verify(payload, requirements) calls so the
// version-branching in verifyX402PaymentOnly can be asserted without any
// network traffic.
const verifyCalls: Array<{ payload: unknown; requirements: Record<string, unknown> }> = [];
vi.mock("@x402/core/server", () => ({
  HTTPFacilitatorClient: class {
    constructor(_cfg: unknown) {}
    async verify(payload: unknown, requirements: Record<string, unknown>) {
      verifyCalls.push({ payload, requirements });
      return { isValid: true, payer: "0x1111111111111111111111111111111111111111" };
    }
    async settle() {
      return { success: true, transaction: "0xdead" };
    }
  },
}));
vi.mock("@coinbase/x402", () => ({
  createFacilitatorConfig: () => ({ url: "https://facilitator.test" }),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  verifyCalls.length = 0;
  process.env.X402_NETWORK = "base";
  process.env.X402_WALLET_ADDRESS = "0x2222222222222222222222222222222222222222";
  delete process.env.X402_CHALLENGE_VERSION;
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function loadGateway() {
  return await import("./x402-gateway.js");
}

async function loadRoutes() {
  return await import("../routes/x402-gateway-v2.js");
}

function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

const V1_PAYLOAD = {
  x402Version: 1,
  scheme: "exact",
  network: "base",
  payload: {
    signature: "0xsig",
    authorization: { from: "0x3333333333333333333333333333333333333333" },
  },
};

const V2_PAYLOAD = {
  x402Version: 2,
  accepted: {
    scheme: "exact",
    network: "eip155:8453",
    amount: "54000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x2222222222222222222222222222222222222222",
    maxTimeoutSeconds: 300,
    extra: {},
  },
  payload: {
    signature: "0xsig",
    authorization: { from: "0x3333333333333333333333333333333333333333" },
  },
};

describe("networkToCaip2", () => {
  it("maps the two known networks and passes CAIP-2 through", async () => {
    const { networkToCaip2 } = await loadGateway();
    expect(networkToCaip2("base")).toBe("eip155:8453");
    expect(networkToCaip2("base-sepolia")).toBe("eip155:84532");
    expect(networkToCaip2("eip155:1")).toBe("eip155:1");
  });
});

describe("build402Response (/v1/do challenge)", () => {
  it("emits a body that validates against the real x402 v2 schema", async () => {
    const { build402Response } = await loadGateway();
    const { body } = build402Response({ slug: "iban-validate", name: "IBAN Validate", priceCents: 5 });
    const parsed = parsePaymentRequired(body);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
    if (parsed.success) expect(parsed.data.x402Version).toBe(2);
  });

  it("keeps every legacy v1 field on accepts[0] for old clients", async () => {
    const { build402Response } = await loadGateway();
    const { body } = build402Response({ slug: "iban-validate", name: "IBAN Validate", priceCents: 5 });
    const entry = (body.accepts as Record<string, unknown>[])[0];
    expect(entry.maxAmountRequired).toBe(entry.amount);
    expect(entry.resource).toBe("/v1/do");
    expect(typeof entry.description).toBe("string");
    expect(entry.mimeType).toBe("application/json");
    // v2 fields present too
    expect(entry.network).toBe("eip155:8453");
    expect(typeof entry.amount).toBe("string");
  });

  it("mirrors a pure v1 requirement (bare network) under paymentRequirements", async () => {
    const { build402Response } = await loadGateway();
    const { body } = build402Response({ slug: "iban-validate", name: "IBAN Validate", priceCents: 5 });
    const legacy = (body.paymentRequirements as Record<string, unknown>[])[0];
    expect(legacy.network).toBe("base");
    expect(legacy.maxAmountRequired).toBeDefined();
    expect(legacy.amount).toBeUndefined();
  });

  it("X402_CHALLENGE_VERSION=1 rolls back to a valid pure v1 body", async () => {
    process.env.X402_CHALLENGE_VERSION = "1";
    const { build402Response } = await loadGateway();
    const { body } = build402Response({ slug: "iban-validate", name: "IBAN Validate", priceCents: 5 });
    expect(body.x402Version).toBe(1);
    const parsed = parsePaymentRequired(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.x402Version).toBe(1);
  });
});

describe("build402 (gateway /x402/:slug challenge)", () => {
  // The routes module drags in the app's full import graph; first load can
  // exceed the 10s default. Functional behavior is unaffected.
  it("emits a body that validates against the real x402 v2 schema", { timeout: 60_000 }, async () => {
    const { build402 } = await loadRoutes();
    const { body } = build402(
      "IBAN Validate", "Validate an IBAN.", 0.054,
      "https://api.strale.io/x402/iban-validate",
      { type: "object", properties: { iban: { type: "string" } } }, "GET", null,
    );
    const parsed = parsePaymentRequired(body as Record<string, unknown>);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
    if (parsed.success) expect(parsed.data.x402Version).toBe(2);
  });

  it("keeps legacy v1 fields (incl. Bazaar v1 outputSchema) on accepts[0]", async () => {
    const { build402 } = await loadRoutes();
    const { body } = build402(
      "IBAN Validate", "Validate an IBAN.", 0.054,
      "https://api.strale.io/x402/iban-validate",
      { type: "object", properties: { iban: { type: "string" } } }, "GET", null,
    );
    const entry = ((body as Record<string, unknown>).accepts as Record<string, unknown>[])[0];
    expect(entry.maxAmountRequired).toBe(entry.amount);
    expect(entry.resource).toBe("https://api.strale.io/x402/iban-validate");
    expect(entry.outputSchema).toBeDefined();
    expect(entry.network).toBe("eip155:8453");
    // v1 mirror + v2 extensions both present
    const b = body as Record<string, unknown>;
    expect((b.paymentRequirements as Record<string, unknown>[])[0].network).toBe("base");
    expect(b.extensions).toBeDefined();
  });

  it("X402_CHALLENGE_VERSION=1 rolls back to the v1 body", async () => {
    process.env.X402_CHALLENGE_VERSION = "1";
    const { build402 } = await loadRoutes();
    const { body } = build402(
      "IBAN Validate", "Validate an IBAN.", 0.054,
      "https://api.strale.io/x402/iban-validate",
      null, "GET", null,
    );
    expect((body as Record<string, unknown>).x402Version).toBe(1);
  });
});

describe("verifyX402PaymentOnly version branching", () => {
  it("v1 payload → v1-shaped requirements (bare network, maxAmountRequired)", async () => {
    const { verifyX402PaymentOnly } = await loadGateway();
    const result = await verifyX402PaymentOnly(encodePayload(V1_PAYLOAD), 5);
    expect(result.valid).toBe(true);
    expect(verifyCalls).toHaveLength(1);
    const req = verifyCalls[0].requirements;
    expect(req.network).toBe("base");
    expect(req.maxAmountRequired).toBe("54000");
    expect(req.amount).toBeUndefined();
    expect(req.resource).toBe("/v1/do");
  });

  it("v2 payload → v2-shaped requirements (CAIP-2, amount, no resource fields)", async () => {
    const { verifyX402PaymentOnly } = await loadGateway();
    const result = await verifyX402PaymentOnly(encodePayload(V2_PAYLOAD), 5);
    expect(result.valid).toBe(true);
    expect(verifyCalls).toHaveLength(1);
    const req = verifyCalls[0].requirements;
    expect(req.network).toBe("eip155:8453");
    expect(req.amount).toBe("54000");
    expect(req.maxAmountRequired).toBeUndefined();
    expect(req.resource).toBeUndefined();
    expect(req.outputSchema).toBeUndefined();
  });

  it("normalizes a v1 payload that echoed the CAIP-2 network off the merged entry", async () => {
    const { verifyX402PaymentOnly } = await loadGateway();
    const echoed = { ...V1_PAYLOAD, network: "eip155:8453" };
    const result = await verifyX402PaymentOnly(encodePayload(echoed), 5);
    expect(result.valid).toBe(true);
    const sent = verifyCalls[0].payload as { network?: string };
    expect(sent.network).toBe("base");
    expect(verifyCalls[0].requirements.network).toBe("base");
  });

  it("extractPayerAddress works for both payload generations", async () => {
    const { verifyX402PaymentOnly, extractPayerAddress } = await loadGateway();
    for (const p of [V1_PAYLOAD, V2_PAYLOAD]) {
      verifyCalls.length = 0;
      const result = await verifyX402PaymentOnly(encodePayload(p), 5);
      expect(result.valid).toBe(true);
      expect(result.verified && extractPayerAddress(result.verified)).toBe(
        "0x3333333333333333333333333333333333333333",
      );
    }
  });
});
