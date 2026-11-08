import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeFailureReason } from "../lib/sanitize.js";

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  whoisMode: "success" as "success" | "reset",
  whoisConnections: 0,
}));

vi.mock("../lib/safe-fetch.js", () => ({
  safeFetch: (...args: unknown[]) => state.fetch(...args),
  discardBody: async (response: Response) => response.body?.cancel(),
}));

vi.mock("node:net", () => ({
  createConnection: (_port: number, _host: string, connected: () => void) => {
    state.whoisConnections++;
    const socket = new EventEmitter() as EventEmitter & {
      write: (value: string) => void;
      destroy: () => void;
    };
    socket.destroy = vi.fn();
    socket.write = vi.fn(() => {
      queueMicrotask(() => {
        if (state.whoisMode === "reset") {
          socket.emit("error", Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));
          return;
        }
        socket.emit("data", Buffer.from(
          "Creation Date: 2000-01-02T00:00:00Z\r\n" +
          "Registry Expiry Date: 2030-01-02T00:00:00Z\r\n" +
          "Registrar: WHOIS Registrar\r\n",
        ));
        socket.emit("end");
      });
    });
    queueMicrotask(connected);
    return socket;
  },
}));

import "./domain-age-check.js";
import { getExecutor } from "./index.js";
import { resetRdapBootstrapCacheForTests } from "../lib/rdap/domain.js";

const execute = getExecutor("domain-age-check")!;
const bootstrap = (services: Array<[string[], string[]]>) =>
  new Response(JSON.stringify({ services }), { headers: { "content-type": "application/json" } });
const rdap = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/rdap+json" } });
const COM_SERVICE: Array<[string[], string[]]> = [[["com"], ["https://rdap.registry.example/"]]];
const XYZ_SERVICE: Array<[string[], string[]]> = [[["xyz"], ["https://rdap.registry.example/"]]];
const responseWithCancellation = (status: number) => {
  const cancel = vi.fn();
  const body = new ReadableStream({ cancel });
  return { response: new Response(body, { status }), cancel };
};

beforeEach(() => {
  vi.useRealTimers();
  state.fetch.mockReset();
  state.whoisMode = "success";
  state.whoisConnections = 0;
  resetRdapBootstrapCacheForTests();
});

