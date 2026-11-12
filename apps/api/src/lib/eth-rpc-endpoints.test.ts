/**
 * The ENS executors' error classifier (promise-audit T1 wave 6 review).
 *
 * viem puts the full request URL in its error message, and Alchemy's URL
 * carries the API key in its path (`/v2/<key>`). Before this classifier the
 * ENS executors threw `ENS ... failed: ${err.message}`, so a customer-visible
 * error and the logs carried the production key.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ethRpcFailure, redactRpcSecrets } from "./eth-rpc-endpoints.js";
import { UpstreamUnavailableError } from "./upstream-result.js";

const KEY = "abcDEF123456ghiJKL";
const URL_WITH_KEY = `https://eth-mainnet.g.alchemy.com/v2/${KEY}`;

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.ALCHEMY_API_KEY;
  process.env.ALCHEMY_API_KEY = KEY;
});
afterEach(() => {
  if (saved === undefined) delete process.env.ALCHEMY_API_KEY;
  else process.env.ALCHEMY_API_KEY = saved;
});

/** The shape viem's HttpRequestError takes: status, plus the URL in the message. */
function viemHttpError(status: number | undefined, cause?: unknown): Error {
  const err = new Error(`HTTP request failed.\n\nStatus: ${status ?? "n/a"}\nURL: ${URL_WITH_KEY}\nRequest body: {"method":"eth_call"}`, { cause });
  if (status !== undefined) Object.assign(err, { status, url: URL_WITH_KEY });
  return err;
}

function everyText(err: Error): string {
  const parts: string[] = [];
  for (let e: unknown = err, d = 0; e && d < 8; e = (e as { cause?: unknown }).cause, d++) {
    parts.push(String((e as Error).message ?? e), JSON.stringify(e));
  }
  return parts.join("\n");
}

describe("ethRpcFailure", () => {
  it("REGRESSION: an HTTP failure becomes a typed outage that carries neither the key nor the URL", () => {
    const out = ethRpcFailure("Ethereum RPC", "ENS resolution failed", viemHttpError(503));
    expect(out).toBeInstanceOf(UpstreamUnavailableError);
    expect((out as UpstreamUnavailableError).code).toBe("HTTP 503");
    expect(everyText(out)).not.toContain(KEY);
    expect(everyText(out)).not.toContain("/v2/");
  });

  it("REGRESSION: a transport failure wrapped by viem becomes a typed outage without the key", () => {
    const transport = new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
    const out = ethRpcFailure("Ethereum RPC", "ENS resolution failed", viemHttpError(undefined, transport));
    expect(out).toBeInstanceOf(UpstreamUnavailableError);
    expect(everyText(out)).not.toContain(KEY);
  });

  it("REGRESSION: anything else keeps its message, with the key redacted", () => {
    const out = ethRpcFailure("Ethereum RPC", "ENS resolution failed", new Error(`execution reverted at ${URL_WITH_KEY}`));
    expect(out).not.toBeInstanceOf(UpstreamUnavailableError);
    expect(out.message).toMatch(/^ENS resolution failed: execution reverted/);
    expect(out.message).not.toContain(KEY);
  });
});

describe("redactRpcSecrets", () => {
  it("removes the key from an Alchemy path and anywhere else it appears", () => {
    expect(redactRpcSecrets(`GET ${URL_WITH_KEY}?x=1`)).toBe("GET https://eth-mainnet.g.alchemy.com/v2/[redacted]?x=1");
    expect(redactRpcSecrets(`key=${KEY}`)).toBe("key=[redacted]");
  });

  it("redacts an Alchemy path even when the env key is unset or different", () => {
    delete process.env.ALCHEMY_API_KEY;
    expect(redactRpcSecrets("https://base-mainnet.g.alchemy.com/v2/otherKey999")).toBe("https://base-mainnet.g.alchemy.com/v2/[redacted]");
  });
});
