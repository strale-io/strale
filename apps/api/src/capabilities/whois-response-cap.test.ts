/**
 * WP12 batch 3 (CR-12): the WHOIS socket readers must stop at a byte cap.
 *
 * `whois-lookup` and `domain-age-check` open a raw TCP socket to a hardcoded
 * registry WHOIS server, write the domain, and appended every received chunk
 * to a string until the server closed the connection or ten seconds passed.
 * Plain TCP on port 43: anything on the path, or a registry that misbehaves,
 * chooses how many bytes that is. `whois-lookup` then pushes one array entry
 * per `Name Server:` / `Status:` line into its output, so the response size
 * was also the output size.
 *
 * ## How it is observed
 *
 * `node:net`'s `createConnection` is redirected to a loopback server (the
 * capabilities only ever name a hardcoded host, so the redirect is the only
 * way to put a test server behind them; nothing leaves loopback). The server
 * streams a real WHOIS header, then filler, and counts the bytes the CLIENT
 * actually took off the wire (write callbacks, with back-pressure). A reader
 * that stops at the cap closes the socket and the count stays near the cap
 * plus kernel buffering; an unbounded reader takes everything.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import type { AddressInfo } from "node:net";

const state = vi.hoisted(() => ({ port: 0 }));

vi.mock("../lib/safe-fetch.js", () => ({
  safeFetch: async () => new Response(JSON.stringify({ services: [] }), {
    headers: { "content-type": "application/json" },
  }),
  discardBody: async (response: Response) => response.body?.cancel(),
}));

vi.mock("node:net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:net")>();
  // The capabilities call createConnection(43, "whois.<registry>", onConnect).
  const redirected = (...args: unknown[]) => {
    const onConnect = args.find((a) => typeof a === "function") as (() => void) | undefined;
    return actual.createConnection(state.port, "127.0.0.1", onConnect);
  };
  return { ...actual, createConnection: redirected, default: { ...actual, createConnection: redirected } };
});

import "./whois-lookup.js";
import "./domain-age-check.js";
import { getExecutor } from "./index.js";

const HEADER =
  "Domain Name: EXAMPLE.COM\r\n" +
  "Registrar: Example Registrar, Inc.\r\n" +
  "Creation Date: 2001-02-03T04:05:06Z\r\n" +
  "Registry Expiry Date: 2099-02-03T04:05:06Z\r\n";
const FILLER_LINE = "Name Server: ns1.filler.example\r\n";
const TOTAL = 96 * 1024 * 1024;

let server: Server;
let flushed = 0;
let queries = 0;

beforeAll(async () => {
  server = createServer((socket: Socket) => {
    socket.on("error", () => undefined);
    socket.once("data", () => {
      queries++;
      const block = Buffer.from(FILLER_LINE.repeat(2048)); // ~64 KiB
      let sent = 0;
      const pump = () => {
        while (sent < TOTAL && !socket.destroyed) {
          const first = sent === 0;
          const buf = first ? Buffer.concat([Buffer.from(HEADER), block]) : block;
          sent += buf.length;
          const ok = socket.write(buf, (err) => {
            if (!err) flushed += buf.length;
          });
          if (!ok) {
            socket.once("drain", pump);
            return;
          }
        }
        if (!socket.destroyed) socket.end();
      };
      pump();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  state.port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

async function measure<T>(call: () => Promise<T>): Promise<{ result: T | null; flushedBytes: number }> {
  flushed = 0;
  const before = queries;
  const result = await call().catch(() => null);
  expect(queries, "the capability never reached the test server").toBe(before + 1);
  // Let the server observe the close before reading the counter.
  await new Promise((r) => setTimeout(r, 200));
  return { result, flushedBytes: flushed };
}

// The cap is 256 KiB; loopback socket buffers can hold a few MiB beyond it.
// Anything under a quarter of the stream proves the reader stopped early.
const BOUND = TOTAL / 4;

describe("WHOIS replies are read up to a cap, then the socket is closed", () => {
  it("whois-lookup stops reading and still returns the registry's header fields", async () => {
    const { result, flushedBytes } = await measure(() =>
      getExecutor("whois-lookup")!({ domain: "example.com" }),
    );
    expect(flushedBytes, `took ${(flushedBytes / 1048576).toFixed(0)} MiB of a ${TOTAL / 1048576} MiB reply`).toBeLessThan(BOUND);
    const out = (result as { output: Record<string, unknown> }).output;
    expect(out.registrar).toBe("Example Registrar, Inc.");
    expect(out.created).toBe("2001-02-03T04:05:06Z");
    // name_servers is built from one array entry per line of the reply.
    expect((out.name_servers as string[]).length).toBeLessThan(20_000);
  }, 30_000);

  it("domain-age-check stops reading and still returns the creation date", async () => {
    const { result, flushedBytes } = await measure(() =>
      getExecutor("domain-age-check")!({ domain: "example.com" }),
    );
    expect(flushedBytes, `took ${(flushedBytes / 1048576).toFixed(0)} MiB of a ${TOTAL / 1048576} MiB reply`).toBeLessThan(BOUND);
    const out = (result as { output: Record<string, unknown> }).output;
    expect(out.created_date).toBe("2001-02-03");
    expect(out.registrar).toBe("Example Registrar, Inc.");
  }, 30_000);
});
