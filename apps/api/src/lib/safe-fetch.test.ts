/**
 * Tests for safe-fetch.ts (F-0-006).
 *
 * safeFetch has three defensive layers:
 *   1. Scheme rejection          → validateUrl
 *   2. Literal private-IP refusal → validateUrl + isBlockedIp
 *   3. Redirect-follow re-validation + hop cap → safeFetch's own loop
 *
 * Layers 1 and 2 are exercised directly below. Layer 3's loop mechanics
 * are covered via a smaller helper `followRedirects` that safe-fetch
 * exports for this exact reason — trying to reach the loop through
 * `safeFetch` requires bypassing validateUrl, which vi.mock can do only
 * with complex module-reset choreography. The helper test proves the
 * loop logic; end-to-end layering is self-evident from reading safeFetch.
 *
 * The "DNS rebinding is refused by the undici Dispatcher" property is
 * covered transitively by `url-validator.test.ts`'s direct coverage of
 * `isBlockedIp` — the dispatcher's `safeLookup` calls the exact same
 * blocklist.
 */

import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { safeFetch, followRedirects } from "./safe-fetch.js";

const servers: http.Server[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const s = servers.pop()!;
    await new Promise<void>((r) => s.close(() => r()));
  }
});

function startServer(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      servers.push(srv);
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

// ── Suite 1: scheme rejection ────────────────────────────────────────────────
describe("safeFetch — scheme rejection (F-0-006)", () => {
  it("rejects file://", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(/scheme/i);
  });

  it("rejects gopher://", async () => {
    await expect(safeFetch("gopher://example.com/")).rejects.toThrow(/scheme/i);
  });

  it("rejects javascript:", async () => {
    await expect(safeFetch("javascript:alert(1)")).rejects.toThrow(/scheme/i);
  });

  it("rejects data:", async () => {
    await expect(safeFetch("data:text/plain,hi")).rejects.toThrow(/scheme/i);
  });
});

// ── Suite 2: literal private-IP refusal ──────────────────────────────────────
describe("safeFetch — literal private-IP refusal (F-0-006)", () => {
  it("rejects loopback 127.0.0.1", async () => {
    await expect(safeFetch("http://127.0.0.1:1/")).rejects.toThrow(/restricted/);
  });

  it("rejects IPv4-mapped IPv6 private host", async () => {
    await expect(safeFetch("http://[::ffff:10.0.0.1]/")).rejects.toThrow(
      /restricted/,
    );
  });

  it("rejects cloud metadata IP", async () => {
    await expect(
      safeFetch("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toThrow(/restricted/);
  });
});

// ── Suite 3: redirect-follow mechanics (via followRedirects helper) ──────────
describe("followRedirects — loop mechanics (F-0-006)", () => {
  it("follows a short chain and returns the final 200 response", async () => {
    const base = await startServer((req, res) => {
      if (req.url === "/start") {
        res.statusCode = 302;
        res.setHeader("location", "/end");
        res.end();
      } else {
        res.statusCode = 200;
        res.end("final");
      }
    });
    // Use a stub validator so the test server's loopback host is
    // accepted. The real `validateUrl` would refuse 127.0.0.1 — that
    // rejection is covered by the suites above.
    const response = await followRedirects(
      `${base}/start`,
      {},
      3,
      async () => {}, // stub validator
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("final");
  });

  it("throws when more than maxRedirects hops are required", async () => {
    const base = await startServer((req, res) => {
      const next: Record<string, string> = {
        "/a": "/b",
        "/b": "/c",
        "/c": "/d",
        "/d": "/e",
      };
      const loc = next[req.url ?? ""];
      if (loc) {
        res.statusCode = 302;
        res.setHeader("location", loc);
        res.end();
      } else {
        res.statusCode = 200;
        res.end("arrived");
      }
    });
    await expect(
      followRedirects(`${base}/a`, {}, 3, async () => {}),
    ).rejects.toThrow(/Too many redirects/);
  });

  it("refuses a redirect whose Location is a blocked URL (re-validation happens per hop)", async () => {
    let callCount = 0;
    const validator = async (u: string) => {
      callCount++;
      // Accept the initial hop, refuse anything that looks like a
      // loopback target on subsequent hops.
      if (callCount > 1 && /127\.0\.0\.1|::1|localhost/.test(u)) {
        throw new Error("This URL targets a restricted address.");
      }
    };
    const base = await startServer((req, res) => {
      if (req.url === "/out") {
        res.statusCode = 302;
        res.setHeader("location", "http://127.0.0.1:1/");
        res.end();
      } else {
        res.statusCode = 200;
        res.end();
      }
    });
    await expect(
      followRedirects(`${base}/out`, {}, 3, validator),
    ).rejects.toThrow(/restricted/);
  });

  it("returns the response as-is when it's a redirect without a Location header", async () => {
    const base = await startServer((_req, res) => {
      res.statusCode = 302; // No Location header — spec-violating but possible.
      res.end();
    });
    const response = await followRedirects(
      `${base}/`,
      {},
      3,
      async () => {},
    );
    expect(response.status).toBe(302);
  });
});
