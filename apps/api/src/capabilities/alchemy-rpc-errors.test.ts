/**
 * REGRESSION (promise-audit T1 follow-up 33): Alchemy's provider failures are
 * typed, unbilled UpstreamUnavailableErrors, and the chain's own answers stay
 * what they were.
 *
 * - Alchemy answers a rejected key with HTTP 401/403 and a JSON-RPC body
 *   (code -32600, "Must be authenticated!"); viem surfaces that as an
 *   InvalidRequestRpcError with no HTTP status, so it was a plain error and
 *   never read as auth_expired by the breaker.
 * - Alchemy sends its rate limit as a JSON 429 or as an HTTP 200 carrying
 *   code 429 ("exceeded its compute units per second capacity"); both were
 *   untyped.
 * - ens-resolve swallowed every avatar failure, so a provider failure on the
 *   third read was billed with avatar_url null.
 *
 * A contract revert stays a plain error (and "no avatar") whatever its text.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  InvalidRequestRpcError,
  RpcRequestError,
} from "viem";

const KEY = "abcDEF123456ghiJKL";
const URL_WITH_KEY = `https://eth-mainnet.g.alchemy.com/v2/${KEY}`;

const { calls } = vi.hoisted(() => ({ calls: { text: (): Promise<unknown> => Promise.resolve("") } }));

vi.mock("viem", async (importOriginal) => {
  const real = await importOriginal<typeof import("viem")>();
  return {
    ...real,
    createPublicClient: () => ({
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName === "resolver") return "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63";
        if (functionName === "addr") return "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
        return calls.text();
      },
    }),
  };
});

import { getDirectExecutor } from "./index.js";
import "./ens-resolve.js";
import "./gas-price-check.js";
import { ethRpcFailure, jsonRpcUnavailable } from "../lib/eth-rpc-endpoints.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { outcomeFromError, assertBillableOutput } from "../lib/execution-outcome.js";
import { categorizeFailureReason } from "../lib/trust-helpers.js";

let saved: string | undefined;
beforeAll(() => {
  saved = process.env.ALCHEMY_API_KEY;
  process.env.ALCHEMY_API_KEY = KEY;
});
afterAll(() => {
  if (saved === undefined) delete process.env.ALCHEMY_API_KEY;
  else process.env.ALCHEMY_API_KEY = saved;
});

/** viem's shape for a JSON-RPC error body, wrapped as readContract wraps it. */
const rpcBody = (code: number, message: string) =>
  new RpcRequestError({ body: { method: "eth_call" }, error: { code, message }, url: URL_WITH_KEY });
const asContractCall = (cause: Error) =>
  new ContractFunctionExecutionError(cause as never, { abi: [], functionName: "text", contractAddress: "0x0000000000000000000000000000000000000001" });

function text(err: unknown): string {
  const out: string[] = [];
  for (let e = err, d = 0; e && d < 8; e = (e as { cause?: unknown }).cause, d++) out.push(String((e as Error).message));
  return out.join("\n");
}

function expectUnbilled(err: unknown, status: number): UpstreamUnavailableError {
  expect(err).toBeInstanceOf(UpstreamUnavailableError);
  expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
  expect((err as Error).message).toContain(String(status));
  expect(text(err)).not.toContain(KEY);
  return err as UpstreamUnavailableError;
}

describe("ethRpcFailure: JSON-RPC error bodies (viem, no HTTP status)", () => {
  it("a rejected key (HTTP 401 with code -32600) is a 401 the breaker reads as auth_expired", () => {
    const err = expectUnbilled(ethRpcFailure("Ethereum RPC", "ENS failed", asContractCall(new InvalidRequestRpcError(rpcBody(-32600, "Must be authenticated!")))), 401);
    expect(err.retryable).toBe(false);
    expect(categorizeFailureReason(err.message)).toBe("auth_expired");
  });

  it("an origin not on the key's allowlist (HTTP 403) is a 403", () => {
    expectUnbilled(ethRpcFailure("Ethereum RPC", "ENS failed", asContractCall(new InvalidRequestRpcError(rpcBody(-32600, "Unspecified origin not on whitelist.")))), 403);
  });

  it.each([
    ["a JSON 429 body", 429, "Your app has exceeded its compute units per second capacity."],
    ["code -32005", -32005, "request limit reached"],
  ])("%s is a retryable 429", (_label, code, message) => {
    const err = expectUnbilled(ethRpcFailure("Ethereum RPC", "ENS failed", asContractCall(rpcBody(code, message))), 429);
    expect(err.retryable).toBe(true);
  });

  it.each([
    ["a revert whose reason mentions a rate limit", () => new ContractFunctionRevertedError({ abi: [], functionName: "text", message: "rate limit exceeded" })],
    ["an execution-reverted body (code 3) that says the limit was exceeded", () => rpcBody(3, "execution reverted: exceeded")],
    ["an unrelated JSON-RPC error", () => rpcBody(-32602, "invalid argument 0")],
  ])("%s stays a plain error, without the key", (_label, make) => {
    const err = ethRpcFailure("Ethereum RPC", "ENS failed", asContractCall(make()));
    expect(err).not.toBeInstanceOf(UpstreamUnavailableError);
    expect(err.message).toMatch(/^ENS failed: /);
    expect(text(err)).not.toContain(KEY);
    expect(text(err)).not.toContain("alchemy.com/v2");
  });

  it("the classifier leaves bare 'exceeded' alone", () => {
    expect(jsonRpcUnavailable("x", -32000, "gas required exceeds allowance")).toBeNull();
  });
});

