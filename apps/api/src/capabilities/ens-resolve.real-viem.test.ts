/**
 * REGRESSION (promise-audit T1 follow-up 33): ens-resolve driven through real
 * viem over a stubbed network, so the error chains below are the ones viem
 * itself builds, not hand-made copies.
 *
 * - A name whose resolver hands the lookup to an offchain (CCIP-read,
 *   EIP-3668) gateway: viem wraps the gateway's HTTP 401 as an
 *   OffchainLookupError over an HttpRequestError with status 401. Read as
 *   Alchemy's, it was a 401 the breaker files as auth_expired on Alchemy, and
 *   on the avatar read it was swallowed as "no avatar" on a billed call. It is
 *   the target's: unbilled, never counted, and the gateway's URL is not in the
 *   message.
 * - A gateway answer that is not hex will not change on a retry.
 * - A provider failure on the callback call that hands the gateway's answer
 *   back to the resolver stays the provider's.
 * - viem wraps a JSON-RPC internal error (-32603) as
 *   ContractFunctionRevertedError. One that does not say it reverted is the
 *   provider failing, retryable, not "no avatar"; one that says
 *   "execution reverted" is still the contract's answer.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeErrorResult, toFunctionSelector, type Hex } from "viem";

import { getDirectExecutor } from "./index.js";
import "./ens-resolve.js";
import { ENS_OFFCHAIN_GATEWAY } from "../lib/eth-rpc-endpoints.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { assertBillableOutput, outcomeFromError, shouldCountAgainstCapability } from "../lib/execution-outcome.js";

const KEY = "abcDEF123456ghiJKL";
const RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63";
const OWNER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const GATEWAY = "https://gateway.example.test/lookup/{sender}/{data}.json";

const SEL = {
  resolver: toFunctionSelector("resolver(bytes32)"),
  addr: toFunctionSelector("addr(bytes32)"),
  text: toFunctionSelector("text(bytes32,string)"),
  callback: "0x12345678",
};

const offchainLookup = (sender: string = RESOLVER) =>
  encodeErrorResult({
    abi: [
      {
        type: "error",
        name: "OffchainLookup",
        inputs: [
          { name: "sender", type: "address" },
          { name: "urls", type: "string[]" },
          { name: "callData", type: "bytes" },
          { name: "callbackFunction", type: "bytes4" },
          { name: "extraData", type: "bytes" },
        ],
      },
    ],
    errorName: "OffchainLookup",
    args: [sender as Hex, [GATEWAY], "0xabcdef", SEL.callback as Hex, "0x"],
  });

type RpcAnswer = { result: Hex } | { error: { code: number; message: string; data?: Hex } } | { status: number };
const address = (a: string): RpcAnswer => ({ result: encodeAbiParameters([{ type: "address" }], [a as Hex]) });
const string = (s: string): RpcAnswer => ({ result: encodeAbiParameters([{ type: "string" }], [s]) });
const revertWith = (data: Hex): RpcAnswer => ({ error: { code: 3, message: "execution reverted", data } });

/** What the stubbed Alchemy answers per call selector, and what the gateway answers. */
let rpc: Record<string, () => RpcAnswer>;
let gateway: () => Response;
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://gateway.example.test/")) return gateway();
  const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: [{ data: Hex }] };
  const answer = (rpc[body.params[0].data.slice(0, 10)] ?? (() => ({ error: { code: -32602, message: "unexpected call" } })))();
  if ("status" in answer) return new Response("", { status: answer.status });
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...answer }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

const realFetch = globalThis.fetch;
let savedKey: string | undefined;
beforeAll(() => {
  savedKey = process.env.ALCHEMY_API_KEY;
  process.env.ALCHEMY_API_KEY = KEY;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  if (savedKey === undefined) delete process.env.ALCHEMY_API_KEY;
  else process.env.ALCHEMY_API_KEY = savedKey;
});
beforeEach(() => {
  fetchMock.mockClear();
  rpc = { [SEL.resolver]: () => address(RESOLVER), [SEL.addr]: () => address(OWNER), [SEL.text]: () => string("") };
  gateway = () => new Response("", { status: 500 });
});

