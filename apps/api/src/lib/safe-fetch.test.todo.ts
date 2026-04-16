/**
 * Test placeholder for safe-fetch.ts (F-0-006).
 *
 * `.test.todo.ts` because vitest is not yet installed
 * (FIX_PHASE_A_verification.md Q3). Phase D flips this to `.test.ts`.
 *
 * Setup notes for when these run:
 *  - Most cases need a local HTTP server you control (to issue a 302
 *    redirect to a private IP). `http.createServer` is enough.
 *  - The DNS-rebinding case is awkward to reproduce in unit tests
 *    without a fake resolver; it's covered implicitly by asserting
 *    that `safeDispatcher` refuses a direct connection to a resolved
 *    private IP.
 */

/*
import { describe, it, expect } from "vitest";
import { safeFetch } from "./safe-fetch.js";
import { isBlockedIp } from "./url-validator.js";
import http from "node:http";
import { AddressInfo } from "node:net";

describe("safeFetch (F-0-006)", () => {
  it("rejects a URL whose hostname resolves to a private IP", async () => {
    // 127.0.0.1 is short-circuited inside isBlockedIp. A fresh server
    // bound to 127.0.0.1 is the cheapest way to reproduce.
    const srv = http.createServer((_req, res) => res.end("ok"));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const { port } = srv.address() as AddressInfo;
    try {
      await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(
        /restricted address/,
      );
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });

  it("refuses to follow a redirect to a private IP", async () => {
    // First server (on 0.0.0.0, public-ish via test host) returns a 302
    // with Location pointing at 127.0.0.1. safeFetch must validate the
    // redirect target and refuse, not blindly follow.
    //
    // Since bind is tricky in CI, the shape of the assertion is:
    //   const res = await safeFetch(publicRedirectUrl);
    //   expect.fail("should not reach here")
    // catch { expect(err.message).toMatch(/restricted/) }
    expect(true).toBe(true); // placeholder
  });

  it("throws after more than maxRedirects hops", async () => {
    // Chain of 4 302s should throw when maxRedirects = 3.
    expect(true).toBe(true); // placeholder
  });

  it("rejects file:// and data:", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(
      /scheme/i,
    );
    await expect(safeFetch("data:,hello")).rejects.toThrow(/scheme/i);
    await expect(safeFetch("javascript:alert(1)")).rejects.toThrow(
      /scheme/i,
    );
    await expect(safeFetch("gopher://example.com/")).rejects.toThrow(
      /scheme/i,
    );
  });

  it("isBlockedIp catches IPv4-mapped IPv6", () => {
    expect(isBlockedIp("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
    // Mapped-public should NOT be blocked.
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("isBlockedIp catches 100.64/10 carrier-grade NAT", () => {
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("100.127.255.254")).toBe(true);
    // Just outside the range:
    expect(isBlockedIp("100.128.0.1")).toBe(false);
    expect(isBlockedIp("100.63.255.254")).toBe(false);
  });

  it("isBlockedIp catches AWS metadata IPv6", () => {
    expect(isBlockedIp("fd00:ec2::254")).toBe(true);
    expect(isBlockedIp("fd00:ec2::1")).toBe(true);
  });
});
*/

export {};
