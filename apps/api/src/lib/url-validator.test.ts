/**
 * Tests for url-validator.ts (F-0-006 hardening).
 *
 * Pure-function coverage for `isBlockedIp` against the bypass classes
 * added in Fix 3a: IPv4-mapped IPv6, carrier-grade NAT, cloud metadata
 * IPv6. Also covers the scheme-allowlist branch of `validateUrl`.
 *
 * `validateUrl` for hostnames that need DNS resolution depends on the
 * live resolver and is not deterministic in CI — those cases belong in
 * safe-fetch.test.ts with a local HTTP server, not here.
 */

import { describe, it, expect } from "vitest";
import { isBlockedIp, validateUrl } from "./url-validator.js";

describe("isBlockedIp — original ranges (regression)", () => {
  it("blocks IPv4 loopback", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("127.5.5.5")).toBe(true);
  });

  it("blocks IPv4 private ranges (10/8, 192.168/16, 172.16/12)", () => {
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("172.31.255.254")).toBe(true);
    // Boundary: 172.32 is NOT private.
    expect(isBlockedIp("172.32.0.1")).toBe(false);
    expect(isBlockedIp("172.15.0.1")).toBe(false);
  });

  it("blocks link-local 169.254/16 (includes cloud metadata v4)", () => {
    expect(isBlockedIp("169.254.169.254")).toBe(true);
  });

  it("blocks IPv6 loopback and unique-local", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
    expect(isBlockedIp("fd12:3456:789a::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
  });

  it("blocks unspecified addresses", () => {
    expect(isBlockedIp("0.0.0.0")).toBe(true);
    expect(isBlockedIp("::")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("1.1.1.1")).toBe(false);
    expect(isBlockedIp("93.184.216.34")).toBe(false); // example.com-ish
  });
});

describe("isBlockedIp — F-0-006 bypass-class hardening", () => {
  describe("IPv4-mapped IPv6 (::ffff:...)", () => {
    it("blocks when mapping a loopback v4", () => {
      expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    });

    it("blocks when mapping a private v4", () => {
      expect(isBlockedIp("::ffff:10.0.0.1")).toBe(true);
      expect(isBlockedIp("::ffff:192.168.1.1")).toBe(true);
      expect(isBlockedIp("::ffff:172.16.0.1")).toBe(true);
    });

    it("blocks when mapping cloud metadata v4", () => {
      expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
    });

    it("allows when mapping a public v4", () => {
      expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
    });
  });

  describe("Carrier-grade NAT 100.64.0.0/10", () => {
    it("blocks 100.64.*.* boundary", () => {
      expect(isBlockedIp("100.64.0.0")).toBe(true);
      expect(isBlockedIp("100.64.1.1")).toBe(true);
    });

    it("blocks upper boundary 100.127.255.255", () => {
      expect(isBlockedIp("100.127.255.254")).toBe(true);
      expect(isBlockedIp("100.127.0.0")).toBe(true);
    });

    it("allows addresses outside the 100.64/10 range", () => {
      expect(isBlockedIp("100.63.255.254")).toBe(false);
      expect(isBlockedIp("100.128.0.1")).toBe(false);
      expect(isBlockedIp("100.0.0.1")).toBe(false);
    });
  });

  describe("AWS metadata IPv6", () => {
    it("blocks fd00:ec2::254", () => {
      expect(isBlockedIp("fd00:ec2::254")).toBe(true);
    });

    it("blocks other fd00:ec2:* addresses", () => {
      expect(isBlockedIp("fd00:ec2::1")).toBe(true);
      expect(isBlockedIp("fd00:ec2:1:2::ff")).toBe(true);
    });
  });
});

describe("validateUrl scheme allowlist (F-0-006)", () => {
  it("rejects file:// URLs", async () => {
    await expect(validateUrl("file:///etc/passwd")).rejects.toThrow(/scheme/i);
  });

  it("rejects gopher://", async () => {
    await expect(validateUrl("gopher://example.com/")).rejects.toThrow(/scheme/i);
  });

  it("rejects ftp://", async () => {
    await expect(validateUrl("ftp://example.com/")).rejects.toThrow(/scheme/i);
  });

  it("rejects javascript:", async () => {
    await expect(validateUrl("javascript:alert(1)")).rejects.toThrow(/scheme/i);
  });

  it("rejects data:", async () => {
    await expect(validateUrl("data:text/plain,hi")).rejects.toThrow(/scheme/i);
  });

  it("accepts http:// with a public-resolvable hostname", async () => {
    // example.com resolves to a public IP in every sane resolver.
    await expect(validateUrl("http://example.com/")).resolves.toBeUndefined();
  });

  it("accepts https:// with a public-resolvable hostname", async () => {
    await expect(validateUrl("https://example.com/")).resolves.toBeUndefined();
  });
});

describe("validateUrl direct-IP refusal (F-0-006)", () => {
  it("rejects a URL whose host is a literal loopback IP", async () => {
    await expect(validateUrl("http://127.0.0.1/")).rejects.toThrow(/restricted/);
  });

  it("rejects a URL whose host is a literal private IP", async () => {
    await expect(validateUrl("http://10.0.0.1/")).rejects.toThrow(/restricted/);
    await expect(validateUrl("http://192.168.1.1/")).rejects.toThrow(/restricted/);
  });

  it("rejects a URL whose host is the cloud metadata IP", async () => {
    await expect(validateUrl("http://169.254.169.254/latest/meta-data/"))
      .rejects.toThrow(/restricted/);
  });

  it("rejects a URL whose host is a carrier-grade NAT IP", async () => {
    await expect(validateUrl("http://100.64.1.1/")).rejects.toThrow(/restricted/);
  });

  it("rejects an IPv4-mapped IPv6 of a private range", async () => {
    // `new URL` requires the brackets for literal IPv6 hostnames.
    await expect(validateUrl("http://[::ffff:10.0.0.1]/")).rejects.toThrow(
      /restricted/,
    );
  });

  it("rejects .internal Railway hostnames", async () => {
    await expect(validateUrl("http://postgres.railway.internal:5432/"))
      .rejects.toThrow(/restricted/);
  });
});
