import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { normalizeDomain, collectHostnames } from "./cert-transparency-search.js";

const exec = getDirectExecutor("cert-transparency-search")!;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const SPOTTER = [{
  id: "13963152168",
  dns_names: ["strale.dev", "www.strale.dev"],
  issuer: { friendly_name: "GoDaddy" },
  not_before: "2026-02-27T21:27:12Z",
  not_after: "2026-09-13T21:27:12Z",
  revoked: false,
  cert_sha256: "720d2666",
}];

describe("cert-transparency-search", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("normalizes a hostname out of a URL and rejects non-hostnames", () => {
    expect(normalizeDomain("https://strale.dev/a/b")).toBe("strale.dev");
    expect(normalizeDomain("strale.dev:443")).toBe("strale.dev");
    expect(normalizeDomain("STRALE.DEV.")).toBe("strale.dev");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });

  // Names outside the queried apex must not be attributed to it, and a
  // wildcard is kept verbatim because it enumerates nothing.
  it("keeps only names under the apex, including the wildcard form", () => {
    const names = [["strale.dev", "www.strale.dev", "*.strale.dev", "evil.com", "notstrale.dev"]];
    expect(collectHostnames(names, "strale.dev")).toEqual(["*.strale.dev", "strale.dev", "www.strale.dev"]);
  });

  it("refuses a missing or malformed domain before any upstream call", async () => {
    await expect(exec({})).rejects.toThrow(/'domain' is required/);
    await expect(exec({ domain: "not a domain" })).rejects.toThrow(/'domain' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("projects Cert Spotter issuances and derives the hostname set", async () => {
    fetchMock.mockResolvedValue(ok(SPOTTER));
    const { output, provenance } = await exec({ domain: "strale.dev", limit: 10 });
    expect(output.domain).toBe("strale.dev");
    expect(output.certificate_count).toBe(1);
    expect(output.total_matched).toBe(1);
    expect(output.hostnames).toEqual(["strale.dev", "www.strale.dev"]);
    expect(output.hostname_count).toBe(2);
    expect(output.earliest_certificate).toBe("2026-02-27T21:27:12.000Z");
    const cert = (output.certificates as Array<Record<string, unknown>>)[0];
    expect(cert.issuer).toBe("GoDaddy");
    expect(cert.revoked).toBe(false);
    expect(provenance.source).toMatch(/Cert Spotter/);
  });

  // Cert Spotter returns issuances OLDEST first. Slicing that order returned
  // the oldest, mostly-expired certificates and reported a `latest_certificate`
  // from the middle of the window — found by independent review of PR #582.
  it("returns the newest certificates and reports the window across all of them", async () => {
    const rows = ["2024-01-01", "2025-06-01", "2026-09-01"].map((d, i) => ({
      id: String(i),
      dns_names: ["strale.dev"],
      issuer: { friendly_name: "CA" },
      not_before: `${d}T00:00:00Z`,
      not_after: `${d}T00:00:00Z`,
      revoked: false,
    }));
    fetchMock.mockResolvedValue(ok(rows));
    const { output } = await exec({ domain: "strale.dev", limit: 1 });
    const certs = output.certificates as Array<Record<string, unknown>>;
    expect(certs).toHaveLength(1);
    expect(certs[0].not_before).toBe("2026-09-01T00:00:00.000Z");
    expect(output.certificate_count).toBe(1);
    expect(output.total_matched).toBe(3);
    // The window spans every match, not just the page.
    expect(output.earliest_certificate).toBe("2024-01-01T00:00:00.000Z");
    expect(output.latest_certificate).toBe("2026-09-01T00:00:00.000Z");
  });

  // crt.sh omits the zone; without an explicit Z these parse as local time and
  // shift by the host's offset — correct in production only by accident.
  it("treats a zone-less crt.sh timestamp as UTC", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("certspotter")) return new Response("{}", { status: 429 });
      return ok([{ id: 1, name_value: "strale.dev", issuer_name: "CA", not_before: "2026-01-01T00:00:00", not_after: "2026-04-01T00:00:00" }]);
    });
    const { output } = await exec({ domain: "strale.dev" });
    expect((output.certificates as Array<Record<string, unknown>>)[0].not_before).toBe("2026-01-01T00:00:00.000Z");
  });

  it("falls back to crt.sh when Cert Spotter is unavailable, and says so", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("certspotter")) return new Response("{}", { status: 429 });
      return ok([{
        id: 29212308008,
        name_value: "strale.dev\nwww.strale.dev",
        issuer_name: "C=US, O=Let's Encrypt, CN=R3",
        not_before: "2026-01-01T00:00:00",
        not_after: "2026-04-01T00:00:00",
      }]);
    });
    const { output, provenance } = await exec({ domain: "strale.dev" });
    expect(provenance.source).toMatch(/crt\.sh/);
    expect(output.hostnames).toEqual(["strale.dev", "www.strale.dev"]);
    // crt.sh carries no revocation state, so the field must be null not false.
    expect((output.certificates as Array<Record<string, unknown>>)[0].revoked).toBeNull();
  });

  it("fails clearly when both upstreams are unavailable", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(exec({ domain: "strale.dev" })).rejects.toThrow(/Cert Spotter was unavailable and crt\.sh returned HTTP 503/);
  });
});
