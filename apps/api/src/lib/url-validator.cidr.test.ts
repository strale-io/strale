/**
 * WP12 exit item 1 (CR-11): the outbound guard is range arithmetic, not string
 * prefixes. Each case below was measured against the prefix version on
 * 2026-11-02; the ones marked "was allowed" passed it.
 */
import { describe, expect, it } from "vitest";
import { isBlockedIp, validateHost } from "./url-validator.js";

describe("isBlockedIp — CIDR table", () => {
  it.each([
    // IPv4-compatible IPv6 (::/96, deprecated): was allowed
    ["::7f00:1"], ["::127.0.0.1"], ["::a00:1"],
    // IPv6 discard prefix 100::/64: was allowed
    ["100::1"],
    // IETF protocol assignments 2001::/23, Teredo 2001::/32 inside it: was allowed
    ["2001::a00:1"], ["2001:0:4136:e378:8000:63bf:3fff:fdd2"], ["2001:10::1"],
    // IPv4 protocol assignments 192.0.0.0/24 and 6to4 relay 192.88.99.0/24: was allowed
    ["192.0.0.8"], ["192.88.99.1"],
    // deprecated site-local fec0::/10
    ["fec0::1"], ["feff::1"],
    // still blocked: the forms the prefix version already caught
    ["fe80::1"], ["febf::1"], ["fc01::1"], ["fd00:ec2::254"], ["::1"], ["::"],
    ["::ffff:7f00:1"], ["0:0:0:0:0:ffff:127.0.0.1"], ["::ffff:169.254.169.254"],
    ["127.0.0.1"], ["10.1.2.3"], ["172.31.255.255"], ["100.64.0.1"], ["169.254.169.254"],
    ["198.18.0.1"], ["224.0.0.1"], ["240.0.0.1"], ["255.255.255.255"], ["0.1.2.3"],
    ["64:ff9b::a00:1"], ["64:ff9b::1:0:0:1"], ["64:ff9b:2::1"],
    // IPv4-translated ::ffff:0:0:0/96 (SIIT), which the prefix version blocked
    ["::ffff:0:7f00:1"], ["::ffff:0:127.0.0.1"], ["::ffff:0:0:1"], ["2002:a00:1::"], ["2001:db8::1"], ["ff02::1"],
  ])("blocks %s", (addr) => {
    expect(isBlockedIp(addr)).toBe(true);
  });

  it.each([
    ["8.8.8.8"], ["1.1.1.1"], ["172.32.0.1"], ["100.128.0.1"], ["192.0.3.1"],
    ["2606:4700::1111"], ["2001:4860:4860::8888"], ["2a00:1450:4001::200e"],
    ["::ffff:8.8.8.8"],
  ])("allows public %s", (addr) => {
    expect(isBlockedIp(addr)).toBe(false);
  });

  it("blocks any address with a zone ID instead of throwing", () => {
    for (const a of ["fe80::1%eth0", "fd00::1%1", "2606:4700::1111%eth0"]) {
      expect(isBlockedIp(a)).toBe(true);
    }
  });

  it("does not judge hostnames by their first letters (fdic.gov, ffmpeg.org, 10x.com)", () => {
    // Hostnames are resolved and their addresses checked; a name is not an address.
    for (const name of ["fdic.gov", "ffmpeg.org", "10x.com", "fc.example", "127.example.com"]) {
      expect(isBlockedIp(name)).toBe(false);
    }
  });
});

describe("validateHost — IPv6 literal forms (raw-socket capabilities)", () => {
  // The port strip `/:\d+$/` ate the last group of a bare IPv6 literal, so
  // `fd00::1` became `fd00:`, failed DNS and was allowed. port-check then
  // connected to the original string.
  it.each([["::1"], ["fe80::1"], ["fd00::1"], ["::7f00:1"], ["[::1]"], ["[fd00::1]:443"], ["[fe80::1]"]])(
    "refuses %s",
    async (host) => {
      await expect(validateHost(host)).rejects.toThrow(/restricted/);
    },
  );

  it("refuses an IPv4 literal with a port", async () => {
    await expect(validateHost("127.0.0.1:22")).rejects.toThrow(/restricted/);
  });

  it("accepts a public IPv6 literal, bare or bracketed with a port", async () => {
    await expect(validateHost("2606:4700::1111")).resolves.toBeUndefined();
    await expect(validateHost("[2606:4700::1111]:443")).resolves.toBeUndefined();
  });

  it("refuses shorthand IPv4 that getaddrinfo resolves to loopback (127.1, 2130706433)", async () => {
    // Not IPs to net.isIP and unknown to dns.resolve4, so the pre-resolve
    // check passed them; net.connect then reached 127.0.0.1.
    await expect(validateHost("127.1")).rejects.toThrow(/restricted/);
    await expect(validateHost("2130706433")).rejects.toThrow(/restricted/);
  });

  it("refuses a port with no host", async () => {
    await expect(validateHost(":443")).rejects.toThrow();
  });

  it("refuses a malformed host with stray colons instead of resolving it", async () => {
    await expect(validateHost("fd00:")).rejects.toThrow();
    await expect(validateHost("a:b:c")).rejects.toThrow();
  });
});
