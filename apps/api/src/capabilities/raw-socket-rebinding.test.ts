/**
 * WP12 batch 2 (CR-11): DNS rebinding against the raw-socket capabilities.
 *
 * validateHost resolves the name and checks the answer; the capability then
 * opened its socket with the *name*, and the socket resolved it again. A
 * rebinding DNS server answers a public address the first time and an
 * internal one the second, so the check and the connection saw different
 * addresses. Here the validation-time resolvers (dns/promises) answer a
 * public address and the connect-time resolver (callback dns.lookup, what
 * net.connect uses) answers 127.0.0.1, where a local server counts every
 * connection it receives.
 *
 * Before the fix each capability reached that server. After it, the
 * connect-time answer is checked before the socket opens, and nothing does.
 * No test here leaves the machine: the only address a socket is ever given
 * is the loopback one, and the fixed code refuses it.
 */
import dns from "node:dns";
import net from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getExecutor } from "./index.js";
import "./port-check.js";
import "./ssl-check.js";
import "./ssl-certificate-chain.js";

const REBIND_HOST = "rebind.strale-test.example";
const PUBLIC_ANSWER = "93.184.216.34"; // what the validator is shown; never connected to

let server: net.Server;
let port = 0;
let connections = 0;

beforeAll(async () => {
  server = net.createServer((sock) => {
    connections++;
    sock.destroy(); // not a TLS server: drop it so the client fails fast
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as net.AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  connections = 0;
  // Validation time: the rebinding server answers a public address.
  vi.spyOn(dns.promises, "resolve4").mockResolvedValue([PUBLIC_ANSWER]);
  vi.spyOn(dns.promises, "resolve6").mockRejectedValue(
    Object.assign(new Error("queryAaaa ENODATA"), { code: "ENODATA" }),
  );
  vi.spyOn(dns.promises, "lookup").mockResolvedValue([
    { address: PUBLIC_ANSWER, family: 4 },
  ] as never);
  // Connect time: it answers loopback.
  vi.spyOn(dns, "lookup").mockImplementation(((
    _host: string,
    options: unknown,
    callback?: (...args: unknown[]) => void,
  ) => {
    const cb = (typeof options === "function" ? options : callback) as (...args: unknown[]) => void;
    const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
    process.nextTick(() =>
      all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4),
    );
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function exec(slug: string) {
  const fn = getExecutor(slug);
  if (!fn) throw new Error(`no executor registered for ${slug}`);
  return fn;
}

/** The error a call rejects with; fails the test if it resolves. */
async function refusal(p: Promise<unknown>): Promise<Error> {
  return p.then(
    () => { throw new Error("expected the call to be refused, but it resolved"); },
    (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
  );
}

describe("raw-socket capabilities do not follow a rebound DNS answer (CR-11)", () => {
  it("port-check does not connect to the address a rebinding server answers at connect time", async () => {
    const result = (await exec("port-check")({ host: REBIND_HOST, ports: [port], timeout_ms: 2000 })) as {
      output: { open_count: number };
    };
    expect(connections).toBe(0);
    expect(result.output.open_count).toBe(0);
  });

  it("ssl-check does not connect to the rebound address and says why", async () => {
    const err = await refusal(exec("ssl-check")({ domain: REBIND_HOST, port }));
    expect(connections).toBe(0);
    expect(err.message).toMatch(/restricted/i);
  });

  it("ssl-certificate-chain does not connect to the rebound address and says why", async () => {
    const err = await refusal(exec("ssl-certificate-chain")({ host: REBIND_HOST, port }));
    expect(connections).toBe(0);
    expect(err.message).toMatch(/restricted/i);
  });
});
