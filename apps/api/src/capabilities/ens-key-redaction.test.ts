/**
 * REGRESSION (promise-audit T1 wave 6 review): an ENS failure never carries
 * the Alchemy key. viem puts the request URL in its error message, and the
 * key is in Alchemy's path (`/v2/<key>`); the executors used to throw
 * `... failed: ${err.message}`, which a caller and the logs could read.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "abcDEF123456ghiJKL";
const { failure } = vi.hoisted(() => ({ failure: { make: (): unknown => new Error("unset") } }));

vi.mock("viem", async (importOriginal) => {
  const real = await importOriginal<typeof import("viem")>();
  const reject = async () => {
    throw failure.make();
  };
  return {
    ...real,
    createPublicClient: () => new Proxy({}, { get: () => reject }),
  };
});

import { getDirectExecutor } from "./index.js";
import "./ens-resolve.js";
import "./ens-reverse-lookup.js";

let saved: string | undefined;
beforeAll(() => {
  saved = process.env.ALCHEMY_API_KEY;
  process.env.ALCHEMY_API_KEY = KEY;
});
afterAll(() => {
  if (saved === undefined) delete process.env.ALCHEMY_API_KEY;
  else process.env.ALCHEMY_API_KEY = saved;
});

const url = `https://eth-mainnet.g.alchemy.com/v2/${KEY}`;
const shapes: Record<string, () => unknown> = {
  http_503: () => Object.assign(new Error(`HTTP request failed.\n\nStatus: 503\nURL: ${url}`), { status: 503, url }),
  transport: () =>
    new Error(`HTTP request failed.\n\nURL: ${url}`, {
      cause: new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) }),
    }),
  other: () => new Error(`RPC Request failed.\n\nURL: ${url}\nDetails: execution reverted`),
};

function text(err: unknown): string {
  const out: string[] = [];
  for (let e = err, d = 0; e && d < 8; e = (e as { cause?: unknown }).cause, d++) out.push(String((e as Error).message), JSON.stringify(e));
  return out.join("\n");
}

describe.each([
  ["ens-resolve", { name: "vitalik.eth" }],
  ["ens-reverse-lookup", { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" }],
])("%s", (slug, input) => {
  beforeEach(() => vi.clearAllMocks());
  for (const [shape, make] of Object.entries(shapes)) {
    it(`a ${shape} failure throws without the key or the URL path`, async () => {
      failure.make = make;
      const err = await getDirectExecutor(slug)!(input).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(text(err)).not.toContain(KEY);
    });
  }
});
