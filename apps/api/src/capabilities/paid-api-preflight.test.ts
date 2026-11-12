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
      ssl_valid: true,
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
    // No TLS connection completed, so validity is not claimed (follow-up 32).
    expect(result.output.ssl_valid).toBe(false);
  });
});

// Promise-audit T1 follow-up 32: ssl_valid used to be the URL's scheme alone,
// so an https URL whose certificate the runtime rejected, or that redirected
// to plain http, still read as ssl_valid: true.
describe("paid-api-preflight ssl_valid reflects the TLS connection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("is false, with the TLS code named, when the certificate is rejected", async () => {
    const failure = new TypeError("fetch failed", {
      cause: Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" }),
    });
    fetchMock.mockRejectedValue(failure);

    const exec = getDirectExecutor("paid-api-preflight")!;
    const result = await exec({ url: "https://expired.example/resource" });

    expect(result.output.ssl_valid).toBe(false);
    expect(result.output.recommendation).toBe("avoid");
    expect(result.output.issues).toContain("TLS certificate rejected: CERT_HAS_EXPIRED");
  });

  it("is false when an https URL redirects to plain http", async () => {
    const res = new Response("{}", { status: 200 });
    Object.defineProperty(res, "url", { value: "http://plain.example/resource" });
    fetchMock.mockResolvedValue(res);

    const exec = getDirectExecutor("paid-api-preflight")!;
    const result = await exec({ url: "https://seller.example/resource" });

    expect(result.output.is_reachable).toBe(true);
    expect(result.output.ssl_valid).toBe(false);
    expect(result.output.recommendation).toBe("avoid");
    expect(result.output.issues).toContain("Redirected from HTTPS to plain HTTP");
  });

  it("does not read a timeout or DNS failure as a certificate problem", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) }),
    );

    const exec = getDirectExecutor("paid-api-preflight")!;
    const result = await exec({ url: "https://missing.example/resource" });

    expect(result.output.ssl_valid).toBe(false);
    expect((result.output.issues as string[]).some((i) => i.startsWith("TLS"))).toBe(false);
  });
});
