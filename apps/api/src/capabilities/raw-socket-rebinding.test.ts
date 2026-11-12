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
 * Each test also proves the refusal happened at connect time (the
 * connect-time resolver was asked, and the error is the connect-time one),
 * so a validateHost refusal cannot pass them.
 *
 * No test here leaves the machine: the only address a socket is ever given
 * is the loopback one, and the fixed code refuses it.
 */
import dns from "node:dns";
import net from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getExecutor } from "./index.js";
import "./port-check.js";
import "./ssl-check.js";
import "./ssl-certificate-chain.js";

const REBIND_HOST = "rebind.strale-test.example";
const PUBLIC_ANSWER = "93.184.216.34"; // what the validator is shown; never connected to
/** The connect-time refusal (lib/vetted-connect.ts); validateHost words its own differently. */
const CONNECT_TIME_REFUSAL = /Resolved host targets a restricted address/;

let server: net.Server;
let port = 0;
let connections = 0;
/** The connect-time resolver. A refusal that never called it came from validateHost. */
let connectTimeLookup: MockInstance;

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
  connectTimeLookup = vi.spyOn(dns, "lookup").mockImplementation(((
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

function askedAtConnectTime(host: string): boolean {
  return connectTimeLookup.mock.calls.some((call) => call[0] === host);
}

describe("raw-socket capabilities do not follow a rebound DNS answer (CR-11)", () => {
  it("port-check does not connect to the address a rebinding server answers at connect time and says why", async () => {
    // Before wave 2d this resolved, billed, with the port reported closed;
    // the refusal now fails the call (swallowed-failures audit, row 30).
    const err = await refusal(exec("port-check")({ host: REBIND_HOST, ports: [port], timeout_ms: 2000 }));
    expect(connections).toBe(0);
    expect(err.message).toMatch(CONNECT_TIME_REFUSAL);
    expect(askedAtConnectTime(REBIND_HOST)).toBe(true);
  });

  it("ssl-check does not connect to the rebound address and says why", async () => {
    const err = await refusal(exec("ssl-check")({ domain: REBIND_HOST, port }));
    expect(connections).toBe(0);
    expect(err.message).toMatch(CONNECT_TIME_REFUSAL);
    expect(askedAtConnectTime(REBIND_HOST)).toBe(true);
  });

  it("ssl-certificate-chain does not connect to the rebound address and says why", async () => {
    const err = await refusal(exec("ssl-certificate-chain")({ host: REBIND_HOST, port }));
    expect(connections).toBe(0);
    expect(err.message).toMatch(CONNECT_TIME_REFUSAL);
    expect(askedAtConnectTime(REBIND_HOST)).toBe(true);
  });
});

// `https://` passes the capabilities' non-empty check, strips down to "", and
// net/tls default an empty host to localhost. validateHost refuses it now.
describe("an input that strips to an empty host is refused before any socket opens", () => {
  it.each([
    ["ssl-check", { domain: "https://" }],
    ["ssl-check", { domain: "http:// " }],
    ["ssl-certificate-chain", { host: "https://" }],
    ["ssl-certificate-chain", { host: "https:///path" }],
  ])("%s %j", async (slug, input) => {
    const err = await refusal(exec(slug)({ ...input, port }));
    expect(connections).toBe(0);
    expect(err.message).toMatch(/host is required/i);
    expect(connectTimeLookup).not.toHaveBeenCalled();
  });
});
