/**
 * Regression tests for the x402 v2 challenge migration (task #31, 2026-08-13).
 *
 * Background: x402scan's register crawl rejected all 354 Strale endpoints
 * with "x402 v1 response detected — migrate to v2 spec", while ~400-600
 * USDC settlements/week ride on the 402 body with unknown client versions.
 * A both-generations body is provably impossible: canonical v1 clients
 * (x402-fetch 0.x) zod-parse every accepts[] entry against a strict
 * bare-name network ENUM, while v2 validators require CAIP-2 network
 * strings — one field, two incompatible schemas. So the design is dual
 * paths: legacy /x402/:slug keeps serving v1 (until the
 * X402_CHALLENGE_VERSION=2 cutover, gated on v1 payload volume reaching
 * zero per the x402-payment-payload-version log counter), and the
 * /x402/v2/* aliases always serve the v2 shape, which is what the
 * discovery surfaces now advertise.
 *
 * These tests pin the v2 body against the REAL zod schemas from
 * @x402/core — the exact validation x402scan's probe runs — plus the
 * legacy-field hedge, the version-branched verify path, and the default.
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

describe("x402ChallengeVersion (legacy-path default / cutover switch)", () => {
  it("defaults to v1 — legacy paths must not change under existing payers", async () => {
    const { x402ChallengeVersion } = await loadGateway();
    expect(x402ChallengeVersion()).toBe(1);
  });

  it("flips to v2 only on the explicit cutover values", async () => {
    const { x402ChallengeVersion } = await loadGateway();
    process.env.X402_CHALLENGE_VERSION = "2";
    expect(x402ChallengeVersion()).toBe(2);
    process.env.X402_CHALLENGE_VERSION = "v2";
    expect(x402ChallengeVersion()).toBe(2);
    // Unrecognized values stay on the safe side (v1)
    process.env.X402_CHALLENGE_VERSION = "yes";
    expect(x402ChallengeVersion()).toBe(1);
  });
});

describe("build402Response (/v1/do challenge)", () => {
  it("serves the pre-migration v1 body by default", async () => {
    const { build402Response } = await loadGateway();
    const { body } = build402Response({ slug: "iban-validate", name: "IBAN Validate", priceCents: 5 });
    expect(body.x402Version).toBe(1);
    const parsed = parsePaymentRequired(body);
    expect(parsed.success).toBe(true);
    const entry = (body.accepts as Record<string, unknown>[])[0];
    expect(entry.network).toBe("base");
    expect(entry.maxAmountRequired).toBeDefined();
  });

  it("after cutover (env=2) emits a body that validates against the real v2 schema", async () => {
    process.env.X402_CHALLENGE_VERSION = "2";
    const { build402Response } = await loadGateway();
    const { body } = build402Response({ slug: "iban-validate", name: "IBAN Validate", priceCents: 5 });
    const parsed = parsePaymentRequired(body);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
    if (parsed.success) expect(parsed.data.x402Version).toBe(2);
    // Legacy hedge fields survive on the raw object
    const entry = (body.accepts as Record<string, unknown>[])[0];
    expect(entry.maxAmountRequired).toBe(entry.amount);
    expect(entry.network).toBe("eip155:8453");
    const legacy = (body.paymentRequirements as Record<string, unknown>[])[0];
    expect(legacy.network).toBe("base");
  });
});

describe("build402 (gateway challenge builder)", () => {
  // The routes module drags in the app's full import graph; first load can
  // exceed the 10s default. Functional behavior is unaffected.
  it("explicit v2 emits a body that validates against the real v2 schema", { timeout: 60_000 }, async () => {
    const { build402 } = await loadRoutes();
    const { body } = build402(
      "IBAN Validate", "Validate an IBAN.", 0.054,
      "https://api.strale.io/x402/v2/iban-validate",
      { type: "object", properties: { iban: { type: "string" } } }, "GET", null,
      2,
    );
    const parsed = parsePaymentRequired(body as Record<string, unknown>);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
    if (parsed.success) expect(parsed.data.x402Version).toBe(2);
    // Legacy hedge + v2 discovery extensions both present on the raw body
    const b = body as Record<string, unknown>;
    const entry = (b.accepts as Record<string, unknown>[])[0];
    expect(entry.maxAmountRequired).toBe(entry.amount);
    expect(entry.resource).toBe("https://api.strale.io/x402/v2/iban-validate");
    expect(entry.outputSchema).toBeDefined();
    expect(entry.network).toBe("eip155:8453");
    expect((b.paymentRequirements as Record<string, unknown>[])[0].network).toBe("base");
    expect(b.extensions).toBeDefined();
  });

  it("explicit v1 (legacy paths) reproduces the pre-migration body shape", async () => {
    const { build402 } = await loadRoutes();
    const { body } = build402(
      "IBAN Validate", "Validate an IBAN.", 0.054,
      "https://api.strale.io/x402/iban-validate",
      null, "GET", null,
      1,
    );
    const b = body as Record<string, unknown>;
    expect(b.x402Version).toBe(1);
    const entry = (b.accepts as Record<string, unknown>[])[0];
    expect(entry.network).toBe("base");
    expect(entry.maxAmountRequired).toBeDefined();
    expect(entry.amount).toBeUndefined();
    const parsed = parsePaymentRequired(b);
    expect(parsed.success).toBe(true);
  });

  it("defaults to the legacy-path setting (v1) when no version is passed", async () => {
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

  it("normalizes a v1 payload that echoed a CAIP-2 network off a v2 body", async () => {
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
