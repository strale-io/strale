import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { isIpv4, isPrivateIpv4, summarizeExposure } from "./host-exposure-lookup.js";

const exec = getDirectExecutor("host-exposure-lookup")!;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("host-exposure-lookup", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("accepts dotted quads and rejects malformed ones", () => {
    expect(isIpv4("1.1.1.1")).toBe(true);
    expect(isIpv4("255.255.255.255")).toBe(true);
    expect(isIpv4("256.1.1.1")).toBe(false);
    expect(isIpv4("01.1.1.1")).toBe(false); // leading zero
    expect(isIpv4("1.1.1")).toBe(false);
    expect(isIpv4("example.com")).toBe(false);
  });

  it("classifies every non-routable range as private", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.1.1", "100.64.0.1", "224.0.0.1", "0.0.0.0"]) {
      expect(isPrivateIpv4(ip), ip).toBe(true);
    }
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "192.169.1.1", "99.1.1.1"]) {
      expect(isPrivateIpv4(ip), ip).toBe(false);
    }
  });

  it("escalates risk on admin ports and again on known CVEs", () => {
    expect(summarizeExposure([], [])).toEqual({ risk_level: "none", remote_admin_ports: [] });
    expect(summarizeExposure([80, 443], [])).toEqual({ risk_level: "low", remote_admin_ports: [] });
    expect(summarizeExposure([443, 3389, 22], [])).toEqual({ risk_level: "medium", remote_admin_ports: [22, 3389] });
    expect(summarizeExposure([80], ["CVE-2021-44228"]).risk_level).toBe("high");
  });

  it("refuses private, reserved and IPv6 targets before any upstream call", async () => {
    await expect(exec({ host: "10.0.0.1" })).rejects.toThrow(/private, loopback or reserved/);
    await expect(exec({ host: "127.0.0.1" })).rejects.toThrow(/private, loopback or reserved/);
    await expect(exec({ host: "2606:4700::1111" })).rejects.toThrow(/IPv6 is not covered/);
    await expect(exec({})).rejects.toThrow(/'host' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("projects the scan record and derives the exposure summary", async () => {
    fetchMock.mockResolvedValue(ok({
      ip: "1.1.1.1",
      ports: [443, 22, 80],
      hostnames: ["one.one.one.one"],
      cpes: ["cpe:/a:cloudflare:cloudflare"],
      vulns: [],
      tags: ["cdn"],
    }));
    const { output } = await exec({ host: "1.1.1.1" });
    expect(output.found).toBe(true);
    expect(output.ports).toEqual([22, 80, 443]); // sorted
    expect(output.port_count).toBe(3);
    expect(output.risk_level).toBe("medium");
    expect(output.remote_admin_ports).toEqual([22]);
    expect(output.resolved_from).toBeNull();
    expect(output.software).toEqual(["cpe:/a:cloudflare:cloudflare"]);
  });

  // A 404 means Shodan has never observed the address. That is a result the
  // caller can act on, not an upstream failure that should trip the breaker.
  it("returns an unobserved host as a result rather than an error", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    const { output } = await exec({ host: "8.8.8.8" });
    expect(output.found).toBe(false);
    expect(output.ports).toEqual([]);
    expect(output.risk_level).toBe("none");
  });

  it("surfaces upstream rate limiting as retryable", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(exec({ host: "1.1.1.1" })).rejects.toThrow(/rate-limiting/);
  });
});