describe("domain-age-check RDAP precedence and WHOIS fallback", () => {
  it("uses a registration event and registrar vCard from RDAP", async () => {
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    state.fetch
      .mockResolvedValueOnce(bootstrap(COM_SERVICE))
      .mockResolvedValueOnce(rdap({
        events: [
          { eventAction: "registration", eventDate: "2025-01-02T00:00:00Z" },
          { eventAction: "expiration", eventDate: "2027-01-02T00:00:00Z" },
        ],
        entities: [{ roles: ["registrar"], handle: "HANDLE", vcardArray: ["vcard", [["fn", {}, "text", "RDAP Registrar"]]] }],
      }));

    const result = await execute({ domain: "example.com" });
    expect(result.provenance).toMatchObject({ source: "rdap", upstream: "rdap.registry.example" });
    expect(result.output).toMatchObject({ age_days: 365, registrar: "RDAP Registrar", expiry_date: "2027-01-02" });
    expect(state.whoisConnections).toBe(0);
  });

  it("treats RDAP 404 as a successful not-registered answer and cancels its body", async () => {
    const notFound = responseWithCancellation(404);
    state.fetch.mockResolvedValueOnce(bootstrap(COM_SERVICE)).mockResolvedValueOnce(notFound.response);
    const result = await execute({ domain: "available.com" });
    expect(result.provenance.source).toBe("rdap");
    expect(result.output).toMatchObject({ age_days: null, risk_indicator: "unknown" });
    expect(result.output.note).toContain("not registered");
    expect(state.whoisConnections).toBe(0);
    expect(notFound.cancel).toHaveBeenCalledOnce();
  });

  it.each([
    ["HTTP 503", () => rdap({}, 503)],
    ["timeout", () => Promise.reject(new DOMException("request timed out", "TimeoutError"))],
  ])("falls back to WHOIS after an RDAP %s", async (_label, answer) => {
    state.fetch.mockResolvedValueOnce(bootstrap(COM_SERVICE)).mockImplementationOnce(answer);
    const result = await execute({ domain: "example.com" });
    expect(result.provenance).toMatchObject({ source: "whois", upstream: "whois.verisign-grs.com" });
    expect(result.output.registrar).toBe("WHOIS Registrar");
  });

  it("cancels an unread RDAP error body before WHOIS fallback", async () => {
    const unavailable = responseWithCancellation(503);
    state.fetch.mockResolvedValueOnce(bootstrap(COM_SERVICE)).mockResolvedValueOnce(unavailable.response);
    const result = await execute({ domain: "example.com" });
    expect(result.provenance.source).toBe("whois");
    expect(unavailable.cancel).toHaveBeenCalledOnce();
  });

  it("goes straight to WHOIS when the bootstrap has no TLD entry", async () => {
    state.fetch.mockResolvedValueOnce(bootstrap([]));
    const result = await execute({ domain: "example.com" });
    expect(result.provenance).toMatchObject({ source: "whois", upstream: "whois.verisign-grs.com" });
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("still succeeds through WHOIS when the bootstrap fetch fails", async () => {
    state.fetch.mockRejectedValueOnce(new Error("request timed out"));
    const result = await execute({ domain: "example.com" });
    expect(result.provenance).toMatchObject({ source: "whois", upstream: "whois.verisign-grs.com" });
  });

  it("preserves the unsupported-TLD result when neither lookup path exists", async () => {
    state.fetch.mockResolvedValueOnce(bootstrap([]));
    const result = await execute({ domain: "example.xyz" });
    expect(result.output).toMatchObject({
      age_days: null,
      risk_indicator: "unknown",
      error: "WHOIS server not available for .xyz TLD",
    });
    expect(result.provenance).toEqual(expect.objectContaining({ source: "whois" }));
    expect(result.provenance).not.toHaveProperty("upstream");
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(String(state.fetch.mock.calls[0]?.[0])).toContain("data.iana.org/rdap/dns.json");
    expect(state.whoisConnections).toBe(0);
  });

  it("throws the RDAP failure when the TLD has no WHOIS fallback", async () => {
    state.fetch.mockResolvedValueOnce(bootstrap(XYZ_SERVICE)).mockResolvedValueOnce(rdap({}, 503));
    await expect(execute({ domain: "example.xyz" })).rejects.toThrow(
      "RDAP registry rdap.registry.example failed: HTTP 503",
    );
  });

  it.each([
    ["ECONNRESET", "connection reset"],
    ["ECONNREFUSED", "connection refused"],
    ["ETIMEDOUT", "timeout"],
  ])("reads a nested fetch cause code %s", async (code, failure) => {
    const wrapped = Object.assign(new TypeError("fetch failed"), { cause: { code } });
    state.fetch.mockResolvedValueOnce(bootstrap(XYZ_SERVICE)).mockRejectedValueOnce(wrapped);
    await expect(execute({ domain: "example.xyz" })).rejects.toThrow(
      `RDAP registry rdap.registry.example failed: ${failure}`,
    );
  });

  it("names both public registry paths and the reset without sanitizer masking", async () => {
    state.fetch.mockResolvedValueOnce(bootstrap(COM_SERVICE)).mockResolvedValueOnce(rdap({}, 503));
    state.whoisMode = "reset";
    const error = await execute({ domain: "example.com" }).catch((caught) => caught as Error);
    expect(error.message).toContain("RDAP registry rdap.registry.example failed: HTTP 503");
    expect(error.message).toContain("WHOIS registry whois.verisign-grs.com failed: connection reset");
    expect(error.message).not.toMatch(/ECONN|ETIMEDOUT/);
    expect(sanitizeFailureReason(error.message)).not.toBe("Service temporarily unreachable");
  });

  it("caches the IANA bootstrap for 24 hours across calls", async () => {
    state.fetch
      .mockResolvedValueOnce(bootstrap(COM_SERVICE))
      .mockResolvedValueOnce(rdap({}, 404))
      .mockResolvedValueOnce(rdap({}, 404));
    await execute({ domain: "one.com" });
    await execute({ domain: "two.com" });
    expect(state.fetch).toHaveBeenCalledTimes(3);
    expect(state.fetch.mock.calls.filter(([url]) => String(url).includes("dns.json"))).toHaveLength(1);
  });

  it("shares one in-flight IANA bootstrap fetch between concurrent calls", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    state.fetch.mockReturnValueOnce(pending)
      .mockResolvedValueOnce(rdap({}, 404))
      .mockResolvedValueOnce(rdap({}, 404));
    const first = execute({ domain: "one.com" });
    const second = execute({ domain: "two.com" });
    expect(state.fetch).toHaveBeenCalledTimes(1);
    release(bootstrap(COM_SERVICE));
    await Promise.all([first, second]);
    expect(state.fetch.mock.calls.filter(([url]) => String(url).includes("dns.json"))).toHaveLength(1);
  });

  it("does not refetch a failed bootstrap within 60 seconds", async () => {
    state.fetch.mockRejectedValueOnce(new Error("request timed out"));
    await execute({ domain: "one.com" });
    await execute({ domain: "two.com" });
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a failed bootstrap after 60 seconds", async () => {
    vi.useFakeTimers();
    state.fetch.mockRejectedValueOnce(new Error("request timed out"));
    await execute({ domain: "one.com" });
    expect(state.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    state.fetch.mockResolvedValueOnce(bootstrap(COM_SERVICE)).mockResolvedValueOnce(rdap({}, 404));
    await execute({ domain: "two.com" });
    expect(state.fetch.mock.calls.filter(([url]) => String(url).includes("dns.json"))).toHaveLength(2);
  });

  it("refuses an oversized RDAP body cleanly", async () => {
    const oversized = JSON.stringify({ filler: "x".repeat(300 * 1024) });
    state.fetch.mockResolvedValueOnce(bootstrap(COM_SERVICE)).mockResolvedValueOnce(new Response(oversized));
    state.whoisMode = "reset";
    const error = await execute({ domain: "example.com" }).catch((caught) => caught as Error);
    expect(error.message).toContain("RDAP registry rdap.registry.example failed");
    expect(error.message).toContain("response too large");
    expect(error.message).toContain("WHOIS registry whois.verisign-grs.com failed: connection reset");
  });
});
