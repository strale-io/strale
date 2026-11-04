/**
 * WP12 batch 2 (CR-11): the connect-time guard for raw sockets. The
 * capability-level rebinding test is capabilities/raw-socket-rebinding.test.ts;
 * these pin the helper's own rules. No socket here leaves the machine.
 */
import dns, { type LookupAddress } from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SSRF_BLOCKED, connectTcpVetted, connectTlsVetted, vettedLookup } from "./vetted-connect.js";

/** Make the callback dns.lookup answer `answer` for every name. */
function stubLookup(answer: LookupAddress[]) {
  return vi.spyOn(dns, "lookup").mockImplementation(((
    _host: string,
    _options: unknown,
    callback: (err: null, addresses: LookupAddress[]) => void,
  ) => {
    process.nextTick(() => callback(null, answer));
  }) as never);
}

function lookupAll(host: string): Promise<{ err: NodeJS.ErrnoException | null; addresses: unknown }> {
  return new Promise((resolve) =>
    vettedLookup(host, { all: true }, (err, addresses) => resolve({ err, addresses })),
  );
}

/** A plain TCP server on loopback that records how many bytes it receives. */
async function byteCountingServer() {
  let bytes = 0;
  let accepted = 0;
  const closed: Promise<void>[] = [];
  const server = net.createServer((sock) => {
    accepted++;
    closed.push(new Promise((r) => sock.on("close", () => r())));
    sock.on("data", (d) => { bytes += d.length; });
    sock.on("error", () => {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: (server.address() as net.AddressInfo).port,
    stats: async () => {
      await Promise.all(closed);
      return { bytes, accepted };
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("vettedLookup", () => {
  it.each([
    ["127.0.0.1", 4],
    ["169.254.169.254", 4],
    ["10.0.0.5", 4],
    ["fd00::1", 6],
    ["::ffff:127.0.0.1", 6],
  ])("refuses the whole answer when any address is blocked (%s among public ones)", async (bad, family) => {
    stubLookup([
      { address: "93.184.216.34", family: 4 },
      { address: bad, family },
      { address: "2606:4700::1111", family: 6 },
    ]);
    const { err } = await lookupAll("mixed.strale-test.example");
    expect(err?.code).toBe(SSRF_BLOCKED);
    expect(err?.message).toMatch(/restricted/);
  });

  it("hands the socket exactly the addresses it checked, from one resolution", async () => {
    const answer = [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700::1111", family: 6 },
    ];
    const spy = stubLookup(answer);
    const { err, addresses } = await lookupAll("public.strale-test.example");
    expect(err).toBeNull();
    expect(addresses).toEqual(answer);
    expect(spy).toHaveBeenCalledTimes(1);

    const single = await new Promise<unknown[]>((resolve) =>
      vettedLookup("public.strale-test.example", { family: 0 }, (...args) => resolve(args)),
    );
    expect(single).toEqual([null, "93.184.216.34", 4]);
  });

  it("passes an unresolvable name through as a lookup error", async () => {
    vi.spyOn(dns, "lookup").mockImplementation(((_h: string, _o: unknown, cb: (e: Error) => void) => {
      process.nextTick(() => cb(Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" })));
    }) as never);
    const { err } = await lookupAll("nx.strale-test.example");
    expect(err?.code).toBe("ENOTFOUND");
  });
});

describe("connect-time peer check", () => {
  // An IP-literal host never reaches `lookup`; the peer check is what stops it.
  it("connectTcpVetted refuses a blocked peer that bypassed the lookup", async () => {
    const srv = await byteCountingServer();
    try {
      const outcome = await connectTcpVetted({ host: "127.0.0.1", port: srv.port, timeoutMs: 2000 }).then(
        (socket) => { socket.destroy(); return "connected"; },
        (e: NodeJS.ErrnoException) => e.code,
      );
      expect(outcome).toBe(SSRF_BLOCKED);
    } finally {
      await srv.close();
    }
  });

  it("connectTlsVetted refuses a blocked peer before sending the ClientHello", async () => {
    const srv = await byteCountingServer();
    try {
      const err = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
        const socket = connectTlsVetted(
          { host: "127.0.0.1", port: srv.port, rejectUnauthorized: false },
          () => reject(new Error("handshake completed against a blocked peer")),
        );
        socket.on("error", resolve);
        socket.setTimeout(2000, () => {
          socket.destroy();
          reject(new Error("the blocked peer was not refused"));
        });
      });
      expect(err.code).toBe(SSRF_BLOCKED);
      const { accepted, bytes } = await srv.stats();
      expect(accepted).toBe(1); // TCP connected, then was refused...
      expect(bytes).toBe(0);    // ...before a single TLS byte was sent
    } finally {
      await srv.close();
    }
  });

  it("connectTlsVetted keeps the caller's servername and always uses the vetted lookup", async () => {
    stubLookup([{ address: "127.0.0.1", family: 4 }]);
    const spy = vi.spyOn(tls, "connect");
    const err = await new Promise<NodeJS.ErrnoException>((resolve) => {
      const socket = connectTlsVetted({
        host: "example.com",
        port: 443,
        servername: "example.com",
        rejectUnauthorized: false,
      });
      socket.on("error", resolve);
    });
    expect(err.code).toBe(SSRF_BLOCKED);
    const opts = spy.mock.calls[0][0] as tls.ConnectionOptions;
    expect(opts.servername).toBe("example.com");
    expect(opts.host).toBe("example.com");
    expect(opts.lookup).toBe(vettedLookup);
  });

  // The type omits these; an untyped caller or a cast must still not get through.
  it.each([
    ["lookup", { lookup: dns.lookup }],
    ["path", { path: "/tmp/strale-test.sock" }],
    ["socket", { socket: new net.Socket() }],
  ])("connectTlsVetted refuses a '%s' option that would bypass the guard", (key, extra) => {
    // If the refusal regresses, the connection that follows must still stay on loopback.
    stubLookup([{ address: "127.0.0.1", family: 4 }]);
    const spy = vi.spyOn(tls, "connect");
    expect(() =>
      connectTlsVetted({ host: "example.com", port: 443, ...extra } as unknown as Parameters<typeof connectTlsVetted>[0]),
    ).toThrow(new RegExp(`'${key}'`));
    expect(spy).not.toHaveBeenCalled();
  });
});
