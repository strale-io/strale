/**
 * Public DNS reads for technology detection. The point of these tests is the
 * distinction an empty list used to hide: "the domain has no such record"
 * (empty) versus "the lookup failed" (failed), which must never look alike.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolver = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolveMx: vi.fn(),
  resolveTxt: vi.fn(),
  resolveNs: vi.fn(),
  resolveCname: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolve4 = resolver.resolve4;
    resolveMx = resolver.resolveMx;
    resolveTxt = resolver.resolveTxt;
    resolveNs = resolver.resolveNs;
    resolveCname = resolver.resolveCname;
  },
}));

import { hostnameOf, lookupTechDns, registrableGuess } from "./tech-dns.js";

function dnsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  for (const fn of Object.values(resolver)) fn.mockReset();
  resolver.resolve4.mockResolvedValue(["192.0.2.1"]);
  resolver.resolveMx.mockResolvedValue([{ exchange: "Aspmx.L.Google.com.", priority: 1 }]);
  resolver.resolveTxt.mockResolvedValue([["v=spf1 include:_spf.goo", "gle.com ~all"]]);
  resolver.resolveNs.mockResolvedValue(["Ada.NS.Cloudflare.com."]);
  resolver.resolveCname.mockRejectedValue(dnsError("ENODATA"));
});

describe("lookupTechDns", () => {
  it("returns normalised records and an ok status", async () => {
    const dns = await lookupTechDns({ domain: "Example.test.", cnameHosts: ["example.test", "www.example.test"], includeA: true });
    expect(dns.mx).toEqual([{ exchange: "aspmx.l.google.com", priority: 1 }]);
    expect(dns.txt).toEqual(["v=spf1 include:_spf.google.com ~all"]);
    expect(dns.ns).toEqual(["ada.ns.cloudflare.com"]);
    expect(dns.a).toEqual(["192.0.2.1"]);
    expect(dns.overall).toBe("ok");
    expect(dns.failures).toEqual([]);
    expect(resolver.resolveMx).toHaveBeenCalledWith("example.test");
  });

  it("treats 'no such record' as empty, not as a failure", async () => {
    resolver.resolveMx.mockRejectedValue(dnsError("ENODATA"));
    resolver.resolveTxt.mockRejectedValue(dnsError("ENOTFOUND"));
    const dns = await lookupTechDns({ domain: "example.test", cnameHosts: ["example.test"] });
    expect(dns.status.mx).toBe("empty");
    expect(dns.status.txt).toBe("empty");
    expect(dns.overall).toBe("ok");
    expect(dns.failures).toEqual([]);
  });

  it("reports a resolver fault as failed, with the code, and does not return it as an empty record", async () => {
    resolver.resolveMx.mockRejectedValue(dnsError("ETIMEOUT"));
    const dns = await lookupTechDns({ domain: "example.test", cnameHosts: ["example.test"] });
    expect(dns.mx).toEqual([]);
    expect(dns.status.mx).toBe("failed");
    expect(dns.overall).toBe("partial");
    expect(dns.failures).toContainEqual({ type: "MX", code: "ETIMEOUT" });
  });

  it("is 'unavailable' when every lookup fails", async () => {
    for (const fn of [resolver.resolveMx, resolver.resolveTxt, resolver.resolveNs, resolver.resolveCname]) fn.mockRejectedValue(dnsError("ECONNREFUSED"));
    const dns = await lookupTechDns({ domain: "example.test", cnameHosts: ["example.test"] });
    expect(dns.overall).toBe("unavailable");
    expect(dns.failures.map((f) => f.type).sort()).toEqual(["CNAME example.test", "MX", "NS", "TXT"]);
  });

  it("never rejects, even when the resolver throws synchronously", async () => {
    resolver.resolveMx.mockImplementation(() => { throw Object.assign(new Error("boom"), { code: "EBADNAME" }); });
    const dns = await lookupTechDns({ domain: "example.test", cnameHosts: ["example.test"] });
    expect(dns.status.mx).toBe("failed");
    expect(dns.failures).toContainEqual({ type: "MX", code: "EBADNAME" });
  });

  it("skips an IP address without asking DNS", async () => {
    const dns = await lookupTechDns({ domain: "203.0.113.9", cnameHosts: ["203.0.113.9"] });
    expect(dns.overall).toBe("skipped");
    expect(resolver.resolveMx).not.toHaveBeenCalled();
  });

  it("merges the CNAMEs of every host asked about", async () => {
    resolver.resolveCname.mockImplementation(async (host: string) => {
      if (host === "www.example.test") return ["Cname.Vercel-DNS.com."];
      throw dnsError("ENODATA");
    });
    const dns = await lookupTechDns({ domain: "example.test", cnameHosts: ["example.test", "www.example.test"] });
    expect(dns.cname).toEqual(["cname.vercel-dns.com"]);
  });
});

describe("registrableGuess", () => {
  it.each([
    ["example.com", "example.com"],
    ["www.example.com", "example.com"],
    ["docs.app.example.io", "example.io"],
    ["shop.example.co.uk", "example.co.uk"],
    ["example.co.uk", "example.co.uk"],
    ["a.b.example.com.au", "example.com.au"],
    ["EXAMPLE.com.", "example.com"],
  ])("%s -> %s", (host, expected) => {
    expect(registrableGuess(host)).toBe(expected);
  });
});

describe("hostnameOf", () => {
  it("takes the host from a URL or a bare host", () => {
    expect(hostnameOf("https://Sub.Example.test/a?b=1")).toBe("sub.example.test");
    expect(hostnameOf("example.test")).toBe("example.test");
  });
});