const resolve = () => getDirectExecutor("ens-resolve")!({ name: "vitalik.eth" });
const failure = () =>
  resolve().then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e as UpstreamUnavailableError,
  );

function chainText(err: unknown): string {
  const out: string[] = [];
  for (let e = err, d = 0; e && d < 10; e = (e as { cause?: unknown }).cause, d++) out.push(String((e as Error).message));
  return out.join("\n");
}

/** The name's own gateway failed: unbilled, never counted, no gateway URL or key anywhere. */
function expectGatewayFailure(err: UpstreamUnavailableError) {
  expect(err).toBeInstanceOf(UpstreamUnavailableError);
  expect(err.message).toContain(ENS_OFFCHAIN_GATEWAY);
  expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "target", counts_against_capability: false });
  expect(shouldCountAgainstCapability(err)).toBe(false);
  expect(chainText(err)).not.toContain("gateway.example.test");
  expect(chainText(err)).not.toContain(KEY);
}

describe("ens-resolve failure: an offchain gateway's failure is the name's, not Alchemy's", () => {
  it.each([
    ["the address read", "addr"],
    ["the avatar read", "text"],
  ] as const)("a gateway HTTP 401 on %s throws as the target's, not retryable", async (_label, step) => {
    rpc[SEL[step]] = () => revertWith(offchainLookup());
    gateway = () => new Response(JSON.stringify({ error: "unauthorised" }), { status: 401, headers: { "content-type": "application/json" } });
    const err = await failure();
    expectGatewayFailure(err);
    expect(err.message).toContain("HTTP 401");
    expect(err.retryable).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("https://gateway.example.test/"))).toBe(true);
  });

  it("a gateway HTTP 503 is the target's, retryable", async () => {
    rpc[SEL.addr] = () => revertWith(offchainLookup());
    gateway = () => new Response("", { status: 503 });
    const err = await failure();
    expectGatewayFailure(err);
    expect(err.retryable).toBe(true);
  });

  it("a gateway that cannot be reached is the target's, retryable", async () => {
    rpc[SEL.addr] = () => revertWith(offchainLookup());
    gateway = () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    };
    const err = await failure();
    expectGatewayFailure(err);
    expect(err.retryable).toBe(true);
  });

  it("a gateway answer that is not hex is the target's, not retryable", async () => {
    rpc[SEL.addr] = () => revertWith(offchainLookup());
    gateway = () => new Response(JSON.stringify({ data: "not hex" }), { status: 200, headers: { "content-type": "application/json" } });
    const err = await failure();
    expectGatewayFailure(err);
    expect(err.retryable).toBe(false);
  });

  it("a lookup naming another contract as sender is the target's, not retryable", async () => {
    rpc[SEL.addr] = () => revertWith(offchainLookup("0x0000000000000000000000000000000000000001"));
    const err = await failure();
    expectGatewayFailure(err);
    expect(err.retryable).toBe(false);
  });

  it("the resolver rejecting its gateway's answer is the target's, not retryable", async () => {
    rpc[SEL.addr] = () => revertWith(offchainLookup());
    gateway = () => new Response(JSON.stringify({ data: "0x1234" }), { status: 200, headers: { "content-type": "application/json" } });
    rpc[SEL.callback] = () => revertWith("0x");
    const err = await failure();
    expectGatewayFailure(err);
    expect(err.retryable).toBe(false);
  });

  it("an Alchemy rate limit on the callback call stays Alchemy's 429, counted and retryable", async () => {
    rpc[SEL.addr] = () => revertWith(offchainLookup());
    gateway = () => new Response(JSON.stringify({ data: "0x1234" }), { status: 200, headers: { "content-type": "application/json" } });
    rpc[SEL.callback] = () => ({ status: 429 });
    const err = await failure();
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(err.message).not.toContain(ENS_OFFCHAIN_GATEWAY);
    expect(err.message).toContain("429");
    expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "provider" });
    expect(err.retryable).toBe(true);
    expect(chainText(err)).not.toContain(KEY);
  });

  it("negative: a gateway that answers resolves the name, billed", async () => {
    rpc[SEL.addr] = () => revertWith(offchainLookup());
    gateway = () => new Response(JSON.stringify({ data: "0x1234" }), { status: 200, headers: { "content-type": "application/json" } });
    rpc[SEL.callback] = () => address(OWNER);
    const { output } = (await resolve()) as { output: Record<string, unknown> };
    expect(output).toMatchObject({ resolved: true, address: OWNER });
    expect(() => assertBillableOutput("ens-resolve", output)).not.toThrow();
  });
});

