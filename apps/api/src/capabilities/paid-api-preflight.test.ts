import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

vi.mock("../lib/url-validator.js", () => ({
  validateUrl: vi.fn(async () => undefined),
}));

import { getDirectExecutor } from "./index.js";
import "./paid-api-preflight.js";

const REQUIRED_OUTPUT_FIELDS = [
  "url",
  "is_reachable",
  "response_time_ms",
  "status_code",
  "ssl_valid",
  "payment_protocol",
  "payment_details",
  "payment_handshake_valid",
  "facilitator_reachable",
  "server",
  "recommendation",
  "issues",
] as const;

function expectRequiredFields(output: Record<string, unknown>): void {
  for (const field of REQUIRED_OUTPUT_FIELDS) {
    expect(output, `missing ${field}`).toHaveProperty(field);
  }
}

describe("paid-api-preflight output contract", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("declares every executor-owned field and the two nullable fields", () => {
    const file = resolve(import.meta.dirname, "../../../../manifests/paid-api-preflight.yaml");
    const manifest = yaml.load(readFileSync(file, "utf8")) as {
      output_schema: {
        required?: string[];
        properties: Record<string, { type?: string | string[]; enum?: string[] }>;
      };
    };
    const schema = manifest.output_schema;

    expect(new Set(schema.required)).toEqual(new Set(REQUIRED_OUTPUT_FIELDS));
    expect(schema.properties.facilitator_reachable.type).toEqual(["boolean", "null"]);
    expect(schema.properties.server.type).toEqual(["string", "null"]);
    expect(schema.properties.payment_protocol.enum).toEqual(["L402", "x402", "MPP", "unknown"]);
    expect(schema.properties.recommendation.enum).toEqual(["proceed", "caution", "avoid"]);
  });

  it("returns the complete contract for a reachable x402 endpoint", async () => {
    const paymentRequired = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            amount: "1000",
            payTo: "0x0000000000000000000000000000000000000001",
          },
        ],
      }),
    ).toString("base64");
    fetchMock.mockResolvedValue(
      new Response("{}", {
        status: 402,
        headers: { "payment-required": paymentRequired, server: "fixture" },
      }),
    );

    const exec = getDirectExecutor("paid-api-preflight")!;
    const result = await exec({ url: "https://seller.example/resource" });

    expectRequiredFields(result.output);
    expect(result.output).toMatchObject({
      is_reachable: true,
      status_code: 402,
      payment_protocol: "x402",
      payment_handshake_valid: true,
      facilitator_reachable: null,
      server: "fixture",
      recommendation: "proceed",
      issues: [],
    });
  });

  it("returns the complete contract when the target is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("fixture refused connection"));

    const exec = getDirectExecutor("paid-api-preflight")!;
    const result = await exec({ url: "https://offline.example/resource" });

    expectRequiredFields(result.output);
    expect(result.output).toMatchObject({
      is_reachable: false,
      status_code: 0,
      payment_protocol: "unknown",
      payment_handshake_valid: false,
      facilitator_reachable: null,
      server: null,
      recommendation: "avoid",
    });
    expect(result.output.issues).toEqual([
      "Unreachable: fixture refused connection",
    ]);
  });
});