describe("ens-resolve: a failed avatar read is not billed as 'no avatar'", () => {
  beforeEach(() => vi.clearAllMocks());
  const resolve = () => getDirectExecutor("ens-resolve")!({ name: "vitalik.eth" });

  it("a rejected key on the avatar read throws, unbilled", async () => {
    calls.text = () => Promise.reject(asContractCall(new InvalidRequestRpcError(rpcBody(-32600, "Must be authenticated!"))));
    expectUnbilled(await resolve().catch((e: unknown) => e), 401);
  });

  it("a rate limit on the avatar read throws, unbilled and retryable", async () => {
    calls.text = () => Promise.reject(asContractCall(rpcBody(429, "Your app has exceeded its compute units per second capacity.")));
    const err = expectUnbilled(await resolve().catch((e: unknown) => e), 429);
    expect(err.retryable).toBe(true);
  });

  it.each([
    ["reverts", () => asContractCall(new ContractFunctionRevertedError({ abi: [], functionName: "text", message: "rate limit" }))],
    ["returns no data", () => asContractCall(new ContractFunctionZeroDataError({ functionName: "text" }))],
  ])("a resolver whose text() %s has no avatar, billed", async (_label, make) => {
    calls.text = () => Promise.reject(make());
    const { output } = (await resolve()) as { output: Record<string, unknown> };
    expect(output).toMatchObject({ resolved: true, avatar_url: null });
    expect(() => assertBillableOutput("ens-resolve", output)).not.toThrow();
  });

  it("an avatar record is returned", async () => {
    calls.text = () => Promise.resolve("https://example.test/a.png");
    const { output } = (await resolve()) as { output: Record<string, unknown> };
    expect(output.avatar_url).toBe("https://example.test/a.png");
  });
});

describe("alchemyRpc (gas-price-check): provider failures are typed", () => {
  const realFetch = globalThis.fetch;
  afterAll(() => {
    globalThis.fetch = realFetch;
  });
  const respond = (body: unknown, status = 200) => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    ) as typeof fetch;
  };
  const gas = () => getDirectExecutor("gas-price-check")!({ chain_id: "1" });

  it("HTTP 401 with a JSON-RPC body is a 401", async () => {
    respond({ jsonrpc: "2.0", id: 1, error: { code: -32600, message: "Must be authenticated!" } }, 401);
    const err = expectUnbilled(await gas().catch((e: unknown) => e), 401);
    expect(categorizeFailureReason(err.message)).toBe("auth_expired");
  });

  it.each([
    ["a JSON 429", 429],
    ["an HTTP 200 carrying code 429", 200],
  ])("%s is a retryable 429", async (_label, status) => {
    respond({ jsonrpc: "2.0", id: 1, error: { code: 429, message: "Your app has exceeded its compute units per second capacity." } }, status);
    const err = expectUnbilled(await gas().catch((e: unknown) => e), 429);
    expect(err.retryable).toBe(true);
  });

  it("an HTTP 503 is a retryable 503", async () => {
    respond({}, 503);
    expect(expectUnbilled(await gas().catch((e: unknown) => e), 503).retryable).toBe(true);
  });

  it("a timeout is typed, unbilled", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as typeof fetch;
    const err = await gas().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(outcomeFromError(err)).toMatchObject({ billable: false });
  });

  it("a fetch error that quotes the request URL does not carry the key", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError(`Failed to parse URL from ${URL_WITH_KEY}`);
    }) as typeof fetch;
    const err = await gas().catch((e: unknown) => e);
    expect(text(err)).not.toContain(KEY);
    expect((err as Error).message).toContain("alchemy.com/v2/[redacted]");
  });

  it("an ordinary JSON-RPC error stays a plain error", async () => {
    respond({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "invalid argument 0" } });
    const err = await gas().catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(UpstreamUnavailableError);
    expect((err as Error).message).toContain("invalid argument 0");
  });
});