describe("ens-resolve: the EVM stopping the avatar contract is the contract's answer (follow-up 33 review)", () => {
  it.each([
    ["out of gas", { code: -32000, message: "out of gas" }],
    ["an invalid opcode", { code: -32000, message: "invalid opcode: INVALID" }],
    ["a stack underflow", { code: -32015, message: "VM execution error: stack underflow" }],
  ] as const)("negative: %s on the avatar read is no avatar, billed", async (_label, error) => {
    rpc[SEL.text] = () => ({ error: { ...error } });
    const { output } = (await resolve()) as { output: Record<string, unknown> };
    expect(output).toMatchObject({ resolved: true, address: OWNER, avatar_url: null });
    expect(() => assertBillableOutput("ens-resolve", output)).not.toThrow();
  });
});

describe("ens-resolve: a callback that hands off to a second gateway is classified by that lookup (follow-up 33 review)", () => {
  it("the second gateway's HTTP 401 is the target's, not retryable", async () => {
    let gatewayCalls = 0;
    rpc[SEL.addr] = () => revertWith(offchainLookup());
    rpc[SEL.callback] = () => revertWith(offchainLookup());
    gateway = () => {
      gatewayCalls++;
      return gatewayCalls === 1
        ? new Response(JSON.stringify({ data: "0x1234" }), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify({ error: "unauthorised" }), { status: 401, headers: { "content-type": "application/json" } });
    };
    const err = await failure();
    expect(gatewayCalls).toBe(2);
    expectGatewayFailure(err);
    expect(err.message).toContain("HTTP 401");
    expect(err.retryable).toBe(false);
  });

  it("an Alchemy rate limit on the second callback stays Alchemy's 429, retryable", async () => {
    let callbacks = 0;
    rpc[SEL.addr] = () => revertWith(offchainLookup());
    rpc[SEL.callback] = () => (++callbacks === 1 ? revertWith(offchainLookup()) : { status: 429 });
    gateway = () => new Response(JSON.stringify({ data: "0x1234" }), { status: 200, headers: { "content-type": "application/json" } });
    const err = await failure();
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(err.message).not.toContain(ENS_OFFCHAIN_GATEWAY);
    expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "provider" });
    expect(err.retryable).toBe(true);
  });
});

describe("ens-resolve failure: an internal error (-32603) on the avatar read is the provider's", () => {
  it("one that does not say it reverted throws, unbilled and retryable", async () => {
    rpc[SEL.text] = () => ({ error: { code: -32603, message: "internal error" } });
    const err = await failure();
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(err.message).toContain("-32603");
    expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "provider" });
    expect(err.retryable).toBe(true);
    expect(chainText(err)).not.toContain(KEY);
  });

  it("negative: one that says it reverted is the contract's answer, no avatar, billed", async () => {
    rpc[SEL.text] = () => ({ error: { code: -32603, message: "execution reverted" } });
    const { output } = (await resolve()) as { output: Record<string, unknown> };
    expect(output).toMatchObject({ resolved: true, avatar_url: null });
    expect(() => assertBillableOutput("ens-resolve", output)).not.toThrow();
  });

  it("negative: a code-3 revert whose reason mentions a rate limit is no avatar, billed", async () => {
    rpc[SEL.text] = () => ({ error: { code: 3, message: "execution reverted: rate limit exceeded", data: "0x" } });
    const { output } = (await resolve()) as { output: Record<string, unknown> };
    expect(output).toMatchObject({ resolved: true, avatar_url: null });
  });
});
